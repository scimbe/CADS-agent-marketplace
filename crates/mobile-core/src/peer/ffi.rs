//! The UniFFI surface: blocking calls for a background thread in the app. Contact JSON is a secret
//! the app keeps in Keystore/Keychain; this core persists nothing.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::runtime::Runtime;
use tokio::sync::mpsc;

use super::invite::{Contact, INVITE_TTL_DEFAULT_SECS};
use super::policy::{Envelope, Inbound, Policy};
use super::session::{connect, Established, DEAD_AFTER, HEARTBEAT};
use super::{cp, PeerConfig, PeerError};

fn bad(detail: &str) -> PeerError {
    PeerError::InvalidInput { detail: detail.into() }
}

fn parse(contact_json: &str) -> Result<Contact, PeerError> {
    serde_json::from_str(contact_json).map_err(|_| bad("contact"))
}

fn dump(c: &Contact) -> Result<String, PeerError> {
    serde_json::to_string(c).map_err(|_| bad("contact"))
}

#[derive(uniffi::Record)]
pub struct PeerInvite {
    /// Show as QR or hand to the share sheet.
    pub link: String,
    pub contact_json: String,
}

/// "Einladen".
#[uniffi::export]
pub fn peer_create_invite(config: PeerConfig, access_token: String) -> Result<PeerInvite, PeerError> {
    let inv = cp::create_invite(&config, &access_token, INVITE_TTL_DEFAULT_SECS)?;
    Ok(PeerInvite { link: inv.link, contact_json: dump(&inv.contact)? })
}

/// "Annehmen". Returns the contact JSON.
#[uniffi::export]
pub fn peer_accept_invite(config: PeerConfig, link: String) -> Result<String, PeerError> {
    dump(&cp::accept_invite(&config, &link)?)
}

/// "Trennen" and "Blockieren" on the control-plane side. The app then deletes the contact, and
/// with it the only copy of this phone's keys for this channel.
#[uniffi::export]
pub fn peer_disconnect(config: PeerConfig, contact_json: String) -> Result<(), PeerError> {
    cp::revoke_peer(&config, &parse(&contact_json)?)
}

#[derive(uniffi::Enum)]
pub enum PeerEvent {
    Text { text: String },
    App { ns: String, body_json: String },
    /// Ask the user. Answer with `approve` or `decline`.
    ApprovalNeeded { id: u64, capability: String },
    CapabilityResult { id: u64, ok: bool, data_json: Option<String> },
    PeerLeft,
    Closed,
}

impl From<Inbound> for PeerEvent {
    fn from(i: Inbound) -> Self {
        match i {
            Inbound::Text(text) => Self::Text { text },
            Inbound::App { ns, body } => Self::App { ns, body_json: body.to_string() },
            Inbound::ApprovalNeeded { id, cap } => Self::ApprovalNeeded { id, capability: cap },
            Inbound::CapResult { id, ok, data } => {
                Self::CapabilityResult { id, ok, data_json: data.map(|d| d.to_string()) }
            }
            Inbound::PeerLeft => Self::PeerLeft,
        }
    }
}

enum Out {
    Env(Envelope),
    Approve(u64, Value),
    Decline(u64),
}

/// The session loop. Ends with exactly one `Closed`: peer gone, network changed or heartbeat
/// silent for `dead_after`. The app then calls `PeerSession.connect` with the same contact; no new
/// invite is involved. Messages in flight at that moment are lost, nothing is buffered.
async fn pump<S: AsyncRead + AsyncWrite + Unpin + Send>(
    session: &mut Established<S>,
    mut policy: Policy,
    mut out_rx: mpsc::Receiver<Out>,
    ev_tx: mpsc::Sender<PeerEvent>,
    heartbeat: Duration,
    dead_after: Duration,
) {
    let mut beat = tokio::time::interval(heartbeat);
    beat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut last_heard = Instant::now();
    // Writes happen in arm bodies, never in a select condition: a write cut short would break
    // the Noise stream. Only `recv_raw` is cancelled, and it is cancel-safe.
    let closed = loop {
        tokio::select! {
            raw = session.recv_raw() => {
                last_heard = Instant::now();
                let judged = match raw {
                    Ok(r) => session.judge(&r, &mut policy).await,
                    Err(e) => Err(e),
                };
                match judged {
                    Ok(Some(i)) => { let _ = ev_tx.send(i.into()).await; }
                    Ok(None) => {}
                    Err(_) => break true,
                }
            }
            cmd = out_rx.recv() => {
                let env = match cmd {
                    Some(Out::Env(e)) => Ok(e),
                    Some(Out::Approve(id, data)) => policy.approve(id, data),
                    Some(Out::Decline(id)) => policy.decline(id),
                    None => break false,
                };
                if let Ok(e) = env {
                    if session.send(&e).await.is_err() {
                        break true;
                    }
                }
            }
            _ = beat.tick() => {
                if last_heard.elapsed() >= dead_after || session.send(&Envelope::Ping).await.is_err() {
                    break true;
                }
            }
        }
    };
    if closed {
        let _ = ev_tx.send(PeerEvent::Closed).await;
    }
}

/// A live session. `next_event` and the send calls may run on different threads.
#[derive(uniffi::Object)]
pub struct PeerSession {
    _runtime: Runtime,
    code: String,
    contact_json: String,
    out: mpsc::Sender<Out>,
    events: Mutex<mpsc::Receiver<PeerEvent>>,
}

#[uniffi::export]
impl PeerSession {
    /// Waits up to `wait_secs` for the other phone. `capabilities` and `namespaces` are this
    /// phone's allow-list for this session.
    #[uniffi::constructor]
    pub fn connect(
        config: PeerConfig,
        contact_json: String,
        capabilities: Vec<String>,
        namespaces: Vec<String>,
        wait_secs: u64,
    ) -> Result<Self, PeerError> {
        let mut contact = parse(&contact_json)?;
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .map_err(|_| bad("runtime"))?;
        let (out, out_rx) = mpsc::channel::<Out>(32);
        let (ev_tx, events) = mpsc::channel::<PeerEvent>(64);
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<([u8; 32], String), PeerError>>();
        let task_contact = contact.clone();
        runtime.spawn(async move {
            let mut session = match connect(&config, &task_contact, Duration::from_secs(wait_secs)).await {
                Ok(s) => {
                    let _ = ready_tx.send(Ok((s.peer_noise, s.code.clone())));
                    s
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                    return;
                }
            };
            let policy = Policy::new(&capabilities, &namespaces);
            pump(&mut session, policy, out_rx, ev_tx, HEARTBEAT, DEAD_AFTER).await;
        });
        let (peer_noise, code) = ready_rx.recv().map_err(|_| PeerError::Closed)??;
        contact.peer_noise = Some(ct_common::hex::encode(&peer_noise));
        Ok(Self { _runtime: runtime, code, contact_json: dump(&contact)?, out, events: Mutex::new(events) })
    }

    /// The code to compare, e.g. "4821 0937".
    pub fn verification_code(&self) -> String {
        self.code.clone()
    }

    /// The contact with the peer's key pinned. Store it, replacing the earlier JSON.
    pub fn contact_json(&self) -> String {
        self.contact_json.clone()
    }

    pub fn send_text(&self, text: String) -> Result<(), PeerError> {
        self.push(Out::Env(Envelope::Text { text }))
    }

    /// An opaque message for a namespace the peer allows, e.g. call signalling.
    pub fn send_app(&self, ns: String, body_json: String) -> Result<(), PeerError> {
        let body = serde_json::from_str(&body_json).map_err(|_| bad("body"))?;
        self.push(Out::Env(Envelope::App { ns, body }))
    }

    /// Ask the peer for one of its allow-listed capabilities. The answer is a `CapabilityResult`.
    pub fn request_capability(&self, id: u64, capability: String) -> Result<(), PeerError> {
        self.push(Out::Env(Envelope::CapReq { id, cap: capability }))
    }

    /// The user tapped "Teilen".
    pub fn approve(&self, id: u64, data_json: String) -> Result<(), PeerError> {
        let data = serde_json::from_str(&data_json).map_err(|_| bad("data"))?;
        self.push(Out::Approve(id, data))
    }

    /// The user tapped "Nein".
    pub fn decline(&self, id: u64) -> Result<(), PeerError> {
        self.push(Out::Decline(id))
    }

    /// Tell the peer this contact is over. Delivered only while connected.
    pub fn leave(&self) -> Result<(), PeerError> {
        self.push(Out::Env(Envelope::Bye))
    }

    /// Next event, `None` after `wait_ms` without one.
    pub fn next_event(&self, wait_ms: u64) -> Option<PeerEvent> {
        let mut rx = self.events.lock().ok()?;
        self._runtime.block_on(async {
            tokio::time::timeout(Duration::from_millis(wait_ms), rx.recv()).await.ok().flatten()
        })
    }
}

impl PeerSession {
    fn push(&self, o: Out) -> Result<(), PeerError> {
        self.out.blocking_send(o).map_err(|_| PeerError::Closed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ct_common::a2a::{a2a_initiate, a2a_respond_with_peer_key};
    use tokio::io::{duplex, split, DuplexStream};

    async fn pair() -> (Established<DuplexStream>, Established<DuplexStream>) {
        let (a, b) = duplex(1 << 16);
        let (mut ar, mut aw) = split(a);
        let (mut br, mut bw) = split(b);
        let k = ct_common::noise::generate_static_keypair();
        let i = ct_common::noise::generate_static_keypair();
        let (ta, tb) = tokio::join!(
            a2a_initiate(&mut aw, &mut ar, &i.private, &k.public),
            a2a_respond_with_peer_key(&mut bw, &mut br, &k.private)
        );
        (
            Established::from_parts(ar.unsplit(aw), ta.unwrap()),
            Established::from_parts(br.unsplit(bw), tb.unwrap().0),
        )
    }

    const BEAT: Duration = Duration::from_millis(40);
    const DEAD: Duration = Duration::from_millis(200);

    /// The network-change case: the stream stays open and silent, no FIN ever arrives.
    #[tokio::test]
    async fn a_silently_dead_path_ends_in_closed_within_the_bound() {
        let (mut a, _silent_b) = pair().await;
        let (_out, out_rx) = mpsc::channel(4);
        let (ev_tx, mut ev) = mpsc::channel(4);
        let started = Instant::now();
        let run = tokio::spawn(async move { pump(&mut a, Policy::new(&[], &[]), out_rx, ev_tx, BEAT, DEAD).await });
        assert!(matches!(ev.recv().await, Some(PeerEvent::Closed)));
        run.await.unwrap();
        assert!(started.elapsed() >= DEAD, "not before the bound");
        assert!(started.elapsed() < DEAD * 3, "took {:?}", started.elapsed());
    }

    /// Two healthy sides keep each other alive through heartbeats alone, and the app sees none.
    #[tokio::test]
    async fn heartbeats_keep_a_quiet_session_open_and_stay_invisible() {
        let (mut a, mut b) = pair().await;
        let (out_a, rx_a) = mpsc::channel(4);
        let (out_b, rx_b) = mpsc::channel(4);
        let (tx_a, mut ev_a) = mpsc::channel(4);
        let (tx_b, _ev_b) = mpsc::channel(4);
        tokio::spawn(async move { pump(&mut a, Policy::new(&[], &[]), rx_a, tx_a, BEAT, DEAD).await });
        tokio::spawn(async move { pump(&mut b, Policy::new(&[], &[]), rx_b, tx_b, BEAT, DEAD).await });
        assert!(tokio::time::timeout(DEAD * 4, ev_a.recv()).await.is_err(), "no event, no close");
        out_b.send(Out::Env(Envelope::Text { text: "still here".into() })).await.unwrap();
        assert!(matches!(ev_a.recv().await, Some(PeerEvent::Text { text }) if text == "still here"));
        drop(out_a);
    }

    #[tokio::test]
    async fn a_peer_closing_cleanly_ends_in_closed_at_once() {
        let (mut a, b) = pair().await;
        let (_out, out_rx) = mpsc::channel(4);
        let (ev_tx, mut ev) = mpsc::channel(4);
        tokio::spawn(async move { pump(&mut a, Policy::new(&[], &[]), out_rx, ev_tx, BEAT, Duration::from_secs(60)).await });
        drop(b);
        assert!(matches!(tokio::time::timeout(DEAD, ev.recv()).await, Ok(Some(PeerEvent::Closed))));
    }
}
