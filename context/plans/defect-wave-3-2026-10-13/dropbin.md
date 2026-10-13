# Defect wave 3 (2026-10-13) — dropbin

**Read this when** you want the history of defect wave 3 for the Drop Bin module
(`pentaryn-dropbin`): the two items wave 2 left open, what changed, and where each is tested.
History only; to operate the module read `foundry/module/pentaryn-dropbin/README.md`.

Branch `wave3/dropbin-2026-10-13` (from `origin/main` `e392ba56`). Both changes are declared
behaviour changes (blueprint §9). Gate `make foundry-dropbin-check`: 194 tests, 40 checks, vendored
kit identical, conformance 100 % (50/50); green. Only `.mjs` files changed (no `module.json`, no
`lang/`): a reload is enough, no Foundry restart (blueprint §10).

## Items

| Item | Defect | What changed | Commits | Test |
|---|---|---|---|---|
| 1 | A drop onto an **existing** Item Piles pile wrote a `delete` row and a `drop` row. Item Piles' `_transferItems` deletes the item off the character (our sheet-delete capture records it), then creates it on the pile under a **new** `_id` (`ensureValidIds`), so FIX-3's `_id` match (`dropReplacesTail`) never paired them. | The ledger listens to Item Piles' `item-piles-preTransferItems` (registered at ready, before the drop capture; it never vetoes) and remembers what that transfer took off the character (`{_id, name, type, quantity}`). The drop capture matches the dropped item **within that one transfer** — by `_id`, else name + type + quantity (`movedSourceId`, ledger-core) — and hands the character-side id to `appendEntry` as `sourceId`; the drop then takes the delete row's place and number. A hand delete is never in a transfer, so a same-named hand delete keeps its own row (dropbin-EC-2). The socketlib relay never passes `sourceId`. Goldens: `describe.json` and `hooks-after-ready.json` gain the one pre-transfer registration. | `2907a1bd` | `test/drop-merge.test.mjs`: "wave-3 item 1: a drop onto an existing pile … is one 'drop' row", "… a hand delete, then a drop onto a pile of another same-named item, keeps both rows", "wave-3 item 1 movedSourceId …" (the first and third fail on `e392ba56`) |
| 2 | When a linked corpse's last token (or its scene) was deleted, dropbin gave the base actor's ownership map back but left Item Piles' pile flag (`flags.item-piles.data.enabled: true`, which `turnTokensIntoItemPiles` writes on a linked token's actor) and the Dead status on it. The actor's next token was born a dead pile with no corpse flag, which dropbin does not manage. | The release (`releaseBases` → `unobserveBase(actor, {released: true})`, on `deleteToken`, `deleteScene` and every `ready`) also writes `flags.item-piles.data.enabled: false` (the shape Item Piles' own revert writes; the rest of its pile data is kept) when the flag is on, and removes Dead only when dropbin added it. Whether Dead is ours is a new actor flag `flags.pentaryn-dropbin.dead`, saved with the ownership map at the first death (true when the actor had no Dead yet); a Dead the GM set before the death stays. A revival deletes the flag with the others. Golden: `describe.json` flag writes gain `flags.pentaryn-dropbin.dead` and `flags.item-piles.data.enabled`. | `914d9685` | `test/corpses.test.mjs`: "wave-3 item 2: deleting a linked corpse's last token clears dropbin's pile flag and Dead …", "wave-3 item 2: a Dead the GM set before death stays …" (both fail on `e392ba56`), "wave-3 item 2: a revival leaves no dropbin flag …" (guard) |

## Live check after deploy

Run as the GM in the one GM tab, on scratch documents only: every name below starts with `ZZ`;
create them, then delete them all at the end. Never Caven, Marrith, Talo or a campaign scene. Item
Piles must be active. Reload the world after the deploy (no restart needed).

**Item 1 — a drop onto an existing pile is one row.**

1. Create scene `ZZ dropbin W3`, a character actor `ZZ Hero` owned by the GM with two items: `ZZ
   Coil` (loot, quantity 2) and `ZZ Flask` (loot, quantity 1). Place a `ZZ Hero` token.
2. Drop `ZZ Flask` from the sheet onto empty ground on `ZZ dropbin W3` (Item Piles creates a pile).
   Note `game.pentaryn.dropbin.list(1)[0].n` = N.
3. Drop the whole `ZZ Coil` stack (2) from the sheet onto **that existing pile's token**.
4. Pass: `game.pentaryn.dropbin.list(3, {brief: true})` shows exactly one new row after N: `reason:
   "drop"`, `itemName: "ZZ Coil"`, `quantity: 2`, `sceneName: "ZZ dropbin W3"`, `pileUuid` = the
   existing pile's token uuid; no `delete` row for `ZZ Coil`; the counter is N + 1.
5. Guard: delete a `ZZ Flask`-named item from the sheet by hand (create a second one first), then
   within 2 s drop 1 of a stack of 2 `ZZ Flask` onto the pile: both rows stay (`delete`, then `drop`).

**Item 2 — the base actor is clean after its last corpse token goes.**

1. Create an NPC `ZZ Vey` (hp 0/30 → set later), **Link Actor Data** on, ownership default None.
   Place two `ZZ Vey` tokens on `ZZ dropbin W3` at full HP.
2. Set `ZZ Vey` HP to 0. Pass: both tokens become corpse piles (eye badge, Dead overlay);
   `game.actors.getName("ZZ Vey").flags["pentaryn-dropbin"]` has `corpse: true, dead: true`.
3. Delete one token: the actor is unchanged (still a pile, still Dead). Delete the second token.
4. Pass: on the actor, `flags["item-piles"].data.enabled === false`, `statuses.has("dead") ===
   false`, `flags["pentaryn-dropbin"]` is `{}` (or absent), `ownership.default` is None again.
5. Drag a new `ZZ Vey` token onto the scene: `game.itempiles.API.isValidItemPile(token)` is false;
   it is a plain (0-HP) creature. Setting its HP to 0 again (or any hp update) turns it into a
   managed corpse (`flags["pentaryn-dropbin"].corpse === true` on the token).
6. Guard: a second linked NPC `ZZ Ash` given Dead by the GM (token HUD) **before** its HP reaches 0,
   then killed, then its only token deleted: the pile is off, Dead **stays**.
7. Clean up: delete `ZZ Hero`, `ZZ Vey`, `ZZ Ash`, every `ZZ` pile actor Item Piles made, and scene
   `ZZ dropbin W3`. The ledger rows written by the check may stay (numbers are never reused) or be
   left for the GM.
