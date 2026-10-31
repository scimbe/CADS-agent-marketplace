//! The control-plane calls of the invite flow. Only `register_as_owner` takes a bearer token:
//! redeeming and revoking are proof-gated public routes.

use std::time::Duration;

use ct_common::channel::{
    grant_revoke_signing_bytes, invitation_redeem_challenge_bytes, SignedChannelGrant,
};
use ct_common::hex;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};

use super::invite::{attest, decode32, new_invite, open_link, public_of, Contact, NewInvite};
use super::{now_secs, PeerConfig, PeerError};

fn post(
    cfg: &PeerConfig,
    path: &str,
    bearer: Option<&str>,
    body: &Value,
) -> Result<(u16, String), PeerError> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(15)))
        .http_status_as_error(false)
        .build()
        .into();
    let url = format!("{}{path}", cfg.control_plane_url.trim_end_matches('/'));
    let mut req = agent.post(&url).header("Content-Type", "application/json");
    if let Some(t) = bearer {
        req = req.header("Authorization", &format!("Bearer {t}"));
    }
    let mut resp = req
        .send(body.to_string())
        // The URL and body hold no secret the transport error could echo, but the detail is
        // kept to the error kind anyway.
        .map_err(|e| PeerError::Network {
            detail: e.to_string().chars().take(120).collect(),
        })?;
    let status = resp.status().as_u16();
    Ok((status, resp.body_mut().read_to_string().unwrap_or_default()))
}

fn expect_ok(status: u16) -> Result<(), PeerError> {
    match status {
        200..=299 => Ok(()),
        401 | 403 => Err(PeerError::Unauthorized),
        s => Err(PeerError::Server { status: s }),
    }
}

/// "Einladen": fresh keys, the channel under the inviter's account, the link.
pub fn create_invite(
    cfg: &PeerConfig,
    bearer: &str,
    ttl_secs: u64,
) -> Result<NewInvite, PeerError> {
    let inv = new_invite(now_secs(), ttl_secs)?;
    let c = &inv.contact;
    let holder = public_of(&decode32(&c.holder_seed)?);
    let (status, _) = post(
        cfg,
        "/me/channels",
        Some(bearer),
        &json!({"channel": c.channel, "operator_pubkey": hex::encode(&inv.operator_public)}),
    )?;
    expect_ok(status)?;
    let (status, _) = post(
        cfg,
        &format!("/me/channels/{}/members", c.channel),
        Some(bearer),
        &json!({
            "holder": hex::encode(&holder),
            "noise_pubkey": c.noise_public,
            "noise_attestation": hex::encode(&inv.attestation),
        }),
    )?;
    expect_ok(status)?;
    Ok(inv)
}

/// "Annehmen": no account, the link is the authorization. Burns the link at the control plane.
pub fn accept_invite(cfg: &PeerConfig, link: &str) -> Result<Contact, PeerError> {
    let opened = open_link(link, now_secs())?;
    let channel = opened.invitation.invitation.channel;
    let slot = public_of(&opened.slot_seed);
    let noise = ct_common::noise::generate_static_keypair();

    let (status, body) = post(cfg, "/channel/invite/challenge", None, &json!({}))?;
    if !(200..300).contains(&status) {
        return Err(PeerError::Server { status });
    }
    let challenge = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| v["challenge"].as_str().and_then(hex::decode_32))
        .ok_or(PeerError::Server { status })?;
    let sig = SigningKey::from_bytes(&opened.slot_seed)
        .sign(&invitation_redeem_challenge_bytes(
            &channel, &slot, &slot, &challenge,
        ))
        .to_bytes();
    let (status, _) = post(
        cfg,
        "/channel/invite/redeem",
        None,
        &json!({
            "invitation": hex::encode(&opened.invitation.encode()),
            "redeem_sig": hex::encode(&sig),
            "holder": hex::encode(&slot),
            "noise_pubkey": hex::encode(&noise.public),
            "noise_attestation": hex::encode(&attest(&channel, &opened.slot_seed, &noise.public)),
            "challenge": hex::encode(&challenge),
        }),
    )?;
    match status {
        200..=299 => {}
        409 => return Err(PeerError::LinkUsed),
        410 => return Err(PeerError::LinkExpired),
        403 | 404 => return Err(PeerError::LinkInvalid),
        s => return Err(PeerError::Server { status: s }),
    }
    Ok(Contact {
        inviter: false,
        channel: hex::encode(&channel.0),
        holder_seed: hex::encode(&opened.slot_seed),
        noise_private: hex::encode(&noise.private),
        noise_public: hex::encode(&noise.public),
        grant: hex::encode(&opened.grant.encode()),
        peer_holder: hex::encode(&opened.inviter_holder),
        peer_noise: Some(hex::encode(&opened.inviter_noise)),
        operator_seed: None,
        peer_grant: None,
    })
}

/// "Trennen" on the inviter's side: the operator signature alone revokes the peer's grant, with no
/// login. The invitee's side ends by sending `bye` and deleting its contact: without its keys
/// nothing joins this channel from that phone again.
pub fn revoke_peer(cfg: &PeerConfig, contact: &Contact) -> Result<(), PeerError> {
    let (Some(op), Some(grant_hex)) = (&contact.operator_seed, &contact.peer_grant) else {
        return Ok(());
    };
    let grant = hex::decode(grant_hex)
        .and_then(|b| SignedChannelGrant::decode(&b).ok())
        .ok_or(PeerError::InvalidInput {
            detail: "bad grant".into(),
        })?;
    let channel = contact.channel_id()?;
    let digest = grant.digest();
    let sig = SigningKey::from_bytes(&decode32(op)?)
        .sign(&grant_revoke_signing_bytes(
            &channel,
            &digest,
            grant.grant.expires_at,
        ))
        .to_bytes();
    let (status, _) = post(
        cfg,
        &format!("/channel/{}/grant-revoke", contact.channel),
        None,
        &json!({
            "grant_digest": hex::encode(&digest),
            "expires_at": grant.grant.expires_at,
            "operator_sig": hex::encode(&sig),
        }),
    )?;
    expect_ok(status)
}
