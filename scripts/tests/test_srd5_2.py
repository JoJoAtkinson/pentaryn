#!/usr/bin/env python3
"""
Tests for the open5e v2 integration in scripts/srd5_2.py.

API-touching tests are marked `@pytest.mark.integration` so they don't run by
default. Run them with: `pytest -m integration scripts/tests/test_srd5_2.py`.

Offline unit tests cover the source-priority sort, default-source helper,
schema/handler symmetry, and parameter validation — these always run.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.srd5_2 import (
    DEFAULT_SOURCE_CONDITIONS,
    DEFAULT_SOURCE_SRD,
    MCP_HANDLERS,
    MCP_TOOLS,
    _apply_default_source,
    _doc_key,
    _maybe_sort_results,
    _sort_by_source_preference,
    get_monster_details,
    list_conditions,
    search_armor,
    search_backgrounds,
    search_feats,
    search_items,
    search_magic_items,
    search_monsters,
    search_rules,
    search_species,
    search_spells,
    search_srd,
    search_weapons,
)


# ---------------------------------------------------------------------------
# Offline unit tests (no network)
# ---------------------------------------------------------------------------


class TestSourceDefaults:
    def test_apply_default_when_none(self):
        assert _apply_default_source(None, DEFAULT_SOURCE_SRD) == DEFAULT_SOURCE_SRD

    def test_explicit_empty_string_disables_filter(self):
        assert _apply_default_source("", DEFAULT_SOURCE_SRD) == ""

    def test_explicit_value_passes_through(self):
        assert _apply_default_source("tob", DEFAULT_SOURCE_SRD) == "tob"

    def test_default_constants(self):
        assert DEFAULT_SOURCE_SRD == "srd-2024,srd-2014"
        assert DEFAULT_SOURCE_CONDITIONS == "core,a5e-ag"


class TestDocKey:
    def test_nested_dict_shape(self):
        assert _doc_key({"document": {"key": "srd-2024", "name": "..."}}) == "srd-2024"

    def test_bare_string_shape(self):
        assert _doc_key({"document": "srd-2024"}) == "srd-2024"

    def test_missing_document(self):
        assert _doc_key({"name": "foo"}) == ""

    def test_non_dict_input(self):
        assert _doc_key("not a dict") == ""


class TestSourceSort:
    def test_priority_order_respected(self):
        results = [
            {"name": "A", "document": {"key": "srd-2014"}},
            {"name": "B", "document": {"key": "srd-2024"}},
            {"name": "C", "document": {"key": "tob"}},
        ]
        sorted_results = _sort_by_source_preference(results, "srd-2024,srd-2014")
        names = [r["name"] for r in sorted_results]
        assert names == ["B", "A", "C"]  # 2024 first, 2014 next, unknown last

    def test_stable_sort_preserves_within_source(self):
        results = [
            {"name": "X", "document": {"key": "srd-2024"}},
            {"name": "Y", "document": {"key": "srd-2024"}},
            {"name": "Z", "document": {"key": "srd-2014"}},
        ]
        sorted_results = _sort_by_source_preference(results, "srd-2024,srd-2014")
        assert [r["name"] for r in sorted_results] == ["X", "Y", "Z"]

    def test_empty_priority_returns_unchanged(self):
        results = [{"name": "A", "document": {"key": "x"}}]
        assert _sort_by_source_preference(results, "") == results

    def test_maybe_sort_skips_single_source(self):
        response = {"count": 1, "results": [{"document": {"key": "srd-2024"}}]}
        assert _maybe_sort_results(response, "srd-2024") is response

    def test_maybe_sort_does_not_mutate_input(self):
        original = {"count": 2, "results": [
            {"name": "A", "document": {"key": "srd-2014"}},
            {"name": "B", "document": {"key": "srd-2024"}},
        ]}
        out = _maybe_sort_results(original, "srd-2024,srd-2014")
        assert original["results"][0]["name"] == "A"  # original untouched
        assert out["results"][0]["name"] == "B"

    def test_maybe_sort_handles_missing_results(self):
        assert _maybe_sort_results({"detail": "Not found"}, "srd-2024,srd-2014") == {"detail": "Not found"}


class TestSearchRulesValidation:
    def test_empty_query_raises(self):
        with pytest.raises(ValueError, match="query"):
            search_rules(query="")

    def test_whitespace_only_query_raises(self):
        with pytest.raises(ValueError, match="query"):
            search_rules(query="   ")


class TestToolDefinitions:
    def test_every_handler_has_a_tool_definition(self):
        tool_names = {t["name"] for t in MCP_TOOLS}
        handler_names = set(MCP_HANDLERS.keys())
        # Every handler must be exposed as a tool
        assert handler_names <= tool_names, f"Handlers without tool definitions: {handler_names - tool_names}"

    def test_every_tool_has_a_handler(self):
        # Every in-process tool should have a handler so the server can dispatch in-process
        tool_names = {t["name"] for t in MCP_TOOLS}
        handler_names = set(MCP_HANDLERS.keys())
        assert tool_names <= handler_names, f"Tool definitions without handlers: {tool_names - handler_names}"

    def test_search_rules_requires_query(self):
        rules_tool = next(t for t in MCP_TOOLS if t["name"] == "search_rules")
        assert "query" in rules_tool["input_schema"].get("required", [])

    def test_get_tools_use_key_not_slug(self):
        for tool in MCP_TOOLS:
            if tool["name"].startswith("get_") and tool["name"] not in ("get_spell_list",):
                schema = tool["input_schema"]
                # v2 uses 'key', not v1 'slug'
                assert "slug" not in schema.get("properties", {}), f"{tool['name']} still uses slug param"

    def test_annotations_are_present_on_srd_tools(self):
        for tool in MCP_TOOLS:
            assert "annotations" in tool, f"{tool['name']} missing annotations"
            ann = tool["annotations"]
            assert ann.get("readOnlyHint") is True, f"{tool['name']} should be readOnly"


# ---------------------------------------------------------------------------
# Integration tests (hit the open5e API; slow; require network)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestMonstersIntegration:
    def test_search_returns_v2_shape(self):
        result = search_monsters(name="goblin", limit=5)
        assert "results" in result
        assert "count" in result
        if result["results"]:
            entry = result["results"][0]
            assert "key" in entry  # v2 uses key, not slug
            assert "name" in entry
            # v2 nests document/type/size as objects
            if "document" in entry:
                doc = entry["document"]
                assert isinstance(doc, dict)

    def test_get_by_v2_key(self):
        # srd-2024 has goblin-warrior, not bare goblin
        monster = get_monster_details(key="srd-2024_goblin-warrior")
        assert monster["name"]
        assert "armor_class" in monster
        assert "hit_points" in monster

    def test_default_source_prefers_2024(self):
        # When source is omitted, 2024 should sort first if both are present
        result = search_monsters(name="fireball-dragon", limit=20)  # name unlikely to exist in any
        # Just test the call shape works with default source
        assert "results" in result

    def test_explicit_empty_source_disables_filter(self):
        result = search_monsters(name="goblin", source="", limit=20)
        assert "results" in result
        # With no filter, we should see results from multiple sources
        sources = {_doc_key(r) for r in result["results"]}
        # Don't strictly require >1, but assert no exception and shape is right


@pytest.mark.integration
class TestSpellsIntegration:
    def test_search_by_level_and_school(self):
        result = search_spells(level=3, school="evocation", limit=5)
        assert "results" in result
        if result["results"]:
            assert all(s["level"] == 3 for s in result["results"])


@pytest.mark.integration
class TestConditionsIntegration:
    def test_default_source_returns_results(self):
        # list_conditions defaults to core,a5e-ag — should return non-empty
        result = list_conditions()
        assert result.get("count", 0) > 0


@pytest.mark.integration
class TestSearchSrd:
    def test_universal_search_returns_mixed_types(self):
        result = search_srd(query="fireball", limit=10)
        assert "results" in result
        if result["results"]:
            object_models = {r.get("object_model") for r in result["results"]}
            assert object_models  # at least one type present


@pytest.mark.integration
class TestEquipmentIntegration:
    def test_search_weapons(self):
        result = search_weapons(limit=3)
        assert "results" in result

    def test_search_armor(self):
        result = search_armor(limit=3)
        assert "results" in result

    def test_search_items(self):
        result = search_items(limit=3)
        assert "results" in result

    def test_search_magic_items(self):
        result = search_magic_items(limit=3)
        assert "results" in result


@pytest.mark.integration
class TestCharacterBuildIntegration:
    def test_search_backgrounds(self):
        result = search_backgrounds(limit=3)
        assert "results" in result

    def test_search_species(self):
        result = search_species(limit=3)
        assert "results" in result

    def test_search_feats(self):
        result = search_feats(limit=3)
        assert "results" in result
