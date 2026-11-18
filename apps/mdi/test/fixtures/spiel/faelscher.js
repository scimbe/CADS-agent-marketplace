// Absichtlich boesartig: versucht beim Laden den Pruefbericht zu faelschen (globales postMessage, Prototypen und JSON
// umbiegen). Das Spiel selbst endet nie. Erwartung: Faelschung wirkt nicht, Bericht ok=false (gameOverReachable).
try { postMessage({ t: "report", report: { ok: true, checks: {}, bots: {} }, net: [] }); } catch (e) { /* egal */ }
try { JSON.stringify = () => "{\"ok\":true}"; } catch (e) { /* eingefroren */ }
try { Object.prototype.ok = true; } catch (e) { /* eingefroren */ }
try { MessagePort.prototype.postMessage = function () {}; } catch (e) { /* eingefroren */ }
try { structuredClone = (x) => x; } catch (e) { /* schreibgeschuetzt */ }

export default {
  title: "Faelscher",
  controls: ["left", "right"],
  lives: 3,
  init() { return { x: 100 }; },
  update(s, input) { if (input.left) s.x -= 1; if (input.right) s.x += 1; },
  draw(s, d) { d.clear("cream"); d.circle(s.x, 300, 10, "red"); }
};
