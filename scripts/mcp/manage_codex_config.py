#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SERVER_NAME = "dnd-scripts"
BEGIN_MARKER = f"# BEGIN {SERVER_NAME} mcp (managed)"
END_MARKER = f"# END {SERVER_NAME} mcp (managed)"


def _python_bin() -> Path:
    for candidate in (
        REPO_ROOT / ".venv" / "bin" / "python",
    ):
        if candidate.exists():
            return candidate
    return Path(sys.executable)


def _server_path() -> Path:
    return (REPO_ROOT / "scripts" / "mcp" / "server.py").resolve()


def _snippet(*, python_bin: Path, server_path: Path) -> str:
    # Use absolute paths; Codex does tool discovery at startup and needs stable command resolution.
    return (
        f"{BEGIN_MARKER}\n"
        f"[mcp_servers.{SERVER_NAME}]\n"
        f'command = "{python_bin}"\n'
        f'args = ["{server_path}"]\n'
        f"{END_MARKER}\n"
    )


def _replace_managed_block(*, text: str, block: str) -> str:
    pattern = re.compile(
        r"(?ms)^" + re.escape(BEGIN_MARKER) + r".*?" + re.escape(END_MARKER) + r"\n?",
    )
    if pattern.search(text):
        return pattern.sub(block, text)
    text = text.rstrip() + "\n\n" if text.strip() else ""
    return text + block


def _remove_managed_block(text: str) -> str:
    pattern = re.compile(
        r"(?ms)^" + re.escape(BEGIN_MARKER) + r".*?" + re.escape(END_MARKER) + r"\n?\n?",
    )
    return pattern.sub("", text).rstrip() + "\n"


def _default_codex_config_path() -> Path:
    return Path(os.path.expanduser("~/.codex/config.toml"))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Generate/install Codex MCP server config for this repo.")
    parser.add_argument("--write-local", metavar="PATH", help="Write a repo-local config snippet to PATH.")
    parser.add_argument("--install", action="store_true", help="Install/refresh the managed block in ~/.codex/config.toml.")
    parser.add_argument("--uninstall", action="store_true", help="Remove the managed block from ~/.codex/config.toml.")
    args = parser.parse_args(argv)

    cfg_path = _default_codex_config_path()
    python_bin = _python_bin()
    server_path = _server_path()
    block = _snippet(python_bin=python_bin, server_path=server_path)

    did_any = False

    if args.write_local:
        out_path = (REPO_ROOT / args.write_local).resolve() if not os.path.isabs(args.write_local) else Path(args.write_local)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(block, encoding="utf-8")
        did_any = True

    if args.install:
        cfg_path.parent.mkdir(parents=True, exist_ok=True)
        existing = cfg_path.read_text(encoding="utf-8") if cfg_path.exists() else ""
        updated = _replace_managed_block(text=existing, block=block)
        cfg_path.write_text(updated, encoding="utf-8")
        did_any = True

    if args.uninstall:
        if cfg_path.exists():
            existing = cfg_path.read_text(encoding="utf-8")
            updated = _remove_managed_block(existing)
            cfg_path.write_text(updated, encoding="utf-8")
        did_any = True

    if not did_any:
        parser.print_help()
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
