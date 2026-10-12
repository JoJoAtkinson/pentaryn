"""Shared fixtures for scripts/tests (python-tooling-34).

Four things live here, and only these:

* ``fake_admin`` — a factory for a stand-in ``FoundryAdmin``. Test files used to define
  their own (``_FakeAdmin`` in test_foundry_ops, ``FakeFA`` in test_update_crash, an
  inline ``FA`` in test_update_escalation); they migrate here one file at a time, so a
  shared fake never silently gets more permissive than the test that used it.
* the ``repo`` marker (registered in pyproject.toml) — a test that reads live repo state
  (the real adjustments registry, the real module tree, automation scripts) rather than
  a tmp fixture. ``pytest -m 'not repo'`` is the suite that must pass on a partial
  checkout or a frozen snapshot.
* ``_isolate_ops_log`` (autouse) — every module install appends to
  ``foundry/logs/ops-YYYY-MM.jsonl`` (python-tooling-10). No test may write there, so the log
  folder is a tmp folder for every test, and ``$PENTARYN_OPS_LOG`` is unset.
* ``fake_cloud`` / ``fake_data`` (autouse) — the cloud is a temp folder and Foundry's data
  root a tiny temp tree, and the host is the primary ``testhost``; see the section at the
  bottom (rclone-two-hosts-2026-10 §10).
* ``_isolate_foundry_data`` (autouse) — the paths that were resolved at *import* time
  (``ops.config``'s Data/, modules and worlds dirs; ``update.admin``'s data root and its
  dirs, and the ``inventory``/``recover`` copies of them; the feedback default dir) are re-pointed into ``fake_data`` for every test, so no
  test reaches ~/Library/Application Support/FoundryVTT by default (W4L follow-up).
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest


@dataclass
class FakeStatus:
    """What ``FoundryAdmin.status()`` reports: is a world active, which, how many users."""

    active: bool
    world: str | None
    users: int = 0


class FakeAdmin:
    """The world-lifecycle half of ``FoundryAdmin`` that ``ops.login`` drives.

    Records what it was asked to do; never touches the network."""

    def __init__(self, status: FakeStatus):
        self._status = status
        self.launched: list[str] = []
        self.deactivated = False

    def status(self) -> FakeStatus:
        return self._status

    def deactivate_world(self) -> bool:
        self.deactivated = True
        return True

    def launch_world(self, world: str) -> None:
        self.launched.append(world)

    def wait_for_world(self, world: str, timeout: float = 0) -> None:
        pass


@pytest.fixture
def fake_admin():
    """``fake_admin(active, world, users=0)`` → a :class:`FakeAdmin` in that state."""

    def make(active: bool, world: str | None, users: int = 0) -> FakeAdmin:
        return FakeAdmin(FakeStatus(active, world, users))

    return make


@pytest.fixture(autouse=True)
def _isolate_ops_log(monkeypatch, tmp_path_factory):
    from scripts.foundry.ops import config as cfg

    monkeypatch.setattr(cfg, "OPS_LOG_DIR", tmp_path_factory.mktemp("ops-log"))
    monkeypatch.delenv("PENTARYN_OPS_LOG", raising=False)


# ── two hosts, one cloud (context/plans/rclone-two-hosts-2026-10.md §10) ──────
#
# Every test runs with a temp folder as the cloud and a temp Foundry data root, as the
# primary host `testhost`, with the real ~/.config/pentaryn/env out of reach. Nothing in
# the suite can reach OneDrive, rclone, or Foundry's real data, even by accident.

_HOST_ENV_KEYS = ("PENTARYN_HOST", "PENTARYN_PRIMARY_HOST", "PENTARYN_ROLE_OVERRIDE",
                  "FOUNDRY_DATA", "FOUNDRY_PORT", "PENTARYN_CLOUD", "PENTARYN_RCLONE",
                  "PENTARYN_KEEP_SNAPSHOTS", "PENTARYN_START_CMD", "PENTARYN_STOP_CMD",
                  "PENTARYN_BOOT_STATE", "PENTARYN_BOOT_DONE", "PENTARYN_NONINTERACTIVE",
                  "FROM")


def make_data_root(root):
    """A tiny Foundry data root: one world, one module, a Config with a dataPath."""
    import json as _json
    (root / "Data/worlds/w").mkdir(parents=True, exist_ok=True)
    (root / "Data/worlds/w/world.json").write_text('{"id": "w"}\n')
    (root / "Data/modules/m").mkdir(parents=True, exist_ok=True)
    (root / "Data/modules/m/module.json").write_text('{"id": "m"}\n')
    (root / "Config").mkdir(parents=True, exist_ok=True)
    (root / "Config/options.json").write_text(
        _json.dumps({"dataPath": str(root), "port": 30000}) + "\n")
    return root


@pytest.fixture
def fake_rclone(fake_cloud):
    """A `FakeRclone` runner over the fake cloud folder (remote `fake:`); see cloud_fakes."""
    from cloud_fakes import FakeRclone
    return FakeRclone(fake_cloud)


@pytest.fixture(autouse=True)
def fake_cloud(monkeypatch, tmp_path_factory):
    """`PENTARYN_CLOUD` → a temp folder with the cloud subfolders; host env isolated."""
    from scripts.foundry import storage

    base = tmp_path_factory.mktemp("cloud")
    for sub in storage.SUBFOLDERS:
        (base / sub).mkdir()
    for key in _HOST_ENV_KEYS:
        # setenv first so monkeypatch records the original and restores it — code under
        # test (service.up) sets some of these in os.environ directly.
        monkeypatch.setenv(key, "")
        monkeypatch.delenv(key)
    monkeypatch.setenv("PENTARYN_ENV_FILE", str(base / "no-such-env-file"))
    monkeypatch.setenv("PENTARYN_CLOUD", str(base))
    monkeypatch.setenv("PENTARYN_HOST", "testhost")
    monkeypatch.setenv("PENTARYN_PRIMARY_HOST", "testhost")
    storage.reset()
    yield base
    storage.reset()


@pytest.fixture(autouse=True)
def fake_data(monkeypatch, tmp_path_factory, fake_cloud):
    """`FOUNDRY_DATA` → a tiny temp data root; the based-on state file lives under it."""
    from scripts.foundry import host as host_mod
    # No Foundry process unless a test says: cloud.foundry_live() asks pgrep, and the Mac
    # running the suite may well have Foundry open.
    monkeypatch.setattr(host_mod, "pid", lambda: None)
    root = make_data_root(tmp_path_factory.mktemp("foundry-data"))
    monkeypatch.setenv("FOUNDRY_DATA", str(root))
    monkeypatch.setenv("PENTARYN_BOOT_STATE", str(root / "pentaryn-boot.json"))
    return root


@pytest.fixture(autouse=True)
def _isolate_foundry_data(monkeypatch, fake_data):
    """Re-point every import-time Foundry path into the temp data root.

    ``FOUNDRY_DATA`` in the env (``fake_data``) only reaches code that asks ``host`` at call
    time. ``ops.config``, ``update.admin`` and ``feedback_reports`` resolve their paths once,
    at import, before any fixture runs — so without this they name the real Foundry folder.
    A test that needs other paths still sets them itself; this is only the default."""
    from scripts import feedback_reports
    from scripts.foundry.ops import config as cfg
    from scripts.foundry.update import admin

    data = fake_data / "Data"
    monkeypatch.setattr(cfg, "FOUNDRY_DATA_DIR", data)
    monkeypatch.setattr(cfg, "FOUNDRY_MODULES", data / "modules")
    monkeypatch.setattr(cfg, "WORLDS_DIR", data / "worlds")
    monkeypatch.setattr(cfg, "WORLD_DIR", data / "worlds" / cfg.WORLD_NAME)
    monkeypatch.setattr(cfg, "ACTORS_STAGED", data / "worlds" / cfg.WORLD_NAME / "actors.json")

    monkeypatch.setattr(admin, "FOUNDRY_DATA", fake_data)
    monkeypatch.setattr(admin, "DATA", data)
    for name, sub in (("MODULES_DIR", "modules"), ("SYSTEMS_DIR", "systems"), ("WORLDS_DIR", "worlds"),
                      ("BACKUPS_DIR", "Backups")):
        monkeypatch.setattr(admin, name, data / sub)
    monkeypatch.setattr(admin, "SNAPSHOTS_DIR", data / "Backups" / "snapshots")
    monkeypatch.setattr(admin, "LOGS_DIR", fake_data / "Logs")
    monkeypatch.setattr(admin, "OPTIONS_JSON", fake_data / "Config/options.json")
    package_dir = {"module": data / "modules", "system": data / "systems", "world": data / "worlds"}
    monkeypatch.setattr(admin, "PACKAGE_DIR", package_dir)
    # the updater modules that copied admin's constants by name at import
    from scripts.foundry.update import inventory, recover
    monkeypatch.setattr(inventory, "MODULES_DIR", data / "modules")
    monkeypatch.setattr(inventory, "SYSTEMS_DIR", data / "systems")
    monkeypatch.setattr(inventory, "PACKAGE_DIR", package_dir)
    monkeypatch.setattr(recover, "FOUNDRY_DATA", fake_data)

    monkeypatch.setattr(feedback_reports, "FOUNDRY_DATA_DIR", data)
    monkeypatch.setattr(feedback_reports, "_DEFAULT_DIR", data / "pentaryn-feedback")
    return fake_data


class TwoHosts:
    """Two machines — `mac` (primary) and `boss` (alt) — sharing one fake cloud.

    `with hosts.use("boss"):` swaps FOUNDRY_DATA, PENTARYN_HOST, the state file and the app
    root (its core version) for the block. Foundry is never "running" unless a test says."""

    def __init__(self, monkeypatch, tmp_path_factory, cloud):
        import os as _os
        self._env = _os.environ
        self.cloud = cloud
        self.data, self.apps, self.core = {}, {}, {}
        for name in ("mac", "boss"):
            self.data[name] = make_data_root(tmp_path_factory.mktemp(f"data-{name}"))
            self.apps[name] = tmp_path_factory.mktemp(f"app-{name}")
            self.set_core(name, "14.369")
        for key in ("FOUNDRY_DATA", "PENTARYN_HOST", "PENTARYN_BOOT_STATE", "FOUNDRY_APP_ROOT"):
            monkeypatch.setenv(key, self._env.get(key, ""))
        monkeypatch.setenv("PENTARYN_PRIMARY_HOST", "mac")
        self._activate("mac")

    def set_core(self, name: str, version: str) -> None:
        import json as _json
        gen, build = version.split(".")
        (self.apps[name] / "package.json").write_text(_json.dumps(
            {"version": f"{version}.0", "release": {"generation": int(gen), "build": int(build)}}))
        self.core[name] = version

    def state_file(self, name: str):
        return self.data[name] / "pentaryn-boot.json"

    def _activate(self, name: str) -> None:
        self._env["FOUNDRY_DATA"] = str(self.data[name])
        self._env["PENTARYN_HOST"] = name
        self._env["PENTARYN_BOOT_STATE"] = str(self.state_file(name))
        self._env["FOUNDRY_APP_ROOT"] = str(self.apps[name])
        self.current = name

    def use(self, name: str):
        import contextlib

        @contextlib.contextmanager
        def block():
            prev = self.current
            self._activate(name)
            try:
                yield self.data[name]
            finally:
                self._activate(prev)
        return block()


@pytest.fixture
def two_hosts(monkeypatch, tmp_path_factory, fake_cloud):
    from scripts.foundry import host as host_mod
    monkeypatch.setattr(host_mod, "is_running", lambda port=None: False)
    # `mac` is refused as PENTARYN_HOST off macOS; the suite must also pass on BOSS.
    monkeypatch.setattr(host_mod, "system", lambda: "Darwin")
    return TwoHosts(monkeypatch, tmp_path_factory, fake_cloud)


@pytest.fixture
def tty(monkeypatch):
    """`tty(interactive, answers)` — the boot prompt's terminal: isatty and input()."""
    def make(interactive: bool, answers: list[str] | None = None):
        from scripts.foundry import boot
        queue = list(answers or [])
        asked: list[str] = []

        def fake_input(prompt=""):
            asked.append(prompt)
            if not queue:
                raise EOFError
            ans = queue.pop(0)
            if ans is KeyboardInterrupt:
                raise KeyboardInterrupt
            return ans

        monkeypatch.setattr(boot, "_isatty", lambda: interactive)
        monkeypatch.setattr("builtins.input", fake_input)
        return asked
    return make
