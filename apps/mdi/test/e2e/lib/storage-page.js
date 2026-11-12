// Testseite (nur Tests): der echte Geraetespeicher im Browser, damit Neuladen geprueft werden kann.
import { createStorage } from "../../../src/broker/storage.js";
const s = createStorage();
window.__storage = { save: (e) => s.saveGame(e), load: (g) => s.loadGame(g) };
