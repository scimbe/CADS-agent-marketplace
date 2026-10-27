//! Shared hand-written component-model WAT guests for the wasm integration tests.
#![allow(dead_code)]

const ERROR_CODES: &str = r#""access" "would-block" "already" "bad-descriptor" "busy" "deadlock" "quota" "exist" "file-too-large" "illegal-byte-sequence" "in-progress" "interrupted" "invalid" "io" "is-directory" "loop" "too-many-links" "message-size" "name-too-long" "no-device" "no-entry" "no-lock" "insufficient-memory" "insufficient-space" "not-directory" "not-empty" "not-recoverable" "unsupported" "no-tty" "no-such-device" "overflow" "not-permitted" "pipe" "read-only" "invalid-seek" "text-file-busy" "cross-device""#;

/// A `wasi:cli/run` component whose `run` is the given core function body (returns i32: 0 = ok).
pub fn simple_component(core_body: &str, memory_pages: u32) -> Vec<u8> {
    let wat = format!(
        r#"(component
  (core module $m
    (memory {memory_pages})
    (func (export "run") (result i32) {core_body}))
  (core instance $i (instantiate $m))
  (func $run (result (result)) (canon lift (core func $i "run")))
  (instance $inst (export "run" (func $run)))
  (export "wasi:cli/run@0.2.0" (instance $inst)))"#
    );
    wat::parse_str(wat).expect("valid component wat")
}

/// Opens `path` (create + write) in the FIRST preopen and writes "hello". Exit 1 if any step fails.
pub fn fs_probe_component(path: &str) -> Vec<u8> {
    let len = path.len();
    // Every byte as a \xx escape: paths may hold backslashes (Windows temp dirs) or quotes.
    let path: String = path.bytes().map(|b| format!("\\{b:02x}")).collect();
    let wat = format!(
        r#"(component
  (import "wasi:filesystem/types@0.2.0" (instance $types
    (export "descriptor" (type $descriptor (sub resource)))
    (type $ec (enum {ERROR_CODES}))
    (export "error-code" (type $error-code (eq $ec)))
    (type $pf (flags "symlink-follow"))
    (export "path-flags" (type $path-flags (eq $pf)))
    (type $of (flags "create" "directory" "exclusive" "truncate"))
    (export "open-flags" (type $open-flags (eq $of)))
    (type $df (flags "read" "write" "file-integrity-sync" "data-integrity-sync" "requested-write-sync" "mutate-directory"))
    (export "descriptor-flags" (type $descriptor-flags (eq $df)))
    (export "[method]descriptor.open-at" (func (param "self" (borrow $descriptor)) (param "path-flags" $path-flags) (param "path" string) (param "open-flags" $open-flags) (param "flags" $descriptor-flags) (result (result (own $descriptor) (error $error-code)))))
    (export "[method]descriptor.write" (func (param "self" (borrow $descriptor)) (param "buffer" (list u8)) (param "offset" u64) (result (result u64 (error $error-code)))))
  ))
  (alias export $types "descriptor" (type $descriptor))
  (import "wasi:filesystem/preopens@0.2.0" (instance $preopens
    (alias outer 1 $descriptor (type $d))
    (export "get-directories" (func (result (list (tuple (own $d) string)))))
  ))
  (core module $libc
    (memory (export "memory") 1)
    (global $bump (mut i32) (i32.const 4096))
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) (local $p i32)
      (local.set $p (i32.and (i32.add (global.get $bump) (i32.const 7)) (i32.const -8)))
      (global.set $bump (i32.add (local.get $p) (local.get 3)))
      (local.get $p)))
  (core instance $libc (instantiate $libc))
  (alias export $preopens "get-directories" (func $get_dirs))
  (alias export $types "[method]descriptor.open-at" (func $open_at))
  (alias export $types "[method]descriptor.write" (func $write))
  (core func $get_dirs_l (canon lower (func $get_dirs) (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
  (core func $open_at_l (canon lower (func $open_at) (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
  (core func $write_l (canon lower (func $write) (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
  (core module $main
    (import "libc" "memory" (memory 1))
    (import "host" "get-dirs" (func $get_dirs (param i32)))
    (import "host" "open-at" (func $open_at (param i32 i32 i32 i32 i32 i32 i32)))
    (import "host" "write" (func $write (param i32 i32 i32 i64 i32)))
    (data (i32.const 64) "{path}")
    (data (i32.const 512) "hello")
    (func (export "run") (result i32) (local $fd i32)
      (call $get_dirs (i32.const 16))
      (if (i32.eqz (i32.load (i32.const 20))) (then (return (i32.const 1))))
      (local.set $fd (i32.load (i32.load (i32.const 16))))
      (call $open_at (local.get $fd) (i32.const 0) (i32.const 64) (i32.const {len}) (i32.const 1) (i32.const 2) (i32.const 32))
      (if (i32.load8_u (i32.const 32)) (then (return (i32.const 1))))
      (local.set $fd (i32.load (i32.const 36)))
      (call $write (local.get $fd) (i32.const 512) (i32.const 5) (i64.const 0) (i32.const 48))
      (if (i32.load8_u (i32.const 48)) (then (return (i32.const 1))))
      (i32.const 0)))
  (core instance $main (instantiate $main
    (with "libc" (instance $libc))
    (with "host" (instance
      (export "get-dirs" (func $get_dirs_l))
      (export "open-at" (func $open_at_l))
      (export "write" (func $write_l))))))
  (func $run (result (result)) (canon lift (core func $main "run")))
  (instance $inst (export "run" (func $run)))
  (export "wasi:cli/run@0.2.0" (instance $inst)))"#
    );
    wat::parse_str(wat).expect("valid component wat")
}


/// Exits 0 iff `wasi:cli/environment.get-environment` returns exactly `expected` variables.
pub fn env_count_component(expected: u32) -> Vec<u8> {
    let wat = format!(
        r#"(component
  (import "wasi:cli/environment@0.2.0" (instance $env
    (export "get-environment" (func (result (list (tuple string string)))))))
  (core module $libc
    (memory (export "memory") 1)
    (global $bump (mut i32) (i32.const 4096))
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) (local $p i32)
      (local.set $p (i32.and (i32.add (global.get $bump) (i32.const 7)) (i32.const -8)))
      (global.set $bump (i32.add (local.get $p) (local.get 3)))
      (local.get $p)))
  (core instance $libc (instantiate $libc))
  (alias export $env "get-environment" (func $get))
  (core func $get_l (canon lower (func $get) (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
  (core module $main
    (import "libc" "memory" (memory 1))
    (import "host" "get" (func $get (param i32)))
    (func (export "run") (result i32)
      (call $get (i32.const 16))
      (i32.ne (i32.load (i32.const 20)) (i32.const {expected}))))
  (core instance $main (instantiate $main (with "libc" (instance $libc)) (with "host" (instance (export "get" (func $get_l))))))
  (func $run (result (result)) (canon lift (core func $main "run")))
  (instance $inst (export "run" (func $run)))
  (export "wasi:cli/run@0.2.0" (instance $inst)))"#
    );
    wat::parse_str(wat).expect("valid component wat")
}

/// Calls `wasi:filesystem/preopens.get-directories` `n` times, each call allocating new descriptor
/// handles in the host resource table (and never dropping them).
pub fn table_flood_component(n: u32) -> Vec<u8> {
    let wat = format!(
        r#"(component
  (import "wasi:filesystem/types@0.2.0" (instance $types
    (export "descriptor" (type $descriptor (sub resource)))))
  (alias export $types "descriptor" (type $descriptor))
  (import "wasi:filesystem/preopens@0.2.0" (instance $preopens
    (alias outer 1 $descriptor (type $d))
    (export "get-directories" (func (result (list (tuple (own $d) string)))))))
  (core module $libc
    (memory (export "memory") 64)
    (global $bump (mut i32) (i32.const 4096))
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) (local $p i32)
      (local.set $p (i32.and (i32.add (global.get $bump) (i32.const 7)) (i32.const -8)))
      (global.set $bump (i32.add (local.get $p) (local.get 3)))
      (local.get $p)))
  (core instance $libc (instantiate $libc))
  (alias export $preopens "get-directories" (func $get_dirs))
  (core func $get_dirs_l (canon lower (func $get_dirs) (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
  (core module $main
    (import "libc" "memory" (memory 64))
    (import "host" "get-dirs" (func $get_dirs (param i32)))
    (func (export "run") (result i32) (local $i i32)
      (loop $l
        (call $get_dirs (i32.const 16))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br_if $l (i32.lt_u (local.get $i) (i32.const {n}))))
      (i32.const 0)))
  (core instance $main (instantiate $main (with "libc" (instance $libc)) (with "host" (instance (export "get-dirs" (func $get_dirs_l))))))
  (func $run (result (result)) (canon lift (core func $main "run")))
  (instance $inst (export "run" (func $run)))
  (export "wasi:cli/run@0.2.0" (instance $inst)))"#
    );
    wat::parse_str(wat).expect("valid component wat")
}

/// A component with one enormous straight-line function: cheap to ship, slow to compile.
pub fn slow_to_compile_component(ops: usize) -> Vec<u8> {
    let body = "i32.const 1 i32.add ".repeat(ops);
    simple_component(&format!("i32.const 0 {body} drop i32.const 0"), 1)
}
