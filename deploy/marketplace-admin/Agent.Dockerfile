# The Browser-Plane agent for this deploy, built from the standalone scimbe/ct-agent repo.
# Copied verbatim (shape + CT_AGENT_REF pin) from CADS-webconference-demo/Agent.Dockerfile --
# same operator, same convention, keep the pin in lockstep with that file's own comment history
# rather than drifting a second independent copy.
FROM rust:1-slim-bookworm AS builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*
ARG CT_AGENT_REF=eb4de4d2427ce51e301c0bf31582cce4bbaa097c
RUN git clone https://github.com/scimbe/ct-agent.git /build && cd /build && git checkout "${CT_AGENT_REF}"
WORKDIR /build
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    cargo build --release --locked -p ct-agent \
    && cp target/release/ct-agent /tmp/ct-agent

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /tmp/ct-agent /usr/local/bin/ct-agent
CMD ["ct-agent"]
