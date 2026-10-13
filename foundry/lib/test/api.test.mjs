import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApi, describe, maxDepth, surfaceOf, toPlain } from "../api.mjs";
import { CODES, RESERVED } from "../errors.mjs";
import { maxDepth as harnessDepth } from "../test-kit/harness.mjs";

const doc = { documentName: "Actor", id: "aaaaaaaaaaaaaaaa", name: "Aldric", uuid: "Actor.aaaaaaaaaaaaaaaa" };
const g = { game: { actors: new Map([[doc.id, doc]]) } };   // the injected global ref rows resolve against (KIT-M4)

const MANIFEST = Object.freeze({
  module: "pentaryn-x", namespace: "x", version: "0.1.0", contract: "pentaryn-x/api@1", flagScope: "pentaryn-x",
  rows: [
    { path: "inspect", params: [{ name: "ref", kind: "actor" }, { name: "opts", optional: true }], returns: "object", gm: false, writes: false, query: true, doc: "state" },
    { path: "store.list", params: [], returns: "string[]", gm: false, writes: false, doc: "list" },
    { path: "report", params: [{ name: "ref", kind: "actor" }], returns: "object|undefined", gm: false, writes: false, legacy: true, doc: "legacy" },
  ],
  flags: { writes: ["flags.pentaryn-x.turn"], reads: [] },
});
const impl = {
  inspect: function inspect(actor) { return { name: actor.name }; },
  "store.list": function list() { return ["a"]; },
  report: function report(actor) { return actor ? actor.name : undefined; },
};

test("builds dotted paths, resolves ref params, freezes every level", () => {
  const api = buildApi(MANIFEST, impl, { members: { settings: () => ({ on: true }) }, g });
  assert.ok(Object.isFrozen(api) && Object.isFrozen(api.store));
  assert.deepEqual(api.inspect("Aldric"), { name: "Aldric" });
  assert.throws(() => api.inspect("Nobody"), /NOT_FOUND/);
  assert.equal(api.report("Nobody"), undefined);          // legacy: miss → null → undefined, no throw
  assert.deepEqual(api.store.list(), ["a"]);
  assert.equal(api.version, "0.1.0");
  assert.equal(api.contract, "pentaryn-x/api@1");
  assert.deepEqual(api.settings(), { on: true });
  assert.deepEqual(api.trace(), []);
});

test("drift throws at build: a row without impl, an impl without row", () => {
  assert.throws(() => buildApi(MANIFEST, { ...impl, extra: () => 1 }), /implementation "extra" has no API row/);
  const { report: _r, ...missing } = impl;
  assert.throws(() => buildApi(MANIFEST, missing), /API row "report" has no implementation/);
  assert.doesNotThrow(() => buildApi({ ...MANIFEST, unlisted: ["_internals"] }, { ...impl, _internals: () => 1 }));
});

test("reserved names: never as rows, contributions or nested; inspect/selftest only as own top-level rows", () => {
  const row = path => ({ path, params: [], returns: "x", gm: false, writes: false, doc: "" });
  for (const path of ["describe", "version", "contract", "settings", "trace", "uninstall", "store.describe"]) {
    assert.throws(() => buildApi({ ...MANIFEST, rows: [...MANIFEST.rows, row(path)] }, { ...impl, [path]: () => 1 }), /is reserved/, path);
  }
  assert.throws(() => buildApi(MANIFEST, impl, { contributions: [{ rows: [row("selftest")], impl: { selftest: () => 1 } }] }), /is reserved/);
  assert.throws(() => buildApi({ ...MANIFEST, rows: [...MANIFEST.rows, { ...row("selftest"), legacy: true }] }, { ...impl, selftest: () => 1 }), /is reserved/);
  assert.doesNotThrow(() => buildApi({ ...MANIFEST, rows: [...MANIFEST.rows, row("selftest")] }, { ...impl, selftest: () => 1 }));
  assert.throws(() => buildApi(MANIFEST, impl, { members: { describe: () => 1 } }), /not a kit member/);
});

test("every RESERVED name is refused as a row and wired on the built API", () => {
  const row = path => ({ path, params: [], returns: "x", gm: false, writes: false, doc: "" });
  const optional = ["inspect", "selftest"];
  const api = buildApi(MANIFEST, impl);
  for (const name of RESERVED.filter(n => !optional.includes(n))) {
    assert.throws(() => buildApi({ ...MANIFEST, rows: [...MANIFEST.rows, row(name)] }, { ...impl, [name]: () => 1 }), /is reserved/, name);
    assert.ok(typeof api[name] === "function" || typeof api[name] === "string", `${name} is wired`);
  }
});

test("contributions merge before validation and show in describe()", () => {
  const api = buildApi(MANIFEST, impl, {
    contributions: [{ rows: [{ path: "recent", params: [], returns: "[]", gm: false, writes: false, doc: "c" }], impl: { recent: () => [] } }],
    extras: () => ({ hooks: [{ name: "updateActor", label: "sync", id: 3 }] }),
  });
  const d = api.describe();
  assert.deepEqual(d.methods.map(m => m.path), ["inspect", "store.list", "report", "recent"]);
  assert.deepEqual(d.hooks, [{ name: "updateActor", label: "sync" }]);
  assert.throws(() => buildApi(MANIFEST, impl, { contributions: [{ rows: [MANIFEST.rows[1]], impl: {} }] }), /defined twice/);
});

test("describe() is plain JSON in the published shape", () => {
  const d = describe(MANIFEST, {
    settings: [{ key: "enabled", scope: "world", type: Boolean, default: true, doc: "on" }, { key: "log", store: true, type: Array, default: [], doc: "s" }],
    events: { turnStart: { name: "pentaryn-x.turnStart", pre: false, args: "(actor)" } },
    patches: [{ label: "Token#_onClickLeft2", marker: "__m", via: "direct", adjustments: "x-dblclick", target: {} }],
    published: { when: "ready" },
  });
  assert.equal(JSON.stringify(d), JSON.stringify(JSON.parse(JSON.stringify(d))));
  assert.deepEqual(d.queries, ["pentaryn-x.inspect"]);
  assert.deepEqual(d.settings, [
    { key: "enabled", scope: "world", type: "Boolean", default: true, doc: "on" },
    { key: "log", scope: "world", type: "Array", default: [], store: true, doc: "s" },
  ]);
  assert.deepEqual(d.events, [{ key: "turnStart", name: "pentaryn-x.turnStart", legacyName: null, pre: false, args: "(actor)" }]);
  assert.deepEqual(d.patches, [{ label: "Token#_onClickLeft2", marker: "__m", via: "direct", adjustments: "x-dblclick" }]);
  assert.deepEqual(d.errors, [...CODES]);
  assert.equal(d.methods[2].legacy, true);
  assert.deepEqual(Object.keys(d), ["module", "namespace", "version", "contract", "flagScope", "kit", "published", "methods", "queries", "settings", "events", "hooks", "patches", "flags", "errors"]);
});

test("surfaceOf and maxDepth", () => {
  const api = buildApi(MANIFEST, impl);
  assert.deepEqual(Object.keys(api).slice(-6), ["version", "contract", "settings", "trace", "uninstall", "describe"]);
  const s = surfaceOf(api);
  assert.equal(s["store.list"], "list");
  assert.equal(s.version, "string");
  assert.equal(s.inspect, "inspect");
  assert.equal(maxDepth(1), 0);
  assert.equal(maxDepth({}), 1);
  assert.equal(maxDepth({ a: { b: [1] } }), 3);
});

test("toPlain: documents → refs, collections, dates, functions, depth cap, cycles", () => {
  const cyc = { name: "c" };
  cyc.self = cyc;
  const out = toPlain({
    actor: doc, set: new Set([1]), map: new Map([["k", 2]]), when: new Date(5), fn: () => 1,
    deep: { a: { b: { c: { d: 1 } } } }, cyc, nan: NaN, err: Object.assign(new Error("m"), { code: "X" }),
  });
  assert.deepEqual(out.actor, { documentName: "Actor", id: doc.id, uuid: doc.uuid, name: "Aldric" });
  assert.deepEqual(out.set, [1]);
  assert.deepEqual(out.map, { k: 2 });
  assert.equal(out.when, 5);
  assert.equal("fn" in out, false);
  assert.deepEqual(out.deep, { a: { b: { c: "[max depth]" } } });
  assert.equal(out.cyc.self, "[cycle]");
  assert.equal(out.nan, null);
  assert.deepEqual(out.err, { name: "Error", message: "m", code: "X" });
  assert.ok(maxDepth(out) <= 4);
  assert.deepEqual(toPlain({ a: { b: { c: { d: { e: 1 } } } } }, { maxDepth: Infinity }), { a: { b: { c: { d: { e: 1 } } } } });
});

test("ref rows take scene scope and base from the call's opts; writes return fail() on a bad ref", async () => {
  const tok = (id, sceneId) => ({ documentName: "Token", id, name: "Goblin", uuid: `Scene.${sceneId}.Token.${id}`, actorId: doc.id, actor: doc });
  const s1 = { documentName: "Scene", id: "scene00000000001", name: "One", tokens: new Map([["tok0000000000001", tok("tok0000000000001", "scene00000000001")]]) };
  const s2 = { documentName: "Scene", id: "scene00000000002", name: "Two", tokens: new Map([["tok0000000000002", tok("tok0000000000002", "scene00000000002")]]) };
  const world = { game: { actors: new Map([[doc.id, doc]]), scenes: new Map([[s1.id, s1], [s2.id, s2]]) } };
  const M = {
    ...MANIFEST,
    rows: [
      { path: "peek", params: [{ name: "ref", kind: "token" }, { name: "opts", optional: true }], returns: "string", gm: false, writes: false, doc: "read" },
      { path: "mark", params: [{ name: "ref", kind: "actor" }, { name: "opts" }], returns: "ok|fail", gm: true, writes: true, doc: "write" },
    ],
  };
  const seen = [];
  const api = buildApi(M, {
    peek: function peek(t, opts) { seen.push(opts); return t.id; },
    mark: async function mark(actor) { return { ok: true, id: actor.id }; },
  }, { g: world });
  assert.throws(() => api.peek("Goblin"), /AMBIGUOUS: 2 tokens named Goblin/);
  assert.equal(api.peek("Goblin", { sceneId: s1.id }), "tok0000000000001");
  assert.equal(api.peek("Goblin", { sceneId: s2.id }), "tok0000000000002");
  assert.deepEqual(seen.at(-1), { sceneId: s2.id });                   // opts still reach the impl
  assert.equal(api.peek.name, "peek");
  assert.deepEqual(await api.mark("Nobody", {}), { ok: false, code: "NOT_FOUND", reason: "NOT_FOUND: actor Nobody" });
  assert.deepEqual(await api.mark(42, {}), { ok: false, code: "BAD_ARGS", reason: "BAD_ARGS: not a actor reference" });
  assert.deepEqual(await api.mark("Aldric", {}), { ok: true, id: doc.id });
  assert.throws(() => api.peek("Nobody", { sceneId: s1.id }), /NOT_FOUND/);   // reads still throw
});

test("KIT-M4: buildApi takes an injected g and resolves ref rows against it, never globalThis.game", async () => {
  const other = { documentName: "Actor", id: "bbbbbbbbbbbbbbbb", name: "Brenna", uuid: "Actor.bbbbbbbbbbbbbbbb" };
  const injected = { game: { actors: new Map([[other.id, other]]) } };
  const M = { ...MANIFEST, rows: [...MANIFEST.rows, { path: "mark", params: [{ name: "ref", kind: "actor" }, { name: "opts" }], returns: "ok|fail", gm: true, writes: true, doc: "write" }] };
  const api = buildApi(M, { ...impl, mark: async function mark(actor) { return { ok: true, id: actor.id }; } }, { g: injected });
  assert.deepEqual(api.inspect("Brenna"), { name: "Brenna" });
  assert.throws(() => api.inspect("Aldric"), /NOT_FOUND/);            // not on the injected world
  assert.equal(api.report("Aldric"), undefined);
  assert.deepEqual(await api.mark("Brenna", {}), { ok: true, id: other.id });
  assert.deepEqual(await api.mark("Aldric", {}), { ok: false, code: "NOT_FOUND", reason: "NOT_FOUND: actor Aldric" });
});

test("K5: an unlisted table is published as a frozen copy; the module's own table and a namespace are never frozen", async () => {
  const STANCES = ["ally", "rival"];
  const TABLE = { a: { b: [1] } };
  const ns = await import("../flags.mjs");                 // a real ES module namespace (its freeze would throw)
  const M = { ...MANIFEST, unlisted: ["STANCES", "TABLE", "flagsNs", "Rules"] };
  class Rules { constructor() { this.n = 1; } }
  const rules = new Rules();
  const api = buildApi(M, { ...impl, STANCES, TABLE, flagsNs: ns, Rules: rules });
  assert.equal(Object.isFrozen(STANCES), false);
  assert.equal(Object.isFrozen(TABLE.a), false);
  STANCES.push("neutral");                                 // the module may still edit its own table
  assert.deepEqual(api.STANCES, ["ally", "rival"]);
  assert.equal(Object.isFrozen(api.STANCES), true);
  assert.equal(Object.isFrozen(api.TABLE.a.b), true);
  assert.equal(typeof api.flagsNs.readFlag, "function");
  assert.equal(api.Rules, rules, "a class instance is published by reference");
  assert.equal(Object.isFrozen(rules), false);
  assert.equal(Object.isFrozen(api), true);
});

test("K8: describe() lists a row's queryName and relay flag", () => {
  const M = { ...MANIFEST, rows: [...MANIFEST.rows,
    { path: "replaceMany", params: [], returns: "object", gm: true, writes: true, query: true, queryName: "replace", doc: "" },
    { path: "ensure", params: [], returns: "object", gm: false, writes: true, query: true, relay: true, doc: "" }] };
  const d = describe(M);
  assert.deepEqual(d.queries, ["pentaryn-x.inspect", "pentaryn-x.replace", "pentaryn-x.ensure"]);
  assert.equal(d.methods.find(m => m.path === "replaceMany").queryName, "replace");
  assert.equal(d.methods.find(m => m.path === "ensure").relay, true);
  assert.equal("queryName" in d.methods.find(m => m.path === "inspect"), false);
});

test("kit 1.1.0 (W2-B3): describe() lists a row's dryRun flag only when set", () => {
  const M = { ...MANIFEST, rows: [...MANIFEST.rows,
    { path: "bulk", params: [{ name: "opts", optional: true }], returns: "ok|fail", gm: true, writes: true, dryRun: true, doc: "" }] };
  const d = describe(M);
  assert.equal(d.methods.find(m => m.path === "bulk").dryRun, true);
  assert.equal("dryRun" in d.methods.find(m => m.path === "inspect"), false);
});

test("kit 1.1.0 (W2-B4): a first ref with resolve:\"self\" reaches the function raw, and describe() keeps the marker", () => {
  let seen;
  const M = { ...MANIFEST, rows: [
    { path: "sync", params: [{ name: "ref", kind: "actor", resolve: "self" }, { name: "name", type: "string" }],
      returns: "number", gm: false, writes: true, doc: "resolves its own ref" }] };
  const api = buildApi(M, { sync: (ref, name) => { seen = ref; return name; } });
  assert.equal(api.sync("Some Name", "x"), "x");
  assert.equal(seen, "Some Name", "the kit did not resolve it");
  assert.equal(describe(M).methods[0].params[0].resolve, "self");
});

test("kit and harness maxDepth stay identical", () => {
  // The harness keeps its own copy on purpose (self-contained); this pins the two together.
  assert.equal(String(harnessDepth), String(maxDepth));
  const cyclic = { a: {} };
  cyclic.a.back = cyclic;
  for (const v of [1, {}, { a: { b: [1] } }, null, cyclic]) assert.equal(harnessDepth(v), maxDepth(v));
  assert.equal(maxDepth(cyclic), 2);
});

test("kit-ext-5: describe()'s optional method fields come from one ordered field table", async () => {
  const { OPTIONAL_METHOD_FIELDS } = await import("../api.mjs");
  assert.ok(Array.isArray(OPTIONAL_METHOD_FIELDS), "api.mjs exports OPTIONAL_METHOD_FIELDS");
  assert.deepEqual(OPTIONAL_METHOD_FIELDS.map(f => f.key),
    ["queryName", "relay", "dryRun", "nullWhen", "throws", "legacy", "since"]);
  assert.equal(Object.isFrozen(OPTIONAL_METHOD_FIELDS), true);
  // every field set: keys land in the published order, each after its anchor
  const full = { path: "all", params: [], returns: "x", gm: true, writes: true, query: true, queryName: "q",
    relay: true, dryRun: true, sideEffects: ["s"], nullWhen: "gone", throws: ["NOT_GM"], legacy: true,
    since: "1.2.0", doc: "d" };
  const m = describe({ ...MANIFEST, rows: [full] }).methods[0];
  assert.deepEqual(Object.keys(m), ["path", "params", "returns", "gm", "writes", "query", "queryName", "relay",
    "dryRun", "sideEffects", "nullWhen", "throws", "legacy", "since", "doc"]);
  assert.deepEqual([m.queryName, m.relay, m.dryRun, m.nullWhen, m.throws, m.legacy, m.since],
    ["q", true, true, "gone", ["NOT_GM"], true, "1.2.0"]);
  // none set: no optional key appears; a queryName without query stays hidden; truthy flags publish as true
  const bare = describe({ ...MANIFEST, rows: [{ path: "b", queryName: "q", relay: 1, legacy: "yes" }] }).methods[0];
  assert.deepEqual(Object.keys(bare), ["path", "params", "returns", "gm", "writes", "query", "relay",
    "sideEffects", "legacy", "doc"]);
  assert.equal(bare.relay, true);
  assert.equal(bare.legacy, true);
});

test("kit-ext-6: one KINDS table; a ref param naming an unknown kind throws at load", async () => {
  const { KINDS } = await import("../resolve.mjs");
  assert.ok(KINDS && Object.isFrozen(KINDS), "resolve.mjs exports a frozen KINDS table");
  assert.deepEqual(Object.keys(KINDS), ["actor", "token", "item", "scene", "user", "journal", "message", "macro",
    "region", "combat", "table", "folder", "playlist"]);
  assert.deepEqual(KINDS.actor, { doc: "Actor", collection: "actors" });
  assert.deepEqual(KINDS.token, { doc: "Token", embedded: "tokens" });
  for (const k of Object.values(KINDS)) assert.ok(Object.isFrozen(k) && k.doc && (k.collection || k.embedded));
  const typo = { ...MANIFEST, rows: [{ path: "peek", params: [{ name: "ref", kind: "tokn" }], returns: "x", gm: false, writes: false, doc: "" }] };
  assert.throws(() => buildApi(typo, { peek: () => 1 }), /pentaryn-x: API row "peek" ref kind "tokn" is not a kit kind/);
  // a contribution's row is checked the same way
  assert.throws(() => buildApi(MANIFEST, impl, { contributions: [{ rows: typo.rows, impl: { peek: () => 1 } }] }), /ref kind "tokn"/);
  // the kit never resolves a resolve:false / resolve:"self" param, so its kind is descriptive only (aoe's inspect: "any")
  for (const resolve of [false, "self"]) {
    const raw = { ...MANIFEST, rows: [{ path: "peek", params: [{ name: "ref", kind: "any", resolve }], returns: "x", gm: false, writes: false, doc: "" }] };
    assert.doesNotThrow(() => buildApi(raw, { peek: () => 1 }));
  }
  // no kind means actor, as before
  const bare = { ...MANIFEST, rows: [{ path: "peek", params: [{ name: "ref" }], returns: "x", gm: false, writes: false, doc: "" }] };
  assert.doesNotThrow(() => buildApi(bare, { peek: () => 1 }));
});

test("kit-ext-3-followup: one MEMBER_DEFAULTS table, keyed by errors.RESERVED, drives buildApi's kit members", async () => {
  const { MEMBER_DEFAULTS } = await import("../api.mjs");
  assert.ok(MEMBER_DEFAULTS && typeof MEMBER_DEFAULTS === "object", "api.mjs exports MEMBER_DEFAULTS");
  assert.equal(Object.isFrozen(MEMBER_DEFAULTS), true);
  assert.deepEqual(Object.keys(MEMBER_DEFAULTS).sort(), [...RESERVED].sort(), "one entry per RESERVED name");
  // the published key order (legacy-surface goldens pin it) is unchanged
  assert.deepEqual(Object.keys(MEMBER_DEFAULTS), ["version", "contract", "settings", "trace", "uninstall", "describe", "inspect", "selftest"]);
  const by = via => Object.keys(MEMBER_DEFAULTS).filter(k => MEMBER_DEFAULTS[k].via === via).sort();
  assert.deepEqual(by("built"), ["contract", "describe", "version"]);
  assert.deepEqual(by("member"), ["settings", "trace", "uninstall"]);
  assert.deepEqual(by("optional"), ["inspect", "selftest"]);
  for (const e of Object.values(MEMBER_DEFAULTS)) assert.equal(Object.isFrozen(e), true);
  // the table, not a hand list, decides: members are accepted, everything else refused
  for (const name of by("member")) assert.doesNotThrow(() => buildApi(MANIFEST, impl, { members: { [name]: () => 1 } }), name);
  for (const name of [...by("built"), ...by("optional")]) {
    assert.throws(() => buildApi(MANIFEST, impl, { members: { [name]: () => 1 } }), /not a kit member/, name);
  }
  // defaults unchanged: anonymous fallbacks (surface goldens read "function"), built values from the manifest
  const api = buildApi(MANIFEST, impl);
  assert.deepEqual([api.settings(), api.trace(), api.uninstall()], [{}, [], undefined]);
  assert.deepEqual([api.version, api.contract], [MANIFEST.version, MANIFEST.contract]);
  assert.deepEqual(Object.keys(api).slice(-6), ["version", "contract", "settings", "trace", "uninstall", "describe"]);
  const s = surfaceOf(api);
  for (const k of ["settings", "trace", "uninstall", "describe"]) assert.equal(s[k], "function", k);
  assert.throws(() => buildApi({ ...MANIFEST, version: undefined }, impl), /version missing/);
});
