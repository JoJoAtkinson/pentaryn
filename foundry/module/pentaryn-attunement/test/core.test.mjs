// Core characterisation (guide step 1.4): one table per pure function, run against every entry of
// fixtures/impls.mjs (today the verbatim oracle; from step 2 also attunement-core.mjs). Results are
// compared with JSON.stringify where key order is part of the contract.
import { IMPLS } from "./fixtures/impls.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const same = (got, want, msg) => assert.equal(JSON.stringify(got), JSON.stringify(want), msg);

test("no Foundry globals are needed by the pure functions", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "Actor"]) assert.equal(globalThis[g], undefined, g);
});

for (const [label, M] of IMPLS) {
  test(`${label}: awayOf (items-journal-8)`, () => {
    same(M.awayOf({ getFlag: () => [{ key: "k" }, null, "x", { name: "n" }] }), [{ key: "k" }]);
    same(M.awayOf({ getFlag: () => "corrupt" }), []);
    same(M.awayOf(undefined), []);
    same(M.awayOf({}), []);
  });

  test(`${label}: bond decision (items-journal-9)`, () => {
    const B = { actor: "A", key: "k", name: "Cloak", equipped: true, attuned: true, attunement: "required" };
    same(M.bondChanges(B, { actorId: "A", awayKeys: ["k"], fallbackName: "x" }),
      { name: "Cloak", "system.attunement": "required", "system.attuned": true, "system.equipped": true });
    same(M.bondChanges(B, { actorId: "A", awayKeys: [], fallbackName: "x" }),
      { name: "Cloak", "system.attunement": "required", "system.equipped": true });
    same(M.bondChanges(B, { actorId: "Z", awayKeys: ["k"], fallbackName: "x" }), { name: "Cloak" });
    same(M.bondChanges({ ...B, name: undefined }, { actorId: "Z", awayKeys: [], fallbackName: "Cloak (Talo)" }), { name: "Cloak (Talo)" });
    same(M.bondChanges({ ...B, attunement: null, equipped: false }, { actorId: "A", awayKeys: ["k"], fallbackName: "x" }),
      { name: "Cloak", "system.attuned": true });
    same(M.bondChanges(null, { actorId: "A", awayKeys: ["k"] }), null);
  });

  test(`${label}: over-cap threshold (items-journal-12)`, () => {
    same(M.wouldExceed({ value: 2, max: 3, awayCount: 0 }), { exceed: false, after: 3 });
    same(M.wouldExceed({ value: 3, max: 3, awayCount: 0 }), { exceed: true, after: 4 });
    same(M.wouldExceed({ value: 2, max: 3, awayCount: 1 }), { exceed: true, after: 4 });
    same(M.wouldExceed({ value: 0, max: 0, awayCount: 0 }), { exceed: true, after: 1 });
  });

  test(`${label}: stash planning (items-journal-10)`, () => {
    let n = 0;
    const randomID = () => `r${++n}`;
    const setProperty = (obj, path, value) => {
      const parts = path.split(".");
      let o = obj;
      for (const p of parts.slice(0, -1)) o = o[p] ??= {};
      o[parts.at(-1)] = value;
    };
    class Items extends Map {
      filter(fn) { return [...this.values()].filter(fn); }
    }
    const item = (id, name, type, system, source) => ({
      id, name, img: "i", type, system, _source: source,
      toObject() { return { _id: id, name, type, img: "i", system: { ...structuredClone(source.system), container: "x", quantity: source.system.quantity ?? 1 } }; },
    });
    const owner = {
      name: "Talo Vesk", id: "A", uuid: "Actor.A", system: { currency: { gp: 5, sp: 0 }, attributes: { attunement: { max: 3 } } },
      items: new Items([
        ["c", item("c", "Cloak", "equipment", { attuned: true }, { name: "Cloak", system: { attuned: true, equipped: true, attunement: "required" } })],
        ["t1", item("t1", "Torch", "loot", {}, { name: "Torch", system: { quantity: 2 } })],
        ["t2", item("t2", "Torch", "loot", {}, { name: "Torch", system: { quantity: 3 } })],
      ]),
      getFlag: (m, k) => (k === "slots" ? ["c"] : []),
    };
    const owns = label === "oracle" ? "A" : "Actor.A";   // [declared] ATT-ROB-2: the core keys the bond on the uuid
    const plan = M.planStash(owner, ["c", "t1", "t2", "missing"], { randomID, setProperty });
    assert.equal(plan.creates[0].name, "Cloak (Talo)");
    assert.equal(plan.creates[0].system.attuned, false);
    assert.equal(plan.creates[0].system.equipped, false);
    assert.equal(plan.creates[0].system.container, undefined);
    same(plan.creates[0].flags["pentaryn-attunement"].bond,
      { actor: owns, key: "r1", name: "Cloak", equipped: true, attuned: true, attunement: "required" });
    assert.equal(plan.creates.length, 2, "the two torch stacks merge");
    assert.equal(plan.creates[1].name, "Torch (Talo)");
    assert.equal(plan.creates[1].system.quantity, 5);
    same(plan.slots, ["away:r1", null, null]);
    same(plan.away, [{ key: "r1", name: "Cloak", img: "i" }]);

    n = 0;
    const withCoin = M.planStash(owner, ["c"], { randomID, setProperty, currency: true, tag: "T" });
    const purse = withCoin.creates.at(-1);
    assert.equal(purse.name, "Coin Purse (T)");
    same(purse.flags["pentaryn-attunement"].bond, { actor: owns, key: "r2", name: "Coin Purse", currency: { gp: 5 } });
    assert.equal(purse.system.description.value, "<p>5 gp.</p>");

    // [declared] EC-5: an attuned copy is never a merge target, so a later plain Torch of the same
    // name stashes as its own copy. The verbatim oracle folds it into the bonded copy (the defect).
    n = 0;
    const pair = {
      ...owner,
      items: new Items([
        ["a", item("a", "Torch", "loot", { attuned: true }, { name: "Torch", system: { attuned: true, quantity: 1, attunement: "required" } })],
        ["p", item("p", "Torch", "loot", {}, { name: "Torch", system: { quantity: 4 } })],
      ]),
      getFlag: (m, k) => (k === "slots" ? ["a"] : []),
    };
    const split = M.planStash(pair, ["a", "p"], { randomID, setProperty });
    if (label === "oracle") {
      assert.equal(split.creates.length, 1, "oracle: the plain torch folds into the bonded copy");
      assert.equal(split.creates[0].system.quantity, 5);
    } else {
      assert.equal(split.creates.length, 2, "EC-5: attuned Torch then plain Torch stash as two copies");
      assert.equal(split.creates[0].system.quantity, 1);
      assert.equal(split.creates[0].flags["pentaryn-attunement"].bond.attuned, true);
      assert.equal(split.creates[1].system.quantity, 4);
      assert.equal(split.creates[1].flags["pentaryn-attunement"].bond.attuned, false);
    }
    same(split.away, [{ key: "r1", name: "Torch", img: "i" }]);
  });

  // The core has no t() since lang-switch: its strings are lang/en.json through _loc (i18n.test pins parity).
  test(`${label}: t (items-journal-14)`, { skip: !M.t && "strings moved to lang/en.json (lang-switch)" }, () => {
    assert.equal(M.t("OverBy", { n: 2 }), "2 over the limit");
    assert.equal(M.t("WouldExceed", { actor: "A", max: 3, name: "N", value: 4 }), "A is already attuned to 3 items — attuning N makes 4.");
    assert.equal(M.t("Missing"), "Missing");
    assert.equal(M.t("OverBy", {}), "{n} over the limit");
  });

  test(`${label}: tooltip skip test (items-journal-39)`, () => {
    assert.deepEqual([
      M.tooltipAnchorMissing({ element: {}, tooltip: {} }),
      M.tooltipAnchorMissing({ element: null, tooltip: {} }),
      M.tooltipAnchorMissing({ element: {}, tooltip: null }),
      M.tooltipAnchorMissing({ element: undefined, tooltip: undefined }),
    ], [false, true, true, true]);
  });
}
