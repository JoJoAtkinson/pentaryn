# Pentaryn AoE (`pentaryn-aoe`)

**Read this when:** changing or calling `pentaryn-aoe` — spell-area handles, the GM save tray,
Careful Spell, auto damage on a hit, self-cast effects, the Escape / refund / aim placement helpers.
**Not this file:** using it at the table → [`context/foundry/aoe.md`](../../../context/foundry/aoe.md) ·
the design and its reasons → [`context/plans/aoe-circles.md`](../../../context/plans/aoe-circles.md) ·
how every addon is built → `context/foundry/addon-blueprint.md` · the migration record →
`context/plans/addon-blueprint-2026-10/migrate-pentaryn-aoe.md`

dnd5e 6 only. Chat data is read from typed messages (`message.type` `usage` / `attack` / `damage` /
`save`, `message.system.*`, `getAssociatedActivity()`, `system.getEffects()`). A template region is
`flags.dnd5e.activity` (+ `item`; `origin` = the caster's token); regions placed under 5.3.3
(`flags.core.MeasuredTemplate`, `origin` = the activity) still match — the only 5.3.3 concession.

## What the player sees

- **Part A — areas you can move and delete** (`areas.mjs`). Every template region is owned by
  everyone and gets a small handle token (`_id` = the region's id) it is attached to: drag the
  handle to move the area (it keeps its direction: a handle never auto-rotates), delete it to
  delete the area; deleting the area deletes the handle. An emanation dnd5e attached to its caster
  gets no handle. Handles are never combatants and never stay
  targeted. The spell card gets an eraser icon after *Place Template*: **Remove all templates** of
  that spell on the viewed scene. When concentration ends, that spell's areas go on every scene.
- **Part B — saves off the area** (`resolve.mjs`, `tray.mjs`). A damage roll from a save activity
  makes the active GM's client list the creatures inside the area (or the roller's targets), roll
  the monsters' saves (`npcSaveRollMode`), post one request card for the players, and show a
  GM-only tray after dnd5e's own damage tray: tick, save, multiplier, the damage that would land,
  Apply. Every save is threaded under the spell's usage card, so dnd5e's outcomes and half-damage
  pill agree. An older Damage click on the same area (or the same card after its area went) greys
  out. Players see one status line on their own card (waiting / applied / re-rolled), never
  monster numbers; the GM-only monster saves are hidden from their chat.
- **Careful Spell** (`careful.mjs`). Metamagic is tracked, not forced onto a spell (Joe's ruling,
  2026-10-12). Using it opens a picker on the caster's client: the creatures on their scene by
  token name, the current targets ticked, up to their CHA mod (min 1). A public card says
  `<caster token> uses Careful Spell: <token names>`. The caster's next save spell's tray marks
  exactly those creatures *protected*: an automatic success and ×0 on a half-damage spell, no
  request card. Then it ends (one use per declaration); a re-roll of that card keeps it. A spell
  with no save leaves it waiting, there is no time window, and using it again replaces the choice.
  The GM toggles any open row's protection with its shield in the tray: off, the row gets back its
  own save, or a monster rolls one and a player row waits.
- **Part C — damage on a hit** (`attacks.mjs`). The roller's client rolls damage after a hit (or an
  attack whose target AC it can't know). A known miss or a natural 1 rolls nothing.
- **Part D — effects meant for you** (`effects.mjs`). A usage card's one effect goes on its caster
  when the caster is its only target, the activity affects only `self` (Shield), or a touch spell
  for one willing creature was cast at nobody. A card with several effects is a choice and stays in
  the tray. The card says "Applied to X: Y". An Effects tray nobody has applied yet is outlined
  (cards under an hour old). The same spell's effect from another source replaces, never stacks.
- **Part E — Escape** (`escape.mjs`) cancels an area placement on the first press, even with the
  sheet open (core's own Escape closes every window first).
- **Part F — refund** (`refund.mjs`). A cancelled placement gives back the slot, charge or uses it
  spent, ends the concentration it began and removes the card. A cast that spent nothing but began
  concentration counts as cancelled too: its concentration ends and its card goes.
- **Part G — aim** (`aim.mjs`). A Self-range cone or line keeps its point on the caster's token
  edge and turns toward the mouse while placing.

## Settings

All `world`, all in the settings menu, in this order (`SETTINGS` in `settings.mjs`; every read is
live through `setting()`, so a change applies without a reload).

| Key | Default | Part | What it does |
|---|---|---|---|
| `handleTokens` | on | A | a handle token on every spell area |
| `removeAreaButton` | on | A | the Remove all templates icon on spell cards |
| `instantCleanup` | on | B | an instantaneous spell's area goes once every ticked row is applied |
| `concentrationCleanup` | on | A | concentration ends → that spell's areas go (active GM) |
| `resolveSaves` | on | B | the save tray on a save spell's damage roll |
| `autoApplyNpc` | off | B | apply monster damage as soon as their saves are rolled |
| `promptPlayers` | on | B | one request card for the players' own saves |
| `autoDamageOnHit` | on | C | damage after a hit (pentaryn-combat reads it too) |
| `autoApplySelf` | on | D | a self-cast card's one effect goes on the caster |
| `highlightUnapplied` | on | D | outline an Effects tray nobody has applied |
| `carefulSpell` | on | B | Careful Spell protects the creatures the player picks; the tray's shield toggle |
| `refundCancelledArea` | on | F | a cancelled placement refunds what it spent |
| `playerStatus` | on | B | the caster's status line; GM-only monster saves hidden from players |
| `untargetedSelf` | on | D | a touch spell cast at nobody goes on the caster |
| `noSpellStacking` | on | D | the same spell's effect replaces instead of stacking |
| `aimSelfAreas` | on | G | Self cones and lines start at the caster |
| `npcSaveRollMode` | `gm` | B | message mode of monster saves: `gm`, `blind` or `public` (a stored legacy `gmroll` is rewritten once by the active GM) |

## API — game.pentaryn.aoe

Kit-built and frozen; `game.modules.get("pentaryn-aoe").api` is canonical. `describe()` lists every
row with its params, returns and null cases (`api-manifest.mjs`). Kit members: `version`,
`contract`, `describe()`, `settings()`, `trace()` (the debug ring), `uninstall()`.

| Method | Returns | Who / notes |
|---|---|---|
| `areasFor(activityUuid, scene?)` | `RegionDocument[]` | any; default every scene |
| `spellAreas({ itemUuid?, activityUuid? }, scene?)` | `RegionDocument[]` | any; default every scene |
| `handleFor(region)` | `TokenDocument \| null` | any |
| `removeArea(regions, scene = canvas.scene)` | `Promise<number>` | owners; ids resolve on the viewing client's scene |
| `sweep(scene = canvas.scene)` | `Promise<{ orphansDeleted, ownershipFixed, handlesCreated, sizeLocked }>` | GM (zeros otherwise) |
| `ensureHandleActor()` | `Promise<Actor \| null>` | GM creates (fixed id `pentarynAoeHndl0`); a player gets the existing one or null |
| `createHandle(region)` | `Promise<TokenDocument \| null>` | null: not a template, handled, attached elsewhere, or another client won |
| `resolve(messageOrId, { regionId? })` | `Promise<resolution \| null>` | active GM; null: not a damage message from a save activity, or its tray is superseded or has an applied row (warning toast; the tray's area picker is disabled then too) |
| `applyRows(messageId, rowIds?)` | `Promise<resolution \| null>` | GM; null when superseded (warning toast) or no tray; when a row's damage fails, the other rows still land and are marked applied, a warning toast names the failed rows, and the first error rejects (Apply again retries only those) |
| `rollNpcSaves(messageId, { rowIds?, force? })` | `Promise<resolution \| null>` | GM |
| `rollForPlayer(messageId, rowId, { event? })` | `Promise<Roll[] \| null>` | GM |
| `pingPlayers(messageId)` | `Promise<ChatMessage \| Notification \| null>` | GM; the info toast when nobody waits |
| `setRow(messageId, rowId, { apply?, multiplier? })` | `Promise<resolution \| null>` | GM |
| `selfApply(message, { force? })` | `Promise<{ reason, actor, effects } \| null>` | the applier client; `force` skips the setting and the claim |
| `pendingFor(message, { effects? })` | `Promise<string[]>` | any |
| `cardEffects(message)` | `Promise<ActiveEffect[]>` | any |
| `activePlacement()` | `object \| null` | this client |
| `setting(key)` | value | any; the default when unregistered |
| `hookIds()` | `{ name, id }[]` | this client |
| `resolution(messageOrId)` | a copy of the tray state, or null | GM data |
| `latestResolution({ sceneId? })` | `{ messageId, resolution } \| null` | the newest live tray of the last 60 messages; `"current"` = the viewing client's scene |
| `summary(messageOrId)` | `{ item, ability, dc, onSave, region, superseded, applicable, rows, careful, playerStatus } \| null` | plain data for the bridge |
| `isHandle(tokenOrDoc)` | boolean | any |
| `inspect(ref, { sceneId?, as? })` | plain JSON, depth ≤ 4 | a message → `{ message, resolution, npcSave, effectsApplied }`; a token or actor → `{ token?, actor, isHandle, region, handleActor, careful }`. `as` a player: no tray summary (only `playerStatus`), Careful only on an actor they own. Unknown ref → `NOT_FOUND` |

## Data written

| Flag | On | Shape |
|---|---|---|
| `flags.pentaryn-aoe.resolution` | the damage message | `{ activity, item, itemName, region, regions, scene, usage, ability, dc, onSave, careful, damages, request, created, superseded, rows[] }` |
| `flags.pentaryn-aoe.claims.<job>` | the damage / usage message | the socket id of the session doing `resolve` / `selfApply` |
| `flags.pentaryn-aoe.effectsApplied` | the usage card | `{ ids, auto, reason, actor, actorName, names }` |
| `flags.pentaryn-aoe.npcSave` | a monster save message | `true` |
| `flags.pentaryn-aoe.damageMessage` | the request card | the damage message id |
| `flags.pentaryn-aoe.careful` | the caster actor | `{ at, scene, tokens, names }`: the picked token ids and names, until a save tray uses them |
| `flags.pentaryn-aoe.handle`, `.region` | a handle token | `true`, the region id |
| `flags.pentaryn-aoe.handle` | a template region | its handle token's id (plus core's `attachment.token`) |
| `flags.pentaryn-aoe.handleActor` | the "Area handle" actor | `true` |
| `flags.dnd5e.lockSize` | a handle token and the "Area handle" actor's prototype token | `true` (dnd5e never resizes a handle) |
| `flags.dnd5e.requestResult` | a save roll message | `{ actorUuid, requestId }`: threads the save under the players' request card |

Flags are read as `doc.flags["pentaryn-aoe"]`, never `getFlag` (it throws while the module is
inactive, e.g. hot-patched).

## Flags other modules read

`flags.pentaryn-aoe.handle` (token), `.handleActor` (actor) and `.region` are a cross-module
contract. Readers: pentaryn-creatures (a handle is a prop, `isProp`), pentaryn-portals (a
handle is not spread on arrival), pentaryn-senses (no light on a handle, `light.mjs`), pentaryn-combat
(no turn for a helper token, `turnflow/helper-token.mjs` through
`shapes.isAoeHandle`). `test/fixtures/handle-oracle.json` is the shared row
set every copy pins against; prefer `apiOf("pentaryn-aoe").isHandle(x)` in new code.

## Events

n/a — emits none of its own beyond the kit's `pentaryn-aoe.ready` and `pentaryn.ready`. The hooks
it listens to, in order, are pinned in `test/golden/hooks.json`; order within a name is behaviour
(three `dnd5e.renderChatMessage` decorators; Careful's `dnd5e.postUseActivity` before refund's
synchronous `false`).

## Patches and adjustments

Patches (kit `wrapMethod`, listed by `describe().patches`, undone by `uninstall()`):
`ui.ARGON.bind` (marker `_aoeGuard`, row `aoe-argon-handle-bind`: Argon never binds its HUD to a
handle) and `RegionLayer.prototype.placeRegions` (marker `Symbol.for("pentaryn-aoe.aimWrapped")`,
row `aoe-self-area-aim`: Part G's `onMove`). Non-patch rows: `core-region-placement-escape`,
`core-region-delete-handle-race`, `core-token-auto-rotate-handle`, `core-private-roll-rows-hidden`, `dnd5e-chat-message-types`,
`dnd5e-legacy-roll-modes`, `dnd5e-token-size-lock`, `dnd5e-careful-spell-protected-rows`,
`dnd5e-supersede-same-usage`, `dnd5e-untargeted-touch-self`, `dnd5e-same-spell-no-stack`,
`dnd5e-cancelled-area-refund`, and for Item Piles `itempiles-aoe-skip-piles` (in the adjustments
batch; only `scene-adapter.mjs` touches `game.itempiles`).

## Two sessions / who writes

The MCP bridge tab is a GM session, so a GM browser tab next to it makes two clients that both
pass `activeGM.isSelf` and `userId === game.user.id`.
- **Handles**: created with `_id` = the region's id and `keepId`; the server refuses the second.
- **The handle actor**: fixed id `pentarynAoeHndl0` with `keepId`. v14 does not refuse a world
  document whose id exists (only embedded ones), so the later create wins with identical data and
  clients see `createActor` twice; one actor results. The "already exists" catch is a fallback.
- **`resolve` and `selfApply`** (`createChatMessage`): the kit's `claimMessage(message, job,
  { scope })` — each candidate stamps its socket id, waits 750 ms, and only the last writer acts.
- **Everything else** on a broadcast hook runs where `activeGM.isSelf` (concentration cleanup, the
  ready sweep, the `canvasReady` sweep of each newly viewed scene — wired at setup on every
  client, so a GM who takes over after ready sweeps too — the delete backstop); each is idempotent.
- **Apply** (`applyRows`): overlapping calls for one tray in one tab run one after another, so
  the later one skips the rows the earlier one applied; a later call stops waiting on an Apply
  stuck for 10 s (`APPLY_WAIT_MS`). Two tabs applying the same tray at once are not coordinated.

## Extending

A new Part is a `<part>.mjs` that exports `install(reg, ctx)` and `uninstall()` and is added to
`FEATURES` in `aoe.mjs` (its place is its hooks' place). Hooks go through
`reg.on(name, reg.guardSwallowAsync(label, fn), { guard: false, label })`. Two exceptions with live
examples: a veto listener (refund) registers unguarded and returns a literal `false`
synchronously; a prototype patch (aim) uses `wrapMethod` and unwraps in `uninstall()`. Pure rules
go in `core.mjs` with a test. A setting is a `SETTINGS` row with literal keys. A broadcast job is
gated by the active GM and then `claimMessage(doc, "<job>", { scope: MODULE })`. API rows are a
`FEATURE_ROWS` entry returned as the Part's contribution, or a manifest row in `api.mjs`. Another
feature's function is reached through `ctx.exposed`, never an import.

## Pitfalls

- `lib/` and `test/kit/` are vendored: edit `foundry/lib/`, then `vendor.py sync`.
- Hooks register at **setup** in `FEATURES` order; moving a Part reorders listeners.
- `decorate` hooks are synchronous; the tray is built in JS (no template).
- The eraser uses `data-pentaryn-aoe-action`: a `data-action` inside a dnd5e card is also
  dispatched to the activity's own chat handler.
- Debugging a missing tray: `CONFIG.debug["pentaryn-aoe"] = true`, then `game.pentaryn.aoe.trace()`.
- Never `GOLDEN_UPDATE=1 node test/run.mjs` on the whole suite.

## Files

| File | Role |
|---|---|
| `aoe.mjs` | entry: FEATURES, ctx, init/setup/ready, the hot-patch `install()` |
| `core.mjs` | pure: constants, rows, saves, matching, aiming, summaries |
| `settings.mjs` | SETTINGS, `setting()`, the roll-mode migration |
| `api-manifest.mjs`, `api.mjs` | API rows; own implementations, `inspect`, `buildApiFor` |
| `scene-adapter.mjs`, `messages-adapter.mjs`, `argon.mjs` | adapters: scenes/regions/Item Piles, dnd5e messages, Argon |
| `areas.mjs`, `careful.mjs`, `resolve.mjs`, `tray.mjs`, `attacks.mjs`, `effects.mjs`, `refund.mjs`, `aim.mjs`, `escape.mjs` | features (Parts A–G) |
| `styles/aoe.css`, `lang/en.json`, `lib/` | styles; strings; vendored kit |
| `test/` | node:test suites, goldens, fixtures (`seams.mjs` maps the checkpoint names) |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check aoe
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module aoe
```

## Sync

`make foundry-aoe-sync`. `.mjs`, `lang/` and `styles/aoe.css` changes need a reload; `module.json` needs a
restart. **Hot patch** (to test before a restart): `game.pentaryn.aoe.uninstall()`; fetch each file
from `/modules/pentaryn-aoe/`, rewrite the relative imports to blob URLs, set
`globalThis.__pentarynAoeHot = true`, import `aoe.mjs`, then call `install({ sweepOnReady: false })`.
After a sync: `game.pentaryn.aoe.describe().version` equals `module.json`'s version.
