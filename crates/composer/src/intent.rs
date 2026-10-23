//! Deterministic intent recognition: keywords, numbers with units, features. No language model.
use crate::catalog::{Blueprint, Catalog, ParamType, Parameter};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Intent {
    /// Chosen blueprints with their score, best first (ties by id).
    pub blueprints: Vec<(String, u32)>,
    /// Per chosen blueprint: parameters found in the prompt (defaults are not filled in).
    pub params: BTreeMap<String, BTreeMap<String, f64>>,
    /// `<blueprint>.<parameter>` values that come from a number word without digit (`Millionen`), an order of magnitude.
    pub estimated: BTreeSet<String>,
    pub questions: Vec<String>,
    pub confidence: f64,
}

/// Person nouns accepted as unit for parameters that count people.
const PERSON_WORDS: &[&str] = &[
    "bauleiter", "mitarbeiter", "mitarbeitende", "kollegen", "leute", "mitglieder", "anwender", "kunden", "gaeste",
    "mitspieler", "spieler", "member", "members", "employees", "colleagues", "players", "customers", "guests",
    "persons", "student", "studenten", "schueler", "fahrer", "drivers",
];
const PERSON_MARKERS: &[&str] = &["personen", "people", "nutzer", "users"];

/// Lowercase, umlauts folded, punctuation to space; `.`/`,` kept between digits, `-` between alphanumerics.
pub fn normalize(text: &str) -> String {
    let mut chars: Vec<char> = Vec::new();
    for c in text.chars() {
        match c {
            'ä' | 'Ä' => chars.extend(['a', 'e']),
            'ö' | 'Ö' => chars.extend(['o', 'e']),
            'ü' | 'Ü' => chars.extend(['u', 'e']),
            'ß' => chars.extend(['s', 's']),
            _ => chars.extend(c.to_lowercase()),
        }
    }
    let mut out = String::with_capacity(chars.len());
    for (i, &c) in chars.iter().enumerate() {
        let prev = i.checked_sub(1).map(|j| chars[j]);
        let next = chars.get(i + 1).copied();
        let both = |f: fn(char) -> bool| prev.is_some_and(f) && next.is_some_and(f);
        let keep = match c {
            '.' | ',' => both(|x| x.is_ascii_digit()),
            '-' => both(|x| x.is_alphanumeric()),
            _ => c.is_alphanumeric(),
        };
        out.push(if keep { c } else { ' ' });
    }
    out
}

/// Normalized tokens; hyphenated words are split (`audio-spatialization`, `sub-50ms-latenz`), a number glued to a
/// suffix (`10k`, `50ms`) is split in two and a `sub` before a number is dropped.
fn tokens(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for t in normalize(text).split_whitespace() {
        let parts: Vec<&str> = t.split('-').collect();
        for (k, part) in parts.iter().enumerate() {
            if *part == "sub" && parts.get(k + 1).is_some_and(|n| n.starts_with(|c: char| c.is_ascii_digit())) {
                continue;
            }
            match part.find(|c: char| c.is_alphabetic()) {
                Some(i) if i > 0 && part.as_bytes()[0].is_ascii_digit() && parse_plain(&part[..i]).is_some() => {
                    out.push(part[..i].to_string());
                    out.push(part[i..].to_string());
                }
                _ => out.push(part.to_string()),
            }
        }
    }
    out
}

/// Parses `10.000`, `10,000`, `10000`, `1.5`, `1,5`, `1.234,5`; `None` if not a plain number.
fn parse_plain(t: &str) -> Option<f64> {
    if t.is_empty() || !t.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ',') || !t.as_bytes()[0].is_ascii_digit() {
        return None;
    }
    let is_group = |sep: char| {
        let parts: Vec<&str> = t.split(sep).collect();
        parts.len() > 1 && parts[0].len() <= 3 && parts[0] != "0" && parts[1..].iter().all(|p| p.len() == 3)
    };
    let (dot, comma) = (t.contains('.'), t.contains(','));
    let canonical = if dot && comma {
        let (dec, grp) = if t.rfind('.') > t.rfind(',') { ('.', ',') } else { (',', '.') };
        if t.matches(dec).count() != 1 {
            return None;
        }
        t.replace(grp, "").replace(dec, ".")
    } else if dot || comma {
        let sep = if dot { '.' } else { ',' };
        if is_group(sep) {
            t.replace(sep, "")
        } else if t.matches(sep).count() == 1 {
            t.replace(sep, ".")
        } else {
            return None;
        }
    } else {
        t.to_string()
    };
    canonical.parse().ok()
}

fn multiplier(word: &str) -> Option<f64> {
    match word {
        "k" | "tsd" | "tausend" | "thousand" => Some(1e3),
        "mio" | "mill" | "million" | "millionen" | "millions" => Some(1e6),
        "mrd" | "milliarde" | "milliarden" | "billion" | "billions" => Some(1e9),
        _ => None,
    }
}

/// Number words without a digit: an order of magnitude only.
fn magnitude(word: &str) -> Option<f64> {
    match word {
        "millionen" | "millions" => Some(1e6),
        "tausende" | "thousands" => Some(1e3),
        "hunderte" | "hundreds" => Some(1e2),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy)]
struct Num {
    /// From a number word (`Millionen`), not from a digit.
    estimated: bool,
    value: f64,
    start: usize,
    /// One past the last token (multiplier word included).
    end: usize,
}

fn numbers_in(toks: &[String]) -> Vec<Num> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < toks.len() {
        if let Some(v) = parse_plain(&toks[i]) {
            match toks.get(i + 1).and_then(|w| multiplier(w)) {
                Some(m) => out.push(Num { estimated: false, value: v * m, start: i, end: i + 2 }),
                None => out.push(Num { estimated: false, value: v, start: i, end: i + 1 }),
            }
            i = out.last().unwrap().end;
        } else if let Some(v) = magnitude(&toks[i]) {
            out.push(Num { estimated: true, value: v, start: i, end: i + 1 });
            i += 1;
        } else {
            i += 1;
        }
    }
    out
}

/// All numbers of a prompt, in order (`10 tsd` -> 10000, `1,5 millionen` -> 1500000).
pub fn numbers(text: &str) -> Vec<f64> {
    numbers_in(&tokens(text)).iter().map(|n| n.value).collect()
}

/// Single word: >= 5 chars match as word start, shorter ones as whole word (or plural `s`).
fn word_matches(kw: &str, tok: &str) -> bool {
    if kw.chars().count() >= 5 {
        tok.starts_with(kw)
    } else {
        tok == kw || (kw.len() >= 4 && tok.strip_suffix('s') == Some(kw))
    }
}

/// Positions in `toks` where the keyword (one or several words) starts.
fn find_keyword(kw: &[String], toks: &[String]) -> Vec<usize> {
    if kw.is_empty() || toks.len() < kw.len() {
        return Vec::new();
    }
    (0..=toks.len() - kw.len())
        .filter(|&i| kw.iter().zip(&toks[i..]).all(|(k, t)| word_matches(k, t)))
        .collect()
}

fn kw_words(kw: &str) -> Vec<String> {
    normalize(kw).replace('-', " ").split_whitespace().map(String::from).collect()
}

fn score(bp: &Blueprint, toks: &[String]) -> u32 {
    bp.intent
        .keywords
        .iter()
        .filter(|(k, _)| !find_keyword(&kw_words(k), toks).is_empty())
        .map(|(_, w)| *w)
        .sum()
}

fn unit_words(p: &Parameter) -> Vec<String> {
    let mut units: Vec<String> = p.units.iter().map(|u| normalize(u).trim().to_string()).collect();
    if units.iter().any(|u| PERSON_MARKERS.contains(&u.as_str())) {
        units.extend(PERSON_WORDS.iter().map(|s| s.to_string()));
    }
    units
}

/// Nearest unused number up to three tokens before or two after a unit word.
fn nearest(units: &[String], nums: &[Num], used: &BTreeSet<usize>, toks: &[String]) -> Option<usize> {
    let mut best: Option<(usize, usize, usize)> = None; // (distance, after?, number index)
    for (u, tok) in toks.iter().enumerate() {
        if !units.iter().any(|w| word_matches(w, tok)) {
            continue;
        }
        for (ni, n) in nums.iter().enumerate().filter(|(ni, _)| !used.contains(ni)) {
            let cand = if n.end <= u && u - (n.end - 1) <= 3 {
                Some((u - (n.end - 1), 0))
            } else if n.start > u && n.start - u <= 2 {
                Some((n.start - u, 1))
            } else {
                None
            };
            if let Some((d, after)) = cand {
                if best.is_none_or(|(bd, ba, bi)| (d, after, ni) < (bd, ba, bi)) {
                    best = Some((d, after, ni));
                }
            }
        }
    }
    best.map(|b| b.2)
}

fn check(bp: &Blueprint, p: &Parameter, v: f64, questions: &mut Vec<String>) -> Option<f64> {
    if v < p.min || v > p.max {
        questions.push(format!(
            "{}.{}: {} is outside [{}, {}]; value discarded, please restate it",
            bp.id, p.name, v, p.min, p.max
        ));
        return None;
    }
    if p.kind == ParamType::Int && v.fract() != 0.0 {
        questions.push(format!("{}.{}: {} is not a whole number; value discarded, please restate it", bp.id, p.name, v));
        return None;
    }
    Some(v)
}

fn is_ms(toks: &[String], n: &Num) -> bool {
    toks.get(n.end).is_some_and(|w| matches!(w.as_str(), "ms" | "millisekunden" | "milliseconds" | "millisecond"))
}

fn extract(
    bp: &Blueprint,
    toks: &[String],
    nums: &[Num],
    estimated: &mut BTreeSet<String>,
    questions: &mut Vec<String>,
) -> BTreeMap<String, f64> {
    let mut found = BTreeMap::new();
    let mut used = BTreeSet::new();
    // a number in milliseconds belongs to the latency, never to a unit word next to it
    let latency = bp.parameters.iter().find(|p| p.name == "latency_ms");
    if latency.is_some() {
        used.extend(nums.iter().enumerate().filter(|(_, n)| is_ms(toks, n)).map(|(i, _)| i));
    }
    for p in &bp.parameters {
        // latency in milliseconds: `sub-50ms`, `< 50 ms`, `unter 50 ms`
        if p.name == "latency_ms" {
            if let Some(n) = nums.iter().find(|n| is_ms(toks, n)) {
                if let Some(v) = check(bp, p, n.value, questions) {
                    found.insert(p.name.clone(), v);
                }
            }
            continue;
        }
        if !p.units.is_empty() {
            if let Some(ni) = nearest(&unit_words(p), nums, &used, toks) {
                used.insert(ni);
                if let Some(v) = check(bp, p, nums[ni].value, questions) {
                    found.insert(p.name.clone(), v);
                    if nums[ni].estimated {
                        estimated.insert(format!("{}.{}", bp.id, p.name));
                    }
                }
            }
        }
        if !p.flags.is_empty() {
            let hits: Vec<f64> = p
                .flags
                .iter()
                .filter(|(k, _)| !find_keyword(&kw_words(k), toks).is_empty())
                .map(|(_, v)| *v)
                .collect();
            if !hits.is_empty() {
                let mean = hits.iter().sum::<f64>() / hits.len() as f64;
                if let Some(v) = check(bp, p, mean, questions) {
                    found.insert(p.name.clone(), v);
                }
            }
        }
    }
    found
}

/// Resolves a prompt against the catalog without any language model.
pub fn recognize(catalog: &Catalog, prompt: &str) -> Intent {
    let toks = tokens(prompt);
    let nums = numbers_in(&toks);
    let mut scored: Vec<(&Blueprint, u32)> = catalog.blueprints.iter().map(|b| (b, score(b, &toks))).collect();
    scored.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.id.cmp(&b.0.id)));

    let chosen: Vec<(&Blueprint, u32)> = scored.iter().copied().filter(|(b, s)| *s >= b.intent.threshold).collect();
    let mut questions = Vec::new();
    let mut params = BTreeMap::new();
    let mut estimated = BTreeSet::new();
    for (b, _) in &chosen {
        params.insert(b.id.clone(), extract(b, &toks, &nums, &mut estimated, &mut questions));
    }
    let confidence = match chosen.first() {
        None => {
            let list: Vec<String> = scored.iter().take(2).map(|(b, s)| format!("{} (score {}/{})", b.id, s, b.intent.threshold)).collect();
            questions.push(format!("No blueprint is clear enough; closest candidates: {}. Which one do you mean?", list.join(", ")));
            0.0
        }
        Some((b, s)) => {
            let c = (*s as f64 / (2 * b.intent.threshold) as f64).min(1.0);
            if questions.is_empty() { c } else { c * 0.75 }
        }
    };
    Intent {
        blueprints: chosen.iter().map(|(b, s)| (b.id.clone(), *s)).collect(),
        params,
        estimated,
        questions,
        confidence,
    }
}
