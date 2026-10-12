"""diff.mjs --declared <file>: an allowlist of path globs for golden.shared differences.

W5L (2026-10-12) read attunement's W2-A1 diff by hand: 23 shared paths differed, every one of them
declared in wave-5-live-plan.md §9, and diff.mjs still exited 1. With `--declared` a diff whose
every shared difference matches a glob exits 0; one undeclared path still exits 1. The fixture below
is shaped like that case (the coin purse: the chest gains the purse at [0], the stash toast goes,
purseHome turns from a string into the owner's payment) — 23 differing shared paths."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

DIFF = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens/diff.mjs"

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")


def _item(name, type_, img, weight, price, equipped, attunement, rarity, qty, bond):
    return {"name": name, "type": type_, "img": img, "weight": weight, "price": price,
            "equipped": equipped, "attunement": attunement, "rarity": rarity, "qty": qty,
            "bond": bond, "tag": "Golden"}


RING = _item("ZZ Ring", "equipment", "ring.webp", 0.1, 50, True, "required", "uncommon", 1,
             {"owner": "<owner>", "attuned": True})
TORCH = _item("ZZ Torch", "consumable", "torch.webp", 1, 0.01, False, "", "common", 3,
              {"owner": "<owner>"})
PURSE = _item("Coin Purse", "loot", "purse.webp", 0, 0, False, "", "common", 1,
              {"owner": "<owner>", "currency": {"gp": 12, "sp": 3}})

BASE_SHARED = {
    "slots": {"max": 3, "used": 1},
    "stash": {"returned": {"ok": True, "moved": 3}, "ownerCurrency": {"gp": 0, "sp": 0}},
    "ringHome": {"slots": {"used": 1}, "toasts": []},
}


def _run(shared_extra, declared=None):
    shared = json.loads(json.dumps(BASE_SHARED))
    shared["stash"].update(shared_extra["stash"])
    shared["purseHome"] = shared_extra["purseHome"]
    return {"module": "attunement", "env": {"attunement": "x"},
            "golden": {"shared": shared, "declared": declared or {}},
            "timings": {}, "cleanup": {"actorsLeft": 0, "itemsLeft": 0}}


BEFORE = _run({"stash": {"chest": [RING, TORCH], "toasts": ["ZZ Owner: ZZ Chest recovers their coin."]},
               "purseHome": "no purse in the chest"})
AFTER = _run({"stash": {"chest": [PURSE, RING, TORCH]},
              "purseHome": {"purseLeft": False, "ownerCurrency": {"gp": 12, "sp": 3},
                            "chestCurrency": {}, "toasts": ["ZZ Owner recovers their coin."]}})

W2_A1 = """# attunement W2-A1 (wave-5-live-plan.md §9): the coin purse pays the owner ~750 ms after the claim
stash.chest[*]
stash.chest[*].*
stash.chest[*].bond.**
stash.toasts
purseHome
"""


def _write(tmp_path, before=BEFORE, after=AFTER, declared=None):
    b, a = tmp_path / "before.json", tmp_path / "after.json"
    # saved the way the live plan saves them: the eval-js string
    b.write_text(json.dumps(json.dumps(before)))
    a.write_text(json.dumps(json.dumps(after)))
    args = ["node", str(DIFF)]
    if declared is not None:
        d = tmp_path / "declared.txt"
        d.write_text(declared)
        args += ["--declared", str(d)]
    return subprocess.run(args + [str(b), str(a)], capture_output=True, text=True, timeout=30)


def test_fixture_differs_in_23_shared_paths(tmp_path):
    r = _write(tmp_path)
    assert r.returncode == 1, r.stdout + r.stderr
    assert "23 DIFFERENCE(S)" in r.stdout, r.stdout


def test_all_declared_diff_exits_0(tmp_path):
    r = _write(tmp_path, declared=W2_A1)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "0 undeclared" in r.stdout and "23 declared by" in r.stdout, r.stdout
    assert "matched nothing" not in r.stdout, r.stdout


def test_one_undeclared_path_still_exits_1(tmp_path):
    after = json.loads(json.dumps(AFTER))
    after["golden"]["shared"]["slots"]["used"] = 2
    r = _write(tmp_path, after=after, declared=W2_A1)
    assert r.returncode == 1, r.stdout
    assert "1 undeclared" in r.stdout and "slots.used" in r.stdout, r.stdout


def test_globs_do_not_cross_a_dot_or_match_a_prefix(tmp_path):
    # `stash.chest[*].*` must not cover stash.chest[0].bond.currency.gp, and `purseHome` alone
    # must not cover purseHome.ownerCurrency.gp
    r = _write(tmp_path, declared="stash.chest[*].*\nstash.toasts\nstash.toasts[*]\npurseHome\n")
    assert r.returncode == 1, r.stdout
    assert "stash.chest[0].bond" in r.stdout.split("undeclared")[1], r.stdout


def test_a_glob_that_matches_nothing_is_named(tmp_path):
    r = _write(tmp_path, declared=W2_A1 + "stash.away\n")
    assert r.returncode == 0, r.stdout
    assert "matched nothing: stash.away" in r.stdout, r.stdout


def test_a_dirty_cleanup_still_fails_when_every_path_is_declared(tmp_path):
    after = json.loads(json.dumps(AFTER))
    after["cleanup"]["itemsLeft"] = 2
    r = _write(tmp_path, after=after, declared=W2_A1)
    assert r.returncode == 1, r.stdout


def test_missing_declared_file_is_bad_input(tmp_path):
    b = tmp_path / "b.json"
    b.write_text(json.dumps(BEFORE))
    r = subprocess.run(["node", str(DIFF), "--declared", str(tmp_path / "nope.txt"), str(b), str(b)],
                       capture_output=True, text=True, timeout=30)
    assert r.returncode == 2, r.stdout + r.stderr


def test_without_declared_the_output_is_unchanged(tmp_path):
    r = _write(tmp_path, after=BEFORE)
    assert r.returncode == 0 and "## shared — identical" in r.stdout, r.stdout
