"""The conformance scorer: scaffolds score 100 %, a bad module fails the named rules, tiers, C11."""

from __future__ import annotations

import json
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


C58_CASES = [
    ('const a = serialStore(MODULE, "ledger");', "pass"),
    ('const a = serialStore(MODULE, ["a", "b"]);\nconst b = serialStore(MODULE, "c");', "pass"),
    ('const a = serialStore(MODULE, "ledger");\nconst b = serialStore(MODULE, "ledger");', "fail"),
    ('const a = serialStore(MODULE, ["b", "a"]);\nconst b = serialStore(MODULE, ["a", "b"]);', "fail"),
    ('const a = serialStore(MODULE, ["a", "b"]);\nconst b = serialStore(MODULE, "a");', "fail"),
    ('const a = serialStore(MODULE, key);', "pass"),                             # non-literal: noted
]


@pytest.mark.parametrize("code,want", C58_CASES)
def test_c58_one_serial_store_per_key(tmp_path, code, want):
    assert res(one(tmp_path, code), "C58")["status"] == want


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
]


@pytest.mark.parametrize("code,want", C59_CASES)
def test_c59_per_document_await_in_a_loop(tmp_path, code, want):
    assert res(one(tmp_path, code), "C59")["status"] == ("warn" if want == "warn" else "pass")


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
]


@pytest.mark.parametrize("code,want", C61_CASES)
def test_c61_world_wide_document_reaction_runs_on_one_client(tmp_path, code, want):
    assert res(one(tmp_path, code), "C61")["status"] == want


def test_c61_any_gm_gate_names_why(tmp_path):
    r = res(one(tmp_path, 'reg.on("updateCombat", (c) => { if (!game.user.isGM) return; c.update({}); });'), "C61")
    assert "any-GM gate only" in r["detail"][0]
