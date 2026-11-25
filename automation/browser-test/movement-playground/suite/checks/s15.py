"""S15 Crowd behind a wall"""
from fw import check, pt, tok_names
from ck import *
import numpy as np

S = "S15"; V = tok_names(S, lambda t: t.get("role") == "villager"); L = "S15 Villager 1"

@check("S15.a", S, "crowd: they converge on the door, none through the wall, all end beyond it near the leader", path="state", kind="HARD", expect010=True, share="s15")
def a(t):
    o = t.shared("s15", lambda: t.drag(V, L, pt(S, "dropBeyond"), settle=40)); e = leader_err(o, L, pt(S, "dropBeyond")); bh, mx, md = pack(o, L, V[1:])
    return t.verdict(o, [("leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off"), ("all within 3.5 sq of the leader (balled up)", md is not None and md <= 3.5, f"max {md}")], num=md, unit="sq")

@check("S15.b", S, "crowd: they go through the door one at a time (never two centres within 0.6 sq of the door)", path="gpu", kind="GATED", expect010=True, timing=True)
def b(t):
    o = t.drag(V, L, pt(S, "dropBeyond"), settle=40)
    mx, npass = door_frame(o, V, (6450, 8400)); need = -(-len(V) // 2)
    return t.verdict(o, [("at least half of them came through the door frame (the check is not vacuous)", npass >= need, f"{npass} of {len(V)} came near the door"), ("at most one centre within 0.6 sq of the door centre", mx <= 1, f"up to {mx} at once")], num=mx, unit="tokens", guards=TIMING_G)

# Sign-off F2 X4: REPORTED: R11's gate is 8 (100 ms) and 20 (250 ms) on open ground (review F1 §5); twelve through a
# door were held to the bound for eight. The reference is scaled to twelve (150 ms, between the two), reported.
@check("S15.c", S, "crowd (reported): the plan time for 12 members at a door, against 150 ms (R11's bounds scaled to twelve)", path="both", kind="REPORTED", timing=True, expect010=True)
def c(t):
    o = t.drag(V, L, pt(S, "dropBeyond"), settle=40); p = plan_ms(o)
    return t.verdict(o, [("plan reported", p is not None, "no plan time"), ("plan under 150 ms (scaled reference)", p is not None and p < 150, f"{p} ms")], num=p, unit="ms", guards=TIMING_G)
