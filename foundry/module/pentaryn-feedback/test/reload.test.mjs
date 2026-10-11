// The rings survive a reload of the tab: the recorder copies them to sessionStorage and restores
// them at install with a `reload` marker, and window errors are caught from the moment the file
// loads (before `setup`). Own process (node --test runs each file alone), so the recorder's module
// state and sessionStorage start empty here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS, WORLD, installClient, settle } from "./fixtures/world.mjs";
import { MODULE, ringsKey, ringsToStore } from "../feedback-core.mjs";

const F = await installClient();
const KEY = ringsKey(WORLD, IDS.gm);
assert.equal(typeof globalThis.sessionStorage?.setItem, "function", "node ≥ 22 has an in-memory sessionStorage");

// what the previous page stored before the player pressed F5
const before = { actions: [{ t: 1000, kind: "click", action: "lootAll", text: "Loot all" }], errors: [{ t: 1001, source: "hooks", message: "transferEverything" }] };
sessionStorage.setItem(KEY, ringsToStore(before));
sessionStorage.setItem(ringsKey(WORLD, IDS.player), ringsToStore({ actions: [{ t: 5, kind: "tab", tab: "not mine" }] }));

const recorder = await import("../recorder.mjs");
await import("../feedback.mjs");
// an error while modules load, before setup
F.windowEvent("error", { message: "early boom", error: new Error("early boom") });
F.fire("init");
F.fire("setup");
F.fire("ready");
await settle();

test("an error before setup is kept (the window listeners install when the file loads)", () => {
  assert.equal(F.windowListeners("error"), 1, "once, not again at install");
  assert.equal(F.windowListeners("unhandledrejection"), 1);
  assert.ok(recorder.errorsOf().some(e => e.source === "window" && e.message === "early boom"));
});

test("install restores this world + user's rings, marks the reload, and keeps this page's early errors after them", () => {
  const actions = recorder.actionsOf();
  assert.deepEqual(actions[0], before.actions[0]);
  assert.equal(actions[1].kind, "reload");
  assert.ok(Number.isFinite(actions[1].t));
  assert.ok(!JSON.stringify(actions).includes("not mine"), "another user's tab rings are not restored");
  assert.deepEqual(recorder.errorsOf().map(e => e.message), ["transferEverything", "early boom"]);
});

test("new entries are copied to sessionStorage (persistNow, and the pagehide flush)", () => {
  F.fire("changeSidebarTab", { id: "items" });
  assert.equal(recorder.persistNow(), true);
  let stored = JSON.parse(sessionStorage.getItem(KEY));
  assert.equal(stored.actions.at(-1).tab, "items");
  F.fire("changeSidebarTab", { id: "journal" });
  F.windowEvent("pagehide", {});
  stored = JSON.parse(sessionStorage.getItem(KEY));
  assert.equal(stored.actions.at(-1).tab, "journal");
  assert.deepEqual(stored.errors.map(e => e.message), ["transferEverything", "early boom"]);
});

test("a submitted report carries the restored history and the reload marker", async () => {
  const r = await game.modules.get(MODULE).api.submit({ text: "after F5" }, { dryRun: true });
  assert.deepEqual(r.report.actions.slice(0, 2).map(a => a.kind), ["click", "reload"]);
});

test("storage that throws never breaks recording", () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
  try {
    F.fire("changeSidebarTab", { id: "blocked" });
    assert.equal(recorder.persistNow(), false);
    assert.equal(recorder.actionsOf().at(-1).tab, "blocked");
  } finally {
    Object.defineProperty(globalThis, "sessionStorage", real);
  }
});

test("uninstall clears the stored copy and stops the window listeners", () => {
  game.modules.get(MODULE).api.uninstall();
  assert.equal(sessionStorage.getItem(KEY), null);
  assert.equal(F.windowListeners("error"), 0);
  assert.equal(F.windowListeners("pagehide"), 0);
});
