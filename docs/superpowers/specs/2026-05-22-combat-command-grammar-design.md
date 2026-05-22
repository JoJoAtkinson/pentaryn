# Combat Runner — At-Table Command Grammar Overhaul

**Status:** Implemented (2026-05-22). **Superseded in part** — see §10
"Post-design decisions" for the follow-up changes that diverge from this design.
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
- **Leading whitespace** is stripped before parsing — it is not a grammar
  token. (The GUI command box converts a leading Space on an empty box into a
  current-target id autocomplete; see §11.)
- **Leading sigil or word** (`-`, `+`, `@`, or a bare word like `prone`/`hit`) →
  also the current target (no explicit `<who>`).

A `<who>` token **alone** (digits, nothing after) sets the sticky current target
and logs e.g. *"Marwen is now the target."* It does **not** switch tabs — the
active tab is the actor; the target's tab gets the ▼ arrow (see §6, §10).

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
- **`poison` is not a damage type.** By DM decision (see §10) `poison` always
  parses as the `poisoned` *condition*; poison-typed damage is not expressible.
- **Compound effects chain in one command:** `4 9 bludge 1 prone` = 9 bludgeoning
  damage **and** prone for 1 round.

### 2.3 Actions

- **By number:** `<who> <n>` — `n` is a left-panel hotkey number. The active
  NPC's own actions number 1, 2, 3, …; global/universal actions get fixed
  numbers from 111 (see §10). Each chip displays its number.
- **By name:** `<who> <verb>` — fuzzy-matched against the active NPC's actions
  (the "I don't recall the number" fallback).
- **Untargeted:** a leading sigil/word stream (no `<who>`) → action at the
  current target. (A leading Space is a GUI prefill, not parser input — see §11.)
- An action is **self-contained** — it rolls its own damage and applies its own
  riders (conditions, etc.). It is never tagged in the command.

### 2.4 Conditions

- A **bare condition word** toggles the condition (on if absent, off if present):
  `3 prone`, ` stunned`.
- **Optional duration** as a number before the word: `3 2 stun` = stun 2 rounds.
  No number → default 1 round.
- **`@` is an optional escape hatch**, never required: `@prone` *forces* the
  condition reading for the rare case a word collides with an action verb.
  (Bare `@` is currently `unparseable` — a condition picker is a known unbuilt
  gap, see §11.)

### 2.5 Resolution & correction

- **`hit`** — upgrade an effect to a full hit (see §4). Per-target: `13 hit`;
  or ` hit` for the whole current target.
- **`undo`** — revert the last command (see §5).
- **`save` / `miss`** — the explicit lifecycle counterpart of `hit`: confirm
  the assumed minimum (already applied at action time), mark the pending
  effect resolved, and log the outcome ("Bazgar saved against frost ray").
  Doing nothing also works — the assumed-minimum is applied either way and
  round-advance auto-clears — but the explicit verb gives the DM a log line.
  Per-target like `hit`: `13 save` resolves combatants 1 and 3.

### 2.6 Cheat-sheet

```
<who>  = digit-run (2, 123, 2233) · leading sigil/word = current target · 0 = self
<who> alone                 -> set sticky target (no tab switch)
<who> <num>                 -> action #num
<who> <num> <dmg-tags…>     -> amount, qualified      (2 10 melee slash)
<who> <num> <condition>     -> condition, num = duration (3 2 stun)
<who> <condition>           -> condition, default 1 round
<who> <verb>                -> action by name (fuzzy)
compound:  4 9 bludge 1 prone   -> 9 bludgeoning dmg + prone 1 round
hit   -> upgrade effect to full hit (13 hit · ' hit' for the current target)
undo  -> revert last command
@cond -> optional: force the condition reading
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
- Doing nothing = the minimum already applied = a successful save / a miss
  (round-advance auto-clears the pending record). The DM can also type
  **`save`** or **`miss`** to explicitly resolve and log the outcome (the
  lifecycle counterpart of `hit` — no further HP change, just confirmation).
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

- **`dispatcher.py`** — the parser; `parse()` → `ParsedCommand`. Pure Python, no Qt.
- **`command_model.py`** *(new)* — the `Effect` / `ParsedCommand` dataclasses.
  `Effect` is one dataclass tagged by `kind ∈ {action, amount, condition, hit,
  undo}` (not five subclasses) and carries a `members: list[int] | None` field
  for the `m<...>` mob-member modifier.
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

### Post-design decisions (2026-05-22 follow-up)

Changes made after this spec was approved, during implementation and review.
They diverge from the design above; this section is the authoritative record.

- **`poison` → `poisoned` condition, not a damage type.** Poison-typed damage
  is not expressible; `2 8 poison` is *poisoned for 8 rounds*.
- **Leading Space → GUI autocomplete, not a grammar token.** The parser strips
  all whitespace; a leading Space on an empty command box auto-inserts the
  current-target id(s). The current target is reached in the grammar by a
  leading sigil/word only.
- **Multi-member mob targeting:** `m<n>` / `m12` (digit-run set) / `m` alone
  (all alive members) — `Effect.members: list[int] | None`.
- **Member-scoped conditions are rejected** at the applier — conditions apply
  to the whole mob/tab.
- **An `m<...>` modifier before an action / `hit` / `undo` is `unparseable`** —
  the mob-member selector only scopes an amount or a condition.
- **The didn't-land / `hit` lifecycle is wired end to end** — actions run on
  the actor's tab and route uncertain damage to the target id.
- **Input normalization:** digit→letter glue (`8melee` → `8 melee`),
  internal-whitespace collapse, single trailing-punctuation strip.
- **Action context fed to the LLM reviewer** — the resolved action name/spec
  rides into the review payload.
- **Suggestion-panel numbers** — each left-panel action suggestion shows its
  1-based hotkey number.
- **`bloodied` cannot be set as a DM condition** — it is auto-tracked from HP.
- **A bare `set_target` does not switch tabs.** The active tab is the actor;
  you set a target to then act on it from the actor's tab. The target's tab
  gets the ▼ arrow, and the "now the target" log line stays on the actor's tab.
- **Action panel numbering.** Each action chip shows its hotkey number. An
  NPC's own actions number 1, 2, 3, …; global/universal actions get fixed
  numbers from 111 (`111`, `112`, …) — the same on every combatant's tab, and
  clear of any NPC's 1..N so the ranges never collide. (`gui/action_numbering`.)

## 11. Open Items

- **Leading-space visibility:** *RESOLVED* — the leading Space became a GUI
  command-box autocomplete on an empty box (`command_input.py`); it is no
  longer a grammar token.
- **Damage-tag alias spelling:** *RESOLVED* — alias list finalized in
  `command_tags.py` (`bludge`/`bludgeon`, `pierce`, `slash`, …).
- **Standalone `-N` / `+N`:** *RESOLVED* — dropped; the `<num> <tag>` amount
  form supersedes them.
- **Pending-effect marker:** *RESOLVED* — an unresolved pending effect appends
  a `" ?"` suffix to the tab title; round-advance auto-clears stale markers.
- **Condition picker:** bare `@` currently parses as `unparseable` — a
  condition picker was specified (§2.4) but not built. Known gap.

## Appendix — Worked examples (from the 20-example walkthrough)

```
2 8 melee slash   target 2, 8 melee slashing damage
2 2               target 2, run action #2
123 3             targets {1,2,3}, run action #3
13 hit            lifecycle: an uncertain effect applies the minimum (a
                  save/miss); `hit` upgrades the failures (here #1 and #3)
 1                current target, action #1   (Space on an empty box prefills)
undo              revert the last command
3 tail-sweep      target 3, action by name
6 12 heal         heal combatant 6 by 12
7 m3 6 melee      mob id 7, member 3, 6 melee damage
0                 self
0 2               self, action #2 (self-buff)
0123              targets {self,1,2,3}
3 2 stun          stun combatant 3 for 2 rounds
4 9 bludge 1 prone   9 bludgeoning damage + prone 1 round  (compound)
 12 heal          heal the current target by 12
```
