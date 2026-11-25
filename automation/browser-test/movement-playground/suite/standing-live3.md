# ZZ Playground suite - the standing (every check's latest result, all rounds so far)

rounds read: live1, live1b, live1c, live1d, live1e, live1f, live2, live2b, live3, live3b | module versions seen: ['0.10.0']
HARD 100 checks, 5 failing | GATED 12, 3 failing | REPORTED 7 (1 not clean) | void 0

| station | checks | pass | HARD/GATED fail | reported not clean | void | failing ids |
|---|---|---|---|---|---|---|
| S01 Open field - MARCH | 12 | 12 | 0 | 0 | 0 |  |
| S02 Arena - SWARM | 10 | 10 | 0 | 0 | 0 |  |
| S03 One-wide tunnel | 6 | 6 | 0 | 0 | 0 |  |
| S04 Twenty-monster tunnel | 7 | 7 | 0 | 0 | 0 |  |
| S05 Spiral C stair | 23 | 18 | 4 | 1 | 0 | S05.g S05.h S05.i S05.o S05.p |
| S06 Passage shapes | 9 | 9 | 0 | 0 | 0 |  |
| S07 Doors | 18 | 18 | 0 | 0 | 0 |  |
| S08 Unexplored room | 3 | 3 | 0 | 0 | 0 |  |
| S09 Dead end | 3 | 3 | 0 | 0 | 0 |  |
| S10 Narrow bridge | 4 | 4 | 0 | 0 | 0 |  |
| S11 Mud | 2 | 1 | 1 | 0 | 0 | S11.a |
| S12 One-way walls | 4 | 4 | 0 | 0 | 0 |  |
| S13 Door too narrow | 4 | 3 | 1 | 0 | 0 | S13.c |
| S14 Two-way lane | 3 | 3 | 0 | 0 | 0 |  |
| S15 Crowd behind a wall | 3 | 1 | 2 | 0 | 0 | S15.b S15.c |
| S16 Fight yard | 8 | 8 | 0 | 0 | 0 |  |

Failing (HARD and GATED):

- S05.g (HARD): charged within 3 % + 1 ft of the distance walked: charged 130 ft, walked 118.3 ft ({'entries': 62, 'sum': 130, 'last': 5, 'squares': 20.95, 'euclid_sq': 23.66})
- S05.h (HARD): charge = 5 ft x (walked + inside the region): charged 240, expected 212.4 (23.7 sq walked, 18.8 inside)
- S05.i (GATED): warm route under 50 ms: 118.7 ms
- S05.o (HARD): the second walk is charged by the distance walked (3 % + 1 ft of the history's length; core's own measure beside it): charged 30 ft, walked 25.1 ft, core's meas
- S11.a (HARD): route inside the mud <= 0.5 sq: 16.44 sq inside
- S13.c (HARD): the pack within 4 sq of it: max None
- S15.b (GATED): at most one centre within 0.6 sq of the door centre: up to 4 at once
- S15.c (GATED): plan under 100 ms: 156.4 ms

## S01 Open field - MARCH

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S01.a | HARD | state | pass | 0sq | live3 (0.10.0) | leader within 0.5 sq of the drop centre |
| S01.b | HARD | state | pass | -0.6661sq | live3 (0.10.0) | every member behind the leader (along <= -0.45 sq) |
| S01.c | HARD | state | pass | 2.828sq | live3 (0.10.0) | all members within 3.2 sq of the leader |
| S01.d | GATED | gpu | pass [loaded] | 49.1ms | live3 (0.10.0) | plan reported; plan under 100 ms |
| S01.d | GATED | state | fail (indicative) | 103.7ms | live3 (0.10.0) | plan under 100 ms: 103.7 ms (drop to first write 65 ms) |
| S01.e | GATED | gpu | pass | 1216ms | live3 (0.10.0) | pack frames seen; leader starts 4.0 sq behind the frontmost: pack start after the leader's, by 1233 ms at most |
| S01.f | HARD | state | pass |  | live3 (0.10.0) | last.shape == march; last.leader is the grabbed token; last.target is null; plan.members counts 8 (plan.total is the last start, ms: README) |
| S01.g | HARD | state | pass | 0sq | live3 (0.10.0) | leader within 0.5 sq of the drop; every member behind the last step of the leader |
| S01.h | REPORTED | gpu | pass | 0.32sq | live3 (0.10.0) | mover overlap max 0.32 sq (S01 Hero 2/S01 Hero 4), longest over 0.1 sq 1880 ms; fps 59.5; long frames >=100 ms: 0 |
| S01.i | HARD | state | pass | 8spots | live3 (0.10.0) | shape=march spots=8 keys=['failed', 'leader', 'members', 'ms', 'ok', 'order', 'pack', 'result', 'searches', 'shape', 'starts', 'target', 'total'] moved=0 |
| S01.j | HARD | state | pass |  | live3 (0.10.0) | version 0.10.0 |
| S01.k | GATED | gpu | pass | 164.2ms | live3 (0.10.0) | 8 cold: lastMs 43.4 / timingMs 41.4; 8 warm: lastMs 31 / timingMs 29.7; 20 cold: lastMs 148.6 / timingMs 145.1; 20 warm: lastMs 117.1 / timingMs 113.9 |
| S01.l | REPORTED | gpu | pass | 816ms | live3 (0.10.0) | 8 @4x cold: lastMs 303 / timingMs 286.7; 8 @4x warm: lastMs 160.1 / timingMs 152.4; 20 @4x cold: lastMs 816 / timingMs 793.4; 20 @4x warm: lastMs 602.7 / timingMs 581.7 |

## S02 Arena - SWARM

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S02.a | HARD | state | pass | 0sq | live3 (0.10.0) | leader touches the target (gap 0); on the side it came from (within 60 deg) |
| S02.b | HARD | state | pass | 8touching | live3 (0.10.0) | 8 members touch the target; the other 2 sit in ring 2 |
| S02.c | HARD | state | pass | 25.85deg | live3 (0.10.0) | mean side error <= 60 deg |
| S02.d | HARD | state | pass | 12touching | live3 (0.10.0) | 12 touch the Large target |
| S02.e | HARD | state | pass |  | live3 (0.10.0) | last.shape == march; last.target is null |
| S02.f | HARD | state | pass | -0.9901sq | live3 (0.10.0) | every member behind the leader |
| S02.g | HARD | state | pass | 4touching | live3 (0.10.0) | leader touches the friend; all four touch it; last.shape == swarm |
| S02.h | HARD | state | pass | 4touching | live3 (0.10.0) | leader touches the prop; all four touch it; last.shape == swarm |
| S02.i | HARD | state | pass | 8inside | live3 (0.10.0) | leader touches the pen target; all eight inside the pen |
| S02.j | GATED | gpu | pass | 1tokens | live3 (0.10.0) | at least half of them came through the door frame (the check is not vacuous); at most one centre within 0.6 sq of the door centre |

## S03 One-wide tunnel

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S03.a | HARD | state | pass | 0sq | live3b (0.10.0) | leader within 0.5 sq of the drop; all four inside the tunnel row; nobody level with or ahead of the leader |
| S03.b | HARD | state | pass |  | live3b (0.10.0) | no 'no space' notice |
| S03.c | HARD | state | pass | 0sq | live3b (0.10.0) | leader within 0.5 sq of the drop; all four inside the tunnel row; nobody level with or ahead of the leader; no notice naming a member (nobody left behind) |
| S03.d | HARD | gpu | pass | 0instants | live3b (0.10.0) | the leader overlaps a mate at some moment (it really passed through); leader drawn above the mate at every overlapping instant |
| S03.e | GATED | gpu | pass [loaded] | 30.5ms | live3b (0.10.0) | plan reported; plan under 100 ms |
| S03.e | GATED | state | pass (indicative) | 50.8ms | live3b (0.10.0) | plan reported; plan under 100 ms |
| S03.f | HARD | state | pass | 0sq | live3b (0.10.0) | leader within 0.5 sq of the drop |

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
| S05.a | HARD | state | pass | 0.7071sq | live3 (0.10.0) | hero ended in room B on the drop square (within 0.75 sq: dropB is a grid corner, its snapped square centre is 0.71 sq off) |
| S05.b | GATED | gpu | pass | 0.022sq | live3 (0.10.0) | one move write; no pause over 150 ms; clearance >= 0.15 sq; on the centre line (<= 0.05 sq) over the narrow stretch |
| S05.c | HARD | state | pass | 0.7071sq | live3 (0.10.0) | leader within 0.75 sq of the drop (dropB is a grid corner: its snapped square centre is 0.71 sq off); all four in room B; the leader sets off first |
| S05.d | HARD | gpu | pass |  | live3 (0.10.0) | the click landed while it moved; it rests off the square grid; on the centre line (<= 0.05 sq) |
| S05.e | HARD | state | pass |  | live3 (0.10.0) | arrived in B (long way) or refused with a notice |
| S05.f | HARD | state | pass |  | live3 (0.10.0) | the Large ends in room B |
| S05.g | HARD | state | fail | 11.7ft | live3 (0.10.0) | charged within 3 % + 1 ft of the distance walked: charged 130 ft, walked 118.3 ft ({'entries': 62, 'sum': 130, 'last': 5, 'squares': 20.95, 'euclid_sq': 23.66}) |
| S05.h | HARD | state | fail | 27.55ft | live3 (0.10.0) | charge = 5 ft x (walked + inside the region): charged 240, expected 212.4 (23.7 sq walked, 18.8 inside) |
| S05.i | GATED | state | fail | 124.6ms | live3 (0.10.0) | warm route under 50 ms: 118.7 ms |
| S05.j1 | HARD | state | pass | 1sq | live3 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j2 | HARD | state | pass | 1.101sq | live3 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j3 | HARD | state | pass | 1sq | live3 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j4 | HARD | state | pass | 1.298sq | live3 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.j5 | HARD | state | pass | 1sq | live3 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k1 | HARD | state | pass | 1sq | live3 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k2 | HARD | state | pass | 1sq | live3 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k3 | HARD | state | pass | 1sq | live3 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k4 | HARD | state | pass | 1sq | live3 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.k5 | HARD | state | pass | 1sq | live3 (0.10.0) | nobody named while the way has room; no two at rest within 0.98 sq; the server's waypoints at least 0.14 sq clear of walls |
| S05.m | HARD | gpu | pass | 0.7071sq | live3 (0.10.0) | each leader reached its drop (within 1.0 sq) or its group was named; every screen draws each token where its document is |
| S05.m | HARD | state | pass | 0.7071sq | live3 (0.10.0) | each leader reached its drop (within 1.0 sq) or its group was named; every screen draws each token where its document is |
| S05.n | HARD | gpu | pass |  | live3 (0.10.0) | the click landed while they walked; every member rests at least 0.14 sq clear of every wall; each token's drawn position equals its document |
| S05.o | HARD | state | fail | 30ft | live3 (0.10.0) | the second walk is charged by the distance walked (3 % + 1 ft of the history's length; core's own measure beside it): charged 30 ft, walked 25.1 ft, core's measure {'core': 30, 'charged': 30, 'n': 15} |
| S05.p | REPORTED | gpu | fail | 853.1ms | live3 (0.10.0) | nobody named and no route-timeout notice: named ['S05 Hero 3']; notices [] |

## S06 Passage shapes

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S06.a | HARD | state | pass | 0.25sq | live3 (0.10.0) | leader within 0.6 sq of the drop |
| S06.b | HARD | state | pass | 0.559sq | live3 (0.10.0) | leader within 0.6 sq of the drop |
| S06.c | HARD | state | pass | 0.25sq | live3 (0.10.0) | leader within 0.6 sq of the drop |
| S06.d | HARD | state | pass |  | live3 (0.10.0) | a notice says it cannot; the leader is not at the drop |
| S06.e | HARD | state | pass | 0.06sq | live3 (0.10.0) | leader within 0.6 sq of the drop |
| S06.f | HARD | state | pass | 0.5sq | live3 (0.10.0) | leader within 0.6 sq of the drop |
| S06.g | HARD | state | pass | 36.16sq | live3 (0.10.0) | walked >= 2x the straight distance |
| S06.h | HARD | state | pass | 0failed | live3 (0.10.0) | the plan failed for nobody (plan.failed = 0); nobody named in a notice; the leader within 0.6 sq of the drop; a march |
| S06.i | HARD | state | pass | 0failed | live3 (0.10.0) | the plan failed for nobody (plan.failed = 0); nobody named in a notice; the leader within 0.6 sq of the drop; a march |

## S07 Doors

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S07.a | HARD | state | pass | 0sq | live3 (0.10.0) | leader within 0.5 sq of the drop; all eight beyond the door |
| S07.b | GATED | gpu | pass | 1tokens | live3 (0.10.0) | at least half of them came through the door frame (the check is not vacuous); at most one centre within 0.6 sq of the door centre |
| S07.c | HARD | state | pass | 1sq | live3 (0.10.0) | no two of the eight closer than 0.9 sq at rest |
| S07.d | HARD | state | pass | 0sq | live3 (0.10.0) | the leader within 1.6 sq of the vault drop; every member within 3.2 sq of it |
| S07.e | HARD | state | pass |  | live3 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.f | HARD | state | pass |  | live3 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.g | HARD | state | pass |  | live3 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.h | HARD | state | pass |  | live3 (0.10.0) | a notice says there is no route; nobody ended behind the door |
| S07.i | HARD | state | pass | 0sq | live3 (0.10.0) | leader within 0.6 sq of the double-door room drop; all eight through |
| S07.j | HARD | gpu | pass |  | live3 (0.10.0) | the door was shut while they walked; each token's drawn position equals its document position |
| S07.k | GATED | gpu | pass | 78.5ms | live3 (0.10.0) | plan reported; plan under 100 ms |
| S07.k | GATED | state | fail (indicative) | 167.3ms | live3 (0.10.0) | plan under 100 ms: 167.3 ms |
| S07.l | HARD | state | pass | 0sq | live3 (0.10.0) | leader within 0.5 sq of the drop |
| S07.m | REPORTED | state | pass | 3inside | live3 (0.10.0) | leader within 0.6 sq of the drop; nobody named (room for all behind the door); nobody left standing in the door frame |
| S07.n | REPORTED | state | pass | 8inside | live3 (0.10.0) | leader within 0.6 sq of the drop; nobody named (room for all behind the door); nobody left standing in the door frame |
| S07.o | REPORTED | state | pass | 8inside | live3 (0.10.0) | leader within 0.6 sq of the drop; nobody named (room for all behind the door); nobody left standing in the door frame |
| S07.p | HARD | state | pass | 2inside | live3 (0.10.0) | the leader reached the drop (within 0.6 sq); nobody rests in the door frame unless stopped by speed |
| S07.q | HARD | state | pass | 8inside | live3 (0.10.0) | the leader reached the drop (within 0.6 sq); nobody rests in the door frame unless stopped by speed |
| S07.r | HARD | state | pass | 8inside | live3 (0.10.0) | the leader reached the drop (within 0.6 sq); nobody rests in the door frame unless stopped by speed |

## S08 Unexplored room

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S08.a | HARD | state | pass |  | live1 (0.10.0) | the hero is not in the unexplored room; the player is told (a notice) |
| S08.b | HARD | state | pass | 0sq | live1 (0.10.0) | leg corridor mouth reached; leg corner reached; last leg arrives in the room round the corner |
| S08.c | HARD | state | pass | 0sq | live1 (0.10.0) | GM's hero arrives |

## S09 Dead end

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S09.a | HARD | state | pass |  | live2 (0.10.0) | a notice says no route; nobody moved |
| S09.b | HARD | state | pass | 2sq | live2 (0.10.0) | leader within 0.6 sq of the drop; all within 4 sq of the leader |
| S09.c | HARD | state | pass |  | live2 (0.10.0) | Hero 4 stays, named, or ends behind the leader's last step |

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
| S15.a | HARD | state | pass | 3.162sq | live3 (0.10.0) | leader within 0.6 sq of the drop; all within 3.5 sq of the leader (balled up) |
| S15.b | GATED | gpu | fail | 4tokens | live3 (0.10.0) | at most one centre within 0.6 sq of the door centre: up to 4 at once |
| S15.c | GATED | gpu | fail | 153.6ms | live3 (0.10.0) | plan under 100 ms: 156.4 ms |
| S15.c | GATED | state | fail (indicative) | 338.7ms | live3 (0.10.0) | plan under 100 ms: 327.7 ms |

## S16 Fight yard

| id | kind | path | result | number | round | note |
|---|---|---|---|---|---|---|
| S16.a | HARD | state | pass |  | live3b (0.10.0) | every mover has a charge on record; charge == 5 ft x squares walked |
| S16.b | HARD | state | pass | 15ft | live3b (0.10.0) | the slow member moved; charged exactly 15 ft (3 squares) |
| S16.c | HARD | gpu | pass |  | live3b (0.10.0) | the leader is the first to move; each starts after the previous finishes (250 ms slack) |
| S16.d | HARD | state | pass | 60ft | live3b (0.10.0) | charge on record; charge == 5 ft x squares |
| S16.e | HARD | gpu | pass |  | live3b (0.10.0) | the click landed on a walking member; at least one member had not yet started (the check is not vacuous); nobody started to walk after the click |
| S16.f | HARD | state | pass |  | live3b (0.10.0) | both moved; the rider ends where it started relative to the horse (+-0.35 sq) |
| S16.g | HARD | state | pass | 12.08sq | live3b (0.10.0) | status().group.last.leader is the mount; shape march; the stack counts as one entry (plan.members 3 of 4 selected); the rider rests on its mount; the mount travelled (over 5 sq) |
| S16.h | HARD | state | pass |  | live3b (0.10.0) | never a swarm and no target on any diagonal; the rider rests on its mount after each; the mount moved on each diagonal; it is a march (or the single stack path), per diagonal |

