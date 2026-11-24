"""S12 One-way walls"""
from fw import check, pt, heroes
from ck import *

S = "S12"; HS = heroes(S); H1, H3 = "S12 Hero 1", "S12 Hero 3"

@check("S12.a", S, "one-way walls: from the west the route passes both walls from their open sides and arrives east", path="state", kind="HARD", share="s12e")
def a(t):
    o = t.shared("s12e", lambda: t.drag(HS, H1, pt(S, "dropE"))); e = leader_err(o, H1, pt(S, "dropE"))
    return t.verdict(o, [("leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off; notices {o.notice_texts()[:2]}")], num=e, unit="sq")

@check("S12.b", S, "one-way walls: from the east the way back is the return corridor, never through a wall from its shut side", path="state", kind="HARD")
def b(t):
    o1 = t.drag(HS, H1, pt(S, "dropE")); o = t.drag(HS, H1, pt(S, "dropW")); e = leader_err(o, H1, pt(S, "dropW"))
    c1 = [("first leg (west to east): no wall violation", not o1.wall_hits(), f"{o1.wall_hits()[:2]}")]
    return t.verdict(o, c1 + [("leader back in the west room within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off; notices {o.notice_texts()[:2]}")], num=e, unit="sq")

@check("S12.c", S, "one-way walls: from the east to the middle room: round the loop and through the west wall from its open side", path="state", kind="HARD")
def c(t):
    o1 = t.drag(HS, H1, pt(S, "dropE")); o = t.drag(HS, H1, pt(S, "dropM")); e = leader_err(o, H1, pt(S, "dropM"))
    return t.verdict(o, [("leader in the middle room within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off; notices {o.notice_texts()[:2]}")], num=e, unit="sq", guards=dict(notices_ok=(r".",)))

@check("S12.d", S, "one-way walls: the walk is not cut by a one-way wall met from its open side (no stopped-short notice)", path="state", kind="HARD", share="s12e")
def d(t):
    o = t.shared("s12e", lambda: t.drag(HS, H1, pt(S, "dropE")))
    cut = [x for x in o.notice_texts() if "stopped" in x.lower() or "short" in x.lower() or "cut" in x.lower()]
    e = leader_err(o, H1, pt(S, "dropE"))
    return t.verdict(o, [("the walk finished (leader on the drop)", e <= 0.6, f"{e:.2f} sq off"), ("no cut-short notice", not cut, f"{cut}")])
