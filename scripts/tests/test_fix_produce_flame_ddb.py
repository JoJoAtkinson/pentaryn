"""Feedback DsekWh / JEssbJ: the ddb-importer Produce Flame tidy-up
(scripts/foundry/fixes/2026-10-19-produce-flame-ddb.js).

Marwen's D&D Beyond copy of Produce Flame has "Attack" + "Light Effect" (a utility applying a
token.light.* ActiveEffect); Marrith's PHB copy has "Cast" + "Hurl Fire". The script renames the
D&D Beyond activities to the PHB's and drops the light-only effect. It is an eval-js body; here it
runs in node against stub actors shaped like the live ones (read-only dump, 2026-10-19)."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "scripts/foundry/fixes/2026-10-19-produce-flame-ddb.js"

RUN = r"""
const [bodyPath, apply] = process.argv.slice(1);
let body = (await import("node:fs")).readFileSync(bodyPath, "utf8");
if (apply === "1") body = body.replace("const APPLY = false;", "const APPLY = true;");
const writes = [];
function item(id, name, identifier, acts, effects = []) {
  const activities = new Map(acts.map(a => [a.id, a]));
  const eff = new Map(effects.map(e => [e.id, e]));
  const it = { id, name, type: "spell", system: { identifier, activities }, effects: eff };
  it.update = async u => {
    writes.push(["update", id, u]);
    for (const [k, v] of Object.entries(u)) {
      const [, , aid, field] = k.split(".");
      activities.get(aid)[field] = v;
    }
  };
  it.deleteEmbeddedDocuments = async (t, ids) => { writes.push(["delete", id, t, ids]); for (const i of ids) eff.delete(i); };
  return it;
}
const light = { id: "znJ22WZJRRlOc2M9", name: "Produce Flame", transfer: false,
  system: { changes: [{ key: "token.light.dim", value: 40 }, { key: "token.light.bright", value: 20 }] } };
const marwen = { id: "46AKGxU7z39hOZ7b", name: "Marwen Ashcroft", items: [
  item("ddbProduFlame124", "Produce Flame", "produce-flame", [
    { id: "attackProduFlame", type: "attack", name: "Attack", effects: [] },
    { id: "addLightEffect1I", type: "utility", name: "Light Effect", effects: [{ _id: light.id }] },
  ], [light]),
  item("fireBolt", "Fire Bolt", "fire-bolt", [{ id: "a", type: "attack", name: "Attack", effects: [] }]),
] };
const marrith = { id: "RNDTDBlFXxZ7Uc8i", name: "Marrith Ashcroft", items: [
  item("I5UH9dhhWml9rVMW", "Produce Flame", "produce-flame", [
    { id: "MModRd17Oi6hhztj", type: "utility", name: "Cast", effects: [] },
    { id: "tqKlIEdglRYdqHrp", type: "attack", name: "Hurl Fire", effects: [] },
  ]),
] };
const all = [marwen, marrith];
globalThis.game = { actors: Object.assign(all, { get: id => all.find(a => a.id === id) }) };
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
const first = JSON.parse(await fn());
const second = JSON.parse(await fn());
console.log(JSON.stringify({ first, second, writes }));
"""


def run(apply: bool) -> dict:
    node = shutil.which("node")
    if not node:
        pytest.skip("node not installed")
    res = subprocess.run([node, "--input-type=module", "-e", RUN, str(FIX), "1" if apply else "0"],
                         capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def test_dry_run_plans_and_writes_nothing():
    out = run(apply=False)
    assert out["writes"] == []
    items = out["first"]["items"]
    assert [(i["actor"], i["item"]) for i in items] == [("Marwen Ashcroft", "ddbProduFlame124")]
    plan = items[0]
    assert {(r["from"], r["to"]) for r in plan["rename"]} == {("Attack", "Hurl Fire"), ("Light Effect", "Cast")}
    assert plan["deleteEffects"] == ["znJ22WZJRRlOc2M9"]
    assert out["second"]["items"] == items, "a dry run changes nothing, so it plans the same again"


def test_apply_renames_unlinks_and_is_idempotent():
    out = run(apply=True)
    kinds = [w[0] for w in out["writes"]]
    assert kinds == ["update", "delete"]
    update = out["writes"][0][2]
    assert update == {
        "system.activities.attackProduFlame.name": "Hurl Fire",
        "system.activities.addLightEffect1I.name": "Cast",
        "system.activities.addLightEffect1I.effects": [],
    }
    assert out["writes"][1][3] == ["znJ22WZJRRlOc2M9"]
    assert out["first"]["errors"] == []
    assert out["second"]["items"] == [], "the second run finds nothing left"
