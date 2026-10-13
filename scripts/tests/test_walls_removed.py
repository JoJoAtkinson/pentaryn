"""Walls removed (2026-10-13, after defect wave 3): Joe retired pentaryn-walls — he walls scenes
with prefabs — and then had it taken out of the repo. An exact copy lives on the branch
`archive/pentaryn-walls`; how to bring it back is context/foundry/retired.md.

Nothing in the tooling may still name it: no module folder, no registry row, no make target,
no ops command, no conformance exception, no live golden, no doc link to its pages.
"""

from __future__ import annotations

import json
import re

import pytest

from scripts.foundry.ops import config as cfg

pytestmark = pytest.mark.repo
ROOT = cfg.REPO_ROOT


def test_the_module_folder_is_gone():
    assert not (ROOT / "foundry/module/pentaryn-walls").exists()


def test_no_registry_row():
    assert "walls" not in cfg.MODULES
    assert all(s.name != "pentaryn-walls" for s in cfg.MODULES.values())


def test_no_make_target_or_retired_list_names_it():
    text = (ROOT / "Makefile").read_text(encoding="utf-8")
    assert "foundry-walls" not in text
    assert not re.search(r"^RETIRED_MODULES\s*:=.*\bwalls\b", text, re.M)


def test_no_ops_command_builds_or_benches_it():
    from scripts.foundry.ops import cli, modules

    sub = next(a for a in cli.build_parser()._subparsers._actions if getattr(a, "choices", None))
    assert "walls-wasm" not in sub.choices and "walls-bench" not in sub.choices
    assert not hasattr(modules, "walls_wasm") and not hasattr(modules, "walls_bench")


def test_no_conformance_exception_or_live_golden():
    exc = json.loads((ROOT / "scripts/foundry/blueprint/exceptions.json").read_text(encoding="utf-8"))
    assert "pentaryn-walls" not in json.dumps(exc)
    assert not (ROOT / "scripts/foundry/live-goldens/walls.js").exists()


def test_its_use_doc_is_gone():
    assert not (ROOT / "context/foundry/walls.md").exists()
