// The two adapters without the entry: the file store over a fake FilePicker + fetch (the real
// upload and static fetch are live-only — see README "Tests"), and the snapshot's per-section
// isolation (one broken section never blocks a report).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installClient } from "./fixtures/world.mjs";

await installClient();
const { dirChain, fileStore, splitPath } = await import("../files-adapter.mjs");
const { attachSummary, openWindows, snapshot, windowRow } = await import("../snapshot-adapter.mjs");

function fakeServer() {
  const disk = new Map();
  const dirs = new Set();
  const calls = [];
  const fp = {
    async createDirectory(source, dir) {
      calls.push(["mkdir", source, dir]);
      if (dirs.has(dir)) throw new Error(`EEXIST: ${dir}`);
      dirs.add(dir);
    },
    async upload(source, dir, file, body, opts) {
      calls.push(["upload", source, dir, file.name, file.type, opts]);
      if (!dirs.has(dir)) return { status: "error", message: "no such folder" };
      disk.set(`${dir}/${file.name}`, await file.text());
      return { status: "success", path: `${dir}/${file.name}` };
    },
    async browse(source, dir) {
      calls.push(["browse", source, dir]);
      if (!dirs.has(dir)) throw new Error("ENOENT");
      return { files: [...disk.keys()].filter(p => p.startsWith(`${dir}/`)).map(encodeURI) };
    },
  };
  const fetch = async url => {
    calls.push(["fetch", url]);
    const path = decodeURI(url.replace(/^\/|\?t=\d+$/g, ""));
    return disk.has(path)
      ? { ok: true, status: 200, json: async () => JSON.parse(disk.get(path)) }
      : { ok: false, status: 404, json: async () => null };
  };
  return { disk, dirs, calls, fp, fetch };
}

test("dirChain / splitPath", () => {
  assert.deepEqual(dirChain("pentaryn-feedback/w"), ["pentaryn-feedback", "pentaryn-feedback/w"]);
  assert.deepEqual(dirChain(""), []);
  assert.deepEqual(splitPath("a/b/c.json"), ["a/b", "c.json"]);
  assert.deepEqual(splitPath("c.json"), ["", "c.json"]);
});

test("put creates each folder once per tab (EEXIST tolerated), uploads pretty JSON without a toast", async () => {
  const s = fakeServer();
  s.dirs.add("pentaryn-feedback");                       // a previous session made the root
  const files = fileStore({ fp: s.fp, fetch: s.fetch, route: p => `/${p}` });
  await files.put("pentaryn-feedback/w/AAAA.json", { a: 1 });
  await files.put("pentaryn-feedback/w/BBBB.json", { b: 2 });
  // the root's EEXIST marks it made like a success does: neither folder is asked for again
  assert.deepEqual(s.calls.filter(c => c[0] === "mkdir").map(c => c[2]), ["pentaryn-feedback", "pentaryn-feedback/w"]);
  const up = s.calls.find(c => c[0] === "upload");
  assert.deepEqual(up, ["upload", "data", "pentaryn-feedback/w", "AAAA.json", "application/json", { notify: false }]);
  assert.equal(s.disk.get("pentaryn-feedback/w/AAAA.json"), '{\n "a": 1\n}');
});

test("a mkdir that fails once (not EEXIST) is retried and succeeds on the next put (feedback-rob-3)", async () => {
  const s = fakeServer();
  let fail = true;
  const fp = {
    ...s.fp,
    async createDirectory(source, dir) {
      if (fail && dir === "pentaryn-feedback/w") {
        s.calls.push(["mkdir", source, dir]);
        fail = false;
        throw new Error("EACCES: permission denied");
      }
      return s.fp.createDirectory(source, dir);
    },
  };
  const files = fileStore({ fp, fetch: s.fetch, route: p => `/${p}` });
  await assert.rejects(files.put("pentaryn-feedback/w/AAAA.json", { a: 1 }), { code: "INTERNAL" });
  await files.put("pentaryn-feedback/w/BBBB.json", { b: 2 });   // the folder is asked for again
  assert.deepEqual(s.calls.filter(c => c[0] === "mkdir").map(c => c[2]),
    ["pentaryn-feedback", "pentaryn-feedback/w", "pentaryn-feedback/w"]);
  assert.equal(s.disk.get("pentaryn-feedback/w/BBBB.json"), '{\n "b": 2\n}');
});

test("an upload refusal throws a coded error", async () => {
  const s = fakeServer();
  const files = fileStore({ fp: { ...s.fp, createDirectory: async () => undefined }, fetch: s.fetch });
  await assert.rejects(files.put("x/y.json", {}), { code: "INTERNAL" });
});

test("get / exists / list over the static fetch and browse; a missing folder lists empty", async () => {
  const s = fakeServer();
  const files = fileStore({ fp: s.fp, fetch: s.fetch, route: p => `/${p}` });
  assert.deepEqual(await files.list("pentaryn-feedback/w"), []);
  await files.put("pentaryn-feedback/w/My Report.json", { id: 1 });
  assert.deepEqual(await files.get("pentaryn-feedback/w/My Report.json"), { id: 1 });
  assert.equal(await files.get("pentaryn-feedback/w/none.json"), null);
  assert.equal(await files.exists("pentaryn-feedback/w/My Report.json"), true);
  assert.deepEqual(await files.list("pentaryn-feedback/w"), ["pentaryn-feedback/w/My Report.json"]);
  const f = s.calls.find(c => c[0] === "fetch");
  assert.match(f[1], /\?t=\d+$/, "cache-busted");
});

test("a non-404 HTTP error on get is thrown, coded", async () => {
  const files = fileStore({ fp: {}, fetch: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(files.get("a/b.json"), { code: "INTERNAL", message: "INTERNAL: fetch a/b.json: HTTP 500" });
});

test("snapshot: every section present; a throwing section becomes { error } and the rest survive", () => {
  const snap = snapshot();
  assert.deepEqual(Object.keys(snap), ["world", "user", "scene", "tokens", "combat", "windows", "modules", "client", "chat"]);
  assert.equal(snap.world.id, "test-world");
  assert.equal(snap.combat, null);
  const g = { ...globalThis, game: { ...game, get combat() { throw new Error("combat broke"); } } };
  const broken = snapshot({ g });
  assert.deepEqual(broken.combat, { error: "combat broke" });
  assert.equal(broken.world.id, "test-world");
});

test("feedback-M2: a throwing section or row keeps a redacted error", () => {
  const g = { ...globalThis, game: { ...game, get combat() { throw new Error("combat broke token=abcdefghijklmnop"); } } };
  assert.deepEqual(snapshot({ g }).combat, { error: "combat broke token=[redacted]" });
  class BrokenSheet { get title() { throw new Error("title broke Bearer abc.def"); } }
  const apps = new Map([["bad", Object.assign(new BrokenSheet(), { id: "bad" })]]);
  const g2 = { ...globalThis, foundry: { ...foundry, applications: { ...foundry.applications, instances: apps } } };
  assert.equal(snapshot({ g: g2 }).windows.find(w => w.cls === "?").error, "title broke Bearer [redacted]");
});

test("windowRow / attachSummary", () => {
  class ActorSheet5eCharacter {}
  assert.deepEqual(windowRow(Object.assign(new ActorSheet5eCharacter(), { id: "s1", title: "Caven" })), { id: "s1", cls: "ActorSheet5eCharacter", title: "Caven" });
  assert.deepEqual(attachSummary({ user: { name: "P" }, scene: { viewed: { name: "S" } }, chat: [1], windows: [1, 2], modules: [] }, { actions: 4, errors: 1 }),
    { user: "P", scene: "S", actions: 4, errors: 1, chat: 1, windows: 2, modules: 0 });
});

test("snapshot: one bad row (a window whose title getter throws, an unreadable chat message) is a row with an error, not a lost section", () => {
  class BrokenSheet { get title() { throw new Error("title broke"); } }
  const apps = new Map([["ok", Object.assign(new (class GoodSheet {})(), { id: "ok", title: "Fine" })], ["bad", Object.assign(new BrokenSheet(), { id: "bad" })]]);
  const badMessage = { get author() { throw new Error("author broke"); } };
  const g = {
    ...globalThis,
    foundry: { ...foundry, applications: { ...foundry.applications, instances: apps } },
    game: { ...game, messages: { contents: [...game.messages.contents, badMessage] } },
  };
  const snap = snapshot({ g });
  assert.ok(Array.isArray(snap.windows), "the section survives");
  assert.deepEqual(snap.windows.find(w => w.id === "ok"), { id: "ok", cls: "GoodSheet", title: "Fine" });
  assert.deepEqual(snap.windows.find(w => w.cls === "?"), { id: "", cls: "?", title: "", error: "title broke" });
  assert.ok(Array.isArray(snap.chat), "an unreadable message is skipped, the section survives");
});

test("buildReport: a failed list section ({ error }) becomes [] with sectionErrors, and the report validates and files", async () => {
  const { buildReport, normaliseReport, validateReport } = await import("../feedback-core.mjs");
  const g = {
    ...globalThis,
    foundry: { ...foundry, applications: { ...foundry.applications, get instances() { throw new Error("instances broke"); } } },
    game: { ...game, get modules() { throw new Error("modules broke"); } },
  };
  const snap = snapshot({ g });
  assert.deepEqual(snap.windows, { error: "instances broke" });
  const report = buildReport({ id: "k3Yx9Qp2LmN7aB4c", t: 1, draft: { text: "it broke" }, snapshot: snap });
  assert.deepEqual(report.windows, []);
  assert.deepEqual(report.modules, []);
  assert.deepEqual(report.sectionErrors, { windows: "instances broke", modules: "modules broke" });
  assert.deepEqual(validateReport(report), { ok: true });
  const filed = normaliseReport(report, { user: { id: "u1", name: "P" } });
  assert.deepEqual(filed.sectionErrors, { windows: "instances broke", modules: "modules broke" });
});

test("openWindows: the player's framed windows, newest 20 — never core's UI panels, directories, frameless apps or our dialog", () => {
  const make = (cls, props = {}) => Object.assign(new ({ [cls]: class {} })[cls](), props);
  const chat = make("ChatLog", { id: "chat" });
  const players = make("Players", { id: "players" });
  const hud = make("TokenHUD", { id: "hud", hasFrame: false });
  const actors = make("ActorDirectory", { id: "actors" });
  const mine = make("ReportDialog", { id: "pentaryn-feedback-report" });
  const sidebarSingleton = make("SomeUiPanel", { id: "panel" });
  const sheets = Array.from({ length: 25 }, (_, i) => make("ActorSheet5eCharacter", { id: `sheet-${i}`, title: `Sheet ${i}`, hasFrame: true }));
  const legacy = make("LegacyApp", { appId: 7, title: "Old window" });
  const apps = new Map([chat, players, hud, actors, mine, sidebarSingleton, ...sheets].map(a => [a.id, a]));
  const g = { ...globalThis, foundry: { ...foundry, applications: { ...foundry.applications, instances: apps } },
    ui: { ...ui, chat, players, panel: sidebarSingleton, windows: { 7: legacy } } };
  const ids = openWindows(g).map(a => a.id ?? a.appId);
  assert.deepEqual(ids, [...sheets.map(s => s.id), 7]);
  const snap = snapshot({ g });
  assert.equal(snap.windows.length, 20);
  assert.equal(snap.windows[0].id, "sheet-6", "the newest 20 are kept, not the first");
  assert.deepEqual(snap.windows.at(-1), { id: "7", cls: "LegacyApp", title: "Old window" });
});
