//! The UniFFI surface: blocking calls for a background thread in the app. Contact JSON is a secret
//! the app keeps in Keystore/Keychain; this core persists nothing.

use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;
use tokio::runtime::Runtime;
use tokio::sync::mpsc;

use super::invite::{Contact, INVITE_TTL_DEFAULT_SECS};
use super::policy::{Envelope, Inbound, Policy};
use super::session::connect;
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
        let (out, mut out_rx) = mpsc::channel::<Out>(32);
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
            let mut policy = Policy::new(&capabilities, &namespaces);
            loop {
                tokio::select! {
                    raw = session.recv_raw() => {
                        let judged = match raw {
                            Ok(r) => session.judge(&r, &mut policy).await,
                            Err(e) => Err(e),
                        };
                        match judged {
                            Ok(Some(i)) => { let _ = ev_tx.send(i.into()).await; }
                            Ok(None) => {}
                            Err(_) => { let _ = ev_tx.send(PeerEvent::Closed).await; return; }
                        }
                    }
                    cmd = out_rx.recv() => {
                        let env = match cmd {
                            Some(Out::Env(e)) => Ok(e),
                            Some(Out::Approve(id, data)) => policy.approve(id, data),
                            Some(Out::Decline(id)) => policy.decline(id),
                            None => return,
                        };
                        if let Ok(e) = env {
                            if session.send(&e).await.is_err() {
                                let _ = ev_tx.send(PeerEvent::Closed).await;
                                return;
                            }
                        }
                    }
                }
            }
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
