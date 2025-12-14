#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import subprocess
import sys
import tempfile


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
    if len(argv) < 2:
        print("Usage: pandoc-export.py <input.md> [pandoc args...]", file=sys.stderr)
        return 2

    selected = pathlib.Path(argv[1]).expanduser()
    pandoc_args = argv[2:]

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
        merged_chunks.append(body)

    if not merged_chunks:
        print("No non-empty markdown content to export.", file=sys.stderr)
        return 0

    separator = "\n\n\\newpage\n\n"
    merged_markdown = separator.join(merged_chunks) + "\n"

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
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

