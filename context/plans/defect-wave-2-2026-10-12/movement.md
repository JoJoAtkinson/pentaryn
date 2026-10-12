# Defect wave 2 (2026-10-12) — movement

**Read this when** you want the history of defect wave 2 for `pentaryn-movement` (what was
fixed, why, and how to check it live). History, not instructions — the use-doc is the module
README.

Branch `fix2/movement-2026-10-12`. Every fix is a declared behaviour change (approved by Joe,
2026-10-12). Gate: `make foundry-movement-check` — 189 tests pass, kit identical, conformance
100 %. No item was reverted.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| movement-edge-1 | Changing map mid-fight showed "The fight is over" while the fight was still going | Recommendation taken | The "fight is over" message waits until that fight actually ends, and shows once. "GM allows ghost movement again" still shows when the GM re-allows it mid-fight. | f8e7ee8f | glue.test.mjs |
| movement-async-1 | Two quick clicks on the GM ghost-policy button could toast a mode that never took effect | Recommendation taken | Clicks are applied one after another; every toast names the mode really in force. | 293ceeaa | glue.test.mjs |
| rob-4 | Self-check "settings readable" always passed | Recommendation taken | It now fails, naming the settings, when one is missing or holds the wrong kind of value. | fc6aef1d | api.test.mjs |
| rob-1 | `pinsUnderTokens` only took a Scene; a bad id threw | Recommendation taken | Takes a Scene or its id; an unknown id answers "none". | 4719917a | status.test.mjs |
| rob-2 | `ghostFor` always said "no" for a TokenDocument | Recommendation taken | Same answer for the canvas token and its document. | 714d5087 | glue.test.mjs |
| rob-3 | `combatActive`/`status` ignored a Scene argument (answered for the viewed map or "no fight") | Recommendation taken | Both take a scene id or a Scene; `status` also takes a bare id. | a9013a69 | status.test.mjs, adapter.test.mjs |
| movement-edge-3 | A ghost / "Show my own tokens on top" toggle in one tab didn't reach the player's other tab | Recommendation taken | The other tab updates straight away (storage event); uninstall removes the listener. | 5e726ea2 | storage-sync.test.mjs |
| movement-edge-4 | `combatActive(null)` and `status({sceneId:null})` disagreed | Null / no argument = the viewed scene | Both answer for the viewed scene; an argument that names no scene answers "no combat"; `status` no longer calls `combatActive` twice. | 3c35720d, 4bec458b | status.test.mjs |
| movement-edge-5 | "Pins under tokens" flagged a pin on a different scene level than the token | Recommendation taken | Pins limited to other levels are skipped; all-level pins and level-less tokens work as before. | e975c21b | core.test.mjs |
| EXT-4 | `flipPolicy` kept its own hand-written copy of the mode list | Refactor, no behaviour change | Reads the mode list instead; results identical in an exhaustive table test. | 85a1ea28 | core.test.mjs |

**Goldens changed:** `test/golden/describe.json` only, as API parameter types/docs widened
(rob-1, rob-2, rob-3, movement-edge-5). No behaviour golden changed.

## Live check after deploy

GM tab only, ZZ scratch docs only; delete them after. Never touch Caven, Marrith, Talo or campaign scenes.
`api = game.modules.get("pentaryn-movement").api`.

- **movement-edge-1** — code only: the toast needs a player client, which the one-GM-tab rule forbids. Covered by the glue test (scene B with the fight still on A: no toast, `clearedBy` kept; `deleteCombat`: exactly one toast).
- **movement-async-1** — 1. Note `api.status().policy`. 2. `await Promise.all([api.setPolicy("off"), api.setPolicy("always")])`, then expect `api.status().policy === "always"` and `ghostPolicyLast === "always"`. 3. Fire the GM toolbar onChange twice synchronously (off, then on): one toast per click, naming the final policy; restore the original policy.
- **rob-4** — 1. `api.selftest().checks` → "settings readable" ok. 2. `game.settings.settings.delete("pentaryn-movement.ghost")` (in memory) → ok=false, detail names `ghost`. 3. Reload the tab.
- **rob-1** — On ZZ scene `zz`: `api.pinsUnderTokens(zz.id)` deep-equals `api.pinsUnderTokens(zz)`; `api.pinsUnderTokens("nope")` returns `[]` without throwing.
- **rob-2** — On a ZZ token: `api.ghostFor(t.document) === api.ghostFor(t.object)` (both false on a GM client), neither throws.
- **rob-3** — `api.combatActive(zz) === api.combatActive(zz.id)`; `api.status(zz.id).sceneId === zz.id === api.status({ sceneId: zz }).sceneId`.
- **movement-edge-3** — 1. Call `api.ghostFor` on a ZZ token to warm the cache. 2. `window.dispatchEvent(new StorageEvent("storage", { key: "pentaryn-movement.ownedOnTop", storageArea: localStorage }))` → token layer re-sorts, cache dropped. 3. After `api.uninstall()` the same event does nothing (reload to reinstall).
- **movement-edge-4** — Viewing ZZ scene with a started ZZ combat (one visible combatant): `api.combatActive(null) === api.status({ sceneId: null }).combatOnScene === true`; `api.status({ sceneId: "" }).combatOnScene === false`. Delete the ZZ combat.
- **movement-edge-5** — ZZ scene with two levels: ZZ note limited to level 1 under a ZZ token on level 2 at the same spot → not reported; clear the note's level limit (or move the token to level 1) → reported. Delete ZZ docs.
- **EXT-4** — code only (exhaustive table test: 3 policies × 5 last values incl. junk × on/off, identical to the old function).

## Deploy

Module `pentaryn-movement` only: `.mjs` and docs changed; no `module.json`, esmodules list,
lang, styles or kit change, so a browser reload is enough (blueprint §10) — no server restart.
