"""EC-2: with several systems installed, "the system" is dnd5e by id, not the first one.

``inventory.scan`` sorts by type then id, so with ``a5e`` (or any id before ``dnd5e``)
installed beside dnd5e, ``apply.run`` stashed and recovered the wrong system and
``plan._versions`` compared modules against the wrong system version — a failed dnd5e
update was never rolled back. Both now pick by ``inventory.SYSTEM_ID`` (folds EXT-1, and
EXT-3's literal).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.foundry.update import apply, inventory, plan, state


def _pkg(type_: str, pkg_id: str, version: str) -> inventory.Package:
    return inventory.Package(type=type_, id=pkg_id, title=pkg_id, version=version,
                             path=Path("/nonexistent") / pkg_id)


# Sorted the way inventory.scan returns them: a5e before dnd5e.
PACKAGES = [
    _pkg("system", "a5e", "9.9.9"),
    _pkg("system", "dnd5e", "5.1.2"),
    _pkg("module", "lib-wrapper", "1.0.0"),
]


def test_ec2_system_id_is_dnd5e():
    assert inventory.SYSTEM_ID == "dnd5e"


def test_ec2_plan_versions_reads_dnd5e_not_first_system(monkeypatch):
    from scripts.foundry import host
    monkeypatch.setattr(host, "core_version", lambda: "14.369")
    core, system_version, world = plan._versions(None, PACKAGES)
    assert system_version == "5.1.2"


class _Stop(apply.Aborted):
    pass


def test_ec2_run_stashes_dnd5e_not_first_system(monkeypatch, tmp_path):
    for name in ("STATE_DIR", "STATUS_PATH", "ENTRY_PATH"):
        monkeypatch.setattr(state, name, tmp_path / name.lower())
    monkeypatch.setattr(apply.admin_pw, "foundry_admin_password", lambda required=False: "pw")
    monkeypatch.setattr(apply, "FoundryAdmin", lambda **k: object())
    monkeypatch.setattr(apply, "gate", lambda fa, policy, force=False: state.EntryState(
        foundry_up=False, tunnel_up=False, active_world=None))
    monkeypatch.setattr(apply.risk, "load_policy", lambda: {})
    monkeypatch.setattr(inventory, "scan", lambda *a, **k: list(PACKAGES))
    backed_up: list[tuple[str, str]] = []

    def fake_back_up(system_id, system_version):
        backed_up.append((system_id, system_version))
        raise _Stop("stop after backup")

    monkeypatch.setattr(apply, "back_up", fake_back_up)
    result = apply.RunResult(run_id="t", started="now")
    apply._run_locked(result, "t", dry=False, force=False, skip_llm=True)
    assert backed_up == [("dnd5e", "5.1.2")]
