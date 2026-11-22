---
title: "Spell areas, saves and damage (pentaryn-aoe)"
status: active
last_modified: 2026-11-22
tags: [context, foundry, dnd5e, module]
---

# Spell areas, saves and damage — `pentaryn-aoe`

**Read this when:** a spell circle/cone won't move or delete, "damage isn't being rolled", a
save spell should roll the monsters' saves and apply full/half damage, a player's Apply did nothing
for an ally, "heal doesn't let me target", or a player wants to type the total from real dice.
**Not this file:** how it was designed and why → [`../plans/aoe-circles.md`](../plans/aoe-circles.md) ·
module internals → [`../../foundry/module/pentaryn-aoe/README.md`](../../foundry/module/pentaryn-aoe/README.md)

## At the table

**Moving and deleting an area.** Every spell area (a dnd5e template, which is a Region on v14)
gets a small target-icon **handle token** at its centre. For cones and lines it sits at the caster's end.
A wall spell (Wall of Stone's panels, all one area) gets one handle just before the start of its first panel
(a ring's: just outside it, to the east), never on the wall itself, whose real walls would hide it from
the players (0.8.1); dragging it moves every panel, deleting it deletes the whole wall.
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
  its creature, gets no handle and is not removed by any tray. Remove it with the creature's
  **Token HUD** eraser (*Remove the spell areas on this token*), like Spirit Guardians.
- Areas clean themselves up. An instantaneous spell's area (Fireball) is deleted once every ticked
  row has been applied. A concentration spell's areas go when the caster stops concentrating.

**Wall spells (Wall of Stone, Wall of Fire, Blade Barrier).** Each panel is drawn in solid stone grey,
at least a fifth of a square thick, whatever the caster's user colour or the grid size, so a 3-inch
Wall of Stone panel no longer vanishes on a 50 px map. Only the drawing is thicker: who is inside the
area is measured on the real panel.

**Wall spells are real walls (0.8.0, Joe's ruling 2026-11-21).** Walls are for storytelling and behave
like the real thing: a party behind its own Wall of Stone does not know what is happening on the other
side. The GM's client puts Wall documents along every panel (players cannot create walls, so it needs
the GM online; with the GM account open in two tabs or on two machines, only one of them writes, 0.8.3):

| Spell | Blocks movement | Blocks sight |
|---|---|---|
| Wall of Stone | yes | yes |
| Wall of Ice | yes | yes |
| Wall of Force | yes | no (it is invisible), and other spell areas stop at it |
| Wall of Fire | no (walk through and burn) | yes |
| Blade Barrier, Wind Wall | no walls | |

A round wall (Wall of Force's sphere, Wall of Ice's globe, Wall of Fire's ring) gets a ring of walls.
The walls move when the wall's handle is dragged and go when the area is deleted or concentration ends.
A spell's own walls never cut its own area. Setting *Wall spells raise real walls* (on).

**Knocking a wall down (GM).** Every 10-foot section of a wall (a Wall of Stone panel, a Wall of Ice
section, a 10-foot stretch of a Wall of Fire, one arc of a ring) has a small dark disc with a crack on it,
on the GM's map only, on any layer. **Click** it: that section is gone. Its walls go and the drawn wall shows
the hole, so players see (and walk) through it, and a toast says "Wall of Stone: a section is broken".
**Right-click** any disc of that wall: the whole wall is put back (also `game.pentaryn.aoe.repairWall(regionId)`).
Breaking the last section removes the wall and its area. Deleting the spell's walls on the Walls layer
breaks those sections too, so they do not come back on the next drag (Clear All on the Walls layer breaks nothing: the walls come back. Core 14 hides Clear All's flag from
modules, so deleting the last walls of a one-level scene by hand reads as Clear All too). Wall of Stone becoming permanent
after a full 10 minutes of concentration is not built: its walls go with concentration, like its area.

**Which walls stop an area.** The PHB's rule is that an area spreads from its point of origin, and
only total cover blocks it. On the map, total cover is a wall that blocks **both movement and
sight**: normal walls, closed doors, terrain walls and windows clip an area. **Invisible walls**
(move-only: a bridge's sides, a ledge, tables and furniture) and see-through walls never clip one.
The same rule applies to every spell, physical or not. A cube is measured from its centre, a cone or line
from its point, and a sphere or emanation from its centre. dnd5e on its own clips every area with
every wall that blocks movement. The setting *Walls that stop a spell area* can turn that back on
(`move`) or turn clipping off (`none`). Changing the setting re-clips an area only when a connected
user who may edit it is viewing its level (core picks that user to write); any other area keeps its
old outline until it is moved, or a wall on its level changes while such a user views it. A cube that is rotated (Shift- or Ctrl-scroll
its handle) or resized is clipped from its new centre.

**Cancelling a placement.** While a template follows the mouse, **Escape** cancels it, on the first
press even when the sheet you cast from is open. **Right-click** skips the shape under the mouse; for a
one-shape area that is the same as cancelling. A spell with several panels (Wall of Stone's ten) shows
"Panel 2 of 10: mouse wheel rotates, Esc to finish, right-click skips a panel" while you place them (each panel starts turned as the last placed one, 0.8.4): Escape *finishes* the
wall with the panels placed so far, and right-click leaves one out. Core's own Escape would close every open
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
4. shows the GM a **tray** under the damage roll, below dnd5e's own damage tray. Each row has a tick, the save result, the
   total (the rolled one until you type another), a multiplier (×0 ¼ ½ 1 2), and the damage after resistances. The tray buttons are
   **Re-roll NPC saves**, **Ping players** and **Apply N**.
   The per-row dice icon re-rolls one monster. The shield icon rolls a save for an absent player.

Every save is threaded under the spell's card the way dnd5e's own save button threads it, so the
card's outcomes and dnd5e's damage tray (its half-damage pill) agree with this tray. Since 0.6.4 the
damage card's own targets are the creatures in the area too (the ticked rows: not the caster, nothing
hidden, nobody at 0 HP), so dnd5e's own tray lists them instead of whatever the GM had selected; a
player's Apply on that card does nothing for the monsters (the GM's tray does, and the player gets one
toast saying so).
Nothing is applied until **Apply** is pressed. Rows still waiting are skipped, and pressing
Apply again later applies only the rows that have resolved since. A second Damage click on the
same area greys out the older tray ("superseded"): the module's tray refuses to apply it, but dnd5e's
own tray on that older card still lists the area's creatures, and a GM pressing it applies that damage
by hand — so the newer tray is the one to use.
The tray has no rule for Legendary Resistance, Evasion or cover. Set the multiplier on that row by hand.

**Single-target save spells (Psionic Lash, Toll the Dead).** Using the spell at a target rolls its
damage at once, like an attack that hits: Use → the target rolls the save (the request card, or the
card's own Saving Throw button) → Apply. A save rolled from the card's own button *before* the damage
counts too, so nobody is asked twice. A spell that places an area still waits for the area; a use with
no target rolls nothing (narrate away).

**Apply on any damage or healing card (players too).** dnd5e's own Apply tray is on every damage and
healing card. Pressing Apply does what the tray shows: your own tokens take it on your client; a row
for a token you do not own (healing Caven) is applied by the GM's client for you, with the same
multiplier, no confirmation on either side. You hear from the module only if no GM is connected (one
short note; press Apply again when the GM is back), or if the GM's client has not answered after
about 23 seconds (8 s for the answer, then 15 s watching the card for the GM's "Applied by" line): then
the note says to check the target's HP before pressing Apply again, because a slow GM client can still
land it. A slow answer that lands inside that time says nothing. A card you rolled with nothing targeted fills with
your targets as you target them, so the rows show who will take it; pressing Apply on an untargeted
card while you hold targets goes to those targets. **Real dice:** every row has a small total,
pre-filled with the rolled one; type the number your dice showed and Apply uses it (the ×0 ½ ×1 ×2
multipliers still apply on top). The number that would land shows beside it while it differs. The GM's
save tray has the same total per row.
A healing card from something that can only affect its user (Stone's Endurance, Second Wind) always lists the
caster, whoever is targeted or selected, so nobody's Apply can heal the monster they had targeted. A
Self-range area (Burning Hands, Spirit Guardians) is not one of them: its rows are the area's.
After an Apply the card says who pressed it and what landed, one line per press: "Applied by Talo →
Talo (+11)". The GM always sees it; by default a player sees it on a card they rolled or where they
own who took it, and never a monster's row (setting *Who sees "Applied by" under a card*).

**Attacks.** When an attack roll hits, damage is rolled straight away on the attacker's own
client. It also rolls when the target's AC is unknown. With **no target** nothing rolls, not even on a
natural 20 (0.8.0): dnd5e's Apply tray on such a card would offer whatever each viewer has selected,
often the attacker, so the player clicks the card's Damage button instead.
A known miss or a natural 1 rolls nothing. The card's Damage button still works.
With several targets, the damage card lists only the ones the roll hit, so Apply never hurts a creature
the attack missed; if it missed them all, no damage is rolled.
`dnd5e.attackRollVisibility` is `"hideAC"` (Joe, 2026-11-20): players see hit or miss, never the AC.
The attack card then says so in words: "Attack — Hit" in blue or "Attack — Miss" in orange (with
several targets, "Hit" / "Miss" on each target), a miss adds a "Miss — no damage" line so the turn
visibly moves on, and the damage roll after a hit has a blue title. With the visibility back at
`"none"` nothing is shown. Setting *Say Hit or Miss on attacks*; this module never changes dnd5e's
visibility setting.

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

**Cancelling refunds the cast (Part F).** When an area placement is cancelled before any shape was
placed (Escape, or right-clicking a one-shape area), the slot, charge or uses it spent come back, the concentration it began ends, and its
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
| Roll damage when a save spell is used | on | a save activity with damage used at a target rolls at once; not an area spell |
| Apply from the card | on | a player's Apply reaches the allies they do not own through the GM; late targets fill an untargeted card; a total to type per row |
| Apply self-cast effects automatically | on | the caster's one effect goes on straight away |
| Highlight effects not yet applied | on | cards under an hour old |
| Careful Spell protects the creatures the player chooses | on | |
| Refund a cancelled area | on | Part F |
| Tell the caster when damage is waiting for the GM | on | also hides GM-only monster saves from players |
| A touch spell cast at nobody goes on the caster | on | off: it waits in the GM's effects tray |
| The same spell does not stack | on | |
| Self cones and lines start at the caster | on | Part G |
| Instantaneous areas stay where they were cast | on | Thunder Step's ring stays behind with a handle |
| Say Hit or Miss on attacks | on | the labels and the miss line; nothing while dnd5e's attack roll visibility is None |
| Who sees "Applied by" under a card | The GM, the card's roller and the owners of who took it | `gm` · `owners` · `all`; a player never sees a monster's row |
| Wall spells raise real walls | on | Stone and Ice block movement and sight, Force movement, Fire sight; the GM's break discs; off removes the viewed scene's spell walls |
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
game.pentaryn.aoe.wallsFor(regionId)     // a wall spell's walls by panel and section as cast (shape: its index now), what is broken
game.pentaryn.aoe.repairWall(regionId)   // GM: put a broken wall back
```

## Gotchas

- **Two GM tabs are fine** (the bridge tab plus your own). One of them does the work: one handle per
  area, one save per monster, one request card. A tab that was open before a module update keeps
  the old code until it is reloaded, and until then it can still add a second handle or save.
- **Needs the GM online.** With no GM connected, saves aren't rolled, nothing is applied from the
  save tray, and a player's Apply for a token they do not own waits (the one note they get). Moving
  and deleting areas, and applying to your own tokens, still work.
- **Every client needs the module**, because each player's own client creates the handle,
  answers the request card and auto-rolls damage. Without it on a client, the GM
  backstop adds the handle about 2.5 s later, and `sweep` repairs the rest.
- **Startup sweep.** On ready, and on every scene change, the GM's client deletes handles whose
  area is gone. It also gives *existing* template regions shared ownership and a handle. So
  leftover areas from before the module was installed get handles the first time their scene is viewed.
- **A moved area needs Damage clicked again.** Containment is read when the damage is rolled.
- **A card follows your targets only while it is yours, untargeted and fresh** (under ten minutes,
  not yet applied, and not a save spell's card the GM's client has resolved off an area — from then on
  the area's creatures are its rows, whatever you target). A card the GM rolled lists selected tokens,
  as dnd5e always did — except a save spell's damage card, whose dnd5e tray lists the creatures in the
  area once the GM's client has resolved it (0.6.4).
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
