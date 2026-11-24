"""reach.py: is a drop point reachable by a thin (centre-only) token, from the station's own walls? Cross-checks the checks against the map (not the module)."""
import sys, heapq, math; sys.path[:0] = ['lib']
from h import ST
def seg_cross(p0, p1, q0, q1):
    """closed test: touching a wall (also at its end) counts, so joints do not leak"""
    d1 = (p1[0] - p0[0], p1[1] - p0[1]); d2 = (q1[0] - q0[0], q1[1] - q0[1]); den = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(den) < 1e-9:
        return False
    s = ((q0[0] - p0[0]) * d2[1] - (q0[1] - p0[1]) * d2[0]) / den; u = ((q0[0] - p0[0]) * d1[1] - (q0[1] - p0[1]) * d1[0]) / den
    return -1e-6 <= s <= 1 + 1e-6 and -1e-6 <= u <= 1 + 1e-6
def reach(st, a, b, scenario=None, step=25, doors_open=None):
    s = ST[st]; W = []
    for w in s['walls']:
        if w.get('only') and scenario not in w['only']: continue
        if w.get('move', 20) == 0: continue
        if w.get('door'):
            ds = (s['scenarios'].get(scenario or 'default', {}).get('doors') or {}).get(w.get('key'), w.get('ds', 0))
            if doors_open is not None and w.get('key') in doors_open: ds = 1
            if ds == 1: continue
        W.append(tuple(w['c']))
    x0, y0, x1, y1 = s['area']
    nd = lambda p: (round((p[0] - x0) / step), round((p[1] - y0) / step)); ps = lambda n: (x0 + n[0] * step, y0 + n[1] * step)
    free = lambda p, q: not any(seg_cross(p, q, (w[0], w[1]), (w[2], w[3])) for w in W)
    dist = {nd(a): 0}; pq = [(0, nd(a))]
    while pq:
        d, n = heapq.heappop(pq)
        if d > dist[n]: continue
        if n == nd(b): return round(d / 100, 1)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if not (dx or dy): continue
                m = (n[0] + dx, n[1] + dy); q = ps(m)
                if not (x0 <= q[0] <= x1 and y0 <= q[1] <= y1) or not free(ps(n), q): continue
                c = d + math.hypot(q[0] - ps(n)[0], q[1] - ps(n)[1])
                if c < dist.get(m, 1e18): dist[m] = c; heapq.heappush(pq, (c, m))
    return None
if __name__ == "__main__":
    tests = [("S15", "default", "S15 Villager 1", "dropBeyond"), ("S06", "default", "S06 Hero 1", "dropScurve"), ("S06", "default", "S06 Hero 1", "dropHairpin"), ("S06", "default", "S06 Hero 1", "dropDiag"), ("S06", "default", "S06 Hero 1", "dropFunnel"),
             ("S06", "default", "S06 Hero 1", "dropSlit"), ("S06", "default", "S06 Hero 1", "dropField"), ("S12", "default", "S12 Hero 1", "dropE"), ("S12", "default", "S12 Hero 3", "dropW"), ("S13", "default", "S13 Large", "dropE"),
             ("S13", "noround", "S13 Large", "dropE"), ("S07", "default", "S07 Hero 1", "dropVault"), ("S09", "default", "S09 Hero 1", "dropPocket"), ("S09", "default", "S09 Hero 1", "dropBehind"), ("S10", "default", "S10 Hero 1", "dropE"),
             ("S02", "default", "S02 Monster 1", "dropPen"), ("S08", "default", "S08 Hero 1", "dropU"), ("S05", "default", "S05 Hero 1", "dropB"), ("S05", "long", "S05 Hero 1", "dropB"), ("S04", "front", "S04 Monster 1", "dropW")]
    for st, scn, tok, pt in tests:
        s = ST[st]; t = [x for x in s['tokens'] if x['name'] == tok][0]; a = (t['x'] + t['w'] * 50, t['y'] + t['h'] * 50)
        step = 10 if st == 'S05' else 25
        print(f"{st} {scn:8s} {tok:16s} -> {pt:12s} thin-path length: {reach(st, a, tuple(s['points'][pt]['c']), scn, step=step)} sq")
