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

import scripts.srd5_2 as srd5_2
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


class TestQueryAlias:
    """`query` is accepted as an alias for `name` on name-filter search tools,
    so callers who reflexively reach for `query` (the param the free-text
    search_rules/search_srd tools use) don't hit an unexpected-kwarg error."""

    def _capture_api_get(self, monkeypatch):
        captured: dict = {}

        def fake_api_get(endpoint, params):
            captured["endpoint"] = endpoint
            captured["params"] = params
            return {"count": 0, "results": []}

        monkeypatch.setattr(srd5_2, "_api_get", fake_api_get)
        return captured

    def test_query_translates_to_name(self, monkeypatch):
        captured = self._capture_api_get(monkeypatch)
        MCP_HANDLERS["search_monsters"](query="goblin")
        assert captured["params"].get("name__icontains") == "goblin"

    def test_explicit_name_takes_precedence_over_query(self, monkeypatch):
        captured = self._capture_api_get(monkeypatch)
        MCP_HANDLERS["search_monsters"](name="kobold", query="goblin")
        assert captured["params"].get("name__icontains") == "kobold"

    def test_free_text_tool_not_wrapped(self):
        # search_rules takes `query` natively — it must not be aliased.
        assert MCP_HANDLERS["search_rules"] is search_rules

    def test_query_advertised_in_search_weapons_schema(self):
        tool = next(t for t in MCP_TOOLS if t["name"] == "search_weapons")
        assert "query" in tool["input_schema"]["properties"]


class TestClientSideNameFilter:
    """Endpoints whose Open5e filterset can't match a partial name server-side
    (partial form is None in _ENDPOINT_NAME_FORMS — e.g. /v2/weapons/,
    /v2/armor/, /v2/skills/) used to silently drop the `name` arg and return
    the whole list. Now the name is filtered client-side."""

    _WEAPONS = [
        {"key": "srd-2024_longsword", "name": "Longsword", "document": {"key": "srd-2024"}},
        {"key": "srd-2024_shortsword", "name": "Shortsword", "document": {"key": "srd-2024"}},
        {"key": "srd-2024_greatsword", "name": "Greatsword", "document": {"key": "srd-2024"}},
        {"key": "srd-2024_dagger", "name": "Dagger", "document": {"key": "srd-2024"}},
    ]

    def _fake_api(self, monkeypatch, rows):
        calls: list = []

        def fake_api_get(endpoint, params):
            calls.append({"endpoint": endpoint, "params": params})
            return {"count": len(rows), "next": None, "results": list(rows)}

        monkeypatch.setattr(srd5_2, "_api_get", fake_api_get)
        return calls

    def _names(self, result):
        return {r["name"] for r in result["results"]}

    def test_partial_name_filtered_client_side(self, monkeypatch):
        self._fake_api(monkeypatch, self._WEAPONS)
        result = MCP_HANDLERS["search_weapons"](name="sword")
        assert self._names(result) == {"Longsword", "Shortsword", "Greatsword"}

    def test_partial_name_match_is_case_insensitive(self, monkeypatch):
        self._fake_api(monkeypatch, self._WEAPONS)
        result = MCP_HANDLERS["search_weapons"](name="SWORD")
        assert self._names(result) == {"Longsword", "Shortsword", "Greatsword"}

    def test_overfetches_so_limit_does_not_hide_matches(self, monkeypatch):
        # The endpoint can't filter server-side, so the fetch must request the
        # whole list — truncation to the caller's `limit` happens after filtering.
        calls = self._fake_api(monkeypatch, self._WEAPONS)
        result = MCP_HANDLERS["search_weapons"](name="sword", limit=2)
        assert calls[0]["params"]["limit"] == srd5_2._CLIENT_FILTER_FETCH_LIMIT
        assert len(result["results"]) == 2
        # A2-L4: after the [:limit] slice, `count` is clamped to match the
        # truncated result set so `len(results) == count` holds (was a stale 3).
        assert result["count"] == 2

    def test_count_exact_when_matches_fit_under_limit(self, monkeypatch):
        # When all name matches fit under `limit`, `count` is the exact match
        # count (no truncation) — three swords, limit 10.
        self._fake_api(monkeypatch, self._WEAPONS)
        result = MCP_HANDLERS["search_weapons"](name="sword", limit=10)
        assert len(result["results"]) == 3
        assert result["count"] == 3

    def test_exact_match_uses_server_side_filter(self, monkeypatch):
        # /v2/weapons/ supports name__iexact — exact match must not over-fetch.
        calls = self._fake_api(monkeypatch, self._WEAPONS)
        MCP_HANDLERS["search_weapons"](name="Longsword", match="exact")
        assert calls[0]["params"].get("name__iexact") == "Longsword"
        assert calls[0]["params"]["limit"] != srd5_2._CLIENT_FILTER_FETCH_LIMIT

    def test_generic_list_partial_name_filtered_client_side(self, monkeypatch):
        skills = [
            {"key": "athletics", "name": "Athletics"},
            {"key": "acrobatics", "name": "Acrobatics"},
            {"key": "stealth", "name": "Stealth"},
        ]
        self._fake_api(monkeypatch, skills)
        result = MCP_HANDLERS["list_skills"](name="ath")
        assert self._names(result) == {"Athletics"}


class TestApiGetErrorHandling:
    """`_api_get` must convert raw transport faults into clean, actionable
    `ValueError`s — a bare `requests` exception (which leaks the upstream URL
    and reads like an internal crash) must never reach an MCP client. Every
    SRD tool funnels through this helper, so this is the single highest-traffic
    error path in the module. (A4-H1 / B3-F6.)"""

    class _FakeResponse:
        def __init__(self, status_code, json_value=None, json_exc=None):
            self.status_code = status_code
            self._json_value = json_value
            self._json_exc = json_exc

        def json(self):
            if self._json_exc is not None:
                raise self._json_exc
            return self._json_value

    class _FakeSession:
        """Stands in for the CachedSession; `.get` returns/raises whatever the
        test wired up. No network, no real `requests` round-trip."""

        def __init__(self, *, response=None, raises=None):
            self._response = response
            self._raises = raises
            self.calls = []

        def get(self, url, params=None, timeout=None):
            self.calls.append({"url": url, "params": params, "timeout": timeout})
            if self._raises is not None:
                raise self._raises
            return self._response

    def _install_session(self, monkeypatch, session):
        monkeypatch.setattr(srd5_2, "_get_session", lambda: session)

    def test_404_raises_clean_valueerror_with_key_guidance(self, monkeypatch):
        self._install_session(
            monkeypatch, self._FakeSession(response=self._FakeResponse(404)),
        )
        with pytest.raises(ValueError) as excinfo:
            srd5_2._api_get("/v2/creatures/does-not-exist/")
        msg = str(excinfo.value)
        assert "404" in msg
        # Actionable: tells the caller the remedy (re-run search_*).
        assert "search_*" in msg
        # No raw requests exception type name leaked.
        assert "HTTPError" not in msg
        assert "Client Error" not in msg

    def test_timeout_raises_retryable_valueerror(self, monkeypatch):
        self._install_session(
            monkeypatch,
            self._FakeSession(raises=srd5_2.requests.Timeout("read timed out")),
        )
        with pytest.raises(ValueError) as excinfo:
            srd5_2._api_get("/v2/spells/")
        msg = str(excinfo.value)
        assert "timed out" in msg
        assert "retry" in msg.lower()
        assert "Timeout" not in msg  # no raw exception class name

    def test_connection_error_raises_unreachable_valueerror(self, monkeypatch):
        self._install_session(
            monkeypatch,
            self._FakeSession(
                raises=srd5_2.requests.ConnectionError("name resolution failed"),
            ),
        )
        with pytest.raises(ValueError) as excinfo:
            srd5_2._api_get("/v2/rules/")
        msg = str(excinfo.value)
        assert "unreachable" in msg.lower()
        assert "ConnectionError" not in msg

    def test_non_json_body_raises_clean_valueerror(self, monkeypatch):
        # Open5e 5xx HTML error page: 200-ish status survives the >=400 checks
        # but .json() blows up. The JSONDecodeError must be converted.
        import json as _json

        bad = self._FakeResponse(
            503, json_exc=_json.JSONDecodeError("Expecting value", "<html>", 0),
        )
        # status 503 trips the >=400 branch first; use 200 to reach .json().
        bad_200 = self._FakeResponse(
            200, json_exc=_json.JSONDecodeError("Expecting value", "<html>", 0),
        )
        self._install_session(monkeypatch, self._FakeSession(response=bad_200))
        with pytest.raises(ValueError) as excinfo:
            srd5_2._api_get("/v2/search/")
        msg = str(excinfo.value)
        assert "non-JSON" in msg
        assert "JSONDecodeError" not in msg  # raw exception class not surfaced
        # The 503 case is caught by the >=400 branch — also a clean ValueError.
        self._install_session(monkeypatch, self._FakeSession(response=bad))
        with pytest.raises(ValueError) as excinfo2:
            srd5_2._api_get("/v2/search/")
        assert "503" in str(excinfo2.value)

    def test_5xx_status_raises_upstream_fault_valueerror(self, monkeypatch):
        self._install_session(
            monkeypatch,
            self._FakeSession(response=self._FakeResponse(500)),
        )
        with pytest.raises(ValueError) as excinfo:
            srd5_2._api_get("/v2/creatures/")
        msg = str(excinfo.value)
        assert "500" in msg
        assert "upstream" in msg.lower()

    def test_success_returns_parsed_json(self, monkeypatch):
        ok = self._FakeResponse(200, json_value={"count": 1, "results": [{"x": 1}]})
        self._install_session(monkeypatch, self._FakeSession(response=ok))
        out = srd5_2._api_get("/v2/creatures/", {"limit": 5})
        assert out == {"count": 1, "results": [{"x": 1}]}


class TestSearchRulesTwoStep:
    """`search_rules` is a two-step tool (/v2/search/ for relevance, /v2/rules/
    for full records). Pins: multi-source no longer drops 2nd-source rules in
    Step 1 (A2-L3); `count == len(results)` after the fix (A3-E5); the `keys=`
    short-circuit still works; relevance order is preserved; `ordering` is gone
    from the signature (B1-L2)."""

    # Two rule records keyed by source. `search_resp` decides which keys are
    # "found" by the relevance step.
    _RULES_2024 = {
        "key": "srd-2024_cover", "name": "Cover",
        "document": {"key": "srd-2024"},
    }
    _RULES_2014 = {
        "key": "srd-2014_cover", "name": "Cover (2014)",
        "document": {"key": "srd-2014"},
    }

    def _mock_two_step(self, monkeypatch, *, search_keys, rule_rows):
        """Wire `_api_get`: /v2/search/ returns object_pk rows for `search_keys`,
        /v2/rules/ returns `rule_rows`. Records every call for assertion."""
        calls: list = []

        def fake_api_get(endpoint, params=None):
            calls.append({"endpoint": endpoint, "params": params or {}})
            if endpoint == "/v2/search/":
                return {
                    "count": len(search_keys),
                    "results": [{"object_pk": k, "object_model": "rule"} for k in search_keys],
                }
            if endpoint == "/v2/rules/":
                # Emulate /v2/rules/ honoring document__key__in if present.
                src = (params or {}).get("document__key__in")
                rows = rule_rows
                if src:
                    allowed = set(src.split(","))
                    rows = [r for r in rule_rows if r["document"]["key"] in allowed]
                # Open5e reports its own count; deliberately a different number
                # to prove search_rules overrides it with len(results).
                return {"count": 999, "results": list(rows)}
            raise AssertionError(f"unexpected endpoint {endpoint}")

        monkeypatch.setattr(srd5_2, "_api_get", fake_api_get)
        return calls

    def test_multi_source_does_not_scope_step1(self, monkeypatch):
        # Both editions' keys must be discoverable: Step 1 must NOT send
        # document_pk when the caller passed a comma-separated source.
        calls = self._mock_two_step(
            monkeypatch,
            search_keys=["srd-2024_cover", "srd-2014_cover"],
            rule_rows=[self._RULES_2024, self._RULES_2014],
        )
        result = search_rules(query="cover", source="srd-2024,srd-2014")
        search_call = next(c for c in calls if c["endpoint"] == "/v2/search/")
        assert "document_pk" not in search_call["params"], (
            "multi-source must leave Step 1 unscoped so no source is dropped"
        )
        # Both editions survive into the final result.
        keys = {r["key"] for r in result["results"]}
        assert keys == {"srd-2024_cover", "srd-2014_cover"}

    def test_single_source_still_scopes_step1(self, monkeypatch):
        calls = self._mock_two_step(
            monkeypatch,
            search_keys=["srd-2024_cover"],
            rule_rows=[self._RULES_2024],
        )
        search_rules(query="cover", source="srd-2024")
        search_call = next(c for c in calls if c["endpoint"] == "/v2/search/")
        assert search_call["params"].get("document_pk") == "srd-2024"

    def test_count_equals_len_results(self, monkeypatch):
        # /v2/rules/ reports count=999; search_rules must override with the
        # materialised result length so count == len(results).
        self._mock_two_step(
            monkeypatch,
            search_keys=["srd-2024_cover", "srd-2014_cover"],
            rule_rows=[self._RULES_2024, self._RULES_2014],
        )
        result = search_rules(query="cover", source="srd-2024,srd-2014")
        assert result["count"] == len(result["results"]) == 2

    def test_count_reflects_step2_source_filter(self, monkeypatch):
        # Step 1 finds both keys; a single-source filter drops the 2014 one in
        # Step 2 — count must follow the filtered result set, not 999.
        self._mock_two_step(
            monkeypatch,
            search_keys=["srd-2024_cover", "srd-2014_cover"],
            rule_rows=[self._RULES_2024, self._RULES_2014],
        )
        result = search_rules(query="cover", source="srd-2024")
        assert {r["key"] for r in result["results"]} == {"srd-2024_cover"}
        assert result["count"] == len(result["results"]) == 1

    def test_relevance_order_preserved(self, monkeypatch):
        # /v2/search/ ranks 2014 first; /v2/rules/ returns alphabetically
        # (2024 first). search_rules must restore the search ranking.
        def fake_api_get(endpoint, params=None):
            if endpoint == "/v2/search/":
                return {"results": [
                    {"object_pk": "srd-2014_cover", "object_model": "rule"},
                    {"object_pk": "srd-2024_cover", "object_model": "rule"},
                ]}
            if endpoint == "/v2/rules/":
                # Deliberately reversed vs. the search ranking.
                return {"count": 2, "results": [self._RULES_2024, self._RULES_2014]}
            raise AssertionError(endpoint)

        monkeypatch.setattr(srd5_2, "_api_get", fake_api_get)
        result = search_rules(query="cover", source="")
        assert [r["key"] for r in result["results"]] == [
            "srd-2014_cover", "srd-2024_cover",
        ]

    def test_keys_short_circuit_skips_search(self, monkeypatch):
        calls = self._mock_two_step(
            monkeypatch,
            search_keys=[],  # would yield nothing if Step 1 were hit
            rule_rows=[self._RULES_2024],
        )
        result = search_rules(query="cover", keys="srd-2024_cover")
        endpoints = [c["endpoint"] for c in calls]
        assert "/v2/search/" not in endpoints, "keys= must skip the search step"
        assert calls[0]["endpoint"] == "/v2/rules/"
        assert calls[0]["params"]["key__in"] == "srd-2024_cover"
        assert {r["key"] for r in result["results"]} == {"srd-2024_cover"}

    def test_empty_search_result_returns_empty(self, monkeypatch):
        self._mock_two_step(monkeypatch, search_keys=[], rule_rows=[])
        result = search_rules(query="nonexistent-rule")
        assert result == {"count": 0, "results": []}

    def test_ordering_param_removed_from_signature(self):
        # B1-L2: the no-op `ordering` param was dropped from search_rules.
        import inspect
        params = inspect.signature(search_rules).parameters
        assert "ordering" not in params

    def test_ordering_removed_from_schema(self):
        tool = next(t for t in MCP_TOOLS if t["name"] == "search_rules")
        assert "ordering" not in tool["input_schema"]["properties"]
        assert "ordering" not in tool.get("value_flags", {})


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


class TestNormalizeCr:
    """_normalize_cr — Open5e's challenge_rating filter needs a decimal;
    the natural D&D fraction form must be converted (else HTTP 400)."""

    def test_quarter_fraction(self):
        assert srd5_2._normalize_cr("1/4") == "0.25"

    def test_half_fraction(self):
        assert srd5_2._normalize_cr("1/2") == "0.5"

    def test_eighth_fraction(self):
        assert srd5_2._normalize_cr("1/8") == "0.125"

    def test_whole_number_passthrough(self):
        assert srd5_2._normalize_cr("5") == "5"

    def test_decimal_passthrough(self):
        assert srd5_2._normalize_cr("0.25") == "0.25"

    def test_whitespace_stripped(self):
        assert srd5_2._normalize_cr("  1/4  ") == "0.25"

    def test_garbage_fraction_returned_asis(self):
        # Non-numeric or zero-denominator input is returned unchanged
        # rather than crashing.
        assert srd5_2._normalize_cr("1/0") == "1/0"
        assert srd5_2._normalize_cr("a/b") == "a/b"
