"""S07 Doors"""
from fw import check, pt, heroes
from ck import *
import re, json

S = "S07"; HS = heroes(S); L = "S07 Hero 1"
DOORX = 5600
def beyond(o, n): return o.c1(n)[0] > DOORX + 40

@check("S07.a", S, "open door: all eight file into the room behind it, the leader on the drop square", path="state", kind="HARD", expect010=True, share="s07open")
def a(t):
    o = t.shared("s07open", lambda: t.drag(HS, L, pt(S, "dropR1"))); e = leader_err(o, L, pt(S, "dropR1")); out = [n for n in HS if not beyond(o, n)]
    return t.verdict(o, [("leader within 0.5 sq of the drop", e <= 0.5, f"{e:.2f} sq off"), ("all eight beyond the door", not out, f"not through: {out}")], num=e, unit="sq")

@check("S07.b", S, "open door: never two token centres inside the door frame at once (one at a time)", path="gpu", kind="GATED", expect010=True, timing=True)
def b(t):
    o = t.drag(HS, L, pt(S, "dropR1"))
    mx, npass = door_frame(o, HS, (DOORX, 2950)); need = -(-len(HS) // 2)
    return t.verdict(o, [("at least half of them came through the door frame (the check is not vacuous)", npass >= need, f"{npass} of {len(HS)} came near the door"), ("at most one centre within 0.6 sq of the door centre", mx <= 1, f"up to {mx} at once")], num=mx, unit="tokens", guards=TIMING_G)

@check("S07.c", S, "open door: after the door the eight spread out again (nobody overlapping at rest)", path="state", kind="HARD", expect010=True, share="s07open")
def c(t):
    o = t.shared("s07open", lambda: t.drag(HS, L, pt(S, "dropR1"))); ds = sorted(o.dist_sq(a_, b_) for i, a_ in enumerate(HS) for b_ in HS[i + 1:])
    return t.verdict(o, [("no two of the eight closer than 0.9 sq at rest", ds[0] >= 0.9, f"closest pair {ds[0]:.2f} sq")], num=ds[0], unit="sq")

@check("S07.d", S, "secret door: the only short way is never used; the group goes the long way round and reaches the vault", path="state", kind="HARD", expect010=True)
def d(t):
    # Every member near it: within 3.2 sq, as S01.c balls up eight (live round 2: 2.2 sq could not hold eight behind a
    # leader resting at the vault's corner; the far corner of their 3 x 3 is 2.83 sq off).
    o = t.drag(HS, L, pt(S, "dropVault")); e = leader_err(o, L, pt(S, "dropVault")); n = [h for h in HS if d_sq(o.c1(h), pt(S, "dropVault")) <= 3.2]
    return t.verdict(o, [("the leader within 1.6 sq of the vault drop", e <= 1.6, f"{e:.2f} sq off; notices {o.notice_texts()[:2]}"), ("every member within 3.2 sq of it", len(n) == len(HS), f"{len(n)} of 8 near")], num=e, unit="sq")

@check("S07.l", S, "secret door: the leader ends exactly on the vault drop square", path="state", kind="HARD", expect010=True)
def l(t):
    o = t.drag(HS, L, pt(S, "dropVault")); e = leader_err(o, L, pt(S, "dropVault"))
    return t.verdict(o, [("leader within 0.5 sq of the drop", e <= 0.5, f"{e:.2f} sq off")], num=e, unit="sq")

def refused(sid, pname, what):
    @check(sid, S, f"{what}: no route; nobody goes through, a notice says so", path="state", kind="HARD")
    def f(t):
        o = t.drag(HS, L, pt(S, pname)); ns = o.notice_texts(); thru = [n for n in HS if beyond(o, n) and o.c1(n)[1] > 2800 and o.c1(n)[0] < 6400]
        return t.verdict(o, [("a notice says there is no route", any(re.search(r"no route|can.?t|cannot|no way|blocked|shut|closed|locked", x, re.I) for x in ns), f"notices: {ns[:3]}"), ("nobody ended behind the door", not thru, f"behind: {thru}")],
                         guards=dict(account=False, notices_ok=(r".",)))
    return f
refused("S07.e", "dropR2", "closed door"); refused("S07.f", "dropR3", "locked door"); refused("S07.g", "dropR4", "closed double door"); refused("S07.h", "dropR5", "closed diagonal door")

@check("S07.i", S, "all ordinary doors open: the double and the diagonal door let the group in", path="state", kind="HARD", scenario="allopen", expect010=True)
def i(t):
    res = []
    o = t.drag(HS, L, pt(S, "dropR4")); e = leader_err(o, L, pt(S, "dropR4")); out = [n for n in HS if not beyond(o, n)]
    return t.verdict(o, [("leader within 0.6 sq of the double-door room drop", e <= 0.6, f"{e:.2f} sq off"), ("all eight through", not out, f"not through: {out}")], num=e, unit="sq")

@check("S07.j", S, "a door shut mid-walk: nobody through it, each token rests where it is drawn", path="gpu", kind="HARD")
def j(t):
    gpu_only(t)
    def act():
        dr = t.rig.drag("gm", HS, L, pt(S, "dropR1"))
        r = t.rig.ev("gm", r"""const w=canvas.scene.walls.find(w=>w.flags?.world?.pg?.st==='S07' && w.flags?.world?.pg?.key==='open'); const lead=canvas.tokens.placeables.find(t=>t.name==='S07 Hero 1'); const t0=performance.now();
while(performance.now()-t0<12000){ const x=lead.x+lead.w/2; if(x>5150 && x<5450){ await w.update({ds:0}); return JSON.stringify({shutAt:Math.round(x), doorSt:w.ds}); } await new Promise(r=>requestAnimationFrame(r)); } return JSON.stringify({missed:true});""", timeout=60)
        return {"drag": dr, "shut": r}
    o = t.act(act, key="gm", group=HS, meta={"grab": L}); sh = o.meta.get("shut") or {}
    diff = {n: max(abs(d_["drawn"][0] - d_["x"]), abs(d_["drawn"][1] - d_["y"])) for n, d_ in o.docs.items() if n in HS and d_.get("drawn")}
    bad = {n: v for n, v in diff.items() if v > 3}
    return t.verdict(o, [("the door was shut while they walked", not sh.get("missed"), f"{sh}"), ("each token's drawn position equals its document position", not bad, f"drawn differs by (px): {bad}")], guards=dict(account=False, notices_ok=(r".",)))

@check("S07.k", S, "doors: the plan takes under 100 ms (8 members, open door)", path="both", kind="GATED", timing=True, expect010=True)
def k(t):
    o = t.drag(HS, L, pt(S, "dropR1")); p = plan_ms(o)
    return t.verdict(o, [("plan reported", p is not None, "no plan time"), ("plan under 100 ms", p is not None and p < 100, f"{p} ms")], num=p, unit="ms", guards=TIMING_G)
import numpy as np

# 0.10.2, the door plug (Joe 2026-11-24 / 11-25): dropped just past a door, more of the party comes through and takes the
# free squares just inside beside and behind the leader (never ahead of it); only those with no free square inside wait
# outside. Room R1 is three squares tall: two squares past the door (column 57) the five free squares of columns 56-57
# are within the plan's reach of the leader (LEAD.beside 2.5); 0.10.1 filled two or three of them.
PLUG = (5750, 2950)

@check("S07.s", S, "door plug: the leader dropped 2 squares past the open door, eight heroes: the free squares just inside beside and behind it are filled before anyone waits outside, nobody ahead of it", path="state", kind="HARD")
def s(t):
    o = t.drag(HS, L, PLUG); e = leader_err(o, L, PLUG)
    sqs = [(x, y) for x in (5650, 5750) for y in (2850, 2950, 3050) if (x, y) != PLUG]
    empty = [sq for sq in sqs if not any(d_sq(o.c1(n), sq) < 0.5 for n in HS)]
    inside = [n for n in HS if beyond(o, n) and o.c1(n)[1] < 3100]
    ahead = [n for n in inside if n != L and o.c1(n)[0] > o.c1(L)[0] + 40]
    plug = ((o.last() or {}).get("plan") or {}).get("plug")
    return t.verdict(o, [("leader within 0.5 sq of the drop", e <= 0.5, f"{e:.2f} sq off"),
                         ("every free square inside beside and behind the leader holds a hero", not empty, f"empty {empty}; {len(inside)} of 8 inside"),
                         ("nobody rests ahead of the leader", not ahead, f"ahead: {ahead}")],
                     num=len(inside), unit="inside", expected=f"{len(inside)} inside, {len(HS) - len(inside)} outside; plug {plug}", guards=dict(account=False))
