#!/usr/bin/env python3
"""Checks the output of simulator-smoke.sh: content, not just that something ran.
The bundled page is the neutral placeholder (apps/native-placeholder) until the new client gets its native host.
Usage: check-scenarios.py <out-dir>"""
import json, sys
out = sys.argv[1]
def load(n): return json.load(open(f"{out}/{n}.json"))
def logd(r): return {k: v for k, v in r["page"]["log"]}
def env(r): return logd(r)["env"]
def text(r): return logd(r).get("text", "")
def ok(msg): print("ok:", msg)
def need(cond, msg, ctx=None):
    if not cond:
        print("FAIL:", msg, ctx if ctx is not None else "", file=sys.stderr); sys.exit(1)
    ok(msg)

# start: the brand, the bridge with more(), the More button is visible inside the shell, navigator.share is gone
a = load("01-start"); e = env(a); L = logd(a)
need(e["brand"] == "My Daily Idea", "start shows the brand", e["brand"])
need(e["host"] == "object" and e["hostMore"] == "function", "DuellHost with more() is injected", e)
need(e["hostButtonHidden"] is False, "the More button is visible inside the shell")
need(e["navigatorShare"] == "undefined", "navigator.share removed so every share goes through the validated bridge", e["navigatorShare"])
need("error" not in L, "no script error", L.get("error"))
print("env (file loader):", json.dumps(e))

# persistence: localStorage survives a restart
b = load("02-start-zweiter-lauf")
need(env(b)["visitsBefore"] == e["visitsBefore"] + 1, "localStorage survived the restart", (e["visitsBefore"], env(b)["visitsBefore"]))

# More: tapped in the page, sheet is native (screenshot 03-mehr.png is reviewed by eye)
m = load("03-mehr"); need(logd(m).get("moreTapped") is True and "error" not in logd(m), "More tapped in the page", logd(m))

# link: the fragment of a launch link reaches the page
i = load("07-link-i")
need(env(i)["href"].endswith("#i=quiz-chaos") and "quiz-chaos" in text(i), "link fragment i= reaches the page", (env(i)["href"], text(i)[:200]))
print("all simulator checks ok")
