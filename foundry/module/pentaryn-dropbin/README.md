# Pentaryn Drop Bin

**Read this when:** an item went missing from a sheet, a dead NPC is or is not lootable, the eye
on a body is wrong, or a player asks how to take everything from a pile.

Four jobs, one module (`dropbin.mjs` loads the rest):

- **The ledger** (`dropbin.mjs`): every item that leaves a character is recorded with its full
  source data, so it can be handed back. Console API and details are in that file's header
  (`game.pentaryn.dropbin.list()`, `.restore(n)`, ...).
- **Pile hygiene** (`dropbin.mjs`): lock sounds on containers, piles never have sight, readable
  pins are never global, pile actors and pinned readables are hidden from the players' sidebar.
- **Lootable corpses** (`corpses.mjs`): a dead NPC becomes an Item Piles pile.
- **Loot all** (`loot.mjs`): a button on every loot window that takes everything.

## Lootable corpses

- **Only the dead can be looted.** An NPC at 0 HP, or carrying the Dead status, becomes a pile the
  players open with the usual double-click, from an adjacent square. Healing it above 0 turns it
  back into a creature. Set `flags.pentaryn-dropbin.noLoot = true` on a token or actor to keep a
  0-HP NPC alive and unlootable (knocked out for questioning).
- **What players see on the body:** the Dead skull as core's **full-body overlay**, and an
  **eye badge** (the loot-hotspot eye) in the token's top-right corner while the body still holds something. The eye is
  drawn by every client on the token itself. It is not an effect or any other document.
  - It disappears on its own when the body is emptied or revived. There is nothing to clean up.
  - It hides with the token: out of sight, under fog, or GM-hidden.
- **GM token HUD on a corpse:** *Open character sheet (GM)* (Item Piles otherwise takes over the
  double-click) and *Revive (1 HP)*.
- **Old corpses:** bodies made before October 2026 carried a "Lootable" ActiveEffect as the eye
  and Dead as a small corner icon. The active GM's client removes that effect and promotes Dead
  to the overlay on every `ready`; the console says how many it fixed. It is safe to run again:
  `game.pentaryn.dropbin.corpses.migrateLegacyEyes()`.

## Loot all

- **Where:** the footer of every Item Piles loot window (piles, containers, corpses, eye
  hotspots), next to the *Split* buttons. Item Piles' own *Take All Items* shows only when both
  item and currency sharing are off, and ours have sharing on, so it never appeared.
- **What it does:** `game.itempiles.API.transferEverything(pile, character)`. Item Piles runs it
  on the GM's client with its own item filters, chat card and delete-when-empty. It takes other
  players' unclaimed shares too, the same as Item Piles' Take All.
- **Into which character:** the one the window says *you're inspecting as* (it follows Item
  Piles' *Change*), else the user's assigned character, else the first player character they own.
- **Greyed out:** the tooltip says why. Either the pile is empty, or the player has no character
  of their own (assign one in *User Configuration*).
- **Not shown:** on merchants and vaults, on locked or closed containers, for a GM with no
  character, and when Item Piles' native *Take All* is already in the footer.
- **Needs a GM online.** Item Piles routes every transfer through the GM's client.

## Item Piles on dnd5e 6 (i18n shim)

dnd5e 6.0 deleted `DND5E.ItemRarityCommon` … `DND5E.ItemRarityArtifact` and `DND5E.Unknown`, but
itempilesdnd5e 1.1.0 still names them: the merchant window's **Rarity** column and the name an
**unidentified** item shows. Without them those cells read the raw key. `i18n-shim.mjs` copies the
words back under the old names at `i18nInit` (from `DND5E.ITEM.Rarity.*` and core's
`COMMON.Unknown`), and only for keys that are missing, so a translation module's words win.

- **Check it live:** `game.i18n.localize("DND5E.ItemRarityVeryRare")` reads "Very Rare", not the key.
  The console logs `Item Piles i18n shim added …` once per client load.
- **Retire it** (delete the file and its import in `dropbin.mjs`) when an itempilesdnd5e release
  reads `DND5E.ITEM.Rarity.*` itself. Registered as `itempiles-rarity-i18n` in
  `foundry/adjustments.yml`. The Saturday updater flags it when that release lands.
- **Needs dnd5e 6.0 or later** (`module.json`). Nothing else in the module changed for 6.0: the
  attunement repair is still needed (Item Piles still writes `NaN` into `system.attunement`).
  Corpses do not resize tokens, so `tokenSizeSync` leaves a body at its creature's size; hotspot
  piles smaller than their size category rely on `flags.dnd5e.lockSize` (set by the pre-flight).

## Files

| File | What |
|---|---|
| `dropbin.mjs` | entry point, ledger, pile hygiene, `game.pentaryn.dropbin` |
| `corpses.mjs` | corpse conversion, the drawn eye, legacy migration, GM HUD buttons |
| `loot.mjs` | the Loot all button |
| `loot-core.mjs` | pure rules for corpses and Loot all (`node test/run.mjs`) |
| `i18n-shim.mjs` | Item Piles i18n shim for dnd5e 6 (`fillMissingKeys` is tested by `node test/run.mjs`) |
| `lang/en.json` | strings |
