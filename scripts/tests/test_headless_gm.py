"""The headless Assistant-GM bot's credential helper (scripts/foundry/ops/headless_gm.py).

Nothing here reaches Foundry or Infisical: FoundryAdmin, the admin password and the
``infisical`` CLI are faked. The guarantees pinned down are the ones that leak or lock out:
the cookie file is 0600 and its contents never reach stdout/stderr, a lookalike player is
never mistaken for the bot, and every failure maps to the exit code the watchdog branches on.
"""

from __future__ import annotations

import json
import stat
import subprocess

import pytest

from scripts.foundry.ops import cli, headless_gm as hg, login
from scripts.foundry.admin_password import AdminPasswordUnavailable

SECRET_COOKIE = "s3cr3t-session-id-value"
GM = {"_id": "gmAAAAAAAAAAAAAA", "name": "Gamemaster", "role": 4}
GM2 = {"_id": "gmZZZZZZZZZZZZZZ", "name": "Other GM", "role": 4}
BOT = {"_id": "botBBBBBBBBBBBBB", "name": "Claude", "role": 3}
PLAYER_CLAUDE = {"_id": "plCCCCCCCCCCCCCC", "name": "Claude", "role": 1}


class FakeAdmin:
    users: list[dict] = []
    logged_in_as: list[str] = []
    joined: list[tuple] = []        # (user_id, password, admin_password of that instance)
    reject_join = False

    def __init__(self, *a, admin_password=None, **kw):
        self.admin_password = admin_password

    def join(self, user_id, password):
        if FakeAdmin.reject_join:
            raise hg.JoinRejected(f"join {user_id} refused: HTTP 401")
        FakeAdmin.joined.append((user_id, password, self.admin_password))

    def join_data(self):
        return {"users": list(self.users)}

    def login_as(self, user_id):
        FakeAdmin.logged_in_as.append(user_id)

    def session_cookies(self):
        return [{"name": "session", "value": SECRET_COOKIE, "domain": "127.0.0.1", "path": "/",
                 "httpOnly": True, "secure": False}]


@pytest.fixture
def fake(monkeypatch, tmp_path):
    FakeAdmin.users = [GM, BOT]
    FakeAdmin.logged_in_as = []
    FakeAdmin.joined = []
    FakeAdmin.reject_join = False
    monkeypatch.setattr(hg, "FoundryAdmin", FakeAdmin)
    monkeypatch.setattr(hg, "bot_password", lambda create=True: "bot-pw-value")
    monkeypatch.setattr(hg, "foundry_admin_password", lambda: "admin-pw")
    monkeypatch.setattr(hg, "active_world", lambda base_url=hg.BASE_URL: "w")
    monkeypatch.setattr(hg, "adopt_cached_infisical_token", lambda path=None: False)
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    monkeypatch.delenv("PENTARYN_BOT_USER", raising=False)
    return tmp_path


def _out(capsys) -> tuple[dict, str]:
    cap = capsys.readouterr()
    return json.loads(cap.out.strip().splitlines()[-1]), cap.out + cap.err


# ── who is the bot ───────────────────────────────────────────────────────────

def test_find_bot_needs_name_and_role():
    assert hg.find_bot([GM, PLAYER_CLAUDE]) is None
    assert hg.find_bot([PLAYER_CLAUDE, BOT]) is BOT
    assert hg.find_bot([{**BOT, "role": 4}]) is not None


def test_bot_name_override(monkeypatch):
    monkeypatch.setenv("PENTARYN_BOT_USER", "Helper")
    assert hg.find_bot([BOT]) is None
    assert hg.find_bot([{**BOT, "name": "Helper"}])["name"] == "Helper"


def test_find_gm_is_stable_and_ignores_assistants():
    assert hg.find_gm([GM2, BOT, GM]) is GM
    assert hg.find_gm([BOT, PLAYER_CLAUDE]) is None


def test_role_labels_match_foundry():
    """CONST.USER_ROLES: 1 PLAYER, 2 TRUSTED, 3 ASSISTANT, 4 GAMEMASTER."""
    want = {4: "Gamemaster", 3: "Assistant", 2: "Trusted", 1: "Player"}
    for role, label in want.items():
        assert login.ROLE_LABEL[role] == label
        assert hg.ROLE_LABEL[role] == label


# ── cookie: the file and the exit codes ──────────────────────────────────────

def test_cookie_file_is_private_and_never_printed(fake, capsys):
    out = fake / "c.json"
    assert hg.cookie("bot", out) == 0
    summary, printed = _out(capsys)
    assert summary == {"ok": True, "world": "w", "user_id": BOT["_id"], "user": "Claude",
                       "role": 3, "out": str(out)}
    assert SECRET_COOKIE not in printed
    assert stat.S_IMODE(out.stat().st_mode) == 0o600
    assert json.loads(out.read_text())["cookies"][0]["value"] == SECRET_COOKIE
    assert "bot-pw-value" not in printed and "botPassword" not in json.loads(out.read_text())


def test_bot_session_is_a_password_join_never_admin(fake, monkeypatch, capsys):
    """The browser's session must not carry session.admin: no loginAs, no admin password."""
    def no_admin_pw():
        raise AssertionError("the bot path must not read the admin password")
    monkeypatch.setattr(hg, "foundry_admin_password", no_admin_pw)
    assert hg.cookie("bot", fake / "c.json") == 0
    assert FakeAdmin.logged_in_as == []
    assert FakeAdmin.joined == [(BOT["_id"], "bot-pw-value", None)]


def test_bot_password_refused_is_exit_7(fake, capsys):
    FakeAdmin.reject_join = True
    assert hg.cookie("bot", fake / "c.json") == hg.EXIT_BOT_AUTH
    summary, printed = _out(capsys)
    assert "bot-pw-value" not in printed and not (fake / "c.json").exists()


def test_bot_password_missing_on_login_is_exit_6(fake, monkeypatch, capsys):
    def boom(create=True):
        assert create is False          # a login never invents a password
        raise hg.BotPasswordUnavailable("not set")
    monkeypatch.setattr(hg, "bot_password", boom)
    assert hg.cookie("bot", fake / "c.json") == hg.EXIT_BOT_PW
    assert FakeAdmin.joined == [] and not (fake / "c.json").exists()


def test_cookie_default_path_is_under_runtime_dir(fake, capsys):
    assert hg.cookie("bot", None) == 0
    assert (fake / "pentaryn-headless-gm/cookie.json").exists()


def test_cookie_never_logs_in_as_a_lookalike_player(fake, capsys):
    FakeAdmin.users = [GM, PLAYER_CLAUDE]
    assert hg.cookie("bot", fake / "c.json") == hg.EXIT_BOT_MISSING
    assert FakeAdmin.logged_in_as == [] and FakeAdmin.joined == []
    assert not (fake / "c.json").exists()


def test_cookie_as_gm(fake, capsys):
    assert hg.cookie("gm", fake / "c.json") == 0
    assert FakeAdmin.logged_in_as == [GM["_id"]]


def test_no_gm_is_exit_4(fake, capsys):
    FakeAdmin.users = [BOT]
    assert hg.cookie("gm", fake / "c.json") == hg.EXIT_NO_GM


def test_no_world_is_exit_2(fake, monkeypatch, capsys):
    monkeypatch.setattr(hg, "active_world", lambda base_url=hg.BASE_URL: None)
    assert hg.cookie("bot", fake / "c.json") == hg.EXIT_NO_WORLD
    assert hg.ensure() == hg.EXIT_NO_WORLD


def test_admin_password_unavailable_is_exit_5_with_no_fallback(fake, monkeypatch, capsys):
    def boom():
        raise AdminPasswordUnavailable("Infisical could not authenticate")
    monkeypatch.setattr(hg, "foundry_admin_password", boom)
    assert hg.cookie("gm", fake / "c.json") == hg.EXIT_ADMIN_PW
    assert FakeAdmin.logged_in_as == []
    summary, _ = _out(capsys)
    assert "Infisical" in summary["error"]
    assert hg.ensure() == hg.EXIT_ADMIN_PW


def test_bot_password_goes_in_the_file_only(fake, monkeypatch, capsys):
    monkeypatch.setattr(hg, "bot_password", lambda create=True: "bot-pw-value")
    out = fake / "c.json"
    assert hg.cookie("gm", out, with_bot_password=True) == 0
    _, printed = _out(capsys)
    assert "bot-pw-value" not in printed
    assert json.loads(out.read_text())["botPassword"] == "bot-pw-value"


def test_bot_password_unavailable_is_exit_6(fake, monkeypatch, capsys):
    def boom(create=True):
        raise hg.BotPasswordUnavailable("no")
    monkeypatch.setattr(hg, "bot_password", boom)
    assert hg.cookie("gm", fake / "c.json", with_bot_password=True) == hg.EXIT_BOT_PW
    assert FakeAdmin.logged_in_as == []


def test_ensure_reports_missing_bot(fake, capsys):
    FakeAdmin.users = [GM, PLAYER_CLAUDE]
    assert hg.ensure() == 0
    summary, _ = _out(capsys)
    assert summary["bot_id"] is None and summary["gm_id"] == GM["_id"]


# ── the bot password in Infisical ────────────────────────────────────────────

class FakeInfisical:
    def __init__(self, stored=""):
        self.stored, self.calls = stored, []

    def __call__(self, argv, **kw):
        self.calls.append((argv, kw.get("input")))
        if argv[2] == "get":
            return subprocess.CompletedProcess(argv, 0, self.stored + "\n", "")
        if argv[2] == "set":
            name, _, value = kw["input"].strip().partition("=")
            assert name == hg.BOT_PW_SECRET
            self.stored = value
            return subprocess.CompletedProcess(argv, 0, "", "")
        raise AssertionError(argv)


def test_bot_password_is_generated_on_stdin_never_argv(monkeypatch):
    fake = FakeInfisical()
    monkeypatch.setattr(hg.subprocess, "run", fake)
    value = hg.bot_password()
    assert len(value) >= 40
    for argv, _ in fake.calls:
        assert value not in " ".join(argv)
    assert any(stdin and value in stdin for _, stdin in fake.calls)


def test_bot_password_reuses_the_stored_one(monkeypatch):
    fake = FakeInfisical("already-there")
    monkeypatch.setattr(hg.subprocess, "run", fake)
    assert hg.bot_password() == "already-there"
    assert all(argv[2] == "get" for argv, _ in fake.calls)


def test_bot_password_replaces_a_literal_at_path(monkeypatch):
    """`NAME=@/dev/stdin` was once stored verbatim; that is not a password."""
    fake = FakeInfisical("@/dev/stdin")
    monkeypatch.setattr(hg.subprocess, "run", fake)
    assert hg.bot_password() != "@/dev/stdin"


def test_infisical_auth_failure_says_so(monkeypatch):
    def run(argv, **kw):
        raise subprocess.CalledProcessError(1, argv, "", "error: unauthorized, please login")
    monkeypatch.setattr(hg.subprocess, "run", run)
    with pytest.raises(hg.BotPasswordUnavailable, match="infisical login"):
        hg.bot_password()


# ── the cached Infisical token (systemd has no WSLENV) ───────────────────────

def test_adopts_cached_token_only_when_none_set(monkeypatch, tmp_path):
    f = tmp_path / "tok"
    f.write_text("cached-token\n")
    monkeypatch.delenv("INFISICAL_TOKEN", raising=False)
    assert hg.adopt_cached_infisical_token(str(f)) is True
    assert hg.os.environ["INFISICAL_TOKEN"] == "cached-token"
    monkeypatch.setenv("INFISICAL_TOKEN", "live")
    assert hg.adopt_cached_infisical_token(str(f)) is False
    assert hg.os.environ["INFISICAL_TOKEN"] == "live"
    monkeypatch.delenv("INFISICAL_TOKEN")
    assert hg.adopt_cached_infisical_token(str(tmp_path / "missing")) is False


# ── CLI wiring ───────────────────────────────────────────────────────────────

def test_cli_routes_headless_gm(monkeypatch):
    seen = {}
    monkeypatch.setattr(hg, "main", lambda action, **kw: seen.update(action=action, **kw) or 0)
    assert cli.main(["headless-gm", "cookie", "--as", "gm", "--out", "/x", "--bot-password"]) == 0
    assert seen["action"] == "cookie" and seen["as_"] == "gm" and seen["with_bot_password"]
    assert str(seen["out"]) == "/x"


# ── FoundryAdmin.join: the /join form, never the admin handshake ─────────────

class _Resp:
    def __init__(self, code, body):
        self.status_code, self._body, self.text = code, body, json.dumps(body)

    def json(self):
        return self._body


def test_admin_join_posts_the_form_and_never_authenticates(monkeypatch):
    from scripts.foundry.update import admin
    fa = admin.FoundryAdmin(base_url="http://127.0.0.1:1")
    seen = []
    monkeypatch.setattr(fa, "authenticate", lambda: pytest.fail("join must not authenticate"))
    monkeypatch.setattr(fa.session, "post", lambda url, json=None, **kw:
                        seen.append((url, json)) or _Resp(200, {"status": "success"}))
    fa.join("botBBBBBBBBBBBBB", "pw")
    assert seen == [("http://127.0.0.1:1/join",
                     {"action": "join", "userId": "botBBBBBBBBBBBBB", "password": "pw"})]


def test_admin_join_401_is_join_rejected_without_the_password(monkeypatch):
    from scripts.foundry.update import admin
    fa = admin.FoundryAdmin(base_url="http://127.0.0.1:1")
    monkeypatch.setattr(fa.session, "post",
                        lambda *a, **kw: _Resp(401, "JOIN.ErrorInvalidPassword"))
    with pytest.raises(admin.JoinRejected) as ei:
        fa.join("u", "the-password")
    assert "the-password" not in str(ei.value)
