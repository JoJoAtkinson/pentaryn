"""Shared analysis helpers for the station checks (pure functions over an Obs). Lengths: sq = squares of 100 px."""
import math, json
import numpy as np
from h import ST, G
from an import seg_pt_dist, polyline_len


def d_sq(a, b): return math.hypot(a[0] - b[0], a[1] - b[1]) / G


def leader_err(o, leader, drop):
    """distance (sq) from the leader's final centre to the drop point"""
    return d_sq(o.c1(leader), drop)


def pack(o, leader, others):
    """per member: along/lat/dist relative to the leader's last step; plus the worst (max) along and max dist"""
    b = o.behind(leader, others) or {}
    return b, (max([v["along"] for v in b.values()]) if b else None), (max([v["dist"] for v in b.values()]) if b else None)


def ring_gap(o, a, target):
    """Chebyshev gap in squares between member `a` and the target token at rest (0 = touching)"""
    return o.gap_sq(a, target)


def field(o, *path, default=None, page=None):
    return o.last_get(*path, default=default, page=page)


def shape_info(o):
    """the module's account of the last drop (0.10 fields read defensively): {shape, mode, leader, target, plan}"""
    l = o.last()
    return {"shape": l.get("shape"), "mode": l.get("mode"), "leader": l.get("leader"), "target": l.get("target"), "plan": l.get("plan"), "stayed": l.get("stayed"), "waves": l.get("waves"), "keys": sorted(l.keys())}


def plan_ms(o, page=None):
    """the module's own plan time: plan.ms (0.9.0: the whole plan incl. searches; its plan.timingMs there is only the timing part), else plan.timingMs (R13)"""
    p = (o.last(page) or {}).get("plan") or {}
    for k in ("ms", "timingMs"):
        if isinstance(p.get(k), (int, float)): return p[k]
    return None   # no plan was made (0.9.0 hands more than 12 members to core): the gate must fail, not read some other counter


def drop_to_first_write(o):
    """independent of the module: ms from the pointerup of the drop to the first token position write on the dragging page"""
    t = o.first_event(next(iter(o.meta.get("group") or []), None)) if False else None
    ts = [e["t"] for e in o.ev if e["k"] == "tok" and "sx" in e and not e.get("teleport")]
    return (min(ts) - o.dropT) if (ts and o.dropT) else None


def first_move_delay(o, leader, others, page=None):
    """ms between the leader's first drawn change and each other member's (drawn tracks of the dragging page)"""
    t0 = o.first_move(leader, page)
    if t0 is None: return None
    out = {}
    for n in others:
        t = o.first_move(n, page)
        if t is not None: out[n] = t - t0
    return out


def longest_pause(o, name, page=None, thresh_px=0.6):
    """longest interval (ms) between the token's first and last drawn change in which its drawn centre did not change"""
    tr = o.tracks.get(page or o.drag_page, {}).get(name)
    if tr is None or len(tr) < 3: return None
    t = tr[1:, 0]; return float(np.max(np.diff(t))) if len(t) > 1 else 0.0


def moves_count(o, name):
    """how many separate move updates (document updates with a new position) the token got"""
    return sum(1 for e in o.ev if e["k"] == "tok" and e["n"] == name and "sx" in e and not e.get("teleport"))


# ---- walls and the stair
def station_walls(st, key=None, grp=None):
    return [w for w in ST[st]["walls"] if (key is None or w.get("key") == key) and (grp is None or w.get("grp") == grp)]


def dist_to_walls(p, walls):
    return min((seg_pt_dist((w["c"][0], w["c"][1]), (w["c"][2], w["c"][3]), p) for w in walls), default=1e9)


def drawn_points(o, name, page=None, step_px=6):
    """the token's drawn centre path as a dense polyline (interpolated), from the dragging page's frame track"""
    tr = o.tracks.get(page or o.drag_page, {}).get(name)
    if tr is None or len(tr) < 2: return []
    pts = []
    for i in range(1, len(tr)):
        a, b = tr[i - 1, 1:], tr[i, 1:]; L = math.hypot(*(b - a))
        if L > 3 * G: continue
        k = max(1, int(L / step_px)); pts += [(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k) for j in range(k + 1)]
    return pts


def route_dense(o, name, step_px=6):
    pts = []
    for poly in o.route_points(name):
        for a, b in zip(poly, poly[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1]); k = max(1, int(L / step_px)); pts += [(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k) for j in range(k + 1)]
    return pts


def path_points(o, name):
    """drawn (dense gpu) else the route polyline"""
    p = drawn_points(o, name) if o.drawn_dense() else []
    return p or route_dense(o, name)


def centre_deviation(pts, wallsA, wallsB, narrow_max=0.5):
    """for points where the way is narrow (distance to the two stair walls sums to <= narrow_max sq), the offset of the point from the middle of the two: worst (sq) and count"""
    worst = 0.0; n = 0; minw = 9
    for p in pts:
        a = dist_to_walls(p, wallsA) / G; b = dist_to_walls(p, wallsB) / G
        if a + b <= narrow_max and a < 1 and b < 1:
            n += 1; worst = max(worst, abs(a - b) / 2); minw = min(minw, a + b)
    return {"worst_sq": round(worst, 3), "n": n, "narrowest": round(minw, 3) if n else None}


def min_clearance(pts, walls):
    return round(min((dist_to_walls(p, walls) for p in pts), default=1e9) / G, 3)


def poly_in(pt, poly):
    x, y = pt; inside = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: inside = not inside
    return inside


def region_len_sq(pts_poly, shape):
    """length (sq) of a polyline (list of (x,y)) inside a region shape from stations.json"""
    inside = 0.0
    for a, b in zip(pts_poly, pts_poly[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); k = max(1, int(L / 4))
        for i in range(k):
            m = (a[0] + (b[0] - a[0]) * (i + .5) / k, a[1] + (b[1] - a[1]) * (i + .5) / k)
            if in_shape(m, shape): inside += L / k
    return inside / G


def square_cost(hist, start_tl, shape):
    """the square rule core charges with (live round 4: it matched every one of S05.h's 63 history entries): 5 ft for each grid square
    entered (the square of the token's centre changes), doubled when the entered waypoint's centre lies inside the region.
    hist = [[x, y, cost, ...]] top-left positions, start_tl = the top-left before the move. Returns (expected ft, entries that differ)."""
    cell = lambda x, y: (math.floor((x + 50) / G), math.floor((y + 50) / G)); prev = cell(*start_tl); tot = 0; bad = []
    for i, e in enumerate(hist):
        c = cell(e[0], e[1]); exp = 0
        if c != prev: exp = 10 if in_shape((e[0] + 50, e[1] + 50), shape) else 5
        tot += exp
        if abs(exp - (e[2] or 0)) > 0.01: bad.append((i, exp, e[2]))
        prev = c
    return tot, bad


def in_shape(p, s):
    if s["type"] == "rectangle": return s["x"] <= p[0] <= s["x"] + s["width"] and s["y"] <= p[1] <= s["y"] + s["height"]
    if s["type"] == "polygon":
        pts = s["points"]; poly = list(zip(pts[0::2], pts[1::2])) if isinstance(pts[0], (int, float)) else [tuple(q) for q in pts]
        return poly_in(p, poly)
    return False


# ---- charges (fights)
def charge_of(o, n):
    """what the document charged the token for the last drag: sum of the per-entry costs, the ruler's cost of the same path, squares walked (Chebyshev)"""
    d = o.docs.get(n); h = d["hist"] if d else []
    if not h: return None
    sq = sum(max(abs(h[i][0] - h[i - 1][0]), abs(h[i][1] - h[i - 1][1])) / G for i in range(1, len(h)))
    return {"entries": len(h), "sum": round(sum(e[2] for e in h), 2), "last": h[-1][2], "squares": round(sq, 2), "euclid_sq": round(polyline_len([(e[0], e[1]) for e in h]) / G, 2)}


def gpu_only(t):
    from fw import Skip
    if t.path != "gpu": raise Skip("gpu path only")


# ---- z order (gpu): the leader drawn above the mates it passes
def order_series(o, name, page=None):
    """[(t_abs_ms, (elev, sort, zIndex))] from the page's draw-order log"""
    r = o.raw[page or o.drag_page]; names = [i["n"] for i in r["init"]]; i = names.index(name)
    ser = [(r["t0"], tuple(float(x) for x in r["init"][i]["o"]))]
    for t, idx, s in r["z"]:
        if idx == i: ser.append((r["t0"] + t, tuple(float(x) for x in s.split(","))))
    return ser


def order_at(ser, t):
    cur = ser[0][1]
    for ts, v in ser:
        if ts <= t: cur = v
        else: break
    return cur


def passes(o, leader, mates, min_depth=0.3, step_ms=25, page=None):
    """instants (epoch ms) at which the leader's DRAWN circle sinks >= min_depth sq into a mate's drawn circle: [(t, mate)]"""
    page = page or o.drag_page
    tr = o.tracks.get(page, {}); L = tr.get(leader)
    if L is None or len(L) < 2: return []
    out = []
    ts = np.arange(L[0, 0], L[-1, 0], step_ms)
    lx = np.interp(ts, L[:, 0], L[:, 1]); ly = np.interp(ts, L[:, 0], L[:, 2])
    for m in mates:
        M = tr.get(m)
        if M is None or len(M) < 1: continue
        mx = np.interp(ts, M[:, 0], M[:, 1]); my = np.interp(ts, M[:, 0], M[:, 2])   # one sample = a token that never moved: a constant
        d = (o.rad(leader) + o.rad(m) - np.hypot(lx - mx, ly - my)) / G
        for t in ts[d >= min_depth]: out.append((float(t), m))
    return out


def z_violations(o, leader, mates, page=None):
    """of the instants the leader overlaps a mate (drawn), the number where the leader is NOT drawn above that mate"""
    ps = passes(o, leader, mates, page=page)
    if not ps: return 0, 0
    sl = order_series(o, leader, page); bad = 0
    sm = {m: order_series(o, m, page) for m in mates}
    for t, m in ps:
        if not order_at(sl, t) > order_at(sm[m], t): bad += 1
    return bad, len(ps)


# guards for a pure plan-time gate: only module errors and the breaker count, the outcome is judged elsewhere
TIMING_G = dict(rest=False, walls=False, standing=False, account=False, notices_ok=(r".",))


def door_frame(o, names, centre, r=60, step_ms=20):
    """(most tokens whose DRAWN centre is within r px of the door centre at one instant, how many different tokens came that close)"""
    tr = o.tracks[o.drag_page]; arr = [tr[n] for n in names if n in tr and len(tr[n]) >= 2]
    if not arr: return 0, 0
    ts = np.arange(min(a[0, 0] for a in arr), max(a[-1, 0] for a in arr), step_ms); inside = np.zeros(len(ts)); passed = 0
    for a in arr:
        near = np.hypot(np.interp(ts, a[:, 0], a[:, 1]) - centre[0], np.interp(ts, a[:, 0], a[:, 2]) - centre[1]) <= r
        inside += near; passed += bool(near.any())
    return int(inside.max()), passed


# ---- a fight's charge against core's own measure (moved here from s17_l1 for S05.g/h, sign-off X4)
def core_measure(t, name, origin=None):
    """what core itself measures for the token's recorded movement history (Token#measureMovementPath over the history's
    top-left positions, as the token's own move is measured; live round 2: the centres passed as top-lefts measured a
    path shifted half a square, 25 ft where core charges 30) beside what the history was charged. `origin` is a centre."""
    r = t.rig.ev("gm", r"""const tk=canvas.scene.tokens.getName(%s); const h=tk.movementHistory??[]; const W=tk.width??1, H=tk.height??1; const w=h.map(e=>({x:e.x,y:e.y,elevation:e.elevation??0,width:W,height:H,action:e.action??tk.movementAction})); const og=%s; if (og && h.length && Math.hypot(og[0]-W*50-w[0].x, og[1]-H*50-w[0].y)>2) w.unshift({x:og[0]-W*50,y:og[1]-H*50,elevation:w[0].elevation,width:W,height:H,action:w[0].action});
let core=null; try{ core=tk.object.measureMovementPath(w).cost; }catch(e){ try{ core=tk.measureMovementPath(w).cost; }catch(e2){} }
return JSON.stringify({core, charged:h.reduce((s,e)=>s+(e.cost??0),0), n:h.length})""" % (json.dumps(name), json.dumps(list(origin) if origin else None)))
    return r
