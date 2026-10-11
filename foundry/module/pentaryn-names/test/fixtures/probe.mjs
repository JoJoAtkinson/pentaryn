#!/usr/bin/env node
// Subprocess probe for the glue cases that need a fresh process: a fresh entry instance per
// game.pentaryn load order, and an unhandled rejection (node:test fails any test that leaks one, so
// it is counted here, outside the runner). Usage: node test/fixtures/probe.mjs <case>. Prints one
// JSON line. Timers never run: setTimeout/setInterval are replaced with recorders before the entry
// loads (anything scheduled is listed in `timers`).
import { installFoundry } from "../kit/foundry-stub.mjs";
import { IDS, equip, flush, world } from "./world.mjs";

const which = process.argv[2];
const ENTRY = new URL("../../names.mjs", import.meta.url).href;
const timers = [];
globalThis.setTimeout = (fn, ms) => (timers.push(["setTimeout", ms ?? 0]), 0);
globalThis.setInterval = (fn, ms) => (timers.push(["setInterval", ms ?? 0]), 0);

const F = await installFoundry(world());
equip(F);
const lines = [];
for (const level of ["log", "info", "warn", "error", "debug"]) {
  console[level] = (...args) => lines.push([level, ...args.map(a => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : F.plain(a)))]);
}
const out = { case: which };
const LEGACY = ["sync", "relabel", "shortName"];
const rootView = before => {
  const root = game.pentaryn;
  return {
    keys: root ? Object.keys(root) : null,
    frozen: root ? Object.isFrozen(root) : null,
    extensible: root ? Object.isExtensible(root) : null,
    sameRoot: before === undefined ? null : root === before,
    importKept: typeof root?.import === "function",
    namesHasLegacy: LEGACY.every(k => typeof root?.names?.[k] === "function"),
    otherKept: root?.lookupStub === "kept" ? true : null,
  };
};

if (which.startsWith("root-")) {
  let before;
  if (which === "root-frozen-before-load") game.pentaryn = before = Object.freeze({ import() {} });
  if (which === "root-extensible") game.pentaryn = before = { lookupStub: "kept" };
  if (which === "root-frozen-by-earlier-ready") Hooks.once("ready", () => { game.pentaryn = before = Object.freeze({ import() {} }); });
  await import(ENTRY);
  if (which === "root-frozen-after-load") game.pentaryn = before = Object.freeze({ import() {} });
  F.fire("init");
  F.fire("setup");
  F.fire("ready");
  Object.assign(out, rootView(before));
  out.timers = timers;
  out.lines = lines;
  process.stdout.write(`${JSON.stringify(out)}\n`);
} else if (which === "reject-actor" || which === "reject-scene") {
  // transform-creatures-33: sync() runs fire-and-forget from updateActor with no catch
  const rejections = [];
  process.on("unhandledRejection", reason => rejections.push(reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)));
  await import(ENTRY);
  F.fire("init");
  F.fire("setup");
  F.fire("ready");
  const actor = game.actors.get(IDS.bob);
  if (which === "reject-actor") {
    Object.defineProperty(actor, "update", { value: async () => { throw new Error("ZZ actor update refused"); } });
  } else {
    actor.prototypeToken.name = "Bobby";            // a nickname: no actor write, straight to the scenes
    const scene = game.scenes.get(IDS.one);
    Object.defineProperty(scene, "updateEmbeddedDocuments", { value: async () => { throw new Error("ZZ scene update refused"); } });
  }
  actor.name = "Rob";
  F.calls.length = 0;
  F.fire("updateActor", actor, { name: "Rob" }, { pentarynOldName: "Bob" }, IDS.gm);
  await flush();
  process.once("beforeExit", () => {
    out.rejections = rejections;
    out.effects = F.calls.filter(c => !c.op.startsWith("Hooks."));
    out.hookErrors = F.hookErrors.length;
    out.timers = timers;
    out.lines = lines;
    process.stdout.write(`${JSON.stringify(out)}\n`);
  });
} else {
  process.stdout.write(`${JSON.stringify({ case: which, error: "unknown case" })}\n`);
  process.exitCode = 2;
}
