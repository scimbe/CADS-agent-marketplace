//! The real path end to end: TCP, one root relay, two leaf relays, sealed frames, clients that drop
//! their connection, keep editing offline and reconnect. At the end every client must hold the
//! oracle's state (every delta anyone produced).

use bp_collab_crdt::net::{Client, Msg, RelayConfig, RelayServer};
use bp_collab_crdt::relay::TILE_ANY;
use bp_collab_crdt::outbox::Outbox;
use bp_collab_crdt::wire::DocKey;
use bp_collab_crdt::{Delta, Doc, Prop, ShapeId, Value};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::net::TcpListener;

const SECRET: [u8; 32] = [42; 32];
const DOC: [u8; 16] = [7; 16];

async fn relay(upstream: Option<SocketAddr>) -> SocketAddr {
    let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = l.local_addr().unwrap();
    let cfg = RelayConfig { tick: Duration::from_millis(20), upstream, buffer: 64 };
    tokio::spawn(RelayServer::new(cfg).serve(l));
    addr
}

struct Editor {
    doc: Doc,
    outbox: Outbox,
    hwm: u64,
}

impl Editor {
    fn take(&mut self, key: &DocKey, frames: &[bp_collab_crdt::wire::WireFrame]) {
        for f in frames {
            let d = key.open(f).expect("a member's frame opens");
            self.doc.apply(&d);
            self.outbox.acknowledge(&d.key, d.stamp);
        }
    }
}

/// One editor's whole life: connect, edit, sometimes vanish and come back, until `stop`; then flush
/// and wait until the relay has echoed everything.
async fn editor(id: u64, addr: SocketAddr, catalog: Arc<Mutex<Vec<ShapeId>>>, log: Arc<Mutex<Vec<Delta>>>, stop: Instant) -> Doc {
    let epoch = Instant::now();
    let key = DocKey::new(&SECRET);
    let token = DocKey::relay_token(&SECRET);
    let mut rng = ChaCha8Rng::seed_from_u64(id);
    let mut e = Editor { doc: Doc::new(rng.gen::<u64>() | 1), outbox: Outbox::default(), hwm: 0 };
    let mut quiet_since: Option<Instant> = None;
    loop {
        let mut c = Client::connect(addr, DOC, token, e.hwm, e.doc.replica(), &[]).await.unwrap();
        e.outbox.requeue_unacked();
        let online_for = Duration::from_millis(rng.gen_range(300..1500));
        let session_end = Instant::now() + online_for;
        loop {
            let now = Instant::now();
            if now < stop && rng.gen_bool(0.6) {
                let shapes = catalog.lock().unwrap().clone();
                let ds = if shapes.is_empty() || rng.gen_bool(0.1) {
                    let (sid, ds) = e.doc.create(1, None);
                    catalog.lock().unwrap().push(sid);
                    ds
                } else {
                    let s = shapes[rng.gen_range(0..shapes.len())];
                    vec![e.doc.set(s, [Prop::X, Prop::Y, Prop::FILL][rng.gen_range(0..3)], Value::Int(rng.gen_range(0..1000)))]
                };
                log.lock().unwrap().extend(ds.iter().cloned());
                ds.into_iter().for_each(|d| e.outbox.push(d));
            }
            let ms = Instant::now().duration_since(epoch).as_millis() as u64;
            let frames: Vec<_> = e.outbox.take(ms).iter().map(|(d, t)| key.seal(d, *t)).collect();
            if !frames.is_empty() && c.submit(frames).await.is_err() {
                break;
            }
            let deadline = tokio::time::sleep(Duration::from_millis(15));
            tokio::pin!(deadline);
            loop {
                tokio::select! {
                    m = c.next() => match m {
                        Some(Msg::Batch { seq, frames, .. }) => { e.take(&key, &frames); e.hwm = e.hwm.max(seq); }
                        Some(Msg::CatchUp { upto, frames, last, .. }) => { e.take(&key, &frames); if last { e.hwm = e.hwm.max(upto); } }
                        Some(Msg::Error(t)) => panic!("relay error: {t}"),
                        _ => break,
                    },
                    _ = &mut deadline => break,
                }
            }
            if now >= stop {
                if e.outbox.is_idle() {
                    let since = *quiet_since.get_or_insert(now);
                    if now - since > Duration::from_millis(1500) {
                        return e.doc;
                    }
                } else {
                    quiet_since = None;
                    e.outbox.requeue_due(ms, 300);
                }
            } else if now > session_end && rng.gen_bool(0.5) {
                // Drop the connection (tunnel, lift, airplane) and keep editing offline for a while.
                drop(c);
                let offline_until = Instant::now() + Duration::from_millis(rng.gen_range(100..600));
                while Instant::now() < offline_until && Instant::now() < stop {
                    let shapes = catalog.lock().unwrap().clone();
                    if !shapes.is_empty() {
                        let s = shapes[rng.gen_range(0..shapes.len())];
                        let d = e.doc.set(s, Prop::W, Value::Int(rng.gen_range(0..100)));
                        log.lock().unwrap().push(d.clone());
                        e.outbox.push(d);
                    }
                    tokio::time::sleep(Duration::from_millis(20)).await;
                }
                break;
            }
        }
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn editors_on_a_relay_tree_over_tcp_converge_to_the_oracle() {
    let root = relay(None).await;
    let leaves = [relay(Some(root)).await, relay(Some(root)).await];
    let catalog = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::new(Mutex::new(Vec::new()));
    let stop = Instant::now() + Duration::from_secs(4);
    let n = 120;
    let tasks: Vec<_> = (0..n)
        .map(|i| tokio::spawn(editor(i, leaves[i as usize % 2], catalog.clone(), log.clone(), stop)))
        .collect();
    let mut docs = Vec::new();
    for t in tasks {
        docs.push(tokio::time::timeout(Duration::from_secs(60), t).await.expect("editor finished").unwrap());
    }
    let mut oracle = Doc::new(0);
    for d in log.lock().unwrap().iter() {
        oracle.apply(d);
    }
    let want = oracle.state_hash();
    let differing = docs.iter().filter(|d| d.state_hash() != want).count();
    assert!(log.lock().unwrap().len() > 2_000, "enough edits to mean something");
    assert_eq!(differing, 0, "{differing} of {n} editors differ from the oracle");
}

#[tokio::test]
async fn a_wrong_token_is_refused() {
    let root = relay(None).await;
    let mut a = Client::connect(root, DOC, DocKey::relay_token(&SECRET), 0, 1, &[]).await.unwrap();
    assert!(matches!(a.next().await, Some(Msg::CatchUp { .. })));
    let mut b = Client::connect(root, DOC, [0; 32], 0, 2, &[]).await.unwrap();
    assert!(matches!(b.next().await, Some(Msg::Error(_))));
}

/// A phone subscribed to tile 1 gets tile 1 and tile-less frames in real time, an empty batch for
/// the rest (the gap stays visible), and everything on an explicit fetch.
#[tokio::test]
async fn a_viewport_subscriber_gets_its_tiles_in_real_time_and_the_rest_on_fetch() {
    let root = relay(None).await;
    let key = DocKey::new(&SECRET);
    let token = DocKey::relay_token(&SECRET);
    let mut phone = Client::connect(root, [9; 16], token, 0, 5, &[1]).await.unwrap();
    assert!(matches!(phone.next().await, Some(Msg::CatchUp { req: 0, .. })));
    let mut writer = Client::connect(root, [9; 16], token, 0, 11, &[]).await.unwrap();
    let mut doc = Doc::new(11);
    let (s, _) = doc.create(1, None);
    let in1 = key.seal(&doc.set(s, Prop::X, Value::Int(1)), [1, 1]);
    let in2 = key.seal(&doc.set(s, Prop::Y, Value::Int(2)), [2, 2]);
    let any = key.seal(&doc.set(s, Prop::FILL, Value::Int(3)), [TILE_ANY, TILE_ANY]);
    writer.submit(vec![in1.clone(), in2.clone(), any.clone()]).await.unwrap();
    let seq = loop {
        match phone.next().await {
            Some(Msg::Batch { seq, frames, .. }) => {
                let mut got: Vec<_> = frames.iter().map(|f| f.route).collect();
                got.sort();
                let mut want = vec![in1.route, any.route];
                want.sort();
                assert_eq!(got, want);
                break seq;
            }
            Some(_) => continue,
            None => panic!("connection closed"),
        }
    };
    phone.fetch(7, 0, &[]).await.unwrap();
    loop {
        if let Some(Msg::CatchUp { req: 7, upto, frames, last: true }) = phone.next().await {
            assert_eq!(upto, seq);
            assert_eq!(frames.len(), 3);
            break;
        }
    }
}
