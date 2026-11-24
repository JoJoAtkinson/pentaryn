"""S04 Twenty-monster tunnel"""
from fw import check, pt, tok_names
from ck import *
import re

S = "S04"; M20 = [f"S04 Monster {i}" for i in range(1, 21)]; L = "S04 Monster 1"
M24 = [f"S04 Monster {i}" for i in range(1, 25)]; M25 = [f"S04 Monster {i}" for i in range(1, 26)]

@check("S04.a", S, "20 in a tunnel, leader in front: all follow in file, every one sent within 4 s, the leader on the drop square", path="state", kind="HARD", scenario="front", expect010=True, share="s04f")
def a(t):
    o = t.shared("s04f", lambda: t.drag(M20, L, pt(S, "dropW"), settle=40)); e = leader_err(o, L, pt(S, "dropW"))
    return t.verdict(o, [("leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off")], num=e, unit="sq")

@check("S04.b", S, "20 in a tunnel: the plan takes under 250 ms", path="both", kind="GATED", scenario="front", timing=True, expect010=True)
def b(t):
    o = t.drag(M20, L, pt(S, "dropW"), settle=40); p = plan_ms(o)
    return t.verdict(o, [("plan reported", p is not None, "no plan time (refused?)"), ("plan under 250 ms", p is not None and p < 250, f"{p} ms")], num=p, unit="ms", guards=TIMING_G)

@check("S04.c", S, "20 in a tunnel, leader at the back: it walks through to the front, all follow", path="state", kind="HARD", scenario="back", expect010=True, share="s04b")
def c(t):
    o = t.shared("s04b", lambda: t.drag(M20, L, pt(S, "dropE"), settle=40)); e = leader_err(o, L, pt(S, "dropE"))
    return t.verdict(o, [("leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off")], num=e, unit="sq")

@check("S04.d", S, "20 in a tunnel, leader at the back: drawn above every member it passes", path="gpu", kind="HARD", scenario="back", expect010=True, share="s04b")
def d(t):
    o = t.shared("s04b", lambda: t.drag(M20, L, pt(S, "dropE"), settle=40)); bad, n = z_violations(o, L, M20[1:])
    return t.verdict(o, [("it really passed through members", n > 0, "never overlapped"), ("always drawn above them", bad == 0, f"{bad} of {n} instants below")], num=bad, unit="instants")

@check("S04.e", S, "cap: 24 selected are accepted (all moving or named within 4 s)", path="state", kind="HARD", scenario="cap", expect010=True)
def e(t):
    o = t.drag(M24, L, pt(S, "dropE"), settle=45); e_ = leader_err(o, L, pt(S, "dropE"))
    return t.verdict(o, [("no refusal for the group size", not any(re.search(r"too many|limit|at most|up to \d+", x, re.I) for x in o.notice_texts()), f"{o.notice_texts()[:2]}"), ("leader within 0.6 sq of the drop", e_ <= 0.6, f"{e_:.2f} sq off")], num=e_, unit="sq")

@check("S04.f", S, "cap: 25 selected are refused with the notice and nobody moves", path="state", kind="HARD", scenario="cap", expect010=True)
def f(t):
    o = t.drag(M25, L, pt(S, "dropE"), settle=20); ns = o.notice_texts(); moved = [n for n in M25 if o.moved_doc(n)]
    return t.verdict(o, [("a notice names the limit", any(re.search(r"too many|limit|at most|up to|\d+ (tokens|members)", x, re.I) for x in ns), f"{ns[:3]}"), ("nobody moved", not moved, f"{len(moved)} moved")], guards=dict(account=False, notices_ok=(r".",)))
