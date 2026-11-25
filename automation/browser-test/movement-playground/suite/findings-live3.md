# Live round 3 - module findings the suite recorded (0.10.0 on the world, nothing changed by the suite)

## S05.p: 8 heroes dragged over the C stair, A to B, B to A, A to B ... (GPU page, diagnostic run of the same scenario, evidence out/live3/ev/S05.p-r*-gpu.json.gz and diag_s05p.json)

Heroes 1-4 start in room A with Heroes 5-8 added beside them; every leg selects all eight, grabs Hero 1 and drops on dropB (700,4500) or dropA (700,3200). Squares, hero number -> (x, y) at the end of the leg.

| leg | result | named / notice | plan | positions |
|---|---|---|---|---|
| A->B cold | plan | S05 Hero 3 Stayed where they stand, with no free spot they can reach: S05 Hero 3. | timingMs 696.7, failed 0, crowded 4, stayed 1 | H1 (7.5,45.5), H2 (9.5,44.5), H3 (4.5,33.5), H4 (9.5,45.5), H5 (10.6,44.47), H6 (8.5,46.5), H7 (8.5,45.5), H8 (8.5,44.5) |
| B->A | plan | -  | timingMs 275, failed 0, crowded 3, stayed 0 | H1 (7.5,32.5), H2 (10.5,32.52), H3 (8.5,32.5), H4 (11.58,32.72), H5 (9.5,32.5), H6 (9.5,45.5), H7 (8.5,44.5), H8 (9.5,44.5) |
| A->B | none | - No route there. | timingMs 179.5, failed 1, crowded 0, stayed 8 | H1 (7.5,32.5), H2 (10.5,32.52), H3 (8.5,32.5), H4 (11.58,32.72), H5 (9.5,32.5), H6 (9.5,45.5), H7 (8.5,44.5), H8 (9.5,44.5) |
| B->A again | plan | -  | timingMs 92.6, failed 0, crowded 0, stayed 0 | H1 (7.5,32.5), H2 (10.5,32.52), H3 (8.5,32.5), H4 (10.5,44.48), H5 (9.5,32.5), H6 (9.5,45.5), H7 (8.5,44.5), H8 (9.5,44.5) |
| A->B again | none | - No route there. | timingMs 109.2, failed 1, crowded 0, stayed 8 | H1 (7.5,32.5), H2 (10.5,32.52), H3 (8.5,32.5), H4 (10.5,44.48), H5 (9.5,32.5), H6 (9.5,45.5), H7 (8.5,44.5), H8 (9.5,44.5) |

Read:
- Leg 1 (cold, after a door toggle): Hero 3 is named 'no free spot they can reach' and stays in room A; the plan takes 697 ms (the page's perf.lastMs 864 ms), over the 100 ms gate for eight and the S05.p report.
- Leg 2 (B to A): the leader and four members cross; Heroes 6, 7, 8 shuffle inside room B and do not cross, with no notice (crowded 3). Nobody is named, so the 'every member moving or named' guard would not see it.
- Legs 3 and 5 (A to B with three heroes already standing in room B): 'No route there.' for the whole group (plan.failed 1, searches 5, nothing moves), every time, in 109-181 ms. The same drop with nobody in B (leg 1) found its route. Suspect: members already in B near the stair's mouth change the leader's route search (members standing in the destination room are the group's own, which the search should pass or ignore).
- Not a timeout: no route-timeout notice, the breaker did not trip, no module error.

## Other failures in the standing

- S05.g / S05.h / S05.o: the module charges what core charges (5 ft per square entered on a square grid; core's own measureMovementPath of S05.o's history is 30 ft, equal to the charge). Sign-off question, not a regression (decisions in b10/auto-decisions.md).
- S11.a: a march's straight route across the mud (core allows the straight path; the module does not re-route for cost). Fails on 0.9.0 too.
- S13.c: a Large leader stopped at a one-wide mouth moves nobody (known limit, plan R-notes).
- S15.b: the crowd of twelve at the door: up to four centres within 0.6 sq of the door centre at once on the GPU page (all three runs). The plan time for twelve is 153-156 ms on the GPU page (gate 100 ms).
- S05.i: warm narrow route 119-127 ms on the state path (software GL Chrome under load 13, so indicative; the GPU-page route in S05.b is 0.022 sq clean).
- Timing that passes on the GPU page now: S01.d 49 ms, S01.k (8 cold 43 ms, 20 cold 149 ms, warm 31/117), S07.k 78 ms, S03.e 28 ms. The state path (software GL) misses S01.d, S07.k at 104-174 ms, which is the host, not the page.
