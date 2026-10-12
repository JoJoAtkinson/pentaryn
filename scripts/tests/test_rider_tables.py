"""combat-riders-17 step 4: pentaryn-combat's TURN_RIDERS and pentaryn-riders' RULES never claim the
same feature (a row in both would apply twice), and the two normalizeName contracts stay pinned."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
COMBAT = ROOT / "foundry/module/pentaryn-combat/combat-core.mjs"
RIDERS = ROOT / "foundry/module/pentaryn-riders/riders-core.mjs"

SCRIPT = """
const combat = await import(process.argv[1]);
const riders = await import(process.argv[2]);
const n = ["Elemental Adept (Fire)", "A (x) B"];
console.log(JSON.stringify({
  turn: combat.TURN_RIDERS.map(r => ({ key: r.key, ids: [...r.identifiers] })),
  rules: riders.RULES.flatMap(r => [r.key, ...(r.match?.identifiers ?? []),
    ...(r.match?.names ?? []).map(combat.slugify)]),
  combatNorm: n.map(combat.normalizeName),
  ridersNorm: n.map(riders.normalizeName),
}));
"""


@pytest.fixture(scope="module")
def tables():
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    out = subprocess.run([node, "--input-type=module", "-e", SCRIPT, COMBAT.as_uri(), RIDERS.as_uri()],
                         capture_output=True, text=True, check=True, timeout=30)
    return json.loads(out.stdout)


def test_turn_rider_keys_pinned(tables):
    assert [r["key"] for r in tables["turn"]] == ["sneak-attack", "frenzy", "colossus-slayer", "divine-strike"]


def test_no_feature_in_both_tables(tables):
    turn = {i for r in tables["turn"] for i in [r["key"], *r["ids"]]}
    assert turn.isdisjoint(tables["rules"]), sorted(turn & set(tables["rules"]))


def test_normalize_name_contracts(tables):
    # combat strips only a trailing parenthetical; riders strips every one.
    assert tables["combatNorm"] == ["elemental adept", "a (x) b"]
    assert tables["ridersNorm"] == ["elemental adept", "a b"]
