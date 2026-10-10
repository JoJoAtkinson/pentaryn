#!/usr/bin/env python3
"""One way to call ``claude -p`` from the updater, with the fences built in.

Every LLM step in the run — the adjudicator, the escalation tiers, the report writer —
goes through :func:`call`, so the sandbox flags are written once and cannot drift
between callers. What it guarantees:

**Tool-less by construction for untrusted input.** A call that carries third-party text
(release notes, or anything derived from them that has not been through a validator)
passes ``untrusted_input=True``, and :func:`build_command` then *refuses* to build a
command that grants any tool. ``--tools ""`` plus a deny list, ``--strict-mcp-config``
with an empty server map, ``--permission-prompts none``. A prompt-injected release note
gets to influence the JSON it is asked for, and nothing else.

**Isolated from this machine's Claude config.** The subprocess runs in a fresh scratch
directory (so no ``CLAUDE.md`` is discovered), with ``--restricted`` (user, project and
local settings files — and so their hooks — are ignored) and
``--no-session-persistence``. ``--bare`` would be stricter still, but it reads auth
**only** from ``ANTHROPIC_API_KEY``: probed 2026-10-10, a ``--bare`` call on this Mac
returns ``Not logged in``, so it would fail every Saturday closed. It is a policy option
(``llm.isolation: bare``) for when the job gets an API key of its own.

**Bounded.** ``--max-budget-usd`` per call, a wall-clock timeout enforced here (the
process is killed, not asked), and ``--effort`` always explicit — Opus 5.5 defaults to
``medium``, and inheriting a default is how a tier quietly runs at the wrong effort.

The budget is enforced **after** the turn, not during it (probed 2026-10-10 on CLI
2.1.296: a single-turn call over its cap comes back ``error_max_budget_usd`` with
``result: null`` — the tokens are billed and the answer is thrown away). So a cap is a
runaway guard set well above the expected cost, never a target: a cap near the expected
cost buys nothing but paid-for, discarded answers. And a call whose cost was never
reported (killed on timeout, no envelope) is *charged* its cap by :func:`charged`, so
budget accounting cannot be walked past by calls that time out.

**Heartbeating.** While a call runs, the run's status file is rewritten every
``HEARTBEAT_SECONDS`` so the 06:12 watchdog's "20 minutes without a phase change means
dead" rule still tells a slow Opus analysis from a dead run.

**Measured.** ``--output-format json`` returns ``total_cost_usd`` and ``modelUsage``;
each call's cost, resolved model id, effort and seconds land in a :class:`CallRecord`
that the run record keeps.

It never raises for an LLM-side failure: timeouts, a missing CLI, a non-zero exit, an
``is_error`` envelope, unparseable output — all come back as ``ok=False`` with a reason,
and the caller fails closed.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable

CLAUDE_BIN = "claude"
HEARTBEAT_SECONDS = 60

# Built-in tools no tool-less call may use. --tools "" already removes them; this list is
# the belt to that brace, and it is the same list the adjudicator has always carried.
DENIED_TOOLS = (
    "Bash,Read,Write,Edit,MultiEdit,NotebookEdit,Glob,Grep,WebFetch,WebSearch,"
    "Task,Agent,TodoWrite,Artifact,SendUserFile,Skill"
)
EMPTY_MCP = '{"mcpServers":{}}'

EFFORTS = ("low", "medium", "high", "xhigh", "max")
ISOLATIONS = ("restricted", "bare", "none")


class UnsafeCall(ValueError):
    """A call was asked to give tools to a model that reads untrusted text."""


@dataclass(frozen=True)
class Spec:
    """How one tier calls the model. Built from the policy; see ``escalate.tier_spec``."""

    model: str
    effort: str = "medium"
    timeout_s: int = 600
    budget_usd: float | None = None
    fallback: str | None = None
    isolation: str = "restricted"
    # Tool grants. Empty for every tier built in v1; the fixer (v2) is the only tier
    # that will ever set these, and it never sees raw notes.
    tools: tuple[str, ...] = ()
    allowed_tools: tuple[str, ...] = ()


@dataclass
class CallRecord:
    tier: str
    model: str                 # the alias asked for
    effort: str
    ok: bool = False
    resolved_model: str | None = None   # from modelUsage, e.g. claude-opus-5-5
    cost_usd: float = 0.0
    seconds: float = 0.0
    error: str | None = None
    detail: str = ""           # package or other label, for the report
    budget_usd: float | None = None     # the call's --max-budget-usd cap
    # False when the process ran but never reported a cost (killed on timeout, no
    # envelope). Such a call may have spent up to its cap; `charged` assumes it did.
    cost_known: bool = True

    def to_json(self) -> dict:
        d = asdict(self)
        d["cost_usd"] = round(self.cost_usd, 5)
        d["seconds"] = round(self.seconds, 1)
        return d


@dataclass
class Result:
    record: CallRecord
    text: str = ""                       # the envelope's `result`
    structured: object | None = None     # `structured_output` when a schema was given
    raw: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.record.ok


def build_command(spec: Spec, *, system_prompt: str | None, schema: dict | None,
                  untrusted_input: bool) -> list[str]:
    """The argv for one call. Pure, so the fences are unit-testable."""
    if spec.effort not in EFFORTS:
        raise ValueError(f"effort {spec.effort!r} is not one of {EFFORTS}")
    if spec.isolation not in ISOLATIONS:
        raise ValueError(f"isolation {spec.isolation!r} is not one of {ISOLATIONS}")
    if untrusted_input and (spec.tools or spec.allowed_tools):
        raise UnsafeCall("a call that carries third-party text must be tool-less; "
                         f"refusing tools={spec.tools!r} allowed={spec.allowed_tools!r}")

    cmd = [CLAUDE_BIN, "-p", "--model", spec.model, "--effort", spec.effort,
           "--output-format", "json",
           "--strict-mcp-config", "--mcp-config", EMPTY_MCP,
           # dontAsk: anything not pre-approved is denied without asking. A documented
           # choice (`default` is not in 2.1.296's list, and only worked as an alias).
           "--permission-mode", "dontAsk", "--permission-prompts", "none",
           "--no-session-persistence"]
    if spec.fallback:
        cmd += ["--fallback-model", spec.fallback]
    if spec.isolation == "restricted":
        cmd.append("--restricted")
    elif spec.isolation == "bare":
        cmd.append("--bare")
    if spec.tools:
        cmd += ["--tools", ",".join(spec.tools)]
        if spec.allowed_tools:
            cmd += ["--allowedTools", ",".join(spec.allowed_tools)]
        cmd += ["--disallowed-tools",
                "WebFetch,WebSearch,Task,Agent,Skill,NotebookEdit,Artifact,SendUserFile"]
    else:
        cmd += ["--tools", "", "--disallowed-tools", DENIED_TOOLS]
    if spec.budget_usd is not None:
        cmd += ["--max-budget-usd", f"{float(spec.budget_usd):.2f}"]
    if system_prompt:
        cmd += ["--system-prompt", system_prompt]
    if schema is not None:
        cmd += ["--json-schema", json.dumps(schema, separators=(",", ":"))]
    return cmd


def call(spec: Spec, stdin: str, *, tier: str, system_prompt: str | None = None,
         schema: dict | None = None, untrusted_input: bool = True,
         heartbeat: Callable[[], None] | None = None, detail: str = "",
         cwd: Path | None = None) -> Result:
    """Run one ``claude -p`` call. Never raises for LLM-side failure.

    ``untrusted_input`` defaults to True: a caller has to say out loud that its input is
    clean before it may grant a tool.
    """
    record = CallRecord(tier=tier, model=spec.model, effort=spec.effort, detail=detail,
                        budget_usd=spec.budget_usd)
    cmd = build_command(spec, system_prompt=system_prompt, schema=schema,
                        untrusted_input=untrusted_input)   # UnsafeCall propagates: a bug

    scratch = Path(tempfile.mkdtemp(prefix="vtt-llm-")) if cwd is None else None
    started = time.monotonic()
    try:
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, text=True,
                                    cwd=str(cwd or scratch))
        except OSError as exc:
            record.error = f"claude CLI unavailable: {exc}"
            return Result(record)

        out, err, timed_out = _communicate(proc, stdin, spec.timeout_s, heartbeat)
        record.seconds = time.monotonic() - started
        if timed_out:
            record.error = f"timed out after {spec.timeout_s}s"
            record.cost_known = False
            return Result(record)
        return _parse(proc.returncode, out, err, record, schema is not None)
    finally:
        if scratch is not None:
            shutil.rmtree(scratch, ignore_errors=True)


def _communicate(proc: subprocess.Popen, stdin: str, timeout_s: float,
                 heartbeat: Callable[[], None] | None) -> tuple[str, str, bool]:
    """``communicate`` in heartbeat-sized slices. Returns ``(out, err, timed_out)``."""
    deadline = time.monotonic() + timeout_s
    pending: str | None = stdin
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            proc.kill()
            try:
                proc.communicate(timeout=10)
            except (subprocess.TimeoutExpired, ValueError):
                pass
            return "", "", True
        try:
            out, err = proc.communicate(pending, timeout=min(HEARTBEAT_SECONDS, remaining))
            return out or "", err or "", False
        except subprocess.TimeoutExpired:
            pending = None    # input already handed over; a retry must not resend it
            if heartbeat:
                try:
                    heartbeat()
                except Exception:  # noqa: BLE001 - a status write must not kill a call
                    pass


def _parse(returncode: int, out: str, err: str, record: CallRecord,
           want_structured: bool) -> Result:
    envelope: dict = {}
    try:
        parsed = json.loads(out) if out.strip() else {}
        envelope = parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        envelope = {}

    if envelope.get("total_cost_usd") is None:
        record.cost_known = False      # ran, but said nothing about what it spent
    record.cost_usd = float(envelope.get("total_cost_usd") or 0.0)
    usage = envelope.get("modelUsage") or {}
    if isinstance(usage, dict) and usage:
        record.resolved_model = max(
            usage, key=lambda k: float((usage[k] or {}).get("costUSD") or 0.0))

    text = str(envelope.get("result") or "") if envelope else ""
    if returncode != 0 or envelope.get("is_error") or not envelope:
        detail = (text or err or out or "").strip()[:300]
        record.error = f"claude exited {returncode}: {detail}" if detail else \
            f"claude exited {returncode} with no output"
        return Result(record, text=text, raw=envelope)
    subtype = envelope.get("subtype")
    if subtype and subtype != "success":
        record.error = f"claude reported {subtype}"
        return Result(record, text=text, raw=envelope)

    structured = envelope.get("structured_output")
    if want_structured and structured is None:
        # Older CLIs, or a model that answered in prose: fall back to the text body.
        structured = extract_json(text)
    if want_structured and structured is None:
        record.error = "no structured output in the response"
        return Result(record, text=text, raw=envelope)

    record.ok = True
    return Result(record, text=text, structured=structured, raw=envelope)


def extract_json(text: str):
    """Models occasionally wrap JSON in a fence despite being told not to."""
    import re
    text = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None


def spec_from(cfg: dict | None, *, default_model: str, default_effort: str,
              default_timeout: int, default_budget: float | None = None,
              isolation: str = "restricted") -> Spec:
    """A :class:`Spec` from a policy block like ``{model, effort, timeout_s, budget_usd}``.
    Bad values fall back to the defaults rather than failing the run."""
    cfg = cfg if isinstance(cfg, dict) else {}
    effort = str(cfg.get("effort") or default_effort)
    if effort not in EFFORTS:
        effort = default_effort
    try:
        timeout = int(cfg.get("timeout_s") or default_timeout)
    except (TypeError, ValueError):
        timeout = default_timeout
    budget = cfg.get("budget_usd", default_budget)
    try:
        budget = float(budget) if budget is not None else None
    except (TypeError, ValueError):
        budget = default_budget
    iso = str(cfg.get("isolation") or isolation)
    return Spec(model=str(cfg.get("model") or default_model), effort=effort,
                timeout_s=timeout, budget_usd=budget,
                fallback=(str(cfg["fallback"]) if cfg.get("fallback") else None),
                isolation=iso if iso in ISOLATIONS else "restricted")


def total_cost(calls: list[dict]) -> float:
    """What the calls reported spending. For display; see :func:`charged` for budgets."""
    return round(sum(float(c.get("cost_usd") or 0.0) for c in calls if c), 5)


def charged_one(call: dict | CallRecord | None) -> float:
    """What one call counts against a budget: its reported cost, or — when it ran and
    never reported one — its cap, the most it could have spent."""
    if call is None:
        return 0.0
    c = call.to_json() if isinstance(call, CallRecord) else call
    cost = float(c.get("cost_usd") or 0.0)
    if c.get("cost_known", True):
        return cost
    return max(cost, float(c.get("budget_usd") or 0.0))


def charged(calls: list[dict]) -> float:
    return round(sum(charged_one(c) for c in calls if c), 5)
