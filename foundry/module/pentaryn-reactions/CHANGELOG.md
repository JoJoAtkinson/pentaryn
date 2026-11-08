# Changelog — Pentaryn Reactions (`pentaryn-reactions`)

## 0.1.1 — 2026-11-07

Second review of the F1 build.

- **Fix: slot casting is dnd5e's own decision.** The "no slot left" suppression read `CONFIG.DND5E.spellcasting[method].slots`, a key the 6.0.6 config literal does not carry (it is a model getter that only exists after `SpellcastingModel.fromConfig()`); the adapter now reads the activity's `requiresSpellSlot` and, for a record without it, falls back to the method (`spell` / `pact` cast from slots; `atwill`, `innate`, `ritual` do not). The test fixtures carry the 6.0.6 shape (prototype getter, no data key) and the getter, so the live path is what the glue tests run; core pins the fallback.
- **Fix: the attack card and its damage card can no longer race into two cards.** Post-claim writes run through one serial chain; a glue case fires both without settling between them.
- Every active-GM tab now indexes reminder cards from `createChatMessage` / `updateChatMessage` (new hook, golden re-pinned), so the tab that lost the claim can grey the winner's card; `findCard` no longer scans the chat log.
- One affordable slot: the button names it and skips dnd5e's usage dialog (`configure: false`); with a choice the dialog opens as from the sheet.
- A use limit whose max is an unresolved formula no longer reads as unlimited (`limitedUses`).
- README: Known gaps (out-of-combat spent flag, two-tab closes, slot exclusivity).

## 0.1.0 — 2026-11-07

First build: feedback triage 2026-11 cluster F1 as narrowed by the review of 2026-11-07 (F2, the blocking countdown, dropped; no Pass button; no Cosmic Omen trigger).

- The active GM whispers a character's owner one non-blocking card when an attack card hits the character or a damage card targets it, listing the reaction-timed activities that fit (hit → Shield, Parry, Defensive Duelist, Uncanny Dodge, Deflect Attacks / Missiles; damage of an element → Absorb Elements; any damage → Hellish Rebuke). A button uses the activity through dnd5e's `Activity#use`, so the slot or use is consumed normally.
- One card per attacker turn per character: a multiattack's swings update the card in place (`flags.pentaryn-reactions.card`); another attacker or the next turn is a new card. Out of combat the usage card stands in for the turn.
- No card when the Reaction is already spent (`flags.pentaryn-combat.reaction`), the character is at 0 HP, no owner is connected, nothing fits, or nothing that fits is affordable (no slot of the spell's level or higher, no use left). A monster target or the attacker itself never gets one. Numbers are omitted for a whispered or blind roll.
- The card greys when the character's turn starts, when the Reaction is recorded as spent, or when the combat ends; closes go out in one batch. The open-card index is rebuilt from the chat log at ready and after a hot patch.
- Two GM tabs: `claimMessage` on the attack / damage message picks the tab that offers; the claim is written only when a card is due.
- Generated from the Pentaryn addon blueprint (tier `small`, kit `election` + `flags` vendored in `lib/`).
