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
