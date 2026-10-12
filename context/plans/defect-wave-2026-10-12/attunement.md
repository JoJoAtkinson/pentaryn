# Defect wave 2026-10-12 — pentaryn-attunement

**Read this when:** you want the history of the 2026-10-12 defect wave for the attunement module (what was fixed, why, and how to check it live). History, not instructions.

Branch `fix/attunement-2026-10-12`, off `origin/main`. Source records:
[`../final-review-2026-10-12/attunement.md`](../final-review-2026-10-12/attunement.md) and
[`../playtest-overnight-2026-10-12.md`](../playtest-overnight-2026-10-12.md).
Joe approved the wave on 2026-10-12: "take all of those, and if I don't mention it take recommendation". Every fix is a declared behaviour change. No item was reverted by its verifier (all held).

## Fixes

| id | defect | Joe's ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| ATT-AC-2 | Two bonded Coin Purses arriving in one batch (e.g. an Item Piles take-all) paid only one (13 gp instead of 18). | Take the recommendation: redo the reverted 61260fa9 on a purse-only chain so hand-back timing is untouched. | Coin-purse payouts now queue per actor on their own lane (`actor.uuid + ":coin"`); slot hand-back stays on its own key and never waits on a purse. A lone purse still pays at once. | 6e6c74d9 | `test/home-race.test.mjs` |
| ATT-ROB-2 | Bonds were keyed on `actor.id`; unlinked tokens share the base actor's id, so an item stashed from bandit A was re-attuned on bandit B or the base actor. | Take the recommendation: key on uuid, still accept the legacy id form. | New bonds record the owner's uuid. Only that exact token gets the item back attuned/equipped; a sibling token or the base actor only clears the name tag and the bond stays. Old id bonds behave exactly as before. | dc81ee07 | `test/bond-uuid.test.mjs`, `test/core.test.mjs` |
| EC-3 | At the cap, dropping an item onto a filled slot (a one-for-one swap) warned "makes 4". | Take the recommendation: pass `swapFrom`, subtract it in the pre-update check. | The sheet's slot drop tells the cap check which item it is swapping out; if that item is attuned and needs attunement, it doesn't count. Drops into an empty slot over the cap still warn. | fafbea83 | `test/strip.test.mjs` (EC-3) |
| lang-switch | Player-visible strings lived in an inline `STRINGS`/`t()` table instead of `lang/en.json` (blueprint C35, an accepted exception). | Take the recommendation: move to the lang file, retire the exception. | Every message (over-limit note, away tooltip, End Attunement dialog, warnings) now reads from `lang/en.json` via `_loc`; wording unchanged. The C35 row is gone from `scripts/foundry/blueprint/exceptions.json`. | cd75587a | `test/lang-switch.test.mjs`, `test/i18n.test.mjs` |

Still open (recorded, not in this wave): on an Item Piles take-all, Item Piles writes currency itself with an absolute value; no queue in this module can order against that write (ATT-AC-2 residual).

## Goldens changed

- `foundry/module/pentaryn-attunement/test/golden/stash.json` — three `bond.actor` rows go from `"actorOwnr0000001"` to `"Actor.actorOwnr0000001"` (ATT-ROB-2, dc81ee07). No other golden changed.
- Expected live-golden diff (not run here): `scripts/foundry/live-goldens/attunement.js` captures bonds whole, so `bond.actor` will read `Actor.<id>` (or a token-actor uuid) instead of the bare id.

## Live check after deploy

Use only ZZ-prefixed scratch actors/scenes (e.g. actor `ZZ Attune PC`, scene `ZZ Attune Test`). Never Caven, Marrith, Talo or campaign scenes. Needs a server restart first (module code changed; the lang file is now load-bearing).

- **ATT-AC-2**
  1. Give `ZZ Attune PC` 10 gp; stash two bonded Coin Purses from it (5 gp and 3 gp) to a ZZ pile.
  2. Move both purses back to `ZZ Attune PC` in one `createEmbeddedDocuments` call (or Item Piles take-all from a ZZ pile).
  3. Expect 18 gp, both purses deleted, two CoinBack toasts; any attuned item returned in the same batch gets its slot back without delay.
- **ATT-ROB-2**
  1. Place two unlinked tokens of `ZZ Attune Bandit` on `ZZ Attune Test`; on token A, attune and equip an attunement item, then confiscate (stash) it.
  2. Read the stashed item's `flags.pentaryn-attunement.bond.actor`: expect token A's actor uuid (`Scene.….Token.….Actor.…`).
  3. Give it to token B: expect not attuned, bond flag kept, name tag removed. Then give it to token A: expect attuned and equipped.
- **EC-3**
  1. Put `ZZ Attune PC` at 3/3 attuned; open the sheet, drag an unattuned attunement item onto a filled slot: expect a swap and no "makes 4" warning.
  2. Unattune one, re-fill to 3/3 with the cap reached, then drop into an empty slot past the limit (if the strip shows one): expect the WouldExceed warning still.
- **lang-switch**
  1. On `ZZ Attune PC`: open the sheet with an away (stashed) item, go over the cap, drop an item that needs no attunement, and return a stashed item and a coin purse.
  2. Check every note, tooltip, dialog and toast: no raw `PENTARYN_ATTUNEMENT.*` key and no "undefined" (migration guide D-A2).
