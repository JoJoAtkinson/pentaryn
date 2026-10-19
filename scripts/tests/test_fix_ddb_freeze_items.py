"""The DDB item freeze (scripts/foundry/fixes/2026-10-19-ddb-freeze-items.js).

A one-off homebrew item a DDB-corrections rule cannot fix (Bazgar's Axe of Resonant Provocation) is
fixed by hand and frozen with flags.ddbimporter.ignoreItemImport, the one flag ddb-importer 7.5.8's import
path honours (ignoreItemUpdate only stops the push back to D&D Beyond), so a re-sync skips it.
The script is an eval-js body; here it runs in node against a stub actor."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "scripts/foundry/fixes/2026-10-19-ddb-freeze-items.js"

RUN = r"""
const [bodyPath, apply, unfreeze, ddb, extra] = process.argv.slice(1);
let body = (await import("node:fs")).readFileSync(bodyPath, "utf8");
if (apply === "1") body = body.replace("const APPLY = false;", "const APPLY = true;");
if (unfreeze === "1") body = body.replace("const UNFREEZE = false;", "const UNFREEZE = true;");
const writes = [];
const items = [
  { id: "axe1", name: "Axe of Resonant Provocation", flags: { ddbimporter: { id: 1, ...(extra ? { [extra]: true } : {}) } } },
  { id: "rope", name: "Rope", flags: { ddbimporter: { id: 2 } } },
];
const actor = {
  id: "ep1NnwjAhSB74iP8", name: "Bazgar of the Dakmar'nak", flags: ddb === "1" ? { ddbimporter: {} } : {},
  items: Object.assign(items, { filter: f => Array.prototype.filter.call(items, f) }),
  async updateEmbeddedDocuments(_t, ups) {
    writes.push(ups);
    for (const u of ups) for (const [k, v] of Object.entries(u)) if (k !== "_id") items.find(i => i.id === u._id).flags.ddbimporter[k.split(".").pop()] = v;
  },
};
globalThis.game = { actors: { get: () => null, getName: n => (n === actor.name ? actor : null) } };
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
const first = JSON.parse(await fn());
const second = JSON.parse(await fn());
console.log(JSON.stringify({ first, second, writes }));
"""


def run(apply=False, unfreeze=False, ddb=True, extra=""):
    node = shutil.which("node")
    if not node:
        pytest.skip("node not installed")
    p = subprocess.run([node, "--input-type=module", "-e", RUN, str(FIX), "1" if apply else "0",
                        "1" if unfreeze else "0", "1" if ddb else "0", extra], capture_output=True, text=True, timeout=30)
    assert p.returncode == 0, p.stderr
    return json.loads(p.stdout)


def test_dry_run_plans_and_writes_nothing():
    r = run()
    assert r["writes"] == []
    assert r["first"]["change"] == ["Axe of Resonant Provocation (axe1)"]
    assert r["first"]["applied"] == []


def test_apply_freezes_once_then_reports_already():
    r = run(apply=True)
    assert r["writes"] == [[{"_id": "axe1", "flags.ddbimporter.ignoreItemImport": True}]]
    assert r["second"]["change"] == [] and r["second"]["already"] == ["Axe of Resonant Provocation (axe1)"]


def test_unfreeze_of_an_unfrozen_item_is_a_no_op():
    r = run(apply=True, unfreeze=True)
    assert r["writes"] == []
    assert r["first"]["already"] == ["Axe of Resonant Provocation (axe1)"]


def test_not_a_ddb_actor_writes_nothing():
    r = run(apply=True, ddb=False)
    assert r["writes"] == []
    assert r["first"]["errors"]


def test_ignore_item_update_alone_is_not_frozen():
    """An item carrying only ignoreItemUpdate (a Chris's Premades item) is not frozen: it is changed."""
    r = run(apply=True, extra="ignoreItemUpdate")
    assert r["writes"] == [[{"_id": "axe1", "flags.ddbimporter.ignoreItemImport": True}]]
