# Defect wave 2 2026-10-12 — creatures (pentaryn-creatures)

**Read this when:** you want the history of defect wave 2 (2026-10-12) for the creatures module (`pentaryn-creatures`): what was fixed, why, and how to check it live. History, not instructions.

Source record: [`final-review-2026-10-12/creatures.md`](../final-review-2026-10-12/creatures.md). Branch `fix2/creatures-2026-10-12`.
Gate: `make foundry-creatures-check`: 118/118 node tests, 73/73 core, vendored kit identical (12 files), conformance 100 % (50/50).

Joe gave no specific ruling on any of these items, so each one follows the review's recommendation under the wave-2 approval. Every change is declared, with a line under the CHANGELOG `Unreleased` header. There is no version bump.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| creatures-edge-1 (+ext-2) | `uninstall()` left the setting change handlers in place, so toggling showStrip brought the strip back and a lightRadius change rewrote token lights | Recommendation: clear the handlers on uninstall | After `uninstall()`, changing a Creatures setting does nothing. Re-importing the module registers the handlers again. | `3df1189e` | `test/glue.test.mjs` and `test/hooks.test.mjs` (`creatures-edge-1 [declared]: …`) |
| creatures-rob-1 | `api.list("<userId>", scene)`, the only form the bridge can send, answered at the actor's default ownership | Recommendation: resolve user and scene refs | `list()` accepts a user or a scene as a document, id, uuid or exact name. A user id now gives exactly what that player sees. | `cdece6ad` | `test/api.test.mjs` (`creatures-rob-1: …`) |
| creatures-rob-2 | `api.list(null, scene)` threw, although `user` is declared optional | Recommendation: treat null as omitted | A null user or scene falls back to the default (this client's user, the viewed scene). With no viewed scene, `list()` answers `[]`. | `771aeabb`, `cdd97f22` | `test/api.test.mjs` (two `creatures-rob-2: …` tests) |
| creatures-rob-3 (+edge-2) | syncAll stopped at the first scene whose write failed, on ready and on a lightRadius change | Recommendation: catch per scene | A failed scene produces one console warning that names it, and every later scene still syncs. The count covers the scenes that synced. | `47745c33` | `test/glue.test.mjs`, `test/glue-ready-fail.test.mjs` (`creatures-rob-3 …`) |
| creatures-edge-3 (+perf-1) | The strip's pure 60 ms debounce could be held off indefinitely by steady token-flag traffic from other modules | Recommendation: window mode | The strip redraws no more than 60 ms after the first change. A burst of changes still produces a single redraw. | `ffc89887` | `test/glue-player.test.mjs` (`creatures-edge-3 [declared]: …`, `transform-creatures-25` re-pinned) |
| creatures-rob-4 | `api.syncScene` with a bad scene threw a raw TypeError on the GM and resolved 0 elsewhere | Recommendation: resolve, fail coded | `syncScene` accepts a scene id, uuid or exact name. A missing or unknown scene rejects with `NOT_FOUND` or `BAD_ARGS` on every client. | `d88bc3a5` | `test/api.test.mjs` (`creatures-rob-4 [declared]: …`) |
| creatures-rob-5 | `api.isCreature` threw on null and lost the token-level flags when given a placeable | Recommendation: normalise `tokenDoc?.document ?? tokenDoc` | `isCreature` returns the same answer for a canvas Token and for its document, so Item Piles chests and AoE handles are excluded both ways. Null or undefined answers `false`. | `91eca2b9` | `test/api.test.mjs` (`creatures-rob-5 [declared]: …`) |
| creatures-M8 | The entry header said "Files, in load order:", but the import order is different | Recommendation: reword | The comment now reads "Files (core first, then the features, then the API):". This is a comment-only change. | `e85a6edd` | `test/entry-header.test.mjs` (two `creatures-M8: …` tests) |
| creatures-ext-9 | `status()` hard-codes the four setting keys, so a fifth SETTINGS row would be missed without any failure | Recommendation: test-only guard | A new test fails unless every SETTINGS key is in `status()` and named in the status row's `returns`. This is a test-only change. | `2554ce1e` | `test/api.test.mjs` (`creatures-ext-9 [declared]: …`) |

No item was reverted: all nine hold.

## Goldens changed

`foundry/module/pentaryn-creatures/test/golden/describe.json`, all declared:
- `list` params `user` / `scene`: type is now `User | uuid | id | exact name` / `Scene | uuid | id | exact name` (rob-1).
- `syncScene` param `scene`: type widened the same way; adds `throws: ["NOT_FOUND", "BAD_ARGS"]` and a doc sentence (rob-4).
- `syncAll` doc: names the per-scene warning (rob-3).
- `isCreature` param `tokenDoc`: type `TokenDocument | Token placeable` and a doc line (rob-5).

## Deploy

Module `pentaryn-creatures`. Only `.mjs` content changed. No module.json, esmodules list, lang, styles or kit changed, so a reload is enough (blueprint §10) and no restart is needed. No Python or fork changes.

## Live check after deploy

Use the one GM tab only, and only ZZ-prefixed scratch scenes and actors. Never touch Caven, Marrith, Talo or a campaign scene. Delete the scratch documents afterwards.

**creatures-edge-1**
1. Create a scene `ZZ Light Scratch` holding a token of a ZZ npc actor `ZZ Critter` that grants OWNER to an existing player user. Confirm the token's `light.bright` is 5.
2. Run `game.pentaryn.creatures.uninstall()`, then `game.settings.set('pentaryn-creatures','lightRadius',5.5)`. Expect: the token's `light.bright` stays 5 and no `updateToken` fires.
3. Set lightRadius back to 5 and reload the tab. Confirm the token is lit at 5 again.

**creatures-rob-1**
1. On the same ZZ scene (the actor's default ownership is NONE, and player U has OWNER), run `game.pentaryn.creatures.list(U.id, zzScene)`. Expect: it deep-equals `list(game.users.get(U.id), zzScene)` and contains the ZZ token.
2. `list(U.name, zzScene.name)` gives the same result.

**creatures-rob-4**
1. `await game.pentaryn.creatures.syncScene('ZZ Light Scratch')` resolves to a number.
2. `await game.pentaryn.creatures.syncScene('no-such-scene')` rejects with `err.code === 'NOT_FOUND'`.
3. Delete `ZZ Light Scratch` and `ZZ Critter`.

The remaining items (rob-2, rob-3, edge-3, rob-5, M8, ext-9) are code-only and are covered by the gate.
