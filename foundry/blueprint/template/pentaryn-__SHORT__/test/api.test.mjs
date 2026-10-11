// The published API: rows ↔ implementations, the describe/surface/queries goldens, inspect's
// shape, the write contract, and the ref resolver at the boundary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { IDS, world } from "./fixtures/actors.mjs";
import { MODULE } from "../__SHORT__-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { SETTINGS } from "../settings.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";

const F = await installFoundry(world(MODULE));
const audit = [];
console.info = (line, fields) => audit.push([line, fields]);
await import("../__SHORT__.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.modules.get(MODULE).api;
const gm = game.user;
const player = game.users.get(IDS.player);
const code = async fn => { try { await fn(); return "ok"; } catch (e) { return e.code ?? e.message; } };

test("every described method is a function on the API (contributions included)", () => {
  const methods = api.describe().methods.map(m => m.path);
  assert.ok(methods.includes("recent"), "the example feature's contribution is missing");
  for (const path of methods) {
    const fn = path.split(".").reduce((o, k) => o?.[k], api);
    assert.equal(typeof fn, "function", path);
  }
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("describe() equals golden/describe.json (version, kit, published and patch routes excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("each query:true row is in CONFIG.queries, rejects a non-GM, and its payload is pinned", async () => {
  const rows = api.describe().methods.filter(m => m.query);
  for (const row of rows) assert.equal(typeof CONFIG.queries[`${MODULE}.${row.path}`], "function", row.path);
  const inspectQ = CONFIG.queries[`${MODULE}.inspect`];
  await assert.rejects(inspectQ({ ref: IDS.aldric }, { user: player }), { message: "NOT_GM: P is not a GM" });
  pinJSON("queries", {
    inspect: await inspectQ({ ref: IDS.aldric }, { user: gm }),
    inspectMissing: await inspectQ({ ref: "Nobody" }, { user: gm }).catch(e => ({ threw: e.message })),
  }, import.meta.url);
});

test("inspect: plain JSON, depth ≤ 4, Documents only as refs", () => {
  const out = api.inspect(IDS.aldric);
  assert.ok(maxDepth(out) <= 4);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
  assert.deepEqual(out.actor, { documentName: "Actor", id: IDS.aldric, uuid: `Actor.${IDS.aldric}`, name: "Aldric Vane" });
});

test("refs: exact, case-insensitive, uuid, token; never a substring; ambiguity is coded", async () => {
  assert.equal(api.inspect("Aldric Vane").actor.id, IDS.aldric);
  assert.equal(api.inspect("aldric vane").actor.id, IDS.aldric);
  assert.equal(api.inspect(`Actor.${IDS.aldric}`).actor.id, IDS.aldric);
  assert.equal(api.inspect(`Scene.${IDS.sceneOne}.Token.${IDS.tokOne}`).actor.id, IDS.aldric);
  assert.equal(api.inspect(IDS.tokTwo).actor.id, IDS.aldric);          // no canvas.scene needed
  assert.equal(await code(() => api.inspect("Ald")), "NOT_FOUND");
  assert.equal(await code(() => api.inspect("Mira")), "AMBIGUOUS");
  assert.equal(await code(() => api.inspect(42)), "BAD_ARGS");
});

test("inspect: opts.sceneId scopes a token ref; opts.as answers with that user's view", async () => {
  assert.equal(await code(() => api.inspect(IDS.tokOne, { sceneId: IDS.sceneTwo })), "NOT_FOUND");
  assert.equal(api.inspect(IDS.tokTwo, { sceneId: IDS.sceneTwo }).actor.id, IDS.aldric);
  const asPlayer = api.inspect(IDS.aldric, { as: IDS.player });
  assert.equal(asPlayer.note, null);
  assert.equal(asPlayer.lastSeen, null);
  // @if dnd5e
  assert.equal(asPlayer.hp, null);                                      // no OBSERVER on Aldric
  assert.deepEqual(api.inspect(IDS.aldric, { as: game.user.id }).hp, { value: 9, max: 20, bloodied: true });
  // @endif
  assert.equal(await code(() => api.inspect(IDS.aldric, { as: "Nobody" })), "NOT_FOUND");
});

test("note: a bad ref is a refusal, never a throw", async () => {
  assert.deepEqual(await api.note("Nobody", { text: "x" }), { ok: false, code: "NOT_FOUND", reason: "NOT_FOUND: actor Nobody" });
  assert.equal((await api.note("Mira", { text: "x" })).code, "AMBIGUOUS");
});

test("note: refuses a player, dry-runs without writing, writes for a GM, clears on empty text", async () => {
  F.become({ userId: IDS.player });
  assert.deepEqual(await api.note(IDS.aldric, { text: "x" }), { ok: false, code: "NOT_GM", reason: "only a GM writes notes" });
  F.become({ userId: gm.id });
  const before = F.calls.length;
  assert.equal((await api.note(IDS.aldric, { text: "x", dryRun: true })).dryRun, true);
  assert.equal(F.calls.slice(before).some(c => c.op === "update"), false);
  assert.deepEqual(await api.note("Aldric Vane", { text: "  watch   him " }), { ok: true, actor: api.inspect(IDS.aldric).actor, note: "watch him" });
  assert.equal(api.inspect(IDS.aldric).note, "watch him");
  assert.equal(api.inspect(IDS.aldric).lastSeen.note, "watch him");
  assert.deepEqual((await api.note(IDS.aldric, { text: "" })).note, null);
  assert.equal(api.inspect(IDS.aldric).note, null);
  assert.equal(api.recent()[0].id, IDS.aldric);
  // every cross-user write leaves one audit line: {uuid, ids, by}
  assert.deepEqual(audit.filter(([line]) => line === `${MODULE} | note`).map(([, f]) => f.by), [gm.id, gm.id]);
});

test("every patch record names an adjustments row", () => {
  for (const p of api.describe().patches) assert.ok(p.adjustments, p.label);
});

test("described settings are exactly the SETTINGS table; settings() snapshots them", () => {
  assert.deepEqual(api.describe().settings.map(s => s.key), SETTINGS.map(r => r.key));
  assert.deepEqual(Object.keys(api.settings()), SETTINGS.map(r => r.key));
});

test("selftest passes on a healthy load", () => {
  const out = api.selftest();
  assert.equal(out.ok, true, JSON.stringify(out.checks));
});
