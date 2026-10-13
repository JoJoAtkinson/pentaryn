// The shared report store the entry wires at setup: the module's own logger reaches fileStore, so its
// createDirectory and browse debug lines fire when CONFIG.debug["pentaryn-feedback"] is on. Own
// process (node --test runs each file alone): no test has swapped in a memory store first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installClient } from "./fixtures/world.mjs";
import { MODULE } from "../feedback-core.mjs";

const F = await installClient();
const fpCalls = [];
globalThis.FilePicker = {
  async createDirectory(source, dir) {
    fpCalls.push(["mkdir", dir]);
    throw new Error(`EEXIST: ${dir} already exists`);
  },
  async browse(source, dir) {
    fpCalls.push(["browse", dir]);
    throw new Error(`ENOENT: no such directory ${dir}`);
  },
};
const debugLines = [];
const originalDebug = console.debug;
console.debug = (...args) => debugLines.push(args.map(String).join(" "));

const { store } = await import("../files-adapter.mjs");
await import("../feedback.mjs");
F.fire("init");
F.fire("setup");

test("feedback-M10: the store wired at setup logs createDirectory and browse at debug through the module log", async () => {
  assert.equal(globalThis.foundry?.applications?.apps?.FilePicker, undefined, "the test's FilePicker is the one used");
  globalThis.CONFIG.debug[MODULE] = true;
  try {
    await store().ensureDir("pentaryn-feedback/w");
    assert.deepEqual(await store().list("pentaryn-feedback/missing"), []);
  } finally {
    globalThis.CONFIG.debug[MODULE] = false;
  }
  assert.deepEqual(fpCalls.map(c => c[1]), ["pentaryn-feedback", "pentaryn-feedback/w", "pentaryn-feedback/missing"]);
  assert.deepEqual(debugLines, [
    `${MODULE} | createDirectory pentaryn-feedback EEXIST: pentaryn-feedback already exists`,
    `${MODULE} | createDirectory pentaryn-feedback/w EEXIST: pentaryn-feedback/w already exists`,
    `${MODULE} | browse pentaryn-feedback/missing ENOENT: no such directory pentaryn-feedback/missing`,
  ]);
});

test("feedback-M10: debug off (the default) keeps those lines silent", async () => {
  debugLines.length = 0;
  assert.deepEqual(await store().list("pentaryn-feedback/missing"), []);
  assert.deepEqual(debugLines, []);
  console.debug = originalDebug;
});
