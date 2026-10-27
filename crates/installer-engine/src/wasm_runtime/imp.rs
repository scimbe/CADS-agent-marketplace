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
mod http_policy {
    use wasmtime_wasi_http::{Error, RequestOptions, WasiBody, WasiHttpHooks};

    /// Outgoing-request policy: https only, exact hostname allowlist, port 443 only.
    pub(super) struct AllowlistHooks {
        pub hosts: Vec<String>,
    }

    impl AllowlistHooks {
        pub(super) fn permits(&self, uri: &http::Uri) -> bool {
            uri.scheme() == Some(&http::uri::Scheme::HTTPS)
                && matches!(uri.port_u16(), None | Some(443))
                && uri.host().is_some_and(|h| {
                    let h = h.to_ascii_lowercase();
                    self.hosts.iter().any(|a| *a == h)
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
            Box::new(async move {
                use http_body_util::BodyExt;
                let (res, io) = wasmtime_wasi_http::default_send_request(request, options).await?;
                Ok((res.map(BodyExt::boxed_unsync), Box::new(io) as Box<dyn std::future::Future<Output = _> + Send>))
            })
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

fn engine_config(kind: WasmEngineKind, fuel: bool) -> Result<Config, String> {
    let mut c = Config::new();
    c.consume_fuel(fuel);
    c.epoch_interruption(true);
    // Keep the guest stack bounded regardless of the host thread's stack.
    c.max_wasm_stack(512 * 1024);
    if kind == WasmEngineKind::Interpreter {
        let target = if cfg!(target_pointer_width = "64") { "pulley64" } else { "pulley32" };
        c.target(target).map_err(|e| format!("pulley target {target}: {e}"))?;
        // Pulley does not use signal-based traps' guard pages on every host (iOS forbids them).
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
    let mk = |outcome: WasmOutcome, stdout: String, stderr: String, fuel: Option<u64>| WasmRunReport {
        outcome,
        stdout,
        stderr,
        duration_ms: 0,
        fuel_consumed: fuel,
        engine: engine_kind,
    };
    let refused = |reason: String| mk(WasmOutcome::Refused { reason }, String::new(), String::new(), None);
    let error = |message: String| mk(WasmOutcome::Error { message }, String::new(), String::new(), None);

    let http_hosts = &spec.capabilities.allowed_http_hosts;
    #[cfg(not(feature = "wasm-http"))]
    if !http_hosts.is_empty() {
        return refused("wasm_unavailable: allowed_http_hosts requires the `wasm-http` feature".to_string());
    }

    // --- pre-flight: the work dir and every preopen --------------------------------------------
    let canonical_work = match work_dir.canonicalize() {
        Ok(p) => p,
        Err(e) => return refused(format!("work_dir {}: {e}", work_dir.display())),
    };
    let mut wasi = WasiCtxBuilder::new();
    for po in &spec.capabilities.preopens {
        let host = match resolve_host_dir(&canonical_work, &po.host_subdir) {
            Ok(h) => h,
            Err(e) => return refused(format!("preopen {}: {e}", po.guest_path)),
        };
        let perms = match po.mode {
            PreopenMode::Ro => FsPerms::ReadOnly,
            PreopenMode::Rw => FsPerms::ReadWrite,
        };
        if let Err(e) = wasi.preopened_dir(&host, &po.guest_path, perms) {
            return refused(format!("preopen {}: {e}", po.guest_path));
        }
    }

    // --- WASI context: no stdin, capped stdout/stderr, granted env only, no network ------------
    let stdout = MemoryOutputPipe::new(opts.stdout_cap);
    let stderr = MemoryOutputPipe::new(opts.stderr_cap);
    wasi.stdout(stdout.clone()).stderr(stderr.clone());
    let mut argv = vec!["component.wasm".to_string()];
    argv.extend(opts.args.iter().cloned());
    wasi.args(&argv);
    for name in &spec.capabilities.env {
        if let Some((_, v)) = opts.env.iter().find(|(k, _)| k == name) {
            wasi.env(name, v);
        }
    }
    // Defaults already deny sockets and name lookup; stated explicitly so a future default change
    // in wasmtime-wasi cannot silently open the network.
    wasi.allow_tcp(false).allow_udp(false).allow_ip_name_lookup(false);
    wasi.socket_addr_check(|_, _| Box::pin(async { false }));

    // --- engine, component, linker --------------------------------------------------------------
    let config = match engine_config(engine_kind, spec.limits.fuel.is_some()) {
        Ok(c) => c,
        Err(e) => return error(e),
    };
    let engine = match Engine::new(&config) {
        Ok(e) => e,
        Err(e) => return error(format!("engine: {e}")),
    };
    let component = match Component::new(&engine, bytes) {
        Ok(c) => c,
        Err(e) => return error(format!("compile component: {e}")),
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

    let host = Host {
        wasi: wasi.build(),
        table: ResourceTable::new(),
        limiter: Limiter { max: usize::try_from(spec.limits.max_memory_bytes).unwrap_or(usize::MAX), used: 0, exceeded: false },
        #[cfg(feature = "wasm-http")]
        http: wasmtime_wasi_http::WasiHttpCtx::new(),
        #[cfg(feature = "wasm-http")]
        hooks: http_policy::AllowlistHooks { hosts: http_hosts.clone() },
    };
    let mut store = Store::new(&engine, host);
    store.limiter(|h| &mut h.limiter);
    if let Some(f) = spec.limits.fuel {
        if let Err(e) = store.set_fuel(f) {
            return error(format!("set fuel: {e}"));
        }
    }

    // --- time: epoch ticker + deadline callback + host-side timeout -----------------------------
    let timeout = Duration::from_millis(spec.limits.timeout_ms);
    let deadline = Instant::now() + timeout;
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
    let result: Result<Result<wasmtime::Result<Result<(), ()>>, ()>, ()> = rt.block_on(async {
        let fut = async {
            let command = wasmtime_wasi::p2::bindings::Command::instantiate_async(&mut store, &component, &linker).await?;
            command.wasi_cli_run().call_run(&mut store).await
        };
        match tokio::time::timeout(timeout, fut).await {
            Ok(r) => Ok(Ok(r)),
            Err(_elapsed) => Err(()),
        }
    });
    stop.store(true, Ordering::SeqCst);
    let _ = ticker.join();

    let fuel_consumed = spec.limits.fuel.map(|f| f.saturating_sub(store.get_fuel().unwrap_or(0)));
    let out = String::from_utf8_lossy(&stdout.contents()).into_owned();
    let err = String::from_utf8_lossy(&stderr.contents()).into_owned();
    let outcome = match result {
        Err(()) => WasmOutcome::TimedOut,
        Ok(Err(())) => unreachable!("only constructed as Ok(Ok(..)) or Err(())"),
        Ok(Ok(Ok(Ok(())))) => WasmOutcome::Exited { code: 0 },
        Ok(Ok(Ok(Err(())))) => WasmOutcome::Exited { code: 1 },
        Ok(Ok(Err(e))) => classify(&e, &store.data().limiter, &timed_out),
    };
    mk(outcome, out, err, fuel_consumed)
}

fn classify(e: &wasmtime::Error, limiter: &Limiter, timed_out: &AtomicBool) -> WasmOutcome {
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
    let text = format!("{e:?}");
    if text.contains("write beyond capacity of MemoryOutputPipe") {
        return WasmOutcome::OutputLimitExceeded;
    }
    match e.downcast_ref::<Trap>() {
        Some(_) => WasmOutcome::Trapped { message: format!("{e}") },
        // Not a trap: instantiation/link failure (missing import, wrong world, ...).
        None => WasmOutcome::Error { message: format!("{e:#}") },
    }
}
