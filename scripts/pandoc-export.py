#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime
import os
import pathlib
import re
import subprocess
import sys

MCP_TOOL = {
    "name": "pandoc_export_pdf",
    "description": (
        "Merge markdown files (starting from the selected file), clean them (strip relative links, prune empty headings), "
        "and export to PDF via Pandoc. By default this tool uses your VSCode PDF defaults and writes to "
        "`~/Downloads/<input-stem>.pdf` unless you override output."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "input_file": {"type": "string", "description": "Primary markdown file to export."},
            "output": {
                "type": "string",
                "description": "Optional full output path for the PDF (overrides output_dir/output_name).",
            },
            "output_dir": {"type": "string", "description": "Optional output directory (default: ~/Downloads)."},
            "output_name": {
                "type": "string",
                "description": "Optional output filename (e.g. 'session-12.pdf' or 'session-12').",
            },
            "header_tex": {
                "type": "string",
                "description": "Optional TeX header file path for pandoc `-H` (default: .vscode/pandoc-header.tex if present).",
            },
        },
        "required": ["input_file"],
        "additionalProperties": False,
    },
    "argv": ["{input_file}", "--pdf-defaults"],
    "bool_flags": {},
    "value_flags": {
        "output": "--output",
        "output_dir": "--output-dir",
        "output_name": "--output-name",
        "header_tex": "--header-tex",
    },
}


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
_LIST_ITEM_PATTERN = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+")


def _strip_relative_links(markdown: str) -> str:
    """Remove markdown links that point to relative targets; keep link text."""

    def _replace(match: re.Match[str]) -> str:
        text = match.group(1)
        target = match.group(2).strip()

        if not _is_relative_link_target(target):
            return match.group(0)

        return text

    return _LINK_PATTERN.sub(_replace, markdown)


def _is_relative_link_target(target: str) -> bool:
    target = target.strip()
    if not target:
        return False
    if target.startswith("#"):
        return False
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target):
        return False
    return True


def _drop_list_items_with_relative_links(markdown: str) -> str:
    """
    Drop entire list-item lines that include a relative markdown link.

    This primarily targets "Related Links" sections like:
      - [Thing](../path/to/thing.md)
    """
    out: list[str] = []
    for line in markdown.splitlines(True):
        if not _LIST_ITEM_PATTERN.match(line):
            out.append(line)
            continue

        has_relative_link = False
        for match in _LINK_PATTERN.finditer(line):
            if _is_relative_link_target(match.group(2)):
                has_relative_link = True
                break

        if not has_relative_link:
            out.append(line)

    return "".join(out)


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
            # Preserve readability by leaving at most one blank line before the next heading.
            while len(out) >= 2 and not out[-1].strip() and not out[-2].strip():
                out.pop()

    result = "\n".join(out)
    if markdown.endswith("\n"):
        result += "\n"
    return result


def _adjust_output_path(selected: pathlib.Path, pandoc_args: list[str]) -> list[str]:
    """
    Insert a default output path if none was provided.

    - If the selected file name starts with '_', use the parent folder name as the base.
    - Otherwise, use the selected file stem.
    """
    repo_root = pathlib.Path(__file__).resolve().parents[1]
    out_dir = repo_root / ".output"
    out_dir.mkdir(parents=True, exist_ok=True)

    desired_stem = selected.parent.name if selected.name.startswith("_") else selected.stem
    timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    default_output = out_dir / f"{desired_stem}-{timestamp}.pdf"

    out_index = None
    for idx, arg in enumerate(pandoc_args):
        if arg in ("-o", "--output"):
            out_index = idx + 1
            break

    if out_index is None or out_index >= len(pandoc_args):
        return [*pandoc_args, "-o", str(default_output)]
    return list(pandoc_args)


def _ensure_output_path(
    selected: pathlib.Path,
    pandoc_args: list[str],
    *,
    forced_output: pathlib.Path | None,
    default_mode: str,
) -> list[str]:
    """
    Ensure pandoc_args contains an output path.

    - If forced_output is set, it wins.
    - If pandoc_args already contains -o/--output, keep it.
    - Otherwise choose a default based on default_mode.
    """
    out_index = None
    for idx, arg in enumerate(pandoc_args):
        if arg in ("-o", "--output"):
            out_index = idx + 1
            break

    updated = list(pandoc_args)

    if forced_output is None and out_index is not None and out_index < len(updated):
        return updated

    if forced_output is None:
        if default_mode == "downloads":
            desired_stem = selected.parent.name if selected.name.startswith("_") else selected.stem
            forced_output = pathlib.Path(os.path.expanduser("~/Downloads")) / f"{desired_stem}.pdf"
        else:
            return _adjust_output_path(selected, updated)

    if out_index is None or out_index >= len(updated):
        updated.extend(["-o", str(forced_output)])
    else:
        updated[out_index] = str(forced_output)
    return updated


def _ensure_header_tex(pandoc_args: list[str], *, header_tex: pathlib.Path | None) -> list[str]:
    if header_tex is None:
        return list(pandoc_args)
    for idx, arg in enumerate(pandoc_args):
        if arg == "-H" and idx + 1 < len(pandoc_args):
            return list(pandoc_args)
        if arg.startswith("-H") and len(arg) > 2:
            return list(pandoc_args)
    return [*pandoc_args, "-H", str(header_tex)]


def _apply_pdf_defaults(pandoc_args: list[str]) -> list[str]:
    """
    Apply the same Pandoc options used by the VSCode task (if they aren't already present).
    """
    updated = list(pandoc_args)

    def has_flag(*flags: str) -> bool:
        return any(a in flags for a in updated)

    def has_prefix(prefix: str) -> bool:
        return any(a.startswith(prefix) for a in updated)

    if not has_flag("--toc"):
        updated.append("--toc")
    if not has_prefix("--toc-depth"):
        updated.append("--toc-depth=2")
    if not has_prefix("--pdf-engine"):
        updated.append("--pdf-engine=xelatex")

    # Variables (keep simple; don't try to dedupe pairs aggressively).
    vars_defaults = [
        ("mainfont", "Baskerville"),
        ("linestretch", "1.3"),
        ("classoption", "twocolumn"),
        ("geometry:margin", "0.7in"),
    ]
    existing_vars = set()
    for idx, arg in enumerate(updated):
        if arg == "-V" and idx + 1 < len(updated):
            existing_vars.add(updated[idx + 1].split("=", 1)[0])
        elif arg.startswith("-V") and len(arg) > 2:
            existing_vars.add(arg[2:].split("=", 1)[0])

    for key, value in vars_defaults:
        if key in existing_vars:
            continue
        updated.extend(["-V", f"{key}={value}"])

    return updated


def _separator_for_mode(mode: str) -> str:
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
    parser.add_argument("--output", help="Write the PDF to this exact path (overrides output-dir/output-name).")
    parser.add_argument("--output-dir", help="Directory for the output PDF (default varies by mode).")
    parser.add_argument("--output-name", help="Filename for the output PDF (e.g. 'foo.pdf' or 'foo').")
    parser.add_argument("--header-tex", help="TeX header file to pass to pandoc via `-H`.")
    parser.add_argument(
        "--pdf-defaults",
        action="store_true",
        help="Apply the same default pandoc args as the VSCode 'Markdown: Export to PDF' task.",
    )
    parser.add_argument(
        "--break-mode",
        choices=["line", "column", "page"],
        default="column",
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
    header_tex: pathlib.Path | None = pathlib.Path(args.header_tex).expanduser() if args.header_tex else None
    if args.pdf_defaults and header_tex is None:
        default_header = pathlib.Path(__file__).resolve().parents[1] / ".vscode" / "pandoc-header.tex"
        if default_header.exists():
            header_tex = default_header

    forced_output: pathlib.Path | None = None
    if args.output:
        forced_output = pathlib.Path(args.output).expanduser()
    else:
        output_dir = pathlib.Path(args.output_dir).expanduser() if args.output_dir else None
        output_name = (args.output_name or "").strip() or None
        if output_name:
            if not output_name.lower().endswith(".pdf"):
                output_name = output_name + ".pdf"
        if output_dir is not None and output_name is not None:
            forced_output = output_dir / output_name
        elif output_dir is not None:
            forced_output = output_dir / f"{selected.stem}.pdf"
        elif output_name is not None:
            forced_output = pathlib.Path(os.path.expanduser("~/Downloads")) / output_name

    if args.pdf_defaults:
        pandoc_args = _apply_pdf_defaults(list(pandoc_args))
        pandoc_args = _ensure_header_tex(list(pandoc_args), header_tex=header_tex)
        pandoc_args = _ensure_output_path(selected, list(pandoc_args), forced_output=forced_output, default_mode="downloads")
    else:
        pandoc_args = _ensure_output_path(selected, list(pandoc_args), forced_output=forced_output, default_mode="timestamp")

    if not selected.exists():
        print(f"Input file does not exist: {selected}", file=sys.stderr)
        return 2

    if _is_template_path(selected) or _has_template_marker(selected):
        print(f"Skipping template file: {selected}", file=sys.stderr)
        return 0

    merge_directory = "_" in selected.name
    merged_files: list[pathlib.Path] = [selected]
    if merge_directory:
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
        cleaned = body
        cleaned = _drop_list_items_with_relative_links(cleaned)
        cleaned = _strip_relative_links(cleaned)
        cleaned = _remove_empty_headings(cleaned)
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

    out_path = None
    for idx, arg in enumerate(pandoc_args):
        if arg in ("-o", "--output") and idx + 1 < len(pandoc_args):
            out_path = pathlib.Path(pandoc_args[idx + 1])
            break

    should_write_merged_md = merge_directory or args.keep_merged_md
    if should_write_merged_md and out_path is not None:
        merged_path = out_path.with_suffix(".md")
        try:
            merged_path.write_text(merged_markdown, encoding="utf-8")
            if args.keep_merged_md:
                print(f"Kept merged markdown: {merged_path}", file=sys.stderr)
        except OSError as exc:
            print(f"Failed to write merged markdown: {exc}", file=sys.stderr)

    # Feed Pandoc via stdin to avoid creating temp files next to the source markdown.
    cmd = ["pandoc", "-f", "markdown", "-", *pandoc_args]
    completed = subprocess.run(cmd, input=merged_markdown, text=True)

    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
