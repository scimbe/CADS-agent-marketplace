//! Per-contact keys and the single-use invite link.
//!
//! The link fragment carries a fresh **slot** key. It plays three roles the control plane already
//! knows: the invitee identity of a `ChannelInvitation`, the holder of a pre-signed
//! `ChannelGrant`, and the attester of the invitee's own Noise key. So the invitee needs no
//! account and the inviter need not be online at redemption. The fragment never reaches a server,
//! which is why the control plane cannot forge the invitee's attested Noise key.
//! Single use and expiry are enforced by `POST /channel/invite/redeem`.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ct_common::channel::{
    channel_id_for_link, member_noise_attest_bytes, verify_invitation, verify_stateless,
    ChannelGrant, ChannelId, ChannelInvitation, Direction, Rights, SignedChannelGrant,
    SignedChannelInvitation,
};
use ct_common::hex;
use ed25519_dalek::{Signer, SigningKey};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::PeerError;

/// Link base. The app claims it as App Link / Universal Link; the page there never sees the fragment.
pub const LINK_BASE: &str = "https://bunsenbrenner.org/p#";
pub const INVITE_TTL_DEFAULT_SECS: u64 = 10 * 60;
/// Same bound as the control plane's own claim invites.
pub const INVITE_TTL_MAX_SECS: u64 = 15 * 60;
/// Grants end on their own; a contact that goes quiet for this long has to be re-invited.
pub const GRANT_TTL_SECS: u64 = 90 * 24 * 3600;

const LINK_VERSION: u8 = 1;
const LINK_LEN: usize = 1 + 32 + 64 + 8 + 64 + 8 + 32 + 32 + 32;
/// Makes grinding keys towards a matching code expensive; about 30 ms on a phone.
const SAS_ROUNDS: u32 = 1 << 16;

pub(crate) fn random32() -> [u8; 32] {
    let mut b = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut b);
    b
}

pub(crate) fn public_of(seed: &[u8; 32]) -> [u8; 32] {
    SigningKey::from_bytes(seed).verifying_key().to_bytes()
}

pub(crate) fn attest(
    channel: &ChannelId,
    holder_seed: &[u8; 32],
    noise_public: &[u8; 32],
) -> [u8; 64] {
    let holder = public_of(holder_seed);
    SigningKey::from_bytes(holder_seed)
        .sign(&member_noise_attest_bytes(channel, &holder, noise_public))
        .to_bytes()
}

fn grant_for(
    channel: ChannelId,
    holder: [u8; 32],
    direction: Direction,
    expires_at: u64,
) -> ChannelGrant {
    ChannelGrant {
        channel,
        holder,
        direction,
        rights: Rights::ReadWrite,
        delegable: false,
        expires_at,
    }
}

fn invitation_for(channel: ChannelId, slot: [u8; 32], expires_at: u64) -> ChannelInvitation {
    ChannelInvitation {
        channel,
        invitee_identity: slot,
        direction: Direction::Accept,
        rights: Rights::ReadWrite,
        delegable: false,
        expires_at,
    }
}

fn sign_grant(operator: &SigningKey, grant: ChannelGrant) -> SignedChannelGrant {
    let signature = operator.sign(&grant.signing_bytes()).to_bytes();
    SignedChannelGrant { grant, signature }
}

/// Everything one phone keeps about one contact. Secret: the app stores it in Keystore/Keychain.
/// No `Debug`, so it cannot end up in a log by accident.
#[derive(Clone, Serialize, Deserialize)]
pub struct Contact {
    pub inviter: bool,
    pub channel: String,
    pub holder_seed: String,
    pub noise_private: String,
    pub noise_public: String,
    /// Own signed grant, hex wire form.
    pub grant: String,
    /// The peer's holder key. Fixed at creation on both sides.
    pub peer_holder: String,
    /// The peer's Noise key. Pinned from the link (invitee) or on first contact (inviter).
    pub peer_noise: Option<String>,
    /// Inviter only: the per-contact operator key and the peer's grant, so "Trennen" needs no login.
    pub operator_seed: Option<String>,
    pub peer_grant: Option<String>,
}

impl Contact {
    pub(crate) fn channel_id(&self) -> Result<ChannelId, PeerError> {
        Ok(ChannelId(decode32(&self.channel)?))
    }
}

pub(crate) fn decode32(s: &str) -> Result<[u8; 32], PeerError> {
    hex::decode_32(s).ok_or(PeerError::InvalidInput {
        detail: "bad key encoding".into(),
    })
}

/// A contact being created, before the control plane knows it.
pub struct NewInvite {
    pub contact: Contact,
    pub operator_public: [u8; 32],
    pub attestation: [u8; 64],
    pub link: String,
}

/// All keys for one new contact plus the link. Pure: nothing leaves the device here.
pub fn new_invite(now: u64, ttl_secs: u64) -> Result<NewInvite, PeerError> {
    if ttl_secs == 0 || ttl_secs > INVITE_TTL_MAX_SECS {
        return Err(PeerError::InvalidInput {
            detail: "invite lifetime out of range".into(),
        });
    }
    let (operator_seed, holder_seed, slot_seed) = (random32(), random32(), random32());
    let noise = ct_common::noise::generate_static_keypair();
    let operator = SigningKey::from_bytes(&operator_seed);
    let operator_public = operator.verifying_key().to_bytes();
    let (holder, slot) = (public_of(&holder_seed), public_of(&slot_seed));
    let channel = channel_id_for_link(&operator_public, &holder, &slot);
    let (invite_exp, grant_exp) = (now + ttl_secs, now + GRANT_TTL_SECS);

    let own_grant = sign_grant(
        &operator,
        grant_for(channel, holder, Direction::Initiate, grant_exp),
    );
    let slot_grant = sign_grant(
        &operator,
        grant_for(channel, slot, Direction::Accept, grant_exp),
    );
    let invitation = invitation_for(channel, slot, invite_exp);
    let invitation_sig = operator.sign(&invitation.signing_bytes()).to_bytes();

    let mut b = Vec::with_capacity(LINK_LEN);
    b.push(LINK_VERSION);
    b.extend_from_slice(&slot_seed);
    b.extend_from_slice(&invitation_sig);
    b.extend_from_slice(&invite_exp.to_le_bytes());
    b.extend_from_slice(&slot_grant.signature);
    b.extend_from_slice(&grant_exp.to_le_bytes());
    b.extend_from_slice(&holder);
    b.extend_from_slice(&noise.public);
    b.extend_from_slice(&operator_public);
    debug_assert_eq!(b.len(), LINK_LEN);

    Ok(NewInvite {
        attestation: attest(&channel, &holder_seed, &noise.public),
        operator_public,
        link: format!("{LINK_BASE}{}", URL_SAFE_NO_PAD.encode(&b)),
        contact: Contact {
            inviter: true,
            channel: hex::encode(&channel.0),
            holder_seed: hex::encode(&holder_seed),
            noise_private: hex::encode(&noise.private),
            noise_public: hex::encode(&noise.public),
            grant: hex::encode(&own_grant.encode()),
            peer_holder: hex::encode(&slot),
            peer_noise: None,
            operator_seed: Some(hex::encode(&operator_seed)),
            peer_grant: Some(hex::encode(&slot_grant.encode())),
        },
    })
}

/// A decoded, signature-checked link.
pub struct OpenedLink {
    pub slot_seed: [u8; 32],
    pub invitation: SignedChannelInvitation,
    pub grant: SignedChannelGrant,
    pub inviter_holder: [u8; 32],
    pub inviter_noise: [u8; 32],
}

/// Decode a link or a bare fragment and check it was signed as a whole, so a damaged link fails
/// here. Whether it is still unused only the control plane can say.
pub fn open_link(link: &str, now: u64) -> Result<OpenedLink, PeerError> {
    let raw = link.trim().rsplit('#').next().unwrap_or("");
    let b = URL_SAFE_NO_PAD
        .decode(raw)
        .map_err(|_| PeerError::LinkInvalid)?;
    if b.len() != LINK_LEN || b[0] != LINK_VERSION {
        return Err(PeerError::LinkInvalid);
    }
    let mut at = 1;
    let mut take = |n: usize| {
        let s = &b[at..at + n];
        at += n;
        s
    };
    let slot_seed: [u8; 32] = take(32).try_into().unwrap();
    let invitation_sig: [u8; 64] = take(64).try_into().unwrap();
    let invite_exp = u64::from_le_bytes(take(8).try_into().unwrap());
    let grant_sig: [u8; 64] = take(64).try_into().unwrap();
    let grant_exp = u64::from_le_bytes(take(8).try_into().unwrap());
    let inviter_holder: [u8; 32] = take(32).try_into().unwrap();
    let inviter_noise: [u8; 32] = take(32).try_into().unwrap();
    let operator: [u8; 32] = take(32).try_into().unwrap();

    let slot = public_of(&slot_seed);
    let channel = channel_id_for_link(&operator, &inviter_holder, &slot);
    let invitation = SignedChannelInvitation {
        invitation: invitation_for(channel, slot, invite_exp),
        signature: invitation_sig,
    };
    let grant = SignedChannelGrant {
        grant: grant_for(channel, slot, Direction::Accept, grant_exp),
        signature: grant_sig,
    };
    verify_stateless(&operator, &grant, now).map_err(|_| PeerError::LinkInvalid)?;
    verify_invitation(&operator, &invitation, now).map_err(|e| match e {
        ct_common::channel::GrantError::Expired => PeerError::LinkExpired,
        _ => PeerError::LinkInvalid,
    })?;
    Ok(OpenedLink {
        slot_seed,
        invitation,
        grant,
        inviter_holder,
        inviter_noise,
    })
}

/// The eight-digit code both sides can compare. Shown, never required.
pub fn verification_code(channel: &ChannelId, noise_a: &[u8; 32], noise_b: &[u8; 32]) -> String {
    let (lo, hi) = if noise_a <= noise_b {
        (noise_a, noise_b)
    } else {
        (noise_b, noise_a)
    };
    let mut h: [u8; 32] = Sha256::new()
        .chain_update(b"cads-peer-sas-v1")
        .chain_update(channel.0)
        .chain_update(lo)
        .chain_update(hi)
        .finalize()
        .into();
    for _ in 0..SAS_ROUNDS {
        h = Sha256::digest(h).into();
    }
    let n = u32::from_le_bytes([h[0], h[1], h[2], h[3]]) % 100_000_000;
    format!("{:04} {:04}", n / 10_000, n % 10_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_is_short_enough_for_a_qr_code_and_round_trips() {
        let inv = new_invite(1_000, 600).unwrap();
        assert!(inv.link.len() < 400, "{}", inv.link.len());
        let opened = open_link(&inv.link, 1_001).unwrap();
        assert_eq!(hex::encode(&opened.inviter_noise), inv.contact.noise_public);
        assert_eq!(
            hex::encode(&opened.grant.encode()),
            inv.contact.peer_grant.unwrap()
        );
    }

    #[test]
    fn expired_and_damaged_links_are_refused_locally() {
        let inv = new_invite(1_000, 600).unwrap();
        assert!(matches!(
            open_link(&inv.link, 1_600),
            Err(PeerError::LinkExpired)
        ));
        // Flip a bit inside the fragment: a signature no longer verifies.
        let mut bad = inv.link.into_bytes();
        let i = bad.len() - 200;
        bad[i] = if bad[i] == b'A' { b'B' } else { b'A' };
        assert!(matches!(
            open_link(std::str::from_utf8(&bad).unwrap(), 1_001),
            Err(PeerError::LinkInvalid)
        ));
        assert!(matches!(
            open_link("https://bunsenbrenner.org/p#kurz", 1_001),
            Err(PeerError::LinkInvalid)
        ));
    }

    #[test]
    fn invite_lifetime_is_bounded() {
        assert!(new_invite(1_000, INVITE_TTL_MAX_SECS + 1).is_err());
        assert!(new_invite(1_000, 0).is_err());
    }

    #[test]
    fn the_code_is_symmetric_and_depends_on_both_keys() {
        let c = ChannelId([7; 32]);
        let (a, b, x) = ([1u8; 32], [2u8; 32], [3u8; 32]);
        assert_eq!(verification_code(&c, &a, &b), verification_code(&c, &b, &a));
        assert_ne!(verification_code(&c, &a, &b), verification_code(&c, &a, &x));
        assert_eq!(verification_code(&c, &a, &b).len(), 9);
    }
}
