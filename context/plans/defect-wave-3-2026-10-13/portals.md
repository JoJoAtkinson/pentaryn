# Defect wave 3 (2026-10-13): portals

**Read this when:** you want the history of defect wave 3 for `pentaryn-portals`: what was fixed, why, which commits, and how to check it live. This is a history record. To operate portals, use `foundry/module/pentaryn-portals/README.md`.

Branch `wave3/portals-2026-10-13` (from `origin/main` e392ba56). Joe approved every change as a declared behaviour change on 2026-10-13. Where he gave no ruling, the recommendation was taken. Gate: `make foundry-portals-check` (233 tests, portals-core 52, vendored kit identical, conformance 100 %). The items close the portals line under "Still open" in [`../defect-wave-2-2026-10-12/README.md`](../defect-wave-2-2026-10-12/README.md).

## Fixes

| item | defect | what changed (plain words) | commits | test |
|---|---|---|---|---|
| portals-w3-1a | Snapshot read `Scene#background`, which Foundry v14 has deprecated, so every snapshot printed a compatibility warning | Snapshot reads the image from the scene's first Level (`scene.firstLevel.background.src`). That is the same image the old shim returned, so the crop is unchanged and there is no warning. A scene with no art on its first Level still gets "no background image". | a922fb95 | test/glue.test.mjs |
| portals-w3-1b | Teleport party (same scene) and the arrival step-off moved tokens with the `teleport` update option, deprecated since v13, which printed a compatibility warning | Both now pass `{ animate: false, movement: { <tokenId>: { waypoints: [{ x, y, action: "displace" }] } } }` (new `displaceOptions` in `portals-core.mjs`). This is the shape core's own `RegionDocument#teleportTokens` uses. Tokens land on the same squares instantly with no warning. Core already turned `teleport: true` into a `displace` waypoint, so the movement is the same. | df77e1ad | test/party.test.mjs |
| portals-w3-2 | An arriving PC that stepped off an occupied square kept an empty `flags.pentaryn-portals.claims {}` | When the spread claim is the only one, the move deletes `claims` itself. If another claim key is there, only `spread` is removed. | 1964c04d | test/party.test.mjs |

Test fixture: `test/fixtures/world.mjs` now builds v14-shaped scenes. The art lives on a `levels` collection with `firstLevel`/`initialLevel`. `Scene#background` and the `teleport` option (on `updateEmbeddedDocuments` and on `Token#update`, through `preUpdateToken`) log core's compatibility warnings through `foundry.utils.logCompatibilityWarning`. `W.deprecationsSince(i)` reads those warnings back. The fixture commit landed with item 1a. It changes no golden.

No golden changed. No `module.json`, `lang/` or `lib/` change. **Needs a reload, not a restart** (blueprint §10: `.mjs` only).

## Live check after deploy

Reload the GM tab. Use one GM tab only, and only ZZ-prefixed scratch scenes, regions, actors and tokens, deleted afterwards. Watch the console for `deprecated` lines while you work.

- **portals-w3-1a**: on a ZZ scene with a background image and a ZZ teleport region, run `game.pentaryn.portals.snapshot(<ZZ region uuid>)`. It returns a path, the card image updates, and the console shows no `Scene#background is deprecated` line.
- **portals-w3-1b**: on that ZZ scene, place two ZZ character tokens owned by a ZZ actor and a second ZZ region. Run `game.pentaryn.portals.teleportParty(<second ZZ region uuid>, { confirm: false })`. The tokens jump with no animation and no ruler, the toast says 2 moved, and the console shows no `DatabaseUpdateOperation#teleport has been deprecated` line.
- **portals-w3-2** (and 1b for the step-off): walk a ZZ character token through a ZZ region into ZZ scene B, where a ZZ token already stands on the landing square. It steps once to a free square without a deprecation line, and `canvas.scene.tokens.getName("<ZZ PC>").flags["pentaryn-portals"]` has no `claims` key.
