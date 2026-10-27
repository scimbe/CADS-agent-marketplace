# Builds crates/registry's `registry` binary (Phase 3) for the Phase 4 admin-dashboard deploy.
# Build context must be the repo root (../.. from this file) so this can reach the workspace
# Cargo.toml/Cargo.lock and the other workspace crates registry depends on (manifest-core,
# installer-engine) as path dependencies.
# 1.97: the shared Cargo.lock contains wasmtime 50 (installer-engine feature `wasm`, not built
# here: registry uses default-features = false), whose manifests need a recent cargo to resolve.
FROM rust:1.97 AS build
WORKDIR /src
COPY . .
RUN cargo build --release -p registry

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/registry /usr/local/bin/registry
ENTRYPOINT ["/usr/local/bin/registry"]
