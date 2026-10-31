//! Stands in for one phone in `scripts/peer-e2e.sh`: two of these as separate processes run the
//! real invite, redeem and join against a local edge and control plane.
//!
//! Environment: PEER_CP, PEER_FRONT_DOOR, PEER_CA_FILE (DER), PEER_TOKEN (inviter only).
//! Every outcome goes to stdout as one line so the script can compare it.

use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use std::time::{Duration, Instant};

use mobile_core::peer::ffi::{PeerEvent, PeerSession};
use mobile_core::peer::invite::Contact;
use mobile_core::peer::policy::{Envelope, Inbound, Policy};
use mobile_core::peer::session::{dial_front_door, Established, Joined};
use mobile_core::peer::{cp, PeerConfig, PeerError};
use serde_json::json;
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

const JOIN_WAIT: Duration = Duration::from_secs(40);
const CAPABILITY: &str = "idea.today";

/// Records every byte above TLS: exactly what the edge decrypts from this phone and what it
/// forwards to it. Whatever a compromised edge could log is in this file.
struct Tap<S> {
    inner: S,
    log: Arc<Mutex<Vec<u8>>>,
}

impl<S: AsyncRead + Unpin> AsyncRead for Tap<S> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let before = buf.filled().len();
        let r = Pin::new(&mut self.inner).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = r {
            self.log
                .lock()
                .unwrap()
                .extend_from_slice(&buf.filled()[before..]);
        }
        r
    }
}

impl<S: AsyncWrite + Unpin> AsyncWrite for Tap<S> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        let r = Pin::new(&mut self.inner).poll_write(cx, buf);
        if let Poll::Ready(Ok(n)) = r {
            self.log.lock().unwrap().extend_from_slice(&buf[..n]);
        }
        r
    }
    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("{name} is required"))
}

fn config() -> PeerConfig {
    PeerConfig {
        control_plane_url: env("PEER_CP"),
        front_door: env("PEER_FRONT_DOOR"),
        edge_ca_der: std::fs::read(env("PEER_CA_FILE")).expect("CA file"),
        sni: String::new(),
    }
}

fn load(path: &str) -> Contact {
    serde_json::from_slice(&std::fs::read(path).expect("contact file")).expect("contact json")
}

fn save(path: &str, c: &Contact) {
    std::fs::write(path, serde_json::to_vec(c).unwrap()).expect("contact file");
}

/// The join loop of `session::connect`, with the tap in the stream.
async fn join(
    cfg: &PeerConfig,
    contact: &Contact,
    log: Arc<Mutex<Vec<u8>>>,
) -> Result<Established<impl AsyncRead + AsyncWrite + Unpin + Send>, PeerError> {
    let until = Instant::now() + JOIN_WAIT;
    loop {
        let stream = Tap {
            inner: dial_front_door(cfg).await?,
            log: log.clone(),
        };
        match Established::join(stream, contact).await? {
            Joined::Paired(s) => return Ok(*s),
            Joined::ParkExpired if Instant::now() < until => {}
            Joined::ParkExpired => return Err(PeerError::PeerOffline),
        }
    }
}

/// One chat turn in both directions, then the checks that need a live session.
async fn run_inviter(
    cfg: &PeerConfig,
    contact_file: &str,
    tap_file: &str,
    secret: &str,
) -> Result<(), PeerError> {
    let mut contact = load(contact_file);
    let log = Arc::new(Mutex::new(Vec::new()));
    let mut s = join(cfg, &contact, log.clone()).await?;
    println!("code {}", s.code);
    // The pin of first contact: from now on only this key is accepted.
    contact.peer_noise = Some(ct_common::hex::encode(&s.peer_noise));
    save(contact_file, &contact);

    let mut policy = Policy::new(&[], &[]);
    s.send(&Envelope::Text {
        text: secret.to_string(),
    })
    .await?;
    match s.next(&mut policy).await? {
        Inbound::Text(t) => println!("got text {t}"),
        other => println!("unexpected {other:?}"),
    }
    // What a hostile peer would try: all three must end without anything happening over there.
    s.send_raw(json!({"jsonrpc":"2.0","method":"tools/call","params":{"name":"shell","arguments":{"cmd":"id"}}}).to_string().as_bytes()).await?;
    s.send_raw(json!({"k":"exec","cmd":"id"}).to_string().as_bytes())
        .await?;
    s.send(&Envelope::CapReq {
        id: 1,
        cap: "contacts.read".to_string(),
    })
    .await?;
    if let Inbound::CapResult { id, ok, .. } = s.next(&mut policy).await? {
        println!("cap {id} ok={ok}");
    }
    // An allow-listed capability: the other phone asks its user and answers only after the tap.
    s.send(&Envelope::CapReq {
        id: 2,
        cap: CAPABILITY.to_string(),
    })
    .await?;
    if let Inbound::CapResult { id, ok, data } = s.next(&mut policy).await? {
        println!("cap {id} ok={ok} data={}", data.unwrap_or_default());
    }
    std::fs::write(tap_file, log.lock().unwrap().as_slice()).expect("tap file");
    Ok(())
}

async fn run_invitee(
    cfg: &PeerConfig,
    contact_file: &str,
    tap_file: &str,
    secret: &str,
) -> Result<(), PeerError> {
    let contact = load(contact_file);
    let log = Arc::new(Mutex::new(Vec::new()));
    let mut s = join(cfg, &contact, log.clone()).await?;
    println!("code {}", s.code);
    let mut policy = Policy::new(&[CAPABILITY.to_string()], &[]);
    match s.next(&mut policy).await? {
        Inbound::Text(t) => println!("got text {t}"),
        other => println!("unexpected {other:?}"),
    }
    s.send(&Envelope::Text {
        text: secret.to_string(),
    })
    .await?;
    // Everything hostile was dropped or auto-refused: the next event is the listed request.
    match s.next(&mut policy).await? {
        Inbound::ApprovalNeeded { id, cap } => {
            println!("ask user id={id} cap={cap}");
            println!("user tapped");
            let answer = policy.approve(id, json!({"idea": "Heute: Wolken zeichnen"}))?;
            s.send(&answer).await?;
        }
        other => println!("unexpected {other:?}"),
    }
    // Hold the session until the inviter has read the answer.
    let _ = tokio::time::timeout(Duration::from_secs(5), s.recv_raw()).await;
    std::fs::write(tap_file, log.lock().unwrap().as_slice()).expect("tap file");
    Ok(())
}

/// The apps' own path, `PeerSession`, as a pipe: each stdin line goes out as an app message, each
/// message that arrives is printed. `scripts/collab-channel.js` drives two of these.
fn pipe(cfg: PeerConfig, contact_file: &str, ns: &str) -> Result<(), PeerError> {
    let contact = std::fs::read_to_string(contact_file).expect("contact file");
    let session = Arc::new(PeerSession::connect(
        cfg,
        contact,
        Vec::new(),
        vec![ns.to_string()],
        30,
    )?);
    std::fs::write(contact_file, session.contact_json()).expect("contact file");
    println!("connected {}", session.verification_code());
    let sender = session.clone();
    let ns = ns.to_string();
    std::thread::spawn(move || {
        for line in std::io::stdin().lines().map_while(Result::ok) {
            if sender.send_app(ns.clone(), line).is_err() {
                break;
            }
        }
    });
    loop {
        match session.next_event(1000) {
            Some(PeerEvent::App { body_json, .. }) => println!("msg {body_json}"),
            Some(PeerEvent::PeerLeft) => println!("left"),
            Some(PeerEvent::Closed) => {
                println!("closed");
                return Ok(());
            }
            _ => {}
        }
    }
}

#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let arg = |i: usize| {
        args.get(i)
            .map(String::as_str)
            .unwrap_or_else(|| panic!("missing argument {i}"))
    };
    let cfg = config();
    let result: Result<(), PeerError> = match arg(0) {
        "invite" => {
            let (contact_file, link_file, ttl) = (arg(1), arg(2), arg(3).parse().expect("ttl"));
            let c = cfg.clone();
            tokio::task::spawn_blocking(move || cp::create_invite(&c, &env("PEER_TOKEN"), ttl))
                .await
                .unwrap()
                .map(|inv| {
                    save(contact_file, &inv.contact);
                    std::fs::write(link_file, &inv.link).expect("link file");
                    println!("link {} chars", inv.link.len());
                })
        }
        "accept" => {
            let (link_file, contact_file) = (arg(1), arg(2));
            let link = std::fs::read_to_string(link_file).expect("link file");
            let c = cfg.clone();
            tokio::task::spawn_blocking(move || cp::accept_invite(&c, &link))
                .await
                .unwrap()
                .map(|contact| {
                    save(contact_file, &contact);
                    println!("accepted");
                })
        }
        "run-inviter" => run_inviter(&cfg, arg(1), arg(2), arg(3)).await,
        "run-invitee" => run_invitee(&cfg, arg(1), arg(2), arg(3)).await,
        "pipe" => {
            let (c, file, ns) = (cfg.clone(), arg(1).to_string(), arg(2).to_string());
            tokio::task::spawn_blocking(move || pipe(c, &file, &ns))
                .await
                .unwrap()
        }
        "join-once" => join(&cfg, &load(arg(1)), Arc::default())
            .await
            .map(|_| println!("joined")),
        "revoke" => {
            let contact = load(arg(1));
            let c = cfg.clone();
            tokio::task::spawn_blocking(move || cp::revoke_peer(&c, &contact))
                .await
                .unwrap()
                .map(|()| println!("revoked"))
        }
        other => panic!("unknown command {other}"),
    };
    if let Err(e) = result {
        println!("error {e:?}");
        std::process::exit(3);
    }
}
