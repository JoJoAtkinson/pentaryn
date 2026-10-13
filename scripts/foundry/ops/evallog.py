"""Read the MCP action logs and say what they show (mcp-fork-25).

`context/foundry/README.md` makes the eval log the promotion mechanism — a namespace
that keeps being reached through `eval-js` earns a typed tool — and the monthly review
used to be ad-hoc Python. This is that review, repeatable: `make foundry-eval-report`.

Three kinds of file under `foundry/logs/` (or `$PENTARYN_MCP_LOG_DIR` when the servers
are pointed elsewhere), picked by name (LOG_GLOBS); any other file there is not read:

    eval*.jsonl             one line per eval-js call: {ts, purpose, script, ok, phase,
                            ms, error?, client?}. `eval.jsonl` (to 2026-10) and the
                            monthly `eval-YYYY-MM.jsonl` after it; the glob reads both.
    mcp-YYYY-MM.jsonl       the fork's tool log: {ts, tool, args, ok, …}. eval-js calls
                            appear here too (as tool lines), so they are counted once
                            per kind, never mixed.
    dnd-scripts-YYYY-MM.jsonl  the dnd-scripts server's log: {ts, server, tool, mode, …}.

Within those files a line's kind is told by shape, not by file: a line with a `tool` key
is a tool line; any other object is an eval line. Read-only:
nothing here writes, and nothing touches a running server.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Iterable, Iterator

# `game.pentaryn.ties.attributes.of(a)` → ("ties", "attributes"); optional chaining too.
_PATH = re.compile(r"game\.pentaryn\??\.(\w+)(?:\??\.(\w+))?")
# Discovery: listing what game.pentaryn holds rather than calling into it.
_DISCOVERY = re.compile(
    r"Object\.(?:keys|entries)\(\s*game\.pentaryn\s*\)"
    r"|game\.pentaryn\??\.(?:describe|namespaces)\s*\(")
_PENTARYN_TOOLS = ("pentaryn-read", "pentaryn-write")
_MONTHLY = re.compile(r"-(\d{4}-\d{2})\.jsonl$")
TOP = 10
# The files the report reads, by name; `log_files` globs exactly these.
LOG_GLOBS = ("eval*.jsonl", "mcp-*.jsonl", "dnd-scripts-*.jsonl")


def _pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, max(0, round(q * (len(s) - 1))))]


def summarise(lines: Iterable[str], since: str | None = None) -> dict:
    """Pure: the report for an iterable of raw JSONL lines (any mix of the three kinds).

    `since` is an ISO date or timestamp; a line is kept when its `ts` sorts at or after
    it (a line with no `ts` is dropped once `since` is given). Blank lines are ignored;
    a line that is not a JSON object — a partial last line, a hand edit — is counted in
    `skipped`, never fatal.
    """
    totals: Counter = Counter()          # (str(ok), phase) for eval lines
    paths: Counter = Counter()           # (ns, fn|None)
    errors: Counter = Counter()          # runtime error text
    tools: Counter = Counter()           # (server, tool)
    tool_failures: Counter = Counter()   # (server, tool) with ok false
    pentaryn: Counter = Counter()        # (tool, ns, path) for the D14 tools
    eval_ms: list[float] = []
    tool_ms: list[float] = []
    discovery = skipped = filtered = evals = 0

    for raw in lines:
        raw = raw.strip()
        if not raw:
            continue
        try:
            line = json.loads(raw)
        except ValueError:
            skipped += 1
            continue
        if not isinstance(line, dict):
            skipped += 1
            continue
        if since is not None and not (isinstance(line.get("ts"), str) and line["ts"] >= since):
            filtered += 1
            continue

        ms = line.get("ms")
        if "tool" in line:
            key = (str(line.get("server") or "foundry"), str(line["tool"]))
            tools[key] += 1
            if line.get("ok") is False:
                tool_failures[key] += 1
            if isinstance(ms, (int, float)):
                tool_ms.append(ms)
            if key[1] in _PENTARYN_TOOLS:
                args = line.get("args") if isinstance(line.get("args"), dict) else {}
                ns = line.get("ns", args.get("ns"))
                path = line.get("path", args.get("path"))
                pentaryn[(key[1], str(ns), str(path))] += 1
            continue

        evals += 1
        ok, phase = line.get("ok"), line.get("phase")
        totals[(str(ok), str(phase) if phase is not None else "?")] += 1
        if isinstance(ms, (int, float)):
            eval_ms.append(ms)
        script = line.get("script") if isinstance(line.get("script"), str) else ""
        if _DISCOVERY.search(script):
            discovery += 1
        for ns, fn in sorted(set(_PATH.findall(script))):
            paths[(ns, fn or None)] += 1
        if phase == "runtime" and line.get("error"):
            errors[str(line["error"])] += 1

    return {
        "since": since,
        "evals": evals,
        "totals": totals,
        "paths": paths,
        "discovery": discovery,
        "errors": errors.most_common(TOP),
        "eval_ms": {"p50": _pct(eval_ms, 0.50), "p95": _pct(eval_ms, 0.95)},
        "tools": tools,
        "tool_failures": tool_failures,
        "tool_ms": {"p50": _pct(tool_ms, 0.50), "p95": _pct(tool_ms, 0.95)},
        "pentaryn": pentaryn,
        "skipped": skipped,
        "filtered": filtered,
    }


def log_files(log_dir: Path, since: str | None = None) -> list[Path]:
    """The files the report reads. A monthly file wholly before `since`'s month is left
    unread (its lines would all be filtered); `eval.jsonl` has no month and is always read."""
    files = sorted({f for pattern in LOG_GLOBS for f in log_dir.glob(pattern)})
    if since:
        month = since[:7]
        files = [f for f in files
                 if not (m := _MONTHLY.search(f.name)) or m.group(1) >= month]
    return files


def _lines(files: Iterable[Path]) -> Iterator[str]:
    for f in files:
        with open(f, encoding="utf-8", errors="replace") as fh:
            yield from fh            # streamed: the eval log runs to megabytes


def report(log_dir: Path, since: str | None = None) -> dict:
    files = log_files(log_dir, since)
    out = summarise(_lines(files), since)
    out["files"] = [f.name for f in files]
    out["log_dir"] = str(log_dir)
    return out


def to_json(r: dict) -> dict:
    """The report with tuple keys flattened, for `--json`."""
    def path(k):
        return k[0] if k[1] is None else f"{k[0]}.{k[1]}"
    return {
        **{k: r[k] for k in ("since", "evals", "discovery", "eval_ms", "tool_ms",
                             "skipped", "filtered") if k in r},
        "files": r.get("files", []),
        "log_dir": r.get("log_dir"),
        "totals": [{"ok": ok, "phase": ph, "count": n}
                   for (ok, ph), n in sorted(r["totals"].items(), key=lambda x: -x[1])],
        "paths": [{"path": path(k), "count": n} for k, n in r["paths"].most_common(TOP)],
        "errors": [{"error": e, "count": n} for e, n in r["errors"]],
        "tools": [{"server": s, "tool": t, "count": n,
                   "failed": r["tool_failures"].get((s, t), 0)}
                  for (s, t), n in r["tools"].most_common()],
        "pentaryn": [{"tool": t, "ns": ns, "path": p, "count": n}
                     for (t, ns, p), n in r["pentaryn"].most_common(TOP)],
    }


def render(r: dict) -> list[str]:
    """Prose lines for the terminal (the cli prints them through `_say`/print)."""
    j = to_json(r)
    since = f" since {r['since']}" if r.get("since") else ""
    out = [f"▸ eval-js: {r['evals']} call(s){since} — {len(j['files'])} file(s) in {j['log_dir']}"]
    if r["skipped"]:
        out.append(f"  {r['skipped']} malformed line(s) skipped")
    if j["totals"]:
        out.append("  outcome: " + " · ".join(
            f"{'ok' if t['ok'] == 'True' else 'failed'} {t['phase']} {t['count']}"
            for t in j["totals"]))
    if r["eval_ms"]["p50"] is not None:
        out.append(f"  latency: p50 {r['eval_ms']['p50']:g} ms · p95 {r['eval_ms']['p95']:g} ms")
    out.append(f"  discovery calls (listing game.pentaryn): {r['discovery']}")
    if j["paths"]:
        out.append("  top game.pentaryn paths (promotion candidates):")
        out += [f"    {p['count']:>5}  {p['path']}" for p in j["paths"]]
    if j["errors"]:
        out.append("  top runtime errors:")
        out += [f"    {e['count']:>5}  {e['error'][:100]}" for e in j["errors"]]
    if j["tools"]:
        out.append(f"▸ tool calls: {sum(t['count'] for t in j['tools'])}")
        out += [f"    {t['count']:>5}  {t['server']}:{t['tool']}"
                + (f"  ({t['failed']} failed)" if t["failed"] else "") for t in j["tools"]]
    if j["pentaryn"]:
        out.append("  pentaryn-read / -write by namespace path:")
        out += [f"    {p['count']:>5}  {p['tool']} {p['ns']}.{p['path']}" for p in j["pentaryn"]]
    return out
