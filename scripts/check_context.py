#!/usr/bin/env python3
"""Guard the instruction surface against the three ways it drifts.

1. CLAUDE.md is auto-loaded into every session, so it must stay a routing table.
2. A routing table that points at a file which no longer exists is worse than no table.
3. A context file with no "Read this when:" line can't be aborted early by a reader who
   arrived by grep rather than through the index.

Run: make check-context
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLAUDE_MD_MAX_LINES = 60
LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")


def check_claude_md_length(errors: list[str]) -> None:
    n = len((ROOT / "CLAUDE.md").read_text(encoding="utf-8").splitlines())
    if n > CLAUDE_MD_MAX_LINES:
        errors.append(
            f"CLAUDE.md is {n} lines (max {CLAUDE_MD_MAX_LINES}). It loads into every "
            f"session — move the prose into a context/ file and leave a routing row."
        )


def check_links(errors: list[str]) -> None:
    """Every local markdown link in the instruction surface must resolve."""
    targets = [ROOT / "CLAUDE.md", ROOT / "README.md", ROOT / "templates/README.md"]
    targets += sorted((ROOT / "context").rglob("*.md"))
    for src in targets:
        if not src.exists():
            continue
        for label, link in LINK_RE.findall(src.read_text(encoding="utf-8")):
            if link.startswith(("http://", "https://", "#", "mailto:")):
                continue
            if not (src.parent / link.split("#")[0]).exists():
                rel = src.relative_to(ROOT)
                errors.append(f"{rel}: broken link [{label}]({link})")


def check_read_this_when(warnings: list[str]) -> None:
    for src in sorted((ROOT / "context").rglob("*.md")):
        if "**Read this when:**" not in src.read_text(encoding="utf-8"):
            warnings.append(
                f"{src.relative_to(ROOT)}: no '**Read this when:**' line — a reader who "
                f"arrives by grep has no way to bail out early."
            )


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    check_claude_md_length(errors)
    check_links(errors)
    check_read_this_when(warnings)

    for w in warnings:
        print(f"  warning: {w}")
    for e in errors:
        print(f"  ERROR:   {e}")
    if errors:
        print(f"\n  {len(errors)} error(s).")
        return 1
    print(f"  ✓ context surface OK ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
