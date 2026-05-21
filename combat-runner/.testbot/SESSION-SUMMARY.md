# Session summary — 2026-05-11

## What landed this session

### All 10 streamline opportunities — addressed
- **#1 Nested `npcs/*/` AND `members/` discovery** — walker now climbs past either folder + nested subdirs (`encounter_picker.py:_walk_to_encounter_root`).
- **#2 Markdown-table → status-line parser** — supports both column-per-stat AND row-per-stat layouts (`app.py:_parse_stat_table` + row-fallback). Black-ledger and gnoll-source files both parse.
- **#3 `upsert_many` bulk API** — one read + one write for N records, all-or-nothing validation (`combat_actions_db.upsert_many`). Used to migrate 11 entries + import 19 black-ledger actions in two calls.
- **#4 Reaction schema relaxed** — `reaction_kind: "damage" | "movement" | "buff"`. Movement/buff reactions need only `effect` text; back-compat default is `damage`. Migrated `ancestor-stir.incorporeal_escape` + `vessa.uncanny_dodge`.
- **#5 `extra_damage` per attack** — `attacks[].extra_damage: {dice, type}`. Cleans up Ancestor-Stir's 4-entry hack into 2 entries with riders. Vessa's Sneak Attack now structured.
- **#6 `slots: {count, refresh}`** — first-class "1/day", "3/day", "1/short rest", "1/round" tracking. Chip shows `2/2 long rest`. Counter decrements on use, chip greys out at 0. Migrated 10 actions (matron's spells, misty_step, eat_the_fallen, rage, second_wind, action_surge, scorching_ray, armor_of_agathys, hex, cure_wounds).
- **#7 `apply_condition_on_hit: {condition, save_dc, save_ability, duration_rounds?}`** — structured rider replacing free-text `rider_on_hit`. Glacier Stalker's bite, Ancestor-Stir's claws both migrated.
- **#8 `count` from frontmatter** — already worked; verified.
- **#9 Environment-modifier hook (night/day, Lunar Hunt)** — deferred. Currently text in start-of-turn checklists.
- **#10 Import wizard "Customize…" step** — deferred. Cosmetic.

15 new schema tests in `tests/test_schema_streamlines.py`.

### NPC + character imports

- **gar-vally** encounter — 6 gnoll NPCs (ancestor-stir, jorran, matron, warrior×2, lieutenant, hyena×3), 16 actions.
- **black-ledger** "encounter" (member-discovered) — 5 characters (Grek, Maela, Orren, Vessa, Zor'gar), 19 headline actions, all using the new schema fields appropriately.
- Original NPCs (Glacier Stalker + Ancestor-Stir) migrated to use `extra_damage` and `apply_condition_on_hit`.

### Cron testbot (launchd)

- **Label:** `com.dnd.combat-testbot` — loaded into your gui session.
- **Interval:** 1800 seconds (30 minutes), `RunAtLoad=true` so it fired immediately.
- **Scenarios:** 12 in `.testbot/scenarios.yml`, round-robin via `.testbot/run-counter`.
- **Output paths:**
  - `.testbot/runs/<ts>-<id>.json` — per-fire metrics (one per scenario per ~6 hours).
  - `.testbot/decisions/<ts>-<id>.md` — written ONLY on failure, with bot rationale + alternatives.
  - `.testbot/cron.log` / `.testbot/cron.err` — wrapper stdout/stderr.
- **Already fired** 2x at session end (manual + at-load); both green.
- **No commits, no LLM calls.** Each fire is `with_llm=False` + offscreen Qt.

## Decisions made unilaterally (for your review)

| # | Decision | Why | Alternatives considered |
|---|---|---|---|
| 1 | Auto-tagged each black-ledger member's source `.md` frontmatter with `#combat-runner` (in-place edit). | Minimum-friction discovery path. The tag is small and doesn't conflict with the existing tag set. | (a) Write parallel combat-runner .md files alongside originals (clutter, drift risk). (b) Add a separate registry (over-engineered for 5 files). |
| 2 | Extended discovery to recognize `members/` folder in addition to `npcs/`. | The user specifically called out the `members` path. Treating party-side characters identically to monsters in the GUI is sensible — same HP-tracking, same chip grid, same combat log. | (a) Build a separate "party-runner" tab type (months of work). (b) Restrict combat-runner to monsters (user explicitly wanted PCs in). |
| 3 | Cron uses launchd (durable) — NOT CronCreate (session-only). | The earlier CronCreate complaint + the user wanting "8 hours" of unattended runtime. Launchd survives terminal close, Claude Code restarts, Mac sleep. | (a) Session-only cron (dies when Claude Code closes). (b) shell loop with sleep (not robust to crashes). |
| 4 | Testbot does NOT auto-fix on failure. | Multiple concurrent fires editing source could conflict. Surfacing every failure to a human-readable decision file is safer for unattended runtime. | (a) Auto-fix with rollback safety net (risk of cascading changes). (b) Halt cron on first failure (overkill). |
| 5 | Each fire uses `with_llm=False`. | Avoids SSL context buildup that crashed earlier scenario runs. Cron testbot is mechanical-correctness only; LLM ergonomics testing requires real fires you observe. | (a) Real LLM calls every 30 min (costly + flaky). |
| 6 | Bumped `reaction` schema instead of breaking back-compat. Old reactions still validate with `reaction_kind` defaulting to `"damage"`. | Existing data needn't change. New reactions opt into movement/buff explicitly. | (a) Hard migration (invasive; would have touched the rime_reflex/counterspell/shield rows that already work). |
| 7 | Black-ledger members' HP/AC parsing uses BOTH column-style AND row-style table detectors. | The gnoll-source files use a column-style header row (`| **AC** | **HP** | **Speed** |`); the black-ledger members use row-style (`| **HP** | 21 (...) |`). Supporting both is two regexes. | (a) Force one canonical layout (would have required hand-converting 5 files). |

## Test count

- Session start: 210 passed, 1 skipped.
- Session end: 225 passed, 1 skipped. (+15 schema tests.)

## What the cron will be doing while you're out

Every 30 minutes, one scenario fires:
1. `stalker-solo-bloodied` — verify bloodied event surfaces Aelric's cure_wounds watch
2. `gnoll-pack-segments` — mob HP routing (m3→m2→m1)
3. `matron-slots` — moonbeam slot decrement
4. `condition-duration-tick` — paralyzed for 3 rounds → auto-removes
5. `orren-action-surge` — action_surge slot count
6. `vessa-sneak-attack` — extra_damage on shortsword
7. `vessa-uncanny-dodge` — movement-kind reaction
8. `zorgar-rage-frenzy` — rage slot
9. `maela-hex-eldritch-loop` — hex + multi-blast
10. `ancestor-stir-frightened-cascade` — claws → frightened rider, wail recharge
11. `party-of-two-cross-fire` — rime_reflex trigger
12. `aelric-counterspell-watch` — global spell_cast trigger

12 scenarios × 30 min = 6-hour cycle. Over 8 hours you'll get ~16 fires, the full set rotated 1.3x.

## When you get home — quick checklist

1. `ls combat-runner/.testbot/decisions/` — if EMPTY, everything passed. If anything is in there, read those .md files first.
2. `ls combat-runner/.testbot/runs/` — count the JSON files. Should be ~16 over 8h.
3. `cat combat-runner/.testbot/cron.log | tail -50` — quick scan of fire timestamps.
4. `make combat-gui` — pick **black-ledger** to see the new template render with proper HP/AC. Pick **gar-vally** for the gnolls. Pick **mountin-pass** for the v0-v1 originals.
5. To stop the cron: `launchctl bootout gui/$(id -u) combat-runner/testbot/com.dnd.combat-testbot.plist`

## Files modified this session

- `scripts/combat_actions_db.py` — schema validators + upsert_many
- `combat-runner/gui/encounter_picker.py` — discovery walker + members support
- `combat-runner/gui/app.py` — table parsers (both layouts)
- `combat-runner/gui/state.py` — slots_remaining field + serialize
- `combat-runner/gui/npc_tab.py` — slot decrement / round-refresh
- `combat-runner/gui/widgets/action_chips.py` — slot display in chip meta
- `combat-runner/actions.jsonl` — 11 migrations + 19 black-ledger additions
- `combat-runner/tests/test_schema_streamlines.py` — new (15 tests)
- `templates/character-combat-runner-template.md` — new (PC-side template)
- 5x `world/party/black-ledger/members/*.md` — tag injection only
- `combat-runner/testbot/` — new scripts + plist
- `combat-runner/.testbot/scenarios.yml` — 12 scenario seeds
