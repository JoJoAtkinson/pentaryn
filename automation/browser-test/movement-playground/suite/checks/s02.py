"""S02 Arena - SWARM"""
from fw import check, pt, heroes, tok_names
from ck import *
import math, numpy as np

S = "S02"; MON = tok_names(S, lambda t: t.get("role") == "monster"); HER = heroes(S)
TM, TL, TH, TF, TP, TPEN = "S02 Target M", "S02 Target L", "S02 Hidden", "S02 Friend", "S02 Prop", "S02 Pen Target"

def ang(v): return math.degrees(math.atan2(v[1], v[0]))
def own_side_err(o, members, target):
    """mean angular error (deg) between the side of the target a member ended on and the side it came from"""
    ct = np.array(o.c0(target)); errs = []
    for n in members:
        a = np.array(o.c0(n)) - ct; b = np.array(o.c1(n)) - ct
        if np.hypot(*a) < 1 or np.hypot(*b) < 1: continue
        d = abs((ang(a) - ang(b) + 180) % 360 - 180); errs.append(d)
    return float(np.mean(errs)) if errs else None

def swarm_drag(t, members, leader, target, point):
    return t.drag(members, leader, pt(S, point))

@check("S02.a", S, "swarm on the Medium target: the leader touches it on its own side", path="state", kind="HARD", expect010=True, share="s02m")
def a(t):
    o = t.shared("s02m", lambda: t.drag(MON, "S02 Monster 9", pt(S, "dropM"))); L = "S02 Monster 9"; g = o.gap_sq(L, TM); e = own_side_err(o, [L], TM)
    return t.verdict(o, [("leader touches the target (gap 0)", g <= 0.05, f"gap {g:.2f} sq"), ("on the side it came from (within 60 deg)", e is not None and e <= 60, f"{e} deg")], num=g, unit="sq")

@check("S02.b", S, "swarm on the Medium target: all 8 touching squares filled, the other two in ring 2", path="state", kind="HARD", expect010=True, share="s02m")
def b(t):
    o = t.shared("s02m", lambda: t.drag(MON, "S02 Monster 9", pt(S, "dropM"))); gaps = {n: o.gap_sq(n, TM) for n in MON}
    touch = [n for n, g in gaps.items() if g <= 0.05]; ring2 = [n for n, g in gaps.items() if 0.95 <= g <= 1.05]
    return t.verdict(o, [("8 members touch the target", len(touch) == 8, f"{len(touch)} touch"), ("the other 2 sit in ring 2", len(ring2) == 2, f"{len(ring2)} in ring 2; gaps {sorted(round(v, 1) for v in gaps.values())}")], num=len(touch), unit="touching")

@check("S02.c", S, "swarm on the Medium target: each member fills the square on its own side (mean 60 deg or less)", path="state", kind="HARD", expect010=True, share="s02m")
def c(t):
    o = t.shared("s02m", lambda: t.drag(MON, "S02 Monster 9", pt(S, "dropM"))); e = own_side_err(o, MON, TM)
    return t.verdict(o, [("mean side error <= 60 deg", e is not None and e <= 60, f"{e} deg")], num=e, unit="deg")

@check("S02.d", S, "swarm on the Large target: 12 touching squares filled (10 monsters + 4 heroes)", path="state", kind="HARD", expect010=True)
def d(t):
    mem = MON + HER; o = t.drag(mem, "S02 Monster 9", pt(S, "dropL")); touch = [n for n in mem if o.gap_sq(n, TL) <= 0.05]
    return t.verdict(o, [("12 touch the Large target", len(touch) == 12, f"{len(touch)} touch")], num=len(touch), unit="touching")

@check("S02.e", S, "drop on the hidden token (GM): a march, never a swarm", path="state", kind="HARD", expect010=True, share="s02h")
def e(t):
    o = t.shared("s02h", lambda: t.drag(MON, "S02 Monster 9", pt(S, "dropHidden"))); s = shape_info(o)
    return t.verdict(o, [("last.shape == march", s["shape"] == "march", f"shape={s['shape']}"), ("last.target is null", s["target"] is None, f"{s['target']}")])

@check("S02.f", S, "drop on the hidden token: nobody ringed round it (everyone behind the leader)", path="state", kind="HARD", expect010=True, share="s02h")
def f(t):
    o = t.shared("s02h", lambda: t.drag(MON, "S02 Monster 9", pt(S, "dropHidden"))); L = "S02 Monster 9"; bh, mx, md = pack(o, L, [m for m in MON if m != L])
    bad = {n: round(v["along"], 2) for n, v in (bh or {}).items() if v["along"] > -0.45}
    return t.verdict(o, [("every member behind the leader", bh is not None and not bad, f"not behind: {bad}")], num=mx, unit="sq")

@check("S02.g", S, "heroes dropped on a friendly token: a swarm (the leader touches it)", path="state", kind="HARD", expect010=True)
def g(t):
    o = t.drag(HER, HER[0], pt(S, "dropFriend")); gp = o.gap_sq(HER[0], TF); s = shape_info(o); n = sum(1 for h in HER if o.gap_sq(h, TF) <= 0.05)
    return t.verdict(o, [("leader touches the friend", gp <= 0.05, f"gap {gp:.2f}"), ("all four touch it", n == 4, f"{n} touch"), ("last.shape == swarm", s["shape"] == "swarm", f"shape={s['shape']}")], num=n, unit="touching")

@check("S02.h", S, "heroes dropped on a prop: a swarm (the leader touches it)", path="state", kind="HARD", expect010=True)
def h(t):
    o = t.drag(HER, HER[0], pt(S, "dropProp")); gp = o.gap_sq(HER[0], TP); s = shape_info(o); n = sum(1 for x in HER if o.gap_sq(x, TP) <= 0.05)
    return t.verdict(o, [("leader touches the prop", gp <= 0.05, f"gap {gp:.2f}"), ("all four touch it", n == 4, f"{n} touch"), ("last.shape == swarm", s["shape"] == "swarm", f"shape={s['shape']}")], num=n, unit="touching")

@check("S02.i", S, "the pen: they file in through the door, then fan out round the target (leader touching, all inside)", path="state", kind="HARD", expect010=True, share="s02pen")
def i(t):
    mem = MON[:8]; o = t.shared("s02pen", lambda: t.drag(mem, "S02 Monster 9" if False else mem[0], pt(S, "dropPen"))); L = mem[0]
    inside = [n for n in mem if 4200 < o.c1(n)[0] < 4700 and 1400 < o.c1(n)[1] < 1900]; gp = o.gap_sq(L, TPEN)
    return t.verdict(o, [("leader touches the pen target", gp <= 0.05, f"gap {gp:.2f}"), ("all eight inside the pen", len(inside) == len(mem), f"{len(inside)} inside")], num=len(inside), unit="inside")

@check("S02.j", S, "the pen: never two centres inside the door frame at once", path="gpu", kind="GATED", expect010=True, timing=True)
def j(t):
    mem = MON[:8]; o = t.drag(mem, mem[0], pt(S, "dropPen"))
    mx, npass = door_frame(o, mem, (4200, 1650)); need = -(-len(mem) // 2)
    return t.verdict(o, [("at least half of them came through the door frame (the check is not vacuous)", npass >= need, f"{npass} of {len(mem)} came near the door"), ("at most one centre within 0.6 sq of the door centre", mx <= 1, f"up to {mx} at once")], num=mx, unit="tokens", guards=TIMING_G)
