// Free wish and weather card: page -> real wrapper (:18772) -> stub-llm.mjs. Weather is answered by the route, no live service.
// Run: PW_DIR=<folder with node_modules/playwright> node test/browser/wish-e2e.mjs [screenshot-prefix]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, devices } = createRequire((process.env.PW_DIR || process.cwd()) + '/')('playwright');
const srv = 'http://127.0.0.1:18772', shot = process.argv[2];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'de-DE' }), p = await ctx.newPage();
const errs = [], sent = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.route('https://demos-34a13a96.bunsenbrenner.org/api/duell/**', async (r) => {
  const q = r.request(); sent.push({ url: q.url(), body: q.postData() });
  if (q.url().endsWith('/weather')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ place: 'Hamburg', date: JSON.parse(q.postData()).date, hi: 12, lo: 7, rain: 40, code: 61, source: 'Open-Meteo' }) });
  const res = await r.fetch({ url: q.url().replace('https://demos-34a13a96.bunsenbrenner.org', srv), headers: { 'content-type': 'application/json' } });
  await r.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
});
const doc = () => p.evaluate(() => window.DailyDebug.doc());
await p.goto(srv + '/duell');
await p.locator('#own').tap(); await p.locator('.mech').first().tap();
const before = await doc();
await p.getByRole('tab', { name: '✨ Wunsch' }).tap();
await p.getByText('Mach es gruseliger').tap();
await p.getByText('Wunsch anwenden').tap();
await p.getByText(/Geändert: /).waitFor();
const after = await doc();
assert.match(after.x, /^Gruselig/); assert.equal(after.st, 'neon'); assert.deepEqual(after.col, ['#c8ff00', '#7a1fff']); assert.equal(after.sk[0].e, '💀');
assert.equal(after.g, undefined, 'Spielfelder wirken nicht auf eine Karte');
const said = await p.locator('#panel').textContent();
assert.match(said, /Gruseliger gemacht/); assert.match(said, /Text/); assert.match(said, /Farbe/); assert.match(said, /Stil/); assert.match(said, /Sticker/);
assert.match(said, /Noch 2 von 3/, 'zaehlt als ein Versuch');
if (shot) await p.screenshot({ path: shot + '-wish.png' });
await p.getByText('↶ Rückgängig').tap();
const undone = await doc(); assert.deepEqual([undone.x, undone.st, undone.col, undone.sk], [before.x, before.st, before.col, before.sk], 'Rueckgaengig stellt alles her');
// weather: figures from the service, a wish cannot touch them
await p.getByRole('tab', { name: 'Text' }).tap();
await p.getByPlaceholder('Ort').fill('Hamburg'); await p.getByText('🌦 Wetter holen').tap();
await p.getByText('✕ Wetter weg').waitFor();
assert.deepEqual((await doc()).w && [(await doc()).w.hi, (await doc()).w.lo, (await doc()).w.rn], [12, 7, 40]);
assert.equal((await p.evaluate(() => window.Kit.store.aiMeter.remaining)), 2, 'Wetter kostet keinen Versuch');
if (shot) await p.screenshot({ path: shot + '-weather.png' });
await p.getByRole('tab', { name: '✨ Wunsch' }).tap();
await p.locator('#panel textarea').fill('Mach 30 Grad daraus'); await p.getByText('Wunsch anwenden').tap();
await p.getByText(/Geändert: /).waitFor();
assert.equal((await doc()).w.hi, 12, 'Zahlen bleiben');
// game: physics, world, title
await p.locator('#edback').tap(); await p.locator('#own').tap(); await p.locator('.mech').nth(3).tap();
await p.getByRole('tab', { name: '✨ Wunsch' }).tap();
await p.locator('#panel textarea').fill('Nachts und schwer'); await p.getByText('Wunsch anwenden').tap();
await p.getByText(/Geändert: /).waitFor();
const g = (await doc()).g; assert.deepEqual([g.params.gravity, g.theme, g.title], [2200, 'night', 'Nachtflug']);
assert.deepEqual(errs, []); await b.close(); console.log('wish-e2e: alle Schritte ok');
