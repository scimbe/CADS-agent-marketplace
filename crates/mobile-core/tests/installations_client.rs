//! Client against a local scripted HTTP server (plain TCP, loopback only).

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::thread;

use mobile_core::installations::*;
use mobile_core::MobileError;

struct Tok(Option<String>);
impl TokenProvider for Tok {
    fn access_token(&self) -> Option<String> {
        self.0.clone()
    }
}

#[derive(Debug, Clone)]
struct Seen {
    request_line: String,
    headers: String,
    body: String,
}

type Reply = (u16, Vec<(&'static str, String)>, String);

/// Serves `responses` in order (one connection each), records requests.
fn serve(responses: Vec<Reply>) -> (String, Arc<Mutex<Vec<Seen>>>) {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://127.0.0.1:{}", l.local_addr().unwrap().port());
    let seen = Arc::new(Mutex::new(Vec::new()));
    let s2 = seen.clone();
    thread::spawn(move || {
        for (status, hdrs, body) in responses {
            let (mut c, _) = l.accept().unwrap();
            let mut buf = Vec::new();
            let mut tmp = [0u8; 4096];
            let (head_end, clen) = loop {
                let n = c.read(&mut tmp).unwrap();
                buf.extend_from_slice(&tmp[..n]);
                if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                    let head = String::from_utf8_lossy(&buf[..p]).to_lowercase();
                    let clen = head
                        .lines()
                        .find_map(|l| l.strip_prefix("content-length: "))
                        .and_then(|v| v.trim().parse::<usize>().ok())
                        .unwrap_or(0);
                    break (p + 4, clen);
                }
                if n == 0 {
                    return;
                }
            };
            while buf.len() < head_end + clen {
                let n = c.read(&mut tmp).unwrap();
                buf.extend_from_slice(&tmp[..n]);
            }
            let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
            let (rl, hs) = head.split_once("\r\n").unwrap();
            s2.lock().unwrap().push(Seen {
                request_line: rl.to_string(),
                headers: hs.to_string(),
                body: String::from_utf8_lossy(&buf[head_end..]).to_string(),
            });
            let mut out = format!(
                "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nConnection: close\r\n",
                body.len()
            );
            for (k, v) in hdrs {
                out.push_str(&format!("{k}: {v}\r\n"));
            }
            out.push_str("\r\n");
            out.push_str(&body);
            c.write_all(out.as_bytes()).unwrap();
        }
    });
    (base, seen)
}

fn client(base: &str) -> Arc<InstallationsClient> {
    InstallationsClient::new(base.to_string(), Arc::new(Tok(Some("tok-abc".into())))).unwrap()
}

const H64: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn rec_json(rev: i64, name: &str) -> String {
    format!(
        r#"{{"id":"11111111-2222-4333-8444-555555555555","name":"{name}","template_id":"{H64}","template_digest":"{H64}","values":{{"topic":"Q3"}},"values_digest":"{H64}","components":[{{"name":"pandoc","sha256":"{H64}"}}],"manifest_ids":[],"target":{{"os":"android","device_label":"Pixel"}},"status":"draft","created_at":1,"updated_at":2,"revision":{rev}}}"#
    )
}

fn input() -> InstallationInput {
    InstallationInput {
        name: "Mein Briefing".into(),
        template_id: H64.into(),
        template_digest: H64.into(),
        values_json: r#"{"topic":"Q3"}"#.into(),
        values_digest: H64.into(),
        components: vec![ComponentRecord {
            name: "pandoc".into(),
            sha256: H64.into(),
        }],
        manifest_ids: vec![],
        target: TargetRecord {
            os: "android".into(),
            device_label: "Pixel".into(),
            agent_holder_pubkey: None,
        },
        status: None,
    }
}

#[test]
fn list_get_create_update_delete_duplicate_export() {
    let page = format!(
        r#"{{"items":[{}],"total":1,"limit":25,"offset":0}}"#,
        rec_json(1, "A")
    );
    let (base, seen) = serve(vec![
        (200, vec![], page),
        (200, vec![("ETag", "\"1\"".into())], rec_json(1, "A")),
        (201, vec![], rec_json(1, "Mein Briefing")),
        (200, vec![], rec_json(2, "B")),
        (204, vec![], String::new()),
        (201, vec![], rec_json(1, "A (copy)")),
        (
            200,
            vec![],
            r#"{"version":1,"exported_at":5,"installations":[]}"#.into(),
        ),
    ]);
    let c = client(&base);
    let p = c
        .list(Some(InstallationStatus::Draft), Some(10), Some(0))
        .unwrap();
    assert_eq!((p.total, p.items.len()), (1, 1));
    assert_eq!(p.items[0].values_json, r#"{"topic":"Q3"}"#);
    let id = p.items[0].id.clone();
    assert_eq!(c.get(id.clone()).unwrap().revision, 1);
    assert_eq!(c.create(input()).unwrap().name, "Mein Briefing");
    assert_eq!(c.update(id.clone(), 1, input()).unwrap().revision, 2);
    c.delete(id.clone(), Some(2)).unwrap();
    assert_eq!(c.duplicate(id.clone(), None).unwrap().name, "A (copy)");
    assert!(c.export().unwrap().contains("\"version\":1"));

    let s = seen.lock().unwrap();
    assert_eq!(
        s[0].request_line,
        "GET /me/installations?status=draft&limit=10&offset=0 HTTP/1.1"
    );
    assert!(s.iter().all(|r| r
        .headers
        .to_lowercase()
        .contains("authorization: bearer tok-abc")));
    assert!(s
        .iter()
        .all(|r| !r.headers.to_lowercase().contains("cookie")));
    assert!(s[2]
        .headers
        .to_lowercase()
        .contains("content-type: application/json"));
    assert!(s[2].body.contains(r#""values":{"topic":"Q3"}"#));
    assert!(!s[2].body.contains("\"status\""), "no status key when None");
    assert!(s[3].request_line.starts_with("PUT /me/installations/"));
    assert!(s[3].headers.to_lowercase().contains("if-match: \"1\""));
    assert!(s[4].request_line.starts_with("DELETE "));
    assert!(s[4].headers.to_lowercase().contains("if-match: \"2\""));
    assert!(s[5].request_line.ends_with("/duplicate HTTP/1.1"));
}

#[test]
fn conflict_409_carries_current_revision() {
    let (base, _) = serve(vec![(
        409,
        vec![],
        "revision mismatch: the installation is at revision 4; reload and retry".into(),
    )]);
    match client(&base).update("abc".into(), 2, input()) {
        Err(MobileError::Conflict { current_revision }) => assert_eq!(current_revision, Some(4)),
        other => panic!("{other:?}"),
    }
}

#[test]
fn rejected_422_names_the_path_without_the_value() {
    let msg = "values.api_key: key looks like a secret (token, ...); secrets are never stored";
    let (base, _) = serve(vec![(422, vec![], msg.into())]);
    let mut i = input();
    i.values_json = r#"{"api_key":"x"}"#.into();
    match client(&base).create(i) {
        Err(MobileError::Rejected422 {
            path,
            detail: message,
        }) => {
            assert_eq!(path, "values.api_key");
            assert!(message.contains("secret"));
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn not_found_unauthorized_and_precondition() {
    let (base, _) = serve(vec![
        (404, vec![], "installation not found".into()),
        (401, vec![], "no".into()),
        (428, vec![], "If-Match: <revision> is required".into()),
        (500, vec![], "boom".into()),
    ]);
    let c = client(&base);
    assert!(matches!(c.get("abc".into()), Err(MobileError::NotFound)));
    assert!(matches!(
        c.list(None, None, None),
        Err(MobileError::Unauthorized)
    ));
    assert!(matches!(
        c.update("abc".into(), 1, input()),
        Err(MobileError::PreconditionRequired)
    ));
    assert!(matches!(
        c.delete("abc".into(), None),
        Err(MobileError::Server { status: 500, .. })
    ));
}

#[test]
fn missing_token_means_no_request() {
    let (base, seen) = serve(vec![]);
    let c = InstallationsClient::new(base, Arc::new(Tok(None))).unwrap();
    assert!(matches!(
        c.list(None, None, None),
        Err(MobileError::Unauthorized)
    ));
    assert!(seen.lock().unwrap().is_empty());
}

#[test]
fn transport_error_does_not_leak_token() {
    // Nothing listens on this port.
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://127.0.0.1:{}", l.local_addr().unwrap().port());
    drop(l);
    match client(&base).list(None, None, None) {
        Err(MobileError::Network { detail: message }) => assert!(!message.contains("tok-abc")),
        other => panic!("{other:?}"),
    }
}

#[test]
fn redirects_are_not_followed() {
    let (base, seen) = serve(vec![(
        302,
        vec![("Location", "http://127.0.0.1:1/steal".into())],
        String::new(),
    )]);
    assert!(matches!(
        client(&base).list(None, None, None),
        Err(MobileError::Server { status: 302, .. })
    ));
    assert_eq!(seen.lock().unwrap().len(), 1);
}

#[test]
fn invalid_values_json_is_refused_locally() {
    let (base, seen) = serve(vec![]);
    let mut i = input();
    i.values_json = "[1]".into();
    assert!(matches!(
        client(&base).create(i),
        Err(MobileError::InvalidInput { .. })
    ));
    assert!(seen.lock().unwrap().is_empty());
}

#[test]
fn render_to_installation_roundtrip_input() {
    let json = include_str!("../../../manifests/prompt-templates/newsletter-briefing.json");
    let values = r##"{"topic":"x","audience":"Team","sections":["Risiken"],"max_items":3,"accent_color":"#112233"}"##;
    let r =
        mobile_core::template::render_prompt_template(json.into(), values.into(), 1_800_000_000)
            .unwrap();
    let inp = installation_input_from_render(
        "n".into(),
        r.clone(),
        values.into(),
        TargetRecord {
            os: "ios".into(),
            device_label: String::new(),
            agent_holder_pubkey: None,
        },
    );
    assert_eq!(inp.template_digest, r.template_digest);
    assert_eq!(inp.components[0].name, "pandoc");
}

#[test]
fn overwrite_builds_from_fresh_record_and_uses_fresh_revision() {
    // Fresh record on the server: revision 7, status installed, different components than the stale copy.
    let fresh =
        rec_json(7, "Server-Name").replace("\"status\":\"draft\"", "\"status\":\"installed\"");
    let (base, seen) = serve(vec![
        (200, vec![], fresh),
        (200, vec![], rec_json(8, "Meins")),
    ]);
    let r = client(&base)
        .overwrite(
            "abc".into(),
            "Meins".into(),
            Some(r#"{"topic":"neu"}"#.into()),
            Some(H64.replace('a', "b")),
        )
        .unwrap();
    assert_eq!(r.revision, 8);
    let s = seen.lock().unwrap();
    assert!(s[0].request_line.starts_with("GET /me/installations/abc"));
    assert!(s[1].request_line.starts_with("PUT /me/installations/abc"));
    assert!(
        s[1].headers.to_lowercase().contains("if-match: \"7\""),
        "fresh revision: {}",
        s[1].headers
    );
    assert!(
        s[1].body.contains(r#""status":"installed""#),
        "status comes from the fresh record: {}",
        s[1].body
    );
    assert!(s[1].body.contains(r#""name":"Meins""#) && s[1].body.contains(r#""topic":"neu""#));
}

#[test]
fn overwrite_surfaces_a_second_conflict() {
    let (base, _) = serve(vec![
        (200, vec![], rec_json(3, "x")),
        (409, vec![], "revision mismatch".into()),
    ]);
    assert!(matches!(
        client(&base).overwrite("abc".into(), "n".into(), None, None),
        Err(MobileError::Conflict {
            current_revision: None
        })
    ));
}
