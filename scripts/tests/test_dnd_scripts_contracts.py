"""Characterisation of the dnd-scripts MCP tool contracts (tests only).

python-tooling-48 (annotations, error channels, schemas), -49 (subprocess argument
mapping: check_lore_links' `zone`, build_timeline_key's `output`), -50 (the in-process
modules' second dispatch path). Pinned before any of those changes; each KNOWN names
its finding and flips with that finding's [declared] fix.
"""

from __future__ import annotations

import dataclasses
import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
_SERVER_PATH = REPO_ROOT / "scripts/mcp/server.py"
SCHEMAS = Path(__file__).with_name("fixtures") / "dnd_scripts_schemas.json"


def _load_server():
    name = "_mcp_server_contracts"
    spec = importlib.util.spec_from_file_location(name, _SERVER_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


server = _load_server()


@pytest.fixture(scope="module")
def runners():
    return {r.tool.name: r for r in server.discover_tools(repo_root=REPO_ROOT).tools}


# ── -48: annotations, schemas, error channels ────────────────────────────────

# KNOWN python-tooling-48: these seven carry no `annotations`; the fix empties the set.
NO_ANNOTATIONS = {"year_to_age", "age_to_year", "age_convert", "check_lore_links",
                  "fix_md_links", "build_timeline_svg", "build_timeline_key"}


@pytest.mark.repo
def test_tools_without_annotations(runners):
    assert {n for n, r in runners.items() if not r.tool.annotations} == NO_ANNOTATIONS


@pytest.mark.repo
def test_input_schemas_unchanged(runners):
    """Descriptions and annotations may change (-48); schemas may not (-48, -50)."""
    want = json.loads(SCHEMAS.read_text(encoding="utf-8"))
    assert {n: r.tool.input_schema for n, r in runners.items()} == want


def test_error_channels(tmp_path, monkeypatch):
    """Two channels, pinned: combat_action_upsert returns {ok: false}; lore raises."""
    monkeypatch.setenv("DND_COMBAT_ACTIONS_DB", str(tmp_path / "actions.jsonl"))
    from scripts import dnd_roller, lore
    assert json.loads(dnd_roller.combat_action_upsert("", "x", {}))["ok"] is False
    with pytest.raises(ValueError):
        lore.get_npc("")


# ── -49: subprocess argument mapping ─────────────────────────────────────────

# KNOWN python-tooling-49: check_lore_links advertises `zone` but maps no flag for it.
UNMAPPED = {("check_lore_links", "zone")}


def _mapped(r) -> set[str]:
    placeholders = {tok[1:-1] for tok in r.argv_template if tok.startswith("{") and tok.endswith("}")}
    return placeholders | set(r.bool_flags) | set(r.value_flags)


@pytest.mark.repo
def test_subprocess_schema_properties_are_mapped(runners):
    gaps = {(n, prop) for n, r in runners.items() if r.handler is None
            for prop in (r.tool.input_schema.get("properties") or {})
            if prop not in _mapped(r)}
    assert gaps == UNMAPPED


@pytest.mark.repo
def test_known_zone_never_reaches_the_script(runners, tmp_path):
    """KNOWN python-tooling-49: ToolRunner drops `zone`; the fix passes --zone <value>."""
    echo = tmp_path / "echo_argv.py"
    echo.write_text("import json, sys\nprint(json.dumps(sys.argv[1:]))\n")
    r = dataclasses.replace(runners["check_lore_links"], script_path=echo)
    assert json.loads(r.run(arguments={"zone": "world/x"})) == []


def test_known_timeline_key_output_can_leave_the_repo(tmp_path, monkeypatch):
    """KNOWN python-tooling-49: a ../ output resolves outside REPO_ROOT (nothing is written
    here; the builder is stubbed). The fix refuses it."""
    from scripts import build_timeline_key as btk
    repo = tmp_path / "repo"
    repo.mkdir()
    seen = []
    monkeypatch.setattr(btk, "REPO_ROOT", repo)
    monkeypatch.setattr(btk, "build_timeline_key", lambda *, repo_root, output: seen.append(output) or output)
    btk.main(["--output", "../x.svg"])
    assert seen == [tmp_path / "x.svg"]
    btk.main(["--output", "timeline-key.svg"])
    assert seen[-1] == repo / "timeline-key.svg"


# ── -50: the second dispatch path ────────────────────────────────────────────

@pytest.mark.repo
@pytest.mark.parametrize("script", ["lore.py", "srd5_2.py", "ages_converter.py"])
def test_in_process_modules_bind_every_tool_to_a_handler(runners, script):
    mine = [r for r in runners.values() if r.script_path.name == script]
    assert mine and all(r.handler is not None for r in mine)


@pytest.mark.parametrize("tokens, want", [
    (["--limit", "5", "--dedupe", "false", "--cr_min", "0.5"],
     {"limit": 5, "dedupe": False, "cr_min": 0.5}),
    (["--query", "fire bolt", "--level", "x", "--ritual", "--cost_max", "12"],
     {"query": "fire bolt", "level": "x", "ritual": True, "cost_max": 12.0}),
    (["pos", "--ac_min", "14", "--include_srd", "no", "--weight_max", "2.5", "--name"],
     {"ac_min": 14, "include_srd": "no", "weight_max": 2.5, "name": True}),
])
def test_srd_cli_flag_parsing_pinned(tokens, want):
    from scripts import srd5_2
    assert srd5_2._parse_flag_args(tokens) == want


def test_lore_cli_flag_parsing_pinned():
    from scripts import lore
    assert lore._parse_flag_args(["--query", "x", "--limit", "3", "--paths", "world/factions"]) \
        == {"query": "x", "limit": 3, "paths": "world/factions"}


def test_known_ages_cli_converts_against_an_empty_index(tmp_path, monkeypatch, capsys):
    """KNOWN python-tooling-50: the MCP path refuses an empty age index; the CLI prints the
    bare year. The fix makes the CLI exit 2 with the index message."""
    import scripts.ages_converter as ac
    monkeypatch.setattr(ac, "REPO_ROOT", tmp_path)
    assert ac.main(["4150"]) == 0
    assert capsys.readouterr().out == "4150\n"
