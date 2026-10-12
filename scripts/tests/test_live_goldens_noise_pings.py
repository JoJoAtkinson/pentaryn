"""EXT-8 (final-review-2026-10-12 live-goldens): the pings golden's known run-to-run noise was only
prose in the README, so every pings diff needed a hand-written --declared file. Joe's ruling: commit
scripts/foundry/live-goldens/noise/pings.txt holding the one glob `ping.settingArrayReplacedByFlush`
(it declares a difference, so nothing else goes in without a new noise-table row), and point the
README's noise row and Diffing paragraph at `--declared noise/pings.txt`."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

LG = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"
NOISE = LG / "noise/pings.txt"
README = LG / "README.md"
DIFF = LG / "diff.mjs"


def _globs():
    lines = [l.strip() for l in NOISE.read_text().splitlines()]
    return [l for l in lines if l and not l.startswith("#")], [l for l in lines if l.startswith("#")]


def test_noise_file_holds_exactly_the_one_known_key():
    assert NOISE.is_file(), "EXT-8: noise/pings.txt is not committed"
    globs, comments = _globs()
    assert globs == ["ping.settingArrayReplacedByFlush"], globs
    assert any("W5L" in c for c in comments), comments


def test_readme_noise_row_and_diffing_paragraph_name_the_file():
    text = README.read_text()
    row = next(l for l in text.splitlines() if l.startswith("| pings |"))
    assert "noise/pings.txt" in row, row
    diffing = text.split("## Diffing", 1)[1].split("\n## ", 1)[0]
    assert "--declared" in diffing and "noise/pings.txt" in diffing, diffing


def _pings(flush, extra=None):
    golden = {"ping": {"scratchRecordsInLog": 1, "imageMatchesFoundry": True,
                       "settingArrayReplacedByFlush": flush},
              "recentShape": [["x", "y"]]}
    if extra:
        golden["ping"].update(extra)
    return {"module": "pings", "golden": golden, "timings": {}, "cleanup": {"pingLogRestored": True}}


def _diff(tmp_path, before, after):
    b, a = tmp_path / "before.json", tmp_path / "after.json"
    b.write_text(json.dumps(json.dumps(before)))
    a.write_text(json.dumps(json.dumps(after)))
    return subprocess.run(["node", str(DIFF), "--declared", str(NOISE), str(b), str(a)],
                          capture_output=True, text=True, timeout=30)


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_the_known_noise_diffs_clean_and_nothing_else_does(tmp_path):
    r = _diff(tmp_path, _pings(False), _pings(True))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "0 undeclared" in r.stdout and "1 declared by" in r.stdout, r.stdout
    r = _diff(tmp_path, _pings(False), _pings(True, {"scratchRecordsInLog": 2}))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "1 undeclared" in r.stdout and "ping.scratchRecordsInLog" in r.stdout, r.stdout
