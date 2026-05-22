from gui.dispatcher import parse


def _eff(cmd, i): return cmd.effects[i]


def test_set_target_single():
    c = parse("2")
    assert c.kind == "set_target" and c.target_ids == ["2"]


def test_set_target_multi():
    c = parse("123")
    assert c.kind == "set_target" and c.target_ids == ["1", "2", "3"]


def test_action_by_number():
    c = parse("2 2")
    assert c.kind == "command" and c.target_ids == ["2"]
    assert _eff(c, 0).kind == "action" and _eff(c, 0).action_token == "2"


def test_action_by_name():
    c = parse("3 cleave")
    assert _eff(c, 0).kind == "action" and _eff(c, 0).action_token == "cleave"


def test_amount_with_tags():
    c = parse("2 8 melee slash")
    e = _eff(c, 0)
    assert e.kind == "amount" and e.amount == 8
    assert e.amount_tags.get("type") == "slashing"
    assert e.amount_tags.get("delivery") == "melee"


def test_condition_with_duration():
    c = parse("3 2 stun")
    e = _eff(c, 0)
    assert e.kind == "condition" and e.condition == "stun" and e.duration == 2


def test_condition_no_duration_defaults_none():
    e = _eff(parse("3 prone"), 0)
    assert e.kind == "condition" and e.condition == "prone" and e.duration is None


def test_compound_amount_then_condition():
    c = parse("4 9 bludge 1 prone")
    assert _eff(c, 0).kind == "amount" and _eff(c, 0).amount == 9
    assert _eff(c, 0).amount_tags.get("type") == "bludgeoning"
    assert _eff(c, 1).kind == "condition" and _eff(c, 1).condition == "prone"
    assert _eff(c, 1).duration == 1


def test_use_current_leading_space():
    c = parse(" 1")
    assert c.use_current is True
    assert _eff(c, 0).kind == "action" and _eff(c, 0).action_token == "1"


def test_self_token():
    c = parse("0 2")
    assert c.target_ids == ["0"]
    assert _eff(c, 0).kind == "action"


def test_hit_and_undo():
    assert _eff(parse("13 hit"), 0).kind == "hit"
    assert parse("undo").effects[0].kind == "undo"


def test_damage_tag_without_number_is_unparseable():
    assert parse("2 melee").kind == "unparseable"


def test_mob_member_attaches_to_amount():
    e = _eff(parse("7 m3 6 melee"), 0)
    assert e.kind == "amount" and e.amount == 6 and e.member == 3


def test_condition_at_escape_hatch():
    e = _eff(parse("3 @prone"), 0)
    assert e.kind == "condition" and e.condition == "prone" and e.forced_condition is True


def test_garbage_is_unparseable():
    assert parse("hello there friend").kind == "unparseable"


# ─── bounds checks (A1-H2 / A2-H4) ────────────────────────────────────────

def test_amount_at_upper_bound_parses():
    c = parse("2 1000 fire")
    assert c.kind == "command" and _eff(c, 0).amount == 1000


def test_amount_over_bound_is_unparseable():
    """A fat-fingered `2 999999 fire` must NOT silently nuke a combatant —
    route it to the LLM fallback instead."""
    c = parse("2 999999 fire")
    assert c.kind == "unparseable"
    assert c.effects == []


def test_amount_zero_is_unparseable():
    # 0 damage is below the sane minimum of 1.
    assert parse("2 0 fire").kind == "unparseable"


def test_duration_at_upper_bound_parses():
    c = parse("3 100 stun")
    assert c.kind == "command" and _eff(c, 0).duration == 100


def test_duration_over_bound_is_unparseable():
    c = parse("3 999999 stun")
    assert c.kind == "unparseable"
    assert c.effects == []


def test_duration_zero_still_parses_as_condition():
    """`3 0 stun` is a valid 'default duration' spelling — NOT rejected by the
    bounds check. effects.py normalizes the 0 to 1 round."""
    c = parse("3 0 stun")
    assert c.kind == "command"
    e = _eff(c, 0)
    assert e.kind == "condition" and e.condition == "stun" and e.duration == 0
