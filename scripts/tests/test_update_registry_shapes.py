"""ROB-2: a malformed registry *shape* must raise RegistryError, not crash.

``adjustments.load`` validated every row but trusted the two top-level keys: an
``aliases:`` written as a list (or a bare string) hit ``.items()`` and raised
``AttributeError``, and an ``adjustments:`` written as a number raised ``TypeError``.
Neither is a ``RegistryError``, so ``load_or_empty`` — the run path's "a broken registry
must not kill a Saturday" guard — let them through and the weekly update died. Both keys
are now shape-checked and the error names the offending key.
"""

from __future__ import annotations

import pytest

from scripts.foundry.update import adjustments as adj_mod

ROW = "  - id: ok-id\n    packages: [x]\n    files: [a]\n    what: w\n"


@pytest.mark.parametrize("body,needle", [
    ("adjustments: 5\n", "`adjustments` must be a list"),
    ("adjustments:\n  ok-id: {packages: [x]}\n", "`adjustments` must be a list"),
    ("adjustments: just a string\n", "`adjustments` must be a list"),
    ("adjustments:\n" + ROW + "aliases:\n  - dice-so-nice\n", "`aliases` must be a mapping"),
    ("adjustments:\n" + ROW + "aliases: dice-so-nice\n", "`aliases` must be a mapping"),
    ("adjustments:\n" + ROW + "aliases:\n  dice-so-nice: 3\n", "dice-so-nice: `aliases`"),
    ("adjustments:\n" + ROW + "aliases:\n  dice-so-nice: {a: b}\n", "dice-so-nice: `aliases`"),
])
def test_rob2_malformed_shapes_raise_registry_error(tmp_path, body, needle):
    path = tmp_path / "adj.yml"
    path.write_text(body)
    with pytest.raises(adj_mod.RegistryError, match=needle):
        adj_mod.load(path)
    reg, err = adj_mod.load_or_empty(path)
    assert reg.rows == [] and reg.aliases == {} and needle in err


def test_rob2_well_formed_and_absent_keys_still_load(tmp_path):
    path = tmp_path / "adj.yml"
    path.write_text("adjustments:\n" + ROW + "aliases:\n  x: [a, b]\n  y: c, d\n")
    reg = adj_mod.load(path)
    assert [r.id for r in reg.rows] == ["ok-id"]
    assert reg.aliases == {"x": ("a", "b"), "y": ("c", "d")}
    path.write_text("adjustments:\naliases:\n")      # both keys empty: an empty registry
    reg = adj_mod.load(path)
    assert reg.rows == [] and reg.aliases == {}
