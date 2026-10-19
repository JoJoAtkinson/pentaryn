// lang/en.json against the code (guide S1, S3): the 42 keys exist (golden/lang-keys.json), every
// full `PENTARYN_RIDERS.*` literal in the sources resolves, and so do the 21 keys built today by
// prefix wrappers — 12 by riders.mjs's L(k), 6 by cast-flow's arcaneRecovery T(k), 3 by
// concentration's template key. S3 turns those into full literals; the set must not change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON, readJSON, sourceScan } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);
const lang = readJSON(new URL("lang/en.json", ROOT));
const flat = (node, prefix = "", out = []) => {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, out);
    else out.push(key);
  }
  return out;
};
const KEYS = flat(lang);

test("lang/en.json: the key list (golden/lang-keys.json), every value a non-empty string", () => {
  assert.equal(KEYS.length, 46);   // LdPm43: + arcaneRecovery.left, have, grimoire, open
  pinJSON("lang-keys", KEYS, import.meta.url);
  for (const k of KEYS) assert.ok(typeof k === "string" && String(k.split(".").reduce((o, p) => o[p], lang)).trim(), k);
});

test("every full PENTARYN_RIDERS.* literal in the module's sources is a key", () => {
  const hits = sourceScan(ROOT, /["'`]PENTARYN_RIDERS\.[A-Za-z]+\.[A-Za-z.]+["'`]/);
  assert.ok(hits.length >= 20);
  for (const h of hits) {
    for (const m of h.text.matchAll(/["'`](PENTARYN_RIDERS\.[A-Za-z]+\.[A-Za-z.]+)["'`]/g)) assert.ok(KEYS.includes(m[1]), `${h.file}:${h.line} ${m[1]}`);
  }
});

test("the 21 keys built from prefixes today all exist", () => {
  const built = [
    ...["note.bonus", "note.min", "note.reroll", "battleMedic.flavor", "battleMedic.needTarget", "battleMedic.noHitDice", "battleMedic.noGM", "battleMedic.failed", "battleMedic.done", "battleMedic.doneShort", "hd.spend", "hd.restore"],
    ...["title", "intro", "recover", "cancel", "total", "done"].map(k => `arcaneRecovery.${k}`),
    ...["failed", "failedEnded", "success"].map(k => `concentration.${k}`),
  ].map(k => `PENTARYN_RIDERS.${k}`);
  assert.equal(built.length, 21);
  for (const k of built) assert.ok(KEYS.includes(k), k);
});

test("format placeholders as the call sites fill them", () => {
  const get = k => k.split(".").reduce((o, p) => o[p], lang);
  const ph = k => [...String(get(k)).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  assert.deepEqual(ph("PENTARYN_RIDERS.note.bonus"), ["label", "value"]);
  assert.deepEqual(ph("PENTARYN_RIDERS.note.min"), ["label", "n"]);
  assert.deepEqual(ph("PENTARYN_RIDERS.battleMedic.flavor"), ["faces", "target"]);
  assert.deepEqual(ph("PENTARYN_RIDERS.battleMedic.done"), ["faces", "healed", "max", "name", "value"]);
  assert.deepEqual(ph("PENTARYN_RIDERS.battleMedic.doneShort"), ["faces", "healed", "name"]);
  assert.deepEqual(ph("PENTARYN_RIDERS.arcaneRecovery.total"), ["cap", "used"]);
  assert.deepEqual(ph("PENTARYN_RIDERS.arcaneRecovery.done"), ["name", "slots"]);
  assert.deepEqual(ph("PENTARYN_RIDERS.summon.place"), ["name"]);
  for (const k of ["failed", "failedEnded", "success"]) assert.deepEqual(ph(`PENTARYN_RIDERS.concentration.${k}`), ["dc"]);
});
