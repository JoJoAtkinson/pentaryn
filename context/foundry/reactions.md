---
title: Pentaryn Reactions
status: draft
last_modified: 2026-11-07
tags: [foundry, module, pentaryn-reactions]
---

# Pentaryn Reactions

**Read this when:** a player asks "why didn't I get the Shield card", "the card is grey", or you are checking the reminder at the table. **Not this file:** the module README (`foundry/module/pentaryn-reactions/README.md`) for code structure and the full trigger / suppression tables; the triage plan (`context/plans/feedback-triage-2026-11.md`, cluster F) for why it is shaped this way.

## At the table

1. A monster rolls an attack against a character and hits, or rolls damage against one.
2. The character's owner gets one whispered card: **"Grick hits Marrith with Bite (18 vs AC 16). Reaction: [Shield]"**. For damage of an element: **"Grick deals 9 fire damage to Marrith with Bite. Reaction: [Absorb Elements]"**. Nobody else sees it.
3. Click a button to cast or use it — dnd5e's own use flow, so the slot or use is spent as usual and pentaryn-combat greys the Reaction pip. Ignore the card and nothing happens: there is no Pass, no timer, no dialog.
4. A multiattack against the same character on the same monster turn keeps updating that one card (another line, more options) rather than posting several.
5. The card greys on its own when the character's turn starts, when the Reaction is spent (any way), or when the combat ends.

Nothing waits on the card. The monster's attack and damage go through exactly as before; the GM's **Apply** is still the pause where a Shield matters, since the attack card re-reads AC when it renders.

## For the GM

The active GM client — on BOSS the headless bot "Claude" — reads every new attack and damage card and posts the whispers. A GM browser tab alongside it is fine: one tab claims each card. No GM action is needed and nothing is applied by this module.

**No card comes** when: the character's Reaction is already spent this round (`flags.pentaryn-combat.reaction`), the character is at 0 HP, no non-GM owner is connected, no listed reaction fits the trigger, or every fitting one is unaffordable (no slot of its level or higher, no use left). The attack total and AC are omitted when the roll was whispered or blind.

**What is listed** (this phase): hit → Shield, Parry, Defensive Duelist, Uncanny Dodge, Deflect Attacks / Missiles; damage → Absorb Elements (acid, cold, fire, lightning, thunder), Hellish Rebuke. Not listed: Counterspell, Cosmic Omen, Opportunity Attack — their triggers are not a hit or damage on the character.

## Settings that matter

| Setting | Default | When to change it |
|---|---|---|
| — | — | none: a small module with no settings |

## API quick calls

```js
game.pentaryn.reactions.describe()          // hooks, events, the flags it writes and reads
game.pentaryn.reactions.trace()             // recent log lines (CONFIG.debug["pentaryn-reactions"] = true for "no card for X: <why>")
```

## Known gaps

- Hit and damage on a character only. Counterspell, Cosmic Omen and Opportunity Attack prompts are the plan's later phases (F3); a blocking countdown (F2) was dropped by decision 2026-11-07.
- The list of reactions is an allow-list in `reactions-core.mjs` `OPTION_RULES`; a new reaction feature needs a row there.
- A damage roll from a save spell (Fireball) on several characters posts one card per character; that is by design, but a very wide area is a lot of whispers.
