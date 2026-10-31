// Ein Teilnehmer: echtes Chromium, schreibt alle 500 ms Messwerte und fuehrt Klicks aus.
import { chromium } from 'playwright';
import { connect, createServer } from 'node:net';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const { PEER, QUERY = '', OUT = '/out' } = process.env;
writeFileSync('/tmp/tone.wav', tone(PEER === 'a' ? 440 : 880));
// getUserMedia braucht einen sicheren Kontext: die Seite laeuft ueber localhost, die lokale
// Weiterleitung geht durch dasselbe Netz wie jeder andere Verkehr.
createServer((c) => {
  const up = connect(8080, 'signal');
  c.pipe(up).pipe(c);
  c.on('error', () => up.destroy());
  up.on('error', () => c.destroy());
}).listen(8080, '127.0.0.1');
const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=/tmp/tone.wav', '--autoplay-policy=no-user-gesture-required',
    '--disable-features=WebRtcHideLocalIpsWithMdns'],
});
const page = await (await browser.newContext()).newPage();
page.on('console', (m) => appendFileSync(`${OUT}/${PEER}.log`, `${m.text()}\n`));
page.on('pageerror', (e) => appendFileSync(`${OUT}/${PEER}.log`, `pageerror ${e.message}\n`));
await page.goto(`http://localhost:8080/?peer=${PEER}&${QUERY}`);
await page.waitForFunction('window.ready === true');
writeFileSync(`${OUT}/${PEER}.ready`, '1');
let done = 0;
for (;;) {
  if (existsSync(`${OUT}/${PEER}.cmd`)) {
    const cmds = readFileSync(`${OUT}/${PEER}.cmd`, 'utf8').trim().split('\n');
    for (; done < cmds.length; done++) {
      if (cmds[done] === 'quit') { await browser.close(); process.exit(0); }
      await page.click(`[data-testid="${cmds[done]}"]`, { timeout: 3000, force: true });
    }
  }
  const s = await page.evaluate('window.snapshot()');
  appendFileSync(`${OUT}/${PEER}.jsonl`, `${JSON.stringify(s)}\n`);
  await new Promise((r) => setTimeout(r, 500));
}

function tone(hz) {
  const rate = 48000; const n = rate * 2;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * hz * i / rate)), 44 + i * 2);
  return b;
}
