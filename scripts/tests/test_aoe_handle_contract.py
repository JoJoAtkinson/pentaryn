"""The aoe handle contract across modules: pentaryn-aoe owns flags.pentaryn-aoe.handle /
.handleActor, and its shared oracle (pentaryn-aoe/test/fixtures/handle-oracle.json) says what each
hand copy elsewhere must answer. pentaryn-combat's shapes.isAoeHandle (read by
turnflow/helper-token.mjs) implements the `handle` column: the token's own flag only.

portals' and creatures' isAoeHandle copies (column `prop`) join this file once migrate/wave-3 is on
the branch (wave-4 report follow-up)."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
ORACLE = ROOT / "foundry/module/pentaryn-aoe/test/fixtures/handle-oracle.json"
COMBAT = ROOT / "foundry/module/pentaryn-combat/shapes.mjs"

SCRIPT = """
const { isAoeHandle } = await import(process.argv[1]);
const { rows } = JSON.parse(await (await import("node:fs/promises")).readFile(process.argv[2], "utf8"));
console.log(JSON.stringify(rows.map(r => ({ name: r.name, want: r.want.handle, got: isAoeHandle(r.token) }))));
"""


@pytest.fixture(scope="module")
def combat_rows():
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    out = subprocess.run([node, "--input-type=module", "-e", SCRIPT, COMBAT.as_uri(), str(ORACLE)],
                         capture_output=True, text=True, check=True, timeout=30)
    return json.loads(out.stdout)


def test_oracle_has_rows_for_both_answers(combat_rows):
    assert len(combat_rows) >= 10
    assert {r["want"] for r in combat_rows} == {True, False}


def test_combat_is_aoe_handle_matches_the_handle_column(combat_rows):
    wrong = [r["name"] for r in combat_rows if r["got"] is not r["want"]]
    assert wrong == [], f"combat shapes.isAoeHandle disagrees with aoe's oracle on: {wrong}"
