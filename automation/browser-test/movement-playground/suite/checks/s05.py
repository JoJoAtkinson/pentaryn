"""S05 Spiral C stair"""
from fw import check, pt, heroes
from ck import *
import re

S = "S05"; HS = [h for h in heroes(S) if h != "S05 Large"]; L = "S05 Hero 1"; LARGE = "S05 Large"
GA, GB = ST[S]["measure"]["stair"]["groups"]
WA, WB = station_walls(S, grp=GA), station_walls(S, grp=GB)
ALLW = [w for w in ST[S]["walls"] if w.get("grp") in (GA, GB)]
INB = lambda o, n: o.docs[n]["x"] < 1000 and o.docs[n]["y"] >= 4000 if False else None

def in_b(o, n):
    """room B is the south-west room below the stair: centre south of y=4100 (squares 41+) and west of x=1000"""
    c = o.c1(n); return c[1] > 4100

@check("S05.a", S, "stair: ONE drag of one hero crosses room A to room B (arrives, no wall crossed)", path="state", kind="HARD", expect010=True, share="s05one")
def a(t):
    o = t.shared("s05one", lambda: t.drag([L], L, pt(S, "dropB"))); e = leader_err(o, L, pt(S, "dropB"))
    return t.verdict(o, [("hero ended in room B on the drop square (within 0.6 sq)", e <= 0.6, f"{e:.2f} sq off; notices {o.notice_texts()[:2]}")], num=e, unit="sq")

@check("S05.b", S, "stair: one move (a single route write), no pause over 150 ms, clearance >= 0.15 sq, within 0.05 sq of the centre line in the narrow stretch", path="gpu", kind="GATED", expect010=True, timing=True)
def b(t):
    o = t.drag([L], L, pt(S, "dropB")); pts = path_points(o, L); mv = moves_count(o, L)
    pause = longest_pause(o, L); clr = min_clearance(pts, ALLW) if pts else None; dev = centre_deviation(pts, WA, WB) if pts else {"worst_sq": None, "n": 0}
    return t.verdict(o, [("one move write", mv == 1, f"{mv} writes"), ("no pause over 150 ms", pause is not None and pause <= 150, f"longest gap {pause} ms"), ("clearance >= 0.15 sq", clr is not None and clr >= 0.15, f"{clr} sq"),
                         ("on the centre line (<= 0.05 sq) over the narrow stretch", dev["n"] > 0 and dev["worst_sq"] <= 0.05, f"{dev}")], num=dev["worst_sq"], unit="sq", guards=TIMING_G)

@check("S05.c", S, "stair: a group of four dragged A to B: leader first, all four arrive in B, nobody overlapping", path="state", kind="HARD", expect010=True, share="s05grp")
def c(t):
    o = t.shared("s05grp", lambda: t.drag(HS, L, pt(S, "dropB"))); e = leader_err(o, L, pt(S, "dropB")); miss = [n for n in HS if not in_b(o, n)]
    f = {n: o.first_move(n) for n in HS}; lead_first = f[L] is not None and all(v is None or v >= f[L] for v in f.values()) if o.drawn_dense() else True
    return t.verdict(o, [("leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off"), ("all four in room B", not miss, f"not in B: {miss}"), ("the leader sets off first", lead_first, "someone moved before the leader")], num=e, unit="sq")

@check("S05.d", S, "stair: a click on the walker mid-stair rests it off-grid ON the centre line", path="gpu", kind="HARD", expect010=True)
def d(t):
    gpu_only(t)
    def act():
        dr = t.rig.drag("gm", [L], L, pt(S, "dropB")); ck = t.rig.click_when("gm", L, "x>12 && x<16.5 && y>35 && y<40", timeout=15000)
        return {"drag": dr, "click": ck}
    o = t.act(act, key="gm", group=[L], meta={"grab": L}); d_ = o.docs[L]; off = (d_["x"] % 100 != 0) or (d_["y"] % 100 != 0)
    cl = o.meta.get("click") or {}; pts = [o.c1(L)]; dev = centre_deviation(pts, WA, WB, narrow_max=0.8)
    return t.verdict(o, [("the click landed while it moved", not cl.get("missed"), "click missed: token never in the mid-stair window"), ("it rests off the square grid", off, f"at {d_['x']},{d_['y']}"), ("on the centre line (<= 0.05 sq)", dev["n"] > 0 and dev["worst_sq"] <= 0.05, f"{dev}")])

@check("S05.e", S, "stair: the Large is refused at the mouth (a notice, nobody through a wall) or takes the long way", path="state", kind="HARD", share="s05large")
def e(t):
    o = t.shared("s05large", lambda: t.drag([LARGE], LARGE, pt(S, "dropB"))); arrived = in_b(o, LARGE); ns = o.notice_texts()
    return t.verdict(o, [("arrived in B (long way) or refused with a notice", arrived or bool(ns), f"arrived={arrived}, notices={ns[:2]}"), ], guards=dict(account=False, notices_ok=(r".",)))

@check("S05.f", S, "stair, long way open: the Large takes the 2-wide way round into room B", path="state", kind="HARD", scenario="long")
def f(t):
    o = t.drag([LARGE], LARGE, pt(S, "dropB")); arrived = in_b(o, LARGE)
    return t.verdict(o, [("the Large ends in room B", arrived, f"at {o.docs[LARGE]['x']},{o.docs[LARGE]['y']} notices {o.notice_texts()[:2]}")])

def fight(t, names, cur):
    t.say(f"start a combat with {len(names)} combatants, turn {cur}")
    t.rig.ev("gm", r"""const sc=canvas.scene; for (const c of game.combats.filter(c=>c.scene?.id===sc.id)) await c.delete();
const names=%s; const toks=sc.tokens.filter(t=>names.includes(t.name)); const cb=await Combat.create({scene:sc.id, active:true});
await cb.createEmbeddedDocuments("Combatant", toks.map((t,i)=>({tokenId:t.id, actorId:t.actorId, sceneId:sc.id, initiative:100-i}))); await cb.startCombat();
const i=cb.turns.findIndex(c=>c.token?.name===%s); if(i>=0) await cb.update({turn:i}); for (const t of toks) if (t.movementHistory?.length) await t.clearMovementHistory?.(); return 1""" % (json.dumps(names), json.dumps(cur)))
    t.rig.wait_quiet(min_wait=1.0)
import json

@check("S05.g", S, "stair in a fight: the charge is the distance walked (5 ft per square, off-grid by length)", path="state", kind="HARD", expect010=True)
def g(t):
    t.walk(HS, 30); fight(t, HS, L); o = t.drag([L], L, pt(S, "dropB")); c = charge_of(o, L)
    if not c or not in_b(o, L): return t.verdict(o, [("the hero crossed the stair into B", False, f"stopped at {o.c1(L)}; notices {o.notice_texts()[:2]}")], guards=dict(account=False, notices_ok=(r".",)))
    walked = polyline_len([(e[0], e[1]) for e in o.docs[L]["hist"]]) / G * 5; ch = c["sum"]
    return t.verdict(o, [("charged within 3 % + 1 ft of the distance walked", abs(ch - walked) <= 0.03 * walked + 1, f"charged {ch} ft, walked {walked:.1f} ft ({c})")], num=ch - walked, unit="ft")

@check("S05.h", S, "stair, mud painted over it, in a fight: the charge doubles only inside the region", path="state", kind="HARD", scenario="mud", expect010=True)
def h(t):
    t.walk(HS, 30); fight(t, HS, L); o = t.drag([L], L, pt(S, "dropB")); c = charge_of(o, L)
    if not c or not in_b(o, L): return t.verdict(o, [("the hero crossed the stair into B", False, f"stopped at {o.c1(L)}; notices {o.notice_texts()[:2]}")], guards=dict(account=False, notices_ok=(r".",)))
    pts = [(e[0], e[1]) for e in o.docs[L]["hist"]]; shp = ST[S]["regions"][0]["shape"]
    inside = region_len_sq(pts, shp); total = polyline_len(pts) / G; exp = 5 * (total + inside); ch = c["sum"]
    return t.verdict(o, [("region really crossed", inside > 1, f"{inside:.2f} sq inside"), ("charge = 5 ft x (walked + inside the region)", abs(ch - exp) <= 0.04 * exp + 1.5, f"charged {ch}, expected {exp:.1f} ({total:.1f} sq walked, {inside:.1f} inside)")], num=ch - exp, unit="ft")


@check("S05.i", S, "stair: a warm narrow route takes under 50 ms and reports narrow + minClearance >= 0.15", path="state", kind="GATED", expect010=True, timing=True)
def i(t):
    to = pt(S, "dropB"); t.say("pathfind.route Hero 1 to room B, three times (cold, warm, warm)")
    r = t.rig.ev("gm", """const m=game.pentaryn.movement; const a=canvas.tokens.placeables.find(t=>t.name==='S05 Hero 1').document; const out=[]; for(let i=0;i<4;i++){const t0=performance.now(); const r=await m.pathfind.route(a,{to:{x:%d,y:%d}}); out.push({ms:performance.now()-t0, ok:r.ok, reached:r.reached, narrow:r.narrow, minClearance:r.minClearance});} return JSON.stringify(out)""" % (to[0] - 50, to[1] - 50))
    warm = sorted(x["ms"] for x in r[1:])[1]; last = r[-1]
    c = [("route found", last["ok"] and last.get("reached") is not False, json.dumps(last)), ("warm route under 50 ms", warm < 50, f"{warm:.1f} ms"), ("route reports narrow=true", last.get("narrow") is True, last.get("narrow")), ("minClearance >= 0.15 sq", isinstance(last.get("minClearance"), (int, float)) and last["minClearance"] >= 0.15, last.get("minClearance"))]
    return {"ok": all(x[1] for x in c), "num": round(warm, 1), "unit": "ms", "expected": "; ".join(x[0] for x in c), "note": "; ".join(f"{x[0]}: {x[2]}" for x in c if not x[1]) or f"warm {warm:.1f} ms", "conds": c}
