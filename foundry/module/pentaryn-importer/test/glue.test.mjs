// Glue characterisation (guide step 1.5 and 1.7; behaviour tests of items-journal-1, -3, -4). The
// unchanged entry is loaded as Foundry would on a GM client and its `ready` hook fired; effects are
// pinned: the published root, what `import()` returns, the fetch it makes, the toasts it raises and
// the console text it writes. Timers are mocked; fetch is a stub; no Actor is ever written here.
//
// Pins and the steps that may touch them:
//   golden/console.json — every console line, keyed by case. Step 4b ([declared] console prefix,
//                         D-I2) rewrites exactly this file and nothing else.
//   golden/root.json    — the published root and both load orders. Rewritten once, by step 7
//                         ([declared] keystone, items-journal-1: the root is merged into, never
//                         replaced or frozen), together with the root tests below that were
//                         KNOWN items-journal-1 rows until then.
//   the items-journal-4 re-entrancy test — was a KNOWN row; flipped by the standalone re-entrancy
//                         commit ([declared] D-I3).
//   golden/dryrun.json, golden/results.json, golden/refusals.json (toast text included) — no step
//   may change them.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { manifestOf, pinJSON, readJSON } from "./kit/harness.mjs";
import { publishNamespace } from "../lib/publish.mjs";
import * as oracle from "./fixtures/legacy-importer.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const ROOT = new URL("..", import.meta.url);
const MODULE = "pentaryn-importer";
const ENTRY = "../pentaryn-importer.mjs";
const manifest = manifestOf(ROOT);

const F = await installFoundry({
  user: { isGM: true },
  // the real module.json flags, so the Wave 7 batch (step 9) cannot drop the gate's keys unseen
  modules: [{ id: MODULE, version: manifest.version, flags: manifest.flags }, { id: "pentaryn-zz" }],
  system: { id: "dnd5e", version: "6.0.6" },
  actors: [
    { id: "actorAlpha000001", name: "Alpha", flags: { pentaryn: { slug: "a", contentHash: "sha256:a-old" } } },
    { id: "actorCharl000001", name: "Charlie", flags: { pentaryn: { slug: "c", contentHash: "sha256:c-same" } } },
    { id: "actorHand0000001", name: "Hand-made", flags: {} },
  ],
});
game.release.generation = 14;
game.world.id = "w";
game.version = "14.369";

/* ── stubs: getDocumentClass, fetch, toasts, console ─────────────────────────────────────────── */

globalThis.getDocumentClass = () => class StubActor {
  static async create() {
    throw new Error("characterisation never creates an Actor");
  }
};

const fetches = [];
let respond = () => { throw new Error("no fetch response configured"); };
globalThis.fetch = (url, init = {}) => {
  fetches.push({ url, cache: init.cache, signal: init.signal instanceof AbortSignal });
  return respond(url, init);
};
const response = (body, { status = 200, statusText = "OK" } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});
const serve = (body, opts) => { respond = async () => response(body, opts); };

const toasts = [];
for (const level of ["error", "warn", "info"]) {
  const original = ui.notifications[level];
  ui.notifications[level] = (message, options) => {
    toasts.push([level, message, options ?? null]);
    return original(message, options);
  };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const CONSOLE = ["log", "warn", "error", "group", "groupEnd", "table"];
async function withConsole(fn) {
  const lines = [];
  const keep = {};
  for (const k of CONSOLE) {
    keep[k] = console[k];
    console[k] = (...a) => { lines.push([k, ...a.map(x => (x instanceof Error ? `${x.name}: ${x.message}` : F.plain(x)))]); };
  }
  let value;
  try {
    value = await fn();
  } finally {
    Object.assign(console, keep);
  }
  return { lines, value };
}
/** Run fn and capture what it throws (name, message), its toasts, its fetches and its console. */
async function outcome(fn) {
  toasts.length = 0;
  fetches.length = 0;
  let error = null;
  let code = null;
  let result = null;
  const { lines } = await withConsole(async () => {
    try {
      result = await fn();
    } catch (err) {
      error = { name: err?.name, message: err?.message, isError: err instanceof Error };
      code = err?.code ?? null;   // beside error, not in it: the frozen refusal pins stay as they are
    }
  });
  return { error, code, result, toasts: toasts.slice(), fetches: fetches.slice(), console: lines };
}

/** Keyed golden: each test checks its own key; the last test pins the whole file (no stray keys). */
const keyed = {};
function pinKey(file, key, value) {
  keyed[file] ??= {};
  keyed[file][key] = JSON.parse(JSON.stringify(value ?? null));
  if (process.env.GOLDEN_UPDATE === "1") return;
  const golden = readJSON(new URL(`golden/${file}.json`, import.meta.url));
  assert.deepStrictEqual(keyed[file][key], golden[key], `golden ${file}.json → ${key}`);
}

const valid = (actors = [], extra = {}) => ({
  $contract: "pentaryn/actors.json@1", targetSystem: "dnd5e", targetSystemVersion: "6.0", generation: 14,
  generator: "build_actors.py", generatorVersion: "1.0.0", generatedAt: "2026-10-10T00:00:00Z", sourceRevision: "abc1234",
  actors, ...extra,
});
const entry = (slug, hash, extra = {}) => ({
  name: slug.toUpperCase(), type: "npc", flags: { pentaryn: { slug, ...(hash ? { contentHash: hash } : {}) } }, ...extra,
});

/* ── load + ready ─────────────────────────────────────────────────────────────────────────────── */

assert.equal(game.pentaryn, undefined, "nothing is published before the entry loads");
await import(ENTRY);
assert.equal(game.pentaryn, undefined, "nothing is published at load");
const ready = await withConsole(() => F.fire("ready"));
const root = game.pentaryn;
const imp = root.import;

test("foundry.utils is Foundry's own common/ code", () => {
  console.log(`# foundry ${F.foundryBuild ?? "unknown"} · utils from ${F.utilsSource}`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("ready: one console line", () => {
  pinKey("console", "ready", ready.lines);
});

// [declared] items-journal-1 (guide step 7, D-I1): the legacy keys are MERGED into game.pentaryn,
// which is no longer replaced or frozen; the importer's own namespace sits beside them.
test("ready: the legacy root keys merged into an unfrozen root, beside the importer namespace (golden/root.json → fresh)", () => {
  assert.deepEqual(Object.keys(root), ["import", "moduleId", "contract", "_internals", "importer"]);
  assert.equal(root.contract, "pentaryn/actors.json@1");
  assert.equal(root.moduleId, MODULE);
  assert.equal(typeof root.import, "function");
  assert.equal(root.importer.import, root.import);
  assert.equal(root.importer, game.modules.get(MODULE).api);
  assert.equal(Object.isFrozen(root), false);
  assert.equal(Object.isFrozen(root._internals), true);
  assert.deepEqual(Object.keys(root._internals), ["fetchJsonWithTimeout", "lintFormulas", "valuesMatch", "normalise"]);
  assert.deepEqual(root.namespaces(), ["importer"]);
  game.pentaryn.attunement = {};
  assert.deepEqual(game.pentaryn.attunement, {}, "a later module assigns into the root directly");
  delete game.pentaryn.attunement;
  pinKey("root", "fresh", {
    keys: Object.keys(root), frozen: Object.isFrozen(root), internalsFrozen: Object.isFrozen(root._internals),
    internals: Object.keys(root._internals), contract: root.contract, moduleId: root.moduleId, namespaces: root.namespaces(),
  });
});

test("the live _internals agree with the oracle (real foundry.utils vs the pasted getProperty)", () => {
  const { lintFormulas, valuesMatch, normalise } = root._internals;
  const actors = [
    { flags: { pentaryn: { slug: "s" } }, system: { attributes: { hp: { formula: "2d8+@abilities.con.mod" }, movement: { walk: "ft" } } } },
    { name: "Named", items: [{ system: { activities: { a: { attack: { bonus: "@prof" } } } } }] },
    { "flags.pentaryn.slug": "literal", system: { attributes: { init: { bonus: "@x" } } } },
    null,
  ];
  assert.deepEqual(lintFormulas(actors), oracle.lintFormulas(actors));
  assert.equal(lintFormulas(actors).length, 4);
  for (const [e, a] of [[3, "3"], [0, ""], [null, undefined], ["DC 13", "DC 13 "], [true, "true"]]) {
    assert.equal(valuesMatch(e, a), oracle.valuesMatch(e, a));
  }
  assert.equal(normalise("  a  b "), oracle.normalise("  a  b "));
});

/* ── import(): success paths ──────────────────────────────────────────────────────────────────── */

test("dry run on a valid empty manifest (golden/dryrun.json, key order included)", async () => {
  serve(valid());
  const calls = F.calls.length;
  const o = await outcome(() => imp({ dryRun: true }));
  assert.equal(o.error, null);
  pinJSON("dryrun", o.result, import.meta.url);
  assert.equal(JSON.stringify(o.result), JSON.stringify(readJSON(new URL("golden/dryrun.json", import.meta.url))));
  assert.deepEqual(o.fetches, [{ url: "/worlds/w/actors.json", cache: "no-cache", signal: true }]);
  assert.deepEqual(o.toasts, []);
  assert.deepEqual(F.calls.slice(calls).filter(c => c.op !== "notify"), [], "no document writes");
  pinKey("console", "dryRunEmpty", o.console);
});

test("full run on a valid empty manifest: the summary info toast, then the delete-the-JSON warning", async () => {
  serve(valid());
  const o = await outcome(() => imp());
  assert.equal(o.error, null);
  assert.equal(o.result.deleteJson.required, true);
  assert.deepEqual(o.toasts, [
    ["info", "[pentaryn-importer] 0 created, 0 updated, 0 unchanged.", null],
    ["warn", "[pentaryn-importer] Import done. Delete Data/worlds/w/actors.json — it is served publicly.", { permanent: true }],
  ]);
  pinKey("results", "runEmpty", o.result);
  pinKey("console", "runEmpty", o.console);
});

test("dry run over existing actors: update / create / skip by slug and contentHash; only; force", async () => {
  const actors = [
    entry("a", "sha256:a-new", { items: [{ name: "Bite", flags: { pentaryn: { action: "bite" } } }] }),
    entry("b", "sha256:b"),
    entry("c", "sha256:c-same"),
    entry("d", null),
  ];
  serve(valid(actors, { skipped: [{ row: 1 }] }));
  const plain = await outcome(() => imp({ dryRun: true }));
  const only = await outcome(() => imp({ dryRun: true, only: ["c", "b"] }));
  const force = await outcome(() => imp({ dryRun: true, force: true }));
  for (const o of [plain, only, force]) {
    assert.equal(o.error, null);
    assert.deepEqual(o.toasts, []);
  }
  assert.deepEqual([plain.result.created, plain.result.updated, plain.result.skipped], [["b", "d"], ["a"], ["c"]]);
  assert.deepEqual([only.result.created, only.result.updated, only.result.skipped], [["b"], [], ["c"]]);
  assert.deepEqual([force.result.created, force.result.updated, force.result.skipped], [["b", "d"], ["a", "c"], []]);
  pinKey("results", "dryRunActors", { plain: plain.result, only: only.result, force: force.result });
  pinKey("console", "dryRunActors", { plain: plain.console, only: only.console, force: force.console });
});

test("a custom path and timeout reach getRoute and fetch", async () => {
  serve(valid());
  const o = await outcome(() => imp({ dryRun: true, path: "worlds/other/export.json", timeout: 50 }));
  assert.equal(o.error, null);
  assert.deepEqual(o.fetches, [{ url: "/worlds/other/export.json", cache: "no-cache", signal: true }]);
  assert.equal(o.result.path, "worlds/other/export.json");
  assert.equal(o.result.url, "/worlds/other/export.json");
  pinKey("console", "customPath", o.console);
});

/* ── import(): refusals ───────────────────────────────────────────────────────────────────────── */

/** A shouted refusal: one permanent error toast carrying `[pentaryn-importer] <the thrown message>`. */
function assertShouted(o, name) {
  assert.ok(o.error, "it must reject");
  assert.equal(o.error.name, name);
  assert.deepEqual(o.toasts, [["error", `[pentaryn-importer] ${o.error.message}`, { permanent: true, console: false }]]);
}
const refusal = o => ({ name: o.error?.name ?? null, message: o.error?.message ?? null, toasts: o.toasts, fetched: o.fetches.length });

test("version gate: targetSystemVersion 5.3 → PentarynAbort, both minor-version problems, one toast", async () => {
  serve(valid([], { targetSystemVersion: "5.3" }));
  const o = await outcome(() => imp({ dryRun: true }));
  assertShouted(o, "PentarynAbort");
  assert.equal(o.error.message, [
    "VERSION GATE FAILED — nothing was imported.",
    '  • targetSystemVersion is "5.3" but the installed dnd5e is 6.0.6 (major.minor 6.0). dnd5e minor releases move the activity schema; refusing.',
    '  • targetSystemVersion is "5.3" but module.json expects "6.0".',
  ].join("\n"));
  pinKey("refusals", "gateMinor", refusal(o));
  pinKey("console", "gateMinor", o.console);
});

test("version gate: an empty manifest lists every problem at once", async () => {
  serve({});
  const o = await outcome(() => imp({ dryRun: true }));
  assertShouted(o, "PentarynAbort");
  assert.equal(o.error.message.split("\n").length, 9);
  pinKey("refusals", "gateEmpty", refusal(o));
});

test("version gate: a module.json that disagrees with the code's contract and system", async () => {
  const flags = game.modules.get(MODULE).flags;
  game.modules.get(MODULE).flags = { pentaryn: { ...flags.pentaryn, contract: "pentaryn/actors.json@0", targetSystem: "pf2e", generation: 13 } };
  try {
    serve(valid());
    const o = await outcome(() => imp({ dryRun: true }));
    assertShouted(o, "PentarynAbort");
    pinKey("refusals", "gateModuleJson", refusal(o));
  } finally {
    game.modules.get(MODULE).flags = flags;
  }
});

test("module.json without flags.pentaryn → PentarynAbort, no toast", async () => {
  const flags = game.modules.get(MODULE).flags;
  game.modules.get(MODULE).flags = {};
  try {
    serve(valid());
    const o = await outcome(() => imp({ dryRun: true }));
    assert.equal(o.error.name, "PentarynAbort");
    assert.deepEqual(o.toasts, []);
    pinKey("refusals", "noModuleFlags", refusal(o));
  } finally {
    game.modules.get(MODULE).flags = flags;
  }
});

test("@ref lint: hp.formula '@x' → PentarynAbort, one toast, nothing imported", async () => {
  serve(valid([entry("a", "h", { system: { attributes: { hp: { formula: "@x" } } } })]));
  const o = await outcome(() => imp({ dryRun: true }));
  assertShouted(o, "PentarynAbort");
  pinKey("refusals", "lint", refusal(o));
  pinKey("console", "lint", o.console);
});

test("a malformed entry (no slug) is shouted and rethrown as the PentarynAbort it is", async () => {
  serve(valid([{ name: "Nameless" }]));
  const o = await outcome(() => imp({ dryRun: true }));
  assertShouted(o, "PentarynAbort");
  pinKey("refusals", "noSlug", refusal(o));
});

test("a null entry: preparePayload's TypeError is shouted and rethrown unchanged (snapshot :1029)", async () => {
  serve(valid([null]));
  const o = await outcome(() => imp({ dryRun: true }));
  assertShouted(o, "TypeError");
  pinKey("refusals", "nullEntry", refusal(o));
});

test("non-GM → PentarynAbort with the guide's text, one toast, no fetch", async () => {
  game.user.isGM = false;
  try {
    const o = await outcome(() => imp({ dryRun: true }));
    assertShouted(o, "PentarynAbort");
    assert.equal(o.error.message, "Refusing to import: only a GM can create or update world Actors.");
    assert.equal(o.fetches.length, 0);
    pinKey("refusals", "notGM", refusal(o));
  } finally {
    game.user.isGM = true;
  }
});

test("unmanagedItems other than keep/delete → PentarynAbort, no toast, no fetch", async () => {
  const o = await outcome(() => imp({ dryRun: true, unmanagedItems: "purge" }));
  assert.equal(o.error.name, "PentarynAbort");
  assert.deepEqual(o.toasts, []);
  assert.equal(o.fetches.length, 0);
  pinKey("refusals", "unmanagedItems", refusal(o));
});

// importer-R3 [declared]: only, timeout and path are shape-checked like unmanagedItems — a bad shape
// is an unshouted BAD_ARGS before any fetch, naming the option and the value it got.
test("importer-R3: a bad only / timeout / path → PentarynAbort BAD_ARGS, no toast, no fetch", async () => {
  serve(valid([entry("b", "h")]));
  const bad = {
    badOnlyString: { only: "x" },
    badOnlyItems: { only: ["b", 7] },
    badTimeoutNull: { timeout: null },
    badTimeoutZero: { timeout: 0 },
    badTimeoutNaN: { timeout: NaN },
    badPathEmpty: { path: "" },
    badPathNull: { path: null },
  };
  for (const [key, opts] of Object.entries(bad)) {
    const o = await outcome(() => imp({ dryRun: true, ...opts }));
    assert.equal(o.error?.name, "PentarynAbort", `${key} must reject PentarynAbort`);
    assert.equal(o.code, "BAD_ARGS", key);
    assert.deepEqual(o.toasts, [], `${key}: no toast`);
    assert.equal(o.fetches.length, 0, `${key}: no fetch`);
    pinKey("refusals", key, refusal(o));
  }
});

test("importer-R3: import(null) is import({}); only: [] and only: null are accepted", async () => {
  serve(valid());   // a real run with no actors: nothing to write
  const asNull = await outcome(() => imp(null));
  assert.equal(asNull.error, null, "import(null) runs with the defaults");
  assert.equal(asNull.result.dryRun, false);
  assert.equal(asNull.result.path, "worlds/w/actors.json");
  serve(valid([entry("b", "h")]));
  const none = await outcome(() => imp({ dryRun: true, only: [] }));
  assert.equal(none.error, null);
  assert.equal(none.result.counts.selected, 0);
  const all = await outcome(() => imp({ dryRun: true, only: null }));
  assert.equal(all.error, null);
  assert.equal(all.result.counts.selected, 1);
});

test("fetch failures are PentarynAbort without a toast: HTTP 404, HTML body, network error", async () => {
  serve("Not here", { status: 404, statusText: "Not Found" });
  const notFound = await outcome(() => imp({ dryRun: true }));
  serve("<!DOCTYPE html><html><head><title>Foundry Virtual Tabletop</title></head></html>");
  const html = await outcome(() => imp({ dryRun: true }));
  respond = async () => { throw new TypeError("Failed to fetch"); };
  const network = await outcome(() => imp({ dryRun: true }));
  for (const o of [notFound, html, network]) {
    assert.equal(o.error.name, "PentarynAbort");
    assert.deepEqual(o.toasts, []);
  }
  pinKey("refusals", "fetch404", refusal(notFound));
  // the parenthetical is V8's JSON.parse text (it changes between node releases); the frame around it is ours
  assert.match(html.error.message, /^\/worlds\/w\/actors\.json did not contain JSON \(.+\)\. First 120 characters: "/);
  const v8 = { ...html.error, message: html.error.message.replace(/did not contain JSON \(.+?\)\. First/, "did not contain JSON (<V8 JSON.parse message>). First") };
  pinKey("refusals", "fetchHtml", refusal({ ...html, error: v8 }));
  pinKey("refusals", "fetchNetwork", refusal(network));
});

test("fetch timeout: the 15000 ms default, then a custom 50 ms → PentarynAbort without a toast", async () => {
  respond = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason));
  });
  const run = async (opts, ms) => {
    let o;
    const pending = outcome(() => imp(opts)).then(v => { o = v; });
    await flush();
    mock.timers.tick(ms - 1);
    await flush();
    assert.equal(o, undefined, `still waiting at ${ms - 1} ms`);
    mock.timers.tick(1);
    await pending;
    return o;
  };
  const byDefault = await run({ dryRun: true }, 15000);
  const custom = await run({ dryRun: true, timeout: 50 }, 50);
  for (const o of [byDefault, custom]) {
    assert.equal(o.error.name, "PentarynAbort");
    assert.deepEqual(o.toasts, []);
  }
  pinKey("refusals", "timeoutDefault", refusal(byDefault));
  pinKey("refusals", "timeoutCustom", refusal(custom));
});

// Was KNOWN items-journal-4 (two overlapping calls both ran to the end); flipped by the standalone
// re-entrancy commit ([declared] D-I3): the second call rejects PentarynAbort, the first is unaffected,
// and the guard is released after a success and after a failure.
test("re-entrancy: an overlapping second call rejects PentarynAbort; later calls run (items-journal-4)", async () => {
  respond = () => new Promise(resolve => setTimeout(() => resolve(response(valid([entry("b", "h")]))), 10));
  toasts.length = 0;
  const { value } = await withConsole(async () => {
    const a = imp({ dryRun: true });
    const b = imp({ dryRun: true });
    await flush();
    mock.timers.tick(10);
    return Promise.allSettled([a, b]);
  });
  assert.deepEqual(value.map(s => s.status), ["fulfilled", "rejected"]);
  assert.equal(value[0].value.ok, true);
  assert.equal(value[1].reason.name, "PentarynAbort");
  assert.equal(value[1].reason.message, "An import is already running; await it or reload.");
  assert.deepEqual(toasts, [], "refused without a toast, like the other option refusals");
  serve(valid());
  const third = await outcome(() => imp({ dryRun: true }));
  assert.equal(third.error, null, "a call after the first settled runs");
  serve(valid([], { targetSystemVersion: "5.3" }));
  const failing = await outcome(() => imp({ dryRun: true }));
  assert.equal(failing.error.name, "PentarynAbort");
  serve(valid());
  const afterFailure = await outcome(() => imp({ dryRun: true }));
  assert.equal(afterFailure.error, null, "a refused run releases the guard");
});

/* ── import(): abort codes (2026-10-11 live check) ───────────────────────────────────────────── */

// pentaryn-write reports an uncoded throw as INTERNAL; the importer's expected aborts carry a kit
// code (lib/errors.mjs CODES) on `err.code`. The message is unchanged (golden/refusals.json).
test("expected aborts carry a kit code: NOT_FOUND for a missing file, NOT_GM, BAD_ARGS, REFUSED, TIMEOUT, CONFLICT", async () => {
  const codes = {};
  serve("Not here", { status: 404, statusText: "Not Found" });
  codes.fetch404 = (await outcome(() => imp({ dryRun: true }))).code;
  serve("<!DOCTYPE html><html></html>");
  codes.fetchHtml = (await outcome(() => imp({ dryRun: true }))).code;
  serve("oops", { status: 500, statusText: "Internal Server Error" });
  codes.fetch500 = (await outcome(() => imp({ dryRun: true }))).code;
  serve(valid([], { targetSystemVersion: "5.3" }));
  codes.gate = (await outcome(() => imp({ dryRun: true }))).code;
  serve(valid([entry("a", "h", { system: { attributes: { hp: { formula: "@x" } } } })]));
  codes.lint = (await outcome(() => imp({ dryRun: true }))).code;
  serve(valid([{ name: "Nameless" }]));
  codes.noSlug = (await outcome(() => imp({ dryRun: true }))).code;
  codes.unmanagedItems = (await outcome(() => imp({ dryRun: true, unmanagedItems: "purge" }))).code;
  game.user.isGM = false;
  try {
    codes.notGM = (await outcome(() => imp({ dryRun: true }))).code;
  } finally {
    game.user.isGM = true;
  }
  respond = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason));
  });
  let timedOut;
  const pending = outcome(() => imp({ dryRun: true, timeout: 50 })).then(v => { timedOut = v; });
  await flush();
  mock.timers.tick(50);
  await pending;
  codes.timeout = timedOut.code;
  respond = () => new Promise(resolve => setTimeout(() => resolve(response(valid())), 10));
  let second;
  await withConsole(async () => {
    const a = imp({ dryRun: true });
    second = await imp({ dryRun: true }).catch(e => e);
    mock.timers.tick(10);
    await a;
  });
  codes.reentrant = second.code;
  assert.deepEqual(codes, {
    fetch404: "NOT_FOUND", fetchHtml: "NOT_FOUND", fetch500: "REFUSED",
    gate: "REFUSED", lint: "REFUSED", noSlug: "REFUSED", unmanagedItems: "BAD_ARGS",
    notGM: "NOT_GM", timeout: "TIMEOUT", reentrant: "CONFLICT",
  });
});

/* ── the shared root under both load orders (items-journal-1) ─────────────────────────────────── */

/** The attunement publish guard, snapshot attunement.mjs:867–872 verbatim (api stubbed). */
function attunementGuard() {
  const api = { report() {} };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, attunement: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.attunement = api;
  }
}
const zzApi = Object.freeze({ contract: "pentaryn-zz/api@1", describe: () => ({ module: "pentaryn-zz" }) });
const kitPublish = () => publishNamespace("zz", zzApi, { moduleId: "pentaryn-zz" });
const shape = () => ({
  keys: Object.keys(game.pentaryn ?? {}),
  frozen: Object.isFrozen(game.pentaryn),
  importIsFunction: typeof game.pentaryn?.import === "function",
});
let fresh = 0;
/** A fresh copy of the entry registers its own once:ready; `before`/`after` run around it, in that order. */
async function readyWith({ start, before, after }) {
  game.pentaryn = start;
  if (before) Hooks.once("ready", before);
  await withConsole(() => import(`${ENTRY}?order=${++fresh}`));
  if (after) Hooks.once("ready", after);
  const { lines } = await withConsole(() => F.fire("ready"));
  return lines;
}

// Was KNOWN items-journal-1 (the importer's ready replaced game.pentaryn with a frozen object and wiped
// it); flipped by guide step 7 ([declared] keystone, D-I1).
test("a namespace published before ready ({aoe}) survives the importer's ready", async () => {
  await readyWith({ start: { aoe: { x: 1 } } });
  assert.deepEqual(game.pentaryn.aoe, { x: 1 });
  assert.equal(typeof game.pentaryn.import, "function");
  assert.equal(Object.isFrozen(game.pentaryn), false);
  pinKey("root", "aoeBefore", shape());
});

test("attunement's guard running after the importer assigns into the root (else branch): both present", async () => {
  await readyWith({ start: undefined, after: attunementGuard });
  assert.equal(typeof game.pentaryn.attunement?.report, "function");
  assert.equal(typeof game.pentaryn.import, "function");
  assert.equal(Object.isFrozen(game.pentaryn), false);
  pinKey("root", "attunementAfter", shape());
});

// Was KNOWN items-journal-1 (the same guard running BEFORE the importer's ready was wiped); flipped by step 7.
test("attunement's guard running before the importer: both present", async () => {
  await readyWith({ start: undefined, before: attunementGuard });
  assert.equal(typeof game.pentaryn.attunement?.report, "function");
  assert.equal(typeof game.pentaryn.import, "function");
  pinKey("root", "attunementBefore", shape());
});

test("a kit module publishing AFTER the importer: its namespace and the importer's keys coexist", async () => {
  await readyWith({ start: undefined, after: kitPublish });
  assert.equal(game.pentaryn.zz, zzApi);
  assert.equal(typeof game.pentaryn.import, "function");
  assert.deepEqual(game.pentaryn.namespaces(), ["importer", "zz"]);
  const atReady = shape();
  mock.timers.tick(0);
  pinKey("root", "kitAfter", { atReady, afterTick: shape(), namespaces: game.pentaryn.namespaces() });
});

// Was KNOWN items-journal-1 (a kit module publishing BEFORE the importer was wiped at ready and came
// back only on the kit's realias tick); flipped by step 7: present at ready, no tick needed.
test("a kit module publishing BEFORE the importer: present at ready, beside the importer's keys", async () => {
  await readyWith({ start: undefined, before: kitPublish });
  assert.equal(game.pentaryn.zz, zzApi, "present at ready, not wiped");
  assert.equal(Object.isFrozen(game.pentaryn), false);
  assert.equal(typeof game.pentaryn.import, "function");
  const atReady = shape();
  mock.timers.tick(0);
  assert.equal(game.pentaryn.zz, zzApi);
  pinKey("root", "kitBefore", { atReady, afterTick: shape(), namespaces: game.pentaryn.namespaces() });
});

// Last of the import() tests: before the fix the stuck re-entrancy guard would refuse every later import().
test("a body that stalls after the headers still times out (TIMEOUT) and releases the guard", async () => {
  respond = async (url, init) => ({
    ok: true, status: 200, statusText: "OK",
    text: () => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
  });
  let o;
  const pending = outcome(() => imp({ dryRun: true, timeout: 50 })).then(v => { o = v; });
  await flush();
  mock.timers.tick(50);
  await flush();
  assert.notEqual(o, undefined, "settled once the 50 ms timeout fired");
  await pending;
  assert.equal(o.error.name, "PentarynAbort");
  assert.equal(o.code, "TIMEOUT");
  assert.equal(o.error.message, "Timed out after 50 ms fetching /worlds/w/actors.json");
  assert.deepEqual(o.toasts, []);
  serve(valid());
  const after = await outcome(() => imp({ dryRun: true }));
  assert.equal(after.error, null, "the guard was released: not CONFLICT");
  assert.ok(after.result);
});

/* ── whole-file pins (keep LAST) ──────────────────────────────────────────────────────────────── */

test("keyed goldens hold exactly the keys this file pins", () => {
  for (const file of ["console", "results", "refusals", "root"]) pinJSON(file, keyed[file], import.meta.url);
});
