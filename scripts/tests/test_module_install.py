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


def _installed(root: Path) -> list[str]:
    """An installed tree minus the sync stamp (python-tooling-10), to compare with its source."""
    return [p for p in _tree(root) if p != modules.SYNC_STAMP]


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
    monkeypatch.setattr(cfg, "FOUNDRY_DATA_DIR", data)
    monkeypatch.setattr(cfg, "FOUNDRY_MODULES", data / "modules")
    monkeypatch.setattr(cfg, "MODULE_SRC_ROOT", src.parent)
    monkeypatch.setitem(cfg.MODULES, "zz", cfg.ModuleSpec("pentaryn-zz", check="parse"))
    monkeypatch.setattr(modules, "check", lambda name: 0)
    return cfg.MODULES["zz"]


def test_sync_copies_the_whole_tree(module, capsys):
    assert modules.sync("zz") == 0
    assert _installed(module.dst) == _tree(module.src)
    assert not filecmp.dircmp(module.src, module.dst).diff_files
    assert (module.dst / modules.SYNC_STAMP).is_file()
    assert f"✓ module → {module.dst}" in capsys.readouterr().out


def test_sync_replaces_files_that_are_gone_from_the_repo(module):
    module.dst.mkdir(parents=True)
    (module.dst / "stale.mjs").write_text("old")
    assert modules.sync("zz") == 0
    assert _installed(module.dst) == _tree(module.src)


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
    staging = modules.staging_dir(module.dst)
    assert list(staging.iterdir()) == [], "the half copy is cleaned up"
    monkeypatch.setattr(modules.shutil, "copytree", real)
    modules.install(module.src, module.dst)
    assert _installed(module.dst) == _tree(module.src)


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
    staging = modules.staging_dir(module.dst)
    assert staging.is_dir() and list(staging.iterdir()) == []
    assert cfg.FOUNDRY_MODULES not in staging.parents and cfg.FOUNDRY_DATA_DIR not in staging.parents
    assert [p.name for p in cfg.FOUNDRY_MODULES.iterdir()] == ["pentaryn-zz"], "nothing else lands where Foundry scans"


def test_leftovers_of_a_crashed_run_are_cleared(module):
    staging = modules.staging_dir(module.dst)
    (staging / "pentaryn-zz.new").mkdir(parents=True)
    (staging / "pentaryn-zz.new" / "junk").write_text("x")
    (staging / "pentaryn-zz.old").mkdir()
    modules.install(module.src, module.dst)
    assert list(staging.iterdir()) == []
    assert _installed(module.dst) == _tree(module.src)


def _crashed_mid_swap(module) -> Path:
    """The state a run killed between `rename(dst, old)` and `rename(new, dst)` leaves behind:
    Data/modules/<id> missing, the previous good install sitting in the staging `<id>.old`."""
    old = modules.staging_dir(module.dst) / "pentaryn-zz.old"
    old.mkdir(parents=True)
    (old / "zz.mjs").write_text("the old, working build")
    module.dst.parent.mkdir(parents=True, exist_ok=True)
    assert not module.dst.exists()
    return old


def test_a_crash_mid_swap_is_repaired_when_the_next_copy_fails(module, monkeypatch):
    """The previous install is put back before the leftovers are cleared, so a failing copy on the
    next run cannot delete the only good copy."""
    old = _crashed_mid_swap(module)

    def no_copy(src, dst, *a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(modules.shutil, "copytree", no_copy)
    with pytest.raises(OSError):
        modules.install(module.src, module.dst)
    assert (module.dst / "zz.mjs").read_text() == "the old, working build"
    assert not old.exists()


def test_a_crash_mid_swap_is_repaired_and_the_next_run_installs(module):
    _crashed_mid_swap(module)
    modules.install(module.src, module.dst)
    assert _installed(module.dst) == _tree(module.src)
    assert list(modules.staging_dir(module.dst).iterdir()) == []


def test_an_interrupt_after_setting_the_old_install_aside_puts_it_back(module, monkeypatch):
    module.dst.mkdir(parents=True)
    (module.dst / "zz.mjs").write_text("old")
    real = modules.os.rename

    def rename(a, b):
        if Path(a).name.endswith(".new"):
            raise KeyboardInterrupt
        return real(a, b)

    monkeypatch.setattr(modules.os, "rename", rename)
    with pytest.raises(KeyboardInterrupt):
        modules.install(module.src, module.dst)
    assert (module.dst / "zz.mjs").read_text() == "old"


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
    monkeypatch.setattr(cfg, "FOUNDRY_DATA_DIR", data)
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
    cmp = filecmp.dircmp(spec.src, spec.dst, ignore=[modules.SYNC_STAMP])
    assert not (cmp.left_only or cmp.right_only or cmp.diff_files)
    assert _installed(spec.dst) == _tree(spec.src)
    assert cfg.ACTORS_STAGED.read_text() == cfg.ACTORS_JSON.read_text()
    said = capsys.readouterr().out
    assert "▸ target world: zz-world" in said and f"✓ module → {spec.dst}" in said


def test_stage_into_a_missing_world_touches_nothing(importer, monkeypatch):
    pipeline, spec = importer
    spec.dst.mkdir(parents=True)
    (spec.dst / "old.mjs").write_text("old")
    monkeypatch.setattr(cfg, "WORLD_DIR", cfg.FOUNDRY_DATA_DIR / "worlds" / "nope")
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


# ── the sync stamp and the ops log (python-tooling-10) ─────────────────────────────────────────

def test_sync_stamps_the_copy_and_logs_one_line(module, monkeypatch, capsys):
    import json

    monkeypatch.setattr(modules, "_git_state", lambda src: ("abc1234", True))
    assert modules.sync("zz") == 0
    stamp = json.loads((module.dst / modules.SYNC_STAMP).read_text(encoding="utf-8"))
    assert list(stamp) == ["module", "version", "digest", "git", "dirty", "synced_at"]
    assert (stamp["module"], stamp["version"], stamp["git"], stamp["dirty"]) == ("pentaryn-zz", "0.1.0", "abc1234", True)
    assert stamp["digest"] == modules.tree_digest(module.src) == modules.tree_digest(module.dst)
    logs = list(cfg.OPS_LOG_DIR.glob("ops-*.jsonl"))
    assert [p.name for p in logs] == [f"ops-{stamp['synced_at'][:7]}.jsonl"]
    (line,) = [json.loads(x) for x in logs[0].read_text(encoding="utf-8").splitlines()]
    assert line["cmd"] == "module-sync" and line["ts"] == stamp["synced_at"]
    assert line["digest"] == stamp["digest"] and line["dst"] == str(module.dst)
    said = capsys.readouterr().out
    assert said == f"  ✓ module → {module.dst}\n", "the printed output is unchanged"


def test_the_stamp_is_the_only_difference_from_the_repo_tree(module):
    modules.sync("zz")
    assert _tree(module.dst) == sorted(_tree(module.src) + [modules.SYNC_STAMP])


def test_tree_digest_sees_content_and_names_but_not_the_stamp(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    for root in (a, b):
        (root / "sub").mkdir(parents=True)
        (root / "sub" / "x.mjs").write_text("1")
    (b / modules.SYNC_STAMP).write_text("{}")
    assert modules.tree_digest(a) == modules.tree_digest(b)
    (b / "sub" / "x.mjs").write_text("2")
    assert modules.tree_digest(a) != modules.tree_digest(b)
    (b / "sub" / "x.mjs").write_text("1")
    (b / "sub" / "x.mjs").rename(b / "sub" / "y.mjs")
    assert modules.tree_digest(a) != modules.tree_digest(b)


def test_stage_logs_as_stage(importer, monkeypatch):
    import json

    pipeline, spec = importer
    monkeypatch.setattr(modules, "_git_state", lambda src: (None, None))
    assert pipeline.stage() == 0
    (line,) = [json.loads(x) for p in cfg.OPS_LOG_DIR.glob("ops-*.jsonl") for x in p.read_text().splitlines()]
    assert (line["cmd"], line["module"], line["git"]) == ("stage", "pentaryn-importer", None)


def test_an_unwritable_ops_log_never_fails_the_sync(module, monkeypatch, capsys):
    def boom(path, record):
        raise OSError("read-only")

    monkeypatch.setattr(modules, "append_jsonl", boom)
    assert modules.sync("zz") == 0
    assert "ops log not written (read-only)" in capsys.readouterr().out
    assert (module.dst / modules.SYNC_STAMP).exists()


def test_events_mirror_the_log_when_asked(module, monkeypatch, tmp_path):
    import json

    target = tmp_path / "events.jsonl"
    monkeypatch.setenv("PENTARYN_OPS_LOG", str(target))
    modules.sync("zz")
    (ev,) = [json.loads(x) for x in target.read_text().splitlines()]
    assert ev["kind"] == "module-sync" and ev["module"] == "pentaryn-zz"


def test_git_state_reads_this_checkout():
    rev, dirty = modules._git_state(cfg.MODULE_SRC_ROOT / "pentaryn-importer")
    assert rev and isinstance(dirty, bool)


# ── importer-install: the module alone, no actors.json (overnight-2026-10-11 FX item 3) ───────

def test_importer_install_checks_then_installs_without_staging(importer, monkeypatch, capsys):
    import json

    pipeline, spec = importer
    checked = []
    monkeypatch.setattr(modules, "check", lambda name: checked.append(name) or 0)
    monkeypatch.setattr(pipeline, "build_actors", lambda: pytest.fail("importer-install builds no actors"))
    assert pipeline.install_importer() == 0
    assert checked == ["importer"]
    assert _installed(spec.dst) == _tree(spec.src)
    assert not cfg.ACTORS_STAGED.exists(), "no actors.json is staged"
    (line,) = [json.loads(x) for p in cfg.OPS_LOG_DIR.glob("ops-*.jsonl") for x in p.read_text().splitlines()]
    assert (line["cmd"], line["module"]) == ("importer-install", "pentaryn-importer")
    assert f"✓ module → {spec.dst}" in capsys.readouterr().out


def test_importer_install_leaves_an_already_staged_json_alone(importer, monkeypatch):
    pipeline, spec = importer
    monkeypatch.setattr(modules, "check", lambda name: 0)
    cfg.ACTORS_STAGED.write_text("staged by foundry-import")
    assert pipeline.install_importer() == 0
    assert cfg.ACTORS_STAGED.read_text() == "staged by foundry-import"


def test_importer_install_failing_check_installs_nothing(importer, monkeypatch):
    pipeline, spec = importer
    monkeypatch.setattr(modules, "check", lambda name: 1)
    assert pipeline.install_importer() == 1
    assert not spec.dst.exists()
