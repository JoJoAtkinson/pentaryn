/**
 * Decision D1 [declared]: `attributes.lookup` and `study.examine` are the new names; the old
 * `attributes.describe` / `study.inspect` stay as aliases that log a compatibility warning until
 * the kit API (ties S8). The new names must answer exactly what the frozen characterisation pinned
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

test("the old names are aliases: same answer, one compatibility warning naming the new path", async () => {
  F.logged.length = 0;
  assert.deepEqual(T().attributes.describe("ashfallcompany"), T().attributes.lookup("ashfallcompany"));
  assert.equal(await T().study.inspect(null, { id: "x" }), false);
  const lines = compatLines();
  assert.equal(lines.length, 2, lines.join("\n"));
  assert.match(lines[0], /^pentaryn-ties \| game\.pentaryn\.ties\.attributes\.describe is renamed game\.pentaryn\.ties\.attributes\.lookup/);
  assert.match(lines[1], /^pentaryn-ties \| game\.pentaryn\.ties\.study\.inspect is renamed game\.pentaryn\.ties\.study\.examine/);
});

test("the alias warns once per call site (Foundry's `once`), so a loop is one line", () => {
  F.logged.length = 0;
  for (let i = 0; i < 3; i++) T().attributes.describe("greywatch");
  assert.equal(compatLines().length, 1);
});
