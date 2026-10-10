# Pentaryn Creatures

**Read this when:** a player can't find a creature they control (a summon, familiar, skeleton,
Arcane Eye, steed), a creature glows when it shouldn't (or doesn't when it should), or the
"Your creatures" strip is missing or wrong.

Table feedback 2026-10-08, item C3. Three parts, one module:

## 1. Creature light

Every token a player controls whose actor is a creature gets a small bright light, so it never
disappears in the dark and the player can see where to click.

- **Who gets it:** the actor is type `npc` and some non-GM user owns it (`actor.hasPlayerOwner`).
  That covers summons, familiars, Animate Dead skeletons, Arcane Eye and steeds.
- **Who never does:**
  - Player characters (`character`). That includes a Wild Shape or Polymorph form of a PC,
    because dnd5e keeps the actor type on the transformed copy. Lighting the PC would make
    darkness meaningless.
  - Groups, vehicles, and Item Piles piles.
  - `pentaryn-aoe` spell-area handles ("Area handle", flagged `pentaryn-aoe.handle`). That actor
    is an `npc` with `ownership.default: OWNER`, so every player owns every handle; without this
    exclusion every spell template would glow and show up in every player's strip.
- **Never replaces a light.** A creature that already has a light (a torch, a flame sphere, a light
  set by hand, a `pentaryn-senses` item light) is left alone.
- **Only removes its own light.** The light we set is recorded in
  `flags.pentaryn-creatures.light = {bright, dim}`. When the creature stops qualifying (ownership
  removed, setting turned to 0), the light is set back to 0 only if it is still exactly what we
  wrote.
- **Someone else's light wins.** If our light is replaced by another (a torch picked up, a light
  set by hand), we drop the flag and leave that light alone. If the creature goes dark again later
  (the torch is dropped), it gets the creature light back.
- **Switching it off by hand sticks.** Set a creature's light to 0 in Token Config and the flag
  becomes `false`: the module never lights that token again. To hand it back, run
  `token.document.unsetFlag("pentaryn-creatures", "light")` as the GM.
- **Written by the active GM's client only.** It runs on `ready` (every scene), on token create,
  and on token updates that touch light, actor, delta or flags. It also runs on actor ownership
  changes and on user role changes. Plain movement is ignored. Players never write anything.
- **Setting: Creature light (ft)**, world, default **5**. Foundry v14 measures token light from
  the token's **edge** (`Token#getLightRadius` adds `externalRadius`), so 5 ft also lights the
  ring of squares around the creature. **0.5** lights little more than its own square. **0**
  removes every light this module added.
- A token the GM has hidden casts no light (core rule). Its light comes back when it is revealed.

## 2. Owners always see their own tokens

A token you own stays drawn on your screen even when nothing you control can see it. Example: an
Invisible Arcane Eye in darkness, while you have your PC selected.

- **How:** `Token#isVisible` is wrapped on every client. It goes through libWrapper when that is
  active, and otherwise patches the getter directly. Core's answer is used first. Only when core
  says "not visible" do we add **true** for a token the user owns. The override never takes
  anything away.
- **Still hidden:**
  - tokens the GM hid
  - the token-config preview
  - filtered-out tokens
  - tokens on another level (`_testCulled`)
  - everything, for the GM (the GM path is untouched)
  - `pentaryn-aoe` spell-area handles (everyone owns them; in the dark they would show the spell's
    name on hover)
- An Invisible token still renders with core's invisibility shimmer, so the owner can tell it is
  invisible.
- **Setting: Players always see their own tokens**, world, default on.
- Everything else that asks `Token#isVisible` follows from this, `pentaryn-ties` "can I see it"
  included. That only ever concerns tokens the player owns.

## 3. "Your creatures" strip

A row of round portraits just above the hotbar. Each one is a token the player owns on the scene
they are looking at.

- **Click:** selects that token and pans to it. Shift-click adds it to the selection. If another
  layer was active, the token layer is switched on first.
- **Double-click:** opens that token's sheet.
- **Hover:** shows the name and both gestures.
- **Order:** the player's own character comes first, gold ring. A Wild Shape form of it
  (`flags.dnd5e.originalActor`) also counts as the character. Then any other characters they own,
  then everything else, each group by name.
- **When it shows:** only to players, and only while they own **2 or more** tokens on the scene. A
  player with just their PC sees nothing.
- **Left out:** GM-hidden tokens, Item Piles piles, `pentaryn-aoe` spell-area handles, tokens
  without an actor.
- **Nothing is stored.** The list is computed from the scene every time it draws. It redraws on
  token create, delete and update, on scene change (`canvasReady`), on actor
  ownership/name/image changes, and on the user's character change. A token that only moved
  doesn't rebuild it (signature check). A dismissed, killed or deleted summon simply stops being
  there.
- The selected token's portrait has an orange glow.
- **Client setting: Show the "Your creatures" strip**, default on.

## Console (`game.pentaryn.creatures`)

- `list(user?, scene?)`: the strip's entries for a user. Run it as the GM with a player's `User`
  to check what they'd see.
- `render()`: force a redraw.
- `isCreature(tokenDoc)`: would this token get the light?
- `syncScene(scene)`, `syncAll()`: active GM only. Re-run the light pass. Returns how many tokens
  were written.
- `ownerSees(token)`: would the override show this placeable to me?
- `patchedWith()`: `"libWrapper"`, `"direct"` or `null` (the patch failed; see the console).
- `core`: the pure module.

## Tests

`node test/run.mjs` covers `creatures-core.mjs`:

- who qualifies for the light (spell-area handles never do)
- the light update in every state (lit, ours, hand-edited, switched off by hand, unowned,
  setting 0, idempotent after our own write)
- the owner-sees rule
- strip order and filtering
- the 2+ threshold

The fixtures are synthetic, because `test/` ships with the module.

## dnd5e 6

0.1.1 declares dnd5e 6.0 (verified 6.0.6). Nothing it reads moved: the actor `type`,
`flags.dnd5e.originalActor` on a transformed copy, and core `Token#isVisible` (dnd5e 6
`Token5e` does not override it, so the libWrapper target is unchanged). The light is a token
`light`, not vision, so dnd5e 6's `senseVisionSync` does not touch it.

## Install

`foundry/module/pentaryn-creatures/` is the source. The first install needs a Foundry restart
(module.json is read at startup). After that, enable the module in the world and reload.

**Turning it off:** set *Creature light (ft)* to **0** first, with the GM logged in, and only then
disable the module. The lights are written to the tokens, so a disabled module leaves every one
of them burning.
