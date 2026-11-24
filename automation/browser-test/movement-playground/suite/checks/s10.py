"""S10 Narrow bridge"""
from fw import check, pt, heroes
from ck import *
import numpy as np

S = "S10"; HS = heroes(S); L = "S10 Hero 1"
BX0, BX1, BY = 3000, 4200, 6150
def on_chasm(c): return BX0 + 20 < c[0] < BX1 - 20 and abs(c[1] - BY) > 60

@check("S10.a", S, "bridge: all six cross to the east room, nobody left in the chasm", path="state", kind="HARD", share="s10e")
def a(t):
    o = t.shared("s10e", lambda: t.drag(HS, L, pt(S, "dropE"))); e = leader_err(o, L, pt(S, "dropE")); east = [n for n in HS if o.c1(n)[0] > BX1]; bad = [n for n in HS if on_chasm(o.c1(n))]
    return t.verdict(o, [("leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off"), ("all six in the east room", len(east) == 6, f"{len(east)} east"), ("nobody in the chasm", not bad, f"{bad}")], num=e, unit="sq")

@check("S10.b", S, "bridge: crossing in single file (no two centres within 0.5 sq on the bridge while all are moving)", path="gpu", kind="REPORTED", share="s10e")
def b(t):
    o = t.shared("s10e", lambda: t.drag(HS, L, pt(S, "dropE"))); mo = o.mover_overlap(HS)
    return t.verdict(o, [], num=mo["max_sq"], unit="sq", expected="reported only") | {"note": f"mover overlap max {mo['max_sq']} sq ({mo['pair']}), longest over 0.1 sq {mo['longest_ms']} ms"}

@check("S10.c", S, "bridge: a drop on the middle of the bridge leaves nobody overlapping, nobody in the chasm", path="state", kind="HARD", expect010=True)
def c(t):
    o = t.drag(HS, L, pt(S, "dropMid")); bad = [n for n in HS if on_chasm(o.c1(n))]
    return t.verdict(o, [("the group moved to the bridge", sum(o.moved_doc(n) for n in HS) >= 3, "nobody moved"), ("nobody in the chasm", not bad, f"{bad}")], guards=dict(notices_ok=(r".",)))

@check("S10.d", S, "bridge: a drop over the chasm is not a resting place", path="state", kind="HARD")
def d(t):
    o = t.drag(HS, L, pt(S, "dropChasm")); bad = [n for n in HS if on_chasm(o.c1(n))]
    return t.verdict(o, [("the drop was answered (somebody moved, or a notice says why)", any(o.moved_doc(n) for n in HS) or bool(o.notices()), "nothing moved and no notice"), ("nobody rests in the chasm", not bad, f"{bad}")], guards=dict(account=False, notices_ok=(r".",)))
