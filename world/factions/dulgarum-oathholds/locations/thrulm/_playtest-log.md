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

---

## Runs

*(newest first; each entry is one line — drill into `_playtest-runs/<ts>.md` for details)*

- 2026-05-23 01:37 UTC — slice #0 (threshold-patrol) — party VICTORY in 3 rounds; Marwen reached 8 HP (primary target throughout); Shardcaller barrage dominated damage; 1 bug fixed (ancient_resonance psychic rider) — see _playtest-runs/2026-05-23T01-41-59.md
