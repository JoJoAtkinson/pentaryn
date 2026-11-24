"""S06 Passage shapes"""
from fw import check, pt, heroes
from ck import *
import re

S = "S06"; HS = heroes(S); L = "S06 Hero 1"
def arrive(sid, pname, title, **kw):
    @check(sid, S, title, path="state", kind="HARD", **kw)
    def f(t):
        o = t.drag(HS, L, pt(S, pname)); e = leader_err(o, L, pt(S, pname)); pts = path_points(o, L); w = [w_ for w_ in ST[S]["walls"]]
        return t.verdict(o, [("leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off; notices {o.notice_texts()[:2]}")], num=e, unit="sq")
    return f
arrive("S06.a", "dropScurve", "S-curve (1.0 wide): the pair goes through and arrives", expect010=True)
arrive("S06.b", "dropDiag", "diagonal slit 0.4 wide: passes", expect010=True)
arrive("S06.c", "dropFunnel", "funnel down to 0.3: passes", expect010=True)
arrive("S06.e", "dropHairpin", "hairpin whose lanes share squares: the long way round, no jumping the wall", expect010=True)
arrive("S06.f", "dropField", "a field of off-grid pillars: arrives")

@check("S06.d", S, "slit 0.2 wide: refused with a notice, nobody through", path="state", kind="HARD")
def d(t):
    o = t.drag(HS, L, pt(S, "dropSlit")); ns = o.notice_texts(); e = leader_err(o, L, pt(S, "dropSlit"))
    return t.verdict(o, [("a notice says it cannot", any(re.search(r"no route|can.?t|cannot|no way|narrow|fit", x, re.I) for x in ns), f"{ns[:3]}"), ("the leader is not at the drop", e > 1.0, f"{e:.2f} sq off")], guards=dict(account=False, notices_ok=(r".",)))

@check("S06.g", S, "hairpin: the route is the long way (at least twice the straight distance)", path="state", kind="HARD", expect010=True)
def g(t):
    o = t.drag(HS, L, pt(S, "dropHairpin")); r = route_dense(o, L); ln = polyline_len(r) / G; st_ = d_sq(o.c0(L), pt(S, "dropHairpin"))
    return t.verdict(o, [("walked >= 2x the straight distance", ln >= 2 * st_ and ln > 0, f"walked {ln:.1f} sq, straight {st_:.1f} sq")], num=ln, unit="sq")
