"""Discovery tests for scripts/mcp/server.py (B3-F4: server.py had zero tests).

Covers:
- discover_tools finds both an in-process-style module (exposes MCP_HANDLERS)
  and an AST-only module (MCP_TOOL literal only), classifying routing correctly.
- A duplicate tool name across modules → the second goes to `skipped`, no crash.
- A MCP_TOOLS entry with no matching MCP_HANDLERS handler → `skipped`
  (the A2-L7 / A4-L3 fix).
- _extract_mcp_tool_literal returns a literal for a well-formed module and
  None for a module without an MCP_TOOL.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_SERVER_PATH = Path(__file__).resolve().parents[1] / "mcp" / "server.py"


def _load_server():
    name = "_mcp_server_under_test"
    spec = importlib.util.spec_from_file_location(name, _SERVER_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    # Register in sys.modules before exec so @dataclass can resolve the module
    # namespace (Python 3.12+ dataclasses look it up via sys.modules).
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


server = _load_server()


def _make_repo(tmp_path: Path) -> Path:
    """Create a tmp repo dir with an empty scripts/ subdir."""
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    return tmp_path


# ---------------------------------------------------------------------------
# Sample module sources
# ---------------------------------------------------------------------------

_INPROC_MODULE = '''\
MCP_TOOL = {
    "name": "sample_inproc",
    "description": "An in-process sample tool.",
    "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
}

def _handler():
    return "ok"

MCP_HANDLERS = {"sample_inproc": _handler}
'''

_AST_ONLY_MODULE = '''\
MCP_TOOL = {
    "name": "sample_subproc",
    "description": "An AST-only subprocess sample tool.",
    "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    "argv": [],
}
'''

_NO_TOOL_MODULE = '''\
"""A module with no MCP_TOOL at all."""

def helper():
    return 42
'''

_MISSING_HANDLER_MODULE = '''\
MCP_TOOLS = [
    {
        "name": "wired_tool",
        "description": "Has a handler.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "orphan_tool",
        "description": "MCP_TOOLS entry with NO MCP_HANDLERS entry.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
]

def _wired():
    return "wired"

MCP_HANDLERS = {"wired_tool": _wired}
'''


def test_discovers_inprocess_and_ast_only_modules(tmp_path):
    repo = _make_repo(tmp_path)
    (repo / "scripts" / "alpha_inproc.py").write_text(_INPROC_MODULE, encoding="utf-8")
    (repo / "scripts" / "beta_subproc.py").write_text(_AST_ONLY_MODULE, encoding="utf-8")

    result = server.discover_tools(repo_root=repo)
    by_name = {r.tool.name: r for r in result.tools}

    assert "sample_inproc" in by_name
    assert "sample_subproc" in by_name
    # In-process module → handler is wired; AST-only module → handler is None.
    assert by_name["sample_inproc"].handler is not None
    assert by_name["sample_subproc"].handler is None


def test_module_without_mcp_tool_is_skipped(tmp_path):
    repo = _make_repo(tmp_path)
    (repo / "scripts" / "plain.py").write_text(_NO_TOOL_MODULE, encoding="utf-8")

    result = server.discover_tools(repo_root=repo)
    assert all(r.tool.name != "plain" for r in result.tools)
    skipped_names = {path.name for path, _ in result.skipped}
    assert "plain.py" in skipped_names


def test_duplicate_tool_name_second_module_is_skipped(tmp_path):
    repo = _make_repo(tmp_path)
    # Two AST-only modules both declaring the SAME tool name. Files are scanned
    # in path-sorted order, so a_dup.py wins and b_dup.py goes to `skipped`.
    dup = _AST_ONLY_MODULE.replace("sample_subproc", "collision")
    (repo / "scripts" / "a_dup.py").write_text(dup, encoding="utf-8")
    (repo / "scripts" / "b_dup.py").write_text(dup, encoding="utf-8")

    result = server.discover_tools(repo_root=repo)
    # Exactly one tool registered, no crash.
    collision_tools = [r for r in result.tools if r.tool.name == "collision"]
    assert len(collision_tools) == 1
    # The losing module is in `skipped` with a duplicate-name reason.
    dup_skips = [
        (path, reason) for path, reason in result.skipped
        if "duplicate tool name" in reason
    ]
    assert len(dup_skips) == 1
    assert dup_skips[0][0].name == "b_dup.py"


def test_mcp_tools_entry_without_handler_is_skipped(tmp_path):
    """A2-L7 / A4-L3: an MCP_TOOLS tool with no MCP_HANDLERS entry must NOT
    register half-wired — it goes to `skipped` instead."""
    repo = _make_repo(tmp_path)
    (repo / "scripts" / "partial.py").write_text(_MISSING_HANDLER_MODULE, encoding="utf-8")

    result = server.discover_tools(repo_root=repo)
    by_name = {r.tool.name: r for r in result.tools}

    # The wired tool registers in-process; the orphan does NOT register at all.
    assert "wired_tool" in by_name
    assert by_name["wired_tool"].handler is not None
    assert "orphan_tool" not in by_name

    handler_skips = [
        reason for path, reason in result.skipped
        if "orphan_tool" in reason and "MCP_HANDLERS" in reason
    ]
    assert len(handler_skips) == 1


def test_extract_mcp_tool_literal_wellformed(tmp_path):
    literal = server._extract_mcp_tool_literal(
        _AST_ONLY_MODULE, path=tmp_path / "beta_subproc.py"
    )
    assert isinstance(literal, dict)
    assert literal.get("name") == "sample_subproc"


def test_extract_mcp_tool_literal_none_without_tool(tmp_path):
    literal = server._extract_mcp_tool_literal(
        _NO_TOOL_MODULE, path=tmp_path / "plain.py"
    )
    assert literal is None


def test_annotated_mcp_tool_is_discovered(tmp_path):
    """README: discovery reads a module's MCP_TOOL literal — an annotated
    `MCP_TOOL: dict[...] = {...}` is still that literal, not 'no MCP_TOOL'."""
    repo = _make_repo(tmp_path)
    (repo / "scripts" / "ann_tool.py").write_text(
        'from typing import Any\n'
        'MCP_TOOL: dict[str, Any] = {"name": "ann_tool", "description": "x", "argv": []}\n',
        encoding="utf-8")

    result = server.discover_tools(repo_root=repo)
    by_name = {r.tool.name: r for r in result.tools}
    assert "ann_tool" in by_name, result.skipped
    assert by_name["ann_tool"].handler is None


def test_annotated_mcp_groups_passes_the_group_filter(tmp_path, monkeypatch):
    """README: DND_MCP_TOOLS_GROUP loads modules whose top-level MCP_GROUPS
    list contains the group — an annotated MCP_GROUPS is that list."""
    monkeypatch.setenv("DND_MCP_TOOLS_GROUP", "combat")
    repo = _make_repo(tmp_path)
    (repo / "scripts" / "grouped.py").write_text(
        'MCP_GROUPS: list[str] = ["combat"]\n' + _AST_ONLY_MODULE, encoding="utf-8")

    result = server.discover_tools(repo_root=repo)
    assert "sample_subproc" in {r.tool.name for r in result.tools}, result.skipped


# ---------------------------------------------------------------------------
# python-tooling-27: discovery cost and the startup skip report
# ---------------------------------------------------------------------------

import json
from datetime import datetime, timezone

import pytest

_REPO_ROOT = _SERVER_PATH.parents[2]
_DISCOVERY_GOLDEN = Path(__file__).with_name("fixtures") / "dnd_scripts_discovery.json"
_BENIGN = "no MCP_TOOL"


def _scanned(repo: Path) -> list[Path]:
    scripts = repo / "scripts"
    return [p for p in scripts.rglob("*.py")
            if "__pycache__" not in p.parts and not p.name.startswith("_")
            and (scripts / "mcp") not in p.parents]


@pytest.mark.repo
def test_discovery_unchanged_on_repo():
    """Characterisation: the registered tools (name, script, in-process?) and the real
    failures equal the golden; every other skip is the benign 'no MCP_TOOL', for exactly
    the files that do not declare one. A new tool updates the golden in its own commit."""
    result = server.discover_tools(repo_root=_REPO_ROOT)
    want = json.loads(_DISCOVERY_GOLDEN.read_text(encoding="utf-8"))
    tools = sorted([r.tool.name, str(r.script_path.relative_to(_REPO_ROOT)),
                    r.handler is not None] for r in result.tools)
    assert tools == want["tools"]
    failures = sorted([str(p.relative_to(_REPO_ROOT)), why]
                      for p, why in result.skipped if why != _BENIGN)
    assert failures == want["failures"]
    benign = {p for p, why in result.skipped if why == _BENIGN}
    declaring = {r.script_path for r in result.tools} | {p for p, why in result.skipped
                                                          if why != _BENIGN}
    assert benign == {p.resolve() for p in _scanned(_REPO_ROOT)} - declaring


@pytest.mark.repo
def test_discovery_parses_only_files_that_mention_mcp(monkeypatch):
    calls = []
    real = server.ast.parse

    def counting(source, *a, **kw):
        calls.append(1)
        return real(source, *a, **kw)

    monkeypatch.setattr(server.ast, "parse", counting)
    server.discover_tools(repo_root=_REPO_ROOT)
    mentioning = sum("MCP_" in p.read_text(encoding="utf-8") for p in _scanned(_REPO_ROOT))
    assert len(calls) <= mentioning


_BROKEN_TOOL = 'MCP_TOOL = {"name": "broken", "argv": "not-a-list"}\n'


def _startup_stderr(monkeypatch, capsys, repo: Path) -> str:
    monkeypatch.setattr(server, "REPO_ROOT", repo)
    monkeypatch.setattr(server, "_read_message", lambda: None)   # stdin EOF: serve 0 calls
    monkeypatch.setattr(sys, "argv", ["server.py"])
    assert server.main() == 0
    return capsys.readouterr().err


def test_startup_lists_real_failures_and_counts_the_rest(tmp_path, monkeypatch, capsys):
    repo = _make_repo(tmp_path)
    (repo / "scripts" / "helper.py").write_text(_NO_TOOL_MODULE, encoding="utf-8")
    (repo / "scripts" / "broken.py").write_text(_BROKEN_TOOL, encoding="utf-8")
    err = _startup_stderr(monkeypatch, capsys, repo)
    assert "broken.py" in err and "argv must be a list" in err
    assert "helper.py" not in err
    assert "1 script(s) without an MCP_TOOL" in err


def test_startup_skip_report_names_a_real_failure(tmp_path, monkeypatch, capsys):
    """Characterisation (holds before and after): a broken tool reaches stderr."""
    repo = _make_repo(tmp_path)
    (repo / "scripts" / "broken.py").write_text(_BROKEN_TOOL, encoding="utf-8")
    err = _startup_stderr(monkeypatch, capsys, repo)
    assert "broken.py: invalid MCP_TOOL: broken: argv must be a list of strings" in err


@pytest.mark.parametrize("key", ["bool_flags", "value_flags"])
def test_flag_map_errors_pinned(tmp_path, key):
    """Characterisation (holds before and after MNT-6): a non-dict flag map is skipped
    with the exact reason naming the snake_case key."""
    repo = _make_repo(tmp_path)
    (repo / "scripts" / "t.py").write_text(
        f'MCP_TOOL = {{"name": "t", "argv": [], "{key}": [1]}}\n', encoding="utf-8")
    result = server.discover_tools(repo_root=repo)
    assert [r.tool.name for r in result.tools] == []
    reasons = [why for path, why in result.skipped if path.name == "t.py"]
    assert reasons == [f"invalid MCP_TOOL: t: {key} must be a dict of argument_name -> flag"]


def test_flag_map_camel_case_and_blank_entries(tmp_path):
    """Characterisation: an empty snake_case map falls through to the camelCase one,
    keys and flags are stripped, and blank entries are dropped."""
    repo = _make_repo(tmp_path)
    (repo / "scripts" / "t.py").write_text(
        'MCP_TOOL = {"name": "t", "argv": [], "bool_flags": {}, '
        '"boolFlags": {" quiet ": " --quiet ", "": "--x", "y": " "}, '
        '"valueFlags": {"n": "--n"}}\n', encoding="utf-8")
    result = server.discover_tools(repo_root=repo)
    (runner,) = result.tools
    assert runner.bool_flags == {"quiet": "--quiet"}
    assert runner.value_flags == {"n": "--n"}


# ---------------------------------------------------------------------------
# python-tooling-29: the per-call worker (payload pinned before the action log)
# ---------------------------------------------------------------------------

def _runner(handler, name="probe"):
    return server.ToolRunner(
        tool=server.Tool(name=name, description="", input_schema={}),
        script_path=_SERVER_PATH, argv_template=(), bool_flags={}, value_flags={},
        handler=handler)


def _call(monkeypatch, runner, arguments, msg_id=7):
    sent = []
    monkeypatch.setattr(server, "_write_message", sent.append)
    server._inflight_slots.acquire()
    server._run_call_worker(msg_id, runner, arguments)
    return sent


def _boom(**kw):
    raise ValueError("bad thing")


def test_worker_payload_for_a_result(monkeypatch, tmp_path):
    monkeypatch.delenv("PENTARYN_MCP_LOG_DIR", raising=False)
    sent = _call(monkeypatch, _runner(lambda **k: "ok"), {"a": 1})
    assert sent == [{"jsonrpc": "2.0", "id": 7,
                     "result": {"content": [{"type": "text", "text": "ok"}]}}]


def test_worker_payload_for_a_raising_handler(monkeypatch, capsys):
    monkeypatch.delenv("PENTARYN_MCP_LOG_DIR", raising=False)
    sent = _call(monkeypatch, _runner(_boom), {})
    assert sent == [{"jsonrpc": "2.0", "id": 7,
                     "error": {"code": -32000, "message": "bad thing"}}]
    assert "tool 'probe' crashed" in capsys.readouterr().err


# ---------------------------------------------------------------------------
# python-tooling-29: the dnd-scripts action log
# ---------------------------------------------------------------------------

_LOG_KEYS = {"ts", "server", "tool", "mode", "args", "ok", "ms", "error"}


def _log_lines(log_dir: Path) -> list[dict]:
    files = sorted(log_dir.glob("dnd-scripts-*.jsonl"))
    return [json.loads(l) for f in files for l in f.read_text(encoding="utf-8").splitlines()]


def test_log_env_unset_writes_nothing(monkeypatch, tmp_path):
    monkeypatch.delenv("PENTARYN_MCP_LOG_DIR", raising=False)
    monkeypatch.chdir(tmp_path)
    _call(monkeypatch, _runner(lambda **k: "ok"), {"a": 1})
    assert list(tmp_path.rglob("*.jsonl")) == []


def test_log_one_line_per_call_with_exactly_the_keys(monkeypatch, tmp_path):
    monkeypatch.setenv("PENTARYN_MCP_LOG_DIR", str(tmp_path))
    sent = _call(monkeypatch, _runner(lambda **k: "ok"), {"a": 1, "b": "x"})
    assert sent[0]["result"]["content"][0]["text"] == "ok"     # payload unchanged
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    assert [p.name for p in tmp_path.iterdir()] == [f"dnd-scripts-{month}.jsonl"]
    [line] = _log_lines(tmp_path)
    assert set(line) == _LOG_KEYS
    assert line["server"] == "dnd-scripts" and line["tool"] == "probe"
    assert line["mode"] == "inprocess" and line["args"] == {"a": 1, "b": "x"}
    assert line["ok"] is True and line["error"] is None and isinstance(line["ms"], int)
    assert line["ts"].endswith("Z")


def test_log_records_a_failure_and_the_error_is_unchanged(monkeypatch, tmp_path):
    monkeypatch.setenv("PENTARYN_MCP_LOG_DIR", str(tmp_path))
    sent = _call(monkeypatch, _runner(_boom), {})
    assert sent == [{"jsonrpc": "2.0", "id": 7,
                     "error": {"code": -32000, "message": "bad thing"}}]
    [line] = _log_lines(tmp_path)
    assert (line["ok"], line["error"]) == (False, "bad thing")


def test_log_subprocess_mode_and_truncated_args(monkeypatch, tmp_path):
    monkeypatch.setenv("PENTARYN_MCP_LOG_DIR", str(tmp_path))
    r = server.ToolRunner(tool=server.Tool(name="sub", description="", input_schema={}),
                          script_path=_SERVER_PATH, argv_template=(), bool_flags={},
                          value_flags={})
    monkeypatch.setattr(server.ToolRunner, "run", lambda self, *, arguments: "done")
    _call(monkeypatch, r, {"big": "x" * 5000, "obj": {"k": "y" * 3000}, "n": 3})
    [line] = _log_lines(tmp_path)
    assert line["mode"] == "subprocess"
    assert line["args"]["n"] == 3
    assert line["args"]["big"].startswith("x" * 2048) and "truncated 2952" in line["args"]["big"]
    assert len(line["args"]["obj"]) < 2100 and line["args"]["obj"].startswith('{"k": "yyy')


def test_log_line_survives_a_lone_surrogate(monkeypatch, tmp_path):
    # README: every tools/call appends one line -- a lone UTF-16 surrogate in an
    # argument must not drop it (it is written as its JSON escape instead).
    monkeypatch.setenv("PENTARYN_MCP_LOG_DIR", str(tmp_path))
    sent = _call(monkeypatch, _runner(lambda **k: "ok"), {"q": "x\ud800", "r": "\u16cf200"})
    assert sent[0]["result"]["content"][0]["text"] == "ok"
    [line] = _log_lines(tmp_path)
    assert line["args"] == {"q": "x\ud800", "r": "\u16cf200"}
    raw = b"".join(p.read_bytes() for p in tmp_path.glob("dnd-scripts-*.jsonl"))
    assert "\u16cf200".encode("utf-8") in raw          # encodable text stays raw UTF-8


def test_log_dir_that_is_a_file_does_not_break_the_call(monkeypatch, tmp_path, capsys):
    not_a_dir = tmp_path / "file"
    not_a_dir.write_text("", encoding="utf-8")
    monkeypatch.setenv("PENTARYN_MCP_LOG_DIR", str(not_a_dir))
    sent = _call(monkeypatch, _runner(lambda **k: "ok"), {})
    assert sent[0]["result"]["content"][0]["text"] == "ok"
    assert "action log not written" in capsys.readouterr().err


def test_log_month_is_taken_per_call(monkeypatch, tmp_path):
    monkeypatch.setenv("PENTARYN_MCP_LOG_DIR", str(tmp_path))

    class _DT(datetime):
        stamp = datetime(2026, 10, 31, 23, 59, 59, tzinfo=timezone.utc)

        @classmethod
        def now(cls, tz=None):
            return cls.stamp

    monkeypatch.setattr(server, "datetime", _DT)
    _call(monkeypatch, _runner(lambda **k: "ok"), {})
    _DT.stamp = datetime(2026, 11, 1, 0, 0, 1, tzinfo=timezone.utc)
    _call(monkeypatch, _runner(lambda **k: "ok"), {})
    assert sorted(p.name for p in tmp_path.iterdir()) == [
        "dnd-scripts-2026-10.jsonl", "dnd-scripts-2026-11.jsonl"]


# ---------------------------------------------------------------------------
# py-mcp-ac-6: the stdin serve loop (inline replies, admission control, slots)
# ---------------------------------------------------------------------------

class _SyncExecutor:
    """Runs each submitted call at once, so the serve loop is deterministic."""

    def submit(self, fn, *args):
        fn(*args)


def _serve(monkeypatch, messages, runners=(), slots=2):
    sent = []
    feed = iter([*messages, None])
    monkeypatch.setattr(server, "_read_message", lambda: next(feed))
    monkeypatch.setattr(server, "_write_message", sent.append)
    monkeypatch.setattr(server, "_inflight_slots", server.threading.Semaphore(slots))
    monkeypatch.delenv("PENTARYN_MCP_LOG_DIR", raising=False)
    tools = tuple(r.tool for r in runners)
    by_name = {r.tool.name: r for r in runners}
    assert server._serve_loop(tools, by_name, _SyncExecutor()) == 0
    return sent


def test_serve_loop_inline_payloads_pinned(monkeypatch):
    """Characterisation: initialize echoes any requested version (EC-7), and the
    inline error envelopes for an unknown method and an unknown tool."""
    sent = _serve(monkeypatch, [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "1999-01-01"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "nope"},
        {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "x"}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
    ], runners=(_runner(lambda **k: "ok"),))
    assert sent == [
        {"jsonrpc": "2.0", "id": 1, "result": {
            "protocolVersion": "1999-01-01",
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "dnd-scripts", "version": "0.1.0"}}},
        {"jsonrpc": "2.0", "id": 2, "result": {"tools": [
            {"name": "probe", "description": "", "inputSchema": {}}]}},
        {"jsonrpc": "2.0", "id": 3,
         "error": {"code": -32601, "message": "Method not found: nope"}},
        {"jsonrpc": "2.0", "id": 4,
         "error": {"code": -32000, "message": "Unknown tool: x"}},
    ]


def test_serve_loop_busy_reply_when_slots_exhausted(monkeypatch):
    calls = []
    sent = _serve(monkeypatch, [
        {"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "probe"}},
    ], runners=(_runner(lambda **k: calls.append(k) or "ok"),), slots=0)
    assert calls == []
    assert len(sent) == 1 and sent[0]["id"] == 5
    assert sent[0]["error"]["code"] == -32000
    assert sent[0]["error"]["message"].startswith("Server busy: ")


def test_serve_loop_releases_slots(monkeypatch):
    call = {"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "probe"}}
    sent = _serve(monkeypatch, [{**call, "id": i} for i in (1, 2, 3)],
                  runners=(_runner(lambda **k: "ok"),), slots=2)
    assert [m["id"] for m in sent] == [1, 2, 3]
    assert all("result" in m for m in sent)
    assert server._inflight_slots._value == 2


# ---------------------------------------------------------------------------
# py-mcp-rob-2 (EC-1, py-mcp-ac-1): a non-object JSON frame is skipped, not fatal
# ---------------------------------------------------------------------------

import io
import types


def _stdin(monkeypatch, data: bytes):
    monkeypatch.setattr(server.sys, "stdin", types.SimpleNamespace(buffer=io.BytesIO(data)))


def _lsp(body: bytes) -> bytes:
    return b"Content-Length: %d\r\n\r\n%s" % (len(body), body)


_INIT = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}


@pytest.mark.parametrize("frames", [
    b"[1, 2]\n" + json.dumps(_INIT).encode() + b"\n",          # JSONL batch
    b"[]\n" + json.dumps(_INIT).encode() + b"\n",              # JSONL empty batch
    _lsp(b"null") + _lsp(json.dumps(_INIT).encode()),          # LSP null body (was EOF)
    _lsp(b"5") + _lsp(json.dumps(_INIT).encode()),             # LSP scalar body
    _lsp(b"[{}]") + _lsp(json.dumps(_INIT).encode()),          # LSP batch body
], ids=["jsonl-batch", "jsonl-empty-batch", "lsp-null", "lsp-scalar", "lsp-batch"])
def test_py_mcp_rob_2_non_object_frame_is_skipped(monkeypatch, capsys, frames):
    _stdin(monkeypatch, frames)
    monkeypatch.setattr(server, "_TRANSPORT_MODE", None)
    assert server._read_message() is server._SKIP_MESSAGE
    assert "[mcp-server] discarding non-object JSON-RPC message" in capsys.readouterr().err
    assert server._read_message() == _INIT          # serving continues
    assert server._read_message() is None           # then real EOF


def test_py_mcp_rob_2_serve_loop_survives_a_batch(monkeypatch):
    _stdin(monkeypatch, b"[1]\n" + json.dumps(_INIT).encode() + b"\n")
    monkeypatch.setattr(server, "_TRANSPORT_MODE", None)
    sent = []
    monkeypatch.setattr(server, "_write_message", sent.append)
    assert server._serve_loop((), {}, _SyncExecutor()) == 0
    assert [m["id"] for m in sent] == [1]


# ---------------------------------------------------------------------------
# py-mcp-rob-1: once in JSONL mode, a non-JSON line is skipped, not parsed as an
# LSP header (which would swallow every later request looking for a blank line)
# ---------------------------------------------------------------------------

def test_py_mcp_rob_1_non_json_line_in_jsonl_mode_is_skipped(monkeypatch, capsys):
    ping = {"jsonrpc": "2.0", "id": 2, "method": "ping"}
    _stdin(monkeypatch, json.dumps(_INIT).encode() + b"\n"
           + b"oops not json\n"
           + json.dumps(ping).encode() + b"\n")
    monkeypatch.setattr(server, "_TRANSPORT_MODE", None)
    assert server._read_message() == _INIT
    assert server._TRANSPORT_MODE == "jsonl"
    assert server._read_message() is server._SKIP_MESSAGE
    assert "[mcp-server] discarding non-JSON line in JSONL mode" in capsys.readouterr().err
    assert server._read_message() == ping           # later request still served
    assert server._read_message() is None
    assert server._TRANSPORT_MODE == "jsonl"


def test_py_mcp_rob_1_first_frame_still_sniffs_lsp(monkeypatch):
    _stdin(monkeypatch, _lsp(json.dumps(_INIT).encode()))
    monkeypatch.setattr(server, "_TRANSPORT_MODE", None)
    assert server._read_message() == _INIT
    assert server._TRANSPORT_MODE == "lsp"


# ---------------------------------------------------------------------------
# py-mcp-MNT-3: discover_tools' candidate scan and in-process load are their own
# helpers; the scan's exclusions (and so the skipped order) are unchanged
# ---------------------------------------------------------------------------

def test_py_mcp_mnt_3_candidate_scripts_keeps_the_exclusions(tmp_path):
    scripts = _make_repo(tmp_path) / "scripts"
    for rel in ("b.py", "a.py", "sub/c.py", "sub/__init__.py", "_private.py",
                "__pycache__/cached.py", "mcp/server.py", "notes.txt"):
        (scripts / rel).parent.mkdir(parents=True, exist_ok=True)
        (scripts / rel).write_text("", encoding="utf-8")
    found = server._candidate_scripts(scripts)
    assert [str(p.relative_to(scripts)) for p in found] == ["a.py", "b.py", "sub/c.py"]


def test_py_mcp_mnt_3_load_in_process(tmp_path):
    scripts = _make_repo(tmp_path) / "scripts"

    def load(name, source):
        path = scripts / name
        path.write_text(source, encoding="utf-8")
        return server._load_in_process(path, source, server.ast.parse(source))

    assert load("ast_only.py", _AST_ONLY_MODULE) is None   # no MCP_HANDLERS: AST path
    literal, handlers = load("inproc_mnt3.py", _INPROC_MODULE)
    assert literal["name"] == "sample_inproc" and set(handlers) == {"sample_inproc"}
    literal, handlers = load("many_mnt3.py", _MISSING_HANDLER_MODULE)
    assert [t["name"] for t in literal["tools"]] == ["wired_tool", "orphan_tool"]
    assert load("bare_mnt3.py", "MCP_HANDLERS = {}\n") == \
        "module imported but no usable MCP_TOOLS/MCP_TOOL attribute"
    assert load("boom_mnt3.py", "MCP_HANDLERS = {}\nraise RuntimeError('boom')\n") == \
        "in-process import failed: boom"
