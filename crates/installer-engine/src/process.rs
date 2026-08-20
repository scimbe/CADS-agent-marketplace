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
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_quick_command_completes_normally() {
        let out = run_bounded("sh", &["-c", "echo hi"], std::path::Path::new("."), &[], Duration::from_secs(5)).unwrap();
        assert!(!out.timed_out);
        assert_eq!(out.exit_code, Some(0));
        assert_eq!(out.stdout.trim(), "hi");
    }

    #[test]
    fn a_hanging_command_is_killed_on_timeout() {
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

    #[test]
    fn the_whole_process_group_is_killed_not_just_the_shell() {
        // A backgrounded grandchild (mirrors a verify.sh that backgrounds a curl, or `docker
        // compose`'s own build subprocesses) must not survive the timeout as an orphan. Have the
        // shell spawn a long-running child, print its pid, then exit -- if the group kill works,
        // that pid is gone shortly after; if only the shell was killed, it lingers.
        let marker = std::env::temp_dir().join(format!("installer-engine-grandchild-test-{}", std::process::id()));
        let _ = std::fs::remove_file(&marker);
        let script = format!(
            "sh -c 'sleep 30' & echo started > {}; wait",
            marker.display()
        );
        let out = run_bounded("sh", &["-c", &script], std::path::Path::new("."), &[], Duration::from_millis(300)).unwrap();
        assert!(out.timed_out);
        // Give the OS a moment to actually reap the killed group, then confirm no `sleep 30`
        // owned by this test's marker is still alive by checking the marker's grandchild is gone.
        std::thread::sleep(Duration::from_millis(300));
        let still_running = std::process::Command::new("pgrep")
            .args(["-f", "sleep 30"])
            .output()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false);
        let _ = std::fs::remove_file(&marker);
        assert!(!still_running, "grandchild `sleep 30` must not survive the process-group kill");
    }
}
