"""The updater's host side: hostdeps (plan/apply/rollback) and verify, all with RUN and
FETCH faked — no apt, nvm, network or claude call happens here.
Design: context/plans/monday-updater-2026-10.md."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from scripts.foundry.update import apply, hostdeps, report, verify


class FakeRun:
    """Answers commands by prefix; records every call."""

    def __init__(self, answers: dict[tuple, tuple[int, str]]):
        self.answers = answers
        self.calls: list[list[str]] = []

    def __call__(self, cmd, **kw):
        self.calls.append(list(cmd))
        for prefix, (rc, out) in self.answers.items():
            if tuple(cmd[:len(prefix)]) == prefix:
                return subprocess.CompletedProcess(cmd, rc, out, "")
        return subprocess.CompletedProcess(cmd, 0, "", "")


# ── version logic ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("version,spec,want", [
    ("24.21.0", ">=24.13.1 <25.0.0", True),
    ("24.13.0", ">=24.13.1 <25.0.0", False),
    ("25.0.0", ">=24.13.1 <25.0.0", False),
    ("22.4.0", ">=20 <21 || >=22", True),
    ("24.1.0", "^24.0.0", True),
    ("25.1.0", "^24.0.0", False),
    ("24.1.9", "~24.1.0", True),
    ("24.2.0", "~24.1.0", False),
    ("24.1.0", "", False),
    ("24.1.0", "latest", False),
])
def test_satisfies(version, spec, want):
    assert hostdeps.satisfies(version, spec) is want


def test_newer_compares_numerically():
    assert hostdeps.newer("2026.10.1", "2026.10.0")
    assert hostdeps.newer("24.10.0", "24.9.9")
    assert not hostdeps.newer("1.75.2", "1.75.2")
    assert not hostdeps.newer(None, "1.0")


# ── node ─────────────────────────────────────────────────────────────────────

@pytest.fixture
def node_world(tmp_path, monkeypatch):
    nvm = tmp_path / ".nvm" / "versions" / "node"
    for v in ("24.21.0", "24.22.0"):
        (nvm / f"v{v}" / "bin").mkdir(parents=True)
        (nvm / f"v{v}" / "bin" / "node").write_text("")
    unit = tmp_path / "foundryvtt.service"
    unit.write_text("[Service]\n# Node comes from nvm by absolute path; update this line if the "
                    "nvm node version changes.\n"
                    f"ExecStart={nvm}/v24.21.0/bin/node /app/main.js --port=30000\n")
    pkg = tmp_path / "package.json"
    pkg.write_text(json.dumps({"engines": {"node": ">=24.13.1 <25.0.0"}}))
    monkeypatch.setattr(hostdeps, "HOME", tmp_path)
    monkeypatch.setattr(hostdeps, "NVM_DIR", tmp_path / ".nvm")
    monkeypatch.setattr(hostdeps, "FOUNDRY_UNIT", unit)
    monkeypatch.setattr(hostdeps, "NODE_LINK", tmp_path / "share" / "node")
    monkeypatch.setattr(hostdeps, "NODE_LINK_BIN", tmp_path / "share" / "node" / "bin" / "node")
    monkeypatch.setattr(hostdeps.host, "app_package_json", lambda: pkg)
    env: dict[str, str] = {}
    monkeypatch.setattr(hostdeps, "set_env_key", lambda k, v: env.__setitem__(k, v))
    monkeypatch.setattr(hostdeps.host, "get", lambda k, d=None: env.get(k, d))
    index = json.dumps([{"version": v} for v in ("v25.1.0", "v24.22.0", "v24.21.0", "v22.20.0")])
    monkeypatch.setattr(hostdeps, "FETCH", lambda url, timeout=20: index)
    return {"tmp": tmp_path, "unit": unit, "nvm": nvm, "env": env}


def _versions(cmd, **kw):
    exe = Path(cmd[0])
    if cmd[1:] == ["--version"] and exe.name == "node":
        return subprocess.CompletedProcess(cmd, 0, f"v{exe.resolve().parent.parent.name[1:]}\n", "")
    return subprocess.CompletedProcess(cmd, 0, "", "")


def test_node_targets_the_newest_release_inside_foundrys_engines(node_world, monkeypatch):
    monkeypatch.setattr(hostdeps, "RUN", _versions)
    item = hostdeps.plan_node({})
    assert (item.installed, item.target, item.bucket) == ("24.21.0", "24.22.0", "auto")
    assert item.restart == ["foundry"]                      # 25.1.0 is outside the engines


def test_node_policy_review_and_no_engines_hold(node_world, monkeypatch):
    monkeypatch.setattr(hostdeps, "RUN", _versions)
    assert hostdeps.plan_node({"host": {"node": "review"}}).bucket == "review"
    (node_world["tmp"] / "package.json").write_text("{}")
    assert hostdeps.plan_node({}).bucket == "hold"


def test_node_apply_migrates_the_unit_once_then_swaps_the_link_and_rolls_back(node_world, monkeypatch):
    monkeypatch.setattr(hostdeps, "RUN", _versions)
    item = hostdeps.plan_node({})
    monkeypatch.setattr(hostdeps, "_nvm", lambda args, timeout=900: (0, "ok"))
    rec = hostdeps.apply_node(item)
    assert "error" not in rec
    assert hostdeps.NODE_LINK.resolve() == node_world["nvm"] / "v24.22.0"
    unit = node_world["unit"].read_text()
    assert "ExecStart=%h/share/node/bin/node /app/main.js" in unit
    assert "the updater swaps it" in unit
    assert node_world["env"]["PENTARYN_NODE"] == str(hostdeps.NODE_LINK_BIN)
    assert rec["previous"] == str(node_world["nvm"] / "v24.21.0")
    assert hostdeps.rollback(rec) is None
    assert hostdeps.NODE_LINK.resolve() == node_world["nvm"] / "v24.21.0"
    # a second migration changes nothing
    assert hostdeps.migrate_node_link() == []


def test_node_apply_failure_leaves_the_link_alone(node_world, monkeypatch):
    monkeypatch.setattr(hostdeps, "RUN", _versions)
    item = hostdeps.plan_node({})
    item.target = "24.99.0"                                 # nvm "installs" nothing there
    monkeypatch.setattr(hostdeps, "_nvm", lambda args, timeout=900: (3, "download failed"))
    rec = hostdeps.apply_node(item)
    assert "download failed" in rec["error"]
    assert hostdeps.NODE_LINK.resolve() == node_world["nvm"] / "v24.21.0"


# ── apt ──────────────────────────────────────────────────────────────────────

def apt_world(sudo=0):
    return FakeRun({
        ("sudo", "-n", "true"): (sudo, ""),
        ("dpkg-query", "-W", "-f=${Version}", "cloudflared"): (0, "2026.10.0"),
        ("dpkg-query", "-W", "-f=${Version}", "infisical"): (0, "0.44.2"),
        ("dpkg-query", "-W", "-f=${Version}", "gh"): (1, ""),
        ("apt-cache", "policy", "cloudflared"): (0, "cloudflared:\n  Installed: 2026.10.0\n  Candidate: 2026.10.1\n"),
        ("apt-cache", "policy", "infisical"): (0, "  Candidate: 0.44.2\n"),
        ("apt", "list", "--upgradable"): (0, "Listing...\ncloudflared/unknown 2026.10.1 amd64 [upgradable from: 2026.10.0]\n"
                                             "tzdata/resolute-updates 2026e all [upgradable from: 2026c]\n"),
    })


def test_apt_plan_game_packages_and_the_rest(monkeypatch):
    fake = apt_world()
    monkeypatch.setattr(hostdeps, "RUN", fake)
    items = {i.id: i for i in hostdeps.plan_apt({})}
    assert (items["apt:cloudflared"].target, items["apt:cloudflared"].bucket) == ("2026.10.1", "auto")
    assert items["apt:cloudflared"].restart == ["tunnel"]
    assert items["apt:infisical"].bucket == "current"
    assert items["apt:gh"].bucket == "hold"                  # not an apt package here
    assert items["apt:ubuntu"].detail["packages"] == ["tzdata"]   # game packages excluded
    assert ["sudo", "-n", "apt-get", "update", "-qq"] in fake.calls


def test_apt_without_sudo_holds_and_never_refreshes(monkeypatch):
    fake = apt_world(sudo=1)
    monkeypatch.setattr(hostdeps, "RUN", fake)
    items = {i.id: i for i in hostdeps.plan_apt({})}
    assert items["apt:cloudflared"].bucket == "hold"
    assert items["apt:ubuntu"].bucket == "hold"
    assert not any(c[:3] == ["sudo", "-n", "apt-get"] for c in fake.calls)


def test_apt_apply_checks_the_version_and_rolls_back_to_the_exact_one(monkeypatch):
    installed = {"v": "2026.10.0"}

    def run(cmd, **kw):
        if cmd[:3] == ["sudo", "-n", "apt-get"] and "--only-upgrade" in cmd:
            installed["v"] = "2026.10.1"
        if cmd[:2] == ["dpkg-query", "-W"]:
            return subprocess.CompletedProcess(cmd, 0, installed["v"], "")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    calls: list = []
    monkeypatch.setattr(hostdeps, "RUN", lambda cmd, **kw: (calls.append(cmd), run(cmd, **kw))[1])
    item = hostdeps.HostItem("apt:cloudflared", "cloudflared", "2026.10.0", "2026.10.1", "auto",
                             restart=["tunnel"])
    rec = hostdeps.apply_apt(item)
    assert "error" not in rec and rec["restart"] == ["tunnel"]
    assert hostdeps.rollback(rec) is None
    assert any("cloudflared=2026.10.0" in c for c in calls[-1])
    assert "--allow-downgrades" in calls[-1]


def test_ubuntu_upgrades_have_no_rollback():
    assert "no rollback" in hostdeps.rollback({"id": "apt:ubuntu"})


# ── apply ordering ───────────────────────────────────────────────────────────

def test_apply_runs_auto_only_node_last_and_never_raises(monkeypatch):
    order: list[str] = []
    monkeypatch.setattr(hostdeps, "apply_apt", lambda i: (order.append(i.id), {"id": i.id})[1])
    monkeypatch.setattr(hostdeps, "APPLY", {
        "node": lambda i: (order.append("node"), {"id": "node", "restart": ["foundry"]})[1],
        "rclone": lambda i: (_ for _ in ()).throw(RuntimeError("boom")),
    })
    plan = [hostdeps.HostItem("node", "n", "1", "2", "auto").to_json(),
            hostdeps.HostItem("rclone", "r", "1", "2", "auto").to_json(),
            hostdeps.HostItem("apt:gh", "g", "1", "2", "auto").to_json(),
            hostdeps.HostItem("chrome", "c", "1", "2", "review").to_json()]
    applied, failed = hostdeps.apply(plan)
    assert order == ["apt:gh", "node"]
    assert [f["id"] for f in failed] == ["rclone"] and "boom" in failed[0]["error"]
    assert hostdeps.restarts(applied) == {"foundry"}


# ── verify + the run's rollback on a failing check ──────────────────────────

def test_tunnel_check_accepts_the_access_redirect_and_rejects_a_dead_tunnel(monkeypatch):
    monkeypatch.setattr(verify, "public_hostname", lambda: "vtt.example")
    from scripts.foundry.update import recover
    monkeypatch.setattr(recover, "tunnel_running", lambda root: True)
    monkeypatch.setattr(hostdeps, "RUN", FakeRun({("curl",): (0, "302")}))
    assert verify.check_tunnel(True)["ok"]
    monkeypatch.setattr(hostdeps, "RUN", FakeRun({("curl",): (0, "530")}))
    c = verify.check_tunnel(True)
    assert not c["ok"] and c["component"] == "apt:cloudflared"
    assert verify.check_tunnel(False)["ok"]                  # not expected up


def test_a_failing_check_rolls_back_the_host_update_behind_it(monkeypatch):
    rounds = iter([
        [{"id": "tunnel", "label": "tunnel", "ok": False, "detail": "530", "component": "apt:cloudflared"},
         {"id": "llm", "label": "llm", "ok": False, "detail": "rc=1", "component": "claude"}],
        [{"id": "tunnel", "label": "tunnel", "ok": True, "detail": "302", "component": "apt:cloudflared"},
         {"id": "llm", "label": "llm", "ok": False, "detail": "rc=1", "component": "claude"}],
    ])
    monkeypatch.setattr(apply.verify, "run_all", lambda **kw: next(rounds))
    rolled: list = []
    monkeypatch.setattr(apply.hostdeps, "rollback", lambda rec: rolled.append(rec["id"]))
    monkeypatch.setattr(apply.recover, "tunnel_down", lambda root: True)
    monkeypatch.setattr(apply.recover, "tunnel_up", lambda root: True)
    result = apply.RunResult(run_id="t", outcome="done")
    result.host_applied = [{"id": "apt:cloudflared", "from": "2026.10.0", "to": "2026.10.1",
                            "restart": ["tunnel"]}]
    apply._verify(result, world="w", tunnel_expected=True)
    assert rolled == ["apt:cloudflared"]                     # claude was not updated: no rollback
    assert result.outcome == "recovered"
    assert result.host_rollbacks[0]["to"] == "2026.10.0"
    assert [c["ok"] for c in result.verify] == [True, False]
    assert any("validation FAILED: llm" in m for m in result.messages)


def test_notification_names_failing_checks(monkeypatch):
    sent: list = []
    monkeypatch.setattr(apply.notify, "notify", lambda *a: sent.append(a))
    result = apply.RunResult(run_id="t", outcome="done")
    result.host_applied = [{"id": "node", "from": "24.21.0", "to": "24.22.0"}]
    result.verify = [{"id": "llm", "label": "claude -p answers", "ok": False, "detail": "rc=1",
                      "component": "claude"}]
    apply.notify_result(result)
    kind, subtitle, body = sent[0]
    assert kind == "attention" and "1 check(s) failing" in subtitle
    assert "node 24.21.0 → 24.22.0" in body and "✗ claude -p answers" in body


def test_report_has_host_and_validation_sections_and_none_without_them():
    record = {"run_id": "t", "outcome": "done", "plan": {"host": [
        {"id": "node", "label": "Node.js", "installed": "24.21.0", "target": "24.22.0",
         "bucket": "auto", "reason": ""},
        {"id": "rclone", "label": "rclone", "installed": "1.75.2", "target": None,
         "bucket": "current", "reason": "current"}]},
        "host_applied": [{"id": "node", "from": "24.21.0", "to": "24.22.0"}],
        "verify": [{"label": "Foundry serving", "ok": True, "detail": "pentaryn"}]}
    md = report.fallback_markdown(record)
    assert "## Host dependencies" in md and "updated 24.21.0 → 24.22.0" in md
    assert "## Validation — 1/1 pass" in md
    assert "## Host dependencies" not in report.fallback_markdown({"run_id": "t", "plan": {}})
