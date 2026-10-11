"""Stage 0 ⇄ Stage 1: what the actions validator accepts vs what build_actors builds.

python-tooling-45. combat_actions_db.py writes foundry/actions.jsonl; build_actors.py
reads it. Nothing tied their grammars together, so these pins make the drift visible.
Narrowing the validator to the build grammar is deferred to Joe (tooling-lane §3 item 4);
until then the two KNOWN gaps below are pinned as they are.
"""

from __future__ import annotations

import json

import pytest

from scripts import combat_actions_db as cdb
from scripts.foundry import build_actors as ba

# KNOWN (python-tooling-45): a refresh period the validator accepts and the build
# rejects with `BuildError: unknown slots.refresh`.
KNOWN_UNBUILDABLE_REFRESH = {"turn"}


def test_every_valid_refresh_is_buildable_or_known():
    """Fails when someone adds a period on one side only."""
    for refresh in cdb._VALID_SLOT_REFRESH:
        assert refresh in ba.REFRESH_TO_PERIOD or refresh in KNOWN_UNBUILDABLE_REFRESH, refresh
    assert set(ba.REFRESH_TO_PERIOD) <= cdb._VALID_SLOT_REFRESH


def test_known_unbuildable_refresh_is_still_accepted_and_still_unbuildable():
    for refresh in KNOWN_UNBUILDABLE_REFRESH:
        assert refresh in cdb._VALID_SLOT_REFRESH
        assert refresh not in ba.REFRESH_TO_PERIOD


def _area(dice: str) -> dict:
    return {"type": "area", "narration": "n", "area": "20ft cone",
            "damage": {"dice": dice, "type": "fire"}, "save": {"dc": 15, "ability": "dex"}}


@pytest.mark.parametrize("dice", ["2d6", "1d20", " 2d6 "])
def test_dice_both_sides_accept(dice):
    assert cdb.validate_spec(_area(dice)) == []
    assert ba.parse_dice(dice, "t") == tuple(int(x) for x in dice.strip().split("d"))


# KNOWN (python-tooling-45): case-insensitive `D` and inner spaces validate, but
# parse_dice's `(\d+)d(\d+)` fullmatch refuses them, so the row breaks the build.
@pytest.mark.parametrize("dice", ["2D6", "2 d 6"])
def test_known_dice_drift_validates_but_does_not_build(dice):
    assert cdb.validate_spec(_area(dice)) == []
    with pytest.raises(ba.BuildError):
        ba.parse_dice(dice, "t")


def _real_rows() -> list[dict]:
    return [json.loads(line) for line in
            ba.ACTIONS_DB.read_text(encoding="utf-8").splitlines() if line.strip()]


@pytest.mark.repo
def test_every_real_row_validates_and_builds():
    rows = _real_rows()
    assert rows, "foundry/actions.jsonl is empty"
    for row in rows:
        where = f"{row.get('npc')}.{row.get('action')}"
        spec = {k: v for k, v in row.items() if k not in ("npc", "action", "updated_at")}
        assert cdb.validate_spec(spec) == [], where
        ba.ItemBuilder(row, {}).build()            # raises BuildError on a grammar gap


def test_validator_types_equal_build_row_types():
    assert set(cdb.ACTION_TYPES) == set(ba.ROW_TYPES)


def test_public_vocabulary_mirrors_the_private_sets():
    assert cdb.ACTION_TYPES == cdb._VALID_TYPES
    assert cdb.SLOT_REFRESH == cdb._VALID_SLOT_REFRESH
    assert cdb.DICE_RE is cdb._DICE_SPEC_RE


GOOD = {
    "multiattack": {"type": "multiattack", "narration": "two swings", "attacks": [
        {"name": "Claw", "to_hit_bonus": 5, "damage": "2d6", "damage_type": "slashing"}]},
    "single_attack": {"type": "single_attack", "narration": "one swing", "attacks": [
        {"name": "Sword", "to_hit_bonus": 6, "damage": "1d10", "damage_type": "slashing"}]},
    "area": {**_area("8d6"), "area": "20-ft cone",
             "save": {"dc": 15, "ability": "dex", "on_save": "half"}},
    "utility": {"type": "utility", "narration": "sneaks off",
                "roll": {"dice": "1d20", "modifier": 8, "label": "Stealth"}},
    "reaction": {"type": "reaction", "narration": "counterstrike",
                 "damage": {"dice": "2d8", "type": "force"},
                 "attacker_save": {"dc": 14, "ability": "dex", "on_save": "half"}},
}

# KNOWN (python-tooling-45, same finding, found while pinning it on 2026-10-11): two more
# shapes validate_spec accepts and the build refuses — an area string without the
# hyphen ("20ft cone": `unparseable area`) and a save with no `on_save` (KeyError).
KNOWN_UNBUILDABLE_SPECS = {
    "area '20ft cone'": _area("8d6"),
    "attacker_save without on_save": {"type": "reaction", "narration": "counterstrike",
                                      "damage": {"dice": "2d8", "type": "force"},
                                      "attacker_save": {"dc": 14, "ability": "dex"}},
}


@pytest.mark.parametrize("label", sorted(KNOWN_UNBUILDABLE_SPECS))
def test_known_specs_validate_but_do_not_build(label):
    spec = KNOWN_UNBUILDABLE_SPECS[label]
    assert cdb.validate_spec(spec) == []
    with pytest.raises((ba.BuildError, KeyError)):
        ba.ItemBuilder({"npc": "zz-test", "action": "act", **spec}, {}).build()


@pytest.mark.parametrize("rtype", ba.ROW_TYPES)
def test_every_row_type_validates_and_builds(rtype):
    spec = GOOD[rtype]
    assert cdb.validate_spec(spec) == []
    ba.ItemBuilder({"npc": "zz-test", "action": "act", **spec}, {}).build()


def test_unknown_row_type_is_refused_by_the_build():
    with pytest.raises(ba.BuildError, match="unknown row type"):
        ba.ItemBuilder({"npc": "zz", "action": "a", "type": "nope", "narration": "n"}, {}).build()
