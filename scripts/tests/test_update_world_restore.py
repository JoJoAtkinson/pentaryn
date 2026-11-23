"""2026-11-23: the smoke test left another world serving, and three things broke on it.

The Monday run applied enhancedcombathud 5.0.1 → 5.0.2 and smoked every world in turn
(ardenford … space-journey). ``smoke.run_all`` left the LAST world serving, so:

1. the rollback's ``listBackups`` (a /setup action, 400 on 14.369+ while a world is active)
   failed, and the module stayed at 5.0.2;
2. the run still reported outcome ``recovered`` and "ROLLED BACK";
3. ``restore_service`` relaunched the table's world only ``if not fa.world_active()`` —
   space-journey was active, so pentaryn never came back, validation failed
   "world=space-journey (want pentaryn)", and the nightly's relaunch_world 400'd on
   ``launchWorld`` for the same reason.

``FakeFoundry`` below models the two server rules that matter: one world at a time, and
/setup actions refused while one is active.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from scripts.foundry.update import admin as admin_mod
from scripts.foundry.update import apply, cli, recover, smoke, state
from scripts.foundry.update.admin import FoundryError, Status


class FakeFoundry:
    def __init__(self, world: str | None = None, *, deactivate_ok: bool = True,
                 backups: dict | None = None):
        self.world = world
        self.deactivate_ok = deactivate_ok
        self.log: list[tuple] = []
        self.backups = backups if backups is not None else {
            "module": {"enhancedcombathud": [{"id": "b1", "version": "5.0.1"}]}}

    # status
    def status(self):
        return Status(active=self.world is not None, version="14.370", world=self.world)

    def world_active(self):
        return self.world is not None

    # lifecycle
    def deactivate_world(self):
        self.log.append(("deactivate", self.world))
        if not self.deactivate_ok:
            return False
        self.world = None
        return True

    def _setup_only(self, action):
        if self.world is not None:
            raise FoundryError(f"/setup {action} refused (400): The request could not be "
                               "processed.")

    def launch_world(self, world):
        self._setup_only("launchWorld")
        self.log.append(("launch", world))
        self.world = world

    def wait_for_world(self, world, timeout=0):
        assert self.world == world
        return self.status()

    def wait_for_setup(self, timeout=0):
        return None

    def reauthenticate(self):
        pass

    def setup_data(self):
        return {}

    # backups
    def list_backups(self):
        self._setup_only("listBackups")
        return self.backups

    def restore_backup(self, pkg_type, pkg_id, backup_id):
        self._setup_only("restoreBackup")
        self.log.append(("restore", pkg_id, backup_id))


@pytest.fixture(autouse=True)
def _fast(monkeypatch):
    monkeypatch.setattr(admin_mod, "SETTLE_SECONDS", 0)
    monkeypatch.setattr(admin_mod, "error_log_offset", lambda day=None: 0)
    monkeypatch.setattr(admin_mod, "wait_for_package_version", lambda *a, **k: None)
    monkeypatch.setattr(admin_mod, "quit_app",
                        lambda *a, **k: pytest.fail("the app was restarted"))
    monkeypatch.setattr(admin_mod, "start_app",
                        lambda *a, **k: pytest.fail("the app was restarted"))


def _launching_smoke(ok_by_world=None):
    """A ``_smoke_one`` that does what the real one does to the server: launch the world."""
    ok_by_world = ok_by_world or {}

    def one(fa, world, **k):
        fa.launch_world(world["id"])
        return smoke.WorldResult(world=world["id"], ok=ok_by_world.get(world["id"], True))
    return one


WORLDS = [{"id": "ardenford"}, {"id": "pentaryn"}, {"id": "space-journey"}]


# ── smoke.run_all puts the server back the way it found it ──────────────────

def test_run_all_returns_to_setup_after_the_last_world(monkeypatch):
    fa = FakeFoundry(world=None)
    monkeypatch.setattr(smoke, "_smoke_one", _launching_smoke())

    results = smoke.run_all(fa, WORLDS, policy={}, touched=set(), error_offset=0)

    assert [r.world for r in results] == ["ardenford", "pentaryn", "space-journey"]
    assert fa.world is None, "the last smoked world was left serving"
    assert fa.log[-1] == ("deactivate", "space-journey")


def test_run_all_restores_even_when_a_smoke_raises(monkeypatch):
    fa = FakeFoundry(world=None)

    def boom(fa, world, **k):
        fa.launch_world(world["id"])
        raise RuntimeError("smoke harness crashed")

    monkeypatch.setattr(smoke, "_smoke_one", boom)
    with pytest.raises(RuntimeError, match="harness crashed"):
        smoke.run_all(fa, WORLDS, policy={}, touched=set(), error_offset=0)
    assert fa.world is None


def test_run_all_relaunches_a_world_that_was_serving_on_entry(monkeypatch):
    fa = FakeFoundry(world="pentaryn")
    monkeypatch.setattr(smoke, "_smoke_one", _launching_smoke())

    smoke.run_all(fa, [{"id": "ardenford"}, {"id": "space-journey"}],
                  policy={}, touched=set(), error_offset=0)

    assert fa.world == "pentaryn"


def test_run_all_records_a_failed_restore_on_the_last_result(monkeypatch):
    fa = FakeFoundry(world=None)
    monkeypatch.setattr(smoke, "_smoke_one", _launching_smoke())
    real = smoke._return_to_setup
    calls = {"n": 0}

    def flaky(fa):
        calls["n"] += 1
        return "wedged" if calls["n"] > 1 else real(fa)   # only the final restore fails

    monkeypatch.setattr(smoke, "_return_to_setup", flaky)
    results = smoke.run_all(fa, [{"id": "ardenford"}], policy={}, touched=set(),
                            error_offset=0)
    assert results[-1].notes == ["could not return to setup after the smoke test: wedged"]


# ── admin.ensure_world: launchWorld needs the other world down first ─────────

def test_ensure_world_shuts_another_world_down_then_launches():
    fa = FakeFoundry(world="space-journey")
    status = admin_mod.ensure_world(fa, "pentaryn")
    assert status.world == "pentaryn"
    assert fa.log == [("deactivate", "space-journey"), ("launch", "pentaryn")]


def test_ensure_world_is_a_no_op_when_already_serving():
    fa = FakeFoundry(world="pentaryn")
    admin_mod.ensure_world(fa, "pentaryn")
    assert fa.log == []


def test_ensure_world_launches_from_setup():
    fa = FakeFoundry(world=None)
    admin_mod.ensure_world(fa, "pentaryn")
    assert fa.log == [("launch", "pentaryn")]


def test_ensure_world_raises_when_the_other_world_will_not_come_down(monkeypatch):
    fa = FakeFoundry(world="space-journey", deactivate_ok=False)

    def wedged(*a, **k):
        raise admin_mod.Timeout("Foundry still running after force stop")

    monkeypatch.setattr(admin_mod, "quit_app", wedged)
    with pytest.raises(FoundryError, match="space-journey is active and could not be shut"):
        admin_mod.ensure_world(fa, "pentaryn")
    assert ("launch", "pentaryn") not in fa.log


def test_ensure_world_falls_back_to_an_app_restart(monkeypatch):
    fa = FakeFoundry(world="space-journey", deactivate_ok=False)
    order: list[str] = []

    def quit_(*a, **k):
        order.append("quit")
        fa.world = None            # options.json world: null — a fresh start is at setup

    monkeypatch.setattr(admin_mod, "quit_app", quit_)
    monkeypatch.setattr(admin_mod, "start_app", lambda *a, **k: order.append("start"))
    admin_mod.ensure_world(fa, "pentaryn")
    assert order == ["quit", "start"] and fa.world == "pentaryn"


# ── recover_module parks at setup, and puts the world back ──────────────────

def test_recover_module_parks_a_live_world_and_relaunches_it():
    fa = FakeFoundry(world="space-journey")
    rec = recover.recover_module(fa, "module", "enhancedcombathud", "5.0.1")

    assert rec.ok, rec.error
    assert ("restore", "enhancedcombathud", "b1") in fa.log
    assert fa.world == "space-journey"
    assert rec.steps[0].startswith("stopped space-journey")
    assert rec.steps[-1] == "relaunched space-journey"


def test_recover_module_at_setup_adds_no_world_steps():
    fa = FakeFoundry(world=None)
    rec = recover.recover_module(fa, "module", "enhancedcombathud", "5.0.1")
    assert rec.ok
    assert rec.steps == ["restoreBackup enhancedcombathud ← b1",
                         "verified on disk: enhancedcombathud 5.0.1"]
    assert fa.world is None


def test_recover_module_that_cannot_reach_setup_fails_honestly(monkeypatch):
    fa = FakeFoundry(world="space-journey", deactivate_ok=False)

    def wedged(*a, **k):
        raise admin_mod.Timeout("stuck")

    monkeypatch.setattr(admin_mod, "quit_app", wedged)
    rec = recover.recover_module(fa, "module", "enhancedcombathud", "5.0.1")
    assert rec.ok is False
    assert rec.error.startswith("could not reach the setup screen to restore enhancedcombathud")


# ── restore_service relaunches the table's world over another one ───────────

@pytest.fixture
def state_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(state, "STATE_DIR", tmp_path)
    monkeypatch.setattr(state, "STATUS_PATH", tmp_path / "vtt-update.status")
    monkeypatch.setattr(state, "ENTRY_PATH", tmp_path / "vtt-update.entry")
    return state


def test_restore_service_switches_from_another_world(state_dir, monkeypatch):
    fa = FakeFoundry(world="space-journey")
    monkeypatch.setattr(apply, "_admin_client", lambda: fa)
    monkeypatch.setattr(admin_mod, "port_open", lambda *a, **k: True)
    monkeypatch.setattr(apply.recover, "tunnel_running", lambda root: True)
    entry = state.EntryState(foundry_up=True, tunnel_up=True, active_world="pentaryn")

    messages: list[str] = []
    apply.restore_service(entry, messages)

    assert messages == []
    assert fa.world == "pentaryn"


# ── the whole run, 2026-11-23's shape ────────────────────────────────────────

MODULE = {"id": "enhancedcombathud", "type": "module", "bucket": "auto",
          "installed": "5.0.1", "target": "5.0.2"}


def _env(monkeypatch, tmp_path, fa):
    monkeypatch.setattr(state, "STATE_DIR", tmp_path)
    monkeypatch.setattr(state, "STATUS_PATH", tmp_path / "vtt-update.status")
    monkeypatch.setattr(state, "ENTRY_PATH", tmp_path / "vtt-update.entry")
    monkeypatch.setattr(apply, "FoundryAdmin", lambda admin_password=None: fa)
    monkeypatch.setattr(apply, "_admin_client", lambda: fa)
    monkeypatch.setattr(apply.admin_pw, "foundry_admin_password", lambda required=False: "x")
    monkeypatch.setattr(apply.risk, "load_policy",
                        lambda: {"lifecycle": {"shutdown_when_done": False}})
    monkeypatch.setattr(apply.risk, "save_seen", lambda *a, **k: None)
    monkeypatch.setattr(apply, "gate", lambda fa_, policy, force=False:
                        state.EntryState(foundry_up=True, tunnel_up=False,
                                         active_world="pentaryn"))
    monkeypatch.setattr(apply.inventory, "scan", lambda: [])

    def back_up(*a):
        fa.world = None             # the run parks at setup before it touches anything
        return tmp_path / "snap", None

    monkeypatch.setattr(apply, "back_up", back_up)
    monkeypatch.setattr(apply.admin_mod, "port_open", lambda *a, **k: True)
    monkeypatch.setattr(apply.plan_mod, "build", lambda **k: {
        "decisions": [dict(MODULE)], "worlds": WORLDS})
    monkeypatch.setattr(apply.adjudicate, "apply_verdicts", lambda *a: None)
    monkeypatch.setattr(apply, "backup_packages", lambda *a: {"snapshot": "s1", "packages": []})
    monkeypatch.setattr(apply, "apply_decisions", lambda fa_, plan: (
        [{"id": "enhancedcombathud", "type": "module", "from": "5.0.1", "to": "5.0.2"}], []))
    monkeypatch.setattr(apply.recover, "newest_world_snapshot", lambda: None)
    monkeypatch.setattr(smoke, "_smoke_one", _launching_smoke({"ardenford": False}))


def _run(monkeypatch):
    sent: list[tuple] = []
    monkeypatch.setattr(apply.notify, "notify", lambda *a: sent.append(a))
    result = apply._run_locked(apply.RunResult(run_id="t"), "t",
                               dry=False, force=True, skip_llm=True)
    apply.notify_result(result)
    return result, sent


def test_the_2026_11_23_run_rolls_back_and_puts_pentaryn_back(monkeypatch, tmp_path):
    fa = FakeFoundry(world="pentaryn")
    _env(monkeypatch, tmp_path, fa)

    result, sent = _run(monkeypatch)

    assert result.recoveries and all(r["ok"] for r in result.recoveries), result.recoveries
    assert ("restore", "enhancedcombathud", "b1") in fa.log
    assert result.outcome == "recovered"
    assert fa.world == "pentaryn"
    assert sent[0][1].startswith("update rolled back")


def test_a_failed_rollback_is_never_reported_as_rolled_back(monkeypatch, tmp_path, capsys):
    fa = FakeFoundry(world="pentaryn", backups={"module": {}})   # no backup to restore
    _env(monkeypatch, tmp_path, fa)

    result, sent = _run(monkeypatch)

    assert result.outcome == "failed"
    assert "rolled back" not in sent[0][1].replace("ROLLBACK", "")
    assert "rollback FAILED for enhancedcombathud" in sent[0][1]
    assert fa.world == "pentaryn"

    result.plan = {}                     # the dry path prints the plan; not under test
    fake_apply = SimpleNamespace(run=lambda **k: result)
    cli._run(SimpleNamespace(dry=True, force=False, skip_llm=True), fake_apply, None)
    out = capsys.readouterr().out
    assert "ROLLED BACK" not in out
    assert "✗ ROLLBACK FAILED module enhancedcombathud — still at the updated version" in out


def test_the_nightly_relaunch_switches_worlds_through_ensure_world():
    """relaunch_world used `if status().world != world: launch_world(world)`, which 400s
    while another world is active. It now goes through admin.ensure_world."""
    script = (apply.REPO_ROOT / "automation/bin/vtt-nightly.sh").read_text()
    body = script[script.index("relaunch_world() {"):script.index("relaunch_world || RC=1")]
    assert "ensure_world(a, world" in body
    assert "a.launch_world(" not in body
