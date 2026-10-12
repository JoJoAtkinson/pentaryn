"""Tests for the Foundry ops commands lifted out of the Makefile.

The point of moving this logic into Python was that it could be tested. The
guarantees worth pinning down are the safety ones: a staged `actors.json` sits in a
directory served publicly with no auth, so every exit path must delete it, and the
verification must refuse to pass on anything except a positive 404.
"""

from __future__ import annotations

import signal
import time

import pytest

from scripts.foundry.ops import cli, login, modules, pipeline, service
from scripts.foundry.ops import config as cfg


# ── verify(): only a positive 404 may pass ────────────────────────────────────

@pytest.fixture(autouse=True)
def _no_access_probe(monkeypatch):
    """verify() first asks whether Cloudflare Access answers; never over the network here."""
    monkeypatch.setattr(pipeline, "_access_gated", lambda url: False)


def test_verify_behind_access_with_the_tunnel_down_passes(monkeypatch):
    """Access's login page followed to a 200 used to read as STILL EXPOSED (2026-10-11)."""
    monkeypatch.setattr(pipeline, "_access_gated", lambda url: True)
    monkeypatch.setattr(service, "_tunnel_pid", lambda: None)
    monkeypatch.setattr(pipeline, "_http_code", lambda url, t: 200)
    assert pipeline.verify() == 0


def test_verify_behind_access_with_the_tunnel_up_fails(monkeypatch):
    """With the tunnel up a script cannot see past Access, so it is not proof."""
    monkeypatch.setattr(pipeline, "_access_gated", lambda url: True)
    monkeypatch.setattr(service, "_tunnel_pid", lambda: 4242)
    monkeypatch.setattr(pipeline, "_http_code", lambda url, t: 404)
    assert pipeline.verify() == 1


def test_access_gated_reads_the_login_redirect(monkeypatch):
    login = "https://team.cloudflareaccess.com/cdn-cgi/access/login/vtt.atjoseph.com?x=1"
    monkeypatch.undo()
    monkeypatch.setattr(pipeline, "_probe", lambda url, t: (302, login))
    assert pipeline._access_gated(cfg.ACTORS_URL) is True
    monkeypatch.setattr(pipeline, "_probe", lambda url, t: (302, "/join"))
    assert pipeline._access_gated(cfg.ACTORS_URL) is False
    monkeypatch.setattr(pipeline, "_probe", lambda url, t: (404, ""))
    assert pipeline._access_gated(cfg.ACTORS_URL) is False

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


def test_import_deletes_when_the_prompt_raises(monkeypatch, staged):
    """An unexpected error out of the prompt (a non-UTF-8 byte on the tty) still deletes."""
    before = signal.getsignal(signal.SIGINT)

    def garbled():
        raise UnicodeDecodeError("utf-8", b"\xff", 0, 1, "bad")

    monkeypatch.setattr(pipeline, "_ask", garbled)
    with pytest.raises(UnicodeDecodeError):
        pipeline.run_import()
    assert not staged.exists(), "an error in the prompt must not leave a public file behind"
    assert signal.getsignal(signal.SIGINT) is before


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
    for fn in ("build_actors", "stage", "install_importer", "run_import", "clean", "clean_only", "verify"):
        monkeypatch.setattr(cli.pipeline, fn, lambda *a, **k: 0)
    for fn in ("check", "sync", "walls_wasm", "walls_bench",
               "module_new", "module_vendor", "module_conformance"):
        monkeypatch.setattr(cli.modules, fn, lambda *a, **k: 0)
    monkeypatch.setattr(cli.login_mod, "login", lambda *a, **k: 0)
    monkeypatch.setattr(cli.index, "main", lambda *a, **k: 0)

    # a subcommand left unstubbed must never reach the real Foundry Data folder (an unstubbed
    # importer-install rewrote the live pentaryn-importer on every pytest run, 2026-10-12)
    def no_real_install(*a, **k):
        raise AssertionError(f"routing test reached a real module install: {a}")
    monkeypatch.setattr(cli.pipeline, "install", no_real_install)
    monkeypatch.setattr(cli.modules, "install", no_real_install)

    for name in names:
        argv = [name]
        if name in ("module-check", "module-sync"):
            argv.append("ties")
        assert cli.main(argv) == 0, f"{name} did not route"


# ── module-check --all / --json (python-tooling-8, -41); blueprint wrappers (W1) ──

def test_module_check_all_runs_every_module(monkeypatch):
    seen: list[str] = []
    monkeypatch.setattr(modules, "check", lambda n: seen.append(n) or (1 if n == "ties" else 0))
    assert cli.main(["module-check", "--all"]) == 1
    assert seen == sorted(cfg.MODULES)


@pytest.mark.parametrize("argv", [["module-check"], ["module-check", "ties", "--all"]])
def test_module_check_needs_exactly_one_target(argv):
    with pytest.raises(SystemExit) as exc:
        cli.main(argv)
    assert exc.value.code == 2


def test_module_check_json_reports_the_broken_gate(monkeypatch, tmp_path, capsys):
    src = tmp_path / "pentaryn-ties"
    src.mkdir()
    (src / "module.json").write_text('{"id": "pentaryn-ties", "esmodules": ["main.mjs"]}')
    (src / "main.mjs").write_text('import { alpha } from "./lib.mjs";\n')
    (src / "lib.mjs").write_text("export const beta = 1;\n")
    spec = cfg.ModuleSpec("pentaryn-ties", check=("imports",))
    monkeypatch.setattr(type(spec), "src", property(lambda self: src))
    monkeypatch.setitem(cfg.MODULES, "ties", spec)
    assert cli.main(["module-check", "ties", "--json"]) == 1
    import json
    data = json.loads(capsys.readouterr().out)
    gate = data["gates"][0]
    assert data["ok"] is False and gate["gate"] == "imports" and gate["ok"] is False
    assert "alpha" in gate["problems"][0]


def test_status_json_has_the_three_answers(monkeypatch, capsys):
    import json
    monkeypatch.setattr(service, "foundry_is_up", lambda *a: True)
    monkeypatch.setattr(service, "_tunnel_pid", lambda: 4242)
    monkeypatch.setattr(service, "_probe", lambda *a: (302, "https://x/setup"))
    assert cli.main(["status", "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert set(data) == {"foundry", "tunnel", "public"}
    assert data["tunnel"]["pid"] == 4242 and data["public"]["state"] == "no-world"


def test_bridge_status_json_fails_only_on_an_orphan_holder(monkeypatch):
    from scripts.foundry.ops import bridge
    live = bridge.Proc(pid=1, ppid=0, started="t", command="c", kind="backend", ports=(1,))
    orphan = bridge.Proc(pid=2, ppid=0, started="t", command="c", kind="backend", ports=(1,),
                         orphan=True)
    assert bridge.status_report([live])["ok"] is True
    assert bridge.status_report([orphan])["ok"] is False
    assert bridge.status_report([])["holder"] is None


@pytest.mark.parametrize("cmd, fn", [("module-vendor", "vendor"),
                                     ("module-conformance", "conformance")])
def test_blueprint_wrappers_pass_arguments_through(monkeypatch, cmd, fn):
    import importlib
    mod = importlib.import_module(f"scripts.foundry.blueprint.{fn}")
    seen = []
    monkeypatch.setattr(mod, "main", lambda argv: seen.append(argv) or 7)
    assert cli.main([cmd, "check", "names", "--json"]) == 7
    assert seen == [["check", "names", "--json"]]


@pytest.mark.parametrize("cmd, fn, argv", [
    ("module-conformance", "conformance", ["--module", "names", "--markdown"]),
    ("module-conformance", "conformance", ["--json"]),
    ("module-vendor", "vendor", ["--help"]),
    ("module-new", "new_module", ["--help", "--out", "/tmp/x"]),
])
def test_blueprint_wrappers_accept_a_leading_option(monkeypatch, cmd, fn, argv):
    # argparse.REMAINDER as the only positional rejects a first token starting with `-`;
    # `make foundry-conformance M=<m>` / `MD=1` send exactly those forms.
    import importlib
    mod = importlib.import_module(f"scripts.foundry.blueprint.{fn}")
    seen = []
    monkeypatch.setattr(mod, "main", lambda a: seen.append(a) or 0)
    assert cli.main([cmd, *argv]) == 0
    assert seen == [argv]


def test_module_new_installs_into_foundry_module_unless_out_is_given(monkeypatch):
    from scripts.foundry.blueprint import new_module
    seen = []
    monkeypatch.setattr(new_module, "main", lambda argv: seen.append(argv) or 0)
    cli.main(["module-new", "demo", "--title", "Pentaryn Demo", "--tier", "small"])
    cli.main(["module-new", "demo", "--title", "T", "--out", "/tmp/x"])
    assert seen[0] == ["demo", "--title", "Pentaryn Demo", "--tier", "small", "--install"]
    assert "--install" not in seen[1]


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


# Cloudflare Access answers vtt.atjoseph.com itself — a 302 to its login page — with or
# without an origin behind it, so a 302 alone is not "players can connect" (2026-10-12:
# the line said reachable while the tunnel was down).
_ACCESS_LOGIN = ("https://broad-smoke-7112.cloudflareaccess.com/cdn-cgi/access/login/"
                 "vtt.atjoseph.com?kid=abc&redirect_url=%2F")


@pytest.mark.parametrize(
    "location,expected",
    [
        (_ACCESS_LOGIN, True),
        ("https://team.cloudflareaccess.com/cdn-cgi/access/login/x", True),
        ("/cdn-cgi/access/login/vtt.atjoseph.com?kid=abc", True),
        ("/join", False),
        ("/setup", False),
        ("https://vtt.atjoseph.com/game", False),
        ("https://evil.example/?next=cloudflareaccess.com", False),
        ("", False),
    ],
)
def test_is_access_login(location, expected):
    assert service.is_access_login(302, location) is expected


def test_is_access_login_needs_a_redirect():
    assert service.is_access_login(200, _ACCESS_LOGIN) is False


def test_status_access_login_with_the_tunnel_down_says_players_cannot_connect(monkeypatch, capsys):
    monkeypatch.setattr(service, "_probe", lambda url, t: (302, _ACCESS_LOGIN))
    monkeypatch.setattr(service, "foundry_is_up", lambda t=2.0: True)
    monkeypatch.setattr(service, "_tunnel_pid", lambda: None)
    r = service.status_report()
    assert r["public"]["state"] == "access-only"
    service.status()
    out = capsys.readouterr().out
    assert "Access login only (tunnel down — players cannot connect)" in out
    assert "players can connect" not in out.replace("cannot connect", "")


def test_status_access_login_with_the_tunnel_up_does_not_claim_the_origin(monkeypatch, capsys):
    monkeypatch.setattr(service, "_probe", lambda url, t: (302, _ACCESS_LOGIN))
    monkeypatch.setattr(service, "foundry_is_up", lambda t=2.0: True)
    monkeypatch.setattr(service, "_tunnel_pid", lambda: 123)
    r = service.status_report()
    assert r["public"]["state"] == "access-gated"
    assert "behind Cloudflare Access" in r["public"]["verdict"]
    assert "players can connect" not in r["public"]["verdict"]


def test_pipeline_access_gated_shares_the_status_rule(monkeypatch):
    monkeypatch.undo()
    monkeypatch.setattr(pipeline, "_probe", lambda url, t: (302, "/cdn-cgi/access/login/vtt.atjoseph.com"))
    assert pipeline._access_gated(cfg.ACTORS_URL) is True


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

@pytest.mark.repo
def test_repo_root_points_at_the_repo():
    assert (cfg.REPO_ROOT / "Makefile").exists()
    assert (cfg.REPO_ROOT / "scripts/foundry/ops/cli.py").exists()


def test_actors_url_matches_the_staged_world_path():
    """The URL the verifier probes must be the file the pipeline actually stages."""
    assert cfg.ACTORS_URL.endswith(f"/worlds/{cfg.WORLD_NAME}/actors.json")
    assert cfg.ACTORS_STAGED.name == "actors.json"


@pytest.mark.repo
def test_declared_modules_exist_on_disk():
    for name, spec in cfg.MODULES.items():
        assert spec.src.is_dir(), f"{name}: no module at {spec.src}"


# ── registry: complete, kit and after_sync derived (python-tooling-3, W2) ────────

@pytest.mark.repo
def test_every_module_dir_is_registered():
    """Registry ⊇ disk (pings, the one folder without a ModuleSpec, was registered 2026-10-11)."""
    registered = {spec.name for spec in cfg.MODULES.values()}
    assert set(cfg.module_dirs()) - registered == set()


@pytest.mark.repo
def test_pings_passes_its_gates():
    assert modules.check("pings") == 0


def test_module_dirs_lists_only_folders_with_a_manifest(tmp_path):
    for name in ("pentaryn-b", "pentaryn-a"):
        (tmp_path / name).mkdir()
        (tmp_path / name / "module.json").write_text("{}")
    (tmp_path / "stray").mkdir()
    assert cfg.module_dirs(tmp_path) == ["pentaryn-a", "pentaryn-b"]
    assert cfg.module_dirs(tmp_path / "missing") == []


def _spec_at(monkeypatch, src, **kw):
    spec = cfg.ModuleSpec("pentaryn-demo", check="parse", **kw)
    monkeypatch.setattr(cfg, "MODULE_SRC_ROOT", src.parent)
    return spec


def test_after_sync_prefers_module_json(monkeypatch, tmp_path):
    src = tmp_path / "pentaryn-demo"
    src.mkdir()
    (src / "module.json").write_text(
        '{"flags": {"pentaryn": {"afterSync": ["Reload → then check", "line two"]}}}',
        encoding="utf-8")
    spec = _spec_at(monkeypatch, src, after_sync=("from config",))
    assert spec.after_sync == ("Reload → then check", "line two")


@pytest.mark.parametrize("manifest", [None, "{}", '{"flags": {"pentaryn": {"afterSync": []}}}',
                                      "{ not json"])
def test_after_sync_falls_back_to_the_tuple(monkeypatch, tmp_path, manifest):
    src = tmp_path / "pentaryn-demo"
    src.mkdir()
    if manifest is not None:
        (src / "module.json").write_text(manifest)
    spec = _spec_at(monkeypatch, src, after_sync=("from config",))
    assert spec.after_sync == ("from config",)


@pytest.mark.repo
def test_real_after_sync_has_exactly_one_source():
    """What prints after a sync is module.json flags.pentaryn.afterSync when the module carries
    it, else the config tuple. A module carrying both (mid-move to module.json) must say the same
    thing in both; a generated module (pentaryn-feedback) carries only module.json."""
    for name, spec in cfg.MODULES.items():
        manifest = cfg._read_json(spec.src / "module.json") or {}
        lines = ((manifest.get("flags") or {}).get("pentaryn") or {}).get("afterSync")
        if lines:
            assert spec.after_sync == tuple(lines), name
            assert spec._after_sync in ((), tuple(lines)), f"{name}: module.json and the config tuple disagree"
        else:
            assert spec.after_sync == spec._after_sync, name


def test_kit_is_derived_from_the_lock(monkeypatch, tmp_path):
    src = tmp_path / "pentaryn-demo"
    (src / "lib").mkdir(parents=True)
    spec = _spec_at(monkeypatch, src)
    assert spec.kit is None and spec.kit_lock is None          # unmigrated
    (src / "lib/kit.lock.json").write_text(
        '{"version": "1.0.1", "tier": "small", "files": ["errors", "log"]}')
    assert spec.kit == ("errors", "log")
    assert spec.kit_lock["tier"] == "small"
    assert "kit" not in vars(spec), "the kit list is never stored on the spec (D8)"


def test_foundry_data_is_under_application_support_on_a_mac(monkeypatch):
    from scripts.foundry import host
    monkeypatch.delenv("FOUNDRY_DATA", raising=False)
    monkeypatch.setattr(host.platform, "system", lambda: "Darwin")
    assert str(host.FOUNDRY_DATA).endswith("Library/Application Support/FoundryVTT")
    # config derives its Data/ folder from host.foundry_data() at import; every test sees a tmp
    # copy (conftest `_isolate_foundry_data`), so pin the derivation, not the import-time value.
    assert str(host.foundry_data() / "Data").endswith("Application Support/FoundryVTT/Data")


# ── foundry-down: pid OR port ─────────────────────────────────────────────────

@pytest.fixture
def stops(monkeypatch):
    from scripts.foundry import host
    calls = []
    monkeypatch.setattr(host, "request_stop", lambda: calls.append("stop") or True)
    monkeypatch.setattr(host, "force_stop", lambda: calls.append("force"))
    return host, calls


def test_down_stops_a_server_whose_pid_cannot_be_found_but_whose_port_answers(
        monkeypatch, stops, capsys):
    """BOSS with a PENTARYN_START_CMD that pgrep's pattern does not match."""
    host, calls = stops
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.setenv("PENTARYN_STOP_CMD", "systemctl --user stop foundry")
    monkeypatch.setattr(host, "pid", lambda: None)
    monkeypatch.setattr(host, "is_running", lambda port=None: True)
    assert service.down() == 0
    assert calls == ["stop"] and "already down" not in capsys.readouterr().out


def test_down_with_a_live_port_and_no_way_to_stop_it_fails(monkeypatch, stops, capsys):
    """Linux, no pid found, no PENTARYN_STOP_CMD: nothing to signal — not "stopped"."""
    host, calls = stops
    monkeypatch.setattr(host, "pid", lambda: None)
    monkeypatch.setattr(host, "is_running", lambda port=None: True)
    monkeypatch.setattr(host.platform, "system", lambda: "Linux")
    monkeypatch.delenv("PENTARYN_STOP_CMD", raising=False)
    assert service.down() != 0
    out = capsys.readouterr().out
    assert calls == [] and "stopped" not in out and "PENTARYN_STOP_CMD is not set" in out


def test_down_with_neither_pid_nor_port_is_already_down(monkeypatch, stops, capsys):
    host, calls = stops
    monkeypatch.setattr(host, "pid", lambda: None)
    monkeypatch.setattr(host, "is_running", lambda port=None: False)
    assert service.down() == 0
    assert calls == [] and "already down" in capsys.readouterr().out


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


# FoundryAdmin stand-in: the shared `fake_admin` fixture in conftest.py.


def test_ensure_world_does_nothing_when_the_right_world_is_already_up(fake_admin):
    fa = fake_admin(True, "space-journey")
    login._ensure_world(fa, "space-journey", prompt=False)
    assert not fa.deactivated and not fa.launched


def test_ensure_world_refuses_to_drop_connected_players_unattended(fake_admin):
    """Switching worlds disconnects everyone. Without a terminal to confirm at, that
    must be an error rather than something that just happens."""
    fa = fake_admin(True, "ardenhaven", users=3)
    with pytest.raises(RuntimeError, match="3 user"):
        login._ensure_world(fa, "space-journey", prompt=False)
    assert not fa.deactivated


def test_ensure_world_switches_when_confirmed(monkeypatch, fake_admin):
    monkeypatch.setattr(login, "_choose", lambda *a, **k: True)
    monkeypatch.setattr(login.time, "sleep", lambda *_: None)
    fa = fake_admin(True, "ardenhaven", users=2)
    login._ensure_world(fa, "space-journey", prompt=True)
    assert fa.deactivated and fa.launched == ["space-journey"]


def test_ensure_world_leaves_the_live_world_alone_when_declined(monkeypatch, fake_admin):
    monkeypatch.setattr(login, "_choose", lambda *a, **k: False)
    fa = fake_admin(True, "ardenhaven", users=2)
    with pytest.raises(RuntimeError, match="staying in"):
        login._ensure_world(fa, "space-journey", prompt=True)
    assert not fa.deactivated and not fa.launched


def test_ensure_world_launches_when_nothing_is_running(fake_admin):
    fa = fake_admin(False, None)
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


# ── vtt-login --host: which browser-facing names may receive a session ────────

@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "zz1.localhost", "ZZ12.Localhost", "a-b.localhost"])
def test_loopback_host_accepts_loopback_names(host):
    assert login.loopback_host(host) == host.lower()


@pytest.mark.parametrize("host", ["example.com", "localhost.example.com", "zz1.localhost.evil.com",
                                  "a.b.localhost", "-x.localhost", ".localhost", "10.0.0.5", ""])
def test_loopback_host_refuses_anything_that_can_leave_the_machine(host):
    with pytest.raises(ValueError):
        login.loopback_host(host)


def test_cli_accepts_a_localhost_label_and_rejects_a_real_host():
    assert cli.build_parser().parse_args(["login", "--host", "zz3.localhost"]).host == "zz3.localhost"
    with pytest.raises(SystemExit):
        cli.build_parser().parse_args(["login", "--host", "example.com"])


def test_a_localhost_label_binds_the_handoff_to_ipv4_loopback():
    assert login._bind_address("zz1.localhost") == "127.0.0.1"
    assert login._bind_address("127.0.0.1") == "127.0.0.1"
    assert login._bind_address("localhost") == "localhost"


def test_handoff_on_a_localhost_label_sets_the_cookie_for_that_name(monkeypatch):
    """The whole hop, minus Foundry: the ticket URL names the label, a request to it gets the
    cookie and a redirect into that label's /game. No session is real; nothing is opened."""
    import threading
    import urllib.request

    seen = {}
    monkeypatch.setattr(login, "_say", lambda msg: seen.setdefault("url", msg.split()[-1]))
    monkeypatch.setattr(login, "HANDOFF_TIMEOUT", 10.0)
    result = {}
    th = threading.Thread(target=lambda: result.setdefault(
        "ok", login._handoff("fake-session", "zz9.localhost", "http://zz9.localhost:30000/game", False)))
    th.start()
    for _ in range(100):
        if "url" in seen:
            break
        time.sleep(0.05)
    url = seen["url"]
    assert url.startswith("http://zz9.localhost:")

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    # resolve the label the way the browser does (always loopback), without trusting the OS
    req = urllib.request.Request(url.replace("zz9.localhost", "127.0.0.1"), headers={"Host": url.split("/")[2]})
    try:
        urllib.request.build_opener(NoRedirect).open(req, timeout=5)
        raise AssertionError("expected a 302")
    except urllib.error.HTTPError as exc:
        assert exc.code == 302
        assert exc.headers["Location"] == "http://zz9.localhost:30000/game"
        assert exc.headers["Set-Cookie"].startswith("session=fake-session;")
    th.join(5)
    assert result.get("ok") is True


# ── pipeline.stage(): the importer install, characterised (python-tooling-53) ──

@pytest.fixture
def staged_paths(monkeypatch, tmp_path):
    """Every path stage() touches, under tmp_path. Never Foundry's real Data/."""
    src = tmp_path / "repo/foundry/module/pentaryn-importer"
    (src / "sub").mkdir(parents=True)
    (src / "module.json").write_text('{"id": "pentaryn-importer"}')
    (src / "sub/a.mjs").write_text("export const a = 1;\n")
    actors = tmp_path / "repo/foundry/build/actors.json"
    actors.parent.mkdir(parents=True)
    actors.write_text('{"actors": []}')
    world = tmp_path / "Data/worlds/zz-world"
    world.mkdir(parents=True)
    spec = cfg.ModuleSpec("pentaryn-importer", check="parse")
    monkeypatch.setattr(cfg, "MODULE_SRC_ROOT", src.parent)
    monkeypatch.setattr(cfg, "FOUNDRY_DATA_DIR", tmp_path / "Data")
    monkeypatch.setattr(cfg, "FOUNDRY_MODULES", tmp_path / "Data/modules")
    monkeypatch.setattr(cfg, "WORLDS_DIR", tmp_path / "Data/worlds")   # known_worlds() lists this on a refusal
    monkeypatch.setitem(cfg.MODULES, "importer", spec)
    monkeypatch.setattr(cfg, "ACTORS_JSON", actors)
    monkeypatch.setattr(cfg, "ACTORS_STAGED", world / "actors.json")
    monkeypatch.setattr(cfg, "WORLD_DIR", world)
    monkeypatch.setattr(cfg, "WORLD_NAME", "zz-world")
    monkeypatch.setattr(pipeline, "build_actors", lambda: 0)
    return spec, world


def test_stage_installs_the_importer_and_stages_actors(staged_paths, capsys):
    import filecmp
    spec, world = staged_paths
    spec.dst.mkdir(parents=True)
    (spec.dst / "stale.mjs").write_text("old")            # replaced, not merged
    assert pipeline.stage() == 0
    # the sync stamp is the one file the copy adds (python-tooling-10); everything else is the repo's
    cmp = filecmp.dircmp(spec.src, spec.dst, ignore=[modules.SYNC_STAMP])
    assert not (cmp.left_only or cmp.right_only or cmp.diff_files)
    assert not filecmp.dircmp(spec.src / "sub", spec.dst / "sub").diff_files
    assert (world / "actors.json").read_text() == '{"actors": []}'
    assert "target world: zz-world" in capsys.readouterr().out


def test_stage_refuses_a_missing_world_and_leaves_dst_alone(staged_paths, monkeypatch, tmp_path):
    spec, _ = staged_paths
    monkeypatch.setattr(cfg, "WORLD_DIR", tmp_path / "Data/worlds/typo")
    spec.dst.mkdir(parents=True)
    (spec.dst / "keep.mjs").write_text("live")
    assert pipeline.stage() == 1
    assert (spec.dst / "keep.mjs").read_text() == "live"


@pytest.mark.repo
def test_ties_suite_is_gated():
    """python-tooling-7: `make foundry-ties-check` runs ties' own suite."""
    spec = cfg.MODULES["ties"]
    assert "node-test" in spec.check
    assert (spec.src / "test/run.mjs").is_file()


@pytest.mark.repo
def test_the_fork_has_a_use_doc_and_routes_to_it():
    """mcp-fork-19: a use-doc for the MCP fork exists, opens with its bail-out line, and both
    routing tables point at it."""
    doc = cfg.REPO_ROOT / "context/foundry/mcp-fork.md"
    head = doc.read_text(encoding="utf-8").splitlines()[:15]
    assert any("**Read this when:**" in line for line in head)
    for index in ("CLAUDE.md", "context/foundry/README.md"):
        assert "mcp-fork.md" in (cfg.REPO_ROOT / index).read_text(encoding="utf-8"), index


# ── a corrupt tunnel pidfile never names a process group ──────────────────────
# os.kill(0, sig) signals our own process group and os.kill(-1, sig) every process the
# user owns, so a pidfile holding 0 or a negative number must read as "no tunnel".

@pytest.mark.parametrize("content", ["0", "-1"])
def test_tunnel_pid_rejects_non_positive_pids(monkeypatch, tmp_path, capsys, content):
    pidfile = tmp_path / "cf.pid"
    pidfile.write_text(content)
    monkeypatch.setattr(cfg, "CF_PID", pidfile)
    calls = []
    monkeypatch.setattr(service.os, "kill", lambda pid, sig: calls.append((pid, sig)))

    assert service._tunnel_pid() is None
    assert service.tunnel_down() == 0
    assert "tunnel already down" in capsys.readouterr().out
    assert not [c for c in calls if c[0] <= 0]
    assert not [c for c in calls if c[1] == 15]
