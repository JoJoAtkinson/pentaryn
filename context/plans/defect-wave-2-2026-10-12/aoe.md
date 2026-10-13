# Defect wave 2 (2026-10-12) — pentaryn-aoe

**Read this when** you want the history of defect wave 2 for the area-of-effect module
(`pentaryn-aoe`): which defects were fixed, how, and how to check them live. This is a record,
not instructions — to use the module read [`context/foundry/aoe.md`](../../foundry/aoe.md).

Branch `fix2/aoe-2026-10-12`. Every fix is a declared behaviour change (blueprint §9), approved
by Joe on 2026-10-12. Gate `make foundry-aoe-check`: 469/469 tests, kit identical, conformance
100 %. No item was reverted.

## Fixes

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| aoe-careful-select | Careful Spell guessed "the caster's side" and demanded the next spell be a save spell | Joe's metamagic ruling: player picks, tracking only | The sorcerer ticks who it protects (up to CHA mod, min 1); a public card names those tokens. The next save tray marks exactly them auto-succeed / no damage on half, then the pick is used up. A no-save spell leaves it armed. The GM can click a shield on any row to toggle protection. | 2f66b1d5 | careful-select.test.mjs, tray/resolve/hooks/refund/core tests |
| MM-1 | A skipped pick kept the old choice; the picker listed creatures the player can't see | Joe's metamagic ruling | Picker offers only creatures the player can see, current targets pre-ticked. Skipping declares nobody (card says so) and replaces any earlier pick. | aebcfaf8 | careful-declared.test.mjs, careful-select.test.mjs |
| aoe-mnt-1 | Cancelling placement of a no-cost spell that started concentration left the concentration and the card | recommendation | Cancel gives back slot/charges/uses, ends that cast's concentration and deletes its card, even when nothing was spent. | d8950c67 | refund.test.mjs |
| EXT-1 | The published flags contract missed three keys the module touches | recommendation | The contract now lists `dnd5e.lockSize`, `dnd5e.requestResult` and `core.MeasuredTemplate`. | f2b5a9ac | api.test.mjs (describe golden) |
| aoe-edge-2 | A superseded or partly applied tray could still switch area and rebuild its rows | recommendation | Once superseded or any row is applied, the area picker is greyed out and `resolve()` with another area warns and returns null. Fresh trays switch freely. | 928f0746 | area-lock.test.mjs |
| aoe-edge-3 | Scene-open handle sweep was lost if startup failed or the GM role moved tabs | recommendation | The canvasReady sweep is wired at setup and runs on whoever is the active GM at that moment. | de5051eb | ready-handover.test.mjs, glue/hooks/ready tests |
| AC-1 | Two GM tabs could both record a player save and both apply damage | recommendation | One tab claims each player save; Apply re-reads each row and skips any another tab already applied. | 7f13061f | cross-tab.test.mjs, resolve.test.mjs |
| R3 | `latestResolution({sceneId:"current"})` with no scene viewed returned another scene's tray | recommendation | Returns null when not viewing a scene; omit the scene to search all. | de66542c | api.test.mjs |
| R2-selfApply | `selfApply(id)` ignored a message id | recommendation | A message id is looked up like the card itself; an unknown id returns null. | ef5dbf05 | effects.test.mjs |
| R4 | One monster save failing to roll aborted the others, the request card and auto-apply | recommendation | The failure is logged, that row stays '—' for a re-roll, the rest carries on. | 98ff9d0b | npc-save-partial.test.mjs |
| R5 | A save with no DC auto-passed or auto-failed | recommendation | Recorded as unknown, multiplier '?', GM sets it by hand. | e5c896f5 | null-dc.test.mjs |
| aoe-edge-4 | A handle another GM tab already deleted logged an error and stopped cleanup | recommendation | "Does not exist" counts as done; nothing logged, cleanup and sweep carry on. Other refusals still throw. | b5ba7c46 | two-session-delete.test.mjs |
| aoe-edge-7 | A bad multiplier sent to a row became ×0 or NaN | recommendation | Anything other than 0, ¼, ½, 1, 2 leaves the row unchanged and warns. | 916ef6b1 | resolve.test.mjs |
| aoe-edge-8 | On a non-active GM tab the area picker silently did nothing | recommendation | It warns "Only the active GM can change the area." and resets the select. | 7cf9ade1 | picker-gm.test.mjs |
| AC-6 | Switching a tray's area could be undone by an older save/row write still in flight | recommendation | The switch queues behind pending writes, so the new area's rows stick. | 1dd35542 | resolve-queue.test.mjs |
| AC-7 | The sweep created and attached missing handles one area at a time | recommendation | One Token create and one Region update for all handle-less areas. | 13e204f7 | sweep-batch.test.mjs (ready-calls golden) |
| R7 | A throw while publishing the API at ready stopped the rest of startup | recommendation | One console error; Argon guard, settings migration and startup sweep still run. | 285cbfa5 | publish-throw.test.mjs |
| EXT-3 | Tray multiplier labels lived apart from the multiplier list | recommendation | Labels sit beside `MULTIPLIERS` in core; table unchanged. | 3d8997f3 | multiplier-labels.test.mjs, core.test.mjs |
| R8 | Settings migration logged with a bare console call | recommendation | Same line, through the shared logger. | 2db2f67b | settings-log.test.mjs |
| aoe-perf-2 | No-stacking looked up the source spell of every effect | recommendation | Only enabled effects with the same name are looked up; result unchanged. | be97ff37 | stacking-filter.test.mjs |
| aoe-mnt-7 | A bare token id attachment on a region was missed when finding its handle | recommendation | The handle is found however the attachment is stored. | b3135c71 | areas.test.mjs |
| aoe-mnt-10 | Handle actor name/size/hover defined in several places | recommendation | One definition feeds creation and repair; behaviour identical. | ec652f32 | areas.test.mjs |
| AO-3-handle-dark | In the dark a new handle and its outline were invisible; the handle carried the player's user name | recommendation | New handles give a faint ½-square dim light and are named "<Spell> (<caster's token name>)". | b8e4472f | handle-dark.test.mjs |

## Goldens changed

- `describe.json` — EXT-1 (three flag keys), aoe-edge-2, aoe-edge-3, R3, MM-1, aoe-edge-7, aoe-careful-select (API/contract text).
- `tray-html.json` — aoe-careful-select (row shield), aoe-edge-2 (locked picker).
- `hooks.json` — aoe-careful-select, aoe-edge-3 (canvasReady wired at setup).
- `careful.json`, `tray-host.json` — aoe-careful-select.
- `ready-calls.json` — AC-7 (one batched create + update), AO-3-handle-dark (handle light/name).
- `create-handle.json` — AO-3-handle-dark.

Shipped files changed: `aoe.mjs`, `api.mjs`, `api-manifest.mjs`, `areas.mjs`, `careful.mjs`,
`core.mjs`, `effects.mjs`, `refund.mjs`, `resolve.mjs`, `scene-adapter.mjs`, `settings.mjs`,
`tray.mjs`, `lang/en.json`, `styles/aoe.css` — lang and styles mean a **restart**, not a reload
(blueprint §10).

## Live check after deploy

All on ZZ scratch docs (scene ZZ AoE Check; actors ZZ Sorcerer, ZZ Ally, ZZ Goblin A/B/C),
one GM tab, deleted afterwards.

- **aoe-careful-select / MM-1** — ZZ Sorcerer targets ZZ Ally and ZZ Goblin A, uses Careful
  Spell: both pre-ticked, OK posts a card naming them. Cast Shield: still armed. Cast Fireball
  over Ally + Goblins A/B/C: only Ally and Goblin A shielded, flag gone. Click Goblin B's
  shield: ×0; click again: back. A second Fireball protects nobody.
- **aoe-mnt-1** — Concentration area spell set to at-will: start placement, Escape →
  concentration gone, card deleted. Fireball cancelled the same way refunds its slot.
- **EXT-1** — `pentaryn-read aoe describe` lists `dnd5e.lockSize`, `dnd5e.requestResult`,
  `core.MeasuredTemplate`.
- **aoe-edge-2** — Place Fireball twice from one card over the goblins, roll damage, Apply:
  picker greys out; `api.resolve(msgId, {regionId: <other>})` returns null with a toast.
- **aoe-edge-3** — Create an orphan handle token (`flags.pentaryn-aoe.handle`, missing region
  id) on ZZ AoE Check, switch scene and back: orphan deleted.
- **R5** — ZZ spell with an empty custom DC over Goblin A and Ally: rows show totals with '?';
  set a multiplier by hand, Apply works.
- **AO-3-handle-dark** — ZZ dark scene (no global light, no lights): ZZ Sorcerer places Burning
  Hands; handle and outline visible from the caster's vision; chip reads
  "Burning Hands (ZZ Sorcerer)".
- **Code-only** (no live step; second GM tab forbidden or internal): AC-1, AC-6, AC-7, R2-selfApply,
  R3, R4, R7, R8, EXT-3, aoe-edge-4, aoe-edge-7, aoe-edge-8, aoe-perf-2, aoe-mnt-7, aoe-mnt-10 —
  covered by the tests named above.
