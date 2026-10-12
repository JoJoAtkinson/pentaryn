"""host.py (design §2): identity, role, paths, process control, the env file."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest

from scripts.foundry import host
from scripts.foundry.host import HostError, NotPrimary


# ── the env file ─────────────────────────────────────────────────────────────

def test_env_beats_file_beats_default(tmp_path, monkeypatch):
    f = tmp_path / "env"
    f.write_text("# comment\nexport PENTARYN_PRIMARY_HOST=boss\nFOUNDRY_PORT='31000'\n"
                 "PENTARYN_KEEP_SNAPSHOTS=7  # trailing\n")
    monkeypatch.setenv("PENTARYN_ENV_FILE", str(f))
    monkeypatch.delenv("PENTARYN_PRIMARY_HOST")
    assert host.primary_host() == "boss"                  # file beats default
    assert host.foundry_port() == 31000                    # quotes stripped
    assert host.keep_snapshots() == 7                      # trailing comment dropped
    monkeypatch.setenv("PENTARYN_PRIMARY_HOST", "mac")
    assert host.primary_host() == "mac"                   # env beats file
    f.write_text("")
    import os
    os.utime(f, (1, 1))
    monkeypatch.delenv("PENTARYN_PRIMARY_HOST")
    assert host.primary_host() == "mac"                   # default


def test_parse_env_strips_quotes_before_a_trailing_comment():
    text = "A=\"x y\"  # c\nB='q' # d\nD=\"a # b\"\nC=plain # e\n"
    assert host.parse_env(text) == {"A": "x y", "B": "q", "D": "a # b", "C": "plain"}


def test_missing_env_file_is_fine(monkeypatch, tmp_path):
    monkeypatch.setenv("PENTARYN_ENV_FILE", str(tmp_path / "nope"))
    assert host.file_values() == {}


def test_example_file_lists_every_key():
    text = (Path(host.__file__).parent / "host.env.example").read_text()
    listed = set(re.findall(r"^#?([A-Z_]+)=", text, re.M))
    assert listed == set(host.KEYS)


# ── PENTARYN_HOST ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw, want", [
    ("Joe's Mac.local", "joe-s-mac-local"),
    ("BOSS", "boss"),
    ("--a__b--", "a-b"),
    ("x" * 40, "x" * 32),
])
def test_sanitize(raw, want):
    assert host.sanitize(raw) == want


def test_default_host_off_the_mac_is_the_sanitised_short_hostname(monkeypatch):
    monkeypatch.delenv("PENTARYN_HOST")
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.setattr(host.socket, "gethostname", lambda: "BOSS.tailnet.ts.net")
    assert host.host_name() == "boss"
    monkeypatch.setattr(host.socket, "gethostname", lambda: "Joe's PC.local")
    assert host.host_name() == "joe-s-pc"
    assert host.host_is_default()


def test_the_mac_with_no_configuration_is_still_the_primary(monkeypatch):
    """Existing Mac behaviour is unchanged by default: tunnel and updater still run."""
    monkeypatch.delenv("PENTARYN_HOST")
    monkeypatch.delenv("PENTARYN_PRIMARY_HOST")
    monkeypatch.setattr(host.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(host.socket, "gethostname", lambda: "Joes-MacBook-Pro.local")
    assert (host.host_name(), host.role()) == ("mac", "primary")
    host.require_primary("the tunnel")


@pytest.mark.parametrize("bad", ["untagged", "latest", "local", "14", "14.369", "",
                                 "x" * 40, "Mac", "fvtt14", "a_b"])
def test_host_rejections(bad):
    with pytest.raises(HostError):
        host.validate_host(bad)


def test_explicit_bad_host_is_refused(monkeypatch):
    monkeypatch.setenv("PENTARYN_HOST", "untagged")
    with pytest.raises(HostError, match="reserved"):
        host.host_name()


def test_explicit_mac_off_macos_is_refused(monkeypatch):
    """The example env file copied onto BOSS unedited must not make BOSS a second `mac`."""
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.setenv("PENTARYN_HOST", "mac")
    with pytest.raises(HostError, match="the Mac's tag"):
        host.host_name()
    assert host.main(["role"]) == 2
    monkeypatch.setenv("PENTARYN_HOST", "boss")
    assert host.host_name() == "boss"
    monkeypatch.setattr(host.platform, "system", lambda: "Darwin")
    monkeypatch.setenv("PENTARYN_HOST", "mac")
    assert host.host_name() == "mac"


def test_example_file_sets_no_identity(tmp_path, monkeypatch):
    """Copied verbatim to ~/.config/pentaryn/env, the example changes nothing: every
    line is a comment, so each machine keeps its platform default."""
    text = (Path(host.__file__).parent / "host.env.example").read_text()
    assert host.parse_env(text) == {}
    f = tmp_path / "env"
    f.write_text(text)
    monkeypatch.setenv("PENTARYN_ENV_FILE", str(f))
    monkeypatch.delenv("PENTARYN_HOST")
    monkeypatch.delenv("PENTARYN_PRIMARY_HOST")
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.setattr(host.socket, "gethostname", lambda: "BOSS")
    assert (host.host_name(), host.role()) == ("boss", "alt")


@pytest.mark.parametrize("ok", ["mac", "boss", "a-b-1", "x" * 32])
def test_host_accepts(ok):
    assert host.validate_host(ok) == ok


# ── role ─────────────────────────────────────────────────────────────────────

def test_role_derivation(monkeypatch):
    monkeypatch.setattr(host, "system", lambda: "Darwin")
    monkeypatch.setenv("PENTARYN_HOST", "mac")
    monkeypatch.delenv("PENTARYN_PRIMARY_HOST")
    assert host.role() == "primary" and host.ROLE == "primary"
    monkeypatch.setenv("PENTARYN_HOST", "boss")
    assert host.role() == "alt"
    monkeypatch.setenv("PENTARYN_PRIMARY_HOST", "boss")
    assert host.role() == "primary"


def test_require_primary_refuses_on_the_alt_with_the_fix(monkeypatch):
    monkeypatch.setenv("PENTARYN_HOST", "boss")
    monkeypatch.setenv("PENTARYN_PRIMARY_HOST", "mac")
    with pytest.raises(NotPrimary) as exc:
        host.require_primary("the tunnel", "tunnel-up")
    assert str(exc.value) == (
        "the tunnel runs only on the primary host (mac); this is boss (alt). "
        "Deliberately switching? PENTARYN_ROLE_OVERRIDE=primary make tunnel-up")


def test_role_override_passes_loudly(monkeypatch):
    monkeypatch.setenv("PENTARYN_HOST", "boss")
    monkeypatch.setenv("PENTARYN_PRIMARY_HOST", "mac")
    monkeypatch.setenv("PENTARYN_ROLE_OVERRIDE", "primary")
    said = []
    host.require_primary("the updater", log=said.append)
    assert said and "PENTARYN_ROLE_OVERRIDE=primary" in said[0] and "boss" in said[0]


def test_role_override_is_not_read_from_the_file(monkeypatch, tmp_path):
    f = tmp_path / "env"
    f.write_text("PENTARYN_ROLE_OVERRIDE=primary\n")
    monkeypatch.setenv("PENTARYN_ENV_FILE", str(f))
    monkeypatch.setenv("PENTARYN_HOST", "boss")
    monkeypatch.setenv("PENTARYN_PRIMARY_HOST", "mac")
    with pytest.raises(NotPrimary):
        host.require_primary("the updater")


def test_require_primary_cli_exit_code(monkeypatch, capsys):
    monkeypatch.setattr(host, "system", lambda: "Darwin")
    monkeypatch.setenv("PENTARYN_HOST", "boss")
    monkeypatch.setenv("PENTARYN_PRIMARY_HOST", "mac")
    assert host.main(["require-primary", "the", "updater"]) == 3
    assert "the updater runs only on the primary host" in capsys.readouterr().err
    monkeypatch.setenv("PENTARYN_HOST", "mac")
    assert host.main(["require-primary", "updater"]) == 0
    assert host.main(["role"]) == 0
    assert capsys.readouterr().out.strip() == "primary"


# ── paths ────────────────────────────────────────────────────────────────────

def test_mac_defaults(monkeypatch):
    monkeypatch.delenv("FOUNDRY_DATA")
    monkeypatch.setattr(host.platform, "system", lambda: "Darwin")
    assert host.foundry_data() == Path.home() / "Library/Application Support/FoundryVTT"
    assert host.foundry_app_root() == Path(
        "/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app")


def test_linux_defaults(monkeypatch, tmp_path):
    monkeypatch.delenv("FOUNDRY_DATA")
    monkeypatch.delenv("FOUNDRY_APP_ROOT", raising=False)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    assert host.foundry_data() == tmp_path / ".local/share/FoundryVTT"
    assert host.foundry_app_root() == tmp_path / "foundryvtt"      # nothing unpacked yet


@pytest.mark.parametrize("layout", ["foundryvtt", "foundryvtt/resources/app"])
def test_linux_app_root_is_probed_so_the_version_is_known(monkeypatch, tmp_path, layout):
    """The Node.js build (v12 on) has package.json at the top; the Electron build under
    resources/app. Either way the version reads, so snapshot names, major-release
    preservation and the version-mismatch line keep working."""
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("FOUNDRY_APP_ROOT", raising=False)
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    app = tmp_path / layout
    app.mkdir(parents=True)
    (app / "main.js").write_text("")
    (app / "package.json").write_text(json.dumps(
        {"version": "14.369.0", "release": {"generation": 14, "build": 369}}))
    assert host.foundry_app_root() == app
    assert host.core_version() == "14.369"


def test_foundry_data_pointing_at_data_is_refused(monkeypatch, fake_data):
    monkeypatch.setenv("FOUNDRY_DATA", str(fake_data / "Data"))
    with pytest.raises(HostError, match="must be the root"):
        host.foundry_data()


def test_core_version_from_package_json(monkeypatch, tmp_path):
    app = tmp_path / "app"
    app.mkdir()
    (app / "package.json").write_text(json.dumps(
        {"version": "14.369.0", "release": {"generation": 14, "build": 369}}))
    monkeypatch.setenv("FOUNDRY_APP_ROOT", str(app))
    assert host.core_version() == "14.369"
    (app / "package.json").write_text(json.dumps({"version": "15.400"}))
    assert host.core_version() == "15.400"
    (app / "package.json").unlink()
    assert host.core_version() == "unknown"


# ── process control ──────────────────────────────────────────────────────────

@pytest.fixture
def runs(monkeypatch):
    calls = []

    def fake_run(argv, *a, **kw):
        calls.append(list(argv))
        return subprocess.CompletedProcess(argv, 0, "", "")

    monkeypatch.setattr(host.subprocess, "run", fake_run)
    return calls


def test_start_cmd_hook_runs_via_bash(monkeypatch, runs):
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.setenv("PENTARYN_START_CMD", "systemctl --user start foundry && echo ok")
    host.start()
    assert runs == [["bash", "-c", "systemctl --user start foundry && echo ok"]]


def test_stop_cmd_hook_runs_via_bash(monkeypatch, runs):
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.setenv("PENTARYN_STOP_CMD", "systemctl --user stop foundry")
    assert host.request_stop() is True
    assert runs == [["bash", "-c", "systemctl --user stop foundry"]]


def test_mac_start_is_open_a(monkeypatch, runs):
    monkeypatch.setattr(host.platform, "system", lambda: "Darwin")
    monkeypatch.delenv("FOUNDRY_APP_ROOT", raising=False)
    host.start()
    assert runs == [["open", "-a", "/Applications/Foundry Virtual Tabletop.app"]]


def test_mac_request_stop_is_osascript_quit(monkeypatch, runs):
    monkeypatch.setattr(host.platform, "system", lambda: "Darwin")
    host.request_stop()
    assert runs == [["osascript", "-e", 'quit app "Foundry Virtual Tabletop"']]


def test_mac_stop_forces_when_osascript_quit_times_out(monkeypatch):
    """EC-3: a hung `osascript` quit must not escape as TimeoutExpired — request_stop says
    False and stop() falls through to force_stop (pkill)."""
    monkeypatch.setattr(host.platform, "system", lambda: "Darwin")
    monkeypatch.delenv("PENTARYN_STOP_CMD", raising=False)
    calls = []

    def fake_run(argv, *a, **kw):
        calls.append(list(argv))
        if argv[0] == "osascript":
            raise subprocess.TimeoutExpired(argv, kw.get("timeout", 30))
        return subprocess.CompletedProcess(argv, 0, "", "")

    monkeypatch.setattr(host.subprocess, "run", fake_run)
    assert host.request_stop() is False
    calls.clear()
    host.stop(timeout=0)
    assert calls[0][0] == "osascript"
    assert calls[1] == ["pkill", "-f", "MacOS/Foundry Virtual Tabletop"]


def test_is_running_probes_the_configured_port(monkeypatch):
    seen = []

    def connect(addr, timeout=None):
        seen.append(addr)
        raise ConnectionRefusedError

    monkeypatch.setattr(host.socket, "create_connection", connect)
    monkeypatch.setenv("FOUNDRY_PORT", "31234")
    assert host.is_running() is False
    assert seen == [("127.0.0.1", 31234), ("::1", 31234)]


def test_clipboard_never_prints(monkeypatch, capsys):
    monkeypatch.setattr(host.shutil, "which", lambda name: None)
    assert host.clipboard("s3cret") is False
    out = capsys.readouterr()
    assert "s3cret" not in out.out + out.err
