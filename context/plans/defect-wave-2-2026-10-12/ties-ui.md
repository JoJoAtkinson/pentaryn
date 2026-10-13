# Defect wave 2 (2026-10-12): ties-ui (pentaryn-ties)

**Read this when:** you want the history of defect wave 2 for the ties UI (`pentaryn-ties`: the Ties, Known and Attributes sheet tabs, the tie dialog, cards and wires, the Look, Inspect and Attribute Review windows). It records what was fixed, why, and how to check it live. It is history, not instructions.

Source record: [`final-review-2026-10-12/`](../final-review-2026-10-12/) (the ties-ui findings). Branch `fix2/ties-ui-2026-10-12`.
Gate: `make foundry-ties-check` is green. The vendored kit is identical to `foundry/lib`. Conformance is 96.1 % (49/51), with two accepted exceptions (C05 and C37, both already in `exceptions.json`).

Every item is a DECLARED behaviour change with a line under the CHANGELOG `Unreleased` header. Joe approved the wave on 2026-10-12. Where Joe gave no ruling the recommendation was taken, within his standing principles: track rather than block, prefer native, and treat console-only output as fine. No item was reverted: every committed item holds.

## Items

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| ties-ui-E2 | Opening a hidden Known entry (key 5 / `known.open`) did nothing visible | Recommendation | Only that entry is un-hidden and shown open, even if the sheet was already open. Other hidden entries stay hidden. | `6acbcc83` | `test/known-open-hidden.test.mjs` |
| ties-ui-M2 | The stance chip lost its chip look because filter buttons shared `.pt-chip` | Recommendation | Filter and tab buttons now use `pt-filter-chip`. On a narrow sheet the stance chip shrinks to the dot again. | `6eb602c4` | `test/filter-chip.test.mjs` + goldens |
| ties-ui-ACC-3 | A second quick edit (pip, remove, Known) could undo the first while the first was still saving | Recommendation | Each actor's ties and Known writes are queued, so both edits stick. | `3b48ed87` | `test/write-queue.test.mjs` |
| ties-ui-EXT-2 | The actor-delete sweep hard-coded which sheet tabs to clear | Recommendation | Each sheet tab declares `forget(actorId)`, and the delete loops over `SHEET_TABS`. No change at the table. | `c7396b9f` | `test/session-maps.test.mjs` |
| ties-ui-EXT-3 | Ties notes saved twice, and the last keystrokes could be lost on blur | Recommendation | Ties and Known share one autosave: 0.7 s after typing stops, plus a flush when you click away. Each note is saved once. | `6e56ff67` | `test/notes-autosave-shared.test.mjs` |
| ties-ui-EXT-4 | The Look window and the Player view had two heading tables, and an unknown fact kind fell under "What they are" | Recommendation | One `GROUP_LABEL` table. An unknown kind is headed with its own name. | `b43c4268` | `test/group-label.test.mjs` |
| ties-ui-ACC-2 | A share switch clicked during a Player view redraw acted on a half-built view | Recommendation | The view is built aside and swapped in after the last await. | `919c398b` | `test/player-view-race.test.mjs` |
| ties-ui-perf-2 | The Attributes tab scanned every actor once per personal attribute | Recommendation | One carrier map per redraw. The output is identical. | `ca456e13`, `ce467b8c` | `test/attrs-personal-paint.test.mjs` |
| ties-ui-perf-5 | Attribute Review repainted once per registry write | Recommendation | One repaint, 150 ms after the last write. | `abe229fc` | `test/review-coalesce.test.mjs` |
| ties-ui-E5 | A card pinned at the screen edge came back 20px in | Recommendation | It comes back at the edge. | `02b90ecf` | `test/review-ties-ui-pinned.test.mjs` |
| ties-ui-M11 | On an NPC's Attributes tab, drawing and clicking used different viewers | Recommendation | Both use your assigned character. Mark as learned grants to them and the toast names them. With no assigned character, no button is drawn. | `0968e9e0` | `test/review-ties-ui-viewer.test.mjs` |
| ties-ui-rob-4 | A deleted character's belief row could not be cleared | Recommendation | The row is tagged "(deleted)" and has no Deliver button. Reset clears it, and the reset message names no one. | `744d0d4e` | `test/review-ties-ui-orphan-belief.test.mjs` |
| ties-ui-E4 | Pressing 9 twice quickly opened two description cards | Recommendation | One card opens. A second press on the same face closes it, and a press on a different face switches the card to that creature. | `cf94caac` | `test/review-ties-ui-describe-race.test.mjs` |
| ties-ui-M9 | Inspect preview with no token returned the warning object | Recommendation | It shows the warning and returns `null`. | `c9ff0634` | `test/review-ties-ui-preview-null.test.mjs` |
| ties-ui-M6 | The overlay had an unused `toggle` alias of `showAll` | Recommendation | The alias is removed. The API is otherwise unchanged. | `c1d06ee3` | `test/review-ties-ui-toggle-alias.test.mjs` |
| ties-ui-ACC-5 | Attribute Review repainted per change and kept listening after it closed | Recommendation | It repaints once after 150 ms, and the hooks are released on close (covered by the perf-5 commit). | `abe229fc` | `test/review-coalesce.test.mjs` |
| ties-ui-M5 | Four unused re-exports, and popups imported its helper twice | Recommendation | These were dropped. | `2a4b6c8e` | `test/review-ties-ui-reexports.test.mjs` |
| ties-ui-M7 | Editing a lore row also fired a tie save | Recommendation | The tie change handler skips lore-editor rows. | `2e8d8f71` | `test/review-ties-ui-lore-rows.test.mjs` |
| ties-ui-M8 | Uninstall left badges, wires and cards on screen, and a re-install drew the pinned cards twice | Recommendation | Uninstall clears the layers, queued frames and cards but leaves the saved pins alone. A re-install draws one copy. | `7e2c5b83` | `test/review-ties-ui-uninstall.test.mjs` |
| ties-ui-M12 | `TieDialog._renderHTML` was one large function | Recommendation | It is split into private builders. The markup is byte-identical. | `141c1572` | `test/review-ties-ui-render-builders.test.mjs` |
| ties-ui-M14 | Shared bits (key label, summary binding, fallback art, opening the tie dialog) were duplicated | Recommendation | Each now has one home in `core/html.mjs` (plus one `openTieDialog`). | `9f280da3` | `test/review-ties-ui-shared-helpers.test.mjs` |
| ties-ui-rob-5 | An un-awaited pin save and Look render failed anonymously | Recommendation | These now log a `pentaryn-ties \| …` console error. Nothing changes on screen. | `f4d0ded9` | `test/review-ties-ui-unawaited.test.mjs` |
| ties-ui-rob-6 | Five catch fallbacks swallowed errors silently | Recommendation | The fallbacks are unchanged. With Ties debug on, each failure also logs a line. | `bbefc48f` | `test/review-ties-ui-swallow.test.mjs` |
| ties-ui-rob-7 | A failed HUD eye or a failed Study, Lore, Mark-as-learned, Tell or Release left the button dead | Recommendation | `guardClick` re-enables the button, shows "That didn't go through — see the console." and logs the error. A finished inspection no longer leaves the eye greyed out. | `e9ea1f6d` | `test/review-ties-ui-guard-click.test.mjs` |
| ties-ui-EXT-5 | Filter chips, state tags and review "was" rows were hand-listed | Recommendation | Each is derived from one label table. The output is identical. | `0f63f8b8` | `test/review-ties-ui-label-tables.test.mjs` |
| ties-ui-EXT-6 | Two copies of the "is this attribute Personal" check | Recommendation | One `isPersonalEntry` in `core/rules.mjs`. It still ignores case and spaces. | `877c3e3c` | `test/review-ties-ui-personal-rule.test.mjs` |
| ties-ui-EXT-7 | DC boxes hard-coded 1–40 with a default of 15 | Recommendation | They read `LORE_DC_MIN/MAX/DEFAULT`. The values are the same. | `e116fa35` | `test/review-ties-ui-dc-bounds.test.mjs` |
| ties-ui-EXT-8 | Skill dropdowns differed, and a missing skill silently switched to the first one | Recommendation (prefer native) | One `skillOptionsHTML` lists skills in dnd5e order with localized names. A missing skill stays selected as "\<key> (not in this world)". | `0af5bc65` | `test/review-ties-ui-skill-options.test.mjs` + goldens |
| ties-ui-EXT-9 | Wires and badges had separate frame and layer plumbing | Recommendation | They share one `framePainter` and one `interfaceLayer`/`dropLayer` pair. Nothing changes visually. | `661412f2` | `test/review-ties-ui-frame-layers.test.mjs` |
| ties-ui-EXT-10 | The HUD eye and the "Take a closer look" menu item had two code paths | Recommendation | Both call one `examine()` and one `subjectOfToken()`. | `6d0f6c6e` | `test/review-ties-ui-examine-door.test.mjs` |
| ties-ui-EXT-11 | The tie keys and the sheet tabs had separate access gates, and a player was let through before settings loaded | Recommendation | Both use one `mayActOn(actor)`. A player is turned away until the settings load. | `b7962863` | `test/review-ties-ui-may-act-on.test.mjs` |
| ties-ui-EXT-13 | The Inspect preview hard-coded the study ladder | Recommendation | It reads `STUDY_RUNGS`/`STUDY_BASE_DC` (15/20/25, with a pass at 15). | `a3d03577` | `test/review-ties-ui-study-ladder.test.mjs` |
| ties-ui-EXT-15 | Four copies of the "GM only" badge markup | Recommendation | One `gmBadge()`. The look is the same. | `c19bbb7c` | `test/review-ties-ui-gm-badge.test.mjs` |
| ties-ui-EXT-16 | Clicking the flask twice stacked Inspect windows | Recommendation | One `openOrFront()`: a second click brings the window to the front and refreshes it. The editor, Review and Look windows reopen the same way. | `1bb90230` | `test/review-ties-ui-open-or-front.test.mjs` |
| ties-ui-E7 | A player with no assigned character got no double-click menu | Recommendation (never block) | The menu shows the tie and notebook items, and the notebook item warns. The Look items appear once a character is assigned. | `f47c4b55` | `test/review-ties-ui-no-character-menu.test.mjs` |
| ties-ui-E9 | A body-only re-render added an extra hidden tab-click handler each time | Recommendation | The nav links are bound once and find their section at click time. | `4e18eee4` | `test/review-ties-ui-nav-bind-once.test.mjs` |
| ties-ui-ACC-4 | "Fix it" on broken ancestry wrote one update per parent | Recommendation | It does one update and is disabled while that update runs. The tab redraws once. | `982743c0` | `test/review-ties-ui-repair-all.test.mjs` |
| ties-ui-ACC-6 | A write from the bridge tab could silently overwrite a field just saved in Review | Recommendation | Your save is re-applied once. On a same-field clash their value stays and your row shows the reload banner. | `107a8ad1` | `test/review-ties-ui-registry-stamp.test.mjs` + goldens |
| ties-ui-perf-4 | The wire painter scanned for each card's source token | Recommendation | One pass per frame. The look is the same. | `1f7d36cc` | `test/review-ties-ui-wire-scan.test.mjs` |
| ties-ui-perf-6 | The GM autocompletes rescanned the world on every letter | Recommendation | Results show on focus, then refresh about 0.1 s after typing pauses. The world is walked once per focus. | `46149866` | `test/review-ties-ui-search-debounce.test.mjs` |
| ties-ui-perf-7 | The Known tab re-sorted the attribute list for each creature | Recommendation | The list is indexed once per repaint. | `b8bc1d1f` | `test/perf-scans.test.mjs` |
| ties-ui-perf-9 | The Look window processed every actor update | Recommendation | It checks the actor id first and only works for the viewer, the subject and its kind. | `98166a16` | `test/live-hooks.test.mjs` |
| ties-ui-perf-10 | Every token step requested a badge frame, and a hot re-import lost the badges until canvasReady | Recommendation | A frame is requested only for marked tokens. After a ready-world re-import, `worn.install` refills the marked set and repaints at once. A normal load is unchanged. | `1bfd3d5c`, `48573164` | `test/review-ties-ui-worn-marked.test.mjs`, `test/review-ties-ui-worn-hot.test.mjs` |
| ties-ui-perf-11 | Opening or closing a Review row re-read every actor | Recommendation | The carrier walk is cached until an actor is created, changed or deleted. | `94b105ef` | `test/review-ties-ui-carriers-cache.test.mjs` |

## Goldens changed

All changes are under `foundry/module/pentaryn-ties/test/golden/`.

- **M2** (`6eb602c4`): the filter and tab buttons gain the `pt-filter-chip` class. Goldens: `app-review-controls`, `app-review-html`, `app-review-open-controls`, `app-review-open-html`, `glue-sheet-gm`, `ui-attrs-html`, `ui-attrs-pc-controls`.
- **EXT-3** (`6e56ff67`): the Ties notes no longer bind an extra `change` save. Goldens: `app-editor-controls`, `ui-ties-npc-controls`, `ui-ties-pc-controls`.
- **perf-2** (`ca456e13`): new pin `ui-attrs-personal-html`, recorded before the hoist and unchanged by it.
- **M11** (`0968e9e0`): the viewer is the assigned character, and no button is drawn without one. Goldens: `ui-attrs-html`, `ui-attrs-npc-controls`, `ui-attrs-pc-controls`, `ui-attrs-personal-html`.
- **rob-4** (`744d0d4e`): the deleted-belief row. Goldens: `app-editor-controls`, `describe`.
- **M9** (`c9ff0634`): the refusal now returns `null`. Golden: `app-open-refusals`.
- **M12** (`141c1572`): new pin `app-tie-dialog-states-html`, byte-identical across the split.
- **rob-7** (`e9ea1f6d`): HUD clicks go through `guardClick`. Golden: `glue-token-hud-clicks-gm`.
- **EXT-8** (`0af5bc65`): skill options are in dnd5e order with localized labels. Goldens: `app-editor-controls`, `app-editor`, `app-preview`, `app-review-open-html`, `ui-attrs-html`, `ui-attrs-npc-controls`, `ui-attrs-pc-controls`, `ui-attrs-personal-html`, `ui-known-controls`, `ui-known-html`, `ui-ties-npc-controls`, `ui-ties-npc-html`.
- **EXT-16** (`1bb90230`): `openOrFront`. Goldens: `describe`, `glue-token-hud-clicks-gm`.
- **ACC-6** (`107a8ad1`): the registry write stamp. Goldens: `app-review-controls`, `app-review-open-controls`, `attr-boot-repair`, `attr-links`, `attr-review`, `attr-writes`, `ui-attrs-npc-controls`, `ui-attrs-pc-controls`.
- **perf-10** (`1bfd3d5c`): the badge refresh is gated to marked tokens. Goldens: `describe`, `hooks-after-init`.

The `player-look-open` and `app-preview-controls` goldens are byte-identical (EXT-4). `glue-look-menu` is byte-identical too (EXT-10).

## Deploy

Shipped files changed only in `foundry/module/pentaryn-ties/`, and they include `styles/ties.css` and `lang/en.json`. Per blueprint §10 this needs a **restart**, not a reload. No `scripts/**` or fork changes.

## Live check after deploy

Use only ZZ-prefixed scratch documents: `ZZ Tie PC`, `ZZ Tie NPC`, `ZZ Tie Ghost` and the scene `ZZ Name Leak`. Never use Caven, Marrith, Talo or a campaign scene. Use one GM tab only, and delete the scratch documents afterwards. Items not listed below are code only (covered by the tests above).

**ties-ui-E2**
1. On ZZ Tie PC's Known tab, hide the ZZ Tie NPC entry.
2. With the sheet closed, hover ZZ Tie NPC's token on ZZ Name Leak and press 5. Then press 5 again with the sheet already open on Known. Expect: both times the ZZ Tie NPC row is expanded with its notes focused, and the other hidden entries stay hidden.

**ties-ui-M2**
1. Open ZZ Tie PC's Ties tab in a narrow sheet. Expect: a tie's stance chip is dot-only with no border.
2. Open Attribute Review. Expect: the All/Needs/Selected chips still look like pill buttons.

**ties-ui-ACC-3**
1. On ZZ Tie PC's Ties tab, change a tie's word and then its stance within 300 ms. Reopen the sheet. Expect: both values persisted.

**ties-ui-EXT-3**
1. On ZZ Tie PC's Ties tab, type into a tie's notes and click away within half a second. Reopen the sheet. Expect: the last words are saved.

**ties-ui-perf-5 / ACC-5**
1. With Attribute Review open, run three `attributes.update` calls back to back from eval. Expect: one repaint, with the rows and scroll position intact.

**ties-ui-E5**
1. Pin a card from ZZ Tie PC's web and drag it to the top-left corner (0,0).
2. Reload. Expect: the card comes back at the corner, not 20px in.

**ties-ui-M11**
1. Assign ZZ Tie PC to the GM user. Open ZZ Tie NPC's Attributes tab and click Mark as learned on an authored attribute lore row. Expect: the fact lands in ZZ Tie PC's granted flag and the toast names ZZ Tie PC.
2. Unassign afterwards.

**ties-ui-rob-4**
1. Create ZZ Tie Ghost and roll a lore fact for it on ZZ Tie NPC.
2. Delete ZZ Tie Ghost. Expect: on ZZ Tie NPC's Ties tab the belief row shows "(deleted)" with no Deliver button.
3. Click Reset. Expect: the row is removed from the beliefs flag.

**ties-ui-E4**
1. Hover ZZ Tie NPC's token and press 9 twice within about 100 ms. Expect: exactly one card is open.
2. Press 9 a third time. Expect: the card closes.

**ties-ui-rob-7**
1. On ZZ Name Leak as GM, stub the GM-side inspect handler to throw (eval), then click the inspect eye on ZZ Tie NPC's HUD. Expect: the button re-enables, the toast reads "That didn't go through — see the console.", and the console error line starts with `pentaryn-ties`.
2. Remove the stub.

**ties-ui-EXT-9**
1. On ZZ Name Leak, press 8 on ZZ Tie PC and pan. Expect: the wires follow.
2. Mark a ZZ token worn. Expect: the badge appears and follows the token.

**ties-ui-EXT-16**
1. Click the flask on ZZ Tie NPC's HUD twice. Expect: one Inspect window, brought to the front on the second click.

**ties-ui-ACC-4**
1. On ZZ Tie NPC, link an attribute, then delete its parent's link by eval so the banner shows.
2. Click Repair once. Expect: one update and the banner is gone.

**ties-ui-perf-10**
1. On ZZ Name Leak, mark one ZZ token worn and move another. Expect: the badge stays put.
2. Move the marked token. Expect: the badge follows.
3. Drop a new worn-flagged ZZ token. Expect: its badge appears.
