"""LG-E6: an empty attribute registry or a missing `mid` prompt marker skips, never stores a TypeError.

ties.js picked the first registry entry and went on to create the ZZ actor and read `entry.title`
even when the registry was empty; prompts.js created the ZZ scene and actor and then read `[1]` of
`status.markers.find(...)` when the world had no `mid` marker. Both stored a TypeError in
`golden.error` instead of saying why the run could not exercise anything. Each now sets
`out.skipped` and returns before creating a scratch document. Run in node offline with a GM-tab
stub whose document creates are counted and must stay 0.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

GOLDENS = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"

HARNESS = r"""
const [path] = process.argv.slice(1);
const body = await (await import("node:fs/promises")).readFile(path, "utf8");
const creates = [];
const settings = { lastCalls: [], gatherChars: 400, cropsDefault: false, unseenWithinFt: 0, party: [] };
globalThis.foundry = { utils: { deepClone: v => structuredClone(v), getRoute: p => `/${p}` } };
globalThis.game = {
  pentaryn: {
    ties: { known: {}, study: { audit: {} }, attributes: { list: () => [] } },
    prompts: { status: () => ({ markers: [["small", "mSmall"], ["large", "mLarge"]] }) }
  },
  modules: new Map(), user: { id: "gm", isGM: true }, world: { id: "zz-stub" }, version: "14.369",
  system: { id: "dnd5e", version: "6.0.6" },
  settings: { get: (ns, key) => settings[key], set: async (ns, key, v) => { settings[key] = v; } },
  scenes: { get: () => null, filter: () => [] }, actors: { get: () => null, filter: () => [] }
};
globalThis.Scene = { create: async () => { creates.push("Scene.create"); return null; } };
globalThis.Actor = { create: async () => { creates.push("Actor.create"); return null; } };
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
let ret, rejected = null;
try { ret = await fn(); } catch (e) { rejected = String(e?.message ?? e); }
console.log(JSON.stringify({ rejected, type: typeof ret, out: typeof ret === "string" ? JSON.parse(ret) : null, creates }));
"""


def run(stem):
    exe = shutil.which("node")
    if not exe:
        pytest.skip("node not on PATH")
    proc = subprocess.run([exe, "--input-type=module", "-e", HARNESS, str(GOLDENS / f"{stem}.js")],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


@pytest.mark.parametrize("stem,reason", [
    ("ties", "attribute registry is empty"),
    ("prompts", "no mid prompt marker in this world"),
])
def test_lg_e6_empty_world_skips_before_creating(stem, reason):
    r = run(stem)
    assert r["rejected"] is None, f"LG-E6: {stem}.js rejected: {r['rejected']}"
    assert r["type"] == "string"
    out = r["out"]
    assert out["module"] == stem
    assert "error" not in out.get("golden", {}), f"LG-E6: {stem}.js stored {out['golden']['error']}"
    assert out.get("skipped") == reason
    assert r["creates"] == [], f"LG-E6: {stem}.js created scratch docs before skipping: {r['creates']}"
