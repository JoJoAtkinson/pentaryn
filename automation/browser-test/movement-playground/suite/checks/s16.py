"""S16 Fight yard"""
from fw import check, pt, heroes, tok_names
from ck import *
import json

S = "S16"; HS = ["S16 Hero 1", "S16 Hero 2", "S16 Hero 3", "S16 Slow Hero"]; L = HS[0]; SLOW = "S16 Slow Hero"

def per(o, names):
    out = {}
    for n in names:
        c = charge_of(o, n)
        if c: out[n] = c
    return out

@check("S16.a", S, "fight, group drag: every member is charged exactly 5 ft a square (nothing extra for the leader passing its member)", path="state", kind="HARD", scenario="fight", share="s16grp")
def a(t):
    o = t.shared("s16grp", lambda: t.drag(HS, L, pt(S, "dropFight"))); cs = per(o, HS); bad = {n: (c["sum"], round(c["squares"] * 5, 2)) for n, c in cs.items() if abs(c["sum"] - c["squares"] * 5) > 0.51}
    return t.verdict(o, [("every mover has a charge on record", len(cs) >= 2, f"{list(cs)}"), ("charge == 5 ft x squares walked", not bad, f"(charged, walked*5): {bad}")], expected="charge == 5 ft * squares walked for each member", guards=dict(account=False, notices_ok=(r"out of movement|stopped short",)))

@check("S16.b", S, "fight, group drag: the speed-15 member rests on the last square its speed pays for (15 ft charged)", path="state", kind="HARD", scenario="fight", expect010=True, share="s16grp")
def b(t):
    o = t.shared("s16grp", lambda: t.drag(HS, L, pt(S, "dropFight"))); c = charge_of(o, SLOW)
    return t.verdict(o, [("the slow member moved", c is not None and c["squares"] > 0, "never moved"), ("charged exactly 15 ft (3 squares)", bool(c) and abs(c["sum"] - 15) <= 0.51 and abs(c["squares"] - 3) <= 0.05, f"{c}")], num=(c or {}).get("sum"), unit="ft", guards=dict(account=False, notices_ok=(r"out of movement|stopped short",)))

@check("S16.c", S, "fight, group drag: the leader first, then one member at a time (walks do not overlap in time)", path="gpu", kind="HARD", scenario="fight", expect010=True)
def c(t):
    o = t.drag(HS, L, pt(S, "dropFight")); mv = [(o.first_move(n), o.last_move(n), n) for n in HS if o.first_move(n) is not None]; mv.sort()
    inorder = bool(mv) and mv[0][2] == L; over = []
    for (a1, b1, n1), (a2, b2, n2) in zip(mv, mv[1:]):
        if a2 < b1 - 250: over.append(f"{n2} starts {round(b1 - a2)} ms before {n1} ends")
    return t.verdict(o, [("the leader is the first to move", inorder, f"first mover {mv[0][2] if mv else None}"), ("each starts after the previous finishes (250 ms slack)", not over, "; ".join(over[:3]))], guards=dict(account=False, notices_ok=(r"out of movement|stopped short",)))

@check("S16.d", S, "fight, single drag: Hero 1 alone is charged 5 ft a square (as in 0.9.0; the speed limit is not applied to a single drag)", path="state", kind="HARD", scenario="fight")
def d(t):
    o = t.drag([L], L, pt(S, "dropFight")); c = charge_of(o, L); sp = o.docs[L]["speed"]
    return t.verdict(o, [("charge on record", c is not None, "no history"), ("charge == 5 ft x squares", bool(c) and abs(c["sum"] - c["squares"] * 5) <= 0.51, f"{c}")], num=(c or {}).get("sum"), unit="ft", guards=dict(account=False))

@check("S16.e", S, "fight, group drag: a click on the walker ends the queue (members that had not started never start)", path="gpu", kind="HARD", scenario="fight")
def e(t):
    gpu_only(t)
    def act():
        dr = t.rig.drag("gm", HS, L, pt(S, "dropFight")); ck = t.rig.click_any("gm", HS, min_sq=2.5, timeout=20000)
        return {"drag": dr, "click": ck}
    o = t.act(act, key="gm", group=HS, meta={"grab": L}); cl = o.meta.get("click") or {}
    downs = [p["t"] for p in o.raw["gm"]["ptr"] if p["ty"] == "down"]; ct = downs[-1] if downs else None
    who = cl.get("who"); late = [n for n in HS if n != who and (o.first_move(n) or 0) > (ct or 1e18) + 100]
    return t.verdict(o, [("the click landed on a walking member", not cl.get("missed"), f"{cl}"), ("at least one member had not yet started (the check is not vacuous)", (cl.get("notStarted") or 0) >= 1, f"{cl.get('notStarted')} not started"),
                         ("nobody started to walk after the click", not late, f"started later: {late}")], guards=dict(account=False, notices_ok=(r"out of movement|stopped short",)))

@check("S16.f", S, "fight: a mount and its rider dragged together stay together", path="state", kind="HARD", scenario="fight")
def f(t):
    names = ["S16 Horse", "S16 Rider"]; o = t.drag(names, "S16 Horse", pt(S, "dropFight"), meta={})
    d0 = d_sq(o.c0(names[0]), o.c0(names[1])); d1 = o.dist_sq(*names)
    return t.verdict(o, [("both moved", o.moved_doc(names[0]) and o.moved_doc(names[1]), "one stayed"), ("the rider ends where it started relative to the horse (+-0.35 sq)", abs(d1 - d0) <= 0.35, f"{d0:.2f} -> {d1:.2f} sq")], guards=dict(account=False, rest=False))
