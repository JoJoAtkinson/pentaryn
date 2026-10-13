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
import string
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

# python-tooling-48 [declared]: every tool carries `annotations` (was seven without).
NO_ANNOTATIONS: set[str] = set()


@pytest.mark.repo
def test_tools_without_annotations(runners):
    assert {n for n, r in runners.items() if not r.tool.annotations} == NO_ANNOTATIONS


# scripts/mcp/README.md: every tool declares these five keys and this file fails if one is missing.
REQUIRED_ANNOTATIONS = {"title", "readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"}
# py-mcp-ext-1 [declared]: the feedback_reports.py tools now carry a `title` too, so no gaps.
KNOWN_MISSING_ANNOTATIONS: dict[str, list[str]] = {}


@pytest.mark.repo
def test_every_tool_declares_the_five_annotation_keys(runners):
    gaps = {n: sorted(REQUIRED_ANNOTATIONS - (r.tool.annotations or {}).keys())
            for n, r in runners.items()}
    assert {n: miss for n, miss in gaps.items() if miss} == KNOWN_MISSING_ANNOTATIONS


@pytest.mark.repo
@pytest.mark.parametrize("name, title", [
    ("feedback_list", "List feedback reports"), ("feedback_next", "Next feedback report"),
    ("feedback_get", "Get a feedback report"), ("feedback_resolve", "Resolve a feedback report"),
])
def test_py_mcp_ext_1_feedback_tools_have_titles(runners, name, title):
    """py-mcp-ext-1: the feedback_* tools declare a title beside their shared hints."""
    assert (runners[name].tool.annotations or {}).get("title") == title


@pytest.mark.repo
@pytest.mark.parametrize("name, read_only, destructive", [
    ("year_to_age", True, False), ("age_to_year", True, False), ("age_convert", True, False),
    ("check_lore_links", True, False), ("build_timeline_svg", False, False),
    ("build_timeline_key", False, False), ("fix_md_links", False, True),
])
def test_annotation_hints_match_what_the_tool_does(runners, name, read_only, destructive):
    a = runners[name].tool.annotations
    assert (a["readOnlyHint"], a["destructiveHint"], a["openWorldHint"]) == \
        (read_only, destructive, False)


OWNED_BOOKS = "prefer the owned PHB/DMG/MM via game.pentaryn.rules (context/foundry/rules-lookup.md)"


@pytest.mark.repo
@pytest.mark.parametrize("name", ["search_rules", "get_rule_section", "search_spells",
                                  "get_spell_details", "search_srd", "search_monsters",
                                  "get_monster_details"])
def test_srd_rule_tools_point_at_the_owned_books(runners, name):
    """python-tooling-48 (c): the SRD tools that look like the default path say they are not."""
    assert OWNED_BOOKS in runners[name].tool.description
    assert (REPO_ROOT / "context/foundry/rules-lookup.md").exists()


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
    placeholders = {field for tok in r.argv_template
                    for _, field, _, _ in string.Formatter().parse(tok) if field}
    return placeholders | set(r.bool_flags) | set(r.value_flags)


def test_mapped_sees_embedded_placeholders():
    """The server formats every template token, so '--zone={zone}' maps `zone` too."""
    r = server.ToolRunner(tool=server.Tool(name="t", description="", input_schema={}),
                          script_path=Path("t.py"), argv_template=("--zone={zone}",),
                          bool_flags={}, value_flags={})
    assert "zone" in _mapped(r)


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


def test_placeholder_values_with_braces_render_verbatim(runners, tmp_path):
    """Only template tokens are format-parsed; a value's own braces reach argv unchanged."""
    echo = tmp_path / "echo_argv.py"
    echo.write_text("import json, sys\nprint(json.dumps(sys.argv[1:]))\n")
    r = dataclasses.replace(
        runners["check_lore_links"], script_path=echo, argv_template=("{q}",),
        bool_flags={}, value_flags={}, handler=None,
    )
    assert json.loads(r.run(arguments={"q": "a {b} }{ {0}"})) == ["a {b} }{ {0}"]


@pytest.mark.repo
def test_build_argv_direct(runners):
    """argv is built without spawning a process: the KNOWN -49 zone drop, and a bare
    placeholder keeps its slot even when the value is empty."""
    assert runners["check_lore_links"]._build_argv({"zone": "x"}) == []
    r = server.ToolRunner(tool=server.Tool(name="t", description="", input_schema={}),
                          script_path=Path("t.py"), argv_template=("--a", "{v}"),
                          bool_flags={}, value_flags={})
    assert r._build_argv({"v": ""}) == ["--a", ""]


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
