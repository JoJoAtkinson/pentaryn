#!/usr/bin/env python3

from __future__ import annotations

import ast
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
PROTOCOL_VERSION = "2025-06-18"
_TRANSPORT_MODE: Optional[str] = None  # "jsonl" | "lsp"


def _python_bin() -> Path:
    for candidate in (
        REPO_ROOT / ".venv" / "bin" / "python",
    ):
        if candidate.exists():
            return candidate
    return Path(sys.executable)


def _read_exact(stream: Any, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = stream.read(n - len(buf))
        if not chunk:
            break
        buf += chunk
    return buf


def _read_message() -> Optional[dict[str, Any]]:
    # Codex uses newline-delimited JSON-RPC over stdio (JSONL). Some MCP clients use LSP-style
    # Content-Length headers. Support both by sniffing the first line.
    global _TRANSPORT_MODE

    while True:
        first = sys.stdin.buffer.readline()
        if not first:
            return None
        if first not in (b"\r\n", b"\n"):
            break

    stripped = first.strip()
    if stripped.startswith(b"{") or stripped.startswith(b"["):
        _TRANSPORT_MODE = _TRANSPORT_MODE or "jsonl"
        return json.loads(stripped.decode("utf-8"))

    _TRANSPORT_MODE = _TRANSPORT_MODE or "lsp"

    headers: dict[str, str] = {}
    line = first
    while True:
        if line in (b"\r\n", b"\n"):
            break
        try:
            key, value = line.decode("utf-8").split(":", 1)
        except ValueError:
            line = sys.stdin.buffer.readline()
            if not line:
                return None
            continue
        headers[key.strip().lower()] = value.strip()
        line = sys.stdin.buffer.readline()
        if not line:
            return None

    length_raw = headers.get("content-length")
    if not length_raw:
        return None
    try:
        length = int(length_raw)
    except ValueError:
        return None
    body = _read_exact(sys.stdin.buffer, length)
    if not body:
        return None
    return json.loads(body.decode("utf-8"))


def _write_message(payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if _TRANSPORT_MODE == "jsonl":
        sys.stdout.buffer.write(body + b"\n")
        sys.stdout.buffer.flush()
        return
    sys.stdout.buffer.write(f"Content-Length: {len(body)}\r\n\r\n".encode("ascii"))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_schema: dict[str, Any]

@dataclass(frozen=True)
class ToolRunner:
    tool: Tool
    script_path: Path
    argv_template: tuple[str, ...]
    bool_flags: dict[str, str]
    value_flags: dict[str, str]

    def run(self, *, arguments: dict[str, Any]) -> str:
        python = _python_bin()
        argv: list[str] = []
        fmt_args: dict[str, str] = {}
        for key, value in arguments.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                fmt_args[key] = "" if value is None else str(value)
            else:
                fmt_args[key] = json.dumps(value, ensure_ascii=False)
        try:
            for token in self.argv_template:
                rendered = token.format(**fmt_args).strip()
                if rendered:
                    argv.append(rendered)
        except KeyError as exc:
            raise ValueError(f"Missing required argument: {exc.args[0]}") from exc

        for key in sorted(self.bool_flags.keys()):
            if key not in arguments:
                continue
            value = arguments.get(key)
            if not isinstance(value, bool):
                raise ValueError(f"Argument '{key}' must be a boolean")
            if value:
                argv.append(self.bool_flags[key])

        for key in sorted(self.value_flags.keys()):
            if key not in arguments:
                continue
            value = arguments.get(key)
            if value is None:
                continue
            if isinstance(value, bool):
                raise ValueError(f"Argument '{key}' must not be a boolean")
            rendered = str(value).strip()
            if not rendered:
                continue
            argv.extend([self.value_flags[key], rendered])

        proc = subprocess.run(
            [str(python), str(self.script_path), *argv],
            cwd=str(REPO_ROOT),
            env={**os.environ, "PYTHONUTF8": "1"},
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            msg = (proc.stderr or proc.stdout or "").strip() or f"{self.script_path.name} exited with {proc.returncode}"
            raise RuntimeError(msg)
        return (proc.stdout or "").strip()


@dataclass(frozen=True)
class DiscoveryResult:
    tools: tuple[ToolRunner, ...]
    skipped: tuple[tuple[Path, str], ...]


def _extract_mcp_tool_literal(source: str, *, path: Path) -> dict[str, Any] | None:
    if "MCP_TOOL" not in source:
        return None
    try:
        module = ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        raise ValueError(f"syntax error: {exc.msg} (line {exc.lineno})") from exc

    # Collect all MCP_TOOL* variables
    mcp_tool_vars: dict[str, ast.AST] = {}
    for node in module.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id.startswith("MCP_TOOL"):
                mcp_tool_vars[target.id] = node.value
    
    if not mcp_tool_vars:
        return None
    
    # If there's an MCP_TOOLS (plural) variable, use it as a list
    if "MCP_TOOLS" in mcp_tool_vars:
        try:
            value = ast.literal_eval(mcp_tool_vars["MCP_TOOLS"])
        except Exception as exc:
            raise ValueError("MCP_TOOLS must be a literal list or dict (no function calls or dynamic expressions)") from exc
        
        if isinstance(value, list):
            # MCP_TOOLS is a list of tool definitions
            return {"tools": value}
        elif isinstance(value, dict):
            # MCP_TOOLS is a single tool definition (backwards compatibility)
            return value
        else:
            raise ValueError("MCP_TOOLS must be a list of tool dicts or a single tool dict")
    
    # If there's an MCP_TOOL (singular) variable, use it
    if "MCP_TOOL" in mcp_tool_vars:
        try:
            value = ast.literal_eval(mcp_tool_vars["MCP_TOOL"])
        except Exception as exc:
            raise ValueError("MCP_TOOL must be a literal dict (no function calls or dynamic expressions)") from exc
        if not isinstance(value, dict):
            raise ValueError("MCP_TOOL must be a dict")
        return value
    
    # If there are multiple MCP_TOOL_<name> variables, collect them all
    tool_list = []
    for var_name in sorted(mcp_tool_vars.keys()):
        if var_name in ("MCP_TOOL", "MCP_TOOLS"):
            continue  # Already handled
        try:
            value = ast.literal_eval(mcp_tool_vars[var_name])
        except Exception as exc:
            raise ValueError(f"{var_name} must be a literal dict (no function calls or dynamic expressions)") from exc
        if not isinstance(value, dict):
            raise ValueError(f"{var_name} must be a dict")
        tool_list.append(value)
    
    if tool_list:
        return {"tools": tool_list}
    
    return None


def _normalize_input_schema(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {"type": "object", "properties": {}, "additionalProperties": False}
    if not isinstance(raw, dict):
        raise ValueError("input_schema must be a dict")
    return raw


def _tools_from_mcp_tool(*, path: Path, mcp_tool: dict[str, Any]) -> list[ToolRunner]:
    tools_raw = mcp_tool.get("tools")
    tool_entries: list[dict[str, Any]]
    if tools_raw is None:
        tool_entries = [mcp_tool]
    else:
        if not isinstance(tools_raw, list) or not all(isinstance(t, dict) for t in tools_raw):
            raise ValueError("MCP_TOOL['tools'] must be a list of dicts")
        tool_entries = list(tools_raw)

    runners: list[ToolRunner] = []
    for entry in tool_entries:
        name = str(entry.get("name") or path.stem).strip()
        if not name:
            raise ValueError("tool name cannot be empty")
        description = str(entry.get("description") or "").strip()
        input_schema = _normalize_input_schema(entry.get("input_schema") if "input_schema" in entry else entry.get("inputSchema"))

        argv_raw = entry.get("argv") or []
        if not isinstance(argv_raw, list) or not all(isinstance(a, str) for a in argv_raw):
            raise ValueError(f"{name}: argv must be a list of strings")

        bool_flags_raw = entry.get("bool_flags") or entry.get("boolFlags") or {}
        if not isinstance(bool_flags_raw, dict):
            raise ValueError(f"{name}: bool_flags must be a dict of argument_name -> flag")
        bool_flags: dict[str, str] = {}
        for k, v in bool_flags_raw.items():
            key = str(k).strip()
            flag = str(v).strip()
            if not key or not flag:
                continue
            bool_flags[key] = flag

        value_flags_raw = entry.get("value_flags") or entry.get("valueFlags") or {}
        if not isinstance(value_flags_raw, dict):
            raise ValueError(f"{name}: value_flags must be a dict of argument_name -> flag")
        value_flags: dict[str, str] = {}
        for k, v in value_flags_raw.items():
            key = str(k).strip()
            flag = str(v).strip()
            if not key or not flag:
                continue
            value_flags[key] = flag

        runners.append(
            ToolRunner(
                tool=Tool(name=name, description=description, input_schema=input_schema),
                script_path=path,
                argv_template=tuple(argv_raw),
                bool_flags=bool_flags,
                value_flags=value_flags,
            )
        )
    return runners


def discover_tools(*, repo_root: Path) -> DiscoveryResult:
    scripts_dir = (repo_root / "scripts").resolve()
    skipped: list[tuple[Path, str]] = []
    runners: list[ToolRunner] = []
    if not scripts_dir.exists():
        return DiscoveryResult(tools=tuple(), skipped=tuple())

    # Recursively discover all .py files in scripts/ and subdirectories
    # Skip __pycache__ and other special directories
    all_py_files = [
        p for p in scripts_dir.rglob("*.py")
        if p.is_file()
        and "__pycache__" not in p.parts
        and not p.name.startswith("_")
        and p.name != "__init__.py"
    ]
    
    for path in sorted(all_py_files, key=lambda p: str(p.relative_to(scripts_dir))):
        try:
            source = path.read_text(encoding="utf-8")
        except Exception as exc:
            skipped.append((path, f"unreadable: {exc}"))
            continue
        try:
            literal = _extract_mcp_tool_literal(source, path=path)
        except Exception as exc:
            skipped.append((path, str(exc)))
            continue
        if literal is None:
            skipped.append((path, "no MCP_TOOL"))
            continue
        try:
            runners.extend(_tools_from_mcp_tool(path=path, mcp_tool=literal))
        except Exception as exc:
            skipped.append((path, f"invalid MCP_TOOL: {exc}"))
            continue

    # Enforce globally-unique tool names.
    by_name: dict[str, ToolRunner] = {}
    for r in runners:
        if r.tool.name in by_name:
            skipped.append((r.script_path, f"duplicate tool name: {r.tool.name}"))
            continue
        by_name[r.tool.name] = r

    return DiscoveryResult(tools=tuple(by_name.values()), skipped=tuple(skipped))


def _print_list_tools(result: DiscoveryResult) -> int:
    tools = sorted(result.tools, key=lambda r: r.tool.name)
    skipped = sorted(result.skipped, key=lambda item: item[0].name)
    sys.stdout.write("Discovered tools:\n")
    if not tools:
        sys.stdout.write("- (none)\n")
    for r in tools:
        desc = r.tool.description.splitlines()[0].strip() if r.tool.description else ""
        sys.stdout.write(f"- {r.tool.name} ({r.script_path.relative_to(REPO_ROOT)}): {desc}\n")
    sys.stdout.write("\nSkipped scripts:\n")
    if not skipped:
        sys.stdout.write("- (none)\n")
    for path, reason in skipped:
        sys.stdout.write(f"- {path.relative_to(REPO_ROOT)}: {reason}\n")
    return 0


def main() -> int:
    if "--list-tools" in sys.argv[1:]:
        return _print_list_tools(discover_tools(repo_root=REPO_ROOT))

    discovery = discover_tools(repo_root=REPO_ROOT)
    runners = discovery.tools
    tools = tuple(r.tool for r in runners)
    runner_by_name = {r.tool.name: r for r in runners}

    while True:
        msg = _read_message()
        if msg is None:
            return 0

        method = msg.get("method")
        msg_id = msg.get("id")
        params = msg.get("params") or {}

        try:
            if method == "initialize":
                req_version = params.get("protocolVersion")
                result = {
                    "protocolVersion": str(req_version) if req_version else PROTOCOL_VERSION,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "dnd-scripts", "version": "0.1.0"},
                }
                if msg_id is not None:
                    _write_message({"jsonrpc": "2.0", "id": msg_id, "result": result})
                continue

            if method == "tools/list":
                result = {
                    "tools": [
                        {"name": t.name, "description": t.description, "inputSchema": t.input_schema}
                        for t in tools
                    ]
                }
                if msg_id is not None:
                    _write_message({"jsonrpc": "2.0", "id": msg_id, "result": result})
                continue

            if method == "tools/call":
                tool_name = str(params.get("name") or "")
                arguments = params.get("arguments") or {}
                if not isinstance(arguments, dict):
                    raise ValueError("tools/call params.arguments must be an object")
                runner = runner_by_name.get(tool_name)
                if runner is None:
                    raise ValueError(f"Unknown tool: {tool_name}")
                out = runner.run(arguments=arguments)
                result = {"content": [{"type": "text", "text": out}]}
                if msg_id is not None:
                    _write_message({"jsonrpc": "2.0", "id": msg_id, "result": result})
                continue

            # Ignore notifications like "initialized".
            if msg_id is None:
                continue

            _write_message(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"},
                }
            )
        except Exception as exc:
            if msg_id is None:
                continue
            _write_message(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {"code": -32000, "message": str(exc)},
                }
            )


if __name__ == "__main__":
    raise SystemExit(main())
