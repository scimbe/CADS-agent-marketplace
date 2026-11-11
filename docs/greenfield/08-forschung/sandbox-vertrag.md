# Karten-Vertrag und Sandbox

- WHATWG HTML, iframe `sandbox`: ohne allow-same-origin opaker Ursprung.
  https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox
- W3C, Content Security Policy Level 3 (WD), https://www.w3.org/TR/CSP3/ *(nicht nachgeprüft)*
- WHATWG HTML, postMessage / MessageEvent.origin und .source: Absenderprüfung erforderlich.
- Ajv „Standalone validation code“, https://ajv.js.org/standalone.html – Validatoren zur Build-Zeit, ohne Function-Konstruktor.
- Eigene Vorarbeit: wrapper #126 (acorn-Allowlist + Instrumentierung statt QuickJS).

Ableitung: erzeugter Code nur im opaken Ursprung, nur JSON über geprüftes postMessage, Schema auf Ein- und Ausgang;
handgebaute Karten über dieselbe Schnittstelle. Ed25519 über WebCrypto – Unterstützung älterer iOS-WebViews UNSICHER, im Spike prüfen.
