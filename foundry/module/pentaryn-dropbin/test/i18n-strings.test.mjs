// items-journal-26 (step 7): every string that moved into lang/en.json renders exactly the literal it
// replaced, with every placeholder passed (Foundry renders a missing one as "undefined").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON, sourceScan } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const lang = readJSON(new URL("lang/en.json", ROOT));
/** Foundry's Localization#localize(stringId, data) (client/helpers/localization.mjs:435-445). */
const _loc = (key, data) => {
  const s = key.split(".").reduce((o, k) => o?.[k], lang);
  assert.equal(typeof s, "string", key);
  return data ? s.replace(/{[^}]+}/g, k => data[k.slice(1, -1)]) : s;
};

const CASES = [
  ["restore.gmOnly", undefined, "Only the GM can restore from the drop bin."],
  ["restore.noEntry", { n: 7 }, "Drop bin: no entry #7."],
  ["restore.noActor", { n: 7 }, "Drop bin: cannot find an actor to restore #7 onto."],
  ["restore.restored", { item: "Sword", actor: "Ann", n: 3 }, "Restored Sword to Ann (drop bin #3)."],
  ["export.ok", { path: "assets/drop-bin/drop-log.json" }, "Drop bin written to assets/drop-bin/drop-log.json"],
  ["export.failed", undefined, "Drop bin mirror failed — see console."],
  ["clear.title", undefined, "Clear the drop bin?"],
  ["clear.body", { count: 12 }, "<p>This wipes <strong>12</strong> ledger entries. The JSON mirror is overwritten too.</p>"],
  ["lock.toast", { name: "Hidden Cache" }, "Hidden Cache is locked."],
  ["lock.toast", { name: "It" }, "It is locked."],
  ["lock.float", undefined, "Locked"],
  ["corpse.revive", undefined, "Revive (1 HP): no longer lootable"],
  ["corpse.sheet", undefined, "Open character sheet (GM)"],
];

for (const [key, data, want] of CASES) {
  test(`PENTARYN_DROPBIN.${key} renders today's literal`, () => {
    assert.equal(_loc(`PENTARYN_DROPBIN.${key}`, data), want);
  });
}

test("every placeholder of a moved key is passed at its call site", () => {
  for (const hit of sourceScan(ROOT, /_loc\("PENTARYN_DROPBIN\.[\w.]+"/)) {
    for (const m of hit.text.matchAll(/_loc\("(PENTARYN_DROPBIN\.[\w.]+)"(?:,\s*\{([^}]*)\})?/g)) {
      const s = m[1].split(".").reduce((o, k) => o?.[k], lang);
      const need = [...s.matchAll(/{(\w+)}/g)].map(x => x[1]);
      const given = (m[2] ?? "").split(",").map(x => x.trim().split(":")[0].trim()).filter(Boolean);
      for (const p of need) assert.ok(given.includes(p), `${m[1]} needs {${p}} (${hit.file}:${hit.line})`);
    }
  }
});

test("no user-facing English literal is left in a toast, dialog or HUD tooltip", () => {
  const hits = sourceScan(ROOT, /notifications\.(info|warn|error)\(\s*["`]|title:\s*"|createScrollingText\([^,]+,\s*"/);
  assert.deepEqual(hits.map(h => `${h.file}:${h.line}`), []);
});
