// Glue characterisation (guide step 1; behaviour tests of transform-creatures-32, -33 and -38). The
// unchanged entry is loaded as Foundry would on a GM client and its lifecycle fired; EFFECTS are
// pinned: hooks registered, document writes and toasts in order, console text, the published root.
// Stub fidelity notes (wave-1-baseline.md SF1, SF2, SF6, SF7) are in fixtures/world.mjs; the live run
// of 2026-10-11 is reproduced against fixtures/live-before.json.
//
// Pins and the steps that may touch them:
//   golden/hooks.json          — [on preUpdateActor, on updateActor, once ready]. No step may change it.
//   golden/legacy-surface.json — asserted as a SUBSET of Object.keys(game.pentaryn.names), so step 5's
//                                additive kit members do not move it.
//   golden/rename.json         — the effect log of one rename. No step may change it (step 7 keeps the
//                                toast text byte-identical; its optional console line is [declared]).
//   golden/root.json           — game.pentaryn under four load orders (subprocesses). No step may change it.
//   "module.api is undefined"  — flips at step 5 ([declared] N-D2, SF2).
//   KNOWN transform-creatures-33 (unhandled rejection) — flips at step 4 ([declared] N-D1).
//   KNOWN transform-creatures-38 (sync needs a document) — flips at step 6 ([declared] N-D3).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { pinJSON, readJSON } from "./kit/harness.mjs";
import * as oracle from "./fixtures/legacy-names.mjs";
import { PLAN, RELABEL, SHORT_NAME } from "./fixtures/tables.mjs";
import { IDS, MODULE, NEW, OLD, effects, equip, flush, liveLabels, reset, world } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const LIVE = readJSON(new URL("fixtures/live-before.json", import.meta.url));
const PROBE = fileURLToPath(new URL("fixtures/probe.mjs", import.meta.url));
const LEGACY = ["sync", "relabel", "shortName"];

const F = await installFoundry(world());
const asked = equip(F);
const lines = [];
const keep = {};
for (const level of ["log", "info", "warn", "error"]) {
  keep[level] = console[level];
  console[level] = (...args) => lines.push([level, ...args.map(a => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : F.plain(a)))]);
}
const toasts = () => F.calls.filter(c => c.op === "notify");

assert.equal(game.pentaryn, undefined, "nothing is published before the entry loads");
await import("../names.mjs");
assert.equal(game.pentaryn, undefined, "nothing is published at load");
F.fire("init");
F.fire("setup");
F.fire("ready");
const hooksAtReady = F.hooks.slice();
const linesAtBoot = lines.splice(0);
const api = game.pentaryn.names;
Object.assign(console, keep);

/* ── boot ─────────────────────────────────────────────────────────────────────────────────────── */

test("foundry.utils is Foundry's own common/ code", () => {
  console.log(`# foundry ${F.foundryBuild ?? "unknown"} · utils from ${F.utilsSource}`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") {
    assert.equal(F.utilsSource, "foundry", "set FOUNDRY_APP_ROOT to the app's resources/app, or PENTARYN_TEST_SHIMS=1");
  }
});

test("hook registration manifest (golden/hooks.json, C20 small-tier form)", () => {
  pinJSON("hooks", hooksAtReady, import.meta.url);
  assert.deepEqual(hooksAtReady, [
    { kind: "on", name: "preUpdateActor" },
    { kind: "on", name: "updateActor" },
    { kind: "once", name: "ready" },
  ]);
  assert.deepEqual(F.listeners(), { preUpdateActor: 1, updateActor: 1 }, "the ready once-hook is gone after it fired");
});

test("boot writes nothing to the console, makes no document write and no toast", () => {
  assert.deepEqual(linesAtBoot, []);
  assert.deepEqual(effects(F.calls), []);
});

/* ── publish ──────────────────────────────────────────────────────────────────────────────────── */

test("ready publishes game.pentaryn.names ⊇ sync, relabel, shortName (golden/legacy-surface.json, subset)", () => {
  const keys = Object.keys(api);
  if (process.env.GOLDEN_UPDATE === "1") pinJSON("legacy-surface", [...keys].sort(), import.meta.url);
  const golden = readJSON(new URL("golden/legacy-surface.json", import.meta.url));
  assert.deepEqual(golden, [...LEGACY].sort(), "the golden holds exactly the three legacy names");
  for (const k of golden) assert.equal(typeof api[k], "function", k);
  assert.deepEqual(LIVE.surface, golden, "live surface (2026-10-11) agrees");
  assert.deepEqual(Object.keys(game.pentaryn), ["names"], "a fresh root holds only names");
});

// [declared] at guide step 5 (N-D2): kit publish makes module.api canonical. Live agrees today (SF2).
test("module.api is undefined today (flips at step 5, N-D2)", () => {
  assert.equal(game.modules.get(MODULE).api, undefined);
  assert.equal(LIVE.moduleApi, "undefined");
});

test("game.pentaryn under four load orders (golden/root.json; subprocess per order)", () => {
  const view = which => {
    const r = spawnSync(process.execPath, [PROBE, which], { encoding: "utf8" });
    assert.equal(r.status, 0, `${which}: ${r.stderr}`);
    const o = JSON.parse(r.stdout.trim().split("\n").at(-1));
    const noisy = o.lines.filter(([level]) => level === "warn" || level === "error");
    assert.deepEqual(noisy, [], `${which}: no warn/error line`);
    const { keys, frozen, extensible, sameRoot, importKept, namesHasLegacy, otherKept } = o;
    return { keys, frozen, extensible, sameRoot, importKept, namesHasLegacy, otherKept };
  };
  const got = Object.fromEntries(["root-frozen-before-load", "root-frozen-after-load", "root-frozen-by-earlier-ready", "root-extensible"].map(c => [c, view(c)]));
  pinJSON("root", got, import.meta.url);
  // importer-first (frozen root before names loads, or put there by an earlier ready listener) and
  // names-first (frozen root set after names loads, before ready): the root is REBUILT, keeps import,
  // and is left extensible
  for (const c of ["root-frozen-before-load", "root-frozen-after-load", "root-frozen-by-earlier-ready"]) {
    assert.deepEqual(got[c].keys, ["import", "names"], c);
    assert.equal(got[c].sameRoot, false, c);
    assert.equal(got[c].extensible, true, c);
    assert.equal(got[c].importKept, true, c);
    assert.equal(got[c].namesHasLegacy, true, c);
  }
  // an extensible root (live after importer's keystone, SF1) is assigned into, never replaced
  assert.equal(got["root-extensible"].sameRoot, true);
  assert.equal(got["root-extensible"].otherKept, true);
});

test("the published relabel and shortName agree with the oracle on every table row", () => {
  for (const args of SHORT_NAME) assert.equal(api.shortName(...args), oracle.shortName(...args), JSON.stringify(args));
  for (const args of RELABEL) assert.equal(api.relabel(...args), oracle.relabel(...args), JSON.stringify(args));
  assert.deepEqual(
    [api.shortName("Glubbek, Kuo-toa Net-Mender"), api.shortName(null), api.shortName(" A , b")],
    LIVE.helpers.shortName,
  );
  assert.deepEqual(
    [api.relabel("Bob", "Bob", "Rob"), api.relabel("Glubbek", "Glubbek, Net-Mender", "Brakka, Elder"), api.relabel("Fishface", "Glubbek, Net-Mender", "X")],
    LIVE.helpers.relabel,
  );
});

/* ── preUpdateActor ───────────────────────────────────────────────────────────────────────────── */

test("preUpdateActor remembers the old name only when the name changes, and never vetoes", () => {
  reset(F);
  const actor = game.actors.get(IDS.bob);
  const cases = [
    [{ name: "Rob" }, { pentarynOldName: "Bob" }],
    [{ name: "Bob" }, {}],                                   // unchanged (live: stopped here, SF7)
    [{ img: "x" }, {}],
    [{ prototypeToken: { name: "Rob" } }, {}],               // names' own proto write
    [{ name: undefined }, { pentarynOldName: "Bob" }],       // "name" in changes, and undefined !== "Bob"
    [{ name: "" }, { pentarynOldName: "Bob" }],
  ];
  for (const [changes, want] of cases) {
    const options = {};
    const allowed = F.fireCall("preUpdateActor", actor, changes, options, IDS.gm);
    assert.equal(allowed, true, `never a veto: ${JSON.stringify(changes)}`);
    assert.deepEqual(options, want, JSON.stringify(changes));
  }
  assert.deepEqual(effects(F.calls), []);
});

test("preUpdateActor fires the same for any user (the old name is captured on every client that sees it)", () => {
  const options = {};
  F.fireCall("preUpdateActor", game.actors.get(IDS.bob), { name: "Rob" }, options, IDS.player);
  assert.deepEqual(options, { pentarynOldName: "Bob" });
});

/* ── updateActor ──────────────────────────────────────────────────────────────────────────────── */

test("updateActor does nothing for another user's change, names' own write, or without an old name", async () => {
  reset(F);
  const actor = game.actors.get(IDS.bob);
  actor.name = "Rob";
  F.fire("updateActor", actor, { name: "Rob" }, { pentarynOldName: "Bob" }, IDS.player);
  F.fire("updateActor", actor, { name: "Rob" }, { pentarynOldName: "Bob", pentarynNames: true }, IDS.gm);
  F.fire("updateActor", actor, { name: "Rob" }, {}, IDS.gm);
  F.fire("updateActor", actor, { name: "Rob" }, { pentarynOldName: "" }, IDS.gm);
  await flush();
  assert.deepEqual(F.calls, []);
  assert.equal(game.scenes.get(IDS.one).tokens.get("tokA1000000000001").name, "Bob");
});

test("a rename through actor.update relabels prototype + placed tokens, one write per scene, one toast (golden/rename.json)", async () => {
  reset(F);
  asked.length = 0;
  const actor = game.actors.get(IDS.bob);
  await actor.update({ name: "Rob" });
  await flush();
  const got = effects(F.calls);
  pinJSON("rename", { effects: got, asked }, import.meta.url);
  assert.deepEqual(got.map(c => c.op), ["update", "update", "updateEmbeddedDocuments", "updateEmbeddedDocuments", "notify"]);
  assert.deepEqual(got[0].changes, { name: "Rob" }, "the rename itself");
  assert.deepEqual(got[1].changes, { "prototypeToken.name": "Rob" }, "then the prototype");
  assert.deepEqual(got[2].updates, [{ _id: "tokA1000000000001", name: "Rob" }]);
  assert.equal(got[2].uuid, `Scene.${IDS.one}`);
  assert.deepEqual(got[3].updates, [{ _id: "tokA2000000000001", name: "Rob" }]);
  assert.equal(got[3].uuid, `Scene.${IDS.two}`);
  assert.deepEqual(got[4], { op: "notify", level: "info", message: 'Token labels updated to "Rob" (3).' });
  // the locked token, the other actor's "Bob", the nickname and the scene-three "Bobby" are untouched
  const one = game.scenes.get(IDS.one).tokens;
  assert.deepEqual([one.get("tokLocked00000001").name, one.get("tokOther000000001").name, one.get("tokNick0000000001").name], ["Bob", "Bob", "Fishface"]);
  assert.equal(game.scenes.get(IDS.three).tokens.get("tokBobby000000001").name, "Bobby");
  assert.equal(game.actors.get(IDS.other).prototypeToken.name, "Bob");
  // canUserModify is asked as the current user, "update", for each token of this actor only
  assert.deepEqual(asked, [
    { token: "tokA1000000000001", user: IDS.gm, action: "update" },
    { token: "tokLocked00000001", user: IDS.gm, action: "update" },
    { token: "tokNick0000000001", user: IDS.gm, action: "update" },
    { token: "tokA2000000000001", user: IDS.gm, action: "update" },
    { token: "tokBobby000000001", user: IDS.gm, action: "update" },
  ]);
});

test("names' own prototype write carries {pentarynNames: true} and does not re-enter", async () => {
  reset(F);
  const seen = [];
  const id = Hooks.on("updateActor", (a, changes, options) => seen.push([changes, { ...options }]));
  await game.actors.get(IDS.bob).update({ name: "Rob" });
  await flush();
  Hooks.off("updateActor", id);
  // Order-free: the stub's update fires its hooks synchronously, so names' nested prototype write
  // reaches this later listener before the outer rename does; live, it follows a server round trip.
  const byText = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b));
  assert.deepEqual(seen.sort(byText), [
    [{ name: "Rob" }, { pentarynOldName: "Bob" }],
    [{ prototypeToken: { name: "Rob" } }, { pentarynNames: true }],
  ].sort(byText));
  assert.equal(effects(F.calls).filter(c => c.op === "update").length, 2, "one rename, one prototype write: no third");
});

test("same-name and img-only updates relabel nothing and raise no toast", async () => {
  reset(F);
  const actor = game.actors.get(IDS.bob);
  await actor.update({ img: "icons/svg/mystery-man.svg" });
  await actor.update({ name: "Bob" });
  await flush();
  assert.deepEqual(effects(F.calls).map(c => [c.op, c.changes]), [["update", { img: "icons/svg/mystery-man.svg" }], ["update", { name: "Bob" }]]);
});

test("a prototype label that is a nickname is left alone; the count is placed tokens only", async () => {
  reset(F);
  const actor = game.actors.get(IDS.bob);
  actor.prototypeToken.name = "Bobby";
  await actor.update({ name: "Rob" });
  await flush();
  const got = effects(F.calls);
  assert.deepEqual(got.map(c => c.op), ["update", "updateEmbeddedDocuments", "updateEmbeddedDocuments", "notify"]);
  assert.equal(got.at(-1).message, 'Token labels updated to "Rob" (2).');
  assert.equal(actor.prototypeToken.name, "Bobby");
});

test("a rename where nothing follows raises no toast", async () => {
  reset(F);
  const actor = game.actors.get(IDS.bob);
  actor.prototypeToken.name = "Bobby";
  for (const scene of game.scenes) for (const t of scene.tokens) if (t.actorId === IDS.bob) t.name = "Bobby";
  await actor.update({ name: "Rob" });
  await flush();
  assert.deepEqual(effects(F.calls).map(c => c.op), ["update"]);
});

/* ── live parity (fixtures/live-before.json, 2026-10-11) ─────────────────────────────────────── */

test("live parity: rename, no-op updates and a nickname reproduce the live golden", async () => {
  reset(F);
  const actor = game.actors.get(IDS.glubbek);
  const before = liveLabels(F);
  await actor.update({ name: NEW });
  await flush();
  const rename = { before, after: liveLabels(F), toastCount: toasts().length, toasts: toasts().map(t => t.message) };
  assert.deepEqual(rename, LIVE.rename);

  F.calls.length = 0;
  await actor.update({ img: "icons/svg/mystery-man.svg" });
  await actor.update({ name: NEW });
  await flush();
  assert.deepEqual({ after: liveLabels(F), toastCount: toasts().length }, LIVE.noop);

  await game.scenes.get(IDS.live).updateEmbeddedDocuments("Token", [{ _id: "tokShort000000001", name: "Fishface" }]);
  F.calls.length = 0;
  await actor.update({ name: OLD });
  await flush();
  assert.deepEqual({ after: liveLabels(F), toastCount: toasts().length, toasts: toasts().map(t => t.message) }, LIVE.nickname);
});

/* ── api.sync ─────────────────────────────────────────────────────────────────────────────────── */

test("api.sync(actor, old, new) returns the count and writes as the hook path does", async () => {
  reset(F);
  const actor = game.actors.get(IDS.bob);
  assert.equal(await api.sync(actor, "Bob", "Rob"), 3);
  assert.deepEqual(effects(F.calls).map(c => c.op), ["update", "updateEmbeddedDocuments", "updateEmbeddedDocuments", "notify"]);
  assert.equal(actor.name, "Bob", "sync never renames the actor itself");
  F.calls.length = 0;
  assert.equal(await api.sync(actor, "Bob", "Rob"), 0, "a second call finds nothing (audit -38: a rename already relabels)");
  assert.equal(await api.sync(actor, "nobody", "nobody else"), 0);
  assert.deepEqual(F.calls.filter(c => c.op === "notify"), [], "no toast when nothing changed");
});

// KNOWN: transform-creatures-38 — sync dereferences actor.prototypeToken, so an id, uuid or name
// rejects with a TypeError and writes nothing. Flipped by guide step 6 ([declared] N-D3).
test("KNOWN transform-creatures-38: api.sync with an id, uuid or name rejects TypeError", async () => {
  reset(F);
  for (const ref of [IDS.bob, `Actor.${IDS.bob}`, "Bob"]) {
    await assert.rejects(api.sync(ref, "Bob", "Rob"), TypeError, ref);
  }
  await assert.rejects(api.sync(null, "Bob", "Rob"), TypeError);
  assert.deepEqual(effects(F.calls), []);
});

// KNOWN: transform-creatures-33 — sync() runs fire-and-forget from updateActor with no catch: a failed
// actor or scene write becomes an unhandled rejection, no `pentaryn-names |` line, no toast. Counted
// in a subprocess (node:test fails any test that leaks a rejection). Flipped by guide step 4
// ([declared] N-D1: counter 0, one console.warn "pentaryn-names | relabel after rename failed").
test("KNOWN transform-creatures-33: a failed relabel write is an unhandled rejection with no module line", () => {
  for (const [which, reason] of [["reject-actor", "Error: ZZ actor update refused"], ["reject-scene", "Error: ZZ scene update refused"]]) {
    const r = spawnSync(process.execPath, [PROBE, which], { encoding: "utf8" });
    assert.equal(r.status, 0, `${which}: ${r.stderr}`);
    const o = JSON.parse(r.stdout.trim().split("\n").at(-1));
    assert.deepEqual(o.rejections, [reason], which);
    assert.deepEqual(o.lines.filter(l => l.slice(1).some(a => typeof a === "string" && a.startsWith(`${MODULE} |`))), [], which);
    assert.deepEqual(o.effects.filter(c => c.op === "notify"), [], `${which}: no toast`);
    assert.equal(o.hookErrors, 0, `${which}: Foundry's Hooks never sees it (the handler returned before the rejection)`);
  }
});
