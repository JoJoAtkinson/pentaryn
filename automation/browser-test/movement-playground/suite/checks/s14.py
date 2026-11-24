"""S14 Two-way lane (two screens)"""
from fw import check, pt, heroes, T
from ck import *
from an import Obs
import json, threading, time

S = "S14"; WEST = [f"S14 Hero {i}" for i in range(1, 5)]; EAST = [f"S14 Hero {i}" for i in range(5, 9)]

def both(t, via_wait=0):
    """both groups dropped at (nearly) the same moment from two screens"""
    from h import par
    rig = t.rig
    def fn():
        t.say("page pa drags Heroes 1-4 to the east end while page pb drags Heroes 5-8 to the west end, at the same moment")
        out = par(lambda: rig.drag("pa", WEST, WEST[0], pt(S, "dropEast"), release=False), lambda: rig.drag("pb", EAST, EAST[0], pt(S, "dropWest"), release=False))
        ups = par(lambda: (int(time.time() * 1000), rig.mouse("pa", [{"up": "left"}])), lambda: (int(time.time() * 1000), rig.mouse("pb", [{"up": "left"}])))
        return {"drag": out, "ups": [u[0] for u in ups if isinstance(u, tuple)]}
    return t.act(fn, key="pa", group=WEST + EAST, meta={"grab": WEST[0]}, settle=40)

@check("S14.a", S, "two-way lane: both groups sent or named within 4 s, nobody left at rest on anybody", path="both", kind="HARD", pages=("gm", "pa", "pb"), share="s14")
def a(t):
    o = t.shared("s14", lambda: both(t)); raw = o.raw
    # per-page drop time (own pointerup) and first action of each member
    bad = []
    for grp, page in ((WEST, "pa"), (EAST, "pb")):
        ups = [p["t"] for p in raw[page]["ptr"] if p["ty"] == "up" and p.get("b", 0) == 0]; dt = max(ups) if ups else None
        for n in grp:
            fa = [x for x in (o.first_move(n, page), o.first_event(n)) if x is not None]
            if o.named(n): continue
            if not fa or (dt and min(fa) - dt > 4000): bad.append(f"{n} ({'never' if not fa else round(min(fa) - dt)} ms)")
    return t.verdict(o, [("every member moving or named within 4 s of its own drop", not bad, "; ".join(bad[:5]))], guards=dict(account=False, standing=False, notices_ok=(r".",)))

@check("S14.b", S, "two-way lane: no deadlock (both leaders reach their end) and every token is somewhere sensible", path="state", kind="HARD", expect010=True, pages=("gm", "pa", "pb"), share="s14")
def b(t):
    o = t.shared("s14", lambda: both(t)); eW = leader_err(o, WEST[0], pt(S, "dropEast")); eE = leader_err(o, EAST[0], pt(S, "dropWest"))
    return t.verdict(o, [("west group's leader within 1.0 sq of the east drop", eW <= 1.0, f"{eW:.2f} sq off"), ("east group's leader within 1.0 sq of the west drop", eE <= 1.0, f"{eE:.2f} sq off")], num=max(eW, eE), unit="sq", guards=dict(account=False, standing=False, notices_ok=(r".",)))

@check("S14.c", S, "two-way lane: the two screens agree (each token drawn where its document is)", path="gpu", kind="HARD", pages=("gm", "pa", "pb"), share="s14")
def c(t):
    o = t.shared("s14", lambda: both(t)); bad = {}
    for k, s in o.snap.items():
        for tk in s["docs"]["toks"]:
            if tk["n"] in WEST + EAST and tk.get("drawn"):
                d = max(abs(tk["drawn"][0] - tk["x"]), abs(tk["drawn"][1] - tk["y"]))
                if d > 3: bad[f"{k}:{tk['n']}"] = d
    return t.verdict(o, [("every token drawn at its document position on all three screens", not bad, f"{bad}")], guards=dict(account=False, standing=False, notices_ok=(r".",)))
