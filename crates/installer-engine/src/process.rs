//! Bounded subprocess execution: run a command, kill its WHOLE process group on timeout.
//!
//! Copies the exact discipline of ct-agent's `channel_run::service_calls::run_service_handler_with_timeout`
//! (native/src/channel_run/service_calls.rs:412-541, #183): `Command::process_group(0)` on Unix
//! puts the child in its own process group, and a timeout kills that whole group via
//! `libc::kill(-pid, SIGKILL)`, not just the immediate child -- `docker compose up --build` can
//! spawn build subprocesses, and a bundle's own `verify.sh` can background a `curl`; killing only
//! the top-level pid would leak either as an orphan and defeat the timeout entirely.

use std::process::{Command, Stdio};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct RunOutcome {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    pub duration_ms: u128,
}

/// Run `program(args)` with `env` set (and otherwise the SCRUBBED environment described by the
/// caller -- this function does not add or inherit anything beyond what's explicitly passed in
/// `env`; see `guardrails`/the crate docs for why `verify.sh` must never see raw secret values),
/// in `cwd`, bounded by `timeout`. Never panics on a non-zero exit or a timeout -- both are
/// reported in [`RunOutcome`], not `Result::Err`; the caller decides what a given step's failure
/// means for the overall install (a build failure vs. a verify failure are different report
/// fields).
pub fn run_bounded(
    program: &str,
    args: &[&str],
    cwd: &std::path::Path,
    env: &[(&str, &str)],
    timeout: Duration,
) -> Result<RunOutcome, String> {
    run_bounded_limited(program, args, cwd, env, timeout, None)
}

/// [`run_bounded`] plus optional `setrlimit` caps applied in the child before `exec` (Unix only;
/// ignored elsewhere -- WSL gets its caps from `prlimit` inside the distro). The caps are inherited
/// by everything the sandbox launcher starts.
pub fn run_bounded_limited(
    program: &str,
    args: &[&str],
    cwd: &std::path::Path,
    env: &[(&str, &str)],
    timeout: Duration,
    limits: Option<crate::sandbox::Limits>,
) -> Result<RunOutcome, String> {
    let started = std::time::Instant::now();
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(cwd)
        .env_clear()
        .envs(env.iter().copied())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Preserve PATH explicitly -- env_clear() above wipes it too, and `docker`/the bundle's
    // verify.sh both need to resolve binaries by name. This is the ONLY inherited value; every
    // other ambient env var (which could carry an operator's shell secrets) is deliberately gone.
    if let Ok(path) = std::env::var("PATH") {
        command.env("PATH", path);
    }

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
        if let Some(l) = limits {
            // SAFETY: the closure only calls the async-signal-safe `setrlimit`.
            unsafe {
                command.pre_exec(move || apply_limits(l));
            }
        }
    }
    #[cfg(not(unix))]
    let _ = limits;

    let child = command
        .spawn()
        .map_err(|e| format!("failed to spawn {program}: {e}"))?;
    let pid = child.id();

    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });

    match rx.recv_timeout(timeout) {
        Ok(result) => {
            let output = result.map_err(|e| format!("{program}: wait failed: {e}"))?;
            Ok(RunOutcome {
                exit_code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                timed_out: false,
                duration_ms: started.elapsed().as_millis(),
            })
        }
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            #[cfg(unix)]
            unsafe {
                libc::kill(-(pid as libc::pid_t), libc::SIGKILL);
            }
            #[cfg(not(unix))]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .status();
            }
            Ok(RunOutcome {
                exit_code: None,
                stdout: String::new(),
                stderr: format!("{program} timed out after {}s (pid {pid} killed)", timeout.as_secs()),
                timed_out: true,
                duration_ms: started.elapsed().as_millis(),
            })
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            Err(format!("{program}: wait thread disconnected unexpectedly"))
        }
    }
}

/// Lower the process's `RLIMIT_CPU/FSIZE/NPROC` to `l` (never raises). Async-signal-safe: callable
/// from a `pre_exec` hook.
#[cfg(unix)]
pub fn apply_limits(l: crate::sandbox::Limits) -> std::io::Result<()> {
    // Only ever LOWER a limit: the launcher may not raise a hard limit, and raising the soft one
    // above what the user already runs under would loosen, not tighten. A macro, not a function,
    // because the type of `libc::RLIMIT_*` differs between targets (u32 on glibc, i32 on macOS).
    macro_rules! lower {
        ($resource:expr, $v:expr) => {{
            let mut cur = libc::rlimit { rlim_cur: 0, rlim_max: 0 };
            if unsafe { libc::getrlimit($resource, &mut cur) } != 0 {
                return Err(std::io::Error::last_os_error());
            }
            let want = $v as libc::rlim_t;
            let lim = libc::rlimit { rlim_cur: cur.rlim_cur.min(want), rlim_max: cur.rlim_max.min(want) };
            if unsafe { libc::setrlimit($resource, &lim) } != 0 {
                return Err(std::io::Error::last_os_error());
            }
        }};
    }
    lower!(libc::RLIMIT_CPU, l.cpu_secs);
    lower!(libc::RLIMIT_FSIZE, l.fsize_bytes);
    lower!(libc::RLIMIT_NPROC, l.nproc);
    Ok(())
}

/// Serializes every test, in every module of this crate, that either mutates this process's real
/// `PATH` env var or depends on `run_bounded` resolving a real binary via that same ambient `PATH`
/// -- `cargo test`'s default thread-based parallelism runs test fns concurrently in the SAME
/// process, so a test that blanks `PATH` (there's no way around it for
/// `activate::tests::collision_guard_skips_docker_entirely_when_told_to`: `run_bounded` re-reads
/// ambient `PATH` by design, see its own doc comment above) can starve an unrelated,
/// concurrently-running test that needs a REAL `PATH` to find `sh`/`bwrap`/etc. Confirmed as an
/// ACTUAL failure, not a theoretical one, twice: first
/// `process::tests::the_whole_process_group_is_killed_not_just_the_shell` failed to spawn `sh`
/// this way; after protecting `activate.rs`'s own PATH-sensitive tests with a LOCAL lock,
/// `process::tests::a_hanging_command_is_killed_on_timeout` failed to spawn `sh` the SAME way, from
/// the SAME mutator, because that local lock didn't reach across module boundaries. One shared,
/// crate-visible lock closes it for every module, not just the one that happened to get hit last.
#[cfg(test)]
pub(crate) static PATH_MUTATION_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn a_quick_command_completes_normally() {
        let _path_lock = PATH_MUTATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let out = run_bounded("sh", &["-c", "echo hi"], std::path::Path::new("."), &[], Duration::from_secs(5)).unwrap();
        assert!(!out.timed_out);
        assert_eq!(out.exit_code, Some(0));
        assert_eq!(out.stdout.trim(), "hi");
    }

    #[cfg(unix)]
    #[test]
    fn rlimits_are_applied_to_the_child() {
        let _path_lock = PATH_MUTATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let l = crate::sandbox::Limits { cpu_secs: 123, fsize_bytes: 1 << 20, nproc: 2000 };
        let out = run_bounded_limited(
            "bash",
            &["-c", "echo cpu=$(ulimit -t) nproc=$(ulimit -u)"],
            std::path::Path::new("."),
            &[],
            Duration::from_secs(5),
            Some(l),
        )
        .unwrap();
        // nproc is only ever lowered: min(requested, the host's own limit), so assert the bound.
        let (cpu, nproc) = out.stdout.trim().split_once(" nproc=").expect("output shape");
        assert_eq!(cpu, "cpu=123", "{out:?}");
        assert!(nproc.parse::<u64>().unwrap() <= 2000, "{out:?}");
        let plain = run_bounded("sh", &["-c", "echo $(ulimit -t)"], std::path::Path::new("."), &[], Duration::from_secs(5)).unwrap();
        assert_ne!(plain.stdout.trim(), "123");
    }

    #[cfg(unix)]
    #[test]
    fn a_hanging_command_is_killed_on_timeout() {
        let _path_lock = PATH_MUTATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let out = run_bounded(
            "sh",
            &["-c", "sleep 30"],
            std::path::Path::new("."),
            &[],
            Duration::from_millis(200),
        )
        .unwrap();
        assert!(out.timed_out);
        assert!(out.exit_code.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn the_whole_process_group_is_killed_not_just_the_shell() {
        let _path_lock = PATH_MUTATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // A backgrounded grandchild (mirrors a verify.sh that backgrounds a curl, or `docker
        // compose`'s own build subprocesses) must not survive the timeout as an orphan. Have the
        // shell spawn a long-running child, print its pid, then exit -- if the group kill works,
        // that pid is gone shortly after; if only the shell was killed, it lingers.
        let marker = std::env::temp_dir().join(format!("installer-engine-grandchild-test-{}", std::process::id()));
        let _ = std::fs::remove_file(&marker);
        // A unique duration, not `sleep 30`: the `pgrep -f` below is machine-global, and any other
        // process on the host running a `sleep 30` (another test run, a CI poller) would fail it.
        let script = format!(
            "sh -c 'sleep 4242' & echo started > {}; wait",
            marker.display()
        );
        let out = run_bounded("sh", &["-c", &script], std::path::Path::new("."), &[], Duration::from_millis(300)).unwrap();
        assert!(out.timed_out);
        // Give the OS a moment to actually reap the killed group, then confirm no `sleep 4242`
        // owned by this test's marker is still alive by checking the marker's grandchild is gone.
        std::thread::sleep(Duration::from_millis(300));
        let still_running = std::process::Command::new("pgrep")
            .args(["-f", "sleep 4242"])
            .output()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false);
        let _ = std::fs::remove_file(&marker);
        assert!(!still_running, "grandchild `sleep 4242` must not survive the process-group kill");
    }
}
