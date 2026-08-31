# Reconstructed 2026-08-31 -- the live cads-marketplace-p3-registry image had no committed
# Dockerfile to rebuild from (found via `docker history`, matched exactly here). Build from the
# repo root: `docker build -f crates/registry/Dockerfile -t cads-marketplace-p3-registry:latest .`
# after `cargo build --release -p registry`.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY target/release/registry /usr/local/bin/registry
ENTRYPOINT ["/usr/local/bin/registry"]
