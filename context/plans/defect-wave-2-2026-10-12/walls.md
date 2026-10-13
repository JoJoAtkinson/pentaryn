# Defect wave 2 (2026-10-12) — walls

**Read this when** you want the history of defect wave 2 for `pentaryn-walls`: what was
fixed, the rulings taken, the commits and tests, and what to check live after deploy. History
only — to operate walls, read the module README.

Branch `fix2/walls-2026-10-12`. Approved by Joe on 2026-10-12 ("Let's create a dynamic workflow
to solve all of these things"). Every fix is a declared behaviour change (`[declared]` in each
commit). Where Joe gave no ruling, the review record's recommendation was taken. Gate:
`make foundry-walls-check`, 243/243 tests green, conformance 98.0 % (C07 accepted exception:
the flag-scope data migration stays parked).

## Fixes

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| walls-edge-1 | Refusal pings were broadcast to every client, and Alt+Shift panned players' views | Recommendation: local only | When walls refuses an endpoint, only the GM sees a short pulse on their own screen (and only when viewing that scene). Players see nothing and nobody's view pans | 4d58cb83 | glue-ping, glue |
| walls-edge-2 | Undoing run 2 deleted a wall run 1 made if run 2 had moved or trimmed it | Recommendation: per-run history | Each run records the prior position of walls it moves. Undo puts those walls back and deletes only what the latest run created; each undo peels back one run | ebea05c6 | undo-history, undo, api |
| walls-EXT-1 | Weld/pin tolerance overrides were ignored by the wasm engine, and the card named the wrong engine | Recommendation: route to js | If you override the weld or pin tolerance, the run uses the JS engine (which honours them) and the card says js | 7528ee2e | glue-analyze |
| walls-rob-1 | The wasm engine committed a half-finished result when it hit its iteration cap | Recommendation: match js | Hitting the cap stops the run with js's "hit the cap; nothing was committed" message; no walls are written | 5ef4568b | backends |
| walls-rob-3 | Previewing another scene flashed its refusal markers on the map you were viewing | Recommendation: viewed scene only | Markers draw only on the scene you are viewing; the card and console still list every refusal | c2b7882f | glue-ping |
| walls-EXT-3 | Dead sight/light threshold support in the engine | Recommendation: remove | Walls no longer passes a threshold on any wall it creates; windows still come out solid | 7c55edf1 | engine-shape |
| walls-rob-2 | compare() crashed with a TypeError when js threw | Recommendation: report it | Compare reports "not identical" with "js threw: <reason>" | f770cf9a | backends |
| walls-M11 | API description missed flags and listed undo's steps out of order | Recommendation: fix docs | The description names every flag a run writes and lists undo as restore moved walls, then delete created ones | 97ced0a8 | api (describe golden) |
| walls-async-2 | Two overlapping "make macro" clicks (or two GM tabs) made two macros | Recommendation: fixed id | Each action's macro is created under a fixed id, so you get one "Walls: <action>" macro | 598f1467 | glue |
| walls-M2 | The wasm engine's source comment described the wall fields wrongly | Recommendation: comment only | Nothing changes in play; the comment describes all 11 fields and the component rows; the .wasm is byte-identical | 45b59cd9 | docs |
| walls-edge-7 | Scene names with `<` or `&` were injected raw into the GM card | Recommendation: escape | The scene name shows as plain text on the report card | 8a22f2d5 | core-render |
| walls-rob-5 | preview/run/analyze/undo(null) threw a TypeError | Recommendation: null = default | A null argument behaves like no argument (the viewed scene) | 2401658d | glue-null |
| walls-rob-7 | An unknown scene id gave the misleading "open one, or pass a sceneId" | Recommendation: name the id | Says there is no scene with that id; the old text only appears when no id was given and no scene is open | cd35f3df | glue-busy, glue-scene |
| walls-rob-8 | A failed chat-card post was swallowed | Recommendation: kit log | The error goes to the module log (visible in `api.trace()`); the run still finishes | dd088377 | glue-busy |
| walls-rob-9 | The name fallback in makeMacro could take over a chat macro of the same name | Recommendation: script only | Finds the macro by fixed id first; by name it reuses only a script macro, never a chat macro | 9964fece | glue |
| walls-rob-10 | A missing wasm file showed a confusing "expected magic word" error | Recommendation: show HTTP status | The ready line names the failed URL and HTTP status (e.g. HTTP 404) | 9b0ce47f | backends |
| walls-edge-5 | Undo order could pick a non-timestamped run before the latest real one | Recommendation: ISO first | Undo removes the latest timestamped run first; odd run ids follow, oldest name first | 5152376b | undo |
| walls-edge-6 | An empty scene reported different pass counts on wasm and js | Recommendation: match js | Both report 0 passes and compare calls them identical | 37365121 | backends |
| walls-EXT-6 | The self-description hard-coded the flag scope | Recommendation: one constant | The description takes its flag scope from the constant the code writes with; nothing visible changes | d6496118 | api |
| walls-EXT-11 | The ready line omitted analyze() and listed fixed shortcuts | Recommendation: derive it | The console ready line lists every GM command including analyze() and the real keybindings | a4bc37f1 | backends, core-render, glue |
| walls-M12 | Source comment put the busy lock in walls-core | Recommendation: comment only | Comment now says the lock lives in actions.mjs; walls-core only provides exclusive() | 5e1f5e44 | docs |
| walls-EXT-8 | A refusal note could repeat a too-far wall, especially if its id had spaces or brackets | Recommendation: dedupe by id | The note mentions such a wall once | 05c8156b | engine-refusals |

No item was reverted: every fix holds.

## Goldens changed

- `test/golden/describe.json` — the API self-description (edge-1, edge-2, rob-3, M11): new
  flags, local pulse wording, undo order.
- `test/golden/engine.json` — three hashes (edge-2): "six-room floorplan — long lines then
  trim", "endpoint just off a diagonal snaps rather than extends", "draw long crossing lines,
  let it trim". Wall geometry is unchanged; the hashes moved because moved walls now carry a
  `moves.<run>` flag entry instead of the flat `run`/`priorC` stamp.
- `wall-engine.wasm` is unchanged (M2 is a comment in `wasm/src/lib.rs`).

## Live check after deploy

Walls is never synced live by an agent; Joe deploys it. Use only ZZ-prefixed scratch scenes and
macros, one GM tab, and delete them afterwards.

- **edge-1** — On a ZZ scene with a dangling wall, press Alt+Shift+W while watching
  `game.socket` traffic: no `userActivity` ping leaves the client, and the pulse draws at the
  refusal point.
- **edge-2** — ZZ scene: run once (makes a bridge), hand-draw a stub so a second run trims that
  bridge, run again, Alt+Z: the bridge returns to its run-1 length. Alt+Z again removes it.
- **rob-3** — With ZZ scene A viewed, `game.pentaryn.walls.preview({sceneId: <ZZ scene B id>})`:
  the card lists B's refusals and no pulse appears on A.
- **async-2 / rob-9** — `await Promise.all([makeMacro('preview'), makeMacro('preview')])`, then
  `game.macros.filter(m => m.name === 'Walls: preview').length === 1`. Delete the macro after.
- **edge-7** — Rename a ZZ scene to `ZZ <b>bold</b> & co` and preview: the card shows literal
  angle brackets.
- **EXT-11 / rob-10** — Reload the GM tab: the pentaryn-walls ready line names
  preview/run/undo/analyze/makeMacro and shows the real shortcuts.
- **rob-5 / rob-7** — `game.pentaryn.walls.preview(null)` previews the viewed ZZ scene;
  `preview({sceneId: 'noSuchScene0000'})` says there is no scene with that id.
- All other items are code-only and covered by the tests named above.
