"""The static gates on the in-house Foundry modules.

The bug they exist for: on 2026-08-22 an `export` was deleted out from under two
importers. Every file still passed `node --check` — that command reads one file at a
time and has no idea what the file next to it exports — so `make foundry-ties-check`
went green, and the module then failed to initialise in the browser: settings
unregistered, sheet tab blank, nothing in the console. A gate that goes green on a
module that cannot load is worse than no gate, so what is pinned down here is the
*negative* direction: each way of breaking a module has a test that fails without the
gate.

The second thing worth pinning down is the honesty of the dead-key report. An ad-hoc
version of the i18n check called every dynamically-named key dead — `f(labelKey, …)`,
`` t(`stance.${k}`) ``, a helper forwarding its argument — and each one was live. So
the tests below assert that those come back UNVERIFIABLE, not dead, and that the
check still passes.

Synthetic modules rather than the real ones on purpose: these must keep testing the
checker on the day someone legitimately renames a key in pentaryn-ties.
"""

from __future__ import annotations

import json

from scripts.foundry.ops import config as cfg, jsscan, modules


# ── a module in a temp directory ──────────────────────────────────────────────

class TmpSpec(cfg.ModuleSpec):
    """A ModuleSpec whose sources live wherever the test put them."""

    def __init__(self, root, **kw):
        super().__init__("demo", **kw)
        self._root = root

    @property
    def src(self):
        return self._root


def build(tmp_path, files: dict[str, str], *, manifest: dict | None = None,
          lang: dict | None = None) -> cfg.ModuleSpec:
    """Write a throwaway module and return a spec pointing at it."""
    root = tmp_path / "modules" / "demo"
    root.mkdir(parents=True)
    for name, text in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    (root / "module.json").write_text(json.dumps(
        manifest or {"id": "demo", "esmodules": ["main.mjs"]}), encoding="utf-8")
    if lang is not None:
        (root / "lang").mkdir(exist_ok=True)
        (root / "lang/en.json").write_text(json.dumps(lang), encoding="utf-8")

    return TmpSpec(root, check=("imports", "i18n"))


# ── cross-file imports ────────────────────────────────────────────────────────

GOOD = {
    "main.mjs": 'import { alpha, beta } from "./lib.mjs";\nexport function boot() { return alpha() + beta; }\n',
    "lib.mjs": 'export function alpha() { return 1; }\nexport const beta = 2;\n',
}


def test_intact_module_passes(tmp_path, capsys):
    assert modules._check_imports(build(tmp_path, GOOD)) == 0
    assert "✓" in capsys.readouterr().out


def test_a_removed_export_fails_and_names_both_ends(tmp_path, capsys):
    """The 2026-08-22 outage, in miniature."""
    broken = {**GOOD, "lib.mjs": 'function alpha() { return 1; }\nexport const beta = 2;\n'}
    assert modules._check_imports(build(tmp_path, broken)) == 1
    out = capsys.readouterr().out
    assert "main.mjs:1" in out          # where the import is
    assert "alpha" in out               # what is missing
    assert "./lib.mjs" in out           # where it was supposed to come from
    assert "beta" in out                # and what the file does export, to place the typo


def test_a_missing_file_fails(tmp_path, capsys):
    only = {"main.mjs": 'import { alpha } from "./gone.mjs";\n'}
    assert modules._check_imports(build(tmp_path, only)) == 1
    assert "no such file" in capsys.readouterr().out


def test_dynamic_import_destructuring_is_checked(tmp_path, capsys):
    """`const { x } = await import(…)` fails at runtime the same way a static one does."""
    files = {
        "main.mjs": 'export async function go() {\n  const { alpha } = await import("./lib.mjs");\n  return alpha;\n}\n',
        "lib.mjs": 'export const beta = 2;\n',
    }
    assert modules._check_imports(build(tmp_path, files)) == 1
    assert "alpha" in capsys.readouterr().out


def test_a_manifest_entry_with_no_file_fails(tmp_path, capsys):
    spec = build(tmp_path, GOOD, manifest={"id": "demo", "esmodules": ["main.mjs"],
                                           "styles": ["styles/demo.css"]})
    assert modules._check_imports(spec) == 1
    assert "styles/demo.css" in capsys.readouterr().out


def test_renamed_import_is_checked_by_its_source_name(tmp_path):
    """`import { alpha as a }` needs `alpha` there, not `a`."""
    files = {"main.mjs": 'import { alpha as a } from "./lib.mjs";\nexport const x = a;\n',
             "lib.mjs": 'export function alpha() {}\n'}
    assert modules._check_imports(build(tmp_path, files)) == 0


def test_re_export_chain_is_followed(tmp_path):
    files = {"main.mjs": 'import { alpha } from "./barrel.mjs";\nexport const x = alpha;\n',
             "barrel.mjs": 'export * from "./lib.mjs";\n',
             "lib.mjs": 'export function alpha() {}\n'}
    assert modules._check_imports(build(tmp_path, files)) == 0


def test_bare_specifiers_are_left_alone(tmp_path):
    """Foundry core and CDN imports are not ours to resolve — and must not fail."""
    files = {"main.mjs": 'import { Application } from "foundry/applications/api.mjs";\nexport const x = Application;\n'}
    assert modules._check_imports(build(tmp_path, files)) == 0


def test_the_word_import_inside_a_string_is_not_an_import(tmp_path):
    files = {"main.mjs": 'export const doc = "import { nope } from \\"./ghost.mjs\\"";\n'}
    assert modules._check_imports(build(tmp_path, files)) == 0


# ── i18n keys ─────────────────────────────────────────────────────────────────

LANG = {"DEMO.title": "Demo", "DEMO.row.remove": "Remove", "DEMO.row.keep": "Keep"}


def i18n_module(tmp_path, body: str, lang: dict | None = None):
    return build(tmp_path, {"main.mjs": body}, lang=lang if lang is not None else LANG)


def test_every_referenced_key_present_passes(tmp_path, capsys):
    body = ('const t = k => game.i18n.localize(`DEMO.${k}`);\n'
            'export const label = "DEMO.title";\n'
            'export function ui() { return t("row.remove") + t("row.keep"); }\n')
    assert modules._check_i18n(i18n_module(tmp_path, body)) == 0
    assert "✓" in capsys.readouterr().out


def test_a_key_that_is_not_in_the_lang_file_fails(tmp_path, capsys):
    body = ('const t = k => game.i18n.localize(`DEMO.${k}`);\n'
            'export function ui() { return t("row.destroy"); }\n')
    assert modules._check_i18n(i18n_module(tmp_path, body)) == 1
    out = capsys.readouterr().out
    assert "DEMO.row.destroy" in out
    assert "main.mjs:2" in out


def test_a_missing_key_written_out_in_full_fails(tmp_path, capsys):
    body = 'export const setting = { name: "DEMO.settings.gone" };\n'
    assert modules._check_i18n(i18n_module(tmp_path, body)) == 1
    assert "DEMO.settings.gone" in capsys.readouterr().out


def test_a_key_used_only_inside_an_interpolated_template_is_seen(tmp_path):
    """Most of these modules build HTML in templates; a lexer that swallowed the
    `${…}` regions would report every key inside them as dead."""
    body = ('const t = k => game.i18n.localize(`DEMO.${k}`);\n'
            'export const html = `<button>${t("row.remove")}</button>`;\n')
    spec = i18n_module(tmp_path, body, lang={"DEMO.row.remove": "Remove"})
    assert modules._check_i18n(spec) == 0


def test_both_branches_of_a_ternary_are_checked(tmp_path, capsys):
    body = ('const t = k => game.i18n.localize(`DEMO.${k}`);\n'
            'export const s = flag => t(flag ? "row.remove" : "row.vanish");\n')
    assert modules._check_i18n(i18n_module(tmp_path, body)) == 1
    assert "DEMO.row.vanish" in capsys.readouterr().out


def test_an_unreferenced_key_is_reported_but_does_not_fail(tmp_path, capsys):
    body = 'export const label = "DEMO.title";\n'
    lang = {**LANG, "DEMO.leftover": "…"}
    assert modules._check_i18n(i18n_module(tmp_path, body, lang)) == 0
    assert "DEMO.leftover" in capsys.readouterr().out


def test_a_key_passed_as_a_variable_is_unverifiable_not_dead(tmp_path, capsys):
    """The false-positive that made the ad-hoc version of this check unusable."""
    body = ('const f = (k, d) => game.i18n.format(`DEMO.${k}`, d);\n'
            'const box = labelKey => f(labelKey, {});\n'
            'export const html = box("row.remove") + box("row.keep");\n')
    assert modules._check_i18n(i18n_module(tmp_path, body)) == 0
    out = capsys.readouterr().out
    assert "DEMO.row.remove" not in out          # not accused of being dead
    assert "pass the key as a variable" in out   # but the blind spot IS declared


def test_a_computed_key_covers_its_whole_branch(tmp_path, capsys):
    """``localize(`DEMO.stance.${k}`)`` reaches every DEMO.stance.* key."""
    body = 'export const s = k => game.i18n.localize(`DEMO.stance.${k}`);\n'
    lang = {"DEMO.stance.wary": "Wary", "DEMO.stance.kind": "Kind", "DEMO.orphan": "…"}
    assert modules._check_i18n(i18n_module(tmp_path, body, lang)) == 0
    out = capsys.readouterr().out
    assert "DEMO.stance.wary" not in out
    assert "DEMO.orphan" in out                  # nothing covers this one


def test_a_key_built_into_a_variable_still_covers_its_branch(tmp_path, capsys):
    """The interpolation does not have to sit inside the localize() call. Missing this
    reported two live `PENTARYN_TIES.known.category.*` keys as dead."""
    body = ('export const label = c => {\n'
            '  const key = `DEMO.cat.${c.key}`;\n'
            '  return game.i18n.localize(key);\n'
            '};\n')
    lang = {"DEMO.cat.beasts": "Beasts", "DEMO.cat.people": "People", "DEMO.orphan": "…"}
    assert modules._check_i18n(i18n_module(tmp_path, body, lang)) == 0
    out = capsys.readouterr().out
    assert "DEMO.cat.beasts" not in out
    assert "DEMO.orphan" in out


def test_a_wrapper_relative_key_in_a_variable_covers_its_branch(tmp_path, capsys):
    body = ('const t = k => game.i18n.localize(`DEMO.${k}`);\n'
            'export const label = c => t(`cat.${c.key}`);\n')
    lang = {"DEMO.cat.beasts": "Beasts", "DEMO.orphan": "…"}
    assert modules._check_i18n(i18n_module(tmp_path, body, lang)) == 0
    out = capsys.readouterr().out
    assert "DEMO.cat.beasts" not in out
    assert "DEMO.orphan" in out


def test_a_module_with_no_lang_file_is_silent(tmp_path, capsys):
    assert modules._check_i18n(build(tmp_path, GOOD)) == 0
    assert capsys.readouterr().out == ""


# ── the lexer's own blind spots, stated as tests ──────────────────────────────

def test_comments_and_strings_are_not_code(tmp_path):
    files = {"main.mjs": ('// import { ghost } from "./nowhere.mjs";\n'
                          '/* export function phantom() {} */\n'
                          'export const re = /["\'`]/g;\n'
                          'export const div = 6 / 2;\n')}
    src = jsscan.scan((build(tmp_path, files).src / "main.mjs"))
    names, _ = jsscan.exports_of(src)
    assert names == {"re", "div"}
    assert not jsscan.imports_of(src)


def test_line_numbers_survive_templates_and_comments(tmp_path):
    """Every diagnostic these gates print is a file:line, so the lexer must not
    lose or invent a newline while lifting strings out."""
    files = {"main.mjs": ('/* one\n   two */\n'
                          'const t = k => game.i18n.localize(`DEMO.${k}`);\n'
                          'const html = `<a>\n  ${t("x")}\n</a>`;\n'
                          'import { alpha } from "./lib.mjs";\n'),
             "lib.mjs": "export const alpha = 1;\n"}
    spec = build(tmp_path, files)
    src = jsscan.scan(spec.src / "main.mjs")
    assert src.code.count("\n") == (spec.src / "main.mjs").read_text().count("\n")
    assert [i.line for i in jsscan.imports_of(src)] == [7]
    # and the key inside the template is reported on ITS line, not the template's last
    uses = jsscan.key_uses(src, {"DEMO"}, {"DEMO.x"})
    assert [(r.key, r.line) for r in uses.definite] == [("DEMO.x", 5)]
