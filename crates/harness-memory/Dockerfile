# Minimal runtime image for the marketplace#39 harness-memory service. Build the release binary
# on the host first (`cargo build --release -p harness-memory`), then this Dockerfile just
# packages it -- no in-container Rust toolchain. Mirrors crates/registry/Dockerfile's pattern.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY target/release/harness-memory /usr/local/bin/harness-memory
ENTRYPOINT ["/usr/local/bin/harness-memory"]
