"""Every live golden (scripts/foundry/live-goldens/*.js) carries its own copy of the helper preamble
(median, timeIt, tag, strip, norm, caught, tick, sleep, probe, ...). Nothing shares them, so this pins
the copies together: a helper is word-for-word the same in every golden that defines it. Only `DROP`
(extra volatile keys a golden drops) and `settle` (its default wait, and whether it sleeps after the
predicate holds) may differ, and only within the forms below; so may the toast spy, in one of two
forms (EXT-7)."""
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


# EXT-7: the toast spy (`toasts` / `spied` / `takeToasts`) is copied into several goldens and the
# copies record a localised toast differently: transform's form localises a message raised with
# `{ localize: true }`, the plain form records the raw key. The recorded strings sit inside each
# golden's `golden.shared`, so the existing copies stay as they are; these are the only two forms,
# and new goldens copy transform's (the README says so).
TOAST_SPY = ("const toasts = [];\nconst notes = ui.notifications;\nconst spied = {};\n",
             "const takeToasts = () => toasts.splice(0);\n")
_TOAST_SPY = """const toasts = [];
const notes = ui.notifications;
const spied = {{}};
for (const lvl of ["info", "warn", "error"]) {{
  spied[lvl] = {{ fn: notes[lvl], own: Object.hasOwn(notes, lvl) }};
  notes[lvl] = function (message, options) {{ toasts.push(`${{lvl}}: {msg}`); return spied[lvl].fn.call(this, message, options); }};
}}
const takeToasts = () => toasts.splice(0);
"""
TOAST_SPY_LOCALISED = _TOAST_SPY.format(msg="${options?.localize ? game.i18n.localize(message) : message}")
TOAST_SPY_PLAIN = _TOAST_SPY.format(msg="${message}")
TOAST_SPY_FORMS = {TOAST_SPY_LOCALISED: "localised (transform)", TOAST_SPY_PLAIN: "plain"}
# names spies on info alone, with its own one-level form; it predates the shared spy and is pinned
# to that one golden rather than offered as a form to copy.
NAMES_INFO_SPY = """const toasts = [];
const notes = ui.notifications;
const origInfo = notes.info;
const hadOwnInfo = Object.hasOwn(notes, "info");
notes.info = function (message, options) { toasts.push(String(message)); return origInfo.call(this, message, options); };
"""
_SPIES_ON_NOTIFICATIONS = re.compile(r"^\s*notes(?:\[\w+\]|\.\w+) = function", re.M)


def test_toast_spy_is_a_known_form():
    """EXT-7: every copy of the toast spy is transform's localised form or the plain one."""
    copies = _blocks(*TOAST_SPY)
    assert "transform" in copies, "EXT-7: transform lost its toast spy"
    assert copies["transform"] == TOAST_SPY_LOCALISED, "EXT-7: transform's spy is no longer the localised form"
    for stem, text in copies.items():
        assert text in TOAST_SPY_FORMS, f"EXT-7: {stem}: toast spy is a new form: {text!r}"


def test_every_toast_spy_is_pinned():
    """EXT-7: a golden that wraps ui.notifications does it with the pinned spy, or is names."""
    spy_copies = _blocks(*TOAST_SPY)
    for stem, text in TEXTS.items():
        if not _SPIES_ON_NOTIFICATIONS.search(text):
            continue
        if stem == "names":
            assert NAMES_INFO_SPY in text, "EXT-7: names' info-only spy changed"
            continue
        assert stem in spy_copies, f"EXT-7: {stem} wraps ui.notifications without the pinned toast spy"


def test_readme_says_new_goldens_copy_transforms_spy():
    """EXT-7: the README tells a new golden which toast spy to copy."""
    readme = (GOLDENS / "README.md").read_text(encoding="utf-8")
    assert "toast spy" in readme and "transform" in readme.split("toast spy", 1)[1][:400], \
        "EXT-7: README does not say new goldens copy transform's toast spy"
