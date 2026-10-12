"""The wave-4 live goldens (scripts/foundry/live-goldens/{riders,aoe,combat,transform}.js) are
eval-js bodies that only ever run in a live GM tab. This runs each one in node against a bare stub
world, so the paths that need no Foundry are proven before the gated live phase
(context/plans/addon-blueprint-2026-10/wave-4-live-plan.md): the body parses as an async function,
returns a JSON *string*, reports a missing namespace as `golden.shared.error` instead of throwing,
skips (rather than writes) when its precondition fails, and leaves the toast spy and the scratch
counts clean in `cleanup`."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

GOLDENS = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"

HARNESS = r"""
const src = (await import("node:fs/promises")).readFile(process.argv[1], "utf8");
const scenario = process.argv[2];
const ns = JSON.parse(process.argv[3]);
const list = (xs = []) => Object.assign([...xs], { contents: [...xs], get: id => xs.find(x => x.id === id) });
const handle = { id: "handleActor0000", name: "Area handle", flags: { "pentaryn-aoe": { handleActor: true } }, getFlag: () => null };
const actors = list(scenario === "no-handle" ? [] : [handle]);
const notifications = { info() {}, warn() {}, error() {} };
const original = { ...notifications };
globalThis.ui = { notifications };
globalThis.CONFIG = { queries: {} };
globalThis.foundry = { utils: { randomID: () => "zzRandom00000000" } };
globalThis.game = {
  world: { id: "zz-stub" }, version: "14.369", system: { id: "dnd5e", version: "6.0.6" },
  modules: new Map(), users: Object.assign(list([]), { activeGM: { isSelf: scenario !== "not-gm" } }),
  actors, scenes: list([]), messages: list([]),
  combats: list(scenario === "combat-started" ? [{ started: true }] : []),
  settings: { settings: new Map(), get: () => { throw new Error("unregistered"); } },
  user: { flags: {}, isGM: true }, i18n: { localize: k => k }, pentaryn: ns
};
const body = await src;
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
const ret = await fn();
console.log(JSON.stringify({ type: typeof ret, out: JSON.parse(ret),
  spyRestored: ["info", "warn", "error"].every(k => ui.notifications[k] === original[k]) }));
"""


def run(module, scenario="missing", ns=None):
    node = shutil.which("node")
    if not node:
        pytest.skip("node not on PATH")
    proc = subprocess.run([node, "--input-type=module", "-e", HARNESS, str(GOLDENS / f"{module}.js"), scenario, json.dumps(ns or {})],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


@pytest.mark.parametrize("module,label", [("riders", "riders"), ("aoe", "aoe"), ("combat", "combat"), ("transform", "transform")])
def test_a_missing_namespace_is_reported_not_thrown(module, label):
    r = run(module)
    assert r["type"] == "string"
    out = r["out"]
    assert out["module"] == label
    assert set(out["golden"]) == {"shared", "declared"}
    assert f"game.pentaryn.{label} is missing" in out["golden"]["shared"]["error"]["message"]
    assert r["spyRestored"] is True
    assert all(v == 0 for k, v in out["cleanup"].items() if k.endswith("Left")), out["cleanup"]
    assert all(v is True for k, v in out["cleanup"].items() if k.endswith("Restored")), out["cleanup"]


def test_aoe_skips_without_the_handle_actor():
    out = run("aoe", "no-handle", {"aoe": {}})["out"]
    assert out["skipped"] == "the world has no pentaryn-aoe handle actor"
    assert "error" not in out["golden"]["shared"]


def test_aoe_skips_when_this_tab_is_not_the_active_gm():
    out = run("aoe", "not-gm", {"aoe": {}})["out"]
    assert out["skipped"] == "this tab is not the active GM"


def test_combat_skips_while_a_combat_is_running():
    out = run("combat", "combat-started", {"combat": {}})["out"]
    assert out["env"]["startedCombats"] == 1
    assert out["skipped"].startswith("a combat is running")
    assert "error" not in out["golden"]["shared"]
