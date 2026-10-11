"""ops/out.py (python-tooling-33): the shared say/fail/event helpers.

`say` must stay byte-identical to the `_say` helpers it replaced (service, login), and `event`
must write nothing unless $PENTARYN_OPS_LOG asks for it."""

from __future__ import annotations

import json

from scripts.foundry.ops import login, out, service


def test_say_is_the_old_two_space_line(capsys):
    out.say("✓ module → /x")
    service._say("▸ target world: w")
    login._say("▸ open this once")
    assert capsys.readouterr().out == "  ✓ module → /x\n  ▸ target world: w\n  ▸ open this once\n"


def test_fail_says_and_returns_fail(capsys):
    assert out.fail("no module at /x") == out.FAIL == 1
    assert capsys.readouterr().out == "  ✗ no module at /x\n"


def test_event_writes_nothing_without_the_env(monkeypatch, tmp_path, capsys):
    monkeypatch.delenv(out.ENV_LOG, raising=False)
    monkeypatch.chdir(tmp_path)
    out.event("module-sync", module="pentaryn-x")
    assert list(tmp_path.iterdir()) == []
    assert capsys.readouterr().out == ""


def test_event_appends_one_json_line_with_ts_and_kind(monkeypatch, tmp_path, capsys):
    log = tmp_path / "sub" / "ops.jsonl"
    monkeypatch.setenv(out.ENV_LOG, str(log))
    out.event("module-sync", module="pentaryn-x", ok=True)
    out.event("stage", world="w")
    lines = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]
    assert [r["kind"] for r in lines] == ["module-sync", "stage"]
    assert lines[0]["module"] == "pentaryn-x" and lines[0]["ok"] is True
    assert all(r["ts"].endswith("Z") and "T" in r["ts"] for r in lines)
    assert capsys.readouterr().out == "", "events never reach stdout"
