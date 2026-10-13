"""A third-party manifest with the wrong JSON shapes is a HOLD, never a crash (ROB-11).

Manifests are fetched from other people's servers. A payload that is a list, a
``compatibility`` that is a string, or a ``requires`` entry that is a bare id must not
raise out of the weekly scan — resolve coerces what it cannot use, and the risk check
holds the package with a "malformed manifest" reason.
"""

from __future__ import annotations

from pathlib import Path

from scripts.foundry.update import risk, upstream
from scripts.foundry.update.inventory import Package

MANIFEST = "https://example.com/m/module.json"


def _pkg() -> Package:
    return Package(type="module", id="m", title="m", version="1.0.0", path=Path("/x"),
                   manifest=MANIFEST)


def _serve(monkeypatch, payload) -> None:
    monkeypatch.setattr(upstream, "_cached", lambda key, produce, ttl=0: produce())
    monkeypatch.setattr(upstream, "fetch_json",
                        lambda url, **kw: payload if url == MANIFEST else None)


def test_rob11_from_manifest_rejects_a_non_dict_payload(monkeypatch):
    _serve(monkeypatch, ["not", "a", "manifest"])
    assert upstream._from_manifest(MANIFEST) is None


def test_rob11_resolve_coerces_non_mapping_compatibility_and_relationships(monkeypatch):
    _serve(monkeypatch, {"version": "1.1.0", "compatibility": "13",
                         "relationships": ["lib-wrapper"]})
    up = upstream.resolve(_pkg(), notes=False)
    assert up.latest == "1.1.0"
    assert up.compatibility == {} and up.relationships == {}


def _decide(relationships: dict) -> risk.Decision:
    up = upstream.Upstream(id="m", type="module", installed="1.0.0", latest="1.1.0",
                           relationships=relationships)
    return risk.classify_package(_pkg(), up, policy={}, core_version="13.351",
                                 system_version="5.1.0", installed_ids={"lib-wrapper"},
                                 seen={"m": "1.0.0"})


def test_rob11_malformed_requires_and_conflicts_entries_hold_the_package():
    d = _decide({"requires": ["lib-wrapper", {"id": "lib-wrapper"}],
                 "conflicts": [42], "systems": ["dnd5e"]})
    assert d.bucket == risk.HOLD
    assert "malformed manifest" in d.reasons


def test_rob11_well_formed_relationships_still_pass():
    d = _decide({"requires": [{"id": "lib-wrapper"}], "systems": [{"id": "dnd5e"}]})
    assert d.bucket == risk.AUTO
    assert "malformed manifest" not in d.reasons
