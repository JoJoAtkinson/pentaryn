"""The generator: green scaffolds in both tiers, and every refusal it promises.

Everything is generated into pytest's tmp_path. Nothing here writes to foundry/module/: the one
test that points --out there asserts the refusal and that nothing appeared.
"""

from __future__ import annotations

import json
import shutil

import pytest

from scripts.foundry.blueprint import conformance, new_module, vendor

needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")


def gen(tmp_path, short="demo", *extra, out=None, modules_root=None):
    out = out or tmp_path / "out"
    out.mkdir(parents=True, exist_ok=True)
    mods = modules_root or tmp_path / "empty-modules"
    mods.mkdir(parents=True, exist_ok=True)
    return new_module.main([short, "--title", "Pentaryn Demo", "--out", str(out),
                            "--modules-root", str(mods), *extra]), out / f"pentaryn-{short}"


@needs_node
@pytest.mark.parametrize("tier", ["small", "full"])
def test_scaffold_is_green_through_every_gate(tmp_path, tier):
    rc, target = gen(tmp_path, "demo", "--tier", tier, "--check")
    assert rc == 0
    assert vendor.check(target) == []
    report = conformance.score_dir(target)
    assert report["failing"] == [], report["failing"]
    assert report["score"] == 100.0
    golden = target / "test" / "golden"
    assert (golden / "hooks.json").exists()
    if tier == "full":
        assert {p.name for p in golden.iterdir()} == {"hooks.json", "describe.json", "surface.json", "queries.json"}
    else:
        assert not (target / "api.mjs").exists() and not (target / "lang").exists()
        assert "languages" not in json.loads((target / "module.json").read_text())


def test_no_placeholder_or_block_marker_survives(tmp_path):
    rc, target = gen(tmp_path, "demo", "--no-run")
    assert rc == 0
    for f in target.rglob("*"):
        if f.is_file() and f.suffix in (".mjs", ".json", ".md", ".css"):
            text = f.read_text(encoding="utf-8")
            assert "__SHORT" not in text and "__Title__" not in text and "__NS__" not in text, f
            assert "@if " not in text and "@endif" not in text, f
    assert (target / "demo.mjs").exists() and (target / "demo-core.mjs").exists()


@needs_node
def test_no_dnd5e_drops_the_system_and_the_dnd5e_code(tmp_path):
    rc, target = gen(tmp_path, "plain", "--no-dnd5e", "--tier", "small", "--check")
    assert rc == 0
    man = json.loads((target / "module.json").read_text())
    assert man["relationships"]["systems"] == []
    assert "hpOf" not in (target / "plain-core.mjs").read_text()


def test_second_call_refuses(tmp_path):
    assert gen(tmp_path, "demo", "--no-run")[0] == 0
    assert gen(tmp_path, "demo", "--no-run")[0] == 2


def test_force_overwrites_template_files_only(tmp_path):
    rc, target = gen(tmp_path, "demo", "--no-run")
    (target / "mine.mjs").write_text("export const mine = 1;\n")
    (target / "demo-core.mjs").write_text("// edited\n")
    assert gen(tmp_path, "demo", "--no-run", "--force")[0] == 0
    assert (target / "mine.mjs").exists()
    assert "export const MODULE" in (target / "demo-core.mjs").read_text()


@needs_node
def test_force_keeps_goldens_lock_and_kit_extras(tmp_path):
    rc, target = gen(tmp_path, "demo", "--tier", "full", "--kit", "election")
    assert rc == 0
    golden = target / "test/golden/describe.json"
    # a hand-edited golden (same value, different bytes) must survive a re-render byte for byte
    edited = json.dumps(json.loads(golden.read_text()), indent=4) + "\n"
    golden.write_text(edited)
    lock_before = (target / "lib/kit.lock.json").read_text()
    assert "election" in json.loads(lock_before)["files"]

    rc, _ = gen(tmp_path, "demo", "--tier", "full", "--force")
    assert rc == 0                                   # the suite ran against the existing goldens
    assert golden.read_text() == edited
    assert (target / "lib/kit.lock.json").read_text() == lock_before
    assert (target / "lib/election.mjs").exists()
    assert vendor.check(target) == []

    # a real golden change is NOT papered over by --force: the run fails instead of rewriting it
    data = json.loads(golden.read_text())
    data["methods"][0]["doc"] = "changed by hand"
    golden.write_text(json.dumps(data))
    assert gen(tmp_path, "demo", "--tier", "full", "--force")[0] == 1
    assert json.loads(golden.read_text())["methods"][0]["doc"] == "changed by hand"


@pytest.mark.parametrize("short", ["rules", "core", "api", "settings", "Demo", "d", "x" * 17, "9lives", "my-mod"])
def test_bad_or_reserved_short_names_are_refused(tmp_path, short):
    rc, target = gen(tmp_path, short, "--no-run")
    assert rc == 2
    assert not target.exists()


@pytest.mark.parametrize("kit", [["--kit", "nosuchfile"], ["--kit", "argon-kit"]])
def test_a_refused_kit_leaves_nothing_behind(tmp_path, kit):
    # docstring promise: "2 refused (nothing written)" — a vendoring refusal must not leave the
    # rendered folder behind, or the plain rerun is refused with "… exists"
    rc, target = gen(tmp_path, "demo", "--no-run", *kit)
    assert rc == 2
    assert not target.exists()
    assert gen(tmp_path, "demo", "--no-run")[0] == 0


def _fake_module(root, name, *, flags=None, source=None, css=None):
    d = root / name
    d.mkdir(parents=True)
    (d / "module.json").write_text(json.dumps({"id": name, "flags": {"pentaryn": flags or {}}}))
    if source:
        (d / "main.mjs").write_text(source)
    if css:
        (d / "main.css").write_text(css)
    return d


def test_namespace_collision_declared_in_flags(tmp_path):
    mods = tmp_path / "mods"
    _fake_module(mods, "pentaryn-other", flags={"namespace": "demo"})
    rc, target = gen(tmp_path, "demo", "--no-run", modules_root=mods)
    assert rc == 2 and not target.exists()


@pytest.mark.parametrize("source", [
    "game.pentaryn.demo = api;\n",
    "if (x) game.pentaryn = { ...current, demo: api };\n",
])
def test_namespace_collision_found_in_source(tmp_path, source):
    mods = tmp_path / "mods"
    _fake_module(mods, "pentaryn-other", source=source)
    rc, target = gen(tmp_path, "demo", "--no-run", modules_root=mods)
    assert rc == 2 and not target.exists()


def test_css_prefix_collision_and_auto_pick(tmp_path):
    mods = tmp_path / "mods"
    _fake_module(mods, "pentaryn-other", css=".pd-thing { color: red; }\n")
    assert gen(tmp_path, "demo", "--no-run", "--css-prefix", "pd-", modules_root=mods)[0] == 2
    rc, target = gen(tmp_path, "demo", "--no-run", modules_root=mods)
    assert rc == 0
    assert json.loads((target / "module.json").read_text())["flags"]["pentaryn"]["cssPrefix"] == "pde-"


def test_refuses_foundry_module_without_install(tmp_path):
    before = set(p.name for p in new_module.MODULE_ROOT.iterdir())
    rc = new_module.main(["zzblueprinttest", "--title", "Pentaryn Z", "--no-run",
                          "--modules-root", str(tmp_path)])
    assert rc == 2
    rc = new_module.main(["zzblueprinttest", "--title", "Pentaryn Z", "--no-run",
                          "--out", str(new_module.MODULE_ROOT), "--modules-root", str(tmp_path)])
    assert rc == 2
    assert set(p.name for p in new_module.MODULE_ROOT.iterdir()) == before


def test_verified_is_trimmed_to_generation_and_build(tmp_path):
    app = tmp_path / "app"
    app.mkdir()
    (app / "package.json").write_text(json.dumps({"version": "14.369.0"}))
    assert new_module.verified(app) == "14.369"
    assert new_module.verified(tmp_path / "missing") == "14"
    rc, target = gen(tmp_path, "demo", "--no-run", "--app-root", str(app))
    assert json.loads((target / "module.json").read_text())["compatibility"]["verified"] == "14.369"


def test_docs_are_written_once_and_never_overwritten(tmp_path):
    docs = tmp_path / "docs"
    rc, _ = gen(tmp_path, "demo", "--no-run", "--docs", "--docs-root", str(docs))
    assert rc == 0
    use = docs / "context/foundry/demo.md"
    plans = list((docs / "context/plans").glob("demo-*.md"))
    assert use.exists() and len(plans) == 1
    assert "**Read this when:**" in use.read_text() and "**Read this when:**" in plans[0].read_text()
    use.write_text("mine\n")
    new_module.write_docs(docs, {"__SHORT__": "demo", "__YYYY_MM__": plans[0].stem.split("-", 1)[1],
                                  "__Title__": "x", "__TODAY__": "x", "__NS__": "demo"})
    assert use.read_text() == "mine\n"


def test_block_markers():
    text = "a\n// @if full\nb\n// @endif\n<!-- @if small -->\nc\n<!-- @endif -->\n/* @if dnd5e */\nd\n/* @endif */\n"
    assert new_module.apply_blocks(text, {"full", "dnd5e"}) == "a\nb\nd\n"
    assert new_module.apply_blocks(text, {"small", "nodnd5e"}) == "a\nc\n"
    with pytest.raises(ValueError):
        new_module.apply_blocks("// @if full\nx\n", {"full"})


def test_docs_follow_the_tier(tmp_path):
    for tier in ("small", "full"):
        docs = tmp_path / f"docs-{tier}"
        rc, _ = gen(tmp_path, f"d{tier}", "--no-run", "--tier", tier, "--docs", "--docs-root", str(docs))
        assert rc == 0
        text = (docs / f"context/foundry/d{tier}.md").read_text()
        assert "@if" not in text and "@endif" not in text
        assert f"game.pentaryn.d{tier}.describe()" in text
        assert (f"game.pentaryn.d{tier}.inspect(" in text) == (tier == "full")


def test_after_sync_follow_up_is_valid_python_from_module_json(tmp_path, capsys):
    rc, target = gen(tmp_path, "demo", "--no-run")
    assert rc == 0
    out = capsys.readouterr().out
    assert "…)" not in out and "(…" not in out
    line = next(ln.strip() for ln in out.splitlines() if ln.strip().startswith("after_sync=("))
    assert line.endswith(")),")                      # the tuple, then ModuleSpec's own paren
    expr = line[len("after_sync="):-2]
    import ast
    value = ast.literal_eval(expr)
    want = json.loads((target / "module.json").read_text())["flags"]["pentaryn"]["afterSync"]
    assert list(value) == want and len(want) >= 1
    spec = next(ln.strip() for ln in out.splitlines() if ln.strip().startswith('"demo": ModuleSpec('))
    ast.parse("{" + spec + " " + line[:-1] + "}")     # the two printed lines paste as one valid dict entry


@needs_node
def test_check_scores_repo_wiring_as_pending_when_installed(tmp_path, monkeypatch, capsys):
    """--install --check into the module root: C39/C46 are follow-ups, never failures."""
    mods = tmp_path / "foundry-module"
    mods.mkdir()
    monkeypatch.setattr(new_module, "MODULE_ROOT", mods)
    monkeypatch.setattr(conformance, "MODULE_ROOT", mods)
    rc, target = gen(tmp_path, "demo", "--install", "--check", out=mods, modules_root=mods)
    out = capsys.readouterr().out
    assert rc == 0, out
    assert "conformance 100.0 %" in out and "pending follow-ups" in out
    # the same folder scored as installed is what conformance.py --module does after step 10
    installed = conformance.score_dir(target, installed=True)
    assert "C39" in installed["failing"]


def test_routing_follow_up_names_the_missing_api_index(tmp_path):
    readme = tmp_path / "README.md"
    readme.write_text("# Foundry\n\n## Route by task\n", encoding="utf-8")
    assert new_module._has_api_index(readme) is False
    readme.write_text("# Foundry\n\n## Module APIs (`game.pentaryn`)\n", encoding="utf-8")
    assert new_module._has_api_index(readme) is True
    assert new_module._has_api_index(tmp_path / "absent.md") is False
    text = new_module.follow_ups("demo", "Pentaryn Demo", "demo", installed=False)
    assert ("Module APIs index does not exist yet" in text) == (not new_module._has_api_index())


@pytest.mark.parametrize("sibling, expected", [(False, "pd-"), (True, "pde-")])
def test_force_keeps_the_css_prefix(tmp_path, sibling, expected):
    mods = tmp_path / "mods"
    mods.mkdir()
    if sibling:
        _fake_module(mods, "pentaryn-other", flags={"cssPrefix": "pd-"})
    for extra in ((), ("--force",)):
        rc, target = gen(tmp_path, "demo", "--no-run", *extra, modules_root=mods)
        assert rc == 0
        assert json.loads((target / "module.json").read_text())["flags"]["pentaryn"]["cssPrefix"] == expected
        assert f".{expected}" in (target / "styles" / "demo.css").read_text()


def test_run_checks_goes_through_the_public_run_gate(tmp_path, monkeypatch):
    """py-blueprint-MAINT-12: run_checks calls `ops.modules.run_gate`, not the private
    `_CHECKS` table, and stops at the first failing gate."""
    from scripts.foundry.ops import modules as ops_modules
    seen = []

    def fake(spec, gate):
        seen.append(gate)
        return 1
    monkeypatch.setattr(ops_modules, "run_gate", fake, raising=False)
    target = tmp_path / "pentaryn-demo"
    target.mkdir()
    assert new_module.run_checks(target) == 1
    assert seen == ["parse"]
