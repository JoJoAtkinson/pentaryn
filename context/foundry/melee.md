# Melee — Full Attack, follow-ups, Sneak Attack

**Read this when:** a player asks how to swing more than once, use an off-hand or Nick attack, add Sneak Attack, or why a combat button is missing or greyed; or you are switching a melee behaviour off.
**Full reference:** [`foundry/module/pentaryn-combat/README.md`](../../foundry/module/pentaryn-combat/README.md) (every setting key, flag and API call). Design history: [`context/plans/melee-streamlining.md`](../plans/melee-streamlining.md).

Module `pentaryn-combat` extends the Argon HUD; Argon's files are untouched. Each behaviour is a world setting, default on; off restores the old HUD for that behaviour.

## What players get

- **Full Attack** is the first button on the Action bar for anyone with 2+ swings, a Nick pair, or an NPC/form with a Multiattack. Left-click runs every swing (one roll dialog each); right-click picks another weapon. Esc pauses (resume, new target, swap weapon, stop).
- **One swing at a time** still works: click a weapon. The pips count it. A target already set with **T** goes straight to the roll dialog. With nothing targeted, Argon's "0/1 Targets · right-click cancels" picker opens. This relies on Argon's *Target Picker - Clear Targets* being off (U-R-1). Argon's one-time Target Picker Tutorial is skipped (`skipPickerGuide`, U-R-2).
- **Bonus bar** shows Off-hand, Hew, Pole Strike, Flurry of Blows, Martial Arts strike only when the character qualifies right now (a new one pulses until you point at the bar). Any Bonus-action feature or spell used on your turn (Rage, Steady Aim, Divine Smite, Lay on Hands) greys the Bonus pip and closes them (`bonusPip`). Rage switches its effect on by itself (`selfEffects`); Steady Aim opens the next attack on Advantage and sets Speed 0 (`steadyAim`). Argon's drawers open above their own button (`drawerNearButton`). **Special bar** shows Nick, the Sneak Attack Ask/Auto toggle, Reckless Attack.
- **Sneak Attack** (also Frenzy, Colossus Slayer, Divine Strike): a "+ Sneak Attack" button on the attack card, once per turn, crit carried; the button goes when the turn moves on. Auto mode adds it to the first eligible swing, with Undo after a miss; Undo strikes it through on the damage card and says what the card deals without it (U-3-18).
- **Lay on Hands** and any usage window with a number box: **Enter** in the box uses it (`enterUses`, U-3-20). Healing is applied by the GM from the card's tray, as damage is, while dnd5e's *Allow players to apply damage* is off (this world's setting).
- **Turn flow** (`turnflow.mjs`, each a setting): Dash / Dodge / Disengage / Hide on the Action bar spend the Action and do what the PHB says (Dash adds your Speed, Dodge ends at your next turn, Hide rolls Stealth DC 15); the Reaction weapon is **Opportunity Attack** and spends the Reaction; Esc closes a roll window, and a cancelled attack's card goes; damage at 0 HP adds a death save failure; conditions show on the portrait; the HUD follows your creature's turn; your targets are let go when your turn ends.
- **Own dice:** Dice Configuration set to Manual gives a type-in box per roll; Quick mode skips dialogs, never the manual box.
- **During a Full Attack** each roll window opens just above the swing strip and says "Longsword, swing 2 of 3"; **Enter** rolls Normal. The strip's Adv / Dis / **Quick** / Stop stay visible, so Quick can be ticked during swing 1 (`dockRollDialogs`, U-2-3). **Stop** with a roll window open closes it unrolled (U-10-11).
- **Off-hand rules (PHB 2024):** the Light property's extra attack needs a *Light* weapon in the Attack action; a Nick weapon makes it free. Dual Wielder is a second, separate Bonus-action attack, so with it **Nick: Dagger** and **Off-hand: Longsword** can both be offered (U-2-4); the Off-hand tooltip then says it is Dual Wielder's (U-10-12).

## Known limits found in the usability run

- Off-hand and Nick need both weapons **equipped**, and a stacked pair (Handaxe x2 as one item) gets no off-hand because the follow-up needs a different item id. Split the stack into two items.
- A Monk's Quarterstaff rolls STR until the Martial Arts "Master Simple Weapon" enchantment is applied once (the `character` helper applies it to a Monk it builds, U-10-6; a real Monk's player applies it from the Martial Arts card).
- Auto Sneak Attack cannot see hit or miss; use Undo. Undo does not re-roll the card: the GM applies the smaller total it names.
- Reckless Attack's effect is removed at the start of the Barbarian's next turn by the active GM (U-3-16); with no GM online it stays until toggled off.
- The GM tab console was not confirmed error-free by the run.

## Testing

`make foundry-combat-check` then `make foundry-combat-sync`. Test characters were built in folder "ZZ usability" and deleted afterwards; rebuild with the prompt-markers `character` helper if needed.
