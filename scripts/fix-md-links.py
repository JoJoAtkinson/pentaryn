#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
from dataclasses import dataclass
from pathlib import Path

MCP_TOOL = {
    "name": "fix_md_links",
    "description": (
        "Scan the repo for broken relative Markdown links and suggest fixes (or apply them with write=true). "
        "Focuses on known repo moves (e.g. faction overviews and locations under faction folders)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "write": {"type": "boolean", "description": "Write changes to disk (default: false)."},
            "check_related_links": {
                "type": "boolean",
                "description": "Warn if `## Related Links` is not near the end of file (default: false).",
            },
        },
        "additionalProperties": False,
    },
    "argv": [],
    "bool_flags": {"write": "--write", "check_related_links": "--check-related-links"},
}


@dataclass(frozen=True)
class LinkFix:
    old: str
    new: str
    reason: str


LINK_PATTERN = re.compile(r"(!?)\[([^\]]+)\]\(([^)]+)\)")
SCHEME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _iter_markdown_files(root: Path) -> list[Path]:
    skip_dirs = {".git", ".venv", "node_modules", ".output", "__pycache__"}
    markdown_files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs and not d.startswith(".pandoc-merged-")]
        for filename in filenames:
            if filename.lower().endswith(".md"):
                markdown_files.append(Path(dirpath) / filename)
    markdown_files.sort(key=lambda path: str(path).casefold())
    return markdown_files


def _split_destination(destination_with_title: str) -> tuple[str, str]:
    dest = destination_with_title.strip()
    if dest.startswith("<") and dest.endswith(">"):
        dest = dest[1:-1].strip()
        destination_with_title = dest

    # Very small parser: split "dest title" on first whitespace.
    parts = destination_with_title.strip().split(maxsplit=1)
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " " + parts[1]


def _is_relative_md_link_target(target: str) -> bool:
    target = target.strip()
    if not target or target.startswith("#"):
        return False
    if SCHEME_PATTERN.match(target):
        return False
    return target.lower().endswith(".md") or ".md#" in target.lower()


def _to_abs_target(root: Path, source_file: Path, dest: str) -> Path:
    if dest.startswith("/"):
        return (root / dest.lstrip("/")).resolve()
    return (source_file.parent / dest).resolve()


def _build_faction_overview_map(root: Path) -> dict[str, Path]:
    faction_root = root / "world" / "factions"
    mapping: dict[str, Path] = {}
    if not faction_root.exists():
        return mapping
    for child in faction_root.iterdir():
        if not child.is_dir():
            continue
        overview = child / "_overview.md"
        if overview.exists():
            mapping[child.name] = overview
    return mapping


def _build_location_map(root: Path) -> dict[str, Path]:
    """
    Map location filename -> absolute path.

    Locations live under `world/factions/<region>/locations/` (no top-level `world/locations`).
    """
    faction_root = root / "world" / "factions"
    mapping: dict[str, Path] = {}
    if not faction_root.exists():
        return mapping

    for path in faction_root.rglob("locations/*.md"):
        if not path.is_file():
            continue
        filename = path.name
        # Prefer first seen; duplicates should be resolved by unique filenames.
        mapping.setdefault(filename, path)

    return mapping


def _find_replacement_target(
    *,
    root: Path,
    source_file: Path,
    dest: str,
    faction_overviews: dict[str, Path],
    locations: dict[str, Path],
) -> tuple[Path | None, str]:
    dest_path, anchor = (dest.split("#", 1) + [""])[:2]
    abs_target = _to_abs_target(root, source_file, dest_path)

    if abs_target.exists():
        return None, ""

    # Fix location links: `world/locations/x.md` or `../locations/x.md` -> `world/factions/<region>/locations/x.md`
    normalized = dest_path.replace("\\", "/")
    if "/locations/" in normalized or normalized.startswith("locations/"):
        filename = Path(dest_path).name
        if filename in locations:
            return locations[filename], "location moved under faction"

    # Fix moved factions: `.../world/factions/<slug>.md` -> `.../world/factions/<slug>/_overview.md`
    # Avoid collisions with similarly named locations (e.g. `../locations/merrowgate.md`).
    stem = Path(dest_path).stem
    if "/locations/" not in normalized and stem in faction_overviews and not normalized.endswith("/_overview.md"):
        return faction_overviews[stem], "faction moved to folder"

    # Fix links that point to the old root-level faction file by name only (common in `world/factions/*.md`).
    # Still avoid location collisions.
    if "/locations/" not in normalized and dest_path.lower().endswith(".md") and stem in faction_overviews:
        return faction_overviews[stem], "faction moved to folder"

    return None, ""


def _relative_link(from_dir: Path, to_path: Path) -> str:
    rel = os.path.relpath(to_path, start=from_dir)
    return rel.replace(os.path.sep, "/")


def _check_related_links_tail(path: Path, text: str, *, limit_chars: int = 500) -> str | None:
    marker = "## Related Links"
    idx = text.rfind(marker)
    if idx == -1:
        return None
    if idx < max(0, len(text) - limit_chars):
        return f"{path}: `{marker}` is not within last {limit_chars} characters"
    return None


def fix_file(
    path: Path,
    *,
    root: Path,
    faction_overviews: dict[str, Path],
    locations: dict[str, Path],
) -> tuple[str, list[LinkFix]]:
    original = path.read_text(encoding="utf-8")
    fixes: list[LinkFix] = []

    def repl(match: re.Match[str]) -> str:
        bang = match.group(1)
        label = match.group(2)
        destination_with_title = match.group(3)
        dest, title_suffix = _split_destination(destination_with_title)

        if not _is_relative_md_link_target(dest):
            return match.group(0)

        replacement, reason = _find_replacement_target(
            root=root,
            source_file=path,
            dest=dest,
            faction_overviews=faction_overviews,
            locations=locations,
        )
        if replacement is None:
            return match.group(0)

        anchor = ""
        if "#" in dest:
            anchor = "#" + dest.split("#", 1)[1]

        new_dest = _relative_link(path.parent, replacement) + anchor
        if new_dest == dest:
            return match.group(0)

        fixes.append(LinkFix(old=dest, new=new_dest, reason=reason))
        return f"{bang}[{label}]({new_dest}{title_suffix})"

    updated = LINK_PATTERN.sub(repl, original)
    return updated, fixes


def main() -> int:
    parser = argparse.ArgumentParser(description="Fix broken relative markdown links after repo reorganizations.")
    parser.add_argument("--write", action="store_true", help="Write changes to disk.")
    parser.add_argument("--check-related-links", action="store_true", help="Warn if `## Related Links` isn't near EOF.")
    args = parser.parse_args()

    root = _repo_root()
    faction_overviews = _build_faction_overview_map(root)
    locations = _build_location_map(root)

    markdown_files = _iter_markdown_files(root)
    any_changes = False
    for path in markdown_files:
        updated, fixes = fix_file(
            path,
            root=root,
            faction_overviews=faction_overviews,
            locations=locations,
        )
        if fixes:
            any_changes = True
            print(f"{path.relative_to(root)}:")
            for fix in fixes:
                print(f"  - {fix.reason}: {fix.old} -> {fix.new}")
            if args.write:
                path.write_text(updated, encoding="utf-8")

        if args.check_related_links:
            warning = _check_related_links_tail(
                path.relative_to(root),
                updated if args.write else path.read_text(encoding="utf-8"),
            )
            if warning:
                print(f"WARNING: {warning}")

    if not any_changes:
        print("No changes needed.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
