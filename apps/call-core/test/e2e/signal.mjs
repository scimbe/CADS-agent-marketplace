// Testkanal: reicht Nachrichten nur an gerade verbundene Teilnehmer weiter, ohne Puffer.
// Das entspricht dem Peer-Kanal (Zustellung nur online). Zugleich Ausgabestelle fuer TURN-Daten.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mintTurnCredential } from '../server/turn-credentials.js';

const { TURN_SECRET, TURN_TTL = '600' } = process.env;
const clients = new Map();
const seen = { max: 0, maxBytes: 0, total: 0, stamps: [] };
// Herzschlag: ein still gestorbener Strom wird auf der Gegenseite erkannt.
setInterval(() => clients.forEach((c) => c.write('event: ping\ndata: 1\n\n')), 1000);
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const peer = url.searchParams.get('peer');
  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    res.write('event: ping\ndata: 1\n\n');
    clients.set(peer, res);
    req.on('close', () => { if (clients.get(peer) === res) clients.delete(peer); });
    return;
  }
  if (url.pathname === '/send') {
    let body = '';
    for await (const c of req) body += c;
    const now = Date.now();
    seen.total += 1;
    seen.maxBytes = Math.max(seen.maxBytes, Buffer.byteLength(body));
    seen.stamps = seen.stamps.filter((t) => now - t < 60000);
    seen.stamps.push(now);
    seen.max = Math.max(seen.max, seen.stamps.length);
    const to = clients.get(url.searchParams.get('to'));
    if (to) to.write(`data: ${body}\n\n`);
    res.writeHead(204).end();
    return;
  }
  if (url.pathname === '/stats') {
    res.end(JSON.stringify({ messagesPerMinuteMax: seen.max, largestMessageBytes: seen.maxBytes, messages: seen.total }));
    return;
  }
  if (url.pathname === '/ice') {
    const cred = mintTurnCredential({ secret: TURN_SECRET, subject: `test-${peer}`, ttlSeconds: Number(TURN_TTL) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ urls: url.searchParams.get('tcp') ? 'turn:turn:3478?transport=tcp' : ['turn:turn:3478?transport=udp', 'turn:turn:3478?transport=tcp'], ...cred }]));
    return;
  }
  const file = url.pathname === '/' ? 'e2e/page.html' : normalize(url.pathname.slice(1));
  try {
    const data = await readFile(join('/app', file));
    res.writeHead(200, { 'content-type': types[extname(file)] || 'text/plain' }).end(data);
  } catch { res.writeHead(404).end(); }
}).listen(8080, '0.0.0.0');
