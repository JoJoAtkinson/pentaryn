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

## Files

| File | What |
|---|---|
| `dropbin.mjs` | entry point, ledger, pile hygiene, `game.pentaryn.dropbin` |
| `corpses.mjs` | corpse conversion, the drawn eye, legacy migration, GM HUD buttons |
| `loot.mjs` | the Loot all button |
| `loot-core.mjs` | pure rules for both (`node test/run.mjs`) |
| `lang/en.json` | strings |
