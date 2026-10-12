# Pentaryn Movement (`pentaryn-movement`)

**Read this when:** a player's token is stuck under someone else's, a player wants to walk through
a wall while exploring, ghost movement needs switching off for a scene, or you are changing or
calling `pentaryn-movement`. **Not this file:** how every addon is built →
`context/foundry/addon-blueprint.md` · the migration record →
`context/plans/addon-blueprint-2026-10/migrate-pentaryn-movement.md`

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

**GM control.**

- *Settings → Pentaryn Movement → Player ghost movement*: **Off** (no button), **Exploration only**
  (default: off while a combat runs on the scene), **Always allowed**.
- **GM toolbar button** (token tools, next to core's own ghost): pressed = players may ghost. Click
  it to turn ghost off for everyone; click again to restore the previous mode.
- **"A combat is running on the scene"** = an **active** encounter linked to the scene that has a
  combatant or has started, or an unlinked one with a combatant standing there. An empty encounter
  does not count, and **hidden combatants don't count** (a hidden ambush tips no one off).

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

`status().settings` lists the same keys with their scopes.

## API — game.pentaryn.movement

Canonical: `game.modules.get("pentaryn-movement").api`; `game.pentaryn.movement` is the same
frozen object. Ask it what it offers: `game.pentaryn.movement.describe()` (offline:
`test/golden/describe.json`). Every row except `selftest` is `legacy` (today's signatures).

| Method | GM | Writes | Returns |
|---|---|---|---|
| `status(opts?)` | — | — | policy, `combatOnScene`, allowed and why not, the player's switch, `patched.{drag,keyboard}`, then `sceneId`, `version`, `settings` (key → scope). `opts.sceneId` asks about another scene (default: the viewed one) |
| `ghostFor(token)` | — | — | is ghost in effect for that placeable on this client |
| `combatActive(sceneId?)` | — | — | does a combat stop ghosting there |
| `setGhost(on)` | — | client setting `ghost` | the player's button. **Player clients only:** on a GM client (and so from the MCP bridge) it changes nothing for players |
| `setPolicy(value)` | yes | world settings `ghostPolicy`, `ghostPolicyLast` | `"off" \| "exploration" \| "always"`; rejects with `Error("GM only")` on a player client |
| `pinsUnderTokens(scene?)` | — | — | map pins whose centre sits under a visible token, player-owned first (pins belong **beside** tokens: owned-on-top makes a pin under your token unclickable) |
| `selftest()` | — | — | `{ ok, checks }` |

Kit members: `describe()`, `version`, `contract`, `settings()`, `trace()`, `uninstall()`.
`core` is the pure module (`movement-core.mjs`), published as a frozen copy. No queries.

## Data written

None on documents. Settings only: the world settings `ghostPolicy` / `ghostPolicyLast` (GM) and the
client settings `ghost` and `ownedOnTop` (each player, for themselves).

## Flags other modules read

n/a — movement writes and reads no flags.

## Events

Emits none of its own. The kit fires two hooks at publish: `pentaryn-movement.ready` `(api)` and `pentaryn.ready` `("movement", api, { when: "ready" })`.

Listens to (pinned in `test/golden/hooks.json`, in this order): `init` (once), `setup` (once),
`getSceneControlButtons`, `renderSceneControls`, `drawTokenLayer`, `canvasReady`, `refreshToken`,
`updateActor`, `updateToken`, `createCombat`, `updateCombat`, `deleteCombat`, `createCombatant`,
`updateCombatant`, `deleteCombatant`, `ready` (once).

## Patches and adjustments

| Patch (`describe().patches`) | Adjustments row | What |
|---|---|---|
| `Token#_getDragConstrainOptions` | `movement-drag-constrain-ghost` | adds the three flags to a ghosting player's drag |
| `TokenLayer#_prepareKeyboardMovementUpdates` | `movement-keyboard-constrain-ghost` | the same for arrow keys (reads the private result shape `result[1].movement[id].constrainOptions`) |
| `TokenLayer.objects#sortChildren` | `movement-layer-sort-owned` | core's interaction sort plus the owned rank (reads `_lastSortedIndex`) |

All three carry the `__pentarynMovement` marker and go through the kit (`wrapMethod`, and
`defineAccessor` for the sort, an instance property on each canvas draw's container).

## Two sessions / who writes

Client-only: nothing is elected and nothing runs on one client for everyone. Each client decides
ghost and the sort for its own user. A player's client clears its own `ghost` setting when ghost
stops being allowed; only a GM writes the world settings.

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
- Errors in the two per-frame hooks (`refreshToken`, `renderSceneControls`) are warned once per
  session, then suppressed.

## Files

| File | Role |
|---|---|
| `movement.mjs` | entry: wiring only (lifecycle, publish) |
| `movement-core.mjs` | pure rules, constants, label key maps |
| `settings.mjs` | the `SETTINGS` table |
| `combat-adapter.mjs` | combats and scenes → plain core inputs |
| `ghost.mjs` | the feature: patches, sort, toolbar, refresh |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `styles/movement.css` | the dimmed combat badge (`.pm-blocked`) |
| `lib/` | the vendored kit (`vendor.py`; never edited here) |

## Tests

`node test/run.mjs` from this folder: core rules, the glue driven through its hooks and settings
(frozen characterisation from the migration checkpoint), the hook manifest, patch records, the API
goldens, i18n keys and logging. Fixtures are synthetic, because `test/` is published with the
module. One golden: `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, then review the diff.

**Verify live (as a player):**

1. Policy *Exploration only*, no combat: the ghost button shows; turning it on makes your tokens
   translucent, and a drag goes straight through a wall and through a hostile creature.
2. Start a combat with a combatant on the scene: the button switches off with a toast, is dimmed,
   and a drag stops at walls. An encounter holding only a **hidden** combatant changes nothing;
   revealing it switches ghost off.
3. GM clicks the GM button: the players' buttons disappear; click again and they come back.
4. Two tokens overlapping: the player's own is drawn on top and takes the click; for the GM nothing
   changed.
5. `game.pentaryn.movement.selftest().ok` is true.

## Sync

`.mjs`, `.css` and `lang/` changes need a reload; `module.json` changes need a Foundry restart.
