---
title: "pentaryn-movement 0.10.0 — handoff for Joe's play-test: the hands-on list and the report"
status: built
last_modified: 2026-11-24
tags: [foundry, plans, movement, pathfinding, handoff]
---

# pentaryn-movement 0.10.0: handoff (2026-11-24)

**Read this when:** you are about to play-test 0.10.0 on the ZZ Playground, or want to know what was built, measured, ruled and left open when it was handed over. **Not this file:** using drag movement → [`../foundry/movement.md`](../foundry/movement.md) · the design and every round's record → [`pathfinding-2026-11.md`](pathfinding-2026-11.md) §18 (§18.9 is this handoff in short).

Two parts: the hands-on list (30 minutes, two devices), then the report.

# Movement 0.10.0: Joe's 30-minute hands-on

Two devices. Device 1: log in as Gamemaster. Device 2: log in as ZZ Player8A (owns Hero 1-4, Large, Huge, Slow Hero, Fast Hero 1-3). ZZ Player8B (Hero 5-8, Tiny, Horse, Rider) is not needed: the Gamemaster owns everything and stands in for it. World pentaryn, ZZ documents only: the scene ZZ Playground, 16 stations in a 4 by 4 grid, no art, every wall also drawn as a line (dark wall, brown closed door, green open door, red locked door, purple one-way wall, blue chasm edge).

The stations are ordered by what to look at first: the five stations the sign-off asked about come first (S05, S07 with S15, S13, S01 with S02, S06), then the rest, which you can skim or skip when you are short of time. About 90 seconds a station.

## Before you start (3 minutes)

1. Device 1: Scenes tab, right-click ZZ Playground, View (not Activate: the table's active scene stays ZZ M2 Lit Village). Device 2: open the browser console (F12) and run `game.scenes.getName("ZZ Playground").view()`.
2. Device 1, console: `game.pentaryn.movement.status().version` should say 0.10.0, and `game.pentaryn.movement.selftest().ok` (it is a promise: `await game.pentaryn.movement.selftest()`) should say true.
3. Reset: Journal "ZZ Playground" lists the stations and links the two reset macros (a click on a macro link runs it). Or drag them to the hotbar: "ZZ PG reset: paths (vision off)" is the one you want for almost everything (token vision off, fog off, every token back on its start square, doors and mud restored, any combat deleted); "ZZ PG reset: sight (heroes only)" is for S08 only. "ZZ PG scenario..." opens a dialog (station, scenario, mode). Run the paths reset now.
4. To jump to a station, console: `canvas.animatePan({x: X, y: Y, scale: 0.6})`, with the X, Y of the station in its heading below (the centre of its 24 by 24 squares). Each station has its title and instruction drawn in the top two rows.
5. "Drag help" on (Token controls, the route icon) is the default and should be on; it is the only off switch there is.
6. If a move ever looks wrong, press Alt+W straight away on the device that saw it: "Thanks: that move was filed for the GM." The last ten seconds of that screen's drag telemetry go to pentaryn-feedback. Say which station it was.

How the drag rules read, in one breath: the token you grab leads. Dropped on the floor, the group marches: the leader ends on your drop square and everyone else rests behind it, never beside or ahead of it. Dropped on a token outside the group that you can see (friend, foe or prop), the group swarms: the leader touches it first and the others close in round it from their own sides. The leader may walk through its own group (drawn on top while it does), never through anyone else, a wall or a shut door. Nobody waits for another mover for long: within 4 seconds of the drop every token is on its way or a notice names it. In a fight the leader walks first, then the rest one at a time, 5 ft a square, and a member whose speed runs out stops on the last square it can pay for.

## Look at first

### S05 The spiral C stair (the case the build started from). Centre X 1200, Y 3700. Device 2, then Device 1.

1. Device 2: drag Hero 1 from room A (north) to room B (south), over the C. Look for: one smooth motion on the middle of the way, the ruler and the walk are the same line, the token never touches a wall, it ends on your drop square. The way is 0.4 square at its narrowest, narrower than the token.
2. Drag Hero 1 back to room A. Then drop it half way, on the narrowest part of the stair. Look for: it rests where you dropped it, off the grid, on the middle of the way. Drop it in the rock beside the stair: it rests on the nearest middle point.
3. Click Hero 1 while it is walking over the stair. Look for: it stops where it is drawn.
4. Device 2: box-select Hero 1-4 (leave the Large out) and drag Hero 1 to room B. Look for: Hero 1 goes first, the other three file behind it along the middle of the stair, nobody walks through a wall, nobody rests on anybody, and if anyone does not go, a notice names them.
5. Drag the same four back to room A, then to B, then back, three round trips in all, each time from where they stand. Look for: every drag goes ("No route there." must never come up), everybody ends in the room you dropped on or on the stair behind the leader. The known weak spot: a hero named "Stayed where they stand, with no free spot they can reach", or, going B to A, a hero left in room B with no notice at all. Say which leg and which hero.
6. Start a fight on this station: Device 1, select Hero 1, right-click, Toggle Combat State, then Begin Combat. Drag Hero 1 from room A to room B on Device 2 and read the movement spent. Look for: the number it charges. Known and your call: it charges 5 ft for every square the walk enters (a 118 ft walk is charged 130 ft; a 30 ft turn buys only 25 ft). Decide: keep core's squares entered, or charge the distance walked?
7. End the combat. Reset the station with the scenario dialog (station S05, scenario mud, mode paths) and walk Hero 1 through again: a march over the mud is charged nothing out of combat, and nothing costs more because the way is narrow, only the mud region does. Reset again for the default.

### S07 Doors and S15 Crowd. S07 centre X 6200, Y 3700. S15 centre X 6200, Y 8700. Device 1.

1. S07: box-select the eight heroes in the hall and drag Hero 1 into the room behind the open door (the first room, top right). Look for: they go through one at a time and spread out inside, behind the leader; nobody through a wall; nobody on anybody.
2. Reset, then drop the leader only two or three squares past the open door, just inside the room. This is the door plug, which you accepted: two or three come through and the rest wait outside though the room has space, and the free squares beside the leader are not used yet. Look for: is it as bad as you expected, or does a little more of the party need to come in? Then drag the party deeper into the room: they should all come in. (First backlog item.)
3. Door veto: drag the eight through the open door again and, while the queue is still in the doorway, click the door to shut it from Device 1. Look for: the door refuses to shut when a token would be jammed in it, with "Door blocked: <name> is in the doorway". Shut it once they are through: that works.
4. The other doors: a route only uses open doors, so the closed door, the double door, the diagonal door and the locked door all answer "No route there" and nobody moves. Scenario dialog, station S07, scenario allopen opens every ordinary door: now the double and diagonal doors let the group in (the locked one stays shut). The vault behind the secret door: the route goes the long way round, never through the secret door.
5. S15: box-select the twelve villagers bunched by the wall and drag one to the far side of the wall. Look for: they converge on the only door (6 squares aside), go through one at a time, ball up behind the leader. Several of them may be in the door frame at the same time (twelve at one door: the 4 second rule, accepted); none through the wall.

### S13 Door too narrow for a Large. Centre X 1200, Y 8700. Device 1.

1. Drag the Large (2 by 2) to the east room: it takes the wide way round. Then the Huge: the same.
2. Scenario dialog: station S13, scenario noround (the wide way is walled shut; only the 1-wide door is left). Drag the Large to the east room. Look for: nobody moves and "No route there." Decision for you: is that acceptable (reduced R10), or should a group led by a Large form up behind the place where it stops, at the door?
3. Drag the four heroes with the Large grabbed first: same notice. Grab a hero instead, drop in the east room: the heroes go, the Large (who cannot follow) stays where it stands and is named.

### S01 Open field and S02 Arena. S01 centre X 1200, Y 1200. S02 centre X 3700, Y 1200. Device 1.

1. S01: box-select all sixteen (eight heroes and eight monsters) and drag Hero 1 to the far point 15 squares east. Look for: the leader ends on the drop square, everyone behind it, nobody beside or ahead of it; when the leader starts at the back of the crowd, the pack waits until the leader is a wave past the front (about a second), then goes as one pack. Nobody should wait more than 4 seconds.
2. Drop it just behind the pillar: "behind" follows the leader's last step round the pillar, not the straight line of your drag.
3. S02: select the ten monsters and drag one onto the Medium target: swarm. Look for: the leader touches it on its own side, the others fill the touching squares from their own sides (8 round a Medium), the overflow in the next ring.
4. Drop them on the Large target (12 touching squares), a friendly token, a prop: all swarms. Drop them on the hidden token (Device 1 sees it as a GM): a march, never a swarm, also for you. On Device 2, select Hero 1-4 and drop on a monster: swarm.
5. The pen target (a walled pen with one open door): they file in through the door, then fan out round the target.

### S06 Passage shapes. Centre X 3700, Y 3700. Device 1, then Device 2.

1. Two heroes start in the hall. Drag one into each pocket: the S-curve (1.0 wide), the diagonal slit (0.4), the funnel (narrows to 0.3 and still passes), the pillar field. Look for: one smooth motion on the middle of the way every time.
2. The slit 0.2 is too narrow: "No route there" and nobody moves. That is the lower limit: any gap of 1.5 ft or more (0.3 square) is a way, with no switch, for a token up to 1 by 1. A real map may hold a gap that was meant to be shut: say whether this worries you.
3. The hairpin (two lanes share squares): drag one into its west end; the route goes east along the upper lane, round the U and back west.

## The rest (skim, or skip when short of time)

### S03 One-wide tunnel. Centre X 6200, Y 1200. Device 2.
Drag Hero 1 (four heroes selected) 11 squares into the tunnel: a line behind the leader, nobody named. Scenario back (the leader last in line): the leader walks through its mates to the front, drawn on top, then the line follows.

### S04 Twenty monsters in a tunnel. Centre X 8700, Y 1200. Device 1.
Drag to room E at the far end: all twenty follow in file. Scenarios front and back (the leader at the back walks through all the others). Scenario cap: select 24 (accepted, the new cap) and then 25 (out of combat the module hands it to core's own drop, a plain Foundry move; in a fight the notice "In a fight, drag one token at a time.").

### S08 Unexplored room (vision mode sight). Centre X 8700, Y 3700.
Run the scenario dialog: station S08, mode sight. Device 2: drag Hero 1 into the room round the corner that it has not seen: "No route there" (a player is not routed over ground it has not explored). Walk it along the corridor first, then drag: now it goes. Device 1 (the GM) is not restricted. Reset to paths afterwards.

### S09 Dead end. Centre X 1200, Y 6200. Device 2.
Drag behind the end wall (a sealed room): "No route there", nobody moves. Drag into the 3 by 3 pocket and to the end of the corridor: a line or a ball behind the leader. Scenario past: Hero 4 is already deeper than the leader will be: it stays and is named.

### S10 Narrow bridge. Centre X 3700, Y 6200. Device 2.
Six heroes over a 1-wide, 12-long bridge: single file, spread out on the far side, nobody in the chasm. Drop over the chasm: it must not become a resting place. Click a hero mid-bridge: it stops where it is drawn.

### S11 Mud. Centre X 6200, Y 6200. Device 2.
Drag east: a single token takes the cheaper dry way round the mud. A march crosses the mud in a straight line as 0.9.0 did (known: nothing costs more out of combat, only a fight charges it).

### S12 One-way walls. Centre X 8700, Y 6200. Device 2.
Drag east: the route passes both walls from their open sides. Drag from the east room to the west: the way is the return corridor, never through the walls.

### S14 Two-way lane. Centre X 3700, Y 8700. Both devices.
At the same moment: Device 2 drags Heroes 1-4 to the east end, Device 1 drags Heroes 5-8 to the west end. Look for: no deadlock, nobody left on anybody, both groups end up at their own end.

### S16 Fight yard. Centre X 8700, Y 8700. Both devices.
Scenario dialog: S16, scenario fight (a combat is running, Hero 1 has the turn). Device 2: select the heroes and drag Hero 1 to the far side. Look for: nothing moves at the drop, the leader walks first, then the others one at a time, each charged 5 ft a square; the slow one (speed 15) stops on the last square its movement pays for and a notice says so; the standing ally is not in the drag and is not walked through. Click the walker: the queue ends. Grab the Rider or the Horse: the mount leads and the rider goes with it.

## After

- Reset: run "ZZ PG reset: paths (vision off)" once more on the way out; it also deletes any combat on the scene and puts every token home.
- Tell Claude which drags felt wrong (station and device), what the numbers on the stair looked like, your answers to the two decisions (S05 step 6: squares entered or distance walked; S13: should a Large-led group form up at the door), and whether the door plug needs the beside-the-leader squares first.
- Everything here only touches ZZ documents; nothing real is changed.


---

# Report: movement 0.10.0 (2026-11-24)

Where it stands: pentaryn-movement 0.10.0 is live on the world pentaryn (the page reports 0.10.0, selftest passes), built on the branch movement-0.9 (pushed as a backup, nothing merged; main is 0.8.5). The sign-off verdict was: ship. The test bed is the scene ZZ Playground (16 stations) with two reset macros and the journal ZZ Playground; the playground and its 120-check suite are in the repo at `automation/browser-test/movement-playground/`.

The short version: every zero-tolerance rule held in the last live round (no wall or shut door crossed, no two tokens overlapping at rest, every fight charge exactly core's measure, no module error) except one: eight heroes dragged back and forth over the spiral stair can leave a hero named, or (B to A) left behind in the far room with no notice. Everything Joe decided is built; what he accepted (the door plug) and what could not be finished are listed below.

## Per feature: built, tested, numbers, known limits

**The leader rule (R1, R2).** Built: the token you grab leads (a rider grabbed: its mount leads); where you drop it picks the shape, a march on floor, a swarm on any visible token outside the group (a hidden token never, also for the GM). Tested: unit tests (lead, drop), simulator kinds swarm and hidden, suite S01, S02. Numbers: the leader is within 0 squares of the drop (S01.a), every member behind it (-0.67 square). Limits: none known beyond the door plug.

**March (R3).** Built: squares ranked by walk distance from the square the leader stepped out of on its last step, only squares nearer than the leader's own; each member in turn takes the best free square it can reach, one route search each; a one-wide hallway gives a line behind the leader. Tested: unit, simulator (every class 0), S01, S03, S04, S09, S10. Numbers: all eight within 2.8 squares of the leader. Limits: the door plug (below); a hairpin counts as one square for the plan.

**Swarm (R4).** Built: rings out from the target's whole footprint, never across a wall (8 touching squares round a Medium, 12 Large, 16 Huge), each member its own side first; a swarm's touching square that would wall off another waits. Tested: S02 (10 checks, all pass, the Large target 12 of 12). Limits: a swarm dropped on a narrow way keeps whole-square rings (not looked at).

**The motion (R5, R6).** Built: the leader goes in the drop's own update, drawn on top on every screen while it walks and through its own members; the pack follows one wave (150 ms) later, or, when the leader starts behind, once it is a wave past the frontmost (4 s at most); single file only at a narrow point; within 4 s every member is on its way or named. Tested: S01.e (pack frames; with the leader 4 squares behind the pack starts 1.2 s later), simulator 10,000 seeds, 0 breaches. Numbers: mover overlap 25,679 episodes in 10,000 seeds (p95 depth 0.97 square, 2.0 s). Limits: twelve at one door: 8 of 12 have no clear wave under 4 s and go at the least crowded one, up to four in the frame together (movers only); 6 of 200 open-ground drops hold one member a wave or more longer.

**The fight and the speed stop (R7).** Built: the leader walks first, then one at a time (least walk left), each slotted and routed at its turn, charged core's measure; a member whose speed runs out stops on the last square it can pay for. Tested: S16 (all 8 pass), simulator fight kinds. Limits: on an off-grid way the charge is core's squares entered (130 ft for 118 ft walked), Joe's call at S05 step 6; `status().group.last.plan` carries members and order only in a fight.

**Zero tolerance (R8).** Held live: no wall or door crossed, no rest overlap, no wrong charge, no module error. One miss: unnamed stragglers on the stair (S05.q), confined to big groups there. Mover overlap is measured, not failed.

**Any passage shape (R9).** Built: no switch; a way of 0.3 square (1.5 ft) or more passes for tokens up to 1 by 1, walked on the centre line, off the grid, out of combat and in a fight; S-curve, diagonal slit, funnel, hairpin, pillar field and the C stair. Tested: unit tests, S05 (21 of 24 pass), S06 (9 of 9). Numbers: a warm narrow route 61 ms on the GPU page (gate 50, a GATED miss; Node 37 ms). Limits: any 1.5 ft gap is now a way; a Large only where its body fits.

**R10 defaults.** A leader with no way: nobody moves, "No route there" (built). A Large leader stopped at a narrow mouth: the pack should form behind where it stops (NOT built: nobody moves). A Large follower that cannot follow stays, named (built). A member already past the leader in a dead end stays, named (built).

**The cap and speed (R11).** Cap 24 (was 12). On the GPU page, ordinary ground, `perf.lastMs`: 8 members cold 45 ms (gate 100), 20 cold 150 to 165 ms (gate 250). No fallback needed. Stress, reported apart from the gates: at 4x CPU throttle 8 cold 252 to 281 ms, 20 cold 825 to 914 ms; twelve at a door 156 ms; eight over the stair 0.7 to 1.0 s.

**Deleted (R12).** Done: formation spots, candidatesFor, rings, walkRatio, tries, the route-clearance test, the fixed-point passes, the three reorders, waveWays, sequence-core.mjs, the flood per member, fightSpots, routeAtTurn's spot list, sendWave's cut-short book-keeping, the "leader stays" branches, groupStagger and B0. Not met: drag assist 5,736 lines against the 4,200 target, narrow ways 1,294 against 280; stop.mjs grew from 842 to 1,384 lines and holds three stop rules the settle made redundant. Backlog, after the hands-on.

**API (R13).** `status().version`, `status().group.last` (mode, shape, leader, target, stayed, waves, plan), `planGroup`, `pathfind.route` (narrow, minClearance), `telemetry({ seconds })`, `selftest()`; the describe golden, api-manifest and README follow. Gates pass.

**Also built in the round:** a click-stop of a crowd settles front first (no rest overlap); a door is not shut on a jammed token ("Door blocked: <name> is in the doorway"); the playground and its suite.

## The gates

`make foundry-movement-check`: 498 pass, 0 fail (conformance 95.9 %, accepted exceptions C30 and C56). `make test`: 2,461 passed. `make foundry-module-index && make check-context`: OK. Simulator, 10,000 seeds: 0 failing runs, every class (passThrough, wallCross, wrongCharge, unsent, restOverlap, shape, errors) 0. The gates were rerun at the end of the handoff: `make foundry-movement-check` 498 pass / 0 fail, `make test` 2,461 passed (9 skipped, 4 xfailed), `make foundry-module-index && make check-context` OK (32 pre-existing warnings).

## The live table (the standing over all rounds; the GPU page judges timing)

| Station | checks | pass | open |
|---|---|---|---|
| S01 Open field, S02 Arena, S03 Tunnel, S04 Twenty-monster tunnel | 35 | 35 | none |
| S05 Spiral C stair | 24 | 21 | S05.q (HARD), S05.i (GATED, 61 ms), S05.p (reported) |
| S06 Passage shapes, S07 Doors, S08 Unexplored, S09 Dead end, S10 Bridge | 37 | 37 | none |
| S11 Mud | 2 | 1 | S11.a reported: a march crosses mud straight (as 0.9.0) |
| S12 One-way, S13 Door too narrow, S14 Lane, S16 Fight yard | 19 | 19 | none |
| S15 Crowd behind a wall | 3 | 1 | S15.b (GATED, four at the door), S15.c reported (152 ms for twelve) |

HARD 100 checks, 1 failing; GATED 11, 2 failing; REPORTED 9, 3 not clean. Rounds live1 to live3b and r4/r4b fixed the real defects each brought (a quick drop that did nothing, the leader's search cut at a member's cap, the page's plan time, a drop on the stair's throat, a Large swarm off a wall, and the sign-off fixes X1 and X2); the full triage is in [`pathfinding-2026-11.md`](pathfinding-2026-11.md) §18.6 to §18.9.

## Both Fable verdicts

**F1, the mid-build design check: fix.** The pathfinder, the motion and the fight were faithful and the simulator converged, but three blockers where the group plan met the new narrow field: the plan's step leaked through off-grid walls (B1), the line behind on a narrow way mostly failed (B2), a rider counted as a standing token so a mount could swarm its own rider (B3). All three fixed, each with a test. Shipped reduced: a Large leader at a mouth moves nobody; cap 12 only if the page gate missed (it did not).

**F2, the sign-off: fix, one last round, then ship; no rollback.** No zero-tolerance rule failed live and R11 was met (8 in 43 ms, 20 in 149 ms, cap 24), but on the stair a second group drag answered "No route there." every time because a member that stays took the leader's route with it (X1, fixed: the leader keeps its way through its own group). X2 mended the line behind (its live cause is unproven, S05.q still shows it), X3 and X4 were suite only. Ruled: the fight charge stays core's measure (Joe's call), several in a door under the 4 s rule accepted, the door plug's squares beside the leader to the backlog.

## Rulings made for Joe, and the automatic decisions

Rulings: the fight and simulator gates missed twice, so retry (Joe never relaxes rest overlap, he narrows the feature instead: refusing the one door shut that causes the breach is smaller than a settle off the way, and one seed in an adversarial GM sequence does not justify reverting the fight); the hard failures that remained live after the sign-off fixes were accepted (no wall, rest-overlap, charge or error breach and no data risk; the one R8 miss is confined to big groups on the stair, which 0.9.0 cannot cross at all, so reverting loses far more than it protects and Joe can judge it at the play-test).

Automatic decisions that matter (each question, choice and reason is in the run's scratch file `b10/auto-decisions.md`, 159 lines):

- The door plug's "beside the leader just inside" squares: not built, first backlog item (it changes the march ranks for every drop; open ground must keep nobody beside the leader).
- The fight charge on an off-grid way: core's measure, put to Joe as a question.
- A march over mud stays straight (nothing costs more automatically).
- The leader keeps its way through a member of its own group that stays (R6, "the group can never deadlock by blocking its own leader").
- A leader whose rest square is held by a member that stays: nobody moves, the notice names the member.
- The leader's route search 1,000 ms, a member's 400 ms, the plan 1,500 ms (a route over a narrow way took 130 to 250 ms on the page).
- The playground's own choices: Heroes 1 to 8 keep speed 0; S16 uses new ZZ Fast Hero 1 to 3 and ZZ Slow Hero; the scene is visible to ZZ Player8A and 8B only; a reset deletes all combats of the scene, also a station-scoped one; mud regions are always visible.
- The suite uses ZZ GM8H, ZZ Player8A and ZZ Player8B only; it never touched the Mac, a real user, actor, scene or journal.
- The module did not change after the sign-off commit `f3ead5b0`, so module.json is unchanged and no world relaunch was needed in the handoff.

## What is not done

- The pack forming behind a Large leader where it stops (R10, shipped reduced).
- The door plug's squares beside the leader just inside (accepted, first backlog item).
- The stair's stragglers (S05.p, S05.q): cause unproven, Node does not reproduce it; the next step is a live trace of the page's route to a line point.
- The code-size targets (4,200 and 280 lines) and the consolidation of `stop.mjs`.
- The warm narrow route (61 ms against the 50 ms gate).
- `main` is not touched: 0.10.0 lives only on the branch movement-0.9 until Joe has judged it.
