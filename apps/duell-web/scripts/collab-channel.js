"use strict";
// Two real sync engines over two peer-demo processes and a real edge: the channel's own limits apply, nothing is mocked.
// Usage: PEER_DEMO_BIN, PEER_CP, PEER_FRONT_DOOR and PEER_CA_FILE set, then collab-channel.js <contact-a> <contact-b>.
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const assert = require("node:assert/strict");
const D = require("../src/daily.js");
const S = require("../src/collab.js");

const [, , fileA, fileB] = process.argv;
const me = D.sanitizeProfile({ nick: "Ada" }), idea = D.IDEAS.find((i) => i.kind === "card");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(what, fn, ms) {
  const start = Date.now();
  while (!fn()) { if (Date.now() - start > ms) throw new Error("timeout: " + what); await sleep(10); }
  return Date.now() - start;
}
function phone(name, file) {
  const p = { name, file, doc: null, up: false, proc: null, in: 0 };
  p.c = S.create({ actor: S.newActor(), nick: () => name, emoji: () => "🐙", onPeer() {}, send(f) { if (p.up) p.proc.stdin.write(f + "\n"); } });
  p.start = () => {
    p.proc = spawn(process.env.PEER_DEMO_BIN, ["pipe", file, S.NS], { stdio: ["pipe", "pipe", "inherit"] });
    p.proc.stdin.on("error", () => {});
    readline.createInterface({ input: p.proc.stdout }).on("line", (l) => {
      if (l.startsWith("connected ")) { p.up = true; p.code = l.slice(10); p.c.connected(Date.now()); }
      else if (l.startsWith("msg ")) { p.in += 1; if (p.c.receive(l.slice(4), Date.now()) === "dropped") throw new Error("frame dropped"); if (!p.doc && p.c.meta()) p.doc = p.c.doc(); if (p.doc) p.c.applyTo(p.doc); }
      else if (l === "closed") { p.up = false; p.c.disconnected(); }
    });
    p.done = new Promise((r) => p.proc.on("exit", r));
  };
  return p;
}
(async () => {
  const a = phone("Ada", fileA), b = phone("Ben", fileB);
  a.doc = D.docFromIdea(idea, me, "de"); a.c.seed(a.doc);
  a.start(); b.start();
  const pump = setInterval(() => { for (const p of [a, b]) { if (p.doc) p.c.local(p.doc); p.c.tick(Date.now()); } }, 50);
  await until("connected", () => a.up && b.up, 40000);
  assert.equal(a.code, b.code);
  await until("join", () => b.doc && a.c.hash() === b.c.hash(), 8000);
  a.doc.x = "Ueber den echten Edge";
  const ms = await until("A to B", () => b.doc.x === "Ueber den echten Edge", 1000);
  console.log("A to B over the edge:", ms, "ms");
  b.doc.sk.push({ e: "🐸", x: 0.5, y: 0.5, r: 0, z: 1 });
  await until("sticker to A", () => a.doc.sk.length === 1, 1000);
  a.doc.sk.length = 0;
  await until("sticker gone on B", () => b.doc.sk.length === 0, 1000);
  // 20 s of constant typing: all of it must get through the channel's own rate limit.
  for (let i = 0; i < 200; i++) { a.doc.x = "Zeile " + i; await sleep(100); }
  await until("last line", () => b.doc.x === "Zeile 199", 2000);
  // The connection breaks: both change something apart, both come back with the same contacts.
  b.proc.kill("SIGKILL"); await b.done; b.up = false; b.c.disconnected();
  await until("A notices", () => !a.up, 15000);
  await a.done;
  a.doc.x = "Getrennt von Ada"; b.doc.col = ["#2b4bff", "#ffe600"];
  await sleep(300);
  a.start(); b.start();
  await until("reconnected", () => a.up && b.up, 40000);
  await until("converged after the break", () => a.c.hash() === b.c.hash() && b.doc.x === "Getrennt von Ada" && a.doc.col[0] === "#2b4bff", 8000);
  assert.deepEqual(D.sanitizeDoc(a.doc), D.sanitizeDoc(b.doc));
  console.log("frames in:", a.in, b.in, "rejected:", a.c.rejected(), b.c.rejected());
  assert.equal(a.c.rejected() + b.c.rejected(), 0);
  clearInterval(pump); a.proc.kill(); b.proc.kill();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
