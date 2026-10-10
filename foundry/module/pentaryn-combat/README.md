# Pentaryn Combat

**Read this when:** using, playtesting, switching off or changing Full Attack, the swing pips, the
Bonus-bar follow-ups (Off-hand, Nick, Flurry, Martial Arts, Hew), the Sneak Attack offer, or NPC /
Wild Shape Multiattack on the Argon HUD.
**Design history:** [`context/plans/melee-streamlining.md`](../../../context/plans/melee-streamlining.md).

dnd5e 6.0.6 (2024 rules), Foundry 14, Argon (`enhancedcombathud` 5.0.1 + `-dnd5e` 5.2.2). Argon's
files are never edited; the bars are recomposed from `render*ArgonComponent` hooks like
`pentaryn-transform/hud.mjs` does.

## What a player sees

| Where | What | Click |
|---|---|---|
| Action bar, first button | **Full Attack** (badge = swings left) — only for characters with 2+ swings (Extra Attack…), a Nick pair, or an NPC/form with a parseable Multiattack | Left: every swing, one roll dialog each. Right: pick another weapon (remembered). |
| Action pips | **2 → 1 → 0** for a character with Extra Attack — also when a weapon is clicked by hand | — |
| Above the HUD while it runs | the **swing strip**: "Swing 2 of 3 · Longsword → Goblin", Adv / Dis for the next swing, Quick, Stop | Esc on a roll **pauses**: Resume / New target / another weapon / Stop. Esc again stops. |
| Bonus bar, after the Attack action | **Off-hand: Dagger**, **Hew: Greatsword** (after a crit or a kill), **Flurry of Blows**, **Martial Arts strike** — only what the character qualifies for right now | one click → the roll dialog |
| Special bar | **Nick: Scimitar** (free, once per turn), **Sneak Attack: Ask / Auto** toggle, **New turn** (out of combat only) | one click |
| Attack card in chat | **+ Sneak Attack 3d6** (also Frenzy, Colossus Slayer, Divine Strike) — roller and GM only, once per turn; tooltip shows advantage ✓ / ally beside the target ? / no disadvantage ✓ | one click → damage card, crit carried, weapon's damage type, no type picker |
| Damage card in Auto mode | "+ Sneak Attack 3d6 · **Undo**" | Undo gives the once-per-turn back after a miss |

**Action Surge** (its feature used on your turn) adds a second Attack action's swings: the pips
widen 2 → 4 and Full Attack offers the next two.

**One attack at a time stays exactly as it was.** Clicking a weapon is Argon's own flow (picker →
dialog → pentaryn-aoe auto-damage); only the pips count it.

**Rolling your own dice.** Every roll here is dnd5e's own `rollAttack` / `rollDamage`, so Configure
Settings → Dice Configuration → *Manual* gives a type-in box per d20 and per damage roll, in order
(the sequence waits for each swing's damage before opening the next swing). Quick mode skips the
*dialog*, never the manual-dice box. Players who'd rather just say the number at the table can
ignore the cards; nothing is applied without the GM's damage tray.

### Clicks (target budget from the plan)

| Case | Before | Now |
|---|---|---|
| Fighter 5, two swings, target already targeted | 7–8 | 3 (Full Attack, dialog, dialog) — 2 in Quick mode |
| …no target yet | 7–8 | 4 (Argon's picker once) |
| Off-hand after attacking | 4 + change Attack Mode in the dialog | 2 |
| Rogue swing + Sneak Attack | ~6 + a 13-type picker | 3 (weapon, dialog, + Sneak) — 2 in Auto |
| Monk Flurry | ≈6 | 3 (Flurry, dialog, dialog) |

## Adjustments — what each setting changes and how to turn it off

Every behaviour is one **world setting, default on** (Configure Settings → Pentaryn Combat). Off =
the HUD as it was before this module for that behaviour. The playtest case is from plan §13.

| Setting key | What it changes | Off restores | Case |
|---|---|---|---|
| `fullAttack` | Full Attack button + swing strip + weapon picker | no button | A1–A6, G1–G2 |
| `swingPips` | Action pips = swings left (instance getter override) | Argon's single pip | A1, A4, A6 |
| `followUps` | Off-hand / Nick / Flurry / Martial Arts / Hew buttons | no extra buttons | A5, A7, C1–C2, E1 |
| `gateFollowUps` | Pole Strike greyed (tooltip says when it opens; a click warns) until the Attack action with a Quarterstaff, Spear or Heavy+Reach weapon | Pole Strike always live | E2 |
| `riderOffers` | "+ Sneak Attack" on attack cards, Auto toggle, turn-key stamp on attack messages | use the feature items by hand | B1–B5, D1 |
| `recklessToggle` | "Reckless Attack: On/Off" on a Barbarian's Special bar: applies the PHB item's Reckless effect plus native Advantage on Strength attacks (`system.abilities.str.attack.roll.mode` +1), until the start of the next turn; Frenzy's hint reads it | no button; apply Reckless by hand | D1 |
| `weaponBonuses` | TWF `@mod` on off-hand damage; GWM `+@prof` on Heavy hits in the Attack action | add by hand / GWM's own damage button | A8, E1 |
| `offhandModeReset` | after an off-hand roll, the weapon's remembered attack mode goes back to main-hand | dnd5e remembers Offhand | A7 |
| `offhandPip` | off-hand roll greys the Bonus pip and gives the Action pip back | Argon greys the Action pip | A7 |
| `seedWeaponSets` | once, for characters whose `flags.enhancedcombathud.weaponSets` was never written: set 1 melee + Light off-hand, set 2 ranged | nothing seeded (already-seeded flags stay; clear one with a right-click on the slot) | H1 |
| `multiattack` | NPCs and Wild Shape forms get Full Attack from Multiattack | Multiattack card only | G1–G2 |

Per player (user flags, not settings): **Quick** (`flags.pentaryn-combat.quick`, the strip's
checkbox) and **rider Ask/Auto** (`flags.pentaryn-combat.riders.<key>`, the Special-bar toggle).

## Data written

| Where | Key | When |
|---|---|---|
| actor | `flags.pentaryn-combat.turn` | each swing / rider / follow-up / Action Surge — `{key: "combat:round:combatantId", …}` — the combat is the started one the actor is in, not merely the one this client views (U-4-0) — `{attackAction, riders, followUps, nick, bonusUsed, otherActions, surges}`; self-invalidating (another turn's key reads as fresh). Always written whole (v14 `_replace`): a plain `setFlag` merges nested objects and carried last turn's used Sneak Attack into every later turn |
| actor | `flags.pentaryn-combat.last.weapon` | after a Full Attack / weapon pick |
| actor (character) | `flags.enhancedcombathud.weaponSets` | once, only if never written (`seedWeaponSets`) |
| item | `flags.dnd5e.last.<activity>.attackMode` | reset to main-hand after an off-hand roll |
| attack message | `flags.pentaryn-combat.turnKey`, `.swing` | every attack roll / every sequence swing |
| damage message | `flags.pentaryn-combat.auto` / `.rider` | an auto rider / a rider roll |

Optional overrides on an actor: `flags.pentaryn-combat.attacks` (integer swing count),
`.multiattack` (`[{item, count}]`), `.pactWeapon` on a weapon (Thirsting Blade).

## API — `game.pentaryn.combat`

```js
const a = game.actors.getName("ZZ Fighter 5");
game.pentaryn.combat.count(a)               // swings the Attack action gives
game.pentaryn.combat.plan(a)                // {swings, count, left, weaponId} Full Attack would make now
await game.pentaryn.combat.fullAttack(a)    // what the button does
game.pentaryn.combat.turn(a)                // this turn's flag (fresh if stale)
await game.pentaryn.combat.newTurn(a)       // out-of-combat reset
game.pentaryn.combat.multiattack(npc)       // parsed Multiattack {total, groups, plan}
game.pentaryn.combat.report()               // riders per PC, turn flags, remembered weapons
game.pentaryn.combat.fixFeats(a)            // native rule-effect plan for TWF/GWM (report only, see below)
await game.pentaryn.combat.seedAll()        // GM: seed empty weapon sets now
```

## Known gaps

- **Argon's built-in Dash / Disengage / Dodge / Help / Hide buttons** (when the actor has no such
  item) post a plain chat card and fire no dnd5e hook, so for an Extra Attack character they don't
  zero the swing pips; the player just doesn't press Full Attack. An item-backed action (any
  activity with an Action cost) does zero them.
- **Bladesinger / Valor Bard "replace one attack with a cantrip"** is not modelled: the cantrip counts
  as another Action and zeroes the remaining swings (clicking the weapon by hand still works).
- **A swing strip swap onto the Nick weapon** keeps the planned Nick swing; the GM arbitrates.
- **Rewinding the tracker** to an earlier turn reads as a fresh turn (swings and Sneak Attack back).

- **Divine Smite crit carry** is native and unchanged: the smite rolls its own card; on a crit pick
  Critical in its dialog.
- **TWF / GWM via native rule effects** (`fixFeats`) is report-only until a live check proves a
  conditioned `damage:bonus` change works in 6.0.6; the `weaponBonuses` fallback does it meanwhile.
  With it on, don't also click GWM's own "Heavy Weapon Damage" button.
- **Auto Sneak Attack** goes on the first eligible swing's damage; the module can't see hit/miss
  (players don't), so a miss needs the **Undo** on the card.
- **Multiattack "in any combination"** runs the first listed weapon for every swing; right-click
  Full Attack to pick another, or pause and swap per swing.

## Files

`combat.mjs` entry, swing counting, API · `combat-core.mjs` pure rules (node-tested, `test/run.mjs`)
· `shapes.mjs` Foundry → plain data, turn flag · `sequence.mjs` the swing loop · `strip.mjs` strip
and weapon picker DOM · `hud.mjs` Argon bars · `riders.mjs` once-per-turn riders · `offhand.mjs`
mode reset, weapon-set seed · `settings.mjs`.

`make foundry-combat-check` (parse, imports, i18n, 198 fixtures) · `make foundry-combat-sync` to install.
Registry rows `combat-*` in `foundry/adjustments.yml`.
