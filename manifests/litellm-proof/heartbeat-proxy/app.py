"""heartbeat-proxy: a keepalive-emitting reverse proxy in front of litellm.

WHY THIS SIDECAR EXISTS
-----------------------
A streaming ``POST /v1/messages`` against a local Ollama-backed model can sit
fully silent for a long time while Ollama loads or swaps the model. That silent
window is exactly what gets a slow/blocked-UDP origin's connection idle-dropped
by an intermediate middlebox on the agent<->edge hop. This proxy commits real
payload bytes immediately (a synthesized ``message_start``) and then emits SSE
``ping`` events every ``PING_INTERVAL_SECONDS`` until litellm's response headers
arrive, so the wire is never quiet. Everything else -- every other route, every
method, non-streaming ``/v1/messages`` -- is relayed transparently.

STDLIB-ONLY CONSTRAINT
----------------------
The installer's guardrail scan (crates/installer-engine/src/guardrails.rs, rule
F.8, scimbe/ct-agent#183 phase 1) only accepts a ``build:`` that runs with
``network: none``. A Dockerfile that ``pip install``s anything therefore cannot
build. This module uses ONLY the Python 3.12 standard library: ``http.server``
(ThreadingHTTPServer) for the listening side, ``http.client`` for the upstream
hop, ``threading`` for the ping timer and the GPU gate. Do not add third-party
imports here; they will not be installable at build time.

Behaviour contract (kept identical to the previous aiohttp implementation):

* Catch-all reverse proxy to ``LITELLM_UPSTREAM`` (default ``http://litellm:4000``)
  for every route: method, path+query, headers (minus hop-by-hop), body,
  response status and response headers (minus hop-by-hop) are relayed and the
  response body is streamed through as it arrives.
* Leading slashes in the request path are collapsed before routing AND before
  relaying (see ``_normalized_path_qs``).
* ``POST /v1/messages`` with ``"stream": true`` gets the heartbeat treatment
  described above, an SSE-shaped error tail if the upstream fails, and all
  ``local-*`` models serialized through one process-wide gate.
* Request bodies are capped at 32 MiB (413 beyond that), listening on
  ``0.0.0.0:8080``, logging at INFO under the ``heartbeat-proxy`` logger.
"""

import http.client
import json
import logging
import os
import re
import signal
import sys
import threading
import uuid
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

LITELLM_BASE = os.environ.get("LITELLM_UPSTREAM", "http://litellm:4000")
PING_INTERVAL = float(os.environ.get("PING_INTERVAL_SECONDS", "7"))

# Same bound aiohttp's `client_max_size=32 * 1024 * 1024` enforced before.
MAX_BODY_BYTES = 32 * 1024 * 1024
READ_CHUNK = 64 * 1024

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("heartbeat-proxy")

# `host` and `content-length` were always dropped (the upstream hop gets its own). The
# connection-management (hop-by-hop) headers are dropped too: the client's TCP connection
# ends here, and the body is re-sent upstream with a fresh Content-Length, so forwarding
# e.g. `Transfer-Encoding: chunked` or `Expect: 100-continue` would describe a connection
# the upstream is not on.
_SKIP_REQUEST_HEADERS = {
    "host", "content-length", "transfer-encoding", "connection", "keep-alive",
    "proxy-connection", "te", "trailer", "upgrade", "expect",
}
_SKIP_RESPONSE_HEADERS = {"content-length", "transfer-encoding", "content-encoding", "connection"}

_UPSTREAM = urlsplit(LITELLM_BASE)
if _UPSTREAM.scheme not in ("http", "https") or not _UPSTREAM.hostname:
    raise SystemExit(f"LITELLM_UPSTREAM must be http(s)://host[:port], got {LITELLM_BASE!r}")
_UPSTREAM_PORT = _UPSTREAM.port or (443 if _UPSTREAM.scheme == "https" else 80)
_UPSTREAM_HOST_HEADER = _UPSTREAM.netloc

# Only one local Ollama-backed model fits in this GPU's VRAM at a time. Two concurrent
# requests for *different* local models race Ollama's evict-then-load handshake -- one of
# them can fail outright ("model failed to load, this may be due to resource limitations")
# instead of cleanly serializing, which then trips litellm's router into a cooldown for
# that deployment. Serialize all local-* requests through one gate; the client still sees
# live pings while queued, so it doesn't look stalled. Non-local (cloud) models are
# untouched -- they don't share this GPU.
_OLLAMA_LOCK = threading.Lock()


def _sse_event(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()


def _open_upstream() -> http.client.HTTPConnection:
    # One connection per relayed request, no timeout -- the previous implementation used a
    # pooled session with `ClientTimeout(total=None)`; the absence of any deadline is the
    # behaviour that matters (a model load may legitimately take minutes).
    if _UPSTREAM.scheme == "https":
        return http.client.HTTPSConnection(_UPSTREAM.hostname, _UPSTREAM_PORT, timeout=None)
    return http.client.HTTPConnection(_UPSTREAM.hostname, _UPSTREAM_PORT, timeout=None)


def _send_upstream(method: str, path_qs: str, headers: list, body: bytes) -> tuple:
    """Open the upstream hop and return (connection, response) once the response HEADERS
    have arrived. The body is streamed by the caller."""
    conn = _open_upstream()
    try:
        conn.putrequest(method, path_qs, skip_host=True, skip_accept_encoding=True)
        conn.putheader("Host", _UPSTREAM_HOST_HEADER)
        for k, v in headers:
            conn.putheader(k, v)
        conn.putheader("Content-Length", str(len(body)))
        conn.endheaders(body if body else None)
        return conn, conn.getresponse()
    except Exception:
        conn.close()
        raise


class _BodyDecoder:
    """Streaming inflater for gzip/deflate response bodies. The previous implementation
    (aiohttp, `auto_decompress=True`) handed the client DEcompressed bytes and dropped the
    `Content-Encoding` header; this reproduces that. Any other encoding is relayed as-is
    WITH its header (the old code could not decode it either, it just errored)."""

    def __init__(self, encoding: str):
        enc = (encoding or "").strip().lower()
        self.passthrough = enc not in ("gzip", "x-gzip", "deflate")
        if self.passthrough:
            self._z = None
        elif enc == "deflate":
            self._z = zlib.decompressobj(zlib.MAX_WBITS)
            self._raw_deflate_fallback = True
        else:
            self._z = zlib.decompressobj(16 + zlib.MAX_WBITS)
            self._raw_deflate_fallback = False

    def feed(self, chunk: bytes) -> bytes:
        if self._z is None:
            return chunk
        try:
            return self._z.decompress(chunk)
        except zlib.error:
            if self._raw_deflate_fallback:
                # Some servers send raw deflate without the zlib wrapper (aiohttp tolerates
                # both); retry the same bytes as a raw stream once.
                self._raw_deflate_fallback = False
                self._z = zlib.decompressobj(-zlib.MAX_WBITS)
                return self._z.decompress(chunk)
            raise

    def finish(self) -> bytes:
        return b"" if self._z is None else self._z.flush()


class HeartbeatHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "heartbeat-proxy"
    sys_version = ""

    # ---- listening-side plumbing --------------------------------------------------------

    def log_message(self, fmt, *args):  # access log through our logger, not raw stderr
        log.info("%s %s", self.address_string(), fmt % args)

    def _normalized_path(self) -> str:
        return re.sub(r"^/+", "/", self.path.split("?", 1)[0])

    def _normalized_path_qs(self) -> str:
        """Collapse repeated leading slashes. Some older litellm client versions have a
        URL-joining bug that produces e.g. "////v1/messages" -- left as the raw path, that
        404s (poisoning this deployment's health in litellm's router for every OTHER caller
        sharing it, not just the buggy client), instead of relaying correctly like any other
        request."""
        path, sep, qs = self.path.partition("?")
        path = re.sub(r"^/+", "/", path)
        return f"{path}?{qs}" if sep else path

    def _forward_headers(self) -> list:
        return [(k, v) for k, v in self.headers.items() if k.lower() not in _SKIP_REQUEST_HEADERS]

    def _read_body(self) -> bytes:
        """Read the full request body: Content-Length or chunked. Raises ValueError with an
        HTTP status as its first arg when the body is malformed or too large."""
        te = (self.headers.get("Transfer-Encoding") or "").lower()
        if "chunked" in te:
            parts = []
            total = 0
            while True:
                line = self.rfile.readline(65537)
                if not line:
                    raise ValueError(400, "truncated chunked body")
                try:
                    size = int(line.split(b";", 1)[0].strip(), 16)
                except ValueError:
                    raise ValueError(400, "malformed chunk size") from None
                if size == 0:
                    # consume optional trailers up to the blank line
                    while True:
                        trailer = self.rfile.readline(65537)
                        if trailer in (b"\r\n", b"\n", b""):
                            break
                    break
                total += size
                if total > MAX_BODY_BYTES:
                    raise ValueError(413, "request body too large")
                chunk = self.rfile.read(size)
                if len(chunk) != size:
                    raise ValueError(400, "truncated chunk")
                parts.append(chunk)
                self.rfile.readline(65537)  # CRLF after the chunk data
            return b"".join(parts)
        raw_len = self.headers.get("Content-Length")
        if raw_len is None:
            return b""
        try:
            length = int(raw_len)
        except ValueError:
            raise ValueError(400, "malformed Content-Length") from None
        if length < 0:
            raise ValueError(400, "malformed Content-Length")
        if length > MAX_BODY_BYTES:
            raise ValueError(413, "request body too large")
        body = self.rfile.read(length)
        if len(body) != length:
            raise ValueError(400, "truncated body")
        return body

    def _begin_response(self, status: int, headers, has_body: bool = True) -> None:
        """Send status + headers. Bodies are streamed (upstream length is never trusted or
        relayed, exactly as before): chunked for HTTP/1.1 clients, close-delimited for
        HTTP/1.0 ones."""
        self._write_lock = threading.Lock()
        self._chunked = False
        self._has_body = has_body
        self.send_response_only(status)
        seen = set()
        for k, v in headers:
            seen.add(k.lower())
            self.send_header(k, v)
        if "date" not in seen:
            self.send_header("Date", self.date_time_string())
        if "server" not in seen:
            self.send_header("Server", self.server_version)
        if has_body:
            if self.request_version == "HTTP/1.1":
                self._chunked = True
                self.send_header("Transfer-Encoding", "chunked")
            else:
                self.close_connection = True
        self.end_headers()
        self.wfile.flush()

    def _write(self, data: bytes) -> None:
        if not data or not self._has_body:
            return
        with self._write_lock:
            if self._chunked:
                self.wfile.write(b"%x\r\n%s\r\n" % (len(data), data))
            else:
                self.wfile.write(data)
            self.wfile.flush()

    def _write_eof(self) -> None:
        with self._write_lock:
            if self._chunked:
                self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()

    def _plain_error(self, status: int, message: str) -> None:
        body = message.encode()
        self._begin_response(status, [("Content-Type", "text/plain; charset=utf-8")])
        self._write(body)
        self._write_eof()

    # ---- routing --------------------------------------------------------------------------

    def dispatch(self) -> None:
        """Single catch-all route: routing decisions use the *normalized* path, so a
        malformed multi-slash request still reaches handle_messages (with its
        SSE/heartbeat/GPU-lock logic intact) instead of silently falling through to plain
        passthrough -- see _normalized_path_qs."""
        try:
            body = self._read_body()
        except ValueError as e:
            status, msg = e.args if len(e.args) == 2 else (400, "bad request")
            self._plain_error(status, msg)
            self.close_connection = True
            return
        if self.command == "POST" and self._normalized_path() == "/v1/messages":
            self.handle_messages(body)
        else:
            self.proxy_passthrough(body)

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = do_OPTIONS = dispatch

    # ---- transparent relay --------------------------------------------------------------

    def proxy_passthrough(self, body: bytes) -> None:
        """Transparent reverse proxy. Used for everything except streaming /v1/messages
        calls, which is the only path that needs the heartbeat/message_start logic."""
        self._relay(body)

    def _relay(self, body: bytes) -> None:
        url = LITELLM_BASE + self._normalized_path_qs()
        try:
            conn, upstream = _send_upstream(self.command, self._normalized_path_qs(), self._forward_headers(), body)
        except Exception as e:
            log.warning("upstream %s unreachable: %s", url, e)
            self._plain_error(502, f"[heartbeat-proxy] upstream unreachable: {e}")
            return
        try:
            decoder = _BodyDecoder(upstream.getheader("Content-Encoding", ""))
            headers = [(k, v) for k, v in upstream.getheaders() if k.lower() not in _SKIP_RESPONSE_HEADERS]
            if decoder.passthrough:
                enc = upstream.getheader("Content-Encoding")
                if enc:
                    headers.append(("Content-Encoding", enc))
            has_body = self.command != "HEAD" and upstream.status not in (204, 304) and upstream.status >= 200
            self._begin_response(upstream.status, headers, has_body=has_body)
            while True:
                chunk = upstream.read1(READ_CHUNK)
                if not chunk:
                    break
                self._write(decoder.feed(chunk))
            self._write(decoder.finish())
            self._write_eof()
        except Exception as e:
            # Mid-stream failure (client went away, upstream cut the connection): the status
            # line is already on the wire, so all that is left is to log and drop the socket.
            log.warning("relay of %s %s aborted: %s", self.command, url, e)
            self.close_connection = True
        finally:
            conn.close()

    # ---- the heartbeat path ---------------------------------------------------------------

    def _emit_error_and_close(self, message: str) -> None:
        self._write(_sse_event("content_block_start", {
            "type": "content_block_start", "index": 0,
            "content_block": {"type": "text", "text": ""},
        }))
        self._write(_sse_event("content_block_delta", {
            "type": "content_block_delta", "index": 0,
            "delta": {"type": "text_delta", "text": f"[heartbeat-proxy] upstream error: {message}"},
        }))
        self._write(_sse_event("content_block_stop", {"type": "content_block_stop", "index": 0}))
        self._write(_sse_event("message_delta", {
            "type": "message_delta",
            "delta": {"stop_reason": "error"},
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }))
        self._write(_sse_event("message_stop", {"type": "message_stop"}))

    def handle_messages(self, raw_body: bytes) -> None:
        try:
            payload = json.loads(raw_body)
        except Exception:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}

        if not payload.get("stream"):
            # Non-streaming calls complete in one shot -- no silent-wire window to protect,
            # just relay transparently.
            self._relay(raw_body)
            return

        model = payload.get("model", "unknown")
        if not isinstance(model, str):
            model = "unknown"
        msg_id = f"msg_{uuid.uuid4()}"

        self._begin_response(200, [
            ("Content-Type", "text/event-stream"),
            ("Cache-Control", "no-cache"),
            ("Connection", "keep-alive"),
        ])

        # The actual fix: commit real payload bytes across the agent<->edge hop immediately,
        # instead of leaving it fully silent while Ollama loads or swaps a model (the silent
        # window is what gets a slow/blocked-UDP origin's connection idle-dropped by an
        # intermediate middlebox). We synthesize message_start ourselves and drop litellm's
        # real one when it eventually arrives -- a client can only ever accept one, and this
        # one already committed the message id.
        self._write(_sse_event("message_start", {
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

        stop_pinging = threading.Event()

        def ping_loop():
            # Pings run from now until the upstream's response HEADERS arrive (the model
            # load window); once real events flow, the stream itself keeps the wire busy.
            while not stop_pinging.wait(PING_INTERVAL):
                try:
                    self._write(_sse_event("ping", {"type": "ping"}))
                except Exception:
                    return

        pinger = threading.Thread(target=ping_loop, name="ping-loop", daemon=True)
        pinger.start()

        def stop_pinger():
            stop_pinging.set()
            if pinger.is_alive():
                try:
                    pinger.join()
                except Exception:
                    pass

        url = LITELLM_BASE + self._normalized_path_qs()
        ollama_lock = _OLLAMA_LOCK if model.startswith("local-") else None
        conn = None
        dropped_message_start = False
        locked = False

        try:
            if ollama_lock is not None:
                ollama_lock.acquire()
                locked = True
            conn, upstream = _send_upstream("POST", self._normalized_path_qs(), self._forward_headers(), raw_body)
            stop_pinger()

            if upstream.status != 200:
                body = upstream.read()
                log.warning("upstream %s returned %s: %s", url, upstream.status, body[:500])
                self._emit_error_and_close(f"upstream {upstream.status}")
                return

            decoder = _BodyDecoder(upstream.getheader("Content-Encoding", ""))
            buf = b""
            while True:
                chunk = upstream.read1(READ_CHUNK)
                if not chunk:
                    break
                buf += decoder.feed(chunk)
                while b"\n\n" in buf:
                    raw_event, buf = buf.split(b"\n\n", 1)
                    if not raw_event.strip():
                        continue
                    if not dropped_message_start and raw_event.startswith(b"event: message_start"):
                        dropped_message_start = True
                        continue
                    self._write(raw_event + b"\n\n")
            buf += decoder.finish()
            if buf.strip():
                self._write(buf)
        except Exception as e:
            log.exception("heartbeat-proxy stream failure for model=%s", model)
            stop_pinger()
            try:
                self._emit_error_and_close(str(e))
            except Exception:
                pass
        finally:
            stop_pinger()
            if locked:
                ollama_lock.release()
            if conn is not None:
                conn.close()
            try:
                self._write_eof()
            except Exception:
                pass
            # A stream's end is the only reliable point to hand the connection back; the
            # previous implementation's write_eof() had the same "response is complete"
            # meaning. Close so an aborted stream can never be mistaken for a reusable one.
            self.close_connection = True


def make_server(host: str = "0.0.0.0", port: int = 8080) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), HeartbeatHandler)
    server.daemon_threads = True
    return server


def _exit_on_signal(signum, _frame):
    log.info("received signal %s, shutting down", signum)
    raise SystemExit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _exit_on_signal)
    signal.signal(signal.SIGINT, _exit_on_signal)
    with make_server() as srv:
        log.info("heartbeat-proxy listening on 0.0.0.0:8080 -> %s (ping every %ss)", LITELLM_BASE, PING_INTERVAL)
        try:
            srv.serve_forever()
        except SystemExit:
            pass
    sys.exit(0)
