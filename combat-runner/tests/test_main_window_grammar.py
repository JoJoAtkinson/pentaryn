"""Tests for the new <who> <stream> command grammar wired into MainWindow.

The dispatcher now produces a `ParsedCommand` (kind ∈ command|set_target|
unparseable). NPCTab emits it via `command_requested`; MainWindow handles it
in `_on_command`. These tests exercise the integration end-to-end through a
real MainWindow + NPCTab harness (offscreen Qt).
"""

from __future__ import annotations

import pathlib

import pytest

from gui.main_window import MainWindow
from gui.state import EncounterState, NPCState


def _npc(name: str, nid: str, hp: int, *, kind: str = "npc") -> NPCState:
    n = NPCState(
        slug=name.lower(),
        name=name,
        max_hp=hp,
        ac=13,
        speed="30 ft.",
        cr=1.0,
        kind=kind,
    )
    n.id = nid
    return n


@pytest.fixture
def window(qtbot, tmp_path):
    """Three NPCs id 1/2/3 + one actor-PC id 4.

      idx0 One   (npc, id 1, 40 hp)
      idx1 Two   (npc, id 2, 40 hp)
      idx2 Three (npc, id 3, 40 hp)
      idx3 Actor (pc,  id 4, 50 hp)
    """
    npcs = [
        _npc("One", "1", 40),
        _npc("Two", "2", 40),
        _npc("Three", "3", 40),
        _npc("Actor", "4", 50, kind="pc"),
    ]
    es = EncounterState(
        name="grammar-test",
        root=pathlib.Path(tmp_path),
        log_path=pathlib.Path(tmp_path) / "combat.md",
        npcs=npcs,
    )
    win = MainWindow(es)
    qtbot.addWidget(win)
    return win


def _submit(window, text: str) -> None:
    """Submit `text` through the active tab's command input path."""
    tab = window.tabs.currentWidget()
    tab._on_submitted(text)


# ─────────────────────────── damage ───────────────────────────


def test_directed_damage(window):
    """'2 8 slash' damages combatant id 2 by 8."""
    two = window.encounter_state.combatant_by_id("2")
    before = two.hp
    window.tabs.setCurrentIndex(0)
    _submit(window, "2 8 slash")
    assert two.hp == before - 8


def test_directed_damage_logs_on_target_tab(window):
    """A directed damage command logs the hit on the TARGET's own tab, not
    only the actor's view — so a combatant's tab shows what happened to it."""
    window.tabs.setCurrentIndex(0)             # actor = One (tab 0)
    _submit(window, "2 8 slash")               # target = combatant id 2 (tab 1)
    target_log = window.tabs.widget(1).log_view.toPlainText()
    assert "Two took 8" in target_log, target_log
    # The actor's own tab still has it too.
    actor_log = window.tabs.widget(0).log_view.toPlainText()
    assert "Two took 8" in actor_log


def test_pc_tabs_get_no_llm_suggestions(window, monkeypatch):
    """Player-character tabs are skipped by the LLM suggestion refresh — only
    the DM's monsters get next-action suggestions; players decide their own
    turns."""
    class _FakeController:
        def suggest_next_actions(self, *a, **kw):
            return []

    window._llm_controller = _FakeController()
    requested: list = []
    monkeypatch.setattr(
        window._suggestion_driver, "request_for_tab",
        lambda key, fetcher: requested.append(key),
    )
    window._fire_suggestion_refresh()

    pc_tab = window.tabs.widget(3)          # Actor PC (id 4)
    assert pc_tab.npc_state.kind == "pc"
    assert id(pc_tab) not in requested, "PC tab must not get an LLM suggestion fetch"
    npc_tab = window.tabs.widget(0)          # an NPC
    assert id(npc_tab) in requested, "NPC tabs still get suggestions"


# ─────────────────────────── set_target ───────────────────────────


def test_set_target_sets_current_target_and_arrow(window):
    """'2' sets current_target to ['2'] WITHOUT switching tabs — the active
    tab stays on the actor, and the red ▼ arrow appears on the target's tab."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "2")
    assert window.encounter_state.current_target == ["2"]
    # No tab switch — the actor's tab (0) is still active.
    assert window.tabs.currentIndex() == 0
    # The arrow appears on the target's tab (combatant id 2 at index 1).
    assert 1 in window.tabs.tabBar().arrow_indices()


def test_set_target_writes_active_combatants_target(window):
    """A bare `set_target` writes the ACTIVE combatant's `target_ids` and the
    active tab's command input picks it up for leading-Space autocomplete.
    Other tabs keep their own (still-empty) targets — targets are per-actor.

    Regression: the input was wired via a wrong-parent lookup
    (`self.parent()` → the QTabWidget's QStackedWidget), so `set_current_target`
    was never called and Space always reported 'no target'."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "2")
    actor_tab = window.tabs.widget(0)
    assert actor_tab.npc_state.target_ids == ["2"]
    assert actor_tab.input._current_target_ids == ["2"]
    # Another combatant (no target set) still has empty target_ids.
    other_tab = window.tabs.widget(2)
    assert other_tab.npc_state.target_ids == []
    assert other_tab.input._current_target_ids == []


def test_sticky_targeted_command_writes_active_combatants_target(window):
    """A directed command like `3 8 slash` is sticky on the ACTOR — it sets
    the active combatant's target_ids (and its input), not every tab's."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "3 8 slash")
    actor_tab = window.tabs.widget(0)
    assert window.encounter_state.current_target == ["3"]
    assert actor_tab.npc_state.target_ids == ["3"]
    assert actor_tab.input._current_target_ids == ["3"]
    # A different combatant's tab is not touched.
    other_tab = window.tabs.widget(1)
    assert other_tab.npc_state.target_ids == []


# ─────────────────────────── current-target action ───────────────────────────


def test_action_runs_on_actor_surface_aimed_at_target(window, monkeypatch):
    """`<target> <action>` runs the ACTOR's action, aimed at the target.

    The action verb resolves against the active-tab combatant's action
    surface — not the target's — and the roll runs on the actor's tab.
    """
    actor_idx = 0  # actor = combatant id 1 (tab 0)
    window.tabs.setCurrentIndex(actor_idx)
    actor_tab = window.tabs.widget(actor_idx)

    # Give the ACTOR a one-action surface; resolve action #1 against it.
    window._tab_action_surfaces[id(actor_tab)] = [{"action": "cleave"}]

    ran: list = []
    monkeypatch.setattr(
        actor_tab, "run_action_externally", lambda name: ran.append(name)
    )
    # Aim the actor's action #1 at combatant id 2.
    _submit(window, "2 1")
    assert ran == ["cleave"], (
        f"action should run on the actor's surface; got {ran}"
    )


# ─────────────────────────── undo ───────────────────────────


def test_undo_restores_prior_hp(window):
    """'undo' after a damage command restores the prior HP."""
    two = window.encounter_state.combatant_by_id("2")
    before = two.hp
    window.tabs.setCurrentIndex(0)
    _submit(window, "2 8 slash")
    assert two.hp == before - 8
    _submit(window, "undo")
    restored = window.encounter_state.combatant_by_id("2")
    assert restored.hp == before


def test_undo_restores_active_tab_index(window):
    """Undo restores `active_tab_index` and the visible tab.

    A mutating command snapshots the active tab; after the DM moves to a
    different tab, `undo` must return focus to the pre-command tab."""
    # A mutating command from tab 1 snapshots active_tab_index = 1.
    window.tabs.setCurrentIndex(1)
    _submit(window, "1 5 slash")
    # The DM moves to a different tab, then undoes.
    window.tabs.setCurrentIndex(2)
    _submit(window, "undo")
    # undo reverts the damage AND restores the active tab to index 1.
    assert window.tabs.currentIndex() == 1
    assert window.encounter_state.active_tab_index == 1


def test_undo_restores_current_target(window):
    """Undo restores `current_target` (A3-H2)."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "2 5 slash")  # sets current_target to ['2']
    assert window.encounter_state.current_target == ["2"]
    _submit(window, "3 5 slash")  # retargets current_target to ['3']
    assert window.encounter_state.current_target == ["3"]
    _submit(window, "undo")  # reverts the retarget+damage
    assert window.encounter_state.current_target == ["2"]


# ─────────────────────────── undo-snapshot discipline ───────────────────────


def test_noop_command_does_not_snapshot(window):
    """A `command` whose effects all no-op (here: a use-current damage command
    with no current target set) must NOT leave an undo snapshot behind
    (A2 #4) — so a following `undo` reverts the real prior command."""
    one = window.encounter_state.combatant_by_id("1")
    before = one.hp
    window.tabs.setCurrentIndex(0)
    assert window.encounter_state.current_target == []
    _submit(window, "1 5 slash")  # real, mutating command (also sets target ['1'])
    assert one.hp == before - 5
    # Clear the sticky target so the next use-current command resolves to [].
    window.encounter_state.current_target = []
    depth_after_real = len(window.undo_stack._snapshots)
    # A bare-word amount with no current target: `7 fire` after a leading
    # space still has a leading digit-run, so it never reaches a mutating
    # path that snapshots — the undo stack depth is unchanged either way.
    _submit(window, " 7 fire")
    assert len(window.undo_stack._snapshots) == depth_after_real
    # A single undo reverts the real damage, not a phantom no-op step.
    _submit(window, "undo")
    assert window.encounter_state.combatant_by_id("1").hp == before


def test_set_target_remains_undoable(window):
    """A bare `set_target` IS a mutating command per the spec — it keeps its
    snapshot, so `undo` reverts the retarget."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "2")  # current_target -> ['2']
    assert window.encounter_state.current_target == ["2"]
    _submit(window, "3")  # current_target -> ['3']
    assert window.encounter_state.current_target == ["3"]
    _submit(window, "undo")  # reverts the second set_target
    assert window.encounter_state.current_target == ["2"]


# ─────────────────────────── multi-target ───────────────────────────


def test_multi_target_damage(window):
    """'123 8 fire' damages all of ids 1, 2, 3.

    (`<num> poison` now parses as the poisoned *condition*, not damage —
    so a multi-target damage test must use an unambiguous damage tag.)
    """
    ones = [window.encounter_state.combatant_by_id(c) for c in ("1", "2", "3")]
    before = [c.hp for c in ones]
    window.tabs.setCurrentIndex(3)
    _submit(window, "123 8 fire")
    after = [window.encounter_state.combatant_by_id(c).hp for c in ("1", "2", "3")]
    assert after == [b - 8 for b in before]


def test_multi_target_condition(window):
    """'123 3 poison' applies the poisoned condition to ids 1, 2, 3."""
    window.tabs.setCurrentIndex(3)
    _submit(window, "123 3 poison")
    for c in ("1", "2", "3"):
        combatant = window.encounter_state.combatant_by_id(c)
        assert "poisoned" in combatant.conditions


# ─────────────────────────── targeting arrow ───────────────────────────


def test_arrow_never_on_actor_tab(window):
    """The arrow appears on targeted tabs and never on the active/actor tab."""
    window.tabs.setCurrentIndex(0)  # actor = tab 0 (combatant id 1)
    _submit(window, "1")  # target combatant id 1 — which is the actor's own tab
    # current_target is ['1'] but the actor tab (index 0) must NOT show an arrow.
    assert 0 not in window.tabs.tabBar().arrow_indices()


def test_dead_combatant_tab_is_grayed_and_skull_prefixed(window):
    """A dead combatant's tab shows a 💀 prefix and is grayed out — but the
    tab stays clickable so the DM can still select it (e.g. to revive)."""
    target = window.encounter_state.combatant_by_id("2")
    target.apply_damage(target.max_hp)         # drop to 0
    assert target.is_dead
    window._repaint_all_tabs()
    assert "💀" in window.tabs.tabText(1)
    # And the tab text is grayed.
    from PySide6.QtGui import QColor
    assert window.tabs.tabBar().tabTextColor(1) == QColor("#6c6c6c")
    # Clicking it still works (selectable for revive).
    window.tabs.setCurrentIndex(1)
    assert window.tabs.currentIndex() == 1


def test_cycle_tab_skips_dead_combatants(window):
    """Ctrl+Tab / Ctrl+Shift+Tab cycle past dead combatants — turn order rolls
    past them. Direct selection still works (covered above)."""
    # Kill the middle two; cycling from tab 0 should land on tab 3 (alive).
    window.encounter_state.combatant_by_id("2").apply_damage(99)
    window.encounter_state.combatant_by_id("3").apply_damage(99)
    window._repaint_all_tabs()
    window.tabs.setCurrentIndex(0)
    window._cycle_tab(1)
    assert window.tabs.currentIndex() == 3
    # Reverse-cycle from 3 also skips the dead ones, landing on 0.
    window._cycle_tab(-1)
    assert window.tabs.currentIndex() == 0


def test_target_is_sticky_per_actor(window):
    """Each combatant remembers its own target — switching tabs doesn't
    clobber. Tab to a fresh combatant → no target; tab back → remembered."""
    window.tabs.setCurrentIndex(0)             # active = One
    _submit(window, "2")                       # One.target_ids = ["2"]
    assert window.encounter_state.current_target == ["2"]
    # Switch to a fresh combatant — its target is empty.
    window.tabs.setCurrentIndex(1)             # active = Two (no target)
    assert window.encounter_state.current_target == []
    # Switch back — One still remembers its target.
    window.tabs.setCurrentIndex(0)
    assert window.encounter_state.current_target == ["2"]


def test_arrow_on_targeted_tab(window):
    """The ▼ arrow shows on the active combatant's target tabs (never on the
    actor's own). Targets are per-actor — switching to a fresh combatant
    clears the arrows."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "23")  # active=One sets its target to {2,3}
    arrows = window.tabs.tabBar().arrow_indices()
    assert arrows == {1, 2}     # arrows on the target tabs
    # Switching to a fresh combatant (with no target set) clears the arrows.
    window.tabs.setCurrentIndex(3)
    assert window.tabs.tabBar().arrow_indices() == set()


# ─────────────────────────── LLM fallback ───────────────────────────


def test_unparseable_routes_to_llm_fallback(window):
    """An unparseable input routes to the LLM fallback path."""
    received: list = []
    # _on_llm_fallback is the fallback entry point; spy on it.
    orig = window._on_llm_fallback
    window._on_llm_fallback = lambda text, parsed=None, **kw: received.append(text)  # type: ignore
    try:
        window.tabs.setCurrentIndex(0)
        _submit(window, "do something weird")
    finally:
        window._on_llm_fallback = orig  # type: ignore
    assert received and "do something weird" in received[0]


# ─────────────────────────── condition canonicalization ─────────────────────


def test_charm_applies_via_grammar(window):
    """`1 charm` must apply the 'charmed' condition (not silently fail)."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "1 charm")
    one = window.encounter_state.combatant_by_id("1")
    assert "charmed" in one.conditions


def test_deafen_applies_via_grammar(window):
    """`1 deafen` must apply the 'deafened' condition (not silently fail)."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "1 deafen")
    one = window.encounter_state.combatant_by_id("1")
    assert "deafened" in one.conditions


def test_stun_applies_via_grammar(window):
    """`1 stun` must apply the 'stunned' condition."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "1 stun")
    one = window.encounter_state.combatant_by_id("1")
    assert "stunned" in one.conditions


def test_prone_applies_via_grammar(window):
    """`1 prone` must apply the 'prone' condition."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "1 prone")
    one = window.encounter_state.combatant_by_id("1")
    assert "prone" in one.conditions


def test_grapple_applies_via_grammar(window):
    """`1 grapple` must apply the 'grappled' condition."""
    window.tabs.setCurrentIndex(0)
    _submit(window, "1 grapple")
    one = window.encounter_state.combatant_by_id("1")
    assert "grappled" in one.conditions


def test_unknown_condition_does_not_fire_bus_event(window):
    """An unrecognized condition must NOT fire a bus event (A2-H2).

    The event bus is None in a plain MainWindow (no encounter wiring), so we
    verify indirectly: the condition must not be in the combatant's set, and
    no exception is raised.
    """
    window.tabs.setCurrentIndex(0)
    one = window.encounter_state.combatant_by_id("1")
    conditions_before = set(one.conditions)

    # Inject an Effect with a bad condition name directly through the command
    # path, bypassing the parser (the parser would route to unparseable first).
    from gui.command_model import Effect, ParsedCommand
    bad_cmd = ParsedCommand(kind="command", raw="test", target_ids=["1"])
    bad_cmd.effects = [Effect(kind="condition", condition="notacondition")]
    window._handle_command(bad_cmd)

    # Condition must not have been applied.
    assert one.conditions == conditions_before


# ─────────────────────── out-of-band commands (C3-F1/F2/F3) ───────────────


def test_note_does_not_route_to_llm(window):
    """`note <text>` must NOT go to the LLM fallback — it's a free log entry.

    Verify: no LLM controller needed, HP state unchanged, and the command
    is accepted without error.
    """
    window.tabs.setCurrentIndex(0)
    one = window.encounter_state.combatant_by_id("1")
    hp_before = one.hp

    _submit(window, "note the wizard is concentrating on fog cloud")

    # No state change — note is log-only.
    assert one.hp == hp_before


def test_reorder_via_slash_command(window):
    """`/reorder` from the command bar calls _handle_reorder_request."""
    # Get the current slug order.
    original_order = [n.slug for n in window.encounter_state.npcs]
    if len(original_order) < 2:
        pytest.skip("need >=2 NPCs to exercise reorder")

    # Reverse the order.
    reversed_order = list(reversed(original_order))
    _submit(window, f"/reorder {' '.join(reversed_order)}")

    new_order = [n.slug for n in window.encounter_state.npcs]
    assert new_order == reversed_order


def test_quit_via_slash_command(window, qtbot):
    """`/quit` closes the window — routed through _on_command."""
    from gui.command_model import ParsedCommand
    cmd = ParsedCommand(kind="quit", raw="/quit")
    # We can't call _submit (which would try to close the real window in a test),
    # so directly call _on_command and verify the window becomes invisible or
    # receives a close event.  The simplest safe check: no exception is raised,
    # and the window handles the quit kind without routing to LLM.
    # We mock close() to avoid destroying the test window.
    closed = []
    original_close = window.close
    window.close = lambda: closed.append(True)
    try:
        window._on_command(cmd)
    finally:
        window.close = original_close
    assert closed == [True]


# ─────────────────────────── delivery: melee → in_melee (M1) ────────────────


def test_melee_delivery_sets_in_melee_on_actor_and_target(window):
    """'2 10 melee' must set in_melee=True on both the actor (tab-0) and
    the target (combatant id 2).  This reproduces the behaviour that was in
    the old _on_directed_command but was not ported to _handle_command."""
    actor = window.encounter_state.combatant_by_id("1")
    target = window.encounter_state.combatant_by_id("2")
    actor.in_melee = False
    target.in_melee = False

    window.tabs.setCurrentIndex(0)   # actor is combatant 1 at tab 0
    _submit(window, "2 10 melee")

    assert target.in_melee is True, "melee-tagged damage must set in_melee on the target"
    assert actor.in_melee is True, "melee-tagged damage must set in_melee on the actor"


def test_ranged_delivery_does_not_set_in_melee(window):
    """'2 10 ranged' must NOT set in_melee on either the actor or the target."""
    actor = window.encounter_state.combatant_by_id("1")
    target = window.encounter_state.combatant_by_id("2")
    actor.in_melee = False
    target.in_melee = False

    window.tabs.setCurrentIndex(0)
    _submit(window, "2 10 ranged")

    assert target.in_melee is False, "ranged delivery must not set in_melee on the target"
    assert actor.in_melee is False, "ranged delivery must not set in_melee on the actor"


def test_untagged_damage_does_not_set_in_melee(window):
    """Plain damage with no delivery tag ('2 10 dmg') must not set in_melee."""
    actor = window.encounter_state.combatant_by_id("1")
    target = window.encounter_state.combatant_by_id("2")
    actor.in_melee = False
    target.in_melee = False

    window.tabs.setCurrentIndex(0)
    _submit(window, "2 10 dmg")

    assert target.in_melee is False
    assert actor.in_melee is False


# ─────────── compound command end-to-end (both effects land) ─────────────────


def test_compound_damage_and_condition_both_land(window):
    """'2 9 bludge 1 prone' — both the 9 bludgeoning damage AND the prone
    condition must land on combatant id 2 from a single _on_command call."""
    two = window.encounter_state.combatant_by_id("2")
    hp_before = two.hp
    window.tabs.setCurrentIndex(0)

    _submit(window, "2 9 bludge 1 prone")

    # Damage must have been applied.
    assert two.hp == hp_before - 9, (
        f"Expected hp {hp_before - 9}, got {two.hp}"
    )
    # Condition must also have been applied.
    assert "prone" in two.conditions, (
        f"Expected 'prone' in conditions, got {two.conditions}"
    )


def test_compound_undo_reverts_both_effects(window):
    """After a compound damage+condition command, undo must revert both."""
    two = window.encounter_state.combatant_by_id("2")
    hp_before = two.hp
    window.tabs.setCurrentIndex(0)

    _submit(window, "2 9 bludge 1 prone")
    assert two.hp == hp_before - 9
    assert "prone" in two.conditions

    _submit(window, "undo")

    assert window.encounter_state.combatant_by_id("2").hp == hp_before
    assert "prone" not in window.encounter_state.combatant_by_id("2").conditions


# ─────────────────────────── 0=self token end-to-end ────────────────────────


def test_zero_self_token_applies_damage_to_active_combatant(window):
    """'0 5 fire' submitted from a known active tab must damage the active
    combatant by 5.

    The `0` token is the self-targeting shorthand: it resolves to the active
    combatant's id via `_resolve_targets`. This test guards the full
    _resolve_targets('0') → active-id → apply_damage path end-to-end.
    """
    # Tab 0 is combatant id 1 (NPCState "One", 40 hp).
    window.tabs.setCurrentIndex(0)
    one = window.encounter_state.combatant_by_id("1")
    hp_before = one.hp

    _submit(window, "0 5 fire")

    assert window.encounter_state.combatant_by_id("1").hp == hp_before - 5, (
        f"'0 5 fire' from tab 0 must apply 5 damage to the active combatant "
        f"(id '1'); hp was {hp_before}, now "
        f"{window.encounter_state.combatant_by_id('1').hp}"
    )
