# ADR 0001: Fundament-Schnittstellen für Welle 1 (Kartenregister, Echtzeit, Widgets, Thumbnails, Assets)

- Status: **angenommen** (Strang F, 2026-11-12). Änderungen nur per Nachtrag in dieser Datei.
- Besitzer: Strang F (`src/contract/*`, `src/app/*`, `src/render/*`, `scripts/*`, `src/schema/*`, `src/bot/*`).
- Code: Branch `feat/mdi-w1-f` in `scimbe/CADS-agent-marketplace`, `apps/mdi`.
- Quellen: `06-plan/welle-1.md`, `KONZEPT.md` §3, `02-spec/12-paritaet.md` §2, Altcode `alt:` = Tag `pre-legacy-removal`,
  `apps/duell-web/src/` (turn-ui.js, turn2.js, arcade.js, arcade2.js, arcade-ui.js, smooth.js, live.js, live-ui.js, spur.js,
  game.js, engine.js, lauf-engine.js, parts.js, scripts/build.js, scripts/shots.js), Anfragen der Stränge A, H, K, L, P, S, T, Z1, Z2.

## Kontext

D0 kennt zwei Karten, ein handgepflegtes Register, einen DOM-Renderer mit sieben Primitiven und nur Zugkarten mit
aufzählbaren Zügen. Welle 1 baut ≈ 64 Regalkarten, 10 Echtzeitspiele, 2 Engines für Flug/Lauf, Tischspiele und Poster
parallel in 9 Strängen. Alle hängen an denselben Schnittstellen. Der Altcode ist die Untergrenze: jede Eingabeart, jedes
Widget, jede Steuerung und jedes Live-Verhalten muss abbildbar sein, ohne Kartensonderlogik im Host (Anti-Pattern A3)
und ohne stille Rückfälle (A4).

## Entscheidung (Überblick)

| # | Schnittstelle | Kern |
|---|---|---|
| a | Kartenregister | `scripts/gen.js` erzeugt `src/cards/index.js`, Validatoren (Parameter **und** Eingaben je Karte) und Code-Hash (Manifest + alle gebündelten Quelldateien + Assets) aus `src/cards/*/manifest.json` |
| b | Echtzeit-Vertrag | `mode:"realtime"`: fester Tick je Karte, `step(state, inputs[seat]) → {state, ev}`, Eingaben als Daten, Canvas-Anzeigeliste, Bot als zweite Seite, Geist-Spur, Live als **Lockstep** oder **geteilte Seiten** (`net:"split"`, wie Altcode), Sound über Ereignisse |
| c | Widgets | 50 Renderer-Primitive mit `submit`-Vorlage: der Host setzt den Wert als `a` ein; `form` bündelt Felder; a11y, Tastatur, große Schrift im Renderer |
| d | Thumbnail | `manifest.thumb = {src:"shot"\|"ki", file, alt}`, 16:9, 960×540, WebP, `scripts/thumbs.js` erzeugt den Screenshot deterministisch |
| e | Assets | `manifest.assets[]` (image, json, sound, sheet) mit Größenbudget je Datei und Karte; Build packt sie als Teil je Karte |
| f | Zugvertrag v0.2 | `accepts`, Eingabe-Schema je Karte, `status.auto/turnNo/turns`, `ctx.today`, Snapshot-Karten (`compact/merge`), `modes`, `bot`-Hook, Abdecken vor dem ersten Zug, größere Links |
| g | Erweiterungspunkte | `src/app/features.js` (Regionen/Zustände/Effekte von H und K), `deps.effects` in der Laufzeit |

SDK-Version: `mdi-sdk/0.2` (rein additiv; `mdi-sdk/0.1`-Karten laufen unverändert, das Schema erlaubt beide).

---

## (a) Automatisches Kartenregister

- Quelle ist jedes Verzeichnis `src/cards/<id>/` mit `manifest.json` und `card.js`. `<id>` muss gleich `manifest.id` sein.
  Verzeichnisse mit `_` am Anfang werden ignoriert. Testkarten liegen unter `test/fixtures/cards/<id>/` und kommen nur in
  das Testregister (`MDI_CARDS=test`, siehe unten), nie in das ausgelieferte Bündel.
- `node scripts/gen.js` (läuft auch in `npm run build` und im Test `build.test.js`, der Aktualität prüft) erzeugt:
  - `src/cards/index.js` (Kopf „ERZEUGT – nicht von Hand ändern“): Importe, `CARDS`, `ORDER`, `VARIANTS`,
    `cardOf(id)`, `validParams(id, p)`, `validInput(id, x)`, `codeHash(id)`, `modesOf(card)`, `manifestOf(id)`.
    `ORDER` = sortiert nach `manifest.order` (Ganzzahl, Standard 1000), dann `id`.
  - `src/gen/validators.js`: Ajv-Standalone (keine Laufzeit-Codeerzeugung, CSP ohne `unsafe-eval`) für Link, Live,
    Manifest, `params_<id>` und `inputs_<id>`.
  - `src/gen/codehash.js`: `CODE_HASH[id]` = SHA-256 (32 Hex) über Manifest, **alle Quelldateien, die esbuild für
    `card.js` bündelt** (also auch `src/engines/<name>/*`), und alle Asset-Dateien, in fester Reihenfolge.
  - `src/gen/assets.json` (für den Build): Asset- und Thumbnail-Liste mit Größen.
- Der Generator **lehnt ab** (Exit 1 mit Grund) statt zu raten: Manifest verletzt Schema, `id` ≠ Ordner, doppelte `id`,
  Datei aus `thumb`/`assets` fehlt, Budget überschritten (e), Harness-Befund in einer Kartendatei (`scripts/harness.js`,
  AST-Allowlist; gilt auch für importierte `src/engines/*`-Dateien), Variante ohne gültige Parameter.
- Niemand pflegt `src/cards/index.js` mehr von Hand. Bis der Generator auf `feat/mdi-paritaet` ist, trägt jeder Strang seine
  Karte wie bisher mit einer Zeile ein; beim Rebase auf F fällt die Zeile weg.

## (f) Zugvertrag v0.2 (gilt für `mode:"turn"`, gebraucht von Z1, Z2, S, T, P)

Unverändert: `init`, `deal`, `step`, `observe`, `status`, `moves`, `sample`, `view`. Neu, alles optional:

| Hook / Feld | Bedeutung | Anfrage |
|---|---|---|
| `accepts(obs, seat, input) → boolean` | Ersetzt in `session.apply` die Prüfung „input ∈ moves()“. Für nicht aufzählbare Eingaben (Text, Liste, Betrag, Zielpunkt, Striche). `moves()` bleibt für Bot und Hinweise. `step` muss trotzdem selbst prüfen und werfen. | Z1 (1), S |
| `manifest.inputs` | JSON-Schema der Eingaben dieser Karte (ohne `t`/`seat`-Pflicht, die setzt der Host). Erzeugter Validator `inputs_<id>` prüft jede Eingabe aus Link und Live **vor** `apply`. Das globale Schema prüft nur noch die Hülle: Objekt, `t` (`^[a-z][a-z0-9-]{0,15}$`), `seat` 0–9, kanonische Länge ≤ 2048 Byte. Strings in Eingaben dürfen Unicode enthalten; Steuerzeichen und `<>` sind global verboten. | Z1 (2), S (1a), T |
| `status(state).auto: true` | Pflichtzug: liefert `moves(observe(state, turn), turn)` genau einen Zug und gehört der Sitz diesem Gerät, wendet der Host ihn sofort an (wie eine fällige Aufklärung) und schickt ihn an den Partner. Auch direkt nach Partiebeginn. | T (1) |
| `status(state).turnNo`, `.turns` | „Zug n von m“ für die Kopfzeile | Z2 (b) |
| `view(obs, seat, ctx)`: `ctx.today` | UTC-Tag als Ganzzahl (Tage seit 1970-01-01). Mit `manifest.inputDay: true` stempelt der Host jede eigene Eingabe mit `d: today`; `step` bleibt uhrfrei und liest nur `input.d`. | Z1 (4) |
| `manifest.link.snap: true` + `compact(log) → log`, `merge(pubA, pubB) → pub` | Snapshot-Karten (Einkauf, Wunschzettel, Dart): `toWire` sendet `compact(log)`. Beim Empfang ersetzt `merge(gespeicherterPub, eingehenderPub)` die Fortsetzungsprüfung `continues()`; beide Funktionen sind rein und deterministisch. | Z1 (3), S (1c) |
| `manifest.modes` | Teilmenge von `alone|bot|link|live`; `modesOf` schneidet damit. Ohne Feld wie bisher aus `players` abgeleitet. | T (2) |
| `manifest.play = {default, offer[≤3]}` | Vorauswahl und angebotene Knöpfe (13 §6.4); `default ∈ offer ⊆ modesOf`. | Z2, H |
| `manifest.rule`, `manifest.roles` | Ein Satz Ziel/Steuerung; je Sitz, was die Rolle darf (`{de:[…], en:[…]}`). | Z2, H |
| `card.bot(obs, seat, {level, seed}) → input` | Eigener Bot; `src/bot/agent.js` nutzt ihn statt ISMCTS. Muss deterministisch aus `seed` sein. | T (5), S |
| `status(state).local: true` | Ergebnis bleibt auf dem Gerät (Wichtel-Ziehung, Zahlen beim Geldsammeln): im Link-Modus kein „Ergebnis senden“. | Z1 (5) |
| Sitze | `players.max` bis 10, `seat` 0–9 (Terminumfrage, Reihum: Sitz = Zugindex). | Z1 (6) |
| Abdecken | Im Modus `alone` gibt es den Abdeckschirm auch vor dem ersten Zug: `ctx.coveredFor` (Start `null`); Phase `cover`, solange `turn !== coveredFor`. | Z2 (a) |
| Link-Länge | `MAX_FRAGMENT` = 4000 Zeichen. Darüber wird nicht gekürzt: der Host bietet den Kurzlink über den Server an (Effekt `short.create` von H). Ohne Server: ehrlicher Hinweis „zu lang für einen Link“. Snapshot-Karten halten ihre Größe selbst klein. | Z1, S, P |
| Mehr als 2 Parteien | Bot-Modus mit n − 1 Bot-Agenten. Live mit 3–4 Parteien (Gruppen-Handshake `seed = H(seedA|n1|…)`, ein Token je Sitz) ist **Stufe 2** dieser ADR, siehe „Offen“. | T (3, 4) |

## (b) Echtzeit-Vertrag (`kind:"realtime"`, `mode:"realtime"`)

### Manifest `rt`

```jsonc
"rt": {
  "tick": 120,                 // 30 | 60 | 120 Hz, fest je Karte (Altcode: 1/120 in arcade, engine, lauf-engine)
  "view": { "w": 1000, "h": 1600, "fit": "contain" },   // logisches Koordinatensystem; "width" = Breite füllen, Höhe folgt
  "numeric": "int",            // "int" (Ganzzahl/Q16.16) | "f64" (nur + - * / sqrt min max floor, bitgleich nach IEEE 754)
  "net": "lockstep",           // "lockstep" | "split" (geteilte Seiten wie Altcode arcade.js) | "none" (nur allein/Bot/Geist)
  "delay": 6,                  // Lockstep: Eingabeverzögerung in Ticks (Standard tick/20 = 50 ms)
  "maxTicks": 10800,           // harte Obergrenze einer Partie (90 s bei 120 Hz wie spur.js TMAX)
  "controls": { ... },         // siehe Eingaben
  "sounds": { ... },           // siehe Sound
  "smooth": [ ... ],           // nur net:"split", siehe Live
  "ghost": { "bytes": 600 }    // Geist-Spur erlaubt, Obergrenze in Byte
}
```

### Modul

```js
init({ params, seed, players, rng })        → state        // rng = sdk.rng(seed + "|init")
step(state, inputs, tick)                   → { state, ev } // inputs[seat] = Input (siehe unten), ev = [{k, seat?, x?, y?, v?}]
status(state)                               → { over, score[], winner, say? }  // say = kurzer Text für aria-live
view(state, ctx)                            → Anzeigeliste (Wurzel {t:"canvas", …}, optional DOM-HUD)
bot?(state, seat, { level, rng })           → Input        // Bot = zweite Seite im selben Zustand, Stufen 1–3
hash?(state)                                → string       // nur numeric:"f64"; sonst sdk.stateHash bzw. sdk.stateHashF
// nur net:"split":
side?: { init({params, seed, seat, serving}) → st,
         step(st, { input, inbox, tick }) → { st, out:[msg], ev },
         view(st, ctx), status(st) }
```

- `step` ist rein: kein DOM, keine Uhr, kein `Math.random`, nur SDK (Harness). Ereignisse `ev` sind Daten (Sound,
  Partikel, Wackeln, Ansage).
- `ctx` in `view`: `{ seat, alpha, prev, reduced, lang, t, tracked, assets, paused }`. `alpha ∈ [0,1)` ist der
  Interpolationsanteil zwischen `prev` und `state`; die Karte interpoliert selbst (Gleitkomma nur in `view`).
  `reduced` = `prefers-reduced-motion` oder Mein Stil. `t` = Anzeigezeit in Sekunden (nur Optik).
- `net:"split"` (Altcode-Verhalten, Strang A): die Karte liefert **zusätzlich** `side`. `init/step` bleiben Pflicht und
  sind dann die *Partie* = zwei Seiten + Nachrichtenwarteschlangen in einem Zustand, mit Spiegelung **durch die Karte**.
  Allein, Bot, Geist und Tests laufen immer über `init/step`; nur Live läuft je Gerät mit `side`.

### Eingaben als Daten

Host tastet einmal je Tick ab und liefert je Sitz ein `Input` (nur Ganzzahlen):

```js
{ b: 0b101,          // Knöpfe als Bitmaske in der Reihenfolge controls.buttons
  ax: 0, ay: 0,      // Achsen -1000..1000 (Tasten oder Ziehen)
  p: [[id, x, y, f]] // Zeiger in logischen Koordinaten (Letterbox umgerechnet); f: bit0 unten, bit1 neu gedrückt, bit2 losgelassen
}
```

```jsonc
"controls": {
  "buttons": [
    { "id": "tap",  "kind": "pulse", "keys": ["Space", "ArrowUp", "KeyW"], "zone": "any",    "label": {"de": "Springen", "en": "Jump"} },
    { "id": "hold", "kind": "hold",  "keys": ["Space", "ArrowUp"],          "zone": "any" },
    { "id": "duck", "kind": "hold",  "keys": ["ArrowDown", "KeyS"],         "zone": "button", "swipe": "down" }
  ],
  "axes": { "x": { "keys": ["ArrowLeft", "ArrowRight"], "pointer": false } },
  "pointer": { "max": 2, "zones": [ {"id":"left","x":[0,500]}, {"id":"right","x":[500,1000]} ] }
}
```

- `kind:"pulse"` ist nur im Tick des Drückens gesetzt, `hold` solange gedrückt.
- `zone:"any"` = Tippen irgendwo auf die Bühne; `zone:"button"` = der Host zeichnet einen echten Knopf (≥ 60 px, Text
  aus `label`, `aria-pressed` bei `hold`). Jede Zeigersteuerung braucht eine Tastaturentsprechung; der Generator lehnt
  Karten ohne `keys` für einen Knopf ab (Altcode-Lücke: touch/react ohne Tastatur).
- Mehrere Zeiger (Flipper links/rechts) über `pointer.max` und `zones`. Ziehen = Zeiger mit `f&1` über mehrere Ticks.
- Das Spur-Wort des Altcodes (bit0 Tippen, bit1 Halten, bit2 Ducken) ist genau `b` mit den drei Knöpfen oben (Strang L).

### Tick, Interpolation, Pause

- Host-Schleife: Akkumulator mit festem `dt = 1/tick`, höchstens 0,25 s Nachholzeit je Bild (dann Zeitverlust statt
  Spirale), danach `alpha = acc/dt`. Rückwärtslaufende Uhr wird ignoriert. Countdown 3 s vor Tick 0.
- Pause/Weiter: Knopf, `Escape`/`KeyP`, `visibilitychange` (versteckt = Pause). Im Live wird die Pause dem Partner
  gemeldet und beide halten an. Allein/Bot: kein Zeitfortschritt während der Pause.
- Reduzierte Bewegung: `ctx.reduced`; zusätzlich verwirft der Canvas-Renderer `shake` und `flash` und dünnt `particles`
  auf 35 % aus (Altcode arcade-ui.js:63–71).

### Bot als zweite Seite

Bot-Modus: der Host ruft je Tick `card.bot(state, botSeat, {level, rng})` und setzt das Ergebnis als Eingabe des
Bot-Sitzes. `rng = sdk.rng(seed + "|bot")`, also auch der Bot ist reproduzierbar (Geist einer Bot-Partie spielt gleich).

### Geist (Eingabespur)

- Aufnahme: je Sitz die Folge der `Input`s, nur Änderungen: `varint(gap) · varint(mask) · zigzag-varint je geändertem Feld`
  (`b`, `ax`, `ay`, Zeiger als `[id,x,y,f]`), Ende = `varint(gap)·0`. Kanonisch (der Leser lehnt nichtkanonische Spuren ab).
- Für Karten, die nur `b` mit ≤ 3 Bit nutzen, ist das Format bytegleich zu Altcode `spur.js` lesbar
  (`sdk/trace.js`: `encodeSpur/decodeSpur`), damit Golden-Spuren aus dem Altcode gelten.
- Link-Typ `ghost`: `{c, v, p, s, tr: b64url, n: ticks, sc: score[], h: Endhash}`. Der Empfänger spielt die Spur nach und
  muss denselben Endhash erhalten, sonst Ablehnung „abweichung“. Dann tritt er gegen den Geist an (Geist = Sitz 1 aus
  der Spur, eigener Sitz live).

### Live über den vorhandenen Broker

Transport unverändert `src/broker/live.js` (Protokoll = `alt:live.js`, `/api/play`, Noise, Datenkanal `game`).
Partiebeginn über den vorhandenen Handshake (hello/join/start → gemeinsamer Seed; Echtzeitkarten haben keine
Geheimnisse). Neue Nachrichten (`live.schema.json`):

| Nachricht | Netz | Inhalt |
|---|---|---|
| `{t:"rt", i, x:[Input…]}` | lockstep | eigene Eingaben ab Tick `i` (gebündelt, alle 2 Ticks) |
| `{t:"rh", i, h}` | lockstep | Zustandshash bei Tick `i` (alle `tick` Ticks); Abweichung wird offen gemeldet, Partie endet |
| `{t:"rs", i, m:[msg…]}` | split | `out` der eigenen Seite; Ankunft wird im nächsten lokalen Tick als `inbox` geliefert |
| `{t:"pause"}`, `{t:"resume"}` | beide | Sichtbarkeit / Pausenknopf |
| `{t:"again"}` | beide | Revanche, beide müssen senden (Altcode arcade-ui.js:575) |

- Lockstep: eigene Eingabe für Tick `n` gilt bei `n + delay`. Fehlt die Partnereingabe für den nächsten Tick, hält die
  Simulation an und zeigt „wartet auf Partner“ (kein Raten, keine Vorhersage im Zustand).
- Split: Plausibilitätsprüfung macht die Karte in `side.step` (Altcode: `reach`, Aufschlag aus dem Seed, VMAX).
- Glättung (nur Anzeige): `rt.smooth = [{msg:"p", fields:["x","y"], vmax, lo, hi}]`. Der Host führt je Eintrag einen
  Tracker nach `alt:smooth.js` (Verzögerung `late + 2,5·dev + gap`, 40–300 ms, Extrapolation ≤ 150 ms,
  Schrittbegrenzung `vmax·dt·1,4`) und gibt das Ergebnis als `ctx.tracked[msg]` an `side.view`. Nachrichten tragen dazu
  `ms` (Sender-Tick in ms), das setzt der Host.
- Partner weg: Pause, nach 15 s ehrliches Ende („Verbindung weg“), kein stilles Weiterspielen gegen einen Bot.

### Sound und Haptik

```jsonc
"sounds": { "hit": {"synth":"tone","f0":520,"f1":260,"dur":0.08,"type":"square","vol":0.2},
            "boom": {"synth":"noise","dur":0.4,"freq":900,"vol":0.5},
            "win":  {"asset":"jingle"},
            "goal": {"haptic": 80} }
```

Der Host spielt zu jedem Ereignis `ev.k` den Eintrag (WebAudio, lazy, Stummschalter aus Mein Stil). `v` in `ev` skaliert
die Tonhöhe (Altcode `SND.hit(v)`). Keine Klänge ohne Ereignis.

### Canvas-Anzeigeliste (gilt auch für Poster, Dart, Tisch)

Wurzel `{t:"canvas", w, h, ratio?, layers:[…] | ops:[…], a11y}`. Ebene: `{id, key?, camera?:{x,y,zoom}, ops}`;
eine Ebene mit `key` wird gecacht, solange der Schlüssel gleich bleibt (Hintergrund je Seed). Höchstens 4000 Ops je Bild.

| Op (`o`) | Felder |
|---|---|
| `rect` | `x,y,w,h, r?` (Eckenradius), Stil |
| `circle` | `x,y,r`, Stil |
| `ellipse` | `x,y,rx,ry, rot?`, Stil |
| `arc` | `x,y,r, a0,a1` (Umdrehungen 0..1), `r0?` (Ringsektor), Stil |
| `line` | `x1,y1,x2,y2`, `lw, cap?, dash?`, `stroke` |
| `poly` | `pts:[x,y,…], closed?`, Stil |
| `path` | `d` (SVG-Teilmenge M L H V Q C A Z, absolut/relativ), Stil |
| `text` | `x,y,text, size, font:"brand"\|"body", align?, base?, maxW?`, Stil |
| `textblock` | `x,y,w,h,text, mode:"poster"\|"meme"\|"warm", fill, shadow?` (Umbruch und Größe automatisch) |
| `sprite` | `x,y,w,h, rot?, flip?, alpha?` und `emoji` **oder** `asset` (Bild/Sheet-Kachel `asset:"noto", key:"1f384"`) |
| `image` | `src:{kind:"asset",id}\|{kind:"local",slot}\|{kind:"server",ref}`, `x,y,w,h, fit:"cover"\|"contain", clip?:"circle"\|"burst", filter?:"duotone"\|"posterize"\|"glitch", tone?` |
| `glow` | `x,y,r,color,alpha` (additiv) |
| `particles` | `list:[[x,y,size,alpha,color]…], shape:"glow"\|"sq"\|"dot"` (reduziert bei `reduced`) |
| `group` | `tx,ty,rot,sx,sy,alpha, clip?, ops:[…]` (Spiegelung über `sx:-1`/`sy:-1`) |
| `shake` | `amt` (verworfen bei `reduced`) |
| `flash` | `color, alpha` (verworfen bei `reduced`) |

Stil: `fill?, stroke?, lw?, alpha?, shadow?:{color,blur,dx,dy}`. Farbe = Token-Name (`FILLS`) oder `#rrggbb`/`#rrggbbaa`
(Nutzerfarben sind Inhalt; UI-Rahmen bleiben Token) oder Verlauf `{lin:[x1,y1,x2,y2], stops:[[0,"#…"],…]}` /
`{rad:[x,y,r0,r1], stops}`. Lokale Fotos (`media.local`) sieht die Karte nur als Slot-Namen, nie als Pixel; sie reisen nie
im Link (KONZEPT §3.2). Die Canvas-Fläche hat `role="img"` und `aria-label = a11y`; der Spielstand steht zusätzlich als
DOM-Text (`status.say`, `aria-live="polite"`).

### Statechart

`inhalt.card.play` bekommt für Echtzeitkarten die Unterzustände `rt.ready` (Countdown) → `rt.run` ⇄ `rt.pause` →
`rt.over`, Modi `alone | bot | live | ghost`. Ereignisse: `RT_GO`, `RT_PAUSE`, `RT_RESUME`, `RT_OVER`, `RT_AGAIN`,
`PEER_RT` (Live). Die Bildschleife liegt nicht im Zustand: `src/app/rt/loop.js` hält sie und meldet nur Übergänge.

## (c) Widget-Primitive für Zugkarten

### Grundschicht: Entwurf und Basis-Primitive (Anfrage Z1)

Viele Zugschritte setzt die Karte selbst aus wenigen Primitiven zusammen; dafür hält der Host einen **Entwurf**:

- `ctx.draft` (JSON, Start `null`) geht an `view(obs, seat, ctx)`. Ein Knoten mit `draft` statt `input` ruft beim Tippen
  `onDraft(draft)`: der Host ersetzt `ctx.draft` und rendert neu. Nach jeder echten Eingabe ist `ctx.draft = null`.
  Der Entwurf verlässt das Gerät nie (kein Link, kein Live).
- `field`: `{t:"field", key, label, value, max, mode:"text"|"decimal"|"name", hint?, multiline?}`; jede Änderung →
  `onDraft({...draft, [key]: wert})` (entprellt 150 ms, Fokus bleibt, Knotenschlüssel = `key`).
- `choice` erweitert: `option.draft` als Alternative zu `option.input`, `option.on` (gewählt, `aria-pressed`),
  `option.disabled`, `choice.wrap` (Raster), bis 24 Optionen.
- `go`: `{t:"go", label, input, disabled?, why?}` – der Hauptknopf eines Schritts; gesperrt **mit sichtbarem Grund**.
- `link`: `{t:"link", href, label}` – nur `https://paypal.me/…` (Allowlist im Renderer), `rel="noopener noreferrer"`.
- `copy`: `{t:"copy", text, label}`; `file`: `{t:"file", name, mime:"text/calendar", text, label}` (.ics).

Die Widgets unten sind die höhere Schicht: sie halten ihren Zwischenwert selbst (Zeitspiele, Mikrofon, Zeigen, Zeichnen
brauchen ohnehin Host-Zeit und Gerät) und liefern am Ende einen Wert. Beide Schichten mischen sich frei.

### Form der Widgets

```js
{ t: "<widget>", id: "w1", label: "…", top?: "…", peek?: "…", hint?: "…",
  ...konfiguration,
  value?: <Vorbelegung>,
  submit: { t: "say", seat: 0 },     // Vorlage; der Host schickt { ...submit, a: <Wert> }
  auto?: true,                        // senden, sobald der Wert gültig ist (pick n=1, rank-Ende: nach 450 ms)
  confirm?: "Weiter" }                // Beschriftung des Hauptknopfs, sonst „Weiter“
```

- Eingaben sind Daten: der Wert landet als `a` in der Eingabe; die Karte prüft mit `accepts` und `step`.
- Ein Bildschirm je Frage bleibt Sache der Karte (sie liefert je `view` das aktuelle Widget).
- `form` = mehrere Felder, ein Knopf: `{t:"form", id, fields:[Widget ohne submit…], submit}` → `a: {[feldId]: Wert}`.
- Gültigkeit prüft das Widget nach seiner Konfiguration; der Hauptknopf ist bis dahin gesperrt **mit sichtbarem Grund**
  (`aria-describedby`), nicht stumm wie im Altcode.
- a11y für alle: echte `button`/`input`, Beschriftung, `aria-pressed` für Umschalter (auch vote/slots/voices, die es im
  Altcode nicht hatten), Fokus auf das erste Feld, Pfeiltasten in Rastern und Listen, Ziel ≥ 44×44 px (Hauptknopf 68 px),
  alle Größen in rem (große Schrift aus Mein Stil skaliert alles), keine reine Zeiger- oder Mikrofonbedienung: jedes
  Widget hat einen Tastatur-/Tipp-Ersatz.

### Inventar (Altcode `w:` → Primitive; Wertform = `a`)

| Primitive | Altcode | Konfiguration | Wert `a` |
|---|---|---|---|
| `pick` | pick, opts, pick+card | `options:[{label, img?}]`, `n`, `card?` (Canvas-Bild) | `int[n]` Indizes in Tippreihenfolge |
| `rank` | rank | `options` | Permutation `int[]` |
| `slide` | slide | `min,max,step?,unit?, format?:"int"\|"eur"\|"cents"` | `int` |
| `text` | text | `max, oneWord?, pattern?, adult?` | `string` (bereinigt, s. u.) |
| `list` | list | `n, max, hints?, loose?, least?, same?, bytes?` | `string[n]` |
| `money` | money | `people` (k), `min,max` (Cent) | `int` Cent; Zeile „x € je Person · Rest“ |
| `pay` | pay | `link` (fertig geprüfter PayPal.me-Link), `share`, Altersstufe aus Mein Stil | `0`; Knopf nur ab 18, sonst Hinweis + „Ich bin 18“ |
| `show` | show | `lines[]`, `card?`, `notes?`, `later?` | `0` |
| `alloc` | alloc | `options, sum, step, vals?` | `int[]` |
| `grid` | grid | `rows, cols, n` | `int[n]` Zellen |
| `probe` | probe | `rows, cols, n, marks:{zelle:"far"\|"near"\|"hit"}`, `before[]` | `int[]` |
| `touch` | touch | `max` (5) | `0`; Tastatur: „Zufall ziehen“ |
| `rec` | rec | `ms, slot` | `0` (Ton bleibt im Speicher des Geräts) |
| `once` | once | `slot, fx` | `0` |
| `parrot` | parrot | `from, slot` | `0` |
| `whose` | whose | `slot, fx, options[3]` | `int` |
| `nim` | nim | `heaps[], botSteps` (Züge des Bots als Daten der Karte) | `0`/`1` |
| `freeze` | freeze | `beat, pauses[], max` | `int` Runden |
| `voices` | voices | `rounds, role, figure, options[6]` | `int` Treffer |
| `doors` | doors | `texts[24]`, `open` (Anzahl offener Türen aus `ctx.today`) | nur Anzeige |
| `door` | (P: advent-tuer) | `nr, closed, colors, label, children` | `0` beim Aufklappen |
| `drop` | drop | `max, item, worth, msPerStep:80` | `int` |
| `hunt` | hunt | `words:[{w,hint}], max` | `int` Sekunden |
| `blocks` | blocks | `size:8, max:40, shapes` (aus Seed) | `int[]` Zellen |
| `shop` | shop | `cfg{items,text,people,qty,due?}, list, me` | Liste `[[name,face]…],[[text,t,qty,[[p,s]]]…]` |
| `wish` | wish | `cfg, list, role:"own"\|"give"` | wie shop; Marken für `own` unsichtbar |
| `slots` | slots | `days:14, hours[], holidays[]`, `max:5` | `[name, int[]]` |
| `vote` | vote | `dates[]`, `taken[]` | `[name, int[]]` (0 ja, 1 vielleicht, 2 nein) |
| `blow` | blow | `n` | `0`; Kerzen antippen = Ersatz fürs Pusten |
| `ideas` | ideas | `ideas[5]` | `[string[], int]` |
| `day` | day | `min` (UTC-Tag), `def` | `int` UTC-Tag |
| `bw` | bw | Teilnehmerliste, Rolle, Siegel | Liste bzw. Ziehung |
| `explain` | explain | `secs, max, words[]` | `int` |
| `clock` | clock | `secs, text` | `0` |
| `inner` | inner | `targets[5]` (ms) | `int[5]` |
| `blind` | blind | `tries, goal` | `int` ms |
| `react` | react | `plan[]` | `int` ms (Tastatur: Leertaste = Tippen auf den Stern) |
| `tuer` | door (Zeitspiel) | `secs, streak, beings` | `[k, right, total]` |
| `aim` | (S: Dart) | `w,h, grid` (z. B. 4096), `card` (Canvas) | `[x,y]` Ganzzahl; Pfeiltasten |
| `power` | (S: Dart) | `levels:9`, Pendel oder Schieber | `int` |
| `draw` | (S: Malrat) | `colors[8], widths[3], maxPts` | Striche `[[farbe,breite,[x,y…]]…]` in 0..1000 |
| `strokes` | (S: Malrat) | Striche, Tempo | nur Anzeige (Strich für Strich, ohne Bewegung bei `reduced`) |
| `steps` | (P: Beat) | `rows[{id,label,cells}]`, 16 Schritte | `{row,i}` je Tipp |
| `audio` | (P) | `src`, `label` | nur Anzeige (Abspielen) |
| `record` | (P) | `slot, ms` | `0` |
| `pcard` | (T) | `code\|null, state, size` | mit `submit`: `0` beim Antippen |
| `pickn` | (T) | `items:[pcard], n, options:[{sel,input}]` | sendet das passende `input` |
| `more` | (T) | `label, children` | nur Anzeige (`<details>`) |
| `form` | – | `fields` | Objekt |

Gemeinsame Hilfen im Host: Rahmen „wer ist dran“, Hauptknopf, „Wer sieht was?“, Ergebniszeilen, Kurzhinweise, Ton
(`tap/pop/win/thud`) und Haptik über dieselben Sound-Einträge wie (b). Textbereinigung: `src/contract/text.js`
(`clean(s,max)`, `fold(s)`) nach `alt:quest.js:11` (Steuerzeichen, `<>`, Kontaktdaten-Muster, Wortfilter) – dieselbe
Funktion nutzen Widget und `accepts`, damit Gerät und Empfänger gleich urteilen.
Spielkarten-Bild (`pcard`) zeichnet `src/render/pcard.js` über die reine Funktion `cardSvg` aus Strang T
(`src/engines/tisch/deck.js`, CC0) – einzige erlaubte Abhängigkeit des Renderers in einen Engine-Ordner.

## (d) Thumbnail im Manifest

```jsonc
"thumb": { "src": "shot", "file": "thumb.webp", "alt": {"de": "Zwei Torwarte am Kickertisch", "en": "…"} }
```

- Format 16:9, 960×540, WebP (Qualität 0,7), Datei im Kartenordner, ≤ 60 KB. Kurztitel legt der Client darüber (Bild
  bleibt textfrei, i18n).
- `src:"shot"`: echter Screenshot im Startzustand, erzeugt von `scripts/thumbs.js` (Playwright, Chromium, feste Uhrzeit
  `2026-11-10T10:00Z`, Locale de, `prefers-reduced-motion: reduce`, Ansicht 960×540, Vorschau `preview:true`;
  Echtzeitkarten nach festen `n` Ticks mit Bot gegen Bot). Gleiche Eingabe → gleiche Datei (Test vergleicht Hash).
- `src:"ki"`: KI-Bild (FLUX auf cs4f), geprüft, ersetzt die Datei; `prompt` (Text) steht daneben im Manifest.
- Varianten dürfen ein eigenes `thumb` haben. Ohne `thumb` lehnt der Generator ab (ab Integration; bis dahin Warnung).

## (e) Assets je Karte

```jsonc
"assets": [
  { "id": "noto",  "type": "sheet", "file": "noto.png", "tile": 128, "keys": ["1f384", "…"], "license": "Apache-2.0" },
  { "id": "words", "type": "json",  "file": "words.json" },
  { "id": "jingle","type": "sound", "file": "jingle.ogg" }
]
```

- Budget je Datei: Bild/Sheet ≤ 120 KB, JSON ≤ 64 KB, Sound ≤ 96 KB; je Karte alles zusammen ≤ 256 KB ohne Thumbnail.
  Der Generator misst und lehnt ab.
- Build: je Karte ein Teil `parts/card-<id>.<sha12>.json` (Daten-URLs bzw. JSON), mit SRI, bei Bedarf geladen
  (Muster `alt:parts.js`). CSP: `img-src data: blob: 'self'` (blob: für lokale Fotos, 'self' für `/duell/bild/<id>`),
  `media-src data: blob:`.
- JSON-Assets darf auch die Logik nutzen: der Host übergibt sie als `params`-unabhängige Konstante
  `init({…, data})` / `step` über den Zustand; sie fließen in den Code-Hash ein.

## (g) Erweiterungspunkte für andere Stränge

- `src/app/features.js` exportiert `FEATURES = [konto, home, frei, …]`. Ein Feature ist
  `{ id, states?: {name: zustand}  /* Kinder von inhalt */, shelfOn?: {EVENT: …}, guards?, actions?, context?(saved),
  effects?: {typ: (fx, {dispatch, state, api, deps}) => void} }`. `machine.js` und `runtime.js` setzen daraus zusammen;
  doppelte Namen sind ein Fehler beim Erzeugen. H (`home`) und K (`frei`) tragen je eine Zeile ein.
- `createRuntime(deps)`: unbekannte Effekte gehen an `deps.effects[typ]` bzw. Feature-Effekte, sonst Fehler.
- `konto.js pack(me, remote, local)`: `local.wall`/`local.saved` haben Vorrang (Wand-Sync, Strang H).

## Konsequenzen

- Positiv: ein Register, ein Renderer, ein Eingabeformat für alle 9 Stränge; Altcode-Verhalten (120 Hz, Spur-Bytes,
  geteilte Seiten im Live, alle Widgets) bleibt abbildbar; Golden-Tests aus dem Altcode bleiben vergleichbar.
- Negativ: zwei Netzarten (lockstep, split) statt einer; `numeric:"f64"` neben Festkomma. Beides ist bewusst: der
  Altcode-Charakter (unverzögerter eigener Schläger) und die alten Golden-Hashes wiegen schwerer.
- Risiko: Live mit > 2 Parteien kommt in Stufe 2; bis dahin laufen Skat/Doko mit Bots.

## Offen (mit Grund)

- Live mit 3–4 Parteien (Strang T 3): eigener Handshake und Gruppen-Einladung; Stufe 2 nach dem ersten Push.
- KI-Thumbnails (`src:"ki"`): brauchen GPU-Lauf und Sichtprüfung je Karte, nicht in diesem Strang.
- `textblock`-Umbruch exakt wie `alt:render.js`: Strang P liefert die reine Layoutfunktion, F bindet sie ein; bis dahin
  Gierig-Umbruch mit Messfunktion.
