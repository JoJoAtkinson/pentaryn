# Defect wave 2 (2026-10-12) — pentaryn-attunement

**Read this when:** you want the history of defect wave 2 for the attunement module
(`pentaryn-attunement`): what was fixed, why, and how to check it live. History, not
instructions — the module's own README is the use-doc.

Branch `fix2/attunement-2026-10-12`. Source records: `context/plans/final-review-2026-10-12/`.
All changes are declared behaviour changes approved by Joe on 2026-10-12. No item was reverted
(every item held). Gate: `make foundry-attunement-check` — 165 pass, 1 skipped, conformance
100 %, vendored kit identical.

## What changed

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| ATT-AC-1-residual | Two GM tabs could both hand a returning bonded item's slot back, leaving a phantom greyed "away" slot | recommendation | Each returning item is claimed (`claims.home`), so only one tab hands its slot back (after ~750 ms) | d62af080 | home-race, glue, bond-uuid |
| EC-4 | A batch of attunes warned only for one item past the cap | recommendation (track, never block) | The GM is warned for the first item over the limit and every one after it; nothing is blocked | 7589968f | glue |
| EC-5 | An attuned item and a plain same-name item stashed together merged into one bonded stack | recommendation | An attuned copy is never a merge target; they come out as two items | 397873d9 | core |
| EXT-6 | describe()/README did not list the claim flags the module writes | recommendation | describe().flags.writes and the README list `claims.coinBack` and `claims.home` | 9fcb6af7 | api, flags-written |
| ATT-AC-2-residual | README did not explain Item Piles' own coin write on take-all | recommendation | Docs only: Item Piles writes take-all coins itself, outside our purse chain; the purse's short wait lands its payout after | 6b0600da | docs |
| ATT-AC-3 | Two overlapping stashes / slot drops on one actor could overwrite each other's away entry or slot | recommendation | They now run one after the other on the per-actor chain; a single call is as fast as before | 823e132a | overlap, home-race |
| EC-6 | report("typo") reported on the selected token instead | recommendation | A name matching no actor gives a console warning naming what was typed; the selected token is used only when no name is given | 8d1e95a7 | glue |
| EXT-8 | selftest only counted ≥ 4 hooks | recommendation | selftest checks each needed hook by name and lists the missing ones | 1a16c7e0 | api |
| ATT-ROB-6 | Legacy computeSlots/away threw on a non-actor | recommendation | A non-actor gets the same empty answer as an unknown name | 8b39c4b7 | api |
| EC-10 | With no attunement max set, the over-cap warning said "undefined" and disagreed with the strip | recommendation | The warning uses the strip's limit of 3: fires on the 4th item and says "3 items" | 54901632 | core-meta, glue |
| M11 | restoreBond left an unread bond tag in the batch's shared options | recommendation | The tag is gone; the returned item still gets its name, equipped state and attunement back | b3bddb43 | glue |
| perf-1 | A slot drop redrew the sheet twice, briefly showing the item in the wrong slot | recommendation | The sheet redraws once, with the item already in the right slot | ddec7d89 | strip |
| M1 | stash wrote out the created-id list twice | recommendation | One `idsOf(made)` helper; no behaviour change | 6c2dff58 | docs, glue, stash-safety |
| M4 | Adapter header/README claimed it held every write | recommendation | Docs now say the adapter holds the shared writes (stash, away hand-back, slot writes); sheet and bond hooks save their own | 4ddcd4d6 | docs |
| M6 | strip.mjs had an unused index param, a dead default and four needless exports | recommendation | Tidy-up; strip looks and behaves the same | f86322c9 | strip |
| M7 | The slot ✕ button was built by two copies | recommendation | One private `removeButton(action, label)`; same look and behaviour | a6abe437 | strip |
| M10 | Tooltip guard found dnd5e's tooltip prototype in two places, marker named twice | recommendation | One `itemTooltipProto()` and one `GUARD_MARKER`; same behaviour | 723c6b82 | docs |
| EXT-3 | Flag paths were hand-written strings in bonds and the adapter | recommendation | `COIN_CLAIM`/`HOME_CLAIM` in the core, kit `flagPath` everywhere; same flags written | 49a04061 | flag-paths, flags-written |

## Goldens changed

`foundry/module/pentaryn-attunement/test/golden/describe.json`:

- EXT-6 (9fcb6af7): `flags.writes` gains `flags.pentaryn-attunement.claims.coinBack` and
  `flags.pentaryn-attunement.claims.home`.
- ATT-ROB-6 (8b39c4b7): computeSlots/away actor-param doc, `nullWhen` and away's doc now say a
  non-actor-like object (no items or getFlag) is a miss.

## Live check after deploy

Reload only (no module.json, lang or kit change). Use a scratch `ZZ Attune PC` with ZZ items
and a ZZ chest; delete them afterwards. One GM tab.

- **ATT-AC-1-residual:** stash two attuned ZZ items to the ZZ chest, return both in one
  `createEmbeddedDocuments` call, wait 2 s: both slots lit, away list `[]`, no `claims.home`
  left on either item, two BackInHand toasts.
- **EC-4 / EC-10:** at 1/3, one `updateEmbeddedDocuments` call setting `system.attuned` on three
  ZZ attunement items: a WouldExceed toast for the third (value 4), all three attuned, counter
  red. With no max set, the message says "3 items".
- **EC-5:** an attuned ZZ wand and an unattuned ZZ wand of the same name; stash both to the ZZ
  chest: two copies in the chest, one bonded (`attuned: true`, quantity 1).
- **EXT-6:** `game.pentaryn.attunement.describe().flags.writes` lists both claims paths.
- **ATT-AC-3:** with two attuned ZZ items, fire two `stash()` calls via eval-js without awaiting
  the first: both away entries present, both slots greyed, the chest holds both copies.
- **EXT-8:** `game.pentaryn.attunement.selftest()` is ok and the hooks check's detail is `null`.
  The detail lists only the missing hooks by name, so it is empty when all four are registered.
- **perf-1:** at 2/3 with slot 1 empty and slot 3 filled, drop an unattuned ZZ item on slot 3:
  one redraw, newcomer in slot 3, no flash into slot 1.
- **EC-6:** `game.pentaryn.attunement.report("ZZ nobody")` logs a console warning naming
  "ZZ nobody" and does not report the selected token.
- ATT-AC-2-residual, ATT-ROB-6, M11, M1, M4, M6, M7, M10, EXT-3: code only — covered by the
  gate; spot-check the strip ✕ and item tooltips still look the same on `ZZ Attune PC`.
