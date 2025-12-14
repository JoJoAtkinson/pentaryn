#!/usr/bin/env python3
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys
import tempfile
from turtle import mode


"""
Merge markdown files (starting from the selected file), clean them, and export via Pandoc.

This script does not modify your source markdown files; it only cleans a merged temporary file.
Use `--print-merged-md` or `--keep-merged-md` to inspect the generated markdown.
"""


def _is_template_path(path: pathlib.Path) -> bool:
    for part in path.parts:
        if part.startswith("__"):
            return True
    return False


def _has_template_marker(path: pathlib.Path, *, max_lines: int = 80) -> bool:
    try:
        with path.open("r", encoding="utf-8") as file_handle:
            for _ in range(max_lines):
                line = file_handle.readline()
                if not line:
                    break
                if line.strip().lower() == "template: true":
                    return True
    except OSError:
        return False
    return False


def _strip_yaml_frontmatter(markdown: str) -> str:
    lines = markdown.splitlines(True)
    if not lines:
        return markdown
    if lines[0].strip() != "---":
        return markdown

    end_index = None
    for index in range(1, len(lines)):
        if lines[index].strip() in {"---", "..."}:
            end_index = index
            break

    if end_index is None:
        return markdown

    content_start = end_index + 1
    while content_start < len(lines) and lines[content_start].strip() == "":
        content_start += 1

    return "".join(lines[content_start:])


def _read_markdown_body(path: pathlib.Path) -> str:
    text = path.read_text(encoding="utf-8")
    return _strip_yaml_frontmatter(text).strip()


_LINK_PATTERN = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def _strip_relative_links(markdown: str) -> str:
    """Remove markdown links that point to relative targets; keep link text."""

    def _replace(match: re.Match[str]) -> str:
        text = match.group(1)
        target = match.group(2).strip()

        # Keep external/anchored links.
        if target.startswith("#"):
            return text
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target):
            return match.group(0)

        # Treat everything else (./, ../, bare names, root paths) as relative.
        return text

    return _LINK_PATTERN.sub(_replace, markdown)


_HEADING_PATTERN = re.compile(r"^(#{1,6})\s+.*$")
_SEPARATOR_PATTERN = re.compile(
    r"^\s*(\*{3,}|-{3,}|_{3,}|\\columnbreak|\\pagebreak|\\newpage)\s*$", re.IGNORECASE
)


def _remove_empty_headings(markdown: str) -> str:
    """
    Drop headings that have no content before the next heading of the same
    or higher level. Deeper sub-headings count as content.
    """
    lines = markdown.splitlines()
    out: list[str] = []
    idx = 0

    while idx < len(lines):
        match = _HEADING_PATTERN.match(lines[idx])
        if not match:
            out.append(lines[idx])
            idx += 1
            continue

        current_level = len(match.group(1))
        content_found = False
        lookahead = idx + 1

        while lookahead < len(lines):
            next_match = _HEADING_PATTERN.match(lines[lookahead])
            if next_match:
                next_level = len(next_match.group(1))
                if next_level <= current_level:
                    break
                content_found = True  # deeper heading counts as content
                lookahead += 1
                continue
            line_text = lines[lookahead].strip()
            if not _SEPARATOR_PATTERN.match(line_text) and line_text:
                content_found = True
            lookahead += 1

        if content_found:
            out.append(lines[idx])
            idx += 1
        else:
            # Skip this heading and any blank lines that followed it.
            idx = lookahead
            while out and not out[-1].strip():
                out.pop()

    result = "\n".join(out)
    if markdown.endswith("\n"):
        result += "\n"
    return result


def _adjust_output_path(selected: pathlib.Path, pandoc_args: list[str]) -> list[str]:
    """
    If the selected file name starts with '_', rewrite any provided output
    path to use the parent folder name instead of the file stem. This keeps
    VS Code tasks simple while allowing folder-based naming for underscored files.
    """
    out_index = None
    for idx, arg in enumerate(pandoc_args):
        if arg in ("-o", "--output"):
            out_index = idx + 1
            break

    if out_index is None or out_index >= len(pandoc_args):
        return pandoc_args

    original = pathlib.Path(pandoc_args[out_index]).expanduser()
    desired_stem = selected.parent.name if selected.name.startswith("_") else selected.stem
    new_output = original.with_name(f"{desired_stem}{original.suffix or '.pdf'}")

    updated = list(pandoc_args)
    updated[out_index] = str(new_output)
    return updated


def _separator_for_mode(mode: str) -> str:
    print(f"Selected break mode: {mode}", file=sys.stderr)

    if mode == "column":
        return "\n\n\\ifdefined\\columnbreak\\columnbreak\\else\\newpage\\fi\n\n"
    if mode == "page":
        return "\n\n\\newpage\n\n"
    return "\n\n***\n\n"


def _files_below_selected(selected: pathlib.Path) -> list[pathlib.Path]:
    directory = selected.parent
    markdown_files = [
        path
        for path in directory.iterdir()
        if path.is_file() and path.suffix.lower() == ".md"
    ]
    markdown_files.sort(key=lambda path: path.name.casefold())

    selected_resolved = selected.resolve()
    try:
        selected_index = next(
            index
            for index, path in enumerate(markdown_files)
            if path.resolve() == selected_resolved
        )
        return markdown_files[selected_index + 1 :]
    except StopIteration:
        selected_key = selected.name.casefold()
        return [path for path in markdown_files if path.name.casefold() > selected_key]


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="pandoc-export.py",
        description="Merge markdown files, clean them, and run pandoc.",
        add_help=True,
    )
    parser.add_argument("input_file", help="Primary markdown file to export.")
    parser.add_argument(
        "--break-mode",
        choices=["line", "column", "page"],
        default="page",
        help="How to separate merged files: horizontal rule (line), column break, or page break.",
    )
    parser.add_argument(
        "--keep-merged-md",
        action="store_true",
        help="Keep the generated merged markdown file (prints its path to stderr).",
    )
    parser.add_argument(
        "--print-merged-md",
        action="store_true",
        help="Print merged markdown to stdout and exit (does not run pandoc).",
    )

    args, pandoc_args = parser.parse_known_args(argv[1:])

    selected = pathlib.Path(args.input_file).expanduser()
    pandoc_args = _adjust_output_path(selected, pandoc_args)

    if not selected.exists():
        print(f"Input file does not exist: {selected}", file=sys.stderr)
        return 2

    if _is_template_path(selected) or _has_template_marker(selected):
        print(f"Skipping template file: {selected}", file=sys.stderr)
        return 0

    merged_files: list[pathlib.Path] = [selected]
    for candidate in _files_below_selected(selected):
        if _is_template_path(candidate) or _has_template_marker(candidate):
            continue
        merged_files.append(candidate)

    unique_files: list[pathlib.Path] = []
    seen: set[pathlib.Path] = set()
    for path in merged_files:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique_files.append(path)

    merged_chunks: list[str] = []
    for path in unique_files:
        try:
            body = _read_markdown_body(path)
        except OSError as exc:
            print(f"Skipping unreadable file {path}: {exc}", file=sys.stderr)
            continue
        if not body:
            continue
        cleaned = _remove_empty_headings(_strip_relative_links(body))
        if cleaned:
            merged_chunks.append(cleaned)

    if not merged_chunks:
        print("No non-empty markdown content to export.", file=sys.stderr)
        return 0

    separator = _separator_for_mode(args.break_mode)
    merged_markdown = separator.join(merged_chunks) + "\n"

    if args.print_merged_md:
        sys.stdout.write(merged_markdown)
        return 0

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=".md",
        prefix=".pandoc-merged-",
        dir=str(selected.parent),
        delete=False,
    ) as temp_file:
        temp_path = pathlib.Path(temp_file.name)
        temp_file.write(merged_markdown)

    try:
        cmd = ["pandoc", str(temp_path), *pandoc_args]
        completed = subprocess.run(cmd)
        return int(completed.returncode)
    finally:
        if args.keep_merged_md:
            print(f"Kept merged markdown: {temp_path}", file=sys.stderr)
        else:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
