# Combat Runner — At-Table Command Grammar Overhaul

**Status:** Design — approved via a 20-example walkthrough, 2026-05-22
**Component:** `combat-runner/gui/`
**Author:** Joe + Claude (brainstorming session)

## 1. Problem & Goal

The combat-runner GUI is the at-the-table tool. Its directed-command grammar today is
`<id> <amount> [tags]` plus standalone sigils — functional, but running combat live
needs faster, more consistent input: a persistent target, multi-target, action
quick-select, in-line compound effects, mid-combat correction, and a visible
targeting indicator — without losing the LLM escape hatch for anything fuzzy.

**Goal:** one consistent command grammar that covers the ~90% fast path
deterministically, with the LLM handling the long tail. Guiding principle: the
system supports the tabletop nature of play — things happen outside the system,
and the grammar must be fuzzy enough to record what the DM wants.

## 2. The Grammar

Every command is **`<who> <stream>`**.

### 2.1 `<who>` — the target slot

Determined by the command's **first character**:

- **Leading digit** → an explicit target. A digit string splits into maximal
  same-digit **runs**; each run is one combatant id. One run = single target
  (`2`, `22`, `222`). Two-or-more runs = a multi-target set (`123` → {1,2,3};
  `2233` → {22,33}; `122333` → {1,22,333}).
- **`0`** → **self** — the acting combatant (the active tab). Combinable inside a
  run sequence: `0123` → {self, 1, 2, 3}.
- **Leading whitespace** → the **current target** (whatever is sticky).
- **Leading sigil or word** (`-`, `+`, `@`, or a bare word like `prone`/`hit`) →
  also the current target (no explicit `<who>`).

A `<who>` token **alone** (digits, nothing after) sets the sticky current target
and jumps to that tab, logging e.g. *"Marwen is now the target."*

**Accepted limitation:** you cannot bare-digit-target id `2` and id `22` together
(their runs merge into `222`, a single id). Rare — use two commands or the prompt.

### 2.2 `<stream>` — effects

After `<who>`, a left-to-right stream of effect groups. **A number's meaning is set
by the tag immediately after it:**

| Pattern | Meaning | Example |
|---|---|---|
| `<number> <damage-tag…>` | a damage/heal **amount** group | `2 10 melee slash` = 10 melee slashing |
| `<number> <condition>` | the condition's **duration** (rounds) | `3 2 stun` = stun for 2 rounds |
| `<number>` then nothing | an **action #** (panel hotkey) | `2 2` = action #2 |
| `<condition>` with no number | the condition, **default duration 1 round** | `3 prone` |
| a damage group with **no** number | **error → LLM** (no silent default-1) | `2 melee` ✗ |

- Damage-tags = damage types (`fire`, `slash`, …), delivery (`melee`, `ranged`),
  and direction (`dmg`, `heal`).
- A **damage group** is `<number> <damage-tag…>`: the number leads, then one or
  more damage-tags. The leading number is the single amount; the trailing
  damage-tags all qualify *that* amount (`2 10 melee slash` is one 10-point hit).
  A damage-tag that begins a group with **no** leading number is the error case
  above — the DM meant to type an amount.
- **Numbers always come before their tag.** No before-*or*-after flexibility.
- **Compound effects chain in one command:** `4 9 bludge 1 prone` = 9 bludgeoning
  damage **and** prone for 1 round.

### 2.3 Actions

- **By number:** `<who> <n>` — `n` indexes the active NPC's numbered left-panel
  actions.
- **By name:** `<who> <verb>` — fuzzy-matched against the active NPC's actions
  (the "I don't recall the number" fallback).
- **Untargeted:** ` <n>` / ` <verb>` (leading space) → action at the current target.
- An action is **self-contained** — it rolls its own damage and applies its own
  riders (conditions, etc.). It is never tagged in the command.

### 2.4 Conditions

- A **bare condition word** toggles the condition (on if absent, off if present):
  `3 prone`, ` stunned`.
- **Optional duration** as a number before the word: `3 2 stun` = stun 2 rounds.
  No number → default 1 round.
- **`@` is an optional escape hatch**, never required: `@prone` *forces* the
  condition reading for the rare case a word collides with an action verb; bare
  `@` opens the condition picker.

### 2.5 Resolution & correction

- **`hit`** — upgrade an effect to a full hit (see §4). Per-target: `13 hit`;
  or ` hit` for the whole current target.
- **`undo`** — revert the last command (see §5).
- `save` / `miss` are **not commands** — they are the default outcome (§4).

### 2.6 Cheat-sheet

```
<who>  = digit-run (2, 123, 2233) · leading space = current target · 0 = self
<who> alone                 -> set sticky target, jump tab
<who> <num>                 -> action #num
<who> <num> <dmg-tags…>     -> amount, qualified      (2 10 melee slash)
<who> <num> <condition>     -> condition, num = duration (3 2 stun)
<who> <condition>           -> condition, default 1 round
<who> <verb>                -> action by name (fuzzy)
compound:  4 9 bludge 1 prone   -> 9 bludgeoning dmg + prone 1 round
hit   -> upgrade effect to full hit (13 hit · ␣hit)
undo  -> revert last command
@cond -> optional: force the condition reading;  bare @ -> condition picker
```

## 3. Target Model

`EncounterState` gains **`current_target: list[str]`** — a set of combatant ids
(`"0"` = self), `[]` = none. It is **sticky**: every `<who>`-bearing command updates
it, and it persists across turns until changed. It may be single or multi.

Untargeted commands (leading space / sigil / word) resolve to `current_target`.
There is **no separate "deselect" command** — targeting `0` (self) shows no arrow
(§6) and serves as the "nothing externally flagged" state.

## 4. Effect Lifecycle — "didn't land" by default, `hit` upgrades

An effect with an **uncertain** outcome (a saving-throw spell; an attack roll)
applies the **minimum** immediately:

- save-based → the save outcome (`half` or `none`, per the action's `save.on_save`)
- attack-roll → `0` (a miss)

This keeps the board moving without over-committing. Each affected combatant gets a
**pending-effect record** — `{source, full_amount, applied_amount, kind,
resolved: bool}` — and shows an **"unresolved" marker**.

- **`hit`** upgrades the pending effect on the targeted combatant(s) to the **full**
  amount (applies the remainder), and clears the marker. `13 hit` upgrades 1 and 3;
  ` hit` upgrades the whole current target.
- Doing nothing = the minimum already applied = a successful save / a miss. So
  `save` and `miss` need no command.
- The marker also auto-clears on round advance (a stale unresolved effect).

**Raw DM-typed damage** (`2 10 melee`) is *certain* — applied in full immediately,
with no pending record.

## 5. Undo — Memento (full-state snapshot)

Before every state-mutating command, snapshot `serialize_encounter(state)` onto an
undo stack (cap ~50). `undo` pops the stack and restores via
`deserialize_encounter`. Multi-level. **No redo** (YAGNI).

Memento is chosen over per-action inverse commands: `serialize_encounter` /
`deserialize_encounter` already exist, combat state is small, and a snapshot
handles compound effects, multi-target, and LLM-driven mutations uniformly with no
per-action inverse code. The snapshot stack doubles as the LLM correction context
(§7).

## 6. Targeting Indicator

A custom `QTabBar` subclass paints a small **red ▼** at the top edge of each tab
whose combatant is in `current_target`.

- Painted by the tab bar itself → **follows drag-reorder for free**, and updates
  with a single `update()` on every retarget.
- **Never drawn on the actor's own (active) tab** — so self-targeting (`0`) shows
  no arrow at all.
- Styled distinct from the selected-tab look, so it never reads as "this is the
  current tab."

A fully-floating overlay above the tab bar was rejected: it must re-sync on every
move/resize and lags during a drag (`position: absolute` does not translate to Qt).

## 7. LLM Escape Hatch

Any input the deterministic grammar cannot parse routes to the LLM, which receives:
the serialized `EncounterState`, the last *N* commands and their snapshots, and the
pending-effects table. It handles fuzzy corrections ("2 prev attack actually
missed"), undo of an older specific event, and anything off-grammar. Grammar = fast
path; LLM = long tail.

## 8. Components & Data Flow

- **`dispatcher.py`** — rewritten parser. `parse()` → `ParsedCommand{ target_ids:
  list[str], effects: list[Effect] }`, where `Effect` is one of `ActionRef`,
  `Amount`, `Condition`, `Resolution` (hit), `Undo`. Pure Python, no Qt.
- **`targeting.py`** *(new, pure)* — digit-run splitting, `<who>` resolution,
  current-target store helpers.
- **`command_tags.py`** — tag taxonomy; add damage-type aliases (`slash`, `pierce`,
  `bludge`, …).
- **`state.py`** — add `current_target`; drop `0` from `_id_alphabet()` so no
  combatant is ever assigned id `0`; add the pending-effects table.
- **`history.py`** *(new, pure)* — the memento undo stack and the pending-effect
  records.
- **`widgets/combat_tab_bar.py`** *(new)* — `QTabBar` subclass that paints the
  targeting arrow.
- **`main_window.py`** — wiring: snapshot → apply each effect to `EncounterState` →
  emit events on the bus → repaint tabs / markers / arrow → write the log line.

**Flow:** command input → `dispatcher.parse` → `ParsedCommand` → main_window
snapshots, then applies each `Effect` → event bus → UI repaint → log line.

## 9. Testing

**Pure-logic unit tests (no Qt):**
- digit-run splitting; `<who>` resolution incl. `0`/leading-space/multi-run
- number-meaning-by-following-tag (amount vs duration vs action #)
- compound parsing (`4 9 bludge 1 prone`); condition + duration
- action by number and by name
- the "damage-tag with no number" → error path

**Lifecycle tests:** minimum applied on an uncertain effect; `hit` upgrades to full
per-target; round-advance auto-clears a stale marker; raw damage applies in full.

**Undo tests:** snapshot/restore round-trip including compound and multi-target
commands.

**Qt tests (offscreen):** the targeting arrow paints on targeted tabs, never on the
actor's tab, and follows a drag-reorder.

## 10. Decisions & Rejected Alternatives

**Decided:** number-before-tag only · no default-1 for amounts · memento undo · `0`
= self with no separate deselect · default-didn't-land + a single `hit` upgrade ·
`@` optional · in-tab arrow paint.

**Rejected:** an `a<n>` action prefix · a backtick current-target token ·
per-action undo inverses · before-or-after number placement · a fully-general
"every tag takes a number, default 1" (damage-type/delivery tags are pure
qualifiers; default-1 for an amount is a footgun) · a floating overlay arrow.

## 11. Open Items (settle before / during planning)

- **Leading-space visibility:** the leading-space current-target form is invisible.
  Recommended mitigation — the command box shows a visible "current-target" cue
  when the input starts with a space. Not yet locked.
- **Damage-tag alias spelling:** finalize the alias list (`bludge` vs `bludgeon`,
  etc.).
- **Standalone `-N` / `+N`:** keep as a quick current-target shorthand, or drop now
  that the tag form supersedes them? Lean: keep as shorthand.
- **Pending-effect marker:** exact visual, and the precise round-advance
  auto-clear timing.

## Appendix — Worked examples (from the 20-example walkthrough)

```
2 8 melee slash   target 2, 8 melee slashing damage
2 2               target 2, run action #2
123 3             targets {1,2,3}, run action #3
2 save  ->  13 hit   (lifecycle: default=saved; `hit` the failures)
␣1                current target, action #1
undo              revert the last command
3 tail-sweep      target 3, action by name
6 12 heal         heal combatant 6 by 12
7 m3 6 melee      mob id 7, member 3, 6 melee damage
0                 self
0 2               self, action #2 (self-buff)
0123              targets {self,1,2,3}
3 2 stun          stun combatant 3 for 2 rounds
4 9 bludge 1 prone   9 bludgeoning damage + prone 1 round  (compound)
␣12 heal          heal the current target by 12
```
