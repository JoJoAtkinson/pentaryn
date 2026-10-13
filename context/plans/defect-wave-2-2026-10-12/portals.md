# Defect wave 2 (2026-10-12): portals

**Read this when** you want the history of defect wave 2 for `pentaryn-portals`: what was fixed, why, which commits, and how to check it live. This is a history record. To operate portals, use `foundry/module/pentaryn-portals/README.md`.

Branch `fix2/portals-2026-10-12`. Every change is a declared behaviour change approved by Joe on 2026-10-12. Where Joe gave no ruling, the review's recommendation was taken. Gate: `make foundry-portals-check` (230 tests, portals-core 52, vendored kit identical, conformance 100 %).

## Fixes

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| ROB-1 | A failed snapshot upload still overwrote the card image | recommendation | If a snapshot can't be saved, the GM sees a warning and the passage card keeps its old picture. | 70da80c8 | test/glue.test.mjs |
| ROB-2 | A party token deleted while the Teleport party confirm was open got recreated | recommendation | That token is left behind. If nobody is left, the GM gets "nobody to move" and nothing moves. | 4fa3e98b | test/party.test.mjs |
| portals-edge-1 | An interrupted badge drag could move or save the region | recommendation | If the drag is interrupted (redraw, scene change, pointer cancel), the badge snaps back and nothing is saved. | e59b1dbf | test/badges.test.mjs |
| portals-edge-2 | Landing checked only one square, so Large tokens could land on others | recommendation | Each token's whole footprint is checked, so a Large or bigger creature lands beside others, never on top. | a772768a | test/core.test.mjs, test/party.test.mjs |
| EXT-1 | Card, badge and inspect disagreed on "revealed" when a dead teleport was left over | recommendation | All three count a passage as revealed only when every enabled teleport that leads somewhere is revealed. | ff030e6a | test/passage-revealed.test.mjs |
| portals-edge-4 | An empty party still pulled players and moved the GM's view | recommendation | With nobody counting as the party, Teleport party just warns and does nothing, even with confirm off. | e6aaeb01 | test/api-additions.test.mjs, test/party.test.mjs |
| portals-edge-3 | The badge kept the old image after a re-snapshot | recommendation | The badge shows the new picture without a reload. | fe519975 | test/badges.test.mjs |
| portals-edge-5 | Teleport party with no scene open threw a TypeError | recommendation | Nothing happens; "no scene" goes to the console. | 916aac3f | test/party.test.mjs |
| ROB-6 | Legacy API calls needed documents, a uuid string threw | recommendation | cardFor, lookAt, teleportParty, open and spreadArrival take a document or its uuid. An unknown uuid gives null/undefined and a log warning. | 7ec9f518 | test/legacy-uuid.test.mjs |
| portals-async-1 | Two GM tabs could both move an arriving PC | recommendation | Only one tab moves the PC to a free square; the claim marker leaves in the same move. | f55c0859 | test/legacy-uuid.test.mjs, test/party.test.mjs |
| portals-async-2 | Card re-render failures after add/clear/unlink/edit toggle went unhandled | recommendation | A failed redraw is logged under the control's name; nothing is unhandled. | 4514db33 | test/card-render-errors.test.mjs |
| perf-4 | Badge pictures loaded one after another | recommendation | They load all at once and still draw in region order. A failed picture shows "?" and logs one warning. | 06c885dc | test/badges.test.mjs |
| EXT-9 | The API could link a passage to a region that isn't a landing spot | recommendation | Linking to a region with non-teleport behaviors is refused with "not a landing spot", including a dry run. | 9a7778df | test/api-additions.test.mjs, test/core.test.mjs |
| M12 | Portal badges used the prompt-marker module's board tag | recommendation | Portals now marks the board with its own tag. | bf66880f | test/badges.test.mjs |
| EXT-2 | New-teleport defaults were copied at several sites | recommendation | No change at the table; the defaults now live in one place. | 79cddc7b | test/core.test.mjs |
| EXT-4 | Card flag paths were built by hand | recommendation | No change at the table; one shared builder makes the paths. | cb3e4c03 | test/core.test.mjs |
| M8 | The flag scope was named inconsistently; a dead export remained | recommendation | No change at the table; one name for the storage scope, dead code removed. | 2dabd1a1 | test/core.test.mjs, test/geometry.test.mjs |
| EXT-6 | Passage switch rendering and change handling could drift apart | recommendation | No change at the table; one list draws the Open/Revealed/Choice switches and handles them. | 0778f02d | test/card-app.test.mjs, test/smoke.test.mjs |
| EXT-7 | Centre arithmetic copied three times | recommendation | No change at the table; one shared centre helper. | ea631649 | test/core.test.mjs |
| perf-1 | Player vision updates recalculated each badge's sample points | recommendation | No visible change; the points are worked out once when badges are drawn. | 9fa549b3 | test/badges.test.mjs |
| perf-2 | Every mouse move re-hid an already hidden hover card | recommendation | No visible change; the hide is skipped when already hidden. | 1214f905 | test/badges.test.mjs |
| portals-async-3 | Followers' two-tab race relied on an undocumented server refusal | recommendation | No change at the table; a comment explains why the server's refusal is the right election. | b6b52e5e | test/party.test.mjs |
| EXT-11 | API description of snapshot folder and fade could go stale | recommendation | No visible change; the description reads the module's own constants. | 8f267a5c | test/api.test.mjs |

No item was reverted: every commit holds.

## Goldens changed

- `test/golden/badges-gm.json` (fe519975): the badge image keeps the card's `?v=`.
- `test/golden/describe.json` (70da80c8, 916aac3f, 7ec9f518, 9a7778df): API descriptions for the snapshot failure, no-scene, uuid arguments and landing-spot refusal.
- `test/golden/landing.json`, `landing-party.json`, `teleport-same-scene.json` (a772768a): whole-footprint landing.

Other shipped changes: `lang/en.json` gains `Notify.SnapshotFailed`; the kit's `election` module is vendored into `lib/` (identical to `foundry/lib`, recorded in `kit.lock.json`).

## Live check after deploy

Needs a Foundry restart (lang and new vendored lib file). One GM tab only. ZZ-prefixed scratch scenes, regions, actors and tokens only; delete them after.

- **ROB-1**: on a ZZ scene with a background and a ZZ region, mock `foundry.applications.apps.FilePicker.implementation.upload` to resolve `{}`, call `api.snapshot(<ZZ region uuid>)` → null, `flags['pentaryn-portals'].img` unchanged, a warning toast. Restore the mock and snapshot again → a real path.
- **ROB-2**: ZZ scene with two ZZ actor tokens; right-click a ZZ badge → Teleport party; delete one ZZ token while the confirm is open; confirm → exactly one token lands, toast says 1 moved, no console error.
- **portals-edge-1**: ZZ region in edit mode; start a badge drag, switch scene mid-drag, release → no console error, the region's shapes unchanged; back on the ZZ scene a fresh drag still works.
- **portals-edge-2**: ZZ destination with a Medium ZZ token beside the ZZ region centre; `teleportParty` a Large ZZ token there with `confirm:false` → its footprint overlaps nothing, the Medium token stays put.
- **EXT-1**: ZZ region with two teleports, one pointing at a deleted ZZ region and set unrevealed → card preview, badge and `api.inspect(<region>, { as: <non-GM user id> })` all say revealed; toggling Revealed flips all three.
- **portals-edge-4**: ZZ scene with no PC/player-owned tokens, confirmPartyTeleport off: `api.teleportParty(<ZZ region>, { confirm: false })` → `{ moved: 0, cancelled: true }`, warning toast, the view stays put.
- **portals-edge-3**: snapshot a ZZ region, move the region a few squares, snapshot again → the badge crop updates without reload, no texture warning.
- **ROB-6**: `api.cardFor('<ZZ region uuid>')` → a card with that uuid; `api.cardFor('Scene.nope.Region.nope')` → null and a console warning.
- **portals-async-1**: ZZ character token walks through a ZZ region into ZZ scene B whose landing square holds a ZZ token → it steps once to a free square, `flags['pentaryn-portals'].claims` absent, at most one "followed" toast.
- **Everything else** (portals-edge-5, portals-async-2/3, perf-1/2/4, EXT-2/4/6/7/9/11, M8, M12): code only; covered by the gate. A quick sanity pass: open a ZZ portal card, flip each switch, and confirm the badges still appear and hover as before.
