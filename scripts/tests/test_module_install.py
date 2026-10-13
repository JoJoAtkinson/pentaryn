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


def _staged(staging: Path) -> list[str]:
    """What a run left in the staging folder, minus the permanent `<id>.lock` (py-ops-ac-1)."""
    return sorted(p.name for p in staging.iterdir() if p.suffix != ".lock")


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
    assert _staged(staging) == [], "the half copy is cleaned up"
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
    assert staging.is_dir() and _staged(staging) == []
    assert cfg.FOUNDRY_MODULES not in staging.parents and cfg.FOUNDRY_DATA_DIR not in staging.parents
    assert [p.name for p in cfg.FOUNDRY_MODULES.iterdir()] == ["pentaryn-zz"], "nothing else lands where Foundry scans"


def test_leftovers_of_a_crashed_run_are_cleared(module):
    staging = modules.staging_dir(module.dst)
    (staging / "pentaryn-zz.new").mkdir(parents=True)
    (staging / "pentaryn-zz.new" / "junk").write_text("x")
    (staging / "pentaryn-zz.old").mkdir()
    modules.install(module.src, module.dst)
    assert _staged(staging) == []
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
    assert _staged(modules.staging_dir(module.dst)) == []


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
    monkeypatch.setattr(cfg, "WORLDS_DIR", data / "worlds")   # known_worlds() lists this on a refusal
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


def test_an_unwritable_event_log_never_fails_the_sync(module, monkeypatch, tmp_path, capsys):
    afile = tmp_path / "afile"
    afile.write_text("a file, not a folder")
    monkeypatch.setenv("PENTARYN_OPS_LOG", str(afile / "events.jsonl"))
    assert modules.sync("zz") == 0
    assert (module.dst / modules.SYNC_STAMP).exists()
    assert "ops log not written" in capsys.readouterr().out


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


def test_pipeline_imports_modules_at_the_top_not_inside_install_importer():
    """M11: `modules` is a top-level import of pipeline (no cycle — `install` already comes from
    it), and the module-level `install` name the tests above rely on stays."""
    import ast
    import inspect

    from scripts.foundry.ops import pipeline

    assert pipeline.modules is modules
    assert pipeline.install is modules.install
    fn = ast.parse(inspect.getsource(pipeline.install_importer))
    lazy = [n for n in ast.walk(fn) if isinstance(n, (ast.Import, ast.ImportFrom))]
    assert not lazy, "install_importer imports lazily (M11)"


# ── one install of a module at a time (py-ops-ac-1) ──────────────────────────────────────────

def _lock_path(module) -> Path:
    return modules.staging_dir(module.dst) / "pentaryn-zz.lock"


def test_install_holds_the_module_lock_while_it_copies_py_ops_ac_1(module, monkeypatch):
    """Two `make foundry-<m>-sync` runs shared `<id>.new`/`<id>.old` with no lock, so the second
    could rmtree the first one's half-built copy or its set-aside install (py-ops-ac-1)."""
    import fcntl

    real = modules.shutil.copytree
    held = []

    def probe(src, dst, *a, **k):
        if not str(dst).endswith(".new"):  # copytree recurses through itself for subfolders
            return real(src, dst, *a, **k)
        with open(_lock_path(module), "a") as fh:
            try:
                fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                held.append(True)
            else:
                fcntl.flock(fh, fcntl.LOCK_UN)
                held.append(False)
        return real(src, dst, *a, **k)

    monkeypatch.setattr(modules.shutil, "copytree", probe)
    modules.install(module.src, module.dst)
    assert held == [True], "another install cannot take the lock mid-copy"
    assert _lock_path(module).is_file(), "the lock file stays as a sibling of .new/.old"
    with open(_lock_path(module), "a") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)  # released once install returns


def test_a_second_install_waits_for_the_first_then_installs_py_ops_ac_1(module, monkeypatch):
    import fcntl
    import threading

    calls = []
    real = modules.shutil.copytree
    def counted(src, dst, *a, **k):
        if str(dst).endswith(".new"):  # copytree recurses through itself for subfolders
            calls.append(1)
        return real(src, dst, *a, **k)

    monkeypatch.setattr(modules.shutil, "copytree", counted)
    _lock_path(module).parent.mkdir(parents=True, exist_ok=True)
    with open(_lock_path(module), "a") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)  # the first sync, mid-install
        second = threading.Thread(target=modules.install, args=(module.src, module.dst))
        second.start()
        second.join(0.3)
        assert second.is_alive() and calls == [], "the second sync waits rather than touching staging"
    second.join(10)
    assert not second.is_alive() and calls == [1]
    assert _installed(module.dst) == _tree(module.src)


def test_the_lock_is_released_when_the_install_fails_py_ops_ac_1(module, monkeypatch):
    import fcntl

    def no_copy(src, dst, *a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(modules.shutil, "copytree", no_copy)
    with pytest.raises(OSError):
        modules.install(module.src, module.dst)
    with open(_lock_path(module), "a") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)


# ── a symlinked Data/modules/<id> (EC-8) ─────────────────────────────────────────────────────

def test_a_dangling_symlink_at_the_destination_is_replaced_ec_8(module, tmp_path):
    """`dst.exists()` follows links, so a dangling `Data/modules/<id>` link was neither set aside
    nor treated as missing, and `rename(new, dst)` crashed onto it (EC-8)."""
    module.dst.parent.mkdir(parents=True)
    module.dst.symlink_to(tmp_path / "gone")
    modules.install(module.src, module.dst)
    assert not module.dst.is_symlink() and _installed(module.dst) == _tree(module.src)
    assert _staged(modules.staging_dir(module.dst)) == [], "the set-aside link does not linger"


def test_a_symlinked_install_is_replaced_and_its_target_kept_ec_8(module, tmp_path):
    """A link to a real folder is set aside and unlinked — never rmtree'd through — and it does
    not linger in staging to break the next run (EC-8)."""
    target = tmp_path / "elsewhere"
    target.mkdir()
    (target / "zz.mjs").write_text("someone else's tree")
    module.dst.parent.mkdir(parents=True)
    module.dst.symlink_to(target)
    modules.install(module.src, module.dst)
    assert not module.dst.is_symlink() and _installed(module.dst) == _tree(module.src)
    assert (target / "zz.mjs").read_text() == "someone else's tree"
    assert _staged(modules.staging_dir(module.dst)) == []
    modules.install(module.src, module.dst)
    assert _installed(module.dst) == _tree(module.src)


def test_a_symlink_left_in_staging_is_cleared_ec_8(module, tmp_path):
    staging = modules.staging_dir(module.dst)
    staging.mkdir(parents=True)
    (staging / "pentaryn-zz.new").symlink_to(tmp_path / "gone")
    (staging / "pentaryn-zz.old").symlink_to(tmp_path / "gone")
    modules.install(module.src, module.dst)
    assert _staged(staging) == []
    assert _installed(module.dst) == _tree(module.src)


# ── which modules module-sync may sync is a field on the spec, not the key 'importer' (EXT-6) ──

def test_syncable_is_a_spec_field_and_the_importer_row_is_off_ext_6():
    assert cfg.ModuleSpec("pentaryn-zz", check="parse").syncable is True
    assert cfg.MODULES["importer"].syncable is False
    assert all(s.syncable for k, s in cfg.MODULES.items() if k not in {"importer", "walls"})


def test_module_sync_choices_are_every_registered_module_ext_6(monkeypatch):
    """Defect wave 3: the choices used to leave the non-syncable ones out, so
    `module-sync importer` died at argparse ("invalid choice") and never reached
    sync()'s own refusal. Every registered name parses; sync() decides (spec.syncable)."""
    from scripts.foundry.ops import cli
    monkeypatch.setitem(cfg.MODULES, "zz", cfg.ModuleSpec("pentaryn-zz", check="parse",
                                                          syncable=False))
    sub = next(a for a in cli.build_parser()._subparsers._actions if getattr(a, "choices", None))
    choices = next(a.choices for a in sub.choices["module-sync"]._actions if a.dest == "module")
    assert "zz" in choices and "importer" in choices and "ties" in choices
    check = next(a.choices for a in sub.choices["module-check"]._actions if a.dest == "module")
    assert "zz" in check and "importer" in check, "module-check still checks every module"


def test_cli_module_sync_importer_reaches_the_coded_refusal_ext_6(monkeypatch, capsys):
    """`python -m scripts.foundry.ops module-sync importer` (and `make foundry-importer-sync`)
    gets the ✗ line pointing to importer-install and exit 1, not an argparse usage error."""
    from scripts.foundry.ops import cli
    monkeypatch.setattr(modules, "check", lambda name: pytest.fail("a refused sync runs no gates"))
    monkeypatch.setattr(modules, "install", lambda *a, **k: pytest.fail("a refused sync installs nothing"))
    assert cli.main(["module-sync", "importer"]) == 1
    out = capsys.readouterr()
    assert "✗ importer is not synced by module-sync" in out.out
    assert "importer-install" in out.out and "invalid choice" not in out.err


def test_sync_refuses_a_non_syncable_spec_ext_6(module, monkeypatch, capsys):
    monkeypatch.setitem(cfg.MODULES, "zz", cfg.ModuleSpec("pentaryn-zz", check="parse",
                                                          syncable=False))
    monkeypatch.setattr(modules, "check", lambda name: pytest.fail("a refused sync runs no gates"))
    monkeypatch.setattr(modules, "install", lambda *a, **k: pytest.fail("a refused sync installs nothing"))
    assert modules.sync("zz") == 1
    out = capsys.readouterr().out
    assert "✗" in out and "importer-install" in out


# ── a retired module is never synced (wave 3 walls-retire: Joe retired pentaryn-walls 2026-10-13) ──

def test_walls_is_retired_and_not_syncable_walls_retire():
    spec = cfg.MODULES["walls"]
    assert spec.retired.startswith("2026-10-13"), "the retirement carries its date"
    assert spec.syncable is False
    assert spec.check == cfg.ALL_GATES, "its source stays in the repo and stays proved"


def test_a_retired_spec_is_never_syncable_walls_retire():
    assert cfg.ModuleSpec("pentaryn-zz", check="parse", retired="2026-10-13 — gone").syncable is False
    assert cfg.ModuleSpec("pentaryn-zz", check="parse").retired == ""


def test_module_sync_does_not_offer_walls_walls_retire():
    from scripts.foundry.ops import cli
    with pytest.raises(SystemExit):
        cli.build_parser().parse_args(["module-sync", "walls"])
    assert cli.build_parser().parse_args(["module-check", "walls"]).module == "walls"


def test_sync_refuses_a_retired_spec_and_says_so_walls_retire(module, monkeypatch, capsys):
    monkeypatch.setitem(cfg.MODULES, "zz", cfg.ModuleSpec("pentaryn-zz", check="parse",
                                                          retired="2026-10-13 — Joe uses prefabs"))
    monkeypatch.setattr(modules, "check", lambda name: pytest.fail("a refused sync runs no gates"))
    monkeypatch.setattr(modules, "install", lambda *a, **k: pytest.fail("a refused sync installs nothing"))
    assert modules.sync("zz") == 1
    out = capsys.readouterr().out
    assert "✗ zz is retired (2026-10-13 — Joe uses prefabs)" in out and "importer-install" not in out
