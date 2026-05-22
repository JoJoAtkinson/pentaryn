"""Test fixtures for combat-runner GUI tests.

- Sets QT_QPA_PLATFORM=offscreen before any Qt module imports, so widget tests
  run headlessly in CI / over SSH / on the build daemon.
- Provides `sample_encounter` and `sample_npc` fixtures that build minimal
  EncounterState / NPCState instances for unit tests without needing the
  actual .md / actions.jsonl files.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

# Force offscreen platform BEFORE any Qt import. This must be set before
# pytest-qt's qtbot fixture initializes QApplication.
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

# Make `combat-runner/gui` importable without an installed package.
_REPO_ROOT = Path(__file__).resolve().parents[2]
_GUI_ROOT = _REPO_ROOT / "combat-runner"
if str(_GUI_ROOT) not in sys.path:
    sys.path.insert(0, str(_GUI_ROOT))

import pytest


@pytest.fixture
def sample_npc():
    """Single-creature NPC. Mirrors glacier-stalker for tests."""
    from gui.state import NPCState
    return NPCState(
        slug="glacier-stalker",
        name="Glacier Stalker",
        max_hp=84,
        ac=16,
        speed="50 ft., climb 40 ft.",
        cr=5.0,
        immunities=("cold",),
    )


@pytest.fixture
def mob_npc():
    """3-member mob, each at 12 HP. Mirrors a gnoll pack for tests."""
    from gui.state import NPCState
    return NPCState(
        slug="gnoll-pack",
        name="Gnoll Pack",
        max_hp=12,
        ac=14,
        speed="30 ft.",
        cr=0.5,
        count=3,
    )


@pytest.fixture
def sample_encounter(sample_npc):
    """Encounter with one Glacier Stalker."""
    from gui.state import EncounterState
    return EncounterState(
        name="mountin-pass",
        root=Path("/tmp/test-encounter"),
        log_path=Path("/tmp/test-log.md"),
        npcs=[sample_npc],
    )


@pytest.fixture
def sample_actions() -> list[dict[str, Any]]:
    """A subset of glacier-stalker actions (matches combat_actions_db.list_actions output)."""
    return [
        {
            "npc": "glacier-stalker",
            "action": "multiattack",
            "type": "multiattack",
            "verbs": ["attack", "hit", "swing", "rake", "claw", "bite", "melee", "multiattack"],
            "narration_preview": "It lunges...",
        },
        {
            "npc": "glacier-stalker",
            "action": "frozen_bile",
            "type": "single_attack",
            "verbs": ["ranged", "spit", "bile", "spitball", "throw"],
            "narration_preview": "Hocks a glob...",
        },
        {
            "npc": "glacier-stalker",
            "action": "glacial_roar",
            "type": "area",
            "verbs": ["breath", "roar", "cone", "frost breath", "blast"],
            "narration_preview": "Throws its head...",
        },
        {
            "npc": "glacier-stalker",
            "action": "snow_vanish",
            "type": "utility",
            "verbs": ["vanish", "hide", "snowfade", "disappear", "sneak"],
            "narration_preview": "Folds itself...",
        },
        {
            "npc": "glacier-stalker",
            "action": "pounce",
            "type": "multiattack",
            "verbs": ["pounce", "leap", "charge", "lunge"],
            "narration_preview": "Coils, then explodes...",
        },
    ]
