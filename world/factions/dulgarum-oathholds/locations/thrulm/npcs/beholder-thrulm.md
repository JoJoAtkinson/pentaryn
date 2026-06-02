---
name: The Hunger Below (Beholder)
description: "An eye-creature drawn to the void left by a sealed god; feeds on the absence of divinity"
created: 2026-04-26
status: active
location: thrulm
tags: ["#combat-runner", "#npc", "#combat", "#beholder", "#thrulm", "#boss", "#aberration", "#cr-13"]
---
# The Hunger Below (Unnamed Beholder)

**HP** 110 (13d10+39) **·** **AC** 17 (alien hide) **·** **Speed** 0 ft., fly 30 ft. (hover) **·** **Saves** Dex +8, Wis +7 **·** **Resist** psychic; nonmagic B/P/S from non-sanctified weapons **·** **Immune** poison; charmed/exhaustion/frightened/paralyzed/petrified/poisoned/prone/restrained **·** **Truesight 120 ft.** (cannot be blinded) **·** **Telepathy 120 ft.** **·** **CR** 13 (10,000 XP)

> Action mechanics live in `combat-runner/actions.jsonl` (DB) — see the launcher-injected **Ready actions** reference for verbs and call signatures.

---

## Start-of-turn checklist

1. If **Disintegration Ray** is USED, roll `roll_dice(1, 6)` — recovers on 5–6. **DR is a ranged ATTACK ROLL (+6 to hit, range 120 ft), NOT a Dex saving throw** — on a hit, full 10d8 force damage applies (no half-damage on a miss). Contrast with Void Ray (legendary) which is a DC 16 Dex save.
2. If **Void Scream** is USED, roll `roll_dice(1, 6)` — recovers on 6 only. *(DC 16 Wis save, 6d10 psychic, 30-ft radius — DM reminder; full spec in DB)*
3. **Reaction** refreshes to AVAILABLE: **Antireality** (+2 AC vs one incoming attack, declared after seeing the roll).
4. **Bonus actions available this turn:** `shrine_drift` (move 30 ft, can pass through things) OR `compel_thrall` (1/turn, force a charmed creature to move). Bonus actions are separate from the main action — either can be used in the same turn as Multiattack, DR, or VS.
5. **Main action (choose exactly one per turn):** `multiattack` / `disintegration_ray` (if available) / `void_scream` (if available). DR and VS are **mutually exclusive** — only one fires per turn; each replaces the full main action. *(MQ-84: a turn cannot include both DR and VS.)*
6. **Legendary Resistance:** 3/day, still available unless burned.
7. **Void-Feeding (passive):** in the shrine chamber, +1 to attack and damage rolls (already baked into action specs); advantage on resist-divine-turn checks.
8. **Lair Actions** trigger on **init count 20, LOSING TIES** (not the beholder's turn): if the beholder also rolled 20, beholder turn resolves first, *then* lair action fires. Pick `unstable_ground`, `manifest_thralls`, or `void_eruption`. *Tie example: if any thrall or PC also rolled init 20, they act BEFORE the lair fires — the lair yields to any creature at exactly count 20 (MQ-BEL27-B).*

---

## Legendary Actions (3 per round)

At the end of each *other* creature's turn, the beholder may spend legendary actions:

- **Move (1 action):** fly speed.
- **Tentacle (1 action):** one `tentacle_lash` attack (verb: `tentacle`).
- **Void Ray (2 actions):** `void_ray` — DC 16 Dex, 4d10 force, half on save (range 120 ft).
- **Drain Divinity (3 actions):** `drain_divinity` — living target with spell slots in 30 ft makes DC 16 Cha or loses highest slot; beholder gains 2× slot level temp HP. (Living target only — fizzles if target is dead or has no slots.)

Track remaining actions on the tab.

---

## Tactics — when the DM asks "what does it do?"

- **Round 1, all party visible:** Multiattack from 10-ft tentacle reach if any PC is in range; otherwise hover at 30–40 ft altitude and **Disintegration Ray** (range 120 ft) at the highest-level caster. **Retarget if primary is dead:** next highest caster or divine martial; fall back to any living PC.
- **Anyone within 30 ft, especially clustered:** **Void Scream** the moment it's recharged (it cycles on 6 only — be patient). **Altitude gate (DD-48):** VS is a 30-ft radius centered on the beholder — if beholder is at 60+ ft altitude, all ground-level PCs are out of range. To fire VS from altitude, descend to ≤30 ft first (use shrine_drift bonus if needed). Descending to fire VS exposes the beholder to melee; weigh this against the round lost waiting for targets to close. If at altitude and VS available but PCs are >30 ft below, hold VS — do not waste it. **VS descent OA (MQ-64):** When descending to fire VS, use `shrine_drift` (bonus action, passes through objects/creatures — no opportunity attacks triggered) rather than standard fly movement, which would provoke a readied melee attack from Bazgar (+5 to-hit, ~47% hit chance on approach). `shrine_drift` approach is OA-safe; fly descent is not. **VS fear rider value (FI-149):** VS's most durable effect is the fear condition, not the single-round psychic damage. A frightened Fighter (Bazgar) attacks at disadvantage — ~27% hit rate per attack vs beholder AC 17, compared to ~47% without disadvantage. VS suppresses Bazgar's melee output by roughly half for 2–3 rounds until he saves (DC 16 Wis, +2 mod, ~30% pass rate per turn). Even when VS's psychic damage doesn't kill anyone outright, the fear rider alone justifies firing — it removes the most consistent physical damage source from the fight for multiple turns.
- **Cleric/paladin present:** burn legendary actions on **Drain Divinity** rather than Void Ray. Removing healing/buffs is the whole strategy. *Drain Divinity targets any creature with spell slots* (including arcane casters — Marwen's wizard slots are valid targets); pick the creature with the highest remaining slot level. Below 30 HP: prefer Void Ray over Drain Divinity (save 1 action for movement if needed) unless Disintegration is available.
- **Legendary priority order (each round when budget is full = 3 actions):** **Drain Divinity** (3 actions) on the FIRST PC's end-of-turn if a slot-holder with L2+ is within 30 ft — do NOT split into Void Ray + Tentacle instead. Only fall to Void Ray (2) if no slot target is in range or after the one Drain Divinity use per budget-refresh. Example: after Thrall-A ends its turn in R1 and the beholder has 3 legendary remaining, the correct play is Drain Divinity on Sabriel (30 ft), not Void Ray on Bazgar (2 actions) + Tentacle (1 action). The temp HP from Drain Divinity scales with slot level and is often +4–+6 — more durable than the offensive trade. **No slot-holders alive (MQ-75):** Once all spell-slot users are dead or exhausted, skip the Drain Divinity check entirely — use **Void Ray (2 actions)** after each surviving PC's turn if ≥ 2 LAs remain. Do not withhold LAs waiting for a slot-holder that no longer exists. **Drain Divinity L1-slot threshold (FI-128):** DD is only worth 3 LA when the target has L2+ slots remaining. Once the target's highest available slot is L1, switch to Void Ray (2 LA) — VR deals ~22 avg force vs only +2 temp HP from a L1 drain. Exception: if the beholder is below 40 HP and any temp HP matters, drain L1 as last resort. **DD on unconscious target (FI-NEW-EV6-C):** An unconscious (0 HP) target with slots is DD-valid (living = slots still exist), but if any standing threat is in melee range, downgrade to Void Ray (2 LA) + Tentacle (1 LA) instead of DD (3 LA) — an unconscious target cannot act, heal, or threaten next turn. Switch back to DD only if the unconscious target is the sole remaining PC or is likely to be revived this round by a healing item/LoH.
- **Engaged by melee:** Multiattack tentacles to grapple (DC 16 Str escape), then **Maw** the grappled target. Use `shrine_drift` bonus to back off through walls / pillars. **Grapple ends on unconscious (MQ-FC14-A):** If a grappled target is reduced to 0 HP (knocked unconscious) before the Maw fires — e.g. by TL2 — the grapple condition ends immediately (5e PHB: unconscious ends grappled). Redirect the Maw to the next closest enemy, or skip it if no enemy is in range. **Prone target (DD-31):** if target is prone and beholder is within 5 ft, all Tentacle Lash and Maw attacks against that target have advantage. **Hovering creature — prone immunity (MQ-82):** The beholder cannot be knocked prone (Trip Attack, Topple mastery, Thunderwave knockdown, etc.) — it hovers. When a Battlemaster uses Trip Attack against the beholder, redirect to a standard hit; no prone condition applies. State this ruling immediately when it comes up.
- **Countering LoH revival loop (FI-125):** If Sabriel is spending every turn cycling Lay on Hands to revive a downed ally rather than attacking, spend 1 legendary action (Tentacle Lash, 1 LA) at the END of Sabriel's turn to pressure her HP. This forces her to spend LoH on herself instead of allies, shortening the revival pool. LoH cannot be mechanically blocked, but HP pressure depletes it faster. Priority: if Sabriel is < 30 HP and just used LoH on an ally, Tentacle at end of her turn instead of waiting for the next PC's turn to use a larger LA spend.
- **Compel Thrall targeting (FI-20):** When using `compel_thrall` bonus action to direct a dominated thrall, aim them at the **lowest-AC PC** (typically Marwen, AC 15 — +4 to-hit gives ~45% hit rate vs ~30% against Sabriel AC 19). Directing thralls at the divine martial is a near-wasted command; redirect to the caster or whoever just burned a resource. Do NOT compel toward a PC who is already focused on a thrall — that wastes the beholder's bonus action on redundant direction. **Skip if no live thralls (MQ-BEL25-A):** Do not use `compel_thrall` if all thralls are dead or at 0 HP — there is no valid charmed target and the bonus action is wasted. Use `shrine_drift` instead.
- **Void Scream frightened rider (FI-21):** PCs who fail the VS DC 16 Wis save are **frightened** of the beholder for 1 minute (save at end of each of their turns). Frightened = disadvantage on attack rolls against the beholder (when visible) and cannot willingly move closer. **Remind yourself of this at the start of each subsequent round** — frightened PCs who attack the beholder do so at disadvantage; this compounds dramatically in R2–R3 on Bazgar if he fails. Note: Marwen's save-based spells (Fireball, Scorching Ray save rider) are unaffected by frightened.
- **Lair actions:** at init 20, prefer `void_eruption` if 2+ PCs near the altar; otherwise `unstable_ground` on a melee threat; `manifest_thralls` only if thralls are alive AND positioned usefully. **Lair rotation (FI-129):** Do not repeat the same lair action more than 2 consecutive rounds — rotate even if the optimal choice would repeat. Skip `unstable_ground` if the target is already prone OR unconscious (wasted action); if ALL melee-range PCs are unconscious/down, skip `unstable_ground` entirely and rotate to `void_eruption` (if any PC within 20 ft of altar) or `manifest_thralls` (if thralls alive). Use `manifest_thralls` if thralls are still up and repositioning them would open a flank.
- **Antireality reaction:** Trigger on any incoming melee attack that already hit and deals an estimated 10+ damage — always trigger on a stated Divine Smite, a stated Power Attack, or a crit confirmation. **Estimate uses the weapon's average, not the rolled result** (MQ-74): a greatsword averages 10 (2d6+3), a longsword averages 7 (1d8+3); apply the threshold before seeing the damage dice — the beholder reacts to the swing, not the number. **Margin check (DD-43):** Only trigger if the attack's total is within 2 of the beholder's AC (i.e., total roll ≤ AC+2). If total ≥ AC+3, raising AC by 2 won't negate the hit — save the reaction. (+2 AC declared after seeing the roll, before damage.)
- **Below 60 HP:** prefer ranged. Hold position 60+ ft up using fly + shrine drift.
- **Below 30 HP, thralls alive:** retreats into the lower shaft using thralls and lair actions as cover. Telepathic taunt: *"You cannot seal this. The void remains."*
- **Below 30 HP, NO thralls (solo configuration):** use `shrine_drift` each bonus action to retreat toward the deeper shaft entrance. Use `unstable_ground` lair actions to prone the chasing PC. Beholder will not descend the shaft but hovers at the lip — if PCs disengage, it stops pursuing.
- **Below 20 HP, no escape:** spends every legendary on Disintegration / Void Ray on whoever is closest to killing it.

## Description (one line)

A 6-ft eyeless sphere of translucent stone-shadow, four bone-spine appendages dragging — when you look at it too long you see faces in the grooves.

---

## Weaknesses (non-DB; DM applies riders manually)

- **Sanctified dwarven weapons:** +1d8 damage per hit.
- **Holy water:** 1d8 per dose; beholder *flees* from sustained applications.
- **The lower shaft:** beholder will NOT pursue PCs down it — something deeper scares it.

## Chamber Hazards (void effects — apply to PCs, not the beholder)

- **Healing spells backfire:** Any healing spell cast inside the chamber deals its rolled healing as **necrotic damage** to the intended target instead of restoring HP (divine magic contradicts the void's absence). **Lay on Hands is a class feature, not a spell — it is UNAFFECTED and heals normally.** Potions are items, not spells — also unaffected. Only slot-consuming healing spells (Cure Wounds, Healing Word, Mass Cure Wounds, etc.) are reversed. This distinction *will* come up at table — make the ruling before the first heal is attempted. **Disintegration exception (FI-NEW-FC4-LOH):** A creature reduced to 0 HP by Disintegration Ray is *reduced to dust* — there is no body to touch. Lay on Hands requires touch; it cannot restore a disintegrated creature. Communicate this ruling immediately when Disintegration drops a PC to 0 HP, before Sabriel declares LoH. At level 5 the party has no access to True Resurrection or Wish, so disintegration is permanent — DM discretion to soften this narrative outcome if it creates a table problem.
- **Sanctified weapon rider (DM applies manually, not in DB):** Sanctified dwarven weapons deal +1d8 damage per hit against the beholder. If Sabriel or any PC wields a sanctified weapon, apply this after each recorded hit — the DB outputs do NOT include it.

---

## Interaction Notes (non-combat)

- Telepathic, speaks in sensation more than words. Forced speech defaults to fragmentary old-oath dwarvish.
- Negotiable if: PCs offer something tied to the sealed god (artifact, prayer, true name); PCs commit to *not* restoring the shrine; PCs agree to leave the lower shaft unexplored.
- A cleric who oath-breaks or a paladin who falls *is* a sufficient sacrifice — the beholder will treat such a moment as a sealed bargain.
- **Negotiation pacing (FI-NEW-EV5-B):** The beholder is not impulsive — always run at least 2 exchange rounds before allowing combat to trigger, regardless of how many fail. On a soft failure (no artifact, bluster, overreach), the beholder dismisses rather than attacks: *"Come back when you have proof."* PCs may withdraw without combat. Only a hard threat to the seal or an explicit statement of intent to investigate the lower shaft triggers an immediate Disintegration Ray surprise round. A second entry after dismissal is when the beholder treats the party as hostile on sight.
