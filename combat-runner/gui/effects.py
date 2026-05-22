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
            before, after = delta.get("before", 0), delta.get("after", 0)
            fragments.append(
                f"{combatant.name} healed {effect.amount} "
                f"({before} → {after} HP)"
            )
        else:
            tag_str = f" [{damage_type}]" if damage_type else ""
            delta = combatant.apply_damage(effect.amount, member=effect.member)
            before, after = delta.get("before", 0), delta.get("after", 0)
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
