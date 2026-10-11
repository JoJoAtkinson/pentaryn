/**
 * Characterisation (prompts checkpoint, wave 3; guide step 3): replace.mjs against the stub world —
 * the kinds, dry-run plans, the resolve/plan refusals, real runs for light, tile, note, none, a
 * world actor, a patched copy and a hotspot, cleanup when a placement fails, the batch → one-by-one
 * fallback, DRY_RUN_REQUIRED, TEXT_CHANGED, MARKER_GONE's why, spec files, the encounter lines,
 * and the token data each path writes (prompts-lookup-24). Generated document ids are normalised
 * to `<id1>`, `<id2>`… by first appearance. KNOWN rows pin today's bugs as they are.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { installWorld, captureConsole, token, MODULE } from "./fixtures/world.mjs";
import { SIZE_BY_KEY } from "../geometry-core.mjs";

const NOW = 1760000000000;
const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");   // registers the settings gather's manifest ring is written to
const R = await import("../replace.mjs");
const { gather } = await import("../gather.mjs");
const { SIZE_WORDS } = await import("../actor-patch-adapter.mjs");

/** Generated ids (16 digits) → <id1>, <id2>… by first appearance; `at` timestamps are mocked. */
function ids(v) {
  const seen = new Map();
  const s = JSON.stringify(v ?? null).replace(/\b\d{16}\b/g, m => {
    if (!seen.has(m)) seen.set(m, `<id${seen.size + 1}>`);
    return seen.get(m);
  });
  return JSON.parse(s);
}
const lines = r => ({ ...r, text: r.text.split("\n") });

const ACTOR_OF = { tiny: "markerActortiny0", small: "markerActorsmall", mid: "markerActormid00", large: "markerActorlarge", xl: "markerActorxl000", xxl: "markerActorxxl00" };

/** A marker token placed straight into s1 (no hooks). */
function marker(id, size, x, y, text, extra = {}) {
  const w = SIZE_BY_KEY[size].w;
  const t = token({ id, name: `Prompt · ${size}`, actorId: ACTOR_OF[size], x, y, width: w, height: w, hidden: true,
    texture: { src: `modules/${MODULE}/assets/marker-${size}.webp` }, flags: { [MODULE]: { marker: size, prompt: text } }, ...extra }, F.s1);
  t.collection = F.s1.tokens;
  F.s1.tokens.set(id, t);
  return t;
}
const quiet = fn => captureConsole(fn).then(r => r.value);
const run = (input, opts) => quiet(() => R.replaceMany(input, opts));

test("KINDS and the exported constants", () => {
  assert.deepEqual([...R.KINDS], ["actor", "npc", "character", "hotspot", "note", "light", "tile", "none"]);
  assert.equal(Object.isFrozen(R.KINDS), true);
  assert.deepEqual([R.EYE, R.HOTSPOT_TEMPLATE, R.CREATURE_FOLDER, R.SPEC_DIR],
    ["assets/tokens/custom/props/icon-eye.webp", "Hotspot · Look (template)", "Foundry MCP Creatures", "pentaryn-prompts-specs"]);
});

test("dry runs: light, tile, none, note — text and first row (golden replace-dry)", async () => {
  const out = {};
  for (const w of [{ kind: "light", config: { dim: 10 } }, { kind: "tile", src: "a.webp" }, { kind: "none", reason: "r" },
    { kind: "note", name: "N", html: "<p>x</p>" }, { kind: "light", config: { dim: 10, bright: 5, color: "#9fd3ff" }, hidden: true },
    { kind: "tile", src: "b.webp", width: 2, height: 3 }, { kind: "note", name: "N2", html: "", light: { dim: 5 }, icon: "i.webp" }]) {
    const r = await run({ replacements: [{ sceneId: "s1", markerId: "m1", with: w }], dryRun: true });
    out[JSON.stringify(w)] = { text: r.text.split("\n"), row: r.results[0], remaining: r.remaining };
  }
  pinJSON("replace-dry", out, import.meta.url);
  assert.equal(F.calls.some(c => c.op === "createEmbeddedDocuments"), false, "a dry run writes nothing");
});

test("refusals at resolve and plan time: one BAD_SPEC (or coded) row each (golden replace-refusals)", async () => {
  const specs = [
    null,
    { sceneId: "s1", markerId: "m1", with: { kind: "x" } },
    { sceneId: "s1", markerId: "m1" },
    { markerId: "m1", with: { kind: "none" } },
    { sceneId: "nope", markerId: "m1", with: { kind: "none" } },
    { sceneId: "s1", markerId: "gone", with: { kind: "none" } },
    { sceneId: "s1", markerId: "tokOrdinary00001", with: { kind: "none" } },
    { call: "pm-zzzz", id: "p1", with: { kind: "none" } },
    { sceneId: "s1", markerId: "m1", with: { kind: "tile" } },
    { sceneId: "s1", markerId: "m1", with: { kind: "note", name: "N" } },
    { sceneId: "s1", markerId: "m1", with: { kind: "light", config: { dim: 10, radius: 3 } } },
    { sceneId: "s1", markerId: "m1", with: { kind: "light", config: [1] } },
    { sceneId: "s1", markerId: "m1", with: { kind: "note", name: "N", html: "", light: "bright" } },
    { sceneId: "s1", markerId: "m1", with: { kind: "hotspot", name: "H" } },
    { sceneId: "s1", markerId: "m1", with: { kind: "actor" } },
    { sceneId: "s1", markerId: "m1", with: { kind: "actor", actorId: "nope" } },
    { sceneId: "s1", markerId: "m1", with: { kind: "actor", uuid: "Scene.s1" } },
    { sceneId: "s1", markerId: "m1", with: { kind: "actor", actorId: "actorGuard000001", patch: { name: "X" } } },
    { sceneId: "s1", markerId: "m1", with: { kind: "actor", actorId: "actorGuard000001", copy: true, patch: { bogus: 1 } } },
    { sceneId: "s1", markerId: "m1", with: { kind: "actor", actorId: "actorGuard000001", copy: true, patch: { size: "colossal" } } },
    { sceneId: "s1", markerId: "m1", with: { kind: "npc" } },
    { sceneId: "s1", markerId: "m1", with: { kind: "npc", npc: { name: "N" } } },
    { sceneId: "s1", markerId: "m1", with: { kind: "character" } }
  ];
  const out = [];
  for (const s of specs) {
    const r = await run({ replacements: [s], dryRun: true });
    out.push({ spec: s, text: r.text.split("\n"), row: r.results[0] });
  }
  pinJSON("replace-refusals", out, import.meta.url);
});

test("the same marker twice in one call: the second row is refused", async () => {
  const r = await run({ replacements: [{ sceneId: "s1", markerId: "m1", with: { kind: "none" } }, { sceneId: "s1", markerId: "m1", with: { kind: "light" } }], dryRun: true });
  assert.equal(r.text.split("\n")[0], "replace (by marker) — dry run: 1 ok, 1 failed");
  assert.deepEqual([r.results[1].ok, r.results[1].code, r.results[1].error], [false, "BAD_SPEC", "m1 is replaced twice in this call"]);
});

test("argument checks before anything runs: a bad ring tier, an empty list; [declared] DP6 a non-array is BAD_SPEC (was a bare TypeError)", async () => {
  await assert.rejects(R.replaceMany({ replacements: [{ sceneId: "s1", markerId: "m1", ring: "gold", with: { kind: "none" } }] }),
    { code: "BAD_SPEC", message: "BAD_SPEC: ring must be pc|foe|named|mook|none, got gold" });
  await assert.rejects(R.replaceMany({ replacements: [] }), { code: "BAD_SPEC", message: "BAD_SPEC: replacements must be a non-empty array" });
  await assert.rejects(R.replaceMany({}), { code: "BAD_SPEC", message: "BAD_SPEC: replacements must be a non-empty array" });
  await assert.rejects(R.replaceMany({ replacements: { a: 1 } }), { code: "BAD_SPEC", message: "BAD_SPEC: replacements must be a non-empty array" });
});

test("replace(spec): run options are read from the spec or opts; a dryRun written in the spec stays a dry run", async () => {
  const r = await quiet(() => R.replace({ sceneId: "s1", markerId: "m1", with: { kind: "none" }, dryRun: true }));
  assert.equal(r.dryRun, true);
  const r2 = await quiet(() => R.replace({ sceneId: "s1", markerId: "m1", with: { kind: "none" } }, { dryRun: true }));
  assert.equal(r2.dryRun, true);
  const arr = await run([{ sceneId: "s1", markerId: "m1", with: { kind: "none" } }], { dryRun: true });
  assert.equal(arr.dryRun, true);
});

/* ── real runs ──────────────────────────────────────────────────────────── */

test("real run, light: AmbientLight at the marker centre with provenance, marker deleted, readback", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  marker("rl", "mid", 800, 600, "a brazier");
  const n0 = F.calls.length;
  const r = await run({ replacements: [{ sceneId: "s1", markerId: "rl", with: { kind: "light", config: { dim: 10 } }, note: "warm" }] });
  const calls = F.calls.slice(n0).filter(c => c.op !== "Hooks.callAll" && c.op !== "Hooks.call");
  pinJSON("replace-real-light", ids({ result: lines(r), calls }), import.meta.url);
  assert.equal(F.s1.tokens.get("rl"), undefined);
});

test("real runs, tile / note (with its light) / none (golden replace-real-kinds)", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  marker("rt", "large", 1200, 600, "a rug");
  marker("rn", "tiny", 1400, 600, "a letter");
  marker("rx", "mid", 1600, 600, "never mind");
  const n0 = F.calls.length;
  const r = await run({ replacements: [
    { sceneId: "s1", markerId: "rt", with: { kind: "tile", src: "rug.webp" }, hidden: true },
    { sceneId: "s1", markerId: "rn", name: "Letter", with: { kind: "note", name: "A letter", html: "<p>Dear…</p>", light: { dim: 5 }, ownership: { default: "limited", u1: "owner" } } },
    { sceneId: "s1", markerId: "rx", with: { kind: "none", reason: "cut from the scene" } }
  ] });
  const calls = F.calls.slice(n0).filter(c => c.op !== "Hooks.callAll" && c.op !== "Hooks.call");
  pinJSON("replace-real-kinds", ids({ result: lines(r), calls }), import.meta.url);
  for (const id of ["rt", "rn", "rx"]) assert.equal(F.s1.tokens.get(id), undefined);
});

test("real run, a world actor placed as it is and a patched copy (token data, ring, disposition, level)", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  marker("ra", "mid", 200, 800, "the guard", { level: "L2", elevation: 5 });
  marker("rc", "large", 400, 800, "a big guard");
  const n0 = F.calls.length;
  const r = await run({ replacements: [
    { sceneId: "s1", markerId: "ra", with: { kind: "actor", actorId: "actorGuard000001" }, name: "Gate guard", img: "g.webp", disposition: "neutral", ring: "named", hidden: true },
    { sceneId: "s1", markerId: "rc", with: { kind: "actor", actorId: "actorGuard000001", copy: true, patch: { name: "Big Guard", size: "large", cr: "1/4", disposition: "hostile", hp: { max: 30, formula: "4d10+8" }, ac: 15, speed: 25 } }, ring: "foe" }
  ] });
  const calls = F.calls.slice(n0).filter(c => c.op !== "Hooks.callAll" && c.op !== "Hooks.call");
  pinJSON("replace-real-actor", ids({ result: lines(r), calls }), import.meta.url);
});

/** The hotspot template: an item-piles actor that clones itself. */
function hotspotTemplate() {
  const tpl = F.addActor({ id: "actorHotspotTpl1", name: "Hotspot · Look (template)", type: "npc", folder: { id: "folderHotspots01" },
    flags: { "item-piles": { data: { enabled: true, type: "container", closed: false } } }, prototypeToken: { name: "Hotspot", width: 0.5, height: 0.5 } });
  Object.defineProperty(tpl, "clone", {
    enumerable: false, configurable: true,
    value: async (data, opts) => {
      F.calls.push({ op: "actor.clone", from: tpl.id, data: F.plain(data), opts: F.plain(opts) });
      const a = F.addActor({ ...structuredClone({ name: tpl.name, type: tpl.type, flags: tpl.flags, prototypeToken: tpl.prototypeToken }), ...data });
      Object.defineProperty(a, "createEmbeddedDocuments", { enumerable: false, value: async (type, rows) => { F.calls.push({ op: "actor.createEmbeddedDocuments", actor: a.id, type, data: F.plain(rows) }); return rows; } });
      return a;
    }
  });
  return tpl;
}

test("real run, hotspot: cloned template, inline items, item-piles data, token and its light", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  hotspotTemplate();
  marker("rh", "small", 200, 400, "a loose flagstone");
  const n0 = F.calls.length;
  const r = await run({ replacements: [{ sceneId: "s1", markerId: "rh", with: { kind: "hotspot", name: "Loose flagstone", description: "<p>Under it…</p>", locked: true,
    items: [{ data: { name: "Gem", type: "loot", system: { quantity: 1, price: { value: 50 } } }, quantity: 2 },
      { data: { name: "Ring of Warmth", type: "equipment", system: { description: { value: "<p>Requires attunement.</p>" } } }, rename: "Warm ring" }],
    light: { dim: 5 } } }] });
  const calls = F.calls.slice(n0).filter(c => c.op !== "Hooks.callAll" && c.op !== "Hooks.call");
  pinJSON("replace-real-hotspot", ids({ result: lines(r), calls }), import.meta.url);
});

test("hotspot dry run: a named item not in the books is BAD_SPEC with the inline-data hint (no packs)", async () => {
  const r = await run({ replacements: [{ sceneId: "s1", markerId: "m1", with: { kind: "hotspot", name: "H", items: [{ name: "Rope" }] } }], dryRun: true });
  assert.equal(r.results[0].error, "BAD_SPEC: hotspot items: no item \"Rope\" in dnd-players-handbook.equipment, dnd5e.equipment24; or pass {data: {name, type, system}} for a custom item");
  const r2 = await run({ replacements: [{ sceneId: "s1", markerId: "m1", with: { kind: "hotspot", name: "H", items: [{ data: { name: "x" } }] } }], dryRun: true });
  assert.equal(r2.results[0].error, "BAD_SPEC: hotspot item data needs name and type");
});

test("a placement that fails after its actor was made: CREATE_FAILED, the actor discarded, the marker kept", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  marker("rf", "mid", 1800, 800, "doomed");
  F.s1.fail.Token = "all";
  const n0 = F.calls.length;
  const r = await run({ replacements: [{ sceneId: "s1", markerId: "rf", with: { kind: "actor", actorId: "actorGuard000001", copy: true } }] });
  delete F.s1.fail.Token;
  const calls = F.calls.slice(n0).filter(c => ["Actor.create", "delete", "createEmbeddedDocuments", "deleteEmbeddedDocuments"].includes(c.op));
  pinJSON("replace-create-failed", ids({ result: lines(r), calls }), import.meta.url);
  assert.ok(F.s1.tokens.get("rf"));
  F.s1.tokens.delete("rf");
});

test("a refused batch create is retried one by one; a cancelled one is CREATE_FAILED", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  marker("b1", "mid", 100, 900, "one");
  marker("b2", "mid", 300, 900, "two");
  F.s1.fail.AmbientLight = "batch";
  const { value: r, out } = await captureConsole(() => R.replaceMany({ replacements: [
    { sceneId: "s1", markerId: "b1", with: { kind: "light" } }, { sceneId: "s1", markerId: "b2", with: { kind: "light" } }] }));
  delete F.s1.fail.AmbientLight;
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | batch AmbientLight create failed on ZZ Characterisation; retrying one by one Error(stub: AmbientLight create refused)"]);
  assert.deepEqual(r.results.map(x => x.ok), [true, true]);
  marker("b3", "mid", 500, 900, "three");
  F.s1.fail.Tile = "cancel";
  const r2 = await run({ replacements: [{ sceneId: "s1", markerId: "b3", with: { kind: "tile", src: "t.webp" } }] });
  delete F.s1.fail.Tile;
  assert.deepEqual([r2.results[0].ok, r2.results[0].code, r2.results[0].error], [false, "CREATE_FAILED", "CREATE_FAILED: creation was cancelled by a hook"]);
  F.s1.tokens.delete("b3");
});

test("DRY_RUN_REQUIRED over five; the same set after its dry run (or skipDryRun) runs", async () => {
  const specs = [0, 1, 2, 3, 4, 5].map(i => (marker(`d${i}`, "mid", 100 * i, 0, `d${i}`), { sceneId: "s1", markerId: `d${i}`, with: { kind: "none" } }));
  await assert.rejects(R.replaceMany({ replacements: specs }), {
    code: "DRY_RUN_REQUIRED",
    message: "DRY_RUN_REQUIRED: 6 replacements (over 5): run the same set with dryRun: true first, read the plan, then repeat it without dryRun"
  });
  await run({ replacements: specs, dryRun: true });
  const r = await run({ replacements: specs });
  assert.deepEqual(r.results.map(x => x.ok), [true, true, true, true, true, true]);
  const more = [0, 1, 2, 3, 4, 5].map(i => (marker(`e${i}`, "mid", 100 * i, 0, `e${i}`), { sceneId: "s1", markerId: `e${i}`, with: { kind: "none" } }));
  const r2 = await run({ replacements: more, skipDryRun: true });
  assert.equal(r2.results.length, 6);
});

test("by call + id: TEXT_CHANGED after an edit (force runs it), 'not a prompt', MARKER_GONE with the replacing document or the resized marker", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  marker("g1", "mid", 1500, 100, "a chest");
  marker("g2", "mid", 1700, 100, "a barrel");
  const { value: g } = await captureConsole(() => gather({ scenes: ["s1"], crops: "off" }));
  const pidOf = id => Object.entries(g.manifest.prompts).find(([, e]) => e.markerId === id)[0];
  F.s1.tokens.get("g1").flags[MODULE].prompt = "a locked chest";
  const changed = await run({ call: g.call, replacements: [{ id: pidOf("g1"), with: { kind: "none" } }], dryRun: true });
  assert.equal(changed.results[0].error, `TEXT_CHANGED: ${pidOf("g1")}: the prompt was edited after the gather; gather again (or force)`);
  const forced = await run({ call: g.call, force: true, replacements: [{ id: pidOf("g1"), with: { kind: "light" } }] });
  assert.equal(forced.results[0].ok, true);
  const notPrompt = await run({ call: g.call, replacements: [{ id: "t1", with: { kind: "none" } }], dryRun: true });
  assert.equal(notPrompt.results[0].error, `BAD_SPEC: t1 is not a prompt in ${g.call}`);
  const replaced = await run({ call: g.call, replacements: [{ id: pidOf("g1"), with: { kind: "none" } }], dryRun: true });
  assert.match(replaced.results[0].error, new RegExp(`^MARKER_GONE: ${pidOf("g1")} was already replaced on ZZ Characterisation \\(now AmbientLight "Light" \\[\\d{16}\\]\\); gather again for what is left$`));
  // resized twice: the chain is followed
  F.s1.tokens.delete("g2");
  marker("g2b", "large", 1700, 100, "a barrel", { flags: { [MODULE]: { marker: "large", prompt: "a barrel", swappedFrom: "g2" } } });
  marker("g2c", "xl", 1700, 100, "a barrel", { flags: { [MODULE]: { marker: "xl", prompt: "a barrel", swappedFrom: "g2b" } } });
  const resized = await run({ call: g.call, replacements: [{ id: pidOf("g2"), with: { kind: "none" } }], dryRun: true });
  assert.equal(resized.results[0].error, `MARKER_GONE: ${pidOf("g2")} was resized on ZZ Characterisation (now marker g2c); gather again`);
  const plain = await run({ replacements: [{ sceneId: "s1", markerId: "never", with: { kind: "none" } }], dryRun: true });
  assert.equal(plain.results[0].error, "MARKER_GONE: never no longer on ZZ Characterisation (deleted, or replaced outside this module); gather again");
  // an unknown call with sceneId + markerId still resolves by marker
  const fallback = await run({ call: "pm-zzzz", replacements: [{ id: "p9", sceneId: "s1", markerId: "m1", with: { kind: "none" } }], dryRun: true });
  assert.equal(fallback.results[0].ok, true);
  for (const id of ["g2b", "g2c"]) F.s1.tokens.delete(id);
});

test("encounter lines: the dry run's CR XP estimate and the real run's XP against the party budget", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  marker("x1", "mid", 200, 1400, "goblin");
  marker("x2", "mid", 400, 1400, "goblin");
  const scene2 = F.s1;
  const { value: g } = await captureConsole(() => gather({ scenes: ["s1"], crops: "off", party: "4x3" }));
  const pidOf = id => Object.entries(g.manifest.prompts).find(([, e]) => e.markerId === id)[0];
  const specs = [
    { id: pidOf("x1"), with: { kind: "actor", actorId: "actorGuard000001", copy: true, patch: { cr: 1, disposition: "hostile" } } },
    { id: pidOf("x2"), with: { kind: "actor", actorId: "actorGuard000001", copy: true, patch: { cr: "1/2" } }, disposition: "hostile" }
  ];
  const dry = await run({ call: g.call, replacements: specs, dryRun: true });
  const real = await run({ call: g.call, replacements: specs });
  pinJSON("replace-encounters", ids({ dry: dry.encounters, dryText: dry.text.split("\n"), real: real.encounters, realText: real.text.split("\n") }), import.meta.url);
  assert.ok(scene2);
});

test("prompts-lookup-9: npc size words and patch.SIZE_WORDS agree; the npc footprint follows the size (dry run)", async () => {
  F.CONFIG.queries["foundry-mcp-bridge.createNpcActor"] = async () => ({ success: true });
  const npc = size => ({ name: "Ogre", creatureType: "giant", size, cr: "2", hpAverage: 59, hpFormula: "7d10+21", acMode: "flat", acValue: 11,
    abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 } });
  const out = {};
  for (const size of ["tiny", "small", "medium", "large", "huge", "gargantuan"]) {
    const r = await run({ replacements: [{ sceneId: "s1", markerId: "m1", with: { kind: "npc", npc: npc(size) } }], dryRun: true });
    out[size] = { footprint: r.results[0].footprint, lockSize: r.results[0].lockSize, words: SIZE_WORDS[size] };
  }
  delete F.CONFIG.queries["foundry-mcp-bridge.createNpcActor"];
  assert.deepEqual(out, {
    tiny: { footprint: "0.5x0.5", lockSize: false, words: "tiny" }, small: { footprint: "1x1", lockSize: false, words: "sm" },
    medium: { footprint: "1x1", lockSize: false, words: "med" }, large: { footprint: "2x2", lockSize: false, words: "lg" },
    huge: { footprint: "3x3", lockSize: false, words: "huge" }, gargantuan: { footprint: "4x4", lockSize: false, words: "grg" }
  });
});

test("crNumber through the dry run's XP estimate: '1/4' 0.25 '3' 3 ' 1 / 2 ' '1/8' read; '' null undefined 'x' fall back to the actor's CR", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  marker("c1", "mid", 1600, 2400, "c");
  marker("c2", "mid", 1800, 2400, "c's friend");
  const { value: g } = await captureConsole(() => gather({ scenes: ["s1"], crops: "off", party: "4x3" }));
  const pid = Object.entries(g.manifest.prompts).find(([, e]) => e.markerId === "c1")[0];
  const xp = [];
  for (const cr of ["1/4", 0.25, "3", 3, "", null, undefined, "x", " 1 / 2 ", "1/8"]) {
    const r = await run({ call: g.call, replacements: [{ id: pid, with: { kind: "actor", actorId: "actorGuard000001", copy: true, patch: { cr, disposition: "hostile" } } }], dryRun: true });
    xp.push(r.encounters.find(e => e.xp !== undefined)?.xp ?? null);
  }
  // the guard's own CR is 1/8 (25 XP)
  assert.deepEqual(xp, [50, 50, 700, 700, 25, 25, 25, 25, 100, 25]);
  F.s1.tokens.delete("c1");
  F.s1.tokens.delete("c2");
});

/* ── spec files ─────────────────────────────────────────────────────────── */

test("specFile: outside the Data dir, unreadable, HTTP error, not JSON, no replacements; a good file supplies replacements, call and party", async () => {
  const saved = globalThis.fetch;
  const fetched = [];
  const serve = (status, body) => (globalThis.fetch = async (url, init) => (fetched.push([url.replace(/t=\d+/, "t=<now>"), init]), { ok: status === 200, status, text: async () => body }));
  try {
    await assert.rejects(R.replaceMany({ specFile: "../etc/passwd" }), { code: "BAD_SPEC", message: "BAD_SPEC: specFile must be under the Foundry Data directory (e.g. \"pentaryn-prompts-specs/<name>.json\"); got ../etc/passwd" });
    globalThis.fetch = async () => { throw new Error("offline"); };
    await assert.rejects(R.replaceMany({ specFile: "pentaryn-prompts-specs/a.json" }), { code: "BAD_SPEC", message: "BAD_SPEC: specFile pentaryn-prompts-specs/a.json: could not read (offline)" });
    serve(404, "");
    await assert.rejects(R.replaceMany({ specFile: "pentaryn-prompts-specs/a.json" }), { message: "BAD_SPEC: specFile pentaryn-prompts-specs/a.json: HTTP 404 (is it under the Data directory?)" });
    serve(200, "{replacements: []}");
    await assert.rejects(R.replaceMany({ specFile: "pentaryn-prompts-specs/a.json" }), err => err.code === "BAD_SPEC" && err.message.startsWith("BAD_SPEC: specFile pentaryn-prompts-specs/a.json: not JSON (") && err.message.endsWith(") — write JSON, not a JS object literal"));
    serve(200, "{\"call\": \"pm-1\"}");
    await assert.rejects(R.replaceMany({ specFile: "pentaryn-prompts-specs/a.json" }), { message: "BAD_SPEC: specFile pentaryn-prompts-specs/a.json: needs \"replacements\" (or be an array of them)" });
    serve(200, JSON.stringify({ call: "pm-file", party: "4x2", dryRun: false, replacements: [{ sceneId: "s1", markerId: "m1", with: { kind: "none" } }] }));
    const r = await run({ specFile: "pentaryn-prompts-specs/a.json", dryRun: true });
    assert.deepEqual([r.dryRun, r.call, r.results.length], [true, "pm-file", 1]);
    serve(200, JSON.stringify([{ sceneId: "s1", markerId: "m1", with: { kind: "none" } }]));
    const r2 = await run({ specFile: "pentaryn-prompts-specs/b.json", dryRun: true, call: "pm-arg" });
    assert.equal(r2.call, "pm-arg");
    assert.deepEqual(fetched.at(-1), ["/pentaryn-prompts-specs/b.json?t=<now>", { cache: "no-store" }]);
  } finally {
    globalThis.fetch = saved;
  }
});

/* ── the remaining run paths ────────────────────────────────────────────── */

test("a compendium actor is imported into 'Foundry MCP Creatures' (folder created once); copy: false refuses", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const source = Object.assign(Object.create(F.Actor.prototype), { documentName: "Actor", id: "packWolf00000001", name: "Wolf", type: "npc", pack: "dnd5e.monsters",
    system: { traits: { size: "med" }, details: { cr: 0.25 } }, prototypeToken: { name: "Wolf", width: 1, height: 1, disposition: -1 } });
  const world = Object.assign(Object.create(F.Actor.prototype), { documentName: "Actor", id: "actorGuard000001" });
  const savedFromUuid = globalThis.fromUuid;
  globalThis.fromUuid = async u => (u === "Compendium.dnd5e.monsters.Actor.wolf" ? source : u === "Actor.actorGuard000001" ? F.game.actors.get("actorGuard000001") : savedFromUuid(u));
  F.game.actors.fromCompendium = doc => ({ name: doc.name, type: doc.type, system: structuredClone(doc.system), prototypeToken: structuredClone(doc.prototypeToken) });
  try {
    marker("w1", "mid", 1200, 1200, "a wolf");
    marker("w2", "mid", 1400, 1200, "another wolf");
    const refused = await run({ replacements: [{ sceneId: "s1", markerId: "w1", with: { kind: "actor", uuid: "Compendium.dnd5e.monsters.Actor.wolf", copy: false } }], dryRun: true });
    assert.equal(refused.results[0].error, "BAD_SPEC: a compendium actor must be imported (copy: true)");
    const viaUuid = await run({ replacements: [{ sceneId: "s1", markerId: "w1", with: { kind: "actor", uuid: "Actor.actorGuard000001" } }], dryRun: true });
    assert.equal(viaUuid.results[0].ok, true, "a world actor by uuid is placed as it is");
    const n0 = F.calls.length;
    const r = await run({ replacements: [
      { sceneId: "s1", markerId: "w1", with: { kind: "actor", uuid: "Compendium.dnd5e.monsters.Actor.wolf" } },
      { sceneId: "s1", markerId: "w2", with: { kind: "actor", uuid: "Compendium.dnd5e.monsters.Actor.wolf", patch: { name: "Dire wolf" } } }] });
    pinJSON("replace-import", ids({ text: r.text.split("\n"), calls: F.calls.slice(n0).filter(c => ["Folder.create", "Actor.create"].includes(c.op)) }), import.meta.url);
    assert.equal(F.calls.slice(n0).filter(c => c.op === "Folder.create").length, 1);
  } finally {
    globalThis.fromUuid = savedFromUuid;
    assert.ok(world);
  }
});

test("an npc replacement end to end: the bridge's actor, its features, the recharge patch, the provenance (golden replace-npc)", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const q = (n, fn) => (F.CONFIG.queries[`foundry-mcp-bridge.${n}`] = fn);
  q("createNpcActor", async args => ({ success: true, actor: { id: F.addActor({ name: args.name, type: "npc", prototypeToken: { name: args.name, width: 2, height: 2 } }).id } }));
  q("addAttackToActor", async () => ({ success: true }));
  marker("n1", "large", 1600, 1200, "an ogre");
  const n0 = F.calls.length;
  const r = await run({ replacements: [{ sceneId: "s1", markerId: "n1", with: { kind: "npc", npc: { name: "Ogre", creatureType: "giant", size: "large", cr: "2", hpAverage: 59,
    hpFormula: "7d10+21", acMode: "default", abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 } },
    features: [{ featureType: "attack", featureName: "Rock", attackType: "ranged", rangeFt: 60, damageParts: [{ number: 2, denomination: 10, type: "bludgeoning" }], recharge: 5 }] } }] });
  for (const k of ["createNpcActor", "addAttackToActor"]) delete F.CONFIG.queries[`foundry-mcp-bridge.${k}`];
  const scrub = v => JSON.parse(JSON.stringify(ids(v)).replace(/Ogre \[pp-[A-Za-z0-9]{6}\]/g, "Ogre [pp-<rand>]"));
  pinJSON("replace-npc", scrub({ text: r.text.split("\n"), updates: F.calls.slice(n0).filter(c => c.op === "update" && c.documentName === "Actor").map(c => c.changes) }), import.meta.url);
});

test("note ownership words and numbers; a hotspot whose token is refused: its light warns, its clone is discarded (a failing delete is reported)", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const own = [];
  for (const [i, ownership] of [undefined, "none", "owner", 2, { default: "limited", u1: 3 }].entries()) {
    marker(`o${i}`, "tiny", 100 + 100 * i, 2600, "a note");
    await run({ replacements: [{ sceneId: "s1", markerId: `o${i}`, with: { kind: "note", name: `N${i}`, html: "", ownership } }] });
    own.push(F.calls.filter(c => c.op === "JournalEntry.create").at(-1).data.ownership);
  }
  assert.deepEqual(own, [{ default: 2 }, { default: 0 }, { default: 3 }, { default: 2 }, { default: 1, u1: 3 }]);
  // a light placed with a note: its failure is a WARN on the note's row
  marker("lw", "tiny", 800, 2600, "a lamp post note");
  F.s1.fail.AmbientLight = "cancel";
  const lit = await run({ replacements: [{ sceneId: "s1", markerId: "lw", with: { kind: "note", name: "Post", html: "", light: { dim: 5 } } }] });
  delete F.s1.fail.AmbientLight;
  assert.deepEqual([lit.results[0].ok, lit.results[0].warnings], [true, ["AmbientLight not placed: creation was cancelled by a hook"]]);
  // a hotspot whose token is refused: the clone is discarded; a clone whose delete throws is reported
  const tpl = F.game.actors.find(a => a.name === "Hotspot · Look (template)");
  const clone = tpl.clone;
  Object.defineProperty(tpl, "clone", { configurable: true, value: async (...a) => { const c = await clone(...a); Object.defineProperty(c, "delete", { value: async () => { throw new Error("locked"); } }); return c; } });
  marker("hf", "small", 1000, 2600, "a stash");
  F.s1.fail.Token = "all";
  const failed = await run({ replacements: [{ sceneId: "s1", markerId: "hf", with: { kind: "hotspot", name: "Stash" } }] });
  delete F.s1.fail.Token;
  assert.deepEqual(ids(failed.text.split("\n").slice(1, 3)), ["s1/hf hotspot: FAIL CREATE_FAILED: stub: Token create refused (markerDeleted=false)",
    "  s1/hf cleanup: could not delete Actor \"Stash\" [<id1>]: locked"]);
  F.s1.tokens.delete("hf");
});

test("a marker delete that fails after its replacement exists is warned, and the row says the marker stayed", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  marker("md", "mid", 1800, 2600, "a stool");
  const del = F.s1.deleteEmbeddedDocuments;
  Object.defineProperty(F.s1, "deleteEmbeddedDocuments", { configurable: true, value: async () => { throw new Error("busy"); } });
  const { value: r, out } = await captureConsole(() => R.replaceMany({ replacements: [{ sceneId: "s1", markerId: "md", with: { kind: "tile", src: "stool.webp" } }] }));
  Object.defineProperty(F.s1, "deleteEmbeddedDocuments", { configurable: true, value: del });
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | marker delete failed on ZZ Characterisation Error(busy)"]);
  assert.deepEqual([r.results[0].ok, r.results[0].markerDeleted], [true, false]);
  F.s1.tokens.delete("md");
});
