"""The importer live golden does not depend on the order other modules publish in.

scripts/foundry/live-goldens/importer.js records the root namespace `game.pentaryn`. Its
insertion order is the order every module's ready hook published, which moves whenever another
module's kit migration changes its ready path, so an unsorted key list made the importer golden
report a false "shared" difference (overnight-2026-10-11 FX item 1). Run the real script twice
against a stub with two publish orders (fixtures/importer_live_golden.mjs).
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

HARNESS = Path(__file__).parent / "fixtures" / "importer_live_golden.mjs"


@pytest.fixture(scope="module")
def run():
    if shutil.which("node") is None:
        pytest.skip("node not installed")
    proc = subprocess.run(["node", str(HARNESS)], capture_output=True, text=True, timeout=60)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_root_golden_is_independent_of_publish_order(run):
    assert run["a"]["golden"]["root"] == run["b"]["golden"]["root"]


def test_whole_golden_is_independent_of_publish_order(run):
    assert run["a"]["golden"] == run["b"]["golden"]


def test_root_still_lists_every_key(run):
    root = run["a"]["golden"]["root"]
    assert root["keys"] == sorted(root["keys"])
    assert "import" in root["keys"] and "pings" in root["keys"]
    assert root["importIsFunction"] is True
