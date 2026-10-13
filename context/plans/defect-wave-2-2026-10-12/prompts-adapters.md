# Defect wave 2 (2026-10-12) — prompts-adapters

**Read this when** you want the history of defect wave 2 for the `pentaryn-prompts` module's
dialog, panels and adapters (what was fixed, why, and how to check it live). History, not
instructions — the use-doc is `context/foundry/prompt-markers.md`.

Branch `fix2/prompts-adapters-2026-10-12`. Authorised by Joe on 2026-10-12 ("Let's create a
dynamic workflow to solve all of these things"). Every fix is a declared behaviour change; where
Joe gave no ruling the review's recommendation was taken. Gate: `make foundry-prompts-check`
(265 pass, 6 skipped, core 415 pass, conformance 100 %). No item was reverted (all hold).

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| R2 | Dry run accepted an unknown `patch.disposition` word the real run then rejected after building | recommendation | Dry run and real run both refuse e.g. "angry" with the same BAD_SPEC; nothing is built first | 29583ae4 | patch.test, replace.test |
| R1 | A failed save could delete a marker as "empty", and a size swap could carry stale text | recommendation | Failed save keeps the marker and shows an error toast; a size swap after a failed save is cancelled | 52d394d0 | dialog-save-fail.test |
| EC-2 | Double-clicking a size chip swapped twice, leaving an orphan marker | recommendation | Chips grey out during a swap; close and Delete wait for it; one swap only | 8db21d80 | dialog-swap-guard.test |
| M1 | Side panel did not redraw on note edits or light/tile changes | recommendation | Panel redraws on note, light and tile create/update/delete on that scene, as well as walls, doors and tokens | d7621b66 | panel-refresh.test, hooks.test, glue.test |
| EC-1 | Panel did not redraw when ring art or a prompt flag changed without a name change | recommendation | Ring-texture and prompt-flag changes redraw the panel | 3ba37543 | panel-refresh.test |
| R5 | Swallowed character/scene lookup failures left no trace | recommendation | Nothing changes at the table; with the module debug switch on, the console says what failed and why | dd35aec6 | catch.test, character-catch.test |
| R5-note | A compendium `@Embed` that failed before the pack loaded was cached blank forever | recommendation | Shows blank once, then loads on the next render; a truly empty description is not re-fetched | 85ef5f84 | catch.test |
| R4 | Deleting a marker mid-resize could create an orphan or delete twice | recommendation | The resize stops if the marker goes; no stray create, no double delete | 1599a01e | dialog-swap-guard.test |
| EC-4 | Keys typed during a size swap were lost | recommendation | Typed words stay in the box, land on the new marker and autosave there | f6436ef2 | dialog-swap-typing.test |
| EC-6 | Reopening a marker twice while it was saving could open two boxes | recommendation | One box per marker, brought to the front | e7279418 | dialog-open-race.test |
| R3 | Misshapen actor-patch fields (removeItems, itemUpdates, set, hp, ac, cr, speed) got through the dry run | recommendation | The dry run refuses each with a message naming the expected shape; valid patches unchanged | 6c26765a | patch.test, replace.test |
| EC-7 | A spell listed twice in one character build was added twice | recommendation | Added once, with a "<spell> listed twice — added once" warning in preview and real build | 57162f03 | character.test |
| M10 | A choice option that failed to load crashed the real build partway | recommendation | Preview and real build both show the option's ID instead | 8911777d | character.test |
| M12 | The "typed before the box opened" fallback toast was hard-coded English | recommendation | Toast is localised; English text unchanged | becf699b | m12-orphan-loc.test |
| M16 | Unused `markerActorIds` export | recommendation | Removed; markers still found by size | c5009ac1 | m16-marker-ids.test, markers.test |
| EXT-3 | Manifest help for crops / scene-model returns missed keys | recommendation | Help lists mimeType, the error row's scene and the scene's nav; a test fails if help and output drift | 7e86035f | ext3-returns.test |
| M17 | Side panel used its own HTML escaper, differing from the hover tip | recommendation | Uses `foundry.utils.escapeHTML`, same as the hover tip | b2e1be1e | m17-dialog-esc.test |
| EXT-12 | On hex maps crop boxes and the scene gather measured different token footprints | recommendation | Crops box each token's real drawn footprint, shared with the scene model | 1ef55b36 | ext12-crops-footprint.test |
| prompts-U1 | A failed Delete could close the box, drop typed words, or race a size chip / second click | recommendation | Box is "deleting" from before `tok.delete()` until the result is known: second Delete, size chip and save all stand down; Esc waits; a failed delete leaves the box open and autosaving; a delete rejected because another tab already removed it closes quietly | 5e773d7d, 3f4178f4 | u1-delete-fail.test |

## Goldens changed

- `test/golden/describe.json` — M1 (new panel-refresh hooks), EXT-3 (manifest return keys).
- `test/golden/hooks.json` — M1 (note/light/tile hooks).
- `test/golden/glue-exports.json` — M16 (export removed), EXT-12 (shared footprint helper).
- `test/graph-allow.json` — EXT-12 (crops adapter imports the scene footprint helper).

## Shipped files changed

`pentaryn-prompts`: `actor-patch-adapter.mjs`, `api-manifest.mjs`, `character-adapter.mjs`,
`crops-adapter.mjs`, `dialog.mjs`, `markers-adapter.mjs`, `panels.mjs`, `scene-adapter.mjs`,
`typeahead-adapter.mjs`, `lang/en.json`, `styles/prompts.css`, plus README/CHANGELOG. Lang and
styles changed, so deploy needs a Foundry restart (blueprint §10). No `scripts/**`, no fork, no kit.

## Live check after deploy

All on a ZZ-prefixed scratch scene with ZZ markers/actors created for the check and deleted after.

- **R2** — `replaceMany` dryRun with `with:{kind:"actor", uuid:<MM goblin>, patch:{disposition:"angry"}}` returns BAD_SPEC naming disposition; the real run returns the same and `game.actors` gains no goblin.
- **R1** — Via eval-js make the ZZ marker's `TokenDocument#update` reject once; drop a fresh marker, type words, Esc: saveFailed toast, marker still there. Retry: the words land.
- **EC-2** — Open a marker's box, click a size chip twice fast: exactly one marker of the new size, old one gone, no console rejection.
- **M1** — With a box open, rename a note and move a provenance-stamped light: the panel redraws within ~250 ms each time.
- **EC-1** — Two boxes open; change a built token's ring subject texture via eval-js: the other box's row image updates. Edit the second marker past 40 chars: the first box's row preview updates after autosave.
- **R5** — code only.
- **R5-note** — Place a ZZ token whose biography is only `@Embed[<compendium journal page uuid>]`; open a ZZ marker's box before and after the pack loads: the row shows the page's words once available, no reload.
- **R4, EC-6, R3, EC-7, M10, M12, M16, EXT-3, M17** — code only (see tests above).
- **EC-4** — Type "abc", click a chip, keep typing "def" during the swap: the box shows "abcdef" and the new marker's flag holds it after 600 ms.
- **EXT-12** — Gather with crops on a ZZ hex scene holding one marker and one 2×2 built token: the labelled boxes sit on the drawn footprints.
- **prompts-U1** — Via eval-js make the ZZ marker's `TokenDocument#delete` reject once; click Delete: toast, box stays open, typing still autosaves. Click Delete again: it goes.
