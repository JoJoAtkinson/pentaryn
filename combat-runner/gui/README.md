# Combat Runner GUI

PySide6 + qt-material desktop app for running D&D 5.5e combat at the table. Each combatant (NPC or PC) gets its own tab; you type `<who> <stream>` commands into the command bar; the LLM reviews every state-changing command asynchronously so mistakes surface quickly and are undoable in natural language.

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
- `ANTHROPIC_API_KEY` env var (or `.env` file at repo root) — optional. Without it, the fast-path grammar commands still work; LLM fallback, suggestions, **and the always-on async review** are all disabled. The app is fully functional without a key.

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

## Command grammar — `<who> <stream>`

Every command is **`<who> <stream>`**. The first character picks the target;
the rest is a left-to-right stream of effects. Anything the grammar can't parse
is routed to the LLM meta-controller.

### `<who>` — the target slot

| Form                | Resolves to                                                          |
|---------------------|----------------------------------------------------------------------|
| leading digit-run   | explicit target(s). A digit string splits into same-digit **runs**: `2` → {2}, `123` → {1,2,3}, `2233` → {22,33} |
| `0`                 | **self** — the active tab's combatant (combinable: `0123` → {self,1,2,3}) |
| leading sigil/word  | the **current target** (the sticky set) — no explicit `<who>`        |

A `<who>` token **alone** (digits, nothing after) sets the sticky current
target and logs *"Marwen is now the target."* It does **not** switch tabs —
the active tab stays on the actor; the target's tab gets the ▼ arrow.

> A leading **Space** on an empty command box is a GUI convenience, not a
> grammar token: it auto-inserts the current-target id(s) and a space. The
> parser itself strips all whitespace — the current target is reached by a
> leading sigil/word.

### `<stream>` — effects

A number's meaning is set by the **token immediately after it**:

| Pattern                  | Meaning                              | Example              |
|--------------------------|--------------------------------------|----------------------|
| `<num> <dmg-tag…>`       | a damage / heal **amount**           | `2 8 melee slash`    |
| `<num> <condition>`      | the condition's **duration** (rounds)| `3 2 stun`           |
| `<num>` then nothing     | an **action #** (panel hotkey)       | `2 2` · `2 111`      |
| `<condition>` no number  | the condition, **default 1 round**   | `3 prone`            |
| `<verb>`                 | an **action by name** (fuzzy-matched)| `3 tail-sweep`       |
| `m<n>` / `m12` / `m`     | mob-member modifier on the next amount/condition (one member / digit-run set / `m` alone = all alive) | `7 m3 6 melee` · `7 m12 6 fire` |
| `hit`                    | upgrade a pending effect to a full hit | `13 hit` · ` hit`  |
| `undo`                   | revert the last command              | `undo`               |
| a damage-tag with **no** number | **error → routed to the LLM** | `2 melee` ✗          |

- **Damage-tags** = damage types (`fire`, `slash`, …), delivery (`melee`,
  `ranged`), direction (`dmg`, `heal`). Numbers always come before their tag.
- **Compound effects chain:** `4 9 bludge 1 prone` = 9 bludgeoning damage **and**
  prone for 1 round.
- **`@` is an optional escape hatch:** `@prone` forces the condition reading for
  the rare word that collides with an action verb.
- **`poison` is a condition, not a damage type:** `poison` always parses as the
  `poisoned` condition — there is no poison damage type. So `2 8 poison` is
  *poisoned for 8 rounds*, not 8 poison damage.

### Cheat-sheet

```
<who>  = digit-run (2, 123, 2233) · 0 = self · leading sigil/word = current target
<who> alone                 -> set sticky target (no tab switch)
<who> <num>                 -> action #num
<who> <num> <dmg-tags…>     -> amount, qualified      (2 10 melee slash)
<who> <num> <condition>     -> condition, num = duration (3 2 stun)
<who> <condition>           -> condition, default 1 round
<who> <verb>                -> action by name (fuzzy)
compound:  4 9 bludge 1 prone   -> 9 bludgeoning dmg + prone 1 round
hit   -> upgrade effect to full hit (13 hit · ' hit' for the current target)
undo  -> revert last command
@cond -> force the condition reading
(Space on an empty command box prefills the current-target id(s).)
```

The **active tab** is logged as the actor. A red ▼ targeting arrow paints on
every current-target tab (never on the actor's own tab — so `0`/self shows no
arrow). The arrow follows drag-reorder for free.

Click an action chip in the grid to run it without typing.

#### Action numbers

Every action chip shows its **panel hotkey number**. The NPC's own actions are
numbered **1, 2, 3, …** (its special abilities — what you reach for most).
Global / universal actions (Push, Grapple, Dodge, …) get **fixed numbers from
111** — `111`, `112`, `113`, … — *the same on every combatant's tab*. So `2 1`
is "actor's action #1 on target 2" and `2 111` is "actor's first global action
on target 2", and the 111+ range never collides with an NPC's `1..N`.

#### Tag vocabulary

Tags follow a **faceted** model. Only one value per facet is active at a time; a later tag in the same facet replaces the earlier one. `melee`/`ranged` and damage-type tags are silently dropped when `direction` is `heal`.

| Facet      | Values (aliases in parens)                                                                          | Notes                        |
|------------|-----------------------------------------------------------------------------------------------------|------------------------------|
| `direction`| `damage` (`dmg`, `dam`) · `heal` (`healing`, `hp`)                                                 | Default: `damage`            |
| `delivery` | `melee` · `ranged` (`rng`)                                                                          | Dropped if direction = heal  |
| `type`     | `fire` · `cold` · `acid` · `lightning` · `necrotic` · `radiant` · `thunder` · `force` · `psychic` · `piercing` (`pierce`) · `slashing` (`slash`) · `bludgeoning` (`bludge`, `bludgeon`) | Dropped if direction = heal. `poison` is **not** here — it parses as the `poisoned` condition. |

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
- **Dodge, Dash, Help, Hide, Ready** log a line. They are reachable both by chip click and by typing the verb against the PC (`0 dodge`, `0 disengage`) — a PC tab fuzzy-matches the verb against its generic action set before the global utility actions.

## LLM review (always-on, async)

Every state-changing command (directed or self-target) also triggers an **asynchronous LLM review** in a background thread. The review checks for resistances, missed triggers, and anything else worth flagging, then appends a `⟳ review:` line to the log.

Key points for DMs:

- **The `⟳ review:` lines arrive after a delay** — sometimes 5–30 seconds after a fast burst of commands. This is normal, not a bug. Grammar commands always resolve immediately; the review is an annotation layer.
- **`ANTHROPIC_API_KEY` is required for reviews.** Without a key the review silently no-ops; all grammar commands and the LLM fallback still work. See Requirements above.
- **Reviews cost real API tokens** (Haiku model, ~$0.15–0.75 for a 4-hour session of typical volume). There is no per-session call counter in the UI.
- **`note …` never hits the LLM** — use it for free-form log entries that should not trigger a review.

## Architecture quick-tour

- `app.py` — `QApplication` boot + qt-material theme + `build_main_window(encounter, counts, with_llm=True, party_config=…, player_selections=…)` (set `with_llm=False` in tests to bypass the LLM SDK)
- `main_window.py` — owns `EncounterState`, the `QTabWidget` (with the `CombatTabBar` targeting-arrow tab bar), the round button, the `EventBus`, the `TriggerMatcher`, the `UndoStack`, and the `SuggestionDriver`. `_on_command(ParsedCommand)` snapshots, resolves targets, applies each effect, emits bus events, and refreshes the arrow.
- `npc_tab.py` — one tab per combatant (NPC or PC). Composes `HPBar`, action area (DB-driven chip grid for NPCs; generic chip row for PCs), `CommandInput`, `SuggestionBar`. `_on_submitted` parses the input and emits `command_requested(ParsedCommand)` for the main window to dispatch.
- `command_tags.py` — pure-Python faceted tag taxonomy (`resolve_tags`, `hint_pool`). No Qt.
- `dispatcher.py` — the `<who> <stream>` grammar parser. `parse(raw) -> ParsedCommand` (`kind ∈ {command, set_target, unparseable, note, reorder, quit}`). Pure Python, no Qt.
- `command_model.py` — the `Effect` / `ParsedCommand` dataclasses (the dispatcher → main_window contract). `Effect` carries a `members` list for mob-member targeting.
- `effects.py` — `apply_effect` / `apply_hit` / `apply_uncertain_damage`: the authoritative `Effect` → `EncounterState` mutation point.
- `history.py` — `UndoStack` (memento full-state snapshots) + `PendingEffect` records.
- `targeting.py` — pure `<who>`-token logic (`classify_who`, `split_runs`).
- `widgets/combat_tab_bar.py` — `QTabBar` subclass that paints the red ▼ targeting arrow on every current-target tab (excluding the actor's tab).
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

## Grammar cheat sheet (the at-table syntax)

Every command is `<who> <stream>` — see the **Command grammar** section above
for the full rules. Worked examples:

| You type                | Effect                                                      |
|-------------------------|-------------------------------------------------------------|
| `2 8 melee slash`       | 8 melee slashing damage to combatant #2                     |
| `2 2`                   | Target #2, run action #2 (panel hotkey)                     |
| `3 tail-sweep`          | Target #3, run an action by name (fuzzy)                    |
| `123 3`                 | Run action #3 against all of {1,2,3}                        |
| `6 12 heal`             | Heal combatant #6 by 12                                     |
| `7 m3 6 melee`          | 6 melee damage to mob member 3 of combatant #7              |
| `0` / `0 2`             | Self (jump to own tab) / self, run action #2 (self-buff)    |
| `0123`                  | Target {self, 1, 2, 3}                                      |
| `3 2 stun`              | Stun combatant #3 for 2 rounds                              |
| `4 9 bludge 1 prone`    | 9 bludgeoning damage **and** prone for 1 round (compound)   |
| ` 12 heal`              | Heal the **current target** by 12 (leading sigil/word; Space on an empty box prefills the id) |
| `3` (alone)             | Set #3 as the sticky current target (no tab switch)         |
| `13 hit`                | Upgrade the pending effect on #1 and #3 to a full hit       |
| `undo`                  | Revert the last command (memento undo)                      |
| anything off-grammar    | Routed to the LLM meta-controller                           |

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
| Command falls through to LLM unexpectedly              | A damage-tag with no leading number (`2 melee`) is intentionally an error → LLM. Use `2 8 melee`. Remember `45` is **two** targets {4,5}, not one id `45` — same-digit runs make a single id (`44`) |
| Crashes on em-dash / unicode chars                      | Known PySide6 issue; ASCII only in test inputs                               |
