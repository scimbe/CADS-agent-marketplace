use std::{env, fs, path::Path};

// Embeds every blueprints/*/blueprint.json as a (id-dir, json) table.
fn main() {
    let root = Path::new(&env::var("CARGO_MANIFEST_DIR").unwrap()).join("../../blueprints");
    println!("cargo:rerun-if-changed={}", root.display());
    let mut dirs: Vec<_> = fs::read_dir(&root)
        .map(|d| d.filter_map(|e| e.ok()).map(|e| e.path()).collect())
        .unwrap_or_default();
    dirs.sort();
    let mut out = String::from("pub const EMBEDDED: &[&str] = &[\n");
    for d in dirs {
        let f = d.join("blueprint.json");
        if f.is_file() {
            println!("cargo:rerun-if-changed={}", f.display());
            let p = fs::canonicalize(&f).unwrap();
            out.push_str(&format!("    include_str!({:?}),\n", p.to_string_lossy()));
        }
    }
    out.push_str("];\n");
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("embedded.rs"), out).unwrap();
}
