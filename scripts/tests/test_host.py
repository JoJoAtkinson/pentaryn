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


@pytest.mark.parametrize("hostname", ["mac", "MAC.local", "Mac.tailnet.ts.net", "-mac-"])
def test_a_non_mac_hostname_sanitising_to_mac_is_not_the_primary_ec7(monkeypatch, hostname):
    """EC-7: only macOS is tagged `mac` by default; a Linux box named `mac` gets `h-mac`."""
    monkeypatch.delenv("PENTARYN_HOST")
    monkeypatch.delenv("PENTARYN_PRIMARY_HOST")
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.setattr(host.socket, "gethostname", lambda: hostname)
    assert (host.host_name(), host.role()) == ("h-mac", "alt")


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


@pytest.mark.parametrize("pkg", [
    {"version": "15.0-beta"},
    {"version": "v15"},
    {"version": "15.400", "release": {"generation": "15-beta", "build": 1}},
])
def test_a_non_numeric_core_version_reads_as_unknown_ext_3(monkeypatch, tmp_path, pkg):
    """EXT-3: `fvtt15.0-beta-mac` parses as core 15.0, host `beta-mac`. Only a version
    the snapshot-name parser reads back whole is stamped; anything else is "unknown"."""
    app = tmp_path / "app"
    app.mkdir()
    (app / "package.json").write_text(json.dumps(pkg))
    monkeypatch.setenv("FOUNDRY_APP_ROOT", str(app))
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


def _hung_hook(monkeypatch):
    """subprocess.run that hangs (TimeoutExpired) on the bash hook — but only when a timeout
    was asked for; without one the real run would block forever, which the test calls out."""
    seen = []

    def fake_run(argv, *a, **kw):
        seen.append(kw.get("timeout"))
        if argv[0] == "bash":
            assert kw.get("timeout") == host.HOOK_TIMEOUT, "hook ran with no timeout"
            raise subprocess.TimeoutExpired(argv, kw["timeout"])
        return subprocess.CompletedProcess(argv, 0, "", "")

    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.setattr(host.subprocess, "run", fake_run)
    return seen


def test_hung_stop_cmd_hook_is_not_delivered(monkeypatch):
    """py-cloud-ac-4: a hung PENTARYN_STOP_CMD times out at 30s; request_stop says False so
    stop() forces instead of waiting forever."""
    assert getattr(host, "HOOK_TIMEOUT", None) == 30
    _hung_hook(monkeypatch)
    monkeypatch.setenv("PENTARYN_STOP_CMD", "systemctl --user stop foundry")
    assert host.request_stop() is False


def test_hung_start_cmd_hook_is_a_host_error(monkeypatch):
    """py-cloud-ac-4: a hung PENTARYN_START_CMD raises HostError naming the hook and the
    timeout, not a bare TimeoutExpired (or a hang)."""
    assert getattr(host, "HOOK_TIMEOUT", None) == 30
    _hung_hook(monkeypatch)
    monkeypatch.setenv("PENTARYN_START_CMD", "systemctl --user start foundry")
    with pytest.raises(host.HostError, match=r"PENTARYN_START_CMD.*30s"):
        host.start()


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


_REAL_PID = host.pid      # conftest stubs host.pid for every test; keep the real one


def _ere_matches(pattern: str, line: str) -> bool:
    """Ask a real POSIX ERE engine (`grep -E`, the dialect `pgrep -f` speaks)."""
    return subprocess.run(["grep", "-Eq", "--", pattern], input=line, text=True).returncode == 0


@pytest.mark.parametrize("data, cmdline, hit", [
    ("/d/foundry", "node /opt/fvtt/main.js --dataPath=/d/foundry --port=30000", True),
    ("/d/foundry", "node /opt/fvtt/main.js --dataPath=/d/foundry", True),
    ("/d/foundry", "node /opt/fvtt/main.js --dataPath=/d/foundry-test --port=30001", False),
    ("/d/foundry", "node /opt/fvtt/main.js --dataPath=/d/foundry/x", False),
    ("/d/foundry", "node /opt/fvtt/mainXjs --dataPath=/d/foundry", False),
    ("/d/f.v(1)", "node main.js --dataPath=/d/fXv(1) --port=1", False),       # metachars literal
    ("/d/f.v(1)", "node main.js --dataPath=/d/f.v(1) --port=1", True),
])
def test_linux_pid_pattern_is_escaped_and_anchored_ec4(monkeypatch, data, cmdline, hit):
    """EC-4: the pgrep pattern must not match a sibling Foundry whose data path merely
    starts with ours (/d/foundry vs /d/foundry-test) — stopping the wrong server."""
    monkeypatch.setenv("FOUNDRY_DATA", data)
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    assert _ere_matches(host._linux_pattern(), cmdline) is hit


def test_linux_pid_hands_pgrep_the_anchored_pattern(monkeypatch, runs):
    monkeypatch.setenv("FOUNDRY_DATA", "/d/foundry")
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    _REAL_PID()
    assert runs == [["pgrep", "-f", host._linux_pattern()]]


def test_is_running_probes_the_configured_port(monkeypatch):
    seen = []

    def connect(addr, timeout=None):
        seen.append(addr)
        raise ConnectionRefusedError

    monkeypatch.setattr(host.socket, "create_connection", connect)
    monkeypatch.setenv("FOUNDRY_PORT", "31234")
    assert host.is_running() is False
    assert seen == [("127.0.0.1", 31234), ("::1", 31234)]


def test_clipboard_never_prints(monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(host.shutil, "which", lambda name: None)
    monkeypatch.setattr(host, "WSL_CLIP", tmp_path / "no-clip.exe")   # never the real one
    assert host.clipboard("s3cret") is False
    out = capsys.readouterr()
    assert "s3cret" not in out.out + out.err


def _fake_exe(path: Path, body: str = "cat > \"$(dirname \"$0\")/got\"") -> Path:
    path.write_text(f"#!/bin/sh\n{body}\n")
    path.chmod(0o755)
    return path


def test_clipboard_falls_back_to_wsl_clip_by_full_path(monkeypatch, tmp_path, capsys):
    """appendWindowsPath=false: clip.exe is not on PATH, but its full path still works,
    and the text reaches it on stdin, never argv."""
    clip = _fake_exe(tmp_path / "clip.exe")
    monkeypatch.setattr(host, "WSL_CLIP", clip)
    monkeypatch.setattr(host.shutil, "which", lambda name: None)
    assert host.clipboard("s3cret") is True
    assert (tmp_path / "got").read_text() == "s3cret"
    out = capsys.readouterr()
    assert "s3cret" not in out.out + out.err


def test_clipboard_failure_is_false(monkeypatch, tmp_path):
    monkeypatch.setattr(host, "WSL_CLIP", _fake_exe(tmp_path / "clip.exe", "exit 1"))
    monkeypatch.setattr(host.shutil, "which", lambda name: None)
    assert host.clipboard("x") is False


def test_node_prefers_pentaryn_node(monkeypatch, tmp_path):
    exe = _fake_exe(tmp_path / "node", "true")
    monkeypatch.setenv("PENTARYN_NODE", str(exe))
    monkeypatch.setattr(host.shutil, "which", lambda name: "/usr/bin/node")
    assert host.node() == str(exe)


def test_node_falls_back_to_newest_nvm(monkeypatch, tmp_path):
    """systemd --user has no nvm on PATH: the newest ~/.nvm install (by version, not text)."""
    for v in ("v9.0.0", "v24.21.0", "v10.1.0"):
        d = tmp_path / ".nvm/versions/node" / v / "bin"
        d.mkdir(parents=True)
        _fake_exe(d / "node", "true")
    monkeypatch.delenv("PENTARYN_NODE", raising=False)
    monkeypatch.setenv("PENTARYN_ENV_FILE", str(tmp_path / "none"))
    monkeypatch.setattr(host.Path, "home", classmethod(lambda cls: tmp_path))
    monkeypatch.setattr(host.shutil, "which", lambda name: None)
    monkeypatch.setattr(host, "HOMEBREW_NODE", tmp_path / "no-brew")
    assert host.node() == str(tmp_path / ".nvm/versions/node/v24.21.0/bin/node")


def test_open_url_without_an_opener_is_false_not_a_raise(monkeypatch, tmp_path):
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.setattr(host, "WSL_INTEROP", tmp_path / "no-interop")
    monkeypatch.setattr(host, "WSL_INTEROP_LATE", tmp_path / "no-interop-late")
    monkeypatch.setattr(host, "PROC_VERSION", tmp_path / "no-version")
    monkeypatch.setattr(host.shutil, "which", lambda name: None)
    assert host.open_url("http://localhost:1/x") is False


@pytest.mark.parametrize("present", ["WSLInterop", "WSLInterop-late", "version"])
def test_is_wsl_any_marker(monkeypatch, tmp_path, present):
    """systemd=true builds register WSLInterop-late; /proc/version is the last resort."""
    monkeypatch.setattr(host, "WSL_INTEROP", tmp_path / "WSLInterop")
    monkeypatch.setattr(host, "WSL_INTEROP_LATE", tmp_path / "WSLInterop-late")
    monkeypatch.setattr(host, "PROC_VERSION", tmp_path / "version")
    (tmp_path / "version").write_text("Linux version 6.8.0-generic (gcc)\n")
    assert host.is_wsl() is False
    if present == "version":
        (tmp_path / "version").write_text("Linux version 6.18.54.1-microsoft-standard-WSL2\n")
    else:
        (tmp_path / present).write_text("")
    assert host.is_wsl() is True


def test_open_url_uses_explorer_by_full_path_on_wsl(monkeypatch, tmp_path):
    interop = tmp_path / "WSLInterop"
    interop.write_text("")
    seen = tmp_path / "got"
    explorer = _fake_exe(tmp_path / "explorer.exe", f'echo "$1" > {seen}; exit 1')
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.setattr(host, "WSL_INTEROP", interop)
    monkeypatch.setattr(host, "WSL_EXPLORER", explorer)
    monkeypatch.setattr(host.shutil, "which", lambda name: None)
    assert host.open_url("http://localhost:1/x") is True   # explorer.exe's rc is always 1
    assert seen.read_text().strip() == "http://localhost:1/x"


def test_no_script_hardcodes_the_mac_data_dir():
    """Data/ comes from host.foundry_data(); only host.py's Mac default may name it."""
    root = Path(host.__file__).resolve().parents[1]
    hits = [str(p) for p in root.rglob("*.py")
            if "tests" not in p.parts and p.name != "host.py"
            and "Library/Application Support" in p.read_text(encoding="utf-8", errors="ignore")]
    assert hits == []
