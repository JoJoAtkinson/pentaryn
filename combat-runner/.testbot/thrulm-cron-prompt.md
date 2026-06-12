# Thrulm Encounter Playtest — Cron Briefing

You are a remote Claude agent fired hourly to playtest the **thrulm** D&D encounter.
This file is your complete briefing. Follow it precisely, end to end.

---

## First thing: branch setup

Switch to `playtest-auto` on origin:

```
git fetch origin playtest-auto
git checkout playtest-auto
git pull origin playtest-auto
```

Fall through to `main` only if `playtest-auto` has been deleted (i.e., `git fetch` returns
an error about the remote branch not existing).

---

## Context

- **Encounter:** `thrulm` — the sealed hollow under Dulgarum
- **Location in repo:** `world/factions/dulgarum-oathholds/locations/thrulm/`
- **NPCs:** `beholder-thrulm`, `deep-watch-derro`, `thrall-derro`, `derro-rager`,
  `shrine-touched-derro`, `derro-shardcaller`
- **Party under test:** `world/party/the-compass-edge/combat-roster.yml`
  - Bazgar — Orc Fighter (Battlemaster) 5, HP 49, AC 18
  - Marwen — Wizard 5, HP 32, AC 15
  - Sabriel — divine martial 5, HP 44, AC 19
- **Design intent:** The beholder is CR 13 — **the party is meant to lose this encounter.**
  Your job is to find balance/feel issues, mechanical bugs, and ability-rotation problems,
  not to balance the fight.

---

## One playtest cycle per fire — four phases

### Phase A — Mechanical regression (~10 min)

1. Read every NPC `.md` file in `world/factions/dulgarum-oathholds/locations/thrulm/npcs/`.
2. For each creature, verify:
   - Average damage in parenthesised notation matches the dice expression
     (e.g. `13 (3d6 + 3)` — 3d6 avg = 10.5, +3 = 13.5 → floor = 13 ✓)
   - Save DCs and attack bonuses are internally consistent
   - Condition immunities do not contradict trait text (no redundant saves for immune conditions)
   - `#combat-runner` tag present in frontmatter
3. Check `combat-runner/actions.jsonl` — verify every NPC slug has at least one row.
   Run `python scripts/combat_actions_db.py validate` and confirm 0 invalid records.
4. Cross-check `COMBAT-CHEAT-SHEET.md` against the stat blocks for factual drift.

### Phase B — Generative playtest slice (~15 min)

Pick the **next scenario** from the rotation file (`.testbot/scenarios.yml`) using the
round-robin counter at `.testbot/run-counter`. Simulate a short encounter slice manually
(no GUI needed — reason through it with dice math):

1. Roll initiative for the party and the selected NPCs.
2. Play 2–4 rounds, tracking HP, slots, conditions, legendary action spend.
3. Identify any point where the outcome felt **unfair rather than lethal** — e.g. one-round
   kills before the player got a turn, ability combos with no counterplay, recharge abilities
   that fire too often/rarely.
4. Note whether the beholder's legendary action economy is functioning (Drain Divinity vs
   Void Ray vs Move — which is always dominant?).

### Phase C — Auto-fix & log (~10 min)

**Auto-fix (safe to apply without asking):**
- Incorrect damage averages (arithmetic only — never change dice expressions)
- Redundant trait text contradicted by explicit immunities
- Missing `#combat-runner` tags

**Log only (write to `.testbot/decisions/<ts>-thrulm-<id>.md`, do NOT edit the source):**
- CR vs proficiency bonus mismatches (design call)
- Feel issues: one-note legendary strategies, dead-weight abilities, permanent-death edge cases
- Ability-rotation gaps (abilities that never fire in practice at this party level)

### Phase D — Commit + push (~5 min)

Stage and commit:
- Any source file fixes from Phase C
- Updated `scenarios.yml` if you added new thrulm scenarios
- This briefing file is already committed — do NOT modify it unless correcting a factual error

Push:
```
git push -u origin playtest-auto
```

---

## Hard rules

- **Never change dice expressions** — only fix the parenthesised average when the expression
  itself is correct and only the average label is wrong.
- **Never auto-fix CR** — flag it, stop, let Joe decide.
- **Never commit actions.jsonl** changes unless you used `combat_action_upsert` via the MCP
  server AND ran `python scripts/combat_actions_db.py validate` with 0 errors.
- **Never push to `main`** — `playtest-auto` only.
- **Time budget is 40 min.** If Phase A finds a blocker (e.g. beholder not in actions.jsonl),
  log it and continue — don't get stuck trying to author the full action set unattended.

---

## Exit format

End your session with a single-paragraph summary in the commit message body, covering:
- What Phase A found (bugs fixed / bugs logged)
- Which Phase B scenario was run and what it revealed
- What's still broken and needs a human decision

---

## Known state as of 2026-06-12 (fire #6)

Phase A fixes applied across fires #1–#6:
- Added `#combat-runner` to all 6 NPC files
- Beholder Tentacle Lash avg 16 → 14 (fire #1)
- Beholder Maw avg 22 → 21 (fire #6)
- Beholder Antireality reaction: post-hit AC boost → pre-roll disadvantage, once-per-round cap (fire #6)
- Rager Madness Endurance: removed redundant frightened-save advantage (covered by immunity)
- Void Scream FRIGHTENED rider added (was missing from .md, present in DB)
- Shrine-Touched completely rewritten into concise format (fire #3)

Still open (needs human decision or interactive MCP session):
- **All 6 NPCs have ZERO rows in actions.jsonl** — encounter cannot run in GUI until
  actions are authored via `combat_action_upsert`.
- Beholder attack/save bonuses appear to use PB +3 while stated CR 13 calls for PB +5.
  Joe must decide: lower CR label (to ~8) or raise all modifiers.
- Drain Divinity legendary: spends all 3 legendary actions; degenerate every round vs.
  divine casters — consider cooldown or 2-LA cost.
- Clay-Shaping (beholder) is dead weight in any fight under 10 rounds — replace with
  combat-viable bonus action or move to downtime section.
- Manifest Thralls lair action grants 1 THP (CHA +1) — effectively useless vs AC 18+ party;
  redesign as a reaction-attack trigger instead.
