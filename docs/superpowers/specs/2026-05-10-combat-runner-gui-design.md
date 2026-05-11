# Combat Runner GUI — Design Spec

**Status:** approved, in-build
**Author:** Joe + Claude (brainstorm session 2026-05-10)
**Repo:** `~/GitHub/dnd`
**Code dir:** `combat-runner/`

---

## Problem & goal

The current `combat-runner` is a CLI tool that calls the Anthropic SDK directly: type a verb (`attack`, `breath`), Haiku resolves it via the `roll_combat_action` MCP tool, prints a paired roll table. Works, but feels heavy for the routine 80% of turns — verb→action is a hashmap, the tool is deterministic Python, the LLM round-trip is ~2.5s. The realization: **for most turns, the LLM is a glorified dispatcher**. It earns its keep only on tactics decisions, intent parsing, fuzzy event matching, and error recovery.

Goal: build a **PySide6 desktop app** that:
- Dispatches routine verbs in **~200-400ms** via direct Python calls (no LLM)
- Falls through to the LLM only for ambiguity / intent / typos / tactics questions
- Tracks live state (HP, conditions, recharges, reactions) visibly per NPC
- Pre-fetches "next likely action" suggestions in the background per tab so they're ready when needed
- Routes cross-NPC reactions (Aelric counterspelling a PC casting near the Stalker) via an event-trigger system
- Lets the LLM be a **meta-controller**: every UI mutation has a corresponding tool, so "decrease the round" / "undo that damage" works as a natural-language safety net

The existing combat-runner Python core (actions DB, dice roller, encounter discovery) is reused as-is. Only the interface layer is new.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  PySide6 GUI (combat-runner/gui/)                │   <- NEW
│  ├─ app.py                — QApplication boot    │
│  ├─ encounter_picker.py   — startup dialog        │
│  ├─ main_window.py        — tabs, menu, layout   │
│  ├─ npc_tab.py            — sheet + log + input  │
│  ├─ widgets/                                      │
│  │  ├─ hp_bar.py          — single + segmented   │
│  │  ├─ action_chips.py    — clickable grid       │
│  │  ├─ command_input.py   — sigil parser + preview│
│  │  └─ suggestion_bar.py  — 3 LLM slug buttons   │
│  ├─ dispatcher.py         — sigil router + fuzzy │
│  ├─ event_bus.py          — emit / match / route │
│  ├─ llm_controller.py     — Anthropic SDK +      │
│  │                          full tool surface    │
│  └─ state.py              — per-tab state model  │
├──────────────────────────────────────────────────┤
│  combat-runner Python core (unchanged)           │
│  ├─ scripts/dnd_roller.py — MCP tools (in-proc)  │
│  ├─ scripts/combat_actions_db.py — JSONL DB      │
│  ├─ combat-runner/actions.jsonl — action specs   │
│  └─ encounter discovery (#combat-runner tag)     │
└──────────────────────────────────────────────────┘
```

**Design rules:**
- The GUI imports from `scripts/dnd_roller.py` and `scripts/combat_actions_db.py` directly — no MCP transport for the at-table loop.
- All persistence is via the existing JSONL log file (`combat-runner/.memory/<encounter>/log-<timestamp>.md`).
- All dice still flow through `_roll_dice_async` → quantum cache.
- The `roll_combat_action` and friends keep their current signatures; the GUI calls them as Python functions.

---

## User flow

### Launch & encounter pick

1. `make combat-gui` (or `python -m combat_runner.gui`) → app boots.
2. **Encounter picker dialog** appears. Lists every encounter discovered via the existing rule: any `.md` under `world/**` containing `#combat-runner` in the first 30 lines → walk up past `npcs/` → the parent is the encounter root.
3. Encounters sorted by most-recent NPC-file mtime (matches today's behavior).
4. For the selected encounter, the dialog lists every tagged NPC with a spin-box for `count` (defaulting to 1, or to the `count:` field in the NPC's frontmatter if present).
5. User clicks **Launch** → encounter dialog closes, main window opens.
6. **Menu bar → Encounter → Switch encounter…** reopens the dialog. Closing the current encounter is OK; tabs reset to fresh state. (Persistence is "fresh every launch" — confirmed.)

### Main window layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  File  Encounter  View  Help                       mountin-pass · R3 │  <- menu bar + round counter button
├──────────────────────────────────────────────────────────────────────┤
│ ▎Glacier Stalker  56/84  │ Aelric  38/38 │ Gnoll Pack ×3 │  + │      │  <- tab bar
├──────────────────────────────────────────────────────────────────────┤
│ NPC sheet (left, ~50%)        │ Combat log (right, ~50%)            │
│                               │                                      │
│ Glacier Stalker               │ T1·R2  Multiattack on Brann          │
│ CR 5 · cold immunity          │        ⚛️ to-hits 23/14/16 · dmg ... │
│ HP 56/84 ▆▆▆▆▆▂  AC 16        │ T2·R2  Brann hits → -14 (HP 70)      │
│ ░░░░░░░░░░ <- segmented hp    │ T1·R3  Pounce on Tenza               │
│ [Grappling Tenza] [Roar 5+]   │ T2·R3  Tenza grappled                │
│                               │ T3·R3  Lyric magic missile → -14     │
│ ACTIONS                       │                                      │
│ ┌──────────┬──────────┐       │ Suggested:                           │
│ │Multiattack│Frozen Bile│      │ [Multiattack on Tenza (grappled)]   │
│ ├──────────┼──────────┤       │ [Frozen Bile on Lyric · 30 ft]      │
│ │Glacial Roar│Pounce   │       │ [Snow Vanish · bloodied retreat]    │
│ │USED        │         │       │                                      │
│ ├──────────┼──────────┤       │ ┌─────────────────────────┐ ┌───┐    │
│ │Snow Vanish│Rime Reflex│      │ │ -18 (HP 56 → 38) ░░     │ │ ↵ │    │  <- input bar with live preview
│ │           │⚡reaction │      │ └─────────────────────────┘ └───┘    │
│ └──────────┴──────────┘       │                                      │
│                               │                                      │
│ ─ Global Actions ─             │                                      │
│ [Push] [Grapple] [Shove]      │                                      │
│ [Disengage] [Dodge]           │                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Top bar:**
- Menu bar (File / Encounter / View / Help) on left
- Right side: encounter name + clickable round counter (`R3` ← click to advance to `R4`; refreshes ALL reactions + rolls recharges for every NPC)

**Tab bar:**
- One tab per spawned NPC (mob counts as one tab per `.md`, regardless of how many creatures in the mob)
- Tab title shows NPC name + current/max HP
- Duplicate NPCs (e.g. two Glacier Stalkers spawned with count=2) get badge `×2` and a number suffix
- `+` button on the right adds another instance of an existing NPC (right-click any tab → Duplicate)
- Active tab highlighted with bottom border in accent color (qt-material blue/teal)
- **Tab key** cycles through tabs in order (left→right). Cmd+number jumps to tab N.
- Per-tab "Start turn" button in the tab's header bar — manual override for the round-button group refresh

**Sheet panel (left):**
- NPC title, type/CR/immunities subtitle
- **Status strip**: `HP X/Y · AC · Speed · Saves` in a one-liner
- **HP bar**: red filled bar with the current/max. For mobs (`count > 1`), segmented vertically into `count` slots, each tracking its own HP independently
- **Condition pills**: colored chips showing active conditions (Grappling X, Frightened, Prone, etc.). Recharge state pills (Glacial Roar — recharge 5+; USED)
- **Action chips** (per-NPC actions): grid of cards. Each chip shows action name, key verbs/range/recharge in small text. Clickable (executes immediately, same as typing the verb). USED action chips greyed out. Sorted by optional `priority` field (higher = higher in grid, default 0)
- **Global actions row** (sorted to bottom): chips for any actions with `scope: global` in actions.jsonl. Always visually segregated below the per-NPC actions

**Console panel (right):**
- **Combat log**: scrollable list of timestamped events (`T1·R2 Multiattack on Brann · ⚛️ to-hits ...`). Color coding: HP loss red, narration italic dim, dice green-ish, events yellow tags. Auto-scrolls to bottom on append
- **Suggestion bar**: 3 short-slug buttons above the input (e.g. "Multiattack on Tenza (grappled)"). Rendered as accent-colored buttons. Click → instant fast-path dispatch of that exact action. Re-fired by the background LLM whenever state changes (cancellable; if the user types a new input that triggers an action, the in-flight suggestion request is cancelled and a fresh one is fired post-action)
- **Command input**: text field with the qt-material accent underline. Live preview (see below). Enter commits. Up/Down arrow keys browse input history within the session
- **Live HP preview**: while typing `-18` or `+10`, the HP bar visually drops (red overlay) or rises (green overlay) to the projected value. The `R3` and round counter unchanged. Backspace reverts the preview live. Enter commits the change to state and logs

### Dispatcher (the heart of "snappy")

When the user submits an input (Enter), the dispatcher runs this sequence:

1. **Sigil parse** (regex-based, no LLM):
   - `^-(\d+)( (\w+))?$` → `damage` event with optional damage_type tag (e.g. `-18 fire`)
   - `^\+(\d+)$` → `heal` event
   - `^@(\w+)( (\w+))?$` → `condition_toggle` event (`@prone`, `@grappled tenza`)
   - `^@$` → open the condition autocomplete overlay (Esc closes; arrow keys navigate; Enter selects)
   - `^m(\d+) (.*)$` → mob-targeted command: rewrite `m3 -5` as `-5` against mob member 3
   - `^note (.*)$` → log-only entry; never sent to LLM
   - `^/(quit|exit)$` → close the tab (no exit on Cmd+Q either — File menu only)
2. **Fuzzy action match** (no LLM if exactly one match):
   - Search ACTIVE TAB's actions for a fuzzy substring/prefix match on:
     - action name (case-insensitive)
     - each verb in the action's `verbs` list (case-insensitive)
   - If exactly 1 match → call `roll_combat_action(npc, action, log_path)` immediately; render output; emit `action_executed` event
   - If 0 matches → fall through to LLM
   - If 2+ matches → fall through to LLM (it picks the right one with full context, but the LLM call is gated to those matched options for speed)
3. **LLM fallback** (`llm_controller.run`):
   - Builds a system prompt with: current tab NPC, all loaded NPCs (slugs + names), action surface for active tab, recent log entries (last 10), current HP/condition state, all available tools
   - Calls Anthropic SDK with full tool surface (see below)
   - Streams response back to combat log

### Live HP preview implementation

The command input fires a `textChanged` signal on every keystroke. A debounced (50ms) handler:

- If input matches `^-(\d+)` → compute `projected_hp = current_hp - N`. Update the HP bar widget to show this projected value with a red flash overlay. Add a tiny ghost text on the input: `(HP 56 → 38)`. Don't write to state.
- If input matches `^\+(\d+)` → green overlay, projected HP up.
- If input no longer matches → revert preview (HP bar back to actual current_hp).
- On Enter: commit the preview to actual state, write the log entry, fire `damage` or `heal` event.

For mob HP: preview targets the routing destination (highest-numbered alive member by default; explicit `m3` overrides).

### Suggestion system

After every state-changing event (`action_executed`, `damage`, `heal`, `condition_toggle`, `round_advanced`), per-tab background tasks fire:

```python
# Pseudocode
for tab in main_window.tabs:
    task = asyncio.create_task(
        llm_controller.suggest_next_actions(
            npc=tab.npc_slug,
            state=tab.state_snapshot(),  # HP, conditions, recharges, reactions used, recent events
            other_npcs=[t.npc_slug for t in main_window.tabs if t != tab],
            log_tail=tab.last_n_log_entries(10),
        )
    )
    tab.cancel_pending_suggestion_task()
    tab.suggestion_task = task
```

The LLM returns 3 short slugs (max ~12 words each), each tagged with the action it would invoke:

```json
{
  "suggestions": [
    {"slug": "Multiattack on Tenza (grappled bite has adv)", "action": "multiattack"},
    {"slug": "Frozen Bile on Lyric · 30 ft, low AC", "action": "frozen_bile"},
    {"slug": "Snow Vanish · bloodied retreat", "action": "snow_vanish"}
  ]
}
```

Suggestion buttons are rendered above the command input. Click → dispatcher fast-path on the chosen action.

When a new event fires, in-flight suggestion tasks for affected tabs are cancelled and re-issued. Stale results (older than the last state change) are discarded.

### Event-trigger system

Actions in `actions.jsonl` can declare a `trigger` field that fires the action when a matching event is emitted:

```json
{
  "npc": "glacier-stalker",
  "action": "rime_reflex",
  "type": "reaction",
  "trigger": {
    "scope": "self",
    "event": "damage",
    "match": "melee damage within 5 ft"
  },
  ...
}
{
  "npc": "aelric-frostweaver",
  "action": "counterspell",
  "type": "utility",
  "trigger": {
    "scope": "global",
    "event": "spell_cast",
    "match": "PC casts a spell within 60 ft"
  },
  ...
}
```

- **`scope: "self"`** — trigger only checked when this NPC is the event subject (Rime Reflex only fires when the Stalker takes the hit)
- **`scope: "global"`** — trigger checked for every event regardless of subject (Counterspell fires when any PC casts anywhere)

When the event bus emits an event:

1. Gather candidate triggers:
   - Subject NPC's `self`-scoped triggers
   - All NPCs' `global`-scoped triggers
2. For each candidate, the LLM does a **fuzzy match** between `trigger.match` and the event description (typically 1 short async call with the matched options to the LLM, or a sync regex/keyword pre-filter for high-confidence matches)
3. For matched triggers, filter out USED reactions
4. If 0 matched → no UI; combat continues
5. If 1+ matched → show a **modal prompt**: `[NPC] reacts with [action]? · TRIGGER · PASS`. (Multiple matched → multiple TRIGGER buttons in the prompt, plus one PASS button.)
6. TRIGGER click → switch active tab to the reacting NPC, call `roll_combat_action(npc, action, log_path)`, emit `reaction_used` event (marks reaction USED for that NPC), append to log
7. PASS click → close the prompt; reactions stay armed

### LLM as meta-controller

The LLM has direct tool access to **every** UI state mutation. The tool surface (in addition to today's `roll_combat_action`, `roll_dice`, `log_combat_event`, `combat_action_upsert`, `combat_actions_list`, SRD lookups):

| Tool | What it does |
|---|---|
| `set_hp(npc_slug, hp)` | Set absolute HP for an NPC (or `m1`/`m2`/`m3` for mob members) |
| `damage_npc(npc_slug, amount, damage_type=None)` | Decrement HP (with damage_type for trigger matching) |
| `heal_npc(npc_slug, amount)` | Increment HP, capped at max |
| `add_condition(npc_slug, condition)` | Add a condition pill |
| `remove_condition(npc_slug, condition)` | Remove a condition pill |
| `mark_action_used(npc_slug, action)` | Grey out an action (recharge bookkeeping) |
| `refresh_reaction(npc_slug)` | Reset reaction-used flag |
| `roll_recharge(npc_slug, action)` | Roll a d6 for a recharge ability, mark AVAILABLE if 5-6 |
| `set_round(round_num)` | Set the current round (back or forward) |
| `advance_round()` | Round + 1, refresh all reactions, roll all recharges |
| `switch_tab(npc_slug)` | Make this NPC's tab active |
| `add_log_entry(npc_slug, text, kind="event")` | Append to combat log |
| `emit_event(event_type, subject_npc, details)` | Manually emit an event into the bus (for reaction triggers) |

These tools mean: even if a UI element doesn't have a button for something the user wants, they can describe it in natural language and the LLM will do it. Example: "the stalker accidentally got grappled — fix that and roll back HP by 5". LLM calls `remove_condition("glacier-stalker", "grappled")` and `heal_npc("glacier-stalker", 5)`.

**Caveat:** tools are NOT exposed via MCP transport. They're Python functions on the `LLMController` class. The Anthropic SDK gets them as tool definitions; the controller dispatches them in-process. Same model as today's `sdk_session.py` but with a richer surface.

### Round counter & lifecycle

- **Round button** (top right): clickable label `R3`. Click → `advance_round()`:
  - `current_round += 1`
  - For every NPC: refresh reaction-used flag → `False`
  - For every NPC: any USED recharge action → roll d6 → if ≥ recharge threshold, mark AVAILABLE
  - Append `--- Round N ---` divider to every tab's combat log
- **Per-tab "Start turn" button**: in the tab's header strip. Click → refreshes ONLY that NPC's reaction/recharge. Useful for fixing initiative mistakes
- **LLM tools** can call `set_round(n)` to roll back a mis-click

### Mob mechanics

An NPC `.md` declares `count: N` in frontmatter to be a mob. Default 1.

- Tab shows the NPC name + count badge (e.g. `Gnoll Pack ×3`)
- HP bar split into N vertical segments; each segment has its own current_hp and shared max_hp (e.g. each gnoll is 12 HP)
- Damage routing: default target = **highest-numbered alive member** (so the bar drains right→left, visually). Explicit override: `m3 -5` damages member 3 specifically. If `m3` is dead, that's an error (logged, no damage applied)
- Dead member: segment dark, no further damage routed there, attack slots tied to that member skipped in multiattack rolls
- Action specs with N attacks (one per mob member) automatically skip dead-member slots: a Pack-of-3-Gnolls `multiattack` with 3 claws → if member 2 dead, only 2 claws roll

### Persistence

- **Fresh every launch** — no auto-resume. Decided.
- **Always-on logging** — every event (action_executed, damage, heal, condition toggle, round advance, note, reaction trigger) appends to `combat-runner/.memory/<encounter>/log-<timestamp>.md`. Same path scheme today's CLI uses
- **Encounter switching mid-session**: confirms with the DM, closes current tabs, opens new encounter dialog. The previous log file is closed (stays on disk) and a fresh log file opens for the new encounter

### Universal / global actions

Stored in `actions.jsonl` with `scope: "global"` (instead of an `npc` slug, or *alongside* the `npc: "*"` convention — TBD in implementation, simpler to just use `scope` and ignore the `npc` field when scope is `global`).

Each global action specifies how to use the **calling NPC's stats** when invoked. For example, `push` requires `(str_mod, athletics_prof)` from the NPC; for MVP, if the NPC's actions.jsonl doesn't declare an `abilities` block, the dispatcher prompts the DM ("Push using which Str mod?") instead of failing.

Starter global action set (seeded in v0.5):

| Action | Description | Roll mechanic |
|---|---|---|
| `push` | Shove a creature 5 ft | NPC Athletics check (Str) vs target's choice of Athletics (Str) or Acrobatics (Dex). DM rolls target. |
| `grapple` | Initiate a grapple | NPC Athletics (Str) check vs target's choice. Applies `grappled` condition on success. |
| `shove_prone` | Knock prone instead of push | Same contest. Applies `prone` condition on success. |
| `disengage` | Move without provoking OAs | No roll; logs `disengage taken`. |
| `dodge` | Attackers have disadv until next turn | No roll; adds `dodging` condition (auto-expires next turn). |
| `dash` | Double movement | No roll; logs `dash taken`. |
| `help` | Grant ally advantage | No roll; logs `helping [target]`. |
| `hide` | Become hidden | NPC Stealth check vs observers' passive Perception (or active Perception if rolled). |

Each global action's spec mirrors today's `utility` or `single_attack` action schemas, just with `scope: "global"`.

### Testing strategy

Tests live in `combat-runner/tests/`. Uses `pytest` + `pytest-qt`. Three concentric rings:

#### Ring 1 — Unit tests (`tests/test_*.py`)

Mechanical correctness, fast, no GUI.

- Dispatcher sigil parsing (every regex pattern; edge cases like `-0`, `-9999`, `m99 -5`, malformed `@`)
- Fuzzy action match algorithm (substring, prefix, case-insensitive, multi-match → returns the list)
- Event bus emit/match/route
- State model mutations (HP clamping, condition add/remove, reaction lifecycle)
- Mob HP damage-routing rules (highest-alive default, explicit override, dead-member skip)
- Recharge state machine (USED → roll d6 → AVAILABLE on ≥ threshold)
- LLM controller tool dispatch (mocked Anthropic client)

#### Ring 2 — Widget integration tests (`tests/test_widget_*.py`)

Each PySide6 widget behaves correctly in isolation. Uses `qtbot` fixtures from pytest-qt.

- HP bar: render single + segmented modes, live-preview overlay, color states (full / bloodied / dead)
- Action chips: click triggers `dispatched` signal, USED chips greyed, sorted by priority, globals at bottom
- Command input: live preview signal fires on `-N` / `+N`, sigil parsing dispatches on Enter, history navigation
- Suggestion bar: 3 buttons populate on `suggestions_received` signal, click triggers `suggestion_chosen`
- Encounter picker dialog: lists discovered encounters, count spinbox starts at frontmatter default
- Reaction prompt modal: PASS / TRIGGER buttons emit correct signals

#### Ring 3 — Scenario playthroughs (`tests/scenarios/*.py`)

**This is where "does the tool feel right?" gets measured.** Each scenario scripts a realistic combat from start to end. The test asserts:

- **Mechanical correctness:** final HP values, log contents, action ordering match a golden fixture
- **Ergonomics metrics:**
  - **Click count per turn** (target: ≤ 2 clicks for routine attacks, ≤ 1 for suggestion-button paths)
  - **Keystrokes per turn** (target: ≤ 8 for the average verb input including Enter)
  - **Latency per action** (target: fast-path ≤ 500ms, LLM fallback ≤ 3s warm)
  - **Tab switches per round** (informational; high values suggest a UX issue)
  - **LLM fallback frequency** (target: < 20% of inputs hit the LLM in a routine session)

Each scenario emits a metrics report stored in `combat-runner/tests/.metrics/<scenario>-<timestamp>.json`. Reviewers compare runs to detect ergonomic regressions.

**Defined scenarios for v1.0 acceptance:**

- **S1 — Single-NPC quick fight (Glacier Stalker vs party of 3, 5 turns)**
  - Open encounter picker → pick mountin-pass with count=1 stalker → launch
  - Turn 1: `vanish` (Snow Vanish bonus + Pounce next round)
  - Turn 2: `pounce ten` → DM applies prone save → `attack` (multiattack with adv on bite)
  - Turn 3: PC dmg input `-14`, then `vanish` again
  - Turn 4: `attack` Brann
  - Turn 5: PC kills stalker (`-30`); confirm tab shows dead state
  - **Expected metrics:** ≤ 12 clicks total, ≤ 50 keystrokes, no LLM calls expected (all routine verbs)

- **S2 — Two-NPC coordinated party (Stalker + Aelric, 8 turns)**
  - Picker: count=1 stalker + count=1 aelric
  - Initiative implied; Stalker tab first
  - Turn 1: `vanish` (Stalker), Tab → Aelric → `mage armor` (buff, no roll)
  - Turn 2: `pounce ten` (Stalker grapples Tenza), Tab → Aelric → `frost ray`
  - Turn 3: PC casts Hold Person on Stalker → DM types `note PC casts Hold Person on stalker (3rd level)` → event emitted → Aelric's Counterspell trigger fires → modal prompt → click TRIGGER → tab switches to Aelric → counterspell rolls
  - Turn 4: Multi-attack on Tenza (grappled, adv on bite), Tab → Aelric → `ice storm`
  - Turn 5: PC stabs Aelric in melee for big dmg → `-22 piercing melee` → Rime Reflex (Stalker) does NOT trigger (Aelric is the subject, not Stalker — scope:self check works correctly), but Aelric's Shield COULD trigger → prompt → click TRIGGER → Shield applied → reduce dmg
  - Turn 6: Round button click → both NPCs' reactions refresh
  - Turn 7: Free-form input: `the wizard tries to teleport away from Tenza` → LLM falls through, calls misty_step
  - Turn 8: Stalker bloodied below 25 HP → Stalker's Tactics block suggests retreat → suggestion button shows "Snow Vanish · retreat" → click
  - **Expected metrics:** ≤ 25 clicks (including TRIGGER prompts + tab switches), ~70 keystrokes, exactly 1-2 LLM fallbacks (the free-form turn + any suggestion-gen background calls)

- **S3 — Wizard + mob-of-5 fight (Aelric + Gnoll Pack ×5, 6 turns)**
  - Picker: count=1 aelric + count=5 gnoll-pack (single tab for the pack)
  - Verify: Gnoll Pack tab shows 5 segmented HP bars (10 HP each, say)
  - Turn 1: Aelric `ice storm` → 4d6 cold to all clustered targets
  - Turn 2: Gnoll Pack tab → `attack` (pack multiattack rolls 5 claw attacks, one per alive gnoll)
  - Turn 3: PC kills 2 gnolls: `m5 -10`, `m4 -10` → segments 5+4 darken → next pack multiattack rolls only 3 claws
  - Turn 4: `m3 -10` kills another → 2 left
  - Turn 5: `note PC retreats 30 ft`, then Aelric `frost ray` at retreating PC
  - Turn 6: Last 2 gnolls `attack` → 2 claws roll → final 2 PCs hit
  - **Expected metrics:** ≤ 20 clicks, mob multiattack auto-shrinks correctly, segmented HP visually drains right→left, no LLM calls for routine inputs

- **S4 — Edge cases & error recovery (5 turns)**
  - Mis-click round button → free-form: `we're still on round 3, go back` → LLM calls `set_round(3)`
  - Apply wrong condition: `@prone` accidentally → free-form: `take that prone off` → LLM calls `remove_condition`
  - Unknown verb typo: `stallker attaccck` → LLM matches fuzzy → calls multiattack
  - `note` command never sends to LLM (assert no API call)
  - Encounter switch via menu mid-session → confirms with mock dialog → opens new picker

Test runner: `cd combat-runner && ./.venv/bin/pytest tests/ -v`. Scenarios run as part of the suite but tagged with `@pytest.mark.scenario`. CI/daemon runs all rings; local dev can `pytest -m 'not scenario'` for fast iteration.

#### Instrumentation hooks

The dispatcher and event bus emit metrics signals tests can subscribe to:

- `dispatcher.action_dispatched` — `{npc, action, latency_ms, path: "fast"|"llm"}`
- `command_input.submitted` — `{keystrokes, source: "type"|"chip_click"|"suggestion"}`
- `main_window.tab_switched` — `{from, to, source: "key"|"click"|"llm_tool"}`
- `llm_controller.call_completed` — `{model, latency_ms, cache_read, input_tokens, output_tokens}`

The scenario tests subscribe to these and aggregate into the metrics JSON.

### CI / dependencies

Add to `pyproject.toml`:
- `PySide6 >= 6.7`
- `qt-material >= 2.14`
- `pytest-qt >= 4.4`

No removals. The existing CLI mode (`make combat`) stays as a fallback.

### Open questions / explicit non-goals

- **PC tracking** — not in app. PCs are name references in commands. Decided.
- **Save/resume mid-fight** — not in MVP. Logs persist; loading from log is a v1.x feature.
- **NPC stat block authoring within the app** — not in MVP. Use `combat_action_upsert` via Opus session.
- **Initiative tracker** — not in MVP. DM tracks initiative externally; tab order is just NPC order.
- **Player display** — not in MVP. Single-DM-window app.

---

## Build plan (slices)

Each slice is a working app — ship-and-iterate.

### v0.1 — GUI foundation

**Goal:** replace `make combat` for single-NPC encounters.

- `combat-runner/gui/__init__.py`, `app.py` (QApplication boot, qt-material dark theme apply)
- `encounter_picker.py` — dialog: list encounters, per-NPC count, Launch button
- `main_window.py` — single tab only for v0.1; menu bar with File / Encounter / View / Help; round counter button (no-op clickable for v0.1)
- `npc_tab.py` — sheet panel + log panel + input
- `widgets/hp_bar.py` — single-creature HP bar (no segmentation yet); red fill, qt-material dark background
- `widgets/action_chips.py` — grid of clickable action cards. Click → fast-path dispatch
- `widgets/command_input.py` — text field, live HP preview for `-N` and `+N`, sigil parser dispatch
- `dispatcher.py` — sigil parse + fuzzy action match + log append
- `state.py` — per-tab state model (HP, conditions, recharges, reaction_used flag)
- Wire `dispatcher.execute_action(npc, action)` → call `dnd_roller.roll_combat_action(npc, action, log_path)` and append result to log
- `make combat-gui` Makefile target
- Tests: unit tests for dispatcher; one integration test that opens the picker, picks the mountin-pass encounter (1 stalker), types `attack`, asserts log gets an entry with `⚛️`

**Done when:** can `make combat-gui`, pick mountin-pass, see Glacier Stalker tab, type `attack`, see the multiattack table render in the log, type `-18` (preview HP drop), Enter (commit). All deterministic, no LLM yet.

### v0.2 — Multi-tab + LLM meta-controller

**Goal:** multiple NPCs, suggestion buttons, full LLM tool surface for free-form fallback.

- `main_window.py` — multi-tab support; tab-key navigation; tab close/duplicate; round button now actually advances rounds
- `widgets/suggestion_bar.py` — three slug buttons above input
- `llm_controller.py` — Anthropic SDK with the full meta-controller tool surface (set_hp, switch_tab, etc.). Reuses the cached system-prompt design from `sdk_session.py`
- `llm_controller.suggest_next_actions(tab_state) -> list[Suggestion]` — background async call
- Dispatcher: when fuzzy match returns 0 or 2+, fall through to `llm_controller.run(input, full_context)` which may call tools
- Tests: integration test that types something weird (`stallker attaccck`) and asserts the LLM is invoked (mocked) and dispatches to the right action

**Done when:** can launch a 2-NPC encounter (mountin-pass with Stalker + Aelric), tab between them, suggestions pre-populate after every action, free-form input goes to the LLM, the LLM can call `set_hp` to fix mistakes.

### v0.3 — Events + reactions

**Goal:** cross-NPC reaction triggers, lifecycle automation.

- `event_bus.py` — typed event emission, trigger matching (regex pre-filter for high-confidence; LLM fuzzy match for the rest)
- Trigger schema extended: actions can declare `trigger: {scope, event, match}`
- Reaction prompt modal: `QDialog` with PASS / TRIGGER buttons, multiple TRIGGER buttons for multi-match
- Reaction-used / recharge state machine wired to round button + per-tab "Start turn" button
- Damage parser emits `damage` events with `damage_type` tag (so `-18 fire` → fire-damage event)
- Tests: trigger Rime Reflex via a `-12 melee` event; assert the prompt appears, click TRIGGER, assert tab switches + action runs + reaction marked USED

**Done when:** Aelric Counterspells when a PC casts near the Stalker (DM types `note PC casts Hold Person`, app emits `spell_cast` event, Aelric's Counterspell trigger fires, prompt appears).

### v0.4 — Mobs

**Goal:** multi-creature NPCs.

- NPC `.md` frontmatter: `count: N` field parsed by encounter picker (default 1; spin-box defaults to this value)
- `widgets/hp_bar.py` extended: when state.count > 1, render N segmented vertical bars
- Damage routing rules (default = highest-alive; `m3` override) in dispatcher
- Multiattack action execution: filter the `attacks` list by alive-member count before rolling
- Tests: build a fake mob-of-3 NPC, damage it three times, assert segments drain right→left; explicit `m1 -12` kills member 1, assert subsequent default routing goes to m3

**Done when:** can spawn a "Gnoll Pack ×3" NPC (added to mountin-pass for testing); each gnoll tracks separately; killing the rightmost drops it from future multiattack rolls.

### v0.5 — Universal / global actions

**Goal:** push, grapple, dodge etc. as shared actions every NPC can use.

- Extend `actions.jsonl` schema: `scope: "global"` field
- Discovery: any action with `scope: "global"` is pulled into every NPC's action surface, displayed below per-NPC actions in the sheet panel
- Validator extended to handle `scope: "global"` (no `npc` field required for global; ignores `npc` if present)
- Seed 8 starter global actions: push, grapple, shove_prone, disengage, dodge, dash, help, hide
- Each global action's spec stored in actions.jsonl alongside everything else
- Tests: spawn glacier-stalker, assert global actions appear in the action chip grid; type `push`; assert correct dispatch

**Done when:** `actions.jsonl` has 8 global actions, every NPC's action grid shows them at the bottom, clicking `push` rolls the Stalker's Athletics check.

---

## Cron daemon contract (build automation)

A durable cron job (hourly at minute 7) drives the build forward across sessions. Its prompt and state-file contract:

**State file:** `combat-runner/.build-state.md` — markdown with structured frontmatter. The daemon reads this on every fire.

**Daemon prompt template:**

```
You are the dnd-combat build daemon. Read combat-runner/.build-state.md and the
spec at docs/superpowers/specs/2026-05-10-combat-runner-gui-design.md.

Phases:
  building     → pick next pending slice, build it, write tests, run tests, update state
  reviewing-1  → spawn 3 parallel review subagents (architecture, tests, end-to-end)
  applying-1   → apply non-controversial fixes from review
  reviewing-2  → end-to-end review: boot GUI headless, run smoke test
  done         → verify all features tested + GUI boots + tests pass; if clean, CronDelete self

Rules:
  - NEVER commit or push (user reviews on their own)
  - ALWAYS test what you build (pytest under combat-runner/tests/)
  - ALWAYS update the state file when you finish a unit of work
  - If you run out of token budget mid-work, save progress to state and exit cleanly
```

**Completion criteria** (all must hold before daemon self-deletes):
- v0.1–v0.5 slices all marked complete in state
- `cd combat-runner && pytest tests/ -v` exits 0
- End-to-end smoke test passes (10-turn combat sim runs cleanly)
- Review pass 1 completed; non-controversial fixes applied
- Review pass 2 completed; no blocking findings
- State file phase = `done`

Only then: `CronDelete(job_id)` from within the daemon, and the daemon exits.

---

## Files-touched manifest (final state expected at done)

```
docs/superpowers/specs/2026-05-10-combat-runner-gui-design.md   [this file]
combat-runner/
├── .build-state.md                          [daemon state]
├── gui/
│   ├── __init__.py
│   ├── app.py
│   ├── encounter_picker.py
│   ├── main_window.py
│   ├── npc_tab.py
│   ├── dispatcher.py
│   ├── event_bus.py
│   ├── llm_controller.py
│   ├── state.py
│   └── widgets/
│       ├── __init__.py
│       ├── hp_bar.py
│       ├── action_chips.py
│       ├── command_input.py
│       └── suggestion_bar.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py            [pytest-qt fixtures, QT_QPA_PLATFORM=offscreen]
│   ├── test_dispatcher.py
│   ├── test_event_bus.py
│   ├── test_state.py
│   ├── test_mob_hp.py
│   ├── test_hp_bar.py
│   ├── test_action_chips.py
│   ├── test_command_input.py
│   ├── test_suggestion_bar.py
│   ├── test_encounter_picker.py
│   ├── test_main_window_smoke.py
│   ├── test_llm_controller.py [mocked Anthropic]
│   └── test_e2e_combat.py     [10-turn scripted fight]
└── actions.jsonl              [extended with 8 global actions]

Makefile                       [add `combat-gui` and `combat-test` targets]
pyproject.toml                 [add PySide6, qt-material, pytest-qt]
```

Existing files (`scripts/dnd_roller.py`, `scripts/combat_actions_db.py`, the existing CLI `sdk_session.py`, etc.) are NOT modified by this project. The GUI imports from them but does not change them.
