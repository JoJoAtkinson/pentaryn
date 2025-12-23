from __future__ import annotations

from dataclasses import dataclass

from .text_measure import text_width


@dataclass(frozen=True)
class WrappedText:
    title_lines: list[str]
    summary_lines: list[str]
    width: float
    height: float


def wrap_lines(text: str, *, max_width: int, font_path: str, font_size: int, font_weight: int | None = None) -> list[str]:
    words = [w for w in text.split() if w]
    if not words:
        return []
    lines: list[str] = []
    current: list[str] = []
    for word in words:
        trial = " ".join(current + [word]) if current else word
        if current and text_width(trial, font_path, font_size, weight=font_weight) > max_width:
            lines.append(" ".join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        lines.append(" ".join(current))
    return lines


def wrap_title_and_summary(
    *,
    title: str,
    summary: str,
    max_width: int,
    title_font_path: str,
    title_font_size: int,
    title_font_weight: int | None,
    summary_font_path: str,
    summary_font_size: int,
    summary_font_weight: int | None,
    max_summary_lines: int,
    line_gap: int,
    title_line_h: float,
    summary_line_h: float,
) -> WrappedText:
    title_lines = wrap_lines(
        title,
        max_width=max_width,
        font_path=title_font_path,
        font_size=title_font_size,
        font_weight=title_font_weight,
    )
    summary_lines = wrap_lines(
        summary,
        max_width=max_width,
        font_path=summary_font_path,
        font_size=summary_font_size,
        font_weight=summary_font_weight,
    )
    if max_summary_lines >= 0:
        summary_lines = summary_lines[:max_summary_lines]

    max_line_w = 0.0
    for line in title_lines:
        max_line_w = max(max_line_w, text_width(line, title_font_path, title_font_size, weight=title_font_weight))
    for line in summary_lines:
        max_line_w = max(max_line_w, text_width(line, summary_font_path, summary_font_size, weight=summary_font_weight))

    height = 0.0
    if title_lines:
        height += len(title_lines) * title_line_h
    if summary_lines:
        if title_lines:
            height += line_gap
        height += len(summary_lines) * summary_line_h

    return WrappedText(title_lines=title_lines, summary_lines=summary_lines, width=max_line_w, height=height)
