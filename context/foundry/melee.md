# Melee — Full Attack, follow-ups, Sneak Attack

**Read this when:** a player asks how to swing more than once, use an off-hand or Nick attack, add Sneak Attack, or why a combat button is missing or greyed; or you are switching a melee behaviour off.
**Full reference:** [`foundry/module/pentaryn-combat/README.md`](../../foundry/module/pentaryn-combat/README.md) (every setting key, flag and API call). Design history: [`context/plans/melee-streamlining.md`](../plans/melee-streamlining.md).

Module `pentaryn-combat` extends the Argon HUD; Argon's files are untouched. Each behaviour is a world setting, default on; off restores the old HUD for that behaviour.

## What players get

- **Full Attack** is the first button on the Action bar for anyone with 2+ swings, a Nick pair, or an NPC/form with a Multiattack. Left-click runs every swing (one roll dialog each); right-click picks another weapon. Esc pauses (resume, new target, swap weapon, stop).
- **One swing at a time** still works: click a weapon. The pips count it.
- **Bonus bar** shows Off-hand, Hew, Flurry of Blows, Martial Arts strike only when the character qualifies right now. **Special bar** shows Nick, the Sneak Attack Ask/Auto toggle, Reckless Attack.
- **Sneak Attack** (also Frenzy, Colossus Slayer, Divine Strike): a "+ Sneak Attack" button on the attack card, once per turn, crit carried. Auto mode adds it to the first eligible swing, with Undo after a miss.
- **Own dice:** Dice Configuration set to Manual gives a type-in box per roll; Quick mode skips dialogs, never the manual box.

## Known limits found in the usability run

- Off-hand and Nick need both weapons **equipped**, and a stacked pair (Handaxe x2 as one item) gets no off-hand because the follow-up needs a different item id. Split the stack into two items.
- A Monk's Quarterstaff rolls STR until the Martial Arts "Master Simple Weapon" enchantment is applied once.
- Auto Sneak Attack cannot see hit or miss; use Undo.
- The GM tab console was not confirmed error-free by the run.

## Testing

`make foundry-combat-check` then `make foundry-combat-sync`. Test characters were built in folder "ZZ usability" and deleted afterwards; rebuild with the prompt-markers `character` helper if needed.
