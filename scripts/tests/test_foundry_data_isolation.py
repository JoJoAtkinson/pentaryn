"""Guard for conftest's ``_isolate_foundry_data``: every Foundry path that is resolved at import
time names the temp data root during a test, never ~/Library/Application Support/FoundryVTT
(or the host's real FOUNDRY_DATA). A path added to these modules later and missed by the fixture
shows up here as a real-path hit."""
from pathlib import Path

from scripts import feedback_reports
from scripts.foundry.ops import config as cfg
from scripts.foundry.update import admin, inventory, recover

REAL = Path.home() / "Library/Application Support/FoundryVTT"


def _paths(mod):
    for name, val in vars(mod).items():
        if name.isupper() and isinstance(val, Path):
            yield f"{mod.__name__}.{name}", val
        elif name.isupper() and isinstance(val, dict):
            for k, v in val.items():
                if isinstance(v, Path):
                    yield f"{mod.__name__}.{name}[{k}]", v
    if mod is feedback_reports:
        yield "feedback_reports._DEFAULT_DIR", feedback_reports._DEFAULT_DIR
        yield "feedback_reports.feedback_dir()", feedback_reports.feedback_dir()


def test_every_import_time_foundry_path_is_under_the_temp_data_root(fake_data):
    root = fake_data.resolve()
    seen = {}
    for mod in (cfg, admin, inventory, recover, feedback_reports):
        for label, p in _paths(mod):
            resolved = p.resolve()
            assert REAL not in resolved.parents and resolved != REAL, f"{label} → {p} is the real Foundry folder"
            seen[label] = resolved
    # the ones that must exist under the temp root (repo-relative paths like REPO_ROOT are fine)
    for label in ("scripts.foundry.ops.config.FOUNDRY_DATA_DIR", "scripts.foundry.ops.config.FOUNDRY_MODULES",
                  "scripts.foundry.ops.config.WORLDS_DIR", "scripts.foundry.ops.config.WORLD_DIR",
                  "scripts.foundry.ops.config.ACTORS_STAGED",
                  "scripts.foundry.update.admin.FOUNDRY_DATA", "scripts.foundry.update.admin.DATA",
                  "scripts.foundry.update.admin.MODULES_DIR", "scripts.foundry.update.admin.OPTIONS_JSON",
                  "scripts.foundry.update.admin.SYSTEMS_DIR",
                  "feedback_reports.feedback_dir()"):
        assert root == seen[label] or root in seen[label].parents, f"{label} → {seen[label]} is not under {root}"


def test_the_modules_dir_is_the_temp_trees_own(fake_data):
    """The tiny temp tree's one module is what a listing of the modules dir sees."""
    assert sorted(p.name for p in cfg.FOUNDRY_MODULES.iterdir()) == ["m"]
    assert cfg.known_worlds() == ["w"]
