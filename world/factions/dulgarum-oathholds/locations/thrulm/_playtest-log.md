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

### DD-10: dnd_roller.py needs local RNG fallback for cron sandbox (INFRA)
- **Context:** External RNG endpoints (random.org, quantumnumbers.anu.edu.au) are blocked by the Anthropic sandbox outbound network policy. Phase A required a monkey-patch in the cron harness to pre-populate the number cache with `random.Random`. All 27 actions still passed cleanly.
- **Recommendation:** Add ~10 lines to `scripts/dnd_roller.py` inside `_ensure_numbers`: after both external fetches fail, fall back to `os.urandom`-seeded local random. Out of cron blast radius — human to implement.
- See `_playtest-runs/2026-05-23T03-17-40.md` MQ-1.

### DD-7: Multiattack output labels combined damage under primary type (ONGOING from DD-2)
- **Context:** Multiattack output reads "7 slashing (incl +1 necrotic extra_damage)" — the combined total is labeled under slashing. A DM applying slashing resistance would incorrectly halve the necrotic portion. Root cause is dnd_roller.py multiattack renderer, not the DB spec.
- **Recommendation:** Fix multiattack renderer to display "6 slashing + 1 necrotic = 7 total". Out of cron blast radius.
- See `_playtest-runs/2026-05-23T02-30-00.md` MQ-1.

---

## Runs

*(newest first; each entry is one line — drill into `_playtest-runs/<ts>.md` for details)*

- 2026-05-23 03:17 UTC — slice #2 (tank-wall) — party VICTORY in 5 rounds; no PCs fell; Shardcaller fired Shard-Barrage 3× (high luck run); Taunt DC 12 never landed (3/3 misses by Marwen); 0 bugs fixed, 3 DESIGN DECISIONS raised (DD-8 Call Weakness guard, DD-9 Pack Tactics timing, DD-10 local RNG fallback) — see _playtest-runs/2026-05-23T03-17-40.md
- 2026-05-23 02:30 UTC — slice #1 (shrine-wedge) — party VICTORY in 4 rounds; Sabriel fell R3 (Unstable Form advantage chained hits); altar zone suppressed Fireball doubling, saving both derro from R1 death; 1 auto-fix (altar zone docs), 4 DESIGN DECISIONS raised — see _playtest-runs/2026-05-23T02-30-00.md
- 2026-05-23 01:37 UTC — slice #0 (threshold-patrol) — party VICTORY in 3 rounds; Marwen reached 8 HP (primary target throughout); Shardcaller barrage dominated damage; 1 bug fixed (ancient_resonance psychic rider) — see _playtest-runs/2026-05-23T01-41-59.md
