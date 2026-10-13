# Defect wave 2 (2026-10-12) — dropbin

**Read this when** you want the history of defect wave 2 for the Drop Bin module
(`pentaryn-dropbin`): what each finding was, the ruling, what changed and where it is tested.
History only; to operate the module read `foundry/module/pentaryn-dropbin/README.md`.

Branch `fix2/dropbin-2026-10-12`. Every change is a declared behaviour change (blueprint §9).
Gate `make foundry-dropbin-check`: 178 tests, 40 checks, conformance 100 % (50/50); green.
No item was reverted: every fix holds.

## Items

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| DB-AC-1 | Every client wrote drops; scene taken from the viewer | recommendation | Only the active GM writes the ledger, one row per item, tagged with the pile's own scene | dad12f7a | drop-capture, glue, submit |
| DB-AC-2 | A relay arriving while the GM tab loads was lost | recommendation | Held and recorded in arrival order at ready | 9ba44491 | preready-relay |
| DB-AC-3 | Any user could relay any ledger entry | recommendation | Entry refused (one warning) unless its user exists and is a GM or owns the source actor; gone actor → only the user is checked | 2af6d0da | relay-sender, preready-relay |
| DB-AC-4 | A linked NPC with several tokens converted one token at a time | recommendation | One Item Piles call for all of the actor's tokens; Dead overlay applied once | babb8336 | corpses |
| dropbin-EC-2 | Two distinct same-named items lost within 2 s collapsed into one | recommendation | De-dupe keys on item id, so both record; one loss seen by two clients still counts once | a983dd83 | core, core-barrel |
| dropbin-EC-3 | Corpse sheet veto could throw; Ctrl/bypass opened loot with no distance check; a linked corpse left its base actor observed | recommendation ("nothing") | Veto always returns false for players and opens nothing; players loot via Item Piles' double-click (distance 1); GM exempt; active GM restores the base actor's ownership when no corpse token of it remains (deleteToken, deleteScene, ready sweep); 33 load-time registrations | 6b8a4d7a, 3bb08f1b | corpses |
| dropbin-EC-4 | Revive could convert twice and wipe restored ownership | recommendation | One revive at a time per corpse | 615ce9c2 | corpses |
| dropbin-EC-5 | Sync saw only the viewed scene's tokens; preview clones broke the batch | recommendation | `getDependentTokens({ concreteOnly: true })` on every scene; clones skipped | 7227880d, 6cbcb0eb | corpses |
| dropbin-EC-6 | A corpse that lost its OBSERVER map or sight-off was left unlootable | recommendation | The next sync re-writes just those two | 1c031033 | corpses |
| dropbin-EC-9 | Ambiguous-name lookup was undocumented | recommendation | Still throws AMBIGUOUS; docs say use the id, a scene or the actor | 13800557 | llm-reads |
| dropbin-EXT-2 | API description missed corpse writes | recommendation | Every corpse flag, the Lootable removal and the Dead overlay are declared | f55363cd | api |
| dropbin-EXT-3 | Item Piles loot-window selectors scattered | recommendation | One frozen SELECTORS table in piles.mjs | 406c9b5d | piles-selectors |
| dropbin-EXT-5 | Loot all fallback recipient hard-coded 'character' | recommendation | Uses Item Piles' character type; 'character' only without Item Piles | 5b6c7de3 | glue |
| dropbin-EXT-6 | Corpse write rows could drift | recommendation | Rows built from shared constants (already fixed, no change this wave) | — | api |
| dropbin-EXT-7 | Shim rarity word without English fallback went unnoticed | recommendation | A test holds LEGACY_KEYS and LITERAL to the same keys | 03856cad | i18n-shim-keys |
| dropbin-EXT-8 | Eye badge relied on one world's Data file | recommendation | Eye ships as `assets/icon-eye.webp` in the module | 6f1e1fd3 | eye-asset |
| dropbin-perf-1 | Item Piles queried every frame for the eye | recommendation | Answer cached on corpse/token/item change; movement only repositions | 59f58a25 | eye |
| dropbin-R1 | `list(0)` returned the whole ledger | recommendation | `list(0)` is `[]` | 733776ce | core-barrel |
| dropbin-R2 | `list(n, null)` threw | recommendation | Treated as `list(n)` | d22c9e63 | llm-reads |
| dropbin-R3 | Unresolvable restore target fell back to the dropper | recommendation | Refused with `no-actor`; token/UUID targets resolve to their actor; blank still means the dropper | 3fc5e03f | core, core-barrel, llm-reads |
| dropbin-R4 | Unlinked-token drops restored onto the base actor | recommendation | Restores onto the token's actor while it exists, base actor after | 52ae626e | core |
| dropbin-R5 | Failed restore rejected unhandled | recommendation | Returns `not-created`, one toast, one warning | ab5a60ef | llm-reads |
| dropbin-R6 | Corpse ops without Item Piles / on wrong input misbehaved; half-made piles | recommendation | One warning and stop; a failed flag write reverts the new pile | dae4ff8d | corpses |
| dropbin-R7 | Failed HUD Revive was an unhandled rejection | recommendation | One toast, one prefixed warning | a3000f15 | submit |
| dropbin-R8 | Missing eye texture warned every frame | recommendation | One warning; retried only after canvasReady | ffd5f2cd | eye-texture |
| dropbin-R9 | 'Locked' float could land on another copy of the chest | recommendation | Float on the token actually tried; none if not on canvas (notification still shows) | 12b0e93a | lock-float |
| dropbin-R10 | One garbled relayed entry broke its coalesced batch | recommendation | Skipped with one warning; the others still record | 41b01ee0 | relay-shape, preready-relay |
| dropbin-M5 | `isDead(null)` returned undefined | recommendation | Returns false | ea2f2bce | corpses |
| dropbin-M6 | Two copies of the lock veto | recommendation | One `refuseIfLocked` handler, same behaviour | 4b68b199 | lock-veto |
| dropbin-M8 | inspect's second param undocumented | recommendation | Already fixed; describe lists both params | — | llm-reads |
| dropbin-M11 | Take All detection built ad hoc | recommendation | Already fixed; built from shared selectors | — | piles-selectors |
| dropbin-M12 | socketlib probed in several places | recommendation | Only the adapter's `socketlibPresent()` | 265a93c4 | socketlib-boundary |
| dropbin-M13 | Manifest helper misnamed | recommendation | `corpseRow` → `legacyRow` (internal) | 2aff0495 | api |

## Goldens changed

- `test/golden/describe.json` — corpse write rows (EXT-2), restore/no-actor (R3), R6, EC-5, EC-6, EC-9 sentence, M5, EC-3.
- `test/golden/hooks.json` — EC-3's deleteToken, deleteScene and once:ready registrations (33 total); DB-AC-1.
- `test/golden/ledger-entry.json` — DB-AC-1 scene tagging.
- `scripts/foundry/live-goldens/dropbin.js` — live-golden probe updated for the declared values.

## Live check after deploy

Restart required (lang/en.json and a new asset changed). ZZ scratch docs only; delete them after.

- **DB-AC-1** — GM tab viewing ZZ scene A, drop two ZZ loot items from a ZZ character onto ZZ scene B: ledger gains exactly two rows with sceneName B.
- **DB-AC-2** — shadow `game.ready=false`, `recordAsGM` a ZZ entry, restore and fire the ready drain: one entry with the next number.
- **DB-AC-3** — `executeAsGM('record', zzEntry)` with a ZZ user that does not own the ZZ actor: refused, one warning; same entry with the GM's id records.
- **DB-AC-4** — three tokens of one ZZ linked npc to 0 HP: all three corpses, exactly one Dead effect, one conversion logged.
- **dropbin-EC-2** — two same-named ZZ loot items deleted within 2 s: two entries with different item._id.
- **dropbin-EC-3** — ZZ linked npc to 0 HP: a simulated player cannot open its sheet (veto false, nothing opens); delete the token: the actor's ownership returns to the saved map and corpse flags are gone.
- **dropbin-EC-4** — ZZ npc with a pre-set delta.ownership: kill, HUD Revive; ownership equals the pre-death map, `inspect()` shows corpse:false.
- **dropbin-EC-5** — ZZ linked npc on ZZ scene B, GM viewing A, HP 0 from the sidebar: `inspect(zzActor)` lists the B token corpse:true.
- **dropbin-EC-6** — set a ZZ corpse's delta.ownership to `{default:0}`, `corpses.sync(zzActor)`: default back to OBSERVER.
- **dropbin-EC-9** — inspect two same-named ZZ tokens: AMBIGUOUS thrown.
- **dropbin-EXT-2 / EXT-6 / M8 / M13** — `game.pentaryn.dropbin.describe()` equals the regenerated golden.
- **dropbin-EXT-3 / M11** — open a ZZ pile's loot window: Loot all sits before Leave and greys correctly.
- **dropbin-EXT-5 / EXT-7 / M6 / M12 / R5 / R7 / R10** — code only (node tests).
- **dropbin-EXT-8** — make a ZZ corpse: eye loads from `modules/pentaryn-dropbin/assets/`.
- **dropbin-perf-1** — `console.count` in isItemPileEmpty, drag a ZZ corpse: flat during drag, one tick when an item is taken.
- **dropbin-R1 / R2 / M5** — `list(0)` is `[]`; `list(3, null)` returns three; `corpses.isDead(null) === false`.
- **dropbin-R3** — `restoreResult(n, 'ZZ no such actor')` → `{ok:false, reason:'no-actor'}`; with a ZZ token uuid it creates on that token's actor.
- **dropbin-R4** — delete a ZZ loot item from an unlinked ZZ npc token's sheet, `restoreResult(n)`: lands on the token actor.
- **dropbin-R6** — `corpses.toCorpse(zzToken.object)` returns undefined with one `pentaryn-dropbin |` warning, token unchanged.
- **dropbin-R8** — point EYE at a missing path, drag a ZZ corpse: one warning; after a scene change one more attempt.
- **dropbin-R9** — two unlinked tokens of a ZZ locked container, simulated player, fire item-piles-preRenderInterface with the second: float over the second.

## Forward fix FIX-3 (2026-10-13) — DB-AC-1 live

Branch `fix2/dropbin-live-2026-10-13`, declared. The FIX-2 live check of DB-AC-1 failed:

- **No scene on a drop onto empty ground.** Item Piles 3.3.4 `_dropItems` passes the new pile to
  its drop hook as `_createItemPile`'s return value `{tokenUuid, actorUuid}`; its `callHook` resolves
  only uuid strings, so `pileScene` saw a plain object and `target?.uuid` was undefined. The node test
  passed a TokenDocument and missed it. Fix: `resolvePile(target, fromUuidSync)` in ledger-core takes
  a uuid string, a document or `{tokenUuid, actorUuid}` (token first) → `{doc, uuid}`.
- **Two rows per drop.** Item Piles removes the item on the active GM's client (`_removeItems` /
  `_transferItems`, no options), so `preDeleteItem` recorded a `delete` row before the `drop` row.
  Fix: `appendEntry` puts a drop in the tail's place (same number) when the tail is a `delete` of the
  same actor and item `_id` within DEDUPE_MS (`dropReplacesTail`). Older than this wave; fixed here
  because the check's "exactly one row per item" depends on it.

Tests: `test/drop-capture.test.mjs` (object/actor-only/vetoed targets, resolvePile),
`test/drop-merge.test.mjs` (delete-then-drop is one row; a hand delete then another item's drop is two;
appendEntry merge rules). Gate `make foundry-dropbin-check`: 188 tests, 40 checks, conformance 100 %.

Live re-check (2026-10-13, GM viewing ZZ scene A, Item Piles' own `dropItems` socket handler, ZZ Hero
→ empty ground on ZZ scene B, twice): exactly two rows, both `drop`, sceneName `ZZ dropbin B`, each
with its new pile's token uuid and x/y; no `delete` rows. **DB-AC-1 passes.** Not fixed (open
follow-up): a drop onto an existing pile (`_transferItems`) is still `delete` + `drop`, because the
item gets a new `_id` on the pile; pairing them needs Item Piles' `preTransferItems` deltas, not a
name match (which would collapse a real same-named hand delete, dropbin-EC-2).
