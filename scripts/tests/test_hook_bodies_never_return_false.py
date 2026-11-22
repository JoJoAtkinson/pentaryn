"""Hooks.call stops at the first handler that returns false.

Foundry fires some hooks (canvasReady among them) with Hooks.call, so a handler written as
`c => cond() && work(c)` returns `false` whenever `cond()` is false and silently stops every
handler after it. Found live 2026-11-22: two pentaryn-aoe canvasReady handlers did this on every
client that was not the lead GM, so pentaryn-pins never bound its GM canvas menu (and every later
canvasReady handler was skipped for players). Write `c => { if (cond()) return work(c); }`.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "foundry" / "module"
# a hook registration whose handler is an expression-bodied arrow that starts with `x && …`
PATTERN = re.compile(
    r"""\.(?:on|once)\(\s*["'][^"']+["']\s*,\s*(?:reg\.guardSwallowAsync\(\s*["'][^"']+["']\s*,\s*)?"""
    r"""(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?![\s{])[^;\n]*?&&"""
)


def offenders():
    out = []
    for f in sorted(ROOT.glob("pentaryn-*/**/*.mjs")):
        if "/test/" in str(f) or "/lib/" in str(f) or "node_modules" in str(f):
            continue
        for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if PATTERN.search(line):
                out.append(f"{f.relative_to(ROOT)}:{n}: {line.strip()[:120]}")
    return out


def test_no_hook_handler_returns_a_short_circuit_boolean():
    assert offenders() == []


def test_pattern_catches_the_original_bug():
    bad = 'reg.on("canvasReady", reg.guardSwallowAsync("canvasReady", c => isLeadGM() && sweep(c.scene)), { guard: false });'
    good = 'reg.on("canvasReady", reg.guardSwallowAsync("canvasReady", c => { if (isLeadGM()) return sweep(c.scene); }), { guard: false });'
    assert PATTERN.search(bad) and not PATTERN.search(good)
