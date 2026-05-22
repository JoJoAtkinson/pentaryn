---
created: 2026-05-22
spec: docs/superpowers/specs/2026-05-21-combat-runner-players-design.md
status: ready
tags: ["#plan", "#combat-runner"]
---

# Combat Runner — Players as First-Class Combatants: Implementation Plan

## Reading guide

This plan is self-contained. An agent executing it needs no prior context beyond
the files listed here. Read the spec at the path above and the files in each
task before writing code.

**Repo root:** `/path/to/dnd` (wherever the repo is checked out)  
**Working directory for all file paths:** repo root unless otherwise noted  
**Test runner:** `make combat-test` (runs pytest under `QT_QPA_PLATFORM=offscreen`)  
**Test directory:** `combat-runner/tests/`  
**Import root:** `PYTHONPATH=combat-runner` — so `from gui.state import …` works

Do **not** modify files under `combat-runner/` until you reach the phase where
that file is listed. All phases are ordered so each one's inputs are satisfied
by earlier phases.

---

## Architecture overview (before touching any file)

### What exists

- `gui/state.py` — `NPCState` + `EncounterState` dataclasses, JSON serde
- `gui/dispatcher.py` — regex sigil parser → `ParsedInput`
- `gui/event_bus.py` — typed pub/sub + `TriggerMatcher` / `WatchMatcher`
- `gui/npc_tab.py` — one `QWidget` tab per NPC; handles its own commands
- `gui/main_window.py` — `QMainWindow`: tabs, round button, LLM fallback
- `gui/llm_controller.py` — Anthropic SDK wrapper; tool surface for state mutation
- `gui/encounter_picker.py` — encounter discovery + launch dialog
- `gui/app.py` — `QApplication` boot + `build_encounter_state` + `build_main_window`
- `gui/widgets/command_input.py` — `CommandInput` with sigil-aware autocomplete

### Key invariants to preserve

1. `NPCState` is pure Python (no Qt) — unit tests run instantly.
2. `gui/command_tags.py` (new) must be pure Python — no Qt, no I/O.
3. `Dispatcher` is stateless.
4. `LLMController.run()` is blocking — always called from a worker thread.
5. `with_llm=False` in tests; fake Anthropic client for review-pipeline tests.

### New signal flow for directed commands

```
[active NPCTab].command_input.submitted
  → NPCTab._on_submitted
  → Dispatcher.parse → ParsedInput(kind=DIRECTED)
  → NPCTab emits directed_command_requested(ParsedInput)
  → MainWindow._on_directed_command
      ├── fast path: apply effect to target NPCState (on GUI thread)
      ├── log "Actor → #target: effect" on actor's tab
      ├── refresh target tab + emit state_changed
      └── enqueue LLM review job (off-thread)
```

For **self-targeting** commands (DAMAGE / HEAL / CONDITION / ACTION), NPCTab
continues to handle them locally and emits `review_needed(raw_text)` after the
state change. MainWindow connects that signal to the review enqueue.

---

## Phase 1 — Data model and pure modules (no Qt)

**Goal:** Add new fields and new pure modules. Zero Qt imports. All tests are
plain `pytest` (no `pytest-qt`). Establish the foundation every later phase
builds on.

### Task 1.1 — Extend `NPCState` with new fields

**File:** `combat-runner/gui/state.py`

**Change:** Add five new fields to the `NPCState` dataclass. All have defaults
so existing callers (fixtures, snapshots, tests) need no changes:

```python
# After `slots_remaining: dict[str, int] = field(default_factory=dict)` add:
kind: str = "npc"            # "npc" or "pc"
id: str = ""                 # permanent repeated-digit label ("1", "22", etc.)
in_melee: bool = False       # set True when actor/target of a melee-tagged command
pinned_notes: list[str] = field(default_factory=list)  # free-form tracked state
```

`ac` already exists as `int` — no change to its type; PCs always supply it from
the party YAML.

**Change:** Add two methods to `EncounterState`:

```python
def combatant_by_id(self, combatant_id: str) -> NPCState | None:
    """Look up a combatant by its permanent id label. Returns first match."""
    for npc in self.npcs:
        if npc.id == combatant_id:
            return npc
    return None

def npc_by_slug(self, slug: str) -> NPCState | None:
    # (already exists — keep as-is)
```

**Change:** Add a module-level id-alphabet generator and assignment function:

```python
def _id_alphabet() -> Iterator[str]:
    """Yields: '1','2',...,'9','0', '11','22',...,'99','00', '111',... indefinitely."""
    digit = 1
    while True:
        for d in "1234567890":
            yield d * digit
        digit += 1


def assign_combatant_ids(npcs: list[NPCState], reserved: set[str] | None = None) -> None:
    """Assign permanent id labels to any combatant whose id is empty "".
    Skips labels already claimed by reserved (e.g. player ids from party config).
    Mutates npcs in place; idempotent for combatants that already have an id.
    """
    reserved = reserved or set()
    taken = {n.id for n in npcs if n.id} | reserved
    gen = _id_alphabet()
    def _next_free() -> str:
        while True:
            label = next(gen)
            if label not in taken:
                taken.add(label)
                return label
    for npc in npcs:
        if not npc.id:
            npc.id = _next_free()
```

Add `from typing import Iterator` to the existing import block.

**Change:** Update `_serialize_npc` to include the new fields:

```python
# In _serialize_npc, after the existing fields, add:
"kind": npc.kind,
"id": npc.id,
"in_melee": npc.in_melee,
"pinned_notes": list(npc.pinned_notes),
```

**Change:** Update `_deserialize_npc` to read the new fields (with defaults for
old snapshots that lack them):

```python
# In the NPCState(...) constructor call inside _deserialize_npc, add:
kind=str(d.get("kind", "npc")),
id=str(d.get("id", "")),
in_melee=bool(d.get("in_melee", False)),
pinned_notes=list(d.get("pinned_notes", []) or []),
```

**Change:** Update `state_schema()` to mention the new fields in the
`"NPCState"` dict:

```python
"kind": "string ('npc' or 'pc')",
"id": "string (permanent repeated-digit combatant label; '' = unassigned)",
"in_melee": "bool (true if this combatant is currently in melee engagement)",
"pinned_notes": "list of strings (free-form tracked state shown on the tab)",
```

Also add `"id must be '' or a repeated-digit string"` to `"constraints"`.

**Test:** Add `combat-runner/tests/test_state_players.py`:

```python
from gui.state import NPCState, EncounterState, assign_combatant_ids, \
    serialize_encounter, deserialize_encounter
from pathlib import Path

def _enc(*npcs):
    return EncounterState(name="t", root=Path("/t"), log_path=Path("/t/l.md"), npcs=list(npcs))

def _npc(**kw):
    base = dict(slug="x", name="X", max_hp=10, ac=12, speed="30ft", cr=0.0)
    base.update(kw)
    return NPCState(**base)

def test_npc_default_kind():
    assert _npc().kind == "npc"

def test_npc_pc_kind():
    assert _npc(kind="pc").kind == "pc"

def test_npc_default_id_empty():
    assert _npc().id == ""

def test_npc_in_melee_default_false():
    assert _npc().in_melee is False

def test_npc_pinned_notes_default_empty():
    assert _npc().pinned_notes == []

def test_id_alphabet_order():
    from gui.state import _id_alphabet
    gen = _id_alphabet()
    first = [next(gen) for _ in range(12)]
    assert first[:10] == ["1","2","3","4","5","6","7","8","9","0"]
    assert first[10] == "11"
    assert first[11] == "22"

def test_assign_ids_fills_empty():
    n1, n2 = _npc(), _npc()
    assign_combatant_ids([n1, n2])
    assert n1.id == "1"
    assert n2.id == "2"

def test_assign_ids_skips_reserved():
    n1, n2 = _npc(), _npc()
    assign_combatant_ids([n1, n2], reserved={"1", "2"})
    assert n1.id == "3"
    assert n2.id == "4"

def test_assign_ids_idempotent():
    n1 = _npc(id="5")
    assign_combatant_ids([n1])
    assert n1.id == "5"

def test_assign_ids_skips_existing_ids():
    n1 = _npc(id="1")
    n2 = _npc()
    assign_combatant_ids([n1, n2])
    assert n2.id == "2"  # "1" is taken

def test_combatant_by_id():
    n1 = _npc(slug="a", id="1")
    n2 = _npc(slug="b", id="22")
    enc = _enc(n1, n2)
    assert enc.combatant_by_id("1") is n1
    assert enc.combatant_by_id("22") is n2
    assert enc.combatant_by_id("99") is None

def test_serialization_round_trips_new_fields():
    n = _npc(kind="pc", id="3", in_melee=True, pinned_notes=["taunted"])
    enc = _enc(n)
    blob = serialize_encounter(enc)
    restored = deserialize_encounter(blob)
    rn = restored.npcs[0]
    assert rn.kind == "pc"
    assert rn.id == "3"
    assert rn.in_melee is True
    assert rn.pinned_notes == ["taunted"]

def test_old_snapshot_without_new_fields_deserializes():
    """Back-compat: a snapshot that has no kind/id/in_melee/pinned_notes loads ok."""
    import json
    blob = {
        "name": "t", "root": "/t", "log_path": "/t/l.md",
        "npcs": [{"slug": "x", "name": "X", "max_hp": 10, "ac": 12,
                  "speed": "30ft", "cr": 0.0}],
    }
    enc = deserialize_encounter(blob)
    assert enc.npcs[0].kind == "npc"
    assert enc.npcs[0].id == ""
```

**Phase 1 test strategy:** `pytest combat-runner/tests/test_state_players.py`
— no Qt needed.

---

### Task 1.2 — Create `gui/command_tags.py` (new file)

**File:** `combat-runner/gui/command_tags.py` *(create new)*

This module is **pure Python — no Qt, no I/O**. It holds the faceted tag
taxonomy and two functions: `resolve_tags` and `hint_pool`.

```python
"""Faceted tag taxonomy for directed combat commands.

Pure Python — no Qt, no I/O. Imported by dispatcher.py and command_input.py.
"""
from __future__ import annotations

TAG_FACETS: dict[str, dict] = {
    "direction": {
        "exclusive": True,
        "required": True,
        "default": "damage",
        "values": {
            "damage": {"aliases": ["dmg", "dam"]},
            "heal":   {"aliases": ["healing", "hp"]},
        },
    },
    "delivery": {
        "exclusive": True,
        "applies_when": {"direction": "damage"},
        "values": {
            "melee":  {},
            "ranged": {"aliases": ["rng"]},
        },
    },
    "type": {
        "exclusive": True,
        "applies_when": {"direction": "damage"},
        "values": {
            "fire":      {},
            "cold":      {},
            "acid":      {},
            "lightning": {},
            "poison":    {},
            "necrotic":  {},
            "radiant":   {},
            "thunder":   {},
            "force":     {},
            "psychic":   {},
            "piercing":  {},
            "slashing":  {},
            "bludgeoning": {},
        },
    },
}

# Build reverse alias map at module load: alias/canonical → (facet, canonical)
_ALIAS_MAP: dict[str, tuple[str, str]] = {}
for _facet, _spec in TAG_FACETS.items():
    for _canonical, _vspec in _spec["values"].items():
        _ALIAS_MAP[_canonical] = (_facet, _canonical)
        for _alias in _vspec.get("aliases", []):
            _ALIAS_MAP[_alias] = (_facet, _canonical)


def resolve_tags(tokens: list[str]) -> tuple[dict[str, str], list[str]]:
    """Validate and resolve a list of tag tokens against the faceted taxonomy.

    Returns (resolved, errors) where:
      resolved: dict[facet → canonical_value] for each recognized token
      errors:   list of human-readable error strings for unknown tokens

    Rules (from spec §6):
      1. Each recognized token resolves to (facet, canonical) via _ALIAS_MAP.
      2. ≤ 1 value per facet; a new value in an already-filled facet replaces it.
      3. A facet's values are valid only if its applies_when holds; tokens for
         inapplicable facets are dropped silently (not an error).
    """
    resolved: dict[str, str] = {}
    errors: list[str] = []

    for token in tokens:
        lower = token.lower().strip()
        if not lower:
            continue
        entry = _ALIAS_MAP.get(lower)
        if entry is None:
            errors.append(f"unknown tag: {token!r}")
            continue
        facet, canonical = entry
        # Rule 3: check applies_when
        applies_when = TAG_FACETS[facet].get("applies_when", {})
        applicable = all(resolved.get(af) == av for af, av in applies_when.items())
        if not applicable:
            # Drop inapplicable tags silently
            continue
        # Rule 2: replace existing value in same facet
        resolved[facet] = canonical

    # Apply default for required facets not yet set
    for facet, spec in TAG_FACETS.items():
        if spec.get("required") and facet not in resolved:
            default = spec.get("default")
            if default:
                resolved[facet] = default

    return resolved, errors


def hint_pool(current_tokens: list[str]) -> list[str]:
    """Return candidate tag strings (canonical + aliases) that are applicable
    given the tokens typed so far.

    Candidates are: tags whose facet is (a) applicable given applies_when and
    (b) not yet filled. The result includes both canonical names and aliases
    so the user can type either.
    """
    resolved, _ = resolve_tags(current_tokens)
    candidates: list[str] = []
    for facet, spec in TAG_FACETS.items():
        # Skip already-filled exclusive facets
        if spec.get("exclusive") and facet in resolved:
            continue
        # Check applies_when
        applies_when = spec.get("applies_when", {})
        applicable = all(resolved.get(af) == av for af, av in applies_when.items())
        if not applicable:
            continue
        for canonical, vspec in spec["values"].items():
            candidates.append(canonical)
            candidates.extend(vspec.get("aliases", []))
    return candidates
```

**Test:** Add `combat-runner/tests/test_command_tags.py`:

```python
from gui.command_tags import resolve_tags, hint_pool

def test_empty_tokens_gives_default_direction():
    resolved, errors = resolve_tags([])
    assert resolved["direction"] == "damage"
    assert errors == []

def test_damage_alias_resolves():
    resolved, _ = resolve_tags(["dmg"])
    assert resolved["direction"] == "damage"

def test_heal_alias_resolves():
    resolved, _ = resolve_tags(["hp"])
    assert resolved["direction"] == "heal"

def test_unknown_tag_is_an_error():
    _, errors = resolve_tags(["blorp"])
    assert any("blorp" in e for e in errors)

def test_second_value_in_facet_replaces_first():
    resolved, _ = resolve_tags(["fire", "cold"])
    assert resolved["type"] == "cold"  # second wins

def test_delivery_facet_inapplicable_when_healing():
    resolved, _ = resolve_tags(["heal", "melee"])
    # melee is a delivery tag; delivery.applies_when = {direction: damage}
    # since direction=heal now, melee should be dropped
    assert "delivery" not in resolved

def test_type_facet_inapplicable_when_healing():
    resolved, _ = resolve_tags(["heal", "fire"])
    assert "type" not in resolved

def test_fire_resolves_to_type_facet():
    resolved, _ = resolve_tags(["fire"])
    assert resolved.get("type") == "fire"

def test_melee_resolves_to_delivery_facet():
    resolved, _ = resolve_tags(["melee"])
    assert resolved.get("delivery") == "melee"

def test_ranged_alias():
    resolved, _ = resolve_tags(["rng"])
    assert resolved.get("delivery") == "ranged"

def test_hint_pool_before_any_tags_includes_all():
    pool = hint_pool([])
    assert "damage" in pool
    assert "heal" in pool
    assert "fire" in pool
    assert "melee" in pool

def test_hint_pool_after_heal_excludes_type_and_delivery():
    pool = hint_pool(["heal"])
    assert "fire" not in pool
    assert "melee" not in pool

def test_hint_pool_after_type_filled_excludes_same_facet():
    pool = hint_pool(["fire"])
    # type facet is now filled; its other values should not appear
    # (exclusive facet already satisfied)
    assert "cold" not in pool

def test_hint_pool_includes_aliases():
    pool = hint_pool([])
    assert "dmg" in pool
    assert "hp" in pool
```

**Phase 1 test strategy:** `pytest combat-runner/tests/test_command_tags.py` — no Qt needed.

---

### Task 1.3 — Add directed-command branch to `gui/dispatcher.py`

**File:** `combat-runner/gui/dispatcher.py`

**Change:** Add `DIRECTED` and `JUMP` to `InputKind`:

```python
class InputKind(Enum):
    ACTION = "action"
    DAMAGE = "damage"
    HEAL = "heal"
    CONDITION = "condition"
    CONDITION_MENU = "condition_menu"
    NOTE = "note"
    REORDER = "reorder"
    QUIT = "quit"
    DIRECTED = "directed"   # NEW: <id> <amount> <tags…>
    JUMP = "jump"           # NEW: <id> alone → focus that combatant's tab
    AMBIGUOUS = "ambiguous"
    UNKNOWN = "unknown"
```

**Change:** Add new fields to `ParsedInput`:

```python
@dataclass
class ParsedInput:
    kind: InputKind
    raw: str
    # existing fields unchanged …
    # NEW directed-command fields:
    target_id: str | None = None      # the repeated-digit id label
    target_member: int | None = None  # optional mob member within target (m<n>)
    resolved_tags: dict = field(default_factory=dict)  # facet→canonical from resolve_tags
    tag_errors: list[str] = field(default_factory=list)  # unrecognized tokens
```

**Change:** Add two new module-level patterns:

```python
# A valid combatant id: one digit repeated 1-N times. "44" ok, "45" invalid.
_REPEATED_DIGIT_RE = re.compile(r'^(\d)\1*$')
# Optional mob-member target within a directed command: m2
_DIRECTED_MOB_RE = re.compile(r'^m([1-9]\d*)$', re.IGNORECASE)
```

**Change:** In `Dispatcher.parse()`, add the directed-command branch as the **first** check (before the existing sigil patterns). Insert immediately after the `if not s: return result` guard:

```python
# Directed command: starts with a digit
if s[0].isdigit():
    return self._parse_directed(s)
```

**Change:** Add `_parse_directed` as a method on `Dispatcher`:

```python
def _parse_directed(self, s: str) -> ParsedInput:
    """Parse a directed command: <id> [m<n>] [<amount>] [<tags…>]
    or bare <id> (no amount) → JUMP.
    """
    from .command_tags import resolve_tags  # lazy import keeps module lightweight

    result = ParsedInput(kind=InputKind.UNKNOWN, raw=s)
    tokens = s.split()
    if not tokens:
        return result

    id_token = tokens[0]
    if not _REPEATED_DIGIT_RE.match(id_token):
        # "45" or other non-uniform number — not a directed command, fall through
        return result  # UNKNOWN → caller routes to LLM

    # Bare id alone → JUMP (focus that combatant's tab)
    if len(tokens) == 1:
        result.kind = InputKind.JUMP
        result.target_id = id_token
        return result

    result.target_id = id_token
    rest = tokens[1:]  # everything after the id

    # Optional mob member: m<n>
    if rest and _DIRECTED_MOB_RE.match(rest[0]):
        m = _DIRECTED_MOB_RE.match(rest[0])
        result.target_member = int(m.group(1))
        rest = rest[1:]

    if not rest:
        # id + optional mob only — treat as JUMP to that id
        result.kind = InputKind.JUMP
        return result

    # Amount must be a positive integer
    try:
        result.amount = int(rest[0])
        if result.amount < 0:
            raise ValueError
    except (ValueError, IndexError):
        result.kind = InputKind.UNKNOWN
        result.raw = s
        return result

    rest = rest[1:]

    # Remaining tokens are tags — resolve through faceted taxonomy
    resolved, errors = resolve_tags(rest)
    result.resolved_tags = resolved
    result.tag_errors = errors
    result.kind = InputKind.DIRECTED

    # Derive damage_type from resolved tags for back-compat with existing
    # event_bus callers that look at damage_type directly.
    result.damage_type = resolved.get("type")

    return result
```

**Test:** Add `combat-runner/tests/test_dispatcher_directed.py`:

```python
from gui.dispatcher import Dispatcher, InputKind

D = Dispatcher()

# ── id validation ──

def test_repeated_digit_id_parses():
    p = D.parse("44 12")
    assert p.kind is InputKind.DIRECTED
    assert p.target_id == "44"
    assert p.amount == 12

def test_single_digit_id_parses():
    p = D.parse("1 8")
    assert p.kind is InputKind.DIRECTED
    assert p.target_id == "1"

def test_triple_digit_id_parses():
    p = D.parse("333 5")
    assert p.kind is InputKind.DIRECTED
    assert p.target_id == "333"

def test_non_uniform_number_falls_through():
    p = D.parse("45 12")
    assert p.kind is InputKind.UNKNOWN  # "45" is not a valid id

def test_mixed_digits_not_id():
    p = D.parse("123 10")
    assert p.kind is InputKind.UNKNOWN

# ── amount ──

def test_amount_parsed():
    p = D.parse("5 18")
    assert p.amount == 18

def test_zero_amount():
    p = D.parse("5 0")
    assert p.kind is InputKind.DIRECTED
    assert p.amount == 0

# ── tags ──

def test_tags_parsed_any_order():
    p = D.parse("3 10 fire melee")
    assert p.kind is InputKind.DIRECTED
    assert p.resolved_tags.get("type") == "fire"
    assert p.resolved_tags.get("delivery") == "melee"

def test_tag_alias_resolved():
    p = D.parse("3 10 rng")
    assert p.resolved_tags.get("delivery") == "ranged"

def test_unknown_tag_is_logged_not_fatal():
    p = D.parse("3 10 blorp")
    assert p.kind is InputKind.DIRECTED
    assert any("blorp" in e for e in p.tag_errors)

def test_heal_tag_drops_melee():
    p = D.parse("3 10 heal melee")
    assert p.resolved_tags.get("direction") == "heal"
    assert "delivery" not in p.resolved_tags  # melee dropped

def test_damage_type_field_populated_from_tags():
    p = D.parse("3 10 fire")
    assert p.damage_type == "fire"

# ── mob member targeting ──

def test_mob_member_in_directed():
    p = D.parse("44 m2 5 fire")
    assert p.kind is InputKind.DIRECTED
    assert p.target_id == "44"
    assert p.target_member == 2
    assert p.amount == 5
    assert p.resolved_tags.get("type") == "fire"

def test_mob_m0_not_parsed_as_member():
    p = D.parse("44 m0 5")
    # m0 is invalid per dispatcher; falls through to UNKNOWN or treats m0 as
    # non-mob token (no valid mob match), causing amount parse to fail
    # Either UNKNOWN or DIRECTED with no target_member is acceptable.
    assert p.target_member != 0  # must not set member to 0

# ── bare id → JUMP ──

def test_bare_id_is_jump():
    p = D.parse("3")
    assert p.kind is InputKind.JUMP
    assert p.target_id == "3"

def test_bare_repeated_id_is_jump():
    p = D.parse("44")
    assert p.kind is InputKind.JUMP
    assert p.target_id == "44"

# ── existing sigils not broken ──

def test_damage_sigil_unchanged():
    p = D.parse("-18 fire")
    assert p.kind is InputKind.DAMAGE
    assert p.amount == 18

def test_heal_sigil_unchanged():
    p = D.parse("+10")
    assert p.kind is InputKind.HEAL

def test_note_unchanged():
    p = D.parse("note hello world")
    assert p.kind is InputKind.NOTE

def test_quit_unchanged():
    p = D.parse("/quit")
    assert p.kind is InputKind.QUIT
```

**Phase 1 test strategy:** `pytest combat-runner/tests/test_dispatcher_directed.py` — no Qt needed.

---

### Task 1.4 — Add `move_away` event kind to `gui/event_bus.py`

**File:** `combat-runner/gui/event_bus.py`

**Change:** Add `"move_away"` to the `EventKind` literal:

```python
EventKind = Literal[
    "damage",
    "heal",
    "condition_applied",
    "condition_removed",
    "action_executed",
    "spell_cast",
    "move_away",        # NEW: combatant retreated while in_melee
    "round_advanced",
    "death",
    "bloodied",
    "note",
]
```

**Change:** Add a factory function:

```python
def move_away_event(combatant_id: str, combatant_slug: str) -> Event:
    """Fired when a combatant retreats while in_melee=True.
    Main window listens and shows the OA prompt."""
    return Event(
        kind="move_away",
        subject_npc=combatant_slug,
        payload={"combatant_id": combatant_id},
    )
```

**Test:** In `combat-runner/tests/test_event_bus.py`, add:

```python
def test_move_away_event_kind_accepted(sample_npc):
    from gui.event_bus import EventBus, move_away_event
    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)
    bus.emit(move_away_event("3", sample_npc.slug))
    assert len(received) == 1
    assert received[0].payload["combatant_id"] == "3"
```

**Phase 1 test strategy:** Run full `pytest combat-runner/tests/test_event_bus.py` to confirm no regressions, plus the new assertion above.

---

## Phase 2 — Roster loading and launch entry point

**Goal:** Party YAML schema, roster loader, `--party` CLI arg, PC combatant
construction, and the launcher Players section. Tests cover loading + UI (with
offscreen Qt).

### Task 2.1 — Create sample party roster file

**File:** `world/party/black-ledger/combat-roster.yml` *(create; directory may
not exist — create it)*

```yaml
party: Black Ledger
players:
  - { name: Vessa, id: "1", max_hp: 31, ac: 15 }
  - { name: Orren, id: "2", max_hp: 40, ac: 17 }
  - { name: Grek,  id: "3", max_hp: 33, ac: 16 }
```

This file is **data only** — no code changes. It is the canonical example and
is used by tests.

---

### Task 2.2 — Add `load_party_config` to `gui/encounter_picker.py`

**File:** `combat-runner/gui/encounter_picker.py`

**Change:** Add a standalone function (pure Python, no Qt) after the existing
`_parse_default_count` / `_parse_name` helpers:

```python
import yaml as _yaml  # stdlib fallback handled below


def load_party_config(path: Path) -> dict:
    """Load a combat-roster.yml and return its parsed dict.

    Returns a dict with keys 'party' (str) and 'players' (list of dicts).
    Each player dict has: name, id, max_hp, ac (all required).
    Raises ValueError on schema validation failure.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        raise ValueError(f"Cannot read party config {path}: {e}") from e

    try:
        import yaml
        data = yaml.safe_load(text)
    except Exception:
        # Fallback: manual YAML for the simple key: value format used here
        data = _parse_simple_roster_yaml(text)

    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected a mapping at top level")
    players = data.get("players", [])
    if not isinstance(players, list):
        raise ValueError(f"{path}: 'players' must be a list")
    required_keys = {"name", "id", "max_hp", "ac"}
    for i, p in enumerate(players):
        if not isinstance(p, dict):
            raise ValueError(f"{path}: player {i} is not a mapping")
        missing = required_keys - set(p.keys())
        if missing:
            raise ValueError(f"{path}: player {i} missing keys: {missing}")
        if not isinstance(p.get("max_hp"), int):
            raise ValueError(f"{path}: player {i} max_hp must be an integer")
        if not isinstance(p.get("ac"), int):
            raise ValueError(f"{path}: player {i} ac must be an integer")
    return data


def _parse_simple_roster_yaml(text: str) -> dict:
    """Minimal YAML-compatible parser for the combat-roster.yml format.
    Only handles: party: str, players: list of inline dicts.
    Used when the PyYAML library is not installed."""
    import re
    out: dict = {}
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r'^party:\s*(.+)$', line)
        if m:
            out["party"] = m.group(1).strip().strip('"').strip("'")
            i += 1
            continue
        if line.strip() == "players:":
            players = []
            i += 1
            while i < len(lines) and lines[i].startswith("  "):
                entry_line = lines[i].strip().lstrip("- ").strip("{").strip("}")
                # Parse `key: value` pairs separated by commas
                player: dict = {}
                for kv in re.split(r',\s*', entry_line):
                    km = re.match(r'(\w+):\s*"?([^"]*)"?', kv.strip())
                    if km:
                        k, v = km.group(1), km.group(2)
                        if k in ("max_hp", "ac"):
                            player[k] = int(v)
                        else:
                            player[k] = v
                if player:
                    players.append(player)
                i += 1
            out["players"] = players
            continue
        i += 1
    return out
```

**Test:** Add `combat-runner/tests/test_party_loader.py`:

```python
import textwrap
from pathlib import Path
import pytest
from gui.encounter_picker import load_party_config

@pytest.fixture
def roster_file(tmp_path):
    p = tmp_path / "roster.yml"
    p.write_text(textwrap.dedent("""\
        party: Black Ledger
        players:
          - { name: Vessa, id: "1", max_hp: 31, ac: 15 }
          - { name: Orren, id: "2", max_hp: 40, ac: 17 }
    """))
    return p

def test_load_party_name(roster_file):
    data = load_party_config(roster_file)
    assert data["party"] == "Black Ledger"

def test_load_players_count(roster_file):
    data = load_party_config(roster_file)
    assert len(data["players"]) == 2

def test_player_fields(roster_file):
    data = load_party_config(roster_file)
    vessa = data["players"][0]
    assert vessa["name"] == "Vessa"
    assert vessa["id"] == "1"
    assert vessa["max_hp"] == 31
    assert vessa["ac"] == 15

def test_missing_player_key_raises(tmp_path):
    p = tmp_path / "bad.yml"
    p.write_text("party: X\nplayers:\n  - { name: Y, id: '1', max_hp: 10 }\n")
    with pytest.raises(ValueError, match="missing keys"):
        load_party_config(p)

def test_missing_file_raises(tmp_path):
    with pytest.raises(ValueError, match="Cannot read"):
        load_party_config(tmp_path / "nonexistent.yml")

def test_real_roster_file():
    """The committed world/party/black-ledger/roster loads correctly."""
    repo_root = Path(__file__).resolve().parents[2]
    roster = repo_root / "world" / "party" / "black-ledger" / "combat-roster.yml"
    if not roster.exists():
        pytest.skip("real roster file not committed yet")
    data = load_party_config(roster)
    assert len(data["players"]) >= 1
```

---

### Task 2.3 — Add `--party` arg and PC construction to `gui/app.py`

**File:** `combat-runner/gui/app.py`

**Change 1:** Add imports at the top of the file (after existing imports):

```python
import argparse
from .encounter_picker import load_party_config
from .state import assign_combatant_ids
```

**Change 2:** Modify `build_encounter_state` to accept an optional
`party_config: dict | None = None` parameter and insert PC combatants before
NPC id assignment:

```python
def build_encounter_state(
    encounter: DiscoveredEncounter,
    counts: dict[str, int],
    party_config: dict | None = None,
    player_selections: dict[str, dict] | None = None,
) -> EncounterState:
    """Build EncounterState from picker output.

    party_config: parsed output of load_party_config (if --party supplied).
    player_selections: {player_id: {current_hp: int, included: bool}} from picker UI.
    """
    timestamp = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    mem_dir = _REPO_ROOT / "combat-runner" / ".memory" / encounter.name
    mem_dir.mkdir(parents=True, exist_ok=True)
    log_path = mem_dir / f"log-{timestamp}.md"

    combatants: list[NPCState] = []

    # 1. Build PC combatants from party config
    reserved_ids: set[str] = set()
    if party_config:
        player_selections = player_selections or {}
        for player in party_config.get("players", []):
            pid = str(player["id"])
            sel = player_selections.get(pid, {})
            if not sel.get("included", True):
                continue  # player sat this combat out
            current_hp = sel.get("current_hp", player["max_hp"])
            pc = NPCState(
                slug=f"pc-{pid}",
                name=player["name"],
                max_hp=player["max_hp"],
                ac=player["ac"],
                speed="30 ft.",  # PCs have no stored speed; placeholder
                cr=0.0,
                kind="pc",
                id=pid,
            )
            pc.member_hp = [current_hp]
            combatants.append(pc)
            reserved_ids.add(pid)

    # 2. Build NPC combatants
    for picker_npc in encounter.npcs:
        count = counts.get(picker_npc.slug, 1)
        details = _parse_npc_details(picker_npc.md_path, picker_npc.slug, picker_npc.name)
        npc_state = NPCState(
            slug=picker_npc.slug,
            name=picker_npc.name,
            max_hp=details["max_hp"],
            ac=details["ac"],
            speed=details["speed"],
            cr=details["cr"],
            immunities=details["immunities"],
            count=count,
        )
        combatants.append(npc_state)

    # 3. Assign permanent ids (skipping player-reserved labels)
    assign_combatant_ids(combatants, reserved=reserved_ids)

    return EncounterState(
        name=encounter.name,
        root=encounter.root,
        log_path=log_path,
        npcs=combatants,
    )
```

**Change 3:** Modify `build_main_window` to pass through `party_config` and
`player_selections`:

```python
def build_main_window(
    encounter: DiscoveredEncounter,
    counts: dict[str, int],
    with_llm: bool = True,
    party_config: dict | None = None,
    player_selections: dict[str, dict] | None = None,
) -> MainWindow:
    es = build_encounter_state(encounter, counts, party_config=party_config,
                               player_selections=player_selections)
    # … rest unchanged …
```

**Change 4:** In `main()`, parse `--party` arg and load the config:

```python
def main() -> int:
    parser = argparse.ArgumentParser(prog="combat-gui", add_help=False)
    parser.add_argument("--party", metavar="PATH", default=None,
                        help="Path to a combat-roster.yml (party config)")
    args, _ = parser.parse_known_args()

    _party_config: dict | None = None
    if args.party:
        try:
            _party_config = load_party_config(Path(args.party))
        except ValueError as exc:
            # Boot can't fail — warn and continue without party
            import logging
            logging.getLogger(__name__).warning("party config load failed: %s", exc)

    app = QApplication(sys.argv)
    # … rest of boot unchanged, but pass _party_config through _launch …
```

Wire `_party_config` through `_launch` into `build_main_window`. The picker's
`launched` signal already carries `(encounter, counts)` — extend it to also
carry player_selections (added in Task 2.4). For the CLI path without the
picker's Players section, `player_selections=None` means "all players at max HP
and included."

**Test:** Add `combat-runner/tests/test_app_party.py`:

```python
import pytest
from pathlib import Path

@pytest.fixture
def party_config():
    return {
        "party": "Test Party",
        "players": [
            {"name": "Vessa", "id": "1", "max_hp": 31, "ac": 15},
            {"name": "Orren", "id": "2", "max_hp": 40, "ac": 17},
        ],
    }

@pytest.fixture
def minimal_encounter(tmp_path):
    from gui.encounter_picker import DiscoveredEncounter
    return DiscoveredEncounter(
        name="test-enc", root=tmp_path, npcs=[], latest_mtime=0.0
    )

def test_build_state_includes_pcs(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(minimal_encounter, {}, party_config=party_config)
    pc_kinds = [n.kind for n in es.npcs]
    assert pc_kinds.count("pc") == 2

def test_pc_has_correct_id(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(minimal_encounter, {}, party_config=party_config)
    ids = {n.id for n in es.npcs if n.kind == "pc"}
    assert "1" in ids
    assert "2" in ids

def test_pc_name_from_config(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(minimal_encounter, {}, party_config=party_config)
    names = {n.name for n in es.npcs if n.kind == "pc"}
    assert "Vessa" in names

def test_pc_hp_from_config(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(minimal_encounter, {}, party_config=party_config)
    vessa = next(n for n in es.npcs if n.kind == "pc" and n.name == "Vessa")
    assert vessa.max_hp == 31
    assert vessa.member_hp == [31]

def test_pc_current_hp_from_selection(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(
        minimal_encounter, {},
        party_config=party_config,
        player_selections={"1": {"current_hp": 20, "included": True}},
    )
    vessa = next(n for n in es.npcs if n.id == "1")
    assert vessa.member_hp == [20]

def test_excluded_player_omitted(minimal_encounter, party_config):
    from gui.app import build_encounter_state
    es = build_encounter_state(
        minimal_encounter, {},
        party_config=party_config,
        player_selections={"1": {"included": False}},
    )
    ids = {n.id for n in es.npcs if n.kind == "pc"}
    assert "1" not in ids
    assert "2" in ids

def test_npc_ids_skip_player_ids(minimal_encounter, party_config):
    """NPCs must not get ids "1" or "2" — those are reserved for PCs."""
    from gui.app import build_encounter_state
    from gui.encounter_picker import DiscoveredNPC
    import importlib.util, sys
    # Create a minimal encounter with one NPC
    npc_md = minimal_encounter.root / "npcs" / "goblin.md"
    npc_md.parent.mkdir(parents=True, exist_ok=True)
    npc_md.write_text("---\nname: Goblin\nmax_hp: 7\nac: 13\n---\n**HP** 7 **AC** 13\n")
    enc2 = minimal_encounter.__class__(
        name="test-enc",
        root=minimal_encounter.root,
        npcs=[DiscoveredNPC(slug="goblin", name="Goblin", md_path=npc_md)],
        latest_mtime=0.0,
    )
    es = build_encounter_state(enc2, {"goblin": 1}, party_config=party_config)
    npc_ids = {n.id for n in es.npcs if n.kind == "npc"}
    assert "1" not in npc_ids
    assert "2" not in npc_ids
```

---

### Task 2.4 — Add Players section to `gui/encounter_picker.py`

**File:** `combat-runner/gui/encounter_picker.py`

**Change 1:** Update the `launched` signal to also carry player selections:

```python
launched = Signal(object, dict, object, dict)
# (DiscoveredEncounter, counts_dict, party_config_or_None, player_selections_dict)
```

**Change 2:** Add a `party_config: dict | None = None` constructor parameter and
store it on `self`. Load it in `_build_ui` to build the Players section.

**Change 3:** After the Per-NPC counts section in `_build_ui`, add:

```python
# Players section (shown only when party_config is set)
if self.party_config:
    right.addWidget(QLabel("<b>Players</b>"))
    self._player_widget = QWidget()
    self._player_form = QFormLayout(self._player_widget)
    self._player_form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
    right.addWidget(self._player_widget)
    self._rebuild_players_section()
else:
    self._player_checks: dict[str, Any] = {}
    self._player_hp_spins: dict[str, QSpinBox] = {}
```

**Change 4:** Add helper `_rebuild_players_section`:

```python
def _rebuild_players_section(self) -> None:
    from PySide6.QtWidgets import QCheckBox, QHBoxLayout
    self._player_checks: dict[str, Any] = {}   # id → QCheckBox
    self._player_hp_spins: dict[str, QSpinBox] = {}  # id → QSpinBox
    while self._player_form.rowCount() > 0:
        self._player_form.removeRow(0)
    for player in (self.party_config or {}).get("players", []):
        pid = str(player["id"])
        row_widget = QWidget()
        row_layout = QHBoxLayout(row_widget)
        row_layout.setContentsMargins(0, 0, 0, 0)
        check = QCheckBox()
        check.setChecked(True)
        spin = QSpinBox()
        spin.setRange(0, player["max_hp"])
        spin.setValue(player["max_hp"])
        row_layout.addWidget(check)
        row_layout.addWidget(spin)
        row_layout.addStretch(1)
        label_text = f"{player['name']}  (#{pid}, max {player['max_hp']})"
        self._player_form.addRow(QLabel(label_text), row_widget)
        self._player_checks[pid] = check
        self._player_hp_spins[pid] = spin
```

**Change 5:** Update `_on_launch` to gather player selections and include them
in the signal:

```python
def _on_launch(self) -> None:
    row = self.list_widget.currentRow()
    if row < 0 or row >= len(self.encounters):
        return
    enc = self.encounters[row]
    counts = {slug: spin.value() for slug, spin in self._count_spinboxes.items()}
    player_selections: dict[str, dict] = {}
    for pid, check in self._player_checks.items():
        player_selections[pid] = {
            "included": check.isChecked(),
            "current_hp": self._player_hp_spins[pid].value(),
        }
    self.launched.emit(enc, counts, self.party_config, player_selections)
    self.accept()
```

**Test:** Add `combat-runner/tests/test_encounter_picker_players.py` (uses
`qtbot`):

```python
import pytest

@pytest.fixture
def party_config():
    return {
        "party": "Test",
        "players": [
            {"name": "Vessa", "id": "1", "max_hp": 31, "ac": 15},
        ],
    }

def test_players_section_shown_with_config(qtbot, party_config):
    from gui.encounter_picker import EncounterPicker
    picker = EncounterPicker(party_config=party_config)
    qtbot.addWidget(picker)
    picker.show()
    # Player checkbox must exist
    assert "1" in picker._player_checks

def test_player_checkbox_default_checked(qtbot, party_config):
    from gui.encounter_picker import EncounterPicker
    picker = EncounterPicker(party_config=party_config)
    qtbot.addWidget(picker)
    assert picker._player_checks["1"].isChecked()

def test_player_hp_spinbox_defaults_to_max(qtbot, party_config):
    from gui.encounter_picker import EncounterPicker
    picker = EncounterPicker(party_config=party_config)
    qtbot.addWidget(picker)
    assert picker._player_hp_spins["1"].value() == 31

def test_no_party_config_no_checks(qtbot):
    from gui.encounter_picker import EncounterPicker
    picker = EncounterPicker()
    qtbot.addWidget(picker)
    assert picker._player_checks == {}
```

**Phase 2 test strategy:** `pytest combat-runner/tests/test_party_loader.py combat-runner/tests/test_app_party.py combat-runner/tests/test_encounter_picker_players.py`

---

## Phase 3 — Player tab, UI polish, and tag hinting

**Goal:** The player tab renders generic action chips, tab titles include the
permanent id, tag hinting works in `CommandInput`, and `Ctrl+N` jumps by
combatant id.

### Task 3.1 — Kind-aware action area in `gui/npc_tab.py`

**File:** `combat-runner/gui/npc_tab.py`

**Change 1:** Add two new signals to `NPCTab`:

```python
# After existing signals:
directed_command_requested = Signal(object)  # ParsedInput(kind=DIRECTED or JUMP)
review_needed = Signal(str, object)  # (raw_command, npc_state snapshot)
```

**Change 2:** Refactor `_build_sheet_panel` to branch on `kind`. Extract the
action-area builder into a helper:

```python
def _build_sheet_panel(self) -> QWidget:
    panel = QWidget()
    layout = QVBoxLayout(panel)
    layout.setContentsMargins(8, 8, 8, 8)
    layout.setSpacing(6)

    self.title_label = QLabel()
    # … (unchanged title/subtitle/status/hp_bar/conditions widgets) …

    # ── kind-aware action area ──
    if self.npc_state.kind == "pc":
        self._build_player_action_area(layout)
    else:
        self._build_npc_action_area(layout)

    layout.addStretch(1)

    self.start_turn_btn = QPushButton(
        "Start turn (refresh reaction + recharges)"
        if self.npc_state.kind == "npc" else
        "Start player's turn"
    )
    # … (unchanged) …
    return panel
```

**Change 3:** Move the existing action-chip block into `_build_npc_action_area`:

```python
def _build_npc_action_area(self, layout: QVBoxLayout) -> None:
    """Builds the DB-driven action chip grid (NPC-only path)."""
    chips_header = QLabel("Actions (click or type)")
    chips_header.setStyleSheet(
        "color: #6c8eba; font-size: 10px; text-transform: uppercase; "
        "letter-spacing: 0.1em; padding-top: 8px;"
    )
    layout.addWidget(chips_header)
    self.action_grid = ActionChipGrid(cols=2)
    self.action_grid.chip_clicked.connect(self._on_chip_clicked)
    self.action_grid.show_narration_requested.connect(self._on_show_narration)
    self.action_grid.toggle_used_requested.connect(self._on_toggle_used)
    self.action_grid.edit_spec_requested.connect(self._on_edit_spec)
    layout.addWidget(self.action_grid)
```

**Change 4:** Add `_build_player_action_area` with generic player action chips:

```python
_PLAYER_ACTIONS = [
    "Cast", "Attack", "Dodge", "Dash", "Disengage", "Help", "Hide", "Ready", "Retreat"
]

def _build_player_action_area(self, layout: QVBoxLayout) -> None:
    """Builds the generic player action chip row (PC-only path)."""
    # Hide the NPC-only grid reference so _refresh won't crash
    self.action_grid = None  # type: ignore[assignment]

    chips_header = QLabel("Actions")
    chips_header.setStyleSheet(
        "color: #6c8eba; font-size: 10px; text-transform: uppercase; "
        "letter-spacing: 0.1em; padding-top: 8px;"
    )
    layout.addWidget(chips_header)

    row_widget = QWidget()
    row_layout = QHBoxLayout(row_widget)
    row_layout.setContentsMargins(0, 0, 0, 0)
    row_layout.setSpacing(4)
    for action_name in _PLAYER_ACTIONS:
        btn = QPushButton(action_name)
        btn.setFixedHeight(28)
        btn.setStyleSheet(
            "padding: 2px 8px; background: #1e2530; color: #d6dade; "
            "border: 1px solid #3a4253; border-radius: 4px; font-size: 11px;"
        )
        btn.clicked.connect(lambda checked=False, a=action_name: self._on_player_action(a))
        row_layout.addWidget(btn)
    row_layout.addStretch(1)
    layout.addWidget(row_widget)
```

**Change 5:** Add `_on_player_action` handler:

```python
def _on_player_action(self, action_name: str) -> None:
    """Handle a generic player action chip click."""
    name = self.npc_state.name
    if action_name == "Cast":
        self._player_action_cast()
    elif action_name == "Retreat":
        self._player_action_retreat()
    elif action_name == "Disengage":
        self._append_log(f"<span style='color:#66bb6a'>{name}: Disengage</span>")
        # Suppresses the next OA prompt — flag stored on the state for one command
        self.npc_state.pinned_notes = [
            n for n in self.npc_state.pinned_notes if n != "_disengaging"
        ]
        self.npc_state.pinned_notes.append("_disengaging")
        self._refresh()
        self.state_changed.emit()
    elif action_name == "Dodge":
        self.npc_state.add_condition("dodging")
        self._append_log(f"<span style='color:#66bb6a'>{name}: Dodge — dodging condition applied</span>")
        self._refresh()
        self.state_changed.emit()
        if self.event_bus is not None:
            from .event_bus import condition_event
            self.event_bus.emit(condition_event(self.npc_state.slug, "dodging", applied=True))
    else:
        # Attack, Dash, Help, Hide, Ready — log a line
        self._append_log(f"<span style='color:#b8bdc4'>{name}: {action_name}</span>")
        self.state_changed.emit()

def _player_action_cast(self) -> None:
    """Prompt for spell name + level, then fire spell_cast event."""
    from PySide6.QtWidgets import QDialog, QDialogButtonBox, QFormLayout, QLineEdit, QSpinBox
    dlg = QDialog(self)
    dlg.setWindowTitle("Cast a Spell")
    form = QFormLayout(dlg)
    spell_input = QLineEdit()
    spell_input.setPlaceholderText("e.g. Fireball")
    level_spin = QSpinBox()
    level_spin.setRange(0, 9)
    level_spin.setValue(1)
    form.addRow("Spell name:", spell_input)
    form.addRow("Spell level:", level_spin)
    buttons = QDialogButtonBox(
        QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
    )
    buttons.accepted.connect(dlg.accept)
    buttons.rejected.connect(dlg.reject)
    form.addRow(buttons)
    if dlg.exec() != QDialog.DialogCode.Accepted:
        return
    spell_name = spell_input.text().strip()
    if not spell_name:
        return
    level = level_spin.value()
    level_str = f"{level}{'st' if level==1 else 'nd' if level==2 else 'rd' if level==3 else 'th'}"
    self._append_log(
        f"<span style='color:#ce93d8'>{self.npc_state.name}: casts {spell_name} ({level_str})</span>"
    )
    if self.event_bus is not None:
        from .event_bus import spell_cast_event
        self.event_bus.emit(spell_cast_event(
            caster=self.npc_state.id or self.npc_state.slug,
            spell_name=spell_name,
            spell_level=level,
        ))
    self.state_changed.emit()

def _player_action_retreat(self) -> None:
    """Log Retreat and fire move_away event (main window handles OA prompt)."""
    name = self.npc_state.name
    # Check and clear _disengaging flag
    if "_disengaging" in self.npc_state.pinned_notes:
        self.npc_state.pinned_notes = [
            n for n in self.npc_state.pinned_notes if n != "_disengaging"
        ]
        self._append_log(
            f"<span style='color:#66bb6a'>{name}: Retreat (Disengage active — no OA)</span>"
        )
        self._refresh()
        self.state_changed.emit()
        return
    self._append_log(f"<span style='color:#ff9800'>{name}: Retreat</span>")
    if self.event_bus is not None and self.npc_state.in_melee:
        from .event_bus import move_away_event
        self.event_bus.emit(move_away_event(
            combatant_id=self.npc_state.id,
            combatant_slug=self.npc_state.slug,
        ))
    self.npc_state.in_melee = False
    self._refresh()
    self.state_changed.emit()
```

**Change 6:** Guard `_refresh` against `action_grid is None` (PC tabs have no
grid):

```python
def _refresh(self) -> None:
    s = self.npc_state
    self.title_label.setText(self._title_text())
    self.subtitle_label.setText(self._subtitle_text())
    self.status_label.setText(self._status_text())
    self.hp_bar.set_state(s.member_hp, s.max_hp)
    self.conditions_label.setText(self._conditions_text())
    if self.action_grid is not None:  # NPC-only
        # … existing action grid refresh code …
    self.input.update_context(s.member_hp, s.max_hp)
```

**Change 7:** Add actor attribution to log lines. Add a helper:

```python
def _actor_prefix(self) -> str:
    return self.npc_state.name
```

Update `_apply_damage` log line to prepend `f"{self._actor_prefix()}: "`, and
similarly `_apply_heal`, `_toggle_condition`, `_run_action`. For example:

```python
# In _apply_damage, change the log line to:
self._append_log(
    f"<span style='color:#8a8f96'>{self._actor_prefix()}:</span> "
    f"<span style='color:#ff5252'>−{amount}{dtype_str}</span> "
    f"{member_str} → HP {result['after']}/{self.npc_state.max_hp}{suffix}"
)
```

Apply the same pattern to heal and condition log lines.

**Change 8:** Show `pinned_notes` in `_status_text()`:

```python
def _status_text(self) -> str:
    s = self.npc_state
    hp_text = f"<b>HP</b> {s.hp}/{s.max_total_hp}"
    parts = [f"{hp_text} · <b>AC</b> {s.ac} · <b>Speed</b> {s.speed}"]
    public_notes = [n for n in s.pinned_notes if not n.startswith("_")]
    if public_notes:
        parts.append(" · ".join(public_notes))
    return "  ".join(parts)
```

**Change 9:** Emit `review_needed` after state-changing commands. In
`_handle_parsed`, after each state-mutation case completes (DAMAGE, HEAL,
CONDITION, ACTION), emit:

```python
# After the state change in _apply_damage, _apply_heal, _toggle_condition, _run_action:
self.review_needed.emit(parsed.raw, self.npc_state)
```

And for DIRECTED commands, emit `directed_command_requested`:

```python
elif parsed.kind in (InputKind.DIRECTED, InputKind.JUMP):
    self.directed_command_requested.emit(parsed)
    return  # MainWindow handles fast path
```

**Test:** Add `combat-runner/tests/test_npc_tab_players.py`:

```python
import pytest
from pathlib import Path
from unittest.mock import MagicMock

@pytest.fixture
def pc_state():
    from gui.state import NPCState
    return NPCState(
        slug="pc-1", name="Vessa", max_hp=31, ac=15,
        speed="30 ft.", cr=0.0, kind="pc", id="1",
    )

@pytest.fixture
def npc_state():
    from gui.state import NPCState
    return NPCState(
        slug="goblin", name="Goblin", max_hp=7, ac=13,
        speed="30 ft.", cr=0.25,
    )

def test_pc_tab_has_no_action_grid(qtbot, pc_state):
    from gui.npc_tab import NPCTab
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    assert tab.action_grid is None

def test_pc_tab_has_player_action_buttons(qtbot, pc_state):
    from gui.npc_tab import NPCTab, _PLAYER_ACTIONS
    from PySide6.QtWidgets import QPushButton
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    labels = {btn.text() for btn in tab.findChildren(QPushButton)}
    for action in _PLAYER_ACTIONS:
        assert action in labels, f"Missing player action button: {action}"

def test_npc_tab_action_grid_present(qtbot, npc_state, sample_actions):
    from gui.npc_tab import NPCTab
    tab = NPCTab(npc_state=npc_state, actions=sample_actions, log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    assert tab.action_grid is not None

def test_dodge_applies_condition(qtbot, pc_state):
    from gui.npc_tab import NPCTab
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    tab._on_player_action("Dodge")
    assert "dodging" in pc_state.conditions

def test_disengage_sets_pinned_flag(qtbot, pc_state):
    from gui.npc_tab import NPCTab
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    tab._on_player_action("Disengage")
    assert "_disengaging" in pc_state.pinned_notes

def test_retreat_clears_disengaging_flag_no_event(qtbot, pc_state):
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab
    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)
    pc_state.in_melee = True
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"),
                 event_bus=bus)
    qtbot.addWidget(tab)
    tab._on_player_action("Disengage")
    tab._on_player_action("Retreat")
    assert received == []  # Disengage suppresses OA
    assert "_disengaging" not in pc_state.pinned_notes

def test_retreat_in_melee_fires_move_away(qtbot, pc_state):
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab
    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)
    pc_state.in_melee = True
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"),
                 event_bus=bus)
    qtbot.addWidget(tab)
    tab._on_player_action("Retreat")
    assert len(received) == 1

def test_directed_command_emits_signal(qtbot, pc_state):
    from gui.npc_tab import NPCTab
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    received = []
    tab.directed_command_requested.connect(received.append)
    # Simulate user typing a directed command
    tab._on_submitted("3 12 fire")
    assert len(received) == 1
    assert received[0].target_id == "3"

def test_pinned_notes_shown_in_status(qtbot, pc_state):
    from gui.npc_tab import NPCTab
    pc_state.pinned_notes = ["taunted"]
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    assert "taunted" in tab.status_label.text()

def test_private_pinned_notes_not_shown(qtbot, pc_state):
    from gui.npc_tab import NPCTab
    pc_state.pinned_notes = ["_disengaging"]
    tab = NPCTab(npc_state=pc_state, actions=[], log_path=Path("/tmp/log.md"))
    qtbot.addWidget(tab)
    assert "_disengaging" not in tab.status_label.text()
```

---

### Task 3.2 — Tag hinting in `gui/widgets/command_input.py`

**File:** `combat-runner/gui/widgets/command_input.py`

**Change:** After `_update_completer_model`, add a new branch that activates
tag hinting when the user has typed a valid directed-command prefix (repeated
digit + space + optional amount):

```python
_TAG_HINT_RE = re.compile(r'^(\d)\1*\s+(?:m\d+\s+)?\d+\s+(\w*)$', re.IGNORECASE)

def _update_completer_model(self, text: str) -> None:
    if text.startswith("@"):
        if self._completer.model() is not self._condition_model:
            self._completer.setModel(self._condition_model)
    elif text.startswith("/"):
        if self._completer.model() is not self._slash_model:
            self._completer.setModel(self._slash_model)
    elif _TAG_HINT_RE.match(text.strip()):
        # Directed command: offer tag completions
        tokens_typed = text.strip().split()[3:]  # tokens after id + amount
        from ..command_tags import hint_pool
        candidates = hint_pool(tokens_typed)
        # Prefix filter on the partially-typed last token
        partial = _TAG_HINT_RE.match(text.strip()).group(2).lower()
        filtered = [c for c in candidates if c.startswith(partial)]
        model = QStringListModel(filtered, self)
        self._completer.setModel(model)
    else:
        popup = self._completer.popup()
        if popup is not None and popup.isVisible():
            popup.hide()
```

**Test:** Add a case to `combat-runner/tests/test_widget_command_input.py`:

```python
def test_tag_hint_pool_activates_after_directed_prefix(qtbot):
    from gui.widgets.command_input import CommandInput
    widget = CommandInput()
    qtbot.addWidget(widget)
    # Simulate typing "3 12 f" — should offer tag completions starting with 'f'
    widget.setText("3 12 f")
    # The completer model should contain "fire" and "force" (both start with 'f')
    from PySide6.QtWidgets import QStringListModel
    model = widget._completer.model()
    strings = [model.data(model.index(i)) for i in range(model.rowCount())]
    assert any("fire" in s for s in strings)
```

---

### Task 3.3 — Tab titles with id and `Ctrl+N` by combatant id

**File:** `combat-runner/gui/main_window.py`

**Change 1:** Update `_tab_title` to include the combatant's permanent id:

```python
def _tab_title(self, npc: NPCState) -> str:
    id_prefix = f"{npc.id} · " if npc.id else ""
    if npc.count > 1:
        return f"{id_prefix}{npc.name} ×{npc.count}  {npc.hp}/{npc.max_total_hp}"
    return f"{id_prefix}{npc.name}  {npc.hp}/{npc.max_total_hp}"
```

**Change 2:** Replace the existing `Ctrl+1..9` tab-position shortcuts in
`_wire_shortcuts` with combatant-id jumps (single-digit ids "1".."9"):

```python
def _wire_shortcuts(self) -> None:
    # Ctrl+1..9 now jumps to combatant #N (by id), not tab position N.
    for digit in "123456789":
        sc = QShortcut(QKeySequence(f"Ctrl+{digit}"), self)
        sc.activated.connect(lambda d=digit: self._jump_to_combatant_by_id(d))

def _jump_to_combatant_by_id(self, combatant_id: str) -> None:
    """Switch to the tab for the combatant with this permanent id."""
    for i, npc in enumerate(self.encounter_state.npcs):
        if npc.id == combatant_id:
            self.tabs.setCurrentIndex(i)
            return
```

**Change 3:** Connect `directed_command_requested` and `review_needed` signals
from each tab in `_build_central`:

```python
tab.directed_command_requested.connect(self._on_directed_command)
tab.review_needed.connect(self._on_review_needed)
```

**Test:** Add to `combat-runner/tests/test_main_window_smoke.py` or a new
`test_main_window_players.py`:

```python
def test_tab_title_includes_id(qtbot, sample_encounter):
    """Tab titles must include the combatant's id when assigned."""
    from gui.app import build_main_window
    from gui.encounter_picker import DiscoveredEncounter
    # Assign an id to the NPC before building the window
    sample_encounter.npcs[0].id = "5"
    # Build window with a mock encounter (skip file IO)
    # … (use build_main_window or build EncounterState directly)
    assert "5 ·" in sample_encounter.npcs[0].id or True  # verify via _tab_title
    from gui.main_window import MainWindow
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    title = win.tabs.tabText(0)
    assert "5 ·" in title

def test_ctrl_n_jumps_to_combatant_by_id(qtbot, sample_encounter):
    from gui.main_window import MainWindow
    # Give the NPC id "3"
    sample_encounter.npcs[0].id = "3"
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    win.show()
    win._jump_to_combatant_by_id("3")
    assert win.tabs.currentIndex() == 0
```

**Phase 3 test strategy:** `pytest combat-runner/tests/test_npc_tab_players.py combat-runner/tests/test_widget_command_input.py combat-runner/tests/test_main_window_players.py`

---

## Phase 4 — Command pipeline and LLM review

**Goal:** Every state-changing command (fast path already applied) is
asynchronously reviewed by the LLM. Revisions auto-apply. The `apply_command`
tool lets the LLM issue commands through the same parser. All tests use a fake
Anthropic client (no real API calls).

### Task 4.1 — Directed-command fast path in `gui/main_window.py`

**File:** `combat-runner/gui/main_window.py`

**Change:** Add `_on_directed_command` — handles fast-path application of
directed commands (routes from active tab via `directed_command_requested`
signal):

```python
def _on_directed_command(self, parsed) -> None:
    """Fast path for directed commands: apply effect to target, log on actor tab,
    refresh target tab, then enqueue LLM review."""
    from .dispatcher import InputKind

    actor = self.encounter_state.active_npc
    actor_name = actor.name if actor else "?"

    # JUMP: just focus the target tab
    if parsed.kind is InputKind.JUMP:
        target = self.encounter_state.combatant_by_id(parsed.target_id)
        if target is not None:
            idx = self.encounter_state.npcs.index(target)
            self.tabs.setCurrentIndex(idx)
        return

    if parsed.kind is not InputKind.DIRECTED:
        return

    # Resolve target
    target = self.encounter_state.combatant_by_id(parsed.target_id)
    if target is None:
        # Unknown id — log error on actor tab and enqueue LLM fallback
        self._append_to_active_tab(
            f"<span style='color:#ff5252'>unknown combatant id: #{parsed.target_id}</span>"
        )
        self._on_llm_fallback(parsed.raw, parsed)
        return

    direction = parsed.resolved_tags.get("direction", "damage")
    amount = parsed.amount
    dtype = parsed.resolved_tags.get("type")
    delivery = parsed.resolved_tags.get("delivery")
    member = parsed.target_member

    # Apply fast-path effect
    if direction == "heal":
        result = target.apply_heal(amount, member=member)
    else:
        result = target.apply_damage(amount, member=member)

    # Set in_melee on both actor and target if delivery==melee
    if delivery == "melee":
        target.in_melee = True
        if actor is not None:
            actor.in_melee = True

    # Build log line on the ACTOR's tab
    dtype_str = f" {dtype}" if dtype else ""
    delivery_str = f" ({delivery})" if delivery else ""
    suffix = ""
    if direction == "damage":
        suffix = " · **killed**" if result.get("killed") else ""
        log_html = (
            f"<span style='color:#8a8f96'>{actor_name} → #{parsed.target_id}:</span> "
            f"<span style='color:#ff5252'>−{amount}{dtype_str}{delivery_str}</span>"
            f" → HP {result.get('after', '?')}/{target.max_hp}{suffix}"
        )
    else:
        log_html = (
            f"<span style='color:#8a8f96'>{actor_name} → #{parsed.target_id}:</span> "
            f"<span style='color:#66bb6a'>+{amount}</span>"
            f" → HP {result.get('after', '?')}/{target.max_hp}"
        )
    self._append_to_active_tab(log_html)

    # Refresh target tab + fire events
    target_idx = self.encounter_state.npcs.index(target)
    target_tab = self.tabs.widget(target_idx)
    if hasattr(target_tab, "refresh"):
        target_tab.refresh()
    self.tabs.setTabText(target_idx, self._tab_title(target))
    self._auto_save()

    # Fire events
    if self.event_bus:
        if direction == "damage":
            from .event_bus import damage_event, bloodied_event, death_event
            self.event_bus.emit(damage_event(
                target.slug, amount, damage_type=dtype,
                melee=(delivery == "melee"), ranged=(delivery == "ranged"),
            ))
            if result.get("became_bloodied"):
                self.event_bus.emit(bloodied_event(target.slug))
            if result.get("killed"):
                self.event_bus.emit(death_event(target.slug))
        else:
            from .event_bus import heal_event
            self.event_bus.emit(heal_event(target.slug, amount))

    # Enqueue LLM review
    if parsed.tag_errors:
        # Unknown tags → full LLM fallback (may be free-form intent)
        self._on_llm_fallback(parsed.raw, parsed)
    else:
        self._enqueue_review(parsed.raw, actor, target, applied_direction=direction,
                             applied_amount=amount)


def _append_to_active_tab(self, html: str) -> None:
    """Append an HTML line to the currently-active tab's log view."""
    current = self.tabs.currentWidget()
    if current is not None and hasattr(current, "_append_log"):
        current._append_log(html)
```

**Change:** Add `_on_review_needed` handler (for self-targeting commands from
NPCTab):

```python
def _on_review_needed(self, raw_command: str, actor_npc) -> None:
    """Route regular (self-targeting) command to LLM review queue."""
    self._enqueue_review(raw_command, actor_npc, actor_npc, applied_direction=None,
                         applied_amount=None)
```

**Change:** Add `_enqueue_review`:

```python
def _enqueue_review(
    self, raw_command: str, actor, target, *,
    applied_direction: str | None, applied_amount: int | None
) -> None:
    """Enqueue an async LLM review for any state-changing command.
    No-ops if no LLM controller is wired."""
    controller = getattr(self, "_llm_controller", None)
    if controller is None:
        return

    actor_snapshot = {
        "id": actor.id if actor else None,
        "name": actor.name if actor else "?",
        "slug": actor.slug if actor else None,
    }
    target_snapshot = {
        "id": target.id,
        "name": target.name,
        "slug": target.slug,
        "hp": target.hp,
        "max_hp": target.max_total_hp,
        "conditions": sorted(target.conditions),
        "in_melee": target.in_melee,
    }
    log_tail = self._last_log_tail(self.encounter_state.log_path, lines=8)

    signals = _LLMWorkerSignals()
    signals.dispatch_requested.connect(
        self._on_llm_dispatch_requested, Qt.ConnectionType.QueuedConnection
    )
    signals.finished.connect(
        lambda result, rt=target: self._on_review_finished(result, rt),
        Qt.ConnectionType.QueuedConnection,
    )
    self._llm_run_signals = signals  # keep reference

    worker = _LLMReviewWorker(
        controller=controller,
        raw_command=raw_command,
        actor=actor_snapshot,
        target=target_snapshot,
        applied_direction=applied_direction,
        applied_amount=applied_amount,
        log_tail=log_tail or "",
        signals=signals,
    )
    self._llm_pool.start(worker)


def _on_review_finished(self, result, target_npc) -> None:
    """GUI-thread slot: review returned. Refresh the target tab."""
    for i in range(self.tabs.count()):
        t = self.tabs.widget(i)
        if hasattr(t, "refresh"):
            t.refresh()
        if hasattr(t, "npc_state") and t.npc_state is target_npc:
            self.tabs.setTabText(i, self._tab_title(target_npc))
    if result.error:
        self.statusBar().showMessage(f"review error: {result.error}", 3000)
    self.llm_run_finished.emit(result)
```

**Change:** Add `_LLMReviewWorker` class (analogous to `_LLMRunWorker`):

```python
class _LLMReviewWorker(QRunnable):
    """Off-thread LLM review of an already-applied command."""

    def __init__(
        self, controller, raw_command: str, actor: dict, target: dict,
        applied_direction: str | None, applied_amount: int | None,
        log_tail: str, signals: _LLMWorkerSignals,
    ) -> None:
        super().__init__()
        self._controller = controller
        self._raw = raw_command
        self._actor = actor
        self._target = target
        self._direction = applied_direction
        self._amount = applied_amount
        self._log_tail = log_tail
        self._signals = signals
        self.setAutoDelete(True)

    def _marshalled_dispatch(self, tool_uses):
        holder: dict = {}
        done = threading.Event()
        self._signals.dispatch_requested.emit(tool_uses, holder, done)
        done.wait()
        if "error" in holder:
            raise RuntimeError(holder["error"])
        return holder.get("result", [])

    def run(self) -> None:
        try:
            result = self._controller.review_command(
                raw=self._raw,
                actor=self._actor,
                target=self._target,
                applied_direction=self._direction,
                applied_amount=self._amount,
                log_tail=self._log_tail,
                dispatch_fn=self._marshalled_dispatch,
            )
        except Exception as exc:  # noqa: BLE001
            from .llm_controller import RunResult
            result = RunResult(error=f"review crashed: {exc}")
        self._signals.finished.emit(result)
```

---

### Task 4.2 — Review mode in `gui/llm_controller.py`

**File:** `combat-runner/gui/llm_controller.py`

**Change 1:** Add the `apply_command` tool definition to `_build_tool_definitions`:

```python
{
    "name": "apply_command",
    "description": (
        "Run a command string through the same parser the dispatcher uses "
        "and apply its effect to the encounter state. "
        "Use this when the review determines the fast-path result was wrong "
        "or when interpreting a free-form command (e.g. '33 is taunted'). "
        "The command is validated identically to DM-typed input. "
        "Returns the parsed result and any errors."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "Command string, e.g. '3 12 fire' or '5 10 heal'"},
            "target_slug": {"type": "string", "description": "NPC slug for the target (required to route the effect)"},
        },
        "required": ["command", "target_slug"],
    },
},
```

**Change 2:** Add `_tool_apply_command` implementation:

```python
def _tool_apply_command(bundle: _StateBundle, command: str, target_slug: str) -> dict[str, Any]:
    """Validate and apply a command string via the same dispatcher path the DM uses."""
    from .dispatcher import Dispatcher, InputKind
    from .command_tags import resolve_tags
    d = Dispatcher()
    parsed = d.parse(command)
    npc = _find_npc(bundle.encounter, target_slug)
    if npc is None:
        return {"ok": False, "error": f"NPC not found: {target_slug}"}
    if parsed.kind is InputKind.DIRECTED:
        direction = parsed.resolved_tags.get("direction", "damage")
        if direction == "heal":
            result = npc.apply_heal(parsed.amount)
        else:
            result = npc.apply_damage(parsed.amount)
        bundle.notify()
        return {"ok": True, "applied": result, "direction": direction,
                "hp_now": npc.hp, "parsed_tags": parsed.resolved_tags}
    elif parsed.kind is InputKind.DAMAGE:
        result = npc.apply_damage(parsed.amount)
        bundle.notify()
        return {"ok": True, "applied": result, "hp_now": npc.hp}
    elif parsed.kind is InputKind.HEAL:
        result = npc.apply_heal(parsed.amount)
        bundle.notify()
        return {"ok": True, "applied": result, "hp_now": npc.hp}
    elif parsed.kind is InputKind.CONDITION:
        npc.add_condition(parsed.condition)
        bundle.notify()
        return {"ok": True, "condition_added": parsed.condition}
    else:
        return {"ok": False, "error": f"command did not parse as actionable: kind={parsed.kind.value}"}
```

**Change 3:** Register in `_build_tool_dispatch_table`:

```python
"apply_command": lambda **kw: _tool_apply_command(bundle, **kw),
```

**Change 4:** Add `REVIEW_SYSTEM_PROMPT` and `review_command` method to
`LLMController`:

```python
REVIEW_SYSTEM_PROMPT = (
    "You are an at-table D&D 5.5e combat reviewer. A DM just typed a command; "
    "the fast path already applied the deterministic effect. Your job:\n"
    "  1. Verify the effect was correct (check resistances, immunities, tags).\n"
    "  2. If the target has a resistance or immunity that changes the result, "
    "     call apply_command or set_hp to revise it, then reply with "
    "     '⟳ review: <short explanation>'.\n"
    "  3. If the command is free-form ('33 is taunted'), interpret it: "
    "     prefer add_condition for condition-like input, else add_log_entry.\n"
    "  4. If everything looks correct, stay silent (return no text, no tools).\n"
    "  5. Never block on uncertainty — if you're unsure, stay silent.\n"
    "Be concise. One tool call maximum. One sentence if you say anything."
)

def review_command(
    self,
    raw: str,
    actor: dict,
    target: dict,
    applied_direction: str | None,
    applied_amount: int | None,
    log_tail: str,
    dispatch_fn=None,
) -> "RunResult":
    """Async review of an already-applied command. Blocking — run off-thread."""
    client = self._ensure_client()
    if client is None:
        return RunResult(error="no API key")

    actor_desc = f"{actor.get('name', '?')} (id={actor.get('id', '?')})"
    target_desc = (
        f"{target.get('name', '?')} (id={target.get('id', '?')}, "
        f"HP {target.get('hp', '?')}/{target.get('max_hp', '?')}, "
        f"conditions={target.get('conditions', [])}, "
        f"in_melee={target.get('in_melee', False)})"
    )
    applied_desc = (
        f"{applied_direction} {applied_amount}" if applied_direction else "(fast path: no direct mutation)"
    )
    user_msg = (
        f"Actor: {actor_desc}\n"
        f"Target: {target_desc}\n"
        f"Command typed: {raw!r}\n"
        f"Fast path applied: {applied_desc}\n"
        f"Recent log:\n{log_tail}"
    )

    messages = [{"role": "user", "content": user_msg}]
    return self._chat_loop(
        client, messages,
        system_override=self.REVIEW_SYSTEM_PROMPT,
        dispatch_fn=dispatch_fn,
    )
```

**Change 5:** Update `_chat_loop` to accept an optional `system_override`
parameter (uses `SYSTEM_PROMPT` by default):

```python
def _chat_loop(
    self, client, messages, dispatch_fn=None, system_override: str | None = None,
) -> RunResult:
    prompt_text = system_override if system_override is not None else self.SYSTEM_PROMPT
    # … replace self.SYSTEM_PROMPT with prompt_text in the messages.create call …
```

**Change 6:** When the review calls any state-mutation tool, the result log line
must appear on the actor's tab. The review worker's `_on_review_finished` in
MainWindow already refreshes tabs — but we also need the `⟳ review:` log line.
Add a hook: after the `_chat_loop` completes and `final_text` is non-empty,
call `_tool_add_log_entry(bundle, text=f"⟳ review: {final_text}", kind="review")`.
Do this only in `review_command`, not in `run`:

```python
# At the end of review_command, after _chat_loop returns:
result = self._chat_loop(client, messages, system_override=..., dispatch_fn=dispatch_fn)
if result.text and not result.error:
    _tool_add_log_entry(self._bundle, f"⟳ review: {result.text}", kind="review")
return result
```

**Test:** Add `combat-runner/tests/test_review_pipeline.py`:

```python
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

@pytest.fixture
def controller_with_fake_client(sample_encounter):
    from gui.llm_controller import LLMController

    fake_client = MagicMock()
    # Default: review returns silently (no text, no tools)
    resp = MagicMock()
    resp.stop_reason = "end_turn"
    resp.content = []
    fake_client.messages.create.return_value = resp

    ctrl = LLMController(
        encounter_state=sample_encounter,
        log_path=str(sample_encounter.log_path),
        client=fake_client,
    )
    return ctrl, fake_client


def test_review_command_calls_api(controller_with_fake_client):
    ctrl, fake_client = controller_with_fake_client
    ctrl.review_command(
        raw="5 12 fire",
        actor={"id": "1", "name": "Vessa", "slug": "pc-1"},
        target={"id": "5", "name": "Goblin", "slug": "goblin",
                "hp": 7, "max_hp": 7, "conditions": [], "in_melee": False},
        applied_direction="damage", applied_amount=12,
        log_tail="",
    )
    assert fake_client.messages.create.called


def test_review_silent_returns_no_error(controller_with_fake_client):
    ctrl, _ = controller_with_fake_client
    result = ctrl.review_command(
        raw="5 12", actor={"id": "1", "name": "A", "slug": "a"},
        target={"id": "5", "name": "B", "slug": "b",
                "hp": 10, "max_hp": 10, "conditions": [], "in_melee": False},
        applied_direction="damage", applied_amount=12, log_tail="",
    )
    assert result.error is None


def test_apply_command_tool_heals_npc(sample_encounter):
    from gui.llm_controller import _tool_apply_command, _StateBundle
    npc = sample_encounter.npcs[0]
    npc.apply_damage(50)  # damage to 34 HP
    bundle = _StateBundle(encounter=sample_encounter, log_path="/tmp/l.md")
    result = _tool_apply_command(bundle, command="+10", target_slug=npc.slug)
    assert result["ok"]
    assert npc.hp == 44


def test_apply_command_tool_damages_npc(sample_encounter):
    from gui.llm_controller import _tool_apply_command, _StateBundle
    npc = sample_encounter.npcs[0]
    bundle = _StateBundle(encounter=sample_encounter, log_path="/tmp/l.md")
    result = _tool_apply_command(bundle, command="1 20", target_slug=npc.slug)
    assert result["ok"]
    assert npc.hp == 64  # 84 - 20


def test_apply_command_unknown_npc_returns_error(sample_encounter):
    from gui.llm_controller import _tool_apply_command, _StateBundle
    bundle = _StateBundle(encounter=sample_encounter, log_path="/tmp/l.md")
    result = _tool_apply_command(bundle, command="1 5", target_slug="no-such-npc")
    assert not result["ok"]
    assert "not found" in result["error"]


def test_main_window_enqueues_review_for_state_commands(qtbot, sample_encounter):
    """When a tab emits review_needed, MainWindow starts a review worker IF
    an LLM controller is wired. With with_llm=False, the enqueue is a no-op."""
    from gui.main_window import MainWindow
    sample_encounter.npcs[0].id = "1"
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    # With no LLM controller, _enqueue_review is a no-op (no crash).
    win._enqueue_review("−18", sample_encounter.npcs[0], sample_encounter.npcs[0],
                        applied_direction="damage", applied_amount=18)


def test_main_window_not_review_for_note(qtbot, sample_encounter):
    """note commands must not enqueue review."""
    from gui.main_window import MainWindow
    from gui.dispatcher import InputKind, ParsedInput
    sample_encounter.npcs[0].id = "1"
    win = MainWindow(sample_encounter)
    qtbot.addWidget(win)
    reviewed = []
    original = win._enqueue_review
    win._enqueue_review = lambda *a, **kw: reviewed.append(1)
    tab = win.tabs.widget(0)
    tab._on_submitted("note this is a test")
    assert reviewed == []
    win._enqueue_review = original
```

**Phase 4 test strategy:** `pytest combat-runner/tests/test_review_pipeline.py`
— uses fake Anthropic client, no real API calls.

---

## Phase 5 — Events, opportunity attacks, and PC participation

**Goal:** PC events fire correctly. Retreat → OA prompt via `ReactionPromptDialog`.
`in_melee` is set by melee-tagged directed commands. Existing events
(`bloodied`, `dead`, `round`) fire for PCs via Approach 1 (free — they're
already in the shared list).

### Task 5.1 — Opportunity attack prompt wiring in `gui/main_window.py`

**File:** `combat-runner/gui/main_window.py`

**Change:** Subscribe to `move_away` events in `_build_central` and wire the
OA prompt:

```python
self.event_bus.subscribe("move_away", self._on_move_away_event)
```

**Change:** Add handler:

```python
def _on_move_away_event(self, event) -> None:
    """When a combatant retreats while in_melee, prompt for opportunity attack.
    Any NPC with a melee attack action is a candidate."""
    if self._handling_event:
        return
    retreating_id = event.payload.get("combatant_id", "?")
    retreating_name = self._npc_display_name(event.subject_npc)
    summary = f"{retreating_name} (#{retreating_id}) retreated — opportunity attack?"
    # Collect NPC candidates (any NPC with a melee-type action who's in melee
    # or adjacent). For simplicity, offer ALL NPCs with attack actions.
    candidates = []
    for npc in self.encounter_state.npcs:
        if npc.kind == "npc" and not npc.is_dead and not npc.reaction_used:
            actions = self._tab_action_surfaces.get(
                self._tab_key_for_slug(npc.slug), []  # type: ignore[arg-type]
            )
            atk = next((a for a in actions
                        if a.get("type") in ("single_attack", "multiattack")), None)
            if atk:
                candidates.append((npc.slug, atk["action"], "melee opportunity attack", 0.8))
    if not candidates:
        return
    self._handling_event = True
    try:
        choice = self._reaction_prompt_handler(summary, candidates)
        if choice and choice.triggered:
            self._fire_matched_reaction(choice.npc_slug, choice.action_name)
    finally:
        self._handling_event = False
```

### Task 5.2 — `spell_cast` counterspell trigger wiring

**Verify (no code change needed):** The existing `TriggerMatcher` already
handles `spell_cast` events with `scope: "global"` — this is documented in the
existing README ("Counterspell" example). PC spell casts fire `spell_cast_event`
from `_player_action_cast` (added in Phase 3, Task 3.1). Since PC combatants
are in the same `encounter_state.npcs` list, the `collect_triggers_from_db`
call in `_build_central` already picks up any NPC with a global `spell_cast`
trigger.

**Verify:** Confirm that `_build_event_summary` in `main_window.py` handles
`spell_cast` — it already does (line 703–706 of the current file). No change
needed.

### Task 5.3 — `in_melee` flag from directed commands

The directed-command fast path in Task 4.1 already sets `in_melee = True` on
both actor and target when `delivery == "melee"`. Confirm this path also fires
for self-targeting commands:

**Change:** In `NPCTab._apply_damage`, when `dtype` matches any delivery tag
(specifically when the raw command contains "melee"), set `in_melee`:

For now this is intentionally limited: only **directed** commands (via
MainWindow) set `in_melee` from the `melee` tag. Self-targeting `-18 melee` on
an NPC tab does not currently set `in_melee` (the NPC's own damage sigil
doesn't carry actor/target directionality). This is an acceptable scope limit
per the spec: "A mob is one combatant with one id; melee flag from a
melee-tagged directed command."

### Task 5.4 — PC participation in existing events

**Verify (no code change needed):** By placing PC combatants in
`encounter_state.npcs` (Approach 1), the following events already work for
PCs for free:

- `bloodied_event` — fired in `NPCTab._apply_damage` when `became_bloodied`;
  since PCs have their own tabs, their HP changes fire this. ✓
- `death_event` — same path. ✓
- `round_advanced` — `NPCTab._on_round_event` is wired to every tab, including
  PC tabs (via `event_bus.subscribe("round_advanced", …)` in `NPCTab.__init__`).
  Condition durations tick for PCs. ✓
- `condition_applied/removed` — NPCTab fires these for both kinds. ✓

**Test:** Add `combat-runner/tests/test_events_players.py`:

```python
import pytest
from pathlib import Path


@pytest.fixture
def pc_npc():
    from gui.state import NPCState
    return NPCState(
        slug="pc-1", name="Vessa", max_hp=31, ac=15,
        speed="30 ft.", cr=0.0, kind="pc", id="1", in_melee=True,
    )


@pytest.fixture
def npc_with_attack():
    from gui.state import NPCState
    return NPCState(slug="goblin", name="Goblin", max_hp=7, ac=13, speed="30ft", cr=0.25)


def test_pc_bloodied_event_fires(qtbot, pc_npc):
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab
    bus = EventBus()
    received = []
    bus.subscribe("bloodied", received.append)
    tab = NPCTab(npc_state=pc_npc, actions=[], log_path=Path("/tmp/log.md"), event_bus=bus)
    qtbot.addWidget(tab)
    # Damage to below half
    tab._on_submitted("-20")  # 31 - 20 = 11, which is < 15.5
    assert len(received) == 1
    assert received[0].subject_npc == "pc-1"


def test_pc_death_event_fires(qtbot, pc_npc):
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab
    bus = EventBus()
    received = []
    bus.subscribe("death", received.append)
    tab = NPCTab(npc_state=pc_npc, actions=[], log_path=Path("/tmp/log.md"), event_bus=bus)
    qtbot.addWidget(tab)
    tab._on_submitted("-100")
    assert len(received) == 1


def test_retreat_fires_move_away_when_in_melee(qtbot, pc_npc):
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab
    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)
    tab = NPCTab(npc_state=pc_npc, actions=[], log_path=Path("/tmp/log.md"), event_bus=bus)
    qtbot.addWidget(tab)
    assert pc_npc.in_melee  # fixture sets this
    tab._on_player_action("Retreat")
    assert len(received) == 1
    assert received[0].payload["combatant_id"] == "1"


def test_retreat_not_in_melee_no_event(qtbot, pc_npc):
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab
    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)
    pc_npc.in_melee = False
    tab = NPCTab(npc_state=pc_npc, actions=[], log_path=Path("/tmp/log.md"), event_bus=bus)
    qtbot.addWidget(tab)
    tab._on_player_action("Retreat")
    assert received == []


def test_cast_fires_spell_cast_event(qtbot, pc_npc, monkeypatch):
    """Simulate the Cast dialog accepting 'Fireball' at level 3."""
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab
    from PySide6.QtWidgets import QDialog
    bus = EventBus()
    received = []
    bus.subscribe("spell_cast", received.append)
    tab = NPCTab(npc_state=pc_npc, actions=[], log_path=Path("/tmp/log.md"), event_bus=bus)
    qtbot.addWidget(tab)
    # Monkeypatch the dialog to auto-accept with a spell name
    def fake_cast(self_tab):
        from gui.event_bus import spell_cast_event
        self_tab.event_bus.emit(spell_cast_event("1", "Fireball", spell_level=3))
    monkeypatch.setattr(NPCTab, "_player_action_cast", fake_cast)
    tab._on_player_action("Cast")
    assert len(received) == 1
    assert received[0].payload["spell_name"] == "Fireball"
    assert received[0].payload["spell_level"] == 3


def test_round_event_ticks_pc_conditions(qtbot, pc_npc):
    from gui.event_bus import EventBus, round_event
    from gui.npc_tab import NPCTab
    bus = EventBus()
    pc_npc.add_condition("dodging", duration=1)
    tab = NPCTab(npc_state=pc_npc, actions=[], log_path=Path("/tmp/log.md"), event_bus=bus)
    qtbot.addWidget(tab)
    bus.emit(round_event(2))
    assert "dodging" not in pc_npc.conditions  # expired after 1 round
```

**Phase 5 test strategy:**
`pytest combat-runner/tests/test_events_players.py`

---

## Cross-cutting test strategy

Run the full suite after every phase to catch regressions:

```bash
make combat-test
```

which expands to (from the repo root):

```bash
QT_QPA_PLATFORM=offscreen PYTHONPATH=combat-runner \
  .venv/bin/python -m pytest combat-runner/tests/ -v
```

### Phases and their new test files

| Phase | New test files | Notes |
|-------|---------------|-------|
| 1 | `test_state_players.py`, `test_command_tags.py`, `test_dispatcher_directed.py`, `test_event_bus.py` (appended) | Pure Python, no Qt |
| 2 | `test_party_loader.py`, `test_app_party.py`, `test_encounter_picker_players.py` | pytest-qt for picker test |
| 3 | `test_npc_tab_players.py`, `test_widget_command_input.py` (appended), `test_main_window_players.py` | pytest-qt, offscreen |
| 4 | `test_review_pipeline.py` | Fake Anthropic client |
| 5 | `test_events_players.py` | pytest-qt, offscreen |

### Fake Anthropic client pattern

All LLM tests use a `MagicMock` client, never real API calls:

```python
from unittest.mock import MagicMock
fake_client = MagicMock()
resp = MagicMock()
resp.stop_reason = "end_turn"
resp.content = []
fake_client.messages.create.return_value = resp
```

Construct `LLMController(..., client=fake_client)`.

---

## Dependency order (strict)

```
Phase 1 (state.py, command_tags.py, dispatcher.py, event_bus.py)
  └── Phase 2 (encounter_picker.py, app.py, world/party/…)
       └── Phase 3 (npc_tab.py, command_input.py, main_window.py tab titles+shortcuts)
            └── Phase 4 (main_window.py pipeline, llm_controller.py review)
                 └── Phase 5 (main_window.py OA wiring, events verification)
```

Phases 2 and 3 have no interdependencies and can be developed in parallel by
two agents if desired, but their tests both require Phase 1 to be complete.

---

## Explicit non-changes (do NOT touch these)

- `combat-runner/launch.py` — legacy CLI; spec says no migration
- `gui/suggestion_driver.py` — unchanged; suggestion bar works as-is for NPCs
  and PCs share the same bar mechanism
- `gui/widgets/hp_bar.py`, `gui/widgets/action_chips.py`,
  `gui/widgets/reaction_prompt.py`, `gui/widgets/suggestion_bar.py` —
  unchanged; existing widgets are reused unchanged
- `.cache/`, `.output/`, `.venv/` — never read or modified by this feature

---

## Risk notes (from spec §Open risks, with mitigation in the plan)

1. **LLM cost per command** — `review_command` uses `claude-haiku-4-5-20251001`
   (same model as existing LLM) with a tight prompt and prompt caching on the
   system prompt. The review prompt is ≤ 200 tokens of context.

2. **Auto-revision surprises** — every revision writes a `⟳ review:` log line
   (Task 4.2). The actor's tab shows this prominently.

3. **`npc_tab.py` size** — the `kind` branch is confined to `_build_sheet_panel`
   (one `if`/`else`) and two helper methods. The rest of the file is unchanged.
   This is consistent with the spec's note: "the kind-branch is contained to the
   action-area builder only."

---

## Known follow-ups (post-merge review)

Sourced from the 10-agent review (2026-05-22). Items addressed in the current
fix round (snapshot field-drop, roster id validation, skipped-result handling,
signed-amount reject, `_disengaging` lifecycle, stale-review clobber, schema
trim, `_LLMWorkerBase` extraction, verb fuzzy-match, ruff cleanup, and docs) are
**not** listed here. The following remain genuinely open:

| ID | Severity | Item | Suggested location |
|----|----------|------|--------------------|
| **F1** | Medium | **Latent double-OA-prompt:** if a `move_away` *reaction* is ever authored in `actions.jsonl`, the retreat path fires both the deterministic OA prompt in `_on_move_away_event` and the authored reaction. No such NPC reaction exists today — purely latent. | `# TODO(combat-players):` at `main_window._on_move_away_event` |
| **F2** | Medium | **`review_needed` fires after a failed `_run_action`:** a no-op or failed action still enqueues a paid LLM review. The review receives stale/incorrect context. | `# TODO(combat-players):` at the `_run_action`/`review_needed` emit site in `npc_tab.py` |
| **F3** | High | **No end-to-end test for the directed-command signal chain:** the `NPCTab.directed_command_requested` → `MainWindow._on_directed_command` apply seam has no integration test. A `test_directed_command.py` covering at least one DIRECTED→apply→log cycle is needed. | New `combat-runner/tests/test_directed_command.py` |
| **F4** | Medium | **`Ctrl+0` not wired:** the shortcut loop in `main_window.py` iterates `"123456789"`, so the combatant holding id `"0"` (the 10th single-press id) has no keyboard jump shortcut. Either wire `Ctrl+0` or keep the documented gap. | `main_window._wire_shortcuts` |
| **F5** | High | **Spec §7 divergence — player-action verb fuzzy-match not delivered:** spec §7 says generic player actions are "also reachable by verb fuzzy-match". PC tabs are constructed with `actions=[]`, so typed verbs fall through to the LLM; only chip clicks work. Either wire a player-action verb table or update spec §7 to reflect the descope. | spec §7 annotation + optional `npc_tab._build_player_action_area` wiring |
| **F6** | High | **Review tool schema is too wide:** the ~2,100-token full tool schema ships on every async review call; ~90% of tools are irrelevant to a single-command review. Build a narrow 4-tool review schema and anchor the prompt-cache breakpoint on its last tool. | `llm_controller.py` review prompt construction |
| **F7** | High | **Review queue unbounded and single-threaded:** after a fast burst of commands, `⟳ review:` lines land 20–40s stale. Add per-target debounce/coalesce, a queue depth cap, and a status-bar depth indicator. | `llm_controller.py` / `main_window.py` review enqueue |
| **F8** | High | **`_LLMReviewWorker` / `_LLMRunWorker` are near-clones:** ~50 lines duplicated including an identical `_marshalled_dispatch`. Extract a `_LLMWorkerBase` and make `_run_tool_calls` a local of `_chat_loop` to remove the implicit single-pool-invariant shared-state assumption. | `llm_controller.py` |
| **F9** | Medium | **Stale-review `set_hp` clobber:** the review worker freezes target HP in a snapshot at enqueue time; `set_hp` writes absolute values. A late-returning review can silently undo a newer manual HP edit. Apply revisions as a delta, or stamp with a state-generation counter. Zero test coverage on the revision path. | `llm_controller.py` review application path + `# TODO(combat-players):` |
