"""LG-R4: a live golden whose module API is missing returns JSON with `skipped`, never rejects.

cursors.js, pings.js and prompts.js read `game.pentaryn.<m>` (and the module's settings) before
their try/finally: with the module disabled the body used to throw (cursors from `finally`, where
`read()` called `API.current()`; pings and prompts from the setting read at the top), the eval
rejected and `golden.error` was lost. Each now takes the same early skip walls.js and senses.js
use — `out.skipped = "pentaryn-<m> API is missing"` — before any write. Run in node offline with a
GM-tab stub whose world writes, control switches and setting writes are counted and must stay 0.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

GOLDENS = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"

HARNESS = r"""
const [path, mode] = process.argv.slice(1);
const body = await (await import("node:fs/promises")).readFile(path, "utf8");
const writes = [];
const unregistered = (ns, key) => { throw new Error(`"${ns}.${key}" is not a registered game setting`); };
globalThis.foundry = { utils: { deepClone: v => structuredClone(v), getRoute: p => `/${p}` } };
globalThis.game = {
  pentaryn: mode === "no-namespace" ? undefined : {},
  modules: new Map(), user: { id: "gm" }, world: { id: "zz-stub" }, version: "14.369",
  system: { id: "dnd5e", version: "6.0.6" },
  settings: { get: unregistered, set: async (ns, key) => { writes.push(`settings.set ${ns}.${key}`); } },
  scenes: { get: () => null, filter: () => [] }, actors: { get: () => null, filter: () => [] }
};
globalThis.Scene = { create: async () => { writes.push("Scene.create"); return null; } };
globalThis.Actor = { create: async () => { writes.push("Actor.create"); return null; } };
globalThis.ui = { controls: { control: { name: "tokens" }, tool: { name: "select" },
  activate: async () => { writes.push("ui.controls.activate"); } } };
globalThis.canvas = { controls: { handlePing: () => { writes.push("handlePing"); } }, app: null };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
globalThis.document = { documentElement: {} };
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
let ret, rejected = null;
try { ret = await fn(); } catch (e) { rejected = String(e?.message ?? e); }
console.log(JSON.stringify({ rejected, type: typeof ret, out: typeof ret === "string" ? JSON.parse(ret) : null, writes }));
"""


def run(stem, mode):
    exe = shutil.which("node")
    if not exe:
        pytest.skip("node not on PATH")
    proc = subprocess.run([exe, "--input-type=module", "-e", HARNESS, str(GOLDENS / f"{stem}.js"), mode],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


@pytest.mark.parametrize("mode", ["no-namespace", "no-module-api"])
@pytest.mark.parametrize("stem", ["cursors", "pings", "prompts"])
def test_lg_r4_missing_api_skips_with_json(stem, mode):
    r = run(stem, mode)
    assert r["rejected"] is None, f"LG-R4: {stem}.js rejected: {r['rejected']}"
    assert r["type"] == "string"
    assert r["out"]["module"] == stem
    assert r["out"]["skipped"] == f"pentaryn-{stem} API is missing"
    assert r["writes"] == [], f"LG-R4: {stem}.js wrote before skipping: {r['writes']}"
