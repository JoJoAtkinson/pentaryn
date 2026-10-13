# Defect wave 2 (2026-10-12): ties-core

**Read this when** you need the history of defect wave 2 for the `pentaryn-ties` core: what was
fixed, why, and how to check it live. This is a record, not instructions for using the module.

Branch `fix2/ties-core-2026-10-12`. Gate `make foundry-ties-check`: green (conformance 96.1 %,
accepted exceptions C05 and C37 are unchanged). All fixes are declared behaviour changes that Joe
approved for defect wave 2. No reverts were needed because every item holds.

## Items

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| R1 | A GM's "Write an entry" on a kind row saved the key in lowercase, so the row never matched | recommendation | The entry is saved under the actor's real id. On the GM's next load, older lowercase rows are moved to the one actor they match. | 84b6c25a | review-kind-ids |
| M1 | A blank or missing DC rolled against DC 1 | recommendation | A blank DC uses the default of 15. A typed DC still counts. | 8c786f29 | review-dc-default |
| R8 | A refused save of a tie, a Known entry or a Mark-as-learned threw an uncaught error | recommendation | It logs a console warning and returns false. The legacy migration skips an actor it can't save and goes on. | 3cfdf0d4 | review-write-refused, glue-steps |
| R3 | markLearned crashed when given an id, name or token | recommendation | It resolves any of those to the actor. If nothing matches, it refuses with `invalid`. | 6506aebf | review-mark-learned-ref |
| EC-2 | Two ensure() calls at the same moment returned a "name taken" collision | recommendation | One call creates the attribute and the other gets `existed: true`. | 926bcd12 | review-ensure-race |
| ext-2 | A new derived namespace could ship without a label, icon or derive slot | recommendation | A test fails if any of the three is missing. | 05466771 | review-derived-ns |
| R7 | A kind study tier with no min could be shown as the failure text | recommendation | A tier with no min is skipped. | ad1454a5 | review-study-null-min |
| M11 | setNotes reported success even when the save was refused | recommendation | It returns false when the write is refused. | ce238cb3 | review-setnotes-refused |
| M10 | markLearned threw an error with no character selected or no lore rows | recommendation | It returns `invalid` with no character, `noLore` when there are no rows, and a write failure when the save is refused. | 0e139408 | review-mark-learned-contract |
| R10 | A hotkey whose action failed gave a bare "Uncaught (in promise)" | recommendation | The key press is still consumed and the console logs "pentaryn-ties: key <name> failed". | c423fb09 | review-key-rejection |
| ext-3 | The README didn't say that a new namespace needs all five fact-key helpers | recommendation | The README's Extending section now lists all five. | 39525d1e | review-extending-ns |
| ext-5 | The manifest said study.state, lore and knowsAbout take only an Actor | recommendation | The manifest now says they also take an id, token, uuid or name. A test checks that an id gives the same answer as the actor. | 5f647d3e | api-kit |
| ext-7 | The kind pass threshold of 15 was copied in nine places | recommendation | One `kindPassed(tier)` rule is used at all nine sites. | b4cd2036 | review-kind-pass-rung, rules |
| ext-8 | The manifest gave wrong return shapes for search, stale, tell, unreviewed and known.categories, and didn't list `noLore` | recommendation | The return shapes are corrected and `noLore` is listed as a refusal reason. | 8f0fea77 | review-manifest-returns |
| ext-9 | The self-description listed knownCategories and mark as flags the module writes | recommendation | They are now listed as flags it reads. | cc609522 | review-flag-reads |
| ext-11 | A PC whose name merely contains "crowd" (for example "Crowder") lost its Share switch | recommendation | Marker, crowd and hotspot are matched as whole words only. | a430c1e1 | review-roster-whole-words |
| U1 | Two GM tabs opening a world for the first time made two Ties Web macros | recommendation | The macro is created with a fixed id and keepId, so only one exists. | f8269ec2 | review-macro-race |
| U2 | The comments and docs implied that the registry write queue covered more than one tab | recommendation | No code change. Every mention now says the queue is per tab. A bridge write racing a GM save is last-write-wins, and the reload banner only covers a Claude write that lands before Joe's save. | 3243d042, f745b35a | review-queue-per-tab |
| U3 | Parallel link and unlink calls on one actor kept only the last change | recommendation | The calls are queued through serial(), so every change lands. | 7d8fcc62 | review-link-race |
| U4 | An item mark's tip was shown as HTML in the tooltip | recommendation | The tip is shown as plain text. | 8ea73147 | review-mark-tip-text |
| U5 | brokenAncestry and staleCarriers scanned the registry once per id | recommendation | The registry is indexed once per call. The results are the same. | f35ba661 | review-ancestry-index |

## Goldens changed

- `known-core-exports.json` (R1): adds the new kind-row repair export.
- `glue-steps-console.json`, `socket-relay.json` (R8): add the refused-write warning lines.
- `describe.json` (R3, M11, ext-5, ext-8, ext-9): manifest text, return shapes and flag reads.
- `glue-boot-gm.json` (U1): the macro is created with a fixed id and keepId.
- `canvas-item-marks.json`, `declared-b6-unescaped.json` (U4): the tooltip tip is plain text.

## Deploy

Shipped files changed only in `pentaryn-ties`. module.json, esmodules, lang, styles and the kit
were not touched, so a GM browser reload is enough (blueprint §10). No Python or fork changes.

## Live check after deploy

Use ZZ scratch docs only, and delete them afterwards.

- **R1**: Point a ZZ NPC's kind at a ZZ kind actor. Click "Write an entry for this" on the kind row in the Attributes tab. `game.settings.get('pentaryn-ties','attributes')` should hold `kind:<exact actor id>`, the row should read authored, and no second "Write an entry" button should appear.
- **M1**: On a ZZ NPC's lore row, clear the DC box and save. The GM lore editor should show 15, and `study.loreRows(actor)[0].dc === 15`.
- **R8**: Stub `actor.update` on a ZZ NPC to reject once, then call `game.pentaryn.ties.set(zzPc, zzNpc, {word:'x'})`. It should resolve with no "Uncaught (in promise)", and the forward row on zzPc should be written.
- **R3**: Call `markLearned` with a ZZ PC's id, then with a name that matches nobody. The first should mark the lore learned and the second should return `invalid`.
- **ext-11**: Create ZZ characters "ZZ Crowder" (player-owned) and "ZZ Marker · 9". Open the GM inspect window on a ZZ NPC. ZZ Crowder should have a Share switch and ZZ Marker · 9 should not.
- **U1**: Run `game.macros.filter(m => m.name === 'Ties Web').length`. It should be 1.
- **U3**: Run `Promise.all` of linking 'ZZ A' and 'ZZ B' on a ZZ NPC. Both should be in `flags.pentaryn-ties.attributes`.
- **U4**: On a ZZ PC, set an item's mark to `{ tip: '<b>x</b>' }` and hover the item on the sheet. The tooltip should show the literal `<b>x</b>`.
- All other items are code only and are covered by the gate.
