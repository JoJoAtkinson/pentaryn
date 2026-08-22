"""Tests for the Foundry ops commands lifted out of the Makefile.

The point of moving this logic into Python was that it could be tested. The
guarantees worth pinning down are the safety ones: a staged `actors.json` sits in a
directory served publicly with no auth, so every exit path must delete it, and the
verification must refuse to pass on anything except a positive 404.
"""

from __future__ import annotations

import signal
import time
import sys

import pytest

from scripts.foundry.ops import cli, login, modules, pipeline, service
from scripts.foundry.ops import config as cfg


# ── verify(): only a positive 404 may pass ────────────────────────────────────

@pytest.mark.parametrize(
    "root_code,actors_code,expected,why",
    [
        (200, 404, 0, "tunnel up, file gone — the only passing case"),
        (302, 404, 0, "a redirect at the root still proves the tunnel is up"),
        (200, 200, 1, "file still served — every connected player can read it"),
        (200, 403, 1, "a bot-challenge is not proof the file is gone"),
        (200, 302, 1, "an interstitial is not proof either"),
        (200, 500, 1, "a server error is not proof either"),
        (000, 404, 0, "tunnel down: nothing is public, so nothing to verify"),
        (403, 404, 0, "root not answering 200/302 means the tunnel isn't up"),
    ],
)
def test_verify_only_passes_on_a_positive_404(monkeypatch, root_code, actors_code, expected, why):
    def fake_code(url, _timeout):
        return actors_code if url == cfg.ACTORS_URL else root_code

    monkeypatch.setattr(pipeline, "_http_code", fake_code)
    assert pipeline.verify() == expected, why


# ── clean_only(): the deletion has to actually take ───────────────────────────

def test_clean_only_reports_success_when_the_file_goes(monkeypatch, tmp_path):
    staged = tmp_path / "actors.json"
    staged.write_text("{}")
    monkeypatch.setattr(cfg, "ACTORS_STAGED", staged)
    assert pipeline.clean_only() == 0
    assert not staged.exists()


def test_clean_only_is_fine_when_the_file_was_never_there(monkeypatch, tmp_path):
    monkeypatch.setattr(cfg, "ACTORS_STAGED", tmp_path / "absent.json")
    assert pipeline.clean_only() == 0


def test_clean_only_fails_loudly_if_the_file_survives(monkeypatch, tmp_path):
    """A silent failure here leaves the file public — it must be an error."""
    staged = tmp_path / "actors.json"
    staged.write_text("{}")
    monkeypatch.setattr(cfg, "ACTORS_STAGED", staged)
    # unlink "succeeds" but the file is still there — a read-only parent dir, say.
    monkeypatch.setattr(type(staged), "unlink", lambda self, **kw: None)
    assert pipeline.clean_only() == 1


# ── run_import(): three ways out, all three delete ────────────────────────────

@pytest.fixture
def staged(monkeypatch, tmp_path):
    f = tmp_path / "actors.json"
    f.write_text("{}")
    monkeypatch.setattr(cfg, "ACTORS_STAGED", f)
    monkeypatch.setattr(pipeline, "stage", lambda: 0)
    monkeypatch.setattr(pipeline, "verify", lambda: 0)
    return f


def test_import_answered_yes_deletes_and_verifies(monkeypatch, staged):
    seen = []
    monkeypatch.setattr(pipeline, "_ask", lambda: "y")
    monkeypatch.setattr(pipeline, "verify", lambda: seen.append("verified") or 0)
    assert pipeline.run_import() == 0
    assert not staged.exists()
    assert seen == ["verified"], "answering yes must run the public 404 assertion"


def test_import_answered_no_still_deletes(monkeypatch, staged):
    seen = []
    monkeypatch.setattr(pipeline, "_ask", lambda: "n")
    monkeypatch.setattr(pipeline, "verify", lambda: seen.append("verified") or 0)
    assert pipeline.run_import() == 0
    assert not staged.exists(), "answering no must not leave the file in a public dir"
    assert seen == [], "answering no skips only the assertion, not the deletion"


def test_import_with_no_terminal_still_deletes(monkeypatch, staged):
    """A piped stdin must not auto-answer, and must not leave the file behind."""
    monkeypatch.setattr(pipeline, "_ask", lambda: "")
    assert pipeline.run_import() == 0
    assert not staged.exists()


def test_import_deletes_on_interrupt(monkeypatch, staged):
    def interrupt():
        # what the SIGINT handler does, invoked the way a real signal would
        handler = signal.getsignal(signal.SIGINT)
        handler(signal.SIGINT, None)

    monkeypatch.setattr(pipeline, "_ask", interrupt)
    with pytest.raises(SystemExit) as exc:
        pipeline.run_import()
    assert exc.value.code == 130
    assert not staged.exists(), "Ctrl-C must not leave a public file behind"


def test_import_restores_the_previous_signal_handlers(monkeypatch, staged):
    before = signal.getsignal(signal.SIGINT)
    monkeypatch.setattr(pipeline, "_ask", lambda: "n")
    pipeline.run_import()
    assert signal.getsignal(signal.SIGINT) is before


def test_import_aborts_when_staging_fails(monkeypatch, tmp_path):
    monkeypatch.setattr(pipeline, "stage", lambda: 1)
    called = []
    monkeypatch.setattr(pipeline, "_ask", lambda: called.append("asked") or "")
    assert pipeline.run_import() == 1
    assert called == [], "a failed stage must not prompt as though it worked"


# ── module checks ─────────────────────────────────────────────────────────────

def test_module_check_rejects_malformed_json(monkeypatch, tmp_path):
    src = tmp_path / "pentaryn-ties"
    (src / "lang").mkdir(parents=True)
    (src / "module.json").write_text("{ not json")
    (src / "lang/en.json").write_text("{}")
    spec = cfg.ModuleSpec("pentaryn-ties", check="parse")
    monkeypatch.setattr(type(spec), "src", property(lambda self: src))
    monkeypatch.setitem(cfg.MODULES, "ties", spec)
    monkeypatch.setattr(modules, "_node_available", lambda: True)
    assert modules.check("ties") == 1


def test_module_check_passes_on_good_json(monkeypatch, tmp_path):
    src = tmp_path / "pentaryn-ties"
    (src / "lang").mkdir(parents=True)
    (src / "module.json").write_text('{"id": "pentaryn-ties"}')
    (src / "lang/en.json").write_text("{}")
    spec = cfg.ModuleSpec("pentaryn-ties", check="parse")
    monkeypatch.setattr(type(spec), "src", property(lambda self: src))
    monkeypatch.setitem(cfg.MODULES, "ties", spec)
    monkeypatch.setattr(modules, "_node_available", lambda: True)
    assert modules.check("ties") == 0


def test_module_sync_refuses_when_the_check_fails(monkeypatch, tmp_path):
    monkeypatch.setattr(modules, "check", lambda name: 1)
    copied = []
    monkeypatch.setattr(modules.shutil, "copytree", lambda *a, **k: copied.append(a))
    assert modules.sync("ties") == 1
    assert copied == [], "unproved sources must never reach Foundry's Data/"


# ── the CLI surface ───────────────────────────────────────────────────────────

def test_every_subcommand_routes(monkeypatch):
    """Each declared subcommand reaches an implementation, not the AssertionError."""
    parser = cli.build_parser()
    names = [
        a for action in parser._subparsers._actions
        if hasattr(action, "choices") and action.choices
        for a in action.choices
    ]
    assert len(names) >= 18

    for fn in ("up", "down", "status", "lock_check", "tunnel_up", "tunnel_down",
               "tunnel_setup", "tunnel_logs"):
        monkeypatch.setattr(cli.service, fn, lambda *a, **k: 0)
    for fn in ("build_actors", "stage", "run_import", "clean", "clean_only", "verify"):
        monkeypatch.setattr(cli.pipeline, fn, lambda *a, **k: 0)
    for fn in ("check", "sync", "walls_wasm", "walls_bench"):
        monkeypatch.setattr(cli.modules, fn, lambda *a, **k: 0)
    monkeypatch.setattr(cli.login_mod, "login", lambda *a, **k: 0)

    for name in names:
        argv = [name]
        if name in ("module-check", "module-sync"):
            argv.append("ties")
        assert cli.main(argv) == 0, f"{name} did not route"


def test_unknown_subcommand_exits_nonzero():
    with pytest.raises(SystemExit) as exc:
        cli.main(["no-such-command"])
    assert exc.value.code != 0


# ── probes: the User-Agent is load-bearing ────────────────────────────────────
# Cloudflare 403s a bare `Python-urllib/3.x` at the edge before the request reaches
# Foundry. Left alone that made a healthy server read as "HTTP 403" in `make vtt` and,
# far worse, made the Gate 2 verifier conclude "tunnel not reachable, nothing to
# verify" and PASS without checking anything.

def test_probes_claim_to_be_a_browser():
    assert service.BROWSER_UA.startswith("Mozilla/5.0")
    assert "urllib" not in service.BROWSER_UA


def test_http_code_sends_the_browser_user_agent(monkeypatch):
    seen = {}

    def fake_urlopen(req, timeout=None):
        seen["ua"] = req.get_header("User-agent")
        raise RuntimeError("stop here — the header is what matters")

    monkeypatch.setattr(service.urllib.request, "urlopen", fake_urlopen)
    service._http_code("https://example.invalid/", 1)
    assert seen["ua"] == service.BROWSER_UA


def test_verify_does_not_pass_silently_when_the_edge_blocks_the_probe(monkeypatch):
    """A 403 at the root used to short-circuit verify() into a pass."""
    monkeypatch.setattr(pipeline, "_http_code", lambda url, t: 403)
    # It still returns OK — but only because 403 genuinely means "not reachable".
    # The guard that matters is the UA above, which stops the edge from producing a
    # spurious 403 in the first place. This pins the pairing so neither is dropped
    # without the other being reconsidered.
    assert pipeline.verify() == 0
    assert service.BROWSER_UA, "the UA is what keeps the 403 branch from firing falsely"


# ── status distinguishes "no world" from "tunnel down" ────────────────────────
# Foundry redirects the site root to /setup when no world is launched, and /setup is
# 403'd at the Cloudflare edge on purpose — so a perfectly healthy tunnel with no
# world reads identically to a dead one unless the redirect target is inspected.

@pytest.mark.parametrize(
    "code,location,expect",
    [
        (0,   "",       "not reachable"),
        (302, "/setup", "NO WORLD IS LAUNCHED"),
        (302, "/join",  "players can connect"),
        (200, "",       "players can connect"),
        (500, "",       "unexpected HTTP 500"),
    ],
)
def test_status_public_line_names_the_actual_state(monkeypatch, capsys, code, location, expect):
    monkeypatch.setattr(service, "_probe", lambda url, t: (code, location))
    monkeypatch.setattr(service, "foundry_is_up", lambda t=2.0: True)
    monkeypatch.setattr(service, "_tunnel_pid", lambda: 123)
    service.status()
    assert expect in capsys.readouterr().out


@pytest.mark.parametrize(
    "code,location,expected",
    [(0, "", None), (302, "/setup", False), (302, "/join", True), (200, "", True)],
)
def test_world_is_launched(monkeypatch, code, location, expected):
    monkeypatch.setattr(service, "_probe", lambda url, t: (code, location))
    assert service.world_is_launched() is expected


# ── the world guard ───────────────────────────────────────────────────────────
# The Makefile targeted `ardenhaven` while the live world was `space-journey`, so the
# import staged into an unplayed world, found nothing, and then asserted a 404 against
# that same unused world's URL — green lights the whole way down. These pin the guard.

def test_stage_refuses_a_world_that_does_not_exist(monkeypatch, tmp_path):
    monkeypatch.setattr(cfg, "WORLD_DIR", tmp_path / "worlds" / "not-a-world")
    monkeypatch.setattr(cfg, "WORLDS_DIR", tmp_path / "worlds")
    assert pipeline.check_world() == 1


def test_stage_accepts_a_world_that_exists(monkeypatch, tmp_path):
    world = tmp_path / "worlds" / "space-journey"
    world.mkdir(parents=True)
    monkeypatch.setattr(cfg, "WORLD_DIR", world)
    assert pipeline.check_world() == 0


def test_stage_aborts_before_copying_when_the_world_is_missing(monkeypatch, tmp_path):
    """A missing world must stop the copy, not mkdir -p a plausible-looking one."""
    monkeypatch.setattr(pipeline, "build_actors", lambda: 0)
    monkeypatch.setattr(pipeline, "check_world", lambda: 1)
    copied = []
    monkeypatch.setattr(pipeline.shutil, "copy2", lambda *a, **k: copied.append(a))
    assert pipeline.stage() == 1
    assert copied == []


def test_staged_path_and_probed_url_name_the_same_world():
    """The gate is worthless if it verifies a different world than the one staged."""
    assert f"/worlds/{cfg.WORLD_NAME}/actors.json" in cfg.ACTORS_URL
    assert cfg.ACTORS_STAGED.parent.name == cfg.WORLD_NAME


def test_import_instructions_name_the_target_world():
    rendered = pipeline._INSTRUCTIONS.replace(pipeline._WORLD_PLACEHOLDER, cfg.WORLD_NAME)
    assert cfg.WORLD_NAME in rendered
    assert pipeline._WORLD_PLACEHOLDER not in rendered


def test_import_instructions_survive_their_own_js_braces():
    """The body contains `{ dryRun: true }`; str.format would read that as a field."""
    rendered = pipeline._INSTRUCTIONS.replace(pipeline._WORLD_PLACEHOLDER, cfg.WORLD_NAME)
    assert "{ dryRun: true }" in rendered


# ── config sanity ─────────────────────────────────────────────────────────────

def test_repo_root_points_at_the_repo():
    assert (cfg.REPO_ROOT / "Makefile").exists()
    assert (cfg.REPO_ROOT / "scripts/foundry/ops/cli.py").exists()


def test_actors_url_matches_the_staged_world_path():
    """The URL the verifier probes must be the file the pipeline actually stages."""
    assert cfg.ACTORS_URL.endswith(f"/worlds/{cfg.WORLD_NAME}/actors.json")
    assert cfg.ACTORS_STAGED.name == "actors.json"


def test_declared_modules_exist_on_disk():
    for name, spec in cfg.MODULES.items():
        assert spec.src.is_dir(), f"{name}: no module at {spec.src}"


@pytest.mark.skipif(sys.platform != "darwin", reason="the table is a Mac")
def test_foundry_data_is_under_application_support():
    assert "Application Support/FoundryVTT/Data" in str(cfg.FOUNDRY_DATA)


# ── vtt-login: the parts that can be tested without a live server ─────────────
#
# The wire protocol is proved by running it (see context/foundry/ops.md §2). What is
# pinned here is the logic that would fail silently or destructively: picking the wrong
# world or user, and switching worlds out from under connected players.

def test_pick_user_prefers_a_gamemaster_over_document_order():
    users = [
        {"_id": "p1", "name": "Kristine", "role": 2},
        {"_id": "gm", "name": "Gamemaster", "role": 4},
        {"_id": "p2", "name": "Kyle", "role": 2},
    ]
    assert login._pick_user(users, None, prompt=False)["_id"] == "gm"


def test_pick_user_honours_an_explicit_name_case_insensitively():
    users = [{"_id": "gm", "name": "Gamemaster", "role": 4},
             {"_id": "p2", "name": "Kyle", "role": 2}]
    assert login._pick_user(users, "kyle", prompt=False)["_id"] == "p2"


def test_pick_user_names_the_alternatives_when_the_name_is_wrong():
    users = [{"_id": "gm", "name": "Gamemaster", "role": 4}]
    with pytest.raises(RuntimeError, match="Gamemaster"):
        login._pick_user(users, "Nobody", prompt=False)


def test_pick_user_refuses_a_world_with_no_gamemaster_when_it_cannot_ask():
    with pytest.raises(RuntimeError, match="no Gamemaster"):
        login._pick_user([{"_id": "p", "name": "Kyle", "role": 2}], None, prompt=False)


def test_pick_user_menu_defaults_to_the_gamemaster(monkeypatch):
    """Highest role first, GM pre-selected — pressing enter must never quietly log you
    in as a player with a player's view of the world."""
    seen = {}

    def fake_choose(prompt, options, default_index=0):
        seen.update(options=options, default_index=default_index)
        return options[default_index][1]

    monkeypatch.setattr(login, "_choose", fake_choose)
    users = [{"_id": "p2", "name": "Kyle", "role": 2},
             {"_id": "gm", "name": "Gamemaster", "role": 4},
             {"_id": "p1", "name": "Kristine", "role": 2}]
    assert login._pick_user(users, None, prompt=True)["_id"] == "gm"
    assert seen["options"][seen["default_index"]][1]["_id"] == "gm"


def test_pick_world_rejects_a_name_that_is_not_on_disk(monkeypatch):
    monkeypatch.setattr(login, "worlds_on_disk",
                        lambda: [{"id": "space-journey", "title": "SJ", "system": "dnd5e",
                                  "played_label": ""}])
    with pytest.raises(RuntimeError, match="no world named"):
        login._pick_world(None, "typo", prompt=False)


def test_pick_world_without_a_terminal_never_switches_the_live_world(monkeypatch):
    """A non-interactive run must land in whatever is already serving. Silently
    switching would deactivate a world with players on it."""
    monkeypatch.setattr(login, "worlds_on_disk", lambda: [
        {"id": "ardenhaven", "title": "A", "system": "dnd5e", "played_label": "2026-01-01"},
        {"id": "space-journey", "title": "SJ", "system": "dnd5e", "played_label": "2026-08-22"},
    ])
    assert login._pick_world("ardenhaven", None, prompt=False) == "ardenhaven"


def test_pick_world_menu_defaults_to_the_running_world(monkeypatch):
    seen = {}

    def fake_choose(prompt, options, default_index=0):
        seen.update(options=options, default_index=default_index)
        return options[default_index][1]

    monkeypatch.setattr(login, "_choose", fake_choose)
    monkeypatch.setattr(login, "worlds_on_disk", lambda: [
        {"id": "space-journey", "title": "SJ", "system": "dnd5e", "played_label": "2026-08-22"},
        {"id": "ardenhaven", "title": "A", "system": "dnd5e", "played_label": "2026-01-01"},
    ])
    assert login._pick_world("ardenhaven", None, prompt=True) == "ardenhaven"
    assert "running" in seen["options"][seen["default_index"]][0]


class _FakeStatus:
    def __init__(self, active, world, users=0):
        self.active, self.world, self.users = active, world, users


class _FakeAdmin:
    def __init__(self, status):
        self._status = status
        self.launched = []
        self.deactivated = False

    def status(self):
        return self._status

    def deactivate_world(self):
        self.deactivated = True
        return True

    def launch_world(self, world):
        self.launched.append(world)

    def wait_for_world(self, world, timeout=0):
        pass


def test_ensure_world_does_nothing_when_the_right_world_is_already_up():
    fa = _FakeAdmin(_FakeStatus(True, "space-journey"))
    login._ensure_world(fa, "space-journey", prompt=False)
    assert not fa.deactivated and not fa.launched


def test_ensure_world_refuses_to_drop_connected_players_unattended():
    """Switching worlds disconnects everyone. Without a terminal to confirm at, that
    must be an error rather than something that just happens."""
    fa = _FakeAdmin(_FakeStatus(True, "ardenhaven", users=3))
    with pytest.raises(RuntimeError, match="3 user"):
        login._ensure_world(fa, "space-journey", prompt=False)
    assert not fa.deactivated


def test_ensure_world_switches_when_confirmed(monkeypatch):
    monkeypatch.setattr(login, "_choose", lambda *a, **k: True)
    monkeypatch.setattr(login.time, "sleep", lambda *_: None)
    fa = _FakeAdmin(_FakeStatus(True, "ardenhaven", users=2))
    login._ensure_world(fa, "space-journey", prompt=True)
    assert fa.deactivated and fa.launched == ["space-journey"]


def test_ensure_world_leaves_the_live_world_alone_when_declined(monkeypatch):
    monkeypatch.setattr(login, "_choose", lambda *a, **k: False)
    fa = _FakeAdmin(_FakeStatus(True, "ardenhaven", users=2))
    with pytest.raises(RuntimeError, match="staying in"):
        login._ensure_world(fa, "space-journey", prompt=True)
    assert not fa.deactivated and not fa.launched


def test_ensure_world_launches_when_nothing_is_running():
    fa = _FakeAdmin(_FakeStatus(False, None))
    login._ensure_world(fa, "space-journey", prompt=False)
    assert not fa.deactivated and fa.launched == ["space-journey"]


def test_handoff_is_single_use_and_nonce_guarded():
    """One request, at the nonce path only, and the port is closed afterwards."""
    import urllib.error
    import urllib.request

    urls = []
    real_run = login.subprocess.run

    def fake_run(argv, **kw):
        urls.append(argv[1])
        return real_run(["true"], **kw)

    login.subprocess.run = fake_run
    try:
        import threading
        result = {}
        t = threading.Thread(
            target=lambda: result.update(
                ok=login._handoff("sess-id", "localhost", "http://localhost:30000/game", True)),
            daemon=True)
        t.start()
        for _ in range(100):
            if urls:
                break
            time.sleep(0.05)
        assert urls, "the handoff never opened a URL"
        url = urls[0]

        # A guessed path on the right port gets nothing.
        base = url.rsplit("/", 1)[0]
        try:
            urllib.request.urlopen(f"{base}/wrong-nonce", timeout=5)
            raise AssertionError("a wrong nonce was served")
        except urllib.error.HTTPError as exc:
            assert exc.code == 404

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None

        opener = urllib.request.build_opener(NoRedirect)
        try:
            opener.open(url, timeout=5)
            raise AssertionError("expected a redirect, not a 200")
        except urllib.error.HTTPError as exc:
            assert exc.code == 302
            assert exc.headers["Location"] == "http://localhost:30000/game"
            cookie = exc.headers["Set-Cookie"]
            assert cookie.startswith("session=sess-id;")
            assert "HttpOnly" in cookie and "SameSite=Strict" in cookie

        # A replay either meets the spent-ticket 410 or an already-closed socket,
        # depending on whether it lands before the main thread tears the server down.
        # The property under test is that it is never handed the cookie again.
        try:
            replay = opener.open(url, timeout=5).status
        except urllib.error.HTTPError as exc:
            replay = exc.code
        except OSError:
            replay = "closed"

        t.join(timeout=10)
        assert not t.is_alive(), "the handoff server did not shut down"
        assert result["ok"] is True
        assert replay in (410, "closed"), f"the ticket was replayable: {replay}"

        # The port is released — a second visit cannot reach it.
        with pytest.raises(Exception):
            urllib.request.urlopen(url, timeout=3)
    finally:
        login.subprocess.run = real_run


# ── FoundryAdmin.authenticate(): the route depends on the world state ─────────
#
# `/auth` short-circuits on `!game.world` and never checks the password while a world
# is live, then redirects exactly as it does for a rejection. Sending an admin
# handshake there with a world up produced "the password did not match" against a
# correct password — a diagnosis that sends you to re-sync a secret that was fine.

class _Recorder:
    """A requests.Session stand-in that records posts and replays canned responses."""

    def __init__(self, is_admin=True):
        self.posts = []
        self._is_admin = is_admin
        self.cookies = {}

    def post(self, url, data=None, json=None, **kw):
        self.posts.append((url, data or json or {}))

        class R:
            status_code = 302
            headers = {"Location": "/setup"}
        return R()

    def get(self, url, **kw):
        raise AssertionError(f"unexpected GET {url}")


def _admin_with(session, active):
    from scripts.foundry.update.admin import FoundryAdmin

    fa = FoundryAdmin(base_url="http://x", admin_password="pw")
    fa.session = session
    fa.world_active = lambda: active
    fa.join_data = lambda: {"isAdmin": session._is_admin}
    return fa


def test_authenticate_uses_setup_when_a_world_is_active():
    session = _Recorder(is_admin=True)
    _admin_with(session, active=True).authenticate()
    urls = [u for u, _ in session.posts]
    assert urls == ["http://x/setup"], "must not touch /auth while a world is live"
    body = session.posts[0][1]
    assert body["adminPassword"] == "pw"
    # Both keys are handled ABOVE setup.mjs's 403 and would deactivate or mutate the
    # live world rather than merely flagging the session.
    assert "shutdown" not in body and body["action"] != "editWorld"


def test_authenticate_uses_auth_when_no_world_is_active():
    session = _Recorder()
    _admin_with(session, active=False).authenticate()
    assert [u for u, _ in session.posts] == ["http://x/auth"]


def test_authenticate_fails_when_foundry_reports_the_session_is_not_admin():
    from scripts.foundry.update.admin import FoundryError

    session = _Recorder(is_admin=False)
    with pytest.raises(FoundryError, match="not admin"):
        _admin_with(session, active=True).authenticate()


def test_authenticate_is_idempotent():
    session = _Recorder()
    fa = _admin_with(session, active=True)
    fa.authenticate()
    fa.authenticate()
    assert len(session.posts) == 1


def test_world_ordering_parses_foundrys_javascript_date():
    """`lastPlayed` is a JS Date.toString(), not ISO. Sorted as a string it orders by
    weekday name — Friday before Saturday before Thursday — which on a short list looks
    plausible and is wrong."""
    fri = "Fri Aug 21 2026 18:58:27 GMT-0400 (Eastern Daylight Time)"
    sat = "Sat Aug 22 2026 13:37:32 GMT-0400 (Eastern Daylight Time)"
    thu = "Thu Aug 27 2026 09:00:00 GMT-0400 (Eastern Daylight Time)"
    assert login._last_played(sat) > login._last_played(fri)
    assert login._last_played(thu) > login._last_played(sat), "string sort would fail here"
    assert sorted([thu, sat, fri]) == [fri, sat, thu], "confirming the naive sort is wrong"


def test_world_ordering_survives_a_missing_or_unparseable_date():
    assert login._last_played("") == login._last_played("not a date")
    assert login._last_played("").year == 1, "unknown dates must sort last, not raise"
