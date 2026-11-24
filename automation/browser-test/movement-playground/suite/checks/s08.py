"""S08 Unexplored room (mode sight)"""
from fw import check, pt, heroes
from ck import *
import re

S = "S08"; HS = heroes(S); L = "S08 Hero 1"
def inU(o, n): c = o.c1(n); return c[0] > 8900 and c[1] > 4000

@check("S08.a", S, "sight: the player's drag does not route over unexplored ground", path="state", kind="HARD", mode="sight", pages=("gm", "pa"))
def a(t):
    o = t.drag([L], L, pt(S, "dropU"), key="pa"); ns = o.notice_texts()
    return t.verdict(o, [("the hero is not in the unexplored room", not inU(o, L), f"at {o.c1(L)}"), ("the player is told (a notice)", bool(ns), "no notice")], guards=dict(account=False, notices_ok=(r".",)))

@check("S08.b", S, "sight: after walking round the corner the room is explored and the drag routes there", path="state", kind="HARD", mode="sight", pages=("gm", "pa"))
def b(t):
    legs = []
    # each leg ends where the next stretch is in sight: the corridor mouth (the corridor runs straight east from it), then the corner at the corridor's east end (the way south runs straight down from it)
    for p_, xy in (("corridor mouth", (8100, 3150)), ("corner", (9150, 3150))):
        o1 = t.drag([L], L, xy, key="pa"); t.rig.ev("pa", "canvas.perception.update({refreshVision:true}); return 1"); t.rig.wait_quiet(min_wait=2.0)
        legs.append((p_, leader_err(o1, L, xy)))
    o = t.drag([L], L, pt(S, "dropU"), key="pa"); e = leader_err(o, L, pt(S, "dropU"))
    return t.verdict(o, [(f"leg {p_} reached", err <= 0.8, f"{err:.2f} sq off") for p_, err in legs] + [("last leg arrives in the room round the corner", e <= 0.6, f"{e:.2f} sq off; notices {o.notice_texts()[:2]}")], num=e, unit="sq", guards=dict(account=False, notices_ok=(r".",)))

@check("S08.c", S, "sight: the GM is unaffected (routes into the unexplored room)", path="state", kind="HARD", mode="sight", pages=("gm", "pa"))
def c(t):
    o = t.drag([L], L, pt(S, "dropU"), key="gm"); e = leader_err(o, L, pt(S, "dropU"))
    return t.verdict(o, [("GM's hero arrives", e <= 0.6, f"{e:.2f} sq off")], num=e, unit="sq", guards=dict(account=False))
