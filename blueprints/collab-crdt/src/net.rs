//! The relay over TCP: a root that sequences, leaves that mirror it, and the client side.
//!
//! The transport is a plain byte stream on purpose. Behind bunsenbrenner, a relay listens on a local
//! port that ct-agent forwards over an A2A channel (the composition manifest wires that edge), and a
//! client connects to its own ct-agent's local port; without bunsenbrenner, the same binaries talk
//! TCP directly or through any TLS/QUIC tunnel. Changing provider is changing an address.
//!
//! Messages: `len u32 | tag u8 | body`, at most [`MAX_MESSAGE`] bytes. A tile list is `count u32 |
//! u32...`; an empty list means every tile.
//!
//! - `Hello`     doc id (16) | token (32) | after (u64) | me (u64) | relay (u8) | tiles: join, receive
//!   the wanted tiles after `after`; `me` is the replica id (its own frames always come back, as
//!   acknowledgement); a downstream relay sets `relay` and gets the entering-shape states too
//! - `Submit`    frames: writes for the next tick
//! - `Subscribe` tiles: replace the real-time subscription (the viewport moved)
//! - `Fetch`     req (u32) | after (u64) | tiles: a compacted catch-up on demand (background sync,
//!   newly visible tiles); answered by `CatchUp` with the same `req`
//! - `CatchUp`   req (u32) | upto (u64) | last (u8) | frames: the compacted log, in chunks; `req` 0
//!   is the relay's own (on join, or after the subscriber fell behind)
//! - `Batch`     seq (u64) | frames | routes | entering: one sequenced tick, filtered to the
//!   subscription -- sent even when the filtered part is empty, so a lost batch is still a visible
//!   gap; `routes` (the relay's tile per frame) and `entering` (shapes that moved tiles, with their
//!   state) only to relays, which filter for their own subscribers
//! - `Error`     text, then the connection closes
//!
//! A subscriber that falls behind the broadcast buffer (slow phone, bad cell) is not buffered without
//! bound: it gets a compacted catch-up instead, which is never larger than the document.

use crate::relay::{Batch, Entering, Frame, Relay, TileSet, Tiles, TILE_NONE};
use crate::stamp::Stamp;
use crate::wire::{decode_frame, encode_frame, WireFrame};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc};

pub const MAX_MESSAGE: usize = 8 * 1024 * 1024;
const CATCH_UP_CHUNK: usize = 2048;
const MAX_FRAMES_PER_SUBMIT: usize = 4096;
const MAX_TILES: usize = 4096;

const HELLO: u8 = 1;
const SUBMIT: u8 = 2;
const CATCH_UP: u8 = 3;
const BATCH: u8 = 4;
const ERROR: u8 = 5;
const SUBSCRIBE: u8 = 6;
const FETCH: u8 = 7;

pub type DocId = [u8; 16];

#[derive(Debug, Clone, PartialEq)]
pub enum Msg {
    Hello { doc: DocId, token: [u8; 32], after: u64, me: u64, relay: bool, tiles: Vec<u32> },
    Submit(Vec<WireFrame>),
    Subscribe(Vec<u32>),
    Fetch { req: u32, after: u64, tiles: Vec<u32> },
    CatchUp { req: u32, upto: u64, last: bool, frames: Vec<WireFrame> },
    Batch { seq: u64, frames: Vec<WireFrame>, routes: Vec<Tiles>, entering: Vec<Entering<Vec<u8>>> },
    Error(String),
}

const MAX_ENTERING: usize = 4096;

fn put_routes(out: &mut Vec<u8>, routes: &[Tiles]) {
    out.extend_from_slice(&(routes.len() as u32).to_be_bytes());
    for r in routes {
        out.extend_from_slice(&r[0].to_be_bytes());
        out.extend_from_slice(&r[1].to_be_bytes());
    }
}

/// Returns the routes and the bytes read.
fn get_routes(b: &[u8]) -> Option<(Vec<Tiles>, usize)> {
    let n = u32::from_be_bytes(b.get(..4)?.try_into().ok()?) as usize;
    if n > MAX_FRAMES_PER_SUBMIT.max(CATCH_UP_CHUNK) {
        return None;
    }
    let body = b.get(4..4 + 8 * n)?;
    let routes = body
        .chunks(8)
        .map(|c| [u32::from_be_bytes(c[..4].try_into().unwrap()), u32::from_be_bytes(c[4..].try_into().unwrap())])
        .collect();
    Some((routes, 4 + 8 * n))
}

fn put_entering(out: &mut Vec<u8>, e: &[Entering<Vec<u8>>]) {
    out.extend_from_slice(&(e.len() as u32).to_be_bytes());
    for x in e {
        out.extend_from_slice(&x.from.to_be_bytes());
        out.extend_from_slice(&x.to.to_be_bytes());
        let mut body = Vec::new();
        put_frames(&mut body, &x.frames);
        out.extend_from_slice(&(body.len() as u32).to_be_bytes());
        out.extend_from_slice(&body);
    }
}

fn get_entering(b: &[u8]) -> Option<Vec<Entering<Vec<u8>>>> {
    let n = u32::from_be_bytes(b.get(..4)?.try_into().ok()?) as usize;
    if n > MAX_ENTERING {
        return None;
    }
    let mut at = 4;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let from = u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?);
        let to = u32::from_be_bytes(b.get(at + 4..at + 8)?.try_into().ok()?);
        let len = u32::from_be_bytes(b.get(at + 8..at + 12)?.try_into().ok()?) as usize;
        let frames = get_frames(b.get(at + 12..at + 12 + len)?)?;
        out.push(Entering { from, to, frames });
        at += 12 + len;
    }
    (at == b.len()).then_some(out)
}

/// Frames are self-delimiting; returns the frames and the bytes read (for a list followed by more).
fn get_frames_prefix(b: &[u8]) -> Option<(Vec<WireFrame>, usize)> {
    let n = u32::from_be_bytes(b.get(..4)?.try_into().ok()?) as usize;
    if n > MAX_FRAMES_PER_SUBMIT.max(CATCH_UP_CHUNK) {
        return None;
    }
    let mut at = 4;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let (f, used) = decode_frame(b.get(at..)?)?;
        at += used;
        out.push(f);
    }
    Some((out, at))
}

fn put_tiles(out: &mut Vec<u8>, tiles: &[u32]) {
    out.extend_from_slice(&(tiles.len() as u32).to_be_bytes());
    for t in tiles {
        out.extend_from_slice(&t.to_be_bytes());
    }
}

/// Returns the tiles and the bytes read.
fn get_tiles(b: &[u8]) -> Option<(Vec<u32>, usize)> {
    let n = u32::from_be_bytes(b.get(..4)?.try_into().ok()?) as usize;
    if n > MAX_TILES {
        return None;
    }
    let body = b.get(4..4 + 4 * n)?;
    Some((body.chunks(4).map(|c| u32::from_be_bytes(c.try_into().unwrap())).collect(), 4 + 4 * n))
}

fn put_frames(out: &mut Vec<u8>, frames: &[WireFrame]) {
    out.extend_from_slice(&(frames.len() as u32).to_be_bytes());
    for f in frames {
        encode_frame(f, out);
    }
}

fn get_frames(b: &[u8]) -> Option<Vec<WireFrame>> {
    let n = u32::from_be_bytes(b.get(..4)?.try_into().ok()?) as usize;
    if n > MAX_FRAMES_PER_SUBMIT.max(CATCH_UP_CHUNK) {
        return None;
    }
    let mut at = 4;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let (f, used) = decode_frame(b.get(at..)?)?;
        at += used;
        out.push(f);
    }
    (at == b.len()).then_some(out)
}

impl Msg {
    pub fn encode(&self) -> Vec<u8> {
        let mut body = Vec::new();
        let tag = match self {
            Msg::Hello { doc, token, after, me, relay, tiles } => {
                body.extend_from_slice(doc);
                body.extend_from_slice(token);
                body.extend_from_slice(&after.to_be_bytes());
                body.extend_from_slice(&me.to_be_bytes());
                body.push(*relay as u8);
                put_tiles(&mut body, tiles);
                HELLO
            }
            Msg::Submit(f) => {
                put_frames(&mut body, f);
                SUBMIT
            }
            Msg::Subscribe(tiles) => {
                put_tiles(&mut body, tiles);
                SUBSCRIBE
            }
            Msg::Fetch { req, after, tiles } => {
                body.extend_from_slice(&req.to_be_bytes());
                body.extend_from_slice(&after.to_be_bytes());
                put_tiles(&mut body, tiles);
                FETCH
            }
            Msg::CatchUp { req, upto, last, frames } => {
                body.extend_from_slice(&req.to_be_bytes());
                body.extend_from_slice(&upto.to_be_bytes());
                body.push(*last as u8);
                put_frames(&mut body, frames);
                CATCH_UP
            }
            Msg::Batch { seq, frames, routes, entering } => {
                body.extend_from_slice(&seq.to_be_bytes());
                put_frames(&mut body, frames);
                put_routes(&mut body, routes);
                put_entering(&mut body, entering);
                BATCH
            }
            Msg::Error(t) => {
                body.extend_from_slice(t.as_bytes());
                ERROR
            }
        };
        let mut out = Vec::with_capacity(5 + body.len());
        out.extend_from_slice(&((body.len() + 1) as u32).to_be_bytes());
        out.push(tag);
        out.extend_from_slice(&body);
        out
    }

    pub fn decode(tag: u8, b: &[u8]) -> Option<Msg> {
        let u64_at = |at: usize| b.get(at..at + 8).map(|x| u64::from_be_bytes(x.try_into().unwrap()));
        let u32_at = |at: usize| b.get(at..at + 4).map(|x| u32::from_be_bytes(x.try_into().unwrap()));
        let tiles_at = |at: usize| get_tiles(b.get(at..)?).filter(|(_, n)| at + n == b.len()).map(|(t, _)| t);
        Some(match tag {
            HELLO => Msg::Hello {
                doc: b.get(..16)?.try_into().ok()?,
                token: b.get(16..48)?.try_into().ok()?,
                after: u64_at(48)?,
                me: u64_at(56)?,
                relay: *b.get(64)? != 0,
                tiles: tiles_at(65)?,
            },
            SUBMIT => Msg::Submit(get_frames(b)?),
            SUBSCRIBE => Msg::Subscribe(tiles_at(0)?),
            FETCH => Msg::Fetch { req: u32_at(0)?, after: u64_at(4)?, tiles: tiles_at(12)? },
            CATCH_UP => Msg::CatchUp { req: u32_at(0)?, upto: u64_at(4)?, last: *b.get(12)? != 0, frames: get_frames(b.get(13..)?)? },
            BATCH => {
                let (frames, n) = get_frames_prefix(b.get(8..)?)?;
                let (routes, m) = get_routes(b.get(8 + n..)?)?;
                if !routes.is_empty() && routes.len() != frames.len() {
                    return None;
                }
                Msg::Batch { seq: u64_at(0)?, frames, routes, entering: get_entering(b.get(8 + n + m..)?)? }
            }
            ERROR => Msg::Error(String::from_utf8_lossy(b).into_owned()),
            _ => return None,
        })
    }
}

pub async fn read_msg(r: &mut OwnedReadHalf) -> std::io::Result<Option<Msg>> {
    let mut len = [0u8; 4];
    match r.read_exact(&mut len).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let n = u32::from_be_bytes(len) as usize;
    if n == 0 || n > MAX_MESSAGE {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "message length out of bounds"));
    }
    let mut buf = vec![0u8; n];
    r.read_exact(&mut buf).await?;
    Msg::decode(buf[0], &buf[1..])
        .map(Some)
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "malformed message"))
}

/// One document on this relay.
struct DocState {
    relay: Mutex<Relay<Vec<u8>>>,
    tx: broadcast::Sender<Arc<Batch<Vec<u8>>>>,
    token_hash: [u8; 32],
    /// Leaf mode: writes collected for the upstream, sent once per tick.
    up: Option<mpsc::UnboundedSender<Vec<WireFrame>>>,
}

#[derive(Clone)]
pub struct RelayConfig {
    pub tick: Duration,
    /// Leaf mode: mirror this root (or another leaf) instead of sequencing locally.
    pub upstream: Option<SocketAddr>,
    /// Broadcast buffer per document, in batches; a subscriber further behind gets a catch-up.
    pub buffer: usize,
}

impl Default for RelayConfig {
    fn default() -> Self {
        RelayConfig { tick: Duration::from_millis(50), upstream: None, buffer: 256 }
    }
}

pub struct RelayServer {
    cfg: RelayConfig,
    docs: Mutex<HashMap<DocId, Arc<DocState>>>,
}

fn token_hash(t: &[u8; 32]) -> [u8; 32] {
    Sha256::digest(t).into()
}

fn ct_eq(a: &[u8; 32], b: &[u8; 32]) -> bool {
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl RelayServer {
    pub fn new(cfg: RelayConfig) -> Arc<RelayServer> {
        Arc::new(RelayServer { cfg, docs: Mutex::new(HashMap::new()) })
    }

    /// Accept connections until the listener fails.
    pub async fn serve(self: Arc<Self>, listener: TcpListener) -> std::io::Result<()> {
        loop {
            let (sock, _) = listener.accept().await?;
            sock.set_nodelay(true)?;
            let me = self.clone();
            tokio::spawn(async move {
                let _ = me.connection(sock).await;
            });
        }
    }

    /// The first `Hello` for a document registers its token (the document is created by its first
    /// member); every later connection must present the same token. In a CADS deployment only
    /// channel members reach the relay at all; the token separates documents of different owners on
    /// one relay.
    fn doc(self: &Arc<Self>, id: DocId, token: &[u8; 32]) -> Option<Arc<DocState>> {
        let mut docs = self.docs.lock().unwrap();
        if let Some(d) = docs.get(&id) {
            return ct_eq(&d.token_hash, &token_hash(token)).then(|| d.clone());
        }
        let (tx, _) = broadcast::channel(self.cfg.buffer);
        let up = self.cfg.upstream.map(|addr| {
            let (utx, urx) = mpsc::unbounded_channel();
            (addr, utx, urx)
        });
        let state = Arc::new(DocState {
            relay: Mutex::new(Relay::default()),
            tx,
            token_hash: token_hash(token),
            up: up.as_ref().map(|(_, utx, _)| utx.clone()),
        });
        docs.insert(id, state.clone());
        match up {
            None => {
                tokio::spawn(sequencer(state.clone(), self.cfg.tick));
            }
            Some((addr, _, urx)) => {
                tokio::spawn(mirror(state.clone(), addr, id, *token, urx, self.cfg.tick));
            }
        }
        Some(state)
    }

    async fn connection(self: Arc<Self>, sock: TcpStream) -> std::io::Result<()> {
        let (mut r, mut w) = sock.into_split();
        let Some(Msg::Hello { doc, token, after, me, relay, tiles }) = read_msg(&mut r).await? else {
            w.write_all(&Msg::Error("expected hello".into()).encode()).await?;
            return Ok(());
        };
        let Some(state) = self.doc(doc, &token) else {
            w.write_all(&Msg::Error("wrong token for this document".into()).encode()).await?;
            return Ok(());
        };
        let mut wanted = TileSet::from_list(&tiles);
        let mut rx = state.tx.subscribe();
        let mut last = send_catch_up(&state, 0, after, &wanted, &mut w).await?;

        let (in_tx, mut in_rx) = mpsc::channel::<Msg>(64);
        let reader = tokio::spawn(async move {
            while let Ok(Some(m)) = read_msg(&mut r).await {
                if in_tx.send(m).await.is_err() {
                    break;
                }
            }
        });
        let result = async {
            loop {
                tokio::select! {
                    m = in_rx.recv() => match m {
                        Some(Msg::Submit(frames)) => submit(&state, frames),
                        Some(Msg::Subscribe(tiles)) => wanted = TileSet::from_list(&tiles),
                        Some(Msg::Fetch { req, after, tiles }) => {
                            send_catch_up(&state, req, after, &TileSet::from_list(&tiles), &mut w).await?;
                        }
                        Some(_) => {
                            w.write_all(&Msg::Error("unexpected message".into()).encode()).await?;
                            return Ok(());
                        }
                        None => return Ok(()),
                    },
                    b = rx.recv() => match b {
                        Ok(b) if b.seq > last => {
                            if b.seq > last + 1 {
                                // A mirror's synthetic batch can skip numbers: fill from the log.
                                last = send_catch_up(&state, 0, last, &wanted, &mut w).await?;
                                if b.seq <= last { continue; }
                            }
                            let m = if relay {
                                Msg::Batch { seq: b.seq, frames: b.frames.clone(), routes: b.routes.clone(), entering: b.entering.clone() }
                            } else {
                                Msg::Batch { seq: b.seq, frames: b.filtered_for(&wanted, Some(me)), routes: Vec::new(), entering: Vec::new() }
                            };
                            w.write_all(&m.encode()).await?;
                            last = b.seq;
                        }
                        Ok(_) => {}
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            last = send_catch_up(&state, 0, last, &wanted, &mut w).await?;
                        }
                        Err(broadcast::error::RecvError::Closed) => return Ok(()),
                    },
                }
            }
        }
        .await;
        reader.abort();
        result
    }
}

fn submit(state: &DocState, frames: Vec<WireFrame>) {
    match &state.up {
        Some(up) => {
            let _ = up.send(frames);
        }
        None => {
            let mut relay = state.relay.lock().unwrap();
            for f in frames {
                relay.submit(f);
            }
        }
    }
}

async fn send_catch_up(state: &DocState, req: u32, after: u64, wanted: &TileSet, w: &mut OwnedWriteHalf) -> std::io::Result<u64> {
    let (upto, frames) = state.relay.lock().unwrap().catch_up_filtered(after, wanted);
    let mut chunks = frames.chunks(CATCH_UP_CHUNK).peekable();
    if chunks.peek().is_none() {
        w.write_all(&Msg::CatchUp { req, upto, last: true, frames: Vec::new() }.encode()).await?;
    }
    while let Some(c) = chunks.next() {
        let last = chunks.peek().is_none();
        w.write_all(&Msg::CatchUp { req, upto, last, frames: c.to_vec() }.encode()).await?;
    }
    Ok(upto)
}

/// Root mode: one batch per tick.
async fn sequencer(state: Arc<DocState>, tick: Duration) {
    let mut iv = tokio::time::interval(tick);
    iv.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        iv.tick().await;
        let b = state.relay.lock().unwrap().tick();
        if let Some(b) = b {
            let _ = state.tx.send(b);
        }
    }
}

/// Leaf mode: keep a connection upstream, mirror what comes down, send up what clients wrote
/// (coalesced per tick). Reconnects with backoff, resuming after the last mirrored sequence number.
async fn mirror(state: Arc<DocState>, addr: SocketAddr, doc: DocId, token: [u8; 32], mut up: mpsc::UnboundedReceiver<Vec<WireFrame>>, tick: Duration) {
    let mut backoff = Duration::from_millis(100);
    let mut held: HashMap<u128, WireFrame> = HashMap::new();
    loop {
        let after = state.relay.lock().unwrap().seq();
        let Ok(mut c) = Client::connect_as(addr, doc, token, after, 0, true, &[]).await else {
            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(Duration::from_secs(5));
            continue;
        };
        backoff = Duration::from_millis(100);
        let mut iv = tokio::time::interval(tick);
        // A catch-up arrives in chunks; downstream gets it as one batch once complete, otherwise a
        // client exactly one behind would take the last chunk for the whole step and miss the rest.
        let mut catching_up: Vec<WireFrame> = Vec::new();
        loop {
            tokio::select! {
                frames = up.recv() => match frames {
                    Some(frames) => for f in frames {
                        match held.get(&f.route) {
                            Some(cur) if cur.stamp >= f.stamp => {}
                            _ => { held.insert(f.route, f); }
                        }
                    },
                    None => return,
                },
                _ = iv.tick() => if !held.is_empty() {
                    let frames: Vec<WireFrame> = held.drain().map(|(_, f)| f).collect();
                    let mut ok = true;
                    for chunk in frames.chunks(MAX_FRAMES_PER_SUBMIT) {
                        if c.submit(chunk.to_vec()).await.is_err() { ok = false; break; }
                    }
                    if !ok {
                        // Lost with the connection; the clients resend what is not echoed.
                        break;
                    }
                },
                m = c.next() => match m {
                    Some(Msg::Batch { seq, frames, routes, entering }) => {
                        let routes = if routes.is_empty() { vec![[TILE_NONE; 2]; frames.len()] } else { routes };
                        let b = Batch { seq, frames, routes, entering };
                        state.relay.lock().unwrap().mirror(&b);
                        let _ = state.tx.send(Arc::new(b));
                    }
                    Some(Msg::CatchUp { upto, frames, last, .. }) => {
                        catching_up.extend(frames);
                        if last {
                            let frames = std::mem::take(&mut catching_up);
                            let b = Batch { seq: upto, routes: vec![[TILE_NONE; 2]; frames.len()], frames, entering: Vec::new() };
                            state.relay.lock().unwrap().mirror(&b);
                            let _ = state.tx.send(Arc::new(b));
                        }
                    }
                    _ => break,
                },
            }
        }
    }
}

/// The client side of the protocol. The application owns the [`crate::Doc`], the
/// [`crate::outbox::Outbox`] and the [`crate::wire::DocKey`]; this only moves frames.
pub struct Client {
    w: OwnedWriteHalf,
    rx: mpsc::Receiver<Msg>,
    reader: tokio::task::JoinHandle<()>,
}

impl Client {
    /// Join `doc` as replica `me`, receiving in real time the frames of `tiles` (empty: every tile)
    /// after `after`, plus the echo of its own writes.
    pub async fn connect(addr: SocketAddr, doc: DocId, token: [u8; 32], after: u64, me: u64, tiles: &[u32]) -> std::io::Result<Client> {
        Client::connect_as(addr, doc, token, after, me, false, tiles).await
    }

    async fn connect_as(addr: SocketAddr, doc: DocId, token: [u8; 32], after: u64, me: u64, relay: bool, tiles: &[u32]) -> std::io::Result<Client> {
        let sock = TcpStream::connect(addr).await?;
        sock.set_nodelay(true)?;
        let (mut r, mut w) = sock.into_split();
        w.write_all(&Msg::Hello { doc, token, after, me, relay, tiles: tiles.to_vec() }.encode()).await?;
        let (tx, rx) = mpsc::channel(256);
        let reader = tokio::spawn(async move {
            while let Ok(Some(m)) = read_msg(&mut r).await {
                if tx.send(m).await.is_err() {
                    break;
                }
            }
        });
        Ok(Client { w, rx, reader })
    }

    pub async fn submit(&mut self, frames: Vec<WireFrame>) -> std::io::Result<()> {
        for chunk in frames.chunks(MAX_FRAMES_PER_SUBMIT) {
            self.w.write_all(&Msg::Submit(chunk.to_vec()).encode()).await?;
        }
        Ok(())
    }

    /// The viewport moved: real time from now on only for these tiles.
    pub async fn subscribe(&mut self, tiles: &[u32]) -> std::io::Result<()> {
        self.w.write_all(&Msg::Subscribe(tiles.to_vec()).encode()).await
    }

    /// Ask for a compacted catch-up of `tiles` after `after`; the answer is `CatchUp` with `req`.
    pub async fn fetch(&mut self, req: u32, after: u64, tiles: &[u32]) -> std::io::Result<()> {
        self.w.write_all(&Msg::Fetch { req, after, tiles: tiles.to_vec() }.encode()).await
    }

    /// The next message from the relay; `None` when the connection is gone.
    pub async fn next(&mut self) -> Option<Msg> {
        self.rx.recv().await
    }

    pub fn try_next(&mut self) -> Option<Msg> {
        self.rx.try_recv().ok()
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        self.reader.abort();
    }
}

/// Convenience for applications and tests: the highest stamp in a list of frames.
pub fn max_stamp(frames: &[Frame<Vec<u8>>]) -> Stamp {
    frames.iter().map(|f| f.stamp).max().unwrap_or(Stamp::ZERO)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages_roundtrip() {
        let f = Frame { route: 7, stamp: Stamp { lamport: 1, replica: 2 }, tiles: [3, 4], payload: vec![1, 2, 3] };
        for m in [
            Msg::Hello { doc: [1; 16], token: [2; 32], after: 9, me: 4, relay: false, tiles: vec![1, 2] },
            Msg::Hello { doc: [1; 16], token: [2; 32], after: 9, me: 0, relay: true, tiles: vec![] },
            Msg::Submit(vec![f.clone()]),
            Msg::Subscribe(vec![5, 6, 7]),
            Msg::Fetch { req: 3, after: 1, tiles: vec![] },
            Msg::CatchUp { req: 2, upto: 4, last: true, frames: vec![f.clone(), f.clone()] },
            Msg::Batch { seq: 5, frames: vec![], routes: vec![], entering: vec![] },
            Msg::Batch {
                seq: 6,
                frames: vec![f.clone()],
                routes: vec![[3, 9]],
                entering: vec![Entering { from: 1, to: 2, frames: vec![f.clone(), f.clone()] }],
            },
            Msg::Error("no".into()),
        ] {
            let b = m.encode();
            assert_eq!(u32::from_be_bytes(b[..4].try_into().unwrap()) as usize, b.len() - 4);
            assert_eq!(Msg::decode(b[4], &b[5..]), Some(m));
        }
    }
}
