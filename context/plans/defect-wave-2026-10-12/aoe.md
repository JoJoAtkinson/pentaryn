# Defect wave 2026-10-12 — pentaryn-aoe

**Read this when** you want the history of the 2026-10-12 defect wave for the aoe group
(module `pentaryn-aoe`): what was fixed, why, and how to check it live. History, not
instructions — the use-doc is [`context/foundry/aoe.md`](../../foundry/aoe.md).

Branch `fix/aoe-2026-10-12`. Joe approved the wave on 2026-10-12 (~11:00 EDT): "take all of
those, and if I don't mention it take recommendation". Sources: the final review records in
[`final-review-2026-10-12/`](../final-review-2026-10-12/) and the play-test record
[`playtest-overnight-2026-10-12.md`](../playtest-overnight-2026-10-12.md). Gate
`make foundry-aoe-check`: 426/426 tests, vendored kit identical, conformance 100%.

| id | defect | Joe's ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| aoe-edge-1 | Two Apply clicks on one damage tray could damage the same creatures twice. | Approved (take recommendation) | A second Apply waits for the first (up to 10 s) and then skips rows already done. A rejection still reaches the caller; the wait is capped so a stuck Apply cannot block later ones. Only overlap inside one tab is handled — two tabs at once is still AC-1. | `21c0ec35` | `test/apply-overlap.test.mjs` |
| aoe-R1 | One creature's damage failing stopped the whole Apply, and a retry re-damaged the rows that had landed. | Approved (take recommendation) | Each row is applied on its own. The rows that landed are marked applied, a warning names the failed ones (new lang key `PENTARYN_AOE.Tray.ApplyFailed`), and Apply again hits only those. | `040f9632` | `test/apply-partial.test.mjs` |
| metamagic-disarm | Careful Spell stayed armed for 10 minutes out of combat and could carry past the next spell. | Approved (take recommendation) | The very next spell the sorcerer casts uses it up. If it has a save area, allies in it are protected; otherwise it is wasted. A placement cancelled with Escape (refunded) leaves it armed for the re-cast. Any spell spends it, including a non-save one like Shield. | `5691967c` | `test/careful-disarm.test.mjs` (plus `core.test.mjs`, `resolve.test.mjs` updated) |
| tray-overflow | Play-test AO-1: tray buttons overflowed their 24 px height at the default chat sidebar width. | Approved (take recommendation) | The button row wraps; each label stays on one line inside its button, and a whole button moves to the next line if the three do not fit. | `822e7cd2` | `test/tray-css.test.mjs` |

## Goldens changed

- `foundry/module/pentaryn-aoe/test/golden/describe.json` — one row: the `careful` setting
  `doc` now says the protection applies to "the next spell they cast, if it calls for a save;
  then it ends" (metamagic-disarm). No other golden changed.

## Live check after deploy

Use only ZZ-prefixed scratch actors and scenes (e.g. scene `ZZ AoE Check`, actors
`ZZ Sorcerer`, `ZZ Ally`, `ZZ Goblin A/B/C`). Never Caven, Marrith, Talo or campaign scenes.

**aoe-edge-1**
1. On `ZZ AoE Check`, have `ZZ Sorcerer` cast Fireball over `ZZ Goblin A/B/C`; let the tray roll.
2. As GM, run `game.modules.get("pentaryn-aoe").api.applyRows(...)` twice without awaiting
   (or double-click Apply fast). Each goblin's HP drops by its damage once, not twice.

**aoe-R1**
1. Make one goblin's update fail (e.g. delete `ZZ Goblin B`'s token after the tray rolls but
   before Apply).
2. Press Apply: A and C take damage and show applied; a warning names B. Press Apply again:
   A and C do not take damage a second time.

**metamagic-disarm**
1. Give `ZZ Sorcerer` Careful Spell; use it, then cast Fireball over `ZZ Ally` and a goblin.
   `ZZ Ally` is marked protected.
2. Cast a second Fireball: no one is protected (Careful was used up).
3. Use Careful again, start a Fireball placement and press Escape (refund), re-cast: the
   ally is protected on the re-cast.

**tray-overflow**
1. On the GM tab at the default sidebar width, open a Fireball tray: "Re-roll NPC saves",
   "Ping" and "Apply" each sit on one line inside their button.
2. Widen the sidebar: all three return to one row.
