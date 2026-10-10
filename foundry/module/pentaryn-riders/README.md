# Pentaryn Feature Riders

**Read this when:** Elemental Adept, Elemental Affinity, Potent Spellcasting or the Healer feat
isn't adding what it should, Battle Medic misbehaves, or someone asks where the Hit Dice − / + came from.

dnd5e leaves some feature riders for the player to do by hand. This module does them
automatically. The rules live in one table, `RULES` in `riders-core.mjs`, keyed by **feature
identity**: the dnd5e `system.identifier`, the PHB compendium source, or the item name with any
"(Fire)" suffix ignored. A rider is on only while the actor has the feature item. Delete the feat and the rider stops.

| Feature | What happens | Where you see it |
|---|---|---|
| **Elemental Adept** (typed) | On damage rolls of your **spells**, dice of the chosen type get Foundry's `min2`, so a 1 counts as 2. The damage tray starts with the target's resistance to that type **ignored**. | Formula `8d6min2`. Card flavor "Elemental Adept: 1s count as 2". In the tray, the resistance icon starts pressed ("Ignoring…"). Click it to switch resistance back on. |
| **Elemental Affinity** (typed) | +CHA mod added **once** to a spell that deals your type. For a spell that makes several attacks from one card (Scorching Ray), only the first damage roll gets it. A save spell re-rolled from its card gets it again. | `+ 5[Elemental Affinity]` in the formula, and in the card flavor. |
| **Potent Spellcasting** (Druid *Elemental Fury* / Cleric *Blessed Strikes*) | +WIS mod on damage from that class's **cantrips**. A cantrip with no class falls back to the actor's only spellcasting class. | `+ 4[Potent Spellcasting]`. |
| **Healer** | Healing dice of your spells reroll 1s once (`r1`). Temp HP and max-HP rolls are left alone: they don't restore Hit Points. | `2d8r1`. |
| **Healer → Battle Medic** | One activity. Target one creature and use it. dnd5e spends one kit use. Then the **target** spends its largest Hit Die, the healer rolls that die (1s rerolled) + PB, and the target regains the result. | Chat roll "Battle Medic — X spends a d10 Hit Die". A toast shows HP regained, and Hit Dice left when the healer could see the target's sheet anyway. |
| **Hit Dice − / +** | On the character sheet, outside edit mode, a − and a + sit beside the *Hit Dice* label. They spend or regain one Hit Die, the largest first. | Sidebar. Each button greys out when there's nothing to spend or regain. |

Both riders and the − / + can be turned off in *Settings → Pentaryn Feature Riders*
(`enabled`, `hdControls`).

## How it works

- **Damage and healing riders** run on `dnd5e.postDamageRollConfiguration`. That's on the roller's own client, after
  the roll dialog and before the dice are rolled. At that point the damage type is final, crits are already
  doubled, and `@` references are resolved. The real roll terms are edited: a die modifier is
  added, or one `+ N[label]` term is appended. If the roll is of a different type than the bonus,
  the flavor is the damage type, so dnd5e still types the bonus correctly.
- The damage message carries `flags.pentaryn-riders = {applied, ignoreResistance, origin}`.
  - `applied` drives the once-per-casting check: it finds earlier damage messages from the same card.
  - `ignoreResistance` is read by `dnd5e.preCalculateDamage`. It sets `options.ignore.resistance` once for each tray
    target that actually resists that type. Targets without the resistance get no icon.
- **Typed features need a type.** The type is resolved in this order:
  1. `flags.pentaryn-riders.damageType`
  2. the name's parenthetical, as in "Elemental Adept (Fire)"
  3. the item's own damage activities, when they name exactly one type

  If none of these gives a type, the rider stays off and `report()` says **NO TYPE**. Fix it with `setType(actor, "fire")`.
- **Battle Medic writes:**
  - If the healer's user owns the target, the healer's client writes.
  - Otherwise the active GM writes, through the v14 user query `pentaryn-riders.battleMedic`. The GM checks
    three things: the sender owns the healer, the healer has the Healer feat, and the amount is clamped to the die actually spent + PB.
- **Nothing is spent when:**
  - there is no single target,
  - the target has no Hit Dice left, or
  - the target belongs to someone else and no GM is online.

  In each case the player gets a warning before dnd5e touches the kit.
- `−` / `+` on the sheet update the class item's `system.hd.spent`, or `system.attributes.hd.spent` on an NPC.
  These are the same fields dnd5e's own Hit Dice config edits.

## Setting up an actor (GM, console)

```js
const R = game.pentaryn.riders;
R.report();                                   // every PC: active riders, types, Battle Medic state
await R.setType(game.actors.getName("Marrith Ashcroft"), "fire");  // Adept + Affinity
await R.retireManual(marrith);                // delete Elemental Affinity's click-to-add +CHA activities
await R.installBattleMedic(marrith);          // one Battle Medic activity on the Healer feat
```

- `installBattleMedic(actor, {replace = true})` finds the actor's Healer feat and creates or updates a `utility` activity named
  **Battle Medic**, flagged `flags.pentaryn-riders.flow = "battle-medic"`. The activity uses 1 use of the Healer's Kit.
  - Which kit: the first existing kit target that still resolves; otherwise the actor's `healers-kit`
    item, matched by identifier, else by name.
  - With `replace`, it also deletes the old `Heal dX` activities. Those made the patient pick a die and the healer roll it by hand.
  - The result includes `kitFound`. If it's `false`, give the actor a Healer's Kit and run it again.
- Potent Spellcasting skips a cantrip whose damage part already adds WIS as a term
  (`@abilities.wis.mod`, or `@mod` on a WIS activity) — no PHB druid/cleric cantrip does, so that is
  a hand edit and WIS is added once, not twice. `report()` lists those spells under `handAdded`.
  Talo's world Produce Flame, Thorn Whip and Starry Wisp carry one. Elemental Affinity has no such
  skip: Alter Self and Green-Flame Blade add the mod legitimately, and Sorcerous Burst's `x@mod`
  is an explode limit, not a bonus.
- `retireManual(actor)` deletes the Elemental Affinity damage activities, so the bonus is never
  added twice. It first pins the resolved type into the flag, so the type doesn't depend on those activities any more.
- Other console functions:
  - `featuresOf(actor)` lists the active riders.
  - `spendHitDie(actor)` and `restoreHitDie(actor)` spend or regain one Hit Die.
  - `battleMedic(healerActor, targetToken)` runs the flow without the activity and without spending the kit.
  - `preview("8d6", {rollType: "fire", types: ["fire"], modifier: "min2", bonus: {value: 5, label: "Elemental Affinity"}})` shows what the transform does to a formula.
  - `core` is the pure module.

## Adding a rider

Add a row to `RULES`:

- `match`: `identifiers`, `sources`, `names`.
- `types` (optional): the choices for a typed feature.
- `when`:
  - `spell`, `cantrip`, `classIdentifier`
  - `rolls`: `"damage"` or `"healing"`
- `effect`:
  - `dieModifier`, such as `"min2"` or `"r1"`
  - `bonus`: an ability key
  - `once: "casting"`
  - `ignoreResistance`
  - `unlessCarried`: skip the bonus when the activity's damage formula already adds that ability

Then add a fixture to `test/run.mjs`.

## Tests

`node test/run.mjs` runs the synthetic fixtures. They cover:

- matching and type resolution
- the formula transforms: `min2` on typed dice only, no doubled modifiers, crit-doubled dice, `r1`, typed bonus terms
- `planRiders`: Marrith's Fireball, the second Scorching Ray, a two-part spell, Talo's cantrip (and one that already adds +WIS by hand), a levelled spell, healing
- Hit Die choice, the Battle Medic formula and the clamp

Install: `make foundry-riders-sync` (the install agent adds the target). The first install needs a Foundry restart,
then enable the module and reload.

**Verify live:**

- **Fireball as Marrith:** the formula shows `min2` and `+CHA`, and a fire-resistant target's tray shows the resistance ignored.
- **Produce Flame as Talo:** the formula adds WIS exactly once — `+ 5[Potent Spellcasting]`, or his hand-added `+ 5` with no rider term.
- **Battle Medic, as a player, on another player's PC:** the GM writes the target's Hit Die and HP.
- **The sheet's − / +:** works as a player, and is hidden in edit mode.
