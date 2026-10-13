"""EC-12: a smoke selection that matches no world must say so, not report a clean run.

``policy.smoke.worlds`` can name worlds that are not installed (a typo, a renamed or
removed world). ``run_all`` then smokes nothing, ``broken`` is empty, and the run used
to finish ``done`` with a plain "updated" notification — nothing was tested. The ruling
(mark, don't block): the outcome stays ``done``, the report carries one line saying
the selection matched no world, and the notification is the ``attention`` kind.
"""

from __future__ import annotations

from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update import apply, smoke, state

MODULE = {"id": "dice-so-nice", "type": "module", "bucket": "auto",
          "installed": "6.4.1", "target": "6.4.2"}


class _FA:
    def setup_data(self):
        return {}

    def reauthenticate(self):
        pass

    def world_active(self):
        return False

    def wait_for_setup(self, timeout=180):
        return None


def _env(monkeypatch, tmp_path, wanted):
    monkeypatch.setattr(state, "STATE_DIR", tmp_path)
    monkeypatch.setattr(state, "STATUS_PATH", tmp_path / "vtt-update.status")
    monkeypatch.setattr(state, "ENTRY_PATH", tmp_path / "vtt-update.entry")
    monkeypatch.setattr(apply, "FoundryAdmin", lambda admin_password=None: _FA())
    monkeypatch.setattr(apply.admin_pw, "foundry_admin_password", lambda required=False: "x")
    monkeypatch.setattr(apply.risk, "load_policy", lambda: {"smoke": {"worlds": wanted}})
    monkeypatch.setattr(apply.risk, "save_seen", lambda *a, **k: None)
    monkeypatch.setattr(apply, "gate", lambda fa, policy, force=False:
                        state.EntryState(foundry_up=True, tunnel_up=False,
                                         active_world="pentaryn"))
    monkeypatch.setattr(apply.inventory, "scan", lambda: [])
    monkeypatch.setattr(apply, "back_up", lambda *a: (tmp_path / "snap", None))
    monkeypatch.setattr(apply.admin_mod, "port_open", lambda *a, **k: True)
    monkeypatch.setattr(apply.plan_mod, "build", lambda **k: {
        "decisions": [dict(MODULE)], "worlds": [{"id": "pentaryn"}, {"id": "ardenford"}]})
    monkeypatch.setattr(apply.adjudicate, "apply_verdicts", lambda *a: None)
    monkeypatch.setattr(apply, "backup_packages", lambda *a: {"snapshot": "s1", "packages": []})
    monkeypatch.setattr(apply.admin_mod, "error_log_offset", lambda day=None: 0)
    monkeypatch.setattr(apply, "apply_decisions", lambda fa, plan: (
        [{"id": "dice-so-nice", "from": "6.4.1", "to": "6.4.2"}], []))
    monkeypatch.setattr(smoke, "_return_to_setup", lambda fa: None)
    monkeypatch.setattr(smoke, "_smoke_one", lambda fa, world, **k:
                        smoke.WorldResult(world=world["id"], ok=True))
    monkeypatch.setattr(apply, "shut_down_service", lambda messages: None)
    monkeypatch.setattr(apply, "restore_service", lambda entry, messages: None)


def _run_and_notify(monkeypatch):
    sent: list[tuple] = []
    monkeypatch.setattr(apply.notify, "notify", lambda *a: sent.append(a))
    result = apply._run_locked(apply.RunResult(run_id="t"), "t",
                               dry=False, force=True, skip_llm=True)
    apply.notify_result(result)
    return result, sent


def test_ec12_selection_matching_no_world_is_marked_for_attention(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path, ["pentaryn-typo"])
    result, sent = _run_and_notify(monkeypatch)

    assert result.outcome == "done"          # mark, don't block
    assert result.smoke == []
    assert ("smoke: policy selection pentaryn-typo matched no world — nothing was smoked"
            in result.messages)
    assert sent[0][0] == "attention"


def test_ec12_a_selection_that_matches_stays_a_plain_done(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path, ["pentaryn"])
    result, sent = _run_and_notify(monkeypatch)

    assert result.outcome == "done", result.messages
    assert [r["world"] for r in result.smoke] == ["pentaryn"]
    assert not any("matched no world" in m for m in result.messages)
    assert sent[0][0] == "done"


def test_ec12_no_worlds_at_all_is_not_a_selection_miss():
    assert smoke.selection_miss([], {"smoke": {"worlds": ["x"]}}) is None
    assert smoke.selection_miss([{"id": "a"}], {"smoke": {"worlds": "all"}}) is None
    assert smoke.selection_miss([{"id": "a"}], {"smoke": {"worlds": ["b", "c"]}}) == (
        "smoke: policy selection b, c matched no world — nothing was smoked")
