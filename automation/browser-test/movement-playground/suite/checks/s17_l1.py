"""Live round 1 extras (the Fable check's list): off-grid walls with ten tokens, S05 group drops, a one-wide door, riders, plan timing (R11), two clients on the stair.
Extra tokens are made at the start of a check from ZZ actors (names "S05 Hero 5" ...), flagged as extras; the next reset deletes them as strays."""
import json, re, math, time
from fw import check, pt, heroes, tok_names, Skip
from ck import *
from an import seg_cross
from s05 import fight

# ---------------------------------------------------------------- helpers
def add_tokens(t, st, specs, actor="ZZ Monster", disp=1):
    """specs: [(name, x, y)] top-left px. Tokens made from the named ZZ actor; waits until every placeable is drawn."""
    names = [s[0] for s in specs]
    t.say(f"add {len(specs)} extra tokens of {actor}: {', '.join(n.split(' ', 1)[1] for n in names[:12])}")
    r = t.rig.ev("gm", r"""const sc=canvas.scene; const act=game.actors.getName(%s); const out=[];
for (const [n,x,y] of %s) { if (sc.tokens.getName(n)) continue; const td=await act.getTokenDocument({name:n,x,y}); const o=td.toObject(); o.disposition=%d; o.lockRotation=true; o.flags={...(o.flags||{}),world:{pg:{st:%s,key:'extra',grp:null,only:null}}}; out.push(o); }
if (out.length) await sc.createEmbeddedDocuments('Token', out);
const t0=performance.now(); while(performance.now()-t0<8000){ if (%s.every(n=>{const p=canvas.tokens.placeables.find(t=>t.name===n); return p && !p.destroyed && p.mesh;})) break; await new Promise(r=>setTimeout(r,100)); }
await new Promise(r=>setTimeout(r,800)); return out.length""" % (json.dumps(actor), json.dumps(specs), disp, json.dumps(st), json.dumps(names)))
    for k in list(t.rig.pages):
        if k != "gm":
            t.rig.ev(k, "const t0=performance.now(); const ns=%s; while(performance.now()-t0<8000){ if (ns.every(n=>canvas.tokens.placeables.find(t=>t.name===n))) break; await new Promise(r=>setTimeout(r,100)); } return 1" % json.dumps(names))
    return r


def named_of(o, names): return [n for n in names if o.named(n)]


def min_pair(o, names):
    ds = [(o.dist_sq(a, b), a, b) for i, a in enumerate(names) for b in names[i + 1:] if a in o.docs and b in o.docs]
    return min(ds) if ds else (9, None, None)


def wp_clear(o, names, walls):
    """smallest distance (sq) from any waypoint of the server's routes (every move event of these tokens) to a wall"""
    worst = 9.0; at = None
    for n in names:
        for poly in o.route_points(n):
            for p in poly:
                d = dist_to_walls(p, walls) / G
                if d < worst: worst = d; at = (n, round(p[0]), round(p[1]))
    return round(worst, 3), at


def plan_of(o, page=None):
    l = o.last(page) or {}
    return (l.get("plan") or {}), l


def perf_of(o, page=None):
    s = o.status.get(page or o.drag_page) or {}
    p = s.get("perf") or {}; l = s.get("last") or {}
    return {"lastMs": p.get("lastMs"), "maxMs": p.get("maxMs"), "plan": (l.get("plan") or {}).get("timingMs"), "ms": l.get("ms"), "members": (l.get("plan") or {}).get("members"), "shape": l.get("shape")}


def walls_of(st): return [w for w in ST[st]["walls"] if not w.get("only")]


def core_measure(t, name, origin=None):
    """what core itself measures for the token's recorded movement history (Token#measureMovementPath over the history's
    top-left positions, as the token's own move is measured; live round 2: the centres passed as top-lefts measured a
    path shifted half a square, 25 ft where core charges 30) beside what the history was charged. `origin` is a centre."""
    r = t.rig.ev("gm", r"""const tk=canvas.scene.tokens.getName(%s); const h=tk.movementHistory??[]; const W=tk.width??1, H=tk.height??1; const w=h.map(e=>({x:e.x,y:e.y,elevation:e.elevation??0,width:W,height:H,action:e.action??tk.movementAction})); const og=%s; if (og && h.length && Math.hypot(og[0]-W*50-w[0].x, og[1]-H*50-w[0].y)>2) w.unshift({x:og[0]-W*50,y:og[1]-H*50,elevation:w[0].elevation,width:W,height:H,action:w[0].action});
let core=null; try{ core=tk.object.measureMovementPath(w).cost; }catch(e){ try{ core=tk.measureMovementPath(w).cost; }catch(e2){} }
return JSON.stringify({core, charged:h.reduce((s,e)=>s+(e.cost??0),0), n:h.length})""" % (json.dumps(name), json.dumps(list(origin) if origin else None)))
    return r


def blocking_pairs(o): return [((w["c"][0], w["c"][1]), (w["c"][2], w["c"][3])) for w in o.walls0 if w.get("move") and not (w.get("door") and w.get("ds") == 1)]


# ================================================================ S06: ten tokens along off-grid walls
S6 = "S06"; H6 = ["S06 Hero 1", "S06 Hero 2"]
X6 = [(f"S06 Hero {i + 3}", x, y) for i, (x, y) in enumerate([(2500, 3000), (2700, 3000), (2500, 3100), (2700, 3100), (2500, 3200), (2700, 3200), (2500, 3300), (2700, 3300)])]
TEN6 = H6 + [x[0] for x in X6]

def ten(sid, pname, title):
    @check(sid, S6, title, path="state", kind="HARD")
    def f(t):
        add_tokens(t, S6, X6)
        o = t.drag(TEN6, H6[0], pt(S6, pname)); pl, last = plan_of(o); nm = named_of(o, TEN6); e = leader_err(o, H6[0], pt(S6, pname))
        c = [("the plan failed for nobody (plan.failed = 0)", pl.get("failed") == 0, f"plan {json.dumps(pl)[:200]}"), ("nobody named in a notice", not nm, f"named {nm}; notices {o.notice_texts()[:2]}"),
             ("the leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off"), ("a march", last.get("shape") == "march", f"shape {last.get('shape')}")]
        return t.verdict(o, c, num=pl.get("failed"), unit="failed")
    return f
ten("S06.h", "dropScurve", "ten tokens marched through the S-curve (off-grid walls): plan.failed 0, nobody named, none across a wall")
ten("S06.i", "dropField", "ten tokens marched beside the off-grid pillar field: plan.failed 0, nobody named, none across a wall")


# ================================================================ S05: group drops on the stair, 4 and 8 heroes, five points
S5 = "S05"; L5 = "S05 Hero 1"; H4 = [f"S05 Hero {i}" for i in range(1, 5)]
X5 = [(f"S05 Hero {i + 5}", x, y) for i, (x, y) in enumerate([(500, 3300), (700, 3300), (900, 3300), (900, 3400)])]
H8 = H4 + [x[0] for x in X5]
P5 = {"in06": (1060, 3253), "d45": None, "mid": None, "a150": (1300, 4370), "b1": (950, 4450)}
W5 = walls_of(S5)

def stair_drop(sid, n, key):
    @check(sid, S5, f"stair: {n} heroes dropped at {'0.6 sq into the stair' if key == 'in06' else {'d45': 'dropStair45', 'mid': 'dropMid', 'a150': '150 degrees', 'b1': 'the square just inside room B'}[key]}: nobody named, none within 0.98 sq, clear of walls", path="state", kind="HARD")
    def f(t):
        grp = H4 if n == 4 else H8
        if n == 8: add_tokens(t, S5, X5)
        p = P5[key] or (pt(S5, "dropStair45") if key == "d45" else pt(S5, "dropMid"))
        o = t.drag(grp, L5, p); nm = named_of(o, grp); md, a, b = min_pair(o, grp); wc, at = wp_clear(o, grp, W5); e = leader_err(o, L5, p); pl, last = plan_of(o)
        c = [("nobody named while the way has room", not nm, f"named {nm}; notices {o.notice_texts()[:2]}"), ("no two at rest within 0.98 sq", md >= 0.98, f"closest {md:.2f} sq ({a}/{b})"),
             ("the server's waypoints at least 0.14 sq clear of walls", wc >= 0.14, f"{wc} sq at {at}")]
        return t.verdict(o, c, num=md, unit="sq", expected=f"leader {e:.2f} sq off; plan.failed {pl.get('failed')}; ", guards=dict(account=False))
    return f
for i, key in enumerate(["in06", "d45", "mid", "a150", "b1"], 1):
    stair_drop(f"S05.j{i}", 4, key); stair_drop(f"S05.k{i}", 8, key)


@check("S05.m", S5, "stair, two clients: heroes dragged from opposite rooms at the same moment: zero rest overlap, zero wall crossing, both answered", path="both", kind="HARD", pages=("gm", "pa", "pb"))
def m(t):
    from h import par
    rig = t.rig; GA = ["S05 Hero 1", "S05 Hero 2"]; GB = ["S05 Hero 5", "S05 Hero 6"]
    add_tokens(t, S5, [("S05 Hero 5", 400, 4700), ("S05 Hero 6", 500, 4700)], actor="ZZ Hero 5")  # both tokens of Player8B's actor, in room B's south-west corner (never on dropB)
    def fn():
        t.say("page pa drags Heroes 1-2 from room A to room B while page pb drags Heroes 5-6 from room B to room A, at the same moment")
        out = par(lambda: rig.drag("pa", GA, GA[0], pt(S5, "dropB"), release=False), lambda: rig.drag("pb", GB, GB[0], pt(S5, "dropA"), release=False))
        par(lambda: rig.mouse("pa", [{"up": "left"}]), lambda: rig.mouse("pb", [{"up": "left"}]))
        return {"drag": out}
    o = t.act(fn, key="pa", group=GA + GB, meta={"grab": GA[0]}, settle=40)
    eA = leader_err(o, GA[0], pt(S5, "dropB")); eB = leader_err(o, GB[0], pt(S5, "dropA")); nm = named_of(o, GA + GB); drawn = {}
    for k, s in o.snap.items():
        for tk in s["docs"]["toks"]:
            if tk["n"] in GA + GB and tk.get("drawn") and max(abs(tk["drawn"][0] - tk["x"]), abs(tk["drawn"][1] - tk["y"])) > 3: drawn[f"{k}:{tk['n']}"] = 1
    c = [("each leader reached its drop (within 1.0 sq) or its group was named", (eA <= 1.0 or any(o.named(n) for n in GA)) and (eB <= 1.0 or any(o.named(n) for n in GB)), f"A leader {eA:.2f} sq, B leader {eB:.2f} sq off; named {nm}"),
         ("every screen draws each token where its document is", not drawn, f"{drawn}")]
    return t.verdict(o, c, num=max(eA, eB), unit="sq", guards=dict(account=False, standing=False, notices_ok=(r".",)))


@check("S05.n", S5, "stair: a click on a group of four mid-stair stops them all clear of the walls, off the grid, nobody overlapping", path="gpu", kind="HARD")
def n_(t):
    gpu_only(t)
    def act():
        dr = t.rig.drag("gm", H4, L5, pt(S5, "dropB")); ck = t.rig.click_when("gm", L5, "x>12 && x<16.5 && y>35 && y<40", timeout=20000)
        return {"drag": dr, "click": ck}
    o = t.act(act, key="gm", group=H4, meta={"grab": L5}, settle=40); cl = o.meta.get("click") or {}
    clr = {n: round(dist_to_walls(o.c1(n), W5) / G, 3) for n in H4}; bad = {n: v for n, v in clr.items() if v < 0.14}
    diff = {n: max(abs(d_["drawn"][0] - d_["x"]), abs(d_["drawn"][1] - d_["y"])) for n, d_ in o.docs.items() if n in H4 and d_.get("drawn")}; dd = {n: v for n, v in diff.items() if v > 3}
    c = [("the click landed while they walked", not cl.get("missed"), f"{cl}"), ("every member rests at least 0.14 sq clear of every wall", not bad, f"clearance (sq): {clr}"),
         ("each token's drawn position equals its document", not dd, f"{dd}")]
    return t.verdict(o, c, guards=dict(account=False, notices_ok=(r".",)))


@check("S05.o", S5, "stair in a fight: a leader stopped by speed mid-stair rests off-grid clear of the walls, and walks on next turn from there (charged by core's measure)", path="state", kind="HARD")
def o_(t):
    grp = H4[:2]; L = grp[0]
    t.walk(H4, 30); fight(t, grp, L)
    o1 = t.drag(grp, L, pt(S5, "dropB"), settle=60)
    d1 = o1.docs[L]; off = (d1["x"] % 100 != 0) or (d1["y"] % 100 != 0); c1 = charge_of(o1, L); clr = round(dist_to_walls(o1.c1(L), W5) / G, 3); ns1 = o1.notice_texts()
    stage = [("stopped by speed: charged 30 ft or less", bool(c1) and c1["sum"] <= 30.51, f"{c1}"), ("not yet in room B (stopped short)", o1.c1(L)[1] < 4150, f"at {o1.c1(L)}"),
             ("rests off the square grid", off, f"at {d1['x']},{d1['y']}"), ("rests at least 0.14 sq clear of the walls", clr >= 0.14, f"{clr} sq")]
    ov1 = o1.rest_overlaps(); wh1 = o1.wall_hits()
    t.say("combat: next turn(s) back to Hero 1")
    r = t.rig.ev("gm", r"""const cb=game.combats.find(c=>c.scene?.id===canvas.scene.id); const hist=[]; for (let i=0;i<4;i++){ await cb.nextTurn(); if (cb.combatant?.token?.name==='S05 Hero 1') break; }
const tok=canvas.scene.tokens.getName('S05 Hero 1'); const n0=tok.movementHistory?.length??0; if (n0) await tok.clearMovementHistory?.(); return JSON.stringify({turn:cb.combatant?.token?.name, round:cb.round, hist0:n0})""")
    cm1 = core_measure(t, L)
    o2 = t.drag(grp, L, pt(S5, "dropB"), settle=60)
    c2 = charge_of(o2, L); prog = d_sq(o1.c1(L), o2.c1(L)); w2 = polyline_len([(e[0], e[1]) for e in o2.docs[L]["hist"]]) / G * 5 if c2 else 0; cm2 = core_measure(t, L, origin=o2.c0(L)); clr2 = round(dist_to_walls(o2.c1(L), W5) / G, 3); wh2 = o2.wall_hits()
    stage += [("next turn: it is Hero 1's turn again", (r or {}).get("turn") == L, f"{r}"), ("it walks on from its off-grid rest (at least 3 sq further, or into room B)", prog >= 3 or o2.c1(L)[1] > 4150, f"moved {prog:.2f} sq on; now at {o2.c1(L)}; notices {o2.notice_texts()[:2]}"),
              ("the second walk's charge is 30 ft or less (speed again)", bool(c2) and c2["sum"] <= 30.51, f"{c2}"), ("the second walk is charged by the distance walked (3 % + 1 ft of the history's length; core's own measure beside it)", bool(c2) and abs(c2["sum"] - w2) <= 0.03 * w2 + 1, f"charged {c2 and c2['sum']} ft, walked {w2:.1f} ft, core's measure {cm2}"),
              ("it rests at least 0.14 sq clear of the walls again (or in room B)", clr2 >= 0.14 or o2.c1(L)[1] > 4150, f"{clr2} sq")]
    w1 = polyline_len([(e[0], e[1]) for e in o1.docs[L]["hist"]]) / G * 5 if c1 else 0
    stage.append(("the first walk is charged by the distance walked (3 % + 1 ft; core's own measure beside it)", bool(c1) and abs(c1["sum"] - w1) <= 0.03 * w1 + 1, f"charged {c1 and c1['sum']} ft, walked {w1:.1f} ft, core's measure {cm1}"))
    if wh2: stage.append(("no wall crossed on the second walk", False, f"{wh2[:2]}"))
    res = t.verdict(o2, stage, num=(c1 or {}).get("sum"), unit="ft", guards=dict(account=False, notices_ok=(r".",), rest=False))
    bad = [("no two tokens overlapped at rest after the first stop", not ov1, f"{ov1[:2]}"), ("no wall crossed on the first walk", not wh1, f"{wh1[:2]}")]
    res["conds"] += bad
    if any(not b[1] for b in bad): res["ok"] = False; res["note"] = "; ".join(f"{b[0]}: {b[2]}" for b in bad if not b[1]) + "; " + res["note"]
    return res


# ================================================================ S07: a one-wide door
S7 = "S07"; HS7 = heroes(S7); L7 = "S07 Hero 1"; DOOR = (5600, 2950)

def door_counts(o, grp):
    inside = [n for n in grp if o.c1(n)[0] > DOOR[0] + 40 and o.c1(n)[1] < 3100]
    # In the frame: a centre within 45 px of the door's line (live round 2: 55 px counted the squares just before and
    # just past the door, whose centres are 50 px off it, as in the frame).
    frame = [n for n in grp if abs(o.c1(n)[0] - DOOR[0]) < 45 and abs(o.c1(n)[1] - DOOR[1]) < 70]
    return inside, [n for n in grp if n not in inside], frame

def past(sid, sq):
    @check(sid, S7, f"one-wide door: eight heroes dropped {sq} squares past it: how many rest inside, queue outside, are named (nobody named, none in the frame)", path="state", kind="REPORTED")
    def f(t):
        to = (DOOR[0] + sq * 100, DOOR[1]); o = t.drag(HS7, L7, to); ins, out, frame = door_counts(o, HS7); nm = named_of(o, HS7); e = leader_err(o, L7, to)
        return t.verdict(o, [("leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off"), ("nobody named (room for all behind the door)", not nm, f"named {nm}; notices {o.notice_texts()[:2]}"), ("nobody left standing in the door frame", not frame, f"{frame}")],
                         num=len(ins), unit="inside", expected=f"{len(ins)} inside, {len(out)} outside, {len(nm)} named", guards=dict(account=False))
    return f
for sq, sid in ((2, "S07.m"), (3, "S07.n"), (5, "S07.o")): past(sid, sq)

def fight_door(sid, sq):
    @check(sid, S7, f"one-wide door in a fight on a diagonal approach, drop {sq} squares past: nobody stopped at the door frame except by speed", path="state", kind="HARD")
    def f(t):
        t.walk(HS7, 120)
        t.rig.ev("gm", "const sc=canvas.scene; await sc.updateEmbeddedDocuments('Token',[{_id:sc.tokens.getName('S07 Hero 1').id,x:5100,y:4100},{_id:sc.tokens.getName('S07 Hero 2').id,x:5400,y:4100}],{animate:false}); await new Promise(r=>setTimeout(r,800)); return 1")
        fight(t, HS7, L7)
        to = (DOOR[0] + sq * 100, DOOR[1]); o = t.drag(HS7, L7, to, settle=90); ins, out, frame = door_counts(o, HS7)
        q = (o.last().get("queue") or {}); walks = q.get("walks") or []
        spd = {w.get("id") for w in walks if w.get("why") == "speed"}; ids = {n: o.init[n]["id"] for n in HS7 if n in o.init}
        stuck = [n for n in frame if ids.get(n) not in spd]; e = leader_err(o, L7, to)
        return t.verdict(o, [("the leader reached the drop (within 0.6 sq)", e <= 0.6, f"{e:.2f} sq off; notices {o.notice_texts()[:2]}"), ("nobody rests in the door frame unless stopped by speed", not stuck, f"in the frame {frame}, stopped by speed {sorted(spd)}")],
                         num=len(ins), unit="inside", expected=f"{len(ins)} inside, {len(out)} outside, speed stops {len(spd)}", guards=dict(account=False, notices_ok=(r"out of movement|stopped short|did not move",)))
    return f
for sq, sid in ((2, "S07.p"), (3, "S07.q"), (5, "S07.r")): fight_door(sid, sq)


# ================================================================ S16: riders
S16 = "S16"; MOUNT = "S16 Horse"; RIDER = "S16 Rider"

def on_mount(o):
    h = o.docs[MOUNT]; r = o.docs[RIDER]; rc = (r["x"] + r["w"] * 50, r["y"] + r["h"] * 50)
    return h["x"] - 5 <= rc[0] <= h["x"] + h["w"] * 100 + 5 and h["y"] - 5 <= rc[1] <= h["y"] + h["h"] * 100 + 5, rc

@check("S16.g", S16, "rider grabbed in a group of four: the mount leads, the stack is one entry, a march, the rider rests on its mount", path="state", kind="HARD")
def g_(t):
    grp = ["S16 Hero 1", "S16 Hero 2", MOUNT, RIDER]; to = pt(S16, "dropFight")
    o = t.drag(grp, RIDER, to); pl, last = plan_of(o); ok, rc = on_mount(o); lid = last.get("leader"); mid = o.init[MOUNT]["id"]; mv = d_sq(o.c0(MOUNT), o.c1(MOUNT))
    c = [("status().group.last.leader is the mount", lid in (mid, MOUNT), f"leader {lid} (mount id {mid})"), ("shape march", last.get("shape") == "march", f"shape {last.get('shape')}"),
         ("the stack counts as one entry (plan.members 3 of 4 selected)", pl.get("members") == 3, f"plan.members {pl.get('members')}, stacked {last.get('stacked')}"), ("the rider rests on its mount", ok, f"rider centre {rc}, mount at {o.docs[MOUNT]['x']},{o.docs[MOUNT]['y']}"),
         ("the mount travelled (over 5 sq)", mv > 5, f"{mv:.1f} sq")]
    return t.verdict(o, c, num=mv, unit="sq", guards=dict(account=False, rest=False))

@check("S16.h", S16, "a Large mount with its rider moved one square on each diagonal: a march, never a swarm round its own rider", path="state", kind="HARD")
def h_(t):
    res = []; o = None
    for dx, dy in ((1, 1), (-1, -1), (-1, 1), (1, -1)):
        c0 = t.rig.centre("gm", MOUNT); to = (c0["x"] + dx * 100, c0["y"] + dy * 100)
        o = t.drag([MOUNT, RIDER], MOUNT, to); pl, last = plan_of(o); ok, rc = on_mount(o); tgt = last.get("target")
        res.append((dx, dy, last.get("shape"), tgt, ok, round(d_sq(o.c0(MOUNT), o.c1(MOUNT)), 2), last.get("mode"), last.get("reason")))
    bad = [r for r in res if r[2] == "swarm" or r[3]]; off = [r for r in res if not r[4]]; still = [r for r in res if r[5] < 0.5]
    c = [("never a swarm and no target on any diagonal", not bad, f"{bad}"), ("the rider rests on its mount after each", not off, f"{off}"), ("the mount moved on each diagonal", not still, f"{still}"), ("it is a march (or the single stack path), per diagonal", all(r[2] in ("march", None) for r in res), f"{[(r[0], r[1], r[2], r[6], r[7]) for r in res]}")]
    return t.verdict(o, c, guards=dict(account=False, rest=False, standing=False))


# ================================================================ plan timing (R11): perf.lastMs beside plan.timingMs
S1 = "S01"; H1 = heroes(S1); M1 = [f"S01 Monster {i}" for i in range(1, 9)]
X1 = [(f"S01 Monster {i + 9}", x, y) for i, (x, y) in enumerate([(1000, 400), (1100, 400), (1200, 400), (1300, 400)])]

def toggle_door(t):
    t.say("toggle S07's open door (a wall update: the pathfinder's memo is cold afterwards)")
    t.rig.ev("gm", "const w=canvas.scene.walls.find(w=>w.flags?.world?.pg?.st==='S07' && w.flags?.world?.pg?.key==='open'); await w.update({ds:0}); await new Promise(r=>setTimeout(r,200)); await w.update({ds:1}); await new Promise(r=>setTimeout(r,500)); return 1")

def timed_pair(t, grp, grab, p1, p2, label):
    """cold (right after a door toggle) then warm; returns [(label, perf dict, Obs)]"""
    out = []
    toggle_door(t); o = t.drag(grp, grab, p1); out.append((label + " cold", perf_of(o), o))
    o = t.drag(grp, grab, p2); out.append((label + " warm", perf_of(o), o))
    return out

@check("S01.k", S1, "plan time on the page (R11): perf.lastMs under 100 ms for 8 and 250 ms for 20 members on open ground, cold and warm", path="gpu", kind="GATED", timing=True)
def k_(t):
    gpu_only(t)
    r = timed_pair(t, H1, H1[0], pt(S1, "dropFar"), (1900, 700), "8")
    t.reset(); add_tokens(t, S1, X1); g20 = H1 + M1 + [x[0] for x in X1]
    r += timed_pair(t, g20, H1[0], pt(S1, "dropFar"), (1900, 700), "20")
    c = []
    for lab, p, o in r:
        lim = 100 if lab.startswith("8") else 250; v = p["lastMs"]
        c.append((f"{lab}: perf.lastMs under {lim} ms", v is not None and v < lim, f"lastMs {v}, plan.timingMs {p['plan']}, members {p['members']}"))
    worst = max((p["lastMs"] or 0) for _, p, _ in r)
    res = t.verdict(r[-1][2], c, num=worst, unit="ms", guards=TIMING_G)
    res["note"] = "; ".join(f"{lab}: lastMs {p['lastMs']} / timingMs {p['plan']}" for lab, p, _ in r)[:600] if res["ok"] else res["note"]
    return res

@check("S01.l", S1, "plan time at 4x CPU throttle (reported): perf.lastMs beside plan.timingMs for 8 and 20 members, cold and warm", path="gpu", kind="REPORTED", timing=True)
def l_(t):
    gpu_only(t)
    def thr(rate): t.rig.post("cdp", {"user": "gm", "method": "Emulation.setCPUThrottlingRate", "params": {"rate": rate}})
    thr(4); t.cleanups.append(lambda: thr(1)); t.say("CPU throttled 4x on the GM page")
    r = timed_pair(t, H1, H1[0], pt(S1, "dropFar"), (1900, 700), "8 @4x")
    t.reset(); add_tokens(t, S1, X1); g20 = H1 + M1 + [x[0] for x in X1]
    r += timed_pair(t, g20, H1[0], pt(S1, "dropFar"), (1900, 700), "20 @4x")
    worst = max((p["lastMs"] or 0) for _, p, _ in r)
    note = "; ".join(f"{lab}: lastMs {p['lastMs']} / timingMs {p['plan']}" for lab, p, _ in r)
    return {"ok": True, "num": worst, "unit": "ms", "note": note[:600], "conds": [("reported", True, note)], "expected": "reported"}

@check("S05.p", S5, "plan time over the stair (R11): 8 heroes A to B and back, cold and warm: perf.lastMs reported; nobody named for a route timeout", path="gpu", kind="REPORTED", timing=True)
def p_(t):
    gpu_only(t); add_tokens(t, S5, X5)
    toggle_door(t); o1 = t.drag(H8, L5, pt(S5, "dropB")); p1 = perf_of(o1)
    o2 = t.drag(H8, L5, pt(S5, "dropA")); p2 = perf_of(o2); o3 = t.drag(H8, L5, pt(S5, "dropB")); p3 = perf_of(o3)
    allnotes = o1.notice_texts() + o2.notice_texts() + o3.notice_texts(); tmo = [x for x in allnotes if re.search(r"time|too long|took", x, re.I)]
    nm = named_of(o1, H8) + named_of(o2, H8) + named_of(o3, H8)
    note = f"cold A->B lastMs {p1['lastMs']} / timingMs {p1['plan']}; warm B->A {p2['lastMs']} / {p2['plan']}; warm A->B {p3['lastMs']} / {p3['plan']}"
    return t.verdict(o3, [("nobody named and no route-timeout notice", not nm and not tmo, f"named {nm}; notices {tmo[:2]}")], num=max(p["lastMs"] or 0 for p in (p1, p2, p3)), unit="ms", expected=note, guards=TIMING_G)
