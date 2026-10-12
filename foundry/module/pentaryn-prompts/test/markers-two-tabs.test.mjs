/**
 * [declared] ensureMarkers is idempotent across two tabs of the active GM (§5.9.1, review finding
 * after the §5.9 pass). The bridge tab and a GM browser tab both pass `activeGM.isSelf` and both
 * look before either creates, so the folder and each marker actor are created with a deterministic
 * `_id` and `{keepId: true}`: the second tab's create replaces the first's with the same data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole } from "./fixtures/world.mjs";

const F = await installWorld();
const M = await import("../markers-adapter.mjs");

/** Wrap the stub's two create calls to keep the options they were given. */
function spyCreates() {
  const seen = [];
  const fc = Folder.create, ac = Actor.createDocuments;
  Folder.create = async (data, opts) => { seen.push({ op: "Folder.create", data: structuredClone(data), opts }); return fc.call(Folder, data, opts); };
  Actor.createDocuments = async (rows, opts) => { seen.push({ op: "Actor.createDocuments", data: structuredClone(rows), opts }); return ac.call(Actor, rows, opts); };
  return { seen, restore() { Folder.create = fc; Actor.createDocuments = ac; } };
}

/** Put the world back to "folder gone, tiny and xxl gone", as both tabs see it at `ready`. */
function missing() {
  for (const a of [...F.game.actors.values()]) {
    if (["tiny", "xxl"].includes(M.markerSizeOfActor(a))) F.game.actors.delete(a.id);
  }
  for (const f of [...F.game.folders.values()]) if (f.name === M.FOLDER_NAME || f.id === "pPromptsFolder00") F.game.folders.delete(f.id);
}

test("[declared] creates carry deterministic 16-char ids and keepId; two tabs send the same creates", async () => {
  const spy = spyCreates();
  try {
    missing();
    await captureConsole(() => M.ensureMarkers());
    const tabA = spy.seen.splice(0);
    missing();
    await captureConsole(() => M.ensureMarkers());
    const tabB = spy.seen.splice(0);

    assert.deepEqual(tabA.map(c => [c.op, c.opts]), [["Folder.create", { keepId: true }], ["Actor.createDocuments", { keepId: true }]]);
    assert.equal(tabA[0].data._id, "pPromptsFolder00");
    assert.deepEqual(tabA[1].data.map(r => r._id), ["pPromptstiny0000", "pPromptsxxl00000"]);
    for (const id of [tabA[0].data._id, ...tabA[1].data.map(r => r._id)]) assert.match(id, /^[a-zA-Z0-9]{16}$/);
    // the stub hands each created folder a fresh id, so compare the actor rows without it
    const rows = calls => calls[1].data.map(({ folder, ...r }) => r);
    assert.deepEqual(rows(tabB), rows(tabA), "same data from both tabs: the second create replaces, never duplicates");
    assert.deepEqual(tabB[0], tabA[0]);
  } finally { spy.restore(); }
});

test("[declared] a folder holding our id is used even when renamed, not replaced", async () => {
  const spy = spyCreates();
  try {
    missing();
    const mine = { id: "pPromptsFolder00", name: "Joe's markers", type: "Actor", folder: null };
    F.game.folders.set(mine.id, mine);
    const { value } = await captureConsole(() => M.ensureMarkers());
    assert.equal(value.folder, null);
    assert.deepEqual(spy.seen.map(c => c.op), ["Actor.createDocuments"]);
    assert.deepEqual(spy.seen[0].data.map(r => r.folder), ["pPromptsFolder00", "pPromptsFolder00"]);
  } finally { spy.restore(); }
});

test("an actor that exists keeps its own id: only a missing size is created", async () => {
  const spy = spyCreates();
  try {
    const { value } = await captureConsole(() => M.ensureMarkers());
    assert.deepEqual(value.created, []);
    assert.deepEqual(spy.seen, []);
  } finally { spy.restore(); }
});
