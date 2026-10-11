"""Tests for the D&D roller's pure logic (narrative, bonuses, validation)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import dnd_roller

# The real on-disk cache of fetched quantum numbers. No test may write or delete it
# (python-tooling-52): `_pop_numbers` ends in `_write_cache()`, which rewrites the file
# with whatever is in memory — the seeded fake numbers here — or unlinks it.
_HOME_CACHE = Path.home() / ".cache" / "dnd_roller" / "quant_numbers.bin"


@pytest.fixture(autouse=True)
def reset_cache(monkeypatch, tmp_path):
    """Reset module-level cache state before each test, and point the file cache at tmp."""
    monkeypatch.setattr(dnd_roller, "_CACHE_DIR", tmp_path)
    monkeypatch.setattr(dnd_roller, "_CACHE_FILE", tmp_path / "quant_numbers.bin")
    dnd_roller._number_cache.clear()
    dnd_roller._source_cache.clear()
    yield
    dnd_roller._number_cache.clear()
    dnd_roller._source_cache.clear()


def _seed_cache(numbers: list[int], source: str = "quantumnumbers") -> None:
    """Helper: pre-populate the cache with deterministic numbers."""
    dnd_roller._number_cache.extend(numbers)
    dnd_roller._source_cache.extend([source] * len(numbers))


def test_roll_dice_returns_required_json_fields():
    """Result JSON must include narrative, rolls, source, total fields."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert "narrative" in result
    assert "rolls" in result
    assert "source" in result
    assert "total_raw" in result
    assert "total_with_bonuses" in result
    assert "dice_notation" in result


def test_roll_dice_rolls_match_modulo():
    """Each roll = (uint16 % dice_size) + 1."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert result["rolls"] == [15, 12, 18]


def test_bonuses_applied_per_die():
    """When bonuses=[2,3,4], each roll gets its own bonus."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(
        num_dice=3, dice_size=20, bonuses=[2, 3, 4]
    ))
    assert result["rolls"] == [15, 12, 18]
    assert result["bonuses"] == [2, 3, 4]
    assert result["rolls_with_bonuses"] == [17, 15, 22]
    assert result["total_raw"] == 45
    assert result["total_with_bonuses"] == 54


def test_modifier_applied_to_total_only():
    """`modifier` adds to the final total but not per-die."""
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(
        num_dice=3, dice_size=20, modifier=5
    ))
    assert result["rolls"] == [15, 12, 18]
    assert result["total_raw"] == 45
    assert result["total_with_bonuses"] == 50


def test_bonuses_and_modifier_combined():
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(
        num_dice=3, dice_size=20, bonuses=[2, 2, 2], modifier=5
    ))
    assert result["total_raw"] == 45
    assert result["total_with_bonuses"] == 56  # 51 + 5


def test_bonuses_length_mismatch_raises():
    _seed_cache([14, 11, 17])
    with pytest.raises(ValueError, match="bonuses"):
        dnd_roller.roll_dice(num_dice=3, dice_size=20, bonuses=[2, 3])


def test_quantum_marker_present_when_source_quantum():
    _seed_cache([14, 11, 17], source="quantumnumbers")
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert result["narrative"].startswith("⚛️")
    assert result["source"] == "quantumnumbers"


def test_no_quantum_marker_when_random_org_fallback():
    _seed_cache([14, 11, 17], source="random_org")
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert not result["narrative"].startswith("⚛️")
    assert result["source"] == "random_org"


def test_narrative_includes_dice_glyph():
    _seed_cache([14, 11, 17], source="random_org")
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    # Assert against the live mapping so the test can't drift if the glyph
    # codepoint changes again (was a PUA codepoint, now a U+1F51x emoji).
    assert dnd_roller._DICE_GLYPHS[20] in result["narrative"]


def test_dice_notation_field():
    _seed_cache([14, 11, 17])
    r1 = json.loads(dnd_roller.roll_dice(3, 20))
    assert r1["dice_notation"] == "3d20"

    _seed_cache([14, 11, 17])
    r2 = json.loads(dnd_roller.roll_dice(3, 20, modifier=5))
    assert r2["dice_notation"] == "3d20+5"

    _seed_cache([14, 11, 17])
    r3 = json.loads(dnd_roller.roll_dice(3, 20, modifier=-2))
    assert r3["dice_notation"] == "3d20-2"


def test_bonuses_none_means_zero_bonuses():
    _seed_cache([14, 11, 17])
    result = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    assert result["rolls_with_bonuses"] == result["rolls"]
    assert result["bonuses"] == [0, 0, 0]


def test_invalid_dice_size_raises():
    _seed_cache([14])
    with pytest.raises(ValueError, match="dice_size"):
        dnd_roller.roll_dice(num_dice=1, dice_size=7)


def test_modifier_out_of_range_raises():
    _seed_cache([14])
    with pytest.raises(ValueError, match="modifier"):
        dnd_roller.roll_dice(num_dice=1, dice_size=20, modifier=5000)




# ───────────────────────── _confined_log_path (C3-F1) ──────────────────────

def test_confined_log_path_accepts_repo_relative_md(tmp_path, monkeypatch):
    """A repo-relative .md path resolves inside the repo and is accepted."""
    p = dnd_roller._confined_log_path("foundry/test-log.md")
    assert p.suffix == ".md"
    assert dnd_roller._REPO_ROOT in p.parents


def test_confined_log_path_rejects_outside_repo():
    with pytest.raises(ValueError, match="inside the repo"):
        dnd_roller._confined_log_path("/tmp/evil-log.md")


def test_confined_log_path_rejects_traversal():
    with pytest.raises(ValueError, match="inside the repo"):
        dnd_roller._confined_log_path("../../../../tmp/evil.md")


def test_confined_log_path_rejects_non_md():
    with pytest.raises(ValueError, match=r"\.md"):
        dnd_roller._confined_log_path("foundry/evil.zshrc")


# ───────────────────────── combat_action_upsert robustness (A4-M1) ─────────

def test_combat_action_upsert_non_dict_spec_returns_ok_false():
    """A non-dict spec must yield {"ok": false}, not an uncaught crash."""
    result = json.loads(
        dnd_roller.combat_action_upsert("x", "y", ["not", "a", "dict"])
    )
    assert result["ok"] is False
    assert "error" in result



def _home_cache_state() -> tuple:
    try:
        st = _HOME_CACHE.stat()
    except FileNotFoundError:
        return (False, None, None)
    return (True, st.st_mtime_ns, st.st_size)


def test_suite_never_touches_home_cache():
    """python-tooling-52: a seeded roll writes the tmp cache, never ~/.cache/dnd_roller."""
    before = _home_cache_state()
    _seed_cache([14, 11, 17, 3])
    json.loads(dnd_roller.roll_dice(num_dice=1, dice_size=20))
    assert _home_cache_state() == before
    assert dnd_roller._CACHE_FILE.parent != _HOME_CACHE.parent


# ── python-tooling-51: concurrency (characterisation before the declared fix) ──

def test_serial_rolls_consume_numbers_in_order_never_twice():
    _seed_cache([14, 11, 17, 3])
    first = json.loads(dnd_roller.roll_dice(num_dice=3, dice_size=20))
    second = json.loads(dnd_roller.roll_dice(num_dice=1, dice_size=20))
    assert first["rolls"] == [15, 12, 18]
    assert second["rolls"] == [4]
    assert dnd_roller._number_cache == []


# Two event loops, each with two rolls contending for the fetch lock. roll_dice runs
# every call under its own asyncio.run, so this is the production shape minus the
# threads. The fake fetch yields with sleep(0) — no wall clock anywhere. Today the
# module-level asyncio.Lock binds to the first loop that waits on it, and the second
# loop's waiter gets "bound to a different event loop" (with threads, as in the MCP
# server, that waiter hangs instead). Run in a subprocess so the bound lock never
# leaks into this process; the timeout is only a guard against a hung child.
_CONCURRENT = r"""
import asyncio, json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from scripts import dnd_roller as d
tmp = Path(sys.argv[2])
d._CACHE_DIR, d._CACHE_FILE = tmp, tmp / "quant_numbers.bin"   # never the real cache
d._number_cache.clear(); d._source_cache.clear(); d._last_fetch_time = 0.0
batches = iter(range(0, 1 << 20, 4))

async def fake_fetch(count=1024):
    await asyncio.sleep(0)            # yield, so the second roll reaches the lock
    first = next(batches)
    return list(range(first, first + 4))   # one roll's worth: every roll must fetch

def no_fallback(count):
    raise RuntimeError("random.org must not be reached")

d._fetch_from_quantumnumbers = fake_fetch
d._fetch_from_random_org_sync = no_fallback
seen, orig, errors, returned = [], d._pop_numbers, [], [0]

async def spy(count):
    nums, src = await orig(count)
    seen.extend(nums)
    return nums, src

d._pop_numbers = spy

async def two_rolls():
    for r in await asyncio.gather(d._roll_dice_async(4, 20), d._roll_dice_async(4, 20),
                                  return_exceptions=True):
        if isinstance(r, BaseException):
            errors.append(type(r).__name__)
        else:
            returned[0] += 1

for _ in range(2):
    asyncio.run(two_rolls())
print(json.dumps({"returned": returned[0], "errors": errors,
                  "seen": len(seen), "distinct": len(set(seen))}))
"""


def test_concurrent_rolls_all_return_with_distinct_numbers(tmp_path):
    import subprocess
    import sys
    repo = Path(dnd_roller.__file__).resolve().parents[1]
    proc = subprocess.run([sys.executable, "-c", _CONCURRENT, str(repo), str(tmp_path)],
                          capture_output=True, text=True, timeout=60)
    out = json.loads(proc.stdout.strip().splitlines()[-1])
    assert out == {"returned": 4, "errors": [], "seen": 16, "distinct": 16}, out


# The production shape (python-tooling-51): 8 threads, each calling roll_dice — so each
# roll runs under its own asyncio.run on its own thread, as the MCP server's in-process
# pool does. Every fetch returns one roll's worth, so every roll must fetch. The fake
# fetch yields with sleep(0); nothing waits on the wall clock. Before the fix a waiter on
# the shared asyncio.Lock from another thread's loop never woke; the subprocess timeout
# turns that hang into a failure instead of a stuck suite.
_THREADED = r"""
import asyncio, itertools, json, sys, threading
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from scripts import dnd_roller as d
tmp = Path(sys.argv[2])
d._CACHE_DIR, d._CACHE_FILE = tmp, tmp / "quant_numbers.bin"   # never the real cache
d._number_cache.clear(); d._source_cache.clear(); d._last_fetch_time = 0.0
batches = itertools.count(0, 4)

async def fake_fetch(count=1024):
    await asyncio.sleep(0)
    first = next(batches)
    return list(range(first, first + 4))

def no_fallback(count):
    raise RuntimeError("random.org must not be reached")

d._fetch_from_quantumnumbers = fake_fetch
d._fetch_from_random_org_sync = no_fallback
seen, orig, errors, returned = [], d._pop_numbers, [], []

async def spy(count):
    nums, src = await orig(count)
    seen.extend(nums)
    return nums, src

d._pop_numbers = spy
start = threading.Barrier(8)

def worker():
    start.wait()
    try:
        returned.append(json.loads(d.roll_dice(4, 20))["rolls"])
    except BaseException as e:
        errors.append(type(e).__name__)

threads = [threading.Thread(target=worker) for _ in range(8)]
for t in threads: t.start()
for t in threads: t.join()
print(json.dumps({"returned": len(returned), "errors": errors,
                  "seen": len(seen), "distinct": len(set(seen))}))
"""


def test_eight_threads_of_roll_dice_all_return_with_distinct_numbers(tmp_path):
    import subprocess
    import sys
    repo = Path(dnd_roller.__file__).resolve().parents[1]
    proc = subprocess.run([sys.executable, "-c", _THREADED, str(repo), str(tmp_path)],
                          capture_output=True, text=True, timeout=20)
    out = json.loads(proc.stdout.strip().splitlines()[-1])
    assert out == {"returned": 8, "errors": [], "seen": 32, "distinct": 32}, out


def test_no_loop_bound_object_outlives_its_call():
    """python-tooling-51: no module-level asyncio.Lock or shared AsyncClient remains."""
    import asyncio
    import httpx
    shared = [v for v in vars(dnd_roller).values()
              if isinstance(v, (asyncio.Lock, httpx.AsyncClient))]
    assert shared == []


# ── dnd-roller-flock: two server processes share one cache file ──
# Every Claude session runs its own dnd-scripts server, and each loads quant_numbers.bin at
# import. _draw_lock is per process, so without a file lock both processes drew the same
# cached numbers and each rewrote the file from its own copy. Two real processes here, both
# loading the same 100-number cache at import (HOME points at tmp), released together, each
# drawing 50 d100s; no fetch can happen (both fetchers refuse).
_TWO_PROCESSES = r"""
import json, sys, time
from pathlib import Path
sys.path.insert(0, sys.argv[1])
tmp, me = Path(sys.argv[2]), sys.argv[3]
from scripts import dnd_roller as d       # loads $HOME/.cache/dnd_roller/quant_numbers.bin
assert d._CACHE_FILE == tmp / ".cache" / "dnd_roller" / "quant_numbers.bin", d._CACHE_FILE
assert len(d._number_cache) == 100, len(d._number_cache)

async def no_fetch(count=1024):
    raise RuntimeError("quantumnumbers must not be reached")

def no_fallback(count):
    raise RuntimeError("random.org must not be reached")

d._fetch_from_quantumnumbers = no_fetch
d._fetch_from_random_org_sync = no_fallback
(tmp / f"ready-{me}").touch()
while not (tmp / "go").exists():
    time.sleep(0.005)
rolls = []
for _ in range(5):
    rolls += json.loads(d.roll_dice(10, 100))["rolls"]
print(json.dumps(rolls))
"""


def test_two_processes_never_draw_the_same_cached_number(tmp_path):
    import os
    import struct
    import subprocess
    import sys
    import time
    repo = Path(dnd_roller.__file__).resolve().parents[1]
    cache = tmp_path / ".cache" / "dnd_roller" / "quant_numbers.bin"
    cache.parent.mkdir(parents=True)
    cache.write_bytes(b"".join(struct.pack("H", n) + b"\x00" for n in range(100)))
    env = {**os.environ, "HOME": str(tmp_path)}
    procs = [subprocess.Popen([sys.executable, "-c", _TWO_PROCESSES, str(repo), str(tmp_path), me],
                              env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
             for me in ("a", "b")]
    try:
        deadline = time.monotonic() + 30
        while not all((tmp_path / f"ready-{me}").exists() for me in ("a", "b")):
            assert all(p.poll() is None for p in procs), [p.communicate() for p in procs]
            assert time.monotonic() < deadline, "children never loaded the cache"
            time.sleep(0.01)
        (tmp_path / "go").touch()
        outs = [p.communicate(timeout=30) for p in procs]
    finally:
        for p in procs:
            p.kill()
    assert [p.returncode for p in procs] == [0, 0], outs
    a, b = (json.loads(out.strip().splitlines()[-1]) for out, _ in outs)
    assert len(a) == len(b) == 50
    assert sorted(r - 1 for r in a + b) == list(range(100)), (a, b)
    assert not cache.exists()   # the shared pool is used up, not rewritten from a stale copy
