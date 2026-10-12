// The published API: rows ↔ implementations, the describe/surface/queries goldens, inspect's
// shape, the relay and GM-only query contracts, and list/get/resolve against an in-memory store.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { IDS, WORLD, installClient, memoryStore, queuedReport, settle } from "./fixtures/world.mjs";
import { CATEGORY_KEYS, FLAG_SCOPE, LIMITS, MODULE, QUEUE_KEY, STATUSES, STORE_DIR, normaliseReport } from "../feedback-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { SETTINGS } from "../settings.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";
import { codedError } from "../lib/errors.mjs";

const T0 = Date.UTC(2026, 9, 11, 20, 0, 0);
mock.timers.enable({ apis: ["Date"], now: T0 });

const F = await installClient();
const audit = [];
console.info = (line, fields) => audit.push([line, fields]);
const { useStore } = await import("../files-adapter.mjs");
const mem = memoryStore();
useStore(mem);
await import("../feedback.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.modules.get(MODULE).api;
const gm = game.user;
const player = game.users.get(IDS.player);
const code = async fn => { try { await fn(); return "ok"; } catch (e) { return e.code ?? e.message; } };
const dir = `pentaryn-feedback/${WORLD}`;

/** Three filed reports, oldest first: open, triaged, resolved (fixed ids so goldens are stable). */
function seed() {
  mem.files.clear();
  const rows = [
    ["aaaaaa0000000001", "bug", "open", T0 - 3000, "Loot all did nothing"],
    ["aaaaab0000000002", "feature", "triaged", T0 - 2000, "A map tab for the party"],
    ["bbbbbb0000000003", "defect", "resolved", T0 - 1000, "Ruler snaps to the wrong grid"],
  ];
  for (const [id, category, status, t, text] of rows) {
    const r = normaliseReport(queuedReport(id, { t, category, text }), { user: { id: IDS.player, name: "Caven's player", role: 1 }, receivedAt: t + 5 });
    mem.files.set(`${dir}/${id}.json`, { ...r, status });
  }
}

test("every described method is a function on the API", () => {
  const methods = api.describe().methods.map(m => m.path);
  assert.deepEqual(methods, ["inspect", "selftest", "open", "submit", "ingest", "list", "get", "resolve"]);
  for (const path of methods) assert.equal(typeof path.split(".").reduce((o, k) => o?.[k], api), "function", path);
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("manifest strings match core tables (categories, statuses, report file, queue flag)", () => {
  const row = path => MANIFEST.rows.find(r => r.path === path);
  const union = keys => keys.map(k => `'${k}'`).join("|");
  assert.equal(row("open").params[0].type, `{ category?: ${union(CATEGORY_KEYS)}, text? }`);
  assert.equal(row("list").params[0].type, `{ status?: ${union([...STATUSES, "all"])}, limit? }`);
  const strings = [];
  const walk = v => typeof v === "string" ? strings.push(v)
    : v && typeof v === "object" ? Object.values(v).forEach(walk) : undefined;
  walk(MANIFEST);
  const files = strings.filter(s => s.includes("Data/"));
  assert.ok(files.length > 0, "the manifest names the report file");
  for (const s of files) assert.equal(s, `Data/${STORE_DIR}/<worldId>/<id>.json`);
  const queue = `flags.${FLAG_SCOPE}.${QUEUE_KEY}`;
  assert.deepEqual(MANIFEST.flags.writes, [queue]);
  for (const s of strings.filter(s => s.startsWith("flags."))) assert.equal(s, queue);
});

test("manifest derives those strings from core, never repeats them as literals (feedback-EXT-1-followup)", () => {
  const src = readFileSync(new URL("../api-manifest.mjs", import.meta.url), "utf8");
  const inUnion = k => [`'${k}'|`, `|'${k}'`];
  for (const literal of [`Data/${STORE_DIR}/`, `flags.${FLAG_SCOPE}.${QUEUE_KEY}`, ...CATEGORY_KEYS.flatMap(inUnion),
    ...STATUSES.flatMap(inUnion)]) {
    assert.ok(!src.includes(literal), `api-manifest.mjs spells ${literal} out; build it from feedback-core.mjs`);
  }
});

test("describe() equals golden/describe.json (version, kit, published and patch routes excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("queries: one relay row (ingest), four GM rows; a player is refused the GM rows", async () => {
  const rows = api.describe().methods.filter(m => m.query);
  assert.deepEqual(rows.map(m => [m.path, !!m.relay]), [["inspect", false], ["ingest", true], ["list", false], ["get", false], ["resolve", false]]);
  for (const row of rows) assert.equal(typeof CONFIG.queries[`${MODULE}.${row.path}`], "function", row.path);
  for (const path of ["inspect", "list", "get", "resolve"]) {
    await assert.rejects(CONFIG.queries[`${MODULE}.${path}`]({ ref: IDS.player, id: "x" }, { user: player }), { message: "NOT_GM: Caven's player is not a GM" }, path);
  }
  seed();
  const q = name => CONFIG.queries[`${MODULE}.${name}`];
  pinJSON("queries", {
    inspect: await q("inspect")({ ref: IDS.player }, { user: gm }),
    inspectMissing: await q("inspect")({ ref: "Nobody" }, { user: gm }).catch(e => ({ threw: e.message })),
    list: await q("list")({}, { user: gm }),
    listAll: await q("list")({ status: "all", limit: 2 }, { user: gm }),
    getPrefix: (await q("get")({ id: "bbbbbb" }, { user: gm })).id,
    getAmbiguous: await q("get")({ id: "aaaaa" }, { user: gm }).catch(e => ({ threw: e.message })),
    resolveRefused: await q("resolve")({ id: "bbbbbb0000000003", status: "triaged" }, { user: gm }),
    ingestFromPlayer: await q("ingest")({ userId: IDS.player }, { user: player }),
  }, import.meta.url);
});

test("the relay row runs for any sender but only on the active GM's client", async () => {
  F.become({ userId: IDS.player });
  await assert.rejects(CONFIG.queries[`${MODULE}.ingest`]({ userId: IDS.player }, { user: player }),
    { message: "NOT_GM: this client is not the active GM" });
  F.become({ userId: gm.id });
});

test("a payload cannot file as someone else: the user comes from the queue's owner", async () => {
  const forged = queuedReport("forgedforged0001", { text: "I am the GM", user: { id: gm.id, name: "Gamemaster", isGM: true, role: 4 } });
  await player.update({ [`flags.${MODULE}.queue.${forged.id}`]: forged });
  await settle(10);
  const file = mem.files.get(`${dir}/${forged.id}.json`);
  assert.equal(file.user.id, IDS.player);
  assert.equal(file.user.isGM, false);
});

test("an oversize queued report is refused, never written", async () => {
  const big = queuedReport("oversize00000001", { text: "big" });
  big.actions = Array.from({ length: 3000 }, (_, i) => ({ t: i, kind: "click", text: "x".repeat(100) }));
  await player.update({ [`flags.${MODULE}.queue.${big.id}`]: big });
  await settle(10);
  assert.equal(mem.files.has(`${dir}/${big.id}.json`), false);
  assert.deepEqual(player.flags[MODULE].queue, {});
});

test("the file written is the normalised report: pretty JSON via the store, Data-relative path", async () => {
  mem.calls.length = 0;
  const r = await api.submit({ category: "feature", text: "bytes check" });
  const path = `${dir}/${r.id}.json`;
  assert.deepEqual(mem.calls.filter(([op]) => op === "put"), [["put", path]]);
  const file = mem.files.get(path);
  assert.equal(file.schemaVersion, 1);
  assert.equal(file.id, r.id);
  assert.equal(file.receivedAt, null, "no per-tab time: two GM tabs write the same bytes");
  assert.equal(file.iso, new Date(T0).toISOString());
});

test("inspect: plain JSON, depth ≤ 4; pending for the GM or that user; rings only for the caller", async () => {
  seed();
  F.gm.active = false;
  F.become({ userId: IDS.player });
  const queued = await api.submit({ text: "waiting" });
  F.become({ userId: gm.id });
  F.gm.active = true;
  const asGM = await api.inspect(IDS.player);
  assert.deepEqual(asGM.user, { documentName: "User", id: IDS.player, uuid: `User.${IDS.player}`, name: "Caven's player" });
  assert.deepEqual(asGM.pending, [queued.id]);
  assert.equal(asGM.actions, null, "another user's rings live on their client");
  assert.deepEqual(asGM.reports.map(r => r.id), ["aaaaaa0000000001", "aaaaab0000000002", "bbbbbb0000000003"],
    "the GM sees that user's filed reports, oldest first");
  assert.ok(maxDepth(asGM) <= 4);
  assert.deepEqual(JSON.parse(JSON.stringify(asGM)), asGM);
  const asOther = await api.inspect(IDS.player, { as: IDS.player2 });
  assert.equal(asOther.pending, null, "another player does not see the queue");
  assert.equal(asOther.reports, null, "nor the reports");
  assert.deepEqual((await api.inspect(IDS.player, { as: IDS.player })).pending, [queued.id]);
  const self = await api.inspect(gm.id);
  assert.ok(Array.isArray(self.actions) && self.actions.length <= 20);
  assert.deepEqual(self.reports, []);
  assert.ok(maxDepth(self) <= 4);
  assert.equal(await code(() => api.inspect("Nobody")), "NOT_FOUND");
  assert.equal(await code(() => api.inspect(42)), "BAD_ARGS");
  await api.ingest({ userId: IDS.player });
});

// 2026-10-11 live check: the root game.pentaryn.inspect resolves its ref as an Actor and passes that
// to every namespace; feedback answered "BAD_ARGS: expected User, got Actor". Now, as journal.inspect
// does, an Actor (or Token) means its owning players: their reports and queue state.
test("inspect(Actor): the actor's owning non-GM users, their pending ids and reports; none → empty, not an error", async () => {
  seed();
  const caven = game.actors.get(IDS.caven);
  const viaCharacter = await api.inspect(caven);
  assert.deepEqual(viaCharacter.actor, { documentName: "Actor", id: IDS.caven, uuid: `Actor.${IDS.caven}`, name: "Caven" });
  assert.deepEqual(viaCharacter.users.map(u => u.id), [IDS.player], "the player whose assigned character it is");
  assert.deepEqual(viaCharacter.pending, []);
  assert.deepEqual(viaCharacter.reports.map(r => r.id), ["aaaaaa0000000001", "aaaaab0000000002", "bbbbbb0000000003"]);
  assert.equal(viaCharacter.actions, null);
  assert.ok(maxDepth(viaCharacter) <= 4);

  const goblin = game.actors.get(IDS.goblin);
  const nobody = await api.inspect(goblin);
  assert.deepEqual(nobody, {
    actor: { documentName: "Actor", id: IDS.goblin, uuid: `Actor.${IDS.goblin}`, name: "Goblin" },
    users: [], pending: [], reports: [], actions: null, errors: null,
  });

  goblin.ownership = { default: 0, [IDS.player2]: 3, [IDS.gm]: 3 };
  try {
    const owned = await api.inspect(goblin);
    assert.deepEqual(owned.users.map(u => u.id), [IDS.player2], "an OWNER who is not a GM");
    assert.deepEqual(owned.reports, [], "player2 filed nothing");
  } finally {
    goblin.ownership = { default: 0 };
  }

  const token = game.scenes.get(IDS.scene).tokens.get(IDS.token);
  assert.deepEqual((await api.inspect(token)).users.map(u => u.id), [IDS.player], "a Token means its actor");

  const root = await game.pentaryn.inspect(IDS.caven);
  assert.deepEqual(root.feedback.users.map(u => u.id), [IDS.player], "the root inspect no longer gets BAD_ARGS");
});

test("inspect(Actor) with no player reads no report file and gives reports: [] even when the store is broken", async () => {
  seed();
  const goblin = game.actors.get(IDS.goblin);
  const counts = { list: 0, get: 0 };
  try {
    useStore({
      ...mem,
      list: dir => { counts.list++; return mem.list(dir); },
      get: path => { counts.get++; return mem.get(path); },
    });
    assert.deepEqual((await api.inspect(goblin)).reports, []);
    assert.deepEqual(counts, { list: 0, get: 0 }, "no players → no report reads");
    useStore({ ...mem, get: async () => { throw codedError("INTERNAL", "HTTP 500"); } });
    assert.deepEqual((await api.inspect(goblin)).reports, [], "the promised empty list, not null");
  } finally {
    useStore(mem);
  }
});

// 2026-10-12 live check (W3L): over the MCP bridge a ref is a string, so pentaryn-read
// {ns:"feedback", path:"inspect", ref:"Actor.<id>"} answered "expected User, got Actor" and an actor's
// name NOT_FOUND (user <name>). A uuid of an Actor/Token, and — when no user matches — an actor's id
// or exact name, now reach the Actor path; a user ref still wins, and a miss on both is NOT_FOUND.
test("inspect(string): an Actor/Token uuid, or an actor id / name no user has, means that actor's players", async () => {
  seed();
  const byUuid = await api.inspect(`Actor.${IDS.caven}`);
  assert.equal(byUuid.actor.id, IDS.caven);
  assert.deepEqual(byUuid.users.map(u => u.id), [IDS.player]);
  const tok = game.scenes.get(IDS.scene).tokens.get(IDS.token);
  assert.deepEqual((await api.inspect(tok.uuid)).users.map(u => u.id), [IDS.player], "a Token uuid means its actor");
  assert.deepEqual((await api.inspect("Goblin")).actor?.id, IDS.goblin, "an actor's exact name");
  assert.deepEqual((await api.inspect(IDS.goblin)).actor?.id, IDS.goblin, "an actor's id");
  assert.equal((await api.inspect(IDS.player)).user.id, IDS.player, "a user ref still resolves as the user");
  assert.equal(await code(() => api.inspect("Nobody")), "NOT_FOUND");
  assert.equal(await code(() => api.inspect(`Scene.${IDS.scene}`)), "BAD_ARGS", "a uuid of anything else");
});

test("list: oldest first, status filter, limit, count; a player gets NOT_GM", async () => {
  seed();
  assert.deepEqual((await api.list()).reports.map(r => r.id), ["aaaaaa0000000001"]);
  assert.deepEqual((await api.list({ status: "all" })).reports.map(r => r.id), ["aaaaaa0000000001", "aaaaab0000000002", "bbbbbb0000000003"]);
  assert.deepEqual(await api.list({ status: "all", limit: 1 }).then(r => [r.reports.length, r.count]), [1, 3]);
  assert.equal(await code(() => api.list({ status: "done" })), "BAD_ARGS");
  F.become({ userId: IDS.player });
  assert.equal(await code(() => api.list()), "NOT_GM");
  F.become({ userId: gm.id });
});

// feedback-EC-3: readAll promised "unreadable files skipped", but one corrupt file (res.json()
// rejects), a GET answering 500, or an array-valued .json made list() reject (or list a row of
// nulls) and set inspect's reports to null. Now each bad file is skipped with one warn line.
test("feedback-EC-3: a corrupt, a 500 and an array-valued report file are skipped; list() returns the rest", async () => {
  seed();
  const bad = {
    [`${dir}/cccccc0000000004.json`]: async () => { throw new SyntaxError("Unexpected token < in JSON"); },
    [`${dir}/dddddd0000000005.json`]: async () => { throw codedError("INTERNAL", `fetch ${dir}/dddddd0000000005.json: HTTP 500`); },
    [`${dir}/eeeeee0000000006.json`]: async () => [{ id: "x" }],
  };
  for (const path of Object.keys(bad)) mem.files.set(path, {});
  const warned = [];
  const warn = mock.method(console, "warn", (...a) => { warned.push(a); });
  try {
    useStore({ ...mem, get: path => bad[path]?.() ?? mem.get(path) });
    const all = await api.list({ status: "all" });
    assert.deepEqual(all.reports.map(r => r.id), ["aaaaaa0000000001", "aaaaab0000000002", "bbbbbb0000000003"]);
    assert.equal(all.count, 3);
    assert.deepEqual((await api.list()).reports.map(r => r.id), ["aaaaaa0000000001"]);
    const skipped = warned.filter(([line]) => String(line).startsWith(`${MODULE} | `)).map(([, path]) => path);
    assert.deepEqual(skipped, [...Object.keys(bad), ...Object.keys(bad)], "one warn per skipped path per read");
    warned.length = 0;
    assert.deepEqual((await api.inspect(IDS.player)).reports.map(r => r.id), ["aaaaaa0000000001", "aaaaab0000000002", "bbbbbb0000000003"], "inspect's reports, not null");
  } finally {
    warn.mock.restore();
    useStore(mem);
    for (const path of Object.keys(bad)) mem.files.delete(path);
  }
});

// feedback-async-3 (+perf-2): readAll awaited one GET per report file before starting the next,
// so list() over N files cost N round trips. Now up to LIMITS.readsInFlight GETs run at once;
// results land by index, so the order (and EC-3's skips and their warn order) is unchanged.
test("feedback-async-3: list() reads report files 6 at a time, keeping file order and skip warns in order", async () => {
  seed();
  const extra = Array.from({ length: 11 }, (_, i) => `${dir}/ffffff00000000${String(i).padStart(2, "0")}.json`);
  for (const [i, path] of extra.entries()) {
    const r = normaliseReport(queuedReport(path.split("/").pop().slice(0, 16), { t: T0 + i, category: "bug", text: `extra ${i}` }),
      { user: { id: IDS.player, name: "Caven's player", role: 1 }, receivedAt: T0 + i });
    mem.files.set(path, r);
  }
  const bad = new Set([extra[3], extra[8]]);
  const paths = [...mem.files.keys()];
  let inFlight = 0, peak = 0;
  const warned = [];
  const warn = mock.method(console, "warn", (...a) => { warned.push(a); });
  try {
    useStore({
      ...mem,
      get: async path => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        // later files answer sooner, so completion order is the reverse of file order
        await new Promise(r => setTimeout(r, paths.length - paths.indexOf(path)));
        inFlight -= 1;
        if (bad.has(path)) throw new SyntaxError("Unexpected token < in JSON");
        return mem.get(path);
      },
    });
    const all = await api.list({ status: "all" });
    assert.equal(peak, LIMITS.readsInFlight, "GETs overlap, capped at LIMITS.readsInFlight");
    assert.equal(LIMITS.readsInFlight, 6);
    const want = paths.filter(p => !bad.has(p)).map(p => mem.files.get(p)).sort((a, b) => a.t - b.t).map(r => r.id);
    assert.deepEqual(all.reports.map(r => r.id), want);
    const skipped = warned.filter(([line]) => String(line).startsWith(`${MODULE} | `)).map(([, path]) => path);
    assert.deepEqual(skipped, [extra[3], extra[8]], "skip warns follow file order, not completion order");
  } finally {
    warn.mock.restore();
    useStore(mem);
    for (const path of extra) mem.files.delete(path);
  }
});

test("get: full id or unique prefix; NOT_FOUND, AMBIGUOUS, BAD_ARGS are thrown (reads throw coded)", async () => {
  seed();
  assert.equal((await api.get({ id: "aaaaab" })).text, "A map tab for the party");
  assert.equal((await api.get({ id: "aaaaaa0000000001" })).category, "bug");
  assert.equal(await code(() => api.get({ id: "aaaaa" })), "AMBIGUOUS");
  assert.equal(await code(() => api.get({ id: "zzz" })), "NOT_FOUND");
  assert.equal(await code(() => api.get({ id: "../x" })), "BAD_ARGS");
});

test("resolve: transitions, history, dryRun, refusals as fail(); an audit line per write", async () => {
  seed();
  audit.length = 0;
  const path = `${dir}/aaaaaa0000000001.json`;
  const dry = await api.resolve({ id: "aaaaaa", status: "triaged", note: "repro'd", dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(mem.files.get(path).status, "open", "dryRun writes nothing");
  const t1 = await api.resolve({ id: "aaaaaa", status: "triaged", note: "repro'd" });
  assert.deepEqual(t1, { ok: true, id: "aaaaaa0000000001", status: "triaged", history: [{ t: T0, status: "triaged", note: "repro'd", by: "gm:Gamemaster" }] });
  const t2 = await api.resolve({ id: "aaaaaa", status: "resolved", note: "fixed in dropbin 0.4.1" });
  assert.equal(t2.history.length, 2);
  assert.equal(mem.files.get(path).status, "resolved");
  assert.deepEqual(await api.resolve({ id: "aaaaaa", status: "open" }), { ok: false, code: "REFUSED", reason: "resolved → open needs force" });
  assert.equal((await api.resolve({ id: "aaaaaa", status: "open", force: true })).status, "open");
  assert.equal((await api.resolve({ id: "nope", status: "triaged" })).code, "NOT_FOUND");
  assert.equal((await api.resolve({ id: "aaaaaa", status: "done" })).code, "REFUSED");
  assert.deepEqual(audit.filter(([line]) => line === `${MODULE} | resolve`).map(([, f]) => [f.status, f.by]),
    [["triaged", gm.id], ["resolved", gm.id], ["open", gm.id]]);
  F.become({ userId: IDS.player });
  assert.equal((await api.resolve({ id: "aaaaaa", status: "wontfix" })).code, "NOT_GM");
  F.become({ userId: gm.id });
});

test("feedback-rob-2: resolve(null) answers a fail(), never throws", async () => {
  seed();
  assert.equal((await api.resolve(null)).code, "BAD_ARGS");
  F.become({ userId: IDS.player });
  assert.equal((await api.resolve(null)).code, "NOT_GM");
  F.become({ userId: gm.id });
});

test("every patch record names an adjustments row with the module prefix", () => {
  const patches = api.describe().patches;
  assert.equal(patches.length, 3);
  for (const p of patches) assert.match(p.adjustments, /^feedback-/, p.label);
});

test("described settings are exactly the SETTINGS table; settings() snapshots them", () => {
  assert.deepEqual(api.describe().settings.map(s => s.key), SETTINGS.map(r => r.key));
  assert.deepEqual(api.settings(), { historySize: 200, captureConsole: true });
});

test("selftest passes on a healthy load once the toolbar exists", () => {
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  ui.controls.controls = controls;
  const out = api.selftest();
  assert.equal(out.ok, true, JSON.stringify(out.checks));
  ui.controls.controls = {};
  assert.equal(api.selftest().ok, false, "no toolbar yet → the check says so");
});

test("feedback-EXT-2: selftest checks every console wrap, not only console.error", async () => {
  const { CONSOLE_PATCHES } = await import("../recorder.mjs");
  const { wrapMethod } = await import("../lib/patch.mjs");
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  ui.controls.controls = controls;
  const consoleCheck = () => api.selftest().checks.find(c => c.label === "console wraps match captureConsole");
  assert.deepEqual(CONSOLE_PATCHES.map(p => p.adjustments), ["feedback-console-error", "feedback-console-warn"]);
  assert.equal(consoleCheck()?.ok, true);
  assert.deepEqual(consoleCheck().detail, { captureConsole: true, wraps: { "console.error": true, "console.warn": true } });
  const spec = { target: console, ...CONSOLE_PATCHES.find(p => p.name === "warn"), label: "console.warn" };
  wrapMethod(MODULE, spec, () => {}).unwrap();                  // the existing handle: drop the warn wrap
  assert.equal(consoleCheck().ok, false, "a missing console.warn wrap fails the check");
  assert.deepEqual(consoleCheck().detail.wraps, { "console.error": true, "console.warn": false });
  assert.equal(api.selftest().ok, false);
  wrapMethod(MODULE, spec, (wrapped, ...args) => wrapped(...args));
  assert.equal(consoleCheck().ok, true);
  ui.controls.controls = {};
});
