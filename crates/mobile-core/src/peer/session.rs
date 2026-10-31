//! One live session: TLS to the `:443` front door (ALPN `ct-edge-channel`, the edge CA as the only
//! anchor), the channel join, then Noise_IK with the peer's key pinned. Join protocol and Noise
//! are `ct_common`'s, so this file only decides what to trust.
//!
//! Delivery is online-only: the edge pairs two parked members and relays. A member alone gets an
//! `EX` after the park lease and parks again until its deadline.

use std::sync::Arc;
use std::time::{Duration, Instant};

use ct_common::a2a::{a2a_initiate, a2a_respond_with_peer_key, a2a_send};
use ct_common::channel::{
    verify_member_noise_attestation, ChannelId, ChannelJoinRequest, SignedChannelGrant, CHANNEL_ENDPOINT_RELAY_ONLY,
};
use ct_common::channel_wire::io::present_channel_join_on_stream;
use ct_common::channel_wire::ChannelJoinOutcome;
use ct_common::hex;
use ed25519_dalek::SigningKey;
use tokio::io::{split, AsyncRead, AsyncReadExt, AsyncWrite, ReadHalf, WriteHalf};
use tokio::net::TcpStream;
use tokio_rustls::rustls::pki_types::{CertificateDer, ServerName};

use super::invite::{decode32, verification_code, Contact};
use super::policy::{Decision, Envelope, Inbound, Policy, MAX_ENVELOPE_BYTES};
use super::{now_secs, PeerConfig, PeerError};

const FRONT_DOOR_ALPN: &[u8] = b"ct-edge-channel";
const DEFAULT_SNI: &str = "localhost";
/// The admission exchange bound of ct-agent's plain `:443` leg; the park lease fits inside it.
const JOIN_EXCHANGE_TIMEOUT: Duration = Duration::from_secs(45);
const NOISE_TIMEOUT: Duration = Duration::from_secs(15);
/// Both sides send a ping this often while connected.
pub const HEARTBEAT: Duration = Duration::from_secs(3);
/// Silence after which the path counts as dead. A network change kills TCP without a FIN, so
/// without this a session would wait forever. Rejoining needs only the stored contact.
pub const DEAD_AFTER: Duration = Duration::from_secs(8);

fn net(e: impl std::fmt::Display) -> PeerError {
    PeerError::Network { detail: e.to_string().chars().take(120).collect() }
}

/// Dial the front door. Transport only; [`Established::join`] takes any byte stream, which is
/// also how the e2e proof records exactly what the edge receives.
pub async fn dial_front_door(cfg: &PeerConfig) -> Result<impl AsyncRead + AsyncWrite + Unpin + Send, PeerError> {
    let mut roots = rustls::RootCertStore::empty();
    roots.add(CertificateDer::from(cfg.edge_ca_der.clone())).map_err(net)?;
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let mut tls = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(net)?
        .with_root_certificates(roots)
        .with_no_client_auth();
    tls.alpn_protocols = vec![FRONT_DOOR_ALPN.to_vec()];
    let sni = if cfg.sni.is_empty() { DEFAULT_SNI } else { cfg.sni.as_str() };
    let name = ServerName::try_from(sni.to_string()).map_err(net)?;
    let tcp = TcpStream::connect(&cfg.front_door).await.map_err(net)?;
    tcp.set_nodelay(true).map_err(net)?;
    tokio_rustls::TlsConnector::from(Arc::new(tls)).connect(name, tcp).await.map_err(net)
}

/// A paired, Noise-protected session with the pinned peer.
pub struct Established<S> {
    read: ReadHalf<S>,
    write: WriteHalf<S>,
    noise: snow::TransportState,
    /// Received bytes not yet forming a whole frame. Kept here so [`Self::recv_raw`] is cancel-safe.
    inbox: Vec<u8>,
    /// The peer's Noise key, now pinned. The inviter stores it in its contact after first contact.
    pub peer_noise: [u8; 32],
    pub code: String,
}

/// One join attempt's result.
pub enum Joined<S> {
    Paired(Box<Established<S>>),
    /// No partner within the park lease: the caller dials again until its own deadline.
    ParkExpired,
}

impl<S: AsyncRead + AsyncWrite + Unpin + Send> Established<S> {
    pub async fn join(stream: S, contact: &Contact) -> Result<Joined<S>, PeerError> {
        let channel = contact.channel_id()?;
        let holder = SigningKey::from_bytes(&decode32(&contact.holder_seed)?);
        let grant = hex::decode(&contact.grant)
            .and_then(|b| SignedChannelGrant::decode(&b).ok())
            .ok_or(PeerError::InvalidInput { detail: "bad grant".into() })?;
        let request = ChannelJoinRequest { grant, endpoint: CHANNEL_ENDPOINT_RELAY_ONLY.to_string() };
        let (mut read, mut write) = split(stream);
        let outcome = present_channel_join_on_stream(
            &mut write,
            &mut read,
            &request,
            &holder,
            JOIN_EXCHANGE_TIMEOUT,
            false, // A TCP/TLS leg must not half-close while parked.
            None,
            false,
        )
        .await
        .map_err(|e| {
            // The join's own wording for "no partner in time" is not an operational failure.
            if e.to_string().contains("stalled") { PeerError::PeerOffline } else { net(e) }
        })?;
        let (peer_noise_ack, peer_holder, attestation) = match outcome {
            ChannelJoinOutcome::Admitted { peer_noise_pubkey, peer_holder, peer_attestation, .. } => {
                (peer_noise_pubkey, peer_holder, peer_attestation)
            }
            ChannelJoinOutcome::ParkExpired => return Ok(Joined::ParkExpired),
            ChannelJoinOutcome::Refused { category } => {
                return Err(PeerError::Refused { category: category.unwrap_or_else(|| "refused".into()) })
            }
        };
        let peer_noise = verified_peer_key(&channel, contact, peer_noise_ack, peer_holder, attestation)?;
        let own_private = decode32(&contact.noise_private)?;
        let noise = tokio::time::timeout(NOISE_TIMEOUT, async {
            if contact.inviter {
                a2a_initiate(&mut write, &mut read, &own_private, &peer_noise).await
            } else {
                let (t, seen) = a2a_respond_with_peer_key(&mut write, &mut read, &own_private).await?;
                if seen != peer_noise {
                    return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "peer key"));
                }
                Ok(t)
            }
        })
        .await
        .map_err(|_| PeerError::PeerOffline)?
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied { PeerError::PeerMismatch } else { net(e) }
        })?;
        let code = verification_code(&channel, &decode32(&contact.noise_public)?, &peer_noise);
        Ok(Joined::Paired(Box::new(Self { read, write, noise, inbox: Vec::new(), peer_noise, code })))
    }

    /// A session on any stream, for tests of the loop above it.
    #[cfg(test)]
    pub(crate) fn from_parts(stream: S, noise: snow::TransportState) -> Self {
        let (read, write) = split(stream);
        Self { read, write, noise, inbox: Vec::new(), peer_noise: [0; 32], code: String::new() }
    }

    pub async fn send_raw(&mut self, plaintext: &[u8]) -> Result<(), PeerError> {
        a2a_send(&mut self.write, &mut self.noise, plaintext).await.map_err(net)
    }

    pub async fn send(&mut self, env: &Envelope) -> Result<(), PeerError> {
        let bytes = serde_json::to_vec(env).map_err(net)?;
        if bytes.len() > MAX_ENVELOPE_BYTES {
            return Err(PeerError::TooLarge);
        }
        // A dead path with a full send buffer must not stall the loop past the heartbeat.
        tokio::time::timeout(DEAD_AFTER, self.send_raw(&bytes)).await.map_err(|_| PeerError::Closed)?
    }

    /// Next decrypted message. Cancel-safe: the app's loop selects this against outgoing work, and
    /// losing a half-read frame would desynchronize Noise for good, so bytes wait in `inbox`.
    pub async fn recv_raw(&mut self) -> Result<Vec<u8>, PeerError> {
        loop {
            if let Some((frame, used)) = ct_common::noise::take_frame(&self.inbox) {
                let mut plain = vec![0u8; frame.len()];
                let n = self.noise.read_message(frame, &mut plain).map_err(net)?;
                plain.truncate(n);
                self.inbox.drain(..used);
                return Ok(plain);
            }
            if self.read.read_buf(&mut self.inbox).await.map_err(net)? == 0 {
                return Err(PeerError::Closed);
            }
        }
    }

    /// Apply the policy to one received message and send any automatic refusal.
    pub async fn judge(&mut self, raw: &[u8], policy: &mut Policy) -> Result<Option<Inbound>, PeerError> {
        let Decision { deliver, reply } = policy.inbound(raw, now_secs());
        if let Some(r) = reply {
            self.send(&r).await?;
        }
        Ok(deliver)
    }

    /// Next envelope that means something to the app. Not for `select!`, use the two parts there.
    pub async fn next(&mut self, policy: &mut Policy) -> Result<Inbound, PeerError> {
        loop {
            let raw = self.recv_raw().await?;
            if let Some(d) = self.judge(&raw, policy).await? {
                return Ok(d);
            }
        }
    }
}

/// The trust decision of a session, separate so it can be tested without a network. The edge's
/// ack is only a hint: the key must carry the attestation of the holder known from the link, and
/// on an invitee it must equal the key pinned from the link. A control plane or edge that swaps a
/// key therefore fails here, before any Noise message is sent.
pub(crate) fn verified_peer_key(
    channel: &ChannelId,
    contact: &Contact,
    ack_noise: Option<[u8; 32]>,
    ack_holder: Option<[u8; 32]>,
    ack_attestation: Option<[u8; 64]>,
) -> Result<[u8; 32], PeerError> {
    let expected_holder = decode32(&contact.peer_holder)?;
    let (Some(noise), Some(holder), Some(att)) = (ack_noise, ack_holder, ack_attestation) else {
        return Err(PeerError::PeerMismatch);
    };
    if holder != expected_holder || !verify_member_noise_attestation(channel, &holder, &noise, &att) {
        return Err(PeerError::PeerMismatch);
    }
    match &contact.peer_noise {
        Some(pinned) if decode32(pinned)? != noise => Err(PeerError::PeerMismatch),
        _ => Ok(noise),
    }
}

/// Keep joining until paired or `wait` has passed, parking again after every expired lease.
pub async fn connect(
    cfg: &PeerConfig,
    contact: &Contact,
    wait: Duration,
) -> Result<Established<impl AsyncRead + AsyncWrite + Unpin + Send>, PeerError> {
    let until = Instant::now() + wait;
    loop {
        let stream = dial_front_door(cfg).await?;
        let left = until.saturating_duration_since(Instant::now());
        let joined = tokio::time::timeout(left, Established::join(stream, contact))
            .await
            .map_err(|_| PeerError::PeerOffline)?;
        match joined {
            Ok(Joined::Paired(s)) => return Ok(*s),
            Ok(Joined::ParkExpired) | Err(PeerError::PeerOffline) if Instant::now() < until => {}
            Ok(Joined::ParkExpired) => return Err(PeerError::PeerOffline),
            Err(e) => return Err(e),
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::peer::invite::{attest, new_invite, random32};

    fn invitee_view() -> (Contact, ChannelId, [u8; 32], [u8; 32], [u8; 64]) {
        let inv = new_invite(1_000, 600).unwrap();
        let opened = crate::peer::invite::open_link(&inv.link, 1_001).unwrap();
        let channel = inv.contact.channel_id().unwrap();
        let contact = Contact {
            inviter: false,
            peer_holder: inv.contact.holder_seed.clone(),
            peer_noise: Some(hex::encode(&opened.inviter_noise)),
            ..inv.contact.clone()
        };
        let holder_seed = decode32(&inv.contact.holder_seed).unwrap();
        let holder = crate::peer::invite::public_of(&holder_seed);
        let att = attest(&channel, &holder_seed, &opened.inviter_noise);
        let contact = Contact { peer_holder: hex::encode(&holder), ..contact };
        (contact, channel, holder, opened.inviter_noise, att)
    }

    /// A frame arriving in two halves with a cancelled read in between must still decrypt.
    #[tokio::test]
    async fn cancelling_a_half_read_frame_loses_nothing() {
        use tokio::io::AsyncWriteExt;
        let (a, b) = tokio::io::duplex(4096);
        let (mut ar, mut aw) = split(a);
        let (mut br, mut bw) = split(b);
        let k = ct_common::noise::generate_static_keypair();
        let i = ct_common::noise::generate_static_keypair();
        let (t_a, t_b) = tokio::join!(
            a2a_initiate(&mut aw, &mut ar, &i.private, &k.public),
            a2a_respond_with_peer_key(&mut bw, &mut br, &k.private)
        );
        let (mut t_a, t_b) = (t_a.unwrap(), t_b.unwrap().0);
        let mut rx = Established {
            read: br,
            write: bw,
            noise: t_b,
            inbox: Vec::new(),
            peer_noise: i.public,
            code: String::new(),
        };
        let mut wire = Vec::new();
        a2a_send(&mut wire, &mut t_a, b"hello").await.unwrap();
        aw.write_all(&wire[..5]).await.unwrap();
        assert!(tokio::time::timeout(Duration::from_millis(50), rx.recv_raw()).await.is_err(), "cancelled mid-frame");
        aw.write_all(&wire[5..]).await.unwrap();
        assert_eq!(rx.recv_raw().await.unwrap(), b"hello");
    }

    #[test]
    fn the_genuine_peer_passes() {
        let (c, ch, holder, noise, att) = invitee_view();
        assert_eq!(verified_peer_key(&ch, &c, Some(noise), Some(holder), Some(att)).unwrap(), noise);
    }

    #[test]
    fn a_key_swapped_by_edge_or_control_plane_is_refused() {
        let (c, ch, holder, _, _) = invitee_view();
        // A substitute the swapping party can only attest with a key of its own.
        let (evil_seed, evil_noise) = (random32(), random32());
        let evil_holder = crate::peer::invite::public_of(&evil_seed);
        let evil_att = attest(&ch, &evil_seed, &evil_noise);
        assert!(matches!(
            verified_peer_key(&ch, &c, Some(evil_noise), Some(evil_holder), Some(evil_att)),
            Err(PeerError::PeerMismatch)
        ));
        assert!(matches!(
            verified_peer_key(&ch, &c, Some(evil_noise), Some(holder), Some(evil_att)),
            Err(PeerError::PeerMismatch)
        ));
        assert!(matches!(verified_peer_key(&ch, &c, None, None, None), Err(PeerError::PeerMismatch)));
    }
}
