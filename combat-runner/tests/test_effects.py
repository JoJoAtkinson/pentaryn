from pathlib import Path
from gui.state import EncounterState, NPCState
from gui.command_model import Effect
from gui.effects import _CONDITION_UNKNOWN_SENTINEL, apply_effect

def _es():
    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    es.npcs.append(NPCState(slug="m", name="Marwen", max_hp=32, ac=15, speed="30",
                            cr=5, kind="pc", id="2"))
    return es

def test_amount_applies_damage():
    es = _es()
    apply_effect(es, Effect(kind="amount", amount=8, amount_tags={"type": "slashing"}),
                 target_ids=["2"], actor=None)
    assert es.combatant_by_id("2").hp == 24

def test_amount_heal_via_direction_tag():
    es = _es(); es.combatant_by_id("2").member_hp[0] = 10
    apply_effect(es, Effect(kind="amount", amount=12, amount_tags={"direction": "heal"}),
                 target_ids=["2"], actor=None)
    assert es.combatant_by_id("2").hp == 22

def test_condition_applies_with_duration():
    es = _es()
    apply_effect(es, Effect(kind="condition", condition="stun", duration=2),
                 target_ids=["2"], actor=None)
    npc = es.combatant_by_id("2")
    assert "stunned" in npc.conditions
    assert npc.condition_durations.get("stunned") == 2

def test_condition_default_duration_one():
    es = _es()
    apply_effect(es, Effect(kind="condition", condition="prone", duration=None),
                 target_ids=["2"], actor=None)
    assert es.combatant_by_id("2").condition_durations.get("prone") == 1

def test_condition_toggles_off():
    es = _es(); es.combatant_by_id("2").conditions.add("prone")
    apply_effect(es, Effect(kind="condition", condition="prone"),
                 target_ids=["2"], actor=None)
    assert "prone" not in es.combatant_by_id("2").conditions

def test_condition_duration_zero_treated_as_one_round():
    """`3 0 stun` parses to duration=0; effects.py must normalize that to the
    1-round default so the condition expires (not become permanent)."""
    es = _es()
    apply_effect(es, Effect(kind="condition", condition="stun", duration=0),
                 target_ids=["2"], actor=None)
    npc = es.combatant_by_id("2")
    assert "stunned" in npc.conditions
    # A duration of 1 must be recorded — NOT a missing key (which is permanent).
    assert npc.condition_durations.get("stunned") == 1
    # ...and it expires on the next round tick.
    expired = npc.tick_condition_durations()
    assert "stunned" in expired
    assert "stunned" not in npc.conditions


def test_amount_multi_target():
    es = _es()
    es.npcs.append(NPCState(slug="b", name="Bazgar", max_hp=49, ac=18, speed="30",
                            cr=5, kind="pc", id="1"))
    apply_effect(es, Effect(kind="amount", amount=3, amount_tags={"type": "acid"}),
                 target_ids=["1", "2"], actor=None)
    assert es.combatant_by_id("1").hp == 46
    assert es.combatant_by_id("2").hp == 29


# ─── single-canonicalization table (fix for condition-drift bug) ────────────


def test_charm_applies_canonical_condition():
    """`condition='charm'` must apply 'charmed' (not fail silently)."""
    es = _es()
    fragments = apply_effect(es, Effect(kind="condition", condition="charm", duration=2),
                             target_ids=["2"], actor=None)
    npc = es.combatant_by_id("2")
    assert "charmed" in npc.conditions
    assert not any(_CONDITION_UNKNOWN_SENTINEL in f for f in fragments)


def test_deafen_applies_canonical_condition():
    """`condition='deafen'` must apply 'deafened' (not fail silently)."""
    es = _es()
    fragments = apply_effect(es, Effect(kind="condition", condition="deafen", duration=1),
                             target_ids=["2"], actor=None)
    npc = es.combatant_by_id("2")
    assert "deafened" in npc.conditions
    assert not any(_CONDITION_UNKNOWN_SENTINEL in f for f in fragments)


def test_unknown_condition_returns_sentinel():
    """An unrecognized condition name must return the sentinel fragment
    (not silently do nothing with a generic warn string)."""
    es = _es()
    fragments = apply_effect(es, Effect(kind="condition", condition="notacondition"),
                             target_ids=["2"], actor=None)
    assert any(_CONDITION_UNKNOWN_SENTINEL in f for f in fragments)
    # The condition must NOT have been applied.
    npc = es.combatant_by_id("2")
    assert "notacondition" not in npc.conditions


# ─── CHANGE 1: Effect.members member-loop ────────────────────────────────────


def _mob_es():
    """Encounter with a 3-member mob (20 HP each) and a single combatant."""
    es = EncounterState(name="t", root=Path("."), log_path=Path("log.md"))
    es.npcs.append(NPCState(slug="mob", name="Mob", max_hp=20, ac=13, speed="30",
                            cr=1, kind="npc", id="9", count=3))
    return es


def test_members_none_default_routing():
    """`members=None` → default routing (highest alive member for damage)."""
    es = _mob_es()
    mob = es.combatant_by_id("9")
    apply_effect(es, Effect(kind="amount", amount=5, amount_tags={"type": "fire"}, members=None),
                 target_ids=["9"], actor=None)
    # Default routing hits the highest-numbered alive member (index 2 = member 3).
    assert mob.member_hp[0] == 20
    assert mob.member_hp[1] == 20
    assert mob.member_hp[2] == 15


def test_members_explicit_set_hits_each():
    """`members=[1, 2]` → full amount applied to member 1 and member 2."""
    es = _mob_es()
    mob = es.combatant_by_id("9")
    apply_effect(es, Effect(kind="amount", amount=8, amount_tags={"type": "slashing"}, members=[1, 2]),
                 target_ids=["9"], actor=None)
    assert mob.member_hp[0] == 12   # member 1: 20 - 8
    assert mob.member_hp[1] == 12   # member 2: 20 - 8
    assert mob.member_hp[2] == 20   # member 3: untouched


def test_members_empty_hits_all_alive():
    """`members=[]` → full amount applied to EVERY alive member (AoE)."""
    es = _mob_es()
    mob = es.combatant_by_id("9")
    # Kill member 3 first.
    mob.member_hp[2] = 0
    apply_effect(es, Effect(kind="amount", amount=6, amount_tags={"type": "cold"}, members=[]),
                 target_ids=["9"], actor=None)
    assert mob.member_hp[0] == 14   # member 1: 20 - 6
    assert mob.member_hp[1] == 14   # member 2: 20 - 6
    assert mob.member_hp[2] == 0    # member 3: dead, not targeted


def test_members_explicit_heal():
    """`members=[2]` on a heal → heals member 2 specifically."""
    es = _mob_es()
    mob = es.combatant_by_id("9")
    mob.member_hp[1] = 5  # member 2 is injured
    apply_effect(es, Effect(kind="amount", amount=10, amount_tags={"direction": "heal"}, members=[2]),
                 target_ids=["9"], actor=None)
    assert mob.member_hp[0] == 20
    assert mob.member_hp[1] == 15   # member 2: 5 + 10
    assert mob.member_hp[2] == 20


# ─── CHANGE 2: reject member-scoped conditions ───────────────────────────────


def test_member_scoped_condition_is_rejected():
    """`m2 prone` must NOT apply the condition; returns a helpful warning."""
    es = _es()
    fragments = apply_effect(
        es,
        Effect(kind="condition", condition="prone", members=[2]),
        target_ids=["2"], actor=None,
    )
    npc = es.combatant_by_id("2")
    assert "prone" not in npc.conditions, "condition must NOT be applied"
    assert any("drop the m<n>" in f or "whole mob" in f for f in fragments), (
        f"Expected rejection message, got: {fragments}"
    )


def test_member_scoped_condition_all_members_rejected():
    """`m prone` (members=[]) must also be rejected — no member scope for conditions."""
    es = _es()
    fragments = apply_effect(
        es,
        Effect(kind="condition", condition="stunned", members=[]),
        target_ids=["2"], actor=None,
    )
    npc = es.combatant_by_id("2")
    assert "stunned" not in npc.conditions
    assert any("drop the m<n>" in f or "whole mob" in f for f in fragments)


def test_bare_condition_no_members_applies_normally():
    """`members=None` on a condition → normal apply (no rejection)."""
    es = _es()
    apply_effect(
        es,
        Effect(kind="condition", condition="prone", members=None),
        target_ids=["2"], actor=None,
    )
    assert "prone" in es.combatant_by_id("2").conditions


# ─── CHANGE 3: condition duration refresh, not toggle-off ────────────────────


def test_duration_refresh_while_stunned():
    """Re-applying `7 3 stun` while already stunned REFRESHES duration to 3, not removes."""
    es = _es()
    npc = es.combatant_by_id("2")
    # Apply stunned with duration 1 first.
    apply_effect(es, Effect(kind="condition", condition="stunned", duration=1),
                 target_ids=["2"], actor=None)
    assert "stunned" in npc.conditions
    assert npc.condition_durations.get("stunned") == 1

    # Re-apply with duration 3 — must refresh, not toggle off.
    fragments = apply_effect(es, Effect(kind="condition", condition="stunned", duration=3),
                             target_ids=["2"], actor=None)
    assert "stunned" in npc.conditions, "stunned must still be present after refresh"
    assert npc.condition_durations.get("stunned") == 3, "duration must be refreshed to 3"
    assert any("refresh" in f for f in fragments), f"Expected 'refreshed' in log, got: {fragments}"


def test_duration_add_when_not_present():
    """Applying `7 3 stun` when NOT stunned adds the condition with duration 3."""
    es = _es()
    npc = es.combatant_by_id("2")
    assert "stunned" not in npc.conditions  # precondition
    apply_effect(es, Effect(kind="condition", condition="stunned", duration=3),
                 target_ids=["2"], actor=None)
    assert "stunned" in npc.conditions
    assert npc.condition_durations.get("stunned") == 3


def test_bare_condition_toggles_off():
    """A bare condition with no duration still toggles OFF if already present."""
    es = _es()
    npc = es.combatant_by_id("2")
    npc.conditions.add("prone")
    # Bare `prone` (duration=None) → should toggle off.
    apply_effect(es, Effect(kind="condition", condition="prone", duration=None),
                 target_ids=["2"], actor=None)
    assert "prone" not in npc.conditions, "bare prone must toggle off"


def test_bare_condition_toggles_on():
    """A bare condition with no duration toggles ON if not present."""
    es = _es()
    npc = es.combatant_by_id("2")
    assert "prone" not in npc.conditions  # precondition
    apply_effect(es, Effect(kind="condition", condition="prone", duration=None),
                 target_ids=["2"], actor=None)
    assert "prone" in npc.conditions
