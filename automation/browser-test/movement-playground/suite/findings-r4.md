# Live round 4 - findings (0.10.0, module code unchanged; scripts only)

Gates before deploy: foundry-movement-check 498/0; make test 2461 passed; module-index + check-context OK (32 pre-existing warnings); simulator 10,000 seeds: 0 failing runs, every class 0 (mover overlap 25,679 episodes, p95 2,033 ms, 6,377 square-seconds; named 21,989).
Deploy: module.json unchanged since the world loaded 0.10.0 (no relaunch); make foundry-movement-sync, headless GM restarted, status().version 0.10.0, selftest ok, verify.js 556/556, active scene unchanged (ZZ M2 Lit Village).

## Open, the first limit: S05.p / S05.q (module defect, not fixed: last round)
Eight heroes over the stair, repeated legs on the GPU page. No wall crossed, no rest overlap, every charge core's, no module error, breaker never tripped, no "No route there." on any leg (X1 holds). But members are named ("Stayed where they stand, with no free spot they can reach"):
- S05.p (reported, 3 runs): perf.lastMs 966-997 ms for 8 heroes over the stair; named Hero 3 (twice) and Hero 5 in all three runs.
- S05.q (HARD) leg 1 A to B: Hero 3 named, rests at (4.5, 33.5) in room A. Leg 3 and 5 A to B: Heroes 3 and 5 named, rest at (8.5, 32.5) and (9.5, 32.5) in room A (the start squares). Legs 2 and 4 B to A: nobody named, but Heroes 4, 6, 7 are left in room B at (9.5, 44.5), (9.5, 45.5), (8.5, 44.5) without a notice. Last plan: stayed 2, failed 3 of 6 searches, crowded 1, plan.timingMs 204 (leg 5). X2's change (next clear point for a member whose route failed) did not remove it live; the cause is still unproven (Node does not reproduce it).
Evidence: out/r4/ev/S05.q-r1-gpu.json.gz, out/r4/shots/S05.q-r1-gpu.png, out/r4/ev/S05.p-r1..r3-gpu.json.gz.

## S05.i (GATED, new on the GPU page): warm narrow route 61.3 / 60.7 / 62.0 ms on the GPU page against the 50 ms gate (software GL had been the judge before). Route is found, narrow, minClearance ok. Node max 37.5 ms. Module speed on this page, not an instrument fault.

## S15.b (GATED, known limit R5's cap): 12 villagers at a door, up to 4 centres within 0.6 sq of the door at once (mover overlap only). S15.c (reported): 12 members plan 152-153 ms on the GPU page (reference 150).

## S11.a (reported, pre-existing): a march over painted mud crosses 16.4 sq of it (0.9.0 does the same; R9).

## Instrument fixed (script only): S05.h
S05.h compared the charge with core's one-shot Token#measureMovementPath of the finished history: 240 ft charged, 130 re-measured. The re-measure at rest ignores the region (one-shot = piecewise = 130). The 63 history entries match exactly "5 ft per square entered, 10 ft where the entered waypoint's centre is inside the region" (checked entry by entry). The check now uses that square rule as the oracle (lib/ck.py square_cost), reporting core's re-measure beside it. Rerun in round r4b: pass. S05.g/o keep core's one-shot measure (dry, agree).

## Timing checks on the software-GL page (state path) are indicative only
S07.k 153-189 ms and S15.c 326-358 ms at host load 12-14 caused by the software-GL harness itself; the GPU rows (S07.k 70-78 ms) judge.

## R11 on the GPU page (S01.k, reported beside the gate): 8 cold 44-49 ms, 8 warm 30-32; 20 cold 150-166 (gate 250), 20 warm 112-122. At 4x CPU throttle (S01.l): 8 cold 252-281, 20 cold 825-914.
