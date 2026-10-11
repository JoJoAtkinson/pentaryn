// Glue characterisation (guide step 1.5). The unchanged entry is loaded as Foundry would on the active
// GM's client; its effects are pinned through init, the query relay, ready, createUser, the API and the
// render/activateNote hooks. Timers are mocked (the ready tick, the 100 ms bar refresh debounce).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON, readJSON } from "./kit/harness.mjs";
import { GM, GM2, P1, P2, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });

const MOD = "pentaryn-journal";
const F = await journalWorld();
await import("../journal.mjs");

const mark = () => F.calls.length;
const since = (from, op) => F.calls.slice(from).filter(c => !op || c.op === op);
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
async function withConsole(fn) {
  const lines = [];
  const keep = {};
  for (const k of ["log", "debug", "info", "warn", "error"]) {
    keep[k] = console[k];
    console[k] = (...a) => { lines.push([k, ...a.map(x => (x instanceof Error ? `Error: ${x.message}` : F.plain(x)))]); };
  }
  try {
    await fn();
  } finally {
    Object.assign(console, keep);
  }
  return lines;
}

test("foundry.utils is Foundry's own common/ code", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("init: three settings registered exactly as today (golden/settings-register.json); the relay query exists", () => {
  F.fire("init");
  const rows = [...game.settings.settings.values()].filter(s => s.namespace === MOD).map(s => ({
    key: s.key, scope: s.scope, config: s.config, type: s.type?.name ?? null, default: s.default,
    name: s.name ?? null, hint: s.hint ?? null, onChange: typeof s.onChange === "function",
  }));
  pinJSON("settings-register", rows, import.meta.url);
  assert.deepEqual(rows.map(r => r.key), ["gmButton", "singlePageReadables", "folderName"]);
  assert.equal(typeof CONFIG.queries["pentaryn-journal.ensure"], "function");
});

test("relay on a client that is not the active GM rejects 'not the active GM'", async () => {
  const relay = CONFIG.queries["pentaryn-journal.ensure"];
  F.become({ userId: GM2 });
  // [declared] (C30): the kit's relayed answers with the coded NOT_GM (was 'not the active GM').
  await assert.rejects(relay({}, { user: game.users.get(P1) }), { message: "NOT_GM: this client is not the active GM", code: "NOT_GM" });
  F.become({ userId: P1 });
  await assert.rejects(relay({}, { user: game.users.get(P1) }), { message: "NOT_GM: this client is not the active GM", code: "NOT_GM" });
  F.become({ userId: GM });
});

test("relay on the active GM for a player: one Folder create, then that player's journal; resolves {entryId}", async () => {
  const relay = CONFIG.queries["pentaryn-journal.ensure"];
  const from = mark();
  const out = await relay({ ignored: true }, { user: game.users.get(P1) });
  const creates = since(from).filter(c => /\.create$/.test(c.op));
  assert.deepEqual(creates.map(c => c.op), ["Folder.create", "JournalEntry.create"]);
  assert.deepEqual(creates[0].data, { name: "Player Journals", type: "JournalEntry" });
  const folderId = game.folders.contents[0].id;
  assert.deepEqual(creates[1].data, {
    name: "Talo Vesk's Journal", folder: folderId,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [P1]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { [MOD]: { kind: "personal", userId: P1 } },
  });
  assert.deepEqual(Object.keys(out), ["entryId"]);
  assert.equal(game.journal.get(out.entryId).name, "Talo Vesk's Journal");
  const again = await relay({}, { user: game.users.get(P1) });
  assert.equal(again.entryId, out.entryId, "idempotent: the existing journal");
});

test("ready on the active GM: ensureAll makes the missing player journal; report() shape (golden/report.json)", async () => {
  const from = mark();
  await withConsole(async () => {
    F.fire("ready");
    await flush();
  });
  const made = since(from, "JournalEntry.create").map(c => c.data.name);
  assert.deepEqual(made, ["Quinn's Journal"], "players only, one each; the GMs get none");
  // D-J1 [declared] (guide step 6, D2): published at ready by the kit, not one tick later; frozen; module.api canonical.
  assert.equal(game.modules.get(MOD).api, game.pentaryn.journal, "published at ready, on module.api");
  assert.equal(Object.isFrozen(game.pentaryn.journal), true);
  mock.timers.tick(0);
  await flush();
  const r = game.pentaryn.journal.report();
  const ids = Object.fromEntries(game.journal.contents.map((j, i) => [j.id, `<journal${i + 1}>`]));
  const folder = game.folders.contents[0].id;
  pinJSON("report", JSON.parse(JSON.stringify(r).replaceAll(folder, "<folder>").replace(/"(JournalEntry[^"]*|[A-Za-z0-9]{16})"/g, (m, id) => (ids[id] ? `"${ids[id]}"` : m))), import.meta.url);
  assert.deepEqual(Object.keys(r), ["folder", "users", "atRoot"]);
  assert.deepEqual(Object.keys(r.users[0]), ["user", "userId", "isGM", "journalId", "pages", "duplicates"]);
});

test("published after one tick: the legacy keys (a floor) and the 18 core names (golden/core-keys.json, a floor)", () => {
  const api = game.pentaryn.journal;
  const legacy = ["personal", "add", "status", "open", "shouldShowBar", "ensure", "ensureAll", "report", "core"];
  assert.deepEqual(Object.keys(api).filter(k => legacy.includes(k)), legacy);
  const names = Object.keys(api.core).sort();
  if (process.env.GOLDEN_UPDATE === "1") pinJSON("core-keys", names, import.meta.url);
  const pinned = readJSON(new URL("./golden/core-keys.json", import.meta.url));
  assert.equal(pinned.length, 18);
  for (const k of pinned) assert.ok(k in api.core, k);
  assert.equal(api.core.MOD, MOD);
});

test("createUser: a player on the active GM gets one ensure; a GM user, or a non-active GM client, nothing", async () => {
  const newbie = { id: "player0000000003", name: "Newbie", isGM: false };
  game.users.set(newbie.id, newbie);
  let from = mark();
  F.fire("createUser", newbie);
  await flush();
  assert.deepEqual(since(from, "JournalEntry.create").map(c => c.data.name), ["Newbie's Journal"]);
  from = mark();
  F.fire("createUser", { id: "gmUser0000000009", name: "Another GM", isGM: true });
  F.become({ userId: GM2 });
  F.fire("createUser", { id: "player0000000004", name: "Late", isGM: false });
  F.become({ userId: GM });
  await flush();
  assert.deepEqual(since(from, "JournalEntry.create"), []);
});

test("ensure() as a player rejects 'GM only'; ensureAll() as a player is null", async () => {
  F.become({ userId: P1 });
  await assert.rejects(game.pentaryn.journal.ensure(game.users.get(P2)), { message: "GM only" });
  assert.equal(await game.pentaryn.journal.ensureAll(), null);
  F.become({ userId: GM });
});

test("personal(): the user's own journal (oldest first); null for a user without one", () => {
  assert.equal(game.pentaryn.journal.personal(game.users.get(P1)).name, "Talo Vesk's Journal");
  assert.equal(game.pentaryn.journal.personal(game.users.get(GM)), null);
});

test("add(entry) and status(entry) as the GM with gmButton off → null (items-journal-35 premise)", async () => {
  const entry = { documentName: "JournalEntry", id: "readable00000001", name: "Readable", flags: {}, testUserPermission: () => true };
  assert.equal(await game.pentaryn.journal.add(entry), null);
  assert.equal(game.pentaryn.journal.status(entry), null);
  assert.equal(game.pentaryn.journal.shouldShowBar(entry), false);
  assert.equal(await game.pentaryn.journal.add(null), null);
});

test("shouldShowBar for a player: observer and not owner; never a personal journal or a pack entry", () => {
  const player = game.users.get(P1);
  const entry = (perm, extra = {}) => ({ documentName: "JournalEntry", flags: {}, testUserPermission: (u, level) => perm.includes(level), ...extra });
  assert.equal(game.pentaryn.journal.shouldShowBar(entry(["OBSERVER"]), player), true);
  assert.equal(game.pentaryn.journal.shouldShowBar(entry(["OBSERVER", "OWNER"]), player), false);
  assert.equal(game.pentaryn.journal.shouldShowBar(entry(["OBSERVER"], { pack: "x.y" }), player), false);
  assert.equal(game.pentaryn.journal.shouldShowBar(entry(["OBSERVER"], { flags: { [MOD]: { kind: "personal" } } }), player), false);
});

test("activateNote with a note whose document getter throws: no throw, no console output", async () => {
  const note = { get document() { throw new Error("gone"); } };
  const lines = await withConsole(() => F.fire("activateNote", note, {}));
  assert.deepEqual(lines, []);
  assert.equal(F.hookErrors.length, 0);
});

test("a render hook whose decorate throws: one console.warn 'pentaryn-journal | bar skipped'", async () => {
  const app = { get element() { throw new Error("detached"); } };
  const lines = await withConsole(() => F.fire("renderImagePopout", app));
  assert.deepEqual(lines, [["warn", "pentaryn-journal | bar skipped", "Error: detached"]]);
  const l2 = await withConsole(() => F.fire("renderItemSheet5e", app));
  assert.deepEqual(l2, [["warn", "pentaryn-journal | bar skipped", "Error: detached"]]);
});

test("gmButton onChange schedules the debounced bar refresh (100 ms) over rendered apps", async () => {
  let reads = 0;
  const app = { rendered: true, get element() { reads += 1; return null; } };
  const hidden = { rendered: false, get element() { reads += 100; return null; } };
  F.foundry.applications.instances.set("a", app);
  F.foundry.applications.instances.set("b", hidden);
  await game.settings.set(MOD, "gmButton", true);
  await game.settings.set(MOD, "gmButton", false);
  assert.equal(reads, 0, "debounced: nothing yet");
  mock.timers.tick(99);
  assert.equal(reads, 0);
  mock.timers.tick(1);
  assert.equal(reads, 1, "one refresh for two changes; unrendered apps skipped");
  F.fire("updateItem");
  F.fire("createJournalEntryPage");
  mock.timers.tick(100);
  assert.equal(reads, 2);
  F.fire("createJournalEntry", { documentName: "JournalEntry", flags: {} });
  mock.timers.tick(100);
  assert.equal(reads, 2, "someone else's journal: no refresh");
  F.foundry.applications.instances.clear();
});

test("a player's add(entry): one page copied into their journal, the sheet opened on it, one toast (golden/add.json)", async () => {
  F.become({ userId: P1 });
  const { makeDoc } = await import("./kit/foundry-stub.mjs");
  const folder = { name: "The Old Gate" };
  const readable = makeDoc("JournalEntry", { id: "readable00000002", name: "Gate Inscription", folder: null, ownership: { default: 2 } });
  Object.defineProperty(readable, "folder", { value: folder, enumerable: false });
  const pages = [
    makeDoc("JournalEntryPage", { id: "page000000000001", name: "Page 1", type: "text", sort: 1, ownership: { default: 2 },
      text: { content: "<p>Speak, friend.</p><section class=\"secret\"><p>GM only</p></section>" } }, { parent: readable }),
    makeDoc("JournalEntryPage", { id: "page000000000002", name: "Hidden", type: "text", sort: 2, ownership: { default: 0 },
      text: { content: "<p>not for players</p>" } }, { parent: readable }),
  ];
  Object.defineProperty(readable, "pages", { value: { contents: pages, filter: fn => pages.filter(fn) }, enumerable: false });
  const from = mark();
  const out = await game.pentaryn.journal.add(readable);
  const mine = game.pentaryn.journal.personal(game.users.get(P1));
  assert.equal(out.journal, mine);
  assert.deepEqual([out.created, out.updated, out.pageIds.length], [1, 0, 1]);
  const created = since(from, "createEmbeddedDocuments");
  assert.equal(created.length, 1);
  assert.doesNotMatch(JSON.stringify(created[0].data), /GM only|not for players/, "secrets and unobservable pages never copied");
  const render = since(from, "sheet.render");
  assert.deepEqual(render.map(r => r.opts), [{ force: true, pageId: out.pageIds[0], mode: 1, expanded: true }]);
  pinJSON("add", { pages: created[0].data, toasts: since(from, "notify").map(c => [c.level, c.message]) }, import.meta.url);
  assert.equal(game.pentaryn.journal.status(readable), "saved");
  F.become({ userId: GM });
});
