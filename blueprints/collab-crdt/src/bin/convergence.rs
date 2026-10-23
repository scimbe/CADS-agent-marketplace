//! The acceptance benchmark: `convergence [--editors N] [--leaves L] [--ticks T] [--seed S]
//! [--loss P] [--dup P] [--offline P]`, defaults = `SimConfig::acceptance()` (10 000 editors).
//! Prints the report as JSON; exit code 1 unless every replica converged to the oracle and no phone
//! saw a stale register in its viewport.

use bp_collab_crdt::sim::{run, SimConfig};

fn main() {
    let mut cfg = SimConfig::acceptance();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        let v = args.get(i + 1).unwrap_or_else(|| die(&format!("{} needs a value", args[i])));
        match args[i].as_str() {
            "--editors" => cfg.editors = num(v),
            "--leaves" => cfg.leaves = num(v),
            "--ticks" => cfg.ticks = num(v),
            "--seed" => cfg.seed = num(v),
            "--op-prob" => cfg.op_prob = num(v),
            "--loss" => cfg.loss_prob = num(v),
            "--dup" => cfg.dup_prob = num(v),
            "--offline" => cfg.offline_prob = num(v),
            "--shapes" => cfg.initial_shapes = num(v),
            other => die(&format!("unknown option {other}")),
        }
        i += 2;
    }
    if cfg.editors == 0 || cfg.leaves == 0 || cfg.leaves > cfg.editors {
        die("need 0 < leaves <= editors");
    }
    let r = run(&cfg);
    let mut out = serde_json::to_value(&r).unwrap();
    out["wall_ms"] = (r.wall_ms as u64).into();
    out["peak_rss_mb"] = peak_rss_mb().into();
    out["config"] = serde_json::to_value(&cfg).unwrap();
    println!("{}", serde_json::to_string_pretty(&out).unwrap());
    if !(r.converged && r.equals_oracle && r.viewport_registers_stale == 0) {
        std::process::exit(1);
    }
}

fn num<T: std::str::FromStr>(s: &str) -> T {
    s.parse().unwrap_or_else(|_| die(&format!("not a number: {s}")))
}

fn die(msg: &str) -> ! {
    eprintln!("convergence: {msg}");
    std::process::exit(2)
}

/// Peak resident memory from /proc (Linux); 0 elsewhere.
fn peak_rss_mb() -> u64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| s.lines().find(|l| l.starts_with("VmHWM:")).and_then(|l| l.split_whitespace().nth(1)?.parse::<u64>().ok()))
        .map_or(0, |kb| kb / 1024)
}
