// Eigene Statechart (Variante A): Teilmenge von SCXML (W3C 2015) – hierarchische und parallele Zustaende, initial,
// Transitionen mit Ereignis/Bedingung/Ziel, zielfreie (interne) Transitionen, entry/exit-Aktionen, interne Ereignisse
// (raise) als Makroschritt. Keine History, keine verzoegerten Ereignisse, keine ereignislosen Transitionen.
// Rein funktional: send(state, event) -> neuer Zustand; Seiteneffekte werden als Liste "effects" zurueckgegeben.

/**
 * @param {object} def  Wurzelknoten { type:'parallel'|'compound', initial?, states, on?, entry?, exit? }
 * @param {{guards?:Object<string,Function>, actions?:Object<string,Function>}} impl
 */
export function createMachine(def, impl = {}) {
  const guards = impl.guards || {}, actions = impl.actions || {};
  const nodes = new Map();
  let order = 0;
  function build(id, n, parent) {
    const kids = n.states ? Object.keys(n.states) : [];
    const type = n.type || (kids.length ? "compound" : "atomic");
    if (type === "compound" && !n.initial) throw new Error("statechart: " + id + " ohne initial");
    const node = { id, parent, type, order: order++, children: [], initial: n.initial ? join(id, n.initial) : null,
      entry: n.entry || [], exit: n.exit || [], on: normOn(id, n.on || {}) };
    nodes.set(id, node);
    for (const k of kids) node.children.push(build(join(id, k), n.states[k], id).id);
    if (node.initial && !nodes.has(node.initial)) throw new Error("statechart: initial " + node.initial + " fehlt");
    return node;
  }
  function join(a, b) { return a ? a + "." + b : b; }
  function normOn(id, on) {
    const out = {};
    for (const ev of Object.keys(on)) {
      const list = Array.isArray(on[ev]) ? on[ev] : [on[ev]];
      out[ev] = list.map((t) => {
        const tr = typeof t === "string" ? { target: t } : t;
        return { source: id, event: ev, target: tr.target || null, cond: tr.cond || null, actions: tr.actions || [], raise: tr.raise || null };
      });
    }
    return out;
  }
  const ROOT = "";
  build(ROOT, def, null);
  for (const n of nodes.values()) for (const ev of Object.keys(n.on)) for (const t of n.on[ev]) {
    if (t.target && !nodes.has(t.target)) throw new Error("statechart: Ziel " + t.target + " fehlt (" + n.id + " " + ev + ")");
    if (t.cond && !guards[t.cond]) throw new Error("statechart: Bedingung " + t.cond + " fehlt");
    for (const a of t.actions) if (!actions[a]) throw new Error("statechart: Aktion " + a + " fehlt");
  }
  for (const n of nodes.values()) for (const a of n.entry.concat(n.exit)) if (!actions[a]) throw new Error("statechart: Aktion " + a + " fehlt");
  if (nodes.get(ROOT).type === "parallel") for (const n of nodes.values()) for (const ev of Object.keys(n.on)) for (const t of n.on[ev]) {
    if (t.target && n.id !== ROOT && regionOf(t.target) !== regionOf(n.id)) throw new Error("statechart: Ziel " + t.target + " liegt in anderer Region als " + n.id + " (Ereignis statt Sprung)");
  }

  const byOrder = (a, b) => nodes.get(a).order - nodes.get(b).order;
  function ancestors(id, upTo) { const out = []; let p = nodes.get(id).parent; while (p !== null && p !== upTo) { out.push(p); p = nodes.get(p).parent; } return out; }
  function isDesc(a, b) { if (a === b) return false; let p = nodes.get(a).parent; while (p !== null) { if (p === b) return true; p = nodes.get(p).parent; } return false; }
  function lcca(ids) {
    // kleinster gemeinsamer Vorfahr, der compound oder die Wurzel ist (SCXML findLCCA)
    for (const anc of ancestors(ids[0], null)) {
      const n = nodes.get(anc);
      if (n.type !== "compound" && anc !== ROOT) continue;
      if (ids.slice(1).every((s) => isDesc(s, anc))) return anc;
    }
    return ROOT;
  }
  function regionOf(id) { let r = id; while (nodes.get(r).parent !== ROOT) r = nodes.get(r).parent; return r; }
  // Uebergangsdomaene: Ziele unterhalb eines compound-Ursprungs sind intern (wie XState v5 ohne reenter).
  // Laege die Domaene auf der parallelen Wurzel, bleibt sie auf die Region beschraenkt: andere Regionen werden
  // nie verlassen (Regionen sprechen nur ueber Ereignisse, KONZEPT §2).
  function domainOf(t) {
    const src = nodes.get(t.source);
    if (src.type === "compound" && isDesc(t.target, t.source)) return { id: t.source };
    const d = lcca([t.source, t.target]);
    if (d === ROOT && nodes.get(ROOT).type === "parallel") return { id: ROOT, region: regionOf(t.source) };
    return { id: d };
  }
  function addDesc(id, set) {
    set.add(id);
    const n = nodes.get(id);
    if (n.type === "parallel") { for (const c of n.children) if (![...set].some((s) => s === c || isDesc(s, c))) addDesc(c, set); }
    else if (n.type === "compound") { if (!n.children.some((c) => [...set].some((s) => s === c || isDesc(s, c)))) addDesc(n.initial, set); }
  }
  function addAnc(id, domain, set) {
    for (const a of ancestors(id, domain)) {
      set.add(a);
      const n = nodes.get(a);
      if (n.type === "parallel") for (const c of n.children) if (![...set].some((s) => s === c || isDesc(s, c))) addDesc(c, set);
    }
  }
  function runActions(list, ctx, ev, fx) {
    for (const a of list) { const r = actions[a](ctx, ev, (e) => fx.push(e)); if (r !== undefined) ctx = r; }
    return ctx;
  }
  function inState(config) { return (p) => config.includes(p); }

  function microstep(config, ctx, ev, fx) {
    const active = new Set(config);
    const atomics = config.filter((id) => nodes.get(id).type === "atomic").sort(byOrder);
    const chosen = [];
    for (const a of atomics) {
      let found = null;
      for (let s = a; s !== null && !found; s = nodes.get(s).parent) {
        const list = nodes.get(s).on[ev.type];
        if (!list) continue;
        for (const t of list) if (!t.cond || guards[t.cond](ctx, ev, inState(config))) { found = t; break; }
      }
      if (found && !chosen.includes(found)) chosen.push(found);
    }
    if (!chosen.length) return null;
    // Konflikte: spaetere Transitionen, deren Austrittsmenge sich mit einer frueheren schneidet, entfallen
    const plan = [];
    for (const t of chosen) {
      const domain = t.target ? domainOf(t) : null;
      const exitSet = domain === null ? [] : domain.region ? [...active].filter((s) => s === domain.region || isDesc(s, domain.region)) : [...active].filter((s) => isDesc(s, domain.id));
      if (plan.some((p) => p.exitSet.some((s) => exitSet.includes(s)))) continue;
      plan.push({ t, domain, exitSet });
    }
    const exits = [...new Set(plan.flatMap((p) => p.exitSet))].sort(byOrder).reverse();
    for (const s of exits) { ctx = runActions(nodes.get(s).exit, ctx, ev, fx); active.delete(s); }
    for (const p of plan) ctx = runActions(p.t.actions, ctx, ev, fx);
    const enter = new Set();
    for (const p of plan) if (p.t.target) { addDesc(p.t.target, enter); addAnc(p.t.target, p.domain.region ? ROOT : p.domain.id, enter); }
    for (const s of [...enter].sort(byOrder)) { if (s === ROOT) continue; active.add(s); ctx = runActions(nodes.get(s).entry, ctx, ev, fx); }
    const raised = plan.filter((p) => p.t.raise).map((p) => (typeof p.t.raise === "function" ? p.t.raise(ctx, ev) : { type: p.t.raise })).filter(Boolean);
    return { config: [...active].sort(byOrder), ctx, raised };
  }

  function initial(ctx = {}) {
    const fx = [], set = new Set();
    addDesc(ROOT, set);
    const config = [...set].filter((s) => s !== ROOT).sort(byOrder);
    for (const s of config) ctx = runActions(nodes.get(s).entry, ctx, { type: "@init" }, fx);
    return { config, ctx, effects: fx, consumed: true };
  }

  /** Ein Makroschritt: das Ereignis und alle dabei ausgeloesten internen Ereignisse. */
  function send(state, ev) {
    if (typeof ev === "string") ev = { type: ev };
    const fx = [];
    let config = state.config, ctx = state.ctx, consumed = false;
    const queue = [ev];
    let guard = 0;
    while (queue.length) {
      if (++guard > 64) throw new Error("statechart: Endlosschleife interner Ereignisse");
      const e = queue.shift();
      const r = microstep(config, ctx, e, fx);
      if (!r) continue;
      if (e === ev) consumed = true;
      config = r.config; ctx = r.ctx; queue.push(...r.raised);
    }
    return { config, ctx, effects: fx, consumed };
  }

  function matches(state, path) { return state.config.includes(path); }
  function events() { const s = new Set(); for (const n of nodes.values()) for (const e of Object.keys(n.on)) s.add(e); return [...s].sort(); }
  /** Pruefung der Konfiguration: jeder aktive compound hat genau ein aktives Kind, jeder parallele alle Kinder. */
  function valid(config) {
    const set = new Set(config);
    for (const id of config) {
      const n = nodes.get(id);
      if (!n) return "unbekannt " + id;
      if (n.parent !== ROOT && n.parent !== null && !set.has(n.parent)) return "Elternteil fehlt " + id;
      const act = n.children.filter((c) => set.has(c));
      if (n.type === "compound" && act.length !== 1) return "compound " + id + " hat " + act.length + " aktive Kinder";
      if (n.type === "parallel" && act.length !== n.children.length) return "parallel " + id + " unvollstaendig";
    }
    const root = nodes.get(ROOT);
    for (const c of root.children) if (!set.has(c)) return "Region " + c + " fehlt";
    return null;
  }
  return { initial, send, matches, events, valid, nodes };
}
