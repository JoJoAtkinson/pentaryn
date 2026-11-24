"""S09 Dead end"""
from fw import check, pt, heroes
from ck import *
import re

S = "S09"; HS = heroes(S); L = "S09 Hero 1"

@check("S09.a", S, "a drop behind the end wall: 'No route there', nobody moves", path="state", kind="HARD")
def a(t):
    o = t.drag(HS, L, pt(S, "dropBehind")); ns = o.notice_texts(); mv = [n for n in HS if o.moved_doc(n)]
    return t.verdict(o, [("a notice says no route", any(re.search(r"no route|no way|can.?t|cannot", x, re.I) for x in ns), f"{ns[:3]}"), ("nobody moved", not mv, f"moved: {mv}")], guards=dict(account=False, notices_ok=(r".",)))

@check("S09.b", S, "into the pocket: the leader on the drop, the rest a line or a ball behind it", path="state", kind="HARD", expect010=True)
def b(t):
    o = t.drag(HS, L, pt(S, "dropPocket")); e = leader_err(o, L, pt(S, "dropPocket")); bh, mx, md = pack(o, L, HS[1:])
    return t.verdict(o, [("leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off"), ("all within 4 sq of the leader", md is not None and md <= 4, f"max {md}")], num=md, unit="sq")

@check("S09.c", S, "a member already past the leader in the dead end stays, named", path="state", kind="HARD", scenario="past", expect010=True)
def c(t):
    o = t.drag(HS, L, pt(S, "dropPocket")); h4 = "S09 Hero 4"
    return t.verdict(o, [("Hero 4 did not move", not o.moved_doc(h4), "it moved"), ("a notice names Hero 4", o.named(h4), f"{o.notice_texts()[:3]}")], guards=dict(account=False, notices_ok=(r".",)))
