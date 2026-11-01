#!/usr/bin/env bash
# Writes the app's third-party notices: the Kotlin and Java libraries by hand below, the Rust crates of mobile-core
# with their licence texts from cargo-about. Run after a dependency change; the result ships in the APK.
set -euo pipefail
cd "$(dirname "$0")"
out=app/src/main/assets/third_party_licenses.txt
mkdir -p "$(dirname "$out")"
{
  cat <<'T'
My Daily Idea uses open source software. Licence texts follow.

Android and Java libraries, Apache License 2.0 unless noted:
AndroidX (Compose, Activity, Navigation, Lifecycle, WebKit, Security), Kotlin coroutines (JetBrains),
AppAuth for Android (OpenID Foundation), JNA 5 (Apache License 2.0 or LGPL 2.1, used under Apache License 2.0).
Web page: Anton font (SIL OFL 1.1), qrcode-generator (MIT), see "Licenses" in My style.

T
  cargo about generate --manifest-path ../../crates/mobile-core/Cargo.toml --features peer -c about.toml about.hbs
} > "$out"
