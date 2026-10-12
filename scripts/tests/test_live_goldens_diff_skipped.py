"""diff.mjs: a skipped or malformed golden is never "identical" (LG-R3, LG-R2).

The live-goldens final review (context/plans/final-review-2026-10-12/live-goldens.md) found that a
golden which skipped (walls, senses, creatures, aoe, combat keep `golden:{shared:{},declared:{}}`
beside `skipped`) diffed as identical with exit 0 and never printed the reason (LG-R3), and that a
truthy non-object golden (`{"golden":"oops"}`) crashed with a TypeError and exit 1 where the README
promises exit 2 on bad input (LG-R2). Both are bad input now: exit 2, naming the reason or file."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

DIFF = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens/diff.mjs"

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")

OK = {"module": "senses", "env": {"senses": "x"}, "golden": {"shared": {"a": 1}, "declared": {}},
      "timings": {}, "cleanup": {"actorsLeft": 0}}
SKIPPED = {"module": "senses", "env": {"senses": "x"}, "skipped": "no scene with a ZZ token",
           "golden": {"shared": {}, "declared": {}}, "timings": {}, "cleanup": {"actorsLeft": 0}}


def _diff(tmp_path, before, after):
    b, a = tmp_path / "before.json", tmp_path / "after.json"
    b.write_text(json.dumps(json.dumps(before)))
    a.write_text(json.dumps(json.dumps(after)))
    return subprocess.run(["node", str(DIFF), str(b), str(a)], capture_output=True, text=True, timeout=30)


@pytest.mark.parametrize("side", ["both", "before", "after"])
def test_a_skipped_golden_exits_2_with_its_reason(tmp_path, side):
    before = SKIPPED if side in ("both", "before") else OK
    after = SKIPPED if side in ("both", "after") else OK
    r = _diff(tmp_path, before, after)
    out = r.stdout + r.stderr
    assert r.returncode == 2, out
    assert "skipped: no scene with a ZZ token" in out, out
    assert "identical" not in out, out


def test_a_skipped_run_with_no_golden_still_names_the_skip(tmp_path):
    bare = {k: v for k, v in SKIPPED.items() if k != "golden"}
    r = _diff(tmp_path, bare, bare)
    assert r.returncode == 2, r.stdout + r.stderr
    assert "skipped: no scene with a ZZ token" in r.stderr, r.stderr


@pytest.mark.parametrize("golden", ["oops", 7, True])
@pytest.mark.parametrize("side", ["before", "after"])
def test_a_non_object_golden_is_bad_input_naming_the_file(tmp_path, golden, side):
    bad = dict(OK, golden=golden)
    r = _diff(tmp_path, bad if side == "before" else OK, bad if side == "after" else OK)
    assert r.returncode == 2, r.stdout + r.stderr
    assert f"{side}.json" in r.stderr, r.stderr
    assert "TypeError" not in r.stderr, r.stderr


def test_a_good_pair_is_still_identical(tmp_path):
    r = _diff(tmp_path, OK, OK)
    assert r.returncode == 0 and "## shared — identical" in r.stdout, r.stdout + r.stderr
