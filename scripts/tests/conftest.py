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
    """`PENTARYN_CLOUD` → a temp folder with the four subfolders; host env isolated."""
    from scripts.foundry import storage

    base = tmp_path_factory.mktemp("cloud")
    for sub in storage.SUBFOLDERS:
        (base / sub).mkdir()
    for key in _HOST_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
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
    root = make_data_root(tmp_path_factory.mktemp("foundry-data"))
    monkeypatch.setenv("FOUNDRY_DATA", str(root))
    monkeypatch.setenv("PENTARYN_BOOT_STATE", str(root / "pentaryn-boot.json"))
    return root


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
