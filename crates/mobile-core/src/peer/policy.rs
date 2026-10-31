//! What may cross a channel, as data. A peer can send text, opaque app messages for a known
//! namespace, and requests for allow-listed capabilities. There is no envelope that names a
//! command or a tool: a capability request only ever becomes a question to the user, and data
//! leaves the phone only through [`Policy::approve`], which the app calls after a tap.

use std::collections::{HashMap, HashSet, VecDeque};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::PeerError;

/// Largest serialized envelope. Well below the Noise limit, so one message is one frame.
pub const MAX_ENVELOPE_BYTES: usize = 32 * 1024;
/// Inbound envelopes accepted per sliding minute; anything above is dropped unseen.
pub const MAX_INBOUND_PER_MINUTE: usize = 120;
/// Unanswered capability requests one peer may have open.
pub const MAX_PENDING_REQUESTS: usize = 8;

/// The serialized form of [`Envelope::Ping`].
pub const PING_BYTES: &[u8] = br#"{"k":"ping"}"#;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "k", rename_all = "snake_case", deny_unknown_fields)]
pub enum Envelope {
    Text { text: String },
    App { ns: String, body: Value },
    CapReq { id: u64, cap: String },
    CapRes { id: u64, ok: bool, data: Option<Value> },
    Bye,
    /// Liveness only. Never reaches the app and does not count against the inbound rate.
    Ping,
}

/// What the app sees of an inbound envelope.
#[derive(Debug, Clone, PartialEq)]
pub enum Inbound {
    Text(String),
    App { ns: String, body: Value },
    /// Show the user a question. Nothing happens without [`Policy::approve`].
    ApprovalNeeded { id: u64, cap: String },
    CapResult { id: u64, ok: bool, data: Option<Value> },
    PeerLeft,
}

pub struct Policy {
    capabilities: HashSet<String>,
    namespaces: HashSet<String>,
    pending: HashMap<u64, String>,
    arrivals: VecDeque<u64>,
}

/// An inbound envelope's effect: maybe something for the app, maybe an automatic answer.
#[derive(Debug, Default, PartialEq)]
pub struct Decision {
    pub deliver: Option<Inbound>,
    pub reply: Option<Envelope>,
}

impl Policy {
    pub fn new(capabilities: &[String], namespaces: &[String]) -> Self {
        Self {
            capabilities: capabilities.iter().cloned().collect(),
            namespaces: namespaces.iter().cloned().collect(),
            pending: HashMap::new(),
            arrivals: VecDeque::new(),
        }
    }

    /// Judge raw decrypted bytes. Malformed, oversized and over-rate input yields nothing.
    pub fn inbound(&mut self, raw: &[u8], now: u64) -> Decision {
        if raw == PING_BYTES {
            return Decision::default();
        }
        self.arrivals.retain(|t| now.saturating_sub(*t) < 60);
        if raw.len() > MAX_ENVELOPE_BYTES || self.arrivals.len() >= MAX_INBOUND_PER_MINUTE {
            return Decision::default();
        }
        self.arrivals.push_back(now);
        let Ok(env) = serde_json::from_slice::<Envelope>(raw) else {
            return Decision::default();
        };
        let deliver = |i| Decision { deliver: Some(i), reply: None };
        match env {
            Envelope::Text { text } => deliver(Inbound::Text(text)),
            Envelope::App { ns, body } if self.namespaces.contains(&ns) => deliver(Inbound::App { ns, body }),
            Envelope::App { .. } => Decision::default(),
            Envelope::CapReq { id, cap } => {
                if !self.capabilities.contains(&cap) || self.pending.len() >= MAX_PENDING_REQUESTS {
                    return Decision { deliver: None, reply: Some(Envelope::CapRes { id, ok: false, data: None }) };
                }
                self.pending.insert(id, cap.clone());
                deliver(Inbound::ApprovalNeeded { id, cap })
            }
            Envelope::CapRes { id, ok, data } => deliver(Inbound::CapResult { id, ok, data }),
            Envelope::Bye => deliver(Inbound::PeerLeft),
            Envelope::Ping => Decision::default(),
        }
    }

    /// The user tapped "Teilen": the only path by which capability data becomes an envelope.
    pub fn approve(&mut self, id: u64, data: Value) -> Result<Envelope, PeerError> {
        self.pending.remove(&id).ok_or(PeerError::InvalidInput { detail: "no such request".into() })?;
        Ok(Envelope::CapRes { id, ok: true, data: Some(data) })
    }

    /// The user tapped "Nein".
    pub fn decline(&mut self, id: u64) -> Result<Envelope, PeerError> {
        self.pending.remove(&id).ok_or(PeerError::InvalidInput { detail: "no such request".into() })?;
        Ok(Envelope::CapRes { id, ok: false, data: None })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn policy() -> Policy {
        Policy::new(&["idea.today".to_string()], &["call".to_string()])
    }

    fn feed(p: &mut Policy, v: Value) -> Decision {
        p.inbound(v.to_string().as_bytes(), 1_000)
    }

    #[test]
    fn a_tool_call_from_the_peer_is_not_even_representable() {
        let mut p = policy();
        for evil in [
            json!({"jsonrpc":"2.0","method":"tools/call","params":{"name":"shell","arguments":{"cmd":"id"}}}),
            json!({"k":"exec","cmd":"id"}),
            json!({"k":"cap_req","id":1,"cap":"idea.today","args":{"cmd":"id"}}),
        ] {
            assert_eq!(feed(&mut p, evil), Decision::default());
        }
    }

    #[test]
    fn unlisted_capabilities_are_refused_without_asking_the_user() {
        let d = feed(&mut policy(), json!({"k":"cap_req","id":7,"cap":"contacts.read"}));
        assert_eq!(d.deliver, None);
        assert_eq!(d.reply, Some(Envelope::CapRes { id: 7, ok: false, data: None }));
    }

    #[test]
    fn a_listed_capability_waits_for_the_tap_and_data_goes_out_only_then() {
        let mut p = policy();
        let d = feed(&mut p, json!({"k":"cap_req","id":7,"cap":"idea.today"}));
        assert_eq!(d.deliver, Some(Inbound::ApprovalNeeded { id: 7, cap: "idea.today".into() }));
        assert_eq!(d.reply, None, "no automatic answer");
        let out = p.approve(7, json!({"idea":"x"})).unwrap();
        assert_eq!(out, Envelope::CapRes { id: 7, ok: true, data: Some(json!({"idea":"x"})) });
        assert!(p.approve(7, json!({})).is_err(), "one tap, one answer");
    }

    #[test]
    fn approving_something_never_asked_fails() {
        assert!(policy().approve(99, json!({"secret":1})).is_err());
    }

    #[test]
    fn unknown_namespaces_are_dropped_and_known_ones_stay_opaque() {
        let mut p = policy();
        assert_eq!(feed(&mut p, json!({"k":"app","ns":"other","body":{}})), Decision::default());
        let d = feed(&mut p, json!({"k":"app","ns":"call","body":{"t":"offer"}}));
        assert_eq!(d.deliver, Some(Inbound::App { ns: "call".into(), body: json!({"t":"offer"}) }));
    }

    #[test]
    fn flooding_and_oversize_are_dropped() {
        let mut p = policy();
        for _ in 0..MAX_INBOUND_PER_MINUTE {
            assert!(feed(&mut p, json!({"k":"text","text":"x"})).deliver.is_some());
        }
        assert_eq!(feed(&mut p, json!({"k":"text","text":"x"})), Decision::default());
        assert!(p.inbound(br#"{"k":"text","text":"x"}"#, 1_061).deliver.is_some(), "the window slides");
        assert_eq!(p.inbound(&vec![b' '; MAX_ENVELOPE_BYTES + 1], 1_061), Decision::default());
    }

    #[test]
    fn heartbeats_stay_invisible_and_cost_no_rate() {
        assert_eq!(serde_json::to_vec(&Envelope::Ping).unwrap(), PING_BYTES);
        let mut p = policy();
        for _ in 0..1_000 {
            assert_eq!(p.inbound(PING_BYTES, 1_000), Decision::default());
        }
        assert!(feed(&mut p, json!({"k":"text","text":"x"})).deliver.is_some());
    }

    #[test]
    fn open_requests_are_bounded() {
        let mut p = policy();
        for id in 0..MAX_PENDING_REQUESTS as u64 {
            assert!(feed(&mut p, json!({"k":"cap_req","id":id,"cap":"idea.today"})).deliver.is_some());
        }
        let d = feed(&mut p, json!({"k":"cap_req","id":100,"cap":"idea.today"}));
        assert_eq!(d.reply, Some(Envelope::CapRes { id: 100, ok: false, data: None }));
    }
}
