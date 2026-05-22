# Combat Runner GUI

PySide6 + qt-material desktop app for running D&D 5.5e combat at the table. Each combatant (NPC or PC) gets its own tab; you type sigils into the command bar; the LLM reviews every state-changing command asynchronously so mistakes surface quickly and are undoable in natural language.

## Launch

```bash
make combat-gui
# or
PYTHONPATH=combat-runner ./.venv/bin/python -m gui.app
# with a party roster:
PYTHONPATH=combat-runner ./.venv/bin/python -m gui.app --party world/party/black-ledger/combat-roster.yml
```

Then pick an encounter from the dialog, adjust per-NPC counts (and per-player HP if a party is loaded), click Launch.

## Requirements

- Python 3.13+ (3.14 recommended)
- macOS, Linux, Windows
- `ANTHROPIC_API_KEY` env var (or `.env` file at repo root) — optional. Without it, the fast-path sigils still work; LLM fallback, suggestions, **and the always-on async review** are all disabled. The app is fully functional without a key.

## Combatant ids

Every combatant has a **permanent id** — a single digit repeated 1–3 times — shown in the tab title as `id · name`. The id is stable for the whole encounter regardless of tab order.

```
tier 1 (one keypress):    1 2 3 4 5 6 7 8 9 0
tier 2 (two keypresses):  11 22 33 44 55 66 77 88 99 00
tier 3 (three keypresses):111 222 … 000
```

- **Players** take their id from the party roster (see [Party roster](#party-roster)); the same player always has the same number.
- **NPCs/monsters** are auto-assigned the next free id at launch, skipping ids reserved by players.
- A mob has **one id**; its individual members are addressed with `m<n>` (e.g. `44 m2`).
- Only uniform-digit strings are valid ids: `44` yes, `45` no. The parser rejects non-uniform numbers and routes them to the LLM.

## Command sigils (typed into a tab's command bar)

### Self-target sigils (apply to the active tab's combatant)

| Sigil               | Effect                                                                   |
|---------------------|--------------------------------------------------------------------------|
| `attack` / verb     | Fuzzy-match an action verb → run it via `roll_combat_action` (NPC only)  |
| `-18`               | Damage. Live red overlay on the HP bar while typing                      |
| `-18 fire`          | Damage with type (tag — checked against reaction triggers)               |
| `+10`               | Heal. Live green overlay                                                  |
| `m2 -5`             | Damage member 2 of a mob (override default routing to highest alive)     |
| `@prone`            | Toggle a condition on this combatant (idempotent)                        |
| `@`                 | (Alone) Open the condition autocomplete menu                             |
| `note ...`          | Log entry. Never hits the LLM. Use this for free-form annotation.       |
| `/reorder a b c`    | Reorder tabs by slug                                                     |
| `/quit`             | Close the window                                                         |
| Anything else        | Routed to the LLM meta-controller (with full state-mutation tool access) |

### Directed commands (apply to any combatant from any tab)

```
<id> <amount> [tags…]    — damage or heal any combatant by id
<id> m<n> <amount> [tags…] — target mob member n within that combatant's mob
<id>                     — bare id alone jumps to that combatant's tab
```

Examples:
- `5 18 fire melee` — deal 18 fire melee damage to combatant #5
- `22 10 heal` — heal combatant #22 for 10 HP
- `44 m2 7` — deal 7 damage to mob member 2 of combatant #44
- `3` — jump to combatant #3's tab

The **active tab** at the time of entry is logged as the actor: `Vessa → #5: 18 fire`.

#### Tag vocabulary

Tags follow a **faceted** model. Only one value per facet is active at a time; a later tag in the same facet replaces the earlier one. `melee`/`ranged` and damage-type tags are silently dropped when `direction` is `heal`.

| Facet      | Values (aliases in parens)                                                                          | Notes                        |
|------------|-----------------------------------------------------------------------------------------------------|------------------------------|
| `direction`| `damage` (`dmg`, `dam`) · `heal` (`healing`, `hp`)                                                 | Default: `damage`            |
| `delivery` | `melee` · `ranged` (`rng`)                                                                          | Dropped if direction = heal  |
| `type`     | `fire` · `cold` · `acid` · `lightning` · `poison` · `necrotic` · `radiant` · `thunder` · `force` · `psychic` · `piercing` · `slashing` · `bludgeoning` | Dropped if direction = heal  |

Click an action chip in the grid to run it without typing.

## Keyboard

| Shortcut             | Action                                                                   |
|----------------------|--------------------------------------------------------------------------|
| `Ctrl+Tab`           | Next tab                                                                 |
| `Ctrl+Shift+Tab`     | Previous tab                                                             |
| `Ctrl+1`..`Ctrl+9`   | Jump to the combatant whose **permanent id** is that digit (not tab position N). Ids are shown in the tab title. |
| `Ctrl+N`             | Add NPC from SRD                                                         |
| `Ctrl+E`             | Switch encounter                                                         |
| Tab drag             | Reorder turn order                                                       |
| Round button click   | Advance round + emit event                                               |

Note: `Ctrl+0` is **not wired** — the combatant holding id `0` (the 10th single-press id) has no jump shortcut. Type `0` into the command bar to jump by directed command instead.

## Party roster

Launch with `--party <path>` to load a party:

```bash
PYTHONPATH=combat-runner ./.venv/bin/python -m gui.app \
  --party world/party/black-ledger/combat-roster.yml
```

The encounter picker then shows a **Players** section with a checkbox and a current-HP field per player. The file is static data; HP at the start of a combat session is set in the picker, not in the YAML.

**Schema** (`world/party/<party>/combat-roster.yml`):

```yaml
party: Black Ledger          # party name (string)
players:
  - { name: Vessa, id: "1", max_hp: 31, ac: 15 }
  - { name: Orren, id: "2", max_hp: 40, ac: 17 }
  - { name: Grek,  id: "3", max_hp: 33, ac: 16 }
```

Required player fields: `name`, `id`, `max_hp`, `ac`. The `id` **must be a repeated-digit string** (`"1"`, `"22"`, `"333"` …). Any other format is accepted by the loader but the parser cannot address it by id — the player effectively has no jump shortcut and cannot be targeted with directed commands.

Player ids are reserved first; NPCs/monsters are auto-assigned the remaining free ids.

## Player tabs

When a party is loaded, each active player gets their own tab (title: `id · name`). Player tabs show a row of **generic action chips**: Cast, Attack, Dodge, Dash, Disengage, Help, Hide, Ready, Retreat.

- **PCs do not roll dice in the app.** Players roll physically; the DM records outcomes via directed commands (e.g. `1 14 fire` to record Vessa taking 14 fire damage).
- **Cast** opens a dialog for spell name + level and fires a `spell_cast` event (can trigger NPC counterspell reactions).
- **Disengage** sets the `_disengaging` internal flag so the next **Retreat** suppresses the opportunity-attack prompt.
- **Retreat** fires a `move_away` event; if the player is `in_melee` and has not Disengaged, the DM gets a prompt to apply an opportunity attack.
- **Dodge, Dash, Help, Hide, Ready** log a line. They are not wired to typed verbs — only chip clicks work (verb fuzzy-match for player actions was descoped; typed text falls to the LLM).

## LLM review (always-on, async)

Every state-changing command (directed or self-target) also triggers an **asynchronous LLM review** in a background thread. The review checks for resistances, missed triggers, and anything else worth flagging, then appends a `⟳ review:` line to the log.

Key points for DMs:

- **The `⟳ review:` lines arrive after a delay** — sometimes 5–30 seconds after a fast burst of commands. This is normal, not a bug. The fast-path sigils always resolve immediately; the review is an annotation layer.
- **`ANTHROPIC_API_KEY` is required for reviews.** Without a key the review silently no-ops; all sigils and the LLM fallback still work. See Requirements above.
- **Reviews cost real API tokens** (Haiku model, ~$0.15–0.75 for a 4-hour session of typical volume). There is no per-session call counter in the UI.
- **`note …` never hits the LLM** — use it for free-form log entries that should not trigger a review.

## Architecture quick-tour

- `app.py` — `QApplication` boot + qt-material theme + `build_main_window(encounter, counts, with_llm=True, party_config=…, player_selections=…)` (set `with_llm=False` in tests to bypass the LLM SDK)
- `main_window.py` — owns `EncounterState`, the `QTabWidget`, the round button, the `EventBus`, the `TriggerMatcher`, and the `SuggestionDriver`. Routes directed commands and wires the async review.
- `npc_tab.py` — one tab per combatant (NPC or PC). Composes `HPBar`, action area (DB-driven chip grid for NPCs; generic chip row for PCs), `CommandInput`, `SuggestionBar`. Dispatches input through `Dispatcher`.
- `command_tags.py` — pure-Python faceted tag taxonomy (`resolve_tags`, `hint_pool`). No Qt.
- `dispatcher.py` — sigil regex + fuzzy verb match + directed-command parser. Returns a `ParsedInput` with `kind ∈ {DAMAGE, HEAL, CONDITION, ACTION, DIRECTED, JUMP, NOTE, …}`.
- `state.py` — `NPCState` (generic combatant) + `EncounterState` dataclasses. JSON-serializable for the LLM boundary. Includes `kind`, `id`, `in_melee`, `pinned_notes` fields.
- `event_bus.py` — typed pub/sub + `TriggerMatcher` for declarative reactions. Event kinds include `damage`, `heal`, `condition_applied`, `condition_removed`, `action_executed`, `spell_cast`, `move_away`, `bloodied`, `death`, `round_advanced`.
- `llm_controller.py` — Anthropic SDK wrapper. Tool surface mirrors every state mutation. Also runs the async review worker.
- `encounter_picker.py` — encounter discovery + launch dialog. Includes Players section when `party_config` is set. `load_party_config(path)` validates the roster YAML.
- `suggestion_driver.py` — `QThreadPool` worker for prefetching action suggestions per tab, with per-tab generation counter so stale results are dropped
- `widgets/` — `HPBar` (segmented mob mode + live preview), `ActionChipGrid`, `CommandInput`, `SuggestionBar`, `ReactionPromptDialog`

## Adding a new combat NPC

See [`templates/npc-combat-runner-template.md`](../../templates/npc-combat-runner-template.md) at the repo root. tl;dr:

1. Create `world/.../<encounter>/npcs/<slug>.md` with frontmatter tag `#combat-runner`. Use `count: N` in frontmatter for mobs.
2. Use the `combat_action_upsert` MCP tool to author each action — it validates the spec on write.
3. Run `python scripts/combat_actions_db.py validate` — every DB row should pass.

**Adding players:** players are defined in `world/party/<party>/combat-roster.yml` (see [Party roster](#party-roster)), not as `.md` + DB-rows. PCs have no `#combat-runner` tag and no entries in `actions.jsonl`.

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

Valid `event` values for `trigger` and `watch` blocks: `damage`, `heal`, `condition_applied`, `condition_removed`, `action_executed`, `spell_cast` (fires when any combatant casts via the Cast chip — use for counterspell-style global reactions), `move_away` (fires when a combatant retreats while `in_melee`), `bloodied`, `death`, `round_advanced`.

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

**Self-target** (applies to the active tab):

| You type            | Effect                                                        |
|---------------------|---------------------------------------------------------------|
| `attack` / verb     | Fuzzy match → run action (NPC tabs only)                      |
| `-18` / `-18 fire`  | Damage (typed/untyped). Live red overlay.                     |
| `+10`               | Heal. Live green overlay.                                     |
| `m2 -5`             | Target mob member 2 explicitly                                |
| `@prone`            | Toggle condition (idempotent)                                 |
| `@stun 5`           | Apply condition for N rounds (auto-decrements on round)       |
| `@`                 | Open the condition autocomplete popup                         |
| `note ...`          | Log entry; never hits the LLM                                 |
| `/reorder a b c`    | Reorder tabs by slug                                          |
| anything else       | Routed to the LLM meta-controller                             |

**Directed** (applies to any combatant, from any tab):

| You type              | Effect                                                      |
|-----------------------|-------------------------------------------------------------|
| `5 18 fire melee`     | Deal 18 fire melee damage to combatant #5                   |
| `22 10 heal`          | Heal combatant #22 for 10                                   |
| `44 m2 7`             | Damage mob member 2 of combatant #44 for 7                  |
| `3`                   | Jump to combatant #3's tab                                  |
| `44`                  | Jump to combatant #44's tab                                 |

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

| Symptom                                                 | Fix                                                                          |
|---------------------------------------------------------|------------------------------------------------------------------------------|
| Black window / qt-material not loading                  | Check `qt-material` is installed: `pip install qt-material`                  |
| Suggestions never appear                                | `ANTHROPIC_API_KEY` not set; suggestions are LLM-only                        |
| LLM fallback errors with "client not initialized"      | Same — set the env var or `.env` at repo root                                |
| No `⟳ review:` lines appear after commands             | Same — `ANTHROPIC_API_KEY` not set; review no-ops without it                 |
| `⟳ review:` lines arrive 20–40s after commands         | Normal — the review queue is single-threaded and serialized; a burst of fast commands stacks up behind each other |
| Directed command falls through to LLM unexpectedly     | Check the id: `45` is invalid (non-uniform digits); only `44`, `4`, `444` etc. are valid ids |
| Crashes on em-dash / unicode chars                      | Known PySide6 issue; ASCII only in test inputs                               |
