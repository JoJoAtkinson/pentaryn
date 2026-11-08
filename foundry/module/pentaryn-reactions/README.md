# Pentaryn Reactions (`pentaryn-reactions`)

**Read this when:** you are changing or calling `pentaryn-reactions`, or a player asks why a Shield card did or did not come. **Not this file:** use-doc → `context/foundry/reactions.md` · why it is shaped this way → `context/plans/feedback-triage-2026-11.md` (cluster F, review 2026-11-07) · how every addon is built → `context/foundry/addon-blueprint.md`

A non-blocking reminder card. When a monster hits a player character, or rolls damage against one, the character's owner is whispered one card naming the reaction-timed spells and features that fit; one click uses the activity. Nothing waits on it, nothing is applied by it, and there is no Pass, timer, dialog or mode: an ignored card is a pass. Tier `small` + kit `election`, `flags`. Exposes `game.pentaryn.reactions`.

## What the player sees

A whispered chat card, from the active GM, only to the character's owner:

> **Reaction**
> Grick hits Marrith with Bite (18 vs AC 16).
> Grick deals 9 fire damage to Marrith with Bite.
> Reaction: **[Shield]** **[Absorb Elements]**

- A button runs dnd5e's own `Activity#use` on the clicker's client, so the slot or use is consumed as if cast from the sheet, and pentaryn-combat greys the Reaction pip as usual. When exactly one slot can pay for the spell, that slot is named and dnd5e's usage dialog is skipped — it would only have asked which slot. With a choice (two slot levels left, a use-limited feature) the dialog opens as it does from the sheet. The card asks nothing else.
- **One card per attacker turn.** A multiattack's swings against the same character on the same turn update that card in place: another line per swing, the options unioned. The next turn, or another attacker, is a new card.
- **The card greys** (title "Reaction window passed" / "Reaction spent", buttons dead) when the character's own turn starts, when pentaryn-combat records the Reaction as spent, or when the combat is deleted. It is never removed.
- The numbers (total, AC, damage) are shown only when the roll was public; a whispered or blind roll reads "Grick hits Marrith with Bite."

**Triggers** (the card type is dnd5e 6's `message.type`):

| Card | Trigger | Who is listed |
|---|---|---|
| `attack` | the roll hits a character: `isCritical`, or not a natural 1 and `total >= target.ac` (dnd5e's `evaluatedTargets`); a target with no stored AC is unknown → no card | Shield, Parry (any "…Parry…"), Defensive Duelist, Uncanny Dodge, Deflect Attacks, Deflect Missiles |
| `damage` | the card targets a character and has at least one roll typed as damage (healing and temp HP do not count) | Absorb Elements (acid, cold, fire, lightning or thunder among the roll types), Hellish Rebuke (any damage) |

Matching is by the item's dnd5e `identifier`, then the slug of its name (`OPTION_RULES` in `reactions-core.mjs`); the activity's activation must be a Reaction. **Not in this phase:** Counterspell (a cast), Cosmic Omen (a D20 Test within 30 ft), Opportunity Attack (leaving reach) — the plan's F3.

**Suppressions** — no card at all, checked in this order:

| Reason | Rule |
|---|---|
| `spent` | `flags.pentaryn-combat.reaction.combatId` is the combat the character is in (pentaryn-combat sets it on a Reaction, nulls it at the character's turn start) |
| `down` | the character's HP is 0 or less |
| `offline` | no connected non-GM user owns the character |
| `noOptions` | nothing fits the trigger, or nothing that fits is affordable: a slot-cast spell needs a slot of its level or higher with a use left; a use-limited activity or item needs a use left. Whether a spell is slot-cast is dnd5e's own `activity.requiresSpellSlot` (a levelled spell, an actor with a spell table, a method with slots); a record without that getter falls back to the method — `spell` and `pact` cast from slots, `atwill`, `innate` and `ritual` do not (`slotCast`). A use limit whose max is an unresolved formula counts as a limit and `uses.value` decides (`limitedUses`) |

Also no card for a monster target, or for the attacker itself.

## Settings

n/a — a small module registers no settings.

## API — game.pentaryn.reactions

Canonical: `game.modules.get("pentaryn-reactions").api`; `game.pentaryn.reactions` is the same object.
Ask it what it offers: `game.pentaryn.reactions.describe()`.

Kit members only: `describe()`, `version`, `contract`, `settings()`, `trace()`, `uninstall()`. `describe().flags`
lists the flags written and the one foreign flag read; `describe().events` the two events below.

## Data written

| Where | Key | When |
|---|---|---|
| the reminder card (a ChatMessage the active GM authors, `whisper` = the owners) | `flags.pentaryn-reactions.card` | `{ key, combatId, attacker: {key, name, actor}, pc: {uuid, actorUuid, name}, swings: [{message, kind, attack, public, total, ac, types}], options: [{id, uuid, name, img}], closed: null \| "turn" \| "spent" \| "ended" }`; rewritten with the content on every in-place update and on close (closes go in one `updateDocuments` batch) |
| the attack / damage message | `flags.pentaryn-reactions.claims.offer` | the kit's `claimMessage`: the claiming GM tab's socket id. Written only when at least one card is due, so a monster swinging at a monster writes nothing |

The attack and damage messages are otherwise untouched; the character's actor is never written.

## Flags other modules read

n/a — no other module reads this module's flags.

This module reads `flags.pentaryn-combat.reaction` (pentaryn-combat's README "Data written": `{ combatId }` when a Reaction is taken in combat, null at the actor's turn start), declared in `describe().flags.reads`. The reader side is pinned in `test/core.test.mjs` (`reactionSpent`) and `test/glue.test.mjs` (the `spent` suppression and the `updateActor` close); the owner's README should list this module under its "Flags other modules read" when that file is next edited.

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-reactions.offered` | `(message, card)` | a card was posted, or updated in place by another swing |
| `pentaryn-reactions.closed` | `(message, card, reason)` | an open card greyed: `"turn"`, `"spent"` or `"ended"` |
| `pentaryn-reactions.ready` | `(api)` | the API is published |

Listens to: `createChatMessage`, `updateChatMessage`, `combatTurnChange`, `updateActor`, `deleteCombat`,
`deleteChatMessage`, `renderChatMessageHTML`, `ready` (pinned in `test/golden/hooks.json`).

## Patches and adjustments

n/a — patches nothing; no Argon, no libWrapper, no private members.

## Two sessions / who writes

The **active GM** user's clients read every new attack and damage card (`createChatMessage` fires on
every client; `isActiveGM()` picks the user). Of two tabs on that account, `claimMessage` on the
attack / damage message picks the one that posts; the loser stands down. After the claim, the writes
run through one serial chain, so an attack card and the damage card pentaryn-aoe posts tens of
milliseconds behind it update one card rather than racing into two. The same user greys the cards
(`combatTurnChange`, `updateActor`, `deleteCombat`) from a session index of open cards, kept by
`createChatMessage` / `updateChatMessage` on **every** active-GM tab (so the tab that lost a claim can
still grey the winner's card) and rebuilt from the chat log's tail at `ready` and after a hot patch.
Players' clients only render: the buttons are bound for the character's owner and left dead for anyone
else. The use itself runs on the clicking client, as a sheet click would. At this table the active GM
is the headless "Claude" bot, so a human GM tab never needs to be open for the cards to go out.

## Known gaps

- **Out of combat the Reaction is never "spent".** pentaryn-combat writes `{ combatId: null }` for a
  Reaction taken outside combat, and there is no turn to reset it on, so this module reads it as not
  spent and a second card may follow a second hit. F1 has no round boundary to do better with.
- **Two GM tabs both grey.** The closes are gated on `isActiveGM()` only (no claim, which would add
  the 750 ms settle to every greying), so with the bridge tab and a browser tab open both send the
  same `updateDocuments`; the second is a no-op the client drops.
- **Slot exclusivity.** The one-slot shortcut picks any slot with a use left at the spell's level or
  higher; a spellcasting method that marks its slots exclusive (none does in dnd5e 6.0.6) would be
  offered a slot dnd5e's own picker would have hidden.

## Extending

1. **Another reaction:** a row in `OPTION_RULES` (`reactions-core.mjs`): `{ key: "<dnd5e identifier>", trigger: "hit" | "damage", types?: [...], loose?: true }` and a fixture in `test/core.test.mjs` (`ruleFor`, `optionsFor`).
2. **Another trigger** (a new card type): a branch in `triggerOf`, its `kind`, and the rows that use it.
3. **Another suppression:** a line in `suppression`, read in `offersFor` (`card.mjs`), a fixture and a glue case.

## Pitfalls

- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync`.
- `module.json` is read at Foundry startup: any change to it needs a restart, not a reload.
- Never run `GOLDEN_UPDATE=1 node test/run.mjs` mid-refactor — a refactor must not move a golden.
- The claim lands on a message another user authored (the attacker's). That is a GM write on a chat message, allowed for a GM; a player can never be the active GM, so the gate never runs where it would be refused.
- A Shield cast from the card flips the hit only where dnd5e re-evaluates it (the attack card's render); nothing here rewrites the roll.
- `CONFIG.DND5E.spellcasting[method].slots` is a model **getter** that exists only once `SpellcastingModel.fromConfig()` has run; the module never reads it — slot casting is the activity's `requiresSpellSlot`, else the method name.
- The glue test mocks `setTimeout`: `claimMessage`'s 750 ms settle is ticked by `settle()`, never waited for.

## Files

| File | Role |
|---|---|
| `reactions.mjs` | entry (esmodules[0]): wiring, load order, the small-tier `describe()` with the flags it writes and reads |
| `reactions-core.mjs` | pure: `OPTION_RULES`, `hitOutcome`, `triggerOf`, `optionsFor` / `affordable` / `slotCast` / `affordableSlots` / `limitedUses`, `suppression`, `cardKey` / `mergeCard` / `cardLines`, `closeReason` |
| `card.mjs` | the feature: adapters (message, activity records), the GM-side offer (serial writes, the open-card index) and close, the client-side button binding (`usePlan`) |
| `styles/reactions.css` | the card's own markup (`.pentaryn-reactions .prea-*`) |
| `lib/` | vendored kit (`lib/kit.lock.json`: errors, log, hooks, publish, resolve, election, flags) |
| `test/` | node:test suites, goldens (`hooks.json`, `card-hit.json`), fixtures (a dnd5e-shaped world, a fake DOM), vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check reactions
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module reactions
```

`core.test.mjs`: a fixture table per rule above. `glue.test.mjs`: the active GM's client end to end — a hit, a damage roll, the coalescing, each suppression, the two-tab claim, a player's and a second GM's client, every close reason, the reload, the owner's click and a non-owner's dead buttons.

## Sync

First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Reactions', reload.
After that `.mjs`, `.css` and `lang/` changes need a reload only. Check what is live with
`game.pentaryn.reactions.describe().version`.
