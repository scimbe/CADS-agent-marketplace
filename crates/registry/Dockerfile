# Minimal runtime image for the Phase 3 marketplace registry. Build the release binary on the
# host first (`cargo build --release -p registry`), then this Dockerfile just packages it -- no
# in-container Rust toolchain, matching how the currently-deployed image was originally built
# (reconstructed from `docker history`, checked in here for reproducibility since no Dockerfile
# previously existed in the repo).
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY target/release/registry /usr/local/bin/registry
ENTRYPOINT ["/usr/local/bin/registry"]
