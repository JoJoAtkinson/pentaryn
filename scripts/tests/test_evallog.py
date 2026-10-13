"""The action-log report (mcp-fork-25): scripts/foundry/ops/evallog.py + `ops eval-report`.

Read-only reporting over JSONL; every case here builds its own lines or tmp folder and
never reads the real foundry/logs/.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.foundry.ops import cli, evallog

# The audit's five fixture lines, verbatim.
AUDIT_LINES = [
    '{"ok":true,"phase":"complete","script":"return game.pentaryn.ties.attributes.of(a)","ms":5}',
    '{"ok":false,"phase":"runtime","error":"hits.slice is not a function",'
    '"script":"game.pentaryn.rules.search(\'x\').slice(0)","ms":3}',
    '{"ok":false,"phase":"transport","error":"Foundry VTT module not connected","script":"x"}',
    '{"ok":true,"phase":"complete","script":"return Object.keys(game.pentaryn)","ms":1}',
    '{"ok":true,"phase":"comp',   # malformed: a partial last line
]


def test_audit_fixture():
    r = evallog.summarise(AUDIT_LINES)
    assert r["totals"] == {("True", "complete"): 2, ("False", "runtime"): 1,
                           ("False", "transport"): 1}
    assert r["paths"][("ties", "attributes")] == 1
    assert r["paths"][("rules", "search")] == 1
    assert r["discovery"] == 1
    assert r["skipped"] == 1
    assert r["errors"] == [("hits.slice is not a function", 1)]
    assert r["evals"] == 4


def test_since_filters_on_ts():
    lines = ['{"ts":"2026-08-31T23:59:59.000Z","ok":true,"phase":"complete","script":"x"}',
             '{"ts":"2026-09-01T00:00:00.000Z","ok":true,"phase":"complete","script":"x"}',
             '{"ok":true,"phase":"complete","script":"no ts"}']
    r = evallog.summarise(lines, since="2026-09-01")
    assert r["evals"] == 1 and r["filtered"] == 2
    assert evallog.summarise(lines)["evals"] == 3


def test_percentiles():
    lines = [json.dumps({"ok": True, "phase": "complete", "script": "", "ms": ms})
             for ms in range(1, 101)]
    assert evallog.summarise(lines)["eval_ms"] == {"p50": 51, "p95": 95}
    assert evallog.summarise([])["eval_ms"] == {"p50": None, "p95": None}


def test_tool_lines_are_counted_apart_from_eval_lines():
    lines = [
        '{"ts":"2026-10-04T13:44:17.328Z","tool":"eval-js","args":{"script":"game.pentaryn.ties.x()"},"ok":true,"ms":4}',
        '{"ts":"2026-10-04T13:45:00.000Z","tool":"delete-tokens","args":{},"ok":false,"error":"nope"}',
        '{"ts":"2026-10-04T13:46:00.000Z","server":"dnd-scripts","tool":"roll_dice","mode":"inprocess","args":{},"ok":true,"ms":2,"error":null}',
        '{"ts":"2026-10-04T13:47:00.000Z","tool":"pentaryn-read","ns":"cursors","path":"status","ok":true,"ms":9}',
        '{"ts":"2026-10-04T13:48:00.000Z","tool":"pentaryn-write","args":{"ns":"importer","path":"import"},"ok":true}',
    ]
    r = evallog.summarise(lines)
    assert r["evals"] == 0 and not r["paths"], "an eval-js tool line is not an eval line"
    assert r["tools"] == {("foundry", "eval-js"): 1, ("foundry", "delete-tokens"): 1,
                          ("dnd-scripts", "roll_dice"): 1, ("foundry", "pentaryn-read"): 1,
                          ("foundry", "pentaryn-write"): 1}
    assert r["tool_failures"] == {("foundry", "delete-tokens"): 1}
    assert r["pentaryn"] == {("pentaryn-read", "cursors", "status"): 1,
                             ("pentaryn-write", "importer", "import"): 1}


def test_paths_count_once_per_call_and_handle_optional_chaining():
    r = evallog.summarise([json.dumps({"ok": True, "phase": "complete", "script":
        "game.pentaryn?.rules?.search('a'); game.pentaryn.rules.search('b'); "
        "game.pentaryn.describe()"})])
    assert r["paths"][("rules", "search")] == 1
    assert r["discovery"] == 1


def _write(d: Path, name: str, lines: list[str]) -> None:
    (d / name).write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_report_globs_both_eval_names_and_skips_old_months(tmp_path):
    ev = '{"ts":"%s","ok":true,"phase":"complete","script":"x","ms":1}'
    _write(tmp_path, "eval.jsonl", [ev % "2026-09-15T00:00:00Z"])
    _write(tmp_path, "eval-2026-10.jsonl", [ev % "2026-10-02T00:00:00Z"])
    _write(tmp_path, "mcp-2026-08.jsonl", ['{"ts":"2026-08-01T00:00:00Z","tool":"x"}'])
    _write(tmp_path, "mcp-2026-10.jsonl", ['{"ts":"2026-10-03T00:00:00Z","tool":"x"}'])
    _write(tmp_path, "dnd-scripts-2026-10.jsonl",
           ['{"ts":"2026-10-03T00:00:00Z","server":"dnd-scripts","tool":"roll_dice","ok":true}'])
    _write(tmp_path, "ops-2026-10.jsonl", ['{"ts":"2026-10-03T00:00:00Z","kind":"sync"}'])
    r = evallog.report(tmp_path)
    assert r["files"] == ["dnd-scripts-2026-10.jsonl", "eval-2026-10.jsonl", "eval.jsonl",
                          "mcp-2026-08.jsonl", "mcp-2026-10.jsonl"]
    assert r["evals"] == 2
    r = evallog.report(tmp_path, since="2026-10-01")
    assert "mcp-2026-08.jsonl" not in r["files"] and "eval.jsonl" in r["files"]
    assert r["evals"] == 1 and r["tools"][("foundry", "x")] == 1


def test_large_file_is_streamed(tmp_path, monkeypatch):
    """Performance: 50k lines in one pass, no list of the whole file."""
    line = '{"ok":true,"phase":"complete","script":"game.pentaryn.ties.attributes.of(a)","ms":2}\n'
    (tmp_path / "eval.jsonl").write_text(line * 50_000 + '{"partial', encoding="utf-8")
    loads = []
    real = evallog.json.loads
    monkeypatch.setattr(evallog.json, "loads", lambda s: loads.append(1) or real(s))
    r = evallog.report(tmp_path)
    assert r["evals"] == 50_000 and r["skipped"] == 1 and len(loads) == 50_001


def test_cli_prose_and_json(tmp_path, capsys):
    _write(tmp_path, "eval.jsonl", AUDIT_LINES)
    assert cli.main(["eval-report", "--dir", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "eval-js: 4 call(s)" in out and "ties.attributes" in out
    assert "1 malformed line(s) skipped" in out and "hits.slice is not a function" in out
    assert cli.main(["eval-report", "--dir", str(tmp_path), "--json"]) == 0
    j = json.loads(capsys.readouterr().out)
    assert j["evals"] == 4 and j["discovery"] == 1 and j["skipped"] == 1
    assert {"path": "ties.attributes", "count": 1} in j["paths"]


def test_cli_missing_folder_fails_cleanly(tmp_path, capsys):
    assert cli.main(["eval-report", "--dir", str(tmp_path / "nope")]) == 1
    assert "no log folder" in capsys.readouterr().out


def test_cli_defaults_to_the_mcp_log_env(tmp_path, monkeypatch, capsys):
    _write(tmp_path, "eval.jsonl", AUDIT_LINES[:1])
    monkeypatch.setenv("PENTARYN_MCP_LOG_DIR", str(tmp_path))
    assert cli.main(["eval-report", "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["log_dir"] == str(tmp_path)


def test_log_files_selects_by_the_named_globs(tmp_path, monkeypatch):
    """EXT-7: files are picked by name (LOG_GLOBS), not by shape; only the line kind is."""
    assert evallog.LOG_GLOBS == ("eval*.jsonl", "mcp-*.jsonl", "dnd-scripts-*.jsonl")
    (tmp_path / "eval.jsonl").write_text("")
    (tmp_path / "other-2026-10.jsonl").write_text('{"tool":"x"}\n')   # tool-shaped, unnamed
    assert [f.name for f in evallog.log_files(tmp_path)] == ["eval.jsonl"]
    monkeypatch.setattr(evallog, "LOG_GLOBS", ("other-*.jsonl",))
    assert [f.name for f in evallog.log_files(tmp_path)] == ["other-2026-10.jsonl"]
    doc = evallog.__doc__
    assert "by name (LOG_GLOBS)" in doc and "told apart by shape, not by name" not in doc
