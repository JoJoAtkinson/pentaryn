"""Instrument proofs that 0.9.0 cannot give through the real checks: z-order recorder, click-to-stop, stair geometry.
usage: ./proof/run.sh   (gpu path). Prints one line per proof; writes proof/out.json"""
import sys, json, time
from pathlib import Path
H = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(H / "lib"), str(H / "checks")]
from h import Rig, ST, G
import fw, ck
from ck import *
from an import Obs
from fw import T, pt

rig = Rig("gpu"); rig.open("gm"); rd = H / "out" / "proof"; rd.mkdir(parents=True, exist_ok=True)
def mk(station, scenario="default", mode="paths"):
    return T(rig, dict(id="proof", station=station, scenario=scenario, mode=mode, pages=("gm",), path="gpu"), 1, rd)
out = {}
try:
    # 1. z-order: a document move straight through three mates (no pathfinding; core animates through tokens). The recorder must see the overlaps,
    #    and must say "below" while the leader's order is not above, and "above" once the leader's sort is raised (restored after)
    L = "S03 Hero 1"; mates = ["S03 Hero 2", "S03 Hero 3", "S03 Hero 4"]
    def straight():
        t = mk("S03", "back"); t.reset()
        return t.act(lambda: rig.ev("gm", "const d=canvas.scene.tokens.getName('S03 Hero 1'); await d.update({x:6800,y:1100},{animate:true}); return 1") and {}, key="gm", group=[L], meta={}, settle=20)
    o = straight(); n0 = passes(o, L, mates); b0, nn0 = z_violations(o, L, mates)
    sort0 = rig.ev("gm", "const d=canvas.scene.tokens.getName('S03 Hero 1'); return d.sort")
    rig.ev("gm", "await canvas.scene.tokens.getName('S03 Hero 1').update({sort:900}); return 1")
    try:
        o2 = straight(); rig.ev("gm", "await canvas.scene.tokens.getName('S03 Hero 1').update({sort:900}); return 1")
        o2 = None
        t = mk("S03", "back"); t.reset(); rig.ev("gm", "await canvas.scene.tokens.getName('S03 Hero 1').update({sort:900}); return 1"); rig.wait_quiet(min_wait=1)
        o2 = t.act(lambda: rig.ev("gm", "const d=canvas.scene.tokens.getName('S03 Hero 1'); await d.update({x:6800,y:1100},{animate:true}); return 1") and {}, key="gm", group=[L], meta={}, settle=20)
        b1, nn1 = z_violations(o2, L, mates)
    finally:
        rig.ev("gm", "await canvas.scene.tokens.getName('S03 Hero 1').update({sort:%s}); return 1" % json.dumps(sort0))
    out["z"] = {"default": {"overlap_instants": nn0, "leader_below": b0}, "leader_sort_900": {"overlap_instants": nn1, "leader_below": b1}, "leader_order_default_first": order_series(o, L)[:2], "mate_order": order_series(o, mates[0])[:1]}
    print("z-order proof:", json.dumps(out["z"])[:700], flush=True)
    # 2. click: a hero dragged 15 squares across S01, clicked once it is 5 squares out: it must rest where clicked (core click-to-stop), drawn = document
    t = mk("S01"); t.reset(); L = "S01 Hero 1"
    def act():
        dr = rig.drag("gm", [L], L, pt("S01", "dropFar")); ck_ = rig.click_when("gm", L, "x>7.2", timeout=15000)
        return {"drag": dr, "click": ck_}
    o = t.act(act, key="gm", group=[L], meta={"grab": L}); cl = o.meta.get("click"); d = o.docs[L]
    out["click"] = {"click": cl, "rests_at_px": [d["x"], d["y"]], "drawn": d["drawn"], "start": o.c0(L)}
    print("click proof:", json.dumps(out["click"])[:500], flush=True)
    # 3. stair geometry: the centre-line helper on the point the station says is on the centre line, and a point 0.1 sq off it
    GA, GB = ST["S05"]["measure"]["stair"]["groups"]; WA, WB = station_walls("S05", grp=GA), station_walls("S05", grp=GB)
    mid = ST["S05"]["points"]["dropMid"]["c"]
    dm = centre_deviation([tuple(mid)], WA, WB)
    off = centre_deviation([(mid[0] + 7, mid[1] + 7)], WA, WB)
    out["stair"] = {"on_line": dm, "off_by_0.1": off, "clearance_at_mid": min_clearance([tuple(mid)], WA + WB)}
    print("stair proof:", json.dumps(out["stair"]), flush=True)
finally:
    try: rig.reset("all", "default", "paths", keys=["gm"])
    except Exception as e: print("reset failed", e)
    rig.close(); (H / "proof" / "out.json").write_text(json.dumps(out, indent=1, default=str))
