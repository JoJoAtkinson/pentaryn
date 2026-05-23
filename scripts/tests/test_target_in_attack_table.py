"""Per-attack target names must appear in the rendered attack table.

A DM scanning the log needs to know which to-hit value to compare against
which target's AC. When `roll_combat_action` is called with a `target_names`
list, each attack line in the table surfaces `→ <name>`. With no target_names
(or for area/utility actions where targets are diffuse), the existing
no-decoration shape is preserved.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dnd_roller import roll_combat_action  # noqa: E402


def _attack_lines(output: str) -> list[str]:
    """Extract attack table rows from the rendered markdown output."""
    # Lines that look like `Shrine-Axe 1 to-hit  19 / dmg  12 slashing  …`
    lines = []
    inside_code = False
    for line in output.split("\n"):
        if line.strip() == "```":
            inside_code = not inside_code
            continue
        if inside_code and "to-hit" in line and "dmg" in line:
            lines.append(line)
    return lines


def test_target_name_appears_on_each_multiattack_line():
    raw = roll_combat_action(
        npc="shrine-touched-derro", action="multiattack",
        target_names=["Bazgar"],
    )
    parsed = json.loads(raw)
    rows = _attack_lines(parsed["output"])
    assert rows, f"no attack table rows found in:\n{parsed['output']}"
    for row in rows:
        assert "→ Bazgar" in row, f"row missing target arrow: {row!r}"


def test_no_target_names_preserves_existing_shape():
    raw = roll_combat_action(npc="shrine-touched-derro", action="multiattack")
    parsed = json.loads(raw)
    rows = _attack_lines(parsed["output"])
    assert rows
    for row in rows:
        assert "→" not in row, (
            f"target arrow appeared without target_names kwarg: {row!r}"
        )


def test_empty_target_names_list_preserves_existing_shape():
    raw = roll_combat_action(
        npc="shrine-touched-derro", action="multiattack", target_names=[],
    )
    parsed = json.loads(raw)
    rows = _attack_lines(parsed["output"])
    assert rows
    for row in rows:
        assert "→" not in row, (
            f"target arrow appeared with empty target_names list: {row!r}"
        )


def test_single_attack_gets_target_too():
    raw = roll_combat_action(
        npc="deep-watch-derro", action="crossbow",
        target_names=["Marwen"],
    )
    parsed = json.loads(raw)
    rows = _attack_lines(parsed["output"])
    assert len(rows) == 1
    assert "→ Marwen" in rows[0]


def test_multiple_targets_distribute_per_attack():
    """When the DM splits a multiattack across two targets, each attack line
    shows its own target. Beholder multiattack = 3 attacks. With 2 target
    names, the convention is: each attack takes the i-th name, last name
    repeats for any overflow (so [A, B] over 3 attacks = A, B, B).
    """
    raw = roll_combat_action(
        npc="beholder-thrulm", action="multiattack",
        target_names=["Bazgar", "Marwen"],
    )
    parsed = json.loads(raw)
    rows = _attack_lines(parsed["output"])
    assert len(rows) == 3
    assert "→ Bazgar" in rows[0]
    assert "→ Marwen" in rows[1]
    assert "→ Marwen" in rows[2]  # overflow takes the LAST name


def test_target_names_do_not_leak_into_to_hits_line():
    """The arrow decoration belongs on the attack table only, not the
    `_to-hits:_` quantum-narrative line."""
    raw = roll_combat_action(
        npc="shrine-touched-derro", action="multiattack",
        target_names=["Bazgar"],
    )
    parsed = json.loads(raw)
    m = re.search(r"_to-hits:_(.+)", parsed["output"])
    assert m
    assert "Bazgar" not in m.group(1)
