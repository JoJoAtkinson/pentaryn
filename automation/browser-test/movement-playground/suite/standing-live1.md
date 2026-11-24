# ZZ Playground suite - the standing (every check's latest result, all rounds so far)

rounds read: live1, live1b, live1c, live1d, live1e, live1f | module versions seen: ['0.10.0']
HARD 100 checks, 23 failing | GATED 12, 8 failing | REPORTED 7 (3 not clean) | void 0

| station | checks | pass | HARD/GATED fail | reported not clean | void | failing ids |
|---|---|---|---|---|---|---|
| S01 Open field - MARCH | 12 | 8 | 4 | 0 | 0 | S01.d S01.e S01.f S01.k |
| S02 Arena - SWARM | 10 | 8 | 2 | 0 | 0 | S02.d S02.i |
| S03 One-wide tunnel | 6 | 6 | 0 | 0 | 0 |  |
| S04 Twenty-monster tunnel | 7 | 7 | 0 | 0 | 0 |  |
| S05 Spiral C stair | 23 | 13 | 9 | 1 | 0 | S05.a S05.b S05.d S05.g S05.h S05.i S05.j3 S05.k3 S05.o S05.p |
| S06 Passage shapes | 9 | 3 | 6 | 0 | 0 | S06.a S06.e S06.f S06.g S06.h S06.i |
| S07 Doors | 18 | 12 | 4 | 2 | 0 | S07.d S07.k S07.l S07.m S07.n S07.q |
| S08 Unexplored room | 3 | 3 | 0 | 0 | 0 |  |
| S09 Dead end | 3 | 2 | 1 | 0 | 0 | S09.c |
| S10 Narrow bridge | 4 | 4 | 0 | 0 | 0 |  |
| S11 Mud | 2 | 1 | 1 | 0 | 0 | S11.a |
| S12 One-way walls | 4 | 4 | 0 | 0 | 0 |  |
| S13 Door too narrow | 4 | 3 | 1 | 0 | 0 | S13.c |
| S14 Two-way lane | 3 | 3 | 0 | 0 | 0 |  |
| S15 Crowd behind a wall | 3 | 0 | 3 | 0 | 0 | S15.a S15.b S15.c |
| S16 Fight yard | 8 | 8 | 0 | 0 | 0 |  |

Failing (HARD and GATED):

- S01.d (GATED): (host loaded, indicative) plan under 100 ms: 480.7 ms (drop to first write 40 ms)
- S01.e (GATED): median pack start 100-400 ms after the leader: 1202.0
- S01.f (HARD): plan.total counts 8: {'timingMs': 682.2, 'searches': 11, 'failed': 4, 'total': 1200, 'pack': 1200, 'members': 8, 'crowded': 0, 'staggerMs': 3.5}; no unexpected 
- S01.k (GATED): 8 cold: perf.lastMs under 100 ms: lastMs 498.2, plan.timingMs 490.5, members 8; 20 cold: perf.lastMs under 250 ms: lastMs 709.4, plan.timingMs 699.4, members 20
- S02.d (HARD): 12 touch the Large target: 11 touch
- S02.i (HARD): all eight inside the pen: 6 inside; no unexpected notice: [warning] Stayed where they stand, with no free spot they can reach: S02 Monster 7, S02 Monster 8.
- S05.a (HARD): hero ended in room B on the drop square (within 0.75 sq: dropB is a grid corner, its snapped square centre is 0.71 sq off): 11.60 sq off; notices []; every memb
- S05.b (GATED): one move write: 0 writes; no pause over 150 ms: longest gap None ms; clearance >= 0.15 sq: None sq; on the centre line (<= 0.05 sq) over the narrow stretch: {'w
- S05.d (HARD): the click landed while it moved: click missed: token never in the mid-stair window; it rests off the square grid: at 800,3300; on the centre line (<= 0.05 sq): 
- S05.g (HARD): the hero crossed the stair into B: stopped at (850, 3350); notices []
- S05.h (HARD): the hero crossed the stair into B: stopped at (850, 3350); notices []
- S05.i (GATED): warm route under 50 ms: 134.1 ms
- S05.j3 (HARD): no unexpected notice: [warning] No route there.
- S05.k3 (HARD): no unexpected notice: [warning] No route there.
- S05.o (HARD): the second walk is charged by the distance walked (3 % + 1 ft of the history's length; core's own measure beside it): charged 30 ft, walked 25.1 ft, core's meas
- S06.a (HARD): leader within 0.6 sq of the drop: 19.41 sq off; notices ['No route there.']; every member moving or named within 4 s: S06 Hero 1 (never moved); S06 Hero 2 (neve
- S06.e (HARD): leader within 0.6 sq of the drop: 9.96 sq off; notices ['No route there.']; every member moving or named within 4 s: S06 Hero 1 (never moved); S06 Hero 2 (never
- S06.f (HARD): leader within 0.6 sq of the drop: 24.44 sq off; notices ['No route there.']; every member moving or named within 4 s: S06 Hero 1 (never moved); S06 Hero 2 (neve
- S06.g (HARD): walked >= 2x the straight distance: walked 0.0 sq, straight 10.0 sq; every member moving or named within 4 s: S06 Hero 1 (never moved); S06 Hero 2 (never moved)
- S06.h (HARD): the plan failed for nobody (plan.failed = 0): plan {"timingMs": 129.4, "searches": 1, "failed": 1, "total": 0, "pack": 0, "members": 10, "crowded": 0, "staggerM
- S06.i (HARD): the plan failed for nobody (plan.failed = 0): plan {"timingMs": 121.4, "searches": 1, "failed": 1, "total": 0, "pack": 0, "members": 10, "crowded": 0, "staggerM
- S07.d (HARD): the leader within 1.6 sq of the vault drop: 14.04 sq off; notices ['No route there.']; every member within 2.2 sq of it: 0 of 8 near; every member moving or nam
- S07.k (GATED): plan under 100 ms: 257.1 ms
- S07.l (HARD): leader within 0.5 sq of the drop: 14.04 sq off; every member moving or named within 4 s: S07 Hero 1 (never moved); S07 Hero 2 (never moved); S07 Hero 3 (never m
- S07.q (HARD): nobody rests in the door frame unless stopped by speed: in the frame ['S07 Hero 2'], stopped by speed []
- S09.c (HARD): Hero 4 did not move: it moved; a notice names Hero 4: []
- S11.a (HARD): route inside the mud <= 0.5 sq: 16.44 sq inside
- S13.c (HARD): the pack within 4 sq of it: max None
- S15.a (HARD): leader within 0.6 sq of the drop: 4.12 sq off; all within 3.5 sq of the leader (balled up): max None; every member moving or named within 4 s: S15 Villager 1 (n
- S15.b (GATED): at most one centre within 0.6 sq of the door centre: up to 4 at once
- S15.c (GATED): plan under 100 ms: 1378.8 ms

## S01 Open field - MARCH

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S01.a | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.5 sq of the drop centre |
| S01.b | HARD | state | pass | -0.7459sq | live1 (0.10.0) | every member behind the leader (along <= -0.45 sq) |
| S01.c | HARD | state | pass | 2.828sq | live1 (0.10.0) | all members within 3.2 sq of the leader |
| S01.d | GATED | gpu | fail [loaded] | 375.3ms | live1 (0.10.0) | (host loaded, indicative) plan under 100 ms: 480.7 ms (drop to first write 40 ms) |
| S01.d | GATED | state | fail (indicative) | 683.8ms | live1 (0.10.0) | plan under 100 ms: 673.6 ms (drop to first write 48 ms) |
| S01.e | GATED | gpu | fail | 1202ms | live1 (0.10.0) | median pack start 100-400 ms after the leader: 1202.0 |
| S01.f | HARD | state | fail |  | live1 (0.10.0) | plan.total counts 8: {'timingMs': 682.2, 'searches': 11, 'failed': 4, 'total': 1200, 'pack': 1200, 'members': 8, 'crowded': 0, 'staggerMs': 3.5}; no unexpected notice: [warning] Stayed where they stand, with no free spot they can  |
| S01.g | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.5 sq of the drop; every member behind the last step of the leader |
| S01.h | REPORTED | gpu | pass | 0.39sq | live1 (0.10.0) | mover overlap max 0.39 sq (S01 Hero 1/S01 Hero 5), longest over 0.1 sq 2200 ms; fps 57.8; long frames >=100 ms: 1 |
| S01.i | HARD | state | pass | 8spots | live1 (0.10.0) | shape=march spots=8 keys=['failed', 'leader', 'members', 'ms', 'ok', 'order', 'pack', 'result', 'searches', 'shape', 'starts', 'target', 'total'] moved=0 |
| S01.j | HARD | state | pass |  | live1 (0.10.0) | version 0.10.0 |
| S01.k | GATED | gpu | fail | 709.4ms | live1b (0.10.0) | 8 cold: perf.lastMs under 100 ms: lastMs 498.2, plan.timingMs 490.5, members 8; 20 cold: perf.lastMs under 250 ms: lastMs 709.4, plan.timingMs 699.4, members 20 |
| S01.l | REPORTED | gpu | pass | 1643ms | live1b (0.10.0) | 8 @4x cold: lastMs 227.9 / timingMs 222.3; 8 @4x warm: lastMs 1334.5 / timingMs 1289.8; 20 @4x cold: lastMs 186.2 / timingMs 176.4; 20 @4x warm: lastMs 1665.6 / timingMs 1617 |

## S02 Arena - SWARM

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S02.a | HARD | state | pass | 0sq | live1 (0.10.0) | leader touches the target (gap 0); on the side it came from (within 60 deg) |
| S02.b | HARD | state | pass | 8touching | live1 (0.10.0) | 8 members touch the target; the other 2 sit in ring 2 |
| S02.c | HARD | state | pass | 25.85deg | live1 (0.10.0) | mean side error <= 60 deg |
| S02.d | HARD | state | fail | 11touching | live1 (0.10.0) | 12 touch the Large target: 11 touch |
| S02.e | HARD | state | pass |  | live1 (0.10.0) | last.shape == march; last.target is null |
| S02.f | HARD | state | pass | -0.9901sq | live1 (0.10.0) | every member behind the leader |
| S02.g | HARD | state | pass | 4touching | live1 (0.10.0) | leader touches the friend; all four touch it; last.shape == swarm |
| S02.h | HARD | state | pass | 4touching | live1 (0.10.0) | leader touches the prop; all four touch it; last.shape == swarm |
| S02.i | HARD | state | fail | 6inside | live1 (0.10.0) | all eight inside the pen: 6 inside; no unexpected notice: [warning] Stayed where they stand, with no free spot they can reach: S02 Monster 7, S02 Monster 8. |
| S02.j | GATED | gpu | pass | 1tokens | live1 (0.10.0) | at least half of them came through the door frame (the check is not vacuous); at most one centre within 0.6 sq of the door centre |

## S03 One-wide tunnel

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S03.a | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.5 sq of the drop; all four inside the tunnel row; nobody level with or ahead of the leader |
| S03.b | HARD | state | pass |  | live1 (0.10.0) | no 'no space' notice |
| S03.c | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.5 sq of the drop; all four inside the tunnel row; nobody level with or ahead of the leader; no notice naming a member (nobody left behind) |
| S03.d | HARD | gpu | pass | 0instants | live1 (0.10.0) | the leader overlaps a mate at some moment (it really passed through); leader drawn above the mate at every overlapping instant |
| S03.e | GATED | gpu | pass | 47.1ms | live1 (0.10.0) | plan reported; plan under 100 ms |
| S03.e | GATED | state | fail (indicative) | 96.3ms | live1 (0.10.0) | plan under 100 ms: 116 ms |
| S03.f | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.5 sq of the drop |

## S04 Twenty-monster tunnel

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S04.a | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.6 sq of the drop |
| S04.b | GATED | gpu | pass | 46.6ms | live1 (0.10.0) | plan reported; plan under 250 ms |
| S04.b | GATED | state | pass (indicative) | 83ms | live1 (0.10.0) | plan reported; plan under 250 ms |
| S04.c | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.6 sq of the drop |
| S04.d | HARD | gpu | pass | 0instants | live1 (0.10.0) | it really passed through members; always drawn above them |
| S04.e | HARD | state | pass | 0sq | live1 (0.10.0) | no refusal for the group size; leader within 0.6 sq of the drop |
| S04.f | HARD | state | pass |  | live1b (0.10.0) | the module made no plan of its own (mode core, no plan) |
| S04.g | HARD | state | pass |  | live1b (0.10.0) | the notice says one token at a time; nobody moved |

## S05 Spiral C stair

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S05.a | HARD | state | fail | 11.6sq | live1e (0.10.0) | hero ended in room B on the drop square (within 0.75 sq: dropB is a grid corner, its snapped square centre is 0.71 sq off): 11.60 sq off; notices []; every member moving or named within 4 s: S05 Hero 1 (never moved) |
| S05.b | GATED | gpu | fail |  | live1 (0.10.0) | one move write: 0 writes; no pause over 150 ms: longest gap None ms; clearance >= 0.15 sq: None sq; on the centre line (<= 0.05 sq) over the narrow stretch: {'worst_sq': None, 'n': 0} |
| S05.c | HARD | state | pass | 0.7071sq | live1b (0.10.0) | leader within 0.75 sq of the drop (dropB is a grid corner: its snapped square centre is 0.71 sq off); all four in room B; the leader sets off first |
| S05.d | HARD | gpu | fail |  | live1 (0.10.0) | the click landed while it moved: click missed: token never in the mid-stair window; it rests off the square grid: at 800,3300; on the centre line (<= 0.05 sq): {'worst_sq': 0.0, 'n': 0, 'narrowest': None}; every member moving or n |
| S05.e | HARD | state | pass |  | live1 (0.10.0) | arrived in B (long way) or refused with a notice |
| S05.f | HARD | state | pass |  | live1 (0.10.0) | the Large ends in room B |
| S05.g | HARD | state | fail |  | live1e (0.10.0) | the hero crossed the stair into B: stopped at (850, 3350); notices [] |
| S05.h | HARD | state | fail |  | live1e (0.10.0) | the hero crossed the stair into B: stopped at (850, 3350); notices [] |
| S05.i | GATED | state | fail | 150.6ms | live1e (0.10.0) | warm route under 50 ms: 134.1 ms |
| S05.j1 | HARD | state | pass | 1sq | live1b (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j2 | HARD | state | pass | 1.101sq | live1b (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j3 | HARD | state | fail | 2sq | live1b (0.10.0) | no unexpected notice: [warning] No route there. |
| S05.j4 | HARD | state | pass | 1.298sq | live1b (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j5 | HARD | state | pass | 1sq | live1b (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k1 | HARD | state | pass | 1sq | live1b (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k2 | HARD | state | pass | 1sq | live1b (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k3 | HARD | state | fail | 1sq | live1b (0.10.0) | no unexpected notice: [warning] No route there. |
| S05.k4 | HARD | state | pass | 1sq | live1b (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k5 | HARD | state | pass | 1sq | live1b (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.m | HARD | gpu | pass | 0.7071sq | live1d (0.10.0) | each leader reached its drop (within 1.0 sq) or its group was named; every screen draws each token where its document is |
| S05.m | HARD | state | pass | 0.7071sq | live1c (0.10.0) | each leader reached its drop (within 1.0 sq) or its group was named; every screen draws each token where its document is |
| S05.n | HARD | gpu | pass |  | live1b (0.10.0) | the click landed while they walked; every member rests at least 0.14 sq clear of every wall; each token's drawn position equals its document |
| S05.o | HARD | state | fail | 30ft | live1f (0.10.0) | the second walk is charged by the distance walked (3 % + 1 ft of the history's length; core's own measure beside it): charged 30 ft, walked 25.1 ft, core's measure {'core': 25, 'charged': 30, 'n': 15} |
| S05.p | REPORTED | gpu | fail | 1704ms | live1b (0.10.0) | nobody named and no route-timeout notice: named ['S05 Hero 2', 'S05 Hero 3', 'S05 Hero 5']; notices [] |

## S06 Passage shapes

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S06.a | HARD | state | fail | 19.41sq | live1 (0.10.0) | leader within 0.6 sq of the drop: 19.41 sq off; notices ['No route there.']; every member moving or named within 4 s: S06 Hero 1 (never moved); S06 Hero 2 (never moved); no unexpected notice: [warning] No route there. |
| S06.b | HARD | state | pass | 0.559sq | live1 (0.10.0) | leader within 0.6 sq of the drop |
| S06.c | HARD | state | pass | 0.25sq | live1 (0.10.0) | leader within 0.6 sq of the drop |
| S06.d | HARD | state | pass |  | live1 (0.10.0) | a notice says it cannot; the leader is not at the drop |
| S06.e | HARD | state | fail | 9.962sq | live1 (0.10.0) | leader within 0.6 sq of the drop: 9.96 sq off; notices ['No route there.']; every member moving or named within 4 s: S06 Hero 1 (never moved); S06 Hero 2 (never moved); no unexpected notice: [warning] No route there. |
| S06.f | HARD | state | fail | 24.44sq | live1 (0.10.0) | leader within 0.6 sq of the drop: 24.44 sq off; notices ['No route there.']; every member moving or named within 4 s: S06 Hero 1 (never moved); S06 Hero 2 (never moved); no unexpected notice: [warning] No route there. |
| S06.g | HARD | state | fail | 0sq | live1 (0.10.0) | walked >= 2x the straight distance: walked 0.0 sq, straight 10.0 sq; every member moving or named within 4 s: S06 Hero 1 (never moved); S06 Hero 2 (never moved); no unexpected notice: [warning] No route there. |
| S06.h | HARD | state | fail | 1failed | live1b (0.10.0) | the plan failed for nobody (plan.failed = 0): plan {"timingMs": 129.4, "searches": 1, "failed": 1, "total": 0, "pack": 0, "members": 10, "crowded": 0, "staggerMs": 0}; the leader within 0.6 sq of the drop: 19.41 sq off; every memb |
| S06.i | HARD | state | fail | 1failed | live1b (0.10.0) | the plan failed for nobody (plan.failed = 0): plan {"timingMs": 121.4, "searches": 1, "failed": 1, "total": 0, "pack": 0, "members": 10, "crowded": 0, "staggerMs": 0}; the leader within 0.6 sq of the drop: 24.44 sq off; every memb |

## S07 Doors

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S07.a | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.5 sq of the drop; all eight beyond the door |
| S07.b | GATED | gpu | pass | 1tokens | live1 (0.10.0) | at least half of them came through the door frame (the check is not vacuous); at most one centre within 0.6 sq of the door centre |
| S07.c | HARD | state | pass | 1sq | live1 (0.10.0) | no two of the eight closer than 0.9 sq at rest |
| S07.d | HARD | state | fail | 14.04sq | live1 (0.10.0) | the leader within 1.6 sq of the vault drop: 14.04 sq off; notices ['No route there.']; every member within 2.2 sq of it: 0 of 8 near; every member moving or named within 4 s: S07 Hero 1 (never moved); S07 Hero 2 (never moved); S07 |
| S07.e | HARD | state | pass |  | live1 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.f | HARD | state | pass |  | live1 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.g | HARD | state | pass |  | live1 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.h | HARD | state | pass |  | live1 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.i | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.6 sq of the double-door room drop; all eight through |
| S07.j | HARD | gpu | pass |  | live1 (0.10.0) | the door was shut while they walked; each token's drawn position equals its document position |
| S07.k | GATED | gpu | fail | 239.5ms | live1 (0.10.0) | plan under 100 ms: 257.1 ms |
| S07.k | GATED | state | fail (indicative) | 503.5ms | live1 (0.10.0) | plan under 100 ms: 503.5 ms |
| S07.l | HARD | state | fail | 14.04sq | live1 (0.10.0) | leader within 0.5 sq of the drop: 14.04 sq off; every member moving or named within 4 s: S07 Hero 1 (never moved); S07 Hero 2 (never moved); S07 Hero 3 (never moved); S07 Hero 4 (never moved); no unexpected notice: [warning] No ro |
| S07.m | REPORTED | state | fail | 3inside | live1b (0.10.0) | nobody left standing in the door frame: ['S07 Hero 3', 'S07 Hero 4'] |
| S07.n | REPORTED | state | fail | 8inside | live1b (0.10.0) | nobody left standing in the door frame: ['S07 Hero 7'] |
| S07.o | REPORTED | state | pass | 8inside | live1b (0.10.0) | leader within 0.6 sq of the drop; nobody named (room for all behind the door); nobody left standing in the door frame |
| S07.p | HARD | state | pass | 2inside | live1c (0.10.0) | the leader reached the drop (within 0.6 sq); nobody rests in the door frame unless stopped by speed |
| S07.q | HARD | state | fail | 8inside | live1c (0.10.0) | nobody rests in the door frame unless stopped by speed: in the frame ['S07 Hero 2'], stopped by speed [] |
| S07.r | HARD | state | pass | 8inside | live1c (0.10.0) | the leader reached the drop (within 0.6 sq); nobody rests in the door frame unless stopped by speed |

## S08 Unexplored room

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S08.a | HARD | state | pass |  | live1 (0.10.0) | the hero is not in the unexplored room; the player is told (a notice) |
| S08.b | HARD | state | pass | 0sq | live1 (0.10.0) | leg corridor mouth reached; leg corner reached; last leg arrives in the room round the corner |
| S08.c | HARD | state | pass | 0sq | live1 (0.10.0) | GM's hero arrives |

## S09 Dead end

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S09.a | HARD | state | pass |  | live1 (0.10.0) | a notice says no route; nobody moved |
| S09.b | HARD | state | pass | 2sq | live1 (0.10.0) | leader within 0.6 sq of the drop; all within 4 sq of the leader |
| S09.c | HARD | state | fail |  | live1 (0.10.0) | Hero 4 did not move: it moved; a notice names Hero 4: [] |

## S10 Narrow bridge

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S10.a | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.6 sq of the drop; all six in the east room; nobody in the chasm |
| S10.b | REPORTED | gpu | pass | 0sq | live1 (0.10.0) | mover overlap max 0 sq (None), longest over 0.1 sq 0 ms |
| S10.c | HARD | state | pass |  | live1 (0.10.0) | the group moved to the bridge; nobody in the chasm |
| S10.d | HARD | state | pass |  | live1 (0.10.0) | the drop was answered (somebody moved, or a notice says why); nobody rests in the chasm |

## S11 Mud

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S11.a | HARD | state | fail | 16.44sq | live1 (0.10.0) | route inside the mud <= 0.5 sq: 16.44 sq inside |
| S11.b | HARD | state | pass | -6.213ft | live1 (0.10.0) | charge = 5 ft x (walked + inside the region) |

## S12 One-way walls

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S12.a | HARD | state | pass | 0sq | live1 (0.10.0) | leader within 0.6 sq of the drop |
| S12.b | HARD | state | pass | 0sq | live1 (0.10.0) | first leg (west to east): no wall violation; leader back in the west room within 0.6 sq of the drop |
| S12.c | HARD | state | pass | 0sq | live1 (0.10.0) | leader in the middle room within 0.6 sq of the drop |
| S12.d | HARD | state | pass |  | live1 (0.10.0) | the walk finished (leader on the drop); no cut-short notice |

## S13 Door too narrow

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S13.a | HARD | state | pass | 0.7071sq | live1 (0.10.0) | the Large arrives within 0.8 sq of the drop; its route never uses the door gap |
| S13.b | HARD | state | pass |  | live1 (0.10.0) | the Large did not pass the door; the GM is told (a notice or a whisper) |
| S13.c | HARD | state | fail |  | live1 (0.10.0) | the pack within 4 sq of it: max None |
| S13.d | HARD | state | pass |  | live1 (0.10.0) | the Large did not pass the door; the heroes that were behind it did not pass it; the Large is named |

## S14 Two-way lane

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S14.a | HARD | gpu | pass |  | live1 (0.10.0) | every member moving or named within 4 s of its own drop |
| S14.a | HARD | state | pass |  | live1 (0.10.0) | every member moving or named within 4 s of its own drop |
| S14.b | HARD | state | pass | 0.7071sq | live1 (0.10.0) | west group's leader within 1.0 sq of the east drop; east group's leader within 1.0 sq of the west drop |
| S14.c | HARD | gpu | pass |  | live1 (0.10.0) | every token drawn at its document position on all three screens |

## S15 Crowd behind a wall

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S15.a | HARD | state | fail |  | live1 (0.10.0) | leader within 0.6 sq of the drop: 4.12 sq off; all within 3.5 sq of the leader (balled up): max None; every member moving or named within 4 s: S15 Villager 1 (never moved); S15 Villager 2 (never moved); S15 Villager 3 (never moved |
| S15.b | GATED | gpu | fail | 4tokens | live1 (0.10.0) | at most one centre within 0.6 sq of the door centre: up to 4 at once |
| S15.c | GATED | gpu | fail | 1384ms | live1 (0.10.0) | plan under 100 ms: 1378.8 ms |
| S15.c | GATED | state | fail (indicative) | 123.5ms | live1 (0.10.0) | plan under 100 ms: 136 ms |

## S16 Fight yard

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S16.a | HARD | state | pass |  | live1b (0.10.0) | every mover has a charge on record; charge == 5 ft x squares walked |
| S16.b | HARD | state | pass | 15ft | live1b (0.10.0) | the slow member moved; charged exactly 15 ft (3 squares) |
| S16.c | HARD | gpu | pass |  | live1b (0.10.0) | the leader is the first to move; each starts after the previous finishes (250 ms slack) |
| S16.d | HARD | state | pass | 60ft | live1 (0.10.0) | charge on record; charge == 5 ft x squares |
| S16.e | HARD | gpu | pass |  | live1b (0.10.0) | the click landed on a walking member; at least one member had not yet started (the check is not vacuous); nobody started to walk after the click |
| S16.f | HARD | state | pass |  | live1 (0.10.0) | both moved; the rider ends where it started relative to the horse (+-0.35 sq) |
| S16.g | HARD | state | pass | 12.08sq | live1b (0.10.0) | status().group.last.leader is the mount; shape march; the stack counts as one entry (plan.members 3 of 4 selected); the rider rests on its mount; the mount travelled (over 5 sq) |
| S16.h | HARD | state | pass |  | live1b (0.10.0) | never a swarm and no target on any diagonal; the rider rests on its mount after each; the mount moved on each diagonal; it is a march (or the single stack path), per diagonal |


## Notes on this standing (live round 1, module 0.10.0 on the world pentaryn)

Rounds: `live1` all 92 original checks on both paths; `live1b` the 27 extras and the corrected instruments; `live1c`, `live1d`, `live1e`, `live1f` instrument fixes re-run (S05.m, S05.o, S07.p-r, S05.a/g/h/i). Rounds `dbg1`, `hold1500`, `hold1500b` are diagnostics and are not in the standing.

Instrument fixes made in this round (scripts only): S16.a/b/c/e allow the "Out of movement this turn, stopped short" notice; S04.f is the shipped cap (more than 24 out of combat is core's drop) and S04.g the fight notice; S05.a/c leader tolerance 0.75 sq (dropB is a grid corner); S05.h tests the mud region at the token centres; S05.i routes to a square centre; S05.m B tokens moved off dropB; S05.o expects 30 ft per turn; S07.p-r speed 120 ft; run.py no longer sets the deleted groupStagger.

Drop-timing variant (`ZZ_HOLD=1500`, the pointer rests 1.5 s on the drop point; diagnostics only): with the default 250 ms hold a single drag across the stair (S05.a/b/d/g/h) is a silent no-op (status().group.last.reason "still", no notice) because the preview's cold search over the stair (about 370 ms warm-up, over 1 s on the first cold drop) has not finished; with a 1.5 s hold S05.a passes and S05.b passes on its warm runs (one move write, no pause over 150 ms, on the centre line within 0.022 sq). The first cold run still moves nothing even then. S05.g charges 130 ft for 118.3 ft walked and S05.h 240 ft where 212 ft is expected (the module charges each square entered, the check expects the distance walked on the stair). The S06 (S-curve, hairpin, pillar field), S07.d/l (vault), S15.a, S13.c, S09.c, S11.a, S02.d/i, S01.f failures are the same with the slow hold: they are module results, not drop timing.
