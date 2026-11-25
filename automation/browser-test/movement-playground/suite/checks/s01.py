"""S01 Open field - MARCH"""
from fw import check, pt, heroes, tok_names
from ck import *
import numpy as np, json

S = "S01"; HS = heroes(S); L = "S01 Hero 1"; REST = [h for h in HS if h != L]

def far(t): return t.shared("s01far", lambda: t.drag(HS, L, pt(S, "dropFar")))

@check("S01.a", S, "march: the leader ends on the drop square (8 heroes, 15 squares)", path="state", kind="HARD", share="s01far")
def a(t):
    o = far(t); e = leader_err(o, L, pt(S, "dropFar"))
    return t.verdict(o, [("leader within 0.5 sq of the drop centre", e <= 0.5, f"{e:.2f} sq off")], num=e, unit="sq")

@check("S01.b", S, "march: nobody beside or ahead of the leader (all behind its last step)", path="state", kind="HARD", expect010=True, share="s01far")
def b(t):
    o = far(t); bh, mx, md = pack(o, L, REST)
    bad = {n: round(v["along"], 2) for n, v in (bh or {}).items() if v["along"] > -0.45}
    return t.verdict(o, [("every member behind the leader (along <= -0.45 sq)", bh is not None and not bad, f"not behind: {bad}" if bad else ""), ], num=mx, unit="sq")

@check("S01.c", S, "march: the pack is balled up behind the leader (all within 3.2 sq)", path="state", kind="HARD", expect010=True, share="s01far")
def c(t):
    o = far(t); bh, mx, md = pack(o, L, REST)
    far_ = {n: round(v["dist"], 2) for n, v in (bh or {}).items() if v["dist"] > 3.2}
    return t.verdict(o, [("all members within 3.2 sq of the leader", bh is not None and not far_, f"too far: {far_}" if far_ else "")], num=md, unit="sq")

@check("S01.d", S, "march: the plan takes under 100 ms (8 members)", path="both", kind="GATED", timing=True, expect010=True)
def d(t):
    o = t.drag(HS, L, pt(S, "dropFar")); p = plan_ms(o)
    w = drop_to_first_write(o)
    return t.verdict(o, [("plan reported", p is not None, "no plan time in status"), ("plan under 100 ms", p is not None and p < 100, f"{p} ms (drop to first write {w and round(w)} ms)")], num=p, unit="ms", guards=TIMING_G)

@check("S01.e", S, "march: the pack's first frame comes 100-400 ms after the leader's", path="gpu", kind="GATED", timing=True, expect010=True)
def e(t):
    o = t.drag(HS, L, pt(S, "dropFar")); dl = first_move_delay(o, L, REST) or {}
    m = float(np.median(list(dl.values()))) if dl else None
    # R5: the pack goes one wave after the leader, or, when the leader starts behind, once it is that far past the
    # frontmost member (4 s at most). In S01's layout the leader (x 2.5) starts behind Hero 3/5/7 (x 4.5-6.5) on its
    # way east: then the bound is the leader's own walk past the frontmost member, plus one wave and slack.
    D = np.array(pt(S, "dropFar"), dtype=float) - np.array(o.c0(L), dtype=float); D = D / (np.linalg.norm(D) or 1)
    ahead = max([float((np.array(o.c0(n)) - np.array(o.c0(L))) @ D) / 100 for n in REST] + [0])
    if ahead > 0.5:
        hi = min(4000, 400 + 1000 * (ahead + 1) / 6)    # the walk runs about 6 squares a second
        cond = ("leader starts %.1f sq behind the frontmost: pack start after the leader's, by %d ms at most" % (ahead, hi), m is not None and 100 <= m <= hi, f"{m}")
    else:
        cond = ("median pack start 100-400 ms after the leader", m is not None and 100 <= m <= 400, f"{m}")
    return t.verdict(o, [("pack frames seen", m is not None, "no drawn frames"), cond], num=m, unit="ms", guards=TIMING_G)

@check("S01.f", S, "march: shape reported as march with this leader and no target", path="state", kind="HARD", expect010=True, share="s01far")
def f(t):
    o = far(t); s = shape_info(o); lid = o.docs[L]["id"]
    return t.verdict(o, [("last.shape == march", s["shape"] == "march", f"shape={s['shape']} mode={s['mode']}"), ("last.leader is the grabbed token", s["leader"] in (lid, L), f"{s['leader']}"), ("last.target is null", s["target"] in (None,), f"{s['target']}"),
                         ("plan.members counts 8 (plan.total is the last start, ms: README)", (s["plan"] or {}).get("members") == 8, f"{s['plan']}")])

@check("S01.g", S, "march drop round the pillar: leader on the square, the pack behind its LAST step", path="state", kind="HARD", expect010=True)
def g(t):
    o = t.drag(HS, L, pt(S, "dropRound")); e = leader_err(o, L, pt(S, "dropRound")); bh, mx, md = pack(o, L, REST)
    bad = {n: round(v["along"], 2) for n, v in (bh or {}).items() if v["along"] > -0.45}
    return t.verdict(o, [("leader within 0.5 sq of the drop", e <= 0.5, f"{e:.2f} off"), ("every member behind the last step of the leader", bh is not None and not bad, f"not behind: {bad}" if bad else "")], num=e, unit="sq")

@check("S01.h", S, "march: mover overlap, frame rate and long frames (reported)", path="gpu", kind="REPORTED", share="s01far")
def h(t):
    o = far(t); mo = o.mover_overlap(HS); lo = sum(1 for x in o.raw[o.drag_page]["loaf"] if x["d"] >= 100)
    return t.verdict(o, [], num=mo["max_sq"], unit="sq", expected="reported only")| {"note": f"mover overlap max {mo['max_sq']} sq ({mo['pair']}), longest over 0.1 sq {mo['longest_ms']} ms; fps {o.fps.get(o.drag_page)}; long frames >=100 ms: {lo}"}


@check("S01.i", S, "planGroup dry run: the shape, a spot for each of the 8 members, and nobody moves", path="state", kind="HARD", expect010=True)
def i(t):
    names = HS; t.say("planGroup(8 refs, drop) as a dry run")
    r = t.rig.ev("gm", "const m=game.pentaryn.movement; const ts=%s.map(n=>canvas.tokens.placeables.find(t=>t.name===n).document); const p=await m.planGroup(ts,{x:%d,y:%d}); const moved=ts.filter(t=>Math.hypot(canvas.tokens.get(t.id).x-t._source.x, canvas.tokens.get(t.id).y-t._source.y)>1).length; return JSON.stringify({p, moved})" % (json.dumps(names), pt(S, "dropFar")[0], pt(S, "dropFar")[1]))
    p = r["p"]; mem = p.get("members") or []; spots = [m for m in mem if m.get("slot")]
    class O: pass
    return {"ok": p.get("shape") == "march" and len(spots) == 8 and not r["moved"], "num": len(spots), "unit": "spots", "expected": "shape march, 8 spots, nobody moved",
            "note": f"shape={p.get('shape')} spots={len(spots)} keys={sorted(p.keys())} moved={r['moved']}", "conds": [("shape == march", p.get("shape") == "march", p.get("shape")), ("8 members with a spot", len(spots) == 8, len(spots)), ("each carries route/delay/stay", all(("delay" in m and "stay" in m) for m in mem) and bool(mem), ""), ("dry run moved nobody", not r["moved"], r["moved"])]}

@check("S01.j", S, "API: status().version is the module's, selftest() ok, telemetry({seconds}) answers", path="state", kind="HARD")
def j(t):
    r = t.rig.ev("gm", "const m=game.pentaryn.movement; const t=m.telemetry({seconds:30}); return JSON.stringify({v:m.status().version, mv:game.modules.get('pentaryn-movement').version, ok:m.selftest().ok, tel:!!t?.summary, tripped:t?.tripped??null})")
    c = [("status().version == module version", r["v"] == r["mv"], f"{r['v']} vs {r['mv']}"), ("selftest().ok", r["ok"] is True, r["ok"]), ("telemetry has a summary", r["tel"], ""), ("breaker not tripped", not r["tripped"], r["tripped"])]
    return {"ok": all(x[1] for x in c), "num": None, "unit": None, "expected": "; ".join(x[0] for x in c), "note": "; ".join(f"{x[0]}: {x[2]}" for x in c if not x[1]) or f"version {r['v']}", "conds": c}
