# Pentaryn Combat (`pentaryn-combat`)

**Read this when:** using, playtesting, switching off or changing Full Attack, the swing pips, the
Bonus-bar follow-ups (Off-hand, Nick, Flurry, Martial Arts, Hew, Pole Strike), the Sneak Attack offer,
NPC / Wild Shape Multiattack or the Argon turn flow; or calling `game.pentaryn.combat`.
**Not this file:** design history → [`context/plans/melee-streamlining.md`](../../../context/plans/melee-streamlining.md) ·
how the module was migrated → [`context/plans/addon-blueprint-2026-10/migrate-pentaryn-combat.md`](../../../context/plans/addon-blueprint-2026-10/migrate-pentaryn-combat.md) ·
table use → [`context/foundry/melee.md`](../../../context/foundry/melee.md).

dnd5e 6.0.6 (2024 rules), Foundry 14, Argon (`enhancedcombathud` 5.0.1 + `-dnd5e` 5.2.2). Argon's files
are never edited: the bars are recomposed in `render*ArgonComponent` hooks.

## What the player sees

| Where | What | Click |
|---|---|---|
| Action bar, first button | **Full Attack** (badge = swings left) — only for characters with 2+ swings (Extra Attack…), a Nick pair, or an NPC/form with a parseable Multiattack | Left: every swing, one roll dialog each. Right: pick another weapon (remembered). |
| Action pips | **2 → 1 → 0** for a character with Extra Attack — also when a weapon is clicked by hand | — |
| Above the HUD while it runs | the **swing strip**: "Swing 2 of 3 · Longsword → Goblin", Adv / Dis for the next swing, Quick, Stop, "Enter = Normal · Esc = pause"; the roll windows sit just above it | Esc on a roll **pauses**: Resume / New target / another weapon (tiles show to-hit · damage) / Stop. Esc again stops. **Stop** with a roll window open closes it unrolled; a usage card the stopped run posted with nothing rolled under it goes too (`tidyCancelledAttacks`, 0.2.3). |
| Bonus bar, after the Attack action | **Off-hand: Dagger**, **Hew: Greatsword** (after a crit or a kill), **Pole Strike** (after a glaive / quarterstaff / spear swing), **Flurry of Blows**, **Martial Arts strike** — only what the character qualifies for right now; a new one pulses until the pointer reaches the bar. Argon's own off-hand weapon slot hides while **Off-hand** offers the same weapon, and once Nick or the off-hand attack used the Light extra attack. With Dual Wielder the Off-hand attack stays next to Nick (PHB: two separate extra attacks); its tooltip then names Dual Wielder, not the Light property (0.2.3) | one click → the roll dialog |
| Special bar | **Nick: Scimitar** (free, once per turn), **Sneak Attack: Ask / Auto** toggle, **New turn** (out of combat only) | one click |
| Attack card in chat | **+ Sneak Attack 3d6** (also Frenzy — d6s equal to the Rage Damage bonus, not offered or spent without one — Colossus Slayer, Divine Strike) — roller and GM only, once per turn; tooltip shows advantage ✓ / ally beside the target ? / no disadvantage ✓ | one click → damage card, crit carried, weapon's damage type, no type picker |
| Damage card in Auto mode | "+ Sneak Attack 3d6 [**Undo**]" (a button, 0.2.2) | Undo gives the once-per-turn back after a miss |

**Action Surge** (its feature used on your turn) adds a second Attack action's swings: the pips
widen 2 → 4 and Full Attack offers the next two.

**One attack at a time stays exactly as it was.** Clicking a weapon is Argon's own flow (picker →
dialog → pentaryn-aoe auto-damage); only the pips count it.

**Rolling your own dice.** Every roll here is dnd5e's own `rollAttack` / `rollDamage`, so Configure
Settings → Dice Configuration → *Manual* gives a type-in box per d20 and per damage roll, in order
(the sequence waits for each swing's damage before opening the next swing). Quick mode skips the
*dialog*, never the manual-dice box. Players who'd rather just say the number at the table can
ignore the cards; nothing is applied without the GM's damage tray.

Clicks per case (target budget from the plan):

| Case | Before | Now |
|---|---|---|
| Fighter 5, two swings, target already targeted | 7–8 | 3 (Full Attack, dialog, dialog) — 2 in Quick mode |
| …no target yet | 7–8 | 4 (Argon's picker once) |
| Off-hand after attacking | 4 + change Attack Mode in the dialog | 2 |
| Rogue swing + Sneak Attack | ~6 + a 13-type picker | 3 (weapon, dialog, + Sneak) — 2 in Auto |
| Monk Flurry | ≈6 | 3 (Flurry, dialog, dialog) |
| Pole Strike after a glaive swing | 4 (drawer, tile, activity chooser, dialog) | 2 (Pole Strike, dialog) |
| Rage | 3 (Rage, usage dialog, Apply on the card) | 2 (Rage, usage dialog) |
| Steady Aim then the attack at Advantage | 4 + remember to click Advantage | 3 (Steady Aim, weapon, Enter — the window opens on Advantage) |

## Settings

Every behaviour is one **world setting, default on** (Configure Settings → Pentaryn Combat), a row of
`SETTINGS` in `settings.mjs` with literal `PENTARYN_COMBAT.Setting.<key>.Name/Hint` keys; each is read
live, so a change applies at the next HUD render. Off = the HUD as it was for that behaviour.

| Setting key | What it changes | Off restores | Case |
|---|---|---|---|
| `fullAttack` | Full Attack button + swing strip + weapon picker | no button | A1–A6, G1–G2 |
| `swingPips` | Action pips = swings left (instance getter override) | Argon's single pip | A1, A4, A6 |
| `followUps` | Off-hand / Nick / Flurry / Martial Arts / Hew / Pole Strike buttons | no extra buttons | A5, A7, C1–C2, E1, E2 |
| `gateFollowUps` | Pole Strike greyed (tooltip says when it opens; a click warns) until the Attack action with a Quarterstaff, Spear or Heavy+Reach weapon | Pole Strike always live | E2 |
| `riderOffers` | "+ Sneak Attack" on attack cards, Auto toggle, turn-key stamp on attack messages. A card's button goes when the turn moves on or the combat ends (0.2.4). Auto's **Undo** strikes the rider through on its damage card and says what the card deals without it ("3d6 rolled 12, so this card deals 11"; 0.2.4) | use the feature items by hand | B1–B5, D1, U-3-17, U-3-18 |
| `recklessToggle` | "Reckless Attack: On/Off" on a Barbarian's Special bar: applies the PHB item's Reckless effect plus native Advantage on Strength attacks (`system.abilities.str.attack.roll.mode` +1), until the start of the next turn, when the active GM removes it (any Reckless effect on the actor, 0.2.4); Frenzy's hint reads it | no button; apply Reckless by hand (and remove it) | D1, U-3-16 |
| `weaponBonuses` | TWF `@mod` on off-hand damage; GWM `+@prof` on Heavy hits in the Attack action | add by hand / GWM's own damage button | A8, E1 |
| `offhandModeReset` | after an off-hand roll, the weapon's remembered attack mode goes back to main-hand | dnd5e remembers Offhand | A7 |
| `offhandPip` | off-hand roll greys the Bonus pip and gives the Action pip back | Argon greys the Action pip | A7 |
| `seedWeaponSets` | once, for characters whose `flags.enhancedcombathud.weaponSets` was never written: set 1 melee + Light off-hand, set 2 ranged | nothing seeded (already-seeded flags stay; clear one with a right-click on the slot) | H1 |
| `multiattack` | NPCs and Wild Shape forms get Full Attack from Multiattack | Multiattack card only; Full Attack counts class features alone (Extra Attack…), so an NPC without them gets 1 | G1–G2 |
| `skipPickerGuide` | every client marks Argon's one-time Target Picker Tutorial as seen on load (client setting `enhancedcombathud.targetPickerGuideShown`); Argon's "0/1 Targets" cursor label gains "· right-click cancels" | the label is Argon's own; an unseen browser gets the tutorial once (reset per browser with `game.settings.set("enhancedcombathud","targetPickerGuideShown",false)`) | U-R-2 |
| `specialActions` | Argon's Dash / Disengage / Dodge / Hide / Ready / Shove spend the Action pip and the swing pips (Shove is one swing); **Dash** adds an effect "Dash" (+ each Speed, for this turn); **Disengage** an effect "Disengage" (this turn); **Dodge** keeps Dodging on and it ends at the start of your next turn; **Hide** rolls Stealth vs DC 15 and keeps Hiding only on a success; a warning (never a block) when no Action is left. The active GM removes Dodging at its owner's turn start and our Dash / Disengage at turn end | Argon posts its card, nothing spent, Dodging never ends | U-1-4 |
| `reactionSlot` | the Reaction bar's weapon reads **Opportunity Attack: Longsword**, spends the Reaction pip and records it in combat (`flags.pentaryn-combat.reaction`, so a re-bound HUD keeps it grey until your turn starts), gives back the Action pip Argon took on your own turn, and is never counted as an Attack-action swing | Argon's plain weapon slot | U-1-5 |
| `escRollDialog` | Esc closes a dnd5e roll window at once (its autofocused button used to swallow Esc) | click the window first | U-1-6 |
| `tidyCancelledAttacks` | closing an attack's roll window unrolled deletes its own usage card (only yours, under 5 min old, nothing consumed, nothing rolled under it, no Full Attack running); a Full Attack that ends (Stop) does the same for the cards it posted (0.2.3) | the card stays | U-1-6, U-10-11 |
| `deathSaveDamage` | a character taking damage at 0 HP gets a Death Saving Throw failure, two from a crit (a chat line in the token's name says so once the damage lands); massive damage is whispered to the GM, never applied | the GM edits the tally | U-1-7 |
| `portraitConditions` | status conditions (Prone, Poisoned, Grappled, Dodging, Hiding …) on the Argon portrait, hover = the PHB condition page; right-click removes as usual | Argon shows only effects with a duration (v14) | U-1-8 |
| `hudFollows` | the HUD switches to your creature when its turn starts (players, Argon on), and to the one token left selected after you click one of a selected group. At combat start it checks again once Argon's own start-of-combat bind is done; a token that can't be selected right now (another layer or tool active) is bound to the HUD directly instead of leaving nothing selected (0.2.2). The combat-start check runs also when Argon is still off at that moment (after a deleted combat), at 300 ms and 1.2 s (0.2.3) | toggle Argon to switch | U-1-9, U-10-2, U-10-10 |
| `clearTargetsAfterTurn` | a player's targets are released when their turn ends (the U-R-1 stale-target cost) | targets stay | U-1-10 |
| `dockRollDialogs` | while a Full Attack / follow-up runs, each roll window (and the manual-dice Roll Resolution window) sits with its bottom edge just above the swing strip, at the same height every swing (a window you drag sets the place for the next), and its title reads "… · Longsword, swing 2 of 3"; the window's default button keeps the focus (also after **New target**; **Stop** closes the open window instead, 0.2.3), so the strip's "Enter = Normal" is true; the Roll Resolution box is focused and a digit typed with nothing focused goes into it (never to a hotkey). Outside a sequence a roll window is only kept inside the screen (Lay on Hands' Healing roll) | windows open centred, over the strip; digits may reach the canvas | U-2-3, U-3-13, U-10-4, U-10-11 |
| `scrollingTextGuard` | a background tab starts no floating canvas text and posts no chat-card pop-ups (the chat tab's unread pip lights instead), and a second destroy of a floating text is ignored, and so is moving one that was destroyed mid-animation (core logged "reading 'off'", "setting 'hidden'" and "reading 'position'" bursts on the GM tab) | core behaviour | U-2-6, U-3-14, U-6-15 |
| `bonusPip` | a Bonus-action feature or spell that is not an attack (Rage, Steady Aim, Divine Smite, Lay on Hands, Healing Word…), used on your turn in combat, greys the Bonus pip and marks the turn's Bonus Action used, so Off-hand / Flurry / Hew close (Argon spent nothing for item buttons) | the pip stays lit | U-3-8 |
| `selfEffects` | a feature that affects only you and has exactly one effect (Rage) switches it on when used, through dnd5e's own Apply code (read with dnd5e 6's `getEffect()`, 0.2.4) | click Apply on its card | U-3-9, U-3-21 |
| `steadyAim` | Steady Aim adds an effect "Steady Aim": every attack roll mode +1 (the roll window opens on Advantage) and Speed 0; after the next attack only the Speed 0 stays, gone at the end of your turn (out of combat: gone after the attack) | only the card; click Advantage yourself | U-3-10 |
| `drawerNearButton` | Argon's drawers (Use Feature, Cast Spell…) open above the button that opened them, inside the action row, and stay above it when the bar is rebuilt with the drawer open (Pole Strike appearing; 0.2.2). A turn boundary closes the drawers left open on the HUD of the creature whose turn ended or began, and Argon's saved "open" state for them is cleared, so last turn's Cast Spell drawer does not reopen (0.2.4) | Argon's far-left position; a drawer stays open across turns | U-3-11, U-10-1, U-3-19 |
| `spellPips` | an Action spell or feature used from the HUD (Fire Bolt, Fireball, Magic) greys Argon's single Action pip; a Reaction (Counterspell, Shield) greys the Reaction pip on any turn and it comes back at the start of your turn; a re-bound HUD or a new round repaints the pips that were spent | spells spend no pip | U-5-8 |
| `quickenedSpell` | after Quickened Spell on your turn, the next 1-Action spell spends the Bonus pip (notice "Quickened: X is your Bonus Action") and the Action stays free | Quickened only spends points | U-5-9 |
| `helperTokenControl` | when an area handle you dragged or a summon you had selected is deleted and nothing else is selected, your caster's token is selected again, so the HUD stays up | nothing selected, the HUD closes | U-5-10 |
| `enterUses` | in a dnd5e usage window (Lay on Hands' points, any scaling amount), **Enter** in a number or text box takes the number and presses Use Ability (dnd5e's Use is not a submit button, so Enter only committed the number; 0.2.4) | Enter commits the number; click Use Ability | U-3-20 |

**Argon setting this module is tuned for:** *Target Picker - Clear Targets*
(`enhancedcombathud.rangepickerclear`) **off**, Argon's default. A target set with **T** before
clicking a weapon by hand then goes straight to the roll dialog. With it on, every hand click
clears the target and waits on "0/1 Targets" (U-R-1). Full Attack's **New target** clears the
target itself, so it works either way.

Per player (user flags, not settings): **Quick** (`flags.pentaryn-combat.quick`, the strip's
checkbox) and **rider Ask/Auto** (`flags.pentaryn-combat.riders.<key>`, the Special-bar toggle).

Per player (user flags, not settings): **Quick** (`flags.pentaryn-combat.quick`, the strip's checkbox)
and **rider Ask/Auto** (`flags.pentaryn-combat.riders.<key>`, the Special-bar toggle).

## API — game.pentaryn.combat

Built from `api-manifest.mjs` by the kit, frozen, published at `ready` (`game.modules.get("pentaryn-combat").api`
is canonical; `game.pentaryn.combat` the alias; `pentaryn-combat.ready` fires). `describe()` lists every row.

| Member | Does |
|---|---|
| `count(actor, weaponId?)` | swings the Attack action gives |
| `plan(actor, weaponId?)` | `{swings, count, left, weaponId}` Full Attack would make now |
| `turn(actor)` · `newTurn(actor)` | this turn's flag (fresh if stale) · out-of-combat reset (writes) |
| `multiattack(actor)` · `weapons(actor)` | parsed Multiattack `{total, groups, plan, source}` · weapon shapes |
| `offers(message)` · `rollRider(message, key)` | rider eligibility on an attack card · roll one rider |
| `fullAttack(actor, weaponId?, opts?)` · `followUp(actor, followUp, opts?)` | what the buttons do |
| `reckless(actor)` · `setReckless(actor, on)` | Reckless Attack state · toggle |
| `running()` · `abort(actor?)` | the sequence running on this client · stop it |
| `quick()` · `setQuick(on)` · `riderMode(key)` · `setRiderMode(key, mode)` | this user's choices |
| `report(actorOrName?)` | GM audit: riders, dice, turn flags, remembered weapons |
| `fixFeats(actor, {apply})` | native rule-effect plan for TWF / GWM (report only) |
| `seedWeaponSets(actor)` · `seedAll()` | GM: fill empty Argon weapon sets |
| `inspect(ref, {as})` | read-only state, plain JSON depth ≤ 4: key, turn, stored/stale, plan, pips, spentPips, reaction, followUps (computed without the Argon panel), riders, reckless, running, settings. A viewer without OBSERVER (`as`) gets actor, key, inCombat, isOwnTurn only |
| `coversMultiattack(ref)` | the Multiattack item id when Full Attack runs it (transform hides that button) |
| `selftest()` · `describe()` · `settings()` · `trace()` · `uninstall()` · `version` · `contract` | kit members |
| `core` | a frozen copy of the pure core |

The legacy members that take an actor accept an Actor, Token, UUID, 16-character id or exact name
(never a substring); a miss answers `null`. `inspect` and `coversMultiattack` throw `NOT_FOUND` /
`AMBIGUOUS` / `BAD_ARGS` instead.

```js
game.pentaryn.combat.plan("ZZ Fighter 5"); await game.pentaryn.combat.fullAttack("ZZ Fighter 5");
CONFIG.debug["pentaryn-combat"] = true; game.pentaryn.combat.trace();   // why a swing counted
```

## Data written

| Where | Key | When |
|---|---|---|
| actor | `flags.pentaryn-combat.turn` | each swing / rider / follow-up / Action Surge — `{key: "combat:round:combatantId", …}` — the combat is the started one the actor is in, not merely the one this client views (U-4-0) — `{attackAction, riders, followUps, nick, bonusUsed, otherActions, surges}`; self-invalidating (another turn's key reads as fresh). Always written whole (v14 `_replace`): a plain `setFlag` merges nested objects and carried last turn's used Sneak Attack into every later turn. Removed by the active GM when its combat is deleted (0.2.1; the out-of-combat `nocombat` turn stays) |
| actor | `flags.pentaryn-combat.reaction` | `{combatId}` when a Reaction is taken in combat; set to null at the actor's turn start, removed when that combat is deleted (0.2.1) |
| actor | (sweep) | the active GM removes every world actor's `turn` / `reaction` flag whose combat no longer exists, on load and once 1.5 s after the last of a burst of combat deletes, never two sweeps at a time (perf-4; 0.2.2; a combat deleted with no GM online, or before 0.2.1, left them for good) |
| combat | `flags.pentaryn-combat.claims.t<round>_<turn>` | the claiming GM tab's socket id at each turn change (ac-4: one GM tab sweeps); gone with the combat |
| actor | `flags.pentaryn-combat.last.weapon` | after a Full Attack / weapon pick |
| actor (character) | `flags.enhancedcombathud.weaponSets` | once, only if never written (`seedWeaponSets`) |
| item | `flags.dnd5e.last.<activity>.attackMode` | reset to main-hand after an off-hand roll |
| attack message | `flags.pentaryn-combat.turnKey`, `.swing` | every attack roll / every sequence swing |
| damage message | `flags.pentaryn-combat.auto` / `.rider` | an auto rider / a rider roll |
| damage message | `flags.pentaryn-combat.undone` | `["sneak-attack"]` when that card's auto rider was Undone (written by the card's author or the GM; 0.2.4) |
| actor effect | "Dash" / "Disengage", `flags.pentaryn-combat.{until: "turnEnd", special}`, `flags.dnd5e.isTemporary` | Argon's Dash / Disengage on your turn; deleted at your turn end |
| actor | `system.attributes.death.failure` | damage at 0 HP (`deathSaveDamage`) |
| actor effect | Reckless, `flags.pentaryn-combat.reckless` | the Special-bar toggle; removed at the actor's turn start |
| actor effect | "Steady Aim", `flags.pentaryn-combat.{until: "turnEnd", special: "steady-aim"}` | Steady Aim used (`steadyAim`) |
| damage message | `flags.pentaryn-combat.attack` | a rider roll: the attack card it rode |

Optional overrides on an actor: `flags.pentaryn-combat.attacks` (integer swing count),
`.multiattack` (`[{item, count}]`), `.pactWeapon` on a weapon (Thirsting Blade).

## Flags other modules read

None directly. pentaryn-transform asks this module's published `coversMultiattack(ref)` to hide a covered
Multiattack button (transform-creatures-13); it reads no combat setting.
This module reads `flags.pentaryn-aoe.handle` (an area handle) and pentaryn-aoe's `autoDamageOnHit` setting.

## Events

Core `HOOKS` rows, fired with `ctx.emit`; none is vetoable. Each also fires under its old name (after
the new one) until `pentaryn-combat 0.4.0`.

| Event | Args | Old name |
|---|---|---|
| `pentaryn-combat.usage` | `(activity, kind)` the runner used the item | `pentarynCombat.usage` |
| `pentaryn-combat.offhand` | `(actor, {bySequence})` an off-hand swing was rolled | `pentarynCombat.offhand` |
| `pentaryn-combat.bonusSpent` | `(actor, kind)` a swing or follow-up spent the Bonus Action | `pentarynCombat.bonusSpent` |
| `pentaryn-combat.bonusAction` | `(actor, activity)` a Bonus-action feature or spell used | `pentarynCombat.bonusAction` |
| `pentaryn-combat.reaction` | `(actor, activity)` a Reaction used (any turn) | `pentarynCombat.reaction` |
| `pentaryn-combat.otherAction` | `(actor, activity)` a non-attack Action on your turn | `pentarynCombat.otherAction` |
| `pentaryn-combat.sequenceEnd` | `(actor)` a Full Attack or follow-up ended | `pentarynCombat.sequenceEnd` |

## Patches and adjustments

Prototype patches go through the kit (`wrapMethod` / `defineAccessor`) and show in `describe().patches`:
`PreciseText#destroy`, `#x`, `#y`, `InterfaceCanvasGroup#createScrollingText`, `ChatLog#notify`
(`scrollingTextGuard`), `PortraitPanel#getEffects` (`portraitConditions`), `ActionPanel#updateActionUse`
(the pip settle). Argon buttons are wrapped per instance in their render hooks. Every wrap, private read
and foreign flag has a row in `foundry/adjustments.yml` (`combat-*` patch rows; `argon-*` / `dnd5e-*` /
`core-*` workarounds).

## Two sessions / who writes

The turn flag is written by the actor's owner (`updateTurn`, serialised per actor on one client).
The active GM alone sweeps effects at a turn boundary, gives the Reaction back, clears a deleted
combat's flags (one write per actor), sweeps orphans at load (every actor in one `Actor.updateDocuments` batch, ac-5) and seeds weapon sets. Of two GM tabs, one claims each turn on the Combat (`claimDocument`) and sweeps; the other stands down (ac-4).
A deleted combat's cleanup runs in both, idempotently: an effect already gone is skipped or its "does not exist" is success (debug); a gone flag key is a no-op.

## Extending

- **A setting:** a `SETTINGS` row (key, literal Name/Hint, doc), the two lang keys, `setting(key)` where it applies.
- **A turn rider:** a `TURN_RIDERS` row in `core/turn-riders.mjs`, its `Rider.Name/Rule` keys in `I18N_KEYS` and lang.
- **A follow-up kind:** `core/followups.mjs` `followUps`, a `runFollowUp` branch in `sequence.mjs`, its `FollowUp*` keys.
- **A special action:** `SPECIAL_ACTIONS` / `recordSpecialAction` in `core/turnflow.mjs`, its `AFTER` row in `turnflow/action-buttons.mjs` (`swing` / `onTurn` / `always`; a test checks every kind has one).

**Which riders module?** Once-per-turn attack-card riders (Sneak Attack, Frenzy, Colossus Slayer, Divine
Strike) are here; damage/heal rule riders, rituals, concentration and Argon tidy-ups are pentaryn-riders.

## Pitfalls

- **A Cunning Action or Step of the Wind Dash / Disengage** (an item of the actor's, Bonus action) runs
  through dnd5e and gets no Dash effect; add the movement by hand. (Argon's own item-less Dash /
  Disengage / Dodge / Hide / Ready / Shove are handled by `specialActions` and spend the pips, confirmed
  live in Area 10; Argon's movement readout now follows the Dash effect, 0.2.2.)
- **No Opportunity Attack prompt** when an enemy leaves reach: the player clicks the Reaction weapon.
- **Bladesinger / Valor Bard "replace one attack with a cantrip"** is not modelled: the cantrip counts
  as another Action and zeroes the remaining swings (clicking the weapon by hand still works).
- **Rewinding the tracker.** The actor keeps one turn flag. Rewinding to a turn of the same actor with
  nothing done on a later turn restores that turn (swings and Sneak Attack as spent); once the actor
  has acted on a later turn, rewinding to the earlier one reads as a fresh turn. (A pause-bar swap
  onto the Nick weapon no longer keeps the planned Nick swing: the swap replans it, 0.2.2.)

- **Divine Smite crit carry** is native and unchanged: the smite rolls its own card; on a crit pick
  Critical in its dialog. It now spends the Bonus pip (`bonusPip`).
- **A Monk weapon rolls STR** until the Martial Arts "Master Simple Weapon" enchantment is applied
  to it once. A Monk built by the prompt-markers `character` helper gets it on every qualifying weapon
  (pentaryn-prompts 0.4.3, U-10-6); a hand-built or imported Monk's player applies it from the
  Martial Arts card.
- **TWF / GWM via native rule effects** (`fixFeats`) is report-only until a live check proves a
  conditioned `damage:bonus` change works in 6.0.6; the `weaponBonuses` fallback does it meanwhile.
  With it on, don't also click GWM's own "Heavy Weapon Damage" button.
- **Auto Sneak Attack** goes on the first eligible swing's damage; the module can't see hit/miss
  (players don't), so a miss needs the **Undo** on the card.
- **Multiattack "in any combination"** runs the first listed weapon for every swing; right-click
  Full Attack to pick another, or pause and swap per swing.
- **C23 open:** this module still reads pentaryn-aoe's `autoDamageOnHit` setting directly: aoe's
  `settings()` member is published at `ready`, but chat cards first render before it.

## Files

Load order: `combat.mjs` (esmodules[0]) installs `roll-dock.mjs` as it evaluates; at setup `counting.mjs`,
`turn-riders.mjs`, `offhand.mjs`, `sequence.mjs`; at ready `api.mjs` builds the API. `hud.mjs`
(esmodules[1]) installs `turnflow/*` and `patches.mjs`, then `hud/tooltips.mjs`, `hud/picker.mjs`,
`hud/bars.mjs`. `context.mjs` is their shared ctx, plus the features' one `opts(label)` and one
`tempHooks(getReg)`. Pure: `combat-core.mjs` + `core/*.mjs`. Settings: `settings.mjs`. API:
`api-manifest.mjs`, `api.mjs`. Adapters: `shapes.mjs`, `argon.mjs`, `dialog-adapter.mjs`. UI: `strip.mjs`, `hud/buttons-ui.mjs`, `hud/pips-bar.mjs`. Vendored kit: `lib/` (never edited here).

## Tests

`node test/run.mjs` from the module folder (node:test files + the legacy core fixtures; goldens in
`test/golden/`, re-pin one file with `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs`).

## Sync

`make foundry-combat-check`, then `make foundry-combat-sync` and a reload (`module.json`: restart).
