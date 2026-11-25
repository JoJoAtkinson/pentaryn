# ZZ Playground suite - the standing (every check's latest result, all rounds so far)

rounds read: r3, t1, t2, t3, t4, p1, g1, g2, g3, p2, r1, g4, r2, g5, b1, live1, dbg1, live1b, live1c, live1d, hold1500, live1e, hold1500b, live1f, live2, live2b, live3, live3b, r4, r4b | module versions seen: ['0.10.0']
HARD 100 checks, 1 failing | GATED 11, 2 failing | REPORTED 9 (3 not clean) | void 0

| station | checks | pass | HARD/GATED fail | reported not clean | void | failing ids |
|---|---|---|---|---|---|---|
| S01 Open field - MARCH | 12 | 12 | 0 | 0 | 0 |  |
| S02 Arena - SWARM | 10 | 10 | 0 | 0 | 0 |  |
| S03 One-wide tunnel | 6 | 6 | 0 | 0 | 0 |  |
| S04 Twenty-monster tunnel | 7 | 7 | 0 | 0 | 0 |  |
| S05 Spiral C stair | 24 | 21 | 2 | 1 | 0 | S05.i S05.p S05.q |
| S06 Passage shapes | 9 | 9 | 0 | 0 | 0 |  |
| S07 Doors | 18 | 18 | 0 | 0 | 0 |  |
| S08 Unexplored room | 3 | 3 | 0 | 0 | 0 |  |
| S09 Dead end | 3 | 3 | 0 | 0 | 0 |  |
| S10 Narrow bridge | 4 | 4 | 0 | 0 | 0 |  |
| S11 Mud | 2 | 1 | 0 | 1 | 0 | S11.a |
| S12 One-way walls | 4 | 4 | 0 | 0 | 0 |  |
| S13 Door too narrow | 4 | 4 | 0 | 0 | 0 |  |
| S14 Two-way lane | 3 | 3 | 0 | 0 | 0 |  |
| S15 Crowd behind a wall | 3 | 1 | 1 | 1 | 0 | S15.b S15.c |
| S16 Fight yard | 8 | 8 | 0 | 0 | 0 |  |

Failing (HARD and GATED):

- S05.i (GATED): warm route under 50 ms: 61.3 ms
- S05.q (HARD): leg 1 to B: nobody named: named ['S05 Hero 3']; notices ['Stayed where they stand, with no free spot they can reach: S05 Hero 3.']; leg 1 to B: each in room B o
- S15.b (GATED): at most one centre within 0.6 sq of the door centre: up to 4 at once

Relabelled at the sign-off (F2, X4; none hidden: a changed criterion is void until rerun, a changed kind counts under it):

- S05.g (criteria): HARD on core's own measure of the history (R7); the distance walked reported (was: the charge = the distance walked, R9's words)
- S05.h (criteria): HARD on core's own measure of the history with the mud (R7); 5 ft x (walked + inside) reported (was: that length rule)
- S05.o (criteria): both walks HARD on core's own measure (R7); the distance walked reported (was: by the distance walked)
- S13.c (criteria): HARD on the shipped rule: nobody moves, "No route there." (was: R10's pack forms behind, not built); the pack distance reported
- S05.i (criteria): judged on the GPU page (was: timed on the software-GL page at load 11-14)
- S11.a (kind): REPORTED: pre-existing (0.9.0 marches straight over the mud too; R9: nothing costs more automatically)
- S15.c (kind): REPORTED against 150 ms (R11's bounds scaled to twelve; was GATED at the eight-member 100 ms)

## S01 Open field - MARCH

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S01.a | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.5 sq of the drop centre |
| S01.b | HARD | state | pass | -0.6661sq | r4 (0.10.0) | every member behind the leader (along <= -0.45 sq) |
| S01.c | HARD | state | pass | 2.828sq | r4 (0.10.0) | all members within 3.2 sq of the leader |
| S01.d | GATED | gpu | pass [loaded] | 49ms | r4 (0.10.0) | plan reported; plan under 100 ms |
| S01.d | GATED | state | pass (indicative) | 87.1ms | r4 (0.10.0) | plan reported; plan under 100 ms |
| S01.e | GATED | gpu | pass | 1218ms | r4 (0.10.0) | pack frames seen; leader starts 4.0 sq behind the frontmost: pack start after the leader's, by 1233 ms at most |
| S01.f | HARD | state | pass |  | r4 (0.10.0) | last.shape == march; last.leader is the grabbed token; last.target is null; plan.members counts 8 (plan.total is the last start, ms: README) |
| S01.g | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.5 sq of the drop; every member behind the last step of the leader |
| S01.h | REPORTED | gpu | pass | 0.32sq | r4 (0.10.0) | mover overlap max 0.32 sq (S01 Hero 2/S01 Hero 4), longest over 0.1 sq 1880 ms; fps 59.4; long frames >=100 ms: 0 |
| S01.i | HARD | state | pass | 8spots | r4 (0.10.0) | shape=march spots=8 keys=['failed', 'leader', 'members', 'ms', 'ok', 'order', 'pack', 'result', 'searches', 'shape', 'starts', 'target', 'total'] moved=0 |
| S01.j | HARD | state | pass |  | r4 (0.10.0) | version 0.10.0 |
| S01.k | GATED | gpu | pass | 164.9ms | r4 (0.10.0) | 8 cold: lastMs 45.8 / timingMs 43.6; 8 warm: lastMs 31.8 / timingMs 30.3; 20 cold: lastMs 164.9 / timingMs 161; 20 warm: lastMs 120.2 / timingMs 115.9 |
| S01.l | REPORTED | gpu | pass | 869.7ms | r4 (0.10.0) | 8 @4x cold: lastMs 281 / timingMs 270.6; 8 @4x warm: lastMs 162.8 / timingMs 155.5; 20 @4x cold: lastMs 824.8 / timingMs 807.6; 20 @4x warm: lastMs 711.8 / timingMs 688.3 |

## S02 Arena - SWARM

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S02.a | HARD | state | pass | 0sq | r4 (0.10.0) | leader touches the target (gap 0); on the side it came from (within 60 deg) |
| S02.b | HARD | state | pass | 8touching | r4 (0.10.0) | 8 members touch the target; the other 2 sit in ring 2 |
| S02.c | HARD | state | pass | 25.85deg | r4 (0.10.0) | mean side error <= 60 deg |
| S02.d | HARD | state | pass | 12touching | r4 (0.10.0) | 12 touch the Large target |
| S02.e | HARD | state | pass |  | r4 (0.10.0) | last.shape == march; last.target is null |
| S02.f | HARD | state | pass | -0.9901sq | r4 (0.10.0) | every member behind the leader |
| S02.g | HARD | state | pass | 4touching | r4 (0.10.0) | leader touches the friend; all four touch it; last.shape == swarm |
| S02.h | HARD | state | pass | 4touching | r4 (0.10.0) | leader touches the prop; all four touch it; last.shape == swarm |
| S02.i | HARD | state | pass | 8inside | r4 (0.10.0) | leader touches the pen target; all eight inside the pen |
| S02.j | GATED | gpu | pass | 1tokens | r4 (0.10.0) | at least half of them came through the door frame (the check is not vacuous); at most one centre within 0.6 sq of the door centre |

## S03 One-wide tunnel

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S03.a | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.5 sq of the drop; all four inside the tunnel row; nobody level with or ahead of the leader |
| S03.b | HARD | state | pass |  | r4 (0.10.0) | no 'no space' notice |
| S03.c | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.5 sq of the drop; all four inside the tunnel row; nobody level with or ahead of the leader; no notice naming a member (nobody left behind) |
| S03.d | HARD | gpu | pass | 0instants | r4 (0.10.0) | the leader overlaps a mate at some moment (it really passed through); leader drawn above the mate at every overlapping instant |
| S03.e | GATED | gpu | pass | 25.6ms | r4 (0.10.0) | plan reported; plan under 100 ms |
| S03.e | GATED | state | pass (indicative) | 66.1ms | r4 (0.10.0) | plan reported; plan under 100 ms |
| S03.f | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.5 sq of the drop |

## S04 Twenty-monster tunnel

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S04.a | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.6 sq of the drop |
| S04.b | GATED | gpu | pass | 31.9ms | r4 (0.10.0) | plan reported; plan under 250 ms |
| S04.b | GATED | state | pass (indicative) | 62.1ms | r4 (0.10.0) | plan reported; plan under 250 ms |
| S04.c | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.6 sq of the drop |
| S04.d | HARD | gpu | pass | 0instants | r4 (0.10.0) | it really passed through members; always drawn above them |
| S04.e | HARD | state | pass | 0sq | r4 (0.10.0) | no refusal for the group size; leader within 0.6 sq of the drop |
| S04.f | HARD | state | pass |  | r4 (0.10.0) | the module made no plan of its own (mode core, no plan) |
| S04.g | HARD | state | pass |  | r4 (0.10.0) | the notice says one token at a time; nobody moved |

## S05 Spiral C stair

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S05.a | HARD | state | pass | 0.7071sq | r4 (0.10.0) | hero ended in room B on the drop square (within 0.75 sq: dropB is a grid corner, its snapped square centre is 0.71 sq off) |
| S05.b | GATED | gpu | pass | 0.022sq | r4 (0.10.0) | one move write; no pause over 150 ms; clearance >= 0.15 sq; on the centre line (<= 0.05 sq) over the narrow stretch |
| S05.c | HARD | state | pass | 0.7071sq | r4 (0.10.0) | leader within 0.75 sq of the drop (dropB is a grid corner: its snapped square centre is 0.71 sq off); all four in room B; the leader sets off first |
| S05.d | HARD | gpu | pass |  | r4 (0.10.0) | the click landed while it moved; it rests off the square grid; on the centre line (<= 0.05 sq) |
| S05.e | HARD | state | pass |  | r4 (0.10.0) | arrived in B (long way) or refused with a notice |
| S05.f | HARD | state | pass |  | r4 (0.10.0) | the Large ends in room B |
| S05.g | HARD | state | pass | 11.7ft | r4 (0.10.0) | charged exactly core's own measure of the history (0.5 ft) |
| S05.h | HARD | state | pass | 27.6ft | r4b (0.10.0) | region really crossed; charged exactly the square rule core applies (5 ft per square entered, 10 ft where the entered point is in the mud region; every history entry, live round 4: the one-shot re-measure at rest ignores the regio |
| S05.i | GATED | gpu | fail | 61.3ms | r4 (0.10.0) | warm route under 50 ms: 61.3 ms |
| S05.i | GATED | state | void | 124.6ms | live3 (0.10.0) | [RELABELLED, rerun needed; stored: fail, GATED] warm route under 50 ms: 118.7 ms |
| S05.j1 | HARD | state | pass | 1sq | r4 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j2 | HARD | state | pass | 1.101sq | r4 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j3 | HARD | state | pass | 1sq | r4 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j4 | HARD | state | pass | 1.298sq | r4 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j5 | HARD | state | pass | 1sq | r4 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k1 | HARD | state | pass | 1sq | r4 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k2 | HARD | state | pass | 1sq | r4 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k3 | HARD | state | pass | 1sq | r4 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k4 | HARD | state | pass | 1sq | r4 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k5 | HARD | state | pass | 1sq | r4 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.m | HARD | gpu | pass | 0.7071sq | r4 (0.10.0) | each leader reached its drop (within 1.0 sq) or its group was named; every screen draws each token where its document is |
| S05.m | HARD | state | pass | 0.7071sq | r4 (0.10.0) | each leader reached its drop (within 1.0 sq) or its group was named; every screen draws each token where its document is |
| S05.n | HARD | gpu | pass |  | r4 (0.10.0) | the click landed while they walked; every member rests at least 0.14 sq clear of every wall; each token's drawn position equals its document |
| S05.o | HARD | state | pass | 30ft | r4 (0.10.0) | stopped by speed: charged 30 ft or less; not yet in room B (stopped short); rests off the square grid; rests at least 0.14 sq clear of the walls; next turn: it is Hero 1's turn again; it walks on from its off-grid rest (at least 3 |
| S05.p | REPORTED | gpu | fail | 986.5ms | r4 (0.10.0) | nobody named and no route-timeout notice: named ['S05 Hero 3', 'S05 Hero 3', 'S05 Hero 5']; notices [] |
| S05.q | HARD | gpu | fail | 5legs failing | r4 (0.10.0) | leg 1 to B: nobody named: named ['S05 Hero 3']; notices ['Stayed where they stand, with no free spot they can reach: S05 Hero 3.']; leg 1 to B: each in room B or on the stair's centre line: {'S05 Hero 3': 'at (4.50, 33.50), neithe |

## S06 Passage shapes

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S06.a | HARD | state | pass | 0.25sq | r4 (0.10.0) | leader within 0.6 sq of the drop |
| S06.b | HARD | state | pass | 0.559sq | r4 (0.10.0) | leader within 0.6 sq of the drop |
| S06.c | HARD | state | pass | 0.25sq | r4 (0.10.0) | leader within 0.6 sq of the drop |
| S06.d | HARD | state | pass |  | r4 (0.10.0) | a notice says it cannot; the leader is not at the drop |
| S06.e | HARD | state | pass | 0.06sq | r4 (0.10.0) | leader within 0.6 sq of the drop |
| S06.f | HARD | state | pass | 0.5sq | r4 (0.10.0) | leader within 0.6 sq of the drop |
| S06.g | HARD | state | pass | 36.16sq | r4 (0.10.0) | walked >= 2x the straight distance |
| S06.h | HARD | state | pass | 0failed | r4 (0.10.0) | the plan failed for nobody (plan.failed = 0); nobody named in a notice; the leader within 0.6 sq of the drop; a march |
| S06.i | HARD | state | pass | 0failed | r4 (0.10.0) | the plan failed for nobody (plan.failed = 0); nobody named in a notice; the leader within 0.6 sq of the drop; a march |

## S07 Doors

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S07.a | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.5 sq of the drop; all eight beyond the door |
| S07.b | GATED | gpu | pass | 1tokens | r4 (0.10.0) | at least half of them came through the door frame (the check is not vacuous); at most one centre within 0.6 sq of the door centre |
| S07.c | HARD | state | pass | 1sq | r4 (0.10.0) | no two of the eight closer than 0.9 sq at rest |
| S07.d | HARD | state | pass | 0sq | r4 (0.10.0) | the leader within 1.6 sq of the vault drop; every member within 3.2 sq of it |
| S07.e | HARD | state | pass |  | r4 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.f | HARD | state | pass |  | r4 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.g | HARD | state | pass |  | r4 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.h | HARD | state | pass |  | r4 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.i | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.6 sq of the double-door room drop; all eight through |
| S07.j | HARD | gpu | pass |  | r4 (0.10.0) | the door was shut while they walked; each token's drawn position equals its document position |
| S07.k | GATED | gpu | pass | 77.3ms | r4 (0.10.0) | plan reported; plan under 100 ms |
| S07.k | GATED | state | fail (indicative) | 162.9ms | r4 (0.10.0) | plan under 100 ms: 189 ms |
| S07.l | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.5 sq of the drop |
| S07.m | REPORTED | state | pass | 3inside | r4 (0.10.0) | leader within 0.6 sq of the drop; nobody named (room for all behind the door); nobody left standing in the door frame |
| S07.n | REPORTED | state | pass | 8inside | r4 (0.10.0) | leader within 0.6 sq of the drop; nobody named (room for all behind the door); nobody left standing in the door frame |
| S07.o | REPORTED | state | pass | 8inside | r4 (0.10.0) | leader within 0.6 sq of the drop; nobody named (room for all behind the door); nobody left standing in the door frame |
| S07.p | HARD | state | pass | 2inside | r4 (0.10.0) | the leader reached the drop (within 0.6 sq); nobody rests in the door frame unless stopped by speed |
| S07.q | HARD | state | pass | 8inside | r4 (0.10.0) | the leader reached the drop (within 0.6 sq); nobody rests in the door frame unless stopped by speed |
| S07.r | HARD | state | pass | 8inside | r4 (0.10.0) | the leader reached the drop (within 0.6 sq); nobody rests in the door frame unless stopped by speed |

## S08 Unexplored room

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S08.a | HARD | state | pass |  | r4 (0.10.0) | the hero is not in the unexplored room; the player is told (a notice) |
| S08.b | HARD | state | pass | 0sq | r4 (0.10.0) | leg corridor mouth reached; leg corner reached; last leg arrives in the room round the corner |
| S08.c | HARD | state | pass | 0sq | r4 (0.10.0) | GM's hero arrives |

## S09 Dead end

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S09.a | HARD | state | pass |  | r4 (0.10.0) | a notice says no route; nobody moved |
| S09.b | HARD | state | pass | 2sq | r4 (0.10.0) | leader within 0.6 sq of the drop; all within 4 sq of the leader |
| S09.c | HARD | state | pass |  | r4 (0.10.0) | Hero 4 stays, named, or ends behind the leader's last step |

## S10 Narrow bridge

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S10.a | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.6 sq of the drop; all six in the east room; nobody in the chasm |
| S10.b | REPORTED | gpu | pass | 0sq | r4 (0.10.0) | mover overlap max 0 sq (None), longest over 0.1 sq 0 ms |
| S10.c | HARD | state | pass |  | r4 (0.10.0) | the group moved to the bridge; nobody in the chasm |
| S10.d | HARD | state | pass |  | r4 (0.10.0) | the drop was answered (somebody moved, or a notice says why); nobody rests in the chasm |

## S11 Mud

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S11.a | REPORTED | state | fail | 16.44sq | r4 (0.10.0) | route inside the mud <= 0.5 sq: 16.44 sq inside |
| S11.b | HARD | state | pass | -6.213ft | r4 (0.10.0) | charge = 5 ft x (walked + inside the region) |

## S12 One-way walls

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S12.a | HARD | state | pass | 0sq | r4 (0.10.0) | leader within 0.6 sq of the drop |
| S12.b | HARD | state | pass | 0sq | r4 (0.10.0) | first leg (west to east): no wall violation; leader back in the west room within 0.6 sq of the drop |
| S12.c | HARD | state | pass | 0sq | r4 (0.10.0) | leader in the middle room within 0.6 sq of the drop |
| S12.d | HARD | state | pass |  | r4 (0.10.0) | the walk finished (leader on the drop); no cut-short notice |

## S13 Door too narrow

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S13.a | HARD | state | pass | 0.7071sq | r4 (0.10.0) | the Large arrives within 0.8 sq of the drop; its route never uses the door gap |
| S13.b | HARD | state | pass |  | r4 (0.10.0) | the Large did not pass the door; the GM is told (a notice or a whisper) |
| S13.c | HARD | state | pass |  | r4 (0.10.0) | nobody moved; the notice is "No route there."; the Large did not pass the door |
| S13.d | HARD | state | pass |  | r4 (0.10.0) | the Large did not pass the door; the heroes that were behind it did not pass it; the Large is named |

## S14 Two-way lane

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S14.a | HARD | gpu | pass |  | r4 (0.10.0) | every member moving or named within 4 s of its own drop |
| S14.a | HARD | state | pass |  | r4 (0.10.0) | every member moving or named within 4 s of its own drop |
| S14.b | HARD | state | pass | 0.7071sq | r4 (0.10.0) | west group's leader within 1.0 sq of the east drop; east group's leader within 1.0 sq of the west drop |
| S14.c | HARD | gpu | pass |  | r4 (0.10.0) | every token drawn at its document position on all three screens |

## S15 Crowd behind a wall

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S15.a | HARD | state | pass | 3.162sq | r4 (0.10.0) | leader within 0.6 sq of the drop; all within 3.5 sq of the leader (balled up) |
| S15.b | GATED | gpu | fail | 4tokens | r4 (0.10.0) | at most one centre within 0.6 sq of the door centre: up to 4 at once |
| S15.c | REPORTED | gpu | fail | 152.2ms | r4 (0.10.0) | plan under 150 ms (scaled reference): 153.4 ms |
| S15.c | REPORTED | state | fail (indicative) | 352ms | r4 (0.10.0) | plan under 150 ms (scaled reference): 326.5 ms |

## S16 Fight yard

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S16.a | HARD | state | pass |  | r4 (0.10.0) | every mover has a charge on record; charge == 5 ft x squares walked |
| S16.b | HARD | state | pass | 15ft | r4 (0.10.0) | the slow member moved; charged exactly 15 ft (3 squares) |
| S16.c | HARD | gpu | pass |  | r4 (0.10.0) | the leader is the first to move; each starts after the previous finishes (250 ms slack) |
| S16.d | HARD | state | pass | 60ft | r4 (0.10.0) | charge on record; charge == 5 ft x squares |
| S16.e | HARD | gpu | pass |  | r4 (0.10.0) | the click landed on a walking member; at least one member had not yet started (the check is not vacuous); nobody started to walk after the click |
| S16.f | HARD | state | pass |  | r4 (0.10.0) | both moved; the rider ends where it started relative to the horse (+-0.35 sq) |
| S16.g | HARD | state | pass | 12.08sq | r4 (0.10.0) | status().group.last.leader is the mount; shape march; the stack counts as one entry (plan.members 3 of 4 selected); the rider rests on its mount; the mount travelled (over 5 sq) |
| S16.h | HARD | state | pass |  | r4 (0.10.0) | never a swarm and no target on any diagonal; the rider rests on its mount after each; the mount moved on each diagonal; it is a march (or the single stack path), per diagonal |

