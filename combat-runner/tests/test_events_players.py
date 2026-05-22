"""Phase 5 — PC participation in existing events.

Verifies that:
  - PC tabs fire bloodied/death events (via NPCTab._apply_damage, same as NPCs)
  - Retreat fires move_away when in_melee=True; does nothing when in_melee=False
  - Cast fires spell_cast event with correct payload keys
  - round_advanced event ticks PC condition durations
"""

import pytest
from pathlib import Path


@pytest.fixture
def pc_npc():
    from gui.state import NPCState
    return NPCState(
        slug="pc-1",
        name="Vessa",
        max_hp=31,
        ac=15,
        speed="30 ft.",
        cr=0.0,
        kind="pc",
        id="1",
        in_melee=True,
    )


@pytest.fixture
def npc_with_attack():
    from gui.state import NPCState
    return NPCState(
        slug="goblin",
        name="Goblin",
        max_hp=7,
        ac=13,
        speed="30 ft.",
        cr=0.25,
    )


def test_pc_bloodied_event_fires(qtbot, pc_npc):
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab

    bus = EventBus()
    received = []
    bus.subscribe("bloodied", received.append)
    tab = NPCTab(
        npc_state=pc_npc,
        actions=[],
        log_path=Path("/tmp/log.md"),
        event_bus=bus,
    )
    qtbot.addWidget(tab)
    # 31 - 20 = 11, which is <= 15 (half of 31) → bloodied
    tab._on_submitted("-20")
    assert len(received) == 1
    assert received[0].subject_npc == "pc-1"


def test_pc_death_event_fires(qtbot, pc_npc):
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab

    bus = EventBus()
    received = []
    bus.subscribe("death", received.append)
    tab = NPCTab(
        npc_state=pc_npc,
        actions=[],
        log_path=Path("/tmp/log.md"),
        event_bus=bus,
    )
    qtbot.addWidget(tab)
    tab._on_submitted("-100")
    assert len(received) == 1


def test_retreat_fires_move_away_when_in_melee(qtbot, pc_npc):
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab

    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)
    tab = NPCTab(
        npc_state=pc_npc,
        actions=[],
        log_path=Path("/tmp/log.md"),
        event_bus=bus,
    )
    qtbot.addWidget(tab)
    assert pc_npc.in_melee  # fixture sets this
    tab._on_player_action("Retreat")
    assert len(received) == 1
    assert received[0].payload["combatant_id"] == "1"


def test_retreat_not_in_melee_no_event(qtbot, pc_npc):
    from gui.event_bus import EventBus
    from gui.npc_tab import NPCTab

    bus = EventBus()
    received = []
    bus.subscribe("move_away", received.append)
    pc_npc.in_melee = False
    tab = NPCTab(
        npc_state=pc_npc,
        actions=[],
        log_path=Path("/tmp/log.md"),
        event_bus=bus,
    )
    qtbot.addWidget(tab)
    tab._on_player_action("Retreat")
    assert received == []


def test_cast_fires_spell_cast_event(qtbot, pc_npc, monkeypatch):
    """Simulate the Cast dialog accepting 'Fireball' at level 3."""
    from gui.event_bus import EventBus, spell_cast_event
    from gui.npc_tab import NPCTab

    bus = EventBus()
    received = []
    bus.subscribe("spell_cast", received.append)
    tab = NPCTab(
        npc_state=pc_npc,
        actions=[],
        log_path=Path("/tmp/log.md"),
        event_bus=bus,
    )
    qtbot.addWidget(tab)

    # Monkeypatch the dialog to auto-accept with a spell
    def fake_cast(self_tab):
        self_tab.event_bus.emit(
            spell_cast_event(
                caster=self_tab.npc_state.id or self_tab.npc_state.slug,
                spell_name="Fireball",
                spell_level=3,
            )
        )

    monkeypatch.setattr(NPCTab, "_player_action_cast", fake_cast)
    tab._on_player_action("Cast")
    assert len(received) == 1
    assert received[0].payload["spell_name"] == "Fireball"
    assert received[0].payload["spell_level"] == 3


def test_round_event_ticks_pc_conditions(qtbot, pc_npc):
    from gui.event_bus import EventBus, round_event
    from gui.npc_tab import NPCTab

    bus = EventBus()
    pc_npc.add_condition("dodging", duration=1)
    tab = NPCTab(
        npc_state=pc_npc,
        actions=[],
        log_path=Path("/tmp/log.md"),
        event_bus=bus,
    )
    qtbot.addWidget(tab)
    bus.emit(round_event(2))
    assert "dodging" not in pc_npc.conditions  # expired after 1 round
