"""Apply an Effect to EncounterState.

`apply_effect` is the single authoritative mutation point for an Effect.  It
returns human-readable log fragments (one entry per affected combatant) and
does NOT snapshot state or touch Qt — both of those are the caller's job.

Resolution of target_ids is the CALLER's responsibility: by the time
`apply_effect` is called, ``target_ids`` must contain concrete, fully-resolved
combatant id strings (no ``"0"`` / ``use_current`` placeholders).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from gui.state import STANDARD_CONDITIONS, EncounterState, NPCState
from gui.command_model import Effect
from gui.history import PendingEffect

if TYPE_CHECKING:
    pass  # actor type hint only; NPCState already imported above

# ─── condition alias table ───────────────────────────────────────────────────
# Maps grammar shorthand → canonical STANDARD_CONDITIONS name.
# Only the stem needs listing; full names that are already in STANDARD_CONDITIONS
# pass through unchanged.
_CONDITION_ALIASES: dict[str, str] = {
    "stun": "stunned",
    "frighten": "frightened",
    "grapple": "grappled",
    "poison": "poisoned",
    "blind": "blinded",
    "restrain": "restrained",
    "petrify": "petrified",
    "paralyze": "paralyzed",
    "incapacitate": "incapacitated",
}

_KNOWN_CONDITIONS: frozenset[str] = frozenset(STANDARD_CONDITIONS)


def _resolve_condition(word: str) -> str | None:
    """Return the canonical condition name for *word*, or None if unknown."""
    w = word.lower().strip()
    if w in _KNOWN_CONDITIONS:
        return w
    aliased = _CONDITION_ALIASES.get(w)
    if aliased and aliased in _KNOWN_CONDITIONS:
        return aliased
    return None


# ─── public API ──────────────────────────────────────────────────────────────

def apply_effect(
    state: EncounterState,
    effect: Effect,
    *,
    target_ids: list[str],
    actor: NPCState | None,
) -> list[str]:
    """Mutate *state* according to *effect* and return log fragment strings.

    Parameters
    ----------
    state:
        The live ``EncounterState`` to mutate.
    effect:
        The parsed ``Effect`` describing what to do.
    target_ids:
        Concrete, pre-resolved combatant id strings.  The caller must have
        already expanded ``"0"`` / ``use_current`` before calling here.
    actor:
        The acting combatant (source of the action), or ``None`` when the
        effect has no specific actor (e.g. environmental damage, test
        harness).

    Returns
    -------
    list[str]
        Human-readable log fragments — typically one entry per affected
        combatant.  Warnings / no-ops may add extra entries.
    """
    kind = effect.kind

    if kind == "amount":
        return _apply_amount(state, effect, target_ids)
    if kind == "condition":
        return _apply_condition(state, effect, target_ids)
    if kind in ("action", "hit", "undo"):
        raise NotImplementedError(
            f"apply_effect: kind={kind!r} is not handled here — "
            "use the dedicated handler (Tasks 8 / 10)."
        )
    raise ValueError(f"apply_effect: unknown effect kind {kind!r}")


# ─── amount ──────────────────────────────────────────────────────────────────

def _apply_amount(
    state: EncounterState,
    effect: Effect,
    target_ids: list[str],
) -> list[str]:
    fragments: list[str] = []
    is_heal = effect.amount_tags.get("direction") == "heal"
    damage_type = effect.amount_tags.get("type", "")

    for cid in target_ids:
        combatant = state.combatant_by_id(cid)
        if combatant is None:
            fragments.append(f"warn: no combatant with id {cid!r}")
            continue

        if is_heal:
            delta = combatant.apply_heal(effect.amount, member=effect.member)
        else:
            delta = combatant.apply_damage(effect.amount, member=effect.member)

        # A skipped result (out-of-range mob member, dead member, no alive
        # members) is a no-op: surface it as a warning so the caller does NOT
        # treat it as an applied effect (e.g. fires no bus events).
        if delta.get("skipped"):
            member_label = f" m{effect.member}" if effect.member is not None else ""
            fragments.append(
                f"warn: {combatant.name}{member_label}: no such target "
                f"({delta['skipped']})"
            )
            continue

        before, after = delta.get("before", 0), delta.get("after", 0)
        if is_heal:
            fragments.append(
                f"{combatant.name} healed {effect.amount} "
                f"({before} → {after} HP)"
            )
        else:
            tag_str = f" [{damage_type}]" if damage_type else ""
            suffix = " (killed)" if delta.get("killed") else ""
            fragments.append(
                f"{combatant.name} took {effect.amount}{tag_str} damage "
                f"({before} → {after} HP){suffix}"
            )

    return fragments


# ─── condition ───────────────────────────────────────────────────────────────

def _apply_condition(
    state: EncounterState,
    effect: Effect,
    target_ids: list[str],
) -> list[str]:
    fragments: list[str] = []
    canonical = _resolve_condition(effect.condition)

    if canonical is None:
        return [f"warn: unknown condition {effect.condition!r}"]

    # duration to apply when toggling ON.  Default is 1 round.
    applied_duration = effect.duration if effect.duration is not None else 1

    for cid in target_ids:
        combatant = state.combatant_by_id(cid)
        if combatant is None:
            fragments.append(f"warn: no combatant with id {cid!r}")
            continue

        now_active = combatant.toggle_condition(canonical, duration=applied_duration)
        if now_active:
            dur_str = f" ({applied_duration}r)" if applied_duration else ""
            fragments.append(f"{combatant.name} → {canonical}{dur_str}")
        else:
            fragments.append(f"{combatant.name} ← {canonical} removed")

    return fragments


# ─── uncertain damage + hit upgrade ──────────────────────────────────────────

def apply_uncertain_damage(
    state: EncounterState,
    combatant_id: str,
    full_amount: int,
    kind: str,
    on_save: str,
) -> list[str]:
    """Apply the minimum (assumed) damage and record a PendingEffect.

    For a save-based effect with ``on_save='half'`` the minimum is half damage
    (the target is assumed to have succeeded on its save).  For ``on_save='none'``
    or a ``kind='attack'`` (which hasn't landed yet) the minimum is zero.

    The PendingEffect sits in ``state.pending_effects`` until ``apply_hit``
    upgrades it to the full amount for combatants who did NOT save / were hit.

    Parameters
    ----------
    state:
        Live encounter state to mutate.
    combatant_id:
        Permanent combatant id string (e.g. ``"2"``).
    full_amount:
        The total damage that lands on a failed save / a hit.
    kind:
        ``"save"`` or ``"attack"``.
    on_save:
        ``"half"`` (half damage on save) or ``"none"`` (no damage on save).

    Returns
    -------
    list[str]
        Human-readable log fragments.
    """
    fragments: list[str] = []
    combatant = state.combatant_by_id(combatant_id)
    if combatant is None:
        return [f"warn: no combatant with id {combatant_id!r}"]

    # Compute the assumed-minimum applied amount.
    if kind == "save" and on_save == "half":
        applied = full_amount // 2
    else:
        # kind == "attack" OR on_save == "none": assume the best for the target.
        applied = 0

    if applied > 0:
        delta = combatant.apply_damage(applied)
        before, after = delta.get("before", 0), delta.get("after", 0)
        fragments.append(
            f"{combatant.name} took {applied} (assumed save) damage "
            f"({before} → {after} HP)"
        )
    else:
        fragments.append(
            f"{combatant.name}: {full_amount} pending ({kind}, on_save={on_save})"
        )

    state.pending_effects.append(
        PendingEffect(
            combatant_id=combatant_id,
            full_amount=full_amount,
            applied_amount=applied,
            kind=kind,
            resolved=False,
        )
    )
    return fragments


def apply_hit(
    state: EncounterState,
    target_ids: list[str],
) -> list[str]:
    """Upgrade the latest unresolved PendingEffect for each named target.

    For each id in *target_ids* the most recent unresolved ``PendingEffect``
    matching that combatant is found and the remaining damage
    (``full_amount - applied_amount``) is applied.  The record is then marked
    ``resolved=True``.

    Parameters
    ----------
    state:
        Live encounter state to mutate.
    target_ids:
        Combatant id strings for targets who did NOT save / were confirmed hit.

    Returns
    -------
    list[str]
        Human-readable log fragments; warnings for ids with nothing pending.
    """
    fragments: list[str] = []
    for cid in target_ids:
        # Find the LATEST unresolved PendingEffect for this combatant.
        pending = None
        for pe in reversed(state.pending_effects):
            if pe.combatant_id == cid and not pe.resolved:
                pending = pe
                break

        if pending is None:
            fragments.append(f"warn: nothing pending for {cid}")
            continue

        combatant = state.combatant_by_id(cid)
        if combatant is None:
            fragments.append(f"warn: no combatant with id {cid!r}")
            pending.resolved = True
            continue

        remaining = pending.full_amount - pending.applied_amount
        if remaining > 0:
            delta = combatant.apply_damage(remaining)
            before, after = delta.get("before", 0), delta.get("after", 0)
            suffix = " (killed)" if delta.get("killed") else ""
            fragments.append(
                f"{combatant.name} hit — additional {remaining} damage "
                f"({before} → {after} HP){suffix}"
            )
        else:
            fragments.append(f"{combatant.name} hit (no additional damage)")

        pending.applied_amount = pending.full_amount
        pending.resolved = True

    return fragments
