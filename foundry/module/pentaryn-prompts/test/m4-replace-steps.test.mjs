/**
 * prompts-core-M4 [declared]: replaceResolved (replaceMany past its argument checks) was ~110
 * lines with its four write/readback steps inline. The steps are private helpers called in order:
 * buildDocuments (actors and journals, then the placed rows), placeOnScenes (per scene, one create
 * per type in TYPES order, then one marker delete), discardFailed (take back what a failed row
 * made, release the claims) and readBack (the flat result rows). The call order is pinned here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installWorld, captureConsole, token, addScene, MODULE } from "./fixtures/world.mjs";
import { SIZE_BY_KEY } from "../geometry-core.mjs";

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const R = await import("../replace.mjs");
const src = readFileSync(new URL("../replace.mjs", import.meta.url), "utf8");

addScene(F, { id: "sM4second0000001", name: "Second" });
const s2 = F.game.scenes.get("sM4second0000001");
function marker(scene, id, x, text) {
  const w = SIZE_BY_KEY.tiny.w;
  const t = token({ id, name: "Prompt · tiny", actorId: "markerActortiny0", x, y: 300, width: w, height: w, hidden: true,
    texture: { src: `modules/${MODULE}/assets/marker-tiny.webp` }, flags: { [MODULE]: { marker: "tiny", prompt: text } } }, scene);
  t.parent = scene;
  t.collection = scene.tokens;
  scene.tokens.set(id, t);
  return t;
}

test("prompts-core-M4: per scene, one create per type in TYPES order, then one marker delete", async () => {
  marker(F.s1, "mM4tile00000001a", 300, "a rug");
  marker(s2, "mM4light0000002a", 300, "a lamp");
  marker(F.s1, "mM4note00000001b", 500, "a board");
  marker(s2, "mM4none00000002b", 500, "nothing");
  marker(F.s1, "mM4light0000001c", 700, "a candle");
  const from = F.calls.length;
  const { value: r } = await captureConsole(() => R.replaceMany({ replacements: [
    { sceneId: "s1", markerId: "mM4tile00000001a", with: { kind: "tile", src: "a.webp" } },
    { sceneId: s2.id, markerId: "mM4light0000002a", with: { kind: "light", config: { dim: 10 } } },
    { sceneId: "s1", markerId: "mM4note00000001b", with: { kind: "note", name: "Board", html: "<p>x</p>", light: { dim: 5 } } },
    { sceneId: s2.id, markerId: "mM4none00000002b", with: { kind: "none", reason: "skip" } },
    { sceneId: "s1", markerId: "mM4light0000001c", with: { kind: "light", config: { dim: 20 } } }] }));
  assert.deepEqual(r.results.map(x => x.ok), [true, true, true, true, true], JSON.stringify(r.results));
  const order = F.calls.slice(from)
    .filter(c => c.op === "createEmbeddedDocuments" || c.op === "deleteEmbeddedDocuments")
    .map(c => c.op === "createEmbeddedDocuments" ? `${c.scene} create ${c.type} ×${c.data.length}` : `${c.scene} delete ${c.type} ×${c.ids.length}`);
  assert.deepEqual(order, [
    "s1 create Note ×1", "s1 create AmbientLight ×2", "s1 create Tile ×1", "s1 delete Token ×3",
    `${s2.id} create AmbientLight ×1`, `${s2.id} delete Token ×2`]);
  const journal = F.calls.slice(from).findIndex(c => c.op === "JournalEntry.create");
  const firstPlace = F.calls.slice(from).findIndex(c => c.op === "createEmbeddedDocuments");
  assert.ok(journal >= 0 && journal < firstPlace, "the journal is made before anything is placed");
});

/** The source lines of a top-level function, from its `function` line to the closing `}` at column 0. */
function body(name) {
  const lines = src.split("\n");
  const start = lines.findIndex(l => new RegExp(`^(export )?(async )?function ${name}\\(`).test(l));
  assert.ok(start >= 0, `${name} is a top-level function in replace.mjs`);
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return lines.slice(start, end + 1);
}

const STEPS = ["claimMarkers", "buildDocuments", "placeOnScenes", "discardFailed", "readBack"];

test("prompts-core-M4: the write/readback steps are private helpers called in order", () => {
  for (const s of STEPS) {
    body(s);
    assert.doesNotMatch(src, new RegExp(`export (async )?function ${s}\\(`), `${s} stays private`);
  }
  const b = body("replaceResolved").join("\n");
  const at = STEPS.map(s => b.indexOf(`${s}(`));
  for (const [i, s] of STEPS.entries()) assert.ok(at[i] > 0, `replaceResolved calls ${s}`);
  assert.deepEqual([...at].sort((x, y) => x - y), at, "claim, build, place, discard, read back");
  assert.ok(body("replaceResolved").length <= 60, `replaceResolved is ${body("replaceResolved").length} lines`);
});
