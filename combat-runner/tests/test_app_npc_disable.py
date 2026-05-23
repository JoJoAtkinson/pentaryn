"""Tests for build_encounter_state behavior when count<=0 (NPC disabled)."""

import pytest
from pathlib import Path


@pytest.fixture
def two_npc_encounter(tmp_path):
    """Build a synthetic encounter with two NPCs whose .md files exist on disk
    (the loader reads HP/AC from the markdown)."""
    from gui.encounter_picker import DiscoveredEncounter, DiscoveredNPC
    # Minimal .md content the loader can chew on
    for slug, hp, ac in [("a-derro", 27, 15), ("b-derro", 33, 14)]:
        (tmp_path / f"{slug}.md").write_text(
            "---\n"
            f"name: {slug.title()}\n"
            "tags: [\"#combat-runner\"]\n"
            "---\n"
            f"\n**HP** {hp} (5d8+5) **·** **AC** {ac} (leather) **·** **Speed** 30 ft. **·** **CR** 1/4\n",
            encoding="utf-8",
        )
    npcs = [
        DiscoveredNPC(slug="a-derro", name="A Derro", md_path=tmp_path / "a-derro.md"),
        DiscoveredNPC(slug="b-derro", name="B Derro", md_path=tmp_path / "b-derro.md"),
    ]
    return DiscoveredEncounter(name="test-enc", root=tmp_path, npcs=npcs, latest_mtime=0.0)


def test_zero_count_npc_is_skipped(two_npc_encounter):
    """An NPC with count=0 must not appear in the encounter combatants list."""
    from gui.app import build_encounter_state
    es = build_encounter_state(two_npc_encounter, counts={"a-derro": 0, "b-derro": 2})
    slugs = [n.slug for n in es.npcs if getattr(n, "kind", "npc") != "pc"]
    assert "a-derro" not in slugs, "count=0 NPC should be excluded"
    assert "b-derro" in slugs, "non-zero NPC should remain"


def test_missing_count_defaults_to_one(two_npc_encounter):
    """Back-compat: an NPC with no entry in counts dict still loads (default 1)."""
    from gui.app import build_encounter_state
    es = build_encounter_state(two_npc_encounter, counts={})
    slugs = [n.slug for n in es.npcs if getattr(n, "kind", "npc") != "pc"]
    assert "a-derro" in slugs
    assert "b-derro" in slugs


def test_all_zeros_yields_no_npcs(two_npc_encounter):
    from gui.app import build_encounter_state
    es = build_encounter_state(two_npc_encounter, counts={"a-derro": 0, "b-derro": 0})
    npc_only = [n for n in es.npcs if getattr(n, "kind", "npc") != "pc"]
    assert npc_only == []
