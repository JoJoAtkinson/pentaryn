/**
 * [declared] prompts-core-AC-1 — overlapping replaceMany runs built the same marker twice.
 * In one tab, runs on a scene queue: the second waits, re-resolves, and reports a marker the first
 * replaced as MARKER_GONE. Across tabs (the MCP bridge tab plus a GM browser tab), each marker is
 * claimed with the kit's claimDocument before anything is built: a marker another tab holds fails
 * that row only (MARKER_GONE); the rest of the call proceeds. A claim left on a marker that was not
 * replaced is taken off again, and `force` takes over a stale one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, token, MODULE } from "./fixtures/world.mjs";
import { SIZE_BY_KEY } from "../geometry-core.mjs";

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const R = await import("../replace.mjs");

const ACTOR_OF = { tiny: "markerActortiny0", mid: "markerActormid00" };
function marker(id, size, x, y, text, extra = {}) {
  const w = SIZE_BY_KEY[size].w;
  const t = token({ id, name: `Prompt · ${size}`, actorId: ACTOR_OF[size], x, y, width: w, height: w, hidden: true,
    texture: { src: `modules/${MODULE}/assets/marker-${size}.webp` }, flags: { [MODULE]: { marker: size, prompt: text } }, ...extra }, F.s1);
  t.collection = F.s1.tokens;
  F.s1.tokens.set(id, t);
  return t;
}
const run = (input, opts) => captureConsole(() => R.replaceMany(input, opts)).then(r => r.value);
const LIGHT = { kind: "light", config: { dim: 10 } };
const lightsFrom = markerId => [...F.s1.lights.values()].filter(l => l.flags?.[MODULE]?.provenance?.markerId === markerId);
const claimOf = t => t.flags?.[MODULE]?.claims?.replace;

test("prompts-core-AC-1: two overlapping runs on one marker in one tab build it once", async () => {
  marker("mOverlap00000001", "tiny", 300, 300, "a lantern");
  const one = { sceneId: "s1", markerId: "mOverlap00000001", with: LIGHT };
  const [a, b] = await Promise.all([run({ replacements: [one] }), run({ replacements: [one] })]);
  assert.equal(lightsFrom("mOverlap00000001").length, 1, "one light, not two");
  assert.equal(a.results[0].ok, true);
  assert.equal(b.results[0].ok, false);
  assert.equal(b.results[0].code, "MARKER_GONE");
  assert.match(b.results[0].error, /already replaced on .* \(now AmbientLight /);
});

test("prompts-core-AC-1: a marker another GM tab holds fails alone; the rest of the call proceeds", async () => {
  marker("mHeld00000000001", "tiny", 400, 300, "a candle", { flags: { [MODULE]: { marker: "tiny", prompt: "a candle", claims: { replace: "socket-gm-2" } } } });
  marker("mFree00000000001", "tiny", 500, 300, "a torch");
  const r = await run({ replacements: [
    { sceneId: "s1", markerId: "mHeld00000000001", with: LIGHT },
    { sceneId: "s1", markerId: "mFree00000000001", with: LIGHT }] });
  assert.deepEqual(r.results.map(x => [x.ok, x.code ?? null]), [[false, "MARKER_GONE"], [true, null]]);
  assert.match(r.results[0].error, /another GM tab/);
  assert.equal(lightsFrom("mHeld00000000001").length, 0);
  assert.equal(lightsFrom("mFree00000000001").length, 1);
  assert.ok(F.s1.tokens.get("mHeld00000000001"), "the other tab's marker is left to it");
  assert.equal(claimOf(F.s1.tokens.get("mHeld00000000001")), "socket-gm-2", "never takes another tab's claim off");
});

test("prompts-core-AC-1: a claim race lost to another tab skips the row", async () => {
  const t = marker("mRace00000000001", "tiny", 600, 300, "a brazier");
  const update = t.update;
  // the other tab's claim lands after ours: last writer wins
  Object.defineProperty(t, "update", { configurable: true, value: async changes => {
    const out = await update.call(t, changes);
    if (`flags.${MODULE}.claims.replace` in changes) await update.call(t, { [`flags.${MODULE}.claims.replace`]: "socket-gm-2" });
    return out;
  } });
  const r = await run({ replacements: [{ sceneId: "s1", markerId: "mRace00000000001", with: LIGHT }] });
  assert.equal(r.results[0].code, "MARKER_GONE");
  assert.equal(lightsFrom("mRace00000000001").length, 0);
});

test("prompts-core-AC-1: a row that fails after its claim takes the claim off its marker", async () => {
  const t = marker("mFail00000000001", "tiny", 700, 300, "a mosaic");
  F.s1.fail.Tile = "all";
  try {
    const r = await run({ replacements: [{ sceneId: "s1", markerId: "mFail00000000001", with: { kind: "tile", src: "a.webp" } }] });
    assert.equal(r.results[0].code, "CREATE_FAILED");
  } finally { delete F.s1.fail.Tile; }
  assert.ok(F.s1.tokens.get("mFail00000000001"));
  assert.equal(claimOf(t), undefined);
});

test("prompts-core-AC-1: force takes over a stale claim", async () => {
  marker("mStale0000000001", "tiny", 800, 300, "a sconce", { flags: { [MODULE]: { marker: "tiny", prompt: "a sconce", claims: { replace: "socket-gone" } } } });
  const r = await run({ replacements: [{ sceneId: "s1", markerId: "mStale0000000001", with: LIGHT }], force: true });
  assert.equal(r.results[0].ok, true);
  assert.equal(lightsFrom("mStale0000000001").length, 1);
});
