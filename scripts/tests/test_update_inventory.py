"""The updater's local-drift report (python-tooling-9): what it says about the `pentaryn-*`
modules installed in Data/ against this repo's copies. Every case runs on tmp folders."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.foundry.update import inventory


def _module(root: Path, mid: str, version: str, files: dict[str, str] | None = None) -> Path:
    d = root / mid
    d.mkdir(parents=True)
    (d / "module.json").write_text(json.dumps({"id": mid, "version": version}), encoding="utf-8")
    for rel, text in (files or {}).items():
        (d / rel).parent.mkdir(parents=True, exist_ok=True)
        (d / rel).write_text(text, encoding="utf-8")
    return d


@pytest.fixture
def dirs(monkeypatch, tmp_path):
    repo, data = tmp_path / "repo", tmp_path / "Data" / "modules"
    repo.mkdir(parents=True)
    data.mkdir(parents=True)
    monkeypatch.setattr(inventory, "REPO_MODULE_SRC", repo)
    return repo, data


def _installed(data: Path, mid: str) -> inventory.Package:
    return inventory._read_package("module", data / mid)


def test_a_version_difference_is_one_entry(dirs):
    repo, data = dirs
    _module(repo, "pentaryn-x", "1.0")
    _module(data, "pentaryn-x", "0.9")
    (entry,) = inventory.local_drift([_installed(data, "pentaryn-x")])
    assert (entry["id"], entry["installed"], entry["repo"]) == ("pentaryn-x", "0.9", "1.0")
    assert entry["note"].startswith("Data/ copy differs from the repo — run make ")


def test_equal_versions_and_files_are_no_drift(dirs):
    repo, data = dirs
    _module(repo, "pentaryn-x", "1.0", {"x.mjs": "1"})
    _module(data, "pentaryn-x", "1.0", {"x.mjs": "1"})
    assert inventory.local_drift([_installed(data, "pentaryn-x")]) == []


def test_a_module_missing_from_the_repo_says_so(dirs):
    _, data = dirs
    _module(data, "pentaryn-gone", "1.0")
    assert inventory.local_drift([_installed(data, "pentaryn-gone")]) == [
        {"id": "pentaryn-gone", "installed": "1.0", "repo": None, "note": "installed but not present in foundry/module/"},
    ]


def test_non_local_packages_are_ignored(dirs):
    _, data = dirs
    _module(data, "dice-so-nice", "5.0")
    assert inventory.local_drift([_installed(data, "dice-so-nice")]) == []


# ── after python-tooling-9: the right make target, and same-version content drift ─────────────

def test_the_note_names_the_module_s_own_sync_target(dirs):
    repo, data = dirs
    _module(repo, "pentaryn-x", "1.0")
    _module(data, "pentaryn-x", "0.9")
    (entry,) = inventory.local_drift([_installed(data, "pentaryn-x")])
    assert entry["note"] == "Data/ copy differs from the repo — run make foundry-x-sync"


@pytest.mark.parametrize("pkg_id, hint", [
    ("pentaryn-ties", "make foundry-ties-sync"),
    ("pentaryn-walls", "make foundry-walls-sync"),
    ("pentaryn-importer", "make foundry-sync WORLD=<world> (then make foundry-clean)"),
])
def test_sync_hint(pkg_id, hint):
    assert inventory.sync_hint(pkg_id) == hint


def test_same_version_different_files_is_content_drift(dirs):
    repo, data = dirs
    _module(repo, "pentaryn-x", "1.0", {"x.mjs": "new"})
    _module(data, "pentaryn-x", "1.0", {"x.mjs": "old"})
    assert inventory.local_drift([_installed(data, "pentaryn-x")]) == [{
        "id": "pentaryn-x", "installed": "1.0", "repo": "1.0",
        "note": "same version, different files in Data/ — run make foundry-x-sync", "content_drift": True,
    }]


def test_the_sync_stamp_is_not_content_drift(dirs):
    from scripts.foundry.ops.digest import SYNC_STAMP

    repo, data = dirs
    _module(repo, "pentaryn-x", "1.0", {"x.mjs": "1"})
    _module(data, "pentaryn-x", "1.0", {"x.mjs": "1", SYNC_STAMP: "{}"})
    assert inventory.local_drift([_installed(data, "pentaryn-x")]) == []


def test_risk_names_the_module_s_own_sync_target():
    from scripts.foundry.update import risk
    from scripts.foundry.update.upstream import Upstream

    pkg = inventory.Package(type="module", id="pentaryn-walls", title="w", version="0.2.0", path=Path("/x"))
    up = Upstream(id="pentaryn-walls", type="module", installed="0.2.0", latest=None)
    d = risk.classify_package(pkg, up, policy={}, core_version="14.369", system_version="6.0.6",
                              installed_ids=set(), seen={})
    assert d.reasons == ["built in this repo — updated by make foundry-walls-sync, not upstream"]
