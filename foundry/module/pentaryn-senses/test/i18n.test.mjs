/**
 * i18n (guide step 8, finding -24; C34, C35, C36): lang/en.json is nested under PENTARYN_SENSES;
 * every key the code names is a full literal that exists and renders today's English (the strings
 * the glue goldens pin); no prefix wrapper is left.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readJSON, sourceScan } from "./kit/harness.mjs";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { I18N } from "../senses-core.mjs";
import { SETTINGS } from "../settings.mjs";

const ROOT = new URL("..", import.meta.url);

function flatten(node, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const lang = readJSON(new URL("lang/en.json", ROOT));
const keys = flatten(lang);

test("lang/en.json is nested under one root, Light / Chain / Glow", () => {
  assert.deepEqual(Object.keys(lang), [I18N]);
  assert.deepEqual(Object.keys(lang[I18N]), ["Light", "Chain", "Glow"]);
  assert.equal(Object.keys(lang[I18N].Light).length, 28, "the 27 flat keys plus SetupGMOnly");
});

test("every literal PENTARYN_SENSES key in the code exists", () => {
  const files = ["light.mjs", "light-ui.mjs", "chain.mjs", "glow.mjs", "carried.mjs", "migrate.mjs", "senses.mjs"];
  const used = new Set();
  for (const f of files) {
    for (const m of readFileSync(new URL(f, ROOT), "utf8").matchAll(/"(PENTARYN_SENSES\.[\w.]+)"/g)) used.add(m[1]);
  }
  for (const k of used) assert.ok(k in keys, `${k} missing from lang/en.json`);
  assert.ok(used.size >= 30);
});

test("the store setting needs no label (C51 skips store rows)", () => {
  assert.deepEqual(SETTINGS.filter(r => !r.store), []);
});

test("keys render today's English, with the glue goldens' data", async () => {
  await installFoundry({ lang, modules: ["pentaryn-senses"] });
  const rows = [
    ["PENTARYN_SENSES.Chain.Break", undefined, "Break chain"],
    ["PENTARYN_SENSES.Chain.Breaks", { name: "Hulk" }, "The chain on Hulk breaks."],
    ["PENTARYN_SENSES.Chain.LinkTo", { anchor: "Stake" }, "Chain to Stake"],
    ["PENTARYN_SENSES.Chain.Linked", { name: "Hulk", anchor: "Stake" }, "Hulk is chained to Stake."],
    ["PENTARYN_SENSES.Light.SetupGMOnly", undefined, "pentaryn-senses: setupLight is GM-only."],
    ["PENTARYN_SENSES.Glow.Label", undefined, "Broken glow (wandering)"],
    ["PENTARYN_SENSES.Light.Lights", { actor: "Marrith", item: "Torch" }, "Marrith lights the Torch."],
    ["PENTARYN_SENSES.Light.OnToken", { name: "Stake" }, "Light: Stake glows."],
    ["PENTARYN_SENSES.Light.Outshone", { item: "Torch" }, "Lit, but your Torch gives more light, so this one adds nothing now. Click to put it out."],
  ];
  for (const [key, data, want] of rows) assert.equal(_loc(key, data), want, key);
});

test("no prefix wrapper: keys are full literals through _loc (blueprint D1)", () => {
  const hits = [
    ...sourceScan(ROOT, /game\.i18n\.(?:localize|format)\(\s*`/),
    ...sourceScan(ROOT, /=>\s*[^;]*\?\s*game\.i18n\.format\(/),
    ...sourceScan(ROOT, /game\.i18n\.(?:localize|format)\(/),
  ];
  assert.deepEqual(hits, []);
});
