---
title: "Spell areas, saves and damage (pentaryn-aoe)"
status: active
last_modified: 2026-10-19
tags: [context, foundry, dnd5e, module]
---

# Spell areas, saves and damage — `pentaryn-aoe`

**Read this when:** a spell circle/cone won't move or delete, "damage isn't being rolled", or a
save spell should roll the monsters' saves and apply full/half damage.
**Not this file:** how it was designed and why → [`../plans/aoe-circles.md`](../plans/aoe-circles.md) ·
module internals → [`../../foundry/module/pentaryn-aoe/README.md`](../../foundry/module/pentaryn-aoe/README.md)

## At the table

**Moving and deleting an area.** Every spell area (a dnd5e template, which is a Region on v14)
gets a small target-icon **handle token** at its centre. For cones and lines it sits at the caster's end.
Everyone owns the handle and the area.
- Drag the handle to move the area. It ignores walls (movement action *displace*). When the area's
  centre is a grid corner (a 20 ft cube, a Fireball), the handle sits in the square just below and to
  the right of that corner, a quarter square off-centre. Core snaps a half-square token only to spots
  inside one square, so a handle centred on a corner was knocked off the grid by the first drag
  and the area could never be put back on it.
- Delete the handle and the area goes with it. Delete the area and the handle goes too.
- The **eraser icon** next to *Place Template* on the spell's chat card ("Remove all templates")
  deletes that spell's areas on the scene you are viewing.
- A lasting **emanation** (Spirit Guardians) gets no handle: dnd5e 6 attaches it to the caster's token,
  so it moves with the caster. The caster's **Token HUD** (right-click the token) then has an eraser
  button, *Remove the spell areas on this token*.
- An **instantaneous** emanation (Thunder Step, Thunderclap, Word of Radiance) stays where it was
  cast, with a handle like any other area. It does not follow the caster. Only a **spell** is left
  behind: a monster's aura that dnd5e also marks instantaneous (a ghast's Stench) keeps following
  its creature.
- Areas clean themselves up. An instantaneous spell's area (Fireball) is deleted once every ticked
  row has been applied. A concentration spell's areas go when the caster stops concentrating.

**Which walls stop an area.** The PHB's rule is that an area spreads from its point of origin, and
only total cover blocks it. On the map, total cover is a wall that blocks **both movement and
sight**: normal walls, closed doors, terrain walls and windows clip an area. **Invisible walls**
(move-only: a bridge's sides, a ledge, tables and furniture) and see-through walls never clip one.
The same rule applies to every spell, physical or not. A cube is measured from its centre, a cone or line
from its point, and a sphere or emanation from its centre. dnd5e on its own clips every area with
every wall that blocks movement. The setting *Walls that stop a spell area* can turn that back on
(`move`) or turn clipping off (`none`). Changing the setting re-clips the areas on the level each
connected user is viewing; an area on a scene nobody is viewing keeps its old outline until it is
moved or its scene is viewed and a wall there changes. A cube that is rotated (Shift- or Ctrl-scroll
its handle) or resized is clipped from its new centre.

**Cancelling a placement.** While a template follows the mouse, **Escape or right-click** cancels it,
on the first press even when the sheet you cast from is open. Core's own Escape would close every open
window first (dnd5e minimises the sheet during placement), so the module keeps a small Escape binding
that cancels core's region placement before anything else (`escape.mjs`).

**Save spells (Fireball, Toll the Dead…).** Click **Damage** on the card as usual. The GM's client then:
1. lists the creatures **inside the area**. If there is no area, it uses the roller's targets.
   Handles, item piles, and crowd or marker actors (max HP 0) are skipped. The caster, hidden
   tokens and anyone at 0 HP are listed but unticked;
2. rolls every monster's save **GM-only**, so players never see the totals;
3. posts one **request card** for the player characters. Each player sees only their own
   button and rolls with the normal dialog, so advantage and bonuses are theirs to set. A save
   rolled from the card's own "DC 17 DEX" button counts too;
4. shows the GM a **tray** under the damage roll, below dnd5e's own damage tray. Each row has a tick, the save result, a
   multiplier (×0 ¼ ½ 1 2), and the damage after resistances. The tray buttons are
   **Re-roll NPC saves**, **Ping players** and **Apply N**.
   The per-row dice icon re-rolls one monster. The shield icon rolls a save for an absent player.

Every save is threaded under the spell's card the way dnd5e's own save button threads it, so the
card's outcomes and dnd5e's damage tray (its half-damage pill) agree with this tray.
Nothing is applied until **Apply** is pressed. Rows still waiting are skipped, and pressing
Apply again later applies only the rows that have resolved since. A second Damage click on the
same area greys out the older tray ("superseded"), so the same area can't be applied twice.
The tray has no rule for Legendary Resistance, Evasion or cover. Set the multiplier on that row by hand.

**Attacks.** When an attack roll hits, damage is rolled straight away on the attacker's own
client. It also rolls when the target's AC is unknown, for example with no target selected.
A known miss or a natural 1 rolls nothing. The card's Damage button still works.
Players can't see hit/miss while `dnd5e.attackRollVisibility` is `"none"`. Setting it to
`"hideAC"` shows hit/miss without the AC. That is Joe's call; this module does not change it.

**Careful Spell.** Metamagic is tracked, not forced onto a spell (Joe's ruling, 2026-10-12). When a
sorcerer uses Careful Spell, a picker opens on their screen: the creatures on their scene by token
name, with whatever they have targeted already ticked, up to their Charisma modifier (minimum one).
A public chat card says `<caster token> uses Careful Spell: <token names>`. Their next spell that calls for a
save marks exactly those creatures *protected* in its tray: an automatic success, and no damage on
a half-damage spell. They get no request card. Then it ends; re-rolling that spell's damage keeps
it. A spell with no save (Shield) leaves it waiting, there is no time window, and using Careful
Spell again replaces the choice. The GM can protect or unprotect any row with its shield in the
tray: unprotected, the row gets back its own save, or a monster rolls one and a player waits.

**What the player sees.** The caster gets one line under their own damage card: waiting for the
GM, applied, or re-rolled. Monster save numbers never show, and the GM-only monster save rolls are
hidden from players' chat instead of showing as "privately rolled".

**Effects meant for you.** A card whose only target is the caster (Mage Armor on yourself), or a
spell that only affects its caster (Shield), puts its effect on the caster straight away. A touch
spell for one willing creature cast with nothing targeted goes on the caster too. A card with
several effects (Guidance's skills) is a choice and stays in the tray. An Effects tray nobody has
applied yet is outlined "Not applied yet" for an hour. The same spell's effect from another source
replaces the old one instead of stacking.

**Cancelling refunds the cast (Part F).** When an area placement is cancelled (Escape or
right-click), the slot, charge or uses it spent come back, the concentration it began ends, and its
card is removed, as the card's Refund button would.

**Self cones and lines start at the caster (Part G).** Placing a Self-range cone or line (Cone of
Cold, Burning Hands, Lightning Bolt) keeps its point on the caster's token edge and turns it toward
the mouse; click to cast. With the setting off, core's placement applies: the point follows the
mouse and the wheel turns it.

## Settings (world, Configure Settings → Pentaryn AoE)

| Setting | Default | |
|---|---|---|
| Area handles | on | handle token per area |
| "Remove all templates" icon | on | on spell cards |
| Remove instantaneous areas after Apply | on | |
| Remove areas when concentration ends | on | |
| Saves from the area | on | the whole Part B pipeline |
| Monster save visibility | GM only | `gm` · `blind` · `public` (core v14 message modes; a stored `gmroll` is migrated on the GM's ready) |
| Apply monster damage automatically | off | PCs always wait for Apply |
| Ask players to roll | on | the request card |
| Roll damage on a hit | on | pentaryn-combat reads it too |
| Apply self-cast effects automatically | on | the caster's one effect goes on straight away |
| Highlight effects not yet applied | on | cards under an hour old |
| Careful Spell protects the creatures the player chooses | on | |
| Refund a cancelled area | on | Part F |
| Tell the caster when damage is waiting for the GM | on | also hides GM-only monster saves from players |
| A touch spell cast at nobody goes on the caster | on | off: it waits in the GM's effects tray |
| The same spell does not stack | on | |
| Self cones and lines start at the caster | on | Part G |
| Instantaneous areas stay where they were cast | on | Thunder Step's ring stays behind with a handle |
| Walls that stop a spell area | Total cover | `cover` · `move` (dnd5e's default) · `none`; Part H |

## Console (`game.pentaryn.aoe`)

Every method, with its arguments, return shape, null cases and who may call it, is in the
[module README's API table](../../foundry/module/pentaryn-aoe/README.md#api--gamepentarynaoe);
`describe()` prints the same from the manifest. The ones you reach for:

```js
game.pentaryn.aoe.summary(messageId)    // a damage message's tray as plain data (who is in, saves, multipliers)
game.pentaryn.aoe.inspect(ref)          // aoe state of a token, actor or chat message; { as: user } = that user's view
game.pentaryn.aoe.describe()            // every method, setting and hook this module has
game.pentaryn.aoe.sweep(canvas.scene)   // repair: orphan handles out, ownership + handles onto every template region
game.pentaryn.aoe.areasFor(activityUuid, scene)
game.pentaryn.aoe.removeArea(regionIds, scene)
game.pentaryn.aoe.resolve(messageId)    // (re)build the tray on a damage message
game.pentaryn.aoe.applyRows(messageId[, rowIds])
```

## Gotchas

- **Two GM tabs are fine** (the bridge tab plus your own). One of them does the work: one handle per
  area, one save per monster, one request card. A tab that was open before a module update keeps
  the old code until it is reloaded, and until then it can still add a second handle or save.
- **Needs the GM online.** No sockets are used. With no GM connected, saves aren't rolled and
  nothing is applied. Moving and deleting areas still works.
- **Every client needs the module**, because each player's own client creates the handle,
  answers the request card and auto-rolls damage. Without it on a client, the GM
  backstop adds the handle about 2.5 s later, and `sweep` repairs the rest.
- **Startup sweep.** On ready, and on every scene change, the GM's client deletes handles whose
  area is gone. It also gives *existing* template regions shared ownership and a handle. So
  leftover areas from before the module was installed get handles the first time their scene is viewed.
- **A moved area needs Damage clicked again.** Containment is read when the damage is rolled.
- The handle is one shared world actor, **"Area handle"**, in `Scene Props`. The module creates it
  on the GM's first ready. Don't delete it; if you do, it is recreated. It is `tiny`, hovers, and its
  tokens carry `flags.dnd5e.lockSize` (the GM's ready and `sweep` keep it so), because dnd5e 6
  `tokenSizeSync` would otherwise resize the 0.5 handles and `movementAutomation` mark them Falling.
  The handle goes on the level the area was placed on (dnd5e 6 regions carry the viewed level and no
  elevation), at that level's base elevation.
- Concentration damage still triggers dnd5e's own concentration-check prompt for a concentrating PC. That is expected.

Install: `make foundry-aoe-check` / `make foundry-aoe-sync`. A **first install needs a server
restart**, because `Data/modules` is scanned at startup. `core.moduleConfiguration["pentaryn-aoe"]`
is already set to `true`, so it loads enabled after that restart.
