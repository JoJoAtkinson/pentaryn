from gui.command_tags import resolve_tags, hint_pool

def test_empty_tokens_gives_default_direction():
    resolved, errors = resolve_tags([])
    assert resolved["direction"] == "damage"
    assert errors == []

def test_damage_alias_resolves():
    resolved, _ = resolve_tags(["dmg"])
    assert resolved["direction"] == "damage"

def test_heal_alias_resolves():
    resolved, _ = resolve_tags(["hp"])
    assert resolved["direction"] == "heal"

def test_unknown_tag_is_an_error():
    _, errors = resolve_tags(["blorp"])
    assert any("blorp" in e for e in errors)

def test_second_value_in_facet_replaces_first():
    resolved, _ = resolve_tags(["fire", "cold"])
    assert resolved["type"] == "cold"  # second wins

def test_delivery_facet_inapplicable_when_healing():
    resolved, _ = resolve_tags(["heal", "melee"])
    # melee is a delivery tag; delivery.applies_when = {direction: damage}
    # since direction=heal now, melee should be dropped
    assert "delivery" not in resolved

def test_type_facet_inapplicable_when_healing():
    resolved, _ = resolve_tags(["heal", "fire"])
    assert "type" not in resolved

def test_fire_resolves_to_type_facet():
    resolved, _ = resolve_tags(["fire"])
    assert resolved.get("type") == "fire"

def test_melee_resolves_to_delivery_facet():
    resolved, _ = resolve_tags(["melee"])
    assert resolved.get("delivery") == "melee"

def test_ranged_alias():
    resolved, _ = resolve_tags(["rng"])
    assert resolved.get("delivery") == "ranged"

def test_hint_pool_before_any_tags_includes_all():
    pool = hint_pool([])
    assert "damage" in pool
    assert "heal" in pool
    assert "fire" in pool
    assert "melee" in pool

def test_hint_pool_after_heal_excludes_type_and_delivery():
    pool = hint_pool(["heal"])
    assert "fire" not in pool
    assert "melee" not in pool

def test_hint_pool_after_type_filled_excludes_same_facet():
    pool = hint_pool(["fire"])
    # type facet is now filled; its other values should not appear
    # (exclusive facet already satisfied)
    assert "cold" not in pool

def test_hint_pool_includes_aliases():
    pool = hint_pool([])
    assert "dmg" in pool
    assert "hp" in pool


def test_later_direction_overrides_earlier_delivery():
    resolved, _ = resolve_tags(["melee", "heal"])
    assert "delivery" not in resolved


def test_later_direction_overrides_earlier_type():
    resolved, _ = resolve_tags(["fire", "heal"])
    assert "type" not in resolved


def test_uppercase_token_normalises():
    resolved, _ = resolve_tags(["FIRE"])
    assert resolved.get("type") == "fire"


def test_explicit_damage_keeps_type_applicable():
    resolved, _ = resolve_tags(["heal", "damage", "fire"])
    assert resolved["direction"] == "damage"
    assert resolved.get("type") == "fire"


def test_hint_pool_after_direction_override_includes_type():
    pool = hint_pool(["heal", "damage"])
    assert "fire" in pool
