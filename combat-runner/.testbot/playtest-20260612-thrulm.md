# Thrulm Playtest Report — 2026-06-12

**Agent fire:** hourly cron, remote Claude Code (fire #7)  
**Party:** The Compass Edge (level 5, 3 PCs) — Bazgar HP49/AC18, Marwen HP32/AC15, Sabriel HP44/AC19  
**Branch:** playtest-auto (existing; checked out and pulled from origin)  
**Rotation slice:** #6 — `retreat-threshold` (rotation.yml index 6; next fire: #7 `antireality-timing`)  
**Phase A status:** PASS — 0 invalid DB records. New bugs found (see below).

---

## Phase A — Mechanical Regression

### Infrastructure (confirmed OK)

| Check | Result |
|-------|--------|
| All 6 NPCs have `#combat-runner` frontmatter tag | ✅ PASS |
| All 6 NPCs have ≥1 row in `actions.jsonl` | ✅ PASS (deep-watch-derro added since fire #5) |
| `python scripts/combat_actions_db.py validate` | ✅ OK — 0 invalid records |

**NPC DB row counts this fire:**

| NPC | Rows |
|-----|------|
| beholder-thrulm | 14 (was 13 — `legendary_resistance` added in prior fire) |
| deep-watch-derro | 2 |
| derro-rager | 3 |
| derro-shardcaller | 4 |
| shrine-touched-derro | 4 |
| thrall-derro | 2 |

### Damage average audit

All parenthesised averages spot-checked against dice expressions using round-half-up convention (consistent with prior fire #1 fix of TL avg 16→14):

| Ability | Expression | Computed avg | Written avg | Status |
|---------|------------|-------------|-------------|--------|
| Tentacle Lash | 3d6+3 | 13.5 → 14 | 14 | ✅ |
| Maw | 4d8+3 | 21 | 21 | ✅ |
| Disintegration Ray | 10d8 | 45 | 45 | ✅ |
| Void Scream | 6d10 | 33 | 33 | ✅ |
| Void Ray LA | 4d10 | 22 | 22 | ✅ |
| Void Eruption | 2d10 | 11 | 11 | ✅ |
| Shrine-Drift | 1d10 | 5 | 5 | ✅ |
| DW Hand Axe | 1d6 | 3 | 3 | ✅ |
| DW Crossbow | 1d8+2 | 6 | 6 | ✅ |
| Rager Greataxe | 1d12+2 | 8.5 → 9 | 9 | ✅ |
| ST HP formula | 7d8+14 | 45 | 45 | ✅ |
| Thrall Hand Axe | 1d4 | 2 | 2 | ✅ |
| Thrall Dagger | 1d4+2 | 4 | 4 | ✅ |

All damage averages pass. No auto-fixes needed on arithmetic.

### #combat-runner tag check

All 6 NPCs: ✅ confirmed in first 10 lines of frontmatter.

### Condition immunity vs trait-text cross-check

| NPC | Immunities | Trait conflict? |
|-----|------------|----------------|
| Beholder | charmed, exhaustion, frightened, paralyzed, petrified, poisoned, prone, restrained | ✅ None. Void-Feeding "resist turning" is not a condition. |
| Rager | frightened | ✅ Madness Endurance advantage-vs-frightened clause removed in fire #6. |
| Shrine-Touched | charmed, frightened | ✅ No conflicting trait text. |
| Thrall | charmed (enslaved), frightened | ✅ Fractured Will fires against beholder commands, not fear/charm effects. |
| Deep Watch | — | ✅ No immunities to conflict. |
| Shardcaller | — | ✅ No immunities to conflict. |

### Cheat sheet cross-check (COMBAT-CHEAT-SHEET.md vs stat blocks)

All AC, HP, Init, resistance/immunity, and Save DC entries match corresponding stat blocks, with one exception:

**BUG-F7-01 (AUTO-FIXED):** Round-by-Round Checklist item 3 described Call Weakness as "(-2 to enemy saves for one of them)." This is wrong on two counts: (a) Call Weakness affects an ally's attack roll, not enemy saves; (b) "-2 to saves" is non-standard 5e language. Fixed to: "(3/day — one ally has ADVANTAGE on its next attack roll; does NOT affect saves)."

### New bugs requiring human action

**BUG-F7-02 (LOG-F7-01): Antireality DB effect is out of sync with .md**  
- DB last updated 2026-05-23: `effect: "+2 AC against the triggering attack (declared AFTER seeing the attack roll)"`  
- .md updated fire #6: "impose **disadvantage** on that attack roll (once per round)"  
- These are different mechanics. When a DM types "antireality" in the GUI, they get "+2 AC" output. The .md says "disadvantage." The fire #6 fix updated the .md but did not update the DB.  
- **Cannot auto-fix.** Requires `combat_action_upsert` for `beholder-thrulm` / `antireality`. See decisions log LOG-F7-01 for the correct new DB effect text.

**BUG-F7-03 (LOG-F7-02): void_ray DB type "area" for a single-target save**  
- The DB notes clarify it's single-target, but `type: "area"` causes the runner to format output as AoE.  
- Low severity. Logged in decisions file.

**BUG-F7-04 (LOG-F7-03): "Derro Guard" referenced in encounters.md + Clay-Shaping, no stat block exists**  
- `encounters.md` Encounter 2 requires "1 Derro Guard variant (CR 1/2)" as a sergeant NPC.  
- Beholder Clay-Shaping trait produces "a Derro Guard or Thrall Derro."  
- No `derro-guard.md` or DB rows exist for this NPC type.  
- Logged. Three options provided in decisions file.

---

## Phase B — Generative Playtest: Retreat-Threshold

**Rotation slice:** `retreat-threshold` (rotation.yml index 6)

> *Beholder drops to 28 HP. Per tactics: retreats deeper into the lower shaft, using thralls to block. Does it have a meaningful path given hover 30 ft speed and the encounter room dimensions? Does the retreat feel dramatic or anticlimactic? Check if any existing action supports the retreat mechanically.*

### Mechanical viability of the retreat

The beholder needs ~60 ft to reach the lower shaft entrance from the altar. Options:

| Sequence | Movement | OAs triggered | Viable at 28 HP? |
|----------|----------|---------------|-----------------|
| Fly 30 ft (two moves, split across turns) | 30 ft/turn | Yes — provokes from every PC in reach | Dead within 2 turns of OAs (~25 avg dmg/round from Bazgar+Sabriel) |
| Shrine-Drift (bonus) + fly 30 ft | 60 ft | **Yes — Shrine-Drift does NOT suppress OAs** | Likely dead (2–3 OAs avg ~25 damage vs 28 HP) |
| **Disengage (action) + Shrine-Drift (bonus) + fly 30 ft** | 60 ft | **None** | ✅ Viable — beholder escapes in one turn |

**Key finding:** Shrine-Drift lacks the "no opportunity attacks" clause that every other movement bonus action in this encounter includes (Driven Escape, Tactical Retreat). This means the *designed* retreat sequence (at 28 HP: flee via Shrine-Drift) actually provokes OAs and likely kills the beholder. The only safe retreat is Disengage + Shrine-Drift + fly, which costs the beholder its full action (no attack that turn).

This is actually *correct design* for an intelligent creature knowingly sacrificing its action to survive — but it is nowhere documented. A DM running the encounter cold would attempt Shrine-Drift alone and watch the beholder die mid-retreat.

### "Use thralls to block" is unachievable at the retreat threshold

By the time the beholder reaches 28 HP from 110 HP, the party has dealt 82+ damage across multiple rounds. Thrall Derro (HP 22) are almost certainly dead by round 3. Manifest Thralls lair action does not create new thralls. Clay-Shaping (10-round ritual) cannot complete in combat. The retreat note is outdated — thralls won't be alive to block pursuit.

### Dramatic feel

When the Disengage-retreat sequence fires correctly, it is effective and abrupt: the beholder phases through stone and vanishes. This is satisfying. When DMs attempt Shrine-Drift alone (most likely path), the beholder dies in the shaft doorway — also a valid dramatic moment, but not the "meaningful tactical retreat" the tactics section implies.

### Recommendations logged

- **Shrine-Drift OA gap** → Logged as LOG-F7-05. Design decision: add "no OA" clause or add tactics note with the Disengage sequence.  
- **"Use thralls" retire note** → Logged as LOG-F7-06. Update retreat text to be conditional on thrall survival.

---

## Phase C — Fixes and Log

### Auto-fixed

| ID | File | Change |
|----|------|--------|
| BUG-F7-01 | `world/factions/dulgarum-oathholds/locations/thrulm/COMBAT-CHEAT-SHEET.md` | Checklist item 3: corrected Call Weakness description |

### Logged (human decision required)

See `combat-runner/.testbot/decisions/20260612T000000-thrulm-fire7.md`:

| ID | Issue | Severity |
|----|-------|----------|
| LOG-F7-01 | Antireality DB "+2 AC" vs .md "disadvantage" (MCP required) | High |
| LOG-F7-02 | void_ray DB type "area" for single-target save (MCP required) | Low |
| LOG-F7-03 | "Derro Guard" NPC type referenced but has no stat block | Medium |
| LOG-F7-04 | Clay-Shaping in encounters.md Encounter 4 implies combat viability (10-round ritual) | Medium |
| LOG-F7-05 | Shrine-Drift lacks "no OA" clause — retreat requires Disengage action, not documented | Medium |
| LOG-F7-06 | Retreat note "use thralls to block" unavailable when thralls are dead at 28 HP threshold | Low |

### New scenario added

Added `thrulm-beholder-shrine-drift-retreat` to `scenarios.yml` — smoke-tests the `drift` verb with a prelude note documenting the OA behavior for DMs.

---

## Phase D — Commit

**Files changed:**
- `COMBAT-CHEAT-SHEET.md` — Call Weakness description fix
- `combat-runner/.testbot/decisions/20260612T000000-thrulm-fire7.md` — new log
- `combat-runner/.testbot/thrulm-rotation.json` — next_index 6 → 7
- `combat-runner/.testbot/scenarios.yml` — Shrine-Drift scenario added
- `combat-runner/.testbot/playtest-20260612-thrulm.md` — this report

---

## Still open from prior fires (carry-forward)

| ID | Origin | Issue |
|----|--------|-------|
| BUG-F5-BEL-06 | fire #5 | Beholder PB+3 attacks vs PB+5 DCs — design decision |
| BUG-F5-BEL-09 | fire #5 | Void-Feeding "advantage vs divine turning" doesn't apply to aberrations |
| FEEL-F4-01 | fire #4 | Disintegration Ray permakill at L5 — DM safety note |
| FEEL-F4-03 | fire #4 | Drain Divinity 3 LA crowded out by Void Ray (2 LA) + Move (1 LA) in every round |
| FEEL-F4-04 | fire #4 | Clay-Shaping is dead weight in combat — move to downtime |

*Generated by playtest cron agent — 2026-06-12*
