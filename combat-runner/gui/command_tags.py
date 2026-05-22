"""Faceted tag taxonomy for directed combat commands.

Pure Python — no Qt, no I/O. Imported by dispatcher.py and command_input.py.
"""
from __future__ import annotations

TAG_FACETS: dict[str, dict] = {
    "direction": {
        "exclusive": True,
        "required": True,
        "default": "damage",
        "values": {
            "damage": {"aliases": ["dmg", "dam"]},
            "heal":   {"aliases": ["healing", "hp"]},
        },
    },
    "delivery": {
        "exclusive": True,
        "applies_when": {"direction": "damage"},
        "values": {
            "melee":  {},
            "ranged": {"aliases": ["rng"]},
        },
    },
    "type": {
        "exclusive": True,
        "applies_when": {"direction": "damage"},
        "values": {
            "fire":      {},
            "cold":      {},
            "acid":      {},
            "lightning": {},
            "poison":    {},
            "necrotic":  {},
            "radiant":   {},
            "thunder":   {},
            "force":     {},
            "psychic":   {},
            "piercing":    {"aliases": ["pierce"]},
            "slashing":    {"aliases": ["slash"]},
            "bludgeoning": {"aliases": ["bludge", "bludgeon"]},
        },
    },
}

# Fail loudly at module load if a required facet has no default — the token
# loop relies on pre-seeded defaults; a missing one would silently break things.
for _f, _s in TAG_FACETS.items():
    if _s.get("required") and not _s.get("default"):
        raise ValueError(f"TAG_FACETS[{_f!r}]: required facet must have a default")


def _build_alias_map() -> dict[str, tuple[str, str]]:
    """Build reverse alias map: alias/canonical → (facet, canonical)."""
    m: dict[str, tuple[str, str]] = {}
    for facet, spec in TAG_FACETS.items():
        for canonical, vspec in spec["values"].items():
            m[canonical] = (facet, canonical)
            for alias in vspec.get("aliases", []):
                m[alias] = (facet, canonical)
    return m


_ALIAS_MAP = _build_alias_map()


def resolve_tags(tokens: list[str]) -> tuple[dict[str, str], list[str]]:
    """Validate and resolve a list of tag tokens against the faceted taxonomy.

    Returns (resolved, errors) where:
      resolved: dict[facet → canonical_value] for each recognized token
      errors:   list of human-readable error strings for unknown tokens

    Rules (from spec §6):
      1. Each recognized token resolves to (facet, canonical) via _ALIAS_MAP.
      2. ≤ 1 value per facet; a new value in an already-filled facet replaces it.
      3. A facet's values are valid only if its applies_when holds; tokens for
         inapplicable facets are dropped silently (not an error).
    """
    # Seed resolved with defaults for required facets so applies_when checks
    # work correctly from the very first token.
    resolved: dict[str, str] = {
        facet: spec["default"]
        for facet, spec in TAG_FACETS.items()
        if spec.get("required") and spec.get("default")
    }
    errors: list[str] = []

    for token in tokens:
        lower = token.lower().strip()
        if not lower:
            continue
        entry = _ALIAS_MAP.get(lower)
        if entry is None:
            errors.append(f"unknown tag: {token!r}")
            continue
        facet, canonical = entry
        # Rule 3: check applies_when
        applies_when = TAG_FACETS[facet].get("applies_when", {})
        applicable = all(resolved.get(af) == av for af, av in applies_when.items())
        if not applicable:
            # Drop inapplicable tags silently
            continue
        # Rule 2: replace existing value in same facet
        resolved[facet] = canonical

    # Cleanup pass: strip any facet whose applies_when no longer holds against
    # the final resolved state. This handles cases where a later token changes
    # the facet that an earlier facet depends on (e.g. ["melee", "heal"] must
    # not retain delivery=melee once direction=heal).
    for facet in list(resolved.keys()):
        applies_when = TAG_FACETS.get(facet, {}).get("applies_when", {})
        if not all(resolved.get(af) == av for af, av in applies_when.items()):
            del resolved[facet]

    return resolved, errors


def hint_pool(current_tokens: list[str]) -> list[str]:
    """Return candidate tag strings (canonical + aliases) that are applicable
    given the tokens typed so far.

    Candidates are: tags whose facet is (a) applicable given applies_when and
    (b) not yet explicitly filled by the user. The result includes both
    canonical names and aliases so the user can type either.

    Note: default values don't count as "explicitly filled" — the direction
    facet still appears in the hint pool until the user types a direction token.
    """
    resolved, _ = resolve_tags(current_tokens)

    # Determine which facets were explicitly filled by the user (vs defaulted)
    explicitly_filled: set[str] = set()
    for token in current_tokens:
        lower = token.lower().strip()
        entry = _ALIAS_MAP.get(lower)
        if entry is not None:
            facet, _ = entry
            explicitly_filled.add(facet)

    candidates: list[str] = []
    for facet, spec in TAG_FACETS.items():
        # Skip already-explicitly-filled exclusive facets
        if spec.get("exclusive") and facet in explicitly_filled:
            continue
        # Check applies_when using the full resolved dict (including defaults)
        applies_when = spec.get("applies_when", {})
        applicable = all(resolved.get(af) == av for af, av in applies_when.items())
        if not applicable:
            continue
        for canonical, vspec in spec["values"].items():
            candidates.append(canonical)
            candidates.extend(vspec.get("aliases", []))
    return candidates
