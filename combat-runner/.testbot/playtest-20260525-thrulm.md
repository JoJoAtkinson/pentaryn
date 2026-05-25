# Thrulm Playtest Report — 2026-05-25

**Agent fire:** hourly cron, remote Claude Code  
**Party:** The Compass Edge (level 5, 3 PCs) — Bazgar Fighter/Battlemaster AC 18 HP 49, Marwen Wizard AC 15 HP 32, Sabriel divine martial AC 19 HP 44  
**Encounter:** Thrulm — The Hunger Below (CR 13 beholder) — Encounter 5 Full Power  
**Branch fallback:** `playtest-auto` not found on origin → fell through to `main`  
**Briefing file:** `combat-runner/.testbot/thrulm-cron-prompt.md` not found (runtime dir absent on fresh clone)

---

## Phase A — Mechanical Regression

> No `#combat-runner` tags present on any thrulm NPC; no `actions.jsonl` entries exist for this encounter. The combat runner cannot discover or execute this encounter at all. Full GUI regression is **blocked** until tags and DB rows are authored.

### Stat-block bugs found

| # | File | Bug | Severity |
|---|------|-----|----------|
| A1 | `beholder-thrulm.md` | **Maw dead text:** "the target has disadvantage on the saving throw" — Maw is a weapon attack with no saving throw. Should reference the grapple escape check. | Medium |
| A2 | `thrall-derro.md` | **Saving Throws "None":** The entry reads "None; dominated mind has no saves" which implies full save immunity. Should be "—" (no proficient saves). | High |
| A3 | `thrall-derro.md` | **Dagger damage mismatch:** Damage listed as "4 (1d4+2)" but DEX mod is +1, making correct notation "3 (1d4+1)". Attack bonus +3 is correct. | Low |
| A4 | `COMBAT-CHEAT-SHEET.md` | **Shrine-Touched false vulnerability:** "Vulnerable To: fire, radiant" — stat block has no vulnerabilities. | High |
| A5 | `COMBAT-CHEAT-SHEET.md` | **Thrall recommendation inverted:** Recommends psychic attacks (Psychic Scream, Dissonant Whispers) against Thrall Derro, which has psychic resistance. | High |
| A6 | `beholder-thrulm.md` | **Proficiency inconsistency:** Attacks (+6), saves (Dex +6, Wis +5), and skills (Arcana +6, Perception +5) all use prof+3. Save DCs (all DC 16 = 8+5+3) use prof+5. CR 13 table value is +5. Either attacks should be +8 or DCs should be 14. **Not auto-fixed** — likely intentional softening for a party-wipe encounter; DM to decide. | Medium |
| A7 | All thrulm NPCs | **No `#combat-runner` tags** — encounter invisible to combat runner launcher. | Critical (infra) |
| A8 | `actions.jsonl` | **No DB rows for any thrulm NPC** — zero actions authored. | Critical (infra) |

### Auto-fixes applied this run

- A1: Beholder Maw — "disadvantage on the saving throw" → "disadvantage on ability checks to escape the grapple"
- A2: Thrall Derro saving throws — "None; dominated mind has no saves" → "—"
- A3: Thrall Derro Dagger damage — "4 (1d4+2)" → "3 (1d4+1)"
- A4: Cheat sheet Shrine-Touched — removed "Vulnerable To: fire, radiant" (no such vulnerability)
- A5: Cheat sheet Thrall — replaced Psychic Scream recommendation with force/physical attacks

---

## Phase B — Generative Playtest Slice: Encounter 5 Full Power

> Rotation slot: **Enc-5 Round-by-Round** (first slot; no prior rotation file found).

### Setup

- **Beholder:** 110 HP, AC 17, fly 30 ft hover, 3 legendary actions/round, 3/day Legendary Resistance, lair actions at init 20
- **Thrall derro (4):** AC 14, HP 22, +1 melee — meatshield chaff
- **Shrine-touched derro (2):** AC 16, HP 45, +4 / 6+4d8 necrotic; Ancient Resonance (DC 14 Dex, 2d10+1d4)
- **Party:** Bazgar (F/BM 5) ≈ 2×10+maneuver = 25 dmg/round; Sabriel (div. martial 5) ≈ 10+smite 20-25 dmg/round with slots; Marwen (Wiz 5) ≈ 28 (fireball Dex save) or 10.5 (magic missile, auto-hit)

### Round 1

**Init order (estimates):** Lair (20) → Sabriel (18) → Beholder (17) → Bazgar (15) → Shrine-touched (14) → Marwen (13) → Thralls (10)

**Lair (init 20):** Unstable Ground — Marwen (lowest mobility, most disruption). DC 16 Dex. Marwen's Dex is probably +2 (leather, no heavy armor) → ~35% fail → prone with no action used.

**Sabriel:** Attacks beholder (hovering 40+ ft). Range problem — beholder is at 40-60 ft elevation. Melee doesn't reach. Sabriel must use ranged attack or Misty Step. As divine martial (likely paladin), probably no natural ranged option. **She cannot engage meaningfully on round 1 without movement abilities.** She dashes toward the altar instead.

**Beholder (action):** Multiattack — 2 Tentacle Lash + 1 Maw. Targets Marwen (AC 15, lowest HP). Tentacle needs 9+ to hit → 60% chance each. Expected 1.2 hits. One hit = 13.5 damage + grappled (DC 16 Str/Dex check to escape, Marwen likely fails). Maw on grappled Marwen: 60% × 22 = 13.2 expected. **Marwen at round-1 end:** Expected 27 damage total, from 32 HP = 5 HP remaining. She is grappled.

**Beholder (legendary actions):**
- After Sabriel's turn: Tentacle vs Sabriel (AC 19, needs 13+ → 40%). Expected 5.4 damage.
- After Bazgar's turn: Void Ray 2-cost. DC 16 Dex vs Bazgar (Fighter, probably STR-built, Dex +0 or +1). ~75% fail → 22 avg or 11 on save = 19 expected damage to Bazgar.
- After Marwen's turn: Tentacle vs Marwen (already at 5 HP). 60% × 13.5 = 8.1 → **Marwen goes down.**

**Round 1 summary:** Marwen is unconscious at end of round 1 from legendary action tentacle. She is also grappled — dragging her to Maw range on round 2 is automatic. If beholder recharges Disintegration Ray (17% chance per round), she is permanently dead.

### Round 2

Marwen is down and grappled. Beholder's round 2 Maw on the grappled unconscious body: if the beholder uses Maw on Marwen while she's at 0 HP, that's a death save failure. Two tentacle + Maw = one death save failure from tentacle + potentially lethal Maw. **Marwen likely permanently dies if Disintegration Ray fires on her (45 force damage = instant disintegration with no resurrection possible).**

Meanwhile: Sabriel + Bazgar have reached the beholder by round 2. Party output: ~50 damage/round combined. Beholder at 110 HP takes 50 → 60 HP by end of round 2. **3 Legendary Resistances intact** — any save-or-suck from Marwen (already down) or Sabriel's Channel Divinity is negated.

**Round 3:** Beholder at 60 HP, uses **Drain Divinity** (3 legendary actions) on Sabriel — removes her highest paladin slot. Then **Void Scream** (if recharged, 33% chance): DC 16 Wis, 33 avg psychic damage in 30-ft radius. Sabriel has 44-13 = 31 HP remaining; Void Scream drops her. Bazgar has 49-19 = 30 HP remaining; Void Scream drops Bazgar too. **Party TPK at round 3 if Void Scream fires. Round 4 TPK otherwise.**

### Phase B Verdict

**The encounter is working as designed: CR 13 vs level 5 is a TPK.** Pacing is 3-4 rounds. The mode of failure varies (Disintegration → permanent death, Void Scream → mass unconscious, Tentacle-Maw grapple loop → focused kill). Each creates a distinct "feel" for how the party dies.

---

## Phase C — Feel Issues (logged, not auto-fixed)

| # | Issue | Impact | Recommendation |
|---|-------|--------|----------------|
| F1 | **Disintegration Ray permanent death** — At level 5 with a 32-HP wizard, a single ray hit (45 avg, no save, force damage) is a one-shot permanent kill. The "no resurrection" clause forecloses all future options for that character. | Very High | Consider gating permanent death to "reduced to 0 HP AND failed a DC 16 Con save." Softens the absolute outcome without removing the threat. |
| F2 | **Antireality reaction (post-roll)** — The beholder sees the roll and decides to add +2 AC. Against a party attacking at +5 to +7, this auto-negates any attack roll that hits by 1 or 2. Effectively 1 free miss per round with perfect information. | High | Either remove the "after seeing the roll" clause (make it a declared reaction before the roll) or limit to 3/day. |
| F3 | **Drain Divinity costs 3 legendary actions** — This consumes the beholder's entire legendary action budget for a round. Against a 3-PC party where Sabriel has ~3-4 paladin slots, this ability is used once per fight at maximum. | Medium | Reduce to 2-action cost. At 2 actions, the beholder can still Tentacle + Drain Divinity in a round, making it a meaningful rotation choice rather than a once-per-fight panic button. |
| F4 | **Manifest Thralls lair action gives 1 temp HP** — CHA modifier is +1. One temporary hit point on a CR 2 derro is noise. The "reaction to move or make an attack" is the real effect; the temp HP is vestigial. | Low | Either raise temp HP to beholder's CHA score (13) or drop the temp HP clause and keep just the reaction grant. |
| F5 | **Marwen is targeted first every round** — She is the obvious kill target (lowest AC, lowest HP, arcane caster). The beholder's tactical section confirms this. At 32 HP / AC 15, she dies before she gets two actions in a full encounter. The encounter has no interesting pressure on the wizard player; they are eliminated and then watching for 2-3 rounds. | Medium | Add one early opportunity for the wizard (e.g. Shrine-Touched engages beholder first on init, giving Marwen one free round to cast Fireball) or lower beholder init modifier so Sabriel and Bazgar can position before the beholder's first action. |
| F6 | **Void Scream 33-avg psychic in 30 ft — effectively a fight-ender** — If it fires while the party is bunched (likely near the altar), it knocks out Sabriel (after damage) and cripples Bazgar simultaneously. Combined with Disintegration Ray also on a 5-6 recharge, any round the beholder recharges both is an instant wipe. Two high-damage recharge abilities on the same cycle is very swingy. | Medium | Differentiate recharge ranges: Void Scream (5-6) stays, Disintegration Ray bumps to "Recharge 6" only. This keeps the terror of each while reducing the double-fire probability from ~11% to ~6%. |
| F7 | **Thrall Derro Compelled Movement is redundant with beholder's bonus action Compel Thrall** — Both move thralls toward targets. The bonus action says the thrall must "succeed on a DC 16 Charisma saving throw or move 30 feet." The thrall's own bonus action is "the derro moves 30 feet in a direction chosen by the beholder." These overlap mechanically. | Low | Clarify: thrall Compelled Movement is the forced-movement mechanism (no save); Compel Thrall is a longer-range, save-based compel on any charmed creature. The thralls don't need the bonus action since the beholder handles their movement. |

---

## Phase D — Infra Blockers (author action required)

The following cannot be auto-fixed by the cron agent and block all future mechanical regression:

1. **Add `#combat-runner` to all thrulm NPC frontmatter tags.** Until this is present, `discover_encounters()` skips the entire thrulm encounter. The tag must be the literal string `"#combat-runner"` (with hash, quoted in the YAML array).

2. **Author actions.jsonl rows via `combat_action_upsert` for each NPC.** Minimum rows needed for regression:
   - `beholder-thrulm`: multiattack (with prereq structure), tentacle_lash (single_attack), maw (single_attack), disintegration_ray (area/recharge), void_scream (area/recharge), shrine_drift (utility), antireality (reaction), compel_thrall (utility), legendary actions
   - `thrall-derro`: hand_axe (single_attack), dagger (single_attack), compelled_movement (utility)
   - `derro-rager`: multiattack, greataxe (single_attack), berserk (area/recharge), taunt (utility)
   - `derro-shardcaller`: multiattack, shard_throw (single_attack), shard_barrage (area/recharge), call_weakness (utility), tactical_retreat (utility)
   - `shrine-touched-derro`: multiattack, shrine_axe (single_attack), ancient_resonance (area/recharge), driven_escape (utility), oath_breaking_retaliation (reaction)

3. **Create `combat-runner/.testbot/thrulm-cron-prompt.md`** and commit it so future cron fires have a proper briefing document.

---

## Fixes Applied This Run

```
beholder-thrulm.md       Maw: dead "saving throw" text → grapple escape checks
thrall-derro.md          Saving Throws: "None" → "—"
thrall-derro.md          Dagger damage: "4 (1d4+2)" → "3 (1d4+1)"
COMBAT-CHEAT-SHEET.md    Shrine-Touched: removed false fire/radiant vulnerability
COMBAT-CHEAT-SHEET.md    Thrall: corrected attack type from psychic to physical/force
```

---

*Generated by playtest cron agent — 2026-05-25*
