// Texte der Heimseite (de/en). Woertlich aus dem Altcode, wo es sie gab (alt:start.json texts, alt:texts.json; Abzug in
// test/fixtures/home-alt-texts.json), sonst neu: Praesens, kurze Saetze. "easy" ersetzt einzelne Saetze in einfacher Sprache.
const de = {
  ask: "Wem willst du heute eine Freude machen?", field: "Sag in einem Satz, was du vorhast", hint: "Danke an Oma", fieldGo: "Weiter",
  local: "Dein Satz bleibt auf dem Gerät.",
  intents: {
    gruss: { t: "Gruß schicken", s: "Danke, Besserung, einfach so" },
    planen: { t: "Zusammen planen", s: "Termin, Umfrage, Wichteln" },
    spielen: { t: "Gegeneinander spielen", s: "Quiz, Bluff, Duell, Skat" },
    stimme: { t: "Stimme", s: "Monster, Beat, Malen, vor Ort" }
  },
  own: { t: "Eigene Karte", s: "Ein Satz, die KI baut sie", page: "Eigene Karte", soon: "Eigene Karten kommen hier hin: ein Satz, und die KI baut deine Karte. Das ist gerade in Arbeit.", blank: "Oder leer anfangen:" },
  all: "Alle Karten", allShort: "Alles",
  families: {
    gruessen: "Grüßen & Schenken", planen: "Planen & Organisieren", kennen: "Kennen & Raten", bluff: "Bluff & Taktik", geschick: "Geschick",
    tisch: "Kartentisch", raetsel: "Rätsel & Geheim", kreativ: "Wort & Kreativ", vorort: "Vor Ort, ein Handy"
  },
  months: ["JANUAR", "FEBRUAR", "MÄRZ", "APRIL", "MAI", "JUNI", "JULI", "AUGUST", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DEZEMBER"],
  days: ["SONNTAG", "MONTAG", "DIENSTAG", "MITTWOCH", "DONNERSTAG", "FREITAG", "SAMSTAG"],
  todayIs: "Heute", prevDay: "Ein Blatt zurück", nextDay: "Nächstes Blatt", toToday: "Zu heute", dayOf: "Blatt vom {d}",
  swipe: "Wischen blättert die Tage.", sheetLabel: "Kalenderblatt {d}: {t}",
  bdg: { link: "Per Link", room: "Ein Handy, reihum", bot: "Gegen Bot", solo: "Allein", game: "Spiel", photo: "Bild", sound: "Ton", card: "Karte", quest: "Rätsel", table: "Kartentisch", arcade: "Spiel", duel: "Duell", lauf: "Lauf" },
  sec: "{n} Sek", mins: "{n} Min",
  go: { turn: "Los, du fängst an", table: "Tisch aufmachen", game: "Losfliegen", sound: "Ton bauen", photo: "Meme bauen", card: "Karte machen", arcade: "Los, spielen", quest: "Rätsel bauen", default: "Mach's zu deinem" },
  soon: "kommt", soonLong: "Wird gerade neu gebaut. Merk sie dir: Sie steht dann unter Meins.", soonSave: "Merken, kommt bald", soonSaved: "Gemerkt",
  holiday: "Feiertag: {n}", door: "Tür {n}",
  ready: "Schon spielbar", lastDays: "Letzte Tage", lastSeen: "zuletzt am {d}", calendarOnly: "nur an bestimmten Tagen",
  heard: "So verstehe ich dich", forName: "Für: {n}", missing: "{w} habe ich noch nicht. Stattdessen:", none: "Dazu habe ich noch keine passende Karte. Probier ein anderes Wort.",
  exact: "Passt genau", near: "Passt ungefähr", change: "Andere Absicht",
  regal: "Regal", search: "Karten suchen", searchPh: "z. B. Quiz, Skat, Wichteln", searchNone: "Keine Karte gefunden.", hits: "{n} Karten",
  tabs: { alles: "Alles", tage: "Letzte Tage", andere: "Von anderen" }, filterAll: "Alle",
  others: "Von anderen", othersSoon: "Karten von anderen erscheinen hier, sobald jemand eine teilt und sie geprüft ist.",
  meins: "Meins", meinsOpen: "Meins öffnen: Wand, Einladungen, Gemerkt",
  mtabs: { wand: "Wand", einladungen: "Einladungen", gemerkt: "Gemerkt" },
  wallEmpty: "Noch leer. Bau was.", wallGone: "Von der Wand genommen", undo: "Rückgängig", takeOff: "Von der Wand nehmen", openAgain: "Weiter bauen",
  wallAdd: "Auf meine Wand", wallAdded: "Liegt auf deiner Wand.",
  invEmpty: "Noch keine Einladungen. Teil etwas, dann steht es hier.", invShare: "Noch mal teilen", invDelete: "Löschen", invStory: "Story-Bild",
  inv: { bis: "Kurzlink bis {d}", lang: "Langer Link, ohne unseren Server", offen: "Verschickt am {d}", abgelaufen: "Abgelaufen", weg: "Gelöscht" },
  invDeleted: "Link gelöscht.", invDeleteFail: "Ging gerade nicht. Versuch es online noch einmal.",
  savedEmpty: "Noch nichts gemerkt. Tipp auf das Herz an einer Karte.", save: "Merken", unsave: "Nicht mehr merken",
  sync: { on: "Mit deinem Konto auf allen Geräten (ohne Fotos).", off: "Nur auf diesem Gerät. Mit Konto auch auf deinen anderen Geräten." },
  share: "Teilen", shareCard: "Karte empfehlen", story: "Für Story", storyNote: "Bild 9:16 mit QR-Code für Status und Story.", storyDone: "Story-Bild ist fertig.", storyFail: "Das Bild ging hier nicht.",
  storyCta: "Code scannen oder eintippen", shortMaking: "Kurzlink wird angelegt …",
  open: "Öffnen", play: "Spielen", soonA11y: "{t} (kommt)", thumbAlt: "Vorschau: {t}"
};
const en = {
  ask: "Who do you want to make happy today?", field: "Say in one sentence what you have in mind", hint: "Thanks to Grandma", fieldGo: "Next",
  local: "Your sentence stays on this device.",
  intents: {
    gruss: { t: "Send a note", s: "Thanks, get well, just because" },
    planen: { t: "Plan together", s: "Date, poll, Secret Santa" },
    spielen: { t: "Play against", s: "Quiz, bluff, duel, Skat" },
    stimme: { t: "Voice", s: "Monster, beat, draw, in the room" }
  },
  own: { t: "Your own card", s: "One sentence, the AI builds it", page: "Your own card", soon: "Your own cards go here: one sentence, and the AI builds your card. This is being built right now.", blank: "Or start empty:" },
  all: "All cards", allShort: "All",
  families: {
    gruessen: "Notes & gifts", planen: "Plan & organise", kennen: "Know & guess", bluff: "Bluff & tactics", geschick: "Skill",
    tisch: "Card table", raetsel: "Riddles & secrets", kreativ: "Words & creative", vorort: "In the room, one phone"
  },
  months: ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"],
  days: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
  todayIs: "Today", prevDay: "One sheet back", nextDay: "Next sheet", toToday: "To today", dayOf: "Sheet of {d}",
  swipe: "Swipe to flip through the days.", sheetLabel: "Calendar sheet {d}: {t}",
  bdg: { link: "By link", room: "One phone, take turns", bot: "Against bot", solo: "Alone", game: "Game", photo: "Picture", sound: "Sound", card: "Card", quest: "Riddle", table: "Card table", arcade: "Game", duel: "Duel", lauf: "Run" },
  sec: "{n} sec", mins: "{n} min",
  go: { turn: "Go, you start", table: "Open the table", game: "Take off", sound: "Make a sound", photo: "Make a meme", card: "Make a card", arcade: "Go, play", quest: "Build a riddle", default: "Make it yours" },
  soon: "coming", soonLong: "We are rebuilding this card. Save it, then you find it under Mine.", soonSave: "Save, coming soon", soonSaved: "Saved",
  holiday: "Holiday: {n}", door: "Door {n}",
  ready: "Ready to play", lastDays: "Last days", lastSeen: "last on {d}", calendarOnly: "only on certain days",
  heard: "This is how I understand you", forName: "For: {n}", missing: "I don't have {w} yet. Instead:", none: "I have no card for that yet. Try another word.",
  exact: "Exact match", near: "Close match", change: "Other intent",
  regal: "Shelf", search: "Search cards", searchPh: "e.g. quiz, Skat, Secret Santa", searchNone: "No card found.", hits: "{n} cards",
  tabs: { alles: "All", tage: "Last days", andere: "From others" }, filterAll: "All",
  others: "From others", othersSoon: "Cards from others show up here once someone shares one and it has been checked.",
  meins: "Mine", meinsOpen: "Open Mine: wall, invitations, saved",
  mtabs: { wand: "Wall", einladungen: "Invitations", gemerkt: "Saved" },
  wallEmpty: "Still empty. Make something.", wallGone: "Taken off the wall", undo: "Undo", takeOff: "Take off the wall", openAgain: "Keep building",
  wallAdd: "To my wall", wallAdded: "It is on your wall.",
  invEmpty: "No invitations yet. Share something, then it shows up here.", invShare: "Share again", invDelete: "Delete", invStory: "Story picture",
  inv: { bis: "Short link until {d}", lang: "Long link, without our server", offen: "Sent on {d}", abgelaufen: "Expired", weg: "Deleted" },
  invDeleted: "Link deleted.", invDeleteFail: "That did not work. Try again when you are online.",
  savedEmpty: "Nothing saved yet. Tap the heart on a card.", save: "Save", unsave: "Remove from saved",
  sync: { on: "With your account on all your devices (no photos).", off: "Only on this device. With an account also on your other devices." },
  share: "Share", shareCard: "Recommend card", story: "For story", storyNote: "9:16 picture with a QR code for status and story.", storyDone: "Story picture is ready.", storyFail: "The picture did not work here.",
  storyCta: "Scan or type the code", shortMaking: "Making a short link …",
  open: "Open", play: "Play", soonA11y: "{t} (coming)", thumbAlt: "Preview: {t}"
};
const easy = {
  de: { soonLong: "Diese Karte gibt es bald wieder. Tipp auf Merken.", ask: "Wem willst du heute eine Freude machen?", swipe: "Wisch zur Seite für einen anderen Tag." },
  en: { soonLong: "This card comes back soon. Tap Save.", swipe: "Swipe sideways for another day." }
};
export function homeTexts(lang, isEasy) { const base = lang === "en" ? { ...de, ...en } : de; return isEasy ? { ...base, ...(easy[lang === "en" ? "en" : "de"]) } : base; }
export function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m)); }
