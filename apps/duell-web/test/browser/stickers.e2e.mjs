// Real input through CDP (Input.dispatchTouchEvent / playwright mouse + touchscreen): the browser turns them into pointer events; no function of the page is called.
// Run: PW_DIR=<folder with node_modules/playwright> node test/browser/stickers.e2e.mjs dist/index.html [screenshot-prefix]
// Not part of `npm test`: the app has no browser dependency on purpose.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium, devices } = createRequire((process.env.PW_DIR || process.cwd()) + '/')('playwright');
const dist = process.argv[2], shot = process.argv[3];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e))); 
const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: i })) });
const tap = async (q) => { await touch('touchStart', [q]); await touch('touchEnd', []); await p.waitForTimeout(350); };
const swipe = async (from, to, n = 8) => { await touch('touchStart', [from]); for (let i = 1; i <= n; i++) { await touch('touchMove', [{ x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n }]); await p.waitForTimeout(16); } await p.waitForTimeout(40); };
const box = (s) => p.locator(s).boundingBox();
const mid = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const sk = () => p.evaluate(() => window.DailyDebug.doc().sk);
const scr = async (s) => { const c = await box('#stage'); return { x: c.x + s.x * c.width, y: c.y + s.y * c.height }; };
const seen = (s) => p.locator(s).isVisible();
// link with two stickers, as a friend would send it: open, go to the editor
const doc = { k: 'card', x: 'Hallo', st: 'druck', col: ['#ffd400', '#ff3b1d'], by: [{ n: 'Mira', w: ['sticker'] }], sk: [{ e: '🐸', x: 0.3, y: 0.3, r: 0, z: 1 }, { e: '🍕', x: 0.7, y: 0.45, r: 0, z: 1 }] };
const frag = Buffer.from(JSON.stringify({ v: 1, d: doc })).toString('base64url');
await p.goto(pathToFileURL(dist).href + '#c=' + frag);
await tap(mid(await box('#go')));
assert.equal((await sk()).length, 2, 'Remix-Sticker da');
assert.equal(await seen('.skx'), false, 'nichts gewaehlt, kein X');
// 1. tap selects -> X visible -> X deletes (remix sticker)
await tap(await scr((await sk())[1]));
assert.equal(await seen('.skx'), true, 'X sichtbar nach Tap');
if (shot) await p.screenshot({ path: shot + '-selected.png' });
const xb = await box('.skx'); assert.ok(xb.width >= 44 && xb.height >= 44, 'Tippflaeche 44px');
await tap(mid(xb));
assert.deepEqual((await sk()).map((s) => s.e), ['🐸'], 'X loescht Remix-Sticker');
assert.equal(await seen('.skx'), false);
// 2. undo
await tap(mid(await box('.skundo')));
assert.equal((await sk()).length, 2, 'Rueckgaengig bringt ihn zurueck');
// 3. drag into the bin
const s0 = (await sk())[0], from = await scr(s0);
await touch('touchStart', [from]); await touch('touchMove', [{ x: from.x + 20, y: from.y + 20 }]); await p.waitForTimeout(30);
assert.equal(await seen('.skbin'), true, 'Muelleimer erscheint beim Ziehen');
const bin = mid(await box('.skbin'));
await touch('touchMove', [bin]); await p.waitForTimeout(60);
assert.ok(await p.locator('.skbin.over').count(), 'Muelleimer leuchtet');
if (shot) await p.screenshot({ path: shot + '-bin.png' });
await touch('touchEnd', []); await p.waitForTimeout(200);
assert.deepEqual((await sk()).map((s) => s.e), ['🍕'], 'Muelleimer loescht');
assert.equal(await seen('.skbin'), false);
await tap(mid(await box('.skundo')));
assert.equal((await sk()).length, 2, 'Rueckgaengig nach Muelleimer');
// 4. plain drag moves, one undo restores the position
const b0 = (await sk())[1], af = await scr(b0);
await swipe(af, { x: af.x - 60, y: af.y + 40 }); await touch('touchEnd', []); await p.waitForTimeout(200);
const b1 = (await sk())[1]; assert.ok(Math.abs(b1.x - b0.x) > 0.05, 'verschoben');
await tap(mid(await box('.skundo'))); assert.equal((await sk())[1].x, b0.x, 'Position zurueck');
// 5. two fingers on the selected sticker: spread and turn
await tap(await scr((await sk())[1]));
const c = await scr((await sk())[1]);
const f1 = { x: c.x - 25, y: c.y }, f2 = { x: c.x + 25, y: c.y };
await touch('touchStart', [f1]); await touch('touchStart', [f1, f2]);
for (let i = 1; i <= 8; i++) { const a = i / 8 * 1.0, d = 25 + i * 8; await touch('touchMove', [{ x: c.x - Math.cos(a) * d, y: c.y - Math.sin(a) * d }, { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d }]); await p.waitForTimeout(16); }
await touch('touchEnd', []); await p.waitForTimeout(200);
const b2 = (await sk())[1]; assert.ok(b2.z > 1.5, 'zwei Finger skalieren: ' + b2.z); assert.ok(Math.abs(b2.r - 1) < 0.2, 'zwei Finger drehen: ' + b2.r);
await tap(mid(await box('.skundo')));
// 6. grip scales and turns
await tap(await scr((await sk())[1]));
const g = mid(await box('.skgrip'));
await swipe(g, { x: g.x + 40, y: g.y + 40 }); await touch('touchEnd', []); await p.waitForTimeout(200);
const b3 = (await sk())[1]; assert.ok(b3.z > 1.2, 'Griff skaliert: ' + b3.z);
// 7. mouse in a desktop browser, panel way, picture without chrome, new link without the deleted sticker
await tap(await scr((await sk())[0]));
await tap(mid(await box('.skx')));
const t = await p.locator('#edmain').textContent(); assert.equal(t.trim(), 'Fertig', 'Loeschen zaehlt als Aenderung');
await tap(mid(await box('#edmain')));
const url = await p.evaluate(() => window.DailyDebug.result().url);
const dec = JSON.parse(Buffer.from(url.split('#c=')[1], 'base64url').toString());
assert.deepEqual(dec.d.sk.map((s) => s.e), ['🍕'], 'neuer Link ohne geloeschten Sticker');
await ctx.close();
const dctx = await b.newContext({ viewport: { width: 1200, height: 800 }, locale: 'de-DE' }), q = await dctx.newPage();
q.on('pageerror', (e) => errs.push(String(e)));
await q.goto(pathToFileURL(dist).href + '#c=' + frag); await q.click('#go');
const r = await q.locator('#stage').boundingBox();
await q.mouse.click(r.x + 0.3 * r.width, r.y + 0.3 * r.height); await q.waitForTimeout(200);
await q.click('.skx'); assert.equal((await q.evaluate(() => window.DailyDebug.doc().sk)).length, 1, 'Maus loescht');
await q.getByRole('tab', { name: 'Sticker' }).click();
await q.locator('#panel .chip.em').nth(0).click(); assert.equal((await q.evaluate(() => window.DailyDebug.doc().sk)).length, 2, 'Panel fuegt hinzu');
await q.locator('#panel .chip', { hasText: '✕' }).click(); assert.equal((await q.evaluate(() => window.DailyDebug.doc().sk)).length, 1, 'Panel-X loescht');
assert.deepEqual(errs, []);
await b.close(); console.log('sticker-e2e: alle Schritte ok');
