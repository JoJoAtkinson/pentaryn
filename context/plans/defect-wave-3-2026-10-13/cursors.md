# Defect wave 3 2026-10-13 — cursors (pentaryn-cursors)

**Read this when:** you want the history of defect wave 3 (2026-10-13) for the tool-cursor module (`pentaryn-cursors`): what was fixed, why, and how to check it live. History, not instructions.

Source: the "Still open" list in [`defect-wave-2-2026-10-12/README.md`](../defect-wave-2-2026-10-12/README.md) ("cursors: `api.refresh()` is not gated by the `installed` flag"). Branch `wave3/cursors-2026-10-13`, based on `e392ba56`.
Gate: `make foundry-cursors-check`. It passes 69/69 node tests, the vendored kit matches `foundry/lib`, and conformance is 100 % (47/47).

Joe gave no specific ruling on this item, so it follows the recommendation: a no-op answering `null`, the same as the other entry points while uninstalled. It is a declared behaviour change, listed under the CHANGELOG `Unreleased` header. The version was not bumped and `module.json` did not change, so a reload is enough (blueprint §10).

| item | defect | what changed | commits | test |
|---|---|---|---|---|
| cursors-refresh-gate | `api.refresh()` was exposed ungated. After `uninstall()` (hot patch) it re-applied the active tool's coloured cursor to the `#board` that `uninstall()` had cleared, unlike the wrapped `onChange`s, the preview listeners, the observer and the setting's `onChange`, which wave 2 made inert (cursors-rob-3) | While uninstalled, `refresh()` does nothing and returns `null` (the normal arrow). It writes no cursor variable and no `data-pentaryn-cursor` attribute. After a re-import it works as before. | `e2d65222` | `test/api.test.mjs` (`[declared] refresh() after uninstall() is a no-op … (wave3 cursors-refresh-gate)`). It fails on the parent (`actual: 'target'`). `test/hotpatch.test.mjs` still passes, so re-import re-arms it. |

## Goldens changed

None. The manifest row text for `refresh` is unchanged, so the describe and surface goldens do not move.

## Live check after deploy

Use the single GM tab. No documents are needed. If you want a scene, use only a ZZ-prefixed scratch scene (for example `ZZ Cursor Test`) and delete it afterwards. Never use Caven, Marrith, Talo or a campaign scene. Reload is enough; no restart is needed.

**cursors-refresh-gate**
1. Select the token controls' ruler tool. In the console, confirm `game.pentaryn.cursors.refresh() === 'ruler'`.
2. Keep a handle: `const c = game.pentaryn.cursors`. Run `c.uninstall()`. Expect `c.current() === null`.
3. Run `c.refresh()`. Expect it to return `null`, `c.current()` to stay `null`, and `#board` (`document.getElementById('board')`) to have no `data-pentaryn-cursor` attribute and no inline `--cursor-*` properties.
4. Run `await import('/modules/pentaryn-cursors/cursors.mjs?v=3')`. A tick later, expect `game.pentaryn.cursors.refresh() === 'ruler'`. Alternatively, reload the tab.

## Live check result (FIX-W3, 2026-10-13)

Run in the MCP bridge GM tab on world `pentaryn` (Foundry 14.369, dnd5e 6.0.6, `pentaryn-cursors` 0.2.0), with no
restart or reload. The served `/modules/pentaryn-cursors/board.mjs` contains the gate
(`installed ? refresh() : null`). No documents and no scratch scene were needed. Only the GM tab's own tool selection
changed, and it was put back to Select afterwards.

| item | result | evidence |
|---|---|---|
| cursors-refresh-gate | pass | Step 1: with Tokens → Ruler active, `refresh()` returned `'ruler'`, `current()` was `'ruler'`, `#board` had `data-pentaryn-cursor="ruler"` and 4 `--cursor-*` properties. Step 2: `uninstall()` returned `null`; then `current()` was `null`, the attribute was gone and there were 0 `--cursor-*` properties. Step 3: `refresh()` on the kept handle returned `null`; `current()` stayed `null`, with no attribute and 0 `--cursor-*` properties. Before the fix it returned `'ruler'` and re-applied the glyph. Step 4: after `import('/modules/pentaryn-cursors/cursors.mjs?v=3')` and a tick, the new `game.pentaryn.cursors.refresh()` returned `'ruler'`, with the attribute back and 4 properties. `status()` reported `enabled: true, key: "ruler", expected: "ruler"`. Switching back to Select gave `current() === null` and removed the attribute, so the re-imported module still follows tool changes |

Cleanup: no ZZ docs were created. The GM tool went back to Tokens → Select. Exactly one GM is active.
