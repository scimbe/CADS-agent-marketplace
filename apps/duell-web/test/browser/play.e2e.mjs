// "Mach's spielbar": real touch input at phone size, offline (every network request fails the test), frame times under CPU throttling.
// Run: PW_DIR=<folder with node_modules/playwright> node test/browser/play.e2e.mjs dist/index.html [screenshot-prefix]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium, devices } = createRequire((process.env.PW_DIR || process.cwd()) + '/')('playwright');
const dist = pathToFileURL(process.argv[2]).href, shot = process.argv[3];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'de-DE' }), p = await ctx.newPage();
const errs = [], net = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) net.push(r.url()); });
const cdp = await ctx.newCDPSession(p);
const frames = (ms) => p.evaluate((ms) => new Promise((ok) => { const d = []; let l = performance.now(); const t0 = l; (function f(n) { d.push(n - l); l = n; if (n - t0 < ms) requestAnimationFrame(f); else { d.sort((a, b) => a - b); ok({ n: d.length, p50: d[d.length >> 1], p95: d[Math.floor(d.length * 0.95)] }); } })(l); }), ms);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const doc = { k: 'card', x: 'Heute bin ich ein Keks', st: 'druck', col: ['#2b4bff', '#ffe600'], by: [], sk: [{ e: '🍕', x: 0.3, y: 0.3, r: 0, z: 1 }] };
await p.goto(dist + '#c=' + Buffer.from(JSON.stringify({ v: 1, d: doc })).toString('base64url'));
await p.locator('#go').tap(); await p.getByRole('tab', { name: 'Text' }).tap();
await p.locator('#panel').getByText("Mach's spielbar").tap();
assert.ok(await p.locator('#cv').isVisible(), 'Spiel laeuft sofort');
const st = await p.evaluate(() => window.Game.current());
assert.equal(st.emoji, '🍕'); assert.equal(st.title, 'Heute bin ich ein Keks'); assert.deepEqual(st.skin.c, ['#2b4bff', '#ffe600']);
assert.equal(await p.textContent('#title'), 'Heute bin ich ein Keks');
await p.waitForTimeout(300); if (shot) await p.screenshot({ path: shot + '-game.png' });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
const skinned = await frames(3000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
// real taps: fly, then fall to the end
const box = await p.locator('#cv').boundingBox();
for (let i = 0; i < 3; i++) { await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(250); }
await p.locator('#result.show, #result:visible').first().waitFor({ timeout: 8000 }).catch(() => {});
await p.waitForFunction(() => /Heute bin ich/.test(document.getElementById('res-line').textContent), null, { timeout: 8000 });
if (shot) await p.screenshot({ path: shot + '-over.png' });
assert.ok(await p.locator('#challenge').isVisible(), 'Herausforderung sichtbar');
const url = await p.evaluate(() => window.Daily.challengeUrl(window.Game.current(), 7));
await p.locator('#gback').tap();
assert.ok(await p.locator('#stage').isVisible(), 'zurueck bei der Karte, Arbeit erhalten');
assert.equal(await p.evaluate(() => window.DailyDebug.doc().x), 'Heute bin ich ein Keks');
// friend opens the challenge: same colours, emoji, line; no picture
const fctx = await b.newContext({ ...devices['Pixel 7'], locale: 'de-DE' }), f = await fctx.newPage();
f.on('pageerror', (e) => errs.push(String(e)));
await f.goto(dist + '#c=' + url.split('#c=')[1]); await f.waitForTimeout(400);
const fs = await f.evaluate(() => window.Game.current());
assert.deepEqual([fs.emoji, fs.title, fs.skin.c, fs.score === undefined], ['🍕', 'Heute bin ich ein Keks', ['#2b4bff', '#ffe600'], true]);
if (shot) await f.screenshot({ path: shot + '-friend.png' });
await fctx.close();
// photo: figure is the photo here, the link has no trace of it
await p.locator('#edback').tap(); await p.locator('#own').tap(); await p.locator('.mech').nth(1).tap();
await p.setInputFiles('#file', { name: 'x.png', mimeType: 'image/png', buffer: png }); await p.waitForTimeout(200);
await p.getByRole('tab', { name: 'Text' }).tap();
assert.ok(await p.getByText('Dein Foto bleibt auf dem Handy: Beim Teilen').first().isVisible(), 'Satz in der App');
await p.locator('#panel input.field').nth(0).fill('Mein Hund');
await p.locator('#panel').getByText("Mach's spielbar").tap(); await p.waitForTimeout(200);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
const photo = await frames(2000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
const pu = await p.evaluate(() => window.Daily.challengeUrl(window.Game.current(), 1));
const raw = JSON.parse(Buffer.from(pu.split('#c=')[1], 'base64url').toString());
assert.ok(!JSON.stringify(raw).includes('data:'), 'kein Bild'); assert.ok(pu.length < 700); assert.equal(typeof raw.emoji, 'string');
await p.locator('#gback').tap();
// plain game for comparison
await p.locator('#edback').tap(); await p.locator('#own').tap(); await p.locator('.mech').nth(3).tap();
await p.locator('#edmain').tap(); await p.waitForTimeout(200);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
const plain = await frames(3000);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
console.log(JSON.stringify({ skinned, photo, plain, url: url.length }));
assert.ok(skinned.p95 < plain.p95 * 1.5 + 4, 'Karten-Spiel nicht spuerbar langsamer');
assert.deepEqual(net, [], 'offline: kein Netz'); assert.deepEqual(errs, []);
await b.close(); console.log('play-e2e: alle Schritte ok');
