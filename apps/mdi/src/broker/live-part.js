// Einstieg des Teils "live" (eigene Datei, wird erst beim Tipp auf Live geladen).
import { invite, accept } from "./live.js";
document.dispatchEvent(new CustomEvent("mdi:part", { detail: { name: "live", api: { invite, accept } } }));
