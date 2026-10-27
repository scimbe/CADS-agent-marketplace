# ADR-0002: Android sandbox via the ct-agent core inside an app sandbox

## Status

Proposed. **Partly superseded by ADR-0003 (Proposed):** the "run the payload natively inside the
app" part is replaced by the `Wasm` installer kind for anything downloaded; the UniFFI/ct-agent-core
packaging decision in this ADR stays relevant as the way the Wasm runtime reaches the app.

Original status: Proposed. Nothing described here is built; `installer-engine` refuses Binary manifests on Android
(`activate::binary_manifest_platform_verdict("android")`, `unsupported_platform: ...`) until this is
implemented and measured on a device.

## Context

Product requirement: prompt-guided installations always run sandboxed on Linux, macOS, Windows and
Android, on commodity hardware, and the environment establishes the sandbox itself.

Linux (`bwrap`), macOS (Seatbelt `sandbox_exec`) and Windows (`wsl_bwrap`) are lightweight
wrappers around a command line: `SandboxBackend::wrap_command` rewrites `(exe, args)` and
`process::run_bounded` spawns it. That model does not transfer to Android:

- An app cannot create namespaces, call `bwrap`, or load a Seatbelt-style profile for an arbitrary
  child. Android's confinement is applied by the OS *to the app*: a per-app Linux UID, SELinux
  `untrusted_app` domain, seccomp-bpf filter, and a private data directory.
- Since Android 10, apps targeting API 29+ cannot `exec` files from their writable data directory
  (W^X restriction), so "download a Linux binary and run it" is not available either. Payloads
  must ship as part of the APK (native libs) or run in an interpreter/VM inside the app.

The repository `CADS-webconference-android` is the existing Android app in this ecosystem; its
build and packaging are the reference for how the app is delivered. (Its internals were not
reviewed for this ADR; the points below are design intent, to be checked against it.)

## Decision (proposed)

Treat the **Android app itself as the sandbox**, and run the ct-agent core inside it:

1. The ct-agent core (Rust: manifest verification, allowlist, `installer-engine`'s fetch / verify /
   guardrail logic) is compiled for Android targets and exposed to Kotlin through **UniFFI**
   bindings. The app is a thin UI over that API.
2. The install runs **in the app's process/UID**. Isolation is Android's per-app UID separation:
   the payload can read and write only the app's private data directory, has no access to other
   apps' data, and holds only the permissions declared in the app manifest. Network access is
   governed by the app's `INTERNET` permission: an install profile that must have *no network*
   ships as a build/flavor without that permission, or runs in a separate `:sandbox` process
   (`android:process`) of a second, permission-less app/flavor, selected by the host app.
3. Supported payload kinds are **only** those that can execute inside that confinement without
   exec-from-data: manifests whose bundle is interpreted or loaded by the core (for example a
   WASM module or a script for an embedded interpreter), or native code packaged in the APK.
   Arbitrary downloaded ELF `Binary` manifests stay refused on Android.
4. `installer-engine` gains an Android *executor* (not a `SandboxBackend` wrapper) behind the
   UniFFI boundary. It reuses the signature, allowlist and bundle-hash checks unchanged; only step 9
   (running the artifact) differs.

## Alternatives considered

- **proot / termux-style userland chroot.** Runs unmodified Linux binaries, but it is ptrace-based
  emulation, not a security boundary, and it relies on exec from the data directory that Android 10+
  blocks for targetSdk 29+. Rejected as a sandbox.
- **A VM (Android Virtualization Framework / pKVM).** A real boundary, but available only on a
  subset of recent devices and not "commodity hardware" in general. Possible later tier.
- **Refuse Binary manifests on Android permanently.** The current behaviour; acceptable fallback
  if the executor above proves too constrained.

## Consequences

- Android support is a separate executor with a narrower payload surface than the desktop
  backends, not a fourth `wrap_command` implementation. Manifest authors need a way to declare
  Android-compatible payloads; that is a `manifest-core` question left open here.
- The security claim on Android is "Android app sandbox", which is measurable on a device (SELinux
  domain, UID, file access, network with and without the permission) but has not been measured.
- Build cost: cross-compiling the core (NDK toolchains) and maintaining UniFFI bindings.

## To verify before moving to Accepted

- On a real device: that a payload run in the app UID cannot read another app's data and cannot
  open sockets in the permission-less configuration.
- The W^X behaviour on the minimum supported API level, and which payload kinds survive it.
- That `installer-engine` and its dependencies (rustls, no OpenSSL) cross-compile for
  `aarch64-linux-android` cleanly.
