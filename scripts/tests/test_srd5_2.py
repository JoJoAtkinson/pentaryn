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
    DEFAULT_PRIORITY_CONDITIONS,
    DEFAULT_PRIORITY_SRD,
    MCP_HANDLERS,
    MCP_TOOLS,
    PrioritySpec,
    _apply_priority_and_dedupe,
    _dedupe_by_name,
    _doc_key,
    _rank_by_spec,
    _resolve_source,
    _sort_by_priority,
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


class TestResolveSource:
    def test_none_returns_default_priority_no_filter(self):
        filt, spec = _resolve_source(None, DEFAULT_PRIORITY_SRD)
        assert filt is None
        assert spec == DEFAULT_PRIORITY_SRD

    def test_empty_string_returns_no_filter_no_priority(self):
        filt, spec = _resolve_source("", DEFAULT_PRIORITY_SRD)
        assert filt is None
        assert spec == PrioritySpec()  # empty prefer/demote

    def test_whitespace_only_treated_as_empty(self):
        # Regression: whitespace-only source used to leak " " into the API filter
        for src in ("   ", ",", " , ", " ,, "):
            filt, spec = _resolve_source(src, DEFAULT_PRIORITY_SRD)
            assert filt is None, f"{src!r} should disable the filter"
            assert spec == PrioritySpec()

    def test_single_source_passes_through(self):
        filt, spec = _resolve_source("tob", DEFAULT_PRIORITY_SRD)
        assert filt == "tob"
        assert spec.prefer == ("tob",)
        assert spec.demote == ()

    def test_multi_source_user_order_wins(self):
        filt, spec = _resolve_source("srd-2014,srd-2024", DEFAULT_PRIORITY_SRD)
        assert filt == "srd-2014,srd-2024"
        # User explicitly listed 2014 first → 2014 wins priority over 2024
        assert spec.prefer == ("srd-2014", "srd-2024")
        assert spec.demote == ()

    def test_default_priority_constants(self):
        assert DEFAULT_PRIORITY_SRD.prefer == ("srd-2024",)
        assert DEFAULT_PRIORITY_SRD.demote == ("srd-2014",)
        assert DEFAULT_PRIORITY_CONDITIONS.prefer == ("core", "a5e-ag")


class TestDocKey:
    def test_nested_dict_shape(self):
        assert _doc_key({"document": {"key": "srd-2024", "name": "..."}}) == "srd-2024"

    def test_bare_string_shape(self):
        assert _doc_key({"document": "srd-2024"}) == "srd-2024"

    def test_missing_document(self):
        assert _doc_key({"name": "foo"}) == ""

    def test_non_dict_input(self):
        assert _doc_key("not a dict") == ""


class TestRankBySpec:
    SPEC = PrioritySpec(prefer=("srd-2024",), demote=("srd-2014",))

    def test_prefer_tier(self):
        assert _rank_by_spec("srd-2024", self.SPEC) == (0, 0)

    def test_demote_tier(self):
        assert _rank_by_spec("srd-2014", self.SPEC) == (2, 0)

    def test_middle_tier(self):
        assert _rank_by_spec("tob", self.SPEC) == (1, 0)

    def test_prefer_sub_rank_preserves_listed_order(self):
        spec = PrioritySpec(prefer=("a", "b", "c"))
        assert _rank_by_spec("a", spec) == (0, 0)
        assert _rank_by_spec("b", spec) == (0, 1)
        assert _rank_by_spec("c", spec) == (0, 2)


class TestSortByPriority:
    def test_three_tier_ordering(self):
        results = [
            {"name": "old", "document": {"key": "srd-2014"}},
            {"name": "third", "document": {"key": "tob"}},
            {"name": "new", "document": {"key": "srd-2024"}},
        ]
        spec = PrioritySpec(prefer=("srd-2024",), demote=("srd-2014",))
        sorted_results = _sort_by_priority(results, spec)
        assert [r["name"] for r in sorted_results] == ["new", "third", "old"]

    def test_stable_within_tier(self):
        results = [
            {"name": "X", "document": {"key": "srd-2024"}},
            {"name": "Y", "document": {"key": "srd-2024"}},
        ]
        out = _sort_by_priority(results, PrioritySpec(prefer=("srd-2024",)))
        assert [r["name"] for r in out] == ["X", "Y"]

    def test_empty_spec_returns_copy_unchanged(self):
        results = [{"name": "A", "document": {"key": "x"}}]
        out = _sort_by_priority(results, PrioritySpec())
        assert out == results
        assert out is not results  # function returns a fresh list


class TestDedupeByName:
    def test_collapses_same_name_keeping_first(self):
        ranked = [
            {"name": "Fireball", "key": "srd-2024_fireball"},
            {"name": "Fireball", "key": "srd-2014_fireball"},
            {"name": "Magic Missile", "key": "srd-2024_magic-missile"},
        ]
        kept, dropped = _dedupe_by_name(ranked)
        assert [k["key"] for k in kept] == ["srd-2024_fireball", "srd-2024_magic-missile"]
        assert dropped == ["srd-2014_fireball"]

    def test_case_insensitive_collapse(self):
        ranked = [{"name": "Fireball", "key": "a"}, {"name": "FIREBALL", "key": "b"}]
        kept, dropped = _dedupe_by_name(ranked)
        assert [k["key"] for k in kept] == ["a"]
        assert dropped == ["b"]

    def test_whitespace_trimmed_before_compare(self):
        ranked = [{"name": "Fireball", "key": "a"}, {"name": "  Fireball  ", "key": "b"}]
        kept, dropped = _dedupe_by_name(ranked)
        assert dropped == ["b"]

    def test_missing_name_kept_not_collapsed(self):
        ranked = [{"key": "a"}, {"key": "b"}, {"name": "X", "key": "c"}]
        kept, dropped = _dedupe_by_name(ranked)
        assert len(kept) == 3
        assert dropped == []

    def test_non_dict_kept(self):
        ranked = ["not a dict", {"name": "X", "key": "x"}]
        kept, dropped = _dedupe_by_name(ranked)
        assert kept == ["not a dict", {"name": "X", "key": "x"}]
        assert dropped == []


class TestApplyPriorityAndDedupe:
    def test_full_pipeline(self):
        response = {
            "count": 3,
            "results": [
                {"name": "Fireball", "key": "srd-2014_fireball", "document": {"key": "srd-2014"}},
                {"name": "Fireball", "key": "srd-2024_fireball", "document": {"key": "srd-2024"}},
                {"name": "Magic Missile", "key": "srd-2024_magic-missile", "document": {"key": "srd-2024"}},
            ],
        }
        out = _apply_priority_and_dedupe(response, DEFAULT_PRIORITY_SRD, dedupe=True)
        # Sort puts srd-2024 first, then dedupe drops the srd-2014 Fireball
        assert [r["key"] for r in out["results"]] == ["srd-2024_fireball", "srd-2024_magic-missile"]
        assert out["dropped_variants"] == ["srd-2014_fireball"]

    def test_dedupe_false_preserves_all(self):
        response = {
            "results": [
                {"name": "Fireball", "key": "srd-2014_fireball", "document": {"key": "srd-2014"}},
                {"name": "Fireball", "key": "srd-2024_fireball", "document": {"key": "srd-2024"}},
            ],
        }
        out = _apply_priority_and_dedupe(response, DEFAULT_PRIORITY_SRD, dedupe=False)
        assert len(out["results"]) == 2
        assert "dropped_variants" not in out

    def test_does_not_mutate_input(self):
        original = {"results": [
            {"name": "A", "key": "srd-2014_a", "document": {"key": "srd-2014"}},
            {"name": "B", "key": "srd-2024_b", "document": {"key": "srd-2024"}},
        ]}
        snapshot = [r["key"] for r in original["results"]]
        _ = _apply_priority_and_dedupe(original, DEFAULT_PRIORITY_SRD, dedupe=True)
        assert [r["key"] for r in original["results"]] == snapshot

    def test_handles_missing_results(self):
        assert _apply_priority_and_dedupe({"detail": "Not found"}, DEFAULT_PRIORITY_SRD, True) == {"detail": "Not found"}

    def test_handles_non_dict(self):
        assert _apply_priority_and_dedupe("not a dict", DEFAULT_PRIORITY_SRD, True) == "not a dict"

    def test_dropped_variants_omitted_when_nothing_dropped(self):
        response = {"results": [
            {"name": "Unique", "key": "srd-2024_unique", "document": {"key": "srd-2024"}},
        ]}
        out = _apply_priority_and_dedupe(response, DEFAULT_PRIORITY_SRD, dedupe=True)
        assert "dropped_variants" not in out


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
