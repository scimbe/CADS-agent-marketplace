//! wasmtime-backed implementation of [`super::run_wasm_component_with`]. See the parent module doc
//! for the security model; this file is the enforcement.

use super::*;
use manifest_core::{PreopenMode, WasmSpec};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use wasmtime::component::{Component, Linker, ResourceTable};
use wasmtime::{Config, Engine, ResourceLimiter, Store, Trap, UpdateDeadline};
use wasmtime_wasi::p2::pipe::MemoryOutputPipe;
use wasmtime_wasi::{FsPerms, I32Exit, WasiCtx, WasiCtxBuilder, WasiCtxView, WasiView};

/// Epoch tick: how often a running guest hands control back to check the deadline.
const EPOCH_TICK: Duration = Duration::from_millis(10);

/// Upper bound on live WASI resources (open files, streams, pollables, ...) per run. A guest that
/// opens or allocates handles in a loop hits this long before it exhausts host memory.
const MAX_RESOURCE_TABLE_ENTRIES: usize = 10_000;

/// Total-memory limiter. Trapping (instead of letting `memory.grow` return -1) makes exceeding the
/// cap a distinct, clean outcome whatever the guest's allocator would have done with a failure.
struct Limiter {
    max: usize,
    used: usize,
    exceeded: bool,
}

impl ResourceLimiter for Limiter {
    fn memory_growing(&mut self, current: usize, desired: usize, _maximum: Option<usize>) -> wasmtime::Result<bool> {
        let delta = desired.saturating_sub(current);
        if self.used.saturating_add(delta) > self.max {
            self.exceeded = true;
            return Err(wasmtime::format_err!("wasm memory limit of {} bytes exceeded", self.max));
        }
        self.used += delta;
        Ok(true)
    }
    fn table_growing(&mut self, _current: usize, desired: usize, _maximum: Option<usize>) -> wasmtime::Result<bool> {
        Ok(desired <= 100_000)
    }
    fn instances(&self) -> usize {
        64
    }
    fn tables(&self) -> usize {
        64
    }
    fn memories(&self) -> usize {
        16
    }
}

#[cfg(feature = "wasm-http")]
pub(super) mod http_policy {
    use super::super::http_connect::{send_pinned, Resolver};
    use std::sync::Arc;
    use wasmtime_wasi_http::{Error, RequestOptions, WasiBody, WasiHttpHooks};

    /// Outgoing-request policy: https only, exact hostname allowlist, port 443 only, and the
    /// destination address is resolved once, vetted ([`super::super::http_connect::is_global_ip`])
    /// and pinned for the connection (DNS-rebinding / SSRF defence).
    pub(in super::super) struct AllowlistHooks {
        hosts: Vec<String>,
        resolver: Arc<dyn Resolver>,
    }

    impl AllowlistHooks {
        pub(in super::super) fn new(hosts: Vec<String>, resolver: Arc<dyn Resolver>) -> Self {
            AllowlistHooks { hosts, resolver }
        }

        pub(in super::super) fn permits(&self, uri: &http::Uri) -> bool {
            uri.scheme() == Some(&http::uri::Scheme::HTTPS)
                && matches!(uri.port_u16(), None | Some(443))
                && uri.host().is_some_and(|h| {
                    let h = h.to_ascii_lowercase();
                    self.hosts.contains(&h)
                })
        }
    }

    type Resp = wasmtime_wasi_http::Result<(
        http::Response<WasiBody>,
        Box<dyn std::future::Future<Output = Result<(), Error>> + Send>,
    )>;

    impl WasiHttpHooks for AllowlistHooks {
        fn is_supported_scheme(&mut self, scheme: &http::uri::Scheme) -> bool {
            *scheme == http::uri::Scheme::HTTPS
        }

        fn default_scheme(&mut self) -> Option<http::uri::Scheme> {
            Some(http::uri::Scheme::HTTPS)
        }

        fn send_request(
            &mut self,
            request: http::Request<WasiBody>,
            options: Option<RequestOptions>,
            _fut: Box<dyn std::future::Future<Output = Result<(), Error>> + Send>,
        ) -> Box<dyn std::future::Future<Output = Resp> + Send> {
            if !self.permits(request.uri()) {
                return Box::new(async { Err(Error::HttpRequestDenied) });
            }
            Box::new(send_pinned(self.resolver.clone(), request, options))
        }
    }
}

struct Host {
    wasi: WasiCtx,
    table: ResourceTable,
    limiter: Limiter,
    #[cfg(feature = "wasm-http")]
    http: wasmtime_wasi_http::WasiHttpCtx,
    #[cfg(feature = "wasm-http")]
    hooks: http_policy::AllowlistHooks,
}

impl WasiView for Host {
    fn ctx(&mut self) -> WasiCtxView<'_> {
        WasiCtxView { ctx: &mut self.wasi, table: &mut self.table }
    }
}

#[cfg(feature = "wasm-http")]
impl wasmtime_wasi_http::WasiHttpView for Host {
    fn http(&mut self) -> wasmtime_wasi_http::WasiHttpCtxView<'_> {
        wasmtime_wasi_http::WasiHttpCtxView { ctx: &mut self.http, table: &mut self.table, hooks: &mut self.hooks }
    }
}

/// Resolve a preopen's host directory: `work_dir` or a sub-directory, created if missing, and
/// re-checked after canonicalisation so a symlink inside the work dir cannot point out of it.
fn resolve_host_dir(canonical_work: &Path, subdir: &str) -> Result<PathBuf, String> {
    let joined = if subdir.is_empty() { canonical_work.to_path_buf() } else { canonical_work.join(subdir) };
    std::fs::create_dir_all(&joined).map_err(|e| format!("create preopen dir {}: {e}", joined.display()))?;
    let canonical = joined.canonicalize().map_err(|e| format!("canonicalize {}: {e}", joined.display()))?;
    if !canonical.starts_with(canonical_work) {
        return Err(format!("preopen host dir {} resolves outside the work dir", canonical.display()));
    }
    Ok(canonical)
}

/// A read-only and a read-write preopen of the same (or nested) host directory would let the guest
/// pick whichever mode suits it for that tree; the manifest must say one thing per tree.
fn check_no_mixed_mode_overlap(resolved: &[(PathBuf, PreopenMode, &str)]) -> Result<(), String> {
    for (i, (a, ma, ga)) in resolved.iter().enumerate() {
        for (b, mb, gb) in &resolved[i + 1..] {
            if ma != mb && (a.starts_with(b) || b.starts_with(a)) {
                return Err(format!("preopens {ga} and {gb} overlap on the host with different modes (ro/rw)"));
            }
        }
    }
    Ok(())
}

fn engine_config(kind: WasmEngineKind, fuel: bool) -> Result<Config, String> {
    let mut c = Config::new();
    c.consume_fuel(fuel);
    c.epoch_interruption(true);
    // Keep the guest stack bounded regardless of the host thread's stack.
    c.max_wasm_stack(512 * 1024);
    if cfg!(target_pointer_width = "32") {
        // 32-bit hosts (older Android phones, armv7): there is no address space for the 64-bit
        // style multi-GiB reservations, so use small explicit ones and rely on bounds checks.
        c.memory_reservation(16 << 20);
        c.memory_guard_size(64 << 10);
        c.memory_reservation_for_growth(1 << 20);
    }
    if kind == WasmEngineKind::Interpreter {
        let target = if cfg!(target_pointer_width = "64") { "pulley64" } else { "pulley32" };
        c.target(target).map_err(|e| format!("pulley target {target}: {e}"))?;
        // No guard-page/signal-based traps: iOS forbids the signal handlers they need.
        c.signals_based_traps(false);
    }
    Ok(c)
}

pub(super) fn run(bytes: &[u8], spec: &WasmSpec, work_dir: &Path, opts: &WasmRunOptions) -> WasmRunReport {
    let started = Instant::now();
    let mut report = match std::thread::scope(|s| {
        // A dedicated thread: `block_on` must not run inside a caller's tokio runtime.
        s.spawn(|| run_inner(bytes, spec, work_dir, opts)).join()
    }) {
        Ok(r) => r,
        Err(_) => WasmRunReport {
            outcome: WasmOutcome::Error { message: "wasm runtime thread panicked".to_string() },
            stdout: String::new(),
            stderr: String::new(),
            output_truncated: false,
            duration_ms: 0,
            fuel_consumed: None,
            engine: opts.engine,
        },
    };
    report.duration_ms = started.elapsed().as_millis();
    report
}

fn run_inner(bytes: &[u8], spec: &WasmSpec, work_dir: &Path, opts: &WasmRunOptions) -> WasmRunReport {
    let engine_kind = opts.engine;
    // One budget for everything: compile, instantiate and run all count against `timeout_ms`.
    let timeout = Duration::from_millis(spec.limits.timeout_ms);
    let deadline = Instant::now() + timeout;

    let mk = |outcome: WasmOutcome, stdout: String, stderr: String, truncated: bool, fuel: Option<u64>| WasmRunReport {
        outcome,
        stdout,
        stderr,
        output_truncated: truncated,
        duration_ms: 0,
        fuel_consumed: fuel,
        engine: engine_kind,
    };
    let refused = |reason: String| mk(WasmOutcome::Refused { reason }, String::new(), String::new(), false, None);
    let error = |message: String| mk(WasmOutcome::Error { message }, String::new(), String::new(), false, None);

    #[cfg(feature = "wasm-http")]
    let http_hosts = spec.capabilities.allowed_http_hosts.clone();
    #[cfg(not(feature = "wasm-http"))]
    if !spec.capabilities.allowed_http_hosts.is_empty() {
        return refused("wasm_unavailable: allowed_http_hosts requires the `wasm-http` feature".to_string());
    }

    // --- pre-flight: the work dir and every preopen --------------------------------------------
    let canonical_work = match work_dir.canonicalize() {
        Ok(p) => p,
        Err(e) => return refused(format!("work_dir {}: {e}", work_dir.display())),
    };
    let mut wasi = WasiCtxBuilder::new();
    let mut resolved: Vec<(PathBuf, PreopenMode, &str)> = Vec::new();
    for po in &spec.capabilities.preopens {
        let host = match resolve_host_dir(&canonical_work, &po.host_subdir) {
            Ok(h) => h,
            Err(e) => return refused(format!("preopen {}: {e}", po.guest_path)),
        };
        resolved.push((host, po.mode, po.guest_path.as_str()));
    }
    if let Err(e) = check_no_mixed_mode_overlap(&resolved) {
        return refused(e);
    }
    for (host, mode, guest) in &resolved {
        let perms = match mode {
            PreopenMode::Ro => FsPerms::ReadOnly,
            PreopenMode::Rw => FsPerms::ReadWrite,
        };
        if let Err(e) = wasi.preopened_dir(host, guest, perms) {
            return refused(format!("preopen {guest}: {e}"));
        }
    }

    // --- WASI context: no stdin, capped stdout/stderr, granted env only, no network ------------
    let stdout = MemoryOutputPipe::new(opts.stdout_cap);
    let stderr = MemoryOutputPipe::new(opts.stderr_cap);
    wasi.stdout(stdout.clone()).stderr(stderr.clone());
    let mut argv = vec!["component.wasm".to_string()];
    argv.extend(opts.args.iter().cloned());
    wasi.args(&argv);
    // The ONLY source of guest-visible environment: names granted by the signed spec, values from
    // the caller. Nothing is inherited, and (see `activate`) no `.env` file is written to the work
    // dir for Wasm installs, so a work-dir preopen cannot expose ungranted secrets either.
    for name in &spec.capabilities.env {
        if let Some((_, v)) = opts.env.iter().find(|(k, _)| k == name) {
            wasi.env(name, v);
        }
    }
    // Defaults already deny sockets and name lookup; stated explicitly so a future default change
    // in wasmtime-wasi cannot silently open the network.
    wasi.allow_tcp(false).allow_udp(false).allow_ip_name_lookup(false);
    wasi.socket_addr_check(|_, _| Box::pin(async { false }));

    // --- engine, linker ------------------------------------------------------------------------
    let config = match engine_config(engine_kind, spec.limits.fuel.is_some()) {
        Ok(c) => c,
        Err(e) => return error(e),
    };
    let engine = match Engine::new(&config) {
        Ok(e) => e,
        Err(e) => return error(format!("engine: {e}")),
    };
    let mut linker: Linker<Host> = Linker::new(&engine);
    if let Err(e) = wasmtime_wasi::p2::add_to_linker_async(&mut linker) {
        return error(format!("link wasi: {e}"));
    }
    #[cfg(feature = "wasm-http")]
    if !http_hosts.is_empty() {
        if let Err(e) = wasmtime_wasi_http::p2::add_only_http_to_linker_async(&mut linker) {
            return error(format!("link wasi:http: {e}"));
        }
    }

    let mut table = ResourceTable::new();
    table.set_max_capacity(MAX_RESOURCE_TABLE_ENTRIES);
    let host = Host {
        wasi: wasi.build(),
        table,
        limiter: Limiter { max: usize::try_from(spec.limits.max_memory_bytes).unwrap_or(usize::MAX), used: 0, exceeded: false },
        #[cfg(feature = "wasm-http")]
        http: wasmtime_wasi_http::WasiHttpCtx::new(),
        #[cfg(feature = "wasm-http")]
        hooks: http_policy::AllowlistHooks::new(http_hosts, Arc::new(super::http_connect::SystemResolver)),
    };
    let mut store = Store::new(&engine, host);
    store.limiter(|h| &mut h.limiter);
    if let Some(f) = spec.limits.fuel {
        if let Err(e) = store.set_fuel(f) {
            return error(format!("set fuel: {e}"));
        }
    }

    // --- time: epoch ticker + deadline callback + host-side timeout -----------------------------
    let timed_out = Arc::new(AtomicBool::new(false));
    store.set_epoch_deadline(1);
    {
        let timed_out = timed_out.clone();
        store.epoch_deadline_callback(move |_| {
            if Instant::now() >= deadline {
                timed_out.store(true, Ordering::SeqCst);
                Err(wasmtime::format_err!("wasm wall-clock limit reached"))
            } else {
                Ok(UpdateDeadline::Yield(1))
            }
        });
    }
    let stop = Arc::new(AtomicBool::new(false));
    let ticker = {
        let (engine, stop) = (engine.clone(), stop.clone());
        std::thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                std::thread::sleep(EPOCH_TICK);
                engine.increment_epoch();
            }
        })
    };

    let rt = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
        Ok(rt) => rt,
        Err(e) => {
            stop.store(true, Ordering::SeqCst);
            let _ = ticker.join();
            return error(format!("tokio runtime: {e}"));
        }
    };
    // Compile (Cranelift, potentially seconds for a hostile component) on a blocking thread so the
    // timeout can fire while it runs; then instantiate and run, all inside the same budget.
    let bytes_owned = bytes.to_vec();
    let compile_engine = engine.clone();
    let result: Result<wasmtime::Result<Result<(), ()>>, ()> = rt.block_on(async {
        let fut = async {
            let component = tokio::task::spawn_blocking(move || Component::new(&compile_engine, &bytes_owned))
                .await
                .map_err(|e| wasmtime::format_err!("compile task failed: {e}"))??;
            let command = wasmtime_wasi::p2::bindings::Command::instantiate_async(&mut store, &component, &linker).await?;
            command.wasi_cli_run().call_run(&mut store).await
        };
        let remaining = deadline.saturating_duration_since(Instant::now());
        tokio::time::timeout(remaining, fut).await.map_err(|_elapsed| ())
    });
    stop.store(true, Ordering::SeqCst);
    let _ = ticker.join();
    // Do not wait for a still-running compile on timeout: it cannot be interrupted, only abandoned.
    rt.shutdown_background();

    let fuel_consumed = spec.limits.fuel.map(|f| f.saturating_sub(store.get_fuel().unwrap_or(0)));
    let out_bytes = stdout.contents();
    let err_bytes = stderr.contents();
    let truncated = out_bytes.len() >= opts.stdout_cap || err_bytes.len() >= opts.stderr_cap;
    let out = String::from_utf8_lossy(&out_bytes).into_owned();
    let err = String::from_utf8_lossy(&err_bytes).into_owned();
    let outcome = match result {
        Err(()) => WasmOutcome::TimedOut,
        Ok(Ok(Ok(()))) => WasmOutcome::Exited { code: 0 },
        Ok(Ok(Err(()))) => WasmOutcome::Exited { code: 1 },
        Ok(Err(e)) => classify(&e, &store.data().limiter, &timed_out, truncated),
    };
    mk(outcome, out, err, truncated, fuel_consumed)
}

/// Map a failed run to an outcome using typed signals only: `I32Exit`, the deadline flag the epoch
/// callback sets, the limiter's own flag, `Trap::OutOfFuel`. A write that hit the stdout/stderr cap
/// is recognised by the capture buffer being full (`truncated`), not by parsing an error message.
fn classify(e: &wasmtime::Error, limiter: &Limiter, timed_out: &AtomicBool, truncated: bool) -> WasmOutcome {
    if let Some(I32Exit(code)) = e.downcast_ref::<I32Exit>() {
        return WasmOutcome::Exited { code: *code };
    }
    if timed_out.load(Ordering::SeqCst) {
        return WasmOutcome::TimedOut;
    }
    if limiter.exceeded {
        return WasmOutcome::MemoryLimitExceeded;
    }
    if matches!(e.downcast_ref::<Trap>(), Some(Trap::OutOfFuel)) {
        return WasmOutcome::OutOfFuel;
    }
    if truncated {
        return WasmOutcome::OutputLimitExceeded;
    }
    match e.downcast_ref::<Trap>() {
        Some(_) => WasmOutcome::Trapped { message: format!("{e}") },
        // Not a trap: compile/instantiation/link failure (missing import, wrong world, ...).
        None => WasmOutcome::Error { message: format!("{e:#}") },
    }
}

#[cfg(all(test, feature = "wasm-http"))]
mod http_tests {
    use super::super::http_connect::{Resolver, SystemResolver};
    use super::http_policy::AllowlistHooks;
    use std::future::Future;
    use std::net::IpAddr;
    use std::pin::Pin;
    use std::sync::Arc;
    use wasmtime_wasi_http::{Error, WasiBody, WasiHttpHooks};

    fn hooks() -> AllowlistHooks {
        AllowlistHooks::new(vec!["api.example.com".to_string()], Arc::new(SystemResolver))
    }

    fn request(uri: &str) -> http::Request<WasiBody> {
        use http_body_util::BodyExt;
        let body = http_body_util::Empty::<bytes::Bytes>::new().map_err(|_| unreachable!()).boxed_unsync();
        http::Request::builder().uri(uri).body(body).unwrap()
    }

    #[test]
    fn only_https_to_an_exactly_listed_host_on_443_is_permitted() {
        let h = hooks();
        let p = |u: &str| h.permits(&u.parse().unwrap());
        assert!(p("https://api.example.com/v1/x?y=1"));
        assert!(p("https://API.example.com/"));
        assert!(p("https://api.example.com:443/"));
        assert!(!p("http://api.example.com/"), "plain http");
        assert!(!p("https://api.example.com:8443/"), "other port");
        assert!(!p("https://evil.example.com/"), "other host");
        assert!(!p("https://sub.api.example.com/"), "subdomains are not implied");
        assert!(!p("https://api.example.com.evil.net/"), "suffix trick");
        assert!(!p("https://api.example.com@evil.net/"), "userinfo trick");
        assert!(!p("https://evil.net/?h=api.example.com"), "host in the query");
        assert!(!p("https://127.0.0.1/"));
    }

    #[test]
    fn plain_http_is_not_even_a_supported_scheme() {
        let mut h = hooks();
        assert!(!h.is_supported_scheme(&http::uri::Scheme::HTTP));
        assert!(h.is_supported_scheme(&http::uri::Scheme::HTTPS));
    }

    fn block_on<F: Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(f)
    }

    #[test]
    fn a_request_to_a_non_allowed_host_is_denied_before_any_connection_is_attempted() {
        let mut h = hooks();
        let fut = h.send_request(request("https://evil.example.com/steal"), None, Box::new(async { Ok(()) }));
        let res = block_on(Pin::from(fut));
        assert!(matches!(res, Err(Error::HttpRequestDenied)), "got {:?}", res.err());
        let mut h = hooks();
        let fut = h.send_request(request("http://api.example.com/"), None, Box::new(async { Ok(()) }));
        let res = block_on(Pin::from(fut));
        assert!(matches!(res, Err(Error::HttpRequestDenied)), "plain http to an allowed host is denied too");
    }

    struct Fixed(IpAddr);
    impl Resolver for Fixed {
        fn resolve<'a>(&'a self, _: &'a str, _: u16) -> Pin<Box<dyn Future<Output = std::io::Result<Vec<IpAddr>>> + Send + 'a>> {
            let ip = self.0;
            Box::pin(async move { Ok(vec![ip]) })
        }
    }

    #[test]
    fn an_allowed_host_that_resolves_to_an_internal_address_is_refused_end_to_end() {
        // DNS rebinding / SSRF: the NAME is on the allowlist, the ADDRESS is not acceptable.
        for ip in ["127.0.0.1", "169.254.169.254", "10.0.0.5", "192.168.0.1", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"] {
            let mut h = AllowlistHooks::new(vec!["api.example.com".to_string()], Arc::new(Fixed(ip.parse().unwrap())));
            let fut = h.send_request(request("https://api.example.com/latest/meta-data"), None, Box::new(async { Ok(()) }));
            let res = block_on(Pin::from(fut));
            assert!(matches!(res, Err(Error::DestinationIpProhibited)), "{ip}: {:?}", res.err());
        }
    }
}
