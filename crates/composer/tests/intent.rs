use composer::intent::{normalize, numbers};
use composer::{recognize, Catalog};

fn cat() -> Catalog {
    Catalog::embedded().unwrap()
}

fn ids(i: &composer::Intent) -> Vec<&str> {
    i.blueprints.iter().map(|(id, _)| id.as_str()).collect()
}

#[test]
fn operator_prompt_collab() {
    let p = "Echtzeit-Kollaborations-Engines im Web (z. B. Figma, Google Docs bei 10.000 simultanen Editoren) \
             mit CRDTs oder Operational Transformation";
    let i = recognize(&cat(), p);
    assert_eq!(ids(&i), ["collab-crdt"]);
    assert_eq!(i.params["collab-crdt"]["editors"], 10000.0);
    assert!(i.questions.is_empty(), "{:?}", i.questions);
}

#[test]
fn whiteboard_english() {
    let i = recognize(&cat(), "Build a local-first whiteboard for 500 people on iPad and Android, works offline");
    assert_eq!(ids(&i), ["collab-crdt"]);
    assert_eq!(i.params["collab-crdt"]["editors"], 500.0);
    assert!(i.params["collab-crdt"]["mobile_share"] >= 0.9);
}

#[test]
fn baustelle_german() {
    let i = recognize(&cat(), "Baustellen-App: 40 Bauleiter erfassen Mängel offline im Keller");
    assert_eq!(ids(&i), ["collab-crdt"]);
    assert_eq!(i.params["collab-crdt"]["editors"], 40.0);
}

#[test]
fn too_little_never_guesses() {
    let i = recognize(&cat(), "Eine Kasse für ein Festival");
    assert!(i.blueprints.is_empty());
    assert!(i.params.is_empty());
    assert_eq!(i.confidence, 0.0);
    assert_eq!(i.questions.len(), 1);
    assert!(i.questions[0].contains("collab-crdt"));
}

#[test]
fn out_of_range_is_asked_not_clamped() {
    let i = recognize(&cat(), "Local-first CRDT whiteboard for 10 Mrd. Editoren");
    assert_eq!(ids(&i), ["collab-crdt"]);
    assert!(!i.params["collab-crdt"].contains_key("editors"));
    assert!(i.questions.iter().any(|q| q.contains("editors") && q.contains("outside")), "{:?}", i.questions);
}

#[test]
fn number_formats() {
    let table: &[(&str, f64)] = &[
        ("10.000", 10000.0),
        ("10,000", 10000.0),
        ("10000", 10000.0),
        ("10k", 10000.0),
        ("10 tsd", 10000.0),
        ("10 tausend", 10000.0),
        ("1 mio", 1e6),
        ("1,5 millionen", 1.5e6),
        ("2 million", 2e6),
        ("1.5", 1.5),
        ("1,5", 1.5),
        ("1.000.000", 1e6),
        ("10 Mrd.", 1e10),
    ];
    for (text, want) in table {
        assert_eq!(numbers(text), [*want], "{text}");
    }
}

#[test]
fn umlauts_and_punctuation() {
    assert_eq!(normalize("Mängel, Größe über Öl!"), "maengel  groesse ueber oel ");
    assert_eq!(normalize("local-first sub-50ms 1.5, x."), "local-first sub-50ms 1.5  x ");
    let i = recognize(&cat(), "Kollaborative Baustellen-Checkliste, Mängel offline, 12 Personen");
    assert_eq!(ids(&i), ["collab-crdt"]);
    assert_eq!(i.params["collab-crdt"]["editors"], 12.0);
}

#[test]
fn pos_is_not_position() {
    let c = cat();
    // crdt (5) + pos (1) reaches the threshold of 6; "position" must not count as "pos"
    let with = recognize(&c, "crdt pos");
    assert_eq!(with.blueprints, [("collab-crdt".to_string(), 6)]);
    let without = recognize(&c, "crdt position");
    assert!(without.blueprints.is_empty());
}

#[test]
fn deterministic() {
    let c = cat();
    let p = "Spatial audio voice chat and a collaborative CRDT whiteboard for 20.000 listeners and 300 editors, mobile";
    let a = recognize(&c, p);
    for _ in 0..20 {
        assert_eq!(recognize(&c, p), a);
    }
    assert_eq!(a.blueprints.len(), 2);
}
