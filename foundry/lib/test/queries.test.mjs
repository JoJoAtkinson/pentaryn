import { test } from "node:test";
import assert from "node:assert/strict";
import { guarded, queryGM, queryNameOf, registerQueries, relayed } from "../queries.mjs";

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
