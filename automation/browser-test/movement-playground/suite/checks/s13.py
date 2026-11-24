"""S13 Door too narrow for a Large"""
from fw import check, pt, heroes
from ck import *
import re

S = "S13"; LARGE, HUGE = "S13 Large", "S13 Huge"; HER = [f"S13 Hero {i}" for i in range(1, 5)]; DX = 900

def thru_door(o, n):
    """did the token's route cross x=900 inside the 1-wide door gap (y 8400..8500)?"""
    for poly in o.route_points(n):
        for a, b in zip(poly, poly[1:]):
            if (a[0] - DX) * (b[0] - DX) < 0:
                y = a[1] + (b[1] - a[1]) * (DX - a[0]) / (b[0] - a[0]);
                if 8400 <= y <= 8500: return True
    return False

@check("S13.a", S, "a Large with a wide way round: takes the wide way, never the 1-wide door", path="state", kind="HARD", expect010=False)
def a(t):
    o = t.drag([LARGE], LARGE, pt(S, "dropE")); e = leader_err(o, LARGE, pt(S, "dropE"))
    return t.verdict(o, [("the Large arrives within 0.8 sq of the drop", e <= 0.8, f"{e:.2f} sq off (a 2x2 centre sits on a grid corner: 0.71 is exact); notices {o.notice_texts()[:2]}"), ("its route never uses the door gap", not thru_door(o, LARGE), "went through the 1-wide door")], num=e, unit="sq", guards=dict(account=False))

@check("S13.b", S, "no way round: the Large stops before the door, body clear, and the GM is whispered", path="state", kind="HARD", scenario="noround", expect010=False)
def b(t):
    o = t.drag([LARGE], LARGE, pt(S, "dropE")); d_ = o.docs[LARGE]; right = d_["x"] + d_["w"] * G
    chat = [n for n in o.notices() if n["type"] == "chat" or n["text"]]
    return t.verdict(o, [("the Large did not pass the door", right <= DX + 5, f"right edge at {right}"), ("the GM is told (a notice or a whisper)", bool(chat), "no notice, no whisper")], guards=dict(account=False, notices_ok=(r".",)))

@check("S13.c", S, "a Large LEADER stopped at the mouth: the pack forms behind where it stops", path="state", kind="HARD", scenario="noround", expect010=True)
def c(t):
    mem = [LARGE] + HER; o = t.drag(mem, LARGE, pt(S, "dropE")); d_ = o.docs[LARGE]; right = d_["x"] + d_["w"] * G
    ahead = [h for h in HER if o.c1(h)[0] > right - 5]; bh, mx, md = pack(o, LARGE, HER)
    return t.verdict(o, [("the Large did not pass the door", right <= DX + 5, f"right edge {right}"), ("no hero ahead of the Large's front edge", not ahead, f"{ahead}"), ("the pack within 4 sq of it", md is not None and md <= 4.5, f"max {md}")], guards=dict(account=False, notices_ok=(r".",)))

@check("S13.d", S, "a Large FOLLOWER stops where it last fits, those behind queue behind it", path="state", kind="HARD", scenario="noround", expect010=True)
def d(t):
    mem = ["S13 Hero 1", LARGE, "S13 Hero 2", "S13 Hero 3"]; o = t.drag(mem, "S13 Hero 1", pt(S, "dropE")); d_ = o.docs[LARGE]; right = d_["x"] + d_["w"] * G
    behind_big = [h for h in ("S13 Hero 2", "S13 Hero 3") if o.c1(h)[0] > right - 5]
    return t.verdict(o, [("the Large did not pass the door", right <= DX + 5, f"right edge {right}"), ("the heroes that were behind it did not pass it", not behind_big, f"{behind_big}"), ("the Large is named", o.named(LARGE), f"{o.notice_texts()[:3]}")], guards=dict(account=False, notices_ok=(r".",)))
