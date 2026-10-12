/**
 * The pure halves the guide's step 3 moved into core/ (findings -12, -13, -26, C24 migrate):
 * each equals today's glue, row for row. Added at step 3; the frozen characterisation files
 * (carried.test, light.test, chain.test) keep proving the live paths.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { lightUpdate } from "./fixtures/legacy-light-update.mjs";

const F = await installFoundry({ modules: ["pentaryn-senses"] });
const core = await import("../senses-core.mjs");
const M = "pentaryn-senses";

class LightData {
  constructor(d) { Object.assign(this, d); }
  toObject() { return JSON.parse(JSON.stringify(this)); }
}

test("itemLightUpdate (-12) equals senses.mjs's lightUpdate, with and without `_del`", () => {
  const torch = core.lightFor(core.LIGHT_PROFILES.torch);
  const docs = [
    { light: { dim: 0 }, flags: { [M]: { spellLight: { source: "x" } } } },
    { light: torch, flags: { [M]: { itemLight: true } } },
    { light: torch, flags: {} },
    { light: { bright: 5, dim: 10, color: "#00ff00" }, flags: {} },
    { light: { bright: 0, dim: 0 }, flags: {} },
    { light: { bright: 0, dim: 3 }, flags: {} },
    { light: { bright: "2", dim: "0" }, flags: {} },
    { light: torch, flags: { [M]: { itemLight: true, itemLightPrior: { bright: 5, dim: 10 } } } },
    { light: torch, flags: { [M]: { itemLight: true } } },
    { light: { bright: 5, dim: 10 }, flags: { [M]: { itemLight: "true" } } },
    { light: new LightData({ bright: 7, dim: 14 }), flags: {} },
    { light: { bright: 1, dim: 2 } },
    { flags: { [M]: { itemLight: true, itemLightPrior: null } } },
  ];
  const saved = Object.getOwnPropertyDescriptor(globalThis, "_del");
  try {
    for (const del of [undefined, { del: true }]) {
      if (del) globalThis._del = del;
      else delete globalThis._del;
      for (const doc of docs) for (const light of [torch, null, { dim: 15, color: "#8844ff" }]) {
        const got = core.itemLightUpdate(doc, light, { flatten: F.foundry.utils.flattenObject, clone: F.foundry.utils.deepClone, del: globalThis._del ?? null });
        assert.deepEqual(got, lightUpdate(doc, light), JSON.stringify({ doc, light, del: !!del }));
      }
    }
  } finally {
    if (saved) Object.defineProperty(globalThis, "_del", saved);
    else delete globalThis._del;
  }
  const SENTINEL = { s: 1 };
  const prior = { light: torch, flags: { [M]: { itemLight: true, itemLightPrior: { bright: 5, dim: 10 } } } };
  assert.equal(core.itemLightUpdate(prior, null, { flatten: F.foundry.utils.flattenObject, clone: F.foundry.utils.deepClone, del: SENTINEL })[`flags.${M}.itemLightPrior`], SENTINEL);
});

test("collectSources / litByIn (-13 pure half): every spell light on plain scenes, tokens before lights", () => {
  const sl = source => ({ flags: { [M]: { spellLight: { source } } } });
  const coll = list => ({ list, [Symbol.iterator]() { return list[Symbol.iterator](); } });
  const scenes = [
    { id: "s1", tokens: coll([{ id: "t1", ...sl("A") }, { id: "t2" }, { id: "t3", ...sl("B") }]), lights: coll([{ id: "l1", x: 50, y: 60, ...sl("A") }]) },
    { id: "s2", tokens: coll([{ id: "t4", ...sl("A") }]), lights: coll([{ id: "l2", x: 1, y: 2, flags: { [M]: { spellLight: { source: "" } } } }]) },
  ];
  assert.deepEqual([...core.collectSources(scenes)], ["A", "B"]);
  assert.deepEqual([...core.collectSources(null)], []);
  const strip = rows => rows.map(({ doc, ...r }) => ({ ...r, doc: doc.id }));
  assert.deepEqual(strip(core.litByIn(scenes, "A")), [
    { kind: "token", scene: "s1", id: "t1", doc: "t1" },
    { kind: "ambient", scene: "s1", id: "l1", x: 50, y: 60, doc: "l1" },
    { kind: "token", scene: "s2", id: "t4", doc: "t4" },
  ]);
  assert.deepEqual(core.litByIn(scenes, "Z"), []);
  assert.deepEqual(core.litByIn(undefined, "A"), []);
});

test("resolveTokenRef (-26 pure half): today's three branches", () => {
  const doc = { id: "t1", documentName: "Token" };
  const viewed = { tokens: new Map([["t1", doc]]) };
  assert.equal(core.resolveTokenRef(null, { viewed }), null);
  assert.equal(core.resolveTokenRef("", { viewed }), null);
  assert.equal(core.resolveTokenRef("t1", { viewed }), doc);
  assert.equal(core.resolveTokenRef("t2", { viewed }), null);
  assert.equal(core.resolveTokenRef("t1", {}), null, "no viewed scene");
  assert.equal(core.resolveTokenRef("Scene.s.Token.t1", { viewed }), null, "a uuid is an unknown id today (-26)");
  assert.equal(core.resolveTokenRef({ document: doc }, { viewed }), doc, "a placeable");
  assert.equal(core.resolveTokenRef(doc), doc, "a document");
});

test("planSightReset reads a throwing _source as absent (C24: storedSight's catch now has a body)", () => {
  const dv = { enabled: true, visionMode: "darkvision", range: 60 };
  const tokens = [
    { id: "a", get _source() { throw new Error("x"); }, sight: dv },
    { id: "b", get _source() { throw new Error("x"); }, get sight() { throw new Error("y"); } },
    { id: "c", _source: { sight: null }, sight: dv },
  ];
  assert.deepEqual(core.planSightReset([], [{ id: "s", tokens }]).scenes, [
    { sceneId: "s", updates: [{ _id: "a", "sight.visionMode": "basic", "sight.range": 0 }, { _id: "c", "sight.visionMode": "basic", "sight.range": 0 }] },
  ]);
});

test("resolveTokenRef with fromUuid (-26): a Token uuid on any scene; another document's uuid or a bad one → null", () => {
  const tokenDoc = { id: "t9", documentName: "Token" };
  const docs = { "Scene.s2.Token.t9": tokenDoc, "Actor.a": { documentName: "Actor" } };
  const fromUuid = u => { if (u === "boom.x") throw new Error("bad"); return docs[u] ?? null; };
  const viewed = { tokens: new Map([["t1", { id: "t1" }]]) };
  assert.equal(core.resolveTokenRef("Scene.s2.Token.t9", { viewed, fromUuid }), tokenDoc);
  assert.equal(core.resolveTokenRef("Actor.a", { viewed, fromUuid }), null);
  assert.equal(core.resolveTokenRef("boom.x", { viewed, fromUuid }), null);
  assert.equal(core.resolveTokenRef("t1", { viewed, fromUuid }).id, "t1", "a plain id is still the viewed scene's");
});

test("handSquareEdit: a hand-deleted wanted square ends the light; a dragged one moves it; twins and other targets are left", () => {
  const sl = (id, x, y, source = "L") => ({ id, x, y, flags: { "pentaryn-senses": { spellLight: { source } } } });
  const want = { scene: "s", x: 250, y: 250 };
  const sq = sl("a", 250.4, 249.6);
  assert.deepEqual(core.handSquareEdit("delete", { want, source: "L", light: sq, sceneId: "s", lights: [] }), { clear: true });
  assert.equal(core.handSquareEdit("delete", { want, source: "L", light: sq, sceneId: "s", lights: [sl("b", 250, 250)] }), null, "a twin remains");
  assert.equal(core.handSquareEdit("delete", { want, source: "L", light: sq, sceneId: "s", lights: [sl("b", 250, 250, "M")] })?.clear, true, "another Light's square is no twin");
  assert.equal(core.handSquareEdit("delete", { want, source: "L", light: sl("a", 50, 50), sceneId: "s", lights: [] }), null, "not the wanted square");
  assert.equal(core.handSquareEdit("delete", { want, source: "L", light: sq, sceneId: "other", lights: [] }), null, "another scene");
  assert.equal(core.handSquareEdit("delete", { want: { scene: "s", token: "t" }, source: "L", light: sq, sceneId: "s", lights: [] }), null, "cast on a token");
  assert.equal(core.handSquareEdit("delete", { want: null, source: "L", light: sq, sceneId: "s", lights: [] }), null);
  assert.deepEqual(core.handSquareEdit("move", { want, source: "L", light: sl("a", 349.6, 150), sceneId: "s", lights: [] }), { x: 350, y: 150 });
  assert.equal(core.handSquareEdit("move", { want, source: "L", light: sq, sceneId: "s", lights: [] }), null, "still at the wanted spot");
  assert.equal(core.handSquareEdit("move", { want, source: "L", light: sl("a", 350, 150), sceneId: "s", lights: [sl("b", 250, 250)] }), null, "a twin holds the spot");
});
