// Tisch live mit 3 (Skat) und 4 Geraeten (Doppelkopf) ueber die echte Laufzeit und das Gruppen-Live von Strang F
// (Stern um den Gastgeber, ein Link je Gast). Jedes Geraet spielt seinen Sitz mit dem Bot der Karte (Stufe 1).
import test from "node:test";
import assert from "node:assert/strict";
import { cardOf } from "../src/cards/index.js";
import { testRuntime, counter, fakeLiveNet, until } from "./helpers.js";

const leaf = (rt) => rt.state.config.filter((c) => c.startsWith("inhalt.")).sort((a, b) => b.length - a.length)[0];

for (const [id, n] of [["tisch-skat", 3], ["tisch-doko", 4]]) {
  test(id + " live mit " + n + " Geraeten: ganze Partie, gleicher Zustand, nur die eigene Hand auf jedem Geraet, Ende geprueft", { timeout: 600000 }, async () => {
    const net = fakeLiveNet(), card = cardOf(id);
    const host = testRuntime({ live: net.loader, entropy: counter(n === 3 ? "a3" : "a4"), async: true });
    host.dispatch({ type: "OPEN", id }); host.dispatch({ type: "MODE", mode: "live" });
    // eine Runde reicht: ueber den Editor (Blase Regeln), wie ein Nutzer
    host.dispatch("CUSTOMIZE"); host.dispatch({ type: "BUBBLE", part: "regeln" }); host.dispatch({ type: "PARAM", key: "runden", value: 1 }); host.dispatch("CLOSE"); host.dispatch("DONE");
    assert.equal(host.state.ctx.params[id].runden, 1);
    host.dispatch("GO");
    await until(() => host.state.ctx.raum && host.state.ctx.raum.invites && Object.keys(host.state.ctx.raum.invites).length === n - 1, 20000);
    const guests = [];
    for (const s of Object.keys(host.state.ctx.raum.invites)) {
      const g = testRuntime({ live: net.loader, entropy: counter((n === 3 ? "b" : "c") + s), async: true });
      g.link(host.state.ctx.raum.invites[s]); g.dispatch("ACCEPT"); guests.push(g);
    }
    const all = [host, ...guests];
    await until(() => all.every((d) => d.state.ctx.session), 30000).catch((e) => { throw new Error(e.message + " " + all.map((d) => leaf(d) + ":" + d.state.ctx.error + ":" + JSON.stringify(d.state.ctx.raum && d.state.ctx.raum.error) + ":" + (d.state.ctx.reason || "")).join(" | ")); });
    for (let k = 0; k < 20000; k++) {
      for (const d of all) if (leaf(d) === "inhalt.card.play.turn") {
        const s = d.state.ctx.session, seat = d.state.ctx.viewer;
        const obs = card.observe(s.state, seat);
        for (let o = 0; o < n; o++) if (o !== seat && !s.log.some((x) => x.t === "reveal" && x.seat === o)) assert.equal(s.state.priv[o], null, "fremdes Geheimnis");
        d.dispatch({ type: "INPUT", input: card.bot(obs, seat, { level: 1, seed: "x" }) });
      }
      await new Promise((r) => setTimeout(r, 1));
      if (all.every((d) => leaf(d) === "inhalt.card.play.over") || all.some((d) => d.state.ctx.error)) break;
    }
    assert.deepEqual(all.map((d) => d.state.ctx.error), all.map(() => null));
    assert.ok(all.every((d) => leaf(d) === "inhalt.card.play.over"), all.map(leaf).join());
    const pub = all.map((d) => JSON.stringify(d.state.ctx.session.state.pub));
    for (const p of pub) assert.equal(p, pub[0]);
    const last = all[0].state.ctx.session.state.pub.last;
    assert.deepEqual(last.audit, []); assert.equal(last.cheat, undefined);
    assert.deepEqual(all.map((d) => d.state.ctx.session.mine[0]).sort(), [...Array(n).keys()]);
  });
}
