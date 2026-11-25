# ZZ Playground suite - the checks

120 checks over 16 stations (92 from the first build + 26 added in live round 1, see "Live round 1 extras" at the end). Id = station + letter. Path: `state` = WSL harness (software GL: positions at rest, notices, charges, shapes, errors), `gpu` = BOSS GPU Chrome (timing, one motion, z-order, two screens, plan time, long frames), `both` = runs on each. `runs` = 3 for timing checks (void when the host load is over 3), else 1. `010` = new in 0.10: expected to fail on 0.9.0 (`expect010`, reported as xfail).

Every check starts from the station's reset (its scenario and mode), does one thing with real mouse input where a person would, and ends with no combat. Every HARD check also runs the guards: no module error in the console, the breaker did not trip, no token through a wall or shut door (drawn path and route, one-way walls by side), no token through or onto a standing token outside the group, no two tokens overlapping at rest (circle metric), every member moving or named within 4 s of the drop, and no notice that the check does not expect.

## S01 Open field - MARCH

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S01.a | state | HARD | 1 |  | default/paths | march: the leader ends on the drop square (8 heroes, 15 squares) |
| S01.b | state | HARD | 1 | yes | default/paths | march: nobody beside or ahead of the leader (all behind its last step) |
| S01.c | state | HARD | 1 | yes | default/paths | march: the pack is balled up behind the leader (all within 3.2 sq) |
| S01.d | both | GATED | 3 | yes | default/paths | march: the plan takes under 100 ms (8 members) |
| S01.e | gpu | GATED | 3 | yes | default/paths | march: the pack's first frame comes 100-400 ms after the leader's |
| S01.f | state | HARD | 1 | yes | default/paths | march: shape reported as march with this leader and no target |
| S01.g | state | HARD | 1 | yes | default/paths | march drop round the pillar: leader on the square, the pack behind its LAST step |
| S01.h | gpu | REPORTED | 1 |  | default/paths | march: mover overlap, frame rate and long frames (reported) |
| S01.i | state | HARD | 1 | yes | default/paths | planGroup dry run: the shape, a spot for each of the 8 members, and nobody moves |
| S01.j | state | HARD | 1 |  | default/paths | API: status().version is the module's, selftest() ok, telemetry({seconds}) answers |

## S02 Arena - SWARM

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S02.a | state | HARD | 1 | yes | default/paths | swarm on the Medium target: the leader touches it on its own side |
| S02.b | state | HARD | 1 | yes | default/paths | swarm on the Medium target: all 8 touching squares filled, the other two in ring 2 |
| S02.c | state | HARD | 1 | yes | default/paths | swarm on the Medium target: each member fills the square on its own side (mean 60 deg or less) |
| S02.d | state | HARD | 1 | yes | default/paths | swarm on the Large target: 12 touching squares filled (10 monsters + 4 heroes) |
| S02.e | state | HARD | 1 | yes | default/paths | drop on the hidden token (GM): a march, never a swarm |
| S02.f | state | HARD | 1 | yes | default/paths | drop on the hidden token: nobody ringed round it (everyone behind the leader) |
| S02.g | state | HARD | 1 | yes | default/paths | heroes dropped on a friendly token: a swarm (the leader touches it) |
| S02.h | state | HARD | 1 | yes | default/paths | heroes dropped on a prop: a swarm (the leader touches it) |
| S02.i | state | HARD | 1 | yes | default/paths | the pen: they file in through the door, then fan out round the target (leader touching, all inside) |
| S02.j | gpu | GATED | 3 | yes | default/paths | the pen: never two centres inside the door frame at once |

## S03 One-wide tunnel

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S03.a | state | HARD | 1 | yes | default/paths | tunnel: drag the four 11 squares in: no notice, a line inside behind the leader |
| S03.b | state | HARD | 1 | yes | default/paths | tunnel: no 'no free spot' / stayed-where-they-stand notice (the room is lengthwise) |
| S03.c | state | HARD | 1 | yes | back/paths | tunnel, leader last: the leader walks through its three mates to the front, then all follow in line |
| S03.d | gpu | HARD | 1 | yes | back/paths | tunnel, leader last: the leader is drawn above every mate it passes through |
| S03.e | both | GATED | 3 | yes | default/paths | tunnel: the plan takes under 100 ms (4 members) |
| S03.f | state | HARD | 1 |  | back/paths | tunnel: back to the room (drop in the mouth room): everyone comes out, nobody overlapping |

## S04 Twenty-monster tunnel

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S04.a | state | HARD | 1 | yes | front/paths | 20 in a tunnel, leader in front: all follow in file, every one sent within 4 s, the leader on the drop square |
| S04.b | both | GATED | 3 | yes | front/paths | 20 in a tunnel: the plan takes under 250 ms |
| S04.c | state | HARD | 1 | yes | back/paths | 20 in a tunnel, leader at the back: it walks through to the front, all follow |
| S04.d | gpu | HARD | 1 | yes | back/paths | 20 in a tunnel, leader at the back: drawn above every member it passes |
| S04.e | state | HARD | 1 | yes | cap/paths | cap: 24 selected are accepted (all moving or named within 4 s) |
| S04.f | state | HARD | 1 |  | cap/paths | cap: 25 selected out of combat: the module hands them to core (mode core, no plan of its own, no module error; as plan R11 says) |
| S04.g | state | HARD | 1 |  | cap/paths | cap: 25 selected in a fight: the notice "In a fight, drag one token at a time." and nobody moves |

## S05 Spiral C stair

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S05.a | state | HARD | 1 | yes | default/paths | stair: ONE drag of one hero crosses room A to room B (arrives, no wall crossed) |
| S05.b | gpu | GATED | 3 | yes | default/paths | stair: one move (a single route write), no pause over 150 ms, clearance >= 0.15 sq, within 0.05 sq of the centre line in the narrow stretch |
| S05.c | state | HARD | 1 | yes | default/paths | stair: a group of four dragged A to B: leader first, all four arrive in B, nobody overlapping |
| S05.d | gpu | HARD | 1 | yes | default/paths | stair: a click on the walker mid-stair rests it off-grid ON the centre line |
| S05.e | state | HARD | 1 |  | default/paths | stair: the Large is refused at the mouth (a notice, nobody through a wall) or takes the long way |
| S05.f | state | HARD | 1 |  | long/paths | stair, long way open: the Large takes the 2-wide way round into room B |
| S05.g | state | HARD | 1 | yes | default/paths | stair in a fight: the charge is core's own measure of the walk (R7: measureMovementPath of the history, 5 ft a square entered); the difference to the distance walked reported (sign-off F2 X4: was "the distance walked") |
| S05.h | state | HARD | 1 | yes | mud/paths | stair, mud painted over it, in a fight: the charge is core's own measure of the walk (the region costed by core); 5 ft x (walked + inside the region) reported beside it (sign-off F2 X4: was that length rule) |
| S05.i | gpu | GATED | 3 | yes | default/paths | stair: a warm narrow route takes under 50 ms on the GPU page and reports narrow + minClearance >= 0.15 (sign-off F2 X4: was the software-GL page) |

## S06 Passage shapes

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S06.a | state | HARD | 1 | yes | default/paths | S-curve (1.0 wide): the pair goes through and arrives |
| S06.b | state | HARD | 1 | yes | default/paths | diagonal slit 0.4 wide: passes |
| S06.c | state | HARD | 1 | yes | default/paths | funnel down to 0.3: passes |
| S06.d | state | HARD | 1 |  | default/paths | slit 0.2 wide: refused with a notice, nobody through |
| S06.e | state | HARD | 1 | yes | default/paths | hairpin whose lanes share squares: the long way round, no jumping the wall |
| S06.f | state | HARD | 1 |  | default/paths | a field of off-grid pillars: arrives |
| S06.g | state | HARD | 1 | yes | default/paths | hairpin: the route is the long way (at least twice the straight distance) |

## S07 Doors

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S07.a | state | HARD | 1 | yes | default/paths | open door: all eight file into the room behind it, the leader on the drop square |
| S07.b | gpu | GATED | 3 | yes | default/paths | open door: never two token centres inside the door frame at once (one at a time) |
| S07.c | state | HARD | 1 | yes | default/paths | open door: after the door the eight spread out again (nobody overlapping at rest) |
| S07.d | state | HARD | 1 | yes | default/paths | secret door: the only short way is never used; the group goes the long way round and reaches the vault |
| S07.e | state | HARD | 1 |  | default/paths | closed door: no route; nobody goes through, a notice says so |
| S07.f | state | HARD | 1 |  | default/paths | locked door: no route; nobody goes through, a notice says so |
| S07.g | state | HARD | 1 |  | default/paths | closed double door: no route; nobody goes through, a notice says so |
| S07.h | state | HARD | 1 |  | default/paths | closed diagonal door: no route; nobody goes through, a notice says so |
| S07.i | state | HARD | 1 | yes | allopen/paths | all ordinary doors open: the double and the diagonal door let the group in |
| S07.j | gpu | HARD | 1 |  | default/paths | a door shut mid-walk: nobody through it, each token rests where it is drawn |
| S07.k | both | GATED | 3 | yes | default/paths | doors: the plan takes under 100 ms (8 members, open door) |
| S07.l | state | HARD | 1 | yes | default/paths | secret door: the leader ends exactly on the vault drop square |

## S08 Unexplored room

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S08.a | state | HARD | 1 |  | default/sight pa | sight: the player's drag does not route over unexplored ground |
| S08.b | state | HARD | 1 |  | default/sight pa | sight: after walking round the corner the room is explored and the drag routes there |
| S08.c | state | HARD | 1 |  | default/sight pa | sight: the GM is unaffected (routes into the unexplored room) |

## S09 Dead end

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S09.a | state | HARD | 1 |  | default/paths | a drop behind the end wall: 'No route there', nobody moves |
| S09.b | state | HARD | 1 | yes | default/paths | into the pocket: the leader on the drop, the rest a line or a ball behind it |
| S09.c | state | HARD | 1 | yes | past/paths | a member already past the leader in the dead end stays, named |

## S10 Narrow bridge

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S10.a | state | HARD | 1 |  | default/paths | bridge: all six cross to the east room, nobody left in the chasm |
| S10.b | gpu | REPORTED | 1 |  | default/paths | bridge: crossing in single file (no two centres within 0.5 sq on the bridge while all are moving) |
| S10.c | state | HARD | 1 | yes | default/paths | bridge: a drop on the middle of the bridge leaves nobody overlapping, nobody in the chasm |
| S10.d | state | HARD | 1 |  | default/paths | bridge: a drop over the chasm is not a resting place |

## S11 Mud

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S11.a | state | REPORTED | 1 | yes | default/paths | mud (reported, pre-existing: 0.9.0 crosses too): the route takes the cheaper (dry) way round, the region is not crossed |
| S11.b | state | HARD | 1 |  | default/paths | mud, in a fight: the charge doubles only inside the region |

## S12 One-way walls

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S12.a | state | HARD | 1 |  | default/paths | one-way walls: from the west the route passes both walls from their open sides and arrives east |
| S12.b | state | HARD | 1 |  | default/paths | one-way walls: from the east the way back is the return corridor, never through a wall from its shut side |
| S12.c | state | HARD | 1 |  | default/paths | one-way walls: from the east to the middle room: round the loop and through the west wall from its open side |
| S12.d | state | HARD | 1 |  | default/paths | one-way walls: the walk is not cut by a one-way wall met from its open side (no stopped-short notice) |

## S13 Door too narrow

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S13.a | state | HARD | 1 |  | default/paths | a Large with a wide way round: takes the wide way, never the 1-wide door |
| S13.b | state | HARD | 1 |  | noround/paths | no way round: the Large stops before the door, body clear, and the GM is whispered |
| S13.c | state | HARD | 1 | yes | noround/paths | a Large LEADER stopped at the mouth: nobody moves and "No route there." (the shipped rule; R10's pack behind it, not built, reported) |
| S13.d | state | HARD | 1 | yes | noround/paths | a Large FOLLOWER stops where it last fits, those behind queue behind it |

## S14 Two-way lane

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S14.a | both | HARD | 1 |  | default/paths pa pb | two-way lane: both groups sent or named within 4 s, nobody left at rest on anybody |
| S14.b | state | HARD | 1 | yes | default/paths pa pb | two-way lane: no deadlock (both leaders reach their end) and every token is somewhere sensible |
| S14.c | gpu | HARD | 1 |  | default/paths pa pb | two-way lane: the two screens agree (each token drawn where its document is) |

## S15 Crowd behind a wall

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S15.a | state | HARD | 1 | yes | default/paths | crowd: they converge on the door, none through the wall, all end beyond it near the leader |
| S15.b | gpu | GATED | 3 | yes | default/paths | crowd: they go through the door one at a time (never two centres within 0.6 sq of the door) |
| S15.c | both | REPORTED | 3 | yes | default/paths | crowd (reported): the plan time for 12 members at a door, against 150 ms (R11's bounds scaled to twelve; was GATED at 100 ms) |

## S16 Fight yard

| id | path | kind | runs | 010 | scenario/mode | what it checks |
|---|---|---|---|---|---|---|
| S16.a | state | HARD | 1 |  | fight/paths | fight, group drag: every member is charged exactly 5 ft a square (nothing extra for the leader passing its member) |
| S16.b | state | HARD | 1 | yes | fight/paths | fight, group drag: the speed-15 member rests on the last square its speed pays for (15 ft charged) |
| S16.c | gpu | HARD | 1 | yes | fight/paths | fight, group drag: the leader first, then one member at a time (walks do not overlap in time) |
| S16.d | state | HARD | 1 |  | fight/paths | fight, single drag: Hero 1 alone is charged 5 ft a square (as in 0.9.0; the speed limit is not applied to a single drag) |
| S16.e | gpu | HARD | 1 |  | fight/paths | fight, group drag: a click on the walker ends the queue (members that had not started never start) |
| S16.f | state | HARD | 1 |  | fight/paths | fight: a mount and its rider dragged together stay together |


## Live round 1 extras (checks/s17_l1.py; the Fable check's list)

Extra tokens (ZZ Monster / ZZ Hero 5 made at the start of a check, flagged `extra`) are removed by the next reset as strays. All of them are 0.10 rules, so none is marked xfail.

| id | path | kind | what it checks |
|---|---|---|---|
| S06.h | state | HARD | ten tokens marched through the off-grid S-curve: status().group.last.plan.failed = 0, nobody named, a march, leader on the drop, no wall crossed |
| S06.i | state | HARD | ten tokens marched beside the off-grid pillar field: the same |
| S05.j1-j5 | state | HARD | four heroes dropped at 0.6 sq into the stair, dropStair45, dropMid, 150 degrees (1300,4370), the square just inside room B (950,4450): nobody named, no two at rest within 0.98 sq, no wall crossed, the server's waypoints (every move event's route) at least 0.14 sq clear of every S05 wall |
| S05.k1-k5 | state | HARD | the same with eight heroes (Hero 5-8 added in room A) |
| S05.m | both | HARD | two clients: Hero 1-2 (page pa) A to B and Hero 5-6 (page pb, made in room B) B to A at the same moment: each leader arrives or is named, zero rest overlap, zero wall crossing, every screen draws each token at its document |
| S05.n | gpu | HARD | a click on a group of four mid-stair: every member rests at least 0.14 sq clear of every wall, drawn = document, nobody overlapping |
| S05.o | state | HARD | stair in a fight: a 2-member group, speed 30 ft: the leader stops by speed mid-stair (charge 30 ft or less, off the square grid, 0.14 sq clear, charged exactly core's own measureMovementPath of the history; the distance walked reported), next turn it walks on from there (3 sq further or into room B; again 30 ft or less, charged exactly core's measure, clear of the walls, no wall crossed) (sign-off F2 X4: was "by the distance walked") |
| S07.m-o | state | REPORTED | one-wide open door: eight heroes dropped 2, 3 and 5 squares past it: how many rest inside, queue outside, are named (gated only on nobody named, nobody in the door frame; reported kind) |
| S07.p-r | state | HARD | the same in a fight on a diagonal approach (Hero 1-2 moved to the hall's south-west, speed 120 ft): nobody rests in the door frame unless the queue says it stopped by speed |
| S16.g | state | HARD | the rider grabbed in a group of four: last.leader is the mount, shape march, plan.members 3 (the stack is one entry), the rider rests on its mount |
| S16.h | state | HARD | the Large mount with its rider moved one square on each diagonal: never a swarm, no target, the rider on its mount, the mount moved |
| S01.k | gpu | GATED | R11 on the page: group.perf.lastMs (beside plan.timingMs) under 100 ms for 8 and 250 ms for 20 members on open ground, cold (right after a door toggle, which flushes the pathfinder's memo) and warm |
| S01.l | gpu | REPORTED | the same at 4x CPU throttle (CDP Emulation.setCPUThrottlingRate on the GM page) |
| S05.p | gpu | REPORTED | 8 heroes over the stair A to B (cold), B to A and A to B (warm): perf.lastMs reported; gated on nobody named and no route-timeout notice |
| S05.q | gpu | HARD | eight heroes dragged A to B, B to A, A to B, B to A, A to B over the stair, each leg from where the last left them, 4.5 s after each drop for the last wave: no "No route there.", nobody named, each rests in the drop's room or on the stair (on its centre line, 0.06 sq, where narrower than a token), the guards on every leg (sign-off F2 X3; S05.p keeps the plan time, reported) |
