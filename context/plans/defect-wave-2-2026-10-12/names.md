# Defect wave 2 2026-10-12 — names (pentaryn-names)

**Read this when:** you want the history of defect wave 2 (2026-10-12) for the names module (`pentaryn-names`): what was fixed, why, and how to check it live. This is a history record, not instructions.

Source record: [`final-review-2026-10-12/names.md`](../final-review-2026-10-12/names.md). Branch `fix2/names-2026-10-12`.
Gate: `make foundry-names-check` passes: 69/69 tests, vendored kit identical to `foundry/lib`, conformance 100 % (44/44).

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| names-rob-2 | `api.sync` with a missing or non-string old/new name blanked every matching token label and showed a toast reading "undefined" | Take the recommendation (refuse with BAD_ARGS) | `api.sync` now refuses with `fail("BAD_ARGS", "oldName and newName must be strings")`. It writes nothing and shows no toast. | `5bda2045` | `test/sync-ref.test.mjs` (`names-rob-2: …`) |
| names-maint-1 | `api.sync` sometimes returned a plain object or threw synchronously instead of returning a Promise | Take the recommendation (always async) | `sync` always returns a Promise. A success, BAD_ARGS, AMBIGUOUS or an error all come back through it, so callers that `await` it never break. | `48efdc8d` | `test/sync-ref.test.mjs` (`names-maint-1: …`) |
| names-edge-3 | If Foundry refused the combat-tracker rename on the GM's client, the token toast was skipped and `sync` rejected | Joe's ruling: log it and carry on | The token labels still change and the "Token labels updated" toast still shows. The refused combatant write goes to the console as one warning (`pentaryn-names \| relabel combatants after rename failed`). | `113e6067` | `test/combatants.test.mjs`, `test/synthetic-rename.test.mjs` (`names-edge-3: …`) |
| names-ac-3 (+edge-4) | Two quick renames of one actor (Bob → Rob → Robert) could leave the labels on the middle name | Take the recommendation (chain per actor) | Relabels are queued per actor, so the labels always end on the last name. Renames of different actors still run in parallel. | `6ba8fbd5` | `test/rename-chain.test.mjs` (`names-ac-3: …`) |
| names-maint-2-manifest | The `sync` help text did not say what happens with a wrong-kind reference or missing names | Take the recommendation (document it) | The manifest row now says a wrong-kind reference (an item, a number) or a missing/non-string name returns BAD_ARGS and changes nothing. This is a documentation fix only. | `134259ee` | `test/sync-ref.test.mjs` (`names-maint-2-manifest: …`) |
| names-maint-4 | The changelog's Unreleased header still said kit 1.0.2 (the vendored kit is 1.1.0) and the W2-B4 change had no line | Joe's ruling (header = vendored kit, add W2-B4); the kit group's re-vendor commits were already made without it, so it is done here | The header says kit 1.1.0 and W2-B4 has its line. A new test pins the header to `lib/errors.mjs` `KIT_VERSION`, so after the kit 1.2.0 merge the gate stays red until the header says 1.2.0 (a one-word edit). | `93d2d26f` | `test/changelog.test.mjs` (`names-maint-4: …`) |

All the committed items are declared behaviour changes and have lines under the CHANGELOG `Unreleased` header. There is no version bump.

## Goldens changed

None. `git diff main...fix2/names-2026-10-12 -- '**/golden/**'` is empty.

## Live check after deploy

Use only ZZ-prefixed scratch documents: an NPC actor `ZZ Bob` with one placed token labelled `ZZ Bob` on a scene `ZZ Names Test`. Never use Caven, Marrith, Talo or a campaign scene. Delete the scratch documents afterwards.

**names-rob-2**
1. Eval `await game.pentaryn.names.sync("ZZ Bob")` with no names. Expect `{ok:false, code:"BAD_ARGS"}`. The token should still read `ZZ Bob`, and no toast should appear.

**names-maint-1**
1. Eval `game.pentaryn.names.sync("zz", "a", "b") instanceof Promise`. Expect `true`. Await it afterwards so nothing is left dangling.

**names-edge-3**
1. Code only. `combatants.test.mjs` shows that a rejecting `Combat.updateEmbeddedDocuments` still gives the token count, one toast and one warn line. You cannot force Foundry to refuse the write at a live table.

**names-ac-3**
1. With `a = game.actors.getName("ZZ Bob")`, run in one eval: `a.update({name:"ZZ Mid"}); await a.update({name:"ZZ Fin"});` (do not await the first call). Wait a second.
2. Expect the token and the prototype token to read `ZZ Fin`, not `ZZ Mid`, and two toasts.
3. Rename the actor back to `ZZ Bob`, then delete the scratch actor and scene.

**names-maint-2-manifest**
1. Code only (documentation in `api-manifest.mjs`).
