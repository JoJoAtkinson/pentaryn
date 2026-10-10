# Pentaryn Movement

**Read this when:** a player's token is stuck under someone else's, a player wants to walk through
a wall while exploring, or ghost movement needs switching off for a scene.

Built from the 2026-10-08 table feedback (plan item C2, `context/plans/table-feedback-2026-10-08.md`).

## Owned tokens on top (players only)

- On a player's screen, **their own tokens are drawn above everyone else's** and take the click
  when tokens overlap. So you can always see and grab your own token, even when a friend's sits
  on top of it.
- **Client-side only.** Nothing is written to the scene, and other players see their own tokens
  on top on their own screens. The GM is never affected.
- **Elevation still wins.** A flying creature above you is still drawn above you.
- **How:** the token mesh's sort is lifted for owned tokens (what is drawn on top), and the token
  layer's child order puts owned tokens last (what takes the click). Both are reapplied on every
  token refresh.
- Per-player switch: *Settings → Pentaryn Movement → Show my own tokens on top* (default on).
- ⚠ **Pins under tokens.** With owned-on-top, a story pin under a player's own token can no longer
  be clicked at all. The placement rule is that pins sit **beside** tokens, never under them.
  Check a scene with `game.pentaryn.movement.pinsUnderTokens()`: it lists every pin whose centre is
  inside a visible token, with player-owned tokens first.

## Ghost movement (players)

- **The ghost button** (a ghost icon) in the player's token tools, just under the Ruler.
  Click it to move your own tokens **through walls, doors and other creatures**. Click again to walk
  normally. Each player switches it for themselves.
- **You can see it's on:** the button is pressed, its tooltip says *Ghost movement: ON*, and your
  own tokens look see-through.
- Works for dragging and for arrow-key movement.
- **Watch-out (accepted by Joe):** walking through a wall puts your token's vision on the other side.
  The GM switch below is the remedy for a scene where that matters.

### How it works

It reuses core's own mechanism and reimplements no collision. The GM's *Unconstrained Movement*
tool works by passing constrain options into the move:

| Option | Where it is honoured |
|---|---|
| `ignoreWalls`, `ignoreCost` | core `Token#constrainMovementPath` (`client/canvas/placeables/token.mjs:2943`) |
| `ignoreTokens` | dnd5e `Token5e#constrainMovementPath` (creature blocking, `movementAutomation: full`) |

Core only offers those flags to the GM, in `Token#_getDragConstrainOptions` (`token.mjs:4923`, which
dnd5e overrides the same way). This module wraps that method and `TokenLayer#_prepareKeyboardMovementUpdates`,
and adds the three flags when ghost is in effect for that token: a player, owner of the token, with
the button on, and allowed by the GM policy.

**dnd5e 6 (0.1.1).** 6.0 adds `Token5e#findMovementPath`, which pads the path with a waypoint
before each blocking creature and does not read `ignoreTokens`. That only adds stops; the block itself
is still `Token5e#constrainMovementPath`, which honours `ignoreTokens`, so ghost needs no change.
Verify live: ghost on, a player drags through a wall and a creature; ghost off, both block.

**No GM relay is needed.** Neither core nor the server refuses a player's unconstrained move. The
constraint runs on the mover's own client (`TokenDocument#preUpdateMovement` passes the mover's
`constrainOptions` straight into `constrainMovementPath`, `client/documents/token.mjs:1723/1813`).
The server's `Token#_preUpdate` only checks that the destination matches the update and the origin
matches the current position. It never looks at walls. *Verify live as a player.*

## GM control

- **World setting** *Settings → Pentaryn Movement → Player ghost movement*:
  - **Off**: no ghost button for players.
  - **Exploration only** (default): the button switches off while a combat is running on the scene.
  - **Always allowed**: combat or not.
- **GM toolbar button** (token tools, next to core's own ghost): pressed = players may ghost. Click
  it to turn ghost **off for everyone** on the fly, for example a tense out-of-combat scene. Click
  again to restore the previous mode (Exploration only or Always allowed). Its tooltip names the
  current mode.
- **"A combat is running on the scene"** means an **active** encounter that is linked to this scene
  and has a combatant or has started, or an unlinked one with a combatant standing on this scene. An
  empty encounter made by mistake does not switch ghost off. **Hidden combatants don't count**, so
  adding a hidden ambush to the tracker doesn't tip the players off; revealing one, or starting the
  combat, does.
- When ghost stops being allowed (a fight starts, or the GM turns it off), each player's button is
  **switched off**, with a toast. It does not come back by itself after the fight; the player
  clicks it again. During the fight the button stays visible but dimmed, with a small swords
  badge, and clicking it explains why it's off.

## Console (`game.pentaryn.movement`)

- `status()`: policy, combat on this scene, allowed and why not, the player's switch, whether the
  core methods were wrapped (`patched.drag`, `patched.keyboard`).
- `ghostFor(token)`: is ghost in effect for that placeable on this client.
- `combatActive(sceneId?)`: does a combat stop ghosting there.
- `setGhost(true|false)`: same as the player's button.
- `setPolicy("off"|"exploration"|"always")`: GM only.
- `pinsUnderTokens(scene?)`: the D5 placement check.
- `core`: the pure module.

## Settings

| Key | Scope | Default | |
|---|---|---|---|
| `ghostPolicy` | world | `exploration` | Off / Exploration only / Always allowed |
| `ghostPolicyLast` | world, hidden | `exploration` | the mode the GM button restores |
| `ghost` | client, hidden | `false` | this player's button |
| `ownedOnTop` | client | `true` | owned tokens on top |

## Tests

`node test/run.mjs`: the policy (combat detection, the three modes, the GM flip and what it
restores, when a player's switch is cleared), the constrain options, the owned-on-top sort keys,
and the pins-under-tokens check. Fixtures are synthetic, because `test/` is published with the
module.

## Verify live (as a player)

1. With the policy on *Exploration only* and no combat, the ghost button shows; turning it on makes
   your tokens translucent and a drag goes straight through a wall and through a hostile creature.
2. Start a combat with a combatant on the scene: the button switches off with a toast, is dimmed,
   and a drag stops at walls again. Before that, an encounter holding only a **hidden** combatant
   changes nothing on the player's screen; revealing it switches ghost off.
3. GM clicks the GM button: the players' buttons disappear; click again and they come back.
4. Two tokens overlapping: the player's own is drawn on top and takes the click; for the GM nothing
   changed.
5. `game.pentaryn.movement.status().patched` is `{drag: true, keyboard: true}`.
