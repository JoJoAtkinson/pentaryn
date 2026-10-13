"""The pings live golden leaves no trace in the world's ping log (merge-and-go-live-2026-10-11 §6).

scripts/foundry/live-goldens/pings.js pings a ZZ scratch scene 1 + N times; those records used to
stay in `pentaryn-pings.log` (and in the module's private buffer, which re-wrote them on the next
flush), pushing real pings out of the 50-entry ring and leaving the SF3 ring-state difference
between runs. The golden now saves the log first and restores it, and the module's buffer with it.
Run against the real module in its node test world (fixtures/pings_live_golden.mjs), on a
visible tab and on a hidden one. On a hidden tab the module's flush is held back, so the scratch
records reach only the aliased settings cache; the golden must read and restore through the stored
Setting `_source`, or it reports pingLogRestored false and the module's buffer keeps the scratch
records for its next flush (overnight-2026-10-11 FX item 2).

pings-w3-1 (defect wave 3, [declared] by pings-edge-1): since wave 2 the scratch ping waits in the
module's pending list, never in the settings cache, and the readers show it only once it is written
(glue.test.mjs "not on record until the write", README Pitfalls "Read lag"). On the `hidden` run,
whose flush is held for the whole golden, the log therefore holds no scratch record and last() is
the newest seeded one; the cleanup must still leave nothing behind. The `throttled` run fires the
flush at 1 s, as a hidden Chrome tab does, inside the golden's 3 s settle: the golden sees its ping.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

HARNESS = Path(__file__).parent / "fixtures" / "pings_live_golden.mjs"


@pytest.fixture(scope="module", params=["visible", "hidden", "throttled"])
def run(request):
    if shutil.which("node") is None:
        pytest.skip("node not installed")
    args = [] if request.param == "visible" else [f"--{request.param}"]
    proc = subprocess.run(["node", str(HARNESS), *args], capture_output=True, text=True, timeout=60)
    assert proc.returncode == 0, proc.stderr
    out = json.loads(proc.stdout)
    out["mode"] = request.param
    return out


def test_golden_itself_still_runs(run):
    golden = run["out"]["golden"]
    assert "error" not in golden, golden.get("error")
    # pings-edge-1 [declared]: a ping is not on record until its write, so never straight after it
    assert golden["ping"]["lastImmediateIsScratch"] is False
    if run["mode"] == "hidden":
        # the flush is held for the whole golden: the ping is still in the pending list
        assert golden["ping"]["scratchRecordsInLog"] == 0
        assert (golden["ping"]["lastAfter"]["x"], golden["ping"]["lastAfter"]["y"]) == (50, 60)
    else:
        assert golden["ping"]["scratchRecordsInLog"] == 1
        assert golden["ping"]["imageMatchesFoundry"] is True


def test_log_is_restored_exactly(run):
    assert run["logAfter"] == run["seeded"]
    assert run["storedAfter"] == run["seeded"]
    assert run["out"]["cleanup"]["pingLogRestored"] is True
    assert run["out"]["cleanup"]["pingScratchLeft"] == 0


def test_module_buffer_holds_no_scratch_record(run):
    after = run["bufferAfterRealPing"]
    assert after[:-1] == run["seeded"]
    assert [(r["x"], r["y"]) for r in after[-1:]] == [(70, 80)]
    assert not any(r["sceneName"] == "ZZ live-goldens pings" and r["sceneId"].startswith("zzGolden") for r in after)
