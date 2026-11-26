# Joe's decisions (2026-11-22) — build these in

1. Combat checkpoint: every 1 square (keep `checkpointEvery` = 1).
2. Out-of-combat click-stop (REVISED 2026-11-23, Joe): stop EXACTLY where the token is drawn, no snap; a token in a doorway is carried just past the door line along its own route. Delete walkOut and its searches.
3. Clicking one member of a moving group stops the whole group. Refinement: if the clicker does not own every member, stop only the clicker's own tokens.
4. Multiattack: remember the weapon picked per swing for the rest of that combat; reset when the combat ends.
5. Deleting a Wall of Stone area/handle by hand ends the caster's concentration, with a chat line saying so.
6. Chains: do not follow the drag preview; follow the real token while it walks; redraw after the move.
7. Unreachable target: do not move at all; show a short warning to the dragger only ("No route there").
8. Large (2x2+) token facing a too-narrow door: take the wider route if one exists (no length cap needed per Joe: "take the longer route"); if none, do not squeeze — stop before the door (never inside a wall) and warn the GM. Joe will use ghost to pass them through by hand when he decides they fit.
9. (done) Push now, tagged pre-hard-case-2026-11-22.
10. (done) Cinebench + FrameView removed; Windows Terminal update staged.
Extra (Fable): a one-click GM toolbar toggle that turns pathfinding/group movement off for the table (falls back to plain Foundry dragging); mention it in the module README for players.
Process: movement is FIXES-ONLY until hard-case rounds come back clean twice. No game for two weeks: take the time, make it bug-free.

## Added 2026-11-23 (Joe, after Fable's xhigh review — review-fable.md)
- Combat door cut: a door shutting during a combat group move stops everyone on the square they hold; a square already committed past the door means that token got through. No undo writes, no re-settling walks.
- Combat group moves: space-based separation (moves whose swept corridors don't intersect run together; otherwise the later one starts on the earlier one's ARRIVAL event, not a clock). Until it passes, fight group drags fall back to core's move with hard-obstacle cuts.
- Ship by tiers A (single-token pathfinding, ruler, single stop), B (out-of-combat group drags), C (fight group drags); a tier that misses ships switched off.
- Joe will do a 30-minute hands-on session this week on two devices.
- (Joe, 2026-11-23) Combat doors, the simple rule: before the initiating client sends EACH next square's continuation in a fight, test the step from the token's current square to the next square against the CURRENT movement walls (closed doors, new walls, Wall of Stone). If blocked, the token stops on the square it holds — nothing past a shut door is ever sent, so no undo is ever needed. Use movement-wall collision, NOT the token's vision (dark squares, darkness, blinded and vision-less NPCs must still be able to move); players' planning already only routes over explored/visible ground. This replaces the fight door-cut machinery; review/fix steps must implement it this way.
- (Joe, 2026-11-23) After acceptance round 2 reports, STOP before fix:r2: Fable xhigh reviews what is going on (convergence vs patching, round-2 numbers, simulator failures, open AR1 defects) and looks for a smaller design that does the job (e.g. tier C off for good). Fixes resume only on Fable's recommendation.

## Added 2026-11-24 (Joe, on Fable review 2 — review-fable-2.md)
- Brief overlap between two tokens that are BOTH moving is allowed (soft, measured, never gated). Walls, shut doors, standing tokens, a mate at its slot, overlap at rest and fight charges stay zero tolerance. Nothing is ever held back waiting for another mover.
- In a fight, a group drag walks one member at a time (each a normal single move, exact cost); tier C / fightGroupDrags deleted. If that misses its gate, refuse group drags in a fight.
- A click on any member of a moving group stops the whole group (supersedes decision 3's "only the clicker's own" refinement).
- Build Fable's smaller design (review-fable-2.md §2, §4) on a branch; main keeps 0.8.5 until the GPU round passes. Joe's 30-min hands-on comes before any automated round.

## Added 2026-11-24 (Joe, after his first hands-on of 0.9.0) — the LEADER rule
Joe: "very happy with the overall"; single file only when it has to be is right.
- The leader of a group drag = the member you grabbed and dragged (no targeting, ownership or level rules).
- Destination: the leader ends on the drop square; everyone else CONVERGES and clusters around that spot as close as fits, on the side they came from, so the leader is in front. Formation offsets are NOT kept (the dragons sliding in parallel lines was wrong).
- Motion: leader sets off first; once it is half a square ahead the rest set off and move as one pack. Only at a narrow point (door, 1-wide tunnel) does it become leader-first single file, one through a door at a time; spread out again past it.
- One-wide hallway: members line up along it behind the leader. BUG seen: dragging the party into a tunnel said there was no space though the hallway had room lengthwise.
- In a fight: leader walks first, then the rest one at a time, exact charges.
- Brief overlap while moving is fine (5 ft squares are loose); at rest nobody overlaps so every player can see each token.
- Joe handles special orders (wizard last) by moving sub-groups in turn.
- (Joe, 2026-11-24, refinement) TWO shapes, chosen by WHERE you drop:
  - MARCH (drop on open floor): the leader is always in front; everyone balls up BEHIND the leader, relative to the direction dragged (exploring, leading the party through caves — the party must not ball around him).
  - SWARM (drop onto a token that is not in the moving group — a minion, a hero, anyone): the leader is guaranteed a spot touching the target, and everyone else surrounds the target, each converging from its own side (select monsters 360° round a hero and they all close in). Through a doorway: they file in through the door, then fan out round the target.
  - Storytelling intent: "the leader leads the charge and everyone follows behind" vs "the group swarms a target to end them".
- (Joe, 2026-11-24) Tunnel / leader at the back: in a narrow way (e.g. 20 monsters in a tunnel) everyone piles up behind the leader. If the leader starts at the back, it may walk THROUGH its own group's members (friendlies) to the front, then everyone follows. The leader is drawn on top while it passes (z-order above the others, never hidden behind them). Purpose: the group can never deadlock by blocking its own leader; simpler logic. Only through members of the moving group — never through standing non-members, walls or shut doors.
- (Joe, 2026-11-24) Leader passing through its group: out of combat it moves normally (no extra cost); in combat each ally square passed costs as Difficult Terrain (2024 rule), charged exactly.
- (Joe, 2026-11-24) TEST MAP: add a spiral staircase to the ZZ test maze — a "C" of curved, off-grid walls with a room on each side. The way is narrow (down to ~2 ft, narrower than a token) and only a few whole squares fit; today a player can only get through with Shift (free move between squares) in many moves — this case is what started the whole build. SUCCESS: from any point, one drag (single or group) crosses from one room to the other in one smooth motion; a group: the dragged leader starts first and the rest file behind; all walk the centre line of the way with fair padding from both walls, though the tokens are wider than the way. Characters do not need a full 5 ft to walk: a way narrower than a token is still passable. Possibly Difficult Terrain in combat (Joe tentative).
- (Joe, 2026-11-24, answered) Stair in a fight: a token dropped/stopped mid-stair rests off-grid where it is, charged by distance walked. Stair cost: nothing automatic — normal cost unless the GM paints a Difficult Terrain region.
- (Joe, 2026-11-24, on review-fable-3.md — SUPERSEDES the earlier ally-cost line) The leader passing through its own group costs NOTHING extra in a fight either (2024 rule: allies exempt; dnd5e charges nothing). No house rule.
- Swarm is triggered by any visible token outside the group (friend, foe or prop); a hidden token never, also for the GM.
- In a fight, a GROUP member whose speed runs out stops on the last square its movement pays for (a free square; if occupied, the last free one before it). Single drags unchanged.
- The pack's head start is about one square (one 150 ms wave), not half a square.
- Build plan: review-fable-3.md §4 steps 1–9 (stair last, own switch).
- (Joe, 2026-11-24) The spiral stair is NOT a separate feature and gets NO switch of its own: pathfinding itself must handle any passage shape — the path ignores the grid and only needs enough clear space; a curve is just continuous corner-cutting. The C-stair is a test case of normal pathfinding. (The existing assist toggle remains the only off switch.)

## Added 2026-11-24 (Joe, leaving on a trip) — FULL AUTO
- Fable (xhigh) designs the build workflow (steps, models, gates, Fable review points); the orchestrator launches it without asking.
- Model split: Opus drives (design-heavy code, fixes, briefs); Sonnet does the grunt work (map, resets, test runs, numbers, docs, cleanup); Fable only for key reviews, at the effort the moment deserves.
- Any decision that would need a human, or any stop of the workflow: send it to Fable (medium effort) to resolve, then continue.
- Done = something fully prepared for Joe to play-test with every feature implemented as well as possible: live on the world (ZZ playground map with all stations, reset, vision modes), a hands-on checklist, and a short report.
- Playground: ~100x100 squares, no art, labelled stations for every use case (spiral C-stair, 1-wide tunnel, doors incl. secret, unexplored room, dead end, narrow bridge, mud, one-way walls, door too narrow for a Large, open field for march, arena with a target for swarm, two-way lane, crowd bunched behind a wall, 20-monster tunnel), one-click reset that also sets vision mode (off for most pathfinding tests; on with sight on player heroes only). Automated tests use the same map.
- (Joe, 2026-11-24, during the 0.10 run) BOSS is fully yours for testing: no live players this period, use the whole PC (GPU Chrome with more clients, long runs, the harness in parallel when it doesn't spoil a timing run). Stress testing is welcome where it makes sense: big groups (20–24 members), several clients dragging at once, 4x CPU throttle, latency/loss, long sessions for leaks and long-frame drift. Report stress results separately from the pass/fail gates (a stress miss is a finding to fix or document, not a reason to roll back unless it shows a stuck token, wrong charge, pass-through or error).
- (Joe, 2026-11-24) The "door plug" is ACCEPTED behaviour, not a defect: a leader dropped just past a door has no room behind it to ball up, so the rest wait in the doorway/corridor — a transition state. The GM corrects by dragging the party fully into the room. (A swarm onto a target inside still goes in around the target.) Do not spend fix rounds on it; describe it plainly in the docs/checklist.
- (Joe, 2026-11-24, refines the line above) Judge each in-between state organically, as people coming in: when the leader is dropped just past a door, a few more should come through and take the free squares just inside, BESIDE the leader (never ahead of it), rather than stopping strictly at "behind"; only those with no free square inside wait in the doorway/corridor. When the drop is deeper in the room, the longer stream-in brings everyone in naturally. Rule of thumb for review: "would a little more of the party have come through the door here?" — if yes, that's a defect to fix. Not a reason to roll back; a fix-round item if cheap, else first backlog item.

## Added 2026-11-25 — fight charge on off-grid ways (Joe, final)
Keep core's measure: in a fight a walk on an off-grid narrow way (the stair) is charged 5 ft per grid square entered, exactly as the ruler shows (118 ft walked → 130 ft charged). NOT the distance walked. R9's "charged by distance walked" is superseded. S05.g/h/o are correct behaviour, not open items. Stair cost beyond that only via GM-painted Difficult Terrain.

## Added 2026-11-25 — next build: 0.10.2 door plug + no freeze, then a cleanup pass (Joe)
1. Door plug: judge each in-between state organically (block above, 2026-11-24): a leader dropped just past a door/mouth → more come through and take free squares just inside BESIDE the leader (never ahead); deeper drop → everyone in. Rule of thumb "would a little more of the party have come through here?".
2. No page freeze on big drops over narrow ways (0.6–0.9 s for eight over the stair today): make planning not block the page (async/yield) and optimise where clear.
3. Then pin base functionality with a fleet of unit tests, and clean up / tighten the code (Sonnet does the work, Opus orchestrates). Performance improvements during cleanup only where clear; behaviour must stay identical (unit tests + simulator 10,000 seeds identical to the post-1-2 baseline). Make the module follow the pattern of Joe's other plugins (addon blueprint). Group-by-roll (dnd5e combatant groups): NOT needed — selection-based group drag stays as designed.
