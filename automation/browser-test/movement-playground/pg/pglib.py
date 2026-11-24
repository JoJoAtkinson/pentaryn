"""pglib.py - small DSL for building ZZ Playground stations (squares in, pixels out).

A station is a 24x24 square area (local x 0..24, y 0..24); the top 2 rows are the label band.
Floors are integer cells with a LABEL; a wall is made wherever two cells have different labels (or a
label meets void), except where the edge is opened or overridden by an explicit wall/door.
Chasm cells ('C') make move-only walls against floors. Off-grid shapes (curves, slits, pillars) are
explicit polylines.
"""
import math

SQ = 100          # px per square
CELL = 25         # squares per station cell
COLS = ROWS = 4

FLOOR = "#fbf4dc"
BACKDROP = "#e3e7ee"
WALLC = "#1d1f27"
DOOR_CLOSED = "#a35a12"
DOOR_OPEN = "#2f8f4e"
DOOR_LOCKED = "#b3261e"
ONEWAY = "#a0239b"
MOVEONLY = "#3b5bdb"
CHASM = "#2d3350"
BRIDGE = "#a7864f"
TEXTC = "#14161c"


def px(v):
    return int(round(v * SQ))


class Station:
    def __init__(s, sid, name, c, r, instruction):
        s.id, s.name, s.instruction = sid, name, instruction
        s.c, s.r = c, r
        s.ox, s.oy = c * CELL, r * CELL            # squares, absolute
        s.cells = {}                               # (x,y) -> label
        s.chasm = set()
        s.opens = set()                            # unit edges ('h'|'v', x, y) to leave open
        s.explicit = []                            # wall dicts, local squares
        s.floor_extra = []                         # {'pts':[...], 'fill':...} local squares
        s.floor_fill = {}                          # label -> colour
        s.tokens = []
        s.regions = []
        s.scenarios = {"default": {"note": "the start layout", "tokens": {}, "doors": {}}}
        s.points = {}
        s.measure = {}
        s.notes = []
        s.arrows = []                              # [(x,y,angleDeg)] local squares
        s.marks = []                               # [(x,y,text,size)]
        s._kc = {}
        s.paints = []                              # (x0,y0,x1,y1,fill) cell rects painted over floors

    # ---------- floors ----------
    def rect(s, x0, y0, x1, y1, label="f", fill=None):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                s.cells[(x, y)] = label
        if fill:
            s.floor_fill[label] = fill

    def paint(s, x0, y0, x1, y1, fill):
        s.paints.append((x0, y0, x1, y1, fill))

    def hole(s, x, y):
        s.cells.pop((x, y), None)

    def chasm_rect(s, x0, y0, x1, y1):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                s.chasm.add((x, y))

    def opening(s, x0, y0, x1, y1):
        """Leave the edge (x0,y0)-(x1,y1) open (axis aligned, integer squares)."""
        for e in edges_of(x0, y0, x1, y1):
            s.opens.add(e)

    # ---------- explicit walls ----------
    def wall(s, x0, y0, x1, y1, **flags):
        w = {"c": [x0, y0, x1, y1]}
        w.update(flags)
        s.explicit.append(w)
        return w

    def door(s, x0, y0, x1, y1, ds=0, kind=1, key=None, only=None):
        return s.wall(x0, y0, x1, y1, door=kind, ds=ds, key=key, only=only)

    def poly(s, pts, closed=False, grp=None, **flags):
        n = len(pts)
        for i in range(n - 1 + (1 if closed else 0)):
            a, b = pts[i], pts[(i + 1) % n]
            if abs(a[0] - b[0]) < 1e-9 and abs(a[1] - b[1]) < 1e-9:
                continue
            s.wall(a[0], a[1], b[0], b[1], grp=grp, **flags)

    def rect_walls(s, x0, y0, x1, y1, gaps=(), **flags):
        """Axis-aligned rectangle outline as explicit walls, with gaps: [(side, a, b)], side in N,S,W,E."""
        sides = {"N": (x0, y0, x1, y0), "S": (x0, y1, x1, y1), "W": (x0, y0, x0, y1), "E": (x1, y0, x1, y1)}
        for sd, (ax, ay, bx, by) in sides.items():
            horiz = sd in "NS"
            lo, hi = (ax, bx) if horiz else (ay, by)
            cuts = sorted([(g[1], g[2]) for g in gaps if g[0] == sd])
            cur = lo
            for a, b in cuts:
                if a > cur:
                    s._seg(horiz, ax, ay, cur, a, **flags)
                cur = b
            if cur < hi:
                s._seg(horiz, ax, ay, cur, hi, **flags)

    def _seg(s, horiz, ax, ay, a, b, **flags):
        if horiz:
            s.wall(a, ay, b, ay, **flags)
        else:
            s.wall(ax, a, ax, b, **flags)

    def corridor(s, pts, grp, **flags):
        """pts [(x,y,w)] centre-line with widths; walls both sides; returns (left, right) point lists."""
        L, R = offset_lines(pts)
        s.poly(L, grp=grp + ".L", **flags)
        s.poly(R, grp=grp + ".R", **flags)
        return L, R

    def floor_poly(s, pts, fill=FLOOR):
        s.floor_extra.append({"pts": [list(p) for p in pts], "fill": fill})

    # ---------- tokens ----------
    def token(s, name, actor, x, y, w=1, h=None, owner=None, disp=0, hidden=False, hero=False, linked=False,
              only=None, role=None):
        s.tokens.append({"name": name, "actor": actor, "x": x, "y": y, "w": w, "h": h if h is not None else w,
                         "owner": owner, "disposition": disp, "hidden": hidden, "hero": hero, "linked": linked,
                         "only": only, "role": role})

    def scenario(s, name, note, tokens=None, doors=None, combat=None):
        sc = {"note": note, "tokens": tokens or {}, "doors": doors or {}}
        if combat:
            sc["combat"] = combat
        s.scenarios[name] = sc
        return sc

    def point(s, name, cx, cy, note=""):
        """A named spot, centre in local squares."""
        s.points[name] = {"c": [cx, cy], "note": note}


def edges_of(x0, y0, x1, y1):
    out = []
    if x0 == x1:
        for y in range(int(min(y0, y1)), int(max(y0, y1))):
            out.append(("v", int(x0), y))
    elif y0 == y1:
        for x in range(int(min(x0, x1)), int(max(x0, x1))):
            out.append(("h", x, int(y0)))
    return out


def offset_lines(pts):
    n = len(pts)

    def sdir(i, j):
        dx, dy = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
        l = math.hypot(dx, dy)
        return (dx / l, dy / l) if l > 1e-9 else None

    L, R = [], []
    for i in range(n):
        dp = dn = None
        for j in range(i - 1, -1, -1):
            dp = sdir(j, i)
            if dp:
                break
        for j in range(i + 1, n):
            dn = sdir(i, j)
            if dn:
                break
        ds = [d for d in (dp, dn) if d]
        nx = sum(-d[1] for d in ds) / len(ds)
        ny = sum(d[0] for d in ds) / len(ds)
        m2 = max(nx * nx + ny * ny, 0.36)
        hw = pts[i][2] / 2
        ox, oy = nx / m2 * hw, ny / m2 * hw
        L.append((pts[i][0] + ox, pts[i][1] + oy))
        R.append((pts[i][0] - ox, pts[i][1] - oy))
    return L, R


# ------------------------------------------------------------------ wall generation
def build_walls(s):
    """Auto walls from cells + explicit walls -> list of wall dicts in LOCAL squares (floats)."""
    cells, opens = s.cells, s.opens
    chasm = set(s.chasm) - set(cells)
    # edges overridden by explicit axis-aligned integer walls
    covered = set()
    for w in s.explicit:
        x0, y0, x1, y1 = w["c"]
        if all(abs(v - round(v)) < 1e-9 for v in (x0, y0, x1, y1)) and (x0 == x1 or y0 == y1):
            for e in edges_of(round(x0), round(y0), round(x1), round(y1)):
                covered.add(e)
    H, V, MH, MV = [], [], [], []
    seen = set()
    for (x, y) in list(cells) + list(chasm):
        for e, a_pos, b_pos in (("h", (x, y - 1), (x, y)), ("h", (x, y), (x, y + 1)),
                                ("v", (x - 1, y), (x, y)), ("v", (x, y), (x + 1, y))):
            if e == "h":
                ek = ("h", b_pos[0], b_pos[1])
            else:
                ek = ("v", b_pos[0], b_pos[1])
            if ek in seen:
                continue
            seen.add(ek)
            if ek in opens or ek in covered:
                continue
            la = cells.get(a_pos)
            lb = cells.get(b_pos)
            ca, cb = a_pos in chasm, b_pos in chasm
            if (la is None and not ca and lb is None and not cb):
                continue
            if ca or cb:
                if (ca and lb is not None) or (cb and la is not None):
                    (MH if e == "h" else MV).append(ek)
                continue
            if la == lb:
                continue
            (H if e == "h" else V).append(ek)

    def merge_h(edges):
        es = sorted(edges, key=lambda e: (e[2], e[1]))
        out = []
        for _, x, y in es:
            if out and out[-1][1] == y and out[-1][2] == x:
                out[-1][2] = x + 1
            else:
                out.append([x, y, x + 1, y])
        return out

    def merge_v(edges):
        es = sorted(edges, key=lambda e: (e[1], e[2]))
        out = []
        for _, x, y in es:
            if out and out[-1][0] == x and out[-1][3] == y:
                out[-1][3] = y + 1
            else:
                out.append([x, y, x, y + 1])
        return out

    walls = []
    for c in merge_h(H) + merge_v(V):
        walls.append({"c": c})
    for c in merge_h(MH) + merge_v(MV):
        walls.append({"c": c, "move": 20, "sight": 0, "light": 0, "sound": 0, "moveonly": True})
    for w in s.explicit:
        walls.append(dict(w))
    return walls
