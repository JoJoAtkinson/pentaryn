#!/usr/bin/env python3
"""gen.py - generates stations.json (and stations.md, build.js, reset.js, install.js, verify.js) for ZZ Playground.

Run:  python3 gen.py        (writes next to itself)
All geometry is authored in SQUARES inside each station (24x24, local origin top-left, label band y 0-2) and
written out in PIXELS (grid 100 px, scene 10000x10000).
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pglib import *

HERE = os.path.dirname(os.path.abspath(__file__))

# Foundry wall direction: which `dir` value blocks a crossing from the LEFT/RIGHT of p0->p1 is measured in-world
# (see stations.md "one-way walls"). OW_BLOCKS_FROM_LEFT is the dir value that blocks the side to the LEFT of p0->p1.
OW_LEFT = 1
OW_RIGHT = 2

stations = []


def S(sid, name, idx, instr):
    st = Station(sid, name, idx % COLS, idx // COLS, instr)
    stations.append(st)
    return st


def hero(st, n, x, y, **kw):
    owner = "A" if n <= 4 else "B"
    st.token(f"{st.id} Hero {n}", f"ZZ Hero {n}", x, y, owner=owner, disp=1, hero=True, linked=True, role="hero", **kw)


def monster(st, n, x, y, **kw):
    st.token(f"{st.id} Monster {n}", "ZZ Monster", x, y, disp=-1, role="monster", **kw)


def villager(st, n, x, y, disp=0, **kw):
    st.token(f"{st.id} Villager {n}", "ZZ Villager", x, y, disp=disp, role="villager", **kw)


# ============================================================ S01 open field - MARCH
s = S("S01", "Open field - MARCH", 0,
      "Drag a hero 15 squares to the far point: it leads, the pack balls up BEHIND its last step. Try the point behind the pillar.")
s.rect(0, 3, 23, 22)
s.hole(12, 12)
for n, (x, y) in enumerate([(2, 12), (1, 5), (4, 7), (1, 9), (5, 10), (3, 15), (6, 17), (1, 19)], 1):
    hero(s, n, x, y)
for n, (x, y) in enumerate([(8, 20), (10, 19), (10, 21), (12, 20), (14, 19), (14, 21), (16, 20), (18, 19)], 1):
    monster(s, n, x, y)
s.point("dropFar", 17.5, 12.5, "15 squares east of Hero 1 on open floor: leader on the drop square, pack behind it")
s.point("dropRound", 13.5, 12.5, "just behind the pillar: the route bends, 'behind' follows the last step")
s.point("pillar", 12.5, 12.5, "the 1x1 pillar (four walls)")

# ============================================================ S02 arena - SWARM
s = S("S02", "Arena - SWARM", 1,
      "Drag the monsters onto a token: swarm round it (hostile Medium / Large, friend, prop); the hidden token is a march; the pen target through its door.")
s.rect(0, 3, 23, 22)
# pen: interior x17..21, y14..18, door on its west face
s.rect_walls(17, 14, 22, 19, gaps=[("W", 16, 17)])
s.door(17, 16, 17, 17, ds=1, key="pendoor")
cx, cy, R = 8.5, 12.5, 6.5
ang0 = -90.0
mons = []
for i in range(10):
    a = math.radians(ang0 + 36 * i + 18)
    x = cx + R * math.cos(a) - 0.5
    y = cy + R * math.sin(a) - 0.5
    mons.append((int(round(x)), int(round(y))))
for n, (x, y) in enumerate(mons, 1):
    monster(s, n, x, y)
for n, (x, y) in enumerate([(0, 18), (2, 18), (0, 20), (2, 20)], 1):
    hero(s, n, x, y)
s.token("S02 Target M", "ZZ Target", 8, 12, disp=-1, role="target")
s.token("S02 Target L", "ZZ Target", 2, 4, w=2, disp=-1, role="target")
s.token("S02 Hidden", "ZZ Target", 14, 5, disp=-1, hidden=True, role="target")
s.token("S02 Friend", "ZZ Villager", 5, 21, disp=1, role="friend")
s.token("S02 Prop", "ZZ Target", 11, 21, disp=0, role="prop")
s.token("S02 Pen Target", "ZZ Target", 19, 16, disp=-1, role="target")
s.point("dropM", 8.5, 12.5, "on the Medium target: leader touches it on its own side, the 8 touching squares fill from each member's side, the rest in ring 2")
s.point("dropL", 3.0, 5.0, "on the Large target: 12 touching squares")
s.point("dropHidden", 14.5, 5.5, "on the hidden token: a march, never a swarm, also for the GM")
s.point("dropFriend", 5.5, 21.5, "heroes onto a friendly token: a swarm")
s.point("dropProp", 11.5, 21.5, "heroes onto a prop: a swarm")
s.point("dropPen", 19.5, 16.5, "the pen target: file in through the door, then fan out round it")
s.point("penDoor", 17.0, 16.5, "the pen's only door (open)")

# ============================================================ S03 one-wide tunnel (the bug)
s = S("S03", "One-wide tunnel", 2,
      "Drag the four heroes 11 squares into the 1x1 tunnel: a line behind the leader. Scenario back: leader at the back walks through its mates.")
s.rect(0, 8, 6, 14)
s.rect(7, 11, 21, 11)
for n, (x, y) in enumerate([(4, 11), (3, 10), (3, 12), (2, 11)], 1):
    hero(s, n, x, y)
s.scenario("back", "the four in line inside the tunnel, the leader (Hero 1) last", tokens={
    "S03 Hero 1": [8, 11], "S03 Hero 2": [9, 11], "S03 Hero 3": [10, 11], "S03 Hero 4": [11, 11]})
s.point("dropIn11", 17.5, 11.5, "11 squares into the tunnel: a line behind the leader, nobody named")
s.point("dropDeep", 20.5, 11.5, "the dead end of the tunnel")
s.point("dropRoom", 2.5, 11.5, "back in the mouth room")

# ============================================================ S04 twenty-monster tunnel
s = S("S04", "Twenty-monster tunnel", 3,
      "20 monsters in a 1-wide tunnel 30 long, a room at each end. Drag to room E: all follow in file. Scenario cap: 24 accepted, 25 refused.")
s.rect(0, 3, 3, 8, "w")
s.rect(4, 5, 22, 5, "t")
s.rect(22, 6, 22, 6, "t")
s.rect(13, 7, 22, 7, "t")
s.rect(4, 7, 12, 13, "e")
s.opening(4, 5, 4, 6)       # W | tunnel
s.opening(13, 7, 13, 8)     # tunnel | E
path = [(x, 5) for x in range(4, 23)] + [(22, 6)]       # back (west) to front (nearest room E)
front_first = list(reversed(path))
for n, (x, y) in enumerate(front_first, 1):
    monster(s, n, x, y)
for n, (x, y) in enumerate([(1, 4), (2, 4), (1, 6), (2, 6), (1, 7)], 21):
    monster(s, n, x, y, only=["cap"])
s.scenario("front", "the leader (Monster 1) at the front of the queue, nearest room E", tokens={})
s.scenario("back", "the leader (Monster 1) at the BACK of the queue; Monster 20 at the front", tokens={
    f"S04 Monster {n}": list(p) for n, p in enumerate(path, 1)})
s.scenario("cap", "five more monsters (21-25) in room W: select 24 (accepted) and 25 (refused with the notice)", tokens={})
s.point("dropE", 8.5, 10.5, "room E at the far end of the tunnel")
s.point("dropW", 1.5, 5.5, "room W at the near end")

# ============================================================ S05 spiral C stair
s = S("S05", "Spiral C stair", 4,
      "Drag from room A to room B over the C: one smooth motion on the centre line (0.4 square at the narrowest). Scenarios long, mud.")
CX, CY, RC = 10.0, 13.5, 6.0
s.rect(4, 4, 9, 9, "A")
s.rect(4, 17, 9, 22, "B")
s.rect(0, 2, 6, 3, "W")
s.rect(0, 4, 1, 21, "W")
s.rect(2, 20, 3, 21, "W")
s.opening(10, 7, 10, 8)       # mouth A
s.opening(10, 19, 10, 20)     # mouth B
s.opening(4, 20, 4, 22)       # long way into B
s.door(5, 4, 7, 4, ds=0, key="longdoor")       # 2-wide door out of A (north)


def wfun(phi):   # phi in [-90, 90] degrees
    return 0.4 + 0.6 * (abs(phi) / 90.0) ** 1.5


outer, inner = [], []
for k in range(0, 31):
    phi = -90 + 6 * k
    w = wfun(phi)
    a = math.radians(phi)
    outer.append((CX + (RC + w / 2) * math.cos(a), CY + (RC + w / 2) * math.sin(a)))
    inner.append((CX + (RC - w / 2) * math.cos(a), CY + (RC - w / 2) * math.sin(a)))
s.poly(outer, grp="S05.stair.out")
s.poly(inner, grp="S05.stair.in")
stair_poly = outer + list(reversed(inner))
s.floor_poly(stair_poly)
s.measure["stair"] = {"groups": ["S05.stair.in", "S05.stair.out"], "width": 0.40, "tol": 0.02,
                      "note": "narrowest clear width of the C, mid-way"}
for n, (x, y) in enumerate([(8, 8), (6, 8), (4, 8), (8, 5)], 1):
    hero(s, n, x, y)
s.token("S05 Large", "ZZ Large", 4, 5, w=2, owner="A", disp=1, hero=True, linked=True, role="hero")
s.regions.append({"key": "mud", "name": "S05 Stair mud (difficult terrain)", "kind": "mud", "only": ["mud"],
                  "shape": {"type": "polygon", "points": [v for p in stair_poly for v in p], "local": True}})
s.scenario("long", "the 2-wide door on A's north wall is open: a long way round to B", doors={"longdoor": 1})
s.scenario("mud", "a Difficult Terrain region (walk x2) painted over the whole stair")
s.point("dropB", 7.0, 20.0, "room B")
s.point("dropMid", 16.0, 13.5, "mid-stair, the narrowest point (0.4 square): a click here rests off-grid on the centre line")
s.point("dropStair45", CX + RC * math.cos(math.radians(-45)), CY + RC * math.sin(math.radians(-45)), "a point on the centre line")
s.point("dropA", 7.0, 7.0, "back in room A")

# ============================================================ S06 passage shapes
s = S("S06", "Passage shapes", 5,
      "From the hall: S-curve, diagonal slit 0.4, funnel to 0.3 (passes), slit 0.2 (refused), hairpin (lanes share squares), pillar field.")
HALL = (0.0, 2.75, 3.0, 23.75)
band = lambda k: 4.5 + 3.5 * k
mouths = []     # (yc, half-width) hall wall gaps
x_end = 17.0


def pocket(yc, yend, wend=1.0):
    y0, y1 = yc - 1.5, yc + 1.5
    s.rect_walls(x_end, y0, 23.5, y1, gaps=[("W", yend - wend / 2, yend + wend / 2)])
    s.floor_poly([(x_end, y0), (23.5, y0), (23.5, y1), (x_end, y1)])


# k=0 S-curve
yc = band(0)
pts = [(3.0, yc, 1.0)] + [(3.5 + 0.5 * i, yc + 1.0 * math.sin((0.5 * i) / 13.0 * 2 * math.pi), 1.0) for i in range(27)] + [(17.0, yc, 1.0)]
L, R_ = s.corridor(pts, "S06.scurve")
s.floor_poly(L + list(reversed(R_)))
pocket(yc, yc)
mouths.append((yc, 0.5))
s.point("dropScurve", 20.25, yc, "pocket at the end of the S-curve (1.0 wide)")
# k=1 diagonal slit 0.4
yc = band(1)
yA, yB = yc - 0.9, yc + 0.9
pts = [(3, yA, 1.0), (5, yA, 1.0), (5, yA, 0.4), (7.2, yB, 0.4), (7.2, yB, 1.0), (x_end, yB, 1.0)]
L, R_ = s.corridor(pts, "S06.diag")
s.floor_poly(L + list(reversed(R_)))
pocket(yc, yB)
mouths.append((yA, 0.5))
s.measure["diag"] = {"groups": ["S06.diag.L", "S06.diag.R"], "width": 0.40, "tol": 0.02, "window": [5.0, 7.2], "note": "diagonal slit 0.4"}
s.point("dropDiag", 20.25, yc, "pocket behind the 0.4 diagonal slit")
# k=2 funnel to 0.3
yc = band(2)
pts = [(3, yc, 1.6), (4, yc, 1.4), (5, yc, 1.1), (6, yc, 0.8), (7, yc, 0.5), (8, yc, 0.3), (9, yc, 0.3), (10, yc, 0.3),
       (11, yc, 0.5), (12, yc, 0.8), (13, yc, 1.0), (x_end, yc, 1.0)]
L, R_ = s.corridor(pts, "S06.funnel")
s.floor_poly(L + list(reversed(R_)))
pocket(yc, yc)
mouths.append((yc, 0.8))
s.measure["funnel"] = {"groups": ["S06.funnel.L", "S06.funnel.R"], "width": 0.30, "tol": 0.02, "window": [8.0, 10.0], "note": "funnel throat 0.3 (passes)"}
s.point("dropFunnel", 20.25, yc, "pocket behind the funnel (throat 0.3: passes)")
# k=3 slit 0.2 (refused)
yc = band(3)
pts = [(3, yc, 1.0), (6, yc, 1.0), (6, yc, 0.2), (9, yc, 0.2), (9, yc, 1.0), (x_end, yc, 1.0)]
L, R_ = s.corridor(pts, "S06.slit")
s.floor_poly(L + list(reversed(R_)))
pocket(yc, yc)
mouths.append((yc, 0.5))
s.measure["slit"] = {"groups": ["S06.slit.L", "S06.slit.R"], "width": 0.20, "tol": 0.02, "window": [6.0, 9.0], "note": "slit 0.2 (refused)"}
s.point("dropSlit", 20.25, yc, "pocket behind the 0.2 slit: refused, nobody moves")
# k=4 hairpin, lanes 1.0 wide share squares
yc = band(4)
arc = [(15 + 1.0 * math.cos(math.radians(a)), yc + 1.0 * math.sin(math.radians(a))) for a in range(-90, 91, 10)]
s.poly([(3, yc - 1.0)] + arc[:1], grp="S06.hairpin.out")
s.poly(arc, grp="S06.hairpin.out")
s.poly(arc[-1:] + [(3, yc + 1.0)], grp="S06.hairpin.out")
s.wall(3, yc, 15, yc, grp="S06.hairpin.div")
s.floor_poly([(3, yc - 1.0)] + arc + [(3, yc + 1.0)])
mouths.append((yc - 0.5, 0.5))
s.measure["hairpin"] = {"groups": ["S06.hairpin.div", "S06.hairpin.out"], "width": 1.0, "tol": 0.02, "note": "two 1.0 lanes divided by one wall; lane row yc is off-grid (x.5)"}
s.point("dropHairpin", 4.5, yc + 0.5, "west end of the lower lane: the way is east along the upper lane, round the U, back west")
# k=5 pillar field
yc = band(5)
y0f, y1f = yc - 1.75, yc + 1.75
s.wall(3, y0f, 23.5, y0f)
s.wall(3, y1f, 23.5, y1f)
s.wall(23.5, y0f, 23.5, y1f)
s.floor_poly([(3, y0f), (23.5, y0f), (23.5, y1f), (3, y1f)])
offs = [-0.8, 0.7, -0.3, 0.9, -0.9, 0.2]
pillars = []
for i in range(13):
    px_ = 6.0 + 1.35 * i + 0.17 * (i % 3)
    py_ = yc + offs[i % 6]
    pillars.append((round(px_, 3), round(py_, 3)))
    h = 0.2
    s.poly([(px_ - h, py_ - h), (px_ + h, py_ - h), (px_ + h, py_ + h), (px_ - h, py_ + h)], closed=True, grp="S06.pillar")
mouths.append((yc, 1.75))
s.point("dropField", 22.5, yc, "far end of the pillar field")
# hall + hall east wall with gaps
s.wall(0.0, 2.75, 0.0, 23.75)
s.wall(0.0, 2.75, 3.0, 2.75)
s.wall(0.0, 23.75, 3.0, 23.75)
gaps = sorted((m[0] - m[1], m[0] + m[1]) for m in mouths)
cur = 2.75
for a, b in gaps:
    if a > cur + 1e-9:
        s.wall(3.0, cur, 3.0, a)
    cur = max(cur, b)
if cur < 23.75 - 1e-9:
    s.wall(3.0, cur, 3.0, 23.75)
s.floor_poly([(0.0, 2.75), (3.0, 2.75), (3.0, 23.75), (0.0, 23.75)])
hero(s, 1, 1, 9)
hero(s, 2, 1, 12)
s.point("hall", 1.5, 12.5, "the hall where the two heroes start")
s.pillars = pillars

# ============================================================ S07 doors
s = S("S07", "Doors", 6,
      "Eight heroes in the hall. Doors: open, closed, locked, double, diagonal, and a SECRET door to the vault (never used by a route).")
s.rect(0, 3, 5, 17, "H")
for i, y0 in enumerate([3, 6, 9, 12]):
    s.rect(6, y0, 11, y0 + 2, f"R{i + 1}")
s.rect(7, 15, 11, 17, "R5")
s.rect(6, 16, 6, 16, "V")
s.rect(12, 4, 12, 21, "L")
s.rect(6, 21, 11, 21, "L")
s.rect(0, 18, 5, 22, "K")
s.opening(6, 16, 6, 17)
s.opening(7, 16, 7, 17)
s.opening(12, 4, 12, 5)
s.opening(6, 21, 6, 22)
s.door(6, 4, 6, 5, ds=1, key="open")
s.door(6, 7, 6, 8, ds=0, key="closed")
s.door(6, 10, 6, 11, ds=2, key="locked")
s.door(6, 12, 6, 13, ds=0, key="dbl1")
s.door(6, 13, 6, 14, ds=0, key="dbl2")
s.door(6, 16, 7, 17, ds=0, key="diag")
s.door(2, 18, 3, 18, ds=0, kind=2, key="secret")
s.marks.append((2.5, 18.0, "S", 36))
for n, (x, y) in enumerate([(1, 6), (4, 6), (1, 8), (4, 8), (1, 10), (4, 10), (1, 12), (4, 12)], 1):
    hero(s, n, x, y)
s.scenario("allopen", "every ordinary door open (open, closed, double, diagonal); the locked and the secret door stay as they are",
           doors={"closed": 1, "dbl1": 1, "dbl2": 1, "diag": 1})
s.point("dropR1", 9.5, 4.5, "the room behind the OPEN door: a group files in one at a time and spreads out")
s.point("dropR2", 9.5, 7.5, "behind the closed door")
s.point("dropR3", 9.5, 10.5, "behind the locked door")
s.point("dropR4", 9.5, 13.5, "behind the double door")
s.point("dropR5", 9.5, 16.5, "behind the diagonal door")
s.point("dropVault", 2.5, 20.5, "the vault: a route goes the LONG way round (east corridor), never through the secret door")

# ============================================================ S08 unexplored room (mode sight)
s = S("S08", "Unexplored room", 7,
      "Mode sight: from the start room, drag into the room round the corner you have not seen: no route over unexplored ground. The GM is unaffected.")
s.rect(0, 3, 6, 9)
s.rect(7, 6, 16, 6)
s.rect(16, 7, 16, 14)
s.rect(12, 15, 21, 22)
hero(s, 1, 2, 5)
hero(s, 2, 2, 7)
s.point("dropU", 16.5, 18.5, "the room round the corner (never seen)")
s.point("dropCorridor", 12.5, 6.5, "along the corridor, in line of sight")
s.point("dropCorner", 16.5, 10.5, "the corridor after the corner")

# ============================================================ S09 dead end
s = S("S09", "Dead end", 8,
      "Drag behind the end wall: 'No route there', nobody moves. Drag into the pocket: a line or a ball behind the leader. Scenario past: a member is already deeper.")
s.rect(0, 8, 5, 13)
s.rect(6, 10, 20, 10)
s.rect(12, 11, 14, 13)
s.rect(22, 9, 23, 11, "g")
for n, (x, y) in enumerate([(3, 10), (1, 9), (1, 11), (1, 13)], 1):
    hero(s, n, x, y)
s.scenario("past", "Hero 4 already past the pocket, at the end of the corridor", tokens={"S09 Hero 4": [20, 10]})
s.point("dropBehind", 22.5, 10.5, "behind the end wall (a sealed room): 'No route there'")
s.point("dropPocket", 13.5, 12.5, "the 3x3 pocket off the corridor")
s.point("dropEnd", 20.5, 10.5, "the end of the corridor")

# ============================================================ S10 narrow bridge
s = S("S10", "Narrow bridge", 9,
      "Six heroes cross a 1-wide, 12-long bridge over a chasm (move-only walls): single file, spread out after, nobody in the chasm. Click on the bridge.")
s.rect(0, 9, 4, 14)
s.chasm_rect(5, 8, 16, 14)
s.rect(5, 11, 16, 11)
s.paint(5, 11, 16, 11, BRIDGE)
s.rect(17, 9, 22, 14)
for n, (x, y) in enumerate([(0, 10), (2, 10), (4, 10), (0, 12), (2, 12), (4, 12)], 1):
    hero(s, n, x, y)
s.point("dropE", 20.5, 11.5, "the east room")
s.point("dropMid", 10.5, 11.5, "the middle of the bridge")
s.point("dropChasm", 10.5, 9.5, "over the chasm: must not be a resting place")

# ============================================================ S11 mud
s = S("S11", "Mud", 10,
      "Drag east: the route takes the cheaper way (round, dry) because the straight corridor is Difficult Terrain; in a fight only mud squares cost double.")
s.rect(0, 10, 3, 14)
s.rect(4, 11, 19, 13)
s.rect(20, 10, 23, 14)
s.rect(1, 9, 2, 9)
s.rect(1, 7, 22, 8)
s.rect(21, 9, 22, 9)
for n, (x, y) in enumerate([(0, 11), (2, 11), (0, 13), (2, 13)], 1):
    hero(s, n, x, y)
s.regions.append({"key": "mud", "name": "S11 Mud (difficult terrain)", "kind": "mud", "only": None,
                  "shape": {"type": "rectangle", "x": 4, "y": 11, "width": 16, "height": 3, "local": True}})
s.point("dropE", 22.5, 12.5, "the east room")

# ============================================================ S12 one-way walls
OWD = {"west": None}   # filled below (direction chosen from the in-world test)
s = S("S12", "One-way walls", 11,
      "West->middle wall is open from the west only; middle->east wall open from the middle only. A loop returns. Routes use the open side only.")
s.rect(0, 6, 5, 11, "w")
s.rect(6, 6, 11, 11, "m")
s.rect(12, 6, 17, 11, "e")
s.rect(15, 12, 15, 12, "e")
s.rect(2, 12, 2, 12, "w")
s.rect(2, 13, 15, 13, "r")
s.opening(15, 13, 16, 13)
s.opening(2, 13, 3, 13)
# p0->p1 runs top to bottom; with y down the LEFT of a downward ray is EAST.  Open from the west = block from the east = LEFT.
s.wall(6, 6, 6, 12, dir=OW_LEFT, key="ow1", oneway="west")
s.wall(12, 6, 12, 12, dir=OW_LEFT, key="ow2", oneway="west")
s.arrows += [(6, 8, 0), (6, 10, 0), (12, 8, 0), (12, 10, 0)]
for n, (x, y) in enumerate([(1, 7), (1, 10), (8, 7), (8, 10)], 1):
    hero(s, n, x, y)
s.point("dropE", 15.5, 8.5, "east room: from the west or the middle a route passes both walls from their open sides")
s.point("dropW", 2.5, 8.5, "west room: from the east the way is the return corridor, never through the walls")
s.point("dropM", 9.5, 7.5, "middle room: from the east the way is round the loop and through the west wall")

# ============================================================ S13 door too narrow for a Large
s = S("S13", "Door too narrow", 12,
      "A Large (2x2) and a Huge (3x3) with four heroes: the 1-wide door is too narrow, a 4-wide way round exists. Scenario noround shuts it.")
s.rect(0, 6, 8, 13, "w")
s.rect(9, 6, 17, 13, "e")
s.rect(2, 2, 15, 5, "b")
s.opening(2, 6, 6, 6)
s.opening(12, 6, 16, 6)
s.door(9, 9, 9, 10, ds=1, key="door")
s.wall(9, 2, 9, 6, key="noround", only=["noround"])
for n, (x, y) in enumerate([(0, 6), (0, 8), (0, 10), (0, 12)], 1):
    hero(s, n, x, y)
s.token("S13 Large", "ZZ Large", 3, 8, w=2, owner="A", disp=1, hero=True, linked=True, role="hero")
s.token("S13 Huge", "ZZ Huge", 5, 10, w=3, owner="A", disp=1, hero=True, linked=True, role="hero")
s.scenario("noround", "the wide way round is walled shut at its middle: only the 1-wide door is left")
s.point("dropE", 13.5, 9.5, "east room: the Large takes the wide way round; with none it stops before the door and the GM is whispered")
s.point("dropMouth", 8.5, 9.5, "the mouth of the door, west side")

# ============================================================ S14 two-way lane
s = S("S14", "Two-way lane", 13,
      "Two screens at once: Player8A drags Heroes 1-4 to the east end while Player8B drags Heroes 5-8 to the west end. No deadlock, nobody left on anybody.")
s.rect(0, 12, 23, 13)
for n, (x, y) in enumerate([(0, 12), (1, 12), (0, 13), (1, 13)], 1):
    hero(s, n, x, y)
for n, (x, y) in enumerate([(22, 12), (23, 12), (22, 13), (23, 13)], 5):
    hero(s, n, x, y)
s.point("dropEast", 22.0, 13.0, "east end (where Heroes 5-8 start)")
s.point("dropWest", 2.0, 13.0, "west end (where Heroes 1-4 start)")

# ============================================================ S15 crowd behind a wall
s = S("S15", "Crowd behind a wall", 14,
      "Drag the twelve villagers to the far side of the wall: they converge on the only door (6 squares aside), go through one at a time, ball up behind the leader.")
s.rect(0, 3, 23, 8, "n")
s.rect(0, 9, 23, 21, "s")
s.door(14, 9, 15, 9, ds=1, key="door")
n = 1
for yy in (9, 10):
    for xx in range(3, 9):
        villager(s, n, xx, yy)
        n += 1
s.point("dropBeyond", 4.5, 5.5, "beyond the wall: they converge on the door, none through the wall")
s.point("door", 14.5, 9.0, "the door")

# ============================================================ S16 fight yard
s = S("S16", "Fight yard", 15,
      "Scenario fight starts a combat. Drag the group: the leader first, then one at a time, 5 ft a square; the slow member stops where its speed ends.")
s.rect(0, 3, 23, 22)
s.token("S16 Hero 1", "ZZ Fast Hero 1", 2, 12, owner="A", disp=1, hero=True, linked=True, role="hero")
s.token("S16 Hero 2", "ZZ Fast Hero 2", 2, 14, owner="A", disp=1, hero=True, linked=True, role="hero")
s.token("S16 Hero 3", "ZZ Fast Hero 3", 6, 12, owner="A", disp=1, hero=True, linked=True, role="hero")
s.token("S16 Slow Hero", "ZZ Slow Hero", 2, 10, owner="A", disp=1, hero=True, linked=True, role="hero")
for n, y in enumerate([10, 12, 14], 1):
    monster(s, n, 19, y)
s.token("S16 Ally", "ZZ Villager", 12, 17, disp=1, role="ally")
s.token("S16 Horse", "ZZ Horse", 3, 17, w=2, owner="B", disp=1, hero=True, linked=True, role="mount")
s.token("S16 Rider", "ZZ Rider", 3, 17, owner="B", disp=1, hero=True, linked=True, role="rider")
s.scenario("fight", "a combat is running: every token here is a combatant, Hero 1 has the turn", combat={
    "tokens": ["S16 Hero 1", "S16 Hero 2", "S16 Hero 3", "S16 Slow Hero", "S16 Monster 1", "S16 Monster 2", "S16 Monster 3",
               "S16 Ally", "S16 Horse", "S16 Rider"],
    "initiative": {"S16 Hero 1": 20, "S16 Hero 2": 19, "S16 Hero 3": 18, "S16 Slow Hero": 17, "S16 Ally": 15, "S16 Horse": 14,
                   "S16 Rider": 13, "S16 Monster 1": 10, "S16 Monster 2": 9, "S16 Monster 3": 8},
    "turn": "S16 Hero 1"})
s.point("dropFight", 14.5, 12.5, "group drag target: Hero 3 stands in the leader's lane, the ally is not in the drag")
s.point("dropFar", 21.5, 12.5, "far side, past the monsters")

# ------------------------------------------------------------------ export
ACTORS = [
    # name, type, size, width, walk, owner key, disposition, linked
    {"name": "ZZ Monster", "type": "npc", "size": "med", "width": 1, "walk": 30, "owner": None, "disposition": -1, "linked": False},
    {"name": "ZZ Target", "type": "npc", "size": "med", "width": 1, "walk": 0, "owner": None, "disposition": -1, "linked": False},
    {"name": "ZZ Slow Hero", "type": "character", "size": "med", "width": 1, "walk": 15, "owner": "A", "disposition": 1, "linked": True},
    {"name": "ZZ Fast Hero 1", "type": "character", "size": "med", "width": 1, "walk": 30, "owner": "A", "disposition": 1, "linked": True},
    {"name": "ZZ Fast Hero 2", "type": "character", "size": "med", "width": 1, "walk": 30, "owner": "A", "disposition": 1, "linked": True},
    {"name": "ZZ Fast Hero 3", "type": "character", "size": "med", "width": 1, "walk": 30, "owner": "A", "disposition": 1, "linked": True},
]


def P(v):
    return round(v * SQ, 2)


def export_station(st):
    ox, oy = st.ox, st.oy
    walls = build_walls(st)
    out_walls, lines = [], []
    for w in walls:
        x0, y0, x1, y1 = w["c"]
        ew = {"c": [P(ox + x0), P(oy + y0), P(ox + x1), P(oy + y1)]}
        for k in ("door", "ds", "move", "sight", "light", "sound", "dir", "key", "grp", "only", "oneway", "moveonly"):
            if w.get(k) is not None:
                ew[k] = w[k]
        if "key" in ew:
            ew["key"] = ew["key"]
        out_walls.append(ew)
    # drawings
    dr = []
    dr.append({"t": "rect", "x": P(ox), "y": P(oy), "w": 2400, "h": 2400, "fill": BACKDROP, "sort": 0})
    # floors
    labels = {}
    for (x, y), lab in st.cells.items():
        labels.setdefault(lab, set()).add((x, y))
    for lab, cs in labels.items():
        fill = st.floor_fill.get(lab, FLOOR)
        rows = {}
        for (x, y) in cs:
            rows.setdefault(y, []).append(x)
        for y, xs in sorted(rows.items()):
            xs.sort()
            a = b = xs[0]
            for x in xs[1:] + [None]:
                if x is not None and x == b + 1:
                    b = x
                    continue
                dr.append({"t": "rect", "x": P(ox + a), "y": P(oy + y), "w": (b - a + 1) * SQ, "h": SQ, "fill": fill, "sort": 1})
                if x is not None:
                    a = b = x
    rows = {}
    for (x, y) in set(st.chasm) - set(st.cells):
        rows.setdefault(y, []).append(x)
    for y, xs in sorted(rows.items()):
        xs.sort()
        a = b = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == b + 1:
                b = x
                continue
            dr.append({"t": "rect", "x": P(ox + a), "y": P(oy + y), "w": (b - a + 1) * SQ, "h": SQ, "fill": CHASM, "sort": 2})
            if x is not None:
                a = b = x
    for (x0, y0, x1, y1, fill) in st.paints:
        dr.append({"t": "rect", "x": P(ox + x0), "y": P(oy + y0), "w": (x1 - x0 + 1) * SQ, "h": (y1 - y0 + 1) * SQ, "fill": fill, "sort": 3})
    for fp in st.floor_extra:
        pts = [(P(ox + p[0]), P(oy + p[1])) for p in fp["pts"]]
        dr.append({"t": "poly", "pts": [v for p in pts for v in p], "fill": fp["fill"], "sort": 1})
    # wall lines: chain plain walls into polylines per style
    def style(w):
        if w.get("door") == 2:
            return (WALLC, 8)
        if w.get("door"):
            return {0: (DOOR_CLOSED, 12), 1: (DOOR_OPEN, 12), 2: (DOOR_LOCKED, 12)}[w.get("ds", 0)]
        if w.get("oneway"):
            return (ONEWAY, 10)
        if w.get("moveonly"):
            return (MOVEONLY, 5)
        return (WALLC, 8)
    plain = {}
    for w in out_walls:
        st_ = style(w)
        if w.get("door") or w.get("oneway") or w.get("only"):
            ln = {"t": "line", "pts": w["c"], "stroke": st_[0], "sw": st_[1], "sort": 5 if not w.get("door") else 6}
            if w.get("only"):
                ln["only"] = w["only"]
                ln["key"] = w.get("key")
            dr.append(ln)
            continue
        plain.setdefault(st_, []).append(w["c"])
    for st_, segs in plain.items():
        pool = [list(c) for c in segs]
        used = [False] * len(pool)
        for i in range(len(pool)):
            if used[i]:
                continue
            used[i] = True
            chain = [(pool[i][0], pool[i][1]), (pool[i][2], pool[i][3])]
            grew = True
            while grew:
                grew = False
                for j in range(len(pool)):
                    if used[j]:
                        continue
                    a, b = (pool[j][0], pool[j][1]), (pool[j][2], pool[j][3])
                    if chain[-1] == a:
                        chain.append(b)
                    elif chain[-1] == b:
                        chain.append(a)
                    else:
                        continue
                    used[j] = True
                    grew = True
                    break
            dr.append({"t": "line", "pts": [v for p in chain for v in p], "stroke": st_[0], "sw": st_[1], "sort": 5})
    for (x, y, ang) in st.arrows:
        dr.append({"t": "text", "x": P(ox + x - 0.5), "y": P(oy + y - 0.5), "w": 100, "h": 100, "text": "➤", "size": 60,
                   "color": ONEWAY, "rot": ang, "sort": 7})
    for (x, y, text, size) in st.marks:
        dr.append({"t": "text", "x": P(ox + x - 0.4), "y": P(oy + y - 0.4), "w": 80, "h": 80, "text": text, "size": size,
                   "color": "#b3261e", "rot": 0, "sort": 7})
    dr.append({"t": "text", "x": P(ox) + 20, "y": P(oy) + 5, "w": 2360, "h": 90, "text": f"{st.id} · {st.name}", "size": 58,
               "color": TEXTC, "rot": 0, "sort": 10})
    dr.append({"t": "text", "x": P(ox) + 20, "y": P(oy) + 92, "w": 2360, "h": 104, "text": st.instruction, "size": 31,
               "color": "#2a2f3a", "rot": 0, "sort": 10})
    # regions
    regs = []
    for r in st.regions:
        sh = r["shape"]
        if sh["type"] == "rectangle":
            shp = {"type": "rectangle", "x": P(ox + sh["x"]), "y": P(oy + sh["y"]), "width": P(sh["width"]), "height": P(sh["height"])}
        else:
            pts = sh["points"]
            shp = {"type": "polygon", "points": [P((ox if i % 2 == 0 else oy) + v) for i, v in enumerate(pts)]}
        regs.append({"key": r["key"], "name": r["name"], "kind": r["kind"], "only": r.get("only"), "shape": shp})
    toks = []
    for t in st.tokens:
        toks.append({"name": t["name"], "actor": t["actor"], "x": P(ox + t["x"]), "y": P(oy + t["y"]), "w": t["w"], "h": t["h"],
                     "owner": t["owner"], "disposition": t["disposition"], "hidden": t["hidden"], "hero": t["hero"],
                     "linked": t["linked"], "only": t["only"], "role": t["role"]})
    scen = {}
    for name, sc in st.scenarios.items():
        e = {"note": sc["note"], "tokens": {k: [P(ox + v[0]), P(oy + v[1])] for k, v in sc["tokens"].items()}, "doors": sc["doors"]}
        if "combat" in sc:
            e["combat"] = sc["combat"]
        scen[name] = e
    pts = {k: {"c": [P(ox + v["c"][0]), P(oy + v["c"][1])], "note": v["note"]} for k, v in st.points.items()}
    return {
        "id": st.id, "name": st.name, "cell": [ox * 1, oy * 1, ox + CELL - 1, oy + CELL - 1],
        "area": [P(ox), P(oy), P(ox + 24), P(oy + 24)],
        "instruction": st.instruction, "walls": out_walls, "regions": regs, "tokens": toks, "scenarios": scen,
        "points": pts, "measure": st.measure, "drawings": dr, "tokenOverlapOk": [],
    }


DESC = {
    "S01": "open field 24x20 with one 1x1 pillar; 8 heroes scattered west, 8 monsters south",
    "S02": "open arena; Medium + Large + hidden + friend + prop tokens, 10 monsters in a ring, 4 heroes, a walled pen (one open door) with a target",
    "S03": "mouth room and a 1x15 tunnel; 4 heroes at the mouth",
    "S04": "tunnel 1 wide, 30 long, folded in two rows, room W and room E; 20 monsters queued; scenario cap adds 5",
    "S05": "rooms A and B joined by a C of two off-grid curved walls (0.4 square mid-way, 1 square at the mouths); a 2-wide way round behind a door; 4 heroes + a Large in A",
    "S06": "a hall with 2 heroes and six passages to pockets: S-curve (1.0), diagonal slit 0.4, funnel to 0.3, slit 0.2, hairpin (two lanes share squares), pillar field",
    "S07": "hall with 8 heroes; rooms behind an open, a closed, a locked, a double and a diagonal door; a vault behind a secret door with a long open way round",
    "S08": "start room (2 heroes), a 1-wide corridor round a corner to a room never seen (mode sight)",
    "S09": "room (4 heroes), a 15-long corridor ending in a wall, a 3x3 pocket off it, a sealed room behind the end wall",
    "S10": "two rooms and a 1-wide 12-long bridge over a chasm (move-only walls); 6 heroes",
    "S11": "two rooms; a 3-wide straight corridor that is Difficult Terrain (region, walk x2) and a longer dry way round; 4 heroes",
    "S12": "three rooms; one-way walls W->M (open from the west) and M->E (open from the middle); a return loop; 4 heroes",
    "S13": "two rooms, a 1-wide open door between them, a 4-wide way round (scenario noround walls it shut); Large, Huge, 4 heroes",
    "S14": "a 2-wide 24-long lane; 4 heroes at each end (Player8A west, Player8B east)",
    "S15": "two rooms split by a wall whose only door is 6 squares from 12 villagers bunched against it",
    "S16": "open yard; 4 heroes (Hero 3 in the leader's lane, one slow: speed 15), 3 monsters, a standing ally, a horse with its rider",
}


def write_md(data):
    L = []
    L.append("# ZZ Playground - stations.json schema and station table\n")
    L.append("Generated by `gen.py` from the DSL in `gen.py` + `pglib.py`. One scene, **ZZ Playground**, 100x100 squares (10000x10000 px, grid 100 px = 5 ft, padding 0, no background image, a light background colour on the scene's level, global light on, darkness 0). It is not the table's active scene: view it, never activate it.\n")
    L.append("## Layout\n")
    L.append("Sixteen stations in a 4x4 grid of 25x25-square cells: S01-S04 the top row left to right, S05-S08 the second row, and so on. Each station owns the top-left **24x24 squares** of its cell (a one-square margin on the right and bottom, stations not connected). The top 2 rows of every station are the label band: a drawn title `Sxx - name` and a one-line instruction. Everything is in **pixels** in the JSON (square = 100 px); station-local square coordinates are only used inside `gen.py`.\n")
    L.append("Players do not see wall documents, so every wall is also drawn (a Drawing line: dark wall, brown closed door, green open door, red locked door, purple one-way wall with arrows, blue chasm edge). Door colours show the default state, the door controls show the live one.\n")
    L.append("## stations.json\n")
    L.append("```\n{ grid: 100, cols: 4, rows: 4, cellSquares: 25, contentSquares: 24, labelBandSquares: 2,\n  scene: { name, width, height, padding, backgroundColor, grid },\n  actors: [ { name, type, size, width, walk, owner, disposition, linked } ],   // ZZ actors the build creates when missing\n  stations: [ {\n    id: \"S01\", name, instruction,\n    cell: [c0, r0, c1, r1],            // squares, absolute, inclusive: the 25x25 cell\n    area: [x0, y0, x1, y1],            // px of the 24x24 content area (x1,y1 are the far edges)\n    walls: [ { c: [x0,y0,x1,y1],       // px\n               door: 0|1|2,            // 1 door, 2 secret door\n               ds: 0|1|2,              // door state: 0 closed, 1 open, 2 locked\n               move, sight, light, sound,   // only when not the default 20 (chasm edges: move 20, others 0)\n               dir: 0|1|2,             // one-way: 1 = blocks crossings from the LEFT of p0->p1 (measured in-world: open from the west for a wall drawn top to bottom)\n               key,                    // doors and scenario walls: the name scenarios use\n               grp,                    // polyline group (stair walls, S06 passages), used to measure widths\n               only: [scenarios] } ],  // exists only in those scenarios\n    regions: [ { key, name, kind: \"mud\", only, shape: {type: rectangle|polygon, ...px} } ],   // core modifyMovementCost, walk x2, visibility Always\n    tokens: [ { name, actor, x, y, w, h,          // px top-left, size in squares\n                owner: \"A\"|\"B\"|null,              // ZZ Player8A / ZZ Player8B (all the player's own tokens are in the actor's ownership)\n                disposition: 1|0|-1, hidden, hero, linked, role, only } ],   // hero = player-owned (gets sight in mode sight); only = scenario-only token\n    scenarios: { default: {note, tokens: {}, doors: {}},\n                 <name>: { note, tokens: { tokenName: [x, y] },   // px start positions that differ\n                           doors: { doorKey: ds },                 // door states that differ\n                           combat: { tokens: [names], initiative: {name: n}, turn: name } } },   // starts a combat\n    points: { name: { c: [cx, cy], note } },     // named spots for drops: CENTRE of the spot, px\n    measure: { name: { groups: [grpA, grpB], width, tol, note } },   // narrowest clear width in squares, checked by verify.js\n    drawings: [ { t: rect|poly|line|text, ... } ]  // floors, wall lines, labels (build.js turns them into Drawings)\n  } ] }\n```\n")
    L.append("Token names carry the station (`S03 Hero 2`), are always displayed, rotation is locked, tokens are tinted by role (green hero/friend, red monster, yellow villager, purple target, grey prop). Hero tokens are **linked** tokens of the ZZ Hero actors (Hero 1-4, Large, Huge, Slow Hero, Fast Hero 1-3 belong to ZZ Player8A; Hero 5-8, Tiny, Horse, Rider to ZZ Player8B); everything else is an unlinked token of ZZ Monster, ZZ Target or ZZ Villager. Every document carries `flags.world.pg = {st, key, grp, only}` so the reset can find its own.\n")
    L.append("## Scenarios and the reset\n")
    L.append("`reset.js` takes `globalThis.PG = { mode: \"paths\"|\"sight\", station: \"all\"|\"Sxx\", scenario: \"default\"|<name> }` and is self-contained (macro, eval-js and the pt harness all run it). `station: \"all\"` with a scenario applies it to every station that has it, the others stay default. Mode **paths** (default): token vision off, fog off. Mode **sight**: token vision on, fog exploration on and wiped, sight on the player-owned hero tokens only (station `all`: every hero; `Sxx`: that station's heroes). Either mode: every token of the chosen station(s) back on its start square, doors, regions and scenario walls restored, the scene's combats deleted, movement history cleared, stray tokens removed (also unflagged tokens dropped inside a station), selections released on the page that runs it. Run it with the playground viewed on that page (it views the scene itself when it is not).\n")
    L.append("Macros (folder **ZZ Playground**): `ZZ PG reset: paths (vision off)`, `ZZ PG reset: sight (heroes only)`, `ZZ PG scenario...` (dialog: station + scenario + mode). The journal entry **ZZ Playground** links them (a click on a macro link runs it) and lists the stations.\n")
    L.append("## Station table\n")
    L.append("| Station | Cell (col,row) | Area px (x0,y0) | What is there | Scenarios | Named points (centre px) |\n|---|---|---|---|---|---|")
    for st in data["stations"]:
        c0, r0 = int(st["cell"][0] // 25), int(st["cell"][1] // 25)
        sc = "; ".join(f"**{n}**: {v['note']}" for n, v in st["scenarios"].items())
        pts = "<br>".join(f"`{k}` ({int(v['c'][0])}, {int(v['c'][1])}): {v['note']}" for k, v in st["points"].items())
        toks = {}
        for t in st["tokens"]:
            if t["only"]:
                continue
            toks[t["role"]] = toks.get(t["role"], 0) + 1
        tk = ", ".join(f"{n} {r}" for r, n in toks.items())
        L.append(f"| **{st['id']}** {st['name']} | {c0},{r0} | {int(st['area'][0])}, {int(st['area'][1])} | {DESC[st['id']]}. Tokens: {tk}. Walls {len([w for w in st['walls'] if not w.get('only')])}, doors {len([w for w in st['walls'] if w.get('door') and not w.get('only')])}. | {sc} | {pts} |")
    L.append("\n## Files\n")
    L.append("`gen.py` (+`pglib.py`, `tpl/`) writes `stations.json`, `stations.md`, `build.js`, `reset.js`, `install.js`, `verify.js`. `build.js` builds the scene (idempotent: it deletes only the scene named ZZ Playground, creates missing ZZ actors, builds walls/drawings, then runs the reset for tokens, doors and regions). `install.js` makes the macros and the journal. `verify.js` (`run-verify.sh`) writes `verify.json`. `shots.sh` writes `shots/`. All JS files are bodies of an async function.\n")
    open(os.path.join(HERE, "stations.md"), "w").write("\n".join(L) + "\n")


def main():
    # token overlap sanity (default + every scenario)
    for st in stations:
        for scn, sc in st.scenarios.items():
            pos = {}
            for t in st.tokens:
                if t["only"] and scn not in t["only"]:
                    continue
                x, y = sc["tokens"].get(t["name"], (t["x"], t["y"]))
                pos[t["name"]] = (x, y, t["w"], t["h"], t["role"])
            names = list(pos)
            for i, a in enumerate(names):
                for b in names[i + 1:]:
                    ax, ay, aw, ah, ar = pos[a]
                    bx, by, bw, bh, br = pos[b]
                    if ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah:
                        if {ar, br} == {"mount", "rider"}:
                            continue
                        print("TOKEN OVERLAP", st.id, scn, a, b, file=sys.stderr)
                        sys.exit(1)
            # token inside station floor check (cells) for grid stations
    data = {
        "grid": SQ, "cols": COLS, "rows": ROWS, "cellSquares": CELL, "contentSquares": 24, "labelBandSquares": 2,
        "scene": {"name": "ZZ Playground", "width": 100 * SQ, "height": 100 * SQ, "padding": 0, "backgroundColor": "#cdd5df",
                  "grid": {"size": 100, "type": 1, "distance": 5, "units": "ft"}},
        "actors": ACTORS,
        "stations": [export_station(st) for st in stations],
    }
    with open(os.path.join(HERE, "stations.json"), "w") as f:
        json.dump(data, f, indent=0, separators=(",", ":"))
    assemble(data)
    write_md(data)
    n = sum(len(x["walls"]) for x in data["stations"])
    print("stations", len(data["stations"]), "walls", n, "tokens", sum(len([t for t in x["tokens"] if not t["only"]]) for x in data["stations"]),
          "drawings", sum(len(x["drawings"]) for x in data["stations"]))


def assemble(data):
    def tpl(n):
        return open(os.path.join(HERE, "tpl", n)).read()
    rd = {"stations": []}
    for st in data["stations"]:
        rd["stations"].append({
            "id": st["id"], "area": st["area"], "tokens": st["tokens"], "scenarios": st["scenarios"],
            "doors": [w for w in st["walls"] if w.get("door") and w.get("key")],
            "onlyWalls": [w for w in st["walls"] if w.get("only")],
            "onlyDraw": [e for e in st["drawings"] if e.get("only")],
            "regions": st["regions"],
        })
    rjs = tpl("reset.tpl.js").replace("/*DATA*/", json.dumps(rd, separators=(",", ":")))
    open(os.path.join(HERE, "reset.js"), "w").write(rjs)
    bd = {"scene": data["scene"], "actors": data["actors"], "stations": data["stations"]}
    bjs = tpl("build.tpl.js").replace("/*DATA*/", json.dumps(bd, separators=(",", ":"))).replace("/*RESET*/", json.dumps(rjs))
    open(os.path.join(HERE, "build.js"), "w").write(bjs)
    for n in ("install", "verify"):
        p = os.path.join(HERE, "tpl", n + ".tpl.js")
        if os.path.exists(p):
            exp = {"stations": [{"id": st["id"], "name": st["name"], "area": st["area"],
                                  "walls": len([w for w in st["walls"] if not w.get("only")]),
                                  "doors": len([w for w in st["walls"] if w.get("door") and not w.get("only")]),
                                  "regions": len([r for r in st["regions"] if not r.get("only")]),
                                  "tokens": len([t for t in st["tokens"] if not t.get("only")]),
                                  "scenarios": st["scenarios"], "tokenSpecs": st["tokens"], "doorSpecs": [w for w in st["walls"] if w.get("door") and w.get("key")],
                                  "onlyWalls": len([w for w in st["walls"] if w.get("only")]), "onlyWallSpecs": [{"key": w.get("key"), "only": w["only"]} for w in st["walls"] if w.get("only")], "regionSpecs": st["regions"],
                                  "measure": st["measure"], "points": st["points"], "instruction": st["instruction"]} for st in data["stations"]],
                   "scene": data["scene"]}
            js = tpl(n + ".tpl.js").replace("/*DATA*/", json.dumps(exp, separators=(",", ":"))).replace("/*RESET*/", json.dumps(rjs))
            open(os.path.join(HERE, n + ".js"), "w").write(js)


if __name__ == "__main__":
    main()
