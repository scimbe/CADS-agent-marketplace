// Page -> real wrapper (server.mjs on :18772 with DUELL_WEB_FILE=dist) -> stub-llm.mjs (:18771, set LITELLM_BASE_URL). No live model.
// Run: PW_DIR=<folder with node_modules/playwright> node test/browser/ai-e2e.mjs
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire((process.env.PW_DIR || process.cwd()) + '/')('playwright');
import assert from 'node:assert/strict';
const chrome = process.env.PW_CHROME, srv = 'http://127.0.0.1:18772', shot = process.argv[2];
const b = await chromium.launch({ executablePath: chrome || undefined });
const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'de-DE' }), p = await ctx.newPage();
const errs = [], sent = []; let mode = 'real';
p.on('pageerror', (e) => errs.push(String(e)));
await p.route('https://demos-34a13a96.bunsenbrenner.org/api/duell/**', async (r) => {
  const req = r.request(); if (req.method() === 'POST') sent.push({ url: req.url(), body: req.postData() });
  if (mode === 'down') return r.abort();
  const u = req.url().replace('https://demos-34a13a96.bunsenbrenner.org', srv);
  const res = await r.fetch({ url: u, headers: { 'content-type': 'application/json' } });
  await r.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
});
await p.goto(srv + '/duell');
const tap = (s) => p.locator(s).tap();
const ai0 = () => p.locator('.aibox .airow .chip').first();
const openCard = async () => { await p.evaluate(() => {}); await tap('#own'); await p.locator('.mech').first().tap(); await p.getByRole('tab', { name: 'Text' }).tap(); };
await openCard();
assert.match(await p.textContent('.aicount'), /3 KI-Versuche gratis/);
assert.deepEqual(sent, [], 'ohne Antippen geht nichts raus');
assert.ok(await p.getByText('Bei KI geht dein Text an unseren Server. Fotos bleiben auf dem Handy.').isVisible());
{ const P = await p.locator('#panel').boundingBox(), N = await p.getByText('Bei KI geht dein Text').boundingBox(), G = await ai0().boundingBox(); assert.ok(N.y + N.height <= P.y + P.height && G.y + G.height <= P.y + P.height, 'Hinweis und Knopf ohne Scrollen sichtbar'); }
if (shot) await p.screenshot({ path: shot + '-panel.png' });
const ai = () => p.locator('.aibox .airow .chip').first();
for (let i = 0; i < 3; i++) {
  await p.locator('#panel textarea').fill('Meine Karte Nummer ' + i);
  await ai().tap();
  await p.locator('.aiopt').first().waitFor();
  await p.waitForFunction((n) => new RegExp('Noch ' + n + ' von 3').test(document.querySelector('.aicount').textContent), 2 - i);
  const o = await p.locator('.aiopt').first().textContent();
  assert.match(o, /KI sagt Keks/, 'Ausgabe passt zum Modell');
  await p.locator('.aiopt').first().tap();
  assert.equal(await p.evaluate(() => window.DailyDebug.doc().x), o, 'Spruch steht auf der Karte');
}
// fourth: wall, honest, no call to the model
await p.locator('#panel textarea').fill('Vierte Karte');
await ai().tap();
await p.getByText('Abo kommt bald').waitFor();
const wall = await p.textContent('#shbody');
assert.match(wall, /3 KI-Versuche genutzt/); assert.ok(!/€|\d+[,.]\d\d|Countdown/.test(wall));
if (shot) await p.screenshot({ path: shot + '-wall.png' });
await p.getByText('Ich hätte Interesse').tap(); await p.getByText('Notiert, danke').waitFor();
await tap('#shback'); assert.ok(await p.locator('#stage').isVisible(), 'zurueck im Editor');
await p.locator('.aiopt').first().waitFor();
// bypass of the page: server still refuses
const dev = await p.evaluate(() => window.Kit.store.aiDev);
const direct = await p.evaluate(async (dev) => { const r = await fetch('https://demos-34a13a96.bunsenbrenner.org/api/duell/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'line', input: { text: 'tricks' }, device: dev }) }); return [r.status, (await r.json()).error]; }, dev);
assert.deepEqual(direct, [429, 'quota'], 'Server setzt durch');
// new person, server unreachable: local at once, nothing counted
await p.evaluate(() => { window.Kit.store.aiDev = ''; delete window.Kit.store.aiMeter; window.Kit.save(); });
mode = 'down';
const t0 = Date.now(); await p.locator('#panel textarea').fill('Offline');
await p.getByRole('tab', { name: 'Stil' }).tap(); await p.getByRole('tab', { name: 'Text' }).tap();
await ai().tap(); await p.getByText('Gerade ohne KI').waitFor();
assert.ok(Date.now() - t0 < 3000); assert.ok(await p.locator('.aiopt').count() >= 1);
await p.locator('.aiopt').first().tap();
mode = 'real';
// photo: only the typed sentence travels
await tap('#edback'); await tap('#own'); await p.locator('.mech').nth(1).tap();
await p.setInputFiles('#file', { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
await p.getByRole('tab', { name: 'Text' }).tap();
await p.locator('#panel input.field').nth(2).fill('Hund mit Sonnenbrille'); sent.length = 0;
await ai().tap(); await p.locator('.aiopt').first().waitFor();
assert.match(await p.locator('.aiopt').first().textContent(), /Wenn der Hund \/ Chef spielt/);
await p.locator('.aiopt').first().tap();
assert.deepEqual(await p.evaluate(() => [window.DailyDebug.doc().x, window.DailyDebug.doc().y]), ['Wenn der Hund', 'Chef spielt']);
const body = sent.filter((s) => s.url.endsWith('/ai'))[0].body;
assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ['device', 'input', 'kind', 'lang']); assert.ok(body.length < 200 && !/base64|data:/.test(body));
// beat: hook
await tap('#edback'); await tap('#own'); await p.locator('.mech').nth(2).tap(); await p.getByRole('tab', { name: 'Text' }).tap();
await p.locator('#panel input.field').nth(1).fill('Pizza');
await ai().tap(); await p.locator('.aiopt').first().waitFor(); await p.locator('.aiopt').first().tap();
assert.equal(await p.evaluate(() => window.DailyDebug.doc().x), 'Pizza Beat'); assert.match(await p.textContent('.lyrics'), /Kaese im Kreis/);
assert.ok(!errs.some((e) => !/Failed to fetch/.test(e)), errs.join()); await b.close(); console.log('ai-e2e: alle Schritte ok');
