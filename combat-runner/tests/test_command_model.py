from gui.command_model import Effect, ParsedCommand

def test_effect_and_command_construct():
    e = Effect(kind="amount", amount=8, amount_tags={"type": "slashing"})
    c = ParsedCommand(kind="command", target_ids=["2"], effects=[e], raw="2 8 slash")
    assert c.effects[0].amount == 8
    assert c.use_current is False

def test_effect_members_field_defaults_none():
    """`members` defaults to None — the 'no `m` modifier' state.

    Contract: None = default routing; [] = `m` alone (all alive members);
    [1,2] = an explicit member set."""
    assert Effect(kind="amount").members is None
    assert Effect(kind="amount", members=[]).members == []
    assert Effect(kind="amount", members=[1, 2]).members == [1, 2]
