import asyncio
import json
import logging
import os
import re
import uuid

from aiohttp import ClientSession, ClientTimeout, web

LITELLM_BASE = os.environ.get("LITELLM_UPSTREAM", "http://litellm:4000")
PING_INTERVAL = float(os.environ.get("PING_INTERVAL_SECONDS", "7"))

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("heartbeat-proxy")

_SKIP_REQUEST_HEADERS = {"host", "content-length"}
_SKIP_RESPONSE_HEADERS = {"content-length", "transfer-encoding", "content-encoding", "connection"}


def _forward_headers(request: web.Request) -> dict:
    return {k: v for k, v in request.headers.items() if k.lower() not in _SKIP_REQUEST_HEADERS}


def _response_headers(upstream) -> dict:
    return {k: v for k, v in upstream.headers.items() if k.lower() not in _SKIP_RESPONSE_HEADERS}


def _sse_event(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()


def _normalized_path_qs(request: web.Request) -> str:
    """Collapse repeated leading slashes. Some older litellm client versions
    have a URL-joining bug that produces e.g. "////v1/messages" -- left as
    the raw path, that 404s (poisoning this deployment's health in litellm's
    router for every OTHER caller sharing it, not just the buggy client),
    instead of relaying correctly like any other request."""
    path = re.sub(r"^/+", "/", request.path)
    qs = request.query_string
    return f"{path}?{qs}" if qs else path


async def proxy_passthrough(request: web.Request) -> web.StreamResponse:
    """Transparent reverse proxy. Used for everything except streaming /v1/messages
    calls, which is the only path that needs the heartbeat/message_start logic."""
    body = await request.read()
    return await _relay(request, body)


async def _relay(request: web.Request, body: bytes) -> web.StreamResponse:
    url = LITELLM_BASE + _normalized_path_qs(request)
    session: ClientSession = request.app["session"]
    async with session.request(
        request.method, url, headers=_forward_headers(request), data=body, allow_redirects=False
    ) as upstream:
        resp = web.StreamResponse(status=upstream.status, headers=_response_headers(upstream))
        await resp.prepare(request)
        async for chunk in upstream.content.iter_any():
            await resp.write(chunk)
        await resp.write_eof()
        return resp


async def _emit_error_and_close(resp: web.StreamResponse, message: str) -> None:
    await resp.write(_sse_event("content_block_start", {
        "type": "content_block_start", "index": 0,
        "content_block": {"type": "text", "text": ""},
    }))
    await resp.write(_sse_event("content_block_delta", {
        "type": "content_block_delta", "index": 0,
        "delta": {"type": "text_delta", "text": f"[heartbeat-proxy] upstream error: {message}"},
    }))
    await resp.write(_sse_event("content_block_stop", {"type": "content_block_stop", "index": 0}))
    await resp.write(_sse_event("message_delta", {
        "type": "message_delta",
        "delta": {"stop_reason": "error"},
        "usage": {"input_tokens": 0, "output_tokens": 0},
    }))
    await resp.write(_sse_event("message_stop", {"type": "message_stop"}))


async def handle_messages(request: web.Request) -> web.StreamResponse:
    raw_body = await request.read()
    try:
        payload = json.loads(raw_body)
    except Exception:
        payload = {}

    if not payload.get("stream"):
        # Non-streaming calls complete in one shot -- no silent-wire window to
        # protect, just relay transparently.
        return await _relay(request, raw_body)

    model = payload.get("model", "unknown")
    msg_id = f"msg_{uuid.uuid4()}"

    resp = web.StreamResponse(
        status=200,
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
    await resp.prepare(request)

    # The actual fix: commit real payload bytes across the agent<->edge hop
    # immediately, instead of leaving it fully silent while Ollama loads or
    # swaps a model (the silent window is what gets a slow/blocked-UDP
    # origin's connection idle-dropped by an intermediate middlebox). We
    # synthesize message_start ourselves and drop litellm's real one when it
    # eventually arrives -- a client can only ever accept one, and this one
    # already committed the message id.
    await resp.write(_sse_event("message_start", {
        "type": "message_start",
        "message": {
            "id": msg_id,
            "type": "message",
            "role": "assistant",
            "content": [],
            "model": model,
            "stop_reason": None,
            "stop_sequence": None,
            "usage": {
                "input_tokens": 0, "output_tokens": 0,
                "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0,
            },
        },
    }))

    stop_pinging = asyncio.Event()

    async def ping_loop():
        while not stop_pinging.is_set():
            try:
                await asyncio.wait_for(stop_pinging.wait(), timeout=PING_INTERVAL)
            except asyncio.TimeoutError:
                try:
                    await resp.write(_sse_event("ping", {"type": "ping"}))
                except Exception:
                    return

    pinger = asyncio.ensure_future(ping_loop())
    url = LITELLM_BASE + _normalized_path_qs(request)
    session: ClientSession = request.app["session"]
    dropped_message_start = False

    # Only one local Ollama-backed model fits in this GPU's VRAM at a time.
    # Two concurrent requests for *different* local models race Ollama's
    # evict-then-load handshake -- one of them can fail outright ("model
    # failed to load, this may be due to resource limitations") instead of
    # cleanly serializing, which then trips litellm's router into a cooldown
    # for that deployment. Serialize all local-* requests through one gate;
    # the client still sees live pings while queued, so it doesn't look
    # stalled. Non-local (cloud) models are untouched -- they don't share
    # this GPU.
    ollama_lock = request.app["ollama_lock"] if model.startswith("local-") else None

    try:
        if ollama_lock is not None:
            await ollama_lock.acquire()
        async with session.post(url, headers=_forward_headers(request), data=raw_body) as upstream:
            stop_pinging.set()
            await pinger

            if upstream.status != 200:
                body = await upstream.read()
                log.warning("upstream %s returned %s: %s", url, upstream.status, body[:500])
                await _emit_error_and_close(resp, f"upstream {upstream.status}")
                await resp.write_eof()
                return resp

            buf = b""
            async for chunk in upstream.content.iter_any():
                buf += chunk
                while b"\n\n" in buf:
                    raw_event, buf = buf.split(b"\n\n", 1)
                    if not raw_event.strip():
                        continue
                    if not dropped_message_start and raw_event.startswith(b"event: message_start"):
                        dropped_message_start = True
                        continue
                    await resp.write(raw_event + b"\n\n")
            if buf.strip():
                await resp.write(buf)
    except Exception as e:
        log.exception("heartbeat-proxy stream failure for model=%s", model)
        stop_pinging.set()
        if not pinger.done():
            try:
                await pinger
            except Exception:
                pass
        try:
            await _emit_error_and_close(resp, str(e))
        except Exception:
            pass
    finally:
        stop_pinging.set()
        if not pinger.done():
            try:
                await pinger
            except Exception:
                pass
        if ollama_lock is not None and ollama_lock.locked():
            ollama_lock.release()
        await resp.write_eof()

    return resp


async def on_startup(app: web.Application) -> None:
    app["session"] = ClientSession(timeout=ClientTimeout(total=None))
    app["ollama_lock"] = asyncio.Lock()


async def on_cleanup(app: web.Application) -> None:
    await app["session"].close()


async def dispatch(request: web.Request) -> web.StreamResponse:
    """Single catch-all route: routing decisions use the *normalized* path,
    so a malformed multi-slash request still reaches handle_messages (with
    its SSE/heartbeat/GPU-lock logic intact) instead of silently falling
    through to plain passthrough -- see _normalized_path_qs."""
    path = re.sub(r"^/+", "/", request.path)
    if request.method == "POST" and path == "/v1/messages":
        return await handle_messages(request)
    return await proxy_passthrough(request)


def make_app() -> web.Application:
    app = web.Application(client_max_size=32 * 1024 * 1024)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    app.router.add_route("*", "/{tail:.*}", dispatch)
    return app


if __name__ == "__main__":
    web.run_app(make_app(), host="0.0.0.0", port=8080)
