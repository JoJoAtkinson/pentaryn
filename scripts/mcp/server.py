#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional


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


def _ages_converter_path() -> Path:
    return (REPO_ROOT / "scripts" / "ages_converter.py").resolve()


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


TOOLS: tuple[Tool, ...] = (
    Tool(
        name="year_to_age",
        description=(
            "Convert an A.F. year (e.g. 4150) to an age glyph label (e.g. ᛏ200). "
            "If the year is negative, it is treated as an offset from the configured present_year (e.g. -50 = present_year-50)."
        ),
        input_schema={
            "type": "object",
            "properties": {"year": {"type": "integer", "description": "A.F. year to convert"}},
            "required": ["year"],
            "additionalProperties": False,
        },
    ),
    Tool(
        name="age_to_year",
        description=(
            "Convert an age glyph label (e.g. ᛏ200) to an A.F. year (e.g. 4150). "
            "Negative offsets count back from the end of that age: "
            "'ᛏ-50' means 50 years before the start of the next age; "
            "for the current/ongoing age, the end is present_year (so '⋈-50' = present_year-50)."
        ),
        input_schema={
            "type": "object",
            "properties": {"label": {"type": "string", "description": "Age label like 'ᛏ200'"}},
            "required": ["label"],
            "additionalProperties": False,
        },
    ),
    Tool(
        name="age_convert",
        description=(
            "Auto-detect conversion direction and convert year ⇄ age label. "
            "Absolute years (e.g. 4150) convert to age labels (e.g. ᛏ200). "
            "Age labels convert to absolute A.F. years. "
            "Negative values are special: '-50' resolves to an absolute year (present_year-50), "
            "and 'ᛏ-50' resolves to an absolute year from the end of the ᛏ age."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "value": {
                    "type": "string",
                    "description": "Year like '4150', relative year like '-50', or age label like 'ᛏ200'/'ᛏ-50'",
                }
            },
            "required": ["value"],
            "additionalProperties": False,
        },
    ),
)


def _run_ages_converter(*, args: list[str]) -> str:
    python = _python_bin()
    script = _ages_converter_path()
    proc = subprocess.run(
        [str(python), str(script), *args],
        cwd=str(REPO_ROOT),
        env={**os.environ, "PYTHONUTF8": "1"},
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or "").strip() or f"ages_converter exited with {proc.returncode}"
        raise RuntimeError(msg)
    return (proc.stdout or "").strip()


def _tool_call(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if name == "year_to_age":
        year = int(arguments["year"])
        out = _run_ages_converter(args=["--direction", "year_to_age", "--value", str(year)])
        return {"content": [{"type": "text", "text": out}]}
    if name == "age_to_year":
        label = str(arguments["label"])
        out = _run_ages_converter(args=["--direction", "age_to_year", "--value", label])
        return {"content": [{"type": "text", "text": out}]}
    if name == "age_convert":
        value = str(arguments["value"])
        out = _run_ages_converter(args=["--direction", "auto", "--value", value])
        return {"content": [{"type": "text", "text": out}]}
    raise ValueError(f"Unknown tool: {name}")


def main() -> int:
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
                        for t in TOOLS
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
                result = _tool_call(tool_name, arguments)
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
