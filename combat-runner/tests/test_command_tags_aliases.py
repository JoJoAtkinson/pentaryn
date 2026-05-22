from gui.command_tags import resolve_tags


def test_physical_damage_aliases_resolve():
    for alias, canon in [("slash", "slashing"), ("pierce", "piercing"),
                         ("bludge", "bludgeoning"), ("bludgeon", "bludgeoning")]:
        resolved, errors = resolve_tags([alias])
        assert errors == [], f"{alias!r} should be a known tag"
        assert resolved.get("type") == canon


def test_canonical_type_still_resolves():
    resolved, _ = resolve_tags(["slashing"])
    assert resolved.get("type") == "slashing"
