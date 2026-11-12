# Schema-Prüfung an Grenzen

- JSON Schema Draft 2020-12, https://json-schema.org/draft/2020-12 *(nicht nachgeprüft)*
- Ajv 8.20.0: 111 708 B min / 32 805 B gzip als Laufzeit (bundlephobia, 2026-11-11) → nur standalone-Code.
- A. King, „Parse, don't validate“, 2019, https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/ (Praxis, nicht begutachtet).

Ableitung: ein Schema je Grenze in packages/mdi-contract; Client und Server nutzen dieselben Testvektoren; Ablehnung immer mit Grund.
