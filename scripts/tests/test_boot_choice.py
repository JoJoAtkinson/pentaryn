"""The boot choice (design §6), every row of §6.2, on two fake hosts sharing one cloud.

`mac` is the primary (where Joe plays), `boss` the alt. The rule under test is Joe's:
the alt, when it boots, wants the primary's latest — offered as the default, never
silently, never without a terminal; the primary is asked only when the alt has really
been used since.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import time

import pytest

from cloud_fakes import FakeRclone
from scripts.foundry import boot, bootstate, cloud, host, storage
from scripts.foundry.storage import RcloneStorage


def _tree_hash(root) -> str:
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        if p.is_file():
            h.update(str(p.relative_to(root)).encode())
            h.update(p.read_bytes())
    return h.hexdigest()


_tick = [0]


def _play(two_hosts, name, text):
    """A session on `name`: change the world, then the vtt-down backup. Returns the name
    of the snapshot it uploaded."""
    f = two_hosts.data[name] / "Data/worlds/w/journal.txt"
    f.write_text(text)
    _tick[0] += 7                  # a fresh int-second mtime every session: a new digest
    t = time.time() + _tick[0]
    os.utime(f, (t, t))
    with two_hosts.use(name):
        assert cloud.backup("shutdown") == 0
        return bootstate.load().based_on


def _journal(two_hosts, name):
    f = two_hosts.data[name] / "Data/worlds/w/journal.txt"
    return f.read_text() if f.exists() else ""


def _state(two_hosts, name) -> dict:
    p = two_hosts.state_file(name)
    return json.loads(p.read_text()) if p.exists() else {}


# ── Joe's scenario, end to end ──────────────────────────────────────────────

def test_alt_is_offered_the_primarys_latest_and_enter_takes_it(two_hosts, tty, capsys):
    mac_snap = _play(two_hosts, "mac", "saturday session")
    asked = tty(True, [""])                       # Enter
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    out = capsys.readouterr().out
    assert len(asked) == 1 and "Enter = latest" in asked[0]
    assert "cloud has a newer world snapshot" in out and mac_snap in out
    assert "(no record of which snapshot this world is based on)" in out
    assert _journal(two_hosts, "boss") == "saturday session"
    st = _state(two_hosts, "boss")
    assert (st["based_on"], st["based_on_host"]) == (mac_snap, "mac")


def test_after_the_alt_takes_the_latest_the_primary_boots_quietly(two_hosts, tty, capsys):
    _play(two_hosts, "mac", "saturday session")
    tty(True, [""])
    with two_hosts.use("boss"):
        (two_hosts.data["boss"] / "Data/worlds/w/addon-scratch.txt").write_text("x")
        boot.choose()                             # archives boss's scratch as a .safety copy
    assert any(s.safety for s in cloud.snapshots(cloud.store()))
    asked = tty(True, ["k"])
    with two_hosts.use("mac"):
        assert boot.choose() == 0
    assert asked == []                            # the safety copy is never "newer"
    assert "local world is based on the newest snapshot" in capsys.readouterr().out


def test_primary_is_asked_only_when_the_alt_was_really_used(two_hosts, tty):
    _play(two_hosts, "mac", "saturday")
    tty(True, [""])
    with two_hosts.use("boss"):
        boot.choose()
    boss_snap = _play(two_hosts, "boss", "addon testing on sunday")   # boss vtt-down
    asked = tty(True, ["k"])
    with two_hosts.use("mac"):
        assert boot.choose() == 0
    assert len(asked) == 1
    assert _journal(two_hosts, "mac") == "saturday"                   # kept local
    assert _state(two_hosts, "mac")["keep_local_until_newer_than"] == boss_snap


# ── §6.2 row by row ─────────────────────────────────────────────────────────

def test_own_newest_is_based_on_so_quiet_local(two_hosts, tty, capsys):
    _play(two_hosts, "mac", "x")
    asked = tty(True, [""])
    with two_hosts.use("mac"):
        assert boot.choose() == 0
    assert asked == []
    assert "local world is based on the newest snapshot" in capsys.readouterr().out


def test_older_other_host_snapshot_is_not_newer(two_hosts, tty):
    _play(two_hosts, "boss", "last week's addon build")
    time.sleep(0.01)
    _play(two_hosts, "mac", "yesterday's session")
    asked = tty(True, [""])
    with two_hosts.use("mac"):
        boot.choose()
    assert asked == []


def test_keep_local_is_remembered_until_something_newer(two_hosts, tty, capsys):
    first = _play(two_hosts, "mac", "one")
    asked = tty(True, ["k"])
    with two_hosts.use("boss"):
        before = _tree_hash(two_hosts.data["boss"] / "Data")
        assert boot.choose() == 0
        assert _state(two_hosts, "boss")["keep_local_until_newer_than"] == first
        asked2 = tty(True, [""])
        assert boot.choose() == 0                       # second call: quiet
        assert asked2 == []
        assert "keep the local world over" in capsys.readouterr().out
    assert len(asked) == 1
    assert _tree_hash(two_hosts.data["boss"] / "Data") == before
    second = _play(two_hosts, "mac", "two")
    asked3 = tty(True, ["k"])
    with two_hosts.use("boss"):
        boot.choose()                                   # a still-newer one: asks again
    assert len(asked3) == 1
    assert _state(two_hosts, "boss")["keep_local_until_newer_than"] == second


NOTICE = re.compile(
    r"▸ boot: cloud snapshot (world-\S+-mac\.tar\.gz) \(mac, \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\) "
    r"is newer than this world \(based on an unknown snapshot\); booting LOCAL\. To use it: "
    r"make foundry-up FROM=latest   \(or: make foundry-restore SNAP=(world-\S+-mac\.tar\.gz)\)")


def test_non_interactive_boots_local_with_the_notice_and_remembers_nothing(two_hosts, tty, capsys):
    snap = _play(two_hosts, "mac", "x")
    asked = tty(False, [""])
    with two_hosts.use("boss"):
        before = _tree_hash(two_hosts.data["boss"])
        assert boot.choose() == 0
    assert asked == []
    m = NOTICE.search(capsys.readouterr().out)
    assert m and m.group(1) == snap == m.group(2)
    assert _tree_hash(two_hosts.data["boss"]) == before        # no state file, no restore
    assert not two_hosts.state_file("boss").exists()


def test_noninteractive_env_wins_over_a_tty(two_hosts, tty, monkeypatch):
    _play(two_hosts, "mac", "x")
    asked = tty(True, [""])
    monkeypatch.setenv("PENTARYN_NONINTERACTIVE", "1")
    with two_hosts.use("boss"):
        boot.choose()
    assert asked == []


def test_from_local(two_hosts, tty, capsys):
    _play(two_hosts, "mac", "x")
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose("local") == 0
    assert asked == [] and "FROM=local" in capsys.readouterr().out
    assert _journal(two_hosts, "boss") != "x"


def test_from_env_is_read(two_hosts, tty, monkeypatch):
    _play(two_hosts, "mac", "via env")
    tty(False)
    monkeypatch.setenv("FROM", "latest")
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert _journal(two_hosts, "boss") == "via env"


def test_from_latest_restores_without_a_terminal(two_hosts, tty):
    _play(two_hosts, "mac", "latest please")
    tty(False)
    with two_hosts.use("boss"):
        assert boot.choose("latest") == 0
    assert _journal(two_hosts, "boss") == "latest please"


def test_from_latest_restores_even_when_it_is_based_on(two_hosts, tty, capsys):
    _play(two_hosts, "mac", "as uploaded")
    (two_hosts.data["mac"] / "Data/worlds/w/journal.txt").write_text("unsaved tinkering")
    tty(False)
    with two_hosts.use("mac"):
        assert boot.choose("latest") == 0
    assert _journal(two_hosts, "mac") == "as uploaded"      # Joe asked


def test_from_latest_with_an_empty_cloud_boots_local_with_a_warning(two_hosts, tty, capsys):
    tty(False)
    with two_hosts.use("boss"):
        assert boot.choose("latest") == 0
    assert "FROM=latest but the cloud has no snapshots" in capsys.readouterr().out


def test_from_a_name_restores_that_one_even_when_not_newest(two_hosts, tty):
    boss_build = _play(two_hosts, "boss", "boss's addon build")
    _play(two_hosts, "mac", "mac's newer session")
    tty(True, ["k"])                              # FROM= never asks
    with two_hosts.use("mac"):
        assert boot.choose(boss_build) == 0
    assert _journal(two_hosts, "mac") == "boss's addon build"
    assert _state(two_hosts, "mac")["based_on"] == boss_build


def test_from_a_bad_name_fails_and_lists_the_names(two_hosts, tty, capsys):
    snap = _play(two_hosts, "mac", "x")
    tty(False)
    with two_hosts.use("boss"):
        before = _tree_hash(two_hosts.data["boss"])
        assert boot.choose("world-typo.tar.gz") == 1
        assert _tree_hash(two_hosts.data["boss"]) == before
    err = capsys.readouterr().err
    assert "FROM=world-typo.tar.gz: no such snapshot" in err and snap in err


def test_running_foundry_boots_local_and_lists_nothing(two_hosts, tty, monkeypatch, capsys):
    fake = FakeRclone(two_hosts.cloud.parent)
    rc = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake)
    monkeypatch.setattr(storage, "get", lambda: rc)
    monkeypatch.setattr(host, "is_running", lambda port=None: True)
    tty(True, [""])
    assert boot.choose("latest") == 0
    assert fake.calls == []
    assert "Foundry already up" in capsys.readouterr().out


@pytest.mark.parametrize("mode", ["missing-binary", "hang", "exit-1"])
def test_cloud_down_boots_local_with_a_warning(two_hosts, tty, monkeypatch, capsys, mode):
    fake = FakeRclone(two_hosts.cloud.parent)
    if mode == "hang":
        fake.hang.add("lsjson")
        runner = fake
    elif mode == "exit-1":
        fake.fail_always["lsjson"] = (1, "Failed to create file system: network is unreachable")
        runner = fake
    else:
        def runner(argv, **kw):
            raise FileNotFoundError(argv[0])
    rc = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=runner,
                       timeouts={"lsjson": 0.2})
    monkeypatch.setattr(storage, "get", lambda: rc)
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        before = _tree_hash(two_hosts.data["boss"])
        assert boot.choose() == 0
        assert _tree_hash(two_hosts.data["boss"]) == before
    assert asked == []
    out = capsys.readouterr().out
    assert "⚠ cloud unreachable (lsjson failed" in out and "booting the local world" in out


def test_no_cloud_configured_at_all_boots_local(two_hosts, tty, monkeypatch, capsys):
    def nothing():
        raise storage.StorageError("no cloud: set PENTARYN_CLOUD or run `rclone config`",
                                   verb="listremotes")
    monkeypatch.setattr(storage, "get", nothing)
    tty(True, [""])
    assert boot.choose() == 0
    assert "cloud unreachable (listremotes failed" in capsys.readouterr().out


def test_download_failure_after_choosing_restore_touches_nothing(two_hosts, tty, monkeypatch,
                                                                  capsys):
    _play(two_hosts, "mac", "x")
    fake = FakeRclone(two_hosts.cloud.parent)
    fake.fail_always["copyto"] = (1, "Failed to copy: connection reset by peer")
    rc = RcloneStorage(f"fake:{two_hosts.cloud.name}", bin="rclone", runner=fake,
                       interactive=False)
    monkeypatch.setattr(storage, "get", lambda: rc)
    tty(True, [""])
    with two_hosts.use("boss"):
        before = _tree_hash(two_hosts.data["boss"])
        assert boot.choose() == 1
        after = _tree_hash(two_hosts.data["boss"])
    assert after == before
    assert "make foundry-up FROM=local" in capsys.readouterr().err


def test_corrupt_state_file_asks_then_rewrites(two_hosts, tty, capsys):
    snap = _play(two_hosts, "mac", "x")
    with two_hosts.use("mac"):
        two_hosts.state_file("mac").write_text("{not json")
        asked = tty(True, [""])
        assert boot.choose() == 0
    assert len(asked) == 1
    assert "unreadable" in capsys.readouterr().out
    assert _state(two_hosts, "mac")["based_on"] == snap


def test_eof_at_the_prompt_boots_local_and_remembers_nothing(two_hosts, tty, capsys):
    _play(two_hosts, "mac", "x")
    asked = tty(True, [])                         # EOF
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert len(asked) == 1
    assert "no answer — booting local" in capsys.readouterr().out
    assert not two_hosts.state_file("boss").exists()


def test_ctrl_c_at_the_prompt_boots_local(two_hosts, tty):
    _play(two_hosts, "mac", "x")
    tty(True, [KeyboardInterrupt])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert not two_hosts.state_file("boss").exists()


def test_a_listed_number_restores_that_one(two_hosts, tty, capsys):
    boss_snap = _play(two_hosts, "boss", "boss build")
    _play(two_hosts, "mac", "mac session")
    asked = tty(True, ["2"])
    with two_hosts.use("boss"):
        two_hosts.state_file("boss").unlink()      # forget, so it asks
        assert boot.choose() == 0
    assert len(asked) == 1
    out = capsys.readouterr().out
    assert f"2  {boss_snap}" in out
    assert _journal(two_hosts, "boss") == "boss build"


def test_version_mismatch_line(two_hosts, tty, capsys):
    _play(two_hosts, "mac", "x")
    two_hosts.set_core("boss", "13.351")
    tty(True, ["k"])
    with two_hosts.use("boss"):
        boot.choose()
    assert ("! snapshot is from Foundry 14.369, this machine runs 13.351"
            in capsys.readouterr().out)


def test_no_mismatch_line_when_versions_agree(two_hosts, tty, capsys):
    _play(two_hosts, "mac", "x")
    tty(True, ["k"])
    with two_hosts.use("boss"):
        boot.choose()
    assert "! snapshot is from Foundry" not in capsys.readouterr().out


def test_empty_cloud_is_quiet_local(two_hosts, tty, capsys):
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert asked == [] and "cloud has no snapshots" in capsys.readouterr().out


def test_json_prints_the_decision_without_acting(two_hosts, tty, capsys):
    snap = _play(two_hosts, "mac", "x")
    capsys.readouterr()
    with two_hosts.use("boss"):
        assert boot.main(["choose", "--from", "latest", "--json"]) == 0
    d = json.loads(capsys.readouterr().out)
    assert d["action"] == "restore" and d["snapshot"]["name"] == snap
    assert d["snapshot"]["host"] == "mac"
    assert _journal(two_hosts, "boss") != "x"


def test_boot_decision_is_written_to_the_ops_log(two_hosts, tty):
    from scripts.foundry.ops import config as cfg
    _play(two_hosts, "mac", "x")
    tty(False)
    with two_hosts.use("boss"):
        boot.choose()
    [log] = list(cfg.OPS_LOG_DIR.glob("ops-*.jsonl"))
    rec = json.loads(log.read_text().splitlines()[-1])
    assert rec["cmd"] == "boot" and rec["host"] == "boss" and rec["interactive"] is False


# ── wired into the start path (§7, §9) ──────────────────────────────────────

@pytest.fixture
def svc(monkeypatch):
    from scripts.foundry.ops import service
    started = []
    monkeypatch.setattr(service, "foundry_is_up", lambda timeout=2.0: bool(started))
    monkeypatch.setattr(service.host, "start", lambda: started.append(1))
    monkeypatch.setattr(service, "_warn_stale_bridge", lambda: None)
    return service, started


def test_service_up_runs_the_boot_choice_once(two_hosts, tty, svc, monkeypatch):
    service, started = svc
    _play(two_hosts, "mac", "saturday")
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert service.up() == 0
    assert started and len(asked) == 1
    assert _journal(two_hosts, "boss") == "saturday"
    assert os.environ["PENTARYN_BOOT_DONE"] == "1"


def test_service_up_skips_the_choice_when_make_already_ran_it(two_hosts, tty, svc, monkeypatch):
    service, started = svc
    _play(two_hosts, "mac", "saturday")
    monkeypatch.setenv("PENTARYN_BOOT_DONE", "1")
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert service.up() == 0
    assert started and asked == []


def test_service_up_does_not_start_after_a_failed_restore(two_hosts, tty, svc, monkeypatch):
    service, started = svc
    _play(two_hosts, "mac", "x")
    monkeypatch.setenv("FROM", "world-typo.tar.gz")
    tty(False)
    with two_hosts.use("boss"):
        assert service.up() == 1
    assert not started
