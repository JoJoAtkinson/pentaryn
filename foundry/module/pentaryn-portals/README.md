# Pentaryn Portal Cards (`pentaryn-portals`)

**Read this when:** changing or calling `pentaryn-portals` — the teleport dialog's destination
cards, the travel badges, the Portal card window, Teleport party, summons that follow a PC.
**Not this file:** using it at the table → [`context/foundry/scene-links.md`](../../../context/foundry/scene-links.md)
§ Destination cards · how every addon is built → `context/foundry/addon-blueprint.md` · the
migration record → `context/plans/addon-blueprint-2026-10/migrate-pentaryn-portals.md` · history →
[`CHANGELOG.md`](CHANGELOG.md).

## What the player sees

- **Destination cards.** Core's Teleport Token behavior (`choice: true`) asks before it moves a
  token. Portals replaces the dialog's sentence or destination `<select>` with a **card** per
  destination: a thumbnail, a title and a description. With several destinations the cards are
  radio buttons that submit the same `destination` field core reads, so the teleport itself is
  untouched. With one revealed destination and no GM-written question, core's
  "Teleport X to <region> in <scene>?" reads "Teleport X to <card title>?". The dialog opens with
  **Teleport** focused (Enter goes; Esc and the X still decline).
- **Secrecy.** A behavior with `revealed: false` shows players no card (core shows them no name
  either); its badge shows "?" and the hover says "A way onward". A passage counts as revealed when
  every enabled teleport behavior that leads somewhere real is revealed — one rule for the card's
  hint and Revealed switch, the badge and `inspect()`; a behavior whose destinations are all gone
  does not count.
- **Travel badges.** Every region with an enabled Teleport Token behavior gets a violet ring badge
  on `canvas.interface`, just above its square, with the first destination's image inside and a
  count when there are several. It draws above lighting, so it shows at darkness 1 (a Tile does
  not). Players see a badge only once its square has been in sight or explored; then it stays. A
  hidden (sealed) region shows a faded badge to the GM only. Hit-testing is in DOM space, so a
  badge never takes a click meant for a token. **Hover** shows the destination cards.
- **GM right-click on a badge:** *Look at X* (your view only; nobody moves, no ping) · *Teleport
  party → X* · *Preview card* · *Edit card* · *Region settings*.
- **Teleport party (GM).** A confirm lists who moves, each follower "lands beside <PC>". The party
  is every linked character token plus every token a player owns or a PC summoned — never item
  piles, Markers, crowd, or pentaryn-aoe area handles. They land spread out from the region's
  centre, skipping squares a wall cuts off or someone stands on — a Large or bigger token's whole
  footprint must be clear, of standers and of the rest of the party — each follower beside its PC; on
  another scene the active players are pulled there and the GM's view follows. A token deleted
  while the confirm is open is left behind, not recreated; if none are left it warns and moves nobody.
- **Summons follow their PC.** When a player walks their PC through a link to **another scene**,
  the active GM's client carries the PC's summons and the tokens only that player owns, and lands
  them around the PC (a co-owned steed comes when all its owners go together). Only a real portal
  hop counts: a GM cut-and-paste drags nothing. Needs a GM logged in.
- **Arrivals step off an occupied square.** A PC who comes through overlapping anyone (even off the
  grid, or a Large token) is moved by the GM's client to the nearest square its whole footprint fits
  before its company follows.
- **Authoring (GM).** Region config → Appearance → *Portal card*: title, image, description, a live
  preview, and a camera button that crops the scene background around the region (8 × 5 squares,
  arrival square circled). The **Portal card window** (badge menu → Edit card) edits every
  destination's card in place, opens/seals the passage, reveals it, toggles "ask before moving",
  adds a destination (two-way by default) or removes one, and — with its edit toggle on — lets you
  drag the badge to move the travel spot (it snaps by its bounds; its travel tiles move with it).
  A drag that is interrupted — the badge redraws, the scene changes, the browser cancels the
  pointer — snaps the badge back and moves nothing.

## Settings

| Key | Scope | Default | What it does |
|---|---|---|---|
| `teleportDefault` | world | on | The teleport question opens with Teleport focused. Off: core's default, Don't Teleport. |
| `spreadArrivals` | world | on | A PC arriving through a portal onto an occupied square steps to the nearest free one (GM's client). |
| `confirmPartyTeleport` | world | on | Teleport party lists who moves and asks first. Off: it moves at once. |

Every read is live; no reload. Labels and hints are `PENTARYN_PORTALS.Setting.<key>.Name/Hint` in `lang/en.json`.

## API — game.pentaryn.portals

Also `game.modules.get("pentaryn-portals").api`, published at `ready` (event
`pentaryn-portals.ready`). `describe()` lists every row; `settings()`, `trace()`, `uninstall()`,
`version`, `contract` are the kit's. A **region ref** is a RegionDocument, a uuid, a 16-character id
or an exact name (`opts.sceneId` scopes an id or a name) — never a substring.

| Call | Who | Returns |
|---|---|---|
| `cardFor(region)` | anyone | `{ uuid, title, img, description }`; `null` for no region |
| `destinations(ref, { sceneId })` | anyone | `[{ uuid, scene, name, card, revealed, choice, behavior }]` |
| `inspect(ref, { sceneId, as })` | anyone | `{ region, hidden, card, revealed, destinations }`; a player (`as`) gets `destinations: null` for a sealed or unrevealed passage and no passage name; an Actor or Token **document** (what the root `game.pentaryn.inspect` passes) → `null`; an Actor/Token uuid or name is not a region ref → `BAD_ARGS` / `NOT_FOUND` |
| `badges()` | anyone | the badges drawn on **this** client: `[{ region, revealed, visible, cards }]` |
| `redraw()` | anyone | redraws this client's badges |
| `snapshot(regionOrUuid, { squaresWide, squaresHigh })` | GM | the saved image path, or `null` (no background, or the upload failed — warns, card image unchanged) |
| `lookAt(region)` | GM | pans **your** view; nobody moves |
| `teleportParty(region, { confirm = true })` | GM | `{ moved, cancelled }`. Moves the party on **`canvas.scene`** (the calling client's view). It **opens a confirm dialog** unless `confirmPartyTeleport` is off — a console or bridge caller passes `{ confirm: false }`, or it waits on a click |
| `link(ref, { to, twoWay, dryRun })` | GM | `ok({ from, to, twoWay })` / `fail(code, reason)`; the same writes as the card's Add a destination |
| `unlink(ref, { to, dryRun })` | GM | `ok({ from, to, removed })` / `fail(…)` |
| `open(region, { edit })` | GM | the Portal card window |
| `spreadArrival(tokenDoc)` | GM | the token, moved off an occupied square if it was on one |

Writes (`link`, `unlink`) never throw for a bad ref or a player: they return `fail("NOT_FOUND" |
"AMBIGUOUS" | "BAD_ARGS" | "NOT_GM", reason)`. The seven old members keep their signatures.

## Data written

| Where | What |
|---|---|
| destination Region `flags.pentaryn-portals.title` / `.img` / `.description` | the card; all optional (fallbacks: scene nav name, scene thumbnail, no text) |
| RegionBehavior `system.destinations` (teleportToken) | link/unlink; a new link with no behavior creates `Teleport` (choice, revealed, fade 1500 ms, centre, snap) |
| Region `name`, `hidden`; behaviors' `revealed` / `choice` | the Portal card window's switches |
| Region `shapes`; Tile `x`/`y` with `flags.pentaryn.travel.regionId` | moving a travel spot |
| Data `assets/tokens/custom/portals/<sceneId>-<regionId>.webp` | Snapshot (the flag gets `?v=<time>` so it refreshes) |
| Token create/delete/update | Teleport party, the summons follow, an arrival's step |

## Flags other modules read

n/a — no other module reads portals' flags. **Flags portals reads:** `flags.pentaryn.travel.regionId`
on Tiles (travel glyphs), `flags.pentaryn-aoe.handle` (token) and `flags.pentaryn-aoe.handleActor`
(actor) — pentaryn-aoe's area handles, through `isAoeHandle`, a tested copy of aoe's
`isHandleTarget` — and dnd5e's `flags.dnd5e.summon.origin` / `isPolymorphed`.

## Events

n/a — portals emits only the kit's `pentaryn-portals.ready` / `pentaryn.ready`.

## Patches and adjustments

No prototype patches. Rows in `foundry/adjustments.yml` (non-patch rows take core's prefix):
`core-portals-relative-uuid` (same-scene destinations are stored relative to their behavior since
core 14.368), `core-teleport-default-and-spread` (DialogV2's yes/no buttons, the question `<p>`),
`core-teleport-dialog-cards` (the dialog id `dialog-<behaviorUuid>-<tokenId>`, `.dialog-content`,
`select[name="destination"]`), `core-teleport-replacements-follow` (`options.replacements` on
`deleteToken`), `core-region-config-portal-card` (the Appearance tab), `itempiles-portals-pile-pc`
(`isValidItemPile`, so a pile-PC is never left behind). All six rows are in `foundry/adjustments.yml`.

## Two sessions / who writes

- **Summons follow** runs on the active GM user — with the MCP bridge tab and a GM browser tab both
  open, in **both**. `carryTo` creates with `keepId`, so the server takes one create and refuses the
  other with "already exists"; the losing tab logs one debug line and shows no toast. Any other
  failure warns `pentaryn-portals | summons did not follow`. The arrival step may be written twice
  (both tabs compute the same square).
- **Teleport party, link, unlink, snapshot, the card window** write from the GM tab that asked.
- **Badges** are per client; nothing is written for them.

## Extending

- A new behaviour → a new feature file exporting `install(reg, ctx)` / `uninstall()`, added to
  `FEATURES` in `portals.mjs`; hooks only through `reg.on`. Features never import each other.
- A pure rule → `portals-core.mjs` with a test row (it must load in bare node).
- Foundry reads/writes → `scene-adapter.mjs` (it may import only core and lib).
- An API method → a row in `api-manifest.mjs` plus an implementation in `api.mjs` (or a feature's
  contribution), then re-pin `golden/describe.json` and `surface.json`.
- CSS → `styles/portals.css` under `ppt-`. A string → `lang/en.json` and `_loc("PENTARYN_PORTALS.…")` with the full key (never a prefix wrapper).

## Pitfalls

- The dialog is recognised only by core's id format `dialog-<behaviorUuid>-<tokenId>`
  (`dialogIdParts`); a core change there silently turns the cards off.
- A same-scene destination is stored relative (`..<regionId>`): always resolve with
  `{ relative: behavior }` and compare absolute uuids (`hasDestination`).
- An unrevealed destination must never reach a player's screen: `decorate` returns early for
  players, the hover shows "A way onward", `inspect(…, { as })` drops destinations.
- `teleportParty` without `{ confirm: false }` waits for a click in the calling tab.
- The Item Piles probe differs from pentaryn-aoe's on purpose: `recordOf` asks
  `isValidItemPile(actor)` with no flag fallback, while aoe's `resolve.mjs` passes the token and
  falls back to its flags. aoe tolerates a false positive (it only skips creatures); portals must
  never leave a pile-PC behind. Unifying them is a decision for Joe (finding -36).
- Region hooks redraw the badges 50 ms after the last write (debounced); `redraw()` is immediate.

## Files

| File | Role |
|---|---|
| `portals.mjs` | entry: wiring, lifecycle, publish |
| `portals-core.mjs` | pure: constants, party and landing rules, card HTML, dialog-id parse, geometry, `isAoeHandle` |
| `settings.mjs` | the `SETTINGS` table, `setting()` |
| `scene-adapter.mjs` | adapter: records, snapshot, region move, Teleport party, link/unlink |
| `card-app.mjs` | ui: the Portal card window |
| `party.mjs` · `badges.mjs` · `cards.mjs` | features: summons follow · badges, hover, menu, drag · dialog cards, Region-config fieldset |
| `api-manifest.mjs` · `api.mjs` | API rows · implementations, `inspect`, `buildApiFor` |
| `styles/portals.css` | styles, every class `ppt-` |
| `lang/en.json` | every on-screen string, `PENTARYN_PORTALS.*` |
| `lib/` | vendored kit — never edited here |

## Tests

`node test/run.mjs` from this folder (one process per `*.test.mjs`, then the legacy core suite).
Goldens in `test/golden/`; re-pin one file at a time with `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`
and read the diff. Tests reach internals only through `test/fixtures/seams.mjs`.

## Sync

`make foundry-portals-check`, then `make foundry-portals-sync` and a reload. A `module.json` change
needs a Foundry restart.
