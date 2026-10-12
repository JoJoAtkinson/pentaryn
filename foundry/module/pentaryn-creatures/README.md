# Pentaryn Creatures

**Read this when:** a player can't find a creature they control (a summon, familiar, skeleton,
Arcane Eye, steed), a creature glows when it shouldn't (or doesn't when it should), or the
"Your creatures" strip is missing or wrong.

Table feedback 2026-10-08, item C3. Three parts, one module: a creature light, owners always see
their own tokens, and the "Your creatures" strip.

## What the player sees

### Creature light

Every token a player controls whose actor is a creature gets a small bright light, so it never
disappears in the dark and the player can see where to click.

- **Who gets it:** the actor is type `npc` and some non-GM user owns it (`actor.hasPlayerOwner`).
  That covers summons, familiars, Animate Dead skeletons, Arcane Eye and steeds.
- **Who never does:**
  - Player characters (`character`). That includes a Wild Shape or Polymorph form of a PC,
    because dnd5e keeps the actor type on the transformed copy. Lighting the PC would make
    darkness meaningless.
  - Groups, vehicles, and Item Piles piles.
  - `pentaryn-aoe` spell-area handles. That actor is an `npc` with `ownership.default: OWNER`, so
    every player owns every handle; without this exclusion every spell template would glow and
    show up in every player's strip.
- **Never replaces a light.** A creature that already has a light (a torch, a flame sphere, a light
  set by hand, a `pentaryn-senses` item light) is left alone.
- **Only removes its own light.** When the creature stops qualifying (ownership removed, setting
  turned to 0), the light is set back to 0 only if it is still exactly what we wrote.
- **Someone else's light wins.** If our light is replaced by another (a torch picked up, a light
  set by hand), we drop the flag and leave that light alone. If the creature goes dark again later
  (the torch is dropped), it gets the creature light back.
- **Switching it off by hand sticks.** Set a creature's light to 0 in Token Config and the flag
  becomes `false`: the module never lights that token again. To hand it back, run
  `token.document.unsetFlag("pentaryn-creatures", "light")` as the GM.
- **When it updates:** on `ready` (every scene), on token create, and on token updates that touch
  light, actor, delta or flags; on actor ownership or type changes; on user role changes. Plain
  movement is ignored. Changes are gathered and written at most 200 ms after the first one.
- Foundry v14 measures token light from the token's **edge** (`Token#getLightRadius` adds
  `externalRadius`), so 5 ft also lights the ring of squares around the creature.
- A token the GM has hidden casts no light (core rule). Its light comes back when it is revealed.

### Owners always see their own tokens

A token you own stays drawn on your screen even when nothing you control can see it. Example: an
Invisible Arcane Eye in darkness, while you have your PC selected.

- Core's answer is used first. Only when core says "not visible" do we add **true** for a token the
  user owns. The override never takes anything away.
- **Still hidden:** tokens the GM hid; the token-config preview; filtered-out tokens; tokens on
  another level (`_testCulled`); everything, for the GM (the GM path is untouched);
  `pentaryn-aoe` spell-area handles (everyone owns them; in the dark they would show the spell's
  name on hover).
- An Invisible token still renders with core's invisibility shimmer, so the owner can tell it is
  invisible.
- Everything else that asks `Token#isVisible` follows from this, `pentaryn-ties` "can I see it"
  included. That only ever concerns tokens the player owns.

### "Your creatures" strip

A row of round portraits just above the hotbar. Each one is a token the player owns on the scene
they are looking at.

- **Click:** selects that token and pans to it. Shift-click adds it to the selection. If another
  layer was active, the token layer is switched on first.
- **Double-click:** opens that token's sheet. **Hover:** the name and both gestures.
- **Order:** the player's own character comes first, gold ring. A Wild Shape form of it
  (`flags.dnd5e.originalActor`) also counts as the character. Then any other characters they own,
  then everything else, each group by name. The selected token's portrait has an orange glow.
- **When it shows:** only to players, and only while they own **2 or more** tokens on the scene.
- **Left out:** GM-hidden tokens, Item Piles piles, `pentaryn-aoe` spell-area handles, tokens
  without an actor.
- **Nothing is stored.** The list is computed from the scene every time it draws. It redraws on
  token create and delete, on token updates that change its name, image, hiding, actor (id, link
  or delta) or flags (not on a move), on scene change (`canvasReady`), on actor
  ownership/name/image changes, and on the user's character change. A dismissed, killed or deleted summon simply stops being there.
- **Over the Combat HUD (U-6-12):** while Argon's HUD is up it covers the hotbar, so the strip
  floats 8 px above the HUD's action bar, left-aligned with it, and drops back above the hotbar
  when the HUD closes. It looks twice a second, only while the strip is up, `floatOverHud` is on
  and Argon is enabled.

## Settings

| Setting | Key | Scope | Default | What |
|---|---|---|---|---|
| Creature light (ft) | `lightRadius` | world | 5 | bright = dim radius; **0.5** lights little more than its own square; **0** removes every light this module added |
| Players always see their own tokens | `ownerSees` | world | on | the owner override |
| Strip floats above the Combat HUD | `floatOverHud` | world | on | float over Argon's HUD while it is open; off: stays above the hotbar |
| Show the "Your creatures" strip | `showStrip` | client | on | this client's strip |

Every read is live: a change applies without a reload. Labels: `PENTARYN_CREATURES.settings.<key>.name/hint`.

## API — game.pentaryn.creatures

Also `game.modules.get("pentaryn-creatures").api`; published at `ready`, frozen, with the kit's
`describe()`, `version`, `contract`, `settings()`, `trace()`, `uninstall()`.

- `list(user?, scene?)` → `{ id, name, img, rank }[]`: the strip's entries for a user (default this
  client's) on a scene (default the viewed one). Run it as the GM with a player's `User` to check
  what they'd see. `[]` without a scene.
- `render()`: force a redraw of this client's strip.
- `isCreature(tokenDoc)` → boolean: would this token get the light?
- `syncScene(scene, ids?)` → `Promise<number>`, `syncAll()` → `Promise<number>`: active GM client
  only (0 elsewhere). Re-run the light pass; resolves to how many tokens were written. `ids` may be
  an array, a Set, one id or token documents (`[]` = none; omitted = every token).
- `ownerSees(token)` → boolean: would the override show this token to me? A placeable or its
  TokenDocument (a document with no placeable on the viewed scene: `false`).
- `patchedWith()` → `"libWrapper"`, `"direct"` or `null` (the getter was not found; see the console).
- `status()` → `{ patchedWith, ownerSees, lightRadius, showStrip, floatOverHud, writer, lit, version }`:
  one read of this client's state — `writer` is whether this client writes the lights (the active
  GM), `lit` how many tokens on every scene carry our light flag.
- `inspect(ref, { sceneId?, as? })` → `{ token, actorType, qualifies, light, ourLight, switchedOff,
  ownerSees, inStrip }`: one token (a document, placeable, uuid, id or exact name; a miss throws
  `NOT_FOUND`), read-only. `as` (a user ref) picks whose strip `inStrip` answers for; `ownerSees` is
  always this client's answer.
- `core`: a frozen copy of the pure module.

Nothing in the API is GM-only to read; the two writers do nothing off the active GM's client.

## Data written

| Where | What |
|---|---|
| token `light.bright`, `light.dim` | the creature light (bright = dim = `lightRadius`), or 0 when we take ours away |
| token `flags.pentaryn-creatures.light` | `{bright, dim}` — the light we set · `false` — switched off by hand, never relit · `null` — not ours |

Our writes carry the update option `{ pentarynCreatures: true }`, so our own `updateToken` hook
skips them.

## Flags other modules read

This module reads, never writes, these foreign flags (`describe().flags.reads`):

| Flag | Owner | Why |
|---|---|---|
| `flags.pentaryn-aoe.handle` (token), `flags.pentaryn-aoe.handleActor` (actor) | pentaryn-aoe | a spell-area handle is a prop, not a creature (a hand copy of aoe's `isHandleTarget`, without its `doc.token` branch: `isAoeHandle` in core) |
| `flags.item-piles.data.enabled` (token or actor) | Item Piles | piles get no light and no portrait (`isItemPile`) |
| `flags.dnd5e.originalActor` (actor) | dnd5e | a Wild Shape form ranks as its PC in the strip |

**Other writers of `token.light`:** pentaryn-senses (`itemLight` / `itemLightPrior`), and
transform's Starry Form light through senses. Each module owns its light through its own flag; see
Pitfalls for the one hand-off that leaves a light behind.

## Events

Emits none of its own. The kit fires two hooks at publish: `pentaryn-creatures.ready` `(api)` and
`pentaryn.ready` `("creatures", api, { when: "ready" })`.

Listens to (pinned in `test/golden/hooks.json`, in this order): `createToken`, `updateToken`,
`updateActor`, `createUser`, `updateUser`, `deleteUser` (the light); `canvasReady`, `createToken`,
`deleteToken`, `updateToken`, `updateActor`, `updateUser`, `controlToken` (the strip); `init`,
`setup`, `ready`, `ready` (once each).

## Patches and adjustments

| Patch (`describe().patches`) | Adjustments row | What |
|---|---|---|
| `Token#isVisible` (getter) | `creatures-libwrapper` | libWrapper `WRAPPER` on `foundry.canvas.placeables.Token.prototype.isVisible` when lib-wrapper is active, else the getter is replaced on the prototype; marker `__pentarynCreaturesVisible`. Reads private `_preview._previewType`, `isFilteredOut`, `_testCulled()` |

Not patches, but registry rows too: the Argon DOM read in `strip.mjs` (`.extended-combat-hud
.action-hud`, `game.modules.get("enhancedcombathud")`) and the Item Piles flag read.

## Two sessions / who writes

- **The lights:** the active GM's client only (`isActiveGM()`, no fallback: lights wait until a GM
  connects). Players never write anything. Two tabs on the GM account both pass and may send the
  same update; that is harmless, because lightUpdate is idempotent (a re-run writes nothing).
- **Visibility and the strip:** every client patches `Token#isVisible` and draws its own strip; no
  writes. `floatOverHud` is a world setting, so a change re-places the strip on every client.

## Extending

1. A pure rule → `creatures-core.mjs`, with a case in `test/seams.test.mjs` or `test/core.test.mjs`.
   Every export of `creatures-core.mjs` is published as `api.core` and pinned in
   `test/golden/surface.json`, so a new export is an API addition (regenerate `surface.json` and
   declare it). Keep helpers that are not API module-private.
2. A hook → `reg.on(...)` inside the feature's `install()` (`light.mjs`, `creature-strip.mjs`,
   `owner-sees.mjs`); order matters: re-pin `hooks.json` only as a declared change.
3. A setting → a row in `settings.mjs` with literal `name`/`hint`; react through
   `ctx.onSettingChange(key, fn)`.
4. An API method → a row in `api-manifest.mjs` + its implementation in `api.mjs`, then
   `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review the diff.
5. Another module's flag → a predicate in core with its fixture, read through `tokens-adapter.mjs`,
   and a line in `MANIFEST.flags.reads` and the table above.

## Pitfalls

- **The orphan light (pentaryn-senses hand-off).** We light a summon 5/5; senses writes its item
  light over it, so we let go of our flag; senses later restores the prior 5/5 unflagged. Nobody
  owns that 5/5 now: if the summon stops qualifying, it keeps burning. Pinned as today in
  `test/golden/senses-handoff.json`; arbitration is a decision, not a bug fix.
- An owner-override failure (a core rename of a private field) answers `false` and warns once per
  session: `pentaryn-creatures | owner override failed`.
- **Turning it off:** set *Creature light (ft)* to **0** first, with the GM logged in, and only then
  disable the module. The lights are written to the tokens, so a disabled module leaves every one
  of them burning.
- dnd5e 6: nothing it reads moved (the actor `type`, `flags.dnd5e.originalActor`, core
  `Token#isVisible` — `Token5e` does not override it). The light is a token `light`, not vision, so
  `senseVisionSync` does not touch it.

## Files

| File | Role |
|---|---|
| `creatures.mjs` | entry: wiring only (features, lifecycle, publish) |
| `creatures-core.mjs` | pure rules and constants: the light, owner-sees, strip order, dock, seams |
| `settings.mjs` | the `SETTINGS` table, `setting()` |
| `tokens-adapter.mjs` | TokenDocument → plain summary (the foreign flag reads) |
| `light.mjs` | feature: the light queue and writer |
| `owner-sees.mjs` | feature: the `Token#isVisible` wrap |
| `creature-strip.mjs` | feature: when the strip redraws |
| `strip.mjs` | UI: the strip's DOM and the Combat HUD dock |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `styles/creatures.css` | the strip (`#pentaryn-creatures.pcr-strip`, `.pcr-*`) |
| `lib/` | the vendored kit (`vendor.py`; never edited here) |

## Tests

`node test/run.mjs` from this folder: the legacy core suite (`test/core-legacy.mjs`), core seams,
the glue driven through its hooks and settings on a GM and a player client (frozen
characterisation from the migration checkpoint, with each declared change's pin moved in its own
commit), the patch paths, the dock poll, the hook manifest, the API goldens, i18n keys and the CSS
scope. Fixtures are synthetic, because `test/` is published with the module. One golden:
`GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`, then review the diff. Gates:
`vendor.py check creatures`, `conformance.py --module creatures`.

**Verify live (as a player with two owned tokens):** the strip shows; an Invisible owned token
stays drawn; `game.pentaryn.creatures.status().patchedWith` is `"libWrapper"` or `"direct"`.

## Sync

`.mjs`, `.css` and `lang/` changes need a reload; `module.json` changes need a Foundry restart.
`foundry/module/pentaryn-creatures/` is the source; the first install needs a restart, then enable
the module in the world and reload.
