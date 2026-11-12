# Konto, Guthaben, Gutschein, Aufladen, Bildpreis

- Profil (profile.js:1-17; lib/duell-profile.mjs): optional; (a) bunsenbrenner-Konto erst nach „16 oder älter“, Cookie
  nur same-origin; (b) Geräte-Code (128 Bit lokal) ohne Konto. Reist: Nick, Emoji, Farben, Set, Wand ohne Fotowerke,
  gemerkte Karten, mit Code die KI-Geräte-id. Fotos nie (profile.js:17 e.k !== "photo").
- Lokales Profil: sanitizeProfile/sanitizePref (daily.js:264-317): Altersband (nie Geburtsdatum), Haushalt, Ernährung
  erst ab 16, Zeiten, PayPal.me nur 18+; prefContext gibt KI nur Haushalt/Ernährung/Zeiten, nie Alter/Name/PayPal.
- Guthaben (lib/duell-credit.mjs): verdient oder per Gutschein; wird erst nach leerem Gratis-Topf verbraucht
  (create-ui.js:47).
- Gutschein: POST /api/duell/credit/redeem {code} → {ok, added, credit} | off 503 | login 401 | unknown 403 |
  limit 429 (lib/duell-voucher.mjs:2-5). Tests: gutschein.e2e (3).
- Aufladen-Ansicht (PR #231 offen): Einstiege Mein Stil, Zeile an freier Karte (immer), #aufladen, Guthaben.open();
  „n von m (diesen Monat)“, wofür Guthaben ist, Gutscheinfeld (dieselbe topup()), bezahlte Pakete versteckt (PAID=false,
  keine Zahlung angeboten), abgemeldet: erst 16+ und Anmelden.
- Bildpreis (Entscheidung): 3 KI-Bilder/Monat gratis, danach 1 Guthaben je Bild (in Arbeit).
- Auth heute: Web = Gate-Cookie ct_gate_session über lib/auth.mjs identify; Apps = kein Cookie (DuellAi.swift:25;
  Android ohne ai-Bridge, fetch von appassets-Origin, CORS ohne Credentials); Relay-Arbeit = zusätzlich Bearer nur dort.
