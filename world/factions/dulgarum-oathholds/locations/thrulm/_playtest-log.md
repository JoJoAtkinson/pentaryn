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

### DD-7: Multiattack output labels combined damage under primary type (ONGOING from DD-2)
- **Context:** Multiattack output reads "7 slashing (incl +1 necrotic extra_damage)" — the combined total is labeled under slashing. A DM applying slashing resistance would incorrectly halve the necrotic portion. Root cause is dnd_roller.py multiattack renderer, not the DB spec.
- **Recommendation:** Fix multiattack renderer to display "6 slashing + 1 necrotic = 7 total". Out of cron blast radius.
- See `_playtest-runs/2026-05-23T02-30-00.md` MQ-1.

---

## Runs

*(newest first; each entry is one line — drill into `_playtest-runs/<ts>.md` for details)*

- 2026-05-23 07:16 UTC — slice #6 (shardcaller-team) — party VICTORY in 3 rounds; Bazgar took 28 piercing R1 (double-barrage), Marwen near-lethal at 9/32 R2; Fireball R2 collapsed two shardcallers and put all three in finishing range; Call Weakness wasted entirely (attack-roll ability incompatible with Barrage); triple front-loaded Barrage fired R1, recharge never happened; kiting feel absent (Fireball trivializes range advantage); 1 auto-fix (Call Weakness / Barrage stagger tactics), 3 new DDs raised (DD-16 CW incompatibility, DD-17 Barrage front-load, DD-18 Fireball trivializes) — see _playtest-runs/2026-05-23T07-16-03.md
- 2026-05-23 06:19 UTC — slice #5 (solo-rager-rush) — party VICTORY in 2 rounds; Marwen near-lethal R1 (2 HP), revived R2; 2 Fireballs solved the fight before Berserk/Taunt/Madness mechanics could loop; 0 bugs fixed, 2 new DDs raised (DD-14 HP too low for slice intent, DD-15 Berserk 3-attack output confusion) — see _playtest-runs/2026-05-23T06-19-43.md
- 2026-05-23 05:21 UTC — slice #4 (final-confrontation) — TPK in 2 rounds; Marwen 💀 R1 (double Ancient Resonance), Bazgar 💀 R2 (void eruption), Sabriel 💀 R2 (shrine-touched multiattack); beholder dealt 0 direct damage (init 6, all PCs dead/dying before its turn); 2 bugs fixed (retarget tactics, chamber hazard mislabeling), 2 new DDs raised (DD-12 init, DD-13 lair variance), DD-11 follow-up added — see _playtest-runs/2026-05-23T05-21-54.md
- 2026-05-23 04:30 UTC — slice #3 (beholder-escorts-limited) — party indeterminate (Marwen 💀 R2, Bazgar grappled, Sabriel untouched at 43/44 HP; projected TPK by R4-5); beholder at 51/110 HP after 3 rounds; Fireball never fired (Marwen eliminated before R3); 0 bugs fixed, 1 new DD raised (DD-11 Maw grapple-crit vs disadvantage-on-saves discrepancy) — see _playtest-runs/2026-05-23T04-30-11.md
- 2026-05-23 03:17 UTC — slice #2 (tank-wall) — party VICTORY in 5 rounds; no PCs fell; Shardcaller fired Shard-Barrage 3× (high luck run); Taunt DC 12 never landed (3/3 misses by Marwen); 0 bugs fixed, 3 DESIGN DECISIONS raised (DD-8 Call Weakness guard, DD-9 Pack Tactics timing, DD-10 local RNG fallback) — see _playtest-runs/2026-05-23T03-17-40.md
- 2026-05-23 02:30 UTC — slice #1 (shrine-wedge) — party VICTORY in 4 rounds; Sabriel fell R3 (Unstable Form advantage chained hits); altar zone suppressed Fireball doubling, saving both derro from R1 death; 1 auto-fix (altar zone docs), 4 DESIGN DECISIONS raised — see _playtest-runs/2026-05-23T02-30-00.md
- 2026-05-23 01:37 UTC — slice #0 (threshold-patrol) — party VICTORY in 3 rounds; Marwen reached 8 HP (primary target throughout); Shardcaller barrage dominated damage; 1 bug fixed (ancient_resonance psychic rider) — see _playtest-runs/2026-05-23T01-41-59.md
