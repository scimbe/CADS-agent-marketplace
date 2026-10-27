//! Best-effort secret redaction for everything that is persisted or reported: transcripts and
//! failure reasons. Hand-rolled (no regex dependency); recognises common token shapes by prefix
//! and length. This is a safety net, not a guarantee -- the primary rule is that credentials are
//! never handed to the harness at all.

const MASK: &str = "[REDACTED]";
const MASK_KEY: &str = "[REDACTED PRIVATE KEY]";

fn is_tok(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.'
}

fn is_secret_run(r: &str) -> bool {
    let n = r.len();
    let tail_ok = |prefix: &str, min: usize| r.starts_with(prefix) && n >= prefix.len() + min;
    if tail_ok("sk-", 16) {
        return true; // also covers sk-ant-, sk-proj-
    }
    if ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"]
        .iter()
        .any(|p| tail_ok(p, 20))
    {
        return true;
    }
    if tail_ok("github_pat_", 20) || tail_ok("glpat-", 16) {
        return true;
    }
    if ["xoxb-", "xoxa-", "xoxp-", "xoxr-", "xoxs-"]
        .iter()
        .any(|p| tail_ok(p, 10))
    {
        return true;
    }
    if (r.starts_with("AKIA") || r.starts_with("ASIA"))
        && n == 20
        && r.chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        return true;
    }
    if r.starts_with("AIza") && n >= 35 {
        return true;
    }
    // JWT: three base64url segments, header starts with eyJ.
    if r.starts_with("eyJ") && n >= 30 && r.matches('.').count() >= 2 {
        return true;
    }
    false
}

/// `Bearer <token>` (case-insensitive): the token runs to whitespace or a quote.
fn bearer_end(s: &str, at: usize) -> Option<usize> {
    let rest = s.get(at..)?;
    if rest.len() < 7 || !rest.as_bytes()[..7].eq_ignore_ascii_case(b"bearer ") {
        return None;
    }
    let start = at + 7;
    let len = s[start..]
        .find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == ',')
        .unwrap_or(s.len() - start);
    (len >= 8).then_some(start + len)
}

pub fn redact(input: &str) -> String {
    // 1. PEM-style private keys, whole block (or to end of input when unterminated).
    let mut text = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(b) = rest.find("-----BEGIN ") {
        let after = &rest[b + 11..];
        let header_end = after.find("-----").unwrap_or(after.len());
        if !after[..header_end].contains("KEY") {
            text.push_str(&rest[..b + 11]);
            rest = after;
            continue;
        }
        text.push_str(&rest[..b]);
        text.push_str(MASK_KEY);
        match after.find("-----END ") {
            Some(e) => {
                let tail = &after[e + 9..];
                let close = tail.find("-----").map(|c| c + 5).unwrap_or(tail.len());
                rest = &tail[close..];
            }
            None => rest = "",
        }
    }
    text.push_str(rest);

    // 2. Bearer tokens and token-shaped runs.
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < text.len() {
        if let Some(end) = bearer_end(&text, i) {
            out.push_str(&text[i..i + 7]);
            out.push_str(MASK);
            i = end;
            continue;
        }
        let c = text[i..].chars().next().unwrap();
        if is_tok(c) {
            let len = text[i..]
                .find(|c: char| !is_tok(c))
                .unwrap_or(text.len() - i);
            let run = &text[i..i + len];
            // A run is only a token if it starts a word (not a suffix of a longer identifier
            // we already split inside); `=`/`:`/`"` are delimiters, so KEY=sk-... is caught.
            if is_secret_run(run) {
                out.push_str(MASK);
            } else {
                out.push_str(run);
            }
            i += len;
        } else {
            out.push(c);
            i += c.len_utf8();
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // Fake tokens are assembled at runtime so no secret scanner flags this file.
    fn t(prefix: &str, body: &str) -> String {
        format!("{prefix}{body}")
    }

    #[test]
    fn redacts_common_token_shapes() {
        let body = "AbCdEfGhIjKlMnOpQrStUvWx0123";
        let cases = [
            t("sk-", body),
            t("sk-ant-api03-", body),
            t("ghp_", body),
            t("github_pat_", body),
            t("glpat-", body),
            t("xoxb-", "123456789012-abcdefghij"),
            t("AKIA", "ABCDEFGHIJKLMNOP"),
            t("AIza", "SyA-abcdefghijklmnopqrstuvwxyz012345"),
            t(
                "eyJ",
                "hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk",
            ),
        ];
        for c in cases {
            let text = format!("before {c} after");
            let out = redact(&text);
            assert!(!out.contains(&c), "{c} survived: {out}");
            assert_eq!(out, "before [REDACTED] after", "{c}");
        }
    }

    #[test]
    fn redacts_after_assignment_and_quotes_and_bearer() {
        let k = t("sk-ant-", "abcdefghijklmnopqrstuvwxyz");
        let out = redact(&format!("ANTHROPIC_API_KEY={k} {{\"key\":\"{k}\"}}"));
        assert!(!out.contains(&k), "{out}");
        assert!(out.contains("ANTHROPIC_API_KEY=[REDACTED]"), "{out}");
        let b = redact("Authorization: Bearer abc123/def+456==\nnext");
        assert_eq!(b, "Authorization: Bearer [REDACTED]\nnext");
        assert!(redact("authorization: bearer abcdefgh12345").ends_with("[REDACTED]"));
    }

    #[test]
    fn redacts_private_key_blocks_including_unterminated() {
        let pem = format!(
            "x -----BEGIN {} PRIVATE KEY-----\nMIIEvQIBADANBgkq\n-----END {} PRIVATE KEY----- y",
            "RSA", "RSA"
        );
        assert_eq!(redact(&pem), "x [REDACTED PRIVATE KEY] y");
        let cut = redact("a -----BEGIN PRIVATE KEY-----\nMIIEvQ");
        assert_eq!(cut, "a [REDACTED PRIVATE KEY]");
        // A certificate is not a key.
        let cert = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
        assert_eq!(redact(cert), cert);
    }

    #[test]
    fn leaves_ordinary_text_alone() {
        let s =
            "task-id sk-short ghp_x AKIAshort read_file(\"src/main.rs\") e.g. 2.1.310\nünïcode ✓";
        assert_eq!(redact(s), s);
    }
}
