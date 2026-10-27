//! Sandbox self-setup: tell an operator (or ct-agent's `doctor sandbox`) whether this host can
//! sandbox a Binary activation, and if not, the concrete per-OS steps that fix it.
//!
//! Three entry points, all returning plain data a CLI can render:
//! * [`doctor`] -- probe this host for real ([`super::select`]) and report ready / not ready.
//! * [`setup_plan`] -- the ordered [`SetupStep`]s that would make it ready (empty when ready).
//! * [`apply`] -- run the steps that need no elevation, and PRINT the ones that do. It never runs
//!   `sudo`, never elevates, and never touches a step that follows an unrun privileged one.
//!
//! Planning is a pure function of [`HostFacts`] ([`plan_from_facts`]), so every OS's plan is unit
//! tested on every host; only [`detect_host`] touches the machine. Nothing in this module's tests
//! executes a package manager.

use super::{select, Selection};
use std::io::Write;

/// Who must run a step.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Privilege {
    /// No host elevation needed (may still change per-user state, e.g. install a package inside a
    /// WSL distro as that distro's root). [`apply`] runs these.
    None,
    /// Needs `sudo` / an administrator shell. [`apply`] only prints these for the user to confirm.
    Elevated,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetupStep {
    pub id: &'static str,
    pub description: String,
    /// Exact argv (no shell) when the step is mechanical; `None` for a manual/diagnostic step.
    pub command: Option<Vec<String>>,
    pub privilege: Privilege,
}

impl SetupStep {
    /// The command as a copy-pasteable line, or `None` for a manual step.
    pub fn command_line(&self) -> Option<String> {
        self.command.as_ref().map(|c| c.join(" "))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetupPlan {
    pub os: String,
    pub steps: Vec<SetupStep>,
}

impl SetupPlan {
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }
}

#[derive(Debug, Clone)]
pub struct DoctorReport {
    pub os: String,
    /// The backend [`super::select`] chose, if any.
    pub backend: Option<String>,
    pub ready: bool,
    /// Every candidate that was probed and failed, with the probe's own reason.
    pub tried: Vec<(String, String)>,
    pub plan: SetupPlan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PackageManager {
    Apt,
    Dnf,
    Pacman,
    Zypper,
    Apk,
}

/// What the host-kernel checks found on Linux.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UsernsFacts {
    /// `user.max_user_namespaces == 0`
    pub max_user_namespaces_zero: bool,
    /// Debian/old-Ubuntu `kernel.unprivileged_userns_clone == 0`
    pub unprivileged_clone_disabled: bool,
    /// Ubuntu 24.04+ `kernel.apparmor_restrict_unprivileged_userns == 1`
    pub apparmor_restricted: bool,
}

/// Everything [`plan_from_facts`] needs, gathered once by [`detect_host`].
#[derive(Debug, Clone)]
pub struct HostFacts {
    /// `std::env::consts::OS`-shaped.
    pub os: String,
    pub ready: bool,
    pub tried: Vec<(String, String)>,
    pub is_root: bool,
    pub package_manager: Option<PackageManager>,
    pub bwrap_on_path: bool,
    pub userns: UsernsFacts,
    pub sandbox_exec_present: bool,
    pub wsl_exe_present: bool,
}

pub fn install_bubblewrap_argv(pm: PackageManager, is_root: bool) -> Vec<String> {
    let mut v: Vec<&str> = Vec::new();
    if !is_root {
        v.push("sudo");
    }
    match pm {
        PackageManager::Apt => v.extend(["apt-get", "install", "-y", "bubblewrap"]),
        PackageManager::Dnf => v.extend(["dnf", "install", "-y", "bubblewrap"]),
        PackageManager::Pacman => v.extend(["pacman", "-S", "--noconfirm", "bubblewrap"]),
        PackageManager::Zypper => {
            v.extend(["zypper", "--non-interactive", "install", "bubblewrap"])
        }
        PackageManager::Apk => v.extend(["apk", "add", "bubblewrap"]),
    }
    v.into_iter().map(String::from).collect()
}

fn sudo(is_root: bool, rest: &[&str]) -> Vec<String> {
    let mut v: Vec<String> = Vec::new();
    if !is_root {
        v.push("sudo".to_string());
    }
    v.extend(rest.iter().map(|s| s.to_string()));
    v
}

fn manual(id: &'static str, description: impl Into<String>) -> SetupStep {
    SetupStep {
        id,
        description: description.into(),
        command: None,
        privilege: Privilege::None,
    }
}

/// The ordered fix list for these facts. Empty iff `facts.ready`.
pub fn plan_from_facts(f: &HostFacts) -> SetupPlan {
    let mut steps = Vec::new();
    if !f.ready {
        match f.os.as_str() {
            "linux" => plan_linux(f, &mut steps),
            "macos" => plan_macos(f, &mut steps),
            "windows" => plan_windows(f, &mut steps),
            "android" => steps.push(manual(
                "android-not-built",
                "Android has no sandbox backend yet: the planned design is the ct-agent core running inside an \
                 app sandbox (docs/adr/0002-android-sandbox-via-ct-agent-core.md, status Proposed). Binary \
                 manifests are refused on Android until then.",
            )),
            other => steps.push(manual("unsupported-os", format!("no sandbox backend exists for OS `{other}`"))),
        }
    }
    SetupPlan {
        os: f.os.clone(),
        steps,
    }
}

fn plan_linux(f: &HostFacts, steps: &mut Vec<SetupStep>) {
    if !f.bwrap_on_path {
        let (command, description) = match f.package_manager {
            Some(pm) => (
                Some(install_bubblewrap_argv(pm, f.is_root)),
                format!("install bubblewrap with {pm:?}'s package manager"),
            ),
            None => (None, "install the `bubblewrap` package with your distribution's package manager (none of apt/dnf/pacman/zypper/apk was found)".to_string()),
        };
        steps.push(SetupStep {
            id: "install-bubblewrap",
            description,
            command,
            privilege: Privilege::Elevated,
        });
    }
    if f.userns.max_user_namespaces_zero {
        steps.push(SetupStep {
            id: "enable-user-namespaces",
            description: "user namespaces are disabled (user.max_user_namespaces=0); raise it (persist in /etc/sysctl.d/)".into(),
            command: Some(sudo(f.is_root, &["sysctl", "-w", "user.max_user_namespaces=15000"])),
            privilege: Privilege::Elevated,
        });
    }
    if f.userns.unprivileged_clone_disabled {
        steps.push(SetupStep {
            id: "enable-unprivileged-userns",
            description: "unprivileged user namespaces are disabled (kernel.unprivileged_userns_clone=0); enable (persist in /etc/sysctl.d/)".into(),
            command: Some(sudo(f.is_root, &["sysctl", "-w", "kernel.unprivileged_userns_clone=1"])),
            privilege: Privilege::Elevated,
        });
    }
    // Either the sysctl says so, or bwrap's own failure shows it (observed on a real Ubuntu 24.04
    // host: `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`) -- the sysctl file can
    // be unreadable inside containers while the restriction still applies.
    let probe_text = reasons(&f.tried).to_ascii_lowercase();
    let apparmor_symptom = probe_text.contains("rtm_newaddr") || probe_text.contains("rtm_newlink");
    if f.userns.apparmor_restricted || apparmor_symptom {
        if f.package_manager == Some(PackageManager::Apt) {
            steps.push(SetupStep {
                id: "install-apparmor-profiles",
                description: "the bwrap AppArmor profile ships in `apparmor-profiles`".into(),
                command: Some(sudo(f.is_root, &["apt-get", "install", "-y", "apparmor-profiles"])),
                privilege: Privilege::Elevated,
            });
        }
        steps.push(SetupStep {
            id: "install-bwrap-apparmor-profile",
            description: "kernel.apparmor_restrict_unprivileged_userns=1 (Ubuntu 24.04+) denies bwrap its user namespace; \
                          install the distro's bwrap profile (needs the `apparmor-profiles` package). Do NOT disable the sysctl on a shared host."
                .into(),
            command: Some(sudo(
                f.is_root,
                &["cp", "/usr/share/apparmor/extra-profiles/bwrap-userns-restrict", "/etc/apparmor.d/bwrap-userns-restrict"],
            )),
            privilege: Privilege::Elevated,
        });
        steps.push(SetupStep {
            id: "load-bwrap-apparmor-profile",
            description: "load the profile".into(),
            command: Some(sudo(
                f.is_root,
                &[
                    "apparmor_parser",
                    "-r",
                    "/etc/apparmor.d/bwrap-userns-restrict",
                ],
            )),
            privilege: Privilege::Elevated,
        });
    }
    if steps.is_empty() {
        steps.push(manual("diagnose", format!("bubblewrap is installed and no known kernel restriction was found, but the real-exec probe still fails: {}", reasons(&f.tried))));
    }
}

fn plan_macos(f: &HostFacts, steps: &mut Vec<SetupStep>) {
    if !f.sandbox_exec_present {
        steps.push(manual(
            "sandbox-exec-missing",
            "/usr/bin/sandbox-exec is part of macOS and cannot be installed; this macOS release no longer ships it, \
             so no lightweight sandbox exists here (the only way to run a Binary manifest is the explicit, unsafe CT_ALLOW_UNSANDBOXED=1)",
        ));
    } else {
        steps.push(manual(
            "run-outside-a-sandbox",
            format!(
                "nothing to install on macOS -- sandbox-exec is built in. The real-exec probe failed, usually because \
                 this process already runs inside another sandbox (Seatbelt does not nest): run from a normal Terminal. Probe: {}",
                reasons(&f.tried)
            ),
        ));
    }
}

/// Windows setup: a DEDICATED distro (`cads-sandbox`) so the hardening (interop off, no Windows
/// `PATH`) never touches the user's own distro, then bubblewrap inside it. Each step is added only
/// when the probe's reason shows it is missing; an unrecognised failure gets a diagnostic, never a
/// guess.
fn plan_windows(f: &HostFacts, steps: &mut Vec<SetupStep>) {
    let reason = reasons(&f.tried).to_ascii_lowercase();
    let no_wsl = !f.wsl_exe_present || reason.contains("wsl is not installed");
    let no_distro = no_wsl || reason.contains("is not installed. setup") || reason.contains("no distribution") || reason.contains("no installed distributions");
    let bad_conf = reason.contains("wsl.conf lacks") || reason.contains("wsl interop is live");
    let no_bwrap = reason.contains("bubblewrap is not installed");
    let d = super::wsl::SANDBOX_DISTRO;
    let root_sh = |script: &str| -> Vec<String> {
        ["wsl.exe", "-d", d, "-u", "root", "--exec", "/bin/sh", "-c", script].map(String::from).to_vec()
    };
    if no_wsl {
        steps.push(SetupStep {
            id: "wsl-install",
            description: "enable WSL2 itself (elevated PowerShell; reboot if asked)".into(),
            command: Some(["wsl.exe", "--install", "--no-distribution"].map(String::from).to_vec()),
            privilege: Privilege::Elevated,
        });
    }
    if no_distro {
        steps.push(SetupStep {
            id: "wsl-create-sandbox-distro",
            description: format!("create the dedicated distro `{d}` (a separate Ubuntu instance; your own distros are untouched)"),
            command: Some(["wsl.exe", "--install", "-d", "Ubuntu", "--name", d, "--no-launch"].map(String::from).to_vec()),
            privilege: Privilege::None,
        });
    }
    if no_distro || bad_conf {
        steps.push(SetupStep {
            id: "wsl-harden-sandbox-distro",
            description: format!("write {d}'s /etc/wsl.conf with interop and the Windows PATH disabled, so a sandboxed payload cannot start Windows executables"),
            command: Some(root_sh("printf '[interop]\\nenabled=false\\nappendWindowsPath=false\\n' > /etc/wsl.conf")),
            privilege: Privilege::None,
        });
        steps.push(SetupStep {
            id: "wsl-restart-sandbox-distro",
            description: "restart the distro so wsl.conf takes effect (the probe also checks the live interop state)".into(),
            command: Some(["wsl.exe", "--terminate", d].map(String::from).to_vec()),
            privilege: Privilege::None,
        });
    }
    if no_distro || no_bwrap {
        steps.push(SetupStep {
            id: "wsl-install-bubblewrap",
            description: format!("install bubblewrap (and util-linux's prlimit) inside `{d}` as the distro's root; no Windows elevation"),
            command: Some(root_sh("apt-get update && apt-get install -y bubblewrap util-linux")),
            privilege: Privilege::None,
        });
    }
    if steps.is_empty() {
        steps.push(manual("diagnose", format!("WSL and `{d}` look present but the sandbox probe fails: {}", reasons(&f.tried))));
    }
}

fn reasons(tried: &[(String, String)]) -> String {
    if tried.is_empty() {
        "(no probe output)".to_string()
    } else {
        tried
            .iter()
            .map(|(c, r)| format!("{c}: {r}"))
            .collect::<Vec<_>>()
            .join("; ")
    }
}

// ---------------------------------------------------------------------------------------------
// Host detection (the only impure part)
// ---------------------------------------------------------------------------------------------

/// First `PATH` entry that contains an existing `name` (or `name.exe` on Windows).
pub(crate) fn find_in_path(name: &str, path_var: Option<&str>) -> Option<std::path::PathBuf> {
    let path_var = path_var?;
    std::env::split_paths(path_var).find_map(|dir| {
        let cand = dir.join(name);
        if cand.is_file() {
            return Some(cand);
        }
        let exe = dir.join(format!("{name}.exe"));
        exe.is_file().then_some(exe)
    })
}

fn read_sysctl(path: &str) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
}

pub fn detect_host() -> HostFacts {
    let path = std::env::var("PATH").ok();
    let path = path.as_deref();
    let (ready, tried) = match select() {
        Selection::Sandboxed(_) => (true, Vec::new()),
        Selection::Unsandboxed { tried } => (
            false,
            tried.into_iter().map(|(c, r)| (c.to_string(), r)).collect(),
        ),
    };
    #[cfg(unix)]
    let is_root = unsafe { libc::geteuid() } == 0;
    #[cfg(not(unix))]
    let is_root = false;
    let package_manager = [
        ("apt-get", PackageManager::Apt),
        ("dnf", PackageManager::Dnf),
        ("pacman", PackageManager::Pacman),
        ("zypper", PackageManager::Zypper),
        ("apk", PackageManager::Apk),
    ]
    .into_iter()
    .find_map(|(bin, pm)| find_in_path(bin, path).map(|_| pm));
    HostFacts {
        os: std::env::consts::OS.to_string(),
        ready,
        tried,
        is_root,
        package_manager,
        bwrap_on_path: find_in_path("bwrap", path).is_some(),
        userns: UsernsFacts {
            max_user_namespaces_zero: read_sysctl("/proc/sys/user/max_user_namespaces").as_deref()
                == Some("0"),
            unprivileged_clone_disabled: read_sysctl("/proc/sys/kernel/unprivileged_userns_clone")
                .as_deref()
                == Some("0"),
            apparmor_restricted: read_sysctl(
                "/proc/sys/kernel/apparmor_restrict_unprivileged_userns",
            )
            .as_deref()
                == Some("1"),
        },
        sandbox_exec_present: std::path::Path::new("/usr/bin/sandbox-exec").exists(),
        wsl_exe_present: find_in_path("wsl", path).is_some(),
    }
}

/// Probe this host and report. Runs the real-exec probes (a few short subprocesses), nothing else.
pub fn doctor() -> DoctorReport {
    let facts = detect_host();
    let backend = match select() {
        Selection::Sandboxed(b) => Some(b.name().to_string()),
        Selection::Unsandboxed { .. } => None,
    };
    let plan = plan_from_facts(&facts);
    DoctorReport {
        os: facts.os,
        backend,
        ready: facts.ready,
        tried: facts.tried,
        plan,
    }
}

/// Just the plan for this host (empty when it is already ready).
pub fn setup_plan() -> SetupPlan {
    plan_from_facts(&detect_host())
}

// ---------------------------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------------------------

pub trait StepRunner {
    /// Run `argv` (no shell); return its exit code.
    fn run(&self, argv: &[String]) -> Result<Option<i32>, String>;
}

struct SystemRunner;

impl StepRunner for SystemRunner {
    fn run(&self, argv: &[String]) -> Result<Option<i32>, String> {
        let (prog, args) = argv.split_first().ok_or("empty command")?;
        std::process::Command::new(prog)
            .args(args)
            .status()
            .map(|s| s.code())
            .map_err(|e| format!("failed to run {prog}: {e}"))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StepRun {
    pub id: &'static str,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ApplyOutcome {
    /// Steps [`apply`] executed itself.
    pub ran: Vec<StepRun>,
    /// Steps the user must run (elevated, manual, or blocked behind one that is).
    pub pending: Vec<SetupStep>,
    /// Whether a fresh probe found a usable backend after the run.
    pub ready_after: bool,
}

/// Run every non-elevated step of `plan`, print the rest. See the module docs for the rules.
pub fn apply(plan: &SetupPlan, out: &mut dyn Write) -> ApplyOutcome {
    apply_with(
        plan,
        &SystemRunner,
        &|| matches!(select(), Selection::Sandboxed(_)),
        out,
    )
}

pub fn apply_with(
    plan: &SetupPlan,
    runner: &dyn StepRunner,
    ready: &dyn Fn() -> bool,
    out: &mut dyn Write,
) -> ApplyOutcome {
    let mut ran = Vec::new();
    let mut pending = Vec::new();
    let mut blocked = false;
    for step in &plan.steps {
        let runnable = step.privilege == Privilege::None && step.command.is_some() && !blocked;
        if runnable {
            let argv = step.command.as_ref().expect("checked above");
            let _ = writeln!(out, "[running] {}  # {}", argv.join(" "), step.description);
            let (exit_code, error) = match runner.run(argv) {
                Ok(code) => (code, None),
                Err(e) => (None, Some(e)),
            };
            let ok = exit_code == Some(0);
            let _ = writeln!(out, "[{}] {}", if ok { "ok" } else { "FAILED" }, step.id);
            if !ok {
                blocked = true; // later steps assume this one worked
            }
            ran.push(StepRun {
                id: step.id,
                exit_code,
                error,
            });
            if !ok {
                pending.push(step.clone());
            }
        } else {
            if step.privilege == Privilege::Elevated {
                blocked = true;
            }
            let why = if step.privilege == Privilege::Elevated {
                "needs elevation -- run it yourself after reviewing it"
            } else if step.command.is_none() {
                "manual step"
            } else {
                "waits for an earlier step"
            };
            match step.command_line() {
                Some(c) => {
                    let _ = writeln!(out, "[confirm] {c}  # {} ({why})", step.description);
                }
                None => {
                    let _ = writeln!(out, "[manual] {} ({why})", step.description);
                }
            }
            pending.push(step.clone());
        }
    }
    let ready_after = ready();
    let _ = writeln!(
        out,
        "{}",
        if ready_after {
            "sandbox ready"
        } else if pending.is_empty() {
            "sandbox still not usable -- re-run the doctor for the probe output"
        } else {
            "sandbox not ready yet: run the steps above, then re-run the doctor"
        }
    );
    ApplyOutcome {
        ran,
        pending,
        ready_after,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn facts(os: &str) -> HostFacts {
        HostFacts {
            os: os.to_string(),
            ready: false,
            tried: vec![(
                "bwrap".into(),
                "bwrap not runnable on PATH: No such file or directory".into(),
            )],
            is_root: false,
            package_manager: Some(PackageManager::Apt),
            bwrap_on_path: false,
            userns: UsernsFacts::default(),
            sandbox_exec_present: true,
            wsl_exe_present: true,
        }
    }

    #[test]
    fn a_ready_host_has_an_empty_plan_on_every_os() {
        for os in ["linux", "macos", "windows", "android"] {
            let mut f = facts(os);
            f.ready = true;
            assert!(plan_from_facts(&f).is_empty(), "{os}");
        }
    }

    #[test]
    fn linux_installs_bubblewrap_with_the_detected_package_manager() {
        let expected: [(PackageManager, &[&str]); 5] = [
            (
                PackageManager::Apt,
                &["sudo", "apt-get", "install", "-y", "bubblewrap"],
            ),
            (
                PackageManager::Dnf,
                &["sudo", "dnf", "install", "-y", "bubblewrap"],
            ),
            (
                PackageManager::Pacman,
                &["sudo", "pacman", "-S", "--noconfirm", "bubblewrap"],
            ),
            (
                PackageManager::Zypper,
                &[
                    "sudo",
                    "zypper",
                    "--non-interactive",
                    "install",
                    "bubblewrap",
                ],
            ),
            (PackageManager::Apk, &["sudo", "apk", "add", "bubblewrap"]),
        ];
        for (pm, argv) in expected {
            let mut f = facts("linux");
            f.package_manager = Some(pm);
            let plan = plan_from_facts(&f);
            assert_eq!(plan.steps[0].id, "install-bubblewrap");
            assert_eq!(plan.steps[0].command.as_deref().unwrap(), argv, "{pm:?}");
            assert_eq!(plan.steps[0].privilege, Privilege::Elevated);
        }
    }

    #[test]
    fn root_gets_no_sudo_and_an_unknown_package_manager_gets_a_manual_step() {
        let mut f = facts("linux");
        f.is_root = true;
        assert_eq!(
            plan_from_facts(&f).steps[0].command.as_deref().unwrap()[0],
            "apt-get"
        );
        f.package_manager = None;
        let step = &plan_from_facts(&f).steps[0];
        assert!(step.command.is_none() && step.description.contains("package manager"));
    }

    #[test]
    fn linux_userns_restrictions_each_get_their_own_elevated_step() {
        let mut f = facts("linux");
        f.bwrap_on_path = true;
        f.userns = UsernsFacts {
            max_user_namespaces_zero: true,
            unprivileged_clone_disabled: true,
            apparmor_restricted: true,
        };
        let ids: Vec<_> = plan_from_facts(&f).steps.iter().map(|s| s.id).collect();
        assert_eq!(
            ids,
            [
                "enable-user-namespaces",
                "enable-unprivileged-userns",
                "install-apparmor-profiles",
                "install-bwrap-apparmor-profile",
                "load-bwrap-apparmor-profile"
            ]
        );
        // Never offers to switch the AppArmor restriction off as a command.
        assert!(plan_from_facts(&f).steps.iter().all(|s| !s
            .command_line()
            .unwrap_or_default()
            .contains("apparmor_restrict_unprivileged_userns=0")));
    }

    #[test]
    fn linux_with_bwrap_and_no_known_cause_gets_a_diagnostic_not_a_guess() {
        let mut f = facts("linux");
        f.bwrap_on_path = true;
        let plan = plan_from_facts(&f);
        assert_eq!(plan.steps.len(), 1);
        assert_eq!(plan.steps[0].id, "diagnose");
        assert!(plan.steps[0].command.is_none());
    }

    #[test]
    fn macos_has_nothing_to_install() {
        let plan = plan_from_facts(&facts("macos"));
        assert!(plan.steps.iter().all(|s| s.command.is_none()));
        assert!(plan.steps[0].description.contains("nothing to install"));
        let mut f = facts("macos");
        f.sandbox_exec_present = false;
        assert_eq!(plan_from_facts(&f).steps[0].id, "sandbox-exec-missing");
    }

    #[test]
    fn windows_without_wsl_enables_wsl_elevated_then_builds_the_dedicated_hardened_distro() {
        let mut f = facts("windows");
        f.wsl_exe_present = false;
        let steps = plan_from_facts(&f).steps;
        let ids: Vec<_> = steps.iter().map(|s| s.id).collect();
        assert_eq!(ids, ["wsl-install", "wsl-create-sandbox-distro", "wsl-harden-sandbox-distro", "wsl-restart-sandbox-distro", "wsl-install-bubblewrap"]);
        assert_eq!(steps[0].privilege, Privilege::Elevated);
        assert_eq!(steps[0].command_line().unwrap(), "wsl.exe --install --no-distribution");
        assert!(steps[1].command_line().unwrap().contains("--name cads-sandbox"));
        assert!(steps[2].command_line().unwrap().contains("enabled=false") && steps[2].command_line().unwrap().contains("appendWindowsPath=false"));
        assert!(steps[1..].iter().all(|s| s.privilege == Privilege::None), "only enabling WSL needs elevation");
        assert!(steps[4].command_line().unwrap().contains("bubblewrap"));
    }

    #[test]
    fn windows_distro_present_but_interop_on_only_needs_the_hardening_steps() {
        let mut f = facts("windows");
        f.tried = vec![("wsl_bwrap".into(), "cads-sandbox's /etc/wsl.conf lacks [interop] enabled=false -- Setup".into())];
        let ids: Vec<_> = plan_from_facts(&f).steps.iter().map(|s| s.id).collect();
        assert_eq!(ids, ["wsl-harden-sandbox-distro", "wsl-restart-sandbox-distro"]);
    }

    #[test]
    fn windows_with_a_distro_but_no_bwrap_only_needs_the_in_distro_install() {
        let mut f = facts("windows");
        f.tried = vec![("wsl_bwrap".into(), "WSL sandbox probe failed -- bubblewrap is not installed in `cads-sandbox`: run".into())];
        let ids: Vec<_> = plan_from_facts(&f).steps.iter().map(|s| s.id).collect();
        assert_eq!(ids, ["wsl-install-bubblewrap"]);
    }

    #[test]
    fn ubuntu_apparmor_userns_failure_is_detected_from_bwrap_stderr_even_without_the_sysctl() {
        // The exact failure seen on a real Ubuntu 24.04 host; /proc/sys/... unreadable (container).
        let mut f = facts("linux");
        f.bwrap_on_path = true;
        f.tried = vec![("bwrap".into(), "real sandboxed-exec probe failed: exit=Some(1) stderr=bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted".into())];
        assert!(!f.userns.apparmor_restricted);
        let steps = plan_from_facts(&f).steps;
        let ids: Vec<_> = steps.iter().map(|s| s.id).collect();
        assert_eq!(ids, ["install-apparmor-profiles", "install-bwrap-apparmor-profile", "load-bwrap-apparmor-profile"]);
        assert!(steps[1].command_line().unwrap().contains("/etc/apparmor.d/bwrap-userns-restrict"));
        assert!(steps.iter().all(|s| s.privilege == Privilege::Elevated), "stays fail-closed: nothing here is auto-applied");
    }

    #[test]
    fn android_and_unknown_os_say_not_built() {
        assert_eq!(
            plan_from_facts(&facts("android")).steps[0].id,
            "android-not-built"
        );
        assert_eq!(
            plan_from_facts(&facts("plan9")).steps[0].id,
            "unsupported-os"
        );
    }

    struct FakeRunner {
        calls: RefCell<Vec<Vec<String>>>,
        exit: i32,
    }
    impl StepRunner for FakeRunner {
        fn run(&self, argv: &[String]) -> Result<Option<i32>, String> {
            self.calls.borrow_mut().push(argv.to_vec());
            Ok(Some(self.exit))
        }
    }

    #[test]
    fn apply_runs_only_unprivileged_steps_and_prints_the_rest_without_ever_running_them() {
        let plan = SetupPlan {
            os: "linux".into(),
            steps: vec![
                SetupStep {
                    id: "a",
                    description: "unprivileged".into(),
                    command: Some(vec!["true".into()]),
                    privilege: Privilege::None,
                },
                SetupStep {
                    id: "b",
                    description: "needs sudo".into(),
                    command: Some(vec!["sudo".into(), "apt-get".into()]),
                    privilege: Privilege::Elevated,
                },
                SetupStep {
                    id: "c",
                    description: "depends on b".into(),
                    command: Some(vec!["true".into()]),
                    privilege: Privilege::None,
                },
                manual("d", "do this by hand"),
            ],
        };
        let runner = FakeRunner {
            calls: RefCell::new(vec![]),
            exit: 0,
        };
        let mut out = Vec::new();
        let outcome = apply_with(&plan, &runner, &|| false, &mut out);
        assert_eq!(
            *runner.calls.borrow(),
            vec![vec!["true".to_string()]],
            "only step a may run"
        );
        assert_eq!(outcome.ran.len(), 1);
        assert_eq!(
            outcome.pending.iter().map(|s| s.id).collect::<Vec<_>>(),
            ["b", "c", "d"]
        );
        let text = String::from_utf8(out).unwrap();
        assert!(text.contains("[confirm] sudo apt-get"), "{text}");
        assert!(
            text.contains("waits for an earlier step") && text.contains("[manual] do this by hand"),
            "{text}"
        );
        assert!(!outcome.ready_after);
    }

    #[test]
    fn a_failed_step_blocks_the_ones_after_it_and_is_reported_pending() {
        let plan = SetupPlan {
            os: "windows".into(),
            steps: vec![
                SetupStep {
                    id: "x",
                    description: "".into(),
                    command: Some(vec!["x".into()]),
                    privilege: Privilege::None,
                },
                SetupStep {
                    id: "y",
                    description: "".into(),
                    command: Some(vec!["y".into()]),
                    privilege: Privilege::None,
                },
            ],
        };
        let runner = FakeRunner {
            calls: RefCell::new(vec![]),
            exit: 1,
        };
        let outcome = apply_with(&plan, &runner, &|| false, &mut Vec::new());
        assert_eq!(runner.calls.borrow().len(), 1);
        assert_eq!(
            outcome.pending.iter().map(|s| s.id).collect::<Vec<_>>(),
            ["x", "y"]
        );
    }

    #[test]
    fn find_in_path_resolves_only_existing_files() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("fake-tool"), "").unwrap();
        let p = d.path().to_str().unwrap();
        assert!(find_in_path("fake-tool", Some(p)).is_some());
        assert!(find_in_path("absent-tool", Some(p)).is_none());
        assert!(find_in_path("fake-tool", None).is_none());
    }

    #[test]
    fn detect_host_and_doctor_agree_with_select_on_this_machine() {
        let report = doctor();
        assert_eq!(report.os, std::env::consts::OS);
        assert_eq!(report.ready, report.backend.is_some());
        assert_eq!(report.ready, report.plan.is_empty());
    }
}
