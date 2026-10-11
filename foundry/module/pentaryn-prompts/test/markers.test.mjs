/**
 * Characterisation (prompts checkpoint, wave 3): markers.mjs — what makes a prompt marker (the flag,
 * never the name), and ensureMarkers' create / repair / skip paths against the stub world.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";

const F = await installWorld();
const M = await import("../markers-adapter.mjs");

test("constants, art paths and names", () => {
  assert.deepEqual([M.FOLDER_NAME, M.EMPTY_TINT, M.FULL_TINT], ["Prompt Markers", "#ff6b6b", "#ffffff"]);
  assert.equal(M.art("xl"), "modules/pentaryn-prompts/assets/marker-xl.webp");
  assert.equal(M.actorName("tiny"), "Prompt · tiny");
});

test("marker sizes come from the flag on the token, else its actor; unknown sizes are null", () => {
  assert.equal(M.markerSizeOfActor(F.game.actors.get("markerActormid00")), "mid");
  assert.equal(M.markerSizeOfActor({ flags: { [MODULE]: { marker: "huge" } } }), null);
  assert.equal(M.markerSizeOfActor(null), null);
  assert.equal(M.markerSizeOfToken(F.s1.tokens.get("m2")), "small");
  assert.equal(M.markerSizeOfToken({ actorId: "markerActorxl000", flags: {} }), "xl");
  assert.equal(M.markerSizeOfToken({ actorId: "markerActorxl000", flags: { [MODULE]: { marker: "tiny" } } }), "tiny");
  assert.equal(M.markerSizeOfToken({ actorId: "actorGuard000001", flags: {} }), null);
  assert.equal(M.markerSizeOfToken({ name: "Prompt · mid", flags: {} }), null, "never the name");
  assert.equal(M.markerSizeOfToken(null), null);
  assert.equal(M.isPromptToken(F.s1.tokens.get("m1")), true);
  assert.equal(M.isPromptToken(F.s1.tokens.get("tokOrdinary00001")), false);
});

test("promptText normalises the flag; markerActor and markerActorIds find the six", () => {
  assert.equal(M.promptText(F.s1.tokens.get("m1")), "a lantern");
  assert.equal(M.promptText({ flags: { [MODULE]: { prompt: "  a\r\n\n\n\nb  " } } }), "a\n\n\n\nb");
  assert.equal(M.promptText(null), "");
  assert.equal(M.markerActor("large").id, "markerActorlarge");
  assert.equal(M.markerActor("huge"), null);
  assert.deepEqual([...M.markerActorIds()].sort(), ["markerActorlarge", "markerActormid00", "markerActorsmall", "markerActortiny0", "markerActorxl000", "markerActorxxl00"]);
});

test("ensureMarkers: nothing to do when the six hold what it wants (Color objects and hex case count as equal)", async () => {
  const mid = F.game.actors.get("markerActormid00");
  mid._source.prototypeToken.texture.tint = { css: "#FF6B6B" };
  mid._source.name = "Renamed by Joe";
  mid._source.folder = "elsewhere";
  const { value, out } = await captureConsole(() => M.ensureMarkers());
  assert.deepEqual(value, { folder: null, created: [], repaired: [] });
  assert.deepEqual(out, []);
});

test("ensureMarkers: repairs drifted fields with one update per actor and logs the summary", async () => {
  const xl = F.game.actors.get("markerActorxl000");
  xl._source.system.traits.size = "med";
  xl._source.prototypeToken.width = 1;
  xl._source.flags[MODULE].marker = "xl";
  const n0 = F.calls.length;
  const { value, out } = await captureConsole(() => M.ensureMarkers());
  assert.deepEqual(value, { folder: null, created: [], repaired: ["Prompt · xl: system.traits.size, prototypeToken.width"] });
  assert.deepEqual(F.calls.slice(n0).filter(c => c.op === "update").map(c => c.changes),
    [{ "system.traits.size": "huge", "prototypeToken.width": 3 }]);
  assert.deepEqual(out.map(o => o.text), [`pentaryn-prompts | markers ensured ${JSON.stringify(value)}`]);
});

test("ensureMarkers: creates the folder and every missing actor in one createDocuments", async () => {
  for (const id of ["markerActortiny0", "markerActorxxl00"]) F.game.actors.delete(id);
  F.game.folders.delete(F.folder.id);
  const n0 = F.calls.length;
  const { value } = await captureConsole(() => M.ensureMarkers());
  assert.deepEqual(value.folder, "created");
  assert.deepEqual(value.created, ["Prompt · tiny", "Prompt · xxl"]);
  const calls = F.calls.slice(n0).filter(c => ["Folder.create", "Actor.createDocuments"].includes(c.op));
  pinJSON("ensure-markers-create", calls, import.meta.url);
});

test("ensureMarkers: skipped for a player and for a GM who is not the active GM; concurrent calls share one run", async () => {
  const gm = F.game.user;
  F.game.user = { id: "player0000000001", isGM: false };
  assert.deepEqual(await M.ensureMarkers(), { skipped: "not GM" });
  F.game.user = gm;
  F.game.users.set("aaGM000000000001", Object.assign(Object.create(null), { id: "aaGM000000000001", isGM: true, active: true, isSelf: false }));
  assert.deepEqual(await M.ensureMarkers(), { skipped: "not the active GM" });
  F.game.users.delete("aaGM000000000001");
  const a = M.ensureMarkers(), b = M.ensureMarkers();
  assert.deepEqual(await a, await b);
});

test("onPreCreateToken: a non-marker is left alone; the size comes from the data's actor when the doc has none", () => {
  const seen = [];
  const doc = { flags: {}, updateSource: c => seen.push(c) };
  M.onPreCreateToken(doc, { actorId: "actorGuard000001" });
  assert.deepEqual(seen, []);
  M.onPreCreateToken(doc, { actorId: "markerActorsmall", flags: { [MODULE]: { prompt: "x" } } });
  assert.deepEqual(seen, [{ hidden: true, "sight.enabled": false, "flags.dnd5e.lockSize": true, "flags.pentaryn-prompts.marker": "small",
    name: "✎ x", "texture.tint": "#ffffff" }]);
});
