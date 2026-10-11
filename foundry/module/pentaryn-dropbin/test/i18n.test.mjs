// i18n (guide step 1.7): every literal PENTARYN_DROPBIN.* key exists in lang/en.json, and so does every
// key loot.mjs builds from a template (`lootAll.${k}`): lootAllState's reasons plus label, tip, failed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON, sourceScan } from "./kit/harness.mjs";
import { lootAllState } from "../loot-core.mjs";

const ROOT = new URL("..", import.meta.url);
const flat = (node, prefix = "", out = new Set()) => {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, out);
    else out.add(key);
  }
  return out;
};
const keys = flat(readJSON(new URL("lang/en.json", ROOT)));

test("every literal PENTARYN_DROPBIN.* key exists", () => {
  const used = new Set();
  for (const hit of sourceScan(ROOT, /PENTARYN_DROPBIN\.[\w.]*\w/)) {
    for (const m of hit.text.matchAll(/PENTARYN_DROPBIN\.[\w.]*\w/g)) used.add(m[0]);
  }
  for (const k of used) if (!k.endsWith(".lootAll")) assert.ok(keys.has(k), k);
});

test("the template-built lootAll.<k> keys all exist", () => {
  const reasons = new Set();
  const pileData = { enabled: true, type: "pile" };
  for (const hasRecipient of [false, true]) for (const empty of [false, true]) for (const isGM of [false, true]) {
    const r = lootAllState({ pileData, hasRecipient, empty, isGM }).reason;
    if (r) reasons.add(r);
  }
  assert.deepEqual([...reasons].sort(), ["empty", "noCharacter"]);
  for (const k of [...reasons, "label", "tip", "failed"]) assert.ok(keys.has(`PENTARYN_DROPBIN.lootAll.${k}`), k);
});
