"""Characterisation of the actions DB writers before the declared fixes (tests only).

python-tooling-42 (rewrites drop comment/malformed lines), -43 (a spec carrying npc /
action re-keys the row), -44 (unlocked read-modify-write), -46 (retired runner code:
upsert_many and the CLI pinned before any deletion). Every KNOWN pin names its finding;
the fix commit flips exactly that pin. Never touches the real foundry/actions.jsonl.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

import pytest

from scripts import combat_actions_db as cdb

UTILITY = {"type": "utility", "narration": "sneaks off",
           "roll": {"dice": "1d20", "modifier": 8, "label": "Stealth"}}
NOW = "2026-10-11T12:00:00+00:00"
SCRIPT = Path(cdb.__file__)


@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch):
    db = tmp_path / "actions.jsonl"
    monkeypatch.setenv("DND_COMBAT_ACTIONS_DB", str(db))
    return db


@pytest.fixture
def frozen_now(monkeypatch):
    class _DT(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 10, 11, 12, 0, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(cdb, "datetime", _DT)


def _row(npc, action, **extra):
    return {"npc": npc, "action": action, **UTILITY, "updated_at": "2026-01-01T00:00:00+00:00",
            **extra}


def _render(rows):
    rows = sorted(rows, key=lambda r: (r["npc"], r["action"]))
    return "".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows)


# ── -42: the rewrite ──────────────────────────────────────────────────────────

def test_rewrite_render_is_pinned(tmp_db, frozen_now):
    b, a = _row("b", "x", narration="ünïcode"), _row("a", "z")
    tmp_db.write_text(json.dumps(b, indent=1).replace("\n", "") + "\n" + json.dumps(a) + "\n",
                      encoding="utf-8")
    new = cdb.upsert("a", "y", UTILITY)
    assert new["updated_at"] == NOW
    assert tmp_db.read_text(encoding="utf-8") == _render([b, a, new])


def test_reader_skips_comments_and_warns_on_malformed(tmp_db, capsys):
    good = _row("a", "x")
    tmp_db.write_text(f"# c\n{json.dumps(good)}\nnot json\n", encoding="utf-8")
    assert cdb.read_all() == [good]
    assert "skipped malformed JSON" in capsys.readouterr().err


@pytest.mark.xfail(strict=True, reason="KNOWN python-tooling-42: a rewrite deletes # comment lines")
def test_upsert_keeps_comment_lines(tmp_db):
    tmp_db.write_text(f"# c\n{json.dumps(_row('a', 'x'))}\n", encoding="utf-8")
    cdb.upsert("a", "y", UTILITY)
    assert "# c" in tmp_db.read_text(encoding="utf-8")


@pytest.mark.parametrize("write", ["upsert", "delete"])
def test_known_rewrite_drops_malformed_lines(tmp_db, write):
    """KNOWN python-tooling-42: today the writer succeeds and the bad line is gone. The fix
    makes the writers refuse (ValueError, file byte-identical) instead."""
    tmp_db.write_text(f"{json.dumps(_row('a', 'x'))}\nnot json\n", encoding="utf-8")
    if write == "upsert":
        cdb.upsert("a", "y", UTILITY)
    else:
        assert cdb.delete("a", "x") is True
    assert "not json" not in tmp_db.read_text(encoding="utf-8")


def test_known_mcp_tool_reports_ok_over_a_malformed_line(tmp_db, monkeypatch):
    """KNOWN python-tooling-42: the warning goes to stderr only; the tool says ok."""
    from scripts import dnd_roller
    tmp_db.write_text("not json\n", encoding="utf-8")
    out = json.loads(dnd_roller.combat_action_upsert("a", "y", UTILITY))
    assert out["ok"] is True


# ── -43: a spec that carries the key ─────────────────────────────────────────

@pytest.mark.parametrize("key, value", [("npc", "zzz"), ("action", "b")])
def test_known_spec_key_rekeys_the_row(tmp_db, key, value):
    """KNOWN python-tooling-43: the spec is spread after the key fields and wins."""
    rec = cdb.upsert("a", "y", {**UTILITY, key: value})
    assert rec[key] == value
    stored = cdb.read_all()
    assert len(stored) == 1 and stored[0][key] == value


def test_known_rekey_can_duplicate_a_composite_key(tmp_db):
    """KNOWN python-tooling-43: (zzz, y) exists; upserting (a, y) with npc=zzz adds a second."""
    cdb.upsert("zzz", "y", UTILITY)
    cdb.upsert("a", "y", {**UTILITY, "npc": "zzz"})
    keys = [(r["npc"], r["action"]) for r in cdb.read_all()]
    assert keys == [("zzz", "y"), ("zzz", "y")]


def test_cli_validate_strips_stored_key_fields(tmp_db):
    tmp_db.write_text(json.dumps(_row("a", "x")) + "\n", encoding="utf-8")
    proc = _cli("validate")
    assert proc.returncode == 0 and proc.stdout.startswith("OK")


# ── -44: serial behaviour, and the race ───────────────────────────────────────

def test_twenty_serial_upserts(tmp_db, frozen_now):
    recs = [cdb.upsert("n", f"a{i:02d}", UTILITY) for i in range(20)]
    assert len(cdb.read_all()) == 20
    assert tmp_db.read_text(encoding="utf-8") == _render(recs)


def test_concurrent_upserts_keep_every_row(tmp_db):
    for _ in range(20):
        tmp_db.unlink(missing_ok=True)
        barrier = threading.Barrier(16)

        def go(i):
            barrier.wait()
            cdb.upsert("n", f"a{i}", UTILITY)

        threads = [threading.Thread(target=go, args=(i,)) for i in range(16)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert len(cdb.read_all()) == 16


def test_writers_lock_a_sidecar_beside_the_db(tmp_db, monkeypatch):
    """python-tooling-44: every writer holds flock(LOCK_EX) on `<db>.lock` next to the DB
    (here the tmp DB from DND_COMBAT_ACTIONS_DB), never next to the real one."""
    import fcntl
    held: list[tuple[str, int]] = []
    real = fcntl.flock

    def spy(fd, op):
        held.append((os.fstat(fd).st_ino, op))
        return real(fd, op)

    monkeypatch.setattr(cdb.fcntl, "flock", spy)
    cdb.upsert("n", "a", UTILITY)
    cdb.upsert_many([("n", "b", UTILITY)])
    cdb.delete("n", "a")
    lock = tmp_db.with_name("actions.jsonl.lock")
    assert lock.exists()
    ino = lock.stat().st_ino
    assert [op for i, op in held if i == ino] == [fcntl.LOCK_EX, fcntl.LOCK_UN] * 3
    assert len(held) == 6, "every flock call is on the sidecar beside the tmp DB"


# ── -46: upsert_many and the CLI, before any deletion ─────────────────────────

def test_upsert_many_is_all_or_nothing(tmp_db):
    tmp_db.write_text(json.dumps(_row("a", "x")) + "\n", encoding="utf-8")
    before = tmp_db.read_bytes()
    with pytest.raises(ValueError, match=r"entry\[1\]"):
        cdb.upsert_many([("a", "y", UTILITY), ("a", "z", {"type": "nope"})])
    assert tmp_db.read_bytes() == before


def test_upsert_many_one_timestamp_and_replace_in_place(tmp_db, frozen_now):
    tmp_db.write_text(json.dumps(_row("a", "x", narration="old")) + "\n", encoding="utf-8")
    out = cdb.upsert_many([("a", "x", {**UTILITY, "narration": "new"}), ("b", "y", UTILITY)])
    assert [r["updated_at"] for r in out] == [NOW, NOW]
    rows = cdb.read_all()
    assert [(r["npc"], r["action"], r["narration"]) for r in rows] == \
        [("a", "x", "new"), ("b", "y", "sneaks off")]


def _cli(*argv):
    return subprocess.run([sys.executable, str(SCRIPT), *argv], capture_output=True, text=True,
                          env={**os.environ}, timeout=30)


def test_cli_list_get_validate_delete(tmp_db):
    tmp_db.write_text(json.dumps(_row("a", "x", verbs=["sneak"])) + "\n", encoding="utf-8")
    listed = _cli("list")
    assert listed.returncode == 0
    assert [json.loads(ln)["action"] for ln in listed.stdout.splitlines()] == ["x"]
    got = _cli("get", "a", "sneak")
    assert got.returncode == 0 and json.loads(got.stdout)["action"] == "x"
    assert _cli("get", "a", "nothing").stdout.strip() == "null"
    assert _cli("validate").stdout.startswith("OK — 0 invalid")
    assert _cli("delete", "a", "x").stdout.strip() == "deleted"
    assert _cli("delete", "a", "x").stdout.strip() == "not found"


def test_known_ready_ref_names_the_retired_runner_tool(tmp_db):
    """KNOWN python-tooling-46: ready-ref still tells an LLM to call roll_combat_action,
    a tool that no longer exists. Deleting the subcommand removes this test."""
    tmp_db.write_text(json.dumps(_row("a", "x")) + "\n", encoding="utf-8")
    proc = _cli("ready-ref", "a")
    assert proc.returncode == 0 and "roll_combat_action(" in proc.stdout
