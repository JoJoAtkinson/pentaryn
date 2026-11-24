"""Obs: one recorded action on one or more pages, and the analysis the checks use. Pure data in, numbers out.
Lengths are px unless a name says sq (squares of 100 px). Centres, not top-left, unless a name says tl."""
import math, re, json
import numpy as np

G = 100
TOL_STAND = 0.10      # sq: a mover's circle may not sink deeper than this into a standing token (HARD)
TOL_REST = 0.05       # sq: two tokens at rest may not overlap deeper than this (HARD)
EPS = 1e-6


def _r(v, n=2): return None if v is None else round(v, n)


def seg_cross(p0, p1, q0, q1):
    """proper crossing of segment p0p1 with q0q1 (touching an end does not count)"""
    d1 = (p1[0] - p0[0], p1[1] - p0[1]); d2 = (q1[0] - q0[0], q1[1] - q0[1])
    den = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(den) < EPS: return False
    s = ((q0[0] - p0[0]) * d2[1] - (q0[1] - p0[1]) * d2[0]) / den
    u = ((q0[0] - p0[0]) * d1[1] - (q0[1] - p0[1]) * d1[0]) / den
    return 1e-4 < s < 1 - 1e-4 and 1e-4 < u < 1 - 1e-4


def side(q0, q1, p):  # sign of (q1-q0) x (p-q0): <0 is the "left" (screen) side the module's dir=1 blocks from
    return (q1[0] - q0[0]) * (p[1] - q0[1]) - (q1[1] - q0[1]) * (p[0] - q0[0])


def seg_pt_dist(a, b, p):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def polyline_len(pts): return sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))


class Obs:
    def __init__(self, path, raw, snap, meta, walls0=None):
        self.path = path; self.raw = raw; self.snap = snap; self.meta = meta or {}; self.walls0 = walls0 or []
        self.key = self.meta.get("key", "gm"); self.drag_page = self.meta.get("key", "gm")
        gm = raw["gm"] if "gm" in raw else next(iter(raw.values()))
        self.t0 = gm["t0"]
        self.init = {i["n"]: i for i in gm["init"]}
        self.docs = {t["n"]: t for t in snap[self.drag_page if self.drag_page in snap else "gm"]["docs"]["toks"]}
        self.status = {k: v["status"] for k, v in snap.items()}
        self.fps = {k: v.get("fps") for k, v in raw.items()}
        ups = [p["t"] for p in raw.get(self.drag_page, {}).get("ptr", []) if p["ty"] == "up" and p.get("b", 0) == 0]
        self.dropT = max(ups) if ups else self.meta.get("upAt")  # the page's own clock, same as the tracks
        # drawn tracks per page: name -> np array [t_abs, cx, cy]
        self.tracks = {}
        for k, r in raw.items():
            names = [i["n"] for i in r["init"]]; w = {i["n"]: i["w"] for i in r["init"]}
            tr = {n: [[r["t0"], r["init"][i]["dx"] + w[n] * 50, r["init"][i]["dy"] + r["init"][i]["h"] * 50]] for i, n in enumerate(names)}
            for t, idx, x, y in r["fr"]:
                n = names[idx] if idx < len(names) else None
                if n is None: continue
                tr[n].append([r["t0"] + t, x + w[n] * 50, y + r["init"][idx]["h"] * 50])
            self.tracks[k] = {n: np.array(v, dtype=float) for n, v in tr.items()}
        self.ev = sorted(gm["ev"], key=lambda e: e["t"])
        self.notes = [dict(n, page=k) for k, r in raw.items() for n in r["notes"]]
        self.errs = [dict(e, page=k) for k, r in raw.items() for e in r["errs"]]

    # ---- geometry basics
    def size(self, n): d = self.docs.get(n) or self.init.get(n); return d["w"] if "w" in d else 1
    def rad(self, n): return self.size(n) * G / 2
    def c0(self, n): i = self.init[n]; return (i["x"] + i["w"] * 50, i["y"] + i["h"] * 50)
    def c1(self, n): d = self.docs[n]; return (d["x"] + d["w"] * 50, d["y"] + d["h"] * 50)
    def moved_doc(self, n): return math.hypot(*(np.array(self.c1(n)) - np.array(self.c0(n)))) > 1
    def depth_sq(self, a, b, pa=None, pb=None):
        pa = pa or self.c1(a); pb = pb or self.c1(b)
        return (self.rad(a) + self.rad(b) - math.hypot(pa[0] - pb[0], pa[1] - pb[1])) / G
    def dist_sq(self, a, b): return math.hypot(*(np.array(self.c1(a)) - np.array(self.c1(b)))) / G

    # ---- routes: every move event's polyline as centres; per token, in time order
    def routes(self, name):
        out = []
        for e in self.ev:
            if e["k"] != "tok" or e["n"] != name or "sx" not in e: continue
            w = self.size(name) * 50
            pts = [(p[0] + w, p[1] + w) for p in e.get("wps", [])]
            if len(pts) < 2: pts = None
            out.append({"t": e["t"], "pts": pts, "dest": (e["sx"] + w, e["sy"] + w), "method": e.get("method"), "teleport": e.get("teleport"), "cost": e.get("cost")})
        return out

    def route_points(self, name):
        """centre polyline of everything the token travelled (for wall and token checks), straight chords where an event carries no route"""
        last = self.c0(name); poly = []
        for r in self.routes(name):
            if r["teleport"]: last = r["dest"]; continue
            pts = r["pts"] or [last, r["dest"]]
            poly.append(pts); last = r["dest"]
        return poly

    def first_move(self, name, page=None):
        """epoch ms of the first drawn change of the token on `page` (default: the dragging page); None if it never moved"""
        page = page or self.drag_page
        tr = self.tracks.get(page, {}).get(name)
        if tr is None or len(tr) < 2: return None
        p0 = tr[0, 1:]; d = np.hypot(tr[1:, 1] - p0[0], tr[1:, 2] - p0[1])
        k = np.argmax(d > 2) if (d > 2).any() else None
        return None if k is None else tr[1 + k, 0]

    def first_event(self, name):
        for e in self.ev:
            if e["k"] == "tok" and e["n"] == name and "sx" in e and not e.get("teleport"): return e["t"]
        return None

    def first_action(self, name):
        c = [t for t in (self.first_move(name), self.first_event(name)) if t is not None]
        return min(c) if c else None

    def last_move(self, name, page=None):
        page = page or self.drag_page
        tr = self.tracks.get(page, {}).get(name)
        return None if tr is None or len(tr) < 2 else tr[-1, 0]

    # ---- the drawn path (gpu: dense); state path only gets 3 fps so wall tests use the routes there
    def drawn_dense(self): return (self.fps.get(self.drag_page) or 0) >= 20

    # ---- walls over time
    def wall_state(self):
        ws = {w["id"]: dict(w) for w in self.walls0}
        return ws

    def walls_blocking(self, ws, t):
        """walls at epoch ms t (after applying wall events up to t) that block movement: [(id, a, b, dir)]"""
        state = {w["id"]: (w["ds"], w["door"], w["move"], w["c"], w["dir"]) for w in ws.values()}
        for e in self.ev:
            if e["t"] > t: break
            if e["k"] == "wall" and e["id"] in state and "ds" in e["ch"]:
                s = state[e["id"]]; state[e["id"]] = (e["ch"]["ds"], s[1], s[2], s[3], s[4])
            elif e["k"] == "wall" and e["id"] in state and "dir" in e["ch"]:
                s = state[e["id"]]; state[e["id"]] = (s[0], s[1], s[2], s[3], e["ch"]["dir"])
        out = []
        for i, (ds, door, move, c, d) in state.items():
            if not move: continue
            if door and ds == 1: continue
            out.append((i, (c[0], c[1]), (c[2], c[3]), d))
        return out

    def wall_hits(self, tol_end=0.0):
        """every crossing of a blocking wall by a token's centre path: [{token, wall, t, at, src}]"""
        ws = self.wall_state(); hits = []
        # event times matter only if a wall changed; one blocking set per distinct time bucket
        changes = [e["t"] for e in self.ev if e["k"] in ("wall", "wallc", "walld")]
        static = None if changes else self.walls_blocking(ws, 0)
        names = [n for n in self.init]
        for n in names:
            # route polylines (always) and drawn segments (gpu)
            segs = []
            last = self.c0(n)
            for r in self.routes(n):
                if r["teleport"]: last = r["dest"]; continue
                pts = r["pts"] or [last, r["dest"]]
                for a, b in zip(pts, pts[1:]): segs.append((r["t"], a, b, "route"))
                last = r["dest"]
            if self.drawn_dense():
                tr = self.tracks[self.drag_page].get(n)
                if tr is not None and len(tr) > 1:
                    # skip jumps (teleports/resets): a single frame step over 3 squares is not a walk
                    for i in range(1, len(tr)):
                        a, b = tr[i - 1, 1:], tr[i, 1:]
                        if math.hypot(*(b - a)) > 3 * G: continue
                        segs.append((tr[i, 0], tuple(a), tuple(b), "drawn"))
            for t, a, b, src in segs:
                blk = static if static is not None else self.walls_blocking(ws, t)
                for wid, p, q, d in blk:
                    if seg_cross(a, b, p, q):
                        if d:  # one-way: dir 1 blocks crossings starting on the "left" (side<0), dir 2 from the other
                            s0 = side(p, q, a)
                            if (d == 1 and s0 > 0) or (d == 2 and s0 < 0): continue
                        hits.append({"token": n, "wall": wid, "t": t, "at": (round(a[0]), round(a[1])), "src": src})
        # one hit per (token, wall)
        seen = set(); out = []
        for h in hits:
            k = (h["token"], h["wall"])
            if k in seen: continue
            seen.add(k); out.append(h)
        return out

    # ---- tokens
    def movers(self): return [n for n in self.init if self.moved_doc(n) or any(e["k"] == "tok" and e["n"] == n and "sx" in e for e in self.ev)]
    def standing(self, group):
        moved = {e["n"] for e in self.ev if e["k"] == "tok" and e["n"] and "sx" in e and not e.get("teleport")}
        return [n for n in self.init if n not in group and n not in moved and not self.init[n]["hidden"] and n in self.docs]

    def standing_hits(self, group):
        """a moving token's circle sunk into a standing token (outside the group) deeper than TOL_STAND: [{mover, standing, depth_sq}]"""
        stand = self.standing(group); out = {}
        for n in group:
            if n not in self.init: continue
            pts = []
            for poly in self.route_points(n):
                for a, b in zip(poly, poly[1:]):
                    L = math.hypot(b[0] - a[0], b[1] - a[1]); k = max(1, int(L / 8))
                    pts += [(a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k) for i in range(k + 1)]
            if self.drawn_dense():
                tr = self.tracks[self.drag_page].get(n)
                if tr is not None and len(tr) > 1:
                    for i in range(1, len(tr)):
                        a, b = tr[i - 1, 1:], tr[i, 1:]; L = math.hypot(*(b - a))
                        if L > 3 * G: continue
                        k = max(1, int(L / 8)); pts += [(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k) for j in range(k + 1)]
            if not pts: continue
            P = np.array(pts)
            for s in stand:
                if math.hypot(*(np.array(self.c0(n)) - np.array(self.c0(s)))) < (self.rad(n) + self.rad(s)) - 5: continue  # started stacked
                cs = np.array(self.c0(s)); d = np.hypot(P[:, 0] - cs[0], P[:, 1] - cs[1]); depth = (self.rad(n) + self.rad(s) - d.min()) / G
                if depth > TOL_STAND:
                    k = (n, s); out[k] = max(out.get(k, 0), depth)
        return [{"mover": a, "standing": b, "depth_sq": round(v, 2)} for (a, b), v in out.items()]

    def rest_overlaps(self):
        names = [n for n in self.docs if not self.docs[n]["hidden"]]; out = []
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                a, b = names[i], names[j]
                if a not in self.init or b not in self.init: continue
                if self.depth_sq(a, b, self.c0(a), self.c0(b)) > TOL_REST: continue  # stacked at the start (mount and rider, grapple)
                d = self.depth_sq(a, b)
                if d > TOL_REST: out.append({"a": a, "b": b, "depth_sq": round(d, 2)})
        return out

    def mover_overlap(self, names, step_ms=40):
        """REPORTED: deepest overlap (sq, circle metric) of two tokens that are BOTH drawn moving, and the longest time any pair stayed over 0.1 sq; drawn tracks of the dragging page"""
        trs = {n: self.tracks[self.drag_page].get(n) for n in names if n in self.tracks[self.drag_page]}
        trs = {n: t for n, t in trs.items() if t is not None and len(t) > 1}
        if len(trs) < 2: return {"max_sq": 0, "pair": None, "longest_ms": 0}
        t0 = min(t[1, 0] for t in trs.values()); t1 = max(t[-1, 0] for t in trs.values())
        ts = np.arange(t0, t1, step_ms)
        pos = {n: np.stack([np.interp(ts, t[:, 0], t[:, 1]), np.interp(ts, t[:, 0], t[:, 2])], 1) for n, t in trs.items()}
        mov = {n: np.hypot(np.gradient(p[:, 0]), np.gradient(p[:, 1])) > 0.5 for n, p in pos.items()}
        worst = (0, None); longest = 0; nl = list(pos)
        for i in range(len(nl)):
            for j in range(i + 1, len(nl)):
                a, b = nl[i], nl[j]
                both = mov[a] & mov[b]
                if not both.any(): continue
                d = np.hypot(pos[a][:, 0] - pos[b][:, 0], pos[a][:, 1] - pos[b][:, 1]); depth = (self.rad(a) + self.rad(b) - d) / G
                depth = np.where(both, depth, 0)
                m = float(depth.max())
                if m > worst[0]: worst = (m, f"{a}/{b}")
                over = depth > 0.1; run = 0
                for v in over:
                    run = run + step_ms if v else 0; longest = max(longest, run)
        return {"max_sq": round(worst[0], 2), "pair": worst[1], "longest_ms": longest}

    # ---- notices
    def notices(self):
        """the module's notices for a move (info/warning/error toasts and GM whispers), de-duplicated by text"""
        seen = []; out = []
        for n in self.notes:
            k = (n["type"], n["text"])
            if k in seen: continue
            seen.append(k); out.append(n)
        return out

    def notice_texts(self): return [n["text"] for n in self.notices()]
    def named(self, name): return any(name in n["text"] for n in self.notices())

    def module_errors(self): return [e for e in self.errs if e.get("mod")]
    def tripped(self): return {k: s.get("tripped") for k, s in self.status.items() if s.get("tripped")} or ({k: "assist off" for k, s in self.status.items() if s.get("assist") is False})

    # ---- the module's own account (read defensively: 0.9.0 lacks the 0.10 fields)
    def last(self, page=None):
        s = self.status.get(page or self.drag_page) or {}
        return s.get("last") or {}

    def last_get(self, *path, default=None, page=None):
        v = self.last(page)
        for p in path:
            if not isinstance(v, dict) or p not in v: return default
            v = v[p]
        return v

    def plan_ms(self, page=None):
        l = self.last(page)
        for p in (("plan", "timingMs"), ("plan", "ms"), ("ms",)):
            v = l
            for k in p:
                v = v.get(k) if isinstance(v, dict) else None
            if v is not None: return v
        return None

    # ---- shapes of the finished group
    def leader_dir(self, leader):
        """unit vector of the leader's last step: from the point one square back along its route to where it ended"""
        poly = self.route_points(leader)
        pts = poly[-1] if poly else None
        if not pts or len(pts) < 2:
            a = np.array(self.c0(leader)); b = np.array(self.c1(leader)); v = b - a; n = np.hypot(*v)
            return None if n < 1 else tuple(v / n)
        end = np.array(pts[-1]); back = G; acc = 0; prev = end
        for p in reversed(pts[:-1]):
            p = np.array(p); seg = math.hypot(*(prev - p))
            if acc + seg >= back:
                f = (back - acc) / seg; q = prev + (p - prev) * f; v = end - q; return tuple(v / math.hypot(*v))
            acc += seg; prev = p
        v = end - prev; n = math.hypot(*v)
        return None if n < 1 else tuple(v / n)

    def behind(self, leader, others, D=None):
        """for each other member: along (sq, negative = behind the leader relative to its last step) and lateral (sq)"""
        D = D or self.leader_dir(leader)
        if D is None: return None
        L = np.array(self.c1(leader)); out = {}
        for n in others:
            v = (np.array(self.c1(n)) - L) / G
            out[n] = {"along": float(v @ np.array(D)), "lat": float(abs(v[0] * D[1] - v[1] * D[0])), "dist": float(math.hypot(*v))}
        return out

    def gap_sq(self, a, b):
        """Chebyshev gap between two tokens' squares at rest (0 = touching, corner touching counts)"""
        A = self.docs[a]; B = self.docs[b]
        gx = max(A["x"] - (B["x"] + B["w"] * G), B["x"] - (A["x"] + A["w"] * G), 0) / G
        gy = max(A["y"] - (B["y"] + B["h"] * G), B["y"] - (A["y"] + A["h"] * G), 0) / G
        return max(gx, gy)

    # ---- fights
    def charges(self, names):
        """per token: movement history from the document: walked squares (Chebyshev between entries), charge (ft) as the history holds it"""
        out = {}
        for n in names:
            d = self.docs.get(n)
            if not d: continue
            h = d["hist"]
            if not h: out[n] = {"entries": 0, "cost": 0, "squares": 0}; continue
            sq = sum(max(abs(h[i][0] - h[i - 1][0]), abs(h[i][1] - h[i - 1][1])) / G for i in range(1, len(h)))
            out[n] = {"entries": len(h), "cost": round(h[-1][2], 2), "squares": round(sq, 2), "path": [[round(p[0] / G, 2), round(p[1] / G, 2), p[2]] for p in h]}
        return out
