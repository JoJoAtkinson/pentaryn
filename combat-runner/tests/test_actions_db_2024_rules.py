"""Regression guards for known 2014→2024 rule changes encoded in actions.jsonl.

Each test pins the *mechanic* — the specific words a 2024-rules effect carries
that a 2014-rules effect would never say. If a future authoring pass (manual
or LLM) reverts a row to 2014 phrasing, the test fails loudly and the diff
shows up in CI.

Extend this file as more spell/feature rows get refreshed to 2024 rules; one
test per (npc, action) pair, with the marker phrasing the 2024 SRD entry
makes unambiguous.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from combat_actions_db import get as db_get  # noqa: E402


def test_aelric_counterspell_uses_2024_con_save():
    """Counterspell row must encode the 2024 target-Con-save mechanic.

    2014 mechanic (forbidden phrasings):
      * "ability check"      — was the caster's roll
      * "DC 10 + spell level" with the COUNTERSPELL-caster rolling
      * "slot is expended" / "slot expended on success"

    2024 mechanic (required phrasings):
      * "Constitution" save on the CASTING creature
      * "slot is NOT expended" on success
    """
    row = db_get("aelric-frostweaver", "counterspell")
    assert row is not None, "missing aelric-frostweaver/counterspell row"

    blob = " ".join(
        str(v) for v in (row.get("effect", ""), row.get("narration", ""),
                          *(row.get("roll", {}) or {}).values())
    ).lower()

    # Required 2024 markers
    assert "constitution" in blob, (
        f"2024 Counterspell requires a Constitution save mention; row reads:\n{blob}"
    )
    assert "not expended" in blob or "isn't expended" in blob, (
        f"2024 Counterspell: slot is NOT expended on success — row missing that note:\n{blob}"
    )

    # Banned 2014 markers — present only if the row regressed
    assert "ability check" not in blob, (
        "2014 'ability check' phrasing found — row reverted to old mechanic"
    )
    assert "auto-counters" not in blob, (
        "2014 'auto-counters' phrasing found — 2024 always uses a save"
    )
