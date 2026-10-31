#!/usr/bin/env python3
"""Checks the output of simulator-smoke.sh: content, not just that something ran.
Usage: check-scenarios.py <out-dir> <challenge-fragment-payload>"""
import json, re, sys
out, ch = sys.argv[1], sys.argv[2]
def load(n): return json.load(open(f"{out}/{n}.json"))
def logd(r): return {k: v for k, v in r["page"]["log"]}
def env(r): return logd(r)["env"]
def text(r): return logd(r).get("text", "")
def ok(msg): print("ok:", msg)
def need(cond, msg, ctx=None):
    if not cond:
        print("FAIL:", msg, ctx if ctx is not None else "", file=sys.stderr); sys.exit(1)
    ok(msg)

# start: the brand, no tab bar (the page is the whole screen), the quiet More button is there, navigator.share is gone
a = load("01-start"); e = env(a); L = logd(a)
need(e["brand"] == "My Daily Idea", "start shows the brand", e["brand"])
need(e["host"] == "object" and e["hostMore"] == "function", "DuellHost with more() is injected", e)
need(e["hostButtonHidden"] is False, "the quiet More button is visible inside the shell")
need(e["navigatorShare"] == "undefined", "navigator.share removed so every share goes through the validated bridge", e["navigatorShare"])
need("error" not in L, "no script error", L.get("error"))
print("env (file loader):", json.dumps(e))

# persistence: localStorage survives a restart (wall, profile)
b = load("02-start-zweiter-lauf")
need(env(b)["visitsBefore"] == e["visitsBefore"] + 1, "localStorage survived the restart", (e["visitsBefore"], env(b)["visitsBefore"]))

# More: tapped in the page, sheet is native (screenshot 03-mehr.png is reviewed by eye)
m = load("03-mehr"); need(logd(m).get("moreTapped") is True and "error" not in logd(m), "More tapped in the page", logd(m))

# links: i= opens that day's idea, c= opens the challenge
i = load("07-link-i"); need(re.search(r"chaos", text(i), re.I) is not None, "invite link i= shows that idea", text(i)[:200])
c = load("08-link-c"); need("Mira-Test" in text(c), "challenge link c= shows the challenge", text(c)[:200])

# share: the PNG arrived in the cache folder with content, the share sheet was presented
s = load("09-ergebnis-teilen"); n = s["native"]; ls = logd(s)
need("error" not in ls, "share flow without script error", ls.get("error"))
f = n.get("shareFile", {})
need(f.get("name", "").endswith(".png") and f.get("bytes", 0) > 5000 and f.get("magic", "").startswith("89504e470d0a1a0a") and f.get("inCache") is True, "shared file is a PNG with content in the cache folder", f)
need(n.get("shareSheetPresented") is True, "share sheet presented")

# cleanup: the next start removes what the (never finished) share left behind
z = load("10-nach-teilen-aufgeraeumt")["native"]
need(z.get("sweptAtStart", 0) >= 1, "cache folder swept at start", z.get("sweptAtStart"))

# save: PNG staged with content, export picker presented
v = load("11-ergebnis-speichern"); n = v["native"]
f = n.get("saveFile", {})
need(f.get("magic", "").startswith("89504e470d0a1a0a") and f.get("bytes", 0) > 5000 and f.get("inCache") is True, "saved file is a PNG with content", f)
need(n.get("exportPickerPresented") is True, "file picker presented")

# microphone refused: the delegate was reached, getUserMedia failed cleanly, the page points to the silly voice and goes on to a WAV
def mic(name, loader):
    r = load(name); n = r["native"]; ls = logd(r)
    print(f"env ({loader} loader):", json.dumps(ls["env"]))
    need(r.get("loader") == loader, f"{name} used the {loader} loader", r.get("loader"))
    need("error" not in ls, f"{name}: no script error", ls.get("error"))
    need(n.get("mediaCaptureRequest", {}).get("type") == 1, f"{name}: getUserMedia reached the native permission delegate (microphone)", n.get("mediaCaptureRequest"))
    need(re.search(r"Kein Mikro|No mic here", ls.get("toast", "")) is not None, f"{name}: refusal ends in the silly-voice message", ls.get("toast"))
    f = n.get("saveFile", {})
    need(f.get("name", "").endswith(".wav") and f.get("bytes", 0) > 5000 and f["magic"].startswith("52494646") and f["magic"][16:24] == "57415645", f"{name}: sound saved as a WAV with content", f)
mic("12-mikro-abgelehnt", "file")
mic("13-mikro-abgelehnt-scheme", "scheme")
print("all simulator checks ok")
