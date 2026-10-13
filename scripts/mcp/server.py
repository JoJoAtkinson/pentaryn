#!/usr/bin/env python3

from __future__ import annotations

import ast
import importlib.util
import inspect
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Callable, Iterator, Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
PROTOCOL_VERSION = "2025-06-18"
SERVER_NAME = "dnd-scripts"
_E_SERVER = -32000      # JSON-RPC: implementation-defined server error
_E_NO_METHOD = -32601   # JSON-RPC: method not found
_TRANSPORT_MODE: Optional[str] = None  # "jsonl" | "lsp"

# Concurrent dispatch: tool calls go to a thread pool so a batch of cold
# (cache-miss) HTTP fetches doesn't run end-to-end serially. The stdin loop is
# still single-threaded — only `tools/call` is parallelized; initialize and
# tools/list stay inline because they're sub-millisecond. _STDOUT_LOCK
# serializes byte writes so concurrent JSON-RPC responses don't interleave.
# Pool size is tunable via DND_MCP_MAX_WORKERS (default 8 — Open5e tolerates
# this comfortably and SQLite's per-connection locking handles the rest).
_STDOUT_LOCK = threading.Lock()

# Sentinel returned by _read_message for a malformed-but-recoverable frame: the
# serve loop should skip it and keep reading, NOT treat it as EOF (which `None` means).
_SKIP_MESSAGE: dict[str, Any] = {}


def _safe_int_env(name: str, default: int) -> int:
    """Parse an env var as int, falling back to `default` on missing or invalid
    input. Avoids crashing the server at import time on a typo (e.g. 'eight')."""
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        # Stay on stderr so JSON-RPC stdout isn't polluted.
        print(f"warn: invalid {name}={raw!r}, using default {default}", file=sys.stderr)
        return default


_DEFAULT_MAX_WORKERS = max(1, _safe_int_env("DND_MCP_MAX_WORKERS", 8))
# Hard cap on in-flight tool calls to prevent a fast sender from queueing
# unbounded work. `tools/call` requests beyond this limit get an immediate
# JSON-RPC error rather than silently piling up. Default = max(4× workers, 32), leaving
# headroom for short bursts without letting them grow without bound.
_INFLIGHT_LIMIT = max(_DEFAULT_MAX_WORKERS * 4, 32)
_inflight_slots = threading.Semaphore(_INFLIGHT_LIMIT)
# Per-call wall-clock cap on subprocess tools — a hung child would otherwise pin
# its worker forever. Bypass with DND_MCP_TOOL_TIMEOUT=<seconds>; raise it for
# slow generators (e.g. PDF export) or set <=0 to disable (NOT recommended).
_TOOL_TIMEOUT_SEC = _safe_int_env("DND_MCP_TOOL_TIMEOUT", 60)
# notifications/cancelled (py-mcp-ac-5): every dispatched tools/call with an id is kept
# here (id -> (future, runner, arguments)) until its worker finishes. A cancel of a call
# still queued cancels its future so it never runs; a cancel of a running call adds its
# id to _cancelled_ids and the worker drops its reply. Both are guarded by _calls_lock.
_calls_lock = threading.Lock()
_pending_calls: dict[Any, tuple[Future, "ToolRunner", dict[str, Any]]] = {}
_cancelled_ids: set[Any] = set()


def _python_bin() -> Path:
    candidate = REPO_ROOT / ".venv" / "bin" / "python"
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


def _object_or_skip(value: Any) -> dict[str, Any]:
    """A JSON-RPC message must be an object. A batch `[...]`, a scalar or an LSP
    `null` body is logged and skipped (never EOF, never a crash at `msg.get`)."""
    if isinstance(value, dict):
        return value
    sys.stderr.write("[mcp-server] discarding non-object JSON-RPC message\n")
    sys.stderr.flush()
    return _SKIP_MESSAGE


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
        try:
            return _object_or_skip(json.loads(stripped.decode("utf-8")))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            # Reject one garbage JSONL line rather than crashing the serve loop.
            sys.stderr.write(f"[mcp-server] discarding malformed JSONL message: {exc}\n")
            sys.stderr.flush()
            return _SKIP_MESSAGE

    if _TRANSPORT_MODE == "jsonl":
        # Sniffing is for the first frame only: a stray non-JSON line in JSONL mode must not
        # fall into the LSP header parser, which would swallow every later request.
        sys.stderr.write("[mcp-server] discarding non-JSON line in JSONL mode\n")
        sys.stderr.flush()
        return _SKIP_MESSAGE

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
        sys.stderr.write("[mcp-server] LSP frame missing Content-Length — closing.\n")
        sys.stderr.flush()
        return None
    try:
        length = int(length_raw)
    except ValueError:
        sys.stderr.write(f"[mcp-server] LSP frame has non-integer Content-Length {length_raw!r} — closing.\n")
        sys.stderr.flush()
        return None
    if length < 0:
        sys.stderr.write("[mcp-server] LSP frame has negative Content-Length — closing.\n")
        sys.stderr.flush()
        return None
    if length == 0:
        # An empty body is a bad frame, not EOF: skip it and keep serving.
        sys.stderr.write("[mcp-server] discarding empty LSP frame\n")
        sys.stderr.flush()
        return _SKIP_MESSAGE
    body = _read_exact(sys.stdin.buffer, length)
    if not body:
        return None
    try:
        return _object_or_skip(json.loads(body.decode("utf-8")))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        # Reject one garbage LSP body rather than crashing the serve loop.
        sys.stderr.write(f"[mcp-server] discarding malformed LSP message body: {exc}\n")
        sys.stderr.flush()
        return _SKIP_MESSAGE


def _write_message(payload: dict[str, Any]) -> None:
    """Serialize a JSON-RPC envelope to stdout. Holds _STDOUT_LOCK so concurrent
    worker threads can't interleave bytes mid-message. A lone surrogate (e.g. in a
    handler's error message) can't be UTF-8 encoded, so that frame is re-dumped with
    ensure_ascii=True, which escapes it as \\udcXX instead of dropping the reply."""
    try:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    except UnicodeEncodeError:
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    with _STDOUT_LOCK:
        if _TRANSPORT_MODE == "jsonl":
            sys.stdout.buffer.write(body + b"\n")
            sys.stdout.buffer.flush()
            return
        sys.stdout.buffer.write(f"Content-Length: {len(body)}\r\n\r\n".encode("ascii"))
        sys.stdout.buffer.write(body)
        sys.stdout.buffer.flush()


def _reply(msg_id: Any, result: Any) -> None:
    """Write a JSON-RPC success envelope ({jsonrpc, id, result})."""
    _write_message({"jsonrpc": "2.0", "id": msg_id, "result": result})


def _error(msg_id: Any, code: int, message: str) -> None:
    """Write a JSON-RPC error envelope ({jsonrpc, id, error: {code, message}})."""
    _write_message({"jsonrpc": "2.0", "id": msg_id,
                    "error": {"code": code, "message": message}})


# ── per-call action log (python-tooling-29) ──────────────────────────────────
# Same switch as the fork's action log: PENTARYN_MCP_LOG_DIR. Unset → nothing is written.
# One line per tools/call in <dir>/dnd-scripts-<YYYY-MM>.jsonl (the month is taken per
# call, so a long-lived server rolls over by itself). There is no `client` field: this
# server is stdio, one process per Claude session, and never learns who called it.
_LOG_ENV = "PENTARYN_MCP_LOG_DIR"
_LOG_ARG_MAX = 2048          # characters per argument value, after JSON encoding
_log_lock = threading.Lock()


def _log_args(arguments: Any) -> Any:
    if not isinstance(arguments, dict):     # a rejected call's non-object arguments
        return _log_args({"_": arguments})["_"]
    out: dict[str, Any] = {}
    for key, value in arguments.items():
        try:
            text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError):
            text = repr(value)
        if len(text) > _LOG_ARG_MAX:
            out[key] = text[:_LOG_ARG_MAX] + f"…[truncated {len(text) - _LOG_ARG_MAX} chars]"
        else:
            out[key] = value
    return out


def _log_call(runner: "ToolRunner | str", arguments: Any, *, ok: bool, ms: int,
              error: str | None) -> None:
    """Append one action-log line. Never raises: logging must not fail a call.
    `runner` is a tool name string for a call the serve loop rejected before
    dispatch (unknown tool, non-object arguments, busy): mode 'rejected' (py-mcp-ac-4)."""
    log_dir = os.environ.get(_LOG_ENV, "").strip()
    if not log_dir:
        return
    try:
        now = datetime.now(timezone.utc)
        line = {
            "ts": now.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "server": SERVER_NAME,
            "tool": runner if isinstance(runner, str) else runner.tool.name,
            "mode": ("rejected" if isinstance(runner, str)
                     else "inprocess" if runner.handler is not None else "subprocess"),
            "args": _log_args(arguments),
            "ok": ok,
            "ms": ms,
            "error": error,
        }
        text = json.dumps(line, ensure_ascii=False, default=str) + "\n"
        path = Path(log_dir) / f"{SERVER_NAME}-{now:%Y-%m}.jsonl"
        with _log_lock, open(path, "a", encoding="utf-8", errors="backslashreplace") as fh:
            fh.write(text)
    except Exception as exc:
        try:
            sys.stderr.write(f"[mcp-server] action log not written: {exc!r}\n")
        except Exception:
            pass


def _run_call_worker(msg_id: Any, runner: "ToolRunner", arguments: dict[str, Any]) -> None:
    """Execute one tools/call in a worker thread. Catches every exception so a
    failing handler can never crash the server — converts to a JSON-RPC error.
    Notifications (msg_id is None) are silently completed with no response.
    Always releases the inflight semaphore in `finally` so admission control
    can't leak slots even if the handler explodes. Each call is logged
    (`_log_call`) after its response is written."""
    started = time.perf_counter()
    ok, error = False, None
    try:
        out = runner.run(arguments=arguments)
        ok = True
        if msg_id is not None and not _was_cancelled(msg_id):
            _reply(msg_id, {"content": [{"type": "text", "text": out}]})
    except Exception as exc:
        if not ok:              # the tool failed (not the response write after it)
            error = str(exc)
        # Surface the full traceback to stderr (the MCP client sees only the
        # short error message via JSON-RPC, but mid-fight debugging benefits
        # from the real stack — Claude Code's MCP logs capture stderr).
        import traceback as _tb
        sys.stderr.write(
            f"\n[mcp-server] tool {runner.tool.name!r} crashed:\n"
            f"{_tb.format_exc()}\n"
        )
        sys.stderr.flush()
        if msg_id is not None and not _was_cancelled(msg_id):
            _error(msg_id, _E_SERVER, str(exc))
    finally:
        try:
            _log_call(runner, arguments, ok=ok,
                      ms=round((time.perf_counter() - started) * 1000), error=error)
        finally:
            _inflight_slots.release()


def _was_cancelled(msg_id: Any) -> bool:
    """True when the client sent notifications/cancelled for this running call."""
    try:
        with _calls_lock:
            return msg_id in _cancelled_ids
    except TypeError:           # an unhashable id was never tracked
        return False


def _track_call(msg_id: Any, future: Future, runner: "ToolRunner",
                arguments: dict[str, Any]) -> None:
    """Remember a dispatched call until its future finishes (py-mcp-ac-5). The
    done-callback runs at once if the call already finished, so no entry is left behind.
    An unhashable (malformed) id is not tracked, so it cannot be cancelled."""
    try:
        hash(msg_id)
    except TypeError:
        return
    with _calls_lock:
        _pending_calls[msg_id] = (future, runner, arguments)

    def _forget(done: Future) -> None:
        with _calls_lock:
            if _pending_calls.get(msg_id, (None,))[0] is done:
                del _pending_calls[msg_id]
                _cancelled_ids.discard(msg_id)

    future.add_done_callback(_forget)


def _cancel_call(request_id: Any) -> None:
    """Handle notifications/cancelled (py-mcp-ac-5). A call still queued never runs:
    its slot is released and it logs one 'rejected' line. A running call finishes
    but sends no reply. An unknown or finished id is ignored, as the spec allows."""
    try:
        with _calls_lock:
            entry = _pending_calls.get(request_id)
            if entry is None:
                return
            _cancelled_ids.add(request_id)
    except TypeError:           # an unhashable requestId names no call
        return
    future, runner, arguments = entry
    if future.cancel():
        _inflight_slots.release()
        _log_call(runner.tool.name, arguments, ok=False, ms=0,
                  error="Cancelled by the client before it ran")


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_schema: dict[str, Any]
    annotations: Optional[dict[str, Any]] = None

@dataclass(frozen=True)
class ToolRunner:
    tool: Tool
    script_path: Path
    argv_template: tuple[str, ...]
    bool_flags: dict[str, str]
    value_flags: dict[str, str]
    handler: Optional[Callable[..., Any]] = None

    def run(self, *, arguments: dict[str, Any]) -> str:
        # In-process dispatch when the script exposes MCP_HANDLERS — skips subprocess startup
        # and lets the script's module-level state (e.g. cached HTTP sessions) persist across calls.
        if self.handler is not None:
            # Only a signature mismatch is "Invalid arguments"; a TypeError raised inside
            # the handler body propagates with its own message (py-mcp-rob-6).
            try:
                inspect.signature(self.handler).bind(**arguments)
            except TypeError as exc:
                raise ValueError(f"Invalid arguments for {self.tool.name}: {exc}") from exc
            result = self.handler(**arguments)
            if isinstance(result, str):
                return result
            return json.dumps(result, indent=2, ensure_ascii=False)
        return self._run_subprocess(self._build_argv(arguments))

    def _build_argv(self, arguments: dict[str, Any]) -> list[str]:
        # Only braces in the template token are interpreted; argument values are substituted
        # verbatim. A template token with a stray non-placeholder brace raises at format time
        # (only KeyError is mapped to Missing required argument).
        argv: list[str] = []
        fmt_args: dict[str, str] = {}
        for key, value in arguments.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                fmt_args[key] = "" if value is None else str(value)
            else:
                fmt_args[key] = json.dumps(value, ensure_ascii=False)
        try:
            for token in self.argv_template:
                # A bare placeholder ('{name}') always emits exactly one argv entry,
                # even when the value is empty — otherwise an empty value would drop
                # the token and orphan a preceding flag, misaligning the rest of argv.
                is_placeholder = (
                    token.startswith("{")
                    and token.endswith("}")
                    and token.count("{") == 1
                )
                rendered = token.format(**fmt_args)
                if is_placeholder or rendered.strip():
                    argv.append(rendered.strip())
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
            # Same rendering as placeholders: list/dict as JSON, not a Python repr (py-mcp-rob-7).
            if isinstance(value, (str, int, float)):
                rendered = str(value).strip()
            else:
                rendered = json.dumps(value, ensure_ascii=False)
            if not rendered:
                continue
            argv.extend([self.value_flags[key], rendered])
        return argv

    def _run_subprocess(self, argv: list[str]) -> str:
        python = _python_bin()
        # Wall-clock timeout protects against a hung child pinning a worker
        # forever; subprocess.run raises subprocess.TimeoutExpired on overrun
        # and DOES kill the child (the wait happens in the subprocess module).
        # _TOOL_TIMEOUT_SEC <= 0 means "no timeout" — opt-in only via env.
        timeout = _TOOL_TIMEOUT_SEC if _TOOL_TIMEOUT_SEC > 0 else None
        try:
            proc = subprocess.run(
                [str(python), str(self.script_path), *argv],
                cwd=str(REPO_ROOT),
                env={**os.environ, "PYTHONUTF8": "1"},
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raw = exc.stderr
            if isinstance(raw, (bytes, bytearray, memoryview)):
                stderr = bytes(raw).decode("utf-8", errors="replace")
            else:
                stderr = str(raw) if raw else ""
            raise RuntimeError(
                f"{self.script_path.name} exceeded {timeout}s timeout (set DND_MCP_TOOL_TIMEOUT to adjust). "
                f"stderr: {stderr.strip()[:300]}"
            ) from exc
        if proc.returncode != 0:
            msg = (proc.stderr or proc.stdout or "").strip() or f"{self.script_path.name} exited with {proc.returncode}"
            raise RuntimeError(msg)
        out = (proc.stdout or "").strip()
        warn = (proc.stderr or "").strip()
        if warn:
            # Success-path stderr is real diagnostic signal (e.g. a malformed DB
            # line was skipped). Surface it so the caller isn't handed a silently
            # short result. Kept after stdout so machine parsers can split on it.
            if out:
                return f"{out}\n\n[warnings from {self.script_path.name}]\n{warn}"
            return f"[warnings from {self.script_path.name}]\n{warn}"
        return out


@dataclass(frozen=True)
class DiscoveryResult:
    tools: tuple[ToolRunner, ...]
    skipped: tuple[tuple[Path, str], ...]


def _load_script_module(path: Path) -> Any:
    """Import a script as a module so we can read MCP_HANDLERS off it."""
    spec_name = f"_mcp_script_{path.stem}"
    spec = importlib.util.spec_from_file_location(spec_name, path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec_name] = module
    # py-mcp-rob-8: a failed import leaves no half-initialised module behind, and a
    # SystemExit (a script's sys.exit() guard) becomes a plain Exception so discovery
    # records one skip instead of ending.
    try:
        spec.loader.exec_module(module)
    except (Exception, SystemExit) as exc:
        sys.modules.pop(spec_name, None)
        if isinstance(exc, SystemExit):
            raise Exception(f"SystemExit: {exc}") from exc
        raise
    return module


def _has_top_level_assignment(source: str, name: str, *, tree: ast.Module | None = None) -> bool:
    """True if `name` is assigned at module top-level. Avoids false positives
    from comments, docstrings, or string literals that merely mention the name.
    `tree` is the already-parsed source, when the caller has one."""
    if name not in source:
        return False
    try:
        module = tree if tree is not None else ast.parse(source)
    except SyntaxError:
        return False
    for node in module.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    return True
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.target.id == name:
                return True
    return False


def _top_level_assignments(module: ast.Module) -> Iterator[tuple[str, ast.expr]]:
    """(name, value) for each top-level `name = value` or `name: T = value`,
    in source order. A bare annotation (`name: T`) has no value and is not yielded."""
    for node in module.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    yield target.id, node.value
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.value is not None:
                yield node.target.id, node.value


def _read_top_level_string_list(source: str, name: str, *, tree: ast.Module | None = None) -> list[str]:
    """If `name` is assigned at module top-level to a literal list of strings,
    return that list. Otherwise return []. Used by the group filter to peek at
    MCP_GROUPS without importing the module (which would defeat the speedup)."""
    if name not in source:
        return []
    try:
        module = tree if tree is not None else ast.parse(source)
    except SyntaxError:
        return []
    for target_id, node_value in _top_level_assignments(module):
        if target_id == name:
            try:
                value = ast.literal_eval(node_value)
            except (ValueError, SyntaxError):
                return []
            if isinstance(value, list) and all(isinstance(v, str) for v in value):
                return value
    return []


def _extract_mcp_tool_literal(source: str, *, path: Path,
                              tree: ast.Module | None = None) -> dict[str, Any] | None:
    if "MCP_TOOL" not in source:
        return None
    try:
        module = tree if tree is not None else ast.parse(source, filename=str(path))
    except SyntaxError as exc:
        raise ValueError(f"syntax error: {exc.msg} (line {exc.lineno})") from exc

    # Exactly MCP_TOOL / MCP_TOOLS, as on the in-process path and in the README: a
    # helper such as MCP_TOOL_NAMES or MCP_TOOL_SCHEMA is ignored (py-mcp-ext-3).
    mcp_tool_vars: dict[str, ast.AST] = {}
    for target_id, node_value in _top_level_assignments(module):
        if target_id in ("MCP_TOOL", "MCP_TOOLS"):
            mcp_tool_vars[target_id] = node_value
    
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
    
    # Otherwise it is the MCP_TOOL (singular) variable
    try:
        value = ast.literal_eval(mcp_tool_vars["MCP_TOOL"])
    except Exception as exc:
        raise ValueError("MCP_TOOL must be a literal dict (no function calls or dynamic expressions)") from exc
    if not isinstance(value, dict):
        raise ValueError("MCP_TOOL must be a dict")
    return value


def _normalize_input_schema(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {"type": "object", "properties": {}, "additionalProperties": False}
    if not isinstance(raw, dict):
        raise ValueError("input_schema must be a dict")
    return raw


def _flag_map(entry: dict[str, Any], snake: str, camel: str, *, tool: str) -> dict[str, str]:
    """An entry's argument_name -> flag map (snake_case key first, then camelCase);
    keys and flags are stripped and blank ones dropped."""
    raw = entry.get(snake) or entry.get(camel) or {}
    if not isinstance(raw, dict):
        raise ValueError(f"{tool}: {snake} must be a dict of argument_name -> flag")
    flags: dict[str, str] = {}
    for k, v in raw.items():
        key = str(k).strip()
        flag = str(v).strip()
        if not key or not flag:
            continue
        flags[key] = flag
    return flags


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
        annotations_raw = entry.get("annotations")
        annotations = annotations_raw if isinstance(annotations_raw, dict) and annotations_raw else None

        argv_raw = entry.get("argv") or []
        if not isinstance(argv_raw, list) or not all(isinstance(a, str) for a in argv_raw):
            raise ValueError(f"{name}: argv must be a list of strings")

        bool_flags = _flag_map(entry, "bool_flags", "boolFlags", tool=name)
        value_flags = _flag_map(entry, "value_flags", "valueFlags", tool=name)

        runners.append(
            ToolRunner(
                tool=Tool(name=name, description=description, input_schema=input_schema, annotations=annotations),
                script_path=path,
                argv_template=tuple(argv_raw),
                bool_flags=bool_flags,
                value_flags=value_flags,
            )
        )
    return runners


# The skip reason for a script that simply declares no tool (a helper, a test). Counted
# at startup, never listed: it was ~100 lines of noise around the one line that mattered.
_NO_TOOL = "no MCP_TOOL"

# The skip-reason prefix for a script the DND_MCP_TOOLS_GROUP filter left out (py-mcp-rob-3).
# A deliberate exclusion, not a failure: startup gives it one count line; --list-tools
# still shows each script with its groups.
_GROUP_EXCLUDED = "group filter excludes"


def _candidate_scripts(scripts_dir: Path) -> list[Path]:
    """Every .py under scripts/ that could declare a tool, in discovery order (sorted by
    path relative to scripts/). Skips __pycache__, private names (which covers
    __init__.py) and the server's own mcp/ directory."""
    server_dir = (scripts_dir / "mcp").resolve()
    found = [
        p for p in scripts_dir.rglob("*.py")
        if p.is_file()
        and "__pycache__" not in p.parts
        and not p.name.startswith("_")
        and server_dir not in p.resolve().parents
    ]
    return sorted(found, key=lambda p: str(p.relative_to(scripts_dir)))


def _load_in_process(
    path: Path, source: str, tree: ast.Module | None,
) -> tuple[dict[str, Any], dict[str, Any]] | str | None:
    """The in-process discovery path. None when the script has no top-level MCP_HANDLERS
    assignment (it takes the AST literal path instead); otherwise it is imported and
    MCP_TOOLS/MCP_TOOL is read from its namespace (so it can use shared dicts, helper
    calls, etc.), giving (mcp_tool, handlers) — or a skip reason string on failure
    (including an MCP_HANDLERS that is not a dict).
    AST-based check (not substring) so a comment or string mentioning MCP_HANDLERS
    doesn't trigger a module import."""
    if tree is None or not _has_top_level_assignment(source, "MCP_HANDLERS", tree=tree):
        return None
    try:
        module = _load_script_module(path)
    except Exception as exc:
        return f"in-process import failed: {exc}"
    if module is None:
        return "in-process import returned None"
    tools_attr = getattr(module, "MCP_TOOLS", None)
    tool_attr = getattr(module, "MCP_TOOL", None)
    if isinstance(tools_attr, list):
        literal: dict[str, Any] = {"tools": tools_attr}
    elif isinstance(tools_attr, dict):
        literal = tools_attr
    elif isinstance(tool_attr, dict):
        literal = tool_attr
    else:
        return "module imported but no usable MCP_TOOLS/MCP_TOOL attribute"
    handlers_attr = getattr(module, "MCP_HANDLERS", None)
    if not isinstance(handlers_attr, dict):
        # py-mcp-EC-5: a non-dict MCP_HANDLERS used to yield handlers=None, so the
        # module's tools registered half-wired on the subprocess path. Skip it whole.
        return "MCP_HANDLERS is not a dict"
    return literal, handlers_attr


def discover_tools(*, repo_root: Path) -> DiscoveryResult:
    # TODO: cache discovery output keyed on (path, mtime) to skip AST re-parse
    # for unchanged files on server restart.
    # TODO: add streaming progress notifications for slow subprocess-dispatched tools
    # (build_timeline_*) via MCP `notifications/progress`.
    scripts_dir = (repo_root / "scripts").resolve()
    skipped: list[tuple[Path, str]] = []
    runners: list[ToolRunner] = []
    if not scripts_dir.exists():
        return DiscoveryResult(tools=tuple(), skipped=tuple())

    # Optional group filter: when DND_MCP_TOOLS_GROUP is set, only load modules
    # whose top-level MCP_GROUPS list contains that group name. Massively cuts
    # cold-start latency by skipping unrelated heavy imports (pandas, PIL, etc.)
    # when only a focused tool surface is needed (e.g. combat-runner).
    # Modules without a MCP_GROUPS declaration are skipped when a filter is active.
    # "all" is the same as unset (py-mcp-ext-6): it used to drop every ungrouped module.
    group_filter = os.environ.get("DND_MCP_TOOLS_GROUP", "").strip()
    if group_filter == "all":
        group_filter = ""

    for path in _candidate_scripts(scripts_dir):
        try:
            source = path.read_text(encoding="utf-8")
        except Exception as exc:
            skipped.append((path, f"unreadable: {exc}"))
            continue

        # python-tooling-27: a script that never says "MCP_" declares no tool, so it is
        # not parsed at all (most of scripts/ is helpers and tests); one that does is
        # parsed once, and that tree serves every check below.
        tree: ast.Module | None = None
        if "MCP_" in source:
            try:
                tree = ast.parse(source, filename=str(path))
            except SyntaxError:
                tree = None   # _extract_mcp_tool_literal reports it, as before

        if group_filter:
            module_groups = _read_top_level_string_list(source, "MCP_GROUPS", tree=tree)
            if group_filter not in module_groups:
                skipped.append((path, f"{_GROUP_EXCLUDED} (DND_MCP_TOOLS_GROUP={group_filter!r}, module groups={module_groups})"))
                continue

        # Two discovery paths: a script with a top-level MCP_HANDLERS assignment is
        # imported (_load_in_process); any other uses the safer AST literal_eval
        # path (no execution at discovery time).
        handlers: Optional[dict[str, Any]] = None
        loaded = _load_in_process(path, source, tree)
        if isinstance(loaded, str):
            skipped.append((path, loaded))
            continue
        if loaded is not None:
            literal, handlers = loaded
        else:
            try:
                literal = _extract_mcp_tool_literal(source, path=path, tree=tree)
            except Exception as exc:
                skipped.append((path, str(exc)))
                continue
            if literal is None:
                skipped.append((path, _NO_TOOL))
                continue

        try:
            new_runners = _tools_from_mcp_tool(path=path, mcp_tool=literal)
        except Exception as exc:
            skipped.append((path, f"invalid MCP_TOOL: {exc}"))
            continue

        if handlers is not None:
            # The module declared MCP_HANDLERS, so each tool is meant to be
            # dispatched in-process. A tool with no matching handler entry would
            # otherwise register with handler=None and silently fall through to
            # the subprocess path against a script that has no CLI for it —
            # route it to `skipped` instead of registering it half-wired.
            rewired: list[ToolRunner] = []
            for r in new_runners:
                h = handlers.get(r.tool.name)
                if h is None:
                    skipped.append((path, f"tool {r.tool.name!r} has no MCP_HANDLERS entry"))
                    continue
                rewired.append(replace(r, handler=h))
            new_runners = rewired

        runners.extend(new_runners)

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
        mode = "in-process" if r.handler is not None else "subprocess"
        sys.stdout.write(f"- {r.tool.name} [{mode}] ({r.script_path.relative_to(REPO_ROOT)}): {desc}\n")
    sys.stdout.write("\nSkipped scripts:\n")
    if not skipped:
        sys.stdout.write("- (none)\n")
    for path, reason in skipped:
        sys.stdout.write(f"- {path.relative_to(REPO_ROOT)}: {reason}\n")
    return 0


def _report_skipped(discovery: DiscoveryResult) -> None:
    """Startup stderr (python-tooling-27). A running client only sees discovery.tools via
    tools/list; a real skip (import failure, invalid MCP_TOOL, duplicate name, missing
    handler, …) is otherwise invisible, so each one is listed and lands in the MCP host's
    server log. Scripts that declare no tool, and scripts the group filter excluded
    (py-mcp-rob-3), are one count line each."""
    excluded = sum(why.startswith(_GROUP_EXCLUDED) for _, why in discovery.skipped)
    failures = [(p, why) for p, why in discovery.skipped
                if why != _NO_TOOL and not why.startswith(_GROUP_EXCLUDED)]
    benign = len(discovery.skipped) - len(failures) - excluded
    if failures:
        sys.stderr.write(f"[mcp-server] {len(failures)} script(s) skipped at discovery:\n")
        for path, reason in failures:
            sys.stderr.write(f"  - {path.name}: {reason}\n")
    if excluded:
        group = os.environ.get("DND_MCP_TOOLS_GROUP", "").strip()
        sys.stderr.write(f"[mcp-server] {excluded} script(s) excluded by DND_MCP_TOOLS_GROUP={group}\n")
    if benign:
        sys.stderr.write(f"[mcp-server] {benign} script(s) without an MCP_TOOL (helpers, tests)\n")
    sys.stderr.flush()


def main() -> int:
    if "--list-tools" in sys.argv[1:]:
        return _print_list_tools(discover_tools(repo_root=REPO_ROOT))

    discovery = discover_tools(repo_root=REPO_ROOT)
    _report_skipped(discovery)
    runners = discovery.tools
    tools = tuple(r.tool for r in runners)
    runner_by_name = {r.tool.name: r for r in runners}

    # Worker pool for tools/call dispatch. Cold (cache-miss) HTTP fetches now
    # overlap; a batch of 6 fresh queries that took ~3s serially can finish in
    # ~500ms in parallel. Cached calls don't notice the difference.
    executor = ThreadPoolExecutor(
        max_workers=_DEFAULT_MAX_WORKERS,
        thread_name_prefix="dnd-mcp",
    )

    try:
        return _serve_loop(tools, runner_by_name, executor)
    finally:
        # On stdin EOF, finish running tool calls before exiting so we don't
        # truncate a response mid-write. Waits for running calls only; queued ones are
        # dropped, since no client is left to read their replies (py-mcp-perf-1). Each
        # subprocess call is capped by DND_MCP_TOOL_TIMEOUT
        # (default 60s), and in-process handlers are bounded only by their own locks
        # (each flock gives up after the same DND_MCP_TOOL_TIMEOUT; a thread cannot be killed).
        executor.shutdown(wait=True, cancel_futures=True)


def _serve_loop(
    tools: tuple["Tool", ...],
    runner_by_name: dict[str, "ToolRunner"],
    executor: ThreadPoolExecutor,
) -> int:
    while True:
        msg = _read_message()
        if msg is None:
            return 0
        if msg is _SKIP_MESSAGE:
            # A malformed frame was logged and discarded — keep serving.
            continue

        method = msg.get("method")
        msg_id = msg.get("id")
        params = msg.get("params") or {}

        try:
            if method == "initialize":
                # One supported version: per the MCP spec, answer our own version for
                # any other request rather than echoing it (py-mcp-EC-7).
                result = {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": SERVER_NAME, "version": "0.1.0"},
                }
                if msg_id is not None:
                    _reply(msg_id, result)
                continue

            if method == "tools/list":
                tool_payload = []
                for t in tools:
                    entry: dict[str, Any] = {
                        "name": t.name,
                        "description": t.description,
                        "inputSchema": t.input_schema,
                    }
                    if t.annotations:
                        entry["annotations"] = t.annotations
                    tool_payload.append(entry)
                result = {"tools": tool_payload}
                if msg_id is not None:
                    _reply(msg_id, result)
                continue

            if method == "tools/call":
                # Validate sync (so shape/lookup errors return in-order via the
                # outer except), then dispatch the actual handler to a worker so
                # concurrent calls overlap their HTTP latency.
                # Each rejection is logged (mode 'rejected') before its error reply,
                # so every tools/call writes one action-log line (py-mcp-ac-4).
                tool_name = str(params.get("name") or "")
                arguments = params.get("arguments") or {}
                rejected = None
                if not isinstance(arguments, dict):
                    rejected = "tools/call params.arguments must be an object"
                elif tool_name not in runner_by_name:
                    rejected = f"Unknown tool: {tool_name}"
                if rejected is not None:
                    _log_call(tool_name, arguments, ok=False, ms=0, error=rejected)
                    raise ValueError(rejected)
                runner = runner_by_name[tool_name]
                # Admission control: refuse new work past the in-flight cap so a
                # fast sender can't pile up unbounded queue depth (memory + tail
                # latency). Slot is released by the worker in its finally clause.
                if not _inflight_slots.acquire(blocking=False):
                    busy = (f"Server busy: {_INFLIGHT_LIMIT} in-flight tool calls. "
                            "Retry after some complete.")
                    _log_call(tool_name, arguments, ok=False, ms=0, error=busy)
                    if msg_id is not None:
                        _error(msg_id, _E_SERVER, busy)
                    continue
                future = executor.submit(_run_call_worker, msg_id, runner, arguments)
                if msg_id is not None:
                    _track_call(msg_id, future, runner, arguments)
                continue

            if method == "notifications/cancelled":
                _cancel_call(params.get("requestId"))
                continue

            # Ignore notifications like "initialized".
            if msg_id is None:
                continue

            _error(msg_id, _E_NO_METHOD, f"Method not found: {method}")
        except Exception as exc:
            if msg_id is None:
                continue
            _error(msg_id, _E_SERVER, str(exc))


if __name__ == "__main__":
    raise SystemExit(main())
