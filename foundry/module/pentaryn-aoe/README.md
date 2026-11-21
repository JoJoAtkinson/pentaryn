# Pentaryn AoE (`pentaryn-aoe`)

**Read this when:** changing or calling `pentaryn-aoe` — spell-area handles, the GM save tray,
Careful Spell, auto damage on a hit or a save spell's use, Apply from any damage / healing card (the GM
relay, late targets, typed totals), self-cast effects, the Escape / refund / aim placement helpers.
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
  delete the area; deleting the area deletes the handle. On a square grid the handle sits where
  core's half-square snapping can return it (`core.handleTopLeft`): an area centred on a grid corner
  gets its handle in the square below-right of it, so a drag can put the area back on the grid. An
  emanation dnd5e attached to its caster gets no handle; the caster's Token HUD gets an eraser,
  "Remove the spell areas on this token". An instantaneous spell's emanation (Thunder Step) is
  created unattached (a monster feature's "inst" aura, a ghast's Stench, is not: `core.instantSpellArea`) (`dnd5e.createMeasuredTemplate`, setting `stationaryInstantAreas`), so it stays
  where it was cast and gets a handle. A handle is named "<Spell> (<caster's token name>)" — the author's user name
  when no caster token is found, never an actor name — and gives a faint dim light of half a
  square, so it and the area's outline show in darkness to anyone who can see that spot. Handles
  are never combatants and never stay targeted. The spell card gets an eraser icon after *Place Template*: **Remove all templates** of
  that spell on the viewed scene. When concentration ends, that spell's areas go on every scene.
- **Part B — saves off the area** (`resolve.mjs`, `tray.mjs`). A damage roll from a save activity
  makes the active GM's client list the creatures inside the area (or the roller's targets), roll
  the monsters' saves (`npcSaveRollMode`), post one request card for the players, and show a
  GM-only tray after dnd5e's own damage tray: tick, save, a total (B5: pre-filled with the rolled
  total; a number typed from real dice replaces it for that row, `row.amount`, each damage type
  keeping its share), multiplier, the damage that would land, Apply. Every save is threaded under
  the spell's usage card, so dnd5e's outcomes and half-damage pill agree. Off an area the same
  write stamps the ticked rows' tokens into the card's `system.targets` (hidden, caster, 0 HP and a
  Careful ×0 row excluded; `flags.pentaryn-aoe.areaTargets`), so dnd5e's own tray lists the area's
  creatures instead of the GM's selected tokens and a GM who applies from it hits the area. A save rolled from the
  usage card's own Saving Throw button before Damage fills its row when the tray is built (J2:
  `fillEarlierSaves`; a save under the usage card answers whenever it was rolled, `matchSave`
  `usageId`), so nobody is asked twice. A save activity with no DC judges no save: each shows its
  total with a '?', the multiplier stays '?', and the GM sets it by hand. An older Damage click on the same area (or the same card after its area went) greys
  out: the module's tray on it refuses, but dnd5e's own tray on that older card still lists the
  area's creatures (its stamp is kept), and a GM who presses it applies that damage by hand. Players see one status line on their own card (waiting / applied / re-rolled), never
  monster numbers; the GM-only monster saves are hidden from their chat.
  **Empowered Spell keeps the saves** (F0, PHB 2024: only damage dice are rerolled): a damage card
  pentaryn-riders posts for Empower (`flags.pentaryn-riders.empowered.from` names the card it replaces)
  takes over that card's tray — each row's save, multiplier, tick and the GM's edits, the area, Careful
  Spell and the players' request card (`core.carryResolution`) — so no save is rolled again and no second
  request card is posted; a save still pending answers the new card. The new card keeps its own damage.
  The replaced tray greys out as any re-roll does. Refused (a fresh resolve, as before) when the replaced
  tray is superseded or already has an applied row. The tray's Apply passes the card as `origin` (as
  dnd5e's own tray does), so riders retires the Empower button once the card is applied.
- **Careful Spell** (`careful.mjs`). Metamagic is tracked, not forced onto a spell (Joe's ruling,
  2026-10-12). Using it opens a picker on the caster's client: the creatures on their scene they
  can see, by token name, the current targets ticked, up to their CHA mod (min 1). A public card
  says `<caster token> uses Careful Spell: <token names>`. Using it always declares: a skipped pick
  (or nobody to pick) posts the card with nobody chosen and still replaces an earlier choice; that
  tray then protects nobody and the GM shields rows by hand. The caster's next save spell's tray marks
  exactly those creatures *protected*: an automatic success and ×0 on a half-damage spell, no
  request card. Then it ends (one use per declaration); a re-roll of that card keeps it. A spell
  with no save leaves it waiting, there is no time window, and using it again replaces the choice.
  The GM toggles any open row's protection with its shield in the tray: off, the row gets back its
  own save, or a monster rolls one and a player row waits.
- **Part C — damage on a hit, or on a save spell's use** (`attacks.mjs`). The roller's client rolls
  damage after a hit (or an attack whose target AC it can't know). A known miss or a natural 1 rolls
  nothing. J1 (`autoDamageOnSave`): using a save activity that has damage and at least one recorded
  target (Psionic Lash at Caven) rolls its damage at once, threaded under the usage card with the
  card's targets, so the flow is Use → the target saves → Apply. A save spell that places an area
  waits for the area; a use with no target posts nothing extra.
  **Hit or miss (D2, setting `hitMissLabels`).** With `dnd5e.attackRollVisibility` at `hideAC` (since
  2026-11-20) players know hit or miss but not the AC, yet a miss still looked like nothing happening.
  `dnd5e.renderChatMessage` on an attack card adds "— Hit" (blue) or "— Miss" (orange) to its title
  (`.card-header .subtitle`) for one target, "Hit" / "Miss" on each `target-pill` for several, and a
  rendered "Miss — no damage" line when every target was missed — never a posted message, which would
  come once per client. Total cover (`ac === null`) is a miss; no recorded target, a private card or a
  visibility of `none` shows nothing (`core.attackOutcome`, from `message.system.evaluatedTargets`, else
  the pills' `data-hit` / `data-miss`). The damage card after a hit (the newest attack card of the same
  activity before it) gets a blue title. Render-only; a re-render replaces the labels.
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
  edge and turns toward the mouse while placing. **B3:** the same `placeRegions` wrap shows one
  permanent notice for a placement of several shapes (Wall of Stone's ten panels): "Panel n of N: Esc to
  finish, right-click skips a panel" (`core.panelCounter`), advanced by each confirmed or skipped shape
  (the caller's own `preConfirm` / `preSkip` run first; a `false` from them counts nothing) and removed
  when the placement ends. Escape is the real "finish": core resolves the placement null, and dnd5e's
  `preConfirm` has already kept the panels placed so far, so those are created. Right-click skips the
  shape under the mouse (core's `#skipPlacement`); for a one-shape area that is the same as cancelling.
- **Part I — Apply from the card** (`apply.mjs`, setting `applyFromCard`). dnd5e's own Apply tray
  (`<damage-application>`) is on every damage and healing card for players too (world setting
  `dnd5e.allowPlayerDamageTray`, on since 2026-11-06). dnd5e 6 types a damage roll's card `damage`
  and a healing roll's `healing` (`HealingMessageData`, the same card template); the module acts on
  both (`core.isApplyCard`) — 0.6.0–0.6.1 asked for `damage` alone, so no healing card was wired,
  followed or relayed (playtest 2026-11-07). The module wires that element (the card's
  render hook; its rows on the element's own `recorded-targets:build`, caught in the capture phase)
  and the Apply press goes through here, before dnd5e's handler. **The rows dnd5e lists are the rows
  Apply hits** — what the tray shows is what lands. **Owned rows** land on this client exactly as dnd5e
  lands them (`actor.applyDamage` with the tray's merged options, `isDelta`, the card as `origin`);
  **rows the user does not own** (Talo heals Caven; nobody owns another PC here) go to the active GM as
  one query, `pentaryn-aoe.applyRelay`, with the same multiplier and the pill menu's ignore / downgrade
  choices, and the GM's client applies them — the click is the decision, no confirmation anywhere, and
  the player hears from the module only when the relay did not land (one toast: `NoGm` when no GM is
  connected; on a `TIMEOUT` (no answer in `RELAY_TIMEOUT_MS`, 8 s) the player's client watches the card
  for up to `RELAY_LATE_WAIT_MS` (15 s) for a new `appliedLog` entry naming a relayed token
  (`core.relayLanded`) and says nothing if one appears, else `Late` ("not confirmed yet, check their HP
  before pressing Apply again"), since 0.7.1: a slow GM client landed a heal after "No GM" had been
  said, inviting a double heal; `RelayFailed`, with the reason, when the GM's client refused or
  failed — a silent refusal read as a heal that had landed; a losing GM tab's `claimed: false` is not a
  failure). A player may relay only on a card
  they authored or whose actor they own; on the GM's breath-weapon card listing two PCs the ally's row
  is skipped silently, as dnd5e skips it. **Late targets:** a card that recorded no targets at use time
  (Heal cast, then Caven targeted) is filled with its author's current targets as they target
  (`targetToken`, debounced; `system.targets` + `flags.pentaryn-aoe.lateTargets`, players only, cards
  under 10 minutes old, until applied — or until the GM's `resolve()` stamps the area into the card,
  `areaTargets`, after which the author's targeting never rewrites it), so dnd5e's own rows list them; and when dnd5e lists nobody on
  such a card (nothing selected) a player's Apply goes to the targets they hold, at the tray's
  multiplier, and the card records them. A GM's untargeted card keeps dnd5e's selected-tokens habit
  (a stale target never lands). **Typed totals (B5):** every target row gets a small total pre-filled
  with the rolled one; a typed number replaces it for that row's Apply (the multiplier still applies on
  top) and dnd5e's own per-row number shows what would land (a token the user does not own has no
  number from dnd5e and gets none). Players roll real dice and report totals, not faces, so this is how
  a real roll gets in; a typed total lasts until Apply or a page reload. A GM owns everything, so a GM
  relays nothing. **Save spells:** the GM's Part B tray under the card is the one to apply a save spell
  from (it knows each row's save; dnd5e's tray only halves once a save is threaded), so on a card that
  carries a resolution the GM gets no typed totals on dnd5e's tray, and the Part B tray's own totals are used.
  A player's Apply on such a card relays nothing (the GM's tray applies it; one info toast says so) — their
  own rows still land.
  **Self-only cards target the caster (G1).** dnd5e records the roller's current targets on every roll
  card, so Stone's Endurance rolled with an enemy targeted offered to heal the enemy, and with nothing
  targeted each viewer's tray listed their own selection ("Caven +11"). On the roller's client
  (`preCreateChatMessage`, `updateSource`), a healing card from an activity whose affects
  type is `self`, or whose range is Self with no other affects type (`core.selfTargetCard`), records
  the caster's token as its one target. Never one that places an area (a Self cone, line or emanation:
  Burning Hands, Spirit Guardians), has a save, or is an attack, and never a damage card (a Self-range
  damage activity usually hurts someone else: Armor of Agathys, Fire Shield); `areaTargets` and `recordedTargets`
  are never written, and late targets leave the card alone since it has targets.
  **Applied by (G2).** Every Apply press is recorded on the card as one entry of
  `flags.pentaryn-aoe.appliedLog` (`messages-adapter.logApplied`: who pressed it and, per token that took
  it, the HP change and whether a player owns it), and the card shows "Applied by Talo → Talo (+11)" under
  its tray, one line per press (`core.appliedByLines`). The rows that landed on the player's client are
  in their own write (the applied stamp, now on every Apply); rows relayed to the GM, and the GM tray's
  Apply, are written by the GM's client. Who reads it is `showAppliedBy` (`core.appliedByVisible`); a
  player never reads a row for a creature no player owns (a monster's name or the damage it took after
  resistances is GM data). A player's Apply on a card they neither rolled nor own the actor of cannot
  write the card, so their own rows go unrecorded there.
- **Wall spells you can see (B1)** (`wall-spells.mjs`). dnd5e 6 maps the `wall` area type to a ray, so
  a wall spell's region is line shapes as thin as the wall (Wall of Stone's Long Panels: 0.25 ft, a
  2.5 px line on a 50 px grid), drawn as grid coverage in the caster's user colour — Talo's dark green
  wall "disappeared" (feedback 8t6Nn1). On `refreshRegion`, a wall spell's region (`core.wallSpellRegion`:
  every shape a line, from an activity whose area type is `wall`, else one with dnd5e's
  `dimensions.height`) gets one `PIXI.Graphics` child on the Region placeable: every panel drawn
  `core.wallThickness` thick (its width, or a fifth of a square when thinner) in neutral stone grey with
  a dark stroke. Drawing only: the shapes (who is in the area) never change, and no Wall documents are
  made (B2 is a separate decision).
- **Part H — walls** (`walls.mjs`). Which walls clip a spell area (setting `areaWalls`). dnd5e 6
  restricts every template region with the core `move` polygon, so every movement wall clipped it,
  including invisible walls. With `cover` (the default) only a wall that blocks movement **and**
  sight clips an area (PHB 2024: only total cover blocks an area), and a cube is clipped from its
  centre, not its corner (`core.edgeClipsArea`, `core.areaClipOrigin`). A rotated or resized cube is
  clipped from its new centre: a second wrap, of `_computeShapeConstraints`, hands the update's new
  shapes to the first. Changing `areaWalls` asks core to recompute the `move` constraints on the
  levels each client views (`Level#updateRegionShapeConstraints`; core's designated user writes).
  Once uninstalled, a wrapper that could not be removed passes straight through to core.

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
| `stationaryInstantAreas` | on | A | an instantaneous spell's emanation stays where it was cast, with a handle (a monster's aura still follows it) |
| `npcSaveRollMode` | `gm` | B | message mode of monster saves: `gm`, `blind` or `public` (a stored legacy `gmroll` is rewritten once by the active GM) |
| `autoDamageOnSave` | on | C | J1: using a save activity with damage and a recorded target rolls the damage at once (not an area spell; not with no target) |
| `applyFromCard` | on | I | Apply on a damage / healing card: unowned rows relayed to the active GM, late targets fill an untargeted card, a typed total per row |
| `hitMissLabels` | on | C | D2: an attack card says Hit (blue) / Miss (orange) in its title (each pill with several targets), a "Miss — no damage" line on a miss, a blue title on the damage card after a hit; nothing while `dnd5e.attackRollVisibility` is `none` |
| `showAppliedBy` | `owners` | I | G2: who reads "Applied by <user> → <token> (±n)" under a card's tray: `gm`, `owners` (the GM, the card's roller, the owners of a row's token) or `all`; a player never reads a monster's row |
| `areaWalls` | `cover` | H | which walls clip an area: `cover` (block movement and sight), `move` (dnd5e: every movement wall), `none` |

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
| `resolve(messageOrId, { regionId? })` | `Promise<resolution \| null>` | active GM; null: not a damage message from a save activity, or its tray is superseded or has an applied row (warning toast; the tray's area picker is disabled then too). `regionId: null` builds the rows from the roller's own targets — `flags.pentaryn-aoe.recordedTargets` once an area stamp has overwritten `system.targets`, else the card's. On a GM tab that is not the active GM the area picker warns and goes back to the current area |
| `applyRows(messageId, rowIds?)` | `Promise<resolution \| null>` | GM; null when superseded (warning toast) or no tray; when a row's damage fails, the other rows still land and are marked applied, a warning toast names the failed rows, and the first error rejects (Apply again retries only those) |
| `rollNpcSaves(messageId, { rowIds?, force? })` | `Promise<resolution \| null>` | GM; a monster whose save fails to roll is logged (`npcSave`, naming the row) and left unrolled for a re-roll, and the saves that landed are kept |
| `rollForPlayer(messageId, rowId, { event? })` | `Promise<Roll[] \| null>` | GM |
| `pingPlayers(messageId)` | `Promise<ChatMessage \| Notification \| null>` | GM; the info toast when nobody waits |
| `setRow(messageId, rowId, { apply?, multiplier?, protected?, amount? })` | `Promise<resolution \| null>` | GM; a multiplier that is not one of the tray's (0, 0.25, 0.5, 1, 2) leaves the row unchanged, logs `setRow multiplier` and returns null; `amount` (B5) is the row's typed total, a number ≥ 0 (floored) — null, '' or the rolled total clears it, anything else logs `setRow amount` and returns null |
| `applyRelay({ messageId, requestId, rows: { uuid, multiplier, amount?, options? }[] })` | `Promise<{ ok, applied[], claimed? } \| { ok: false, code, reason }>` | GM client; query `pentaryn-aoe.applyRelay` (`relay: true`: any sender, the active GM answers). The sender must be the card's author or own its actor (`REFUSED`; the sender checks the same rule first and skips such rows silently); the damage is read from the card, the request brings which rows, each multiplier, a typed total and the pill menu's ignore / downgrade choices (`options`, arrays on the wire); the `requestId` (required, one per Apply press) is claimed on the card so two GM tabs land it once (the loser answers `claimed: false`); a ×0 row or a missing token is skipped; `NOT_FOUND` for anything but a damage or healing message (dnd5e types `damage` / `healing`), `BAD_ARGS` with no rows or no `requestId`, `NOT_GM` on a player client |
| `selfApply(messageOrId, { force? })` | `Promise<{ reason, actor, effects } \| null>` | the applier client; `force` skips the setting and the claim; an unknown id → null |
| `pendingFor(message, { effects? })` | `Promise<string[]>` | any |
| `cardEffects(message)` | `Promise<ActiveEffect[]>` | any |
| `activePlacement()` | `object \| null` | this client |
| `setting(key)` | value | any; the default when unregistered |
| `hookIds()` | `{ name, id }[]` | this client |
| `resolution(messageOrId)` | a copy of the tray state, or null | GM data |
| `latestResolution({ sceneId? })` | `{ messageId, resolution } \| null` | the newest live tray of the last 60 messages; `"current"` = the viewing client's scene, null when it views none (pass no `sceneId` for any scene) |
| `summary(messageOrId)` | `{ item, ability, dc, onSave, region, superseded, applicable, rows, careful, playerStatus } \| null` | plain data for the bridge |
| `isHandle(tokenOrDoc)` | boolean | any |
| `inspect(ref, { sceneId?, as? })` | plain JSON, depth ≤ 4 | a message → `{ message, resolution, npcSave, effectsApplied }`; a token or actor → `{ token?, actor, isHandle, region, handleActor, careful }`. `as` a player: no tray summary (only `playerStatus`), Careful only on an actor they own. Unknown ref → `NOT_FOUND` |

## Data written

| Flag | On | Shape |
|---|---|---|
| `flags.pentaryn-aoe.resolution` | the damage message | `{ activity, item, itemName, region, regions, scene, usage, ability, dc, onSave, careful, damages, request, created, superseded, rows[] }`; a row carries `amount` only while the GM has typed a total for it |
| `flags.pentaryn-aoe.claims.<job>` | the damage / usage / player save message | the socket id of the session doing `resolve` / `selfApply` / `matchSave`, or `relay-<requestId>` for one Apply relayed to the GM |
| `flags.pentaryn-aoe.lateTargets` | the author's own damage / healing message | `true` once the player's late targets filled its `system.targets` (dnd5e's own field, rewritten by the author; the Apply that recorded targets writes it too); `false` once an area resolve stamped the card over them |
| `flags.pentaryn-aoe.areaTargets` | the damage message resolved off an area | `true` once `resolve()` wrote the area's creatures into its `system.targets` (dnd5e's own field; replaced on a re-resolve with another area) |
| `flags.pentaryn-aoe.recordedTargets` | the damage message resolved off an area | the card's `system.targets` as they were before the first area stamp, a plain array of dnd5e descriptors (`[]` when the roller targeted nobody); written once, and what `resolve(id, { regionId: null })` builds its rows from after the stamp |
| `flags.pentaryn-aoe.applied` | a damage / healing message, after any Apply from its dnd5e tray (G2; before, only one with no recorded targets or that followed late targets) | `{ at, by, targets[] }`, so late targets stop following it |
| `flags.pentaryn-aoe.appliedLog.<id>` | a damage / healing message | G2: one entry per Apply press, `{ at, by, byName, rows: [{ token, name, delta, pc }] }` (`delta` the HP change, negative for damage; `pc` a player owns the creature); read by the "Applied by" line |
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
handle is not spread on arrival), pentaryn-senses (a handle is never offered a creature light, `light-ui.mjs`), pentaryn-combat
(no turn for a helper token, `turnflow/helper-token.mjs` through
`shapes.isAoeHandle`). `test/fixtures/handle-oracle.json` is the shared row
set every copy pins against; prefer `apiOf("pentaryn-aoe").isHandle(x)` in new code.

Read from other modules: `flags.pentaryn-riders.empowered.from` (an Empowered Spell damage card's
replaced card, F0; nothing else of that flag), declared in `MANIFEST.flags.reads`.

## Events

n/a — emits none of its own beyond the kit's `pentaryn-aoe.ready` and `pentaryn.ready`. The hooks
it listens to, in order, are pinned in `test/golden/hooks.json`; order within a name is behaviour
(five `dnd5e.renderChatMessage` decorators; Careful's `dnd5e.postUseActivity` before J1's damage roll
before refund's synchronous `false`). The one query, `pentaryn-aoe.applyRelay`, is registered from
the contributed rows at ready on every client (`registerQueries`).

## Patches and adjustments

Patches (kit `wrapMethod`, listed by `describe().patches`, undone by `uninstall()`):
`ui.ARGON.bind` (marker `_aoeGuard`, row `aoe-argon-handle-bind`: Argon never binds its HUD to a
handle) and `RegionLayer.prototype.placeRegions` (marker `Symbol.for("pentaryn-aoe.aimWrapped")`,
row `aoe-self-area-aim`: Part G's `onMove`) and `RegionDocument.prototype._computeShapeConstraint`
(marker `Symbol.for("pentaryn-aoe.wallsWrapped")`, row `aoe-area-walls`: Part H, template regions
with a `move` restriction only) with `RegionDocument.prototype._computeShapeConstraints` (marker
`Symbol.for("pentaryn-aoe.wallsShapesWrapped")`, same row: holds `changes.shapes` for the call). Non-patch rows: `core-region-placement-escape`,
`core-region-delete-handle-race`, `core-token-auto-rotate-handle`, `core-private-roll-rows-hidden`, `dnd5e-chat-message-types`,
`dnd5e-legacy-roll-modes`, `dnd5e-token-size-lock`, `dnd5e-careful-spell-protected-rows`,
`dnd5e-supersede-same-usage`, `dnd5e-untargeted-touch-self`, `dnd5e-same-spell-no-stack`,
`dnd5e-cancelled-area-refund`, `dnd5e-self-card-targets-caster`, `dnd5e-card-applied-by-line`, `dnd5e-attack-card-hit-miss`, `core-region-wall-panels`, `core-region-placement-panel-counter`, and for Item Piles `itempiles-aoe-skip-piles` (in the adjustments
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
  A card deleted during the wait means nobody acts; a card deleted after it, while `resolve` is
  still running, is a clean cancel: no more saves, no request card, no apply, nothing logged.
  A card this client is deleting counts as gone from `preDeleteChatMessage` on, before the
  server confirms it; a delete from another tab counts once it lands.
- **Player save matching** (`matchSave`, on the save message): a save that answers a waiting
  row is claimed the same way, so one tab fills the row. A save that answers no open tray is not
  claimed (no flag write on every save).
- **Everything else** on a broadcast hook runs where `activeGM.isSelf` (concentration cleanup, the
  ready sweep, the `canvasReady` sweep of each newly viewed scene — wired at setup on every
  client, so a GM who takes over after ready sweeps too — the delete backstop). Two GM tabs both
  run these. A delete the server refuses as "does not exist" (handle deletes, the concentration
  cleanup, the sweep's orphans) means the other tab already deleted it: that counts as done,
  nothing is logged, and the job carries on (the next scene, the rest of the sweep). Any other
  refusal is still an error.
- **The Apply relay** (`applyRelay`, a query): the server sends a player's query to every socket of
  the active GM, so the bridge tab and a GM browser tab both run it. Each Apply press carries one
  `requestId`; the handler claims `relay-<requestId>` on the card (`claimMessage`) and only the winner
  applies, the loser answering `{ applied: [], claimed: false }` — the sender needs no result, so the
  loser answering first is fine. A request with no id is refused (`BAD_ARGS`): without the claim two
  tabs would land it twice. The tray folds before the relay is awaited, so the player's card does not
  wait on the claim's settle.
- **Late targets** run on the author's own client only (`user.isSelf` on `targetToken`), one
  message, debounced; the Apply stamp is written by the author or a GM. Two writers can reach a save
  spell's card's `system.targets` (the author's late targets, the GM's area stamp): the stamp wins —
  `lateTargetCard` skips a card flagged `areaTargets`, and the stamp clears `lateTargets`. Only a
  late-targets write already in flight when the stamp lands can still land after it (sub-second).
- **Apply** (`applyRows`): overlapping calls for one tray in one tab run one after another, so
  the later one skips the rows the earlier one applied; a later call stops waiting on an Apply
  stuck for 10 s (`APPLY_WAIT_MS`). Across tabs, each row is re-read from the live message just
  before its damage and skipped if another tab already applied it, and each landed row is marked
  applied at once, so a second tab's Apply lands nothing twice.

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
- Part I's row field sits inside dnd5e's `<li>` rows; dnd5e reads every `change` in its list as a
  target tick, so the field stops its own `change` and the module listens to `input`. A typed total's
  result is written into dnd5e's own `.calculated.damage > .value` (nothing is added to the row);
  dnd5e rewrites that number on a multiplier or pill change, so the module recomputes the typed rows a
  tick after any other click on the card and restores dnd5e's latest text when the total is cleared.
  A card first shown with no targets is remembered by dnd5e as "selected" mode per message; once late
  targets or area targets fill it, the first row build switches it to "targeted" through the element's
  public setter, once.
- Debugging a missing tray: `CONFIG.debug["pentaryn-aoe"] = true`, then `game.pentaryn.aoe.trace()`.
- Never `GOLDEN_UPDATE=1 node test/run.mjs` on the whole suite.

## Files

| File | Role |
|---|---|
| `aoe.mjs` | entry: FEATURES, ctx, init/setup/ready, the hot-patch `install()` |
| `core/areas.mjs` | pure area geometry behind the core barrel: centres, handle spots, which walls clip |
| `core.mjs` | pure: constants, rows, saves, matching, aiming, summaries |
| `settings.mjs` | SETTINGS, `setting()`, the roll-mode migration |
| `api-manifest.mjs`, `api.mjs` | API rows; own implementations, `inspect`, `buildApiFor` |
| `scene-adapter.mjs`, `messages-adapter.mjs`, `argon.mjs` | adapters: scenes/regions/Item Piles, dnd5e messages, Argon |
| `areas.mjs`, `token-areas.mjs`, `careful.mjs`, `resolve.mjs`, `tray.mjs`, `attacks.mjs`, `effects.mjs`, `refund.mjs`, `aim.mjs`, `escape.mjs`, `walls.mjs`, `wall-spells.mjs`, `apply.mjs` | features (Parts A–I; `wall-spells.mjs` is B1, wall spells drawn visible) |
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
A publish that throws (a frozen `game.pentaryn`) rejects `install()`; at a normal ready it is logged
`pentaryn-aoe | publish` and ready carries on (Argon guard, settings migration, startup sweep).
After a sync: `game.pentaryn.aoe.describe().version` equals `module.json`'s version.
