import { test } from "node:test";
import assert from "node:assert/strict";
import { guarded, queryGM, queryNameOf, registerQueries, relayed } from "../queries.mjs";
import { describe } from "../api.mjs";

const doc = { documentName: "Actor", id: "aaaaaaaaaaaaaaaa", name: "Aldric", uuid: "Actor.aaaaaaaaaaaaaaaa" };
const MANIFEST = {
  module: "pentaryn-x",
  rows: [
    { path: "list", params: [], query: true },
    { path: "gather", params: [{ name: "opts" }], query: true, wire: data => ({ cropsAs: "base64", ...data }) },
    { path: "inspect", params: [{ name: "ref" }, { name: "opts" }], query: true },
    { path: "old.report", params: [{ name: "ref" }], query: true, legacy: true, args: d => [d.name, d.quiet] },
    { path: "write", params: [], query: false },
  ],
};
const api = {
  list: () => new Set(["a"]),
  gather: opts => opts,
  inspect: (ref, opts) => ({ ref, opts, actor: doc }),
  old: { report: (name, quiet) => ({ name, quiet }) },
};

function env(isGM = true) {
  return { game: { user: { isGM, name: "P" } }, CONFIG: {} };
}

test("guarded rejects a non-GM sender and a non-GM client with NOT_GM", async () => {
  const g = env(true);
  const h = guarded(d => d, { g });
  await assert.rejects(h({}, { user: { isGM: false, name: "P" } }), { message: "NOT_GM: P is not a GM", code: "NOT_GM" });
  await assert.rejects(guarded(d => d, { g: env(false) })({}), { message: "NOT_GM: this client is not a GM" });
  assert.deepEqual(await h(null, { user: { isGM: true } }), {});
});

test("every query row is registered; payloads use wire defaults, ref rows, legacy args; depth uncapped", async () => {
  const g = env(true);
  let published = null;
  const names = registerQueries(MANIFEST, () => published, { g });
  assert.deepEqual(names, ["pentaryn-x.list", "pentaryn-x.gather", "pentaryn-x.inspect", "pentaryn-x.old.report"]);
  await assert.rejects(g.CONFIG.queries["pentaryn-x.list"]({}), { code: "NOT_READY" });
  published = api;
  assert.deepEqual(await g.CONFIG.queries["pentaryn-x.list"](), ["a"]);
  assert.deepEqual(await g.CONFIG.queries["pentaryn-x.gather"]({ n: 1 }), { cropsAs: "base64", n: 1 });
  assert.deepEqual(await g.CONFIG.queries["pentaryn-x.gather"]({ cropsAs: "path" }), { cropsAs: "path" });
  const ins = await g.CONFIG.queries["pentaryn-x.inspect"]({ ref: "Aldric", deep: { a: { b: { c: { d: { e: 1 } } } } } });
  assert.equal(ins.ref, "Aldric");
  assert.deepEqual(ins.actor, { documentName: "Actor", id: doc.id, uuid: doc.uuid, name: "Aldric" });
  assert.deepEqual(ins.opts.deep.a.b.c.d, { e: 1 });
  assert.deepEqual(await g.CONFIG.queries["pentaryn-x.old.report"]({ name: "A", quiet: true }), { name: "A", quiet: true });
});

test("queryGM: NO_GM without a GM, local handler on the GM's own client, user.query otherwise", async () => {
  await assert.rejects(queryGM("q", {}, { g: { game: { users: {} } } }), { code: "NO_GM" });
  const local = { game: { user: { isGM: true }, users: { activeGM: { isSelf: true } } }, CONFIG: { queries: { q: async (d, ctx) => ({ d, gm: ctx.user.isGM }) } } };
  assert.deepEqual(await queryGM("q", { a: 1 }, { g: local }), { d: { a: 1 }, gm: true });
  const remote = { game: { users: { activeGM: { isSelf: false, query: async (n, d, o) => ({ n, d, o }) } } } };
  assert.deepEqual(await queryGM("q", { a: 1 }, { g: remote, timeout: 5 }), { n: "q", d: { a: 1 }, o: { timeout: 5 } });
});

test("KIT-R7 queryGM: a remote timeout is TIMEOUT; a remote coded rejection keeps its code; anything else is INTERNAL", async () => {
  const rejecting = reason => ({ game: { users: { activeGM: { isSelf: false, query: async () => { throw new Error(reason); } } } } });
  // socket.io's ack timeout reaches User#query as `new Error("operation has timed out")`
  await assert.rejects(queryGM("pentaryn-x.list", {}, { g: rejecting("operation has timed out") }),
    { code: "TIMEOUT", message: "TIMEOUT: pentaryn-x.list" });
  // the GM handler's coded error crosses the socket as its message only; the prefix survives
  await assert.rejects(queryGM("q", {}, { g: rejecting("NOT_GM: this client is not a GM") }),
    { code: "NOT_GM", message: "NOT_GM: this client is not a GM" });
  await assert.rejects(queryGM("q", {}, { g: rejecting("NOT_READY: pentaryn-x") }), { code: "NOT_READY", message: "NOT_READY: pentaryn-x" });
  await assert.rejects(queryGM("q", {}, { g: rejecting("BAD_ARGS: wait timed out is not a number") }), { code: "BAD_ARGS" }, "a coded message is never re-read as a timeout");
  await assert.rejects(queryGM("q", {}, { g: rejecting("User [abc] is not active") }),
    { code: "INTERNAL", message: "INTERNAL: User [abc] is not active" });
});

test("K3 guarded passes core's ctx through; sender:'any' accepts a player sender, still needs a GM receiver", async () => {
  const g = env(true);
  const player = { isGM: false, name: "P" };
  const h = guarded((d, ctx) => ({ d, by: ctx?.user?.name ?? null }), { g, sender: "any" });
  assert.deepEqual(await h({ a: 1 }, { user: player }), { d: { a: 1 }, by: "P" });
  await assert.rejects(guarded(d => d, { g })({}, { user: player }), { code: "NOT_GM" }, "default still rejects a player");
  await assert.rejects(guarded(d => d, { g: env(false), sender: "any" })({}, { user: player }), { message: "NOT_GM: this client is not a GM" });
});

test("K4 relayed: any sender, only the active GM runs it; activeGM:false → any GM", async () => {
  const on = { game: { user: { isGM: true }, users: { activeGM: { isSelf: true } } }, CONFIG: {} };
  const other = { game: { user: { isGM: true }, users: { activeGM: { isSelf: false } } }, CONFIG: {} };
  const fn = (d, ctx) => ({ d, by: ctx.user?.name });
  assert.deepEqual(await relayed(fn, { g: on })({ x: 1 }, { user: { isGM: false, name: "P" } }), { d: { x: 1 }, by: "P" });
  await assert.rejects(relayed(fn, { g: other })({}, {}), { message: "NOT_GM: this client is not the active GM", code: "NOT_GM" });
  assert.deepEqual(await relayed(fn, { g: other, activeGM: false })(null, { user: { name: "Q" } }), { d: {}, by: "Q" });
});

test("K8 queryName names the query; relay rows register through relayed; a duplicate name throws", async () => {
  const g = { game: { user: { isGM: true, name: "GM" }, users: { activeGM: { isSelf: true } } }, CONFIG: {} };
  const M = { module: "pentaryn-p", rows: [
    { path: "replace", params: [], query: false },
    { path: "replaceMany", params: [{ name: "data" }], query: true, queryName: "replace" },
    { path: "ensure", params: [{ name: "opts" }], query: true, relay: true },
  ] };
  const api = { replace: () => "one", replaceMany: d => ({ many: d.n }), ensure: o => ({ ok: o.k }) };
  assert.deepEqual(registerQueries(M, () => api, { g }), ["pentaryn-p.replace", "pentaryn-p.ensure"]);
  assert.deepEqual(await g.CONFIG.queries["pentaryn-p.replace"]({ n: 2 }), { many: 2 });
  assert.deepEqual(await g.CONFIG.queries["pentaryn-p.ensure"]({ k: 1 }, { user: { isGM: false, name: "P" } }), { ok: 1 });
  assert.equal(queryNameOf(M, M.rows[1]), "pentaryn-p.replace");
  const dup = { module: "pentaryn-p", rows: [{ path: "a", query: true, queryName: "b" }, { path: "b", query: true }] };
  assert.throws(() => registerQueries(dup, () => api, { g }), { message: 'pentaryn-p: query "pentaryn-p.b" is registered twice' });
});

test("AC-1 a relay row's API function gets core's ctx as a trailing argument; guarded rows do not", async () => {
  const g = { game: { user: { isGM: true, name: "GM" }, users: { activeGM: { isSelf: true } } }, CONFIG: {} };
  const M = { module: "pentaryn-r", rows: [
    { path: "ingest", params: [{ name: "opts" }], query: true, relay: true },
    { path: "tag", params: [{ name: "ref" }, { name: "opts" }], query: true, relay: true },
    { path: "list", params: [{ name: "opts" }], query: true },
  ] };
  const seen = {};
  const api = {
    ingest: (o, ctx) => ({ k: o.k, by: ctx?.user?.name ?? null }),
    tag: (ref, d, ctx) => ({ ref, by: ctx?.user?.name ?? null }),
    list: (...a) => { seen.list = a.length; return "ok"; },
  };
  registerQueries(M, () => api, { g });
  const player = { isGM: false, name: "P" };
  assert.deepEqual(await g.CONFIG.queries["pentaryn-r.ingest"]({ k: 1 }, { user: player }), { k: 1, by: "P" });
  assert.deepEqual(await g.CONFIG.queries["pentaryn-r.tag"]({ ref: "x" }, { user: player }), { ref: "x", by: "P" });
  assert.equal(await g.CONFIG.queries["pentaryn-r.list"]({}, { user: g.game.user }), "ok");
  assert.equal(seen.list, 1, "a guarded row's API function is called exactly as before");
});

test("describe().queries equals the names registerQueries registers", () => {
  // describe() computes the names inline (api.mjs) and registerQueries via queryNameOf: this guards
  // the two formulas against drifting apart (describe().queries feeds contractDrift and the bridge).
  const M = { module: "pentaryn-q", namespace: "q", version: "1.0.0", contract: 1, rows: [
    { path: "list", params: [], query: true },
    { path: "replaceMany", params: [{ name: "data" }], query: true, queryName: "replace" },
    { path: "ensure", params: [{ name: "opts" }], query: true, relay: true },
    { path: "write", params: [], query: false },
  ] };
  const registered = registerQueries(M, () => ({}), { g: { CONFIG: {} } });
  assert.deepEqual(registered, ["pentaryn-q.list", "pentaryn-q.replace", "pentaryn-q.ensure"]);
  assert.deepEqual(describe(M).queries, registered);
  // plus extras: a hand-registered query is appended after the row-derived names (kit-ext-1)
  const extra = "pentaryn-q.relay";
  assert.deepEqual(describe(M, { queries: [extra] }).queries, [...registered, extra]);
});

test("kit-ext-1: extras.queries adds to the row-derived describe().queries, deduped, rows first", () => {
  const M = { module: "pentaryn-q", rows: [
    { path: "list", params: [], query: true },
    { path: "gather", params: [], query: true },
    { path: "write", params: [], query: false },
  ] };
  assert.deepEqual(describe(M, { queries: ["pentaryn-q.ensure"] }).queries,
    ["pentaryn-q.list", "pentaryn-q.gather", "pentaryn-q.ensure"]);
  assert.deepEqual(describe(M, { queries: ["pentaryn-q.ensure", "pentaryn-q.list", "pentaryn-q.ensure"] }).queries,
    ["pentaryn-q.list", "pentaryn-q.gather", "pentaryn-q.ensure"], "an extra already present is not repeated");
  assert.deepEqual(describe(M, { queries: [] }).queries, ["pentaryn-q.list", "pentaryn-q.gather"],
    "an empty extras list no longer wipes the row-derived names");
  assert.deepEqual(describe({ module: "pentaryn-q", rows: [] }, { queries: ["pentaryn-q.ensure"] }).queries,
    ["pentaryn-q.ensure"]);
});
