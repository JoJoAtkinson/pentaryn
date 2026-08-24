#!/usr/bin/env python3
"""Check wikilinks and frontmatter across the lore trees.

`check_context.py` guards `CLAUDE.md` + `context/**`, where links stay relative.
`fix_md_links.py` only understands `[text](path.md)`. Neither can see a
wikilink, so once the lore trees converted to `[[target|display]]` there was
nothing watching them. This is that watcher.

Checks, per markdown file in the lore zones:

  1. Every wikilink resolves — either to a vault-relative path, or to a
     basename that is unique among tracked markdown files.
  2. Wikilinks inside table rows escape their alias pipe (`[[a\\|b]]`). An
     unescaped `|` is a cell separator in GFM and silently eats the display
     text.
  3. No residual broken relative links.
  4. Frontmatter carries the house keys and no `#`-prefixed tags (Obsidian
     does not index those as property tags).

Code fences, inline code spans, image embeds and external links are ignored.
Files carrying Foundry enricher syntax (`[[/attack extended]]`) are skipped
outright — that is not wikilink syntax and never resolves.

Exit status is 1 if anything failed, so this is CI-safe.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

MCP_TOOL = {
    "name": "check_lore_links",
    "description": (
        "Verify the lore trees: every wikilink resolves, table-cell wikilinks escape their "
        "alias pipe, no broken relative links remain, and frontmatter follows the house "
        "standard (created/last_modified/status/tags, tags as a YAML array with no '#'). "
        "Read-only. Returns a report and a non-zero exit if anything fails."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "zone": {
                "type": "string",
                "description": "Optional path prefix to limit the check, e.g. 'world/factions/elderholt'.",
            },
        },
    },
}

# Trees that use wikilinks. `context/`, CLAUDE.md and the code trees keep
# relative links and are guarded by check_context.py instead.
LORE_ZONES = (
    "world/",
    "oneshots/",
    "characters/",
    "sessions/",
    "campaigns/",
    "items/",
    "staging/",
)

# Foundry enricher / lookup syntax, not wikilinks.
SKIP_FILES = {
    "foundry/module/pentaryn-ties/README.md",
    "context/foundry/rules-lookup.md",
    "context/plans/foundry-encounter-log.md",
    "scripts/timeline_svg/AGENTS.md",
    "context/plans/obsidian-first-migration.md",
}

# templates/ links are placeholders an author replaces (`location-name`), not
# targets to follow. Their frontmatter is still checked.
PLACEHOLDER_ZONES = ("templates/",)

WIKILINK = re.compile(r"\[\[([^\[\]]+)\]\]")
MD_LINK = re.compile(r"(!?)\[([^\]]*)\]\(([^)]+)\)")
FENCE = re.compile(r"^\s*(```|~~~)")
TABLE_ROW = re.compile(r"^[ \t]*\|")
FRONTMATTER = re.compile(r"\A---\r?\n(?P<body>.*?)\r?\n---\r?\n", re.DOTALL)

REQUIRED_KEYS = ("created", "last_modified", "status", "tags")

# Timeline events under `**/history/` carry the event schema documented in
# context/world/timelines.md instead of the house keys.
EVENT_KEYS = ("title", "event_id", "year", "precision")
HISTORY_DIR = re.compile(r"(^|/)history/")


def repo_root() -> Path:
    return Path(
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    )


def tracked_markdown(root: Path) -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "*.md"], cwd=root, capture_output=True, text=True, check=True
    ).stdout.split("\n")
    return [f for f in out if f and "node_modules" not in f]


def strip_code(line: str) -> str:
    """Blank out inline code spans so their contents are never inspected."""
    return re.sub(r"`+[^`]*`+", lambda m: " " * len(m.group(0)), line)


def wikilink_target(inner: str) -> str:
    """The link target from a wikilink's contents, alias and anchor removed."""
    target = re.split(r"\\?\|", inner, maxsplit=1)[0]
    return target.split("#", 1)[0].strip()


def check_file(
    rel: str, root: Path, by_name: dict[str, list[str]], vault_paths: set[str]
) -> list[str]:
    problems: list[str] = []
    path = root / rel
    text = path.read_text(encoding="utf-8")
    placeholder = rel.startswith(PLACEHOLDER_ZONES) or Path(rel).name.endswith("_template.md")

    # --- frontmatter -------------------------------------------------------
    m = FRONTMATTER.match(text)
    if not m:
        problems.append(f"{rel}: no YAML frontmatter")
    else:
        body = m.group("body")
        keys = {ln.split(":", 1)[0].strip() for ln in body.splitlines() if ":" in ln}
        expected = EVENT_KEYS if HISTORY_DIR.search(rel) else REQUIRED_KEYS
        for key in expected:
            if key not in keys:
                problems.append(f"{rel}: frontmatter missing `{key}`")
        if re.search(r'^tags:.*"#', body, re.MULTILINE):
            problems.append(f"{rel}: frontmatter tags carry a `#` prefix (Obsidian won't index them)")
        if re.search(r"^last-modified:", body, re.MULTILINE):
            problems.append(f"{rel}: frontmatter uses `last-modified`, house standard is `last_modified`")

    # --- links -------------------------------------------------------------
    in_fence = False
    for lineno, line in enumerate(text.splitlines(), 1):
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue

        scrubbed = strip_code(line)
        is_row = bool(TABLE_ROW.match(scrubbed))

        for wl in WIKILINK.finditer(scrubbed):
            inner = wl.group(1)
            if inner.startswith("/"):
                continue  # Foundry enricher command
            if is_row and "|" in inner and not re.search(r"\\\|", inner):
                problems.append(
                    f"{rel}:{lineno}: `{wl.group(0)}` in a table cell needs its alias pipe "
                    f"escaped (`\\|`) or the cell splits"
                )
            if placeholder:
                continue
            target = wikilink_target(inner)
            if not target:
                problems.append(f"{rel}:{lineno}: empty wikilink target")
                continue
            resolved = target in vault_paths or len(by_name.get(target + ".md", [])) == 1
            if not resolved:
                why = (
                    "ambiguous basename"
                    if len(by_name.get(target + ".md", [])) > 1
                    else "no such note"
                )
                problems.append(f"{rel}:{lineno}: `[[{target}]]` does not resolve ({why})")

        for md in MD_LINK.finditer(scrubbed):
            bang, _, tgt = md.groups()
            tgt = tgt.strip()
            if bang or tgt.startswith(("http://", "https://", "mailto:", "#", "<")):
                continue
            target_path = tgt.split("#", 1)[0]
            if not target_path or placeholder:
                continue
            if not (path.parent / target_path).exists():
                problems.append(f"{rel}:{lineno}: broken relative link -> {tgt}")

    return problems


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--zone", default=None, help="limit to a path prefix")
    args = ap.parse_args(argv[1:])

    root = repo_root()
    all_md = tracked_markdown(root)

    by_name: dict[str, list[str]] = {}
    for f in all_md:
        by_name.setdefault(Path(f).name, []).append(f)
    vault_paths = {f[: -len(".md")] for f in all_md}

    zones = (args.zone,) if args.zone else LORE_ZONES + PLACEHOLDER_ZONES
    targets = [
        f for f in all_md if f.startswith(tuple(zones)) and f not in SKIP_FILES
    ]

    errors: list[str] = []
    warnings: list[str] = []
    for rel in targets:
        for problem in check_file(rel, root, by_name, vault_paths):
            (warnings if "frontmatter" in problem else errors).append(problem)

    for e in errors:
        print(f"  \u2717 {e}")
    for w in warnings:
        print(f"  ! {w}")

    if errors:
        print(
            f"\n  \u2717 {len(errors)} broken link(s), {len(warnings)} frontmatter warning(s) "
            f"across {len(targets)} lore files"
        )
        return 1

    print(
        f"  \u2713 lore links OK ({len(targets)} files checked"
        + (f", {len(warnings)} frontmatter warning(s)" if warnings else "")
        + ")"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
