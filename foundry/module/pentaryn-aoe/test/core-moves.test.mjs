// S2 (guide): the pure pieces that moved into core — the blueprint constants, isHandle, and finding
// -4's hydrateDamages. Imported bare: no Foundry stub, so a Foundry global in core would throw here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = await import("../core.mjs");

test("blueprint constants: MODULE, SHORT, NS, VERSION, CONTRACT, I18N, CSS, FLAG_SCOPE, HOOKS", () => {
  const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
  assert.deepEqual(
    [core.MODULE, core.SHORT, core.NS, core.VERSION, core.CONTRACT, core.I18N, core.CSS, core.FLAG_SCOPE],
    ["pentaryn-aoe", "aoe", "aoe", manifest.version, "pentaryn-aoe/api@1", "PENTARYN_AOE", "pa-", "pentaryn-aoe"]);
  assert.deepEqual(core.HOOKS, {});
  assert.equal(Object.isFrozen(core.HOOKS), true);
});

test("isHandle: the token's own handle flag, nothing else", () => {
  assert.equal(core.isHandle({ flags: { "pentaryn-aoe": { handle: true } } }), true);
  assert.equal(core.isHandle({ flags: { "pentaryn-aoe": { handle: "tok1" } } }), true);
  assert.equal(core.isHandle({ flags: { "pentaryn-aoe": { handleActor: true } } }), false);
  assert.equal(core.isHandle({ flags: {} }), false);
  assert.equal(core.isHandle(null), false);
});

// -4: applyRows and the tray's preview each hydrated the stored damages inline:
//   res.damages.map(d => ({ ...d, properties: new Set(d.properties ?? []) }))
const inline = damages => damages.map(d => ({ ...d, properties: new Set(d.properties ?? []) }));

test("-4 hydrateDamages equals the inline hydration on stored damages; properties become a Set", () => {
  const stored = [
    { value: 21, type: "fire", properties: ["mgc"] },
    { value: 3, type: "cold", properties: [] },
    { value: 0, type: "acid" },
  ];
  const got = core.hydrateDamages(stored);
  assert.deepEqual(got, inline(stored));
  for (const d of got) assert.ok(d.properties instanceof Set);
  assert.deepEqual([...got[0].properties], ["mgc"]);
});

test("-4 hydrateDamages does not mutate its input", () => {
  const stored = [{ value: 5, type: "fire", properties: ["mgc"] }];
  const copy = JSON.parse(JSON.stringify(stored));
  const got = core.hydrateDamages(stored);
  assert.deepEqual(stored, copy);
  assert.notEqual(got[0], stored[0]);
});

test("-4 hydrateDamages: no damages → [] (D-A1: the inline code threw here)", () => {
  assert.deepEqual(core.hydrateDamages(undefined), []);
  assert.deepEqual(core.hydrateDamages(null), []);
  assert.deepEqual(core.hydrateDamages([]), []);
  assert.throws(() => inline(undefined), TypeError);
});

/* ── S7 (-10): the summary the read API returns ───────────────────────────────────────────────── */

test("-10 summariseResolution: rows without images or message ids, the Apply count, careful, playerStatus", () => {
  const res = {
    itemName: "Fireball", ability: "dex", dc: 15, onSave: "half", region: "r1", superseded: false,
    careful: { names: ["Caven"], max: 3 },
    rows: [
      { id: "g1", name: "Goblin", img: "g.webp", kind: "auto", apply: true, save: { total: 18, success: true, messageId: "m1" }, multiplier: 0.5, applied: false, caster: false },
      { id: "cv", name: "Caven", kind: "manual", apply: true, save: { total: null, success: true, messageId: null, careful: true }, multiplier: 0, applied: true, hp: { before: 30, after: 30 }, caster: false, protected: true },
      { id: "mr", name: "Marrith", kind: "manual", apply: false, save: null, multiplier: null, applied: false, caster: true },
    ],
  };
  assert.deepEqual(core.summariseResolution(res), {
    item: "Fireball", ability: "dex", dc: 15, onSave: "half", region: "r1", superseded: false, applicable: 1,
    rows: [
      { id: "g1", name: "Goblin", kind: "auto", apply: true, save: { total: 18, success: true }, multiplier: 0.5, applied: false, hp: null, caster: false, protected: false },
      { id: "cv", name: "Caven", kind: "manual", apply: true, save: { total: null, success: true }, multiplier: 0, applied: true, hp: { before: 30, after: 30 }, caster: false, protected: true },
      { id: "mr", name: "Marrith", kind: "manual", apply: false, save: null, multiplier: null, applied: false, hp: null, caster: true, protected: false },
    ],
    careful: { names: ["Caven"], max: 3 },
    playerStatus: "waiting",
  });
  assert.equal(core.summariseResolution(null), null);
  assert.deepEqual(core.summariseResolution({ superseded: true }).playerStatus, "superseded");
  assert.deepEqual(core.summariseResolution({}).rows, []);
});

test("RECENT_MESSAGES is the 60-message window the manifest documents", () => {
  assert.equal(core.RECENT_MESSAGES, 60);
});
