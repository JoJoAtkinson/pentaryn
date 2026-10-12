/**
 * [declared] prompts-core-AC-2 — one marker that vanished mid-run (another GM deleted it after its
 * replacement was built) made the scene's one marker delete throw, so every other replaced marker
 * on that scene stayed on the map. Skip-and-report, no rollback: the delete leaves out markers that
 * are already gone; if it still throws, each marker is deleted on its own and a failure lands on
 * that row only (markerDeleted false, a warning naming the marker). The vanished marker's row keeps
 * its replacement and says the marker was already gone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, token, MODULE } from "./fixtures/world.mjs";
import { SIZE_BY_KEY } from "../geometry-core.mjs";

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const R = await import("../replace.mjs");

function marker(id, x, text) {
  const w = SIZE_BY_KEY.tiny.w;
  const t = token({ id, name: "Prompt · tiny", actorId: "markerActortiny0", x, y: 300, width: w, height: w, hidden: true,
    texture: { src: `modules/${MODULE}/assets/marker-tiny.webp` }, flags: { [MODULE]: { marker: "tiny", prompt: text } } }, F.s1);
  t.collection = F.s1.tokens;
  F.s1.tokens.set(id, t);
  return t;
}
const run = input => captureConsole(() => R.replaceMany(input)).then(r => r.value);
const LIGHT = { kind: "light", config: { dim: 10 } };
const lightsFrom = id => [...F.s1.lights.values()].filter(l => l.flags?.[MODULE]?.provenance?.markerId === id);

/** Foundry's delete: an id the collection does not hold throws, and nothing is deleted. */
function strictDelete(refuse = new Set()) {
  const loose = F.s1.deleteEmbeddedDocuments;
  Object.defineProperty(F.s1, "deleteEmbeddedDocuments", { configurable: true, value: async (type, ids, o) => {
    for (const id of ids) {
      if (!F.s1.getEmbeddedDocument(type, id)) throw new Error(`${type} id [${id}] does not exist in the EmbeddedCollection`);
      if (refuse.has(id)) throw new Error(`stub: ${id} delete refused`);
    }
    return loose.call(F.s1, type, ids, o);
  } });
  return () => Object.defineProperty(F.s1, "deleteEmbeddedDocuments", { configurable: true, value: loose });
}

/** Another GM deletes `id` while this run builds the lights. */
function vanishDuringCreate(id) {
  const create = F.s1.createEmbeddedDocuments;
  Object.defineProperty(F.s1, "createEmbeddedDocuments", { configurable: true, value: async (type, rows, o) => {
    const out = await create.call(F.s1, type, rows, o);
    F.s1.tokens.delete(id);
    return out;
  } });
  return () => Object.defineProperty(F.s1, "createEmbeddedDocuments", { configurable: true, value: create });
}

test("prompts-core-AC-2: a marker gone mid-run leaves the scene's other replaced markers deleted", async () => {
  marker("mVanish000000001", 300, "a lantern");
  marker("mStays000000001a", 400, "a candle");
  marker("mStays000000001b", 500, "a torch");
  const undoDelete = strictDelete(), undoCreate = vanishDuringCreate("mVanish000000001");
  let r;
  try {
    r = await run({ replacements: ["mVanish000000001", "mStays000000001a", "mStays000000001b"]
      .map(markerId => ({ sceneId: "s1", markerId, with: LIGHT })) });
  } finally { undoCreate(); undoDelete(); }
  assert.ok(!F.s1.tokens.get("mStays000000001a"), "the other markers are deleted");
  assert.ok(!F.s1.tokens.get("mStays000000001b"));
  assert.deepEqual(r.results.map(x => [x.ok, x.markerDeleted]), [[true, true], [true, true], [true, true]]);
  assert.equal(lightsFrom("mVanish000000001").length, 1, "the vanished marker's replacement stays");
  assert.ok(r.results[0].warnings.some(w => /mVanish000000001/.test(w) && /already gone/.test(w)), r.results[0].warnings.join(" | "));
  assert.match(r.text, /already gone/);
});

test("prompts-core-AC-2: a delete refused for one marker fails that row only", async () => {
  marker("mRefused00000002", 600, "a sconce");
  marker("mFine00000000002", 700, "a brazier");
  const undo = strictDelete(new Set(["mRefused00000002"]));
  let r;
  try {
    r = await run({ replacements: ["mRefused00000002", "mFine00000000002"].map(markerId => ({ sceneId: "s1", markerId, with: LIGHT })) });
  } finally { undo(); }
  assert.ok(F.s1.tokens.get("mRefused00000002"), "the refused marker is still there");
  assert.ok(!F.s1.tokens.get("mFine00000000002"), "the other marker is deleted");
  assert.deepEqual(r.results.map(x => x.markerDeleted), [false, true]);
  assert.ok(r.results[0].warnings.some(w => /mRefused00000002/.test(w) && /delete refused/.test(w)), r.results[0].warnings.join(" | "));
  assert.equal(lightsFrom("mRefused00000002").length, 1, "skip-and-report: no rollback");
});
