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
