---
title: Feedback triage — the 2026-11-05 session's reports
status: live
last_modified: 2026-11-07
tags: [foundry, feedback, triage, plan]
---

# Feedback triage — 2026-11-05 session

**What this is:** the 16 open reports (plus one triaged) from the Grimsby / Fairfield / Umbral Temple session, deduplicated into 13 fix clusters, each with the cause found, the options and a recommendation. It is a proposal for Joe to review and design from; nothing here is built. Causes were read from the live world (`eval-js`, 2026-11-06), the module source and the installed dnd5e 6.0.6 / core 14.369 bundles.

**How to read it:** clusters are ordered by effort, quick wins first. "Needs Joe" marks a decision that changes a table rule. Each cluster names the module that owns the fix and the report ids it closes. Reports were marked `triaged` with their cluster letter; resolve them from here with `feedback_resolve`.

---

## Dedup map

| Report | Who | Category | Text (short) | Cluster |
|---|---|---|---|---|
| `iXWG4o` | Caven | bug | Dread Blade lootable on the Unbound Ancient | **A** |
| `S7Bc3j` | GM | bug | Rend lootable on the dragon | **A** |
| `OrwZqP` | Talo | bug | "heal doesn't let me target" | **B** |
| `DnK6lE` | Caven | bug | Potion of Healing on self: no Apply, no HP | **B** |
| `OnvqIi` | Marrith | bug | Draconic Spirit's second Rend: no option to apply | **B** (explained) |
| `HdWHWk` | Marrith | bug | Shield / Imperceptible Barrier did not reset on her turn | **C** |
| `rj3l7f` | Talo | bug | Large Form did not grow the token | **D** |
| `TwPCoB` | Talo | bug | Drop concentration when the summon dies | **E** |
| `WqDWbx` | Talo | feature | BG3 prompt for reactions | **F** |
| `pcuOX7` | Talo | feature | Long rest → Cosmic Omen roll | **G** |
| `gWNXLN` | Caven | feature | Long rest → Portent-style rolls, prepare spells | **G** |
| `WUiaAA` | Marrith | feature | Empowered Spell: reroll damage dice | **H** |
| `nwhjz2` | Caven | feature | Incorporeal summon: ghost mode in combat | **I** |
| `fs7q6K` | GM | defect | Psionic Lash: too many steps | **J** |
| `GaMIoP` | GM | feature | HP box: `50-10` → 40 | **K** |
| `M4D2Im` | GM | feature | Physical dice: type the result anywhere | **L** |
| `7VB71i` | Marwen | feature (triaged 10-22) | DDB ↔ Foundry sync | **M** (unchanged) |

Three of the sixteen (B) are one world setting. Two (A) are one stale filter plus one authoring habit. Two (G) are one rest hook.

---

## A — Monster attacks show up as loot · `iXWG4o` `S7Bc3j` · quick win

**Cause, two parts.**

1. The world's `item-piles.itemFilters` setting still holds the dnd5e 2.x preset: `{ path: "system.weaponType", filters: "natural" }`. dnd5e 6 keeps the weapon type at `system.type.value`, so the filter never matches and natural weapons such as the dragon's Rend (`weapon`, `type.value: natural`) are shown. The `itempilesdnd5e` 1.1.0 module ships the right preset for dnd5e ≥ 5 (`type.value`, and `facility` added to the type list); the saved setting just predates it. Dropbin itself sets no filters and relies on this one (`corpses.mjs:23`).
2. Dread Blade is not a natural weapon. The Unbound Ancient is the MM "Death Knight Aspirant" copy, and its blade is `weapon / martialM` (base item longsword) with weight 0 and price 0. A correct filter would still show it. The world has 16 such NPC weapons: some are flavour attacks (Pact Blade, Pact Axe, Necrotic Bow, Tree Club, Dread Blade), some are real loot (the Skeleton's Shortsword, the Doorbreaker's Battleaxe, Quill's Heavy Crossbow).

**Options.**

- **A1 — reset the filter (do it).** Write the itempilesdnd5e 5.0.0 preset back into the setting (one `game.settings.set`, GM). Closes `S7Bc3j`. Add a one-line check to `make foundry-feedback-sync`'s afterSync or to dropbin's `status()` so a stale path is reported, since nothing migrates this setting.
- **A2 — item-level "not loot" (recommended for the rest).** Dropbin already honours `flags.pentaryn-dropbin.noLoot` on an actor (`corpses.mjs:61-66`). Add the same flag on an item and a GM toggle (item sheet header button or the pile inventory's context menu: "Never loot this") that dropbin strips from the pile at `toCorpse`. Fixes Dread Blade and any future MM copy without re-authoring. Small, in dropbin.
- **A3 — authoring rule.** When a monster's signature weapon is a reskinned attack, set it to `type.value: natural` at build time (the generator already does this for `single_attack` rows, `build_actors.py:752-760`; MM copies are the gap). Cheap, but it is a habit, not a fix.
- **A4 — blunt filter: hide NPC weapons with zero weight and zero price.** Hides the Skeleton's Shortsword too. Not recommended.

**Recommend:** A1 now, A2 small build, A3 noted in `props.md`/the importer doc. Owner: `pentaryn-dropbin`.

---

## B — Healing has no Apply for players · `OrwZqP` `DnK6lE` `OnvqIi` · needs Joe

**Cause.** dnd5e's world setting *Allow Players to Apply Damage* (`dnd5e.allowPlayerDamageTray`) is off, on purpose: the table's rule is "nothing is applied until the GM presses Apply" (pentaryn-aoe Part B). The damage **and healing** card's apply tray is rendered only when `game.user.isGM || allowPlayerDamageTray`. So Talo's Heal (70) and Caven's potion (8) rolled fine and waited on the GM; Caven saw no button because there is none for players. Marrith's second Rend is the same tray: the damage was rolled (pentaryn-combat's per-swing Damage button or aoe auto-damage), and only the GM can apply it. Nothing in riders or aoe touches healing. This is the open decision **P-1-c / P-3-k** in `usability-changes-2026-10.md`; three reports in one night is the new input.

**"Heal doesn't let me target"** is a second, smaller thing: Talo cast Heal with nothing targeted. dnd5e records targets at use time and does not prompt; the tray falls back to *selected* tokens for the GM. The player targeted Caven *after* rolling, which the card ignores.

**Options.**

- **B1 — turn the native setting on (prefer-native).** Players get the tray on their own damage and healing cards and can apply only to tokens they own (own PC, own summons, co-owned party members). Monsters stay GM-applied because players do not own them, so Marrith still cannot apply Rend to a wraith and `OnvqIi` is answered by "the GM applies monster damage". Healing an ally they do not own still fails on permission. No code.
- **B2 — keep it off, auto-apply single-target heals the healer owns.** riders rider: a `heal` activity with exactly one target whose actor the user owns applies on the healer's client (Battle Medic already does this for its own flow). Covers the potion and self-heals, not Heal on Caven.
- **B3 — keep it off, GM-side healing apply.** Extend aoe's GM tray to healing cards (it already lists targets from `message.system.targets`), so the GM applies heals in one click like damage. Players still see nothing happen on their side; pair with a toast to the healer when applied.
- **B4 — target nudge for single-target activities with no target (small, any of the above).** On `dnd5e.preUseActivity` for `affects.type: creature, count 1` and no target, show the same "pick a target" prompt the Light cantrip uses (riders), or Argon's own target picker. Would have caught Talo's Heal and the potion.

**Decision (Joe, 2026-11-06): B1.** `dnd5e.allowPlayerDamageTray` was set to `true` the same day (world setting, no reload needed; cards already in the log show the tray after the player's next reload). Players now see the tray on their own damage and healing cards and can apply to tokens they own; Apply silently skips tokens they do not own, so monster damage is still the GM's. B4 (target nudge) stays open as a small riders build.

- **B5 — type the number into the tray (open, Joe's ask).** dnd5e's tray has multipliers (×0, ½, ×1, ×2) only; there is no field to type an amount. Two ways to get "cast the spell, put in the number, apply": (a) **no code** — the player sets their own Dice Configuration to *Manual* (per user, see L): the healing roll asks for each die's face, the total lands on the card and the tray applies it; a box left blank is rolled by the computer, so it is optional per roll. (b) **small build** — an "amount" input per target row in the tray (riders or aoe `tray.mjs`, which already sits under the native tray) that overrides the rolled total for that Apply. (a) answers it today for anyone who rolls real dice; (b) is the one for "I just want to type 12". Owner: `pentaryn-aoe` tray if built.

**Decision (Joe, 2026-11-07): build (b).** Players roll real dice and report a **total**, not die faces, so Manual dice (faces only) does not cover it. Design: one amount input per target row in the tray, pre-filled with the rolled total; a typed value replaces the total for that row's Apply (multipliers still apply on top). Healing and damage cards alike. Owner: `pentaryn-aoe` `tray.mjs`.

---

## C — Shield's effect did not end on Marrith's turn · `HdWHWk` · small, two layers

**Cause.** Two mechanisms, both checked.

- pentaryn-combat's reaction pip (`flags.pentaryn-combat.reaction`) is cleared at the start of the actor's turn by the GM-claimed sweep in `turnflow/boundaries.mjs`. That part works and is not what she saw.
- The effect itself is Foundry core's expiry. Marrith's and Caven's Shield (older DDB import) carry the effect "Imperceptible Barrier" with `duration: 6 seconds, expiry: "turnStart"`. Core's plain `turnStart` keys on `start.combatant`, **the combatant whose turn it was when the effect was created**. Shield is a reaction cast on the attacker's turn, so the barrier expires at the *attacker's* next turn start, not Marrith's. And `CONFIG.ActiveEffect.expiryAction` is `"update"`: an expired effect is marked `expired` and suppressed but stays on the sheet, which reads as "did not reset" (the same stale "Imperceptible Barrier" was found on Caven on 2026-10-10). Marwen's newer Shield import has `expiry: "sourceStart"`, dnd5e's owner-aware pseudo-expiry, which is the right shape. Bazgar's "Precision Attack Bonus" has the same wrong shape.
- Expiry runs on the active GM, which here is the headless "Claude" bot. Worth confirming in the reproduction that the bot's tab processes `turnStart` (see headless-gm.md).

**Options.**

- **C1 — data fix now.** Set `duration.expiry = "sourceStart"`, `value = null` on Marrith's and Caven's Shield effect and Bazgar's Precision Attack. Lost on the next DDB re-sync.
- **C2 — DDB correction rule (recommended).** New rule in `pentaryn-importer` `ddbCorrections`: an effect on an item whose activity is a reaction, with `expiry: turnStart` and a finite seconds duration, becomes `sourceStart` with a null duration. Re-applies after every sync, like the existing five rules.
- **C3 — runtime guard.** riders `preCreateActiveEffect`: when an effect with plain `turnStart` is created off its target's turn, rewrite to `targetStart`. Catches anything, including summons and monster effects. Belt and braces with C2.
- **C4 — expired effects vanish (decided).** `CONFIG.ActiveEffect.expiryAction = "delete"` world-wide, so an expired effect is removed instead of lingering grey. dnd5e already deletes expired effects out of combat and at combat exit; this makes in-combat the same. Changes every timed effect's behaviour; ask.

**Decision (Joe, 2026-11-07): delete world-wide.** "They're expired, no point keeping them." This is a core `CONFIG` value, not a setting (core default `update`, `foundry.mjs:219365`; the registry branches on it at 49787), so it is one line in a module `init` hook — put it in `pentaryn-riders` next to the C3 guard. `pentaryn-transform` already tolerates `delete` (`wildshape.mjs:196`). Not applied yet: it ships with C2/C3.

**Verify first:** ZZ combat, Shield cast on an enemy's turn, step to Marrith's turn, read the effect. Owner: `pentaryn-importer` (C2), `pentaryn-riders` (C3). Feeds **F**.

---

## D — Large Form did not grow the token · `rj3l7f` · quick win

**Cause.** dnd5e 6 resizes tokens itself when an effect changes `system.traits.size` (`tokenSizeSync` is on in this world; the update is made on the active GM's client). Talo's Large Form effect (DDB import) has only two changes: walk +10 and STR check advantage. No size change, so nothing to sync. Token is 1×1 on the Umbral Temple scene, no `lockSize` flag.

**Options.**

- **D1 — DDB correction rule (recommended).** Add `system.traits.size OVERRIDE lg` (phase `initial`) to the Large Form effect. ddb-importer's own `LargeForm` builder emits exactly this, so the rule is "if missing, add". Survives re-sync. Also add a `pentaryn-transform`-style revert check: the effect's 10-minute duration ends it, and dnd5e shrinks the token back.
- **D2 — edit the effect once.** Same change, lost on re-sync.
- **D3 — module fallback.** Only if the headless GM proves unreliable for `_onOverrideSize`: a `createActiveEffect`/`deleteActiveEffect` hook that writes token width/height. Not needed if D1 works.

**Recommend:** D1. Check "big enough space" is the player's call (rule text). Owner: `pentaryn-importer`.

---

## E — Drop concentration when the summon dies · `TwPCoB` · medium

**Cause.** riders implements the forward direction only: when concentration ends, every token stamped `flags.pentaryn-riders.concentration = <effect uuid>` (set on `dnd5e.summonToken`) is deleted. Nothing watches the summon. At 0 HP the Elemental Spirit is an `npc`, so dropbin turned it into a lootable corpse too. The 2024 summon spells say the spirit disappears when it drops to 0 HP or the spell ends, so ending concentration is correct, not a house rule.

**Options.**

- **E1 — close the loop in riders (recommended).** On `updateActor` (hp → 0) or `deleteToken` for a token carrying the stamp, the active GM resolves the stamp with `fromUuid` and calls `actor.endConcentration(effect)`; the existing cleanup then removes the token. Post one chat line ("Talo's Elemental Spirit fell; concentration on Summon Elemental ends"). Skip the corpse: dropbin should treat a stamped summon as `noLoot` and delete rather than convert (small dropbin change, or riders deletes the token before dropbin's `onActorHp` runs).
- **E2 — nudge only.** Whisper the GM a card with a "End concentration" button. Safer if Joe wants the GM to confirm deaths; slower.
- **E3 — rule check.** Non-concentration summons (Find Familiar, Animate Dead) have no stamp and are untouched; a familiar at 0 HP still becomes a corpse today, which is right ("disappears" for familiars is a separate rule; leave it).

**Recommend:** E1. Owner: `pentaryn-riders` (+ one line in `pentaryn-dropbin`).

---

## F — BG3-style reaction prompt · `WqDWbx` · large, design doc needed

**What exists.** No Midi-free module does this: BG3 Flow and External Reaction require Midi-QoL ≥ 14.6; BG3 Inspired HUD is a HUD. pentaryn-combat knows whether the reaction is spent (`flags.pentaryn-combat.reaction`) and Argon shows the pip. There is no Opportunity Attack prompt either (README known gap).

**Triggers at this table, from the PCs' sheets:** hit by an attack (Shield, Parry), damaged by a type (Absorb Elements), an ally or enemy within 30 ft makes a D20 Test (Cosmic Omen Weal/Woe, Bazgar's maneuvers), a spell is cast (Counterspell), a creature leaves reach (Opportunity Attack).

**Options.**

- **F1 — non-blocking prompt, phase 1 (recommended first).** On `dnd5e.postRollAttack` where the target is a PC and the roll hits, and on `dnd5e.applyDamage`, the active GM whispers the target's owner a card: "You were hit by Rend (18 vs AC 16). Reactions: [Shield] [Pass]". Use runs the activity; the attack card's hit/miss re-reads AC on render, so a Shield flips the hit. No waiting, no change to the attacker's flow. Needs C fixed first so the effect ends on the right turn. Covers Shield, Parry, Absorb Elements (on damage type) and Cosmic Omen (on any D20 roll card within 30 ft of Talo).
- **F2 — blocking window, phase 2.** Hold aoe's auto-damage and the pentaryn-combat swing sequence for N seconds (setting) after a hit on a PC with an unspent matching reaction; the owner's card has a countdown; Pass or timeout releases. This is the BG3 feel. It touches the sequence engine (`sequence.mjs`), aoe `attacks.mjs` and sockets; design it as its own plan with the trigger taxonomy above.
- **F3 — Opportunity Attack.** Separate trigger: `preMoveToken` leaving a PC's reach while hostile and the PC's reaction unspent → prompt. aoe already hooks `preMoveToken`; pentaryn-combat has the swing machinery. Phase 2 or 3.

**Recommend:** F1 as a new module `pentaryn-reactions` (small tier to start) consuming pentaryn-combat's reaction flag, then a design doc for F2. Owner: new module.

---

## G — After-long-rest prompts · `pcuOX7` `gWNXLN` · medium

**What exists.** riders and aoe have no rest hooks. `pentaryn-transform/starry.mjs` already handles `dnd5e.restCompleted` (long) for the owner, a ready template. Cosmic Omen on Talo is one feat with two utility activities, "Weal (Even)" and "Woe (Odd)", each rolling 1d6, 5 uses per long rest. Nothing records which omen the day has. Caven is an Abjurer, so no Portent today, but the ask is generic. Prepared casters: Caven, Marwen (wizard), Sabriel (cleric), Talo (druid). riders' Spells tab switch stores the view in a user flag `spellView.<actorId>`; a nudge can set it to `all` and open the sheet on the Spells tab.

**Options.**

- **G1 — rule-driven rest card (recommended).** riders `dnd5e.restCompleted` (long): for each rule that matches an item on the actor, one line on a whispered card with a button. Rules to start: **Cosmic Omen** — roll 1d6, store `flags.pentaryn-riders.omen = weal|woe` on the item, badge the matching activity on Argon and hide or grey the other until the next long rest; **Prepare spells** — for a prepared caster, "Review prepared spells" opens the sheet's Spells tab in All view; **Portent** — when a Diviner appears, roll the dice and store the results as the item's uses with their faces in the name. Rules live beside the existing riders table, so a new feature is a row.
- **G2 — generic card.** List every item with a long-rest recovery and a roll formula. Caven's list would include Dispel Magic, Mirror Image and Arcane Vigor; too noisy. Not recommended.
- **G3 — do it on use.** Make Cosmic Omen's first use of the day roll the omen. Doesn't match the rule text ("whenever you finish a Long Rest") and misses the prepare-spells half.

**Recommend:** G1 with Cosmic Omen and prepare-spells first. Owner: `pentaryn-riders`.

---

## H — Empowered Spell reroll · `WUiaAA` · medium

**What exists.** riders' projectile buttons (`projectiles.mjs`) are the pattern: buttons drawn on `dnd5e.renderChatMessage`, owner-only, state re-derived from rolls threaded under the usage card, no flags. Metamagic is "declared and tracked, never forced" (Careful Spell in aoe follows that). Empowered Spell on Marrith is a feat with a utility activity that consumes 1 Font of Magic use; CHA mod 5. Rule: reroll up to CHA-mod damage dice, must use the new rolls.

**Options.**

- **H1 — Empower button on the damage card (recommended).** On a `type: damage` card from a spell cast by a sorcerer who has Empowered Spell and sorcery points left: "Empower (1 SP)". Click → a small dialog listing each die with its face, pre-ticking the lowest N (N = CHA mod, editable), "Reroll". Spend the point through the item's own activity (`activity.use`, so Argon's badge and the uses stay right), reroll only the ticked dice, and post the result as a new damage roll threaded under the usage card; mark the old card "superseded by Empowered Spell" so the GM's tray applies the new one. New rolls are kept even if lower (rule).
- **H2 — rewrite the roll in place.** Edit the existing damage message's roll. The tray follows automatically but a rolled message is rewritten (Joe's P-3-l reservation). Not recommended.
- **H3 — auto-reroll 1s and 2s.** Marrith's own suggestion; faster but takes the choice away and spends a point without asking. Could be an option in the H1 dialog ("reroll all 1s and 2s").

**Recommend:** H1 with H3 as a dialog shortcut. Owner: `pentaryn-riders`.

---

## I — Ghost mode for incorporeal summons in combat · `nwhjz2` · small

**Cause.** `pentaryn-movement` policy is *Exploration only*: ghost is off for every token while a combat runs on the scene (`movement-core.mjs:160-174`). Enforcement is client-side (drag/keyboard wrappers), and the player's ghost switch is one client setting for all their tokens. Nothing looks at the actor. The Undead Spirit (Summon Undead) has "Incorporeal Passage".

**Options.**

- **I1 — feature detection + GM override (recommended).** `ghostFor(token)` also returns allowed-in-combat when the actor has an item matching `/Incorporeal (Movement|Passage)|Ethereal/i`, or carries `flags.pentaryn-movement.ghostInCombat` (GM-set via a Token HUD toggle or `setGhost(token, {combat: true})`). The player's ghost button stays enabled during combat for those tokens only; the "fight started" auto-clear leaves them alone. Walls still block light and sight; only movement passes.
- **I2 — flag only.** Same, without name matching: the GM flags the summon each time. Less magic, more clicks.
- **I3 — policy `always`.** Opens it for everyone. No.

**Recommend:** I1. Owner: `pentaryn-movement`.

---

## J — Psionic Lash: fewer steps · `fs7q6K` · small

**What happened.** The GM used the Save activity on Caven (Use → the usage card), clicked **Saving Throw** on the card and rolled Caven's save himself, then **Damage**, then **Apply**. aoe's Part B already handles single-target saves from the damage message's recorded targets (`resolveSaves` is on): after Damage, Caven got a row (manual, with a request card) and the GM pressed Apply. The extra steps were the save rolled *before* Damage, which `matchSave` ignores (it only matches saves made after the damage message), and the Damage click itself.

**Options.**

- **J1 — auto-roll damage on use for save activities (recommended).** In aoe, `dnd5e.postUseActivity` for a `save` activity with targets rolls damage at once (mirror of `autoDamageOnHit` for attacks), so the flow is Use → player saves from the request card → Apply. Setting-gated like its sibling.
- **J2 — accept earlier saves.** Widen `matchSave` to saves threaded under the same usage card, so a save rolled from the card's Saving Throw button before Damage fills the row.
- **J3 — request the save at Use time.** Post the player's request card when the activity is used, not when damage lands. Together with J1 this is the one-click monster save.

**Recommend:** J1 + J2. Owner: `pentaryn-aoe`.

**Decision (Joe, 2026-11-07): all or nothing is intended.** Psionic Lash keeps `damage.onSave: none`: a failed save takes full damage, a successful save takes none, like an attack that misses. No half-damage change; J1 + J2 go ahead as written.

---

## K — HP box arithmetic · `GaMIoP` · quick win

**Cause.** Core's token HUD `_parseAttributeInput` understands `=40`, `+5`, `-10` and `50%`; dnd5e's sheet `parseInputDelta` the same. Both return NaN for `50-10`, and the change is dropped. Nothing in `foundry/module/` patches either.

**Options.**

- **K1 — two libWrapper wraps (recommended).** When the input has an operator inside and no leading sign (`^\d[\d\s()+\-*/]*$`), evaluate it with `Roll.safeEval` and treat it as `=<result>`. Wrap `TokenHUD#_parseAttributeInput` and dnd5e's sheet delta parser. Add a tooltip on the HP box: "=40 sets · -10 subtracts · 50-10 does the math".
- **K2 — accept dice too** (`=1d8+2`). Cute, not asked.

**Recommend:** K1 in `pentaryn-combat` (it already owns the HUD and the death-save damage path) or a new small-tier `pentaryn-input`. Owner: `pentaryn-combat`.

---

## L — Physical dice · `M4D2Im` · no code, verify one thing

**What exists.** Foundry core: Settings → Dice Configuration, per die type, per user: *Manual* opens a Roll Resolution box for every roll of that die. pentaryn-combat already focuses that box and sends stray digits into it (`turnflow/manual-dice.mjs`), and melee.md documents it. The GM's ask ("a manual box on every roll, enter the number, it flows into the cast") is this feature.

**Options.**

- **L1 — switch the GM user's d20 (and damage dice) to Manual.** Zero code. Verify first that a box left empty is rolled by the computer on submit, so the GM can type only the dice he threw; if core does not, add an "Auto-roll the rest" button to the resolver (small).
- **L2 — a per-roll "I rolled it" toggle.** Keep Manual off and add a checkbox to the roll dialog that opens the resolver for that roll only. Nicer, but L1 should be tried first.
- **L3 — modules.** *Physical Dice Rolls* (click the faces, v14 listed) and *Natural Roll* (needs Dice So Nice; its automation skip is Midi-only). Neither beats core here.

**Verified in core 14.369 (`RollResolver#_onSubmitForm`, foundry.mjs:94692+):** a box left empty gets `term.randomFace()`, so Manual is optional per roll: type the dice you threw, leave the rest blank and the computer rolls them. `core.diceConfiguration` is a **client** setting, so each player turns it on for themselves (Settings → Dice Configuration → per die type → Manual) and nobody else is affected.

**Joe's clarified ask (2026-11-06):** per roll, the player targets, casts, then either lets Foundry roll or types what the real dice showed as a replacement, and can go back and forth easily. Manual mode does this: the typed faces replace the digital roll inside the real roll, so modifiers, crits, the card and the Apply tray all follow; a blank box is rolled digitally. What you type is each **die's face**, not the total (a d20 attack asks for one number; an 8d6 Fireball asks for eight, blanks allowed). The cost is one extra Enter on every roll of a Manual die type even when the player wants the computer to roll. Three ways to make switching easy, in order of effort:

- **L1 — Manual on, per player (no code).** Switching is implicit: type or leave blank. Try with one player first; if the extra Enter per digital roll annoys, go to L4 or L5.
- **L4 — one-click "Real dice" toggle (small, `pentaryn-combat`).** A scene-control or Argon button that flips the user's `core.diceConfiguration` between all-Manual and all-digital. Back and forth is one click; no box appears while it is off.
- **L5 — "I rolled it" per roll (medium, `pentaryn-combat`).** A checkbox on dnd5e's roll configuration dialog (and a key held while clicking Roll for Quick mode): only that roll opens the Roll Resolution box. Needs the dice configuration flipped around the single evaluation, or a core fulfillment override per roll; verify the cleanest hook before building.

**Decision (Joe, 2026-11-07): L6, a button on every roll dialog.** No mode, nothing a player turns on: the dialog that already offers Advantage / Normal / Disadvantage gets a fourth control, **Real dice**, always there. Design, from the dnd5e 6.0.6 and core 14.369 code:

- **Where.** dnd5e's `RollConfigurationDialog` builds its buttons in `_prepareButtonsContext` (`dnd5e.mjs:19174`; the D20 subclass at 19431 makes advantage / normal / disadvantage) and `#handleFormSubmission` (19359) passes the pressed button's `data-action` to `_finalizeRolls`. The damage and other dialogs have one **Roll** button. pentaryn-combat adds the control on `renderRollConfigurationDialog` (fires for every subclass) or by a libWrapper on `_prepareButtonsContext`.
- **Shape (Joe, 2026-11-07: keep it simple).** A fourth button, **Roll manually**, beside Advantage / Normal / Disadvantage. It rolls in Normal mode and opens one box for the d20. Advantage and disadvantage are the player's business at the table: they roll two dice, keep the one the rule says, and type that face. The system is not told; the card shows a plain d20 with the modifiers. On single-button dialogs (damage, healing) it is a second button, **Roll manually**, that opens a box per die. No toggle, no remembered state.
- **How the roll goes manual for one evaluation.** Core has no per-roll switch: `Roll.identifyFulfillableTerms` (foundry.mjs:34985) and the term's fulfillment handler (199805) both read the client setting `core.diceConfiguration` at evaluation time, and `allowInteractive: false` only forces digital. So the roll carries `options.pentarynRealDice = true`, and a wrap on `Roll.prototype._evaluate` makes the client setting read as all-Manual for the span of that one `_evaluate` (wrap `ClientSettings#get` for that key while a module flag is set, or write the setting before and restore after; the first is cleaner and leaves localStorage alone). Verify the resolver is created inside `_evaluate` (34515, it is) so the flip covers it.
- **Blank boxes still roll digitally** (core `RollResolver#_onSubmitForm`), so a player who rolled only the d20 types one number and leaves the damage to the computer, or the other way round.
- **Totals.** The box asks for die faces; a player who says "fifteen" for 3d8 is covered by the B5 amount field in the tray, not here. A d20 face is the total minus modifiers, so attack and save rolls fit as they are.
- **Permissions.** Core's `MANUAL_ROLLS` permission is on roles 2–4 in this world and all six players are Trusted (role 2), so no change.
- **Quick rolls** (Shift-click, no dialog) stay digital; that is the fast path and does not need the button.
- `turnflow/manual-dice.mjs` already focuses the resolver and routes stray digits into it, so the typing experience is done.

L1, L4 and L5 are superseded. Write the how-to into melee.md's "Own dice" line when it ships. Owner: `pentaryn-combat`.

---

## M — DDB ↔ Foundry sync · `7VB71i` · unchanged

Still Joe's decision from 2026-10-22: ddb-importer's Dynamic Sync (Foundry → DDB) is beta and Patreon-gated; policy stays "Foundry is the source of truth during play, re-import between sessions". Leave triaged.

---

## Suggested order

1. **Settings and data, same day:** A1 (filter reset), D1 and C2 (two DDB correction rules), and the B1 decision (done).
2. **Small builds:** K (HP math), I (ghost for incorporeal), A2 (item `noLoot`), J1 + J2 (save flow), C3 + C4 (expiry guard, delete expired), B5 (amount field in the tray), L6 (Real dice on the roll dialog).
3. **Medium builds:** E (summon death ends concentration), G (rest card), H (Empowered Spell).
4. **Design first:** F (reactions). Write `context/plans/reactions-2026-11.md` after B and C land, since both change what the prompt has to do.

**Decisions for Joe:** ~~B~~ (2026-11-06: B1 on; 2026-11-07: B5 build the amount field, totals not faces), ~~C4~~ (2026-11-07: delete world-wide), ~~J~~ (2026-11-07: all or nothing stands), ~~L~~ (2026-11-07: L6, a Real dice control on every roll dialog), F's phase 2 (blocking window or not; explained to Joe 2026-11-07, answer pending).

**Verify before building:** C in a ZZ combat with the headless GM as active GM; L1's empty-box behaviour; whether Argon's target picker already covers B4 for spells.

---

## Review 2026-11-07 — "the VTT does not get in the way of role play"

A cold second read of this plan against Joe's principle, plus one live check (no player owns another PC: every character is owner + GM only). Full table: `.tmp/feedback-triage-review-2026-11-07.md` (not committed). Adjustments proposed, none reopening a decision above:

- **F:** drop F2 (the blocking countdown) entirely; the GM's Apply is already the pause. Build F1 only, narrowed: triggers hit-on-PC and damage-roll-on-PC, no Pass button, no Cosmic Omen trigger, one card per attacker turn, no card when the reaction is spent, no slot remains, or the PC is at 0 HP. Straight to a small-tier `pentaryn-reactions`, no design doc.
- **E1:** trigger on HP → 0 only, never `deleteToken` (portals and pins delete tokens on scene moves). Any `dnd5e.summonToken` token skips the corpse, familiars included.
- **B:** B1 leaves `OrwZqP` (Talo heals Caven) unfixed: Apply skips Caven's row silently. Relay unowned rows through the headless GM on a player's Apply. Replace B4's prompt with a tray fallback that uses the player's current targets when the card stored none.
- **C3:** narrow to effects whose source actor is the actor they sit on, created off that actor's turn (Shield's shape) → `sourceStart`. Everything else untouched; matters more now that C4 deletes.
- **L6:** d20 dialog only, styled as a secondary control; no damage-dialog button (B5 covers totals). Scope the manual flip to the one roll instance. Note in melee.md that Roll manually is Normal mode, so pentaryn-combat's advantage-based Sneak Attack offer does not fire.
- **H1:** one click rerolls dice below the die's mean up to CHA mod, Shift-click opens the picker; use the activity with `configure: false`; disable the superseded card's tray.
- **G1:** add G3 as fallback (roll the omen on first use if none stored); no Portent rule until a Diviner exists.
- **I1:** match feats only. **A2:** toggle on the pile menu. **J1:** only post damage when there are targets. **B5:** one compact field per row, effective number shown.

**Decision (Joe, 2026-11-07): accept all.** F2 dropped, F1 narrowed, E1 on HP → 0 only, B relay instead of B4, C3 narrowed, L6 d20-only; the implementation notes above are given to the builders as requirements. Build started 2026-11-07 as a workflow, one builder per module, each followed by a reviewer and a fix pass. Then the build order is tier 1 + C4, then K, J, B relay/fallback, B5, E1, C3, A2, I1, then L6, G, H, then F1.

## Build 2026-11-07 — what landed in the working tree

Built by a workflow (one builder per module, a cold reviewer each, a fix pass where the review blocked; 19 agents). Every module gate passes (`make foundry-<short>-check`); `make check-context` passes; `make test` passes after pinning the new module's check target. **Not synced to the live world and not committed.** Live writes made by hand the same day: A1 filter reset; C1 (Marrith's and Caven's Shield effect → `sourceStart`, no duration); D2 (Talo's Large Form effect + `system.traits.size` override `lg`). These three PCs carry no `flags.ddbimporter` (they are not DDB-synced actors), so the new importer rules cannot reach them; the hand fixes stand.

| Module | Version | Clusters | Notes a reader needs |
|---|---|---|---|
| pentaryn-importer | 1.3.0 | C2, D1 | Rules `reaction-expiry` and `large-form-size`; new `updateEffects` op. `reaction-expiry` matches one-round effects of reaction activities or of any spell (ddb-importer writes Shield's activation as `action`); longer effects (Feather Fall) untouched. Bazgar's Riposte (activation `special`) is not matched. First GM login on 1.3.0 re-runs the sweep once. |
| pentaryn-riders | 0.7.1 | C3, C4, E1, G1+G3, H1 | `expiry.mjs` sets `expiryAction = "delete"` at init. C3 guard: self-cast, off own turn, combat active → `sourceStart`, duration nulled. E1: HP → 0 on a stamped summon ends concentration ~1.5 s later (two claim settles), one chat line; never on token deletion. Rest card (`rest.mjs`): Cosmic Omen "Read the stars" (idempotent), "Review prepared spells" (Marrith too: 2024 sorcerers prepare). Empower (`empower.mjs`): one click rerolls below-mean dice, Shift-click picker, button absent when no die is below its mean, old tray disabled. G3 redirect skips Argon's reaction-pip consume for that click (README Pitfalls). |
| pentaryn-dropbin | 0.3.0 | A2, E3, A1 check | "Never loot this" on the pile right-click menu and item sheet header (GM); hides via the corpse pile's own `overrideItemFilters`, so the GM's loot window hides it too (undo from the item sheet). Any `flags.dnd5e.summon` actor never becomes a corpse. `selftest()` reports a stale natural-weapon filter path. |
| pentaryn-aoe | 0.6.1 | J1, J2, B relay, late targets, B5 | J1 setting `autoDamageOnSave` (on): save activity with damage and targets rolls damage on use; **skips activities that place an area template** (Fireball waits for the area; narrower than the plan text). J2 accepts saves threaded under the usage card before Damage. `apply.mjs` takes over dnd5e's Apply: owned rows local, unowned rows relayed to the active GM (sender pre-checks the GM's `mayApply` predicate; silent skip when not allowed), players-only fallback to held targets when dnd5e lists nobody, one amount input per row (effective number in dnd5e's calculated span). Late targets are written to the author's card (debounced, 10-minute window). |
| pentaryn-combat | 0.3.1 | K, L6 | `turnflow/hp-math.mjs`: arithmetic in every HUD bar and dnd5e delta box (setting `hpMath`). `turnflow/roll-manually.mjs`: "Roll manually" on d20 dialogs only, Normal mode, hidden without MANUAL_ROLLS; one roll's `_evaluate` reads the d20 as Manual via a `ClientSettings#get` wrap held across the synchronous prefix. Known gap: a reroll inside that roll (Lucky, Elven Accuracy) is digital. Patch version only: 0.4.0 would sunset the legacy hook names. Five rows appended to `foundry/adjustments.yml`. |
| pentaryn-movement | 0.2.0 | I1 | Feats matching /Incorporeal (Movement|Passage)|Ethereal/i or `flags.pentaryn-movement.ghostInCombat` keep ghost in combat; GM Token HUD toggle; `setGhost(ref, { combat })`. The player's one ghost button stays on while any owned token is exempt (toolclip explains). |
| pentaryn-reactions | 0.1.1 | F1 | New small-tier module; use-doc `context/foundry/reactions.md` + skill `reactions`. Hit-on-PC and typed-damage-on-PC whispers, no Pass, no timer; suppressed when the reaction is spent, no slot/use, PC at 0 HP, owner offline; one card per attacker turn; greyed on the PC's turn start. Spell-slot affordability follows dnd5e's `requiresSpellSlot`. Two GM tabs may both grey a card (harmless duplicate update). |

**Pre-existing, not from this build:** `make foundry-modules-check` is red on `pentaryn-feedback` alone (`reload.test.mjs` asserts Node has an in-memory `sessionStorage`; the gate's Node 24.21.0 has none, and with `--experimental-webstorage` two tests still fail). Nothing in that module changed since 2026-10-12.

**Live 2026-11-07 (afternoon).** All seven modules synced, pentaryn-reactions installed and enabled, Foundry restarted (shutdown snapshot taken), pentaryn relaunched, headless GM reconnected. Post-restart: every module active at its new version, every `selftest()` ok, `expiryAction = "delete"`, player tray on. Live checks that passed: Bazgar's Precision Attack effect already corrected to `sourceStart` by the importer's login sweep (C2); `50-10` → 40 in the Token HUD parser with `=40`, `-10`, `+5`, `50%` unchanged (K); Dread Blade marked never-loot through the new API (A2, closes `iXWG4o`). **Not verifiable from the headless tab:** C3/C4 (the bot has no canvas, so `game.combat` is null for it and an effect it creates records no combat start; in play the creating client is the player's and the active GM is Joe's role-4 tab, which outranks the bot), F1 (owners offline, so the card is suppressed by design), J1 and the B relay (need a targeting client), E1, G, H (need a real rest, a real summon death, a real Empower click). Those are the first-fight checklist; `HdWHWk` stays triaged until the barrier is seen dropping on Marrith's turn. Thirteen reports resolved; `7VB71i` (DDB sync) unchanged.

**Seen on the headless tab during the throwaway combats:** `Cannot read properties of null (reading 'id')` with pentaryn-combat 0.3.1 and monks-active-tiles in the stack, plus core/monks `updateCombat`/`deleteCombat` handlers reading `canvas.tokens.controlled`. All from running a combat on a client with no canvas; not seen in play, where the bot is never the client driving a combat. Worth a guard in pentaryn-combat's turn flow (`canvas.scene?.id`) when next touched.

**Next:** (superseded) sync the seven modules and install the new one (`make foundry-<short>-sync`), enable pentaryn-reactions in the world (a world reload for everyone), then the live smoke each builder listed: a Shield cast off-turn in a ZZ combat, a summon dropped to 0 HP, Talo's Heal on Caven with a typed total, Psionic Lash use, 50-10 in the HP box, Roll manually on an attack, a rest card, Empower on a damage card, a monster hit on a PC for the reaction card. Then resolve the triaged reports.

## Playtest 2026-11-07 (evening) — a real browser, by a remote session

**How.** Joe's laptop session "home-pro" drove Foundry at vtt.atjoseph.com with Claude in Chrome; this session built the sandbox and fixed what it found. The sandbox kept the campaign untouched: a plain "ZZ Playtest Arena" scene, copies named Marrith (ZZ), Talo (ZZ), Caven (ZZ) with full HP and a long rest, three monster copies (ZZ Soldier, ZZ Conscript also owned by the Marrith tester, ZZ Mind-Lasher for Psionic Lash), and four throwaway users ZZ GM (Assistant GM: the bot cannot create a role-4 user), ZZ Marrith, ZZ Talo, ZZ Caven. Two setup lessons: a Claude-in-Chrome session will not type a password on a live host, and Foundry ignores `User.update({password: ""})` (a blank means unchanged), so the users were recreated with no password field; and the testers needed OWNER on their characters' `— summons & forms` folders to summon (granted for the test, removed at cleanup). The bot was the designated GM throughout (role 3 ties sort by id), so every expiry ran on the headless tab: the real stack, not a GM browser.

**Results by phase** (A as ZZ GM, B as ZZ Marrith, C as ZZ Talo, D as ZZ Caven). PASS: A2 Roll manually (four buttons on attack, save and check dialogs; none on damage), A3 HP arithmetic (`50-10` → 40, `50%` → 33 on the HUD and the sheet), A4 Psionic Lash one step (damage on use, the save rolled from the card before Apply fills the row, ×0 on a success), A5 Empower (49 → 54, `2 → 7`, the old card retired, Shift-click picker, SP 12 → 11), A6 summon at 0 HP (token gone, no corpse, concentration ended, one whisper), A7 Large Form (1×1 → 2×2 and back), A8 corpse loot (gear only, revive at 20 HP), A9 the rest card as GM (Read the stars once, Review prepared spells), B1 the reaction card ("ZZ Conscript hits Marrith (ZZ) with Longsword (25 vs AC 18). Reaction: [SHIELD]", Shield cast from it, pip grey), B2 the typed total (7 typed, exactly 7 applied), B3 damage relay to an unowned monster (5 typed, Soldier 40 → 35 through the bot), B4 Roll manually as a player (20 → crit), B5 ghost off during combat, D1 the Ghostly spirit ghosts in combat while Caven stays wall-bound, D2 both of Caven's Shields (ring and slot) with one barrier and no error.

**Bugs found and fixed the same evening.**
- **A1 → pentaryn-riders 0.7.2.** Caven, last in initiative, cast Shield on his own turn in round 2; the barrier vanished when round 3 began on Marrith's turn. dnd5e 6.0.6's `getSourceActor()` reads `system.origin.actor ?? item ?? activity`, and an effect its own activity applied carries `actor: null` and `item` = the spell's COMPENDIUM uuid, which resolves to an index entry with no actor; `isExpiryEvent` then finds no combatant and falls back to "past the creation round". Marrith's barrier only ever looked right because she is first in initiative. riders now records the caster in `system.origin.actor` on `preCreateActiveEffect` (creating client) for every `sourceStart` / `sourceEnd` effect; adjustments row `dnd5e-riders-self-cast-expiry` widened.
- **C1 (three findings, one cause) → pentaryn-aoe 0.6.2.** dnd5e types a healing roll's card `healing`, not `damage`; every Part I check asked for `damage`, so Heal and Healing Word were never wired (no total box), never followed by late targets, and the Apply press was dnd5e's own, which skips an unowned row silently (Caven stayed at 40). `core.isApplyCard` covers both types; a refused or thrown relay now toasts the player once. Row `dnd5e-card-healing-type`.
- **C2 → pentaryn-riders 0.7.2.** The Argon HUD shows ONE button per feat (its `explodeItemActivities` setting splits weapons only), and that button's `activity` getter answers the first activity (Weal), which rest.mjs read as "the other one" and greyed against the stored Woe: Talo could not use Cosmic Omen from the HUD and saw no badge. An item button is never greyed and is badged with the omen's name; the per-activity badge/grey stays for a split item. Row `argon-riders-omen-badge`.

**Not bugs.** Token-on-token overlap and off-map drops are core behaviour (the brief's expectations were wrong). The ghost tool stays "ON" with Caven selected while the spirit may ghost: the rule is applied per token on move; a tooltip that says "for incorporeal creatures only" would be the only improvement. A failed `placeSummons` (no ownership) still spends the slot and leaves a stray concentration: dnd5e's own order of operations, noted for a riders rollback later. Sandbox whispers from the summon-fell line also reach the real Gamemaster user (it owns every PC): by design.

**Phase E (retests after sync + restart, 2026-11-07 ~19:15 EST): all PASS.** Caven's own-turn Shield recorded `system.origin.actor` = his uuid, read "Start of Your Next Turn", survived the round turnover and five turns and was deleted exactly as his round-4 turn began. Heal cast with nothing targeted: targeting Caven afterwards switched the card to his row with a total box (70), 55 typed, Apply, Caven 40 → 86 through the bot within four seconds; Healing Word on a targeted Caven had the box too (10, 3 typed, applied). The Cosmic Omen HUD button is in colour with a "Woe" badge, and dnd5e's chooser marks Woe "today's omen" with Weal disabled. No console errors in any phase besides the sandbox's own summon-ownership refusals.

**Also done on the way.** The real Caven's second Shield (granted by his Ring of Spell Storing) still had the stale `turnStart/6` barrier; corrected to `sourceStart`/null by hand like the others (C2; the importer rule cannot reach it, no `flags.ddbimporter`).

**One thing unexplained.** During Phase E, Caven (ZZ)'s "Concentrating: Summon Undead" and its Undead Spirit token (placed before the server restart, in a running combat) were gone by his round-4 turn with no whisper and no chat line. Core's expiry maths would not have ended an hour-long concentration (probed on the bot: 3594 s remaining, no turnStart match), riders' trace was empty after the restart, and no module deletes a token at `ready`. Likely tied to reloading the world mid-combat; not reproduced. Watch for it in play: a summon vanishing together with its concentration without the "fell" line.

**Sandbox torn down** the same night: ownership grants stripped from the three summon libraries, the ZZ combat, scene, six actors and folder deleted, the playtest's chat messages removed, the four ZZ users deleted; the real PCs untouched (Talo 3/99, Caven 68/86, Marrith 86/98; "Pentaryn — Entry" still the active scene).

## Sources read

- Reports: `scripts/feedback_reports.py get <id>` for the 17 ids above (timelines read bottom-up).
- Live world (eval-js, 2026-11-06): `item-piles.itemFilters`, the Shield / Large Form / Psionic Lash / Heal / Potion / Cosmic Omen / Empowered Spell items and effects, `allowPlayerDamageTray`, `tokenSizeSync`, `CONFIG.ActiveEffect.expiryAction`, the 16 free non-natural NPC weapons.
- Code: `pentaryn-combat` (counting, boundaries, sequence, strip, manual-dice), `pentaryn-riders` (concentration, projectiles, spell-view, damage-riders), `pentaryn-aoe` (resolve, tray, attacks), `pentaryn-dropbin/corpses.mjs`, `pentaryn-movement` (movement-core, ghost), `pentaryn-transform` (starry, wildshape), `pentaryn-creatures`; dnd5e 6.0.6 `dnd5e.mjs` (effect expiry 8090-8260, damage card 87024, token size sync 42898, delta parsing 506-543); core 14.369 `foundry.mjs` (effect registry refresh 49747, `isExpiryEvent` 50850, HUD input 98512); `itempilesdnd5e/dist/module.js` presets.
- Prior decisions: `usability-changes-2026-10.md` P-1-c, P-3-k, P-3-l; `pentaryn.md` dnd5e 6 upgrade notes (stale Imperceptible Barrier).
