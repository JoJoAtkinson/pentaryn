// The API (guide S6): manifest rows ↔ implementations, the kit members, describe(); what is
// published and when (D-P1); the -32 additions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot } from "./fixtures/world.mjs";
import { MODULE, VERSION, CONTRACT } from "../portals-core.mjs";
import { MANIFEST, BADGE_ROWS, PARTY_ROWS } from "../api-manifest.mjs";
import { buildApi } from "../lib/api.mjs";
import { makeLog } from "../lib/log.mjs";
import { hookRegistry } from "../lib/hooks.mjs";

const { W } = await boot();
await W.tick();
// after the stub: card-app.mjs extends ApplicationV2 at evaluation
const { buildApiFor } = await import("../api.mjs");
const badges = await import("../badges.mjs");
const party = await import("../party.mjs");

const offline = () => {
  const log = makeLog(MODULE);
  return { log, reg: hookRegistry(MODULE, log), contributions: [party.contribution(), badges.contribution()], uninstall() {} };
};

test("buildApiFor: the four own rows plus the features' three, all legacy, every described path a function", () => {
  const api = buildApiFor(offline());
  const paths = api.describe().methods.map(m => m.path);
  assert.deepEqual(paths, ["snapshot", "cardFor", "teleportParty", "lookAt", "spreadArrival", "open", "redraw"]);
  for (const p of paths) assert.equal(typeof api[p], "function", p);
  assert.ok(api.describe().methods.every(m => m.legacy === true));
  assert.equal(api.version, VERSION);
  assert.equal(api.contract, CONTRACT);
  assert.ok(Object.isFrozen(api));
  assert.deepEqual(api.settings(), { teleportDefault: true, spreadArrivals: true, confirmPartyTeleport: true });
});

test("the published functions are the module's own (names unchanged for the legacy surface)", () => {
  const api = buildApiFor(offline());
  assert.deepEqual(Object.fromEntries(["snapshot", "cardFor", "teleportParty", "lookAt", "open", "redraw", "spreadArrival"].map(k => [k, api[k].name])),
    { snapshot: "snapshot", cardFor: "cardFor", teleportParty: "teleportParty", lookAt: "lookAt", open: "open", redraw: "drawBadges", spreadArrival: "spreadArrival" });
});

test("drift fails at build: a row without an implementation, or a contribution row twice", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
  const ctx = offline();
  ctx.contributions.push({ rows: PARTY_ROWS, impl: {} });
  assert.throws(() => buildApiFor(ctx), /defined twice/);
  assert.equal(BADGE_ROWS.length + PARTY_ROWS.length + MANIFEST.rows.length, 7);
});

test("describe(): flags written and read, the three settings, no events, no patches", () => {
  const d = buildApiFor(offline()).describe();
  assert.deepEqual(d.flags.writes, ["flags.pentaryn-portals.title", "flags.pentaryn-portals.img", "flags.pentaryn-portals.description"]);
  assert.ok(d.flags.reads.includes("flags.pentaryn-aoe.handleActor"));
  assert.deepEqual(d.settings.map(s => s.key), ["teleportDefault", "spreadArrivals", "confirmPartyTeleport"]);
  assert.deepEqual([d.events, d.patches, d.flagScope], [[], [], MODULE]);
});
