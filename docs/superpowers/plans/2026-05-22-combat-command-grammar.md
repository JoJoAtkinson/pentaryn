# Combat Command Grammar Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the combat-runner GUI's directed-command grammar with the unified `<who> <stream>` grammar from the design spec — sticky multi-target, `0`=self, number-by-following-tag, compound effects, the didn't-land/`hit` lifecycle, memento undo, and an in-tab targeting arrow.

**Architecture:** A pure-Python parsing core (`targeting.py`, rewritten `dispatcher.py`) produces a `ParsedCommand` of `Effect`s. A pure-Python state/history layer (`history.py`, extended `state.py`) holds the sticky target, pending-effect records, and the memento undo stack. `main_window.py` wires parse → snapshot → apply → events → repaint → log. A `QTabBar` subclass paints the targeting arrow.

**Tech Stack:** Python 3.13+, PySide6, pytest (`QT_QPA_PLATFORM=offscreen` for Qt tests). Spec: `docs/superpowers/specs/2026-05-22-combat-command-grammar-design.md` — read it before starting.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `combat-runner/gui/command_tags.py` | modify | tag taxonomy — add damage-type aliases |
| `combat-runner/gui/targeting.py` | **create** | pure: digit-run splitting, `<who>` classification |
| `combat-runner/gui/command_model.py` | **create** | pure: `Effect` + `ParsedCommand` dataclasses (shared by dispatcher + main_window) |
| `combat-runner/gui/dispatcher.py` | rewrite | pure: parse `<who> <stream>` → `ParsedCommand` |
| `combat-runner/gui/history.py` | **create** | pure: `PendingEffect`, `UndoStack` (memento) |
| `combat-runner/gui/state.py` | modify | `current_target`, drop `0` from id alphabet, `pending_effects` |
| `combat-runner/gui/effects.py` | **create** | pure-ish: apply an `Effect` to `EncounterState` (the lifecycle) |
| `combat-runner/gui/widgets/combat_tab_bar.py` | **create** | `QTabBar` subclass — targeting arrow |
| `combat-runner/gui/main_window.py` | modify | wiring: dispatch, snapshot, apply, undo, indicator, logging |
| `combat-runner/gui/npc_tab.py` | modify | route the rewritten `ParsedCommand` |
| `combat-runner/tests/` | create | one test file per new module |

The old `ParsedInput`/`InputKind` in `dispatcher.py` is replaced by `command_model.py`'s types. `npc_tab.py` and `main_window.py` are the only consumers and are updated in Tasks 10–11.

---

## Phase 1 — Pure parsing core (no Qt)

### Task 1: Damage-type aliases

**Files:**
- Modify: `combat-runner/gui/command_tags.py` (the `type` facet, ~lines 25-43)
- Test: `combat-runner/tests/test_command_tags_aliases.py`

- [ ] **Step 1: Write the failing test**

```python
from gui.command_tags import resolve_tags

def test_physical_damage_aliases_resolve():
    for alias, canon in [("slash", "slashing"), ("pierce", "piercing"),
                         ("bludge", "bludgeoning"), ("bludgeon", "bludgeoning")]:
        resolved, errors = resolve_tags([alias])
        assert errors == [], f"{alias!r} should be a known tag"
        assert resolved.get("type") == canon

def test_canonical_type_still_resolves():
    resolved, _ = resolve_tags(["slashing"])
    assert resolved.get("type") == "slashing"
```

- [ ] **Step 2: Run — expect FAIL** (`slash` is an unknown tag today)

Run: `cd combat-runner && QT_QPA_PLATFORM=offscreen ../.venv/bin/python -m pytest tests/test_command_tags_aliases.py -q`

- [ ] **Step 3: Add aliases** in `command_tags.py` `TAG_FACETS["type"]["values"]`:

```python
"slashing":    {"aliases": ["slash"]},
"piercing":    {"aliases": ["pierce"]},
"bludgeoning": {"aliases": ["bludge", "bludgeon"]},
```

(Leave the other type values unchanged.)

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): damage-type aliases (slash/pierce/bludge)"`

---

### Task 2: `targeting.py` — digit-run splitting & `<who>` classification

**Files:**
- Create: `combat-runner/gui/targeting.py`
- Test: `combat-runner/tests/test_targeting.py`

The `<who>` token is the command's first whitespace-delimited token (or empty if the command starts with whitespace). This module is pure string logic — no state, no Qt.

- [ ] **Step 1: Write the failing test**

```python
from gui.targeting import split_runs, classify_who

def test_split_runs_single():
    assert split_runs("2") == ["2"]
    assert split_runs("22") == ["22"]
    assert split_runs("222") == ["222"]

def test_split_runs_multi():
    assert split_runs("123") == ["1", "2", "3"]
    assert split_runs("2233") == ["22", "33"]
    assert split_runs("122333") == ["1", "22", "333"]
    assert split_runs("0123") == ["0", "1", "2", "3"]

def test_classify_who_explicit_single():
    w = classify_who("2")
    assert w.mode == "explicit" and w.ids == ["2"]

def test_classify_who_explicit_multi():
    w = classify_who("123")
    assert w.mode == "explicit" and w.ids == ["1", "2", "3"]

def test_classify_who_self():
    w = classify_who("0")
    assert w.mode == "explicit" and w.ids == ["0"]   # "0" stays literal; resolved later

def test_classify_who_current_when_empty():
    # leading whitespace -> empty first token -> current target
    w = classify_who("")
    assert w.mode == "current" and w.ids == []

def test_classify_who_non_digit_is_current():
    # a who token that isn't all digits (e.g. starts with a sigil/word) -> current
    w = classify_who("@prone")
    assert w.mode == "current"
```

- [ ] **Step 2: Run — expect FAIL** (module missing)

- [ ] **Step 3: Implement `targeting.py`**

```python
"""Pure <who>-token logic for the combat command grammar. No Qt, no state."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_ALL_DIGITS = re.compile(r"^\d+$")


def split_runs(digits: str) -> list[str]:
    """Split a digit string into maximal same-digit runs.
    '123' -> ['1','2','3']; '2233' -> ['22','33']; '222' -> ['222']."""
    runs: list[str] = []
    for ch in digits:
        if runs and runs[-1][0] == ch:
            runs[-1] += ch
        else:
            runs.append(ch)
    return runs


@dataclass
class Who:
    """Classified <who> token. `ids` may contain '0' (self) — resolved later."""
    mode: str  # "explicit" | "current"
    ids: list[str] = field(default_factory=list)


def classify_who(token: str) -> Who:
    """Classify the first token of a command.
    All-digits -> explicit target(s) via run-splitting.
    Empty (leading whitespace) or anything else -> the current target."""
    token = token.strip()
    if token and _ALL_DIGITS.match(token):
        return Who(mode="explicit", ids=split_runs(token))
    return Who(mode="current", ids=[])
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): targeting.py — digit-run who-token logic"`

---

### Task 3: `command_model.py` — `Effect` & `ParsedCommand`

**Files:**
- Create: `combat-runner/gui/command_model.py`
- Test: `combat-runner/tests/test_command_model.py` (a trivial construction smoke test)

These dataclasses are the contract between the dispatcher and `main_window`. Define them once, here.

- [ ] **Step 1: Write the smoke test**

```python
from gui.command_model import Effect, ParsedCommand

def test_effect_and_command_construct():
    e = Effect(kind="amount", amount=8, amount_tags={"type": "slashing"})
    c = ParsedCommand(kind="command", target_ids=["2"], effects=[e], raw="2 8 slash")
    assert c.effects[0].amount == 8
    assert c.use_current is False
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `command_model.py`**

```python
"""Parsed-command data model — the contract between dispatcher and main_window."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

EffectKind = Literal["action", "amount", "condition", "hit", "undo"]


@dataclass
class Effect:
    """One effect group parsed from a command's <stream>."""
    kind: EffectKind
    # kind == "action"
    action_token: str = ""              # "2" (panel #) or "cleave" (name)
    # kind == "amount"
    amount: int = 0
    amount_tags: dict[str, str] = field(default_factory=dict)  # facet -> canonical
    # kind == "condition"
    condition: str = ""
    duration: int | None = None         # None -> caller applies default (1 round)
    forced_condition: bool = False      # True when written with the @ escape hatch
    # kind in ("hit", "undo") -> no extra fields


CommandKind = Literal["command", "set_target", "unparseable"]


@dataclass
class ParsedCommand:
    kind: CommandKind
    raw: str = ""
    target_ids: list[str] = field(default_factory=list)  # explicit ids; may contain "0"
    use_current: bool = False           # True when <who> resolved to the current target
    effects: list[Effect] = field(default_factory=list)
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): command_model.py — Effect/ParsedCommand"`

---

### Task 4: `dispatcher.py` — the `<who> <stream>` parser

**Files:**
- Rewrite: `combat-runner/gui/dispatcher.py`
- Test: `combat-runner/tests/test_dispatcher_grammar.py`

Parsing algorithm:
1. Strip-detect: if the raw input starts with whitespace → `use_current=True`. Tokenize on whitespace.
2. First token → `classify_who`. `explicit` → `target_ids`; `current` → `use_current=True`.
3. If no tokens remain after `<who>` → `kind="set_target"` (unless `use_current` with nothing, which is `unparseable`).
4. Walk the remaining `<stream>` tokens left to right into `Effect`s:
   - bare word `undo` → `Effect("undo")`; `hit` → `Effect("hit")`.
   - `m<n>` → attach as a mob-member modifier on the *next* amount effect (store on the Effect as `member: int | None` — add that field to `Effect`).
   - a **number**: look at the next token.
     - next is a damage-tag (resolves via `command_tags.resolve_tags` to a non-empty facet) → start an `amount` Effect: consume the number as `amount`, consume following damage-tag tokens into `amount_tags` until the next number / condition / end.
     - next is a condition word (in `STANDARD_CONDITIONS`, or `@`-prefixed) → `condition` Effect with `duration=<number>`.
     - next is nothing / another number → `action` Effect with `action_token=<number>`.
   - a **condition word** (bare or `@`-prefixed) with no preceding number → `condition` Effect, `duration=None`.
   - a **non-number, non-condition word** → `action` Effect with `action_token=<word>` (action-by-name).
   - a **damage-tag with no leading number** → the command is `unparseable` (→ LLM).
5. Anything that doesn't fit → `kind="unparseable"`.

Add `member: int | None = None` to `Effect` in `command_model.py` (update Task 3's file + its test if already executed — note for the executor).

- [ ] **Step 1: Write the failing tests**

```python
from gui.dispatcher import parse

def _eff(cmd, i): return cmd.effects[i]

def test_set_target_single():
    c = parse("2")
    assert c.kind == "set_target" and c.target_ids == ["2"]

def test_set_target_multi():
    c = parse("123")
    assert c.kind == "set_target" and c.target_ids == ["1", "2", "3"]

def test_action_by_number():
    c = parse("2 2")
    assert c.kind == "command" and c.target_ids == ["2"]
    assert _eff(c, 0).kind == "action" and _eff(c, 0).action_token == "2"

def test_action_by_name():
    c = parse("3 cleave")
    assert _eff(c, 0).kind == "action" and _eff(c, 0).action_token == "cleave"

def test_amount_with_tags():
    c = parse("2 8 melee slash")
    e = _eff(c, 0)
    assert e.kind == "amount" and e.amount == 8
    assert e.amount_tags.get("type") == "slashing"
    assert e.amount_tags.get("delivery") == "melee"

def test_condition_with_duration():
    c = parse("3 2 stun")
    e = _eff(c, 0)
    assert e.kind == "condition" and e.condition == "stun" and e.duration == 2

def test_condition_no_duration_defaults_none():
    e = _eff(parse("3 prone"), 0)
    assert e.kind == "condition" and e.condition == "prone" and e.duration is None

def test_compound_amount_then_condition():
    c = parse("4 9 bludge 1 prone")
    assert _eff(c, 0).kind == "amount" and _eff(c, 0).amount == 9
    assert _eff(c, 0).amount_tags.get("type") == "bludgeoning"
    assert _eff(c, 1).kind == "condition" and _eff(c, 1).condition == "prone"
    assert _eff(c, 1).duration == 1

def test_use_current_leading_space():
    c = parse(" 1")
    assert c.use_current is True
    assert _eff(c, 0).kind == "action" and _eff(c, 0).action_token == "1"

def test_self_token():
    c = parse("0 2")
    assert c.target_ids == ["0"]
    assert _eff(c, 0).kind == "action"

def test_hit_and_undo():
    assert _eff(parse("13 hit"), 0).kind == "hit"
    assert parse("undo").effects[0].kind == "undo"

def test_damage_tag_without_number_is_unparseable():
    assert parse("2 melee").kind == "unparseable"

def test_mob_member_attaches_to_amount():
    e = _eff(parse("7 m3 6 melee"), 0)
    assert e.kind == "amount" and e.amount == 6 and e.member == 3

def test_condition_at_escape_hatch():
    e = _eff(parse("3 @prone"), 0)
    assert e.kind == "condition" and e.condition == "prone" and e.forced_condition is True

def test_garbage_is_unparseable():
    assert parse("hello there friend").kind == "unparseable"
```

- [ ] **Step 2: Run — expect FAIL** (`parse` not defined)

- [ ] **Step 3: Implement `parse()`** in `dispatcher.py` per the algorithm above. Use `gui.targeting.classify_who`, `gui.command_tags.resolve_tags`, and `gui.state.STANDARD_CONDITIONS`. Keep it a module-level `parse(raw: str) -> ParsedCommand` function (drop the old `Dispatcher` class / `ParsedInput` / `InputKind`). Pure — no Qt, no state, no LLM. A token resolves as a "damage-tag" if `resolve_tags([token])` returns a non-empty `resolved` dict with no errors; as a "condition" if it's in `STANDARD_CONDITIONS` (strip a leading `@`); both lookups are case-insensitive.

- [ ] **Step 4: Run — expect PASS** for every test above. Iterate until green.

- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): rewrite dispatcher as <who> <stream> parser"`

---

## Phase 2 — State & history (no Qt)

### Task 5: `state.py` — current target, id alphabet, pending list

**Files:**
- Modify: `combat-runner/gui/state.py`
- Test: `combat-runner/tests/test_state_targeting.py`

- [ ] **Step 1: Write the failing test**

```python
from gui.state import EncounterState, NPCState, _id_alphabet
from itertools import islice

def test_id_alphabet_excludes_zero():
    first_ten = list(islice(_id_alphabet(), 10))
    assert "0" not in first_ten
    assert first_ten[:9] == list("123456789")
    assert first_ten[9] == "11"

def _es():
    return EncounterState(name="t", root=__import__("pathlib").Path("."),
                          log_path=__import__("pathlib").Path("log.md"))

def test_current_target_defaults_empty():
    assert _es().current_target == []

def test_current_target_is_settable():
    es = _es()
    es.current_target = ["1", "2", "3"]
    assert es.current_target == ["1", "2", "3"]
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Modify `state.py`**
  - In `_id_alphabet()`: change the digit string `"1234567890"` → `"123456789"` (no `0`).
  - Add to `EncounterState`: `current_target: list[str] = field(default_factory=list)`.
  - Add to `EncounterState`: `pending_effects: list = field(default_factory=list)` (typed `list[PendingEffect]` once `history.py` exists — leave untyped or use `"PendingEffect"` forward ref to avoid an import cycle).
  - Add `current_target` and `pending_effects` to `serialize_encounter` / `deserialize_encounter` (so undo snapshots round-trip them). `pending_effects` serializes via `dataclasses.asdict`.

- [ ] **Step 4: Run — expect PASS**. Also run the full existing state tests: `cd combat-runner && QT_QPA_PLATFORM=offscreen ../.venv/bin/python -m pytest tests/ -m 'not scenario' -q -k state` — fix any serialization-roundtrip breakage.
- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): EncounterState current_target + id alphabet drops 0"`

---

### Task 6: `history.py` — `PendingEffect` & `UndoStack`

**Files:**
- Create: `combat-runner/gui/history.py`
- Test: `combat-runner/tests/test_history.py`

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path
from gui.history import PendingEffect, UndoStack
from gui.state import EncounterState, NPCState

def _es():
    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    es.npcs.append(NPCState(slug="g", name="Goblin", max_hp=10, ac=12, speed="30", cr=1))
    return es

def test_pending_effect_fields():
    p = PendingEffect(combatant_id="2", full_amount=12, applied_amount=6, kind="save")
    assert p.resolved is False

def test_undo_round_trip():
    es = _es()
    stack = UndoStack()
    stack.snapshot(es)                       # snapshot the 10-hp state
    es.npcs[0].member_hp[0] = 3              # mutate
    restored = stack.undo()                  # -> EncounterState restored to 10
    assert restored is not None
    assert restored.npcs[0].member_hp[0] == 10

def test_undo_empty_returns_none():
    assert UndoStack().undo() is None

def test_undo_is_multi_level():
    es = _es()
    stack = UndoStack()
    stack.snapshot(es); es.npcs[0].member_hp[0] = 8
    stack.snapshot(es); es.npcs[0].member_hp[0] = 5
    assert stack.undo().npcs[0].member_hp[0] == 8   # back one
    assert stack.undo().npcs[0].member_hp[0] == 10  # back two

def test_undo_stack_caps():
    es = _es()
    stack = UndoStack(cap=3)
    for _ in range(10):
        stack.snapshot(es)
    assert len(stack._snapshots) == 3
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `history.py`**

```python
"""Pending-effect records + memento undo stack. Pure Python."""
from __future__ import annotations

from dataclasses import dataclass
from gui.state import EncounterState, deserialize_encounter, serialize_encounter


@dataclass
class PendingEffect:
    """An applied-but-unconfirmed effect, kept so `hit` can upgrade it."""
    combatant_id: str
    full_amount: int
    applied_amount: int
    kind: str            # "save" | "attack"
    resolved: bool = False


class UndoStack:
    """Memento undo: a LIFO of full encounter snapshots (serialized dicts)."""

    def __init__(self, cap: int = 50) -> None:
        self._cap = cap
        self._snapshots: list[dict] = []

    def snapshot(self, state: EncounterState) -> None:
        self._snapshots.append(serialize_encounter(state))
        if len(self._snapshots) > self._cap:
            self._snapshots.pop(0)

    def undo(self) -> EncounterState | None:
        """Pop the most recent snapshot and rebuild it. None if empty."""
        if not self._snapshots:
            return None
        return deserialize_encounter(self._snapshots.pop())
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): history.py — PendingEffect + memento UndoStack"`

---

## Phase 3 — Effect application & lifecycle (no Qt)

### Task 7: `effects.py` — apply an `Effect` to state

**Files:**
- Create: `combat-runner/gui/effects.py`
- Test: `combat-runner/tests/test_effects.py`

`apply_effect` is the single place an `Effect` mutates `EncounterState`. It returns a list of human-readable log fragments. It does NOT snapshot (the caller does, before the whole command) and does NOT touch Qt.

Resolution of `target_ids`: `"0"` → the active NPC's id; `use_current` → `state.current_target`. The caller passes the already-resolved concrete id list to `apply_effect`, plus the active NPC for action sourcing.

- [ ] **Step 1: Write the failing tests**

```python
from pathlib import Path
from gui.state import EncounterState, NPCState
from gui.command_model import Effect
from gui.effects import apply_effect

def _es():
    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    es.npcs.append(NPCState(slug="m", name="Marwen", max_hp=32, ac=15, speed="30",
                            cr=5, kind="pc", id="2"))
    return es

def test_amount_applies_damage():
    es = _es()
    apply_effect(es, Effect(kind="amount", amount=8, amount_tags={"type": "slashing"}),
                 target_ids=["2"], actor=None)
    assert es.combatant_by_id("2").hp == 24

def test_amount_heal_via_direction_tag():
    es = _es(); es.combatant_by_id("2").member_hp[0] = 10
    apply_effect(es, Effect(kind="amount", amount=12, amount_tags={"direction": "heal"}),
                 target_ids=["2"], actor=None)
    assert es.combatant_by_id("2").hp == 22

def test_condition_applies_with_duration():
    es = _es()
    apply_effect(es, Effect(kind="condition", condition="stun", duration=2),
                 target_ids=["2"], actor=None)
    npc = es.combatant_by_id("2")
    assert "stunned" in npc.conditions
    assert npc.condition_durations.get("stunned") == 2

def test_condition_default_duration_one():
    es = _es()
    apply_effect(es, Effect(kind="condition", condition="prone", duration=None),
                 target_ids=["2"], actor=None)
    assert es.combatant_by_id("2").condition_durations.get("prone") == 1

def test_condition_toggles_off():
    es = _es(); es.combatant_by_id("2").conditions.add("prone")
    apply_effect(es, Effect(kind="condition", condition="prone"),
                 target_ids=["2"], actor=None)
    assert "prone" not in es.combatant_by_id("2").conditions

def test_amount_multi_target():
    es = _es()
    es.npcs.append(NPCState(slug="b", name="Bazgar", max_hp=49, ac=18, speed="30",
                            cr=5, kind="pc", id="1"))
    apply_effect(es, Effect(kind="amount", amount=3, amount_tags={"type": "poison"}),
                 target_ids=["1", "2"], actor=None)
    assert es.combatant_by_id("1").hp == 46
    assert es.combatant_by_id("2").hp == 29
```

Notes for the implementer:
- Condition-name normalization: the grammar word `stun` maps to the catalog name `stunned`. Add a small alias map in `effects.py` (`stun→stunned`, `frighten→frightened`, etc.) or accept both — keep a `_CONDITION_ALIASES` dict; if the word isn't a known condition after aliasing, no-op + log a warning fragment.
- `direction` tag `heal` → `apply_heal`; otherwise → `apply_damage`. `dmg` is the `damage` direction default.
- `action` and `hit` effects are handled in Task 8 — for now `apply_effect` may raise `NotImplementedError` for `kind in ("action","hit","undo")` (Task 8 / Task 10 fill them).

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement `apply_effect`** for `kind in ("amount","condition")` per the tests.
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): effects.py — apply amount/condition effects"`

---

### Task 8: Lifecycle — pending effects & the `hit` upgrade

**Files:**
- Modify: `combat-runner/gui/effects.py`
- Test: `combat-runner/tests/test_effects_lifecycle.py`

An action with an uncertain outcome applies the **minimum** and records a `PendingEffect`. `hit` upgrades. The action invocation itself (calling `roll_combat_action`) is wired in Task 10; here, model the lifecycle with a helper `apply_uncertain_damage(state, combatant_id, full_amount, kind, on_save)` and `apply_hit(state, target_ids)`.

- [ ] **Step 1: Write the failing tests**

```python
from pathlib import Path
from gui.state import EncounterState, NPCState
from gui.effects import apply_uncertain_damage, apply_hit

def _es():
    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    es.npcs.append(NPCState(slug="m", name="Marwen", max_hp=32, ac=15, speed="30",
                            cr=5, kind="pc", id="2"))
    return es

def test_uncertain_save_applies_half():
    es = _es()
    apply_uncertain_damage(es, "2", full_amount=20, kind="save", on_save="half")
    assert es.combatant_by_id("2").hp == 22          # 32 - 10 (half)
    assert len(es.pending_effects) == 1
    p = es.pending_effects[0]
    assert p.applied_amount == 10 and p.full_amount == 20 and p.resolved is False

def test_uncertain_attack_applies_zero():
    es = _es()
    apply_uncertain_damage(es, "2", full_amount=15, kind="attack", on_save="none")
    assert es.combatant_by_id("2").hp == 32          # nothing applied yet

def test_hit_upgrades_to_full():
    es = _es()
    apply_uncertain_damage(es, "2", full_amount=20, kind="save", on_save="half")
    apply_hit(es, ["2"])
    assert es.combatant_by_id("2").hp == 12          # the remaining 10 now applied
    assert es.pending_effects[0].resolved is True

def test_hit_only_targets_named():
    es = _es()
    es.npcs.append(NPCState(slug="b", name="Bazgar", max_hp=49, ac=18, speed="30",
                            cr=5, kind="pc", id="1"))
    apply_uncertain_damage(es, "1", full_amount=20, kind="save", on_save="half")
    apply_uncertain_damage(es, "2", full_amount=20, kind="save", on_save="half")
    apply_hit(es, ["1"])                             # only Bazgar failed
    assert es.combatant_by_id("1").hp == 49 - 20     # full
    assert es.combatant_by_id("2").hp == 32 - 10     # still the assumed save
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement** `apply_uncertain_damage` (applies `half`/`none`/`0` per `on_save`+`kind`, appends a `PendingEffect`) and `apply_hit` (for each target id, find the latest unresolved `PendingEffect`, apply `full_amount - applied_amount` more damage, mark `resolved=True`).
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): didn't-land lifecycle + hit upgrade"`

---

## Phase 4 — UI

### Task 9: `combat_tab_bar.py` — the targeting arrow

**Files:**
- Create: `combat-runner/gui/widgets/combat_tab_bar.py`
- Test: `combat-runner/tests/test_combat_tab_bar.py`

A `QTabBar` subclass. It holds a set of "targeted" tab indices and an "actor" tab index, and in `paintEvent` draws a small red downward triangle at the top edge of each targeted tab — except the actor's tab.

- [ ] **Step 1: Write the failing test** (offscreen Qt)

```python
import os
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
from PySide6.QtWidgets import QApplication
from gui.widgets.combat_tab_bar import CombatTabBar

_app = QApplication.instance() or QApplication([])

def test_set_targeted_indices_triggers_repaint():
    bar = CombatTabBar()
    for n in ("A", "B", "C"):
        bar.addTab(n)
    bar.set_targeting(targeted={1, 2}, actor=0)
    assert bar._targeted == {1, 2}
    assert bar._actor == 0

def test_actor_excluded_from_targeted_paint_set():
    bar = CombatTabBar()
    for n in ("A", "B"):
        bar.addTab(n)
    bar.set_targeting(targeted={0, 1}, actor=0)
    # the paint set excludes the actor's own tab
    assert bar.arrow_indices() == {1}
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement `CombatTabBar(QTabBar)`** — `set_targeting(targeted: set[int], actor: int)` stores both and calls `self.update()`; `arrow_indices()` returns `self._targeted - {self._actor}`; `paintEvent` calls `super().paintEvent` then, for each index in `arrow_indices()`, draws a small red filled triangle (▼) centered on the top edge of `self.tabRect(i)` using `QPainter`. Keep the triangle ~8px wide so it isn't overwhelming.
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): CombatTabBar — targeting arrow"`

---

### Task 10: Wire the new grammar into `main_window.py` / `npc_tab.py`

**Files:**
- Modify: `combat-runner/gui/main_window.py`
- Modify: `combat-runner/gui/npc_tab.py`
- Test: `combat-runner/tests/test_main_window_grammar.py`

This task replaces the old `ParsedInput`/`InputKind` dispatch with the new `parse()` → `ParsedCommand` flow. Read `npc_tab.py:480-710` and `main_window.py:965-1078` first — those are the current dispatch sites.

Behavior to wire:
1. `npc_tab` command submit → `dispatcher.parse(text)` → emit the `ParsedCommand` to `main_window` (replace the existing directed-command signal payload).
2. `main_window` handler `_on_command(cmd: ParsedCommand)`:
   - `kind == "unparseable"` → existing LLM-fallback path (Task 11 enriches the context).
   - **Snapshot first:** `self.undo_stack.snapshot(self.encounter_state)`.
   - `kind == "set_target"` → resolve `target_ids` (`"0"`→active id), set `encounter_state.current_target`, jump to the (first) tab, refresh the arrow, log `"<name(s)> is now the target"`.
   - `kind == "command"`:
     - resolve targets: `target_ids` (`"0"`→active), or `current_target` if `use_current`.
     - if a `command` carries explicit `target_ids` (not `use_current`) → also set `current_target` to them (sticky).
     - for each `Effect`: `effect.kind == "undo"` → `restored = self.undo_stack.undo()`; swap in the restored state, repaint, log. Else `apply_effect(...)` / `apply_hit(...)`; for `kind == "action"` resolve the panel number/name against the active NPC's actions and run it via the existing `roll_combat_action` path; an action with a `save` block routes its damage through `apply_uncertain_damage`.
   - after applying: emit the relevant events on the event bus (so triggers/watches/HP bars update — reuse `damage_event`/`heal_event`/`condition_event`), repaint tabs, refresh the arrow, append the log line(s).
3. Replace the `QTabBar` on the `QTabWidget` with `CombatTabBar` (`self.tabs.setTabBar(CombatTabBar())`), and add `_refresh_target_arrow()` that maps `current_target` ids → tab indices and calls `tab_bar.set_targeting(...)` with the active tab as `actor`. Call it after every command and on tab change/reorder.
4. `EncounterState` gains an `UndoStack` instance held on `MainWindow` (`self.undo_stack = UndoStack()`).

- [ ] **Step 1: Write the failing tests** (offscreen; construct a `MainWindow` with a small encounter — follow the harness in `tests/test_main_window_native_reorder.py`)

```python
# test cases (translate each into a test using the existing MainWindow test harness):
# - submitting "2 8 slash" damages combatant id 2 by 8
# - submitting "2" sets encounter_state.current_target == ["2"] and shows the arrow on tab 2
# - submitting " 1" with current_target ["2"] runs action 1 against combatant 2
# - submitting "undo" after a damage command restores the prior HP
# - submitting "123 3 poison" damages all of ids 1,2,3
# - the targeting arrow appears on targeted tabs and never on the active/actor tab
# - an unparseable input ("do something weird") routes to the LLM fallback
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement the wiring** per the behavior list. Delete the dead `ParsedInput`/`InputKind` code paths in `npc_tab.py` and `main_window.py`. Update `combat-runner/gui/README.md`'s grammar section to the new cheat-sheet.
- [ ] **Step 4: Run** the new tests AND the full GUI suite: `cd combat-runner && QT_QPA_PLATFORM=offscreen ../.venv/bin/python -m pytest tests/ -m 'not scenario' -q`. All green; fix regressions.
- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): wire <who> <stream> grammar into the GUI"`

---

### Task 11: LLM escape-hatch context enrichment

**Files:**
- Modify: `combat-runner/gui/main_window.py` (the `_on_llm_fallback` path) and `combat-runner/gui/llm_controller.py`
- Test: `combat-runner/tests/test_llm_context.py`

When input is `unparseable`, the LLM call must receive: the serialized `EncounterState`, the last N (=10) raw commands, and the `pending_effects` table — so it can handle fuzzy corrections and older-event undo.

- [ ] **Step 1: Write the failing test**

```python
# Build the context payload via a pure helper and assert it contains the pieces.
from gui.llm_controller import build_correction_context  # new pure helper

def test_correction_context_has_state_history_pending():
    ctx = build_correction_context(state_dict={"npcs": []},
                                   recent_commands=["2 8 slash", "undo"],
                                   pending=[{"combatant_id": "2", "full_amount": 9}])
    assert "npcs" in ctx["state"]
    assert ctx["recent_commands"][-1] == "undo"
    assert ctx["pending"][0]["combatant_id"] == "2"
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement** `build_correction_context(...)` (pure dict assembly) in `llm_controller.py`; have `MainWindow` keep a rolling list of the last 10 raw command strings and pass `build_correction_context(serialize_encounter(state), recent, [asdict(p) for p in state.pending_effects])` into the LLM fallback call.
- [ ] **Step 4: Run — expect PASS**, then the full GUI suite once more (`-m 'not scenario'`).
- [ ] **Step 5: Commit** — `git commit -m "feat(combat-grammar): enrich LLM fallback with state+history context"`

---

## Final verification

- [ ] Run the whole GUI suite: `cd combat-runner && QT_QPA_PLATFORM=offscreen ../.venv/bin/python -m pytest tests/ -q` — including scenarios. All green.
- [ ] Manually walk 5–6 rows from the design spec's 50-example table against the running app (`make prime`).
- [ ] Confirm `combat-runner/gui/README.md` documents the new grammar.

---

## Self-Review (completed by plan author)

**Spec coverage:** §2 grammar → Tasks 1–4. §3 target model → Tasks 5, 10. §4 lifecycle → Tasks 7–8. §5 undo → Tasks 6, 10. §6 targeting arrow → Tasks 9–10. §7 LLM escape hatch → Task 11. §8 components → matches the File Structure table. §9 testing → each task is TDD. §11 open items: leading-space visibility cue is intentionally *deferred* (not in this plan — flagged for a follow-up); `-N`/`+N` shorthand is *not* implemented (the tag form supersedes it — noted as a deliberate omission).

**Type consistency:** `Effect`/`ParsedCommand` defined once in Task 3 (`command_model.py`); Task 4 adds `Effect.member`; all later tasks consume those names. `apply_effect`, `apply_uncertain_damage`, `apply_hit`, `UndoStack.snapshot/undo`, `CombatTabBar.set_targeting/arrow_indices`, `build_correction_context` — each defined in one task and referenced consistently.

**Known follow-ups (out of scope):** the leading-space "current-target" visible cue (spec §11); `-N`/`+N` standalone shorthand.
