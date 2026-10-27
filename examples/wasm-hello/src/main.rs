//! `wasm-hello`: the smallest useful `InstallerKind::Wasm` payload.
//!
//! ```text
//! wasm-hello <name>            writes /work/hello.txt ("hello, <name>") and prints it to stdout
//! wasm-hello --try-open <path> tries to create <path>; exit 0 if that worked, 3 if it was refused
//! ```
//! The second form is what the sandbox tests use to prove a path outside the preopen is unreachable.
//! Only `std` is used, so the same source also builds and runs natively for a quick check.

use std::io::Write;
use std::process::ExitCode;

const OUT_FILE: &str = "/work/hello.txt";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [flag, path] if flag == "--try-open" => match std::fs::File::create(path) {
            Ok(mut f) => {
                let _ = f.write_all(b"escaped");
                println!("opened {path}");
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("refused {path}: {e}");
                ExitCode::from(3)
            }
        },
        [name] => {
            let line = format!("hello, {name}");
            match std::fs::write(OUT_FILE, &line) {
                Ok(()) => {
                    println!("{line}");
                    ExitCode::SUCCESS
                }
                Err(e) => {
                    eprintln!("cannot write {OUT_FILE}: {e}");
                    ExitCode::from(2)
                }
            }
        }
        _ => {
            eprintln!("usage: wasm-hello <name> | --try-open <path>");
            ExitCode::from(64)
        }
    }
}
