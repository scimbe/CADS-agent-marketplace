//! `collab-relay --listen ADDR [--upstream ADDR] [--tick-ms N] [--buffer N]`
//!
//! Without `--upstream` this is a root relay (sequences); with it, a leaf that mirrors the root.
//! It never holds a document key: payloads stay sealed end to end. Behind bunsenbrenner, `ADDR` is the
//! local port ct-agent forwards over the A2A channel; without it, any reachable address.

use bp_collab_crdt::net::{RelayConfig, RelayServer};
use std::time::Duration;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let mut cfg = RelayConfig::default();
    let mut listen = "127.0.0.1:7400".to_string();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        let v = args.get(i + 1).cloned().unwrap_or_default();
        match args[i].as_str() {
            "--listen" => listen = v,
            "--upstream" => cfg.upstream = Some(v.parse().map_err(|e| invalid(format!("--upstream: {e}")))?),
            "--tick-ms" => cfg.tick = Duration::from_millis(v.parse().map_err(|e| invalid(format!("--tick-ms: {e}")))?),
            "--buffer" => cfg.buffer = v.parse().map_err(|e| invalid(format!("--buffer: {e}")))?,
            other => return Err(invalid(format!("unknown option {other}"))),
        }
        i += 2;
    }
    let listener = tokio::net::TcpListener::bind(&listen).await?;
    eprintln!(
        "collab-relay: {} on {}",
        if cfg.upstream.is_some() { "leaf" } else { "root" },
        listener.local_addr()?
    );
    RelayServer::new(cfg).serve(listener).await
}

fn invalid(msg: String) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidInput, msg)
}
