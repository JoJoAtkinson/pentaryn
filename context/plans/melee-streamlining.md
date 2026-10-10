---
title: "Melee streamlining — Full Attack, follow-ups and once-per-turn riders on the Argon HUD"
created: 2026-10-10
last_modified: 2026-10-10
status: built (code + node tests) and adversarially reviewed — not yet synced to Foundry or playtested
tags: [plan, foundry, dnd5e, argon, combat, melee, design]
---

# Melee streamlining — design

**Read this when:** building or changing the `pentaryn-combat` module (Full Attack, swing pips,
bonus-action follow-ups, Sneak Attack offer, NPC Multiattack). **History, not instructions** once
shipped — the use-doc will be `foundry/module/pentaryn-combat/README.md` plus a row in
[`../foundry/README.md`](../foundry/README.md).
**Not this file:** authoring a one-off `Attack + Sneak` activity by hand → [`../foundry/attack-activities.md`](../foundry/attack-activities.md) (5.x pattern, superseded by this design once built).

> Grounded in the melee research pass of 2026-10-10 (live world `pentaryn`, Foundry 14.369,
> dnd5e 6.0.6 modern rules, Argon 5.0.1 + dnd5e 5.2.2, owned PHB packs) and one read-only probe
> while writing this. Facts are stated as settled; choices are marked **Decision**; things the build
> must prove first are marked **Verify**.

---

## 0. The one-paragraph version

A fighter with Extra Attack clicks **Full Attack** once. The HUD rolls swing 1 with the native
attack dialog (Normal / Advantage / Disadvantage), damage rolls itself on a hit as it does today,
then swing 2's dialog opens by itself against the same target. The Action pips read **2 → 1 → 0**
so the player always knows where they are. Cancel pauses instead of aborting, so a swing can go
to a different target or a different weapon. When the Attack action is done, the Bonus bar offers
the one follow-up the character actually has — **Off-hand: Dagger**, **Flurry of Blows (2 strikes)**,
**Hew** — as a single click, and a Rogue sees **+ Sneak Attack 3d6** on the first hit of the turn,
offered, never forced, and gone once used. A single weapon click is exactly what it is today.
Every roll still goes through `Roll#evaluate`, so a player on Manual dice types each result.

---

## 1. What Joe asked for, mapped to 2024 rules

| Joe's words | 2024 PHB thing | Covered by |
|---|---|---|
| "all the swings you get at your level" | **Extra Attack** (5), Fighter **Two** (11) / **Three Extra Attacks** (20); Warlock Thirsting Blade | §4 attack count, §5 Full Attack |
| "fury attack … two attacks, maybe at a minus" | Most likely **Flurry of Blows** (2 Unarmed Strikes, 1 Focus, bonus action). The "minus" is 2014 memory: 2014 Frenzy was a bonus-action attack; 2014 GWM/Sharpshooter was −5/+10. 2024 **Frenzy** is extra dice on the first Strength hit; 2024 **GWM** is +PB on Heavy hits plus **Hew** (bonus attack after a crit or a kill). No 2024 feature trades accuracy for an extra attack. | §6 follow-ups (Flurry, Hew), §7 riders (Frenzy, GWM) |
| "an off-hand" | **Light** property extra attack (bonus action, no ability mod to damage), **Nick** mastery (same, but inside the Attack action), **Dual Wielder** (any non-Two-Handed melee), **Two-Weapon Fighting** style (adds the mod back) | §6 follow-ups, §8 off-hand fixes |
| "sneak attack damage" | **Sneak Attack**: once per turn, finesse or ranged, needs advantage or an un-Incapacitated ally within 5 ft of the target and no disadvantage | §7 once-per-turn riders |
| "multiple attacks at higher level" | the count table in §4; NPC and Wild Shape **Multiattack** | §4, §9 |
| "one attack at a time must stay possible" | untouched native flow | §3 non-goals, §5.6 |
| "roll their own dice" | Foundry core Manual dice fulfilment (`core.diceConfiguration` → RollResolver) | §10 |

---

## 2. Where the clicks go today (measured, settings as they are)

Live settings that shape the flow: Argon `rangepicker` + `rangepickerclear` **on** (every weapon click
clears targets and opens the "0/1 Targets" picker), `explodeItemActivities = only-weapons`,
`dnd5e.attackRollVisibility = "none"` (players never see hit/miss; the GM calls it), and
**`pentaryn-aoe.autoDamageOnHit = true`** — this last one is new relative to the research pass: on
any attack whose target AC the roller can't know (so, every player attack), dnd5e's damage roll
runs right after the attack roll with `configure: false`, threaded under the usage card, crit taken
from the d20. The player never clicks Damage and never sees the damage dialog.

**Fighter 5, longsword, two swings on one goblin, today:** weapon (1; and for PCs the weapon-set slot
is empty, so it is Use Item drawer → weapon = 2) → target picker click (1) → attack dialog
Normal/Adv/Dis (1) → damage rolls itself → the Action pip is now grey and nothing says "1 of 2" → the
player has to know to click the weapon again (1) → picker again, same goblin (1) → dialog (1).
**7–8 clicks**, two of them spent re-targeting the same creature, and one piece of knowledge the HUD
doesn't give.

**Off-hand today:** empty Bonus slot, then the attack dialog's Attack Mode must be changed to
*Offhand* by hand; that choice sticks in `flags.dnd5e.last.<activityId>.attackMode`, so the next
main-hand swing with that weapon defaults to Offhand; and Argon spends the **Action** pip, not the
Bonus pip, because the weapon's activation is `action`.

**Sneak Attack today:** stock PHB item = separate damage activity with `uses.max 1` and no recovery
(spent once, never back), 13-type picker, crit not carried over. The Pip Locksley `Attack + Sneak`
pattern (`attack-activities.md`) fixes the type and the recovery but forces the player to commit
before rolling and doubles every weapon's buttons.

Full gap list from the research pass: no full attack, no swing counter, picker re-targets per
swing, empty PC weapon sets, off-hand mode/pip bugs, once-per-turn riders as separate typed cards,
Flurry rolls nothing, Multiattack is a text card, pentaryn-riders has no per-turn mode, mastery
effects unprompted, Staff of the Woodlands explodes into 10 buttons.

---

## 3. Scope

**In:** everything in §1's table, for PCs, NPCs and Wild Shape forms, on the Argon HUD, dnd5e 6
only. Extend Argon from our module the way `pentaryn-transform/hud.mjs` does; **never edit Argon's
files**.

**Non-goals (explicit):**
- Changing the single-attack flow. A weapon click, the target picker, the attack dialog and the
  auto-damage are byte-for-byte what they are today. The only addition visible on a single swing
  is the swing pips (§5.5) and the off-hand corrections (§8), both switchable off.
- Hit/miss resolution for players (`attackRollVisibility` stays `none`; the GM calls it) and damage
  application: the GM's native `<damage-application>` tray on each damage card stays the confirm
  step. Nothing here applies damage.
- midi-qol-style automation of mastery effects (Vex/Sap/Topple/Graze/Cleave). A **prompt** is a v3
  candidate (§12); automation is not.
- Rewriting Sneak Attack / Smite / Hunter's Mark into weapon activities. The native items stay as
  the PHB module ships them; we add the offer around them.

---

## 4. Attack count — derived, no actor data needed

`attackCount(actor, weapon)` in the pure core:

1. `flags.pentaryn-combat.attacks` (integer) if set — the override for homebrew and for NPCs whose
   Multiattack text won't parse. Nothing else needs writing to an actor.
2. Feat items by dnd5e identifier, highest wins, never summed across classes (the rule is "attack
   twice", not "+1"): `extra-attack` → 2, `two-extra-attacks` → 3, `three-extra-attacks` → 4.
   Fallback match on normalised name ("Extra Attack", "Two Extra Attacks", "Three Extra Attacks")
   for hand-made items, same `normalizeName` idea as pentaryn-riders.
3. `thirsting-blade` → 2, but only for a weapon flagged `flags.pentaryn-combat.pactWeapon` or whose
   attack ability is `cha`; other weapons stay at 1. **Decision:** good enough; a Warlock PC doesn't
   exist in any current world.
4. Otherwise 1.

`extraSwings(actor, context)` — things that add a swing *inside* the Attack action:
- **Nick**: a different Light weapon with mastery `nick` that the actor has mastery in
  (`weapon.system.masteryOptions` / the actor's `system.traits.weaponProf.mastery`), once per turn,
  not yet used → one extra swing with that weapon, `attackMode: "offhand"`, costs nothing.
- Bard (Valor) / Bladesinger "replace one attack with a cantrip": not modelled; the player uses
  **Stop** after swing 1 and casts (§5.4).

NPC and transformed actors: §9.

---

## 5. Full Attack

### 5.1 Where it lives

A **Full Attack** button on the **Action** bar, first in the row, only when `attackCount ≥ 2` or an
extra swing (Nick) or a parseable Multiattack exists. Single-attack characters see nothing new.
Built like `WildShapeButton` (an Argon `ButtonPanelButton` subclass, borrowed classes from
`CONFIG.ARGON`, `renderActionPanelArgonComponent` recomposition, `applyButtons`). Badge = the number
of swings (`paintBadge`).

- **Left click:** start the sequence with the **remembered weapon** (`flags.pentaryn-combat.last.weapon`
  on the actor, else the active weapon set's primary, else the first equipped melee weapon).
- **Click when nothing is remembered and there are 2+ candidate weapons:** opens a weapon picker
  panel (tiles like `FormTile`: name, to-hit, damage, "swing count with this weapon"), one click
  starts. The choice is remembered.
- **Right click:** the picker, to change weapon.
- Tooltip: "Attack twice with Longsword (+7, 1d8+4 slashing). Each swing opens the attack roll.
  Esc pauses; right-click picks another weapon."

### 5.2 The sequence (one swing at a time, N times)

```
start(actor, weapon, {count, swings:[{weapon, mode}…]})
  targets ← game.user.targets; if none → Argon TargetPicker once (its own promise); if the player
            right-clicks out → sequence not started
  usage   ← activity.use({subsequentActions:false, …}, {configure:false}, {create:true})
            → one usage card, ammo/uses/action economy consumed once, no auto attack roll
  for i in 1..N:
    strip.show(i, N, weapon, target)                     // §5.3
    roll ← activity.rollAttack(
             { attackMode, ammunition, swing:{i, N, seq} },     // mode per swing (§6/§8)
             { configure: !quick(i) },                          // native dialog = adv/dis per swing
             { data: { system: { origin: usage.id }, flags: { "pentaryn-combat": { swing } } } })
    if roll === null  → paused (dialog cancelled): strip shows Resume / Retarget / Weapon / Stop
    else → pentaryn-aoe's postRollAttack auto-damage runs as today (crit from this swing's d20)
    pips ← N - i
  done → turn flag updated (attackAction: true, crit/kill seen?) → follow-ups appear (§6)
```

Why one `rollAttack` per swing and not `rolls:[…]` in one call: the card's Damage button and the
auto-damage hook read `rolls[0]` only, and `isCritical` is per roll. One attack message per swing
keeps crit, mode and damage honest per swing with zero custom card code. (The research proved
`rollAttack({rolls:[{options:{}},{options:{}}]})` returns N rolls; that path is kept for a possible
future "roll all d20s at once" quick mode, not used in v1.)

**Verify:** (a) `rollAttack` with `{data:{system:{origin}}}` threads the attack message under the
usage card the way aoe threads damage — aoe does it for `rollDamage`, same `BasicRoll.buildPost`
path; (b) ammunition is consumed per `rollAttack` (dnd5e 4.1+ `AttackActivity#rollAttack` →
`ammunition` consumption) and not only in `use`; (c) `subsequentActions:false` in the usage config
really stops `_triggerSubsequentActions` (research read the code; the build runs it).

### 5.3 The swing strip

A small panel under the Action bar (same place and fade as the transform pickers, `pentaryn-picker`
styling): **"Swing 2 of 2 · Longsword → Goblin"** with: `Adv` / `Dis` toggles for the *next* swing,
`Retarget` (opens Argon's picker, keeps the sequence), weapon tiles (switch for the remaining
swings), `Stop` (ends the sequence; swings not taken stay on the pips so the player can cast a
cantrip in their place or click a weapon by hand). While a dialog is open the strip is informational
only. It disappears when the sequence ends.

Why a strip and not a "Next swing" button: a button is one more click per swing, and the dialog
itself is already the per-swing decision point. The strip exists for the exceptions (retarget,
swap, stop), which cost a click only when used.

### 5.4 Pause, not abort

Cancelling the attack dialog (Esc or ✕) **pauses** at that swing. The strip's `Resume` reopens the
same swing's dialog; `Retarget`/weapon tiles change it first. Argon's picker cancel semantics
(right-click) are reused through `cancelTargetPicker()` from transform's `hud.mjs` (exported; the
combat module imports the same approach, not the module — copy the 12 lines, no cross-module
import). A token-body change (Wild Shape mid-sequence) ends the sequence.

### 5.5 Swing pips (also for single swings)

Argon's Action panel has `maxActions` (1) / `currentActions` and `updateActionUse()`. In our
`renderActionPanelArgonComponent` handler the Action panel's getters are overridden on the instance
(not the class) when `attackCount ≥ 2`: `maxActions = N`, `currentActions = N - swingsThisTurn`. Our
`dnd5e.postUseActivity` / `dnd5e.postRollAttack` listeners count swings (weapon attack activities
only) and any non-attack `action` use zeroes it. So a fighter who clicks the weapon by hand twice
sees **2 → 1 → 0** too. The turn resets it (§7.3). This is the "attack 1 of 2" cue the research
found missing, and it needs no sequence.

### 5.6 What stays exactly the same

Clicking a weapon: Argon's `_onLeftClick` → picker → `activity.use` → dialog → auto-damage. We hook
nothing *into* that path except the counters and the off-hand corrections in §8. Shift/Alt/Ctrl
fast-forward keys keep working on the dialogs.

### 5.7 Quick mode (per client, off by default)

User flag `flags.pentaryn-combat.quick`: the sequence passes `configure:false` to every swing
after the first (the first dialog's Normal/Adv/Dis choice is reused), so two swings = Full Attack
(1) + one dialog (1). Holding a dnd5e `skipDialog*` key when clicking Full Attack applies that mode
to all swings of that sequence. Manual-dice players still get the resolver per swing (§10).

### 5.8 Click budget (acceptance)

| Case | Today | Target |
|---|---|---|
| Fighter 5, 2 swings, one target already targeted | 7–8 | **3** (Full Attack, dialog, dialog) |
| …quick mode | — | **2** |
| …no target yet | 7–8 | 4 |
| Fighter 11, 3 swings, second swing on a new target | 11–12 | 5 (Full Attack, dialog, Esc, Retarget click, dialog, dialog) |
| Off-hand after the Attack action | 4 + a dialog field change | **2** (Off-hand button, dialog) |
| Rogue single swing + Sneak | ~6 and a type picker | 3 (weapon, dialog, + Sneak) |
| Monk Flurry | 1 + find Unarmed Strike twice (≈6) | 3 (Flurry, dialog, dialog) |

---

## 6. Follow-ups — the Bonus bar after the Attack action

The turn flag (§7.3) records `attackAction: {weapons:[ids], swings, crit:bool, kill:bool}`. In
`composeBonusBar` we add **at most the follow-ups the actor actually qualifies for right now**,
each a one-click `FollowUpButton` (an `ItemButton` subclass over the real item, so Argon's tooltip,
icon and uses badge are native):

| Follow-up | Shown when | Click does | Pip |
|---|---|---|---|
| **Off-hand: \<weapon\>** | Attack action taken this turn with a Light weapon (or any non-Two-Handed melee weapon with `flags.dnd5e.enhancedDualWielding`), a *different* qualifying weapon is equipped, Bonus pip free | 1-swing sequence with `attackMode:"offhand"` (native: drops positive `@mod`), `flags.dnd5e.last` mode restored afterwards | Bonus |
| **Nick: \<weapon\>** | as Off-hand, but the second weapon has Nick mastery and Nick not used this turn; shown on the **Free/Special** bar and also offered as an extra swing inside Full Attack (§4) | same swing, cost nothing, marks Nick used | none |
| **Flurry of Blows (2 strikes)** | Monk with `flurry-of-blows`, Attack action taken, Focus ≥ 1, Bonus free | `use()` the PHB Flurry utility activity (spends Focus, posts its card) then a 2-swing sequence with Unarmed Strike, threaded under that card | Bonus |
| **Martial Arts strike** | Monk, Attack action taken, Bonus free, Flurry not chosen | 1-swing Unarmed Strike | Bonus |
| **Hew: \<heavy weapon\>** | GWM, this turn's attacks include a crit or a kill (§7.3 kill detection), Bonus free | 1-swing sequence with that weapon | Bonus |
| **Pole Strike** | Polearm Master | already a native bonus attack activity — Argon shows it; we only hide it until the Attack action was taken with the polearm (setting `gateFollowUps`) | native |
| **Divine Smite** | Paladin: native bonus-action spell — unchanged. The crit-carry problem is handled by the rider offer (§7) | native |

Bonus pip handling: Argon's `consumeActionEconomy` goes by the activity's activation type, so an
off-hand swing of an `action` weapon would grey the Action pip. Our sequence marks the right panel
itself (`ui.ARGON.components.main[1].isActionUsed = true; updateActionUse()`) and *un*-marks the
Action pip's swing count it just wrongly took. `followUpsUsed` goes on the turn flag so the button
disappears after use.

---

## 7. Once-per-turn riders — offered, toggleable, never forced

### 7.1 The table (pure core, `TURN_RIDERS`)

| Rider | Identity | Eligible when | Dice |
|---|---|---|---|
| **Sneak Attack** | `sneak-attack` | weapon finesse or ranged; (advantage rolled) OR (an ally — another non-hostile, non-Incapacitated creature — within 5 ft of the target) AND no disadvantage | `@scale.rogue.sneak-attack`, weapon's damage type |
| **Frenzy** (2024) | `frenzy` | Rage active (effect/identifier `rage`), Reckless Attack used this turn (flag or its effect), Strength attack, first hit this turn | `(@scale.barbarian.rage-damage)d6`, weapon's type |
| **Colossus Slayer** | `colossus-slayer` | target below max HP (readable for GM; player side: offered with hint) | 1d8 |
| **Divine Strike / Blessed Strikes** | per class identifier | first hit this turn | class dice, class type |

Eligibility that needs the target's state (Colossus Slayer) or the GM's judgement is shown as a
**hint on the button**, never computed into a refusal: "Sneak Attack — needs advantage or an ally
beside the target (Marrith is adjacent ✓)". **Never auto-forced** = the default mode is *offer*.

### 7.2 Where the offer appears

With auto-damage on, the damage card lands immediately after the attack card, so the offer sits on
the **attack card** (our `dnd5e.renderChatMessage` adds a `+ Sneak Attack 3d6` button in the card's
`section.icon-row`, rendered only for the roller and the GM, only while the turn flag says
unused). Clicking it rolls the rider's **own damage activity** with `isCritical` taken from that
swing's d20, `damage.types` narrowed to the weapon's type (so no 13-type picker), threaded under the
same usage card (`system.origin`), so the GM's damage tray applies it like any damage. The turn
flag marks it used; every other swing card's button vanishes (re-render).

**Auto mode** (per client toggle on the Free bar: a small **Sneak Attack: auto / ask** button,
remembered in `flags.pentaryn-combat.riders.<key>`): the first eligible hit of the turn adds the
rider's dice **into the weapon's damage roll** on `dnd5e.postDamageRollConfiguration` (the
pentaryn-riders mechanism; crit doubling then happens natively for all dice) and the card note
says "+ Sneak Attack 3d6". The attack card's button is not shown. If the GM then calls a miss, the
spent rider is given back with the **Undo** link on the card note (resets the flag) — a miss must
not burn the once-per-turn.

**Stock uses never recover:** the PHB Sneak Attack activity's `uses.max 1` with no recovery is left
alone and **not consumed** by our offer (we call `rollDamage` on it, not `use`). Our turn flag is
the once-per-turn, not the item's uses. A GM audit `game.pentaryn.combat.report(actor)` lists which
riders the actor has and in which mode.

### 7.3 The turn flag

`flags.pentaryn-combat.turn` on the **actor** (not the token: Wild Shape binds another actor, and the
form is its own actor with its own turn):

```js
{ key: "<combatId>:<round>:<turn>",   // self-invalidating: a different key = a fresh turn, no reset write
  attackAction: { weapons: [], swings: 0, crit: false, kill: false },
  riders: { "sneak-attack": "used" | "auto-applied:<messageId>" },
  followUps: ["offhand"], nick: false }
```

Written by the actor's owner (the roller's client); read by everyone. Out of combat the key is
`"nocombat"` and a `game.pentaryn.combat.newTurn(actor)` on the Free bar ("New turn" button,
visible only out of combat) resets it — out-of-combat multi-attack is rare and this keeps the
no-combat case honest without timers. Opportunity attacks on someone else's turn: the key is
*that* turn, so a Sneak Attack on a reaction is available again on the rogue's own turn — RAW.

Kill detection for Hew: `updateActor` where `system.attributes.hp.value` drops to 0 on an actor
that was a target of one of this turn's swings (targets recorded on the attack message
`system.targets`).

### 7.4 What stays in pentaryn-riders

pentaryn-riders remains **automatic, always-on** term edits. The combat module owns **optional,
once-per-turn choices**. Always-on weapon riders that the 2024 rules make unconditional belong to
dnd5e 6's **native rule effects** on the feat item, authored once by `game.pentaryn.combat.fixFeats(actor)`
(prefer native over our patches):

- Two-Weapon Fighting style: `damage:bonus = @mod`, condition attack mode `offhand`.
- Great Weapon Master: `damage:bonus = @prof`, condition weapon Heavy and melee.
- Rage: `damage:bonus = @scale.barbarian.rage-damage` on Strength melee attacks while raging —
  only if the PHB Rage effect doesn't already do it (**Verify** on a scratch Barbarian).

**Verify** first on a scratch actor that a `dnd5e.bonus` change with a `conditions` filter on attack
mode works in 6.0.6; if not, the fallback is a `when.weapon` / `when.attackMode` extension of
riders' `RULES` (its `when` is currently spell-only). Hunter's Mark / Hex per-hit dice: v2 as a riders
rule keyed on "the target carries my mark effect"; until then the native separate activity stays.

---

## 8. Off-hand corrections (on by default, each a setting)

- **`offhandModeReset`:** after any attack roll in `offhand` mode, `flags.dnd5e.last.<activityId>.attackMode`
  is restored to the weapon's default one-handed mode (`dnd5e.postRollAttack`). Main-hand never
  inherits Offhand. **Verify** where dnd5e 6 writes `last` (it's in the roll workflow after the
  dialog; the hook order matters — restore on the next tick).
- **`offhandPip`:** an `offhand`-mode swing of an `action`-activation weapon outside Nick spends the
  **Bonus** pip and gives the Action pip back (§6).
- **`seedWeaponSets`:** at the active GM's `ready` and on `createActor`, every `character` whose
  `flags.enhancedcombathud.weaponSets` is `null` gets set 1 = first equipped melee weapon (primary)
  + a different equipped Light weapon (secondary), set 2 = first ranged weapon. Only when the flag
  is null; a player's own drag is never overwritten. Fixes the empty main bar for Caven, Marrith and Talo.

---

## 9. NPC and Wild Shape Multiattack

`parseMultiattack(description, items)` in the pure core: `[[/item id]]` and `[[/item Name]]` links
(133/133 resolve in this world), count words ("two", "three", "one X and one Y"), the spirits'
`[[floor(@flags.dnd5e.summon.level / 2)]]` inline formula (evaluated against the actor's roll data),
"or" alternatives → the first is the default plan and the others are picker tiles. Result:
`[{item, count}]`. Unparseable → the Full Attack button is hidden and the native Multiattack card
stays. Override: `flags.pentaryn-combat.multiattack = [{item, count}]` on the actor (the fixture for
the 7 link-less ones, if Joe wants them).

On the Action bar of an NPC or transformed actor, **Full Attack** runs the plan as a sequence of
swings over several items (Bite then Claw), same strip, same pips (N = total swings). Each swing's
`use`: the first swing of each item posts that item's usage card; later swings of the same item
reuse it. The transform module's front-row recomposition (`composeActionBar`) is left in place; our
button goes before the beast's attacks. **Decision:** no bar-ownership conflict — both modules add
buttons through the same `applyButtons` idiom in the same hook; ours runs last by hook order and
re-reads `panel._buttons`. The build asserts this with both modules on.

---

## 10. Physical dice

- Core `core.diceConfiguration` per client: a player sets d20 (and d6/d8…) to **Manual** in
  Configure Settings → Dice Configuration. Every `Roll#evaluate` then opens the **RollResolver**
  for that die. dnd5e never passes `allowInteractive:false`, and neither may we — the sequence
  awaits each roll, so the resolver appears per swing (d20) and per damage, in order, labelled by
  the dialog/strip ("Swing 2 of 2"). Dice So Nice already skips animation for manual results.
- `configure:false` (quick mode, auto-damage) skips the **dialog**, not the resolver. A manual-dice
  player in quick mode types each d20 and each damage die, nothing else.
- Players who want to roll at the table and *not* use the cards: unchanged — they say the number,
  the GM applies. The README gets a one-screen "rolling your own dice" note for the table.
- Acceptance test (§13 case P): the whole fighter, rogue and monk flows run with the GM's own
  `core.diceConfiguration` set to Manual for d20 and d6, then reset to `{}`.

---

## 11. Module placement and shape

**Decision: a new module `pentaryn-combat`.** `pentaryn-transform` is Wild Shape/Starry Form;
`pentaryn-riders` is pure roll-term edits of always-on feats; `pentaryn-aoe` is areas and saves.
Attack sequencing, action economy and optional per-turn choices are their own concern, and the
three existing modules keep their single purpose. Same house layout:

```
foundry/module/pentaryn-combat/
  module.json          id pentaryn-combat, esmodules [combat.mjs, hud.mjs], styles, lang/en.json,
                       relationships: dnd5e ≥6.0 (verified 6.0.6); recommends enhancedcombathud,
                       enhancedcombathud-dnd5e, pentaryn-aoe (auto-damage), pentaryn-transform
  combat.mjs           entry: settings at init, hooks at setup, game.pentaryn.combat API at ready
                       (merge into a frozen game.pentaryn the way riders.mjs does)
  combat-core.mjs      PURE (node-tested): attackCount, extraSwings, parseMultiattack, planSequence,
                       sequenceReducer (start/roll/pause/resume/retarget/swap/stop → next state),
                       TURN_RIDERS + riderEligibility, followUps(turnFlag, actor shape), turnKey,
                       pipState, weaponSetSeed, normalizeName
  sequence.mjs         the swing loop over dnd5e activities; threading; pause/resume; pip writes
  hud.mjs              Argon: Full Attack button + weapon picker, swing strip, swing pips, follow-up
                       buttons, rider auto/ask toggle, "New turn" (out of combat)
  riders.mjs           attack-card "+ Sneak Attack" button; auto mode on postDamageRollConfiguration;
                       Undo; the turn flag; kill detection
  offhand.mjs          mode reset, pip correction, weapon-set seeding
  settings.mjs         fullAttack, swingPips, seedWeaponSets, offhandModeReset, offhandPip,
                       riderOffers, followUps, gateFollowUps, multiattack (world, all default on);
                       quick, riders.<key> (client/user flag)
  styles/combat.css    strip, badges, follow-up accent (reuse transform's picker fade)
  test/run.mjs         node fixtures for combat-core
  README.md            use-doc (the table of adjustments and how to revert each)
```

Registry: `MODULES["combat"] = ModuleSpec("pentaryn-combat", check=(*_STATIC, "node-test"), after_sync=…)`
in `scripts/foundry/ops/config.py`; `foundry-combat-check` / `foundry-combat-sync` in the Makefile;
enable in `core.moduleConfiguration`; a row in `context/foundry/README.md` (route table and the
in-house list) and in `context/plans/README.md`. Restart Foundry after the first sync (module.json
is read at startup).

**Revertability (Joe's ask).** Every behaviour change is one world setting, default on, listed in
the README's *Adjustments* table with: what it changes, the setting key, what turning it off
restores, and the playtest case that covers it. Nothing is written to a real PC except the two
flags above (`last.weapon`, `turn`, and the null-only weapon-set seed), and `report()` shows them.

**Data on actors — summary:** none required. Optional: `flags.pentaryn-combat.attacks`,
`.multiattack`, `.pactWeapon`. Runtime: `flags.pentaryn-combat.last.weapon`, `.turn`. Per user:
`flags.pentaryn-combat.quick`, `.riders.<key>`.

---

## 12. Later (not v1)

- Mastery **prompts** (Vex → "next attack has advantage" cue on the strip; Graze on a miss; Topple
  save button; Cleave extra swing offer) — v3.
- Hunter's Mark / Hex per-hit dice as a riders rule; Savage Attacker ("roll twice, keep better")
  as a damage-dialog option.
- "Roll all d20s at once" quick mode using the proven `rolls:[…]` batch, if the per-swing resolver
  feels slow for manual-dice players.
- Staff of the Woodlands' 10 exploded buttons (`explodeItemActivities`) — a transform/HUD
  tidy-up, not combat; tracked here so it isn't lost.
- Out-of-combat turn tracking by timer instead of the "New turn" button, if it ever matters.

---

## 13. Playtest plan

**Rules for every case:** one GM tab (`localhost:30000/game`); player checks on `127.0.0.1:30000`
tabs that are closed when the case ends; scratch actors named `ZZ …` built from the PHB packs
(`create-actor-from-compendium` / `dnd5e-add-features-from-compendium`), deleted at the end; a
scratch combat on a scratch scene (not Drow Prison; leave Drow Prison active and paused at the
end); chat cleared of test cards; the GM's `core.diceConfiguration` reset to `{}`; the three real
PCs untouched except the null-only weapon-set seed (record before/after). **Score each case on
clicks, confusion ("did I know what to do next?"), flexibility (could I have done it one swing at a
time / with my own dice?) and correctness (numbers vs the PHB).**

| # | Scratch actor (PHB) | Case | Expect |
|---|---|---|---|
| A1 | ZZ Fighter 5, longsword | Full Attack, one target already targeted | 3 clicks; two attack cards threaded under one usage card; two damage cards; pips 2→1→0; Action pip consumed once |
| A2 | same | Full Attack, no target | picker once, then as A1 |
| A3 | same | Esc on swing 2 → Retarget → second goblin | pause, strip, resume on the new target; 5 clicks |
| A4 | same | swing 1 by hand (weapon click), then Full Attack | button offers the **remaining** 1 swing; pips 1→0 |
| A5 | same, Nick dagger + shortsword | Full Attack with shortsword | 3 swings offered (2 + Nick dagger, offhand mode, no `@mod`, no Bonus pip); Nick gone from Bonus bar after |
| A6 | ZZ Fighter 11 / 20 | Full Attack | 3 / 4 swings; pips match |
| A7 | ZZ Fighter 5, Dual Wielder, longsword + scimitar | Attack action then Off-hand | Off-hand button appears only after the Attack action; damage `1d6` flat; Bonus pip spent, Action pip untouched; next longsword click defaults one-handed (mode reset) |
| A8 | same + Two-Weapon Fighting | Off-hand | `1d6 + @mod` via the rule effect (or riders fallback) |
| B1 | ZZ Rogue 5, rapier + shortbow | single rapier swing with advantage | `+ Sneak Attack 3d6` on the attack card, hint "advantage ✓"; click → piercing damage card, no type picker; button gone on later swings this turn |
| B2 | same | swing with no advantage, ally adjacent / not adjacent | hint changes; button never hidden by the module on "not adjacent" (GM arbitrates), text says why |
| B3 | same | natural 20 then + Sneak | sneak dice doubled |
| B4 | same, auto mode | first hit | one damage card `1d8 + 3d6 + 4`, note "+ Sneak Attack"; Undo restores the once-per-turn |
| B5 | same | opportunity attack on another turn after using Sneak on own turn | available again (turn key differs) |
| C1 | ZZ Monk 5 | Attack action, then Flurry | Focus −1, Flurry card, two Unarmed Strike attacks threaded under it, Bonus pip spent |
| C2 | same | Martial Arts strike instead | one strike, Bonus spent, Flurry hidden |
| D1 | ZZ Berserker 5 | Rage, Reckless, hit | Frenzy offered once; rage damage present once (native effect vs rule effect — no double count) |
| E1 | ZZ Fighter 5, GWM greatsword | crit or kill this turn | Hew appears; +PB on Heavy hits (rule effect) |
| E2 | ZZ Polearm Master | Attack action | Pole Strike visible only after (gateFollowUps on), always with it off |
| F1 | ZZ Paladin 5 | hit then Divine Smite | native, unchanged; crit carry documented as the known gap |
| G1 | Talo (real) → Brown Bear | Full Attack | Bite + Claw sequence; transform's front row intact; revert leaves nothing behind |
| G2 | Gate Watch-Captain (3), Jhaelryna (3 daggers), a spirit with the level formula | Full Attack | counts right; unparseable → native card |
| H1 | Caven / Marrith / Talo (real) | open the HUD | weapon set 1 seeded (Dagger / Sickle etc.), nothing else changed; single click flow identical to before (record a before/after click path) |
| P | A1, B1, C1 with d20+d6 set to Manual | manual dice | resolver per swing and per damage, in order; quick mode still prompts; nothing blocks |
| R | every setting off | regression | HUD identical to today; `report()` clean |
| Z | cleanup | — | `ZZ *` actors, scratch scene, scratch combat, test chat gone; `diceConfiguration` `{}`; Drow Prison active + paused; PCs diffed against the pre-test snapshot |

Build the cases with the dynamic workflow as: Fable designs (this file), Opus builds phase by
phase with the node tests first, Sonnet runs the case table and reports clicks per case, Opus
reviews at xhigh for the pip/flag state machine (the reducer is where a wrong state would bite).

---

## 14. Build checklist

**Phase 1 — Full Attack and the counters (the value is here)**
- [x] Module skeleton, registry row, Makefile targets, `module.json`, lang, css; `make foundry-combat-check` green
- [x] `combat-core.mjs`: `attackCount`, `extraSwings`, `planSequence`, `sequenceReducer`, `pipState`, `turnKey`, `weaponSetSeed` + node fixtures
- [~] **Verify** on `ZZ Melee Probe`: usage with `subsequentActions:false`; `rollAttack` threading via `data.system.origin`; ammo per swing; where `flags.dnd5e.last.attackMode` is written — all four read from the 6.0.6 source (§15.1); live probe still to run
- [x] `sequence.mjs`: start / per-swing roll / pause / resume / retarget / swap / stop (with aoe auto-damage off, each swing's attack card gets its own Damage button — `riders.mjs renderSwingDamage`)
- [x] `hud.mjs`: Full Attack button + weapon picker + badge; swing strip (`strip.mjs`); Action panel `maxActions`/`currentActions` override + swing counting on manual clicks
- [x] `offhand.mjs`: mode reset, pip correction, null-only weapon-set seed
- [ ] Cases A1–A8, H1, R, P(A1) — [x] README adjustments table

**Phase 2 — follow-ups and once-per-turn riders**
- [x] Turn flag (write/read, self-invalidating key, "New turn" out of combat), kill/crit detection
- [x] `riders.mjs`: `TURN_RIDERS`, eligibility + hints, attack-card button, type narrowing, crit carry, Undo, auto mode (via `preRollDamageV2`, §15.2 #13), `report()`
- [x] Follow-up buttons: Off-hand, Nick, Flurry, Martial Arts, Hew, gated Pole Strike
- [~] `fixFeats()`: report-only until the live check; fallback built in this module (`weaponBonuses`), not in riders (§15.2 #14). Rage: not needed (§15.1)
- [ ] Cases B1–B5, C1–C2, D1, E1–E2, F1, P(B1, C1)

**Phase 3 — NPCs and forms**
- [x] `parseMultiattack` + fixtures from the world's Multiattacks (85 items, 35 distinct texts; links, counts, "or", the spirit formula)
- [x] Full Attack on NPC / transformed actors alongside `pentaryn-transform`'s front row (code; G1 still to run)
- [ ] Cases G1–G2

**Ship**
- [ ] Use-doc: module README + rows in `context/foundry/README.md`; this plan's status → built; `context/pentaryn.md` dated entry (settings, what was seeded on the PCs)
- [ ] Cleanup case Z; Drow Prison active + paused; no tabs left open

---

## 15. Build notes (2026-10-10) — what was verified, and every change beyond this spec

Built as `foundry/module/pentaryn-combat/` (0.1.0). `make foundry-combat-check` green: parse,
imports, i18n, **175 node fixtures**. **Not synced to Foundry and not playtested** — the live world
was only read (two read-only `eval-js` probes: PHB feature identifiers/activities, and the
world's 85 Multiattack texts). Six registry rows `combat-*` added to `foundry/adjustments.yml`.

### 15.1 Verify items — settled from the dnd5e 6.0.6 source, live probe still to run

| Item | Finding (source) | Status |
|---|---|---|
| `subsequentActions:false` stops the auto attack roll | `Activity#use` → `if (usageConfig.subsequentActions !== false) … _triggerSubsequentActions`; `_prepareUsageConfig` deep-clones and keeps the key | read ✓, live ☐ |
| `rollAttack` threading via `data.system.origin` | `AttackActivity#_triggerSubsequentActions` itself calls `rollAttack({event}, {}, {data:{system:{origin: message.id}}})` — same path | read ✓, live ☐ |
| Ammo consumed per `rollAttack` | `rollAttack` computes `ammoUpdate` and writes the quantity every call | read ✓, live ☐ |
| Where `flags.dnd5e.last.<id>.attackMode` is written | inside `rollAttack`, `await item.setFlag("dnd5e", "last.<id>", flags)` **before** `dnd5e.postRollAttack` → the reset runs in that hook, no next tick needed | read ✓, live ☐ |
| Rage double-count | PHB Rage effect already carries `system.bonuses.mwak.damage +@scale.barbarian.rage-damage` → **no Rage rule effect is authored** | read ✓ |
| `dnd5e.bonus` rule effect with an attack-mode condition | `getDamageConfig` collects `AppliedRules.collect("damage:bonus", …)` filtered by `FiltersField` conditions on roll data; the filter grammar for `roll.attack.mode` / Heavy is not proved | **open** → `fixFeats()` is report-only; `weaponBonuses` fallback does TWF/GWM |
| Flurry of Blows shape | not its own item: a `utility` activity "Flurry of Blows" (bonus, 1 Focus) on **Monk's Focus** (`monks-focus`); chat flavour "Make two [[/item Unarmed Strike]]" | read ✓ (live data) |
| Sneak Attack | `sneak-attack`, one `damage` activity, `uses.max 1`, no recovery — our offer uses `rollDamage`, never `use`, so it is never consumed | read ✓ |
| GWM | `great-weapon-master` carries its own "Heavy Weapon Damage" (`@prof`) damage activity → don't click it when `weaponBonuses` is on (README) | read ✓ |
| Dual Wielder | effect `flags.dnd5e.enhancedDualWielding = true`; dnd5e then offers Offhand on any non-Two-Handed melee weapon | read ✓ |

### 15.2 Changes beyond the spec, and how to revert each

Each is small and local; "revert" names the exact place.

| # | Change | Why | Revert |
|---|---|---|---|
| 1 | **Flurry of Blows / Martial Arts are not gated on the Attack action** | 2024 PHB: neither requires it (2014 did) | `combat-core.mjs followUps`: wrap the Monk block in `if (t.attackAction.swings > 0 …)`; fixture 129 |
| 2 | **Hew offered for any melee weapon** that crit/killed this turn, not only Heavy | 2024 GWM Hew: "a Melee weapon … the same weapon" | `followUps`: add `&& w.heavy` beside `w.melee`; fixtures 133–134 |
| 3 | **Off-hand trigger requires a Light first weapon even with Dual Wielder** (the second may be any non-Two-Handed melee) | 2024 Dual Wielder still says "attack with a weapon that has the Light property" | `combat-core.mjs lightTrigger`: return `offhandCapable(w, {enhancedDualWielding})`; fixtures 123–124 |
| 4 | A Nick-capable second weapon shows **Nick (Special bar, free)** instead of Off-hand (Bonus) | Nick is strictly better and is still the once-per-turn Light extra attack | `followUps`: push both `nick` and `offhand`; fixture 122 |
| 5 | **Heightened Focus → Flurry makes 3 strikes** | 2024 Monk 10 | `followUps`: drop the `heightened-focus` ternary; fixture 130 |
| 6 | **Out of combat, Full Attack never runs out** (always the full count); riders/follow-ups still use the `nocombat` key + **New turn** | no turn order to reset it; a second out-of-combat Full Attack showing 0 swings read as broken | `combat-core.mjs swingsLeft`: remove the `!inCombat` early return; fixture 116 |
| 7 | **GWM `+PB` not on reactions or bonus-action attacks** (Hew, Pole Strike) | 2024: "as part of the Attack action on your turn" | `damageBonuses`: drop the `kind` / `isOwnTurn` tests; fixtures 185, 187 |
| 8 | **TWF adds `@mod` only when positive** | dnd5e already keeps a negative mod on off-hand | `damageBonuses`: drop `mod > 0`; fixture 182 |
| 9 | Two extra files: `shapes.mjs` (Foundry → plain data, turn flag I/O) and `strip.mjs` (strip + weapon picker DOM) | keeps `hud.mjs` to Argon and keeps the strip off Argon's private classes | structural only |
| 10 | **Strip and weapon picker are our own DOM**, not Argon `ButtonPanel`s | no dependence on Argon panel internals; the strip must live across HUD re-renders | `strip.mjs` |
| 11 | **Retarget** uses Argon's picker through an unrendered `ItemButton` subclass's `_onPreLeftClick`; falls back to "target a creature" + the next `targetToken` when Argon's range picker is off | the TargetPicker class is private; registry row `combat-argon-target-picker-reuse` | `hud.mjs registerTargetPicker(...)` → delete it to always use the fallback |
| 12 | **The loop waits for each swing's damage roll** (its `dnd5e.rollDamageV2`, or no RollResolver open) before the next swing | aoe's auto-damage isn't awaited by the hook; on Manual dice swing 2's d20 box opened over swing 1's damage box | `sequence.mjs`: remove the `settleDamage(dmg)` call |
| 13 | Auto riders hook **`dnd5e.preRollDamageV2`** (push `3d6` into `rolls[0].parts`), not `postDamageRollConfiguration` | before configuration dnd5e's crit doubling covers the added dice natively | `riders.mjs autoRiders` |
| 14 | TWF/GWM fallback lives in **this module** (`weaponBonuses`), not as a `when.weapon` rule in pentaryn-riders | keeps riders spell-only and puts the turn/kind knowledge (Attack action vs Hew) where it is tracked | setting `weaponBonuses` off |
| 15 | In Auto mode the card button is hidden **only when the module can see the swing is eligible** (advantage, or an ally adjacent); unknown → the button still shows | Auto must never guess; the player still gets one click | `riders.mjs renderOffer` filter |
| 16 | Auto-rider double-apply guard: 4 s per actor/rider/turn on the roller's client | swing 2's damage can roll before swing 1's flag write lands | `riders.mjs AUTO_GUARD_MS` |
| 17 | Strip **Adv/Dis only ever adds** advantage or disadvantage (never writes `false`) | writing `false` would erase a condition's own disadvantage (Prone, Poisoned…) | `sequence.mjs` `config.rolls` line |
| 18 | First Full Attack click opens the weapon picker **only when nothing is remembered and there is no weapon-set primary**; otherwise straight to the swings | the seeded weapon set makes the picker unnecessary for the PCs | `hud.mjs FullAttackButton._onLeftClick` |
| 19 | **Spell attacks count as another action** (zero the swing pips), and a Multiattack feature use doesn't | a spell attack is the Magic action; Multiattack *is* the Attack action | `combat.mjs onPostRollAttack` / `onPostUseActivity` |
| 20 | With aoe auto-damage **off**, each sequence swing's attack card gets its **own Damage button** (that swing's crit/mode/ammo) | one usage card serves several swings; its own Damage button can't know which | `riders.mjs renderSwingDamage` |
| 21 | NPC "**in any combination**" / "A **or** B" runs the first listed weapon for every swing; right-click Full Attack picks the weapon for the first multi-choice group (remembered) | one click for the GM; per-swing swap is in the pause bar | `hud.mjs chooseWeapon`, `combat-core multiattackPlan` |
| 22 | Multiattack lines that also "use" a non-attack (Constrict, Spellcasting activity links, "replace one attack with …") count only the attacks | those aren't swings | `combat-core parseMultiattack`; fixtures 206, 209, 213 |
| 23 | Rider table includes **Divine Strike** by identifier `divine-strike` | spec row "Divine Strike / Blessed Strikes"; Blessed Strikes is a choice feature, not matched | `TURN_RIDERS` — remove the row; **identifier unverified** against the PHB pack |
| 24 | Settings re-render the HUD on change | so the GM sees a toggle take effect | `settings.mjs onChange` |
| 25 | Six `combat-*` rows in `foundry/adjustments.yml` | the Saturday updater's exposure check now sees our Argon/dnd5e reliance | delete the rows with the module |

### 15.3 Still to do before "shipped"

1. `make foundry-combat-sync`, restart Foundry (new module.json), enable `pentaryn-combat`.
2. Run the §15.1 live probes on a `ZZ Melee Probe`, then the §13 case table (A–H, P, R, Z).
3. Prove or drop native rule effects for TWF/GWM (`fixFeats`), then decide `weaponBonuses`' default.
4. Record H1 before/after: `game.actors.getName("Caven").getFlag("enhancedcombathud","weaponSets")` (and Marrith, Talo) — the GM-ready seed writes these once.
5. Rows in `context/foundry/README.md`, a dated entry in `context/pentaryn.md`, this plan → `status: built`.

### 15.4 Adversarial review (2026-10-10, Opus) — bugs fixed, and how to revert each

Read against the dnd5e 6.0.6 / Argon 5.0.1 / core 14.369 sources; two read-only probes (PHB feature
identifiers, the real PCs' attack items) and one self-cleaning scratch probe (`ZZ Replace Probe`,
created and deleted in the same call) that proved #1. Fixtures 175 → 198. Still **not synced**.

| # | Bug (severity) | Fix | Revert / where |
|---|---|---|---|
| R1 | **Critical — Sneak Attack spent forever.** `setFlag(turn, fresh)` *merges* nested objects: a new turn's `riders: {}` kept last turn's `"sneak-attack": "used"` (probe: K1 → K2 still `used`); Undo and New turn (key deletion) never landed either | turn flag written whole with v14 `_replace` (fallback `==turn`) | `shapes.mjs writeTurn` |
| R2 | **Critical — no rider offer, no auto rider, no per-swing Damage button at all.** `message.system.activity` is dnd5e 6's stored *reference* `{id,img,name,type:"attack",uuid}`, which the `type === "attack"` test took for the Activity; it has no actor | `message.getAssociatedActivity()`, uuid fallback | `riders.mjs attackActivity` |
| R3 | **High — spells written into the real PCs' weapon sets.** Seed/Full Attack/swap tiles took any item with an attack activity: Caven set 1 = **Vampiric Touch**, set 2 = **Fire Bolt**; Marrith = **Alter Self** / Chromatic Orb; Talo = **Thorn Whip** / **Guiding Bolt**; Torch (consumable) offered as a weapon | shape `weaponLike` / `isWeapon`; `canSwing`, `offhandCapable`, `weaponSetSeed` use them; seed skips class-less actors (item piles) and Wild Shape forms. Now: Caven Dagger + Dagger, Marrith Dagger, Talo Staff of the Woodlands | `combat-core canSwing/offhandCapable/weaponSetSeed`, `offhand.mjs seedWeaponSets`; fixtures 40a–40f, 237–239 |
| R4 | **High — follow-ups never appeared after a Full Attack** (Off-hand, Hew, Pole Strike): Bonus/Special re-renders were skipped while the sequence ran and nothing re-checked at its end | re-check on every flag write (signature-guarded) and on `pentarynCombat.sequenceEnd` after the write chain settles | `hud.mjs checkBars`, `sequence.mjs` finally |
| R5 | **High (perf, laptop heat) — every swing and every turn change rebuilt the Bonus/Special bars**, leaking Argon drawer panels into the HUD container and a weapon-set hook per rebuild | bars re-render only when their follow-up signature changed; old drawers/hooks/item buttons disposed first (registry row `combat-argon-rerender-cleanup`) | `hud.mjs SIGS / forgetButtons` |
| R6 | **Usability — Action Surge blocked.** After two swings Full Attack said "No swings left" and pips sat at 0 | `recordSurge` on the `action-surge` feature; swings = count × (1 + surges − other Actions); pips widen 2 → 4 | `combat-core swingsLeft/pipState/attackActions`, `combat.mjs onPostUseActivity`; fixtures 117–119d |
| R7 | **Rules — Sneak Attack offered (and auto-added) on a thrown Handaxe/Javelin** ("Finesse or Ranged weapon"; Thrown makes a ranged attack with a Melee weapon) and on ranged **spell** attacks (Fire Bolt) | thrown no longer counts as ranged; riders only ride weapon attacks | `riderEligibility`, `riders.mjs offersFor`; fixtures 159, 159b |
| R8 | **Medium — out of combat the Bonus pip stuck spent forever** (Argon resets it only on a new round) → after one off-hand/Flurry, follow-ups hidden until the next combat; "New turn" couldn't clear it | Bonus pip read/marked only in combat | `hud.mjs followUpsNow`, `bonusSpent` hook |
| R9 | **Medium — `_pentarynPips` was true for every actor**, so a 1-swing Rogue with a Nick pair never had Argon's Action pip spent by Full Attack, and the off-hand pip correction never ran for 1-swing dual-wielders (most rogues/rangers 1–4) | `_pentarynPips()` is "our pips count this actor" (2+ swings); off-hand correction skipped for sequence swings (Argon never greyed those) and out of combat | `hud.mjs overridePips`, usage/offhand hooks |
| R10 | **Medium — Retarget cancelled = attack nobody.** Argon's picker clears targets first (`rangepickerclear`); a right-click cancel resumed the swing with no target | cancel stays paused and restores the previous targets | `sequence.mjs` retarget branch, `restoreTargets` |
| R11 | **Medium — Pole Strike gate was a no-op**: Polearm Master is a feat, so Argon puts Pole Strike in the "Use Feature" drawer, not on the bar; the old test would also have hidden Reactive Strike | gate the activity named Pole Strike (bonus attack) when drawer buttons render | `hud.mjs isPoleStrike/gatePoleStrike`, `renderItemButtonArgonComponent` |
| R12 | Spell attacks counted per *roll* as another Action (Scorching Ray = 3 Actions; broke the surge maths) | counted once per cast in `postUseActivity` | `combat.mjs onPostUseActivity` |
| R13 | Classification read the sequence tag after an `await` (tag already cleared) and TWF/GWM read a stale per-activity kind when aoe's damage hook ran before ours | tag captured in `preRollAttackV2`; classify before the first await | `combat.mjs lastTag/kindOf` |
| R14 | Shift/Alt/Ctrl on the Full Attack click never skipped swing 1's dialog (explicit `configure: true` beats dnd5e's `??=`) | swing 1 leaves `configure` unset | `sequence.mjs` rollAttack call |
| R15 | A main swing could inherit a remembered Offhand mode (when `offhandModeReset` is off) | main swings override only a remembered Offhand | `sequence.mjs` |
| R16 | Turn key used the turn *index*: adding a summon mid-turn re-keyed the turn (Sneak Attack back) | key = `combat:round:combatantId` | `shapes.mjs combatContext` |
| R17 | A paused sequence survived the end of the turn | aborted on turn change | `hud.mjs updateCombat` |
| R18 | Rider damage card took whatever was targeted at click time; two quick clicks could roll Sneak Attack twice | rider roll carries the swing's targets; in-flight guard | `riders.mjs rollRider` |
| R19 | "two [A] attacks **or** two [B] attacks" parsed as 4 swings; the remembered pick only applied to group 0 | merged as one choice; `pick["*"]` applies to the group offering it | `parseMultiattack`, `multiattackPlan`; fixtures 222a, 225–227 |
| R20 | `game.pentaryn.combat.plan()` ignored the weapon set (could differ from the HUD button) | shared `chosenWeapon` | `shapes.mjs` |
| R21 | **High — re-rendering a bar emptied its weapon-set slot.** A new slot gets its weapon only from `argon-onSetChangeUpdateItem` (WeaponSets render / set click), so after our panel-only re-render (right-click weapon pick; each follow-up change) the main-hand slot (Action) and off-hand slot (Bonus) were hidden — no single-weapon click left | after a re-render the new slots get the current set via their own `_onSetChange` (no equip side effects). pentaryn-transform's Starry-Form `bonus.render()` has the same gap for the Bonus slot | `hud.mjs refillWeaponSlots` |
| R22 | **Rules — Full Attack fired a Loading crossbow twice.** 2024 Loading: one piece of ammunition per action "regardless of the number of attacks" | a Loading weapon gives 1 swing unless Crossbow Expert; the pips and the button still use the actor's best count (a second swing with another weapon; right-click to switch) | `combat-core attackCount` (`weapon.loading`), `hud.mjs fullAttackState pipCount`; fixtures 25–26 |
| R23 | **Medium — stale buttons spent the current turn.** A `+ Sneak Attack` left on an earlier turn's card rolled against that old swing and marked *this* turn used; an old card's Undo cleared this turn's use. Also every swing re-rendered the actor's last 40 cards | rider roll and Undo refuse another turn's card (notice `Rider.Stale`); only this turn's cards and cards showing our buttons re-render | `riders.mjs rollRider`, `renderAutoNote`, `rerenderCards` |
| R24 | Unarmed Strike's **Grapple / Shove** (an Action-cost save activity) counted as a whole other Action and zeroed the swings; 2024 they replace one attack | counted as one swing | `combat.mjs onPostUseActivity` |

**Live checks this review could not do** (add to the §13 run): R1 on a real flag round-trip from a
*player* client; `updateActor` firing for an unlinked token's synthetic actor (Hew kill detection);
Argon drawer disposal (`forgetButtons`) with a drawer open; Action Surge's `postUseActivity` from
Argon's Special bar; R11 Pole Strike hidden inside the drawer and visible after a glaive swing.
