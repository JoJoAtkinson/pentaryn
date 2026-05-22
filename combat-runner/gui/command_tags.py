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
            "piercing":  {},
            "slashing":  {},
            "bludgeoning": {},
        },
    },
}

# Build reverse alias map at module load: alias/canonical → (facet, canonical)
_ALIAS_MAP: dict[str, tuple[str, str]] = {}
for _facet, _spec in TAG_FACETS.items():
    for _canonical, _vspec in _spec["values"].items():
        _ALIAS_MAP[_canonical] = (_facet, _canonical)
        for _alias in _vspec.get("aliases", []):
            _ALIAS_MAP[_alias] = (_facet, _canonical)


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

    # Apply default for required facets not yet set
    for facet, spec in TAG_FACETS.items():
        if spec.get("required") and facet not in resolved:
            default = spec.get("default")
            if default:
                resolved[facet] = default

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
