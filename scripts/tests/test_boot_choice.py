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
    """Every file under the data root, except the upload queue's (empty) lock files."""
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        if p.is_file() and not (p.parent.name == ".pentaryn-tmp" and p.suffix == ".lock"):
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
    (two_hosts.data["boss"] / "Data/worlds/w/addon-scratch.txt").write_text("x")  # earlier
    _play(two_hosts, "mac", "saturday session")
    tty(True, [""])
    with two_hosts.use("boss"):
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
    assert "Enter = latest" in asked[0]           # boss's descends from the mac's: default
    assert _journal(two_hosts, "mac") == "saturday"                   # kept local
    assert _state(two_hosts, "mac")["keep_local_until_newer_than"] == boss_snap


# ── diverged snapshots and the pending notice ───────────────────────────────

def _alt_on_macs_latest(two_hosts, tty):
    """boss boots at a terminal and takes the Mac's newest; returns that snapshot."""
    m0 = _play(two_hosts, "mac", "session one")
    tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert _state(two_hosts, "boss")["based_on"] == m0
    return m0


def test_notice_survives_the_alts_own_backup_until_answered_at_a_terminal(two_hosts, tty,
                                                                          capsys):
    """An agent boots the alt (no terminal); the vtt-up backup after it uploads a newer
    boss snapshot. The Mac's snapshot must still be raised — not buried by that upload."""
    _alt_on_macs_latest(two_hosts, tty)
    m1 = _play(two_hosts, "mac", "session two")
    tty(False)
    with two_hosts.use("boss"):
        assert boot.choose() == 0                       # notice, boots local
    assert _state(two_hosts, "boss")["pending_newer"] == m1
    b1 = _play(two_hosts, "boss", "agent's addon work")  # its backup: now the newest
    assert _state(two_hosts, "boss")["pending_newer"] == m1
    capsys.readouterr()
    tty(False)
    with two_hosts.use("boss"):
        assert boot.choose() == 0                       # still told
    out = capsys.readouterr().out
    assert f"cloud snapshot {m1}" in out and f"does not contain {b1}" in out
    assert f"make foundry-up FROM={m1}" in out          # not FROM=latest: that is boss's own
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0                       # at a terminal: asked, Enter = local
    assert len(asked) == 1 and "Enter = local" in asked[0]
    assert "diverged — does not contain" in capsys.readouterr().out
    assert _journal(two_hosts, "boss") == "agent's addon work"
    st = _state(two_hosts, "boss")
    assert st["pending_newer"] is None and st["keep_local_until_newer_than"] == m1
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0                       # answered: quiet now
    assert asked == []


def test_pending_snapshot_taken_with_l_at_the_next_terminal(two_hosts, tty):
    _alt_on_macs_latest(two_hosts, tty)
    m1 = _play(two_hosts, "mac", "session two")
    tty(False)
    with two_hosts.use("boss"):
        boot.choose()
    _play(two_hosts, "boss", "agent's addon work")
    tty(True, ["l"])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert _journal(two_hosts, "boss") == "session two"
    st = _state(two_hosts, "boss")
    assert st["based_on"] == m1 and st["pending_newer"] is None


def test_cannot_tell_notice_stays_local_default_after_the_hosts_own_backup(two_hosts, tty,
                                                                           capsys):
    """A first no-terminal boot on a world with no record, edited after the cloud's newest:
    "cannot tell". The backup after it must not turn that older snapshot into the Enter
    default at the next terminal boot (found on the Mac's first rclone boot, 2026-10-11)."""
    m0 = _play(two_hosts, "mac", "morning snapshot")
    f = two_hosts.data["boss"] / "Data/worlds/w/journal.txt"
    f.write_text("afternoon play test")
    t = time.time() + 10_000
    os.utime(f, (t, t))
    tty(False)
    with two_hosts.use("boss"):
        assert boot.choose() == 0                           # "cannot tell": boots local
    assert _state(two_hosts, "boss")["pending_newer"] == m0
    _play(two_hosts, "boss", "afternoon play test, backed up")
    capsys.readouterr()
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert len(asked) == 1 and "Enter = local" in asked[0]
    assert "cannot tell how this cloud snapshot relates" in capsys.readouterr().out
    assert _journal(two_hosts, "boss") == "afternoon play test, backed up"


@pytest.mark.parametrize("how", ["notice-then-backup", "k-then-edits"])
def test_primary_is_not_offered_a_diverged_alt_snapshot_as_the_default(two_hosts, tty, capsys,
                                                                       how):
    """boss's newest lacks the Mac's newer session: Enter must keep the Mac's world."""
    _alt_on_macs_latest(two_hosts, tty)
    m1 = _play(two_hosts, "mac", "mac's newer session")
    tty(how == "k-then-edits", ["k"])
    with two_hosts.use("boss"):
        boot.choose()
    b1 = _play(two_hosts, "boss", "boss edits on the older world")
    capsys.readouterr()
    asked = tty(True, [""])
    with two_hosts.use("mac"):
        assert boot.choose() == 0
    out = capsys.readouterr().out
    assert len(asked) == 1 and "Enter = local" in asked[0]
    assert f"diverged — does not contain {m1}" in out and b1 in out
    assert _journal(two_hosts, "mac") == "mac's newer session"
    tty(True, ["l"])
    with two_hosts.use("mac"):
        _state_before = _state(two_hosts, "mac")
        assert _state_before["keep_local_until_newer_than"] == b1
        assert boot.main(["choose", "--from", "latest"]) == 0   # explicit: still possible
    assert _journal(two_hosts, "mac") == "boss edits on the older world"


def test_diverged_without_a_terminal_says_so(two_hosts, tty, capsys):
    _alt_on_macs_latest(two_hosts, tty)
    m1 = _play(two_hosts, "mac", "mac's newer session")
    tty(True, ["k"])
    with two_hosts.use("boss"):
        boot.choose()
    _play(two_hosts, "boss", "boss edits")
    capsys.readouterr()
    tty(False)
    with two_hosts.use("mac"):
        assert boot.choose() == 0
    assert f"is newer but diverged — does not contain {m1}" in capsys.readouterr().out


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


def test_keep_local_holds_when_the_declined_snapshot_is_later_deleted(two_hosts, tty):
    """Declined by mtime, not only by name: if the declined snapshot is coalesced or
    pruned away and an older one becomes the newest, that older one is not news."""
    _play(two_hosts, "boss", "boss world")
    now = time.time()
    names = []
    for ahead in (60, 120):                       # two mac snapshots after boss's
        stamp = time.strftime("%Y-%m-%d-%H%M%S", time.gmtime(now + ahead))
        p = two_hosts.cloud / "world-backups" / f"world-{stamp}-fvtt14.369-mac.tar.gz"
        p.write_bytes(b"x" * 64)
        os.utime(p, (now + ahead,) * 2)
        names.append(p.name)
    older, declined = names
    asked = tty(True, ["k"])
    with two_hosts.use("boss"):
        boot.choose()
    assert len(asked) == 1
    st = _state(two_hosts, "boss")
    assert st["keep_local_until_newer_than"] == declined and st["keep_local_mtime"]
    (two_hosts.cloud / "world-backups" / declined).unlink()   # coalesced away on the mac
    asked = tty(True, ["k"])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert asked == []                                         # `older` is not asked about
    assert _journal(two_hosts, "boss") == "boss world"


NOTICE = re.compile(
    r"▸ boot: cloud snapshot (world-\S+-mac\.tar\.gz) \(mac, \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\) "
    r"is newer than this world \(based on an unknown snapshot\); booting LOCAL\. To use it: "
    r"make foundry-up FROM=latest   \(or: make foundry-restore SNAP=(world-\S+-mac\.tar\.gz)\)")


def test_non_interactive_boots_local_with_the_notice_and_remembers_it_as_pending(
        two_hosts, tty, capsys):
    snap = _play(two_hosts, "mac", "x")
    asked = tty(False, [""])
    with two_hosts.use("boss"):
        before = _tree_hash(two_hosts.data["boss"] / "Data")
        assert boot.choose() == 0
    assert asked == []
    m = NOTICE.search(capsys.readouterr().out)
    assert m and m.group(1) == snap == m.group(2)
    assert _tree_hash(two_hosts.data["boss"] / "Data") == before   # no restore
    st = _state(two_hosts, "boss")
    assert st["pending_newer"] == snap and st["based_on"] is None
    assert st["keep_local_until_newer_than"] is None                # not answered for Joe


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
        asked = tty(True, ["l"])
        assert boot.choose() == 0
    assert len(asked) == 1
    assert "unreadable" in capsys.readouterr().out
    assert _state(two_hosts, "mac")["based_on"] == snap


def _touch_later(two_hosts, name, rel="Data/modules/m/module.json", ahead=3600):
    """A local edit after the newest snapshot — e.g. `make foundry-module-install`."""
    f = two_hosts.data[name] / rel
    f.write_text(f.read_text() + " ")
    t = time.time() + ahead
    os.utime(f, (t, t))


def test_no_record_and_local_files_newer_cannot_tell_and_enter_keeps_local(two_hosts, tty,
                                                                           capsys):
    """The Mac's first boot after the merge: no state file, the legacy marker no longer
    matches (a module install since the last vtt-down). The newest snapshot is older than
    its files, so it is not offered as newer and Enter must not roll the Mac back."""
    legacy = f"world-{time.strftime('%Y-%m-%d-%H%M%S', time.gmtime(time.time() - 86400))}" \
             "-fvtt14.369.tar.gz"
    p = two_hosts.cloud / "world-backups" / legacy
    p.write_bytes(b"x" * 64)
    os.utime(p, (time.time() - 86400,) * 2)
    _touch_later(two_hosts, "mac")
    asked = tty(True, [""])
    with two_hosts.use("mac"):
        before = _tree_hash(two_hosts.data["mac"] / "Data")
        assert boot.choose() == 0
        assert _tree_hash(two_hosts.data["mac"] / "Data") == before
    out = capsys.readouterr().out
    assert len(asked) == 1 and "Enter = local" in asked[0]
    assert "cannot tell which is newer" in out
    assert _state(two_hosts, "mac")["keep_local_until_newer_than"] == legacy


def test_no_record_and_cloud_newer_than_local_files_still_defaults_to_latest(two_hosts, tty):
    _play(two_hosts, "mac", "saturday")
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert "Enter = latest" in asked[0] and _journal(two_hosts, "boss") == "saturday"


def test_no_record_cannot_tell_notice_without_a_terminal(two_hosts, tty, capsys):
    _play(two_hosts, "mac", "x")
    _touch_later(two_hosts, "boss", ahead=7 * 86400)
    tty(False)
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert "may be newer than this world (cannot tell" in capsys.readouterr().out


@pytest.mark.parametrize("mac_sessions", [1, 2])
def test_mac_snapshots_taken_with_no_record_are_newer_not_diverged_on_the_alt(
        two_hosts, tty, capsys, mac_sessions):
    """Round-2 probe, the first week after the merge: a legacy untagged snapshot L; boss
    takes L; the Mac has no record (a module install since the last vtt-down, so the
    legacy marker does not match) and keeps local. Its sessions' snapshots must reach boss
    as "newer", Enter = latest — not "diverged" for lacking an L they cannot name."""
    _play(two_hosts, "mac", "legacy world")       # stands in for the old code's upload
    wb = two_hosts.cloud / "world-backups"
    [tagged] = [p for p in wb.iterdir() if p.name.endswith(".tar.gz")]
    legacy = wb / (f"world-{time.strftime('%Y-%m-%d-%H%M%S', time.gmtime(time.time() - 86400))}"
                   "-fvtt14.369.tar.gz")
    tagged.rename(legacy)
    (wb / f"{tagged.name}.parent").unlink()       # legacy: no sidecar
    os.utime(legacy, (time.time() - 86400,) * 2)
    two_hosts.state_file("mac").unlink()          # and no record

    tty(True, ["l"])
    with two_hosts.use("boss"):
        assert boot.choose() == 0                 # boss takes L
    assert _state(two_hosts, "boss")["based_on"] == legacy.name

    _touch_later(two_hosts, "mac")                # the module install
    tty(True, [""])
    with two_hosts.use("mac"):
        assert boot.choose() == 0                 # cannot tell: Enter keeps local
    for i in range(mac_sessions):
        last = _play(two_hosts, "mac", f"mac session {i + 1}")

    capsys.readouterr()
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    out = capsys.readouterr().out
    assert len(asked) == 1 and "Enter = latest" in asked[0]
    assert "diverged" not in out and last in out
    assert _journal(two_hosts, "boss") == f"mac session {mac_sessions}"


def test_alt_backing_up_first_leaves_the_legacy_marker_for_the_primary(two_hosts, tty, capsys):
    legacy = f"world-{time.strftime('%Y-%m-%d-%H%M%S', time.gmtime(time.time() - 86400))}" \
             "-fvtt14.369.tar.gz"
    p = two_hosts.cloud / "world-backups" / legacy
    p.write_bytes(b"x" * 64)
    os.utime(p, (time.time() - 86400,) * 2)
    marker = two_hosts.cloud / "world-backups/.last-digest"
    with two_hosts.use("mac"):
        marker.write_text(cloud.snapshot_digest() + "\n")
    _play(two_hosts, "boss", "boss first")         # the alt's first backup
    assert marker.exists()                         # the alt never retires it
    with two_hosts.use("mac"):
        tty(True, ["k"])
        boot.choose()                              # adopts the marker, then sees boss's
        assert _state(two_hosts, "mac")["based_on"] == legacy
        assert cloud.backup("prelaunch") == 0      # unchanged → skipped …
    assert marker.exists()
    _play(two_hosts, "mac", "mac session")         # … the primary's real backup retires it
    assert not marker.exists()


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


# ── lineage cut at LINEAGE_CAP (final review, HIGH) ─────────────────────────

@pytest.fixture
def small_cap(monkeypatch):
    """LINEAGE_CAP = 3, and snapshot-name stamps a minute apart: many backups inside one
    wall-clock second would otherwise reuse a coalesced snapshot's name (a real run takes
    far longer than a second per backup)."""
    from datetime import datetime as _dt, timedelta as _td
    monkeypatch.setattr(cloud, "LINEAGE_CAP", 3)
    base = _dt.now(cloud.timezone.utc)
    step = [0]

    class Clock(_dt):
        @classmethod
        def now(cls, tz=None):
            step[0] += 1
            return base + _td(minutes=step[0])
    monkeypatch.setattr(cloud, "datetime", Clock)


def _mac_saturday_vs_boss_addon_tests(two_hosts, tty):
    """The reviewer's reproduction, with LINEAGE_CAP small: the Mac backs up five
    sessions, boss takes the Mac's latest, the Mac plays Saturday, boss (no terminal)
    then backs up two addon tests. Returns (saturday, addon test 2)."""
    for i in range(5):
        _play(two_hosts, "mac", f"mac session {i + 1}")
    tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert _journal(two_hosts, "boss") == "mac session 5"
    saturday = _play(two_hosts, "mac", "saturday session")
    tty(False)
    with two_hosts.use("boss"):
        assert boot.choose() == 0                       # notice only
    _play(two_hosts, "boss", "addon test 1")
    b2 = _play(two_hosts, "boss", "addon test 2")
    return saturday, b2


def test_a_lineage_cut_at_the_cap_still_sees_divergence_on_the_primary(
        two_hosts, tty, capsys, small_cap):
    saturday, b2 = _mac_saturday_vs_boss_addon_tests(two_hosts, tty)
    capsys.readouterr()
    asked = tty(True, [""])
    with two_hosts.use("mac"):
        assert boot.choose() == 0
    out = capsys.readouterr().out
    assert len(asked) == 1 and "Enter = local" in asked[0]
    assert f"diverged — does not contain {saturday}" in out and b2 in out
    assert _journal(two_hosts, "mac") == "saturday session"


def test_a_lineage_cut_at_the_cap_still_sees_divergence_on_the_alt(
        two_hosts, tty, capsys, small_cap):
    """Mirror image: boss works on the Mac's snapshot, then the Mac plays on (more
    generations than the cap, so the fork point M0 is cut from the Mac's newest list).
    The Mac's newest lacks boss's work: diverged on boss. (Four Mac generations with a
    cap of 3: the edge is M0's mtime, older than boss's work. A fifth would cut M1,
    newer than boss's work, and "cannot tell" would then be the honest answer.)"""
    _alt_on_macs_latest(two_hosts, tty)
    b1 = _play(two_hosts, "boss", "boss's own work")
    for i in range(4):
        last = _play(two_hosts, "mac", f"mac session {i + 2}")
    capsys.readouterr()
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    out = capsys.readouterr().out
    assert len(asked) == 1 and "Enter = local" in asked[0]
    assert f"diverged — does not contain {b1}" in out and last in out
    assert _journal(two_hosts, "boss") == "boss's own work"


def test_a_lineage_cut_at_the_cap_keeps_same_line_snapshots_newer(two_hosts, tty, small_cap):
    """The fix must not turn a long straight line into "diverged": boss takes the Mac's
    latest, the Mac plays on past the cap, boss is offered the newest with Enter = latest."""
    _alt_on_macs_latest(two_hosts, tty)
    for i in range(6):
        last = _play(two_hosts, "mac", f"mac session {i + 2}")
    asked = tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert len(asked) == 1 and "Enter = latest" in asked[0]
    assert _journal(two_hosts, "boss") == "mac session 7"
    assert _state(two_hosts, "boss")["based_on"] == last


def test_restoring_a_diverged_snapshot_never_lets_coalescing_drop_the_only_copy(
        two_hosts, tty, small_cap):
    """The Mac explicitly takes boss's diverged newest. Its world was unchanged since
    Saturday's snapshot, so the restore makes no safety copy — and then the Mac's next
    backup must not coalesce Saturday away: nothing else holds that session."""
    saturday, b2 = _mac_saturday_vs_boss_addon_tests(two_hosts, tty)
    with two_hosts.use("mac"):
        assert boot.main(["choose", "--from", "latest"]) == 0
    assert _journal(two_hosts, "mac") == "addon test 2"
    _play(two_hosts, "mac", "sunday on boss's world")       # inside the coalesce window
    names = {p.name for p in (two_hosts.cloud / "world-backups").iterdir()}
    assert saturday in names


def test_a_sidecar_never_holds_non_strict_json(two_hosts, tty, small_cap):
    """An older sidecar without origin_before reads as unbounded; restoring it and
    backing up again must not write `Infinity` anywhere."""
    _play(two_hosts, "mac", "mac world")
    m0 = _play(two_hosts, "mac", "mac world, later")          # a sidecar with ancestors
    side = two_hosts.cloud / "world-backups" / f"{m0}.parent"
    data = json.loads(side.read_text())
    assert data["ancestors"]
    data.pop("origin_before")
    side.write_text(json.dumps(data) + "\n")
    tty(True, [""])
    with two_hosts.use("boss"):
        assert boot.choose() == 0
    assert _state(two_hosts, "boss")["based_on"] == m0
    _play(two_hosts, "boss", "boss work")
    def strict(s):
        return json.loads(s, parse_constant=lambda c: pytest.fail(f"non-strict JSON: {c}"))
    strict(two_hosts.state_file("boss").read_text())
    for p in (two_hosts.cloud / "world-backups").glob("*.parent"):
        strict(p.read_text())
