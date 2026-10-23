use composer::{recognize, Catalog};

fn cat() -> Catalog {
    Catalog::embedded().unwrap()
}

fn ids(i: &composer::Intent) -> Vec<&str> {
    i.blueprints.iter().map(|(id, _)| id.as_str()).collect()
}

const AUDIO: &str = "Audio-Spatialization & Live-Streaming für Großevents (z. B. virtuelle Konzerte / Metaverse): Millionen simultane \
Audioströme müssen basierend auf der 3D-Distanz und Raumakustik der Avatare zueinander gemischt und mit Sub-50ms-Latenz \
kodiert an die Endgeräte zurückgespielt werden";

const BOTH: &str = "Der Market Place soll eine Echtzeit-Kollaborations-Engine (Figma, Google Docs bei 10.000 simultanen Editoren, CRDTs) \
erstellen und ein Audio-Spatialization & Live-Streaming für Großevents mit Millionen Audioströmen unter 50 ms bauen.";

#[test]
fn audio_part() {
    let i = recognize(&cat(), AUDIO);
    assert_eq!(ids(&i), ["spatial-audio"]);
    assert_eq!(i.params["spatial-audio"]["listeners"], 1_000_000.0);
    assert_eq!(i.params["spatial-audio"]["latency_ms"], 50.0);
    assert!(i.estimated.contains("spatial-audio.listeners"));
    assert!(i.questions.is_empty(), "{:?}", i.questions);
}

#[test]
fn whole_task_picks_both() {
    let i = recognize(&cat(), BOTH);
    let mut got = ids(&i);
    got.sort();
    assert_eq!(got, ["collab-crdt", "spatial-audio"]);
    assert_eq!(i.params["collab-crdt"]["editors"], 10000.0);
    assert_eq!(i.params["spatial-audio"]["listeners"], 1_000_000.0);
    assert_eq!(i.params["spatial-audio"]["latency_ms"], 50.0);
    assert!(!i.estimated.contains("collab-crdt.editors"));
}

#[test]
fn watch_party() {
    let i = recognize(
        &cat(),
        "Virtual stadium watch party: 1.5 million fans hear friends next to them with spatial audio on AirPods, phones only",
    );
    assert_eq!(ids(&i), ["spatial-audio"]);
    assert_eq!(i.params["spatial-audio"]["listeners"], 1_500_000.0);
    assert!(i.params["spatial-audio"]["mobile_share"] >= 0.9);
}

#[test]
fn inventory_app() {
    let i = recognize(&cat(), "Inventur-App für 300 Lagerarbeiter, Android, offline");
    assert_eq!(ids(&i), ["collab-crdt"]);
    assert_eq!(i.params["collab-crdt"]["editors"], 300.0);
    assert!(i.params["collab-crdt"]["mobile_share"] >= 0.9);
}

#[test]
fn bakery_still_asks() {
    let i = recognize(&cat(), "Mach mir eine Webseite für meinen Bäcker");
    assert!(i.blueprints.is_empty());
    assert_eq!(i.confidence, 0.0);
    assert_eq!(i.questions.len(), 1);
}
