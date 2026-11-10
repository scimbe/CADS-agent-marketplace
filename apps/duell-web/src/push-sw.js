/* My Daily Idea: service worker for push only (src/push.js registers it at /duell/push-sw.js, scope /duell). It has no fetch
   handler: the page loads exactly as without it, nothing is cached here. A push carries only its kind, encrypted to this
   device ({"r":"reply"} or {"r":"live"}); the sentence is written here in the device's language. Anything else shows the
   neutral sentence. A tap opens or focuses the page. */
"use strict";
var TEXTS = {
  de: { reply: "Jemand hat auf deine Karte geantwortet.", live: "Deine Live-Einladung wurde angenommen.", any: "Es gibt etwas Neues für dich." },
  en: { reply: "Someone answered your card.", live: "Your live invite was accepted.", any: "There is something new for you." },
};
function lang() { var l = String((self.navigator && self.navigator.language) || "de").slice(0, 2).toLowerCase(); return TEXTS[l] ? l : "en"; }
function kind(data) { try { var r = data ? data.json().r : ""; return r === "reply" || r === "live" ? r : "any"; } catch (e) { return "any"; } }
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var r = kind(e.data), T = TEXTS[lang()];
  e.waitUntil(self.registration.showNotification("My Daily Idea", { body: T[r], tag: "mdi-" + r, renotify: false, data: { r: r } }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var home = new URL(self.registration.scope).pathname || "/duell";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if (new URL(list[i].url).pathname.indexOf(home) === 0 && "focus" in list[i]) return list[i].focus();
    return self.clients.openWindow(home);
  }));
});
