# What 0.9.0 does on the ZZ Playground (baseline for the 0.10 build)

Module 0.9.0 (the live world), Foundry 14.370, dnd5e 6.1.1, host BOSS. Taken 2026-11-24 between 11:20 and 13:15 while the build ran its gates on the same host (load average 0.2 to 14, noted per round), so **every time is indicative only**; positions, notices and charges are exact. State path = WSL harness (software GL, the drawn track at 30 fps), GPU path = BOSS GPU Chrome over CDP (58 fps, 50 ms latency on the player pages). One drag per row, real mouse input, from the station's reset. `xfail` = the check asserts a 0.10 rule and fails on 0.9.0 as expected; a `fail` that is not `xfail` would be a regression or a broken instrument (there is none left). Evidence per run: `out/<round>/ev/<id>-r<n>-<path>.json.gz`, failures narrated in `out/<round>/fails.md`.

Rounds: `p2` state S01 S03 S05 S07 S14 S16 · `g3` GPU the same · `r1` `r2` `r3` state, the other ten stations · `g4` `g5` GPU, S02 S04 S07 S10 S15 · `proof/out.json` the instrument proofs.

## S01 Open field, march (8 heroes, 15 squares)
| What | 0.9.0 |
|---|---|
| Leader on the drop square | yes, 0.00 sq off (S01.a passes) |
| Pack | **keeps its formation offsets**: members end up to 7.1 sq from the leader, up to 6.3 sq ahead of it, 3 of 7 beside or ahead (S01.b, S01.c); with the drop behind the pillar three members stand 3.2 to 6.5 sq ahead of the leader's last step (S01.g) |
| Pack start | **the same frame as the leader** (median 0 ms, S01.e; the 0.10 gate is 100 to 400 ms) |
| Plan time | `last.plan.ms` 290 to 301 ms on the state path (load 0.2), 159 to 197 ms on the GPU path (load 1.1); drop to first position write 47 to 85 ms; `plan.timingMs` is only the timing part there (0.3 to 1.2 ms) |
| Shape | `last.shape`, `leader`, `target` do not exist; `last.plan` = `{tier:"B1", ms, passes, stayed, members, waves, total, crowded, timingMs}` |
| planGroup dry run | answers with `{ok, result, ms, passes, order, starts, total, members:[{id,name,slot,waypoints,stay,delay}]}`: a spot per member, nobody moves, **no `shape`** (S01.i) |
| Frames (GPU) | 58.2 fps; mover overlap 0 (parallel lines); one long frame of 165 ms, in Pixi's `onPointerUp`, not the module |
| selftest | ok; `status().version` = `0.9.0` (S01.j passes) |

## S03 One-wide tunnel (the bug Joe saw)
| What | 0.9.0 |
|---|---|
| Four heroes dropped 11 squares in | **the leader walks to the drop, the three mates stay at the mouth**; notice `Stayed where they stand, with no free spot they can reach: S03 Hero 4, S03 Hero 3, S03 Hero 2.` (S03.a, S03.b) |
| Plan time | 727 to 787 ms state (tier B1, 2 passes, 3 stayed), 358 to 409 ms GPU |
| Leader last (scenario back) | **the leader does not move** (9.0 sq off the drop), Hero 2 and 3 stay, only Hero 4 (already in front) walks and ends past the drop (S03.c); notice names Hero 1, 2, 3 |
| z-order | nothing passes through a mate in 0.9.0, so the recorder sees no overlap (S03.d); the recorder itself is proven in `proof/` |
| Back to the room (scenario back, drop in the mouth room) | works, leader on the drop (S03.f passes) |

## S05 Spiral C stair
| What | 0.9.0 |
|---|---|
| One hero, A to B | **refused**: single drag goes to core (`mode core, reason noRoute`), toast `No route there.`, the hero does not move (S05.a) |
| Group of four | plan 218 ms, `stayed 4`, `No route there.`, nobody moves (S05.c) |
| Route probe | `pathfind.route` returns `ok:true, reached:false`, 31 to 37 ms warm; **no `narrow` or `minClearance` field** (S05.i) |
| The Large, default | moves one square, `Stopped short, way blocked.` (S05.e passes: refused with a notice) |
| The Large, scenario long (2-wide door open) | takes the long way round into room B, ends at (6,44) (S05.f passes) |
| One move / pause / clearance / centre line | nothing to measure: no move (S05.b, S05.d fail with "0 writes", "click missed") |
| Fight charge, mud charge | nothing to measure: the hero stops at (8.5,34.5) (S05.g, S05.h) |

## S07 Doors
| What | 0.9.0 |
|---|---|
| Open door, eight heroes, room behind it | **4 of 8 stay** (`Stayed where they stand, with no free spot ...: Hero 8, 5, 7, 4`), leader on the drop; plan 1.09 s state, 0.76 to 1.33 s GPU (S07.a, S07.c, S07.k) |
| One at a time through the door frame | up to **2 centres in the frame at once** (S07.b, 3 runs) |
| Closed, locked, double (closed), diagonal (closed) | `No route there.`, nobody moves, nobody through (S07.e to S07.h pass) |
| Scenario allopen, double door | 4 of 8 stay again (S07.i) |
| Vault behind the secret door | no member uses the secret door; the group goes round, but 3 of 8 end near the drop, the leader 0 to 1.0 sq off (varies between runs; S07.d, S07.l) |
| Door shut mid-walk (GPU) | shut at the leader's x = 5154; nobody through, **each token rests where it is drawn** (drawn = document, S07.j passes) |

## S16 Fight yard
| What | 0.9.0 |
|---|---|
| Group drag (Hero 1 grabbed, Hero 2, Hero 3 in the lane, Slow Hero) | the fight file: **one member at a time, nearest first, the leader last** (order Hero 2, Slow Hero, Hero 3, Hero 1; ~8 s in all); S16.c |
| Charge | every member **5 ft a square exactly**, 12 squares = 60 ft, nothing extra for passing a mate (S16.a passes) |
| Speed 15 member | **not stopped**: charged 60 ft like the rest (S16.b) |
| Single drag Hero 1 | 5 ft a square, 60 ft against a speed of 30, **not limited** (S16.d passes on the charge) |
| Click on the walker | ends the queue: clicked Hero 2 at (80.1,89.5), the other three never started (S16.e passes) |
| Mount and rider dragged together | stay together (0.71 sq apart before and after, S16.f passes) |

## S14 Two-way lane (two screens, GPU, 50 ms latency)
Both groups sent or named within 4 s of their own drop (S14.a passes); no wall or overlap fault; the three screens agree on every position (S14.c passes). **Deadlock**: Hero 4 reaches the east end (46.5) and Heroes 5 and 7 the west end (27.5); Heroes 1, 2, 6, 8 stay, named (`Stayed where they stand ...`, plus `Stopped short, way blocked.`); the west leader is 21.5 sq short (S14.b xfail).

## The other ten stations (one state pass, `r1`/`r2`/`r3`)
Passes on 0.9.0: S02.a S02.c (swarm onto a Medium target, the leader touches it on its own side), S04.b (see below), S06.c S06.d S06.f (funnel 0.3 passes, slit 0.2 refused with a notice, pillar field), S08.a S08.b S08.c (sight: refused over unexplored ground, routes after the corridor mouth and the corner, GM unaffected), S09.a S09.b S09.c, S10.a S10.d, S11.b, S12.a S12.b S12.c S12.d, S13.a S13.b, S14.a. Differences from the 0.10 plan, as seen: S02 only 1 to 2 members touch the target (swarm is not 8 + ring 2), a drop on the hidden token or in the pen moves nobody; S04 refuses nothing at 25 (the module hands more than 12 members to core: all 25 walk, overlapping at rest, no notice; `last.plan` absent so the plan gate has nothing to read, S04.b fails "no plan time"); S06 S-curve (1.0 wide), diagonal slit and hairpin: `No route there.`; S10.c drop on the bridge middle moves nobody; S11.a takes the mud (190 ft) although a dry way costs about 116 ft; S13 with no way round the heroes walk past the stopped Large (S13.c, S13.d); S15 `No route there.` for all 12 (plan 1.5 s).

## Instruments, proven
- Per-frame recorder: 58 fps on the GPU path, ~30 fps on the state path (`rafs` per second in each evidence file); long-animation-frame attribution works (the 165 ms frame above).
- Real mouse drags and clicks: `previewOk` on every drag; click-to-stop landed at x=7.22 on a 15-square drag and the hero rests at (677,1147), drawn = document (`proof/out.json`).
- z-order: a document move straight through three standing mates gives 56 overlap instants, `leader_below 56`; with the leader's `sort` raised to 900, `leader_below 0` (sort restored afterwards). A 0.9.0 group of 20 (S04.d) shows 142 of 142 instants below.
- Stair geometry: centre-line helper reads 0.000 on the station's own centre-line point and 0.073 at a 0.1 sq offset; clearance there 0.20, narrowest 0.40.
- Notices are read localised (`No route there.`), also the module's GM whispers; door-frame gates fail when nobody came near the door; plan gates fail when no plan exists.
- Two clients: S14 runs ZZ Player8A and ZZ Player8B at once with 50 ms latency on both, ZZ GM8H watching.
- The module's world settings were identical before and after every round (`unchanged` in each summary); no combat, chat message or moved token remains; ZZ actors' walk speeds are restored.
