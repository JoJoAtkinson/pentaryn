# Defect wave 2026-10-12 — pentaryn-riders

**Read this when** you want the history of the 2026-10-12 defect wave for `pentaryn-riders`:
what was fixed, why, and how to check it live. History, not instructions.

Branch `fix/riders-2026-10-12`. Approved by Joe on 2026-10-12 (~11:00 EDT): "take all of
those, and if I don't mention it take recommendation". Both fixes are declared behaviour
changes. Gate `make foundry-riders-check`: 179/179 tests, kit identical, conformance 96.0 %
(unchanged).

| id | defect | Joe's ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| riders-async-2 | The Arcane Recovery picker is not modal. A cast, sheet edit or rest while it was open was overwritten by slot values from the snapshot taken before it opened. | Take recommendation | After the picker closes, the wizard's slots are read again and the choice is added to the current values. If the choice no longer fits (for example, a long rest refilled the slots), nothing is recovered and a short warning says the slots changed. The early check before the window opens is unchanged. | `f8aa2ea5` | `test/cast-flow.test.mjs` "riders-async-2: slots that change while the picker is open …" |
| potent-name | A druid's Potent Spellcasting named just "Potent Spellcasting" also matched the cleric rule by name (and the other way round), so Wisdom could be added to the wrong class's cantrips. | Take recommendation (narrow version, so nothing else changes) | When an item's identifier or compendium source belongs to a known rule, it matches only that rule; the name fallback stands down. Homebrew items with no known identifier or source still match by name as before. | `9c60e0d5` | `test/core-fixtures.mjs` fixtures 19a–19e "potent-name: …" |

## Goldens changed

- `test/golden/lang-keys.json` — one new key `PENTARYN_RIDERS.arcaneRecovery.changed` (riders-async-2).
- `test/golden/describe.json` — the `arcaneRecovery` doc line now says the choice is re-checked
  against fresh slots (riders-async-2).

Both updated with `GOLDEN_UPDATE=1` on `i18n.test.mjs` and `api-kit.test.mjs` only. potent-name
changed no goldens.

## Live check after deploy

Use ZZ-prefixed scratch actors and scenes only — never Caven, Marrith, Talo or a campaign scene.
Delete the scratch actors afterwards.

**riders-async-2**
1. Make `ZZ Wizard` (wizard 5, Arcane Recovery feature) with 1st-level slots 2/4 and 2nd-level
   slots 1/3. Open Arcane Recovery (or `game.modules.get("pentaryn-riders").api.arcaneRecovery`).
2. With the window open, set the 1st-level slots on the sheet to 1, then pick one 1st-level slot
   and confirm. Expect 1st-level slots = 2 (not 3).
3. Reset to 2/4, open the window again, set the 1st-level slots to 4/4 on the sheet, pick one
   1st-level slot and confirm. Expect no change, no chat card, and the warning "Arcane Recovery:
   the spell slots changed while the window was open, so nothing was recovered."

**potent-name**
1. Make `ZZ Druid` (druid 7) with the PHB "Elemental Fury: Potent Spellcasting" feature, renamed
   to "Potent Spellcasting" (keep its identifier/source). Give it a druid cantrip (e.g. Produce
   Flame) and a cleric cantrip (e.g. Sacred Flame, sourced as cleric).
2. Cast both. Expect +Wisdom on the druid cantrip's damage and none on the cleric cantrip.
3. Optional: on a `ZZ Homebrew` actor, add a hand-made feat named "Potent Spellcasting" with no
   identifier or source; it should still be picked up by name, as before.
