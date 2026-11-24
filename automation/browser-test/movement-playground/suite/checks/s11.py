"""S11 Mud"""
from fw import check, pt, heroes
from ck import *

S = "S11"; HS = heroes(S); L = "S11 Hero 1"; SH = ST[S]["regions"][0]["shape"]

@check("S11.a", S, "mud: the route takes the cheaper (dry) way round, the region is not crossed", path="state", kind="HARD", expect010=True)
def a(t):
    o = t.drag(HS, L, pt(S, "dropE")); e = leader_err(o, L, pt(S, "dropE")); ins = region_len_sq(route_dense(o, L), SH)
    return t.verdict(o, [("leader within 0.6 sq of the drop", e <= 0.6, f"{e:.2f} sq off"), ("route inside the mud <= 0.5 sq", ins <= 0.5, f"{ins:.2f} sq inside")], num=ins, unit="sq")

@check("S11.b", S, "mud, in a fight: the charge doubles only inside the region", path="state", kind="HARD")
def b(t):
    t.walk(HS, 60)
    from s05 import fight
    fight(t, HS, L); o = t.drag([L], L, pt(S, "dropE")); c = charge_of(o, L)
    if not c: return t.verdict(o, [("a charge is recorded", False, "no history")], guards=dict(account=False, notices_ok=(r".",)))
    pts = [(e[0], e[1]) for e in o.docs[L]["hist"]]; inside = region_len_sq(pts, SH); total = polyline_len(pts) / G; exp = 5 * (total + inside)
    return t.verdict(o, [("charge = 5 ft x (walked + inside the region)", abs(c["sum"] - exp) <= 0.04 * exp + 1.5, f"charged {c['sum']}, expected {exp:.1f} ({total:.1f} sq walked, {inside:.1f} inside)")], num=c["sum"] - exp, unit="ft", guards=dict(account=False, notices_ok=(r".",)))
