"""Feedback tiDvFa: the ddb-importer PC clean-up (scripts/foundry/fixes/2026-10-19-ddb-pc-cleanup.js).

Marwen's D&D Beyond transfer typed her robes and field notes as consumable trinkets and filed her
feat 1/day free casts (False Life, Invisibility, Speak with Animals) under spellcasting method
`atwill`, so dnd5e 6 listed them as At-Will. The fix script is an eval-js body; here it runs in node
against a stub actor shaped like hers (from a read-only dump of the live actor, 2026-10-19)."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "scripts/foundry/fixes/2026-10-19-ddb-pc-cleanup.js"

RUN = r"""
const [bodyPath, apply, failUpdate] = process.argv.slice(1);
let body = (await import("node:fs")).readFileSync(bodyPath, "utf8");
if (apply === "1") body = body.replace("const APPLY = false;", "const APPLY = true;");
const writes = [];
const mk = (id, name, type, system, flags = {}) => ({ id, name, type, system, flags });
const items = new Map([
  mk("robe", "Robe", "consumable", { type: { value: "trinket" }, quantity: 1, weight: { value: 4 }, equipped: false, uses: { max: 1 } }),
  mk("witch", "Witch Robes", "consumable", { type: { value: "trinket" }, quantity: 1, equipped: true, description: { value: "<p>black</p>" } }),
  mk("notes", "Marwen's Field Notes", "consumable", { type: { value: "trinket" }, quantity: 1 }),
  mk("oil", "Oil", "consumable", { type: { value: "trinket" }, quantity: 3, container: "bp" }),
  mk("scroll", "Scroll of Sleep", "consumable", { type: { value: "scroll" }, container: "bp" }),
  mk("pscroll", "Scroll of Hold Person", "consumable", { type: { value: "scroll" }, container: "cp" }),
  mk("potion", "Potion of Cloak Shadows", "consumable", { type: { value: "potion" } }),
  mk("clothes", "Traveler's Clothes", "equipment", { type: { value: "clothing" } }),
  mk("bp", "Backpack", "container", {}),
  mk("cp", "Component Pouch", "container", {}),
  mk("fl1", "False Life", "spell", { level: 1, method: "atwill", sourceItem: "feat:shadow-touched", uses: { max: 1, recovery: [{ period: "lr" }] } }),
  mk("fl2", "False Life", "spell", { level: 1, method: "spell", sourceItem: "feat:shadow-touched", uses: { max: "" } }),
  mk("inv", "Invisibility", "spell", { level: 2, method: "atwill", sourceItem: "feat:shadow-touched", uses: { max: 1, recovery: [{ period: "lr" }] } }),
  mk("swa", "Speak with Animals", "spell", { level: 1, method: "atwill", sourceItem: "feat:magic-initiate-druid", uses: { max: 1, recovery: [{ period: "lr" }] } }),
  mk("hand", "Mage Hand", "spell", { level: 0, method: "atwill", sourceItem: "class:wizard", uses: { max: "" } }),
].map(i => [i.id, i]));
for (const it of items.values()) {
  it.toObject = () => JSON.parse(JSON.stringify({ _id: it.id, name: it.name, type: it.type, system: it.system, flags: it.flags }));
  it.update = async data => {
    if (failUpdate === "1") throw new Error("type change refused");
    writes.push(["update", it.id, data]); it.type = data.type; it.system = data["==system"];
  };
}
const actor = {
  id: "46AKGxU7z39hOZ7b", name: "Marwen Ashcroft", flags: { ddbimporter: {} },
  items: Object.assign([...items.values()], { get: id => items.get(id) }),
  async updateEmbeddedDocuments(_t, ups) {
    writes.push(["updateEmbedded", ups]);
    for (const u of ups) items.get(u._id).system.method = u["system.method"];
  },
  async deleteEmbeddedDocuments(_t, ids) { writes.push(["delete", ids]); },
  async createEmbeddedDocuments(_t, docs, opts) { writes.push(["create", docs.map(d => [d._id, d.type]), opts]); },
};
globalThis.game = { actors: { get: id => (id === actor.id ? actor : null), getName: n => (n === actor.name ? actor : null) } };
const fn = new (Object.getPrototypeOf(async function () {}).constructor)(body);
console.log(JSON.stringify({ out: JSON.parse(await fn()), writes }));
"""


def run(apply=False, fail_update=False):
    node = shutil.which("node")
    if not node:
        pytest.skip("node not installed")
    p = subprocess.run([node, "--input-type=module", "-e", RUN, str(FIX), "1" if apply else "0",
                        "1" if fail_update else "0"], capture_output=True, text=True, timeout=30)
    assert p.returncode == 0, p.stderr
    return json.loads(p.stdout)


def test_dry_run_plans_and_writes_nothing():
    r = run()
    out = r["out"]
    assert r["writes"] == []
    assert out["apply"] is False
    assert {(x["name"], x["to"]) for x in out["retype"]} == {
        ("Robe", "equipment/clothing"), ("Witch Robes", "equipment/clothing"),
        ("Marwen's Field Notes", "equipment/trinket")}
    # the three 1/day free casts, not the slot copy of False Life or the real at-will cantrip
    assert sorted(x["id"] for x in out["innate"]) == ["fl1", "inv", "swa"]
    assert all(x["uses"] == "1/lr" for x in out["innate"])
    # container contents are reported, never moved
    by = {c["name"]: c for c in out["containers"]}
    assert by["Backpack"]["count"] == 2 and by["Backpack"]["scrolls"] == ["Scroll of Sleep"]
    assert by["Component Pouch"]["scrolls"] == ["Scroll of Hold Person"]


def test_apply_retypes_keeping_fields_and_moves_spells_to_innate():
    r = run(apply=True)
    ups = [w for w in r["writes"] if w[0] == "update"]
    assert {w[1] for w in ups} == {"robe", "witch", "notes"}
    witch = next(w[2] for w in ups if w[1] == "witch")
    assert witch["type"] == "equipment"
    sysw = witch["==system"]
    assert sysw["type"] == {"value": "clothing", "baseItem": ""}
    assert sysw["equipped"] is True and sysw["description"] == {"value": "<p>black</p>"}
    robe = next(w[2] for w in ups if w[1] == "robe")["==system"]
    assert "uses" not in robe  # consumable-only fields are not carried over
    emb = [w for w in r["writes"] if w[0] == "updateEmbedded"]
    assert len(emb) == 1
    assert sorted(u["_id"] for u in emb[0][1]) == ["fl1", "inv", "swa"]
    assert all(u["system.method"] == "innate" for u in emb[0][1])
    assert r["out"]["errors"] == []


def test_fallback_recreates_under_same_id_when_type_change_refused():
    r = run(apply=True, fail_update=True)
    creates = [w for w in r["writes"] if w[0] == "create"]
    assert {c[1][0][0] for c in creates} == {"robe", "witch", "notes"}
    assert all(c[1][0][1] == "equipment" and c[2] == {"keepId": True} for c in creates)
    assert r["out"]["errors"] == []
