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

## Live check result (FIX-W3, 2026-10-13)

Run in the MCP bridge GM tab on world `pentaryn` (Foundry 14.369, dnd5e 6.0.6, `pentaryn-portals` 0.5.0), with no restart or reload. The installed module matches the repo, and the loaded `portals-core.mjs` exports `displaceOptions`. Scratch docs were ZZ portals scenes A and B, which used an existing map image on their first Level. They held regions "ZZ portals A snap", "A party", "A walk" and "B landing", plus three linked ZZ character actors and a ZZ NPC occupant. Deprecation lines were caught with an in-page `console.warn/error/log` capture. A **positive control** proved the capture works: reading `Scene#background` on purpose logged `Scene#background is deprecated…` into it, so a deprecation is not suppressed as once-only.

| item | result | evidence |
|---|---|---|
| portals-w3-1a | pass | `snapshot("Scene.…Region.<ZZ A snap>")` returned `assets/tokens/custom/portals/<sceneId>-<regionId>.webp`. The region's `flags.pentaryn-portals.img` went from unset to that path `?v=…`, and `cardFor(region).img` showed it. The capture got 0 deprecation lines during the snapshot. |
| portals-w3-1b | pass | With the GM view on ZZ A (view only, nothing activated), `teleportParty(<ZZ A party uuid>, { confirm: false })` returned `{ moved: 2, cancelled: false }`, and the toast read "2 party tokens moved to ZZ portals A.". PC1 went (0,0)→(1050,1050) and PC2 went (150,0)→(900,900). Each had one passed waypoint with `action: "displace"`, no movement animation promise and no ruler. 0 deprecation lines. |
| portals-w3-2 (+1b step-off) | pass | ZZ PC3 was walked into "ZZ portals A walk" (a teleport to "ZZ portals B landing", where the ZZ occupant stood at (600,600)). Core created it on B at (600,600). It then made one `displace` step to (450,450), and the movement origin was (600,600). Its `_source.flags["pentaryn-portals"]` is `{}`, with no `claims` key. 0 deprecation lines. |

Notes for the next live check. `createEmbeddedDocuments` does not keep creation order, so find scratch regions by name, not by array position. The GM tab is hidden (`document.visibilityState === "hidden"`), so `setTimeout` waits inside one eval are throttled. Start the walk in one eval and read the result in the next. The game was paused throughout, and that did not block the GM's walk or teleport.

Cleanup: both ZZ scenes (with their regions and tokens) and the 4 ZZ actors were deleted, along with the snapshot `.webp` the check uploaded. The console capture was restored. The GM view went back to Drow Prison (Devils Hold Prison), which stayed the active scene. The game stayed paused. Exactly one GM is active.
