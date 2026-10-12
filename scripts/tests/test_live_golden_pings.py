"""The pings live golden leaves no trace in the world's ping log (merge-and-go-live-2026-10-11 §6).

scripts/foundry/live-goldens/pings.js pings a ZZ scratch scene 1 + N times; those records used to
stay in `pentaryn-pings.log` (and in the module's private buffer, which re-wrote them on the next
flush), pushing real pings out of the 50-entry ring and leaving the SF3 ring-state difference
between runs. The golden now saves the log first and restores it, and the module's buffer with it.
Run against the real module in its node test world (fixtures/pings_live_golden.mjs).
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

HARNESS = Path(__file__).parent / "fixtures" / "pings_live_golden.mjs"


@pytest.fixture(scope="module")
def run():
    if shutil.which("node") is None:
        pytest.skip("node not installed")
    proc = subprocess.run(["node", str(HARNESS)], capture_output=True, text=True, timeout=60)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_golden_itself_still_runs(run):
    golden = run["out"]["golden"]
    assert "error" not in golden, golden.get("error")
    assert golden["ping"]["scratchRecordsInLog"] == 1
    assert golden["ping"]["imageMatchesFoundry"] is True


def test_log_is_restored_exactly(run):
    assert run["logAfter"] == run["seeded"]
    assert run["out"]["cleanup"]["pingLogRestored"] is True
    assert run["out"]["cleanup"]["pingScratchLeft"] == 0


def test_module_buffer_holds_no_scratch_record(run):
    after = run["bufferAfterRealPing"]
    assert after[:-1] == run["seeded"]
    assert [(r["x"], r["y"]) for r in after[-1:]] == [(70, 80)]
    assert not any(r["sceneName"] == "ZZ live-goldens pings" and r["sceneId"].startswith("zzGolden") for r in after)
