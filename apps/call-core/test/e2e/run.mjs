#!/usr/bin/env node
// Messstand fuer den Anrufkern, nur lokal. Zwei Chromium in getrennten Docker-Netzen ohne
// Internet und ohne Weg zueinander, dazwischen ein echtes coturn mit Wegwerf-Secret.
// Das Live-TURN wird nicht beruehrt. Aufruf: node test/e2e/run.mjs [szenario ...] [--repeat=N]
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMAGE = 'call-core-e2e:local';
const COTURN = 'coturn/coturn:4.6';
const R = `cc${randomBytes(3).toString('hex')}`;
const NETS = { a: 41, b: 42, a2: 43, core: 44 };
const net = (n) => `${R}-${n}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dk = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const quiet = (...a) => { try { return dk(...a); } catch { return ''; } };
const assert = (c, m) => { if (!c) throw new Error(m); };

const secret = randomBytes(24).toString('hex');
let workdir;
const containers = [];

function setup() {
  workdir = mkdtempSync(join(process.env.E2E_TMP || tmpdir(), 'call-e2e-'));
  dk('build', '-q', '-t', IMAGE, '-f', join(root, 'test/e2e/Dockerfile'), root);
  for (const [n, i] of Object.entries(NETS)) dk('network', 'create', '--internal', '--subnet', `172.29.${i}.0/24`, net(n));
  // Parameter wie im Betrieb (Quoten, Bandbreite), nur denied-peer-ip entfaellt, weil der
  // Messstand private Adressen nutzt. Das Secret steht in einer Datei, nicht in der Kommandozeile.
  writeFileSync(join(workdir, 'turnserver.conf'), `static-auth-secret=${secret}\n`);
  dk('create', '--name', `${R}-turn`, '--network', net('core'), '--ip', '172.29.44.2', COTURN,
    '-c', '/etc/coturn/run.conf', '--listening-port=3478', '--realm=test.invalid', '--use-auth-secret',
    '--relay-ip=172.29.44.2', '--external-ip=172.29.44.2', '--min-port=49160', '--max-port=49400', '--user-quota=8', '--total-quota=60',
    '--max-bps=1500000', '--no-multicast-peers', '--no-cli', '--no-tls', '--no-dtls', '--fingerprint', '--stale-nonce=600',
    '--log-file=stdout', '--simple-log');
  dk('cp', join(workdir, 'turnserver.conf'), `${R}-turn:/etc/coturn/run.conf`);
  containers.push(`${R}-turn`);
  for (const n of ['a', 'b', 'a2']) dk('network', 'connect', '--alias', 'turn', net(n), `${R}-turn`);
  dk('start', `${R}-turn`);
}

function startSignal(ttl) {
  const name = `${R}-signal`;
  dk('create', '--name', name, '--network', net('a'), '--network-alias', 'signal', '-e', `TURN_SECRET=${secret}`, '-e', `TURN_TTL=${ttl}`, '-w', '/app', IMAGE, 'node', 'e2e/signal.mjs');
  containers.push(name);
  for (const n of ['b', 'a2']) dk('network', 'connect', '--alias', 'signal', net(n), name);
  dk('start', name);
}

function startPeer(id, netName, query, out) {
  const name = `${R}-${id}`;
  dk('run', '-d', '--name', name, '--network', net(netName), '--cap-add', 'NET_ADMIN', '-v', `${out}:/out`, '-e', `PEER=${id}`, '-e', `QUERY=${query}`, '-w', '/app', IMAGE, 'node', 'e2e/peer.mjs');
  containers.push(name);
}

function stop(...names) {
  for (const n of names) { quiet('rm', '-f', n); containers.splice(containers.indexOf(n), 1); }
}

function teardown() {
  for (const c of [...containers]) quiet('rm', '-f', c);
  for (const n of Object.keys(NETS)) quiet('network', 'rm', net(n));
  if (workdir) rmSync(workdir, { recursive: true, force: true });
}

class Peer {
  constructor(id, out) { Object.assign(this, { id, out, cmds: [] }); }
  get name() { return `${R}-${id(this)}`; }
  click(testid) { this.cmds.push(testid); writeFileSync(join(this.out, `${this.id}.cmd`), `${this.cmds.join('\n')}\n`); }
  samples() {
    const f = join(this.out, `${this.id}.jsonl`);
    return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];
  }
  last() { return this.samples().at(-1); }
  async waitFor(f, what, ms = 30000) {
    const end = Date.now() + ms;
    for (;;) {
      const s = this.last();
      if (s && f(s)) return s;
      if (Date.now() > end) throw new Error(`${this.id}: ${what} nicht erreicht, zuletzt ${JSON.stringify(s)}`);
      await sleep(200);
    }
  }
  exec(...a) { return dk('exec', this.name, ...a); }
}
const id = (p) => p.id;

async function session(query, fn, opts = {}) {
  const { ttl = 600, netA = 'a', netB = 'b' } = opts;
  dk('restart', '-t', '0', `${R}-turn`);
  await sleep(500);
  const logSince = new Date().toISOString();
  const out = mkdtempSync(join(workdir, 'o-'));
  execFileSync('chmod', ['777', out]);
  startSignal(ttl);
  startPeer('a', netA, query, out);
  startPeer('b', netB, query, out);
  const a = new Peer('a', out); const b = new Peer('b', out);
  try {
    for (const p of [a, b]) {
      const end = Date.now() + 60000;
      while (!existsSync(join(out, `${p.id}.ready`))) { assert(Date.now() < end, `${p.id} startet nicht: ${quiet('logs', '--tail', '20', p.name)}`); await sleep(200); }
    }
    const res = await fn(a, b, out);
    const channel = JSON.parse(dk('exec', `${R}-signal`, 'node', '-e', "fetch('http://localhost:8080/stats').then(r=>r.text()).then(console.log)"));
    assert(channel.messagesPerMinuteMax < 120, `Kanalgrenze 120/min ueberschritten: ${channel.messagesPerMinuteMax}`);
    assert(channel.largestMessageBytes < 32768, `Kanalgrenze 32 KiB ueberschritten: ${channel.largestMessageBytes}`);
    const turn = turnLoad(logSince);
    assert(!opts.expectDirect || turn.rxBytes < 100000, `Direktweg lief doch ueber das Relay: ${turn.rxBytes}`);
    assert(opts.expectDirect || turn.rxBytes > 100000, `Relay hat keinen Verkehr gezaehlt: ${turn.rxBytes}`);
    return { ...res, turn, channel };
  } catch (e) {
    console.error(`coturn: ${JSON.stringify(turnLoad(logSince))} ${quiet('logs', '--since', logSince, `${R}-turn`).split('\n').filter((l) => /error|quota|Quota|486|508/i.test(l)).slice(-6).join(' | ')}`);
    for (const p of ['a', 'b']) { const l = join(out, `${p}.log`); if (existsSync(l)) console.error(`--- ${p}.log\n${readFileSync(l, 'utf8').slice(-1200)}`); }
    throw e;
  } finally {
    stop(`${R}-a`, `${R}-b`, `${R}-signal`);
  }
}

async function dial(a, b, button = 'call') {
  await sleep(500);
  a.click(button);
  await b.waitFor((s) => s.state === 'ringing-in', 'Klingeln');
  await a.waitFor((s) => s.state === 'ringing-out', 'Rueckmeldung Klingeln');
  await sleep(1200);
  const quiet = [a.last(), b.last()];
  assert(quiet.every((s) => s.gum === 0 && s.liveTracks === 0), `Mikrofon vor Annahme offen: ${JSON.stringify(quiet)}`);
  const t0 = Date.now();
  b.click('accept');
  await Promise.all([a, b].map((p) => p.waitFor((s) => s.state === 'connected' && s.stats?.bytesReceived > 0, 'Medienfluss')));
  return Date.now() - t0;
}

/** Medienfluss ueber msDauer: Bytes muessen auf beiden Seiten steigen, Ton muss der fremde sein. */
async function measure(a, b, ms = 4000) {
  const s0 = [a.last(), b.last()];
  await sleep(ms);
  const s1 = [a.last(), b.last()];
  const rates = s1.map((s, i) => Math.round(((s.stats.bytesReceived - s0[i].stats.bytesReceived) * 8) / (s.t - s0[i].t)));
  assert(rates.every((r) => r > 5), `Bytes steigen nicht: ${rates} kbit/s`);
  assert(Math.abs(s1[0].peakHz - 880) < 30, `A hoert nicht B: ${s1[0].peakHz} Hz`);
  assert(Math.abs(s1[1].peakHz - 440) < 30, `B hoert nicht A: ${s1[1].peakHz} Hz`);
  return { kbitA: rates[0], kbitB: rates[1], heardByA: s1[0].peakHz, heardByB: s1[1].peakHz, pairA: s1[0].stats.pair, pairB: s1[1].stats.pair };
}

const assertRelay = (m) => assert(m.pairA?.local === 'relay' && m.pairB?.local === 'relay', `kein Relay: ${JSON.stringify([m.pairA, m.pairB])}`);

/** Zeit bis beide Seiten wieder verbunden sind und Bytes nachweislich weiter steigen. */
async function recovery(a, b, since, ms = 60000) {
  await Promise.all([a, b].map((p) => p.waitFor((s) => s.t > since && s.state === 'reconnecting', 'sichtbarer Neuaufbau', 20000)
    .catch(() => null)));
  const end = Date.now() + ms;
  for (;;) {
    const ok = [a, b].every((p) => {
      const l = p.samples().filter((s) => s.t > since).slice(-3);
      return l.length === 3 && l.every((s) => s.state === 'connected') && l[2].stats.bytesReceived > l[0].stats.bytesReceived;
    });
    if (ok) break;
    assert(Date.now() < end, `keine Wiederherstellung: ${JSON.stringify([a.last(), b.last()])}`);
    await sleep(200);
  }
  const firstBack = (p) => {
    const l = p.samples().filter((s) => s.t > since);
    for (let i = l.length - 1; i > 0; i--) if (l[i - 1].state !== 'connected') return l[i].t;
    return l[0].t;
  };
  return Math.max(firstBack(a), firstBack(b)) - since;
}

/** Laengste Zeit ohne neue Bytes ab since, je Teilnehmer gemessen in den getStats-Proben. */
function mediaGap(p, since) {
  const l = p.samples().filter((s) => s.t >= since - 1000 && s.stats);
  let gap = 0; let lastT = l[0]?.t; let lastB = l[0]?.stats.bytesReceived;
  for (const s of l) {
    if (s.stats.bytesReceived > lastB) { gap = Math.max(gap, s.t - lastT); lastT = s.t; lastB = s.stats.bytesReceived; }
  }
  return gap;
}

const BLOCK = ['-I', 'OUTPUT', '!', '-o', 'lo', '-j', 'DROP'];
const BLOCK_IN = ['-I', 'INPUT', '!', '-i', 'lo', '-j', 'DROP'];

const SCENARIOS = {
  // Gegenprobe: im selben Netz waehlt der Stand direkte Wege, Relay-Pruefungen sind also aussagekraeftig.
  direct: () => session('', async (a, b) => {
    const setupMs = await dial(a, b);
    const m = await measure(a, b);
    assert(m.pairA.local !== 'relay', `unerwartet Relay: ${JSON.stringify(m.pairA)}`);
    a.click('hangup');
    return { setupMs, ...m };
  }, { netB: 'a', expectDirect: true }),

  'relay-forced': () => session('relay=1', async (a, b) => {
    const setupMs = await dial(a, b);
    const m = await measure(a, b, 6000);
    assertRelay(m);
    a.click('hangup');
    await b.waitFor((s) => s.state === 'ended', 'Ende');
    await a.waitFor((s) => s.liveTracks === 0, 'Mikrofon zu');
    await sleep(2500);
    assert(b.last().endReason === 'remote-hangup' && b.last().label === 'Aufgelegt', 'Ende nicht sichtbar');
    assert(a.last().recorders === 0 && b.last().recorders === 0, 'Aufzeichnung gestartet');
    const live = turnLoad(new Date(Date.now() - 60000).toISOString()).allocationsLive;
    assert(live === 0, `Relay-Zuteilungen nach Auflegen offen: ${live}`);
    return { setupMs, ...m };
  }),

  // Getrennte Netze, keine Vorgabe: Direktweg ist unmoeglich, Rueckfall muss von selbst passieren.
  'relay-fallback': () => session('', async (a, b) => {
    const setupMs = await dial(a, b);
    const m = await measure(a, b);
    assertRelay(m);
    a.click('hangup');
    return { setupMs, ...m };
  }),

  'udp-blocked': () => session('relay=1', async (a, b) => {
    a.exec('iptables', '-I', 'OUTPUT', '-p', 'udp', '!', '-o', 'lo', '-j', 'DROP');
    const setupMs = await dial(a, b);
    const m = await measure(a, b);
    assertRelay(m);
    assert(m.pairA.relayProtocol === 'tcp', `erwartet TURN ueber TCP: ${JSON.stringify(m.pairA)}`);
    a.click('hangup');
    return { setupMs, ...m };
  }),

  outage: () => session('relay=1', async (a, b) => {
    await dial(a, b);
    const before = await measure(a, b, 2500);
    assertRelay(before);
    a.exec('iptables', ...BLOCK); a.exec('iptables', ...BLOCK_IN);
    const cut = Date.now();
    await sleep(8000);
    const during = b.last().stats.bytesReceived;
    await sleep(1500);
    assert(b.last().stats.bytesReceived - during < 2000, 'Sperre wirkt nicht');
    assert(['reconnecting'].includes(b.last().state) && b.last().label.includes('wiederhergestellt'), `Zustand nicht sichtbar: ${b.last().label}`);
    a.exec('iptables', '-D', ...BLOCK.slice(1)); a.exec('iptables', '-D', ...BLOCK_IN.slice(1));
    const restored = Date.now();
    const recoveryMs = await recovery(a, b, restored);
    const after = await measure(a, b);
    assertRelay(after);
    a.click('hangup');
    return { outageMs: restored - cut, recoveryMs, mediaGapMs: [mediaGap(a, cut), mediaGap(b, cut)], before, after };
  }),

  // Netzwechsel wie WLAN zu Mobilfunk: neue IP, alte Relay-Zuteilung verloren.
  // Laufzeit der TURN-Daten kuerzer als die Wartezeit: alte Daten gelten nicht mehr.
  'network-change': () => session('relay=1', async (a, b) => {
    await dial(a, b);
    const before = await measure(a, b, 2500);
    assertRelay(before);
    await sleep(16000);
    const old = before.pairA;
    const cut = Date.now();
    dk('network', 'disconnect', net('a'), a.name);
    dk('network', 'connect', net('a2'), a.name);
    const recoveryMs = await recovery(a, b, cut);
    const after = await measure(a, b);
    assertRelay(after);
    const ip = a.exec('sh', '-c', 'hostname -i');
    assert(ip.startsWith('172.29.43.'), `IP nicht gewechselt: ${ip}`);
    a.click('hangup');
    assert(a.last().epoch >= 1, 'kein Neuaufbau ausgeloest');
    return { recoveryMs, mediaGapMs: [mediaGap(a, cut), mediaGap(b, cut)], ip, epochA: a.last().epoch, oldPair: old, after };
  }, { ttl: 15 }),

  // Derselbe Netzwechsel beim Angerufenen: darf nicht schlechter sein als beim Anrufer.
  'network-change-callee': () => session('relay=1', async (a, b) => {
    await dial(a, b);
    assertRelay(await measure(a, b, 2500));
    const cut = Date.now();
    dk('network', 'disconnect', net('b'), b.name);
    dk('network', 'connect', net('a2'), b.name);
    const recoveryMs = await recovery(a, b, cut);
    assertRelay(await measure(a, b));
    assert(b.last().epoch >= 1, 'kein Neuaufbau ausgeloest');
    a.click('hangup');
    return { recoveryMs, mediaGapMs: [mediaGap(a, cut), mediaGap(b, cut)], epochA: a.last().epoch };
  }),

  // Angerufener ohne Konto: bekommt TURN-Daten nur Ende-zu-Ende vom Anrufer, auch beim Neustart.
  'no-account-callee': () => session('relay=1&noaccount=1', async (a, b) => {
    await dial(a, b);
    const m = await measure(a, b);
    assertRelay(m);
    const cut = Date.now();
    dk('network', 'disconnect', net('b'), b.name);
    dk('network', 'connect', net('a2'), b.name);
    const recoveryMs = await recovery(a, b, cut);
    assertRelay(await measure(a, b));
    assert(b.last().epoch >= 1, 'kein Neuaufbau ausgeloest');
    a.click('hangup');
    return { recoveryMs, mediaGapMs: [mediaGap(a, cut), mediaGap(b, cut)], ...m };
  }, { ttl: 15 }),

  // Gegenstelle verschwindet ohne bye: Ende muss sichtbar kommen, Relay frei werden.
  'peer-gone': () => session('relay=1&window=10000', async (a, b) => {
    await dial(a, b);
    await measure(a, b, 2000);
    quiet('kill', b.name);
    const cut = Date.now();
    await a.waitFor((s) => s.state === 'ended', 'Ende nach Verlust', 30000);
    assert(a.last().endReason === 'connection-lost' && a.last().liveTracks === 0, JSON.stringify(a.last()));
    return { endedAfterMs: a.last().t - cut, label: a.last().label };
  }),

  // Regression aus webconference-demo#130: zweiter Anruf derselben zwei Teilnehmer.
  'second-call': () => session('relay=1', async (a, b) => {
    await dial(a, b);
    await measure(a, b, 2000);
    a.click('hangup');
    await b.waitFor((s) => s.state === 'ended', 'Ende');
    await sleep(1000);
    a.click('call');
    await b.waitFor((s) => s.state === 'ringing-in', 'zweites Klingeln');
    b.click('accept');
    await Promise.all([a, b].map((p) => p.waitFor((s) => s.state === 'connected' && s.stats?.bytesReceived > 0, 'zweiter Medienfluss')));
    const m = await measure(a, b);
    assertRelay(m);
    a.click('hangup');
    return m;
  }),

  video: () => session('relay=1', async (a, b) => {
    await sleep(500);
    a.click('videocall');
    await b.waitFor((s) => s.state === 'ringing-in', 'Klingeln');
    b.click('accept');
    await Promise.all([a, b].map((p) => p.waitFor((s) => s.state === 'connected', 'verbunden')));
    await sleep(3000);
    const f0 = [a.last().stats.framesDecoded, b.last().stats.framesDecoded];
    const m = await measure(a, b, 5000);
    const f1 = [a.last().stats.framesDecoded, b.last().stats.framesDecoded];
    assert(f1[0] > f0[0] + 20 && f1[1] > f0[1] + 20, `Video steht: ${f0} ${f1}`);
    assertRelay(m);
    a.click('hangup');
    return { fps: f1.map((x, i) => (x - f0[i]) / 5), ...m };
  }),
};

/** Unabhaengiger Beleg aus dem Relay: Zuteilungen laut Log, Bytes laut Netzzaehler des Containers. */
function turnLoad(since) {
  let live = 0; let peak = 0; let created = 0;
  for (const l of quiet('logs', '--since', since, `${R}-turn`).split('\n')) {
    const c = l.match(/allocation count (incremented|decremented), now (\d+)/);
    if (c) { live = Number(c[2]); peak = Math.max(peak, live); if (c[1] === 'incremented') created += 1; }
  }
  const dev = quiet('exec', `${R}-turn`, 'cat', '/proc/net/dev').split('\n').filter((l) => /^\s*eth/.test(l));
  const rxBytes = dev.reduce((sum, l) => sum + Number(l.trim().split(/\s+/)[1]), 0);
  return { allocationsCreated: created, allocationsPeak: peak, allocationsLive: live, rxBytes };
}

async function main() {
  const args = process.argv.slice(2);
  const repeat = Number(args.find((a) => a.startsWith('--repeat='))?.split('=')[1] || 1);
  const names = args.filter((a) => !a.startsWith('--'));
  const list = names.length ? names : Object.keys(SCENARIOS);
  const results = [];
  let failed = 0;
  setup();
  try {
    for (const name of list) {
      for (let i = 0; i < repeat; i++) {
        const t = Date.now();
        try {
          const res = await SCENARIOS[name]();
          results.push({ name, ok: true, res });
          console.log(`PASS ${name} ${Math.round((Date.now() - t) / 1000)}s ${JSON.stringify(res)}`);
        } catch (e) {
          failed += 1;
          results.push({ name, ok: false, error: e.message });
          console.log(`FAIL ${name}: ${e.message}`);
        }
      }
    }
  } finally {
    teardown();
  }
  if (process.env.E2E_REPORT) writeFileSync(process.env.E2E_REPORT, JSON.stringify(results, null, 2));
  console.log(`${results.length - failed}/${results.length} bestanden`);
  process.exit(failed ? 1 : 0);
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { teardown(); process.exit(130); });
main().catch((e) => { console.error(e); teardown(); process.exit(1); });

