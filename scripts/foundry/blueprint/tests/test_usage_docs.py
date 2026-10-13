"""Usage docs match argparse: every flag a script accepts is named in its docstring usage block and
its README row (py-blueprint-MAINT-11)."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import pytest

from scripts.foundry.blueprint import new_module, vendor

README = Path(__file__).resolve().parents[1] / "README.md"


class _Captured(Exception):
    def __init__(self, parser):
        self.parser = parser


def _parsers(mod, monkeypatch) -> list[argparse.ArgumentParser]:
    """The parser(s) `mod.main` builds — top level plus any sub-commands."""
    def capture(self, *a, **k):
        raise _Captured(self)
    monkeypatch.setattr(argparse.ArgumentParser, "parse_args", capture)
    with pytest.raises(_Captured) as exc:
        mod.main([])
    ap = exc.value.parser
    out = [ap]
    for action in ap._actions:
        if isinstance(action, argparse._SubParsersAction):
            out.extend(action.choices.values())
    return out


def _flags(mod, monkeypatch) -> set[str]:
    return {opt for p in _parsers(mod, monkeypatch) for a in p._actions
            for opt in a.option_strings if opt.startswith("--") and opt != "--help"}


def _usage_block(mod) -> str:
    """The first indented block of the module docstring — the usage lines."""
    lines, started = [], False
    for line in mod.__doc__.splitlines():
        if line.startswith("    "):
            started = True
            lines.append(line)
        elif started:
            break
    return "\n".join(lines)


def _readme_row(script: str) -> str:
    return next(l for l in README.read_text().splitlines() if l.startswith(f"| `{script}"))


def _named(flag: str, text: str) -> bool:
    if re.search(re.escape(flag) + r"(?![\w-])", text):
        return True
    if flag.startswith("--no-"):  # BooleanOptionalAction, written --[no-]x
        return f"--[no-]{flag[5:]}" in text
    if f"--[no-]{flag[2:]}" in text:
        return True
    return False


@pytest.mark.parametrize("mod,script", [(vendor, "vendor.py"), (new_module, "new_module.py")])
def test_maint11_every_flag_is_in_the_docstring_usage_and_readme_row(mod, script, monkeypatch):
    flags = _flags(mod, monkeypatch)
    assert flags
    usage, row = _usage_block(mod), _readme_row(script)
    assert not sorted(f for f in flags if not _named(f, usage)), f"{script} docstring usage"
    assert not sorted(f for f in flags if not _named(f, row)), f"{script} README row"
