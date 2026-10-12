"""Every live golden (scripts/foundry/live-goldens/*.js) carries its own copy of the helper preamble
(median, timeIt, tag, strip, norm, caught, tick, sleep, probe, ...). Nothing shares them, so this pins
the copies together: a helper is word-for-word the same in every golden that defines it. Only `DROP`
(extra volatile keys a golden drops) and `settle` (its default wait, and whether it sleeps after the
predicate holds) may differ, and only within the forms below."""
import re
from pathlib import Path

import pytest

GOLDENS = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"
TEXTS = {p.stem: p.read_text(encoding="utf-8") for p in sorted(GOLDENS.glob("*.js"))}

ONE_LINE = ["median", "norm", "caught", "tick", "sleep", "probe", "keysOf", "tag", "fnv", "safely"]
# name -> (start anchor, closing text); the block runs from the anchor through the closing text.
BLOCKS = {
    "timeIt": ("async function timeIt(", "\n}\n"),
    "strip": ("const strip = ", "\n  : v;\n"),
}
DROP_BASE = {"t", "at", "age", "ms", "_stats"}

_SETTLE = """const settle = async (pred, ms = {ms}) => {{
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {{ if (pred()) {hit} await tick(); }}
  return !!pred();
}};
"""
_RETURN = "return true;"
_SLEEP_THEN_RETURN = "{ await sleep(1200); return true; }"
SETTLE_FORMS = {
    _SETTLE.format(ms=3000, hit=_RETURN),
    _SETTLE.format(ms=4000, hit=_RETURN),
    _SETTLE.format(ms=6000, hit=_RETURN),
    _SETTLE.format(ms=8000, hit=_SLEEP_THEN_RETURN),
}


def _lines(name):
    pattern = re.compile(rf"^const {re.escape(name)} = .*$", re.M)
    return {stem: m.group(0) for stem, text in TEXTS.items() for m in pattern.finditer(text)}


def _block(text, anchor, end):
    start = text.find(anchor)
    if start < 0:
        return None
    stop = text.find(end, start)
    assert stop >= 0, f"{anchor!r} has no closing {end!r}"
    return text[start:stop + len(end)]


def _blocks(anchor, end):
    found = {stem: _block(text, anchor, end) for stem, text in TEXTS.items()}
    return {stem: b for stem, b in found.items() if b is not None}


def _assert_one_form(name, copies):
    assert copies, f"no golden defines {name}"
    forms = {}
    for stem, text in copies.items():
        forms.setdefault(text, []).append(stem)
    assert len(forms) == 1, f"{name} differs between goldens: " + "; ".join(
        f"{sorted(stems)}: {text!r}" for text, stems in forms.items())


@pytest.mark.parametrize("name", ONE_LINE + list(BLOCKS))
def test_helper_is_identical_everywhere(name):
    copies = _blocks(*BLOCKS[name]) if name in BLOCKS else _lines(name)
    _assert_one_form(name, copies)


def test_drop_keeps_the_base_keys():
    lines = _lines("DROP")
    assert set(lines) == set(TEXTS), f"goldens without DROP: {sorted(set(TEXTS) - set(lines))}"
    for stem, line in lines.items():
        keys = set(re.findall(r'"([^"]+)"', line))
        assert DROP_BASE <= keys, f"{stem}: DROP lacks {sorted(DROP_BASE - keys)}"


def test_settle_is_a_known_variant():
    copies = _blocks("const settle = ", "\n};\n")
    assert copies, "no golden defines settle"
    for stem, text in copies.items():
        assert text in SETTLE_FORMS, f"{stem}: settle is a new form: {text!r}"
