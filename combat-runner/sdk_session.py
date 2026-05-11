#!/usr/bin/env python3
"""Direct Anthropic SDK REPL for the combat-runner.

Replaces the Claude Code CLI exec path with a thin Python loop that talks to
the Anthropic API directly. Wins vs. CLI:

- **1-hour `cache_control` TTL** on the system prompt — Claude Code only exposes
  5min. For a session spanning >5 min of table-talk between turns, this is the
  difference between paying full prefill cost every "stale" turn vs. a cheap
  cached read.
- **`max_tokens` cap** — terminate generation early; combat replies are < 200
  tokens, so capping at 400 saves any tail-token slop.
- **Pre-warm ping** at session start caches the prefix before the user types
  their first verb. First real turn comes back warm, not cold.
- **Direct observability** of `cache_creation_input_tokens` /
  `cache_read_input_tokens` — printed to stderr after every turn so you can
  verify caching is actually active.

Tools are dispatched **in-process** by importing `dnd_roller.MCP_HANDLERS` +
`srd5_2.MCP_HANDLERS` and calling their Python functions directly. No MCP
transport for the at-table loop. (MCP server is still useful for authoring
sessions with Opus — left untouched.)

Toggle via `COMBAT_USE_SDK=0` to fall back to the Claude Code CLI path.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

# Prune SRD tools to the combat subset before importing srd5_2.
os.environ.setdefault("DND_MCP_TOOLS_GROUP", "combat")

# Make scripts/ importable without polluting global sys.path.
_REPO_ROOT = Path(__file__).resolve().parents[1]
_SCRIPTS_DIR = _REPO_ROOT / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

# Load .env (ANTHROPIC_API_KEY etc.) — python-dotenv is already a dep.
try:
    from dotenv import load_dotenv
    load_dotenv(_REPO_ROOT / ".env", override=False)
except ImportError:
    pass

import anthropic  # noqa: E402  (must come after .env load)
import dnd_roller  # noqa: E402
import srd5_2  # noqa: E402

MODEL = "claude-haiku-4-5-20251001"
# Cap output generation. Combat replies are ~150 tokens; 400 leaves margin for
# tactics explanations and the verbose "what should it do?" prompt without
# letting Haiku ramble.
MAX_TOKENS = 400


def _build_tools() -> list[dict]:
    """Combine combat + SRD tool definitions; strip MCP-specific annotations
    the Anthropic SDK doesn't expect."""
    tools: list[dict] = []
    for mcp_tool in dnd_roller.MCP_TOOLS + srd5_2.MCP_TOOLS:
        tools.append({
            "name": mcp_tool["name"],
            "description": mcp_tool["description"],
            "input_schema": mcp_tool["input_schema"],
        })
    return tools


def _build_handlers() -> dict:
    """Dispatch table: tool name → Python callable."""
    return {**dnd_roller.MCP_HANDLERS, **srd5_2.MCP_HANDLERS}


def _build_system_blocks(system_text: str) -> list[dict]:
    """Single text block with 1-hour `cache_control`. Anchored at the end of
    system means tools + system both get cached as the stable prefix."""
    return [
        {
            "type": "text",
            "text": system_text,
            "cache_control": {"type": "ephemeral", "ttl": "1h"},
        }
    ]


def _call_tool(handlers: dict, name: str, args: dict[str, Any]) -> str:
    """Dispatch a tool call. Returns a string (the SDK serializes content as
    text for tool_result blocks). Never raises — errors become JSON results
    Haiku can read and recover from."""
    handler = handlers.get(name)
    if handler is None:
        return json.dumps({"error": f"unknown tool: {name}"})
    try:
        result = handler(**args)
    except Exception as exc:
        import traceback
        sys.stderr.write(
            f"\n[sdk-session] tool {name!r} crashed:\n{traceback.format_exc()}\n"
        )
        sys.stderr.flush()
        return json.dumps({
            "error": f"tool {name} crashed: {exc}",
            "trace": traceback.format_exc()[:1500],
        })
    return result if isinstance(result, str) else json.dumps(result)


def _format_usage(usage: Any) -> str:
    """One-line cache + token report for stderr."""
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    input_tokens = getattr(usage, "input_tokens", 0) or 0
    output_tokens = getattr(usage, "output_tokens", 0) or 0
    parts: list[str] = []
    if cache_read:
        parts.append(f"\033[32mcache_read={cache_read}\033[0m")
    if cache_write:
        parts.append(f"\033[33mcache_write={cache_write}\033[0m")
    parts.append(f"in={input_tokens}")
    parts.append(f"out={output_tokens}")
    return " · ".join(parts)


def _prewarm(client: "anthropic.Anthropic", system_blocks: list[dict], tools: list[dict]) -> None:
    """Fire a tiny request that caches the (tools + system) prefix. By the
    time the user types their first verb, the cache is hot. ~1-3s sunk
    invisibly during the splash text Haiku would never read anyway."""
    print("→ Pre-warming cache...", file=sys.stderr, flush=True)
    t0 = time.time()
    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=1,
            system=system_blocks,
            tools=tools,
            messages=[{"role": "user", "content": "ready"}],
        )
        elapsed = time.time() - t0
        print(
            f"→ Pre-warm done in {elapsed:.2f}s — {_format_usage(resp.usage)}",
            file=sys.stderr,
            flush=True,
        )
    except Exception as exc:
        print(f"→ Pre-warm failed (continuing): {exc}", file=sys.stderr, flush=True)


def run_repl(system_text: str) -> int:
    """Main interactive loop. Returns exit code."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(
            "ERROR: ANTHROPIC_API_KEY not set. Add it to .env or shell env, "
            "or set COMBAT_USE_SDK=0 to use the Claude Code CLI path.",
            file=sys.stderr,
        )
        return 1

    client = anthropic.Anthropic()
    tools = _build_tools()
    handlers = _build_handlers()
    system_blocks = _build_system_blocks(system_text)

    print(
        f"\n\033[1mCombat Runner — SDK mode\033[0m  "
        f"(\033[36m{MODEL}\033[0m · "
        f"{len(tools)} tools · ~{len(system_text) // 4} prompt tokens · "
        f"1h cache)",
        file=sys.stderr,
    )
    print(
        "Type a verb (\033[36mattack!\033[0m, \033[36mbreath!\033[0m, ...). "
        "\033[36m/quit\033[0m to exit.",
        file=sys.stderr,
    )

    _prewarm(client, system_blocks, tools)

    messages: list[dict] = []

    while True:
        try:
            user_input = input("\n\033[36m❯\033[0m ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not user_input:
            continue
        if user_input.lower() in {"/quit", "/exit", "quit", "exit"}:
            break

        messages.append({"role": "user", "content": user_input})

        t_turn = time.time()
        last_usage = None
        tool_call_count = 0

        # Inner loop: chain through any tool_use blocks until stop_reason
        # becomes something other than "tool_use".
        while True:
            try:
                response = client.messages.create(
                    model=MODEL,
                    max_tokens=MAX_TOKENS,
                    system=system_blocks,
                    tools=tools,
                    messages=messages,
                )
            except anthropic.APIError as exc:
                print(f"\n[API error: {exc}]", file=sys.stderr)
                # Roll back the failed user message so retry is clean.
                if messages and messages[-1]["role"] == "user":
                    messages.pop()
                break

            last_usage = response.usage

            # Print any text content as soon as we have it.
            for block in response.content:
                if block.type == "text" and block.text:
                    print(block.text)

            if response.stop_reason == "tool_use":
                # Execute every tool_use block synchronously and feed results back.
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        tool_call_count += 1
                        result_str = _call_tool(handlers, block.name, dict(block.input))
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result_str,
                        })
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})
                continue  # let Haiku read the results

            # stop_reason is "end_turn", "max_tokens", "stop_sequence", etc.
            messages.append({"role": "assistant", "content": response.content})
            break

        elapsed = time.time() - t_turn
        usage_str = _format_usage(last_usage) if last_usage else "no usage"
        tools_str = f"{tool_call_count} tool{'' if tool_call_count == 1 else 's'}"
        print(
            f"\n\033[2m({elapsed:.2f}s · {tools_str} · {usage_str})\033[0m",
            file=sys.stderr,
        )

    print("\nbye.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    # Allow running standalone for quick smoke tests: pipe the system prompt in.
    if not sys.stdin.isatty():
        sys.exit(run_repl(sys.stdin.read()))
    print(
        "Usage: invoked by combat-runner/launch.py, or pipe a system prompt:\n"
        "  cat ~/dnd-combat/.session-context.md | python combat-runner/sdk_session.py",
        file=sys.stderr,
    )
    sys.exit(1)
