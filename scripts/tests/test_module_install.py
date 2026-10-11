"""Installing a module into Foundry's Data/ (python-tooling-5 step a, -53, -10).

`modules.sync` and `pipeline.stage` copy a module folder into `Data/modules/<id>`. The copy lands
whole or not at all: it is built in a staging folder outside `Data/modules` (Foundry scans every
folder there for a module.json) and swapped in by rename, so a failed copy leaves the old install
serving. Every test runs against tmp folders — never the real Data/ or foundry/logs."""

from __future__ import annotations

import filecmp
from pathlib import Path

import pytest

from scripts.foundry.ops import config as cfg, modules


def _tree(root: Path) -> list[str]:
    return sorted(p.relative_to(root).as_posix() for p in root.rglob("*"))


@pytest.fixture
def module(monkeypatch, tmp_path):
    """A module source tree, a fake Data/, and the gates stubbed green."""
    src = tmp_path / "repo" / "pentaryn-zz"
    for rel, text in {
        "zz.mjs": "export const x = 1;\n",
        "lang/en.json": "{}\n",
        "module.json": '{"id": "pentaryn-zz", "version": "0.1.0"}\n',
        "test/run.mjs": "// suite\n",
        "README.md": "# zz\n",
    }.items():
        (src / rel).parent.mkdir(parents=True, exist_ok=True)
        (src / rel).write_text(text, encoding="utf-8")
    data = tmp_path / "FoundryVTT" / "Data"
    monkeypatch.setattr(cfg, "FOUNDRY_DATA", data)
    monkeypatch.setattr(cfg, "FOUNDRY_MODULES", data / "modules")
    monkeypatch.setattr(cfg, "MODULE_SRC_ROOT", src.parent)
    monkeypatch.setitem(cfg.MODULES, "zz", cfg.ModuleSpec("pentaryn-zz", check="parse"))
    monkeypatch.setattr(modules, "check", lambda name: 0)
    return cfg.MODULES["zz"]


def test_sync_copies_the_whole_tree(module, capsys):
    assert modules.sync("zz") == 0
    assert _tree(module.dst) == _tree(module.src)
    assert not filecmp.dircmp(module.src, module.dst).diff_files
    assert f"✓ module → {module.dst}" in capsys.readouterr().out


def test_sync_replaces_files_that_are_gone_from_the_repo(module):
    module.dst.mkdir(parents=True)
    (module.dst / "stale.mjs").write_text("old")
    assert modules.sync("zz") == 0
    assert _tree(module.dst) == _tree(module.src)


def test_a_failed_copy_leaves_the_old_install_serving(module, monkeypatch):
    """Today's hardening (python-tooling-5a): before it, rmtree ran first and a failed copy left
    Data/modules/<id> missing while Foundry may be serving it."""
    module.dst.mkdir(parents=True)
    (module.dst / "zz.mjs").write_text("the old, working build")
    real = modules.shutil.copytree

    def half_copy(src, dst, *a, **k):
        Path(dst).mkdir(parents=True)
        (Path(dst) / "zz.mjs").write_text("half")
        raise OSError("disk full")

    monkeypatch.setattr(modules.shutil, "copytree", half_copy)
    with pytest.raises(OSError):
        modules.install(module.src, module.dst)
    assert (module.dst / "zz.mjs").read_text() == "the old, working build"
    assert _tree(module.dst) == ["zz.mjs"]
    staging = cfg.FOUNDRY_DATA.parent / modules.STAGING_DIRNAME
    assert list(staging.iterdir()) == [], "the half copy is cleaned up"
    monkeypatch.setattr(modules.shutil, "copytree", real)
    modules.install(module.src, module.dst)
    assert _tree(module.dst) == _tree(module.src)


def test_a_failed_swap_puts_the_old_install_back(module, monkeypatch):
    module.dst.mkdir(parents=True)
    (module.dst / "zz.mjs").write_text("old")
    real = modules.os.rename
    calls = []

    def rename(a, b):
        calls.append((Path(a).name, Path(b).name))
        if Path(a).name.endswith(".new"):
            raise OSError("rename failed")
        return real(a, b)

    monkeypatch.setattr(modules.os, "rename", rename)
    with pytest.raises(OSError):
        modules.install(module.src, module.dst)
    assert (module.dst / "zz.mjs").read_text() == "old"
    assert calls == [("pentaryn-zz", "pentaryn-zz.old"), ("pentaryn-zz.new", "pentaryn-zz"), ("pentaryn-zz.old", "pentaryn-zz")]


def test_the_staging_folder_is_outside_data_modules(module):
    modules.install(module.src, module.dst)
    staging = cfg.FOUNDRY_DATA.parent / modules.STAGING_DIRNAME
    assert staging.is_dir() and list(staging.iterdir()) == []
    assert cfg.FOUNDRY_MODULES not in staging.parents and cfg.FOUNDRY_DATA not in staging.parents
    assert [p.name for p in cfg.FOUNDRY_MODULES.iterdir()] == ["pentaryn-zz"], "nothing else lands where Foundry scans"


def test_leftovers_of_a_crashed_run_are_cleared(module):
    staging = cfg.FOUNDRY_DATA.parent / modules.STAGING_DIRNAME
    (staging / "pentaryn-zz.new").mkdir(parents=True)
    (staging / "pentaryn-zz.new" / "junk").write_text("x")
    (staging / "pentaryn-zz.old").mkdir()
    modules.install(module.src, module.dst)
    assert list(staging.iterdir()) == []
    assert _tree(module.dst) == _tree(module.src)


# ── pipeline.stage installs the importer through the same helper (python-tooling-53) ──────────

@pytest.fixture
def importer(monkeypatch, tmp_path):
    from scripts.foundry.ops import pipeline

    src = tmp_path / "repo" / "pentaryn-importer"
    (src / "test").mkdir(parents=True)
    (src / "module.json").write_text('{"id": "pentaryn-importer", "version": "1.1.0"}\n')
    (src / "pentaryn-importer.mjs").write_text("// entry\n")
    (src / "test" / "run.mjs").write_text("// suite\n")
    actors = tmp_path / "repo" / "build" / "actors.json"
    actors.parent.mkdir(parents=True)
    actors.write_text('{"actors": []}\n')
    data = tmp_path / "FoundryVTT" / "Data"
    world = data / "worlds" / "zz-world"
    world.mkdir(parents=True)
    monkeypatch.setattr(cfg, "FOUNDRY_DATA", data)
    monkeypatch.setattr(cfg, "FOUNDRY_MODULES", data / "modules")
    monkeypatch.setattr(cfg, "MODULE_SRC_ROOT", src.parent)
    monkeypatch.setattr(cfg, "WORLD_NAME", "zz-world")
    monkeypatch.setattr(cfg, "WORLD_DIR", world)
    monkeypatch.setattr(cfg, "ACTORS_JSON", actors)
    monkeypatch.setattr(cfg, "ACTORS_STAGED", world / "actors.json")
    monkeypatch.setattr(pipeline, "build_actors", lambda: 0)
    return pipeline, cfg.MODULES["importer"]


def test_stage_installs_the_importer_and_stages_the_json(importer, capsys):
    pipeline, spec = importer
    assert pipeline.stage() == 0
    cmp = filecmp.dircmp(spec.src, spec.dst)
    assert not (cmp.left_only or cmp.right_only or cmp.diff_files)
    assert _tree(spec.dst) == _tree(spec.src)
    assert cfg.ACTORS_STAGED.read_text() == cfg.ACTORS_JSON.read_text()
    said = capsys.readouterr().out
    assert "▸ target world: zz-world" in said and f"✓ module → {spec.dst}" in said


def test_stage_into_a_missing_world_touches_nothing(importer, monkeypatch):
    pipeline, spec = importer
    spec.dst.mkdir(parents=True)
    (spec.dst / "old.mjs").write_text("old")
    monkeypatch.setattr(cfg, "WORLD_DIR", cfg.FOUNDRY_DATA / "worlds" / "nope")
    assert pipeline.stage() == 1
    assert _tree(spec.dst) == ["old.mjs"]


def test_stage_uses_the_atomic_install(importer, monkeypatch):
    pipeline, spec = importer
    spec.dst.mkdir(parents=True)
    (spec.dst / "pentaryn-importer.mjs").write_text("the old, working build")

    def broken(src, dst, *a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(modules.shutil, "copytree", broken)
    with pytest.raises(OSError):
        pipeline.stage()
    assert (spec.dst / "pentaryn-importer.mjs").read_text() == "the old, working build"
    assert not cfg.ACTORS_STAGED.exists(), "nothing is staged when the module did not install"
