// The two features (guide step 5): each exports install(reg, ctx) / uninstall(), registers only through the
// registry (labels pinned here; golden/hooks.json pins the load-time order through the entry), and a
// registry offAll after uninstall leaves no listener.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await journalWorld();
const { hookRegistry } = await import("../lib/hooks.mjs");
const { makeLog } = await import("../lib/log.mjs");
const personal = await import("../personal.mjs");
const bar = await import("../bar.mjs");

function makeCtx() {
  const log = makeLog("pentaryn-journal");
  const reg = hookRegistry("pentaryn-journal", log);
  const ctx = { log, reg, exposed: {}, expose(a) { Object.assign(ctx.exposed, a); } };
  return ctx;
}

test("both features export install and uninstall", () => {
  for (const f of [personal, bar]) {
    assert.equal(typeof f.install, "function");
    assert.equal(typeof f.uninstall, "function");
  }
  assert.equal(typeof personal.registerRelay, "function");
});

test("labels and order; exposed accessors; uninstall + offAll leaves nothing registered", () => {
  const ctx = makeCtx();
  personal.install(ctx.reg, ctx);
  bar.install(ctx.reg, ctx);
  assert.deepEqual(ctx.reg.ids().map(h => `${h.kind}:${h.name} — ${h.label}`), [
    "once:ready — ready: ensureAll (active GM)",
    "on:createUser — createUser: ensure (active GM)",
    "on:activateNote — activateNote: remember the pin",
    "on:renderJournalEntrySheet — renderJournalEntrySheet: bar, glow, single page",
    "on:renderImagePopout — renderImagePopout: bar",
    "on:renderItemSheet5e — renderItemSheet5e: bar",
    "on:closeJournalEntrySheet — closeJournalEntrySheet: end the glow",
    "on:createJournalEntryPage — createJournalEntryPage: refresh bars",
    "on:updateJournalEntryPage — updateJournalEntryPage: refresh bars",
    "on:deleteJournalEntryPage — deleteJournalEntryPage: refresh bars",
    "on:createJournalEntry — createJournalEntry: refresh bars (own journal)",
    "on:deleteJournalEntry — deleteJournalEntry: refresh bars (own journal)",
    "on:updateItem — updateItem: refresh item bars",
  ]);
  assert.deepEqual(Object.keys(ctx.exposed).sort(), [
    "applySinglePage", "ensureAll", "ensureFor", "ensurePersonalJournal", "findFolder", "lastSkip", "openSaved", "personal",
    "personalsOf", "refreshBars", "report", "save", "savedStatus",
  ]);
  bar.uninstall();
  personal.uninstall();
  ctx.reg.offAll();
  assert.deepEqual(F.listeners(), {});
});

test("a gmButton change refreshes bars while installed, and not after bar.uninstall", async () => {
  (await import("../settings.mjs")).registerSettings();
  const ctx = makeCtx();
  bar.install(ctx.reg, ctx);
  let reads = 0;
  F.foundry.applications.instances.set("a", { rendered: true, get element() { reads++; return null; } });
  await game.settings.set("pentaryn-journal", "gmButton", true);
  mock.timers.tick(100);
  assert.equal(reads, 1, "installed: one debounced refresh");
  await game.settings.set("pentaryn-journal", "gmButton", false);
  bar.uninstall();
  ctx.reg.offAll();
  mock.timers.tick(200);
  assert.equal(reads, 1, "uninstall cancelled the pending refresh");
  await game.settings.set("pentaryn-journal", "gmButton", true);
  mock.timers.tick(200);
  assert.equal(reads, 1, "uninstalled: the setting no longer reaches the bar");
  F.foundry.applications.instances.clear();
});
