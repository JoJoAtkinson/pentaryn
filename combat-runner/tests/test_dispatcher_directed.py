from gui.dispatcher import Dispatcher, InputKind

D = Dispatcher()

def test_repeated_digit_id_parses():
    p = D.parse("44 12")
    assert p.kind is InputKind.DIRECTED
    assert p.target_id == "44"
    assert p.amount == 12

def test_single_digit_id_parses():
    p = D.parse("1 8")
    assert p.kind is InputKind.DIRECTED
    assert p.target_id == "1"

def test_triple_digit_id_parses():
    p = D.parse("333 5")
    assert p.kind is InputKind.DIRECTED
    assert p.target_id == "333"

def test_non_uniform_number_falls_through():
    p = D.parse("45 12")
    assert p.kind is InputKind.UNKNOWN

def test_mixed_digits_not_id():
    p = D.parse("123 10")
    assert p.kind is InputKind.UNKNOWN

def test_amount_parsed():
    p = D.parse("5 18")
    assert p.amount == 18

def test_zero_amount():
    p = D.parse("5 0")
    assert p.kind is InputKind.DIRECTED
    assert p.amount == 0

def test_tags_parsed_any_order():
    p = D.parse("3 10 fire melee")
    assert p.kind is InputKind.DIRECTED
    assert p.resolved_tags.get("type") == "fire"
    assert p.resolved_tags.get("delivery") == "melee"

def test_tag_alias_resolved():
    p = D.parse("3 10 rng")
    assert p.resolved_tags.get("delivery") == "ranged"

def test_unknown_tag_is_logged_not_fatal():
    p = D.parse("3 10 blorp")
    assert p.kind is InputKind.DIRECTED
    assert any("blorp" in e for e in p.tag_errors)

def test_heal_tag_drops_melee():
    p = D.parse("3 10 heal melee")
    assert p.resolved_tags.get("direction") == "heal"
    assert "delivery" not in p.resolved_tags

def test_damage_type_field_populated_from_tags():
    p = D.parse("3 10 fire")
    assert p.damage_type == "fire"

def test_mob_member_in_directed():
    p = D.parse("44 m2 5 fire")
    assert p.kind is InputKind.DIRECTED
    assert p.target_id == "44"
    assert p.target_member == 2
    assert p.amount == 5
    assert p.resolved_tags.get("type") == "fire"

def test_mob_m0_not_parsed_as_member():
    p = D.parse("44 m0 5")
    assert p.target_member != 0

def test_bare_id_is_jump():
    p = D.parse("3")
    assert p.kind is InputKind.JUMP
    assert p.target_id == "3"

def test_bare_repeated_id_is_jump():
    p = D.parse("44")
    assert p.kind is InputKind.JUMP
    assert p.target_id == "44"

def test_damage_sigil_unchanged():
    p = D.parse("-18 fire")
    assert p.kind is InputKind.DAMAGE
    assert p.amount == 18

def test_heal_sigil_unchanged():
    p = D.parse("+10")
    assert p.kind is InputKind.HEAL

def test_note_unchanged():
    p = D.parse("note hello world")
    assert p.kind is InputKind.NOTE

def test_quit_unchanged():
    p = D.parse("/quit")
    assert p.kind is InputKind.QUIT
