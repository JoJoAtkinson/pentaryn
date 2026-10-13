# Defect wave 3 (2026-10-13) — dropbin

**Read this when:** you want the history of defect wave 3 for the Drop Bin module
(`pentaryn-dropbin`): the two items wave 2 left open, what changed, and where each is tested.
History only; to operate the module read `foundry/module/pentaryn-dropbin/README.md`.

Branch `wave3/dropbin-2026-10-13` (from `origin/main` `e392ba56`). Both changes are declared
behaviour changes (blueprint §9). Gate `make foundry-dropbin-check`: 199 tests (after the verifier repair below), 40 checks, vendored
kit identical, conformance 100 % (50/50); green. Only `.mjs` files changed (no `module.json`, no
`lang/`): a reload is enough, no Foundry restart (blueprint §10).

## Items

| Item | Defect | What changed | Commits | Test |
|---|---|---|---|---|
| 1 | A drop onto an **existing** Item Piles pile wrote a `delete` row and a `drop` row. Item Piles' `_transferItems` deletes the item off the character (our sheet-delete capture records it), then creates it on the pile under a **new** `_id` (`ensureValidIds`), so FIX-3's `_id` match (`dropReplacesTail`) never paired them. | The ledger listens to Item Piles' `item-piles-preTransferItems` (registered at ready, before the drop capture; it never vetoes) and remembers what that transfer took off the character (`{_id, name, type, quantity}`). The drop capture matches the dropped item **within that one transfer** — by `_id`, else name + type + quantity (`movedSourceId`, ledger-core) — and hands the character-side id to `appendEntry` as `sourceId`; the drop then takes the delete row's place and number. A hand delete is never in a transfer, so a same-named hand delete keeps its own row (dropbin-EC-2). The socketlib relay never passes `sourceId`. Goldens: `describe.json` and `hooks-after-ready.json` gain the one pre-transfer registration. | `2907a1bd` | `test/drop-merge.test.mjs`: "wave-3 item 1: a drop onto an existing pile … is one 'drop' row", "… a hand delete, then a drop onto a pile of another same-named item, keeps both rows", "wave-3 item 1 movedSourceId …" (the first and third fail on `e392ba56`) |
| 2 | When a linked corpse's last token (or its scene) was deleted, dropbin gave the base actor's ownership map back but left Item Piles' pile flag (`flags.item-piles.data.enabled: true`, which `turnTokensIntoItemPiles` writes on a linked token's actor) and the Dead status on it. The actor's next token was born a dead pile with no corpse flag, which dropbin does not manage. | The release (`releaseBases` → `unobserveBase(actor, {released: true})`, on `deleteToken`, `deleteScene` and every `ready`) also writes `flags.item-piles.data.enabled: false` (the shape Item Piles' own revert writes; the rest of its pile data is kept) when the flag is on, and removes Dead only when dropbin added it. Whether Dead is ours is a new actor flag `flags.pentaryn-dropbin.dead`, saved with the ownership map at the first death (true when the actor had no Dead yet); a Dead the GM set before the death stays. A revival deletes the flag with the others. Golden: `describe.json` flag writes gain `flags.pentaryn-dropbin.dead` and `flags.item-piles.data.enabled`. | `914d9685` | `test/corpses.test.mjs`: "wave-3 item 2: deleting a linked corpse's last token clears dropbin's pile flag and Dead …", "wave-3 item 2: a Dead the GM set before death stays …" (both fail on `e392ba56`), "wave-3 item 2: a revival leaves no dropbin flag …" (guard) |

## Verifier repair

The verifier found item 1 matched against one module-level `lastTransfer` slot kept 2 s, and that a
`sourceId` from it **replaced** the drop item's own-id match. Reproduced: a drop onto an existing
pile, then within 2 s a same-named, same-type, same-quantity drop onto empty ground (Item Piles'
new-pile path: `_removeItems`, no transfer, the hook keeps the item's own id) gave two rows where
FIX-3 gave one. A transfer off another actor in between (a player looting a corpse) also overwrote
the slot and the drop fell back to two rows. The README's ledger bullet still said a drop onto an
existing pile is two rows. Repaired:

- `dropReplacesTail` matches the tail delete against the drop item's own `_id` **or** `sourceId`.
- Transfers are a list, one entry per transfer, pruned at 2 s and capped at 32 (`rememberTransfer`);
  `takeMoved` searches only the dropping actor's, newest first (by `_id` across them, then name +
  type + quantity), and takes the matched item out so it never matches a second drop.
  `movedSourceId` stays as its id-only wrapper.
- Item 2: Dead is removed **before** the flag-clearing update, so a failed removal leaves the actor
  our corpse and the next release (another token or scene delete, or the next `ready`) retries it.
  A corpse made before this deploy has no `dead` flag; its Dead is conservatively the GM's and
  stays, the pile still goes off (accepted).
- README ledger bullet and CHANGELOG describe the pre-transfer match.

Tests added (each fails on `09be6cb7`): `test/drop-merge.test.mjs` "… a drop onto a pile, then a
same-named drop onto the ground within 2 s, is one row each", "… another actor's transfer between
the pre-transfer hook and the drop does not lose the match", "… takeMoved …", "… dropReplacesTail:
the tail may match the drop item's own id or the transfer's id"; `test/corpses.test.mjs` "… a Dead
removal that fails leaves the actor our corpse, so the next release run finishes it". The two guard
tests ("a hand delete, then a drop onto a pile of another same-named item, keeps both rows" and "a
revival leaves no dropbin flag") pass on `e392ba56` by design: they pin behaviour that must not change.

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
5. Guard: give `ZZ Hero` two items both named `ZZ Torch` (loot): A at quantity 1, B at quantity 2.
   Delete A from the sheet, then within 2 s (the merge window; quickest from the console) drop 1 of
   B onto the existing pile. Pass: two rows, `delete` `ZZ Torch` then `drop` `ZZ Torch`; the hand
   delete is not swallowed.

**Item 2 — the base actor is clean after its last corpse token goes.**

1. Create an NPC `ZZ Vey` (max HP 30), **Link Actor Data** on, ownership default None.
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
