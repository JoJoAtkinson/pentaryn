# Combat Runner GUI

PySide6 + qt-material desktop app for running D&D 5.5e combat at the table. Each NPC gets its own tab; you type sigils into the command bar; the LLM is plumbed in as a meta-controller so any mistake is undoable in natural language.

## Launch

```bash
make combat-gui
# or
./.venv/bin/python -m combat-runner.gui.app
```

Then pick an encounter from the dialog, adjust per-NPC counts, click Launch.

## Requirements

- Python 3.13+ (3.14 recommended)
- macOS, Linux, Windows
- `ANTHROPIC_API_KEY` env var (or `.env` file at repo root) — optional. Without it, the fast-path sigils still work; only LLM fallback and suggestions are disabled.

## Command sigils (typed into a tab's command bar)

| Sigil               | Effect                                                                   |
|---------------------|--------------------------------------------------------------------------|
| `attack` / verb     | Fuzzy-match an action verb → run it via `roll_combat_action`             |
| `-18`               | Damage. Live red overlay on the HP bar while typing                      |
| `-18 fire`          | Damage with type (tag — checked against reaction triggers)               |
| `+10`               | Heal. Live green overlay                                                  |
| `m2 -5`             | Damage member 2 of a mob (override default routing to highest alive)     |
| `@prone`            | Toggle a condition on this NPC (idempotent)                              |
| `@`                 | (Alone) Open the condition autocomplete menu                             |
| `note ...`          | Log entry. Never hits the LLM.                                           |
| `/reorder a b c`    | Reorder tabs by slug                                                     |
| `/quit`             | Close the window                                                         |
| Anything else        | Routed to the LLM meta-controller (with full state-mutation tool access) |

Click an action chip in the grid to run it without typing.

## Keyboard

| Shortcut             | Action                       |
|----------------------|------------------------------|
| `Ctrl+Tab`           | Next tab                     |
| `Ctrl+Shift+Tab`     | Previous tab                 |
| `Ctrl+1`..`Ctrl+9`   | Jump directly to tab N       |
| `Ctrl+E`             | Switch encounter             |
| Tab drag             | Reorder turn order           |
| Round button click   | Advance round + emit event   |

## Architecture quick-tour

- `app.py` — `QApplication` boot + qt-material theme + `build_main_window(encounter, counts, with_llm=True)` (set `with_llm=False` in tests to bypass the LLM SDK)
- `main_window.py` — owns `EncounterState`, the `QTabWidget`, the round button, the `EventBus`, the `TriggerMatcher`, and the `SuggestionDriver`
- `npc_tab.py` — one tab per NPC instance. Composes `HPBar`, `ActionChipGrid`, `CommandInput`, `SuggestionBar`. Dispatches input through `Dispatcher`
- `dispatcher.py` — sigil regex + fuzzy verb match. Returns a `ParsedInput`
- `state.py` — `NPCState` + `EncounterState` dataclasses. JSON-serializable for the LLM boundary
- `event_bus.py` — typed pub/sub + `TriggerMatcher` for declarative reactions
- `llm_controller.py` — Anthropic SDK wrapper. Tool surface mirrors every state mutation
- `suggestion_driver.py` — `QThreadPool` worker for prefetching action suggestions per tab, with per-tab generation counter so stale results are dropped
- `widgets/` — `HPBar` (segmented mob mode + live preview), `ActionChipGrid`, `CommandInput`, `SuggestionBar`, `ReactionPromptDialog`

## Adding a new combat NPC

See [`templates/npc-combat-runner-template.md`](../../templates/npc-combat-runner-template.md) at the repo root. tl;dr:

1. Create `world/.../<encounter>/npcs/<slug>.md` with frontmatter tag `#combat-runner`. Use `count: N` in frontmatter for mobs.
2. Use the `combat_action_upsert` MCP tool to author each action — it validates the spec on write.
3. Run `python scripts/combat_actions_db.py validate` — every DB row should pass.

For a reaction-style action, include a `trigger` block:

```json
{
  "trigger": {
    "scope": "self",
    "event": "damage",
    "match": "melee damage within 5 ft"
  }
}
```

`scope: "self"` fires only when this NPC is the event's subject. `scope: "global"` fires regardless (Counterspell). `match` is a human-readable description — the matcher uses tag-keyword pre-filtering (damage-type keywords are strict; modifier keywords like `melee`/`ranged` are ambiguous on miss so the DM still gets a medium-confidence prompt).

For a **broadcast-watch suggestion** (action pops to the top of this NPC's suggestion bar when an event fires somewhere else), include a `watch` block:

```json
{
  "watch": {
    "event": "bloodied",
    "scope": "ally",
    "priority": 20
  }
}
```

`scope: "ally"` fires when a different in-play NPC is the subject (healer reacts to ally going bloodied). `scope: "self"` fires when this NPC IS the subject (Aelric reacts to his own paralysis). `scope: "any"` fires regardless. Optional `match` further filters by condition name (`condition_applied` events) or damage type (`damage` events). The suggestion auto-prunes when the underlying state recovers (target heals back above half / dies / loses the condition).

## Sigil cheat sheet (the at-table syntax)

| You type            | Effect                                                        |
|---------------------|---------------------------------------------------------------|
| `attack` / verb     | Fuzzy match → run action                                      |
| `-18` / `-18 fire`  | Damage (typed/untyped). Live red overlay.                     |
| `+10`               | Heal. Live green overlay.                                     |
| `m2 -5`             | Target mob member 2 explicitly                                |
| `@prone`            | Toggle condition (idempotent)                                 |
| `@stun 5`           | Apply condition for N rounds (auto-decrements on round)       |
| `@`                 | Open the condition autocomplete popup                         |
| `note ...`          | Log entry; never hits the LLM                                 |
| `/reorder a b c`    | Reorder tabs by slug                                          |
| anything else       | Routed to the LLM meta-controller                             |

## Universal / global actions

`scope: "global"` rows in `actions.jsonl` are appended to every NPC's action grid. The starter set (Push, Grapple, Shove Prone, Disengage, Dodge, Dash, Help, Hide) lives under the sentinel `npc: "_global"`. See `scripts/combat_actions_db.py:list_actions` for the discovery rule.

## Running the tests

```bash
make combat-test           # unit + integration
make combat-test-all       # also runs scenarios with metrics output
```

Scenario metrics land in `combat-runner/tests/.metrics/<scenario>-<ts>.json` (gitignored). The review phase compares against the targets in the spec § "Testing strategy → Ring 3".

## Headless testing notes

- All tests run under `QT_QPA_PLATFORM=offscreen` (set in `conftest.py`).
- The reaction prompt auto-PASSes under offscreen — override `MainWindow._reaction_prompt_handler` in a test to script different responses.
- Scenario tests use `with_llm=False` so the QThreadPool doesn't construct real Anthropic SDK clients (SSL contexts pile up across tests and segfault on macOS otherwise).
- `qtbot.keyClicks` segfaults on non-ASCII characters — keep scenario typed text ASCII only.

## Troubleshooting

| Symptom                                                 | Fix                                                       |
|---------------------------------------------------------|-----------------------------------------------------------|
| Black window / qt-material not loading                  | Check `qt-material` is installed: `pip install qt-material` |
| Suggestions never appear                                | `ANTHROPIC_API_KEY` not set; suggestions are LLM-only      |
| LLM fallback errors with "client not initialized"      | Same — set the env var or `.env` at repo root              |
| Crashes on em-dash / unicode chars                      | Known PySide6 issue; ASCII only in test inputs             |
