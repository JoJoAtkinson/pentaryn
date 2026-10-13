# Defect wave 2 (2026-10-12): transform

**Read this when:** you want the history of defect wave 2 for `pentaryn-transform` (Wild Shape,
Starry Form, the form HUD): what was fixed, why, in which commit, and how to check it live. This
is a record, not instructions. To operate the module, read its README.

Branch `fix2/transform-2026-10-12`. Every fix is a declared behaviour change, approved by Joe on
2026-10-12 ("Let's create a dynamic workflow to solve all of these things"). Where Joe gave no
ruling, the recommendation was taken. No fix was reverted: every committed item held on review.
Gate: `make foundry-transform-check` is green (323 node tests, 155 core, kit identical, conformance
100 %, 49/49).

## Fixes

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| transform-core-async-2 | With two GM tabs open, automatic endings (Wild Shape revert, carried effect ending, Starry Form ending, spent-form cleanup) ran in both tabs | recommendation | Each automatic ending is claimed by one tab and runs once, about 750 ms after it fires | a2282816 | two-sessions, lifecycle, starry, findings |
| perf-1 | Dragging a token or changing its light, visibility or elevation started a world-wide spent-form sweep | recommendation | Only a change to the token's actor, link, delta or dnd5e flags (or a token delete) starts a sweep | d0799566 | lifecycle |
| EXT-1 | The self-description claimed writes it doesn't make | recommendation | describe() lists the Wild Shape, Starry Form, light and claim flags as writes; the hand-set revert and keep-in-form item flags as reads only | 1c4372d5 | api |
| R1 | A failed form, constellation or Return click threw an unhandled rejection and left the tooltip on screen | recommendation | It logs a console warning, nothing else breaks, and the tooltip still goes away | fbe0e384 | findings |
| M5 (Argon collapse) | A click broke if Argon's HUD had no collapse-panels function | recommendation | The panels simply stay as they are | fbe0e384 | findings |
| wildcard-art-compendium, transform/wildcard-art-compendium, TR-WILD-1 | A beast straight from a compendium with wildcard token art (MM Wolf, `wolf-*.webp`) got the literal wildcard path or the mystery-man placeholder | recommendation | The form token gets the first matching file in sorted order, or the beast's portrait if nothing matches. A GM (or anyone who can browse files) lists files locally; only a player who can't browse asks the active GM. A wildcard beast with no token path gets its portrait at once. A GM can no longer relay to itself | 733d3a59, 700b881f | wildcard-art, core, findings |
| transform-core-async-3 | A Long Rest taken while shifted could be lost | recommendation | The rest always happens: it waits for a revert already in flight, rests the druid as they are if the form can't change back, or warns and lets dnd5e rest the form if no druid is found | b086d98f | lifecycle |
| perf-2 | Starry Form's combat tick looked the form up repeatedly | recommendation | One lookup per druid per tick; the 10-minute combat countdown is unchanged | 068209f0 | starry |
| M6 (starry doc) | The doc for "take on Starry Form" didn't list every false result | recommendation | It lists them all: shifted, incapacitated, out of uses, no feature (warn); unknown constellation, no actor, a call already running, a refused use (silent) | 9dc8f818 | api, glue |
| M7 | The Wild Shape refund for a closed or failed Starry Form was worked out in two places | recommendation | One exported refund(); the use comes back exactly as before | be9e90e8 | findings |
| EXT-2 | Wild Shape and Starry Form had separate ending listeners that could drift apart | recommendation | Both end (on Incapacitated or effect expiry, one GM tab) through one shared helper | 203e230b | findings |
| EXT-7 | Starry Form was recognised differently in different places | recommendation | Everywhere: by the `starry-form` identifier first, then the name "Starry Form" | fec005bf | core, findings |
| EXT-8 (module id) | Two names for the module id in the exports and tests | recommendation | One name, `MODULE`; no change at the table | 60838163 | core, core-split, findings |
| EC-4 (hot re-import) | A mid-session reload of the module never ran its first sweep | recommendation | The first sweep still runs 3 s after a hot re-import | 72d6aa5d | lifecycle |
| EC-3 (Argon button) | An item-less Argon Bonus-bar button vanished while shifted, as if it were Wild Shape | recommendation | It stays on the bar; Return and Wild Shape sit at the front, nothing duplicated | d2e394d3 | core, findings |
| EXT-10 | The Return button's name and picture source was unexplained | recommendation | Comment says why it uses the token's own name and picture, not the original-actor lookup | 8c877fbe | hud-buttons |
| R3 (uninstall) | One failing part could stop the module from switching off cleanly | recommendation | The failing part is named in a console warning; every hook and patch is still removed | 6cfb3290 | features, wildshape |
| M5 (portrait) | A Starry Form with unknown time left read "0 minutes" | recommendation | The portrait line shows just the form's name | 6608aa9b | core |
| M1 | A comment named the wrong users of the token-swap patch | recommendation | Comment names both files; no change at the table | 2d895746 | findings |
| M6 (tooltip) | A tile tooltip whose beast failed to load dropped the error silently | recommendation | The failure goes to the debug log with the form's uuid; the tile works as before | 72a050c0 | api, glue |
| R3 (revert effects) | Reverting from a compendium beast not loaded on that client copied the beast's own effects (e.g. Keen Smell) onto the druid | recommendation | The beast is loaded first, so its effects stay with it | 028c97c9 | features, wildshape |
| R5 | A portrait repaint failing on a game-clock tick threw an error | recommendation | Quiet "portrait line failed" warning; the portrait is left as it was | f5c23e9f | hud-bars |
| EC-2 | The Chalice pulse came back after swapping away and back within a minute | recommendation | Switching constellation ends the offer for good | 5a20a55e | hud-bars |
| EC-3 (Chalice docs) | It was unclear whose HUD shows the Chalice pulse | recommendation | Only the casting player's own HUD; README says so | 7153a7c1 | (docs) |
| EC-4 (Bonus pip) | After a shift or revert the rebuilt HUD's Bonus Action pip didn't show used without pentaryn-combat | recommendation | The pip shows used straight away either way | 46e102fd | hud-bars, features |
| EC-5 | An unlinked druid token's Return button showed the base actor's name and art | recommendation | It shows that token's own pre-shift name and picture ("Return to ZZ Thornback") | 8c877fbe | hud-buttons |
| EC-6 | A GM with a fast clock could have a form deleted while it was still being swapped onto its token | recommendation | A spent form is swept only after this GM tab has seen it tokenless for over 10 s | 7202c1bc | lifecycle, two-sessions |
| EXT-8 (size) | wildshape-adapter.mjs was over its size limit | recommendation | Form image and trait text moved to form-image-adapter.mjs; same output | def57458 | wildcard-art, core |
| transform-ui/lens-rerun | Chalice pulse ended after a real-time minute; a Starry change redrew the Bonus bar over another redraw; two quick rounds counted once | recommendation | The pulse lasts until used, the form ends or changes, or game time moves (a round in combat); bar rebuilds never overlap and a failed one warns; both rounds count | a37f9eba, d831d96a, c14f4dff, b892438a | hud-bars, starry |

## Goldens changed

- `test/golden/console-texts.json`: new warn/debug lines (claim stand-down, click failed, portrait
  line failed, uninstall part failed, Long Rest no-druid, tooltip load failure, Bonus bar rebuild).
- `test/golden/core-constants.json`: the frozen STARRY_FORM identity.
- `test/golden/core-exports.json`: the `MODULE_ID` alias removed.
- `test/golden/describe.json`: writes vs reads (claim flags written; revert and keep-in-form read).

## Live check after deploy

GM tab only, ZZ scratch docs only (create them, delete them after). No restart needed: reload.

1. **Claims (transform-core-async-2, EC-6).** On a ZZ scene, Wild Shape ZZ Druid. Set
   `flags.pentaryn-transform.claims.revert` on the form actor to a foreign socket id, drop the form
   to 0 HP: it stays, with the stand-down debug line in the console. Clear the flag, drop to 0 HP:
   one revert, one chat line, no claim flag left on the druid.
2. **Sweep (perf-1, EC-4).** Wild Shape ZZ Druid and Return: the spent form leaves the sidebar
   within about 3 s (plus the 10 s tokenless window). Drag a ZZ token for 10 s: no sweep debug
   line. Then `game.pentaryn.transform.uninstall()`, re-import `transform.mjs?v=2` and
   `hud.mjs?v=2`, with a spent ZZ form in the sidebar: it is swept without token traffic.
3. **Wildcard art (wildcard-art-compendium, TR-WILD-1).** Give ZZ Druid a Wild Shape profile for the
   Monster Manual compendium Wolf and shift: the token is one real wolf file (first sorted match),
   no "Invalid Asset" toast, same image on a second shift. `formImage({ uuid: <MM Wolf uuid> })`
   returns that path.
4. **Long Rest (transform-core-async-3).** ZZ Druid shifted: start `revert(form)` and, in the same
   tick, `form.longRest({ dialog: false })`. The druid ends in normal form with full HP, a Long
   Rest card and one return line.
5. **Clicks (R1, M5).** In ZZ Druid's Wild Shape picker, click a tile whose beast uuid was deleted:
   one console warn, no Uncaught (in promise), no tooltip left on screen.
6. **Argon bar (EC-3, EC-4).** Shifted ZZ Druid: every item-less Argon Bonus button still there,
   Return and Wild Shape at the front, nothing duplicated. With pentaryn-combat disabled, in a ZZ
   combat on the druid's turn, Wild Shape from the HUD: the Bonus pip greys on the rebuilt HUD.
7. **Return names (EC-5).** Unlinked ZZ Druid token renamed "ZZ Thornback", Wild Shape: Return reads
   "Return to ZZ Thornback" with its pre-shift art.
8. **Revert effects (R3).** Shift ZZ Druid into a beast from a ZZ pack copy carrying Prone, reload
   the GM tab, Return: no Prone or beast effect on the druid, no console error.
9. **Chalice (EC-2, lens-rerun).** ZZ Druid in Starry Form (Chalice) casts Cure Wounds from a slot:
   the Chalice button pulses. Swap to Archer and back: no pulse. Cast again, then advance one
   combat round: the pulse ends.

## FIX-3 forward fix (2026-10-13)

The FIX-2 live check failed items 1, 6, 7 and 9. One forward fix, branch
`fix2/transform-live-2026-10-13` (merges 61b1bd9e and 42c9cae6), every change [declared]:

| item | live failure | cause | fix | commits |
|---|---|---|---|---|
| 1 | A 0 HP auto-revert of a Bloodied form posted no return line ("_id [dnd5ebloodied000] already exists") | the revert copied the form's dnd5e Bloodied back with `keepId` while dnd5e was creating its own on the druid from the mirrored HP | `carriedConditions` leaves Bloodied to dnd5e, like exhaustion | 8e4ae4f7, 81d370b6 |
| 6 | A linked form had no Argon pips in combat (`maxActions` null) | the combatant keeps the druid's actorId, so `form.inCombat` is false | the Action/Bonus/Reaction/Special panels of a linked form count it in combat while the viewed combat seats its token, wrapping pentaryn-combat's own Action-panel override | 8e4ae4f7, 81d370b6, 2df99b5f, cc6de518 |
| 7 | An unlinked druid's revert item kept the base actor's portrait | `metaFor` read `host.img` | an unlinked druid's name and image come from its token | 8e4ae4f7, 81d370b6 |
| 9 | A Starry swap to Archer and back left the Chalice pulsing | the non-recursive Starry update reaches the hook as one ForcedReplacement, which `flattenObject` keeps as a leaf | the Chalice offer reads the effect's own constellation after the update | 8e4ae4f7, 81d370b6 |

Live re-check (GM tab, ZZ scratch scene, druid and combat, all deleted afterwards): item 1 passes
(20 then 0 HP, and 99 straight to 0: one revert, one return line, no claim flag, no console error).
Item 6 passes with pentaryn-combat enabled: after a new round, a Wild Shape on the druid's turn shows
pips on all four panels of the form, with the Bonus pip used. The pentaryn-combat-disabled variant
was not run, because switching a module off changes the world's module configuration; the
"EC-4: with pentaryn-combat absent" unit test covers it. Item 7 passes: "Return to ZZ Thornback"
with icons/svg/cowled.svg. Item 9 passes: the pulse comes on, ends after Archer and back, and ends
again after a combat round.
