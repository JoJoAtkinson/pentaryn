/**
 * Decision D1 [declared]: `attributes.lookup` and `study.examine` are the new names. The old
 * `attributes.describe` / `study.inspect` were aliases that logged a compatibility warning until the
 * kit API (ties S8); B1b [declared] removed them there (the kit refuses reserved names at any depth). The new names must answer exactly what the frozen characterisation pinned
 * for the old ones (golden/attributes-describe.json, golden/study-inspect-gm.json).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./kit/harness.mjs";
import { boot } from "./fixtures/boot.mjs";
import { KIND_ACTOR, REGISTRY } from "./fixtures/registry.mjs";

const F = await boot({ settings: { "pentaryn-ties.attributes": REGISTRY }, actors: [KIND_ACTOR] });
const T = () => game.pentaryn.ties;
const golden = name => readJSON(new URL(`./golden/${name}.json`, import.meta.url));
const run = async (fn, args) => {
  try {
    return { out: JSON.parse(JSON.stringify((await fn(...args)) ?? null)) };
  } catch (err) {
    return { threw: String(err?.message ?? err) };
  }
};
const compatLines = () => F.logged.filter(l => l.level === "warn").map(l => String(l.args[0]?.message ?? l.args[0]));

test("attributes.lookup answers every pinned attributes.describe row identically, with no warning", async () => {
  const before = F.logged.length;
  for (const row of golden("attributes-describe")) {
    const { input, ...want } = row;
    assert.deepEqual(await run(T().attributes.lookup, input), want, JSON.stringify(input));
  }
  assert.equal(F.logged.length, before);
});

test("study.examine answers every pinned study.inspect refusal identically, with no warning", async () => {
  const before = F.logged.length;
  for (const row of golden("study-inspect-gm")) {
    const { input, ...want } = row;
    assert.deepEqual(await run(T().study.examine, input), want, JSON.stringify(input));
  }
  assert.equal(F.logged.length, before);
});

test("the new paths are the same functions the old names published", async () => {
  const Attributes = await import("../attributes.mjs");
  const Study = await import("../study.mjs");
  assert.equal(T().attributes.lookup, Attributes.describeRef);
  assert.equal(T().study.examine, Study.inspect);
});

test("B1b [declared]: the old names are gone — the kit reserves describe and inspect at any depth", () => {
  F.logged.length = 0;
  assert.equal(T().attributes.describe, undefined);
  assert.equal(T().study.inspect, undefined);
  assert.deepEqual(compatLines(), []);
});
