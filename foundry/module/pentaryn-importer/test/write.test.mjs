// The WRITE path (not a guide step-1 item; added so steps 3 and 4, which move every assertion site and
// the per-actor loop, have their effects pinned). The unchanged entry runs real imports against the stub
// world of fixtures/world.mjs: what is created, updated, deleted and stamped (F.calls, in order), the
// result, the toasts and the console — and each of the seven readback-assertion sites of
// items-journal-3 (snapshot :625, :668, :701, :746, :794, :894, :1110), whose class, message and toast
// must survive the move to failAssertion/refuse unchanged.
//
// Pins and the steps that may touch them: golden/write-console.json — step 4b ([declared] console prefix,
// D-I2) only. golden/write-*.json otherwise — no step may change them.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { makeWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const ROOT = new URL("..", import.meta.url);
const MODULE = "pentaryn-importer";
const manifest = manifestOf(ROOT);

const F = await installFoundry({
  user: { isGM: true },
  modules: [{ id: MODULE, version: manifest.version, flags: manifest.flags }],
  system: { id: "dnd5e", version: "6.0.6" },
});
game.release.generation = 14;
game.world.id = "w";
game.version = "14.369";
const W = makeWorld(F);

let body = null;
globalThis.fetch = async () => ({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(body) });

const toasts = [];
for (const level of ["error", "warn", "info"]) {
  const original = ui.notifications[level];
  ui.notifications[level] = (message, options) => {
    toasts.push([level, message, options ?? null]);
    return original(message, options);
  };
}

const consoleGolden = {};
async function run(key, actors, options = {}) {
  body = {
    $contract: "pentaryn/actors.json@1", targetSystem: "dnd5e", targetSystemVersion: "6.0", generation: 14,
    generator: "build_actors.py", generatorVersion: "1.0.0", generatedAt: "2026-10-10T00:00:00Z", sourceRevision: "abc1234",
    actors,
  };
  toasts.length = 0;
  const from = F.calls.length;
  const lines = [];
  const keep = {};
  for (const k of ["log", "warn", "error", "group", "groupEnd", "table"]) {
    keep[k] = console[k];
    console[k] = (...a) => { lines.push([k, ...a.map(x => (x instanceof Error ? `${x.name}: ${x.message}` : F.plain(x)))]); };
  }
  let result = null;
  let error = null;
  try {
    result = await game.pentaryn.import(options);
  } catch (err) {
    error = { name: err?.name, message: err?.message };
  } finally {
    Object.assign(console, keep);
  }
  consoleGolden[key] = lines;
  const writes = F.calls.slice(from).filter(c => c.op !== "notify" && !c.op.startsWith("Hooks."));
  return { result, error, toasts: toasts.slice(), writes };
}

await import("../pentaryn-importer.mjs");
{
  const log = console.log;
  console.log = () => {};
  F.fire("ready");
  console.log = log;
}

const npc = (slug, extra = {}) => ({
  name: slug.toUpperCase(), type: "npc", img: "icons/generated.webp",
  system: { attributes: { hp: { value: 9, max: 9, formula: "2d8" } } },
  prototypeToken: { name: slug.toUpperCase(), width: 1, texture: { src: "tokens/generated.webp" } },
  flags: { pentaryn: { slug, contentHash: `sha256:${slug}-new`, sources: ["MM"] } },
  ...extra,
});
const bite = {
  name: "Bite", type: "weapon", img: "icons/bite.webp",
  system: { activities: { biteAttack000001: { _id: "biteAttack000001", type: "attack", attack: { bonus: "+4", flat: true } } } },
  flags: { pentaryn: { action: "bite" } },
};
const breath = {
  name: "Breath", type: "feat",
  system: {
    uses: { max: "1", recovery: [{ period: "recharge", type: "recharge", formula: "5" }] },
    activities: { breathSave000001: { _id: "breathSave000001", type: "save", save: { dc: { formula: "13" } } } },
  },
  flags: { pentaryn: { action: "breath" } },
};

test("a full import: create, update in place, skip unchanged, a per-actor failure, duplicate slug", async () => {
  // existing actors: a wounded "alpha" with one managed and one hand-added Item, an unchanged "charlie"
  W.makeActor({
    name: "Alpha (old)", type: "npc", img: "icons/hand-curated.webp",
    system: { attributes: { hp: { value: 3, max: 7 } } },
    prototypeToken: { name: "Alpha", width: 1, texture: { src: "tokens/hand-curated.webp" } },
    flags: { pentaryn: { slug: "alpha", contentHash: "sha256:alpha-old", primarySource: "MM" } },
  }, { items: [{ name: "Old Bite", type: "weapon", flags: { pentaryn: { action: "bite" } } }, { name: "Hand Axe", type: "weapon" }] });
  W.makeActor({ name: "Charlie", type: "npc", flags: { pentaryn: { slug: "charlie", contentHash: "sha256:charlie-new" } } });
  W.K.failCreate.add("echo");

  const o = await run("full", [
    npc("alpha", {
      items: [bite, breath],
      expected: {
        actor: { "system.attributes.hp.max": 9, name: "ALPHA" },
        items: [
          { action: "bite", itemType: "weapon", activities: [{ id: "biteAttack000001", "labels.toHit": "+4" }] },
          { action: "breath", itemLabels: { recharge: "Recharge 5" }, activities: [{ id: "breathSave000001", "labels.save": "DC 13" }], uses: { max: "1" } },
        ],
      },
    }),
    npc("bravo", { items: [bite], expected: { actor: { "system.attributes.hp.value": 9 } } }),
    npc("charlie"),
    npc("echo"),
    npc("dup", { flags: { pentaryn: { slug: "dup", contentHash: "sha256:dup-1" } } }),
    npc("dup", { flags: { pentaryn: { slug: "dup", contentHash: "sha256:dup-2" } } }),
  ]);
  assert.equal(o.error, null);
  assert.equal(o.result.ok, false, "echo failed");
  assert.deepEqual([o.result.created, o.result.updated, o.result.skipped], [["bravo", "dup"], ["alpha", "dup"], ["charlie"]]);
  assert.deepEqual(o.result.failed, [{ slug: "echo", error: "Actor validation errors: echo" }]);
  assert.equal(o.result.counts.assertions, 7, "alpha 2 actor + bite 2 + breath 2 (the non-scalar `uses` is warned, not counted); bravo 1");
  assert.equal(o.result.deleteJson.required, false);

  const alpha = game.actors.find(a => a.flags.pentaryn?.slug === "alpha");
  assert.equal(alpha.system.attributes.hp.value, 3, "hp.value is never written on an update (§3, §12)");
  assert.equal(alpha.img, "icons/hand-curated.webp");
  assert.equal(alpha.prototypeToken.texture.src, "tokens/hand-curated.webp");
  assert.equal(alpha.flags.pentaryn.contentHash, "sha256:alpha-new");
  assert.equal(alpha.flags.pentaryn.primarySource, "MM", "sibling flags survive the stamp");
  assert.deepEqual(alpha.items.map(i => i.name), ["Hand Axe", "Bite", "Breath"]);
  assert.deepEqual(o.toasts, [["warn", "[pentaryn-importer] 1 actor(s) failed — see the console for the per-slug report.", { permanent: true }]]);

  pinJSON("write-full", { result: o.result, writes: o.writes, toasts: o.toasts }, import.meta.url);
});

test("unmanagedItems:'delete' removes hand-added Items too; force rewrites an unchanged actor", async () => {
  const o = await run("deleteForce", [npc("alpha", { items: [bite] }), npc("charlie")], { unmanagedItems: "delete", force: true });
  assert.equal(o.error, null);
  assert.deepEqual([o.result.created, o.result.updated, o.result.skipped], [[], ["alpha", "charlie"], []]);
  assert.deepEqual(game.actors.find(a => a.flags.pentaryn?.slug === "alpha").items.map(i => i.name), ["Bite"]);
  assert.deepEqual(o.toasts, [
    ["info", "[pentaryn-importer] 0 created, 2 updated, 0 unchanged.", null],
    ["warn", "[pentaryn-importer] Import done. Delete Data/worlds/w/actors.json — it is served publicly.", { permanent: true }],
  ]);
  pinJSON("write-delete-force", { result: o.result, writes: o.writes }, import.meta.url);
});

/* ── the seven assertion sites (items-journal-3) ──────────────────────────────────────────────── */

/** Each case imports a NEW actor then a second one; the run must stop at the first, unstamped. */
const SITES = [
  [":625 assertValue (actor path)", () => npc("s625", { expected: { actor: { "system.attributes.hp.max": 10 } } })],
  [":668 prototype token strip", () => npc("s668", { prototypeToken: { width: 1, vaule: 3 } })],
  [":701 activity ids regenerated", () => npc("s701", { items: [bite] }), { regenIds: true }],
  [":746 expected item missing", () => npc("s746", { items: [bite], expected: { items: [{ action: "claw" }] } })],
  [":794 expected activity missing", () => npc("s794", { items: [bite], expected: { items: [{ action: "bite", activities: [{ id: "nope" }] }] } })],
  [":894 Item silently dropped", () => npc("s894", { items: [bite, { ...breath, type: "bogus" }] }), { dropTypes: new Set(["bogus"]) }],
  [":1110 payload Item without an action", () => npc("s1110a", { items: [{ name: "Loose", type: "loot" }] })],
  [":1110 action flag stripped", () => npc("s1110b", { items: [bite] }), { stripAction: new Set(["bite"]) }],
];
const siteResults = {};
for (const [label, make, knobs = {}] of SITES) {
  test(`assertion site ${label}: PentarynAssertionError, one toast, run stops, hash not stamped`, async () => {
    const saved = { ...W.K };
    Object.assign(W.K, knobs);
    let o;
    try {
      o = await run(`site ${label}`, [make(), npc(`after-${label.split(" ")[0].slice(1)}`)]);
    } finally {
      Object.assign(W.K, saved);
    }
    assert.equal(o.error?.name, "PentarynAssertionError");
    assert.match(o.error.message, /^READBACK ASSERTION FAILED — aborting the whole run\.\n {2}where: {4}actor "/);
    assert.deepEqual(o.toasts, [["error", `[pentaryn-importer] ${o.error.message}`, { permanent: true, console: false }]]);
    assert.equal(o.writes.filter(c => c.op === "Actor.create").length, 1, "the second actor is never reached");
    assert.equal(o.writes.some(c => c.op === "update" && JSON.stringify(c.changes).includes("contentHash")), false);
    siteResults[label] = { message: o.error.message, writes: o.writes.map(c => c.op) };
  });
}
test("assertion sites: messages and write sequences (golden/write-sites.json)", () => {
  pinJSON("write-sites", siteResults, import.meta.url);
});

test("console lines of every write-path run (golden/write-console.json)", () => {
  pinJSON("write-console", consoleGolden, import.meta.url);
});
