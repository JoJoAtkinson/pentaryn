"""(A) search_spells / search_rules default to source='srd-2024' so the cache
can't leak 2014 entries into authoring sessions.

Behavior contract:
  * Default (no source kwarg): hard-filter to srd-2024. Only 2024 results return.
  * Explicit `source=''`: opt-out — no filter, no priority sort (raw API order).
  * Explicit `source='srd-2014'`: hard-filter to 2014 (user wants the old rule).
  * Other sources (third-party, multi-list): unchanged.

get_spell_details / get_rule_section are NOT changed — they pin via the v2 key
(`srd-2024_counterspell`), so the edition is encoded in the request itself.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_search_spells_default_source_is_srd_2024():
    """The function default must be `source='srd-2024'`, not None."""
    import inspect
    from srd5_2 import search_spells
    sig = inspect.signature(search_spells)
    src_param = sig.parameters["source"]
    assert src_param.default == "srd-2024", (
        f"search_spells default source must be 'srd-2024'; got {src_param.default!r}"
    )


def test_search_rules_default_source_is_srd_2024():
    import inspect
    from srd5_2 import search_rules
    sig = inspect.signature(search_rules)
    src_param = sig.parameters["source"]
    assert src_param.default == "srd-2024", (
        f"search_rules default source must be 'srd-2024'; got {src_param.default!r}"
    )


def test_search_spells_returns_only_srd_2024_with_default():
    """Live integration: with no source kwarg, every result's document.key
    must be 'srd-2024'."""
    from srd5_2 import search_spells
    result = search_spells(name="counterspell", match="exact")
    assert result["count"] >= 1, "counterspell not found at all"
    for r in result["results"]:
        doc_key = r.get("document", {}).get("key", "")
        assert doc_key == "srd-2024", (
            f"default search returned non-2024 result: {r.get('key')!r} from {doc_key!r}"
        )


def test_search_spells_explicit_empty_source_disables_filter():
    """Explicit `source=''` opts out of the new default and returns all
    sources (the legacy 'all sources, ranked' behavior). `dedupe=False` so
    duplicate-name variants from different sources don't collapse."""
    from srd5_2 import search_spells
    result = search_spells(name="counterspell", match="exact",
                           source="", dedupe=False)
    doc_keys = {r.get("document", {}).get("key", "") for r in result["results"]}
    # Should see srd-2014 AND srd-2024 (and likely third-party) when filter is off.
    assert "srd-2024" in doc_keys, (
        f"empty-source opt-out should include srd-2024; got {doc_keys!r}"
    )
    assert "srd-2014" in doc_keys, (
        f"empty-source opt-out should include srd-2014 (the whole point of opting "
        f"out is to see legacy entries); got {doc_keys!r}"
    )


def test_search_spells_explicit_srd_2014_overrides_default():
    """Explicit `source='srd-2014'` lets the user fetch the legacy entry on
    purpose (rare, but should work)."""
    from srd5_2 import search_spells
    result = search_spells(name="counterspell", match="exact", source="srd-2014")
    assert result["count"] >= 1
    doc_keys = {r.get("document", {}).get("key", "") for r in result["results"]}
    assert doc_keys == {"srd-2014"}, (
        f"explicit srd-2014 should return only 2014 results; got {doc_keys!r}"
    )
