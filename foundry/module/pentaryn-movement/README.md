# Pentaryn Movement (`pentaryn-movement`)

**Read this when:** a player's token is stuck under someone else's, a player wants to walk through
a wall while exploring, ghost movement needs switching off for a scene, a dragged token should
find its way around a wall (or takes a strange route), or you are changing or calling
`pentaryn-movement`. **Not this file:** how every addon is built →
`context/foundry/addon-blueprint.md` · the migration record →
`context/plans/addon-blueprint-2026-10/migrate-pentaryn-movement.md` · how pathfinding was designed →
`context/plans/pathfinding-2026-11.md`

Built from the 2026-10-08 table feedback (plan item C2, `context/plans/table-feedback-2026-10-08.md`).

## What the player sees

**Owned tokens on top (players only).**

- On a player's screen, **their own tokens are drawn above everyone else's** and take the click
  when tokens overlap, so you can always see and grab your own token.
- **Client-side only.** Nothing is written to the scene; the GM (who owns everything) is never
  affected. **Elevation still wins:** a flying creature above you is still drawn above you.
- Per-player switch: *Settings → Pentaryn Movement → Show my own tokens on top* (default on).

**Ghost movement (players).**

- **The ghost button** (a ghost icon) in the token tools, just under the Ruler. Click it to move
  your own tokens **through walls, doors and other creatures**, by drag or arrow keys. Click again
  to walk normally. Each player switches it for themselves.
- **You can see it's on:** the button is pressed, its tooltip says *Ghost movement: ON*, and your
  own tokens look see-through.
- **Watch-out (accepted by Joe):** walking through a wall puts your token's vision on the other side.
- When ghost stops being allowed (a fight starts, or the GM turns it off), the button is
  **switched off** with a toast. It does not come back by itself; when it is allowed again, a
  second toast says so once. During a fight the button stays visible, dimmed, with a small swords
  badge, and clicking it explains why it's off.
- **Incorporeal creatures keep ghosting through a fight.** If one of your tokens is incorporeal — its
  actor has a **feat** named *Incorporeal Passage*, *Incorporeal Movement* or *Ethereal…* (the Summon
  Undead spirit, a ghost), or the GM marked it (below) — the button stays usable while the fight runs:
  no swords badge, no "fight started" switch-off, and that creature passes through walls and other
  creatures as usual. Your other tokens walk normally until the fight ends (the button's tooltip says
  so). Feats only: a character who merely knows the *Etherealness* **spell** is not incorporeal. Only
  movement passes; walls still block light and sight. When a fight has switched ghost off and such a
  creature of yours then arrives (you summon it), one toast says it may ghost.

**GM control.**

- *Settings → Pentaryn Movement → Player ghost movement*: **Off** (no button), **Exploration only**
  (default: off while a combat runs on the scene), **Always allowed**.
- **GM toolbar button** (token tools, next to core's own ghost): pressed = players may ghost. Click
  it to turn ghost off for everyone; click again to restore the previous mode. Quick repeat clicks
  (and `setPolicy` calls) apply one after another, and each toast names the mode then in effect.
- **"A combat is running on the scene"** = an **active** encounter linked to the scene that has a
  combatant or has started, or an unlinked one with a combatant standing there. An empty encounter
  does not count, and **hidden combatants don't count** (a hidden ambush tips no one off).
- **Ghost in combat for one creature** (GM only): Token HUD → the ghost button in the right column.
  Pressed = the creature's owner may ghost it during a fight (the actor flag
  `flags.pentaryn-movement.ghostInCombat`; on an unlinked token it stays with that token). A creature
  whose feat already grants it is shown pressed with the feat named, and the click changes nothing.
  Same from the console: `game.pentaryn.movement.setGhost(creature, { combat: true })`.

**Drag pathfinding (everyone, 0.3.0).**

- **Drag a token past a wall and the ruler goes around it** — the shortest way, through open doors,
  never through a closed, locked or secret one, never through a hostile creature, and around
  difficult terrain when that is cheaper. Drop, and the token walks that route. A drag that already
  goes straight is left exactly as core draws it.
- **The corners are rounded** into short arcs where an arc stays clear of walls and costs no extra
  movement; otherwise the corner stays sharp. Movement is still counted in 5-ft squares (every
  diagonal 5 ft), so the ruler's feet are the same either way. *Round path corners* turns it off for you.
- **Players only route around walls they have seen.** An unseen wall stops the token on the drop,
  as it always did — no map is revealed. The GM routes around every wall.
- **A big token must fit:** a 2×2 token is never routed through a 1-square gap.
- **In combat** the path is the cheapest one; dnd5e's ruler colours show when it runs past your speed.
- **Not for:** ghost, the GM's *Unconstrained Movement* tool (both go straight), arrow keys, gridless and hex scenes.
- GM switch: *Settings → Pentaryn Movement → Drag pathfinding*: **Everyone** (default), **GM only**,
  **Off**. Per player: *Find a path when I drag* (default on), *Round path corners* (default on).

**How ghost works.** It reuses core's own mechanism: the constrain options the GM's
*Unconstrained Movement* tool passes into a move — `ignoreWalls`, `ignoreCost` (core
`Token#constrainMovementPath`) and `ignoreTokens` (dnd5e `Token5e#constrainMovementPath`, creature
blocking). Core offers them only to the GM, in `Token#_getDragConstrainOptions`; this module wraps
that and `TokenLayer#_prepareKeyboardMovementUpdates` and adds the three flags when ghost is in
effect for the token (a player, its owner, button on, allowed by the policy). No collision code is
reimplemented, and **no GM relay is needed**: the constraint runs on the mover's own client
(`TokenDocument#preUpdateMovement`), and the server's `Token#_preUpdate` never looks at walls.
dnd5e 6's `Token5e#findMovementPath` only adds waypoints before blocking creatures; the block itself
still honours `ignoreTokens`. Verified on core 14.369 / dnd5e 6.0.6.

## Settings

| Key | Scope | Default | |
|---|---|---|---|
| `ghostPolicy` | world | `exploration` | Off / Exploration only / Always allowed — `game.settings.get("pentaryn-movement", "ghostPolicy")` |
| `ghostPolicyLast` | world, hidden | `exploration` | the mode the GM button restores |
| `ghost` | client, hidden | `false` | this player's button |
| `ownedOnTop` | client | `true` | owned tokens on top — `game.settings.get("pentaryn-movement", "ownedOnTop")` |
| `pathfinding` | world | `everyone` | drag pathfinding: Everyone / GM only / Off (read live on every drag) |
| `pathfindMine` | client | `true` | this client's drags find a path |
| `smoothCorners` | client | `true` | round a found path's corners into arcs |

`status().settings` lists the same keys with their scopes.

The two client settings live in the browser's storage, so they are shared by every tab of that
browser: flipping the ghost button or *Show my own tokens on top* in one tab redraws the other tabs
too (they re-read the setting; nothing is written).

## API — game.pentaryn.movement

Canonical: `game.modules.get("pentaryn-movement").api`; `game.pentaryn.movement` is the same
frozen object. Ask it what it offers: `game.pentaryn.movement.describe()` (offline:
`test/golden/describe.json`). Every row except `inspect`, `pathfind.status`, `pathfind.route` and `selftest` is `legacy` (today's signatures).

| Method | GM | Writes | Returns |
|---|---|---|---|
| `status(opts?)` | — | — | policy, `combatOnScene`, allowed and why not, the player's switch, `patched.{drag,keyboard}`, then `sceneId`, `version`, `settings` (key → scope), `combatExempt` (ids of your tokens there that may ghost through the fight; `[]` when no fight blocks). `opts.sceneId` (or a bare scene id or Scene) asks about another scene (default: the viewed one); `sceneId` comes back as the id |
| `ghostFor(token)` | — | — | is ghost in effect for that token (a placeable or a TokenDocument) on this client; during a fight under *Exploration only*, true only for an incorporeal or GM-flagged token |
| `combatActive(sceneId?)` | — | — | does a combat stop ghosting there; takes a scene id or a Scene (default: the viewed one) |
| `setGhost(on)` | — | client setting `ghost` | the player's button. **Player clients only:** on a GM client (and so from the MCP bridge) it changes nothing for players |
| `setGhost(creature, { combat })` | yes | actor flag `ghostInCombat` | the GM's ghost-in-combat override for one creature (Actor, Token, TokenDocument, uuid, id or exact name; `combat` true sets, false clears); `{ ok, uuid, name, ghostInCombat, feat }` or a refusal object (`NOT_GM`, `NOT_FOUND`, `AMBIGUOUS`, `BAD_ARGS`) |
| `inspect(ref)` | — | — | `{ uuid, name, flag, feat, ghostInCombat }` for one creature (a token gives its own actor): the GM flag, the incorporeal feat's name or null, and whether either grants ghost in combat; throws coded `NOT_FOUND` / `AMBIGUOUS` / `BAD_ARGS` |
| `setPolicy(value)` | yes | world settings `ghostPolicy`, `ghostPolicyLast` | `"off" \| "exploration" \| "always"`; rejects with `Error("GM only")` on a player client |
| `pinsUnderTokens(scene?)` | — | — | map pins whose centre sits under a visible token on the same scene level (a pin shown on every level, or a token with no level, always counts), player-owned first; `scene` is a Scene or a scene id (an unknown id answers `[]`) (pins belong **beside** tokens: owned-on-top makes a pin under your token unclickable) |
| `pathfind.status()` | — | — | the mode, this client's two settings, `patched` (the `findMovementPath` wrap), the step-cache size, the limits, and `last`: what the last search did (`nodes`, `ms`, `reached` of `of` explicit waypoints, `arcs`, `improved`, `async`) |
| `pathfind.route(ref, { to, preview?, smooth? })` | — | — | dry run: the path a drag of that token to `to` (top-left pixels) would get, with its cost in feet; needs a browser tab showing the scene (the headless GM has no canvas) |
| `selftest()` | — | — | `{ ok, checks }` |

Kit members: `describe()`, `version`, `contract`, `settings()`, `trace()`, `uninstall()`.
`core` is the pure module (`movement-core.mjs`), published as a frozen copy. No queries.

## Data written

| Where | Path | Who | What |
|---|---|---|---|
| Actor (a token's synthetic actor for an unlinked token) | `flags.pentaryn-movement.ghostInCombat` | GM | `true` = its owner may ghost it during a fight (Token HUD toggle, `setGhost(creature, { combat })`); cleared with `unsetFlag` |

Settings: the world settings `ghostPolicy` / `ghostPolicyLast` (GM) and the client settings `ghost`
and `ownedOnTop` (each player, for themselves).

## Flags other modules read

n/a — no other module reads `ghostInCombat` (ask `inspect(ref)` rather than the flag), and movement
reads no foreign flag.

## Events

Emits none of its own. The kit fires two hooks at publish: `pentaryn-movement.ready` `(api)` and `pentaryn.ready` `("movement", api, { when: "ready" })`.

Listens to (pinned in `test/golden/hooks.json`, in this order): `init` (once), `setup` (once),
`getSceneControlButtons`, `renderSceneControls`, `drawTokenLayer`, `canvasReady`, `refreshToken`,
`updateActor`, `updateToken`, `createCombat`, `updateCombat`, `deleteCombat`, `createCombatant`,
`updateCombatant`, `deleteCombatant`, `createToken`, `deleteToken`, `renderTokenHUD`, then pathfind's
`setup` (once), `createWall`, `updateWall`, `deleteWall`, `createRegion`, `updateRegion`, `deleteRegion`,
`createRegionBehavior`, `updateRegionBehavior`, `deleteRegionBehavior`, `createToken`, `updateToken`,
`deleteToken`, `controlToken`, `canvasReady` (each drops the step cache; `canvasReady` also listens to
the scene's fog "explored", which drops it too), and `ready` (once).

## Patches and adjustments

| Patch (`describe().patches`) | Adjustments row | What |
|---|---|---|
| `Token#_getDragConstrainOptions` | `movement-drag-constrain-ghost` | adds the three flags to a ghosting player's drag |
| `TokenLayer#_prepareKeyboardMovementUpdates` | `movement-keyboard-constrain-ghost` | the same for arrow keys (reads the private result shape `result[1].movement[id].constrainOptions`) |
| `TokenLayer.objects#sortChildren` | `movement-layer-sort-owned` | core's interaction sort plus the owned rank (reads `_lastSortedIndex`) |
| `Token#findMovementPath` | `movement-pathfind-find-path` | drag pathfinding: splices the found corners in and runs the original again (marker `__pentarynMovementPath`) |

Not a patch: `dnd5e-movement-pathfind-blocking` (the search asks dnd5e's
`TokenLayer5e#isOccupiedGridSpaceBlocking` which squares a creature blocks).

The first three carry the `__pentarynMovement` marker and go through the kit (`wrapMethod`, and
`defineAccessor` for the sort, an instance property on each canvas draw's container).

## Two sessions / who writes

Client-only: nothing is elected and nothing runs on one client for everyone. Each client decides
ghost and the sort for its own user. A player's client clears its own `ghost` setting when ghost
stops being allowed; only a GM writes the world settings and the `ghostInCombat` actor flag (from the
GM client that clicked or called — no relay; the headless GM bot is a GM client like any other).

## Extending

1. A pure rule → `movement-core.mjs`, with a case in `test/core-rules.test.mjs`.
2. A label → a literal key in one of core's key maps (`TOOL_KEYS`, `NOTIFY_*`, …) and `lang/en.json`.
3. A hook → `reg.on(...)` inside `install()` in `ghost.mjs` (order matters: re-pin `hooks.json`
   only as a declared change).
4. A setting → a row in `settings.mjs` with literal `name`/`hint` and `onChange: forward(key)`;
   react to it through `ctx.onSettingChange(key, fn)`.
5. An API method → a row in `api-manifest.mjs` + its implementation in `api.mjs`, then
   `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review the diff.

## Pitfalls

- It wraps **private** core members (`_getDragConstrainOptions`, `_prepareKeyboardMovementUpdates`,
  `_lastSortedIndex`). After a core or dnd5e update, check `status().patched` is
  `{ drag: true, keyboard: true }` and run the three adjustments rows' check.
- Missing methods are warned once at `setup` (`no Token#_getDragConstrainOptions; ghost drag
  disabled`) and ghost then simply does nothing for that input.
- The GM never ghosts through this module (core's own tool is the GM's).
- The incorporeal test is by **feat name** (`INCORPOREAL_FEATS` in core). A homebrew creature whose
  trait is named differently needs the GM toggle; a spell by that name never counts.
- Errors in the two per-frame hooks (`refreshToken`, `renderSceneControls`) are warned once per
  session, then suppressed.

## Files

| File | Role |
|---|---|
| `movement.mjs` | entry: wiring only (lifecycle, publish) |
| `movement-core.mjs` | pure rules, constants, label key maps |
| `settings.mjs` | the `SETTINGS` table |
| `combat-adapter.mjs` | combats and scenes → plain core inputs |
| `ghost.mjs` | the feature: patches, sort, toolbar, refresh, the incorporeal exception on the player's side |
| `ghost-combat.mjs` | the GM's ghost-in-combat flag: Token HUD toggle, `setGhost(creature, { combat })`, `inspect` |
| `pathfind-core.mjs` | pure: A*, cost-preserving string pulling, corner arcs, the skip rules |
| `pathfind-adapter.mjs` | a token and its drag options → wall / creature / cost step tests (reads only) |
| `pathfind.mjs` | the feature: the `findMovementPath` wrap, the step cache, `pathfind.status` / `route` |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `styles/movement.css` | the dimmed combat badge (`.pm-blocked`) |
| `lib/` | the vendored kit (`vendor.py`; never edited here) |

## Tests

`node test/run.mjs` from this folder: core rules, the glue driven through its hooks and settings
(frozen characterisation from the migration checkpoint), the hook manifest, patch records, the API
goldens, i18n keys and logging; `pathfind-core.test` (A* on synthetic wall maps: corners, doors,
one-way walls, a 2×2 token, difficult terrain, a hostile in a doorway, cost equality) and
`pathfind.test` (the wrap against a token whose core path stops at the first wall). Fixtures are synthetic, because `test/` is published with the
module. One golden: `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, then review the diff.

**Verify live (as a player):**

1. Policy *Exploration only*, no combat: the ghost button shows; turning it on makes your tokens
   translucent, and a drag goes straight through a wall and through a hostile creature.
2. Start a combat with a combatant on the scene: the button switches off with a toast, is dimmed,
   and a drag stops at walls. An encounter holding only a **hidden** combatant changes nothing;
   revealing it switches ghost off.
2b. Summon an Undead Spirit (Incorporeal Passage) into that fight: one toast, the button is usable
   again, the spirit drags through a wall, your character still stops at it. As GM, open a plain
   creature's Token HUD and press the ghost toggle: its owner's button comes back the same way.
3. GM clicks the GM button: the players' buttons disappear; click again and they come back.
4. Two tokens overlapping: the player's own is drawn on top and takes the click; for the GM nothing
   changed.
5. `game.pentaryn.movement.selftest().ok` is true.
6. Pathfinding: drag around a wall corner (the ruler bends, rounded); through an open door (it
   goes through) and a closed one (it goes round, or stops if there is no other way); a 2×2 token at
   a 1-square gap (no route through it); in combat with little movement left (the cheapest route,
   ruler colours past your speed). `game.pentaryn.movement.pathfind.status().last` shows what the
   last search did.

## Sync

`.mjs`, `.css` and `lang/` changes need a reload; `module.json` changes need a Foundry restart.
