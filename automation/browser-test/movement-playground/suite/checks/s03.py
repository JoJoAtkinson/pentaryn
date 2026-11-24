"""S03 One-wide tunnel (the bug Joe saw)"""
from fw import check, pt, heroes
from ck import *

S = "S03"; HS = heroes(S); L = "S03 Hero 1"; REST = HS[1:]
TX0 = 5800

def in_tunnel(o, n):
    d = o.docs[n]; return d["y"] == 1100 and d["x"] >= TX0

@check("S03.a", S, "tunnel: drag the four 11 squares in: no notice, a line inside behind the leader", path="state", kind="HARD", expect010=True, share="s03in")
def a(t):
    o = t.shared("s03in", lambda: t.drag(HS, L, pt(S, "dropIn11"))); e = leader_err(o, L, pt(S, "dropIn11"))
    out = [n for n in HS if not in_tunnel(o, n)]
    lx = o.docs[L]["x"]; ahead = [n for n in REST if o.docs[n]["x"] >= lx]
    return t.verdict(o, [("leader within 0.5 sq of the drop", e <= 0.5, f"{e:.2f} sq off"), ("all four inside the tunnel row", not out, f"outside: {out}"), ("nobody level with or ahead of the leader", not ahead, f"{ahead}")], num=e, unit="sq")

@check("S03.b", S, "tunnel: no 'no free spot' / stayed-where-they-stand notice (the room is lengthwise)", path="state", kind="HARD", expect010=True, share="s03in")
def b(t):
    o = t.shared("s03in", lambda: t.drag(HS, L, pt(S, "dropIn11"))); ns = o.notice_texts()
    bad = [x for x in ns if re.search(r"no (free )?(space|room|spot)|stayed where|not enough|nowhere", x, re.I)]
    return t.verdict(o, [("no 'no space' notice", not bad, "; ".join(ns[:3]))])

@check("S03.c", S, "tunnel, leader last: the leader walks through its three mates to the front, then all follow in line", path="state", kind="HARD", scenario="back", expect010=True, share="s03back")
def c(t):
    o = t.shared("s03back", lambda: t.drag(HS, L, pt(S, "dropIn11"))); e = leader_err(o, L, pt(S, "dropIn11"))
    out = [n for n in HS if not in_tunnel(o, n)]; lx = o.docs[L]["x"]; ahead = [n for n in REST if o.docs[n]["x"] >= lx]
    return t.verdict(o, [("leader within 0.5 sq of the drop", e <= 0.5, f"{e:.2f} sq off"), ("all four inside the tunnel row", not out, f"outside: {out}"), ("nobody level with or ahead of the leader", not ahead, f"{ahead}"), ("no notice naming a member (nobody left behind)", not o.notices(), "; ".join(o.notice_texts()[:3]))], num=e, unit="sq", guards=dict(notices_ok=()))

@check("S03.d", S, "tunnel, leader last: the leader is drawn above every mate it passes through", path="gpu", kind="HARD", scenario="back", expect010=True, share="s03back")
def d(t):
    o = t.shared("s03back", lambda: t.drag(HS, L, pt(S, "dropIn11"))); bad, n = z_violations(o, L, REST)
    return t.verdict(o, [("the leader overlaps a mate at some moment (it really passed through)", n > 0, "never drawn overlapping a mate"), ("leader drawn above the mate at every overlapping instant", bad == 0, f"{bad} of {n} instants below")], num=bad, unit="instants")

@check("S03.e", S, "tunnel: the plan takes under 100 ms (4 members)", path="both", kind="GATED", timing=True, expect010=True)
def e(t):
    o = t.drag(HS, L, pt(S, "dropIn11")); p = plan_ms(o)
    return t.verdict(o, [("plan reported", p is not None, "no plan time"), ("plan under 100 ms", p is not None and p < 100, f"{p} ms")], num=p, unit="ms", guards=TIMING_G)

@check("S03.f", S, "tunnel: back to the room (drop in the mouth room): everyone comes out, nobody overlapping", path="state", kind="HARD", scenario="back")
def f(t):
    o = t.drag(HS, L, pt(S, "dropRoom")); e = leader_err(o, L, pt(S, "dropRoom"))
    return t.verdict(o, [("leader within 0.5 sq of the drop", e <= 0.5, f"{e:.2f} sq off")], num=e, unit="sq")
import re
