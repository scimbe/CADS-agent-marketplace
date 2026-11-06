/* Device keys and sealed slips (Katalog v2: biz-wichteln "niemand kennt alle Paare", "eigener Schlüssel je Selbsteintrag";
   zug-wunschzettel marks the wisher's phone with the same kind of key). Part turnzwei; WebCrypto only, no library.
   - keys(): a new ECDH P-256 key pair. The private half stays on this device (Kit.store, as JWK d/x/y); the public half
     (raw, 65 bytes, base64url: 87 characters) goes into the link with the name that signed up.
   - draw(pubs, info, circle): the draw. A fresh 128-bit secret from crypto.getRandomValues seeds the circle (who gives to
     whom); it is never in the link, so the link's own seed cannot recompute the pairs. Each person's recipient (an index,
     one byte, so every box has the same length) is sealed to that person's key: one ephemeral key pair per draw, ECDH
     with each public key, HKDF-SHA-256 (salt: the ephemeral public key, info: the group and the place in the list),
     AES-256-GCM with the person's public key as additional data and a 64-bit tag (the box has to fit a link; it only has
     to tell "not this phone's key", and a forged slip gains nothing a new link would not). Each derived key seals
     exactly one message, so the nonce is fixed (zero). The secret, the circle and the ephemeral private key are dropped
     before the result returns; nothing of them is stored. Result: [ephemeral public key, boxes] (87 + n x 12 characters).
   - open(k, eph, box, info, pub): the recipient's index, or a rejected promise when this key does not open the box. */
(function (root) {
  "use strict";
  var EC = { name: "ECDH", namedCurve: "P-256" }, IV = new Uint8Array(12), TAG = 64;
  function sub() { var c = root.crypto; return c && c.subtle ? c.subtle : null; }
  function b64(u) { var s = ""; u.forEach(function (x) { s += String.fromCharCode(x); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64(s) { var b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice(0, (4 - s.length % 4) % 4)); return Uint8Array.from(b, function (c) { return c.charCodeAt(0); }); }
  function utf(s) { return new TextEncoder().encode(s); }
  async function keys() {
    var S = sub(), k = await S.generateKey(EC, true, ["deriveBits"]), j = await S.exportKey("jwk", k.privateKey);
    return { k: { d: j.d, x: j.x, y: j.y }, p: b64(new Uint8Array(await S.exportKey("raw", k.publicKey))) };
  }
  async function aes(priv, pub, eph, info) {
    var S = sub(), bits = await S.deriveBits({ name: "ECDH", public: await S.importKey("raw", pub, EC, false, []) }, priv, 256);
    var h = await S.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    return S.deriveKey({ name: "HKDF", hash: "SHA-256", salt: eph, info: utf(info) }, h, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  // A shuffled circle from a secret: circle(seed, n) is the game's own (Fisher-Yates, then each gives to the next).
  async function draw(pubs, info, circle) {
    var S = sub(), secret = root.crypto.getRandomValues(new Uint8Array(16)), hex = Array.from(secret, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    var to = circle("x" + hex, pubs.length), e = await S.generateKey(EC, true, ["deriveBits"]), ep = new Uint8Array(await S.exportKey("raw", e.publicKey)), out = [];
    secret.fill(0); hex = "";
    try {
      for (var i = 0; i < pubs.length; i++) {
        var key = await aes(e.privateKey, unb64(pubs[i]), ep, info + ":" + i);
        out.push(b64(new Uint8Array(await S.encrypt({ name: "AES-GCM", iv: IV, additionalData: utf(pubs[i]), tagLength: TAG }, key, new Uint8Array([to[i]])))));
      }
    } finally { to.fill(0); to.length = 0; e = null; }
    return [b64(ep), out];
  }
  async function open(k, eph, box, info, pub) {
    var S = sub(), priv = await S.importKey("jwk", { kty: "EC", crv: "P-256", d: k.d, x: k.x, y: k.y }, EC, false, ["deriveBits"]), ep = unb64(eph);
    var pt = new Uint8Array(await S.decrypt({ name: "AES-GCM", iv: IV, additionalData: utf(pub), tagLength: TAG }, await aes(priv, ep, ep, info), unb64(box)));
    return pt.length === 1 ? pt[0] : -1;
  }
  var api = { ok: function () { return !!sub() && typeof root.crypto.getRandomValues === "function"; }, keys: keys, draw: draw, open: open, b64: b64 };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Siegel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
