"""The conformance scorer: scaffolds score 100 %, a bad module fails the named rules, tiers, C11."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import pytest

from scripts.foundry.blueprint import conformance, new_module

needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")


@pytest.fixture(scope="module")
def scaffolds(tmp_path_factory):
    out = tmp_path_factory.mktemp("scaffolds")
    empty = tmp_path_factory.mktemp("empty")
    made = {}
    for tier in ("small", "full"):
        short = f"conf{tier}"
        rc = new_module.main([short, "--title", f"Pentaryn {tier}", "--tier", tier, "--out", str(out),
                              "--modules-root", str(empty)])
        assert rc == 0
        made[tier] = out / f"pentaryn-{short}"
    return made


def status(report, rid):
    return next(r["status"] for r in report["results"] if r["id"] == rid)


@needs_node
@pytest.mark.parametrize("tier", ["small", "full"])
def test_scaffolds_score_100(scaffolds, tier):
    report = conformance.score_dir(scaffolds[tier])
    assert report["failing"] == []
    assert report["score"] == 100.0
    assert report["warnings"] == []


@needs_node
def test_full_only_rules_are_na_for_small(scaffolds):
    small = conformance.score_dir(scaffolds["small"])
    full = conformance.score_dir(scaffolds["full"])
    for rid in ("C27", "C28", "C29"):
        assert status(small, rid) == "n/a"
    for rid in ("C20", "C27", "C28", "C29"):
        assert status(full, rid) == "pass"
    assert status(small, "C20") == "pass"          # small: glue.test pins hooks.json


@needs_node
def test_c20_small_fails_without_the_hooks_pin(scaffolds, tmp_path):
    d = tmp_path / "pentaryn-confsmall"
    shutil.copytree(scaffolds["small"], d)
    glue = d / "test/glue.test.mjs"
    glue.write_text(glue.read_text().replace('pinJSON("hooks"', 'checkNothing("hooks"'))
    assert status(conformance.score_dir(d), "C20") == "fail"
    (d / "test/golden/hooks.json").unlink()
    r = next(r for r in conformance.score_dir(d)["results"] if r["id"] == "C20")
    assert r["status"] == "fail" and "no test/golden/hooks.json" in r["detail"]


@needs_node
def test_c40_full_needs_i18n_test_even_without_settings(scaffolds, tmp_path):
    d = tmp_path / "pentaryn-conffull"
    shutil.copytree(scaffolds["full"], d)
    (d / "test/i18n.test.mjs").unlink()
    # strip every settings registration: §5.4 still requires i18n.test for the full tier
    (d / "settings.mjs").write_text((d / "settings.mjs").read_text().replace("defineSettings(", "noSettings("))
    r = next(r for r in conformance.score_dir(d)["results"] if r["id"] == "C40")
    assert r["status"] == "fail" and "i18n.test.mjs" in " ".join(r["detail"])


def write(d: Path, files: dict[str, str]):
    for rel, text in files.items():
        p = d / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")


def test_a_legacy_shaped_module_fails_the_named_rules(tmp_path):
    d = tmp_path / "mods" / "pentaryn-bad"
    write(d, {
        "module.json": json.dumps({"id": "pentaryn-wrong", "esmodules": ["bad.mjs"], "styles": ["bad.css"],
                                   "relationships": {"recommends": [{"id": "lib-wrapper", "type": "module"}]}}),
        "bad.mjs": 'import * as helpers from "./helpers.mjs";\nconst MOD = "pentaryn-bad";\n'
                   'Hooks.once("ready", () => {\n  const api = { open() {}, describe: () => 1 };\n'
                   '  game.pentaryn = { ...game.pentaryn, bad: api };\n});\n',
        "helpers.mjs": 'Hooks.on("updateActor", () => {});\n'
                       'export function f() { try { game.settings.get("pentaryn-ties", "x"); } catch {} '
                       'console.warn("no prefix"); }\n',
        "orphan.mjs": "export const x = 1;\n",
        "bad.css": ".global-thing { color: red !important; }\n",
        "DESIGN.md": "# design\n",
    })
    report = conformance.score_dir(d)
    failing = set(report["failing"])
    for rid in ("C01", "C05", "C07", "C09", "C11", "C12", "C13", "C14", "C15", "C17", "C21", "C23",
                "C24", "C25", "C37", "C39", "C44", "C45", "C48"):
        assert rid in failing, rid
    assert "C37w" in report["warnings"]
    assert report["score"] < 50


C11_CASES = [
    ("export const a = gui.x;", True),
    ("export const a = foundry.utils.deepClone({});", True),
    ("export const a = this.game.x;", True),
    ('export const a = "game.settings";  // game.x in a comment', True),
    ("export const a = mygame.x;", True),
    ("export const a = game.user;", False),
    ("export const a = canvas.scene;", False),
    ("export const a = foundry.canvas.Token;", False),
    ("export const a = Hooks.on;", False),
    ("export const a = CONFIG.DND5E;", False),
]


@pytest.mark.parametrize("code,clean", C11_CASES)
def test_c11_lookbehind(tmp_path, code, clean):
    d = tmp_path / "pentaryn-pure"
    write(d, {"module.json": json.dumps({"id": "pentaryn-pure", "esmodules": ["pure.mjs"]}),
              "pure.mjs": 'import { a } from "./pure-core.mjs";\nexport const b = a;\n',
              "pure-core.mjs": code + "\n"})
    report = conformance.score_dir(d)
    assert (status(report, "C11") == "pass") is clean, report["results"][10]


def test_markdown_report_has_a_row_per_module(tmp_path):
    d = tmp_path / "pentaryn-one"
    write(d, {"module.json": json.dumps({"id": "pentaryn-one", "esmodules": ["one.mjs"]}), "one.mjs": "export {};\n"})
    md = conformance.to_markdown([conformance.score_dir(d)], title="T")
    assert "| `pentaryn-one` |" in md and "## Top failing rules" in md


def _tiny(tmp_path, name="pentaryn-one", files=None):
    d = tmp_path / name
    write(d, {"module.json": json.dumps({"id": name, "esmodules": ["one.mjs"]}), "one.mjs": "export {};\n",
              **(files or {})})
    return d


def test_cli_exit_codes(tmp_path, capsys):
    bad = _tiny(tmp_path)
    assert conformance.main(["--module", str(bad)]) == 1            # fail-class rules fail → 1
    assert conformance.main(["--module", str(bad), "--json"]) == 1   # output mode does not change it
    assert conformance.main(["--module", "nope", "--root", str(tmp_path)]) == 2
    capsys.readouterr()


@needs_node
def test_cli_exit_zero_for_a_clean_scaffold(scaffolds, capsys):
    assert conformance.main(["--module", str(scaffolds["full"])]) == 0
    capsys.readouterr()


def test_a_crashed_fail_class_rule_fails(tmp_path, monkeypatch):
    def boom(m):
        raise RuntimeError("scanner bug")
    monkeypatch.setitem(conformance._FUNCS, "C01", boom)        # fail class
    monkeypatch.setitem(conformance._FUNCS, "C10", boom)        # warn class
    report = conformance.score_dir(_tiny(tmp_path))
    assert status(report, "C01") == "fail" and "C01" in report["failing"]
    c01 = next(r for r in report["results"] if r["id"] == "C01")
    assert c01["detail"][0].startswith("rule crashed")
    assert status(report, "C10") == "manual" and "C10" in report["manual"]


def test_c19_reads_hooks_table_names(tmp_path):
    core = ('export const MODULE = "pentaryn-one";\n'
            'export const HOOKS = Object.freeze({\n'
            '  usage: { name: "pentarynCombat.usage", pre: false, args: "()" },\n'
            '  turn: { name: "pentaryn-one.turn", legacyName: "pentarynOne.turn", until: "pentaryn-one 0.8" },\n'
            '});\n')
    d = _tiny(tmp_path, files={"one-core.mjs": core, "one.mjs": 'import { HOOKS } from "./one-core.mjs";\nexport {};\n'})
    report = conformance.score_dir(d)
    assert status(report, "C19") == "fail"
    detail = " ".join(next(r for r in report["results"] if r["id"] == "C19")["detail"])
    assert "pentarynCombat.usage" in detail and "pentaryn-one.turn" not in detail and "pentarynOne.turn" not in detail
    write(d, {"one-core.mjs": core.replace('"pentarynCombat.usage"', '"pentaryn-one.usage"')})
    assert status(conformance.score_dir(d), "C19") == "pass"


def test_c39_is_na_outside_foundry_module_but_still_needs_run_mjs(tmp_path):
    d = _tiny(tmp_path)
    assert status(conformance.score_dir(d), "C39") == "fail"           # no test/run.mjs
    write(d, {"test/run.mjs": "// gate\n"})
    assert status(conformance.score_dir(d), "C39") == "n/a"


def test_warn_manual_rules_land_in_both_lists(tmp_path):
    d = _tiny(tmp_path, files={"one.mjs": 'Hooks.on("refreshToken", () => { for (const a of game.actors) a; });\n'})
    report = conformance.score_dir(d)
    assert status(report, "C49") == "warn"
    assert "C49" in report["warnings"] and "C49" in report["manual"]


def test_packages_json_aliases_cover_the_adjustments_registry():
    from scripts.foundry.update import adjustments as adj
    registry = adj.load(adj.REGISTRY_PATH)
    pk = conformance.PACKAGES["packages"]
    for pkg, terms in registry.aliases.items():
        assert pkg in pk, pkg
        assert set(terms) <= set(pk[pkg]["aliases"]), (pkg, set(terms) - set(pk[pkg]["aliases"]))


def test_registry_aliases_are_merged_at_run_time(tmp_path):
    d = _tiny(tmp_path, files={"one.mjs": "export const piles = globalThis.itempiles;\n"})
    report = conformance.score_dir(d)
    c09 = " ".join(next(r for r in report["results"] if r["id"] == "C09")["detail"])
    assert "item-piles" in c09


def test_wait_modules_are_reported(tmp_path, monkeypatch, capsys):
    monkeypatch.setitem(conformance.WAIT, "pentaryn-one", "live test running")
    d = _tiny(tmp_path)
    report = conformance.score_dir(d)
    assert report["wait"] == "live test running"
    assert "**WAIT**" in conformance.to_markdown([report], title="T")
    conformance.main(["--module", str(d)])
    assert "WAIT" in capsys.readouterr().out
    # the live list lives in wait.json (emptied 2026-10-11, D9); the scorer just loads it
    monkeypatch.undo()
    assert isinstance(conformance.WAIT, dict)


def test_package_hits_scans_once_per_module_py_blueprint_perf_2(tmp_path, monkeypatch):
    """C09 and C47 share one package scan; the alias table is built once, not once per file."""
    d = _tiny(tmp_path, files={"one.mjs": "export const piles = globalThis.itempiles;\n",
                               "two.mjs": "export {};\n", "three.mjs": "export {};\n"})
    calls = {"aliases": 0, "strip": 0}
    real_aliases, real_strip = conformance.package_aliases, conformance.adj.strip_comments

    def aliases(*a, **k):
        calls["aliases"] += 1
        return real_aliases(*a, **k)

    def strip(*a, **k):
        calls["strip"] += 1
        return real_strip(*a, **k)

    monkeypatch.setattr(conformance, "package_aliases", aliases)
    monkeypatch.setattr(conformance.adj, "strip_comments", strip)
    m = conformance.load_module(d, installed=False, registry=None, registry_root=tmp_path)
    first = conformance.package_hits(m)
    assert conformance.package_hits(m) is first
    assert "item-piles" in first
    assert calls == {"aliases": 1, "strip": 3}, calls
    # include_lib=False is its own scan, still cached
    conformance.package_hits(m, include_lib=False)
    conformance.package_hits(m, include_lib=False)
    assert calls == {"aliases": 2, "strip": 6}, calls


def test_module_scans_are_memoised_per_module_py_blueprint_perf_3(tmp_path, monkeypatch):
    """imports, reexports, feature_files, listeners and tier are computed once per Module, not
    once per rule that asks (a Module does not change after load_module)."""
    d = _tiny(tmp_path, files={
        "one.mjs": 'import * as two from "./two.mjs";\nexport * from "./three.mjs";\n'
                   'Hooks.on("ready", () => two.install());\n',
        "two.mjs": "export function install() {}\nexport function uninstall() {}\n",
        "three.mjs": "export const x = 1;\n"})
    calls = {"imports_of": 0, "read_lock": 0}
    real = {"imports_of": conformance.jsscan.imports_of, "read_lock": conformance.vendor.read_lock}

    def counted(name):
        def f(*a, **k):
            calls[name] += 1
            return real[name](*a, **k)
        return f

    monkeypatch.setattr(conformance.jsscan, "imports_of", counted("imports_of"))
    monkeypatch.setattr(conformance.vendor, "read_lock", counted("read_lock"))
    m = conformance.load_module(d, installed=False, registry=None, registry_root=tmp_path)
    imps = m.imports("one.mjs")
    assert [t for t, _ in imps] == ["two.mjs"]
    assert m.imports("one.mjs") is imps
    rex = m.reexports("one.mjs")
    assert rex == ["three.mjs"] and m.reexports("one.mjs") is rex
    feats = conformance.feature_files(m)
    assert feats == {"two.mjs"} and conformance.feature_files(m) is feats
    ls = conformance.listeners(m)
    assert [x.name for x in ls] == ["ready"] and conformance.listeners(m) is ls
    assert m.tier == "full" and m.tier == "full"
    assert calls == {"imports_of": 1, "read_lock": 1}, calls
    conformance.score(m)                       # every rule asks again: nothing is rescanned
    locks = calls["read_lock"]                 # C14's vendor.check reads the lock itself
    assert m.tier == "full" and calls["read_lock"] == locks, calls
    assert calls["imports_of"] <= len(m.files), calls    # once per file at most, however many rules ask
    assert conformance.feature_files(m) is feats and conformance.listeners(m) is ls


# ── gap-fill: lock tier fallback and scorer fixes R2–R9 ──────────────────────

def test_tier_falls_back_to_the_lock_before_wave_7(tmp_path):
    d = tmp_path / "pentaryn-tiny"
    write(d, {"module.json": json.dumps({"id": "pentaryn-tiny", "esmodules": ["tiny.mjs"]}),
              "tiny.mjs": "export const x = 1;\n"})
    assert conformance.score_dir(d)["tier"] == "full"                 # no flag, no lock
    from scripts.foundry.blueprint import vendor
    vendor.sync(d, tier="small")
    report = conformance.score_dir(d)
    assert report["tier"] == "small"
    for rid in ("C27", "C28", "C29"):
        assert status(report, rid) == "n/a"
    m = json.loads((d / "module.json").read_text())
    m["flags"] = {"pentaryn": {"tier": "full"}}                       # module.json wins once it says
    (d / "module.json").write_text(json.dumps(m))
    assert conformance.score_dir(d)["tier"] == "full"


def test_a_corrupt_lock_scores_as_full_not_a_traceback(tmp_path):
    """py-blueprint-ROB-4: read_lock raises VendorError on a lock that is not JSON; the tier falls back."""
    d = tmp_path / "pentaryn-tiny"
    write(d, {"module.json": json.dumps({"id": "pentaryn-tiny", "esmodules": ["tiny.mjs"]}),
              "tiny.mjs": "export const x = 1;\n", "lib/kit.lock.json": "{not json\n"})
    assert conformance.score_dir(d)["tier"] == "full"


def detail(report, rid):
    return next(r["detail"] for r in report["results"] if r["id"] == rid)


def test_r2_c26_catches_a_named_publish_function(tmp_path):
    d = tmp_path / "pentaryn-late"
    write(d, {"module.json": json.dumps({"id": "pentaryn-late", "esmodules": ["late.mjs"]}),
              "late.mjs": 'function publishAPI() { game.pentaryn = { ...game.pentaryn, late: {} }; }\n'
                          'function install() { globalThis.x = 1; }\n'
                          'Hooks.once("ready", () => { setTimeout(publishAPI, 0); setTimeout(install, 0); });\n'})
    assert status(conformance.score_dir(d), "C26") == "fail"
    (d / "late.mjs").write_text('function wire() { game.pentaryn.late = {}; }\n'
                                'Hooks.once("ready", () => { setTimeout(() => wire(), 0); });\n')
    assert status(conformance.score_dir(d), "C26") == "fail"
    (d / "late.mjs").write_text('function install() { globalThis.x = 1; }\n'
                                'Hooks.once("ready", () => { setTimeout(install, 0); });\n')
    assert status(conformance.score_dir(d), "C26") == "pass"


def test_r3_c07_says_data_migration_only_when_the_code_writes_the_declared_scope(tmp_path):
    flags = {"pentaryn": {"flagScope": "walled", "tier": "full", "namespace": "x", "cssPrefix": "px-", "generation": 14}}
    d = tmp_path / "pentaryn-scoped"
    write(d, {"module.json": json.dumps({"id": "pentaryn-scoped", "esmodules": ["a.mjs"], "flags": flags}),
              "a.mjs": 'import { SCOPE_X } from "./b.mjs";\nexport const f = w => w.update({ flags: { [SCOPE_X]: { a: 1 } } });\n',
              "b.mjs": 'export const SCOPE_X = "walled";\n'})
    assert "DATA migration" in detail(conformance.score_dir(d), "C07")[0]
    (d / "b.mjs").write_text('export const SCOPE_X = "pentaryn-scoped";\n')
    assert "manifest-only" in detail(conformance.score_dir(d), "C07")[0]


def test_r4_c48_sees_nested_reserved_names(tmp_path):
    d = tmp_path / "pentaryn-nest"
    write(d, {"module.json": json.dumps({"id": "pentaryn-nest", "esmodules": ["n.mjs"]}),
              "n.mjs": 'Hooks.once("ready", () => {\n  const api = { open() {}, study: { inspect: () => 1, list() {} },\n'
                       '    attributes: { show: { describe: () => 2 } } };\n'
                       '  game.pentaryn = { ...game.pentaryn, nest: api };\n});\n'})
    r = detail(conformance.score_dir(d), "C48")
    assert any("`study.inspect`" in x for x in r) and any("`attributes.show.describe`" in x for x in r)
    assert not any("`open`" in x or "study.list" in x for x in r)


def test_r5_c50_allows_ready_role_when_the_publish_is_role_gated(tmp_path):
    d = tmp_path / "pentaryn-gm"
    body = ('import { publishNamespace } from "./lib/publish.mjs";\nconst api = {};\n'
            'Hooks.once("ready", () => {\n  if (!isAnyGM()) return;\n  publishNamespace("gm", api, { moduleId: "pentaryn-gm", when: "ready:gm" });\n});\n')
    write(d, {"module.json": json.dumps({"id": "pentaryn-gm", "esmodules": ["gm.mjs"]}), "gm.mjs": body})
    assert status(conformance.score_dir(d), "C50") == "pass"
    (d / "gm.mjs").write_text(body.replace("  if (!isAnyGM()) return;\n", ""))
    assert status(conformance.score_dir(d), "C50") == "fail"
    (d / "gm.mjs").write_text(body.replace('when: "ready:gm"', 'when: "ready:wasm"').replace("  if (!isAnyGM()) return;\n", ""))
    assert status(conformance.score_dir(d), "C50") == "fail"


def test_r6_c33_lists_private_internals(tmp_path):
    d = tmp_path / "pentaryn-priv"
    write(d, {"module.json": json.dumps({"id": "pentaryn-priv", "esmodules": ["p.mjs"]}),
              "p.mjs": 'export const a = t => t._preview ?? canvas.regions._placementContext;\n'
                       'export const b = app => app.svelte.appShell.$$.ctx;\n'})
    r = next(r for r in conformance.score_dir(d)["results"] if r["id"] == "C33")
    assert r["status"] == "manual"
    text = " ".join(r["detail"])
    assert "_preview" in text and "_placementContext" in text and "ctx" in text


def test_r7_c03_sees_dnd5e_sheet_hooks_and_identified(tmp_path):
    d = tmp_path / "pentaryn-items"
    write(d, {"module.json": json.dumps({"id": "pentaryn-items", "esmodules": ["i.mjs"]}),
              "i.mjs": 'Hooks.on("renderItemSheet5e", app => app);\n'})
    r = detail(conformance.score_dir(d), "C03")
    assert status(conformance.score_dir(d), "C03") == "fail" and "touches dnd5e" in r[0]
    (d / "i.mjs").write_text("export const known = item => item.system.identified;\n")
    assert status(conformance.score_dir(d), "C03") == "fail"
    (d / "i.mjs").write_text('Hooks.on("renderItemSheet", app => app);\n')
    assert status(conformance.score_dir(d), "C03") == "pass"


def test_r8_c29_counts_computed_own_scope_writes_on_tokens(tmp_path):
    d = tmp_path / "pentaryn-corpse"
    write(d, {"module.json": json.dumps({"id": "pentaryn-corpse", "esmodules": ["c.mjs"]}),
              "c.mjs": 'const MODULE = "pentaryn-corpse";\n'
                       'export async function f(tokenDoc) {\n  await tokenDoc.update({ [`flags.${MODULE}.corpse`]: true });\n}\n'})
    assert status(conformance.score_dir(d), "C29") == "fail"
    (d / "c.mjs").write_text('const MODULE = "pentaryn-corpse";\n'
                             'export async function f(region) {\n  await region.update({ [`flags.${MODULE}.img`]: "x" });\n}\n'
                             'export const r = actor => foundry.utils.getProperty(actor, `flags.${MODULE}.slug`);\n')
    assert status(conformance.score_dir(d), "C29") == "n/a"


def test_r9_c18_core_namespace_is_not_a_feature_and_lifecycle_only_is_na(tmp_path):
    d = tmp_path / "pentaryn-imp"
    write(d, {"module.json": json.dumps({"id": "pentaryn-imp", "esmodules": ["imp.mjs"]}),
              "imp.mjs": 'import * as core from "./imp-core.mjs";\nHooks.once("ready", () => core.go());\n',
              "imp-core.mjs": "export const go = () => 1;\n"})
    assert status(conformance.score_dir(d), "C18") == "n/a"
    (d / "imp.mjs").write_text('import * as core from "./imp-core.mjs";\nHooks.once("ready", () => core.go());\n'
                               'Hooks.on("updateActor", () => 1);\n')
    r = next(r for r in conformance.score_dir(d)["results"] if r["id"] == "C18")
    assert r["status"] == "fail" and "updateActor" in r["detail"][0]


def test_c30_accepts_relayed(tmp_path):
    d = tmp_path / "pentaryn-relay"
    write(d, {"module.json": json.dumps({"id": "pentaryn-relay", "esmodules": ["r.mjs"]}),
              "r.mjs": 'CONFIG.queries["pentaryn-relay.ensure"] = relayed(d => d);\n'
                       'CONFIG.queries["pentaryn-relay.x"] = d => d;\n'})
    r = detail(conformance.score_dir(d), "C30")
    assert len(r) == 1 and "r.mjs:2" in r[0]


def test_d7_c37_exempts_vendored_lib_css_only(tmp_path):
    css = (Path(conformance.__file__).resolve().parents[3] / "foundry/lib/argon-tooltip.css").read_text()
    d = _tiny(tmp_path, files={"lib/argon-tooltip.css": css, "styles/one.css": ".pentaryn-one .x { color: red; }\n"})
    report = conformance.score_dir(d)
    assert status(report, "C37") == "pass"
    assert "C37w" not in report["warnings"]            # the kit file's two !important are the kit's
    # the module's own stylesheets are still scored, and a nested lib/ folder is not the kit
    write(d, {"styles/two.css": ".ech-tooltip .y { color: red !important; }\n",
              "styles/lib/three.css": ".global { color: blue; }\n"})
    report = conformance.score_dir(d)
    assert status(report, "C37") == "fail"
    assert "C37w" in report["warnings"]
    detail = next(r for r in report["results"] if r["id"] == "C37")["detail"]
    assert any("styles/two.css" in x for x in detail) and any("styles/lib/three.css" in x for x in detail)
    assert not any(x.startswith("lib/") for x in detail)


def test_r1_c32_patch_rows_take_the_module_prefix_non_patch_rows_the_package_prefix(tmp_path):
    """D2: `<short>-…` ⇔ a row wrapMethod names; a non-patch row keeps its package's prefix."""
    d = tmp_path / "mods" / "pentaryn-rone"
    reg = tmp_path / "reg" / "adjustments.yml"
    # markers are code identifiers (a marker only inside a string or comment counts as comment-only)
    ident = lambda rid: rid.replace("-", "_")
    row = lambda rid, pkg="core": (f"  - id: {rid}\n    packages: [{pkg}]\n    modules: [pentaryn-rone]\n"
                                    f"    files: [foundry/module/pentaryn-rone/r.mjs]\n    markers: [\"{ident(rid)}\"]\n"
                                    f"    what: x\n")
    code = ('import { wrapMethod } from "./lib/patch.mjs";\n'
            'export function rone_wrap() { wrapMethod("pentaryn-rone", { adjustments: "rone-wrap" }); }\n'
            'export function core_workaround() {}\n')
    write(d, {"module.json": json.dumps({"id": "pentaryn-rone", "esmodules": ["r.mjs"]}), "r.mjs": code})
    write(reg.parent, {"adjustments.yml": "adjustments:\n" + row("rone-wrap") + row("core-workaround")})
    c32 = lambda: next(r for r in conformance.score_dir(d, registry_path=reg)["results"] if r["id"] == "C32")
    assert c32()["status"] == "pass", c32()["detail"]

    # a module-prefixed row nobody wraps: fails, and the message says what to do
    write(reg.parent, {"adjustments.yml": "adjustments:\n" + row("rone-wrap") + row("rone-workaround")})
    write(d, {"r.mjs": code.replace("core_workaround", "rone_workaround")})
    r = c32()
    assert r["status"] == "fail"
    assert any("row rone-workaround has no wrapMethod patch naming it" in x and "D2" in x for x in r["detail"])

    # a patch that names a package-prefixed row: fails the other half of the convention
    write(reg.parent, {"adjustments.yml": "adjustments:\n" + row("core-wrap")})
    write(d, {"r.mjs": code.replace("rone-wrap", "core-wrap").replace("rone_wrap", "core_wrap")})
    r = c32()
    assert r["status"] == "fail"
    assert any("wrapMethod names row 'core-wrap'" in x and "rone-" in x for x in r["detail"])


def test_r7_d4_c03_counts_dnd5e_ignore_tokens(tmp_path):
    """D4: movement keeps its dnd5e relationship; `ignoreTokens` is dnd5e's Token5e movement option."""
    d = tmp_path / "pentaryn-moves"
    write(d, {"module.json": json.dumps({"id": "pentaryn-moves", "esmodules": ["m.mjs"],
                                         "relationships": {"systems": [{"id": "dnd5e", "type": "system"}]}}),
              "m.mjs": "export const ghost = o => Object.assign(o, { ignoreWalls: true, ignoreTokens: true });\n"})
    assert status(conformance.score_dir(d), "C03") == "pass"
    (d / "m.mjs").write_text("export const ghost = o => Object.assign(o, { ignoreWalls: true });\n")
    assert status(conformance.score_dir(d), "C03") == "fail"


# ── §5.9 async and concurrency rules (C53–C61) ───────────────────────────────

def one(tmp_path, code: str, *, mid: str = "pentaryn-async", extra: dict | None = None, socket=None):
    d = tmp_path / mid
    man = {"id": mid, "esmodules": ["a.mjs"]}
    if socket is not None:
        man["socket"] = socket
    write(d, {"module.json": json.dumps(man), "a.mjs": code, **(extra or {})})
    return conformance.score_dir(d)


def res(report, rid):
    return next(r for r in report["results"] if r["id"] == rid)


C53_CASES = [
    ('reg.on("preUpdateActor", async (a) => { return false; });', "fail"),
    ('Hooks.on("dnd5e.preUseActivity", async function (x) {});', "fail"),
    ('reg.on("preCreateToken", check);\nasync function check(t) { return false; }', "fail"),
    ('reg.on("preCreateToken", check);\nconst check = async (t) => false;', "fail"),
    ('reg.on("preUpdateActor", (a) => { if (x) return false; });', "pass"),
    ('reg.on("updateActor", async (a) => { await a.x(); });', "pass"),          # not vetoable
    ('reg.on("preUpdateActor", elsewhere);', "pass"),                            # unresolved: noted only
    ('myHooks.on("preUpdateActor", async () => {});', "pass"),                  # lookbehind
    ('reg.on("preUpdateActor", reg.guardSwallowAsync("x", async (a) => { return false; }), { guard: false });',
     "fail"),                                                                    # through the kit's wrapper
    ('reg.on("preUpdateActor", reg.guard("x", (a) => false));', "pass"),
]


@pytest.mark.parametrize("code,want", C53_CASES)
def test_c53_async_listener_on_a_vetoable_hook(tmp_path, code, want):
    assert res(one(tmp_path, code), "C53")["status"] == want


def test_c54_pre_doc_gated_on_the_active_gm_warns_any_gm_does_not(tmp_path):
    r = res(one(tmp_path, 'reg.on("preUpdateActor", (a) => { if (!isActiveGM()) return; });\n'
                          'reg.on("preCreateItem", (i) => { if (!game.user.isGM) return; });\n'), "C54")
    assert r["status"] == "warn" and len(r["detail"]) == 1 and "a.mjs:1" in r["detail"][0]
    report = one(tmp_path / "b", 'reg.on("preUpdateActor", (a) => { if (!isActiveGM()) return; });')
    assert "C54" in report["warnings"] and "C54" in report["manual"]


C55_CASES = [
    ('await gm.query("x.y", {});', "fail"),
    ('await game.users.activeGM.query("x.y", {});', "fail"),
    ('await game.users.get(id).query("x.y", {});', "fail"),
    ('await User.queryMany(users, "x.y", {});', "fail"),
    ('await gm.query("x.y", {}, { timeout: 8000 });', "pass"),
    ('await User.queryMany(users, "x.y", {}, { timeout: 5000 });', "pass"),
    ('await queryGM("x.y", {});', "pass"),                                       # kit default
    ('await db.query("select 1");', "pass"),                                     # not a User
    ('await thing.query("x");', "manual"),                                       # unknown receiver
]


@pytest.mark.parametrize("code,want", C55_CASES)
def test_c55_every_query_passes_a_timeout(tmp_path, code, want):
    assert res(one(tmp_path, code), "C55")["status"] == want


# py-blueprint-AC-2: when the last argument is an object literal, the timeout must be in it and
# it must be the options argument (not the data). Arguments split on depth-0 `,` only: the lexer
# injects `;` after every `${…}`, so a two-interpolation template must not shift the arguments.
C55_AC2_CASES = [
    ('await gm.query("x.y", { timeout: 5 });', "fail"),                          # data arg only
    ('await User.queryMany([gm], "x.y", { timeout: 5 });', "fail"),              # data arg only
    ('await gm.query("x.y", { timeout: 5 }, {});', "fail"),                      # options lack it
    ('await gm.query(`${A}.${B}`, {}, { timeout: 8000 });', "pass"),             # 12557b01 broke this
    ('await gm.query(`${A}.${B}`, { a: `${C}${D}` }, { timeout: 8000 });', "pass"),
    ('await User.queryMany(us, `${A}.${B}`, {}, { ...o, timeout: 1 });', "pass"),
    ('await gm.query("x.y", {}, opts);', "fail"),                                # whole-call search
    ('await gm.query("x.y", {}, { ...o, timeout });', "pass"),
]


@pytest.mark.parametrize("code,want", C55_AC2_CASES)
def test_c55_timeout_in_the_options_argument_py_blueprint_ac_2(tmp_path, code, want):
    assert res(one(tmp_path, code), "C55")["status"] == want


C56_CASES = [
    ('CONFIG.queries["m.x"] = guarded(f);', "fail"),
    ('CONFIG.queries[`${MODULE}.x`] = f;', "fail"),
    ('CONFIG.queries.x = f;', "fail"),
    ('CONFIG.queries ??= {};', "fail"),
    ('Object.assign(CONFIG.queries, { x: f });', "fail"),
    ('const h = CONFIG.queries[name];', "pass"),
    ('CONFIG.queries[name](data);', "pass"),
    ('if (CONFIG.queries[name] === f) {}', "pass"),
    ('const ok = typeof CONFIG.queries?.["a.b"] === "function";', "pass"),
]


@pytest.mark.parametrize("code,want", C56_CASES)
def test_c56_config_queries_only_through_the_kit(tmp_path, code, want):
    assert res(one(tmp_path, code), "C56")["status"] == want


C57_CASES = [
    ('game.socket.on("module.pentaryn-async", f);', "pass"),
    ('const CHANNEL = `module.${MODULE}`;\ngame.socket.emit(CHANNEL, {});', "pass"),
    ('game.socket.emit("module.pentaryn-other", {});', "fail"),
    ('const CH = "module.pentaryn-asyn";\ngame.socket.on(CH, f);', "fail"),
    ('game.socket.on("userActivity", f);', "n/a"),                               # core event: C47
]


@pytest.mark.parametrize("code,want", C57_CASES)
def test_c57_module_socket_channel_is_the_module_id(tmp_path, code, want):
    assert res(one(tmp_path, code, socket=True), "C57")["status"] == want


C57_IMPORTED = 'export const CHANNEL = "module.pentaryn-other";\n'
C57_IMPORT_CASES = [
    # py-blueprint-EXT-1: a channel constant imported from another module file resolves through the import
    ('import { CHANNEL } from "./c.mjs";\ngame.socket.emit(CHANNEL, {});',
     {"c.mjs": C57_IMPORTED}, "fail"),
    ('import { CHANNEL } from "./c.mjs";\ngame.socket.emit(CHANNEL, {});',
     {"c.mjs": 'export const CHANNEL = `module.${MODULE}`;\n'}, "pass"),
    ('import { CHANNEL as CH } from "./c.mjs";\ngame.socket.on(CH, f);',                 # alias-aware
     {"c.mjs": C57_IMPORTED}, "fail"),
    ('import { CH as CHANNEL } from "./c.mjs";\ngame.socket.on(CHANNEL, f);',
     {"c.mjs": 'export const CH = "module.pentaryn-async";\n', "b.mjs": C57_IMPORTED}, "pass"),
    ('import { CHANNEL as X } from "./c.mjs";\ngame.socket.on(CHANNEL, f);',              # not a local name
     {"c.mjs": C57_IMPORTED}, "n/a"),
    ('import { CHANNEL } from "./c.mjs";\ngame.socket.emit(CHANNEL, {});',                # never a bare-name search
     {"b.mjs": C57_IMPORTED, "c.mjs": 'export const CHANNEL = "module.pentaryn-async";\n'}, "pass"),
    ('game.socket.emit(CHANNEL, {});', {"b.mjs": C57_IMPORTED}, "n/a"),
    ('import { CHANNEL } from "./c.mjs";\nfunction send(CHANNEL) { game.socket.emit(CHANNEL, {}); }',
     {"c.mjs": C57_IMPORTED}, "n/a"),                                                   # shadowing parameter
    ('import { CHANNEL } from "./c.mjs";\nconst send = (x, CHANNEL) => game.socket.emit(CHANNEL, x);',
     {"c.mjs": C57_IMPORTED}, "n/a"),
    ('import { CHANNEL } from "./c.mjs";\nconst send = CHANNEL => game.socket.emit(CHANNEL, {});',
     {"c.mjs": C57_IMPORTED}, "n/a"),
    ('const { CHANNEL } = cfg;\ngame.socket.emit(CHANNEL, {});', {"c.mjs": C57_IMPORTED}, "n/a"),
    ('import { CHANNEL } from "./c.mjs";\ngame.socket.emit(CHANNEL, {});',                # not module scope
     {"c.mjs": 'function f() { const CHANNEL = "module.pentaryn-other"; }\n'}, "n/a"),
]


@pytest.mark.parametrize("code,extra,want", C57_IMPORT_CASES)
def test_c57_resolves_an_imported_channel_constant_py_blueprint_ext_1(tmp_path, code, extra, want):
    assert res(one(tmp_path, code, socket=True, extra=extra), "C57")["status"] == want


C58_CASES = [
    ('const a = serialStore(MODULE, "ledger");', "pass"),
    ('const a = serialStore(MODULE, ["a", "b"]);\nconst b = serialStore(MODULE, "c");', "pass"),
    ('const a = serialStore(MODULE, "ledger");\nconst b = serialStore(MODULE, "ledger");', "fail"),
    ('const a = serialStore(MODULE, ["b", "a"]);\nconst b = serialStore(MODULE, ["a", "b"]);', "fail"),
    ('const a = serialStore(MODULE, ["a", "b"]);\nconst b = serialStore(MODULE, "a");', "fail"),
    ('const a = serialStore(MODULE, key);', "pass"),                             # non-literal: noted
    ('const a = serialStore("pentaryn-async", "ledger");', "pass"),               # literal module id
    ('const a = serialStore("pentaryn-async", "ledger");\nconst b = serialStore("pentaryn-async", "ledger");', "fail"),
]


@pytest.mark.parametrize("code,want", C58_CASES)
def test_c58_one_serial_store_per_key(tmp_path, code, want):
    assert res(one(tmp_path, code), "C58")["status"] == want


C58_SCOPE_CASES = [                                                              # py-blueprint-AC-8
    ('export function store() { return serialStore(MODULE, "ledger"); }', "fail"),
    ('function f() { const s = serialStore(MODULE, "ledger"); }', "fail"),
    ('let s;\nexport function store() { s ??= serialStore(MODULE, "ledger"); return s; }', "pass"),
    ('const stores = {};\nexport function store() { return (stores.ledger ??= serialStore(MODULE, "ledger")); }',
     "pass"),
    ('export const store = () => (stores.k ??= serialStore(MODULE, "k"));', "pass"),
    ('const a = serialStore(MODULE, "ledger");', "pass"),
]


@pytest.mark.parametrize("code,want", C58_SCOPE_CASES)
def test_c58_serial_store_at_module_scope_py_blueprint_ac_8(tmp_path, code, want):
    r = res(one(tmp_path, code), "C58")
    assert r["status"] == want
    if want == "fail":
        assert any("serialStore not at module scope (use `x ??= serialStore(` or hoist)" in d
                   for d in r["detail"]), r["detail"]


def test_c58_counts_keys_across_files(tmp_path):
    report = one(tmp_path, 'import "./b.mjs";\nconst a = serialStore(MODULE, "ledger");',
                 extra={"b.mjs": 'const b = serialStore(MODULE, "ledger");\n'})
    assert res(report, "C58")["status"] == "fail"


C59_CASES = [
    ("for (const t of tokens) await t.update({ hidden: true });", "warn"),       # no braces
    ("for (const t of tokens) { await t.update({ hidden: true }); }", "warn"),
    ("for (const a of game.actors.filter(x => x.isOwner)) { await a.setFlag(M, 'k', 1); }", "warn"),
    ("for (const id of ids) { await game.actors.get(id).update({}); }", "warn"),
    ("while (q.length) { await q.pop().delete(); }", "warn"),
    ("items.forEach(async (i) => { await i.update({}); });", "warn"),
    ("for (const t of tokens) { u.push({ _id: t.id }); }\nawait scene.updateEmbeddedDocuments('Token', u);", "pass"),
    ("for (const t of tokens) { if (!(await claimDocument(t, 'k'))) continue; }", "pass"),
    ("for (const t of tokens) { await sleep(1); }", "pass"),
    ("for (const scene of game.scenes) { await scene.updateEmbeddedDocuments('Token', u); }", "pass"),
    ("for (const s of scenes) { await s.deleteEmbeddedDocuments('Wall', ids); }", "pass"),
    # ac-5/C59: one level of same-file indirection — the loop awaits a local helper that awaits a write
    ("async function dropFlags(actor, keys) { await actor.unsetFlag(M, keys[0]); }\n"
     "for (const a of actors) { await dropFlags(a, keys); }", "warn"),
    ("const dropFlags = async (actor, keys) => { await actor.update({ [`flags.-=${M}`]: null }); };\n"
     "for (const a of actors) await dropFlags(a, keys);", "warn"),
    ("async function dropFlags(actor, keys) { u.push({ _id: actor.id }); }\n"
     "for (const a of actors) { await dropFlags(a, keys); }", "pass"),           # helper writes nothing
    ("async function dropFlags(actor, keys) { await actor.unsetFlag(M, keys[0]); }\n"
     "for (const a of actors) { await other.dropFlags(a, keys); }", "pass"),     # a method, not the local
]


@pytest.mark.parametrize("code,want", C59_CASES)
def test_c59_per_document_await_in_a_loop(tmp_path, code, want):
    assert res(one(tmp_path, code), "C59")["status"] == ("warn" if want == "warn" else "pass")


C59_LOOP_FORMS_CASES = [                                                         # py-blueprint-AC-5
    ("for await (const t of stream) { await t.update({ hidden: true }); }", "warn"),
    ("for await (const t of stream) await t.delete();", "warn"),
    ("do { await q.pop().delete(); } while (q.length);", "warn"),
    ("do\n{\n  await a.setFlag(M, 'k', 1);\n} while (next());", "warn"),
    ("for await (const t of stream) { u.push({ _id: t.id }); }", "pass"),
    ("do { u.push(q.pop()); } while (q.length);\nawait scene.updateEmbeddedDocuments('Token', u);", "pass"),
    ("const todo = 1; await t.update({});", "pass"),                             # `do` inside a name
]


@pytest.mark.parametrize("code,want", C59_LOOP_FORMS_CASES)
def test_c59_sees_for_await_and_do_while_py_blueprint_ac_5(tmp_path, code, want):
    assert res(one(tmp_path, code), "C59")["status"] == want


C60_CASES = [
    ('reg.on("refreshToken", async (t) => { await paint(t); });', "warn"),
    ('reg.on("refreshToken", (t) => { void (async () => { await paint(t); })(); });', "warn"),
    ('reg.on("canvasPan", onPan);\nasync function onPan() {}', "warn"),
    ('reg.on("refreshToken", (t) => { if (cache.has(t.id)) refresh(); });', "pass"),
    ('reg.on("refreshToken", async (t) => { perFrame(() => paint(t)); });', "pass"),
    ('reg.on("updateActor", async (a) => { await a.x(); });', "pass"),          # not hot
]


@pytest.mark.parametrize("code,want", C60_CASES)
def test_c60_no_async_job_per_hot_hook_call(tmp_path, code, want):
    assert res(one(tmp_path, code), "C60")["status"] == want


C60_CALLS_ASYNC_CASES = [                                                        # py-blueprint-AC-7
    ('reg.on("refreshToken", (t) => { void paint(t); });\nasync function paint(t) { await t.x(); }',
     "warn"),
    ('reg.on("refreshToken", (t) => paint(t));\nasync function paint(t) {}', "warn"),
    ('reg.on("refreshToken", onRefresh);\nfunction onRefresh(t) { paint(t); }\nasync function paint(t) {}',
     "warn"),
    ('reg.on("refreshToken", (t) => { perFrame(() => void paint(t)); });\nasync function paint(t) {}',
     "pass"),
    ('reg.on("refreshToken", (t) => { paint(t); });\nfunction paint(t) {}', "pass"),     # sync helper
    ('reg.on("refreshToken", (t) => { obj.paint(t); });\nasync function paint(t) {}', "pass"),  # a method
]


@pytest.mark.parametrize("code,want", C60_CALLS_ASYNC_CASES)
def test_c60_sync_handler_starting_an_async_function_py_blueprint_ac_7(tmp_path, code, want):
    r = res(one(tmp_path, code), "C60")
    assert r["status"] == want
    if want == "warn":
        assert any(d.startswith("a.mjs:1 refreshToken") and d.endswith("starts async paint() per call")
                   for d in r["detail"]), r["detail"]


def test_c60_async_function_in_an_imported_file_py_blueprint_ac_7(tmp_path):
    report = one(tmp_path, 'import { paint } from "./b.mjs";\nreg.on("refreshToken", (t) => { void paint(t); });',
                 extra={"b.mjs": "export async function paint(t) { await t.x(); }\n"})
    r = res(report, "C60")
    assert r["status"] == "warn"
    assert r["detail"] == ["a.mjs:2 refreshToken — starts async paint() per call"]


C61_CASES = [
    ('reg.on("updateActor", (a) => { a.update({ x: 1 }); });', "warn"),
    ('reg.on("createChatMessage", async (m) => { await m.setFlag(M, "k", 1); });', "warn"),
    ('reg.on("updateCombat", (c) => { if (!isAnyGM()) return; c.update({}); });', "warn"),   # any-GM only
    ('reg.on("updateActor", (a) => { if (!isActiveGM()) return; a.update({}); });', "pass"),
    ('reg.on("updateActor", (a, c, o, userId) => { if (userId !== game.user.id) return; a.update({}); });', "pass"),
    ('reg.on("createChatMessage", (m) => { void claimMessage(m, "k").then(() => m.update({})); });', "pass"),
    ('reg.on("updateActor", (a) => { if (!gate()) return; a.update({}); });\n'
     'function gate() { return game.users.activeGM?.isSelf; }', "pass"),                  # gate in a helper
    ('reg.on("deleteActor", (a) => { seen.delete(a.id); });', "pass"),                     # a Map, not a doc
    ('reg.on("updateActor", (a) => { seen.set(a.id, 1); });', "pass"),
    ('reg.on("updateActor", (a) => { void react(a); });\n'
     'async function react(a) { await a.update({ x: 1 }); }', "warn"),                    # write in a helper
    ('reg.on("updateActor", (a) => { if (!isActiveGM()) return; void react(a); });\n'
     'async function react(a) { await a.update({ x: 1 }); }', "pass"),
    ('reg.on("updateActor", (a) => { void note(a); });\n'
     'function note(a) { seen.set(a.id, 1); }', "pass"),                                  # helper writes nothing
    ('reg.on("updateActor", reg.guard("x", (a) => { a.update({}); }));', "warn"),          # through reg.guard
]


@pytest.mark.parametrize("code,want", C61_CASES)
def test_c61_world_wide_document_reaction_runs_on_one_client(tmp_path, code, want):
    assert res(one(tmp_path, code), "C61")["status"] == want


C61_INITIATOR_FORMS_CASES = [                                                    # py-blueprint-AC-6
    ('reg.on("updateActor", (a, c, o, userId) => { if (userId === game.user.id) a.update({}); });', "pass"),
    ('reg.on("updateActor", (a, c, o, userId) => { if (game.user.id == userId) a.update({}); });', "pass"),
    ('reg.on("updateActor", (a, c, o, userId) => { if (userId !== game.user?.id) return; a.update({}); });',
     "pass"),
    ('reg.on("updateActor", (a, c, o, userId) => { if (game.user?.id === userId) a.update({}); });', "pass"),
    ('reg.on("updateActor", (a, c, o, userId) => { if (game.userId === userId) a.update({}); });', "pass"),
    ('reg.on("updateActor", (a, c, o, userId) => { if (userId === other) a.update({}); });', "warn"),
    ('reg.on("updateActor", (a, c, o, userId) => { if (game.user?.isGM) a.update({}); });', "warn"),
]


@pytest.mark.parametrize("code,want", C61_INITIATOR_FORMS_CASES)
def test_c61_positive_and_optional_chained_initiator_gate_py_blueprint_ac_6(tmp_path, code, want):
    assert res(one(tmp_path, code), "C61")["status"] == want


def test_c61_any_gm_gate_names_why(tmp_path):
    r = res(one(tmp_path, 'reg.on("updateCombat", (c) => { if (!game.user.isGM) return; c.update({}); });'), "C61")
    assert "any-GM gate only" in r["detail"][0]


def test_c61_gate_and_write_in_an_imported_module_file(tmp_path):
    gate = ('import { isRunner } from "./b.mjs";\n'
            'reg.on("deleteActiveEffect", (e) => { if (!isRunner(e.parent)) return; e.parent.update({}); });')
    b = 'export function isRunner(a) { return pickRunner({ activeGMId: null, ownerIds: [] }) === game.user.id; }\n'
    assert res(one(tmp_path / "g", gate, extra={"b.mjs": b}), "C61")["status"] == "pass"
    write_ = ('import { react } from "./b.mjs";\n'
              'reg.on("updateActor", (a) => { void react(a); });')
    b = 'export async function react(a) { await a.update({ x: 1 }); }\n'
    assert res(one(tmp_path / "w", write_, extra={"b.mjs": b}), "C61")["status"] == "warn"


def test_c61_scores_a_handler_imported_from_another_module_file_py_blueprint_ac_4(tmp_path):
    """A named handler imported from a sibling file is resolved there and scored, not skipped."""
    code = 'import { onUpdate } from "./b.mjs";\nreg.on("updateActor", onUpdate);'
    b = "export function onUpdate(a) { a.update({ x: 1 }); }\n"
    r = res(one(tmp_path / "w", code, extra={"b.mjs": b}), "C61")
    assert r["status"] == "warn"
    assert r["detail"] == ["a.mjs:2 updateActor — no gate"]
    b = "export const onUpdate = (a) => { if (!isActiveGM()) return; a.update({ x: 1 }); };\n"
    assert res(one(tmp_path / "g", code, extra={"b.mjs": b}), "C61")["status"] == "pass"
    b = "export function onUpdate(a) { seen.set(a.id, 1); }\n"                       # writes nothing
    assert res(one(tmp_path / "n", code, extra={"b.mjs": b}), "C61")["status"] == "pass"


def test_c61_reports_an_unresolved_named_handler_py_blueprint_ac_4(tmp_path):
    """A handler named from outside the module's own files is listed for review, like C53 does."""
    code = 'import { onUpdate } from "../elsewhere/x.mjs";\nreg.on("updateActor", onUpdate);'
    r = res(one(tmp_path, code), "C61")
    assert r["status"] == "warn"
    assert r["detail"] == ["a.mjs:2 updateActor → onUpdate (not resolved — review by hand)"]


def test_c05_follows_a_barrel_re_export(tmp_path):
    """`export * from` / `export { a } from` reach their file (prompts' geometry-core, ties' core/)."""
    d = tmp_path / "pentaryn-barrel"
    write(d, {"module.json": json.dumps({"id": "pentaryn-barrel", "esmodules": ["main.mjs"]}),
              "main.mjs": 'import { a, b } from "./barrel.mjs";\nexport const c = a + b;\n',
              "barrel.mjs": 'export * from "./core/a.mjs";\nexport { b } from "./core/b.mjs";\n',
              "core/a.mjs": "export const a = 1;\n",
              "core/b.mjs": "export const b = 2;\n"})
    assert status(conformance.score_dir(d), "C05") == "pass"
    (d / "core/c.mjs").write_text("export const c = 3;\n")
    assert status(conformance.score_dir(d), "C05") == "fail"


def test_c50_reads_the_kit_registrar_ready_body(tmp_path):
    """`reg.once("ready", onReady)` is a ready body like `Hooks.once("ready", onReady)`."""
    d = tmp_path / "pentaryn-reg"
    body = ('import { publishNamespace } from "./lib/publish.mjs";\nconst api = {};\n'
            'function onReady() {\n  publishNamespace("reg", api, { moduleId: "pentaryn-reg" });\n}\n'
            'export function install(reg) { reg.once("ready", onReady); }\n')
    write(d, {"module.json": json.dumps({"id": "pentaryn-reg", "esmodules": ["reg.mjs"]}), "reg.mjs": body})
    assert status(conformance.score_dir(d), "C50") == "pass"
    (d / "reg.mjs").write_text(body.replace('{ moduleId: "pentaryn-reg" }', '{ moduleId: "pentaryn-reg", when: "later" }'))
    assert status(conformance.score_dir(d), "C50") == "fail"


def test_c50_follows_a_named_publisher_called_from_another_files_ready_body(tmp_path):
    """dropbin's shape: the entry's `function publish()` is called from a feature's
    `ctx.onReady(() => {…})` — the publish is in the ready tick, so `when` stays "ready"."""
    d = tmp_path / "pentaryn-led"
    entry = ('import { publishNamespace } from "./lib/publish.mjs";\nconst api = {};\n'
             'export function publish() {\n  publishNamespace("led", api, { moduleId: "pentaryn-led" });\n}\n')
    feature = 'export function install(reg, ctx) {\n  ctx.onReady(() => {\n  hook();\n  ctx.publish();\n  }, "x");\n}\n'
    write(d, {"module.json": json.dumps({"id": "pentaryn-led", "esmodules": ["led.mjs"]}),
              "led.mjs": entry, "ledger.mjs": feature})
    assert status(conformance.score_dir(d), "C50") == "pass"
    # an await before the call makes it late: then the publish must record `when`
    (d / "ledger.mjs").write_text(feature.replace("ctx.onReady(() => {", "ctx.onReady(async () => {"))
    assert status(conformance.score_dir(d), "C50") == "fail"
    (d / "ledger.mjs").write_text(feature.replace("  hook();\n", "  await hook();\n"))
    assert status(conformance.score_dir(d), "C50") == "fail"
    # nobody calls it from a ready body: late, unrecorded
    (d / "ledger.mjs").write_text('export function install(reg, ctx) { reg.on("canvasReady", () => ctx.publish()); }\n')
    assert status(conformance.score_dir(d), "C50") == "fail"


# ── C62: a Document param the kit does not resolve names its string forms (FX item 5) ────────
# The bridge (pentaryn-call.ts needsDoc) refuses a call that fills such a param with BAD_ARGS
# "eval-js only" unless its `type` names uuid / id / name / string; senses.inspect's ref
# (resolve:false, no string form) was refused live that way (W3L row 6).

def c62(tmp_path, *params, row_doc="x", name="pentaryn-docref"):
    d = tmp_path / name
    describe = {"module": name, "methods": [{"path": "f", "params": list(params), "doc": row_doc}]}
    write(d, {"module.json": json.dumps({"id": name, "esmodules": ["a.mjs"]}),
              "a.mjs": "export const a = 1;\n",
              "test/golden/describe.json": json.dumps(describe)})
    return res(conformance.score_dir(d), "C62")


C62_CASES = [
    ({"name": "ref", "kind": "actor", "type": "Actor"}, "pass"),                                   # kit resolves it
    ({"name": "ref", "kind": "token", "resolve": False, "type": "Token|Actor"}, "fail"),           # senses.inspect before 43c6e628
    ({"name": "ref", "kind": "token", "resolve": False, "type": "Token|Actor|uuid|id|exact name"}, "pass"),
    ({"name": "owner", "kind": "actor", "type": "Actor", "resolve": False}, "fail"),               # attunement.stash
    ({"name": "owner", "kind": "actor", "type": "Actor"}, "fail"),                                 # not ref: never resolved
    ({"name": "actor", "kind": "actor", "type": "Actor|uuid|id|exact name", "resolve": False}, "pass"),
    ({"name": "u", "kind": "user", "type": "User|string", "resolve": False}, "pass"),
    ({"name": "doc", "kind": "actor", "type": "Actor", "resolve": False, "doc": "a live Actor — eval-js only"}, "pass"),
    ({"name": "doc", "kind": "actor", "type": "Actor", "resolve": False, "doc": "eval-js-only"}, "pass"),
    ({"name": "doc", "type": "JournalEntry", "resolve": False}, "pass"),                           # no kind: out of scope
    ({"name": "query", "type": "string"}, "pass"),
    ({"name": "x", "kind": "identifier", "resolve": False}, "pass"),                               # not a Document kind
    ({"name": "ref", "kind": "actor", "resolve": "self"}, "pass"),                                # kit 1.1.0: names.sync (W2-B4)
    ({"name": "owner", "kind": "actor", "type": "Actor", "resolve": "self"}, "pass"),              # the function resolves strings
]


@pytest.mark.parametrize("param,want", C62_CASES)
def test_c62_document_params_name_their_string_forms(tmp_path, param, want):
    r = c62(tmp_path, param)
    assert r["status"] == want, r


def test_c62_a_non_first_ref_is_never_resolved(tmp_path):
    r = c62(tmp_path, {"name": "opts", "type": "{}"}, {"name": "ref", "kind": "actor", "type": "Actor"})
    assert r["status"] == "fail" and "f(ref)" in r["detail"][0]


@pytest.mark.parametrize("params,why", [
    (({"name": "owner", "kind": "actor", "type": "Actor"},), "a Document kind the kit does not resolve"),
    (({"name": "owner", "kind": "actor", "type": "Actor", "resolve": False},), "resolve:false"),
    (({"name": "opts", "type": "{}"}, {"name": "ref", "kind": "actor", "type": "Actor"}), "a non-first ref"),
])
def test_c62_says_why_the_param_is_unresolved(tmp_path, params, why):
    # py-blueprint-MAINT-9: a Document-kind param not named `ref` is not "not the first ref"
    r = c62(tmp_path, *params)
    assert r["status"] == "fail" and f", {why}, " in r["detail"][0], r
    assert "not the first ref" not in r["detail"][0]


def test_c62_the_row_doc_can_mark_the_whole_row_eval_js_only(tmp_path):
    r = c62(tmp_path, {"name": "owner", "kind": "actor", "type": "Actor", "resolve": False},
            row_doc="Confiscation (eval-js only: live Actors).")
    assert r["status"] == "pass"


def test_c62_is_na_without_a_describe_golden(tmp_path):
    d = tmp_path / "pentaryn-nogold"
    write(d, {"module.json": json.dumps({"id": "pentaryn-nogold", "esmodules": ["a.mjs"]}), "a.mjs": "export const a = 1;\n"})
    assert res(conformance.score_dir(d), "C62")["status"] == "n/a"


def test_c06w_exempts_a_vendored_kit_stylesheet_listed_from_lib(tmp_path):
    d = tmp_path / "pentaryn-kitcss"
    write(d, {"module.json": json.dumps({"id": "pentaryn-kitcss", "esmodules": ["a.mjs"],
                                         "styles": ["styles/a.css", "lib/argon-tooltip.css"]}),
              "a.mjs": "export const a = 1;\n", "styles/a.css": "", "lib/argon-tooltip.css": ""})
    assert res(conformance.score_dir(d), "C06w")["status"] == "pass"
    (d / "module.json").write_text(json.dumps({"id": "pentaryn-kitcss", "esmodules": ["a.mjs"], "styles": ["a.css"]}))
    (d / "a.css").write_text("")
    assert res(conformance.score_dir(d), "C06w")["status"] == "warn"


# ── exceptions.json: the strict gate's explicit list (Stage 5 step 2) ─────────────────────────

def test_exceptions_rows_are_explicit_and_name_real_fail_class_rules():
    fail_class = {rid for rid, cls, _, _ in conformance.RULES if cls == "fail"}
    for module_id, rows in conformance.EXCEPTIONS.items():
        assert (conformance.MODULE_ROOT / module_id / "module.json").exists(), module_id
        assert rows, f"{module_id}: an empty exception block"
        for rid, row in rows.items():
            assert rid in fail_class, f"{module_id} {rid}: not a fail-class rule (warn/manual never gate)"
            assert set(row) == {"reason", "decision", "until", "match"}, f"{module_id} {rid}: {sorted(row)}"
            assert all(isinstance(row[k], str) and len(row[k].strip()) >= 5
                       for k in ("reason", "decision", "until")), (module_id, rid)
            assert row["match"] and all(isinstance(p, str) and re.compile(p) for p in row["match"]), (module_id, rid)


def test_every_exception_pattern_names_a_live_finding():
    """A `match` pattern pins the findings the decision covers; one that matches nothing today is a
    typo or a finding already fixed — either way the row says more than the code does."""
    for module_id, rows in conformance.EXCEPTIONS.items():
        results = {r["id"]: r for r in conformance.score_dir(conformance.MODULE_ROOT / module_id)["results"]}
        for rid, row in rows.items():
            detail = results[rid]["detail"]
            for p in row["match"]:
                assert any(re.search(p, d) for d in detail), f"{module_id} {rid}: {p!r} matches none of {detail}"


def test_verdict_splits_blocking_accepted_and_stale(monkeypatch):
    row = {"reason": "why", "decision": "who", "until": "when"}
    monkeypatch.setattr(conformance, "EXCEPTIONS", {"pentaryn-x": {"C07": row, "C37": row}})
    results = [conformance.Result("C05", "fail", "fail", [], ""), conformance.Result("C07", "fail", "fail", [], ""),
               conformance.Result("C37", "fail", "pass", [], "")]
    v = conformance.verdict("pentaryn-x", results)
    assert v == {"blocking": ["C05"], "accepted": {"C07": "why"}, "unmatched": {}, "stale": ["C37"]}
    assert not conformance.gate_ok(v)
    assert conformance.gate_ok(conformance.verdict("pentaryn-x", results[1:2] + [conformance.Result("C37", "fail", "fail", [], "")]))


def test_a_row_with_match_accepts_only_the_findings_it_names(monkeypatch):
    row = {"reason": "why", "decision": "who", "until": "when", "match": [r"^styles/a\.css: #tooltip$"]}
    monkeypatch.setattr(conformance, "EXCEPTIONS", {"pentaryn-x": {"C37": row}})
    decided = conformance.Result("C37", "fail", "fail", ["styles/a.css: #tooltip"], "")
    v = conformance.verdict("pentaryn-x", [decided])
    assert v["accepted"] == {"C37": "why"} and not v["blocking"] and not v["unmatched"] and conformance.gate_ok(v)
    # a later, unreviewed finding of the same rule blocks, and is named
    later = conformance.Result("C37", "fail", "fail", ["styles/a.css: #tooltip", "styles/a.css: .new"], "")
    v = conformance.verdict("pentaryn-x", [later])
    assert v["blocking"] == ["C37"] and v["unmatched"] == {"C37": ["styles/a.css: .new"]} and not v["accepted"]
    assert not conformance.gate_ok(v)


def test_c15_namespace_import_of_core_mjs_is_a_core_barrel(tmp_path):
    # §9 C15: `import * as` is for features and core barrels; a top-level core.mjs is core (C11, role_of)
    imp = 'import * as core from "./core.mjs";\nexport const y = core.MODULE;\n'
    d = _tiny(tmp_path, files={"one.mjs": imp, "x.mjs": imp, "core.mjs": 'export const MODULE = "pentaryn-one";\n'})
    r = next(r for r in conformance.score_dir(d)["results"] if r["id"] == "C15")
    assert r["status"] == "pass", r["detail"]


def test_published_literal_keys_are_the_top_level_paths(tmp_path):
    d = tmp_path / "pentaryn-one"
    write(d, {"module.json": json.dumps({"id": "pentaryn-one", "esmodules": ["one.mjs"]}),
              "one.mjs": "const api = {\n  describe() {},\n  attributes: { describe: 1, x: { y: 2 } },\n"
                         "  version: 1 };\ngame.pentaryn.one = api;\n"})
    m = conformance.load_module(d, installed=False, registry=None, registry_root=tmp_path)
    assert conformance._published_literal_keys(m) == [
        ("one.mjs", 2, "describe"), ("one.mjs", 3, "attributes"), ("one.mjs", 4, "version")]
    assert [p for _, _, p in conformance._published_literal_paths(m)] == [
        "describe", "attributes", "attributes.describe", "attributes.x", "attributes.x.y", "version"]


def test_reserved_api_mirrors_the_kit():
    # C48's RESERVED_API is a hand copy of the kit's errors.RESERVED; a kit bump that adds a name must fail here.
    text = (conformance.REPO_ROOT / "foundry/lib/errors.mjs").read_text(encoding="utf-8")
    body = re.search(r"export const RESERVED\s*=\s*Object\.freeze\(\[(.*?)\]", text, re.S).group(1)
    assert set(re.findall(r'"([^"]+)"', body)) == set(conformance.RESERVED_API)


def test_py_blueprint_rob_2_a_broken_or_missing_registry_fails_c47_and_c32(tmp_path, capsys):
    """py-blueprint-ROB-2: an adjustments registry that cannot be loaded must FAIL the strict gate
    (C47 fails with the loader's text, C32 appends it), never pass it as "n/a: no registry"."""
    d = _tiny(tmp_path / "mods")
    broken = tmp_path / "reg" / "adjustments.yml"
    write(broken.parent, {"adjustments.yml": "adjustments:\n  - id: Not A Valid Id\n"})
    for reg in (broken, tmp_path / "missing" / "adjustments.yml"):
        report = conformance.score_dir(d, registry_path=reg)
        r47 = next(r for r in report["results"] if r["id"] == "C47")
        r32 = next(r for r in report["results"] if r["id"] == "C32")
        assert r47["status"] == "fail", r47
        assert any("adjustments registry cannot be loaded" in x for x in r47["detail"]), r47["detail"]
        assert r32["status"] == "fail", r32
        assert any("adjustments registry cannot be loaded" in x for x in r32["detail"]), r32["detail"]
        assert "C47" in report["blocking"]

    # --snapshot with no adjustments.yml fails the same way; main says so once on stderr
    snap = tmp_path / "snap"
    shutil.copytree(_tiny(tmp_path / "src", name="pentaryn-two"), snap / "module" / "pentaryn-two")
    shutil.copytree(_tiny(tmp_path / "src", name="pentaryn-three"), snap / "module" / "pentaryn-three")
    capsys.readouterr()
    assert conformance.main(["--snapshot", str(snap), "--json"]) == 1
    out = capsys.readouterr()
    for rep in json.loads(out.out):
        assert next(r for r in rep["results"] if r["id"] == "C47")["status"] == "fail"
    assert out.err.count("adjustments registry cannot be loaded") == 1, out.err


def test_py_blueprint_perf_1_a_full_run_loads_the_registry_and_manifests_once(tmp_path, monkeypatch, capsys):
    """py-blueprint-perf-1: main() parses adjustments.yml once and each module.json twice at most
    (its own load plus one sibling scan), not N registry parses and N² manifest reads; and the
    reports are byte-identical to scoring each module alone with score_dir's defaults."""
    root = tmp_path / "mods"
    for n in ("one", "two", "three", "four"):
        _tiny(root, name=f"pentaryn-{n}")
    capsys.readouterr()
    conformance.main(["--root", str(root), "--json"])
    before = capsys.readouterr().out
    alone = json.dumps([conformance.score_dir(p, root=root) for p in sorted(root.iterdir())], indent=2)
    assert before == alone + "\n"

    loads, reads = [], []
    real_load, real_read = conformance.adj.load, Path.read_text
    monkeypatch.setattr(conformance.adj, "load", lambda *a, **k: (loads.append(a), real_load(*a, **k))[1])
    monkeypatch.setattr(Path, "read_text", lambda self, *a, **k: (reads.append(self.name), real_read(self, *a, **k))[1])
    conformance.main(["--root", str(root), "--json"])
    after = capsys.readouterr().out
    monkeypatch.undo()
    assert after == before
    assert len(loads) == 1, loads
    assert reads.count("module.json") <= 2 * 4, reads.count("module.json")


def test_pyb_e6_strict_gate_matches_the_full_detail_list_and_display_caps_it(tmp_path, monkeypatch):
    # PYB-E6: a rule returns every finding; the gate's `match` runs on all of them, so a synthetic
    # "… N more" line can neither block a row whose real findings all match nor hide findings past
    # a cap. Truncation is display-only (to_markdown, through _capped); --json carries the full list.
    core = "".join(f"export const v{i} = game.x{i};\n" for i in range(20))
    d = _tiny(tmp_path, files={"one-core.mjs": core})
    row = {"reason": "why", "decision": "who", "until": "when", "match": [r"^one-core\.mjs:\d+ game\.x"]}
    monkeypatch.setattr(conformance, "EXCEPTIONS", {"pentaryn-one": {"C11": row}})
    report = conformance.score_dir(d)
    c11 = next(r for r in report["results"] if r["id"] == "C11")
    assert c11["status"] == "fail" and len(c11["detail"]) == 20, c11["detail"]
    assert not any("more" in x for x in c11["detail"])
    assert "C11" not in report["blocking"] and report["accepted"] == {"C11": "why"} and not report["unmatched"]
    c11["detail"] = [f"f{i}" for i in range(20)]     # short findings: the 400-char line cap stays out of it
    md = conformance.to_markdown([report], title="t")
    line = next(ln for ln in md.splitlines() if ln.startswith("- **C11**"))
    assert "… 8 more" in line
    assert conformance._capped(["a", "b", "c"], 2) == ["a", "b", "… 1 more"]
    assert conformance._capped(["a", "b"], 2) == ["a", "b"]


def test_py_blueprint_rob_5_a_malformed_sibling_manifest_is_skipped_and_the_broken_module_fails_fast(tmp_path, capsys):
    """py-blueprint-ROB-5: one sibling module.json that is not JSON must not crash scoring every
    other module — C38 passes and names the folder it could not compare; scoring the broken module
    itself stops with one ✗ line and exit 2, not a traceback."""
    root = tmp_path / "mods"
    one = _tiny(root, files={"module.json": json.dumps({"id": "pentaryn-one", "esmodules": ["one.mjs"],
                                                        "flags": {"pentaryn": {"cssPrefix": "pone-"}}})})
    write(root / "pentaryn-broken", {"module.json": "{not json"})
    write(root / "pentaryn-list", {"module.json": "[]"})
    report = conformance.score_dir(one)
    c38 = next(r for r in report["results"] if r["id"] == "C38")
    assert c38["status"] == "pass", c38
    assert "pentaryn-broken: module.json unreadable — not compared" in c38["detail"], c38["detail"]
    assert "pentaryn-list: module.json unreadable — not compared" in c38["detail"], c38["detail"]

    capsys.readouterr()
    assert conformance.main(["--module", str(one), "--json"]) == 1      # scored; tiny fails other rules
    assert json.loads(capsys.readouterr().out)[0]["module"] == "pentaryn-one"
    for argv in (["--root", str(root)], ["--module", "broken", "--root", str(root)]):
        assert conformance.main(argv) == 2
        err = capsys.readouterr().err
        assert "✗ pentaryn-broken: module.json is not valid JSON: " in err, err


def test_py_blueprint_ac_9_hot_hooks_match_by_prefix_from_packages_json(tmp_path):
    """py-blueprint-AC-9: `refresh*`, `draw*` and `hover*` fire per object per frame, so C49 and C60
    treat every hook with those prefixes as hot (refreshTile, drawTokenLayer, hoverNote…), not only
    the exact names; the prefixes live in packages.json, never in the .py."""
    assert conformance.PACKAGES["hotHookPrefixes"] == ["refresh", "draw", "hover"]
    for name in ("refreshTile", "drawTokenLayer", "hoverNote", "refreshToken", "sightRefresh",
                 "canvasPan", "pointermove"):
        assert conformance.is_hot_hook(name), name
    for name in ("updateActor", "renderChatMessage", "createToken", "preRefresh"):
        assert not conformance.is_hot_hook(name), name

    for hook in ("refreshTile", "drawTokenLayer", "hoverNote"):
        d = _tiny(tmp_path / hook, files={"one.mjs": f'Hooks.on("{hook}", () => {{ for (const a of game.actors) a; }});\n'})
        assert status(conformance.score_dir(d), "C49") == "warn", hook
        report = one(tmp_path / f"{hook}-async", f'reg.on("{hook}", async (t) => {{ await paint(t); }});')
        assert res(report, "C60")["status"] == "warn", hook


def test_py_blueprint_maint_10_c10_api_cap_follows_the_api_role(tmp_path):
    """py-blueprint-MAINT-10: C10 keys the 300-line api cap on the api ROLE (role_of), so a
    `<short>-api.mjs` gets the same cap as `api.mjs` instead of the 500-line default."""
    body = "export const x = 1;\n" * 349                                      # 350 lines
    for name in ("api.mjs", "wid-api.mjs"):
        report = one(tmp_path / name, 'import "./' + name + '";\n', extra={name: body})
        r = res(report, "C10")
        assert r["status"] == "warn", (name, r)
        assert f"{name} 350/300" in r["detail"], r["detail"]
    report = one(tmp_path / "glue", 'import "./wid.mjs";\n', extra={"wid.mjs": body})
    assert res(report, "C10")["status"] == "pass"                            # other files keep 500


def test_pyb_e4_c38_skips_the_module_itself_when_its_folder_name_differs_from_its_id(tmp_path):
    """PYB-E4: sibling manifests are keyed by folder name. A module whose folder is not named after
    its id must not clash with itself; a real clash is named by the sibling's manifest id."""
    root = tmp_path / "mods"
    man = {"id": "pentaryn-one", "esmodules": ["one.mjs"], "flags": {"pentaryn": {"cssPrefix": "pone-"}}}
    one = _tiny(root, name="one-checkout", files={"module.json": json.dumps(man)})
    report = conformance.score_dir(one)
    c38 = next(r for r in report["results"] if r["id"] == "C38")
    assert c38["status"] == "pass", c38

    write(root / "two-checkout", {"module.json": json.dumps({**man, "id": "pentaryn-two"})})
    c38 = next(r for r in conformance.score_dir(one)["results"] if r["id"] == "C38")
    assert c38["status"] == "fail" and c38["detail"] == ["pone- also declared by pentaryn-two"], c38


@pytest.mark.parametrize("code,line", [
    ('Hooks.once("refreshToken", () => { for (const a of game.actors) a; });', 1),
    ('ctx.reg.on("refreshToken", (t) => { for (const a of game.actors) a; });', 1),
    ('reg.on("refreshToken", reg.guard("paint", (t) => { for (const a of game.actors) a; }));', 1),
    ('const paint = (t) => { for (const a of game.actors) a; };\nreg.on("refreshToken", paint);', 2),
    ('reg.on("refreshToken", paint);\nfunction paint(t) { for (const a of game.actors) a; }', 1),
])
def test_py_blueprint_ext_3_c49_sees_every_listener_shape(tmp_path, code, line):
    """py-blueprint-EXT-3: C49 reads the shared listeners() (HOOK_REG + handler_at), so `.once`,
    `ctx.reg`, the kit's guard wrappers and const-arrow named handlers are seen, as C60 sees them."""
    r = res(one(tmp_path, code), "C49")
    assert r["status"] == "warn" and r["detail"] == [f"a.mjs:{line} refreshToken ×1 (no // hot: comment)"], r


def test_py_blueprint_ext_3_c49_keeps_the_hot_comment_and_count(tmp_path):
    """py-blueprint-EXT-3: the `// hot:` comment silences the note, ×N counts every world walk,
    and a non-hot hook is never flagged."""
    code = ('// hot: per-frame walk is bounded\n'
            'reg.on("refreshTile", (t) => { game.actors; game.scenes; canvas.tokens.placeables; });\n'
            'reg.on("updateActor", (a) => { for (const x of game.actors) x; });\n')
    r = res(one(tmp_path, code), "C49")
    assert r["status"] == "warn" and r["detail"] == ["a.mjs:2 refreshTile ×3"], r
