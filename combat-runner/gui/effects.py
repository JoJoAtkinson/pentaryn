"""Apply an Effect to EncounterState.

`apply_effect` is the single authoritative mutation point for an Effect.  It
returns human-readable log fragments (one entry per affected combatant) and
does NOT snapshot state or touch Qt — both of those are the caller's job.

Resolution of target_ids is the CALLER's responsibility: by the time
`apply_effect` is called, ``target_ids`` must contain concrete, fully-resolved
combatant id strings (no ``"0"`` / ``use_current`` placeholders).
"""

from __future__ import annotations

from .command_model import Effect
from .history import PendingEffect
from .state import EncounterState, NPCState, canonicalize_condition

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
        fragments, _ = _apply_condition(state, effect, target_ids)
        return fragments
    if kind in ("action", "hit", "undo"):
        raise NotImplementedError(
            f"apply_effect: kind={kind!r} is not handled here — "
            "use the dedicated handler (Tasks 8 / 10)."
        )
    raise ValueError(f"apply_effect: unknown effect kind {kind!r}")


def apply_condition_effect(
    state: EncounterState,
    effect: Effect,
    *,
    target_ids: list[str],
) -> tuple[list[str], dict[str, bool]]:
    """Like ``apply_effect`` for condition effects, but also returns a
    ``per_target_applied`` dict mapping each combatant id to the direction
    (``True`` = condition applied, ``False`` = removed).

    Used by ``MainWindow._handle_command`` so ``_emit_condition_events`` can
    fire the authoritative direction instead of re-deriving it from a
    substring scan of ``combatant.conditions``.
    """
    return _apply_condition(state, effect, target_ids)


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

        # Resolve the member list to iterate over.
        # members is None  → default routing (one call, member=None).
        # members == []    → all alive members (AoE: full amount to each).
        # members == [1,2] → explicit set (full amount to each listed member).
        members = effect.members
        if members is None:
            member_targets: list[int | None] = [None]
        elif members == []:
            member_targets = list(combatant.alive_member_indices())  # type: ignore[assignment]
            if not member_targets:
                fragments.append(
                    f"warn: {combatant.name}: no alive members to target"
                )
                continue
        else:
            member_targets = list(members)  # type: ignore[assignment]

        for member in member_targets:
            if is_heal:
                delta = combatant.apply_heal(effect.amount, member=member)
            else:
                delta = combatant.apply_damage(effect.amount, member=member)

            # A skipped result (out-of-range mob member, dead member, no alive
            # members) is a no-op: surface it as a warning so the caller does NOT
            # treat it as an applied effect (e.g. fires no bus events).
            if delta.get("skipped"):
                member_label = f" m{member}" if member is not None else ""
                fragments.append(
                    f"warn: {combatant.name}{member_label}: no such target "
                    f"({delta['skipped']})"
                )
                continue

            before, after = delta.get("before", 0), delta.get("after", 0)
            member_label = f" m{member}" if member is not None else ""
            if is_heal:
                fragments.append(
                    f"{combatant.name}{member_label} healed {effect.amount} "
                    f"({before} → {after} HP)"
                )
            else:
                tag_str = f" [{damage_type}]" if damage_type else ""
                suffix = " (killed)" if delta.get("killed") else ""
                fragments.append(
                    f"{combatant.name}{member_label} took {effect.amount}{tag_str} damage "
                    f"({before} → {after} HP){suffix}"
                )

    return fragments


# ─── condition ───────────────────────────────────────────────────────────────

# Sentinel used to signal that _apply_condition did nothing because the
# condition name was unrecognized. The caller (main_window) checks for this
# sentinel so it does NOT fire the condition bus event or auto-save.
_CONDITION_UNKNOWN_SENTINEL = "skipped:unknown_condition"


def _apply_condition(
    state: EncounterState,
    effect: Effect,
    target_ids: list[str],
) -> tuple[list[str], dict[str, bool]]:
    """Apply or toggle a condition effect.

    Returns ``(fragments, per_target_applied)`` where ``per_target_applied``
    maps each combatant id to the authoritative applied/removed direction
    (``True`` = condition just applied, ``False`` = removed).  The direction
    comes directly from ``toggle_condition``'s return value — no re-inspection
    of ``combatant.conditions`` needed.

    If ``effect.condition`` is not a recognized catalog name the function
    returns a list containing ``_CONDITION_UNKNOWN_SENTINEL`` (a ``warn:``
    string that also carries the sentinel marker), so the caller can
    distinguish an unknown-condition no-op from a real condition toggle.  This
    prevents spurious bus events and auto-saves.

    Since the dispatcher now stores the canonical name in ``Effect.condition``
    (after calling ``canonicalize_condition``), an unknown condition here
    indicates a bug or an LLM-authored effect with a bad name — fail loud.
    """
    fragments: list[str] = []
    per_target_applied: dict[str, bool] = {}
    canonical = canonicalize_condition(effect.condition)

    if canonical is None:
        # Fail loud: surface a warning AND return the sentinel so the caller
        # knows not to fire bus events or save.
        return (
            [
                f"warn: {_CONDITION_UNKNOWN_SENTINEL}: unknown condition "
                f"{effect.condition!r}"
            ],
            {},
        )

    # CHANGE 2 — reject member-scoped conditions.
    # `m2 prone` is not supported: conditions apply to the whole mob/tab.
    # If effect.members is not None, an m<...> modifier was attached.
    if effect.members is not None:
        return (
            [
                f"warn: conditions apply to the whole mob — "
                f"drop the m<n> (e.g. just '{effect.condition}')"
            ],
            {},
        )

    # CHANGE 3 — duration refresh vs. toggle-off semantics.
    # When a duration is given: ALWAYS ensure the condition is present with that
    # duration.  If already present, REFRESH the duration (don't toggle off).
    # When no duration is given (bare condition word): keep the classic toggle.
    _dur = effect.duration
    has_duration = _dur is not None

    # Normalize: a duration of 0 or None (no number given) uses the 1-round
    # default for "add with duration" path.  For the toggle-off path it doesn't
    # matter.
    applied_duration = _dur if (_dur is not None and _dur > 0) else 1

    for cid in target_ids:
        combatant = state.combatant_by_id(cid)
        if combatant is None:
            fragments.append(f"warn: no combatant with id {cid!r}")
            continue

        if has_duration:
            # Duration given → ensure condition is present with this duration.
            if canonical in combatant.conditions:
                # Already present: REFRESH the duration (don't remove it).
                combatant.condition_durations[canonical] = applied_duration
                now_active = True
                per_target_applied[cid] = True
                dur_str = f" ({applied_duration}r)"
                fragments.append(f"{combatant.name} → {canonical}{dur_str} (refreshed)")
            else:
                # Not present: add it with the duration.
                combatant.add_condition(canonical, duration=applied_duration)
                now_active = True
                per_target_applied[cid] = True
                dur_str = f" ({applied_duration}r)"
                fragments.append(f"{combatant.name} → {canonical}{dur_str}")
        else:
            # No duration given → classic toggle behavior.
            now_active = combatant.toggle_condition(canonical, duration=applied_duration)
            per_target_applied[cid] = now_active
            if now_active:
                dur_str = f" ({applied_duration}r)" if applied_duration else ""
                fragments.append(f"{combatant.name} → {canonical}{dur_str}")
            else:
                fragments.append(f"{combatant.name} ← {canonical} removed")

    return fragments, per_target_applied


# ─── uncertain damage + hit upgrade ──────────────────────────────────────────

def apply_uncertain_damage(
    state: EncounterState,
    combatant_id: str,
    full_amount: int,
    kind: str,
    on_save: str,
    *,
    source: str = "",
    round_num: int | None = None,
    member: int | None = None,
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
    source:
        Short label (typically the action name) recorded on the
        ``PendingEffect`` so a later ``hit`` / marker can name it.
    round_num:
        The encounter round the effect was created in.  Defaults to
        ``state.round_num`` when not given.
    member:
        Mob member index (1-indexed, from the ``m<n>`` grammar sigil).  When
        set, damage is applied to that specific mob member rather than the
        default highest-numbered alive member.

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
        delta = combatant.apply_damage(applied, member=member)
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
            source=source,
            round=state.round_num if round_num is None else round_num,
            member=member,
        )
    )
    return fragments


def clear_stale_pending(state: EncounterState, current_round: int) -> list[str]:
    """Resolve any unresolved ``PendingEffect`` created in a prior round.

    A pending effect that survives to a new round is stale — the spec (§4)
    treats "do nothing" as the minimum outcome (a successful save / a miss), so
    a stale unresolved effect simply stays at its applied minimum and is marked
    ``resolved`` so it no longer shows the unresolved marker.

    Returns human-readable log fragments, one per cleared effect.
    """
    fragments: list[str] = []
    for pe in state.pending_effects:
        if pe.resolved:
            continue
        if pe.round < current_round:
            pe.resolved = True
            combatant = state.combatant_by_id(pe.combatant_id)
            name = combatant.name if combatant is not None else pe.combatant_id
            label = f" ({pe.source})" if pe.source else ""
            fragments.append(
                f"{name}: unresolved effect{label} expired — assumed save/miss"
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
            delta = combatant.apply_damage(remaining, member=pending.member)
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
