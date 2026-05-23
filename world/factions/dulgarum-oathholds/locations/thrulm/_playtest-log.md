# Thrulm — Playtest Rolling Log

> Auto-appended by the hourly playtest cron. Newest run first.
> Per-run detail lives in `_playtest-runs/<timestamp>.md` (same folder).
> Critical design decisions for the human to review are also flagged under **DESIGN DECISIONS** below.

---

## Status

- **Party under test:** `world/party/the-compass-edge/combat-roster.yml` (Compass Edge, level 5, 3 PCs)
- **Encounter:** `world/factions/dulgarum-oathholds/locations/thrulm/`
- **Difficulty intent:** OVERWHELMING. The beholder is CR 13; party is level 5. Expected outcome of full-bore encounter is TPK. Use the scenario count knobs in `combat-runner/.testbot/scenarios.yml` for tractable slices.

---

## DESIGN DECISIONS (review in morning)

### DD-35: Thrall HP floor creates cleanup noise not threat — survives Fireball half-save at 10 HP
- **Context:** 2026-05-23 final-confrontation 2nd-cycle. Thrall-1 and Thrall-3 survived Marwen's R1 Fireball (half-save, 12 damage from 25 roll), continued attacking for 2 more rounds, dealt exactly 4 piercing damage total across all attacks. No meaningful threat. The "cleanup tax" of surviving thralls consumes party attention without providing dramatic moments.
- **Recommendation (log only):** At table, `compel_thrall` bonus action should redirect surviving thralls toward more useful positioning (blocking LoS, engaging Sabriel instead of Bazgar front). Simulation's dumb-targeting understates thrall utility. No DB change.

### DD-34: Drain Divinity succeeded but had zero impact — final confrontation ends too fast for legendary compounding
- **Context:** 2026-05-23 final-confrontation 2nd-cycle R2. First Drain Divinity success in any run: Sabriel Cha save 15 vs DC 16 → stripped L2 smite slot. But Sabriel was at 20 HP and died in R3 regardless. The stripped slot was never used. Effect: 4 temp HP on a 110-HP beholder. The ability's counter-heal design requires ≥4 rounds to matter — the final confrontation ends in R3.
- **Recommendation:** No change. Drain Divinity is correctly aimed at longer slices (beholder-escorts-limited, empty-void). In final confrontation, it can only manifest if party survives R4+ — possible with stronger seeds or different positioning.

### DD-33: Shrine-touched initiative dominates final confrontation — both roll 18–23, acting before entire party
- **Context:** 2026-05-23 final-confrontation 2nd-cycle. Shrine-1 and Shrine-2 both rolled init 23 (20+3 Dex). Both acted before Bazgar (15), Sabriel (11), Marwen (9), and the beholder (10). Sabriel was at 27/44 HP before any PC acted in R1. In R2, double Ancient Resonance fired before any PC turn, dropping Bazgar to 17 and Marwen to 6. Second consecutive final-confrontation run with shrine-touched consistently outpacing party. Structural — not seed-dependent.
- **Recommendation (do NOT auto-fix):** (a) Lower shrine-touched initiative Dex modifier to +1 (lore rationale: shrine's weight suppresses physical agility), OR (b) position shrine-touched 120 ft from shaft entrance in final confrontation (they orbit altar, don't rush entrance). Option (b) preferred — preserves stat block. Human review required.

### DD-28: Drain Divinity zero-fire pattern — beholder's flagship counter never fires (2nd occurrence)
- **Context:** 2026-05-23 beholder-escorts-limited 2nd-cycle. Sabriel held L3 slot R1–R5, Marwen held L3 slot through R1. Drain Divinity (3 legendary actions) never triggered. Same finding as cycle-1 run (04:30 UTC). 7 rounds of full-legendary-budget resets, never a Drain Divinity fire. The beholder's premier anti-divine-caster ability has not fired in any run.
- **Auto-fix applied:** Added priority clause to tactics: "Legendary priority order: Drain Divinity FIRST if budget is full and slot-holder with L2+ is within 30 ft." Authoring-only.
- **Remaining work:** If Drain Divinity still doesn't fire in next 2 beholder runs, consider reducing legendary cost from 3 → 2 actions, making it more naturally competitive with Void Ray. Requires human sign-off on balance impact (temp HP gain via Drain Divinity is significant at high slot levels).

### DD-31: Prone advantage on beholder melee attacks not modeled — DM reminder missing
- **Context:** 2026-05-23 beholder-escorts-limited 2nd-cycle. Unstable Ground proned Sabriel 3/3 consecutive rounds (R5–R7). Beholder's Tentacle Lash (melee) should have rolled with advantage. Not applied. Hit probability goes from ~35% to ~56% vs AC 19 — enough to flip misses to hits.
- **Recommendation:** Add to `beholder-thrulm.md` tactics under "Engaged by melee": "If target is prone and beholder is within 5 ft, all Tentacle and Maw attacks have advantage." Authoring-only. Decide whether to auto-fix next cycle.

### MQ-4: Void Scream first-use ambiguity — "wait for recharge" vs "starts available"
- **Context:** 2026-05-23 beholder-escorts-limited 2nd-cycle R1–R2. Two or more PCs clustered within 30 ft for 2 rounds; Void Scream was available but never fired. Tactics text "fire the moment it's recharged" implies waiting, even though the ability starts available (not recharged from a prior use). DM treating it as a recharge-wait ability loses the devastating R1 window.
- **Recommendation:** Clarify tactics: "Void Scream **is available from R1** — fire it immediately if 2+ PCs cluster within 30 ft. Do not treat first use as a recharge wait." Authoring-only, low-risk. This is potentially high-impact: a R1 Void Scream when the party first enters clusters everyone within 30 ft.

### FI-3 (PENDING HUMAN REVIEW): Beholder main action wasted below 60 HP — tactics gap
- **Context:** 2026-05-23 beholder-escorts-limited 2nd-cycle R5–R6. Below 60 HP, tactics say "prefer ranged, hold position 60+ ft up." Beholder used shrine_drift (bonus) but took no main-action attack in 2 rounds. Should be: shrine_drift (bonus) + Void Ray or Multiattack (main). Text doesn't specify main action separately from positioning.
- **Recommendation:** Add: "Below 60 HP, shrine_drift handles repositioning (bonus). Main action is still Void Ray or Multiattack from altitude — do not skip the main action." NOT auto-fixing — requires human review of below-60-HP intended behavior before authoring.

> Each entry: heading, context, recommendation, and a pointer to the failing run or the change made.

### DD-1: Shard-Barrage recharge (5 vs 6) for threshold-patrol slice
- **Context:** In the 2026-05-23 threshold-patrol run, Shard-Barrage fired twice in 3 rounds (rounds 1 and 2) and was the dominant damage source, outpacing both Deep Watch derro combined. At recharge 5+, the expected fires-per-3-rounds is ~0.9 (33% per round), but the actual seed produced two consecutive fires.
- **Recommendation:** Evaluate whether recharge 5 is too reliable for a sub-boss Shardcaller in close-quarters fights where PCs are inevitably clustered. Consider recharge 6 OR document that the Shardcaller IS the primary threat in this slice and the Deep Watch are just melee pressure. See `_playtest-runs/2026-05-23T01-41-59.md` Feel Issue #1.

### DD-2: Ancient Resonance missing +1d4 psychic rider (AUTO-FIXED)
- **Context:** The `.md` tactics for shrine-touched-derro describe "+1d4 psychic on fail" for Ancient Resonance, but the DB spec had no such field. The roller output would silently omit this.
- **Fix applied:** Updated `ancient_resonance` narration to include a bracketed DM reminder. Also added `notes` field to save dict for future roller improvements. See `_playtest-runs/2026-05-23T01-41-59.md` Bugs auto-fixed section.
- **Remaining work:** `dnd_roller.py` area action handler doesn't render `save.notes`. A one-liner addition to the area renderer would surface these notes automatically. Out of cron blast radius — human to implement.

### DD-3: Deep Watch below-half retreat — crossbow switch not specified
- **Context:** The DW tactics say "Disengage, fall back" at ≤13 HP but don't say to switch to crossbow. A DM could reasonably keep the DW in melee while "falling back," which contradicts the tactical intent.
- **Recommendation:** Add to `deep-watch-derro.md` tactics: "Once below half HP and disengaged, switch to **Light Crossbow** from cover." Low-risk authoring clarification.

### DD-4: Altar zone fire/radiant vulnerability suppression — now documented in NPC .md (AUTO-FIX)
- **Context:** Shrine-touched-derro are vulnerable to fire and radiant, but within 60 ft of the altar the shrine's ambient power suppresses this vulnerability. Without the suppression, Marwen's Fireball (8d6=22 fire, doubled = 44 per target) would have killed both shrine-touched in Round 1 — the encounter evaporates. This mechanic was not written down anywhere in DM-facing files; DM had to know from slice briefing only.
- **Fix applied:** Added "Altar Zone" section to `shrine-touched-derro.md` stat line and a full explanation block in Tactics. See `_playtest-runs/2026-05-23T02-30-00.md`.
- **Remaining work:** The `_overview.md` Geography section doesn't list this as a terrain feature. Also: does the suppression apply to all fire/radiant (including cantrips, torches) or only spells? Needs authoring decision.

### DD-5: Unstable Form feedback loop — 10+ damage threshold too easily triggered
- **Context:** In the shrine-wedge run, Rune-B had Unstable Form advantage for 3 consecutive rounds. The 10+ damage threshold is met almost every round once the party focuses fire. Effectively becomes permanent advantage, not a "reactive danger moment."
- **Recommendation:** Raise threshold to 15+, or limit to first attack only (not all attacks), or tie to HP milestone (half HP or below). Current mechanic snowballs: more PC damage → more shrine-touched advantage → more PC damage taken.
- See `_playtest-runs/2026-05-23T02-30-00.md` DD-5.

### DD-6: Both shrine-touched burn Ancient Resonance R1 — later rounds Resonance-dry
- **Context:** With 3 PCs clustering in approach, both derro qualify for the "2+ in 15-ft cone" condition immediately. Result: double Resonance in R1, then zero recharge fires in a 4-round fight (recharge 5-6, ~33%/round). The dynamic "will Resonance recharge in time?" tension never materializes.
- **Recommendation:** Stagger tactics (one derro holds Resonance until R2), reduce trigger threshold, or increase recharge probability to 4-6. See `_playtest-runs/2026-05-23T02-30-00.md` DD-6.

### DD-8: Call Weakness wasted on dying ally — tactics need HP guard
- **Context:** In the 2026-05-23 tank-wall run (R3), the Shardcaller spent its last Call Weakness charge giving the Rager advantage — when the Rager had 10 HP and was killed that same round before it could attack. The final use was mechanically inert.
- **Recommendation:** Add to `derro-shardcaller.md` tactics: "Do not spend Call Weakness on an ally at ≤15 HP or below half HP — save the charge for a fresh attacker or hold for the most dangerous round." Low-risk authoring-only fix.
- See `_playtest-runs/2026-05-23T03-17-40.md` FI-1.

### DD-9: Pack Tactics Voice passive timing ambiguity
- **Context:** The "when an ally hits, target has disadvantage on next save" passive fired 3 times in the tank-wall run as a DM note but was never enforced in practice. Timing is unclear: does it apply to saves triggered on the Shardcaller's own turn (after an ally's attack in a prior turn)?
- **Recommendation:** Add an explicit example to `derro-shardcaller.md`: "e.g., if the Rager hits Bazgar on the Rager's turn, Bazgar has disadvantage on all saves until end of Bazgar's next turn." Ruling: YES, applies to any save by the target before end of target's next turn, regardless of when in the round the save is triggered.
- See `_playtest-runs/2026-05-23T03-17-40.md` FI-2 / MQ-2.

### DD-11: Maw grapple rider — "critical hit" (DB) vs "disadvantage on saving throw" (original stat sheet)
- **Context:** The original `beholder-thrulm.md` stat block described the Maw grapple effect as "target has disadvantage on the saving throw." The DB spec (authored during the `feat(thrulm)` conversion) says "If the target is grappled by the beholder, this attack is a critical hit instead." These are mechanically different: the crit version doubles Maw damage on a grappled target (~21 → ~39 avg) while the disadvantage version only penalizes PC reactions. Both the `multiattack` Maw entry and the new standalone `maw` action use the "crit" version for consistency.
- **Recommendation:** Decide which rule is canonical. The crit version creates more dramatic grapple→bite moments but is a significant upgrade. If intending "crit on grapple," document explicitly in tactics. If intending "disadvantage on saves," update `rider_on_hit` on both `multiattack.Maw` and standalone `maw`.
- See `_playtest-runs/2026-05-23T04-30-11.md` DD-11.

### DD-10: dnd_roller.py needs local RNG fallback for cron sandbox (INFRA)
- **Context:** External RNG endpoints (random.org, quantumnumbers.anu.edu.au) are blocked by the Anthropic sandbox outbound network policy. Phase A required a monkey-patch in the cron harness to pre-populate the number cache with `random.Random`. All 27 actions still passed cleanly.
- **Recommendation:** Add ~10 lines to `scripts/dnd_roller.py` inside `_ensure_numbers`: after both external fetches fail, fall back to `os.urandom`-seeded local random. Out of cron blast radius — human to implement.
- See `_playtest-runs/2026-05-23T03-17-40.md` MQ-1.

### DD-12: Beholder's Disintegration Ray fired at a dead PC — initiative tail-end problem
- **Context:** In the 2026-05-23 final-confrontation run, the beholder rolled init 6 (last). Shrine-A's Ancient Resonance (init 9) killed Marwen before the beholder's turn. Disintegration Ray was then fired at a corpse — the beholder's signature weapon was mechanically inert on its debut round. Fourth recurrence of DD-6 (both shrine-touched fire Resonance R1) contributed: Marwen took ~34 necrotic+psychic damage from double Resonance in R1 without the beholder contributing a single HP of damage.
- **Recommendation:** Two options: (a) Give beholder +4 flat initiative bonus (legendary tier — justified by its truesight and alien perception); (b) add tactics note "If Disintegration Ray primary target is dead, retarget next caster/divine martial or hold for Void Scream." Auto-fix #1 in this run adds the retarget text but does not address the init position. Does not change encounter balance (still TPK in 2 rounds) but impairs the beholder's menace.
- See `_playtest-runs/2026-05-23T05-21-54.md` DD-12.

### DD-14: Solo-rager-rush resolves in 2 rounds — Berserk/Taunt/Madness mechanics untested
- **Context:** 2026-05-23 solo-rager-rush run (seed 494310). Marwen's two Fireballs (8d6 each) dealt more damage across R1–R2 than all six rager multiattacks combined. The fight ended before any Berserk recharge roll was needed, before Taunt-forced disadvantage had a meaningful effect, and before Madness Endurance produced a visible hit. The three signature mechanics the slice is intended to stress-test were never exercised.
- **Recommendation:** (a) Bump rager HP to ~65 to survive a single Fireball hit and force 4+ rounds, or (b) add a Fireball terrain constraint (column cover in the vault limits AOE overlap to 2 ragers max). Without a change, every wizard-in-party run ends this slice in R2. See `_playtest-runs/2026-05-23T06-19-43.md` FI-1.

### DD-15: Berserk output always shows 3 attacks regardless of in-reach target count
- **Context:** 2026-05-23 solo-rager-rush. Rager#2 berserked with only 2 living PCs; the DB output still printed a 3rd attack line. The prereq says "fewer attacks if fewer in reach" but the roller enforces nothing — DM must manually skip excess lines. Confusing at table.
- **Recommendation:** Document in `derro-rager.md` tactics: "Berserk output always prints 3 attack lines — DM caps at actual in-reach creature count." Or restructure spec to hand-roll variable targets outside the DB. See `_playtest-runs/2026-05-23T06-19-43.md` FI-2.

### DD-13: Void Eruption lair action damage variance — can feel trivial on low rolls
- **Context:** Round 1 Void Eruption (2d10 force, DC 16 Dex) rolled 2 total (1+1 = 2). Half on save = 1 force per PC. A lair action that deals 1 force is set-dressing. At mean (11), it's meaningful; at minimum (2), it's not. This is the first time the lair action's low-end has been tested.
- **Recommendation:** Raise to `3d6` (range 3–18, average 10.5) for a higher floor with similar ceiling, or add a minimum damage note. Alternatively raise the save DC from 16 to 17 to make even small-damage results sting more. Balance-adjacent only — all 4 final-confrontation runs result in TPK regardless.
- See `_playtest-runs/2026-05-23T05-21-54.md` DD-13.

### DD-16: Call Weakness wasted in shardcaller-only formations — attack-roll ability incompatible with Barrage
- **Context:** 2026-05-23 shardcaller-team run. All 3 shardcallers burned Call Weakness in R1 on allies who then fired Shard-Barrage (a save-based area, not an attack roll). All 5 charges spent had zero measurable effect. Call Weakness says "advantage on next attack roll" — Barrage, Taunt, and Ancient Resonance are all saves, not attack rolls.
- **Fix applied:** Added explicit guard to `derro-shardcaller.md` tactics: "Do not Call Weakness an ally who plans to use Shard-Barrage this turn — advantage is wasted." Also added stagger note for multi-shardcaller formations.
- **Remaining work:** Extend note to cover Rager Taunt + any other save-based abilities in the encounter. Consider redesigning Call Weakness to grant advantage on saves instead (or both) if intended to synergize with Barrage.
- See `_playtest-runs/2026-05-23T07-16-03.md` FI-1 / DD-16.

### DD-17: Triple Barrage front-loaded in R1 — shardcaller signature weapon never recycles
- **Context:** 2026-05-23 shardcaller-team run. All 3 shardcallers fired Barrage in R1 (simultaneous); recharge 5–6 never fired in R2–R3. Identical structural issue to DD-6 (shrine-touched double Resonance R1). The "will Barrage recharge?" tension that the mechanic is designed for never emerged.
- **Recommendation:** Auto-fix (stagger tactic) applied to .md. Two additional options: (a) raise recharge to 4–6 for higher probability in multi-round fights, (b) give shardcallers a tactics rule preventing barrage if another shardcaller just fired this round (forcing natural stagger). Stagger tactic alone requires DM discipline — may not be reliable at table.
- See `_playtest-runs/2026-05-23T07-16-03.md` FI-2 / DD-17.

### DD-18: Fireball trivializes shardcaller slice (mirror of DD-14 for ragers)
- **Context:** 2026-05-23 shardcaller-team run. Marwen's R2 Fireball brought all 3 shardcallers from 33 HP to 11/11/dead. Fight effectively decided by a single spell. Shardcallers have no fire resistance and low HP for a 3-NPC cluster in an open area. Kiting mechanic (Tactical Retreat) was mechanically irrelevant — Fireball is 150-ft range and doesn't require the wizard to close.
- **Recommendation:** Terrain constraint (columns limit Fireball overlap to ≤2 targets at once) OR bump HP to ~42 OR give shardcallers Evasion. Terrain constraint is the least disruptive and fits the stone-corridor setting. Authoring-only change to encounter notes; no DB modification needed.
- See `_playtest-runs/2026-05-23T07-16-03.md` FI-3 / DD-18.

### DD-19: Drain Divinity slot-targeting ambiguity (AUTO-FIXED)
- **Context:** 2026-05-23 empty-void run. The ability text says "spell slots or divine power" — ambiguous whether it targets arcane (wizard) slots or only divine slots. At table, a DM might rule it doesn't drain Marwen's wizard slots.
- **Fix applied:** Clarified tactics in `beholder-thrulm.md` to explicitly state "any creature with spell slots (including arcane casters)." If intent is divine-only, revert and add `target_filter: "divine_slots"` to DB spec.
- **Remaining work:** Confirm canonical intent: all spell slots vs divine only. The "all slots" version is more tactically interesting. See `_playtest-runs/2026-05-23T08-20-26.md` MQ-1.

### DD-20: Solo beholder retreat path nonfunctional without thralls (AUTO-FIXED)
- **Context:** 2026-05-23 empty-void run. Below-30-HP tactics said "retreats using thralls and lair actions as cover." No thralls in solo slice → beholder had no cover and fought to death instead. Fight ran 7 rounds with beholder alive at 2–10 HP for 4+ rounds.
- **Fix applied:** Added explicit solo-config retreat clause to `beholder-thrulm.md`: shrine_drift each round toward the deeper shaft, unstable_ground on chasing PC, beholder hovers at shaft lip.
- **Remaining work:** DM decision needed — in the negotiation/empty-void context, should the beholder fight to death (backed into a corner) or retreat? See `_playtest-runs/2026-05-23T08-20-26.md` MQ-2.

### DD-21: Antireality reaction — zero fires in 7-round solo fight
- **Context:** 2026-05-23 empty-void run. Antireality (+2 AC vs one incoming attack, declared after seeing the roll) was available every round but never triggered. Auto-fix sharpened the trigger guidance ("any stated Divine Smite, stated Power Attack, or ≥10 estimated damage — when in doubt, trigger"). But 0/7 uses may persist without deliberate DM tracking.
- **Recommendation:** Add a reminder line to the Start-of-turn checklist: "At end of your turn, note whether Antireality fired this round (it should fire ~1×/2 rounds in a melee fight)." If 2+ future runs also show 0/N uses, the reaction threshold is too ambiguous.
- See `_playtest-runs/2026-05-23T08-20-26.md` DD-21.

### DD-22: Phase B test harness simulates Tactical Drilling as flat roll — DW threat understated
- **Context:** 2026-05-23 threshold-patrol 2nd-cycle run. The cron simulation applies `d20+2` for DW Tactical Drilling instead of rolling with advantage (`max(d20a,d20b)+2`). Actual hit rate vs AC 15 Marwen is ~64% with advantage vs 40% flat; vs AC 18 Bazgar it's ~56% vs 35%. Deep Watch are mechanically more threatening than every sim result shows.
- **Recommendation:** Fix the Phase B loop to roll `max(d20a, d20b)+bonus` when advantage conditions are met. Out of cron blast radius for DB changes — human to update the harness or the cron-prompt simulation template. Until fixed, DW patrol results in `_playtest-runs/` understate DW damage contribution.
- See `_playtest-runs/2026-05-23T09-18-56.md` FI-1.

### DD-23: OBR trigger direction — harness simulation had it backwards (INFRA)
- **Context:** 2026-05-23 shrine-wedge 2nd-cycle run. The Phase B simulation triggered Oath-Breaking Retaliation when the shrine-touched *landed a hit on a PC*, but the DB spec and `.md` both say it fires when the shrine-touched *takes damage* (reaction trigger: `"event": "damage", "match": "took damage from a visible source"`). The correct flow is: PC attacks shrine-touched → shrine-touched takes damage → OBR reaction fires → counter-swing at that attacker. The simulation had it inverted, so OBR was never fired from the correct direction in this run.
- **Recommendation:** Fix Phase B loop so OBR is triggered during PC attack sequences (after a hit lands on the shrine-touched), not during the NPC's own attack loop. No DB spec change needed — spec is correct. Also add a DM timing note to `shrine-touched-derro.md` start-of-turn checklist: "OBR fires **immediately when the shrine-touched takes damage** (during the attacker's turn), interrupts between attacks if multiattack. Spent until next start-of-turn."
- See `_playtest-runs/2026-05-23T10-18-49.md` MQ-1.

### DD-24: Taunt mechanically inert when target already focuses Rager
- **Context:** 2nd-cycle tank-wall run. Rager Taunted Marwen (R1 fail, DC 12 Cha). Marwen then cast Scorching Ray at the Rager — the Taunt's "disadvantage on attacking non-Rager" clause had zero effect because she was attacking the Rager anyway. In both tank-wall runs the wizard's rational R1 play is always to down the frontliner. Taunt that forces a target onto the Rager is wasted when the target was going to attack the Rager regardless. Auto-fix added a tiebreaker heuristic (prefer targets attacking the Shardcaller), but root cause is structural: as a preemptive bonus-action effect it can't adapt to what the PC actually does.
- **Recommendation:** Consider redesigning Taunt as a reaction (fires when the Shardcaller is targeted) rather than a preemptive bonus action. Alternatively raise DC to 15 so the fail/save outcome matters more. Review requires changing the DB spec — out of auto-fix scope.
- See `_playtest-runs/2026-05-23T11-20-00.md` DD-24.

### DD-25: Call Weakness guard (DD-8) insufficient when Rager drops below floor in same initiative window
- **Context:** 2nd-cycle tank-wall R2. Rager was at 16 HP (above DD-8's 15 HP guard) when Shardcaller spent Call Weakness. Sabriel then reduced Rager to 10 HP on the same tick before Shardcaller acted. Rager fired Berserk (missed both), then died to Marwen. Final Call Weakness use produced zero impact: Berserk missed AC 18 and AC 19 even with advantage on first swing.
- **Recommendation:** Raise HP guard from ≤15 to ≤20 in `derro-shardcaller.md` tactics. Authoring-only; no DB spec change. Also: "do not spend Call Weakness if the Rager is the only surviving NPC — save it for the most dangerous round of the fight." Low-risk change.
- See `_playtest-runs/2026-05-23T11-20-00.md` DD-25.

### DD-26: Tank-wall slice party-victory both cycles — Berserk+CW pairing never demonstrates
- **Context:** Both tank-wall runs (03:17 UTC, 11:20 UTC) resolved in 5 and 3 rounds respectively via party victory. In neither run did the Berserk + Call Weakness synergy fire in a meaningful context — the Rager died before landing a Berserk hit. The slice is designed to showcase this pairing; it cannot do so if the Rager dies in R2 to concentrated level-5 fire (Sabriel smite + Marwen Scorching Ray). Structural mirror of DD-14 (solo-rager-rush) and DD-5 (Unstable Form requires 3+ rounds).
- **Recommendation:** Raise Rager HP from 52 to ~70 (10d8+30) to survive one full round of focused fire and enable a R3 Berserk moment. Balance-adjacent change — requires human sign-off before implementation. Do NOT auto-fix.
- See `_playtest-runs/2026-05-23T11-20-00.md` DD-26.

### DD-7: Multiattack output labels combined damage under primary type (ONGOING from DD-2)
- **Context:** Multiattack output reads "7 slashing (incl +1 necrotic extra_damage)" — the combined total is labeled under slashing. A DM applying slashing resistance would incorrectly halve the necrotic portion. Root cause is dnd_roller.py multiattack renderer, not the DB spec.
- **Recommendation:** Fix multiattack renderer to display "6 slashing + 1 necrotic = 7 total". Out of cron blast radius.
- See `_playtest-runs/2026-05-23T02-30-00.md` MQ-1.

---

## Runs

*(newest first; each entry is one line — drill into `_playtest-runs/<ts>.md` for details)*

- 2026-05-23 13:15 UTC — slice #4 2nd-cycle (final-confrontation) — TPK R3; Marwen ☠ R2 (Disintegration Ray, beholder — but at 6 HP from shrine Resonance damage); Bazgar ☠ R3 (Ancient Resonance, Shrine-1); Sabriel ☠ R3 (Shrine-Axe, Shrine-2); beholder at 110/110 HP (took ZERO damage entire fight); Drain Divinity fired and succeeded (first time across all runs) but made zero tactical impact; shrine-touched init 23 both rounds (ahead of entire party) confirmed structural (DD-33 new); double Ancient Resonance R2 confirms DD-6 2nd cycle; 0 bugs fixed; 3 new DDs raised (DD-33 shrine init dominance, DD-34 Drain Divinity late-game irrelevance, DD-35 thrall cleanup noise) — see _playtest-runs/2026-05-23T13-15-00.md
- 2026-05-23 12:18 UTC — slice #3 2nd-cycle (beholder-escorts-limited) — TPK R7; Marwen ☠ R2 (Void Ray), Bazgar ☠ R4 (Void Ray), Sabriel ☠ R7 (Tentacle Lash); beholder at 20/110 HP; all thralls dead R1 (Fireball + Sabriel, 2nd cycle confirms pattern); Drain Divinity zero fires (DD-28 confirmed 2nd time, auto-fix priority clause added); Antireality 4/7 rounds (✓ DD-21 fix holding); Void Scream never fired despite being available R1 (MQ-4 new); 1 auto-fix (Drain Divinity priority rule), 3 new DDs raised (DD-28 2nd occurrence, DD-31 prone/melee advantage gap, MQ-4 Void Scream first-use) — see _playtest-runs/2026-05-23T12-18-00.md
- 2026-05-23 11:20 UTC — slice #2 2nd-cycle (tank-wall) — party VICTORY in 3 rounds; Bazgar 32/49, Marwen 17/32 (2 level-2 slots burned), Sabriel 33/44; Rager fell R2 (never landed Berserk); Call Weakness spent 2× on Rager (missed all Berserk swings vs AC 18/19); Taunt landed R1 but Marwen targeted Rager anyway (mechanically inert); Shardcaller missed both R3 shots and fell to Fire Bolt; 2 auto-fixes (Taunt tiebreaker in rager.md, Berserk+CW first-swing note in shardcaller.md); 3 new DDs raised (DD-24 Taunt inert on self-targeting PC, DD-25 CW below-floor initiative gap, DD-26 tank-wall pairing never demonstrates in 2nd cycle) — see _playtest-runs/2026-05-23T11-20-00.md
- 2026-05-23 10:18 UTC — slice #1 2nd-cycle (shrine-wedge) — party VICTORY in 2 rounds; Bazgar 21/49, Marwen 26/32, Sabriel untouched (44/44); altar zone suppressed Fireball vulnerability again (saved ST2 from R1 death); Action Surge + Fireball ended fight before Unstable Form or Resonance recharge tension could develop; OBR trigger direction bug found in harness (fires on shrine-touched taking damage, not landing hit); 0 bugs fixed, 1 new DD raised (DD-23 OBR trigger harness); reinforces DD-5 (Unstable Form threshold), DD-6 (Resonance front-load) — see _playtest-runs/2026-05-23T10-18-49.md
- 2026-05-23 09:18 UTC — slice #0 2nd-cycle (threshold-patrol) — party VICTORY in 4 rounds; Bazgar 39/49, Marwen 16/32 (all slots burned), Sabriel untouched; Barrage fired once (R1), recharged R3 but SC1 at 1 HP; both DW saved on Thunderwave (wasted slot); 0 bugs fixed; 1 new DD raised (DD-22: harness models Tactical Drilling as flat not advantage — DW threat understated by ~24 pp); FI-3: DD-1 Barrage-double-fire concern is seed-dependent not structural — see _playtest-runs/2026-05-23T09-18-56.md
- 2026-05-23 08:20 UTC — slice #7 (empty-void) — party VICTORY in 7 rounds (barely: Bazgar+Marwen down, Sabriel at 5/44 HP); beholder killed by Sabriel melee after Void Ray killed or downed Marwen 3× (LoH triage loop key mechanic); Disintegration fired 2×; Void Scream never recharged (recharge-6 expected variance); Antireality never triggered (0/7 rounds — DM vigilance gap); 4 auto-fixes (Drain Divinity scope, solo retreat path, Antireality threshold, Chamber Hazard LoH callout); 3 new DDs raised (DD-19 Drain Divinity ambiguity, DD-20 solo retreat, DD-21 Antireality 0-fire) — see _playtest-runs/2026-05-23T08-20-26.md
- 2026-05-23 07:16 UTC — slice #6 (shardcaller-team) — party VICTORY in 3 rounds; Bazgar took 28 piercing R1 (double-barrage), Marwen near-lethal at 9/32 R2; Fireball R2 collapsed two shardcallers and put all three in finishing range; Call Weakness wasted entirely (attack-roll ability incompatible with Barrage); triple front-loaded Barrage fired R1, recharge never happened; kiting feel absent (Fireball trivializes range advantage); 1 auto-fix (Call Weakness / Barrage stagger tactics), 3 new DDs raised (DD-16 CW incompatibility, DD-17 Barrage front-load, DD-18 Fireball trivializes) — see _playtest-runs/2026-05-23T07-16-03.md
- 2026-05-23 06:19 UTC — slice #5 (solo-rager-rush) — party VICTORY in 2 rounds; Marwen near-lethal R1 (2 HP), revived R2; 2 Fireballs solved the fight before Berserk/Taunt/Madness mechanics could loop; 0 bugs fixed, 2 new DDs raised (DD-14 HP too low for slice intent, DD-15 Berserk 3-attack output confusion) — see _playtest-runs/2026-05-23T06-19-43.md
- 2026-05-23 05:21 UTC — slice #4 (final-confrontation) — TPK in 2 rounds; Marwen 💀 R1 (double Ancient Resonance), Bazgar 💀 R2 (void eruption), Sabriel 💀 R2 (shrine-touched multiattack); beholder dealt 0 direct damage (init 6, all PCs dead/dying before its turn); 2 bugs fixed (retarget tactics, chamber hazard mislabeling), 2 new DDs raised (DD-12 init, DD-13 lair variance), DD-11 follow-up added — see _playtest-runs/2026-05-23T05-21-54.md
- 2026-05-23 04:30 UTC — slice #3 (beholder-escorts-limited) — party indeterminate (Marwen 💀 R2, Bazgar grappled, Sabriel untouched at 43/44 HP; projected TPK by R4-5); beholder at 51/110 HP after 3 rounds; Fireball never fired (Marwen eliminated before R3); 0 bugs fixed, 1 new DD raised (DD-11 Maw grapple-crit vs disadvantage-on-saves discrepancy) — see _playtest-runs/2026-05-23T04-30-11.md
- 2026-05-23 03:17 UTC — slice #2 (tank-wall) — party VICTORY in 5 rounds; no PCs fell; Shardcaller fired Shard-Barrage 3× (high luck run); Taunt DC 12 never landed (3/3 misses by Marwen); 0 bugs fixed, 3 DESIGN DECISIONS raised (DD-8 Call Weakness guard, DD-9 Pack Tactics timing, DD-10 local RNG fallback) — see _playtest-runs/2026-05-23T03-17-40.md
- 2026-05-23 02:30 UTC — slice #1 (shrine-wedge) — party VICTORY in 4 rounds; Sabriel fell R3 (Unstable Form advantage chained hits); altar zone suppressed Fireball doubling, saving both derro from R1 death; 1 auto-fix (altar zone docs), 4 DESIGN DECISIONS raised — see _playtest-runs/2026-05-23T02-30-00.md
- 2026-05-23 01:37 UTC — slice #0 (threshold-patrol) — party VICTORY in 3 rounds; Marwen reached 8 HP (primary target throughout); Shardcaller barrage dominated damage; 1 bug fixed (ancient_resonance psychic rider) — see _playtest-runs/2026-05-23T01-41-59.md
