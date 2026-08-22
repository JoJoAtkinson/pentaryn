"""Tests for the Foundry ops commands lifted out of the Makefile.

The point of moving this logic into Python was that it could be tested. The
guarantees worth pinning down are the safety ones: a staged `actors.json` sits in a
directory served publicly with no auth, so every exit path must delete it, and the
verification must refuse to pass on anything except a positive 404.
"""

from __future__ import annotations

import signal
import sys

import pytest

from scripts.foundry.ops import cli, modules, pipeline
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

    for name in names:
        argv = [name]
        if name in ("module-check", "module-sync"):
            argv.append("ties")
        assert cli.main(argv) == 0, f"{name} did not route"


def test_unknown_subcommand_exits_nonzero():
    with pytest.raises(SystemExit) as exc:
        cli.main(["no-such-command"])
    assert exc.value.code != 0


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
