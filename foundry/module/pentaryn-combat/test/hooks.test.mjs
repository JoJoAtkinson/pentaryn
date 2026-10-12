// Registration characterisation (guide S1, hooks.test). Both entries are loaded as Foundry loads
// them (module.json esmodules: combat.mjs, then hud.mjs) on the active GM's client, the lifecycle
// hooks fire, and what got registered is pinned:
//   golden/hooks.json              every Hooks.on/once in registration order, minus the lifecycle
//                                  `once` rows (init/setup/ready), whose effects glue.test pins
//   golden/listeners.json          live listener count per hook name after ready
//   golden/document-listeners.json the document listeners (three keydown from turnflow — Esc,
//                                  Enter-uses, digits — then pointerover, pointermove, pointerdown
//                                  from hud) and the MutationObserver's target
// plus source scans: the pentarynCombat.* event names, the import graph from both entries
// (reachability and DFS order, combat-riders-31), and the two dead exports (combat-riders-34).
import { test } from "node:test";
import assert from "node:assert/strict";
import { importGraph, pinJSON, reachable, sourceFiles, sourceScan } from "./kit/harness.mjs";
import { setupWorld } from "./fixtures/world.mjs";

const ROOT = new URL("..", import.meta.url);
const W = await setupWorld();
const { F, doc } = W;

const afterImport = { hooks: [], listeners: [] };
await import("../combat.mjs");
const afterCombat = F.hooks.length;
await import("../hud.mjs");
afterImport.hooks = F.hooks.map(h => `${h.kind}:${h.name}`);
afterImport.listeners = doc.listenerLog.map(l => ({ ...l }));
afterImport.observers = doc.observers.length;
F.fire("init");
F.fire("setup");
F.fire("ready");

const LIFECYCLE = new Set(["init", "setup", "ready"]);
const rows = F.hooks.filter(h => !(h.kind === "once" && LIFECYCLE.has(h.name)));

test("hook registration manifest (golden/hooks.json): module evaluation, then setup's registrations", () => {
  pinJSON("hooks", rows, import.meta.url);
  assert.equal(rows.length, 63);
});

test("combat.mjs graph registers strip's four roll-window hooks first, then its own three lifecycle hooks", () => {
  assert.deepEqual(afterImport.hooks.slice(0, afterCombat), [
    "on:renderRollConfigurationDialog", "on:renderRollResolver", "on:closeRollConfigurationDialog", "on:closeRollResolver",
    "once:init", "once:setup", "once:ready",
  ]);
});

test("the lifecycle once-rows, in order (their effects are glue.test's)", () => {
  assert.deepEqual(F.hooks.filter(h => h.kind === "once" && LIFECYCLE.has(h.name)).map(h => h.name), [
    "init", "setup", "ready",            // combat.mjs
    "ready",                             // turnflow: orphan flag sweep
    "ready",                             // turnflow: patchPortrait
    "init", "init",                      // turnflow: scrolling-text guard, chat pop-up guard
    "ready",                             // turnflow: pip settle
    "ready", "ready",                    // hud: applyPickerGuide, picker-cue MutationObserver
  ]);
});

test("setup registers the counting, weapon-bonus, rider and off-hand hooks, in that order", () => {
  const setupRows = F.hooks.slice(afterImport.hooks.length).map(h => `${h.kind}:${h.name}`);
  assert.deepEqual(setupRows, [
    "on:dnd5e.preRollAttackV2", "on:dnd5e.postRollAttack", "on:dnd5e.postUseActivity", "on:dnd5e.preRollDamageV2", "on:updateActor",
    "on:dnd5e.preRollAttackV2", "on:dnd5e.preRollDamageV2", "on:dnd5e.renderChatMessage", "on:combatTurnChange", "on:deleteCombat",
    "on:updateActor", "on:createActiveEffect", "on:deleteActiveEffect", "on:updateActiveEffect",
    "on:createActor",
  ]);
});

test("live listeners per hook after ready (golden/listeners.json)", () => {
  pinJSON("listeners", F.listeners(), import.meta.url);
  assert.equal(F.listeners("renderActionPanelArgonComponent"), 3, "turnflow :168, hud bars :739, hud pips :931");
  assert.equal(F.listeners("init"), 0);
  assert.equal(F.listeners("ready"), 0);
});

test("document listeners and the observer (golden/document-listeners.json)", () => {
  const pin = {
    atImport: afterImport.listeners,
    afterReady: doc.listenerLog,
    observers: doc.observers.map(o => ({ targets: o.targets.map(t => ({ target: t.target === doc.body ? "body" : "other", opts: t.opts })) })),
    observersAtImport: afterImport.observers,
  };
  pinJSON("document-listeners", pin, import.meta.url);
  assert.deepEqual(doc.listenerLog.map(l => `${l.type}${l.capture ? ":capture" : ""}${l.passive ? ":passive" : ""}`), [
    "keydown:capture", "keydown:capture", "keydown:capture", "pointerover:capture:passive", "pointermove:capture:passive", "pointerdown:capture:passive",
  ]);
  assert.equal(afterImport.observers, 0, "the observer is created at ready, not at import");
  assert.equal(doc.observers.length, 1);
  assert.equal(doc.observers[0].targets[0].target, doc.body);
});

test("events: the pentarynCombat.* names in the sources (combat-riders-14)", () => {
  const names = new Set();
  for (const hit of sourceScan(ROOT, /pentarynCombat\.[a-zA-Z]+/)) for (const m of hit.text.matchAll(/pentarynCombat\.[a-zA-Z]+/g)) names.add(m[0]);
  assert.deepEqual([...names].sort(), [
    "pentarynCombat.bonusAction", "pentarynCombat.bonusSpent", "pentarynCombat.offhand", "pentarynCombat.otherAction",
    "pentarynCombat.reaction", "pentarynCombat.sequenceEnd", "pentarynCombat.usage",
  ]);
  // S9 [declared B2]: no literal emit is left; every event is a core HOOKS row fired through
  // ctx.emit, which fires the new pentaryn-combat.* name and then this legacy name.
  const emits = sourceScan(ROOT, /Hooks\.callAll\("pentarynCombat\./).map(h => `${h.file}:${h.line}`);
  pinJSON("emits", emits, import.meta.url);
  assert.equal(emits.length, 0);
});

test("import graph: both entries reach every non-test .mjs; DFS order as recorded (combat-riders-31)", () => {
  const graph = importGraph(ROOT, { exclude: ["lib/", "test/"] });
  const order = [...reachable(graph, ["combat.mjs", "hud.mjs"])];
  pinJSON("graph", { graph, order }, import.meta.url);
  assert.deepEqual([...order].filter(f => !f.startsWith("lib/")).sort(), sourceFiles(ROOT), "every own file (the vendored lib/ is reached too since S4)");
  // Guide S6c split turnflow.mjs into turnflow/*.mjs features that hud.mjs installs: each is still
  // reached only through hud.mjs, never from combat.mjs's graph.
  const turnflow = Object.keys(graph).filter(f => f.startsWith("turnflow/"));
  assert.ok(turnflow.length > 0);
  for (const f of turnflow) assert.ok(graph["hud.mjs"].includes(f), `hud.mjs installs ${f}`);
  assert.deepEqual([...reachable(graph, ["combat.mjs"])].filter(f => f.startsWith("turnflow/")), [], "turnflow is reached only through hud.mjs");
});

test("dead exports gone (combat-riders-34, guide S3): no re-export of attackActivityOf or weaponShape; nobody imports the entry", async () => {
  const graph = importGraph(ROOT, { exclude: ["lib/", "test/"] });
  assert.deepEqual(Object.entries(graph).filter(([, deps]) => deps.includes("combat.mjs")).map(([f]) => f), []);
  assert.deepEqual(sourceScan(ROOT, /export \{ attackActivityOf \}/).map(h => `${h.file}:${h.line}`), []);
  assert.deepEqual(sourceScan(ROOT, /export \{ weaponShape \}/).map(h => `${h.file}:${h.line}`), []);
  assert.deepEqual(sourceScan(ROOT, /import[^;]*weaponShape[^;]*from "\.\/sequence\.mjs"/), []);
});

test("dead exports gone (final review): ownTooltip and multiattack are file-private", () => {
  assert.deepEqual(sourceScan(ROOT, /export function (ownTooltip|multiattack)\b/).map(h => `${h.file}:${h.line}`), []);
});

test("Hooks.on/once call sites per file at indent ≤ 2, and hook loops (C17 today)", () => {
  const scan = sourceScan(ROOT, /^Hooks\.(on|once)\(|^\s{0,2}Hooks\.(on|once)\(|^for \(const hook of/).map(h => h.file);
  const byFile = scan.reduce((m, f) => ({ ...m, [f]: (m[f] ?? 0) + 1 }), {});
  pinJSON("module-scope-hooks", byFile, import.meta.url);
});

test("M7 (final review): one tempHooks(getReg) factory and one opts(label) helper, exported from context.mjs; no feature file keeps a copy", async () => {
  const copies = sourceScan(ROOT, /const opts = label =>|hooks \? hooks\.on\(/).map(h => `${h.file}:${h.line}`);
  assert.deepEqual(copies.filter(c => !c.startsWith("context.mjs:")), []);
  const { tempHooks, opts } = await import("../context.mjs");
  assert.deepEqual(opts("x: y"), { label: "x: y" });
  // A registry when the getter has one (the label passed as { label }), else Foundry's Hooks.
  let current = null;
  const calls = [];
  const fake = { on: (name, fn, o) => (calls.push(["on", name, o]), 7), off: (id) => calls.push(["off", id]) };
  const temp = tempHooks(() => current);
  current = fake;
  assert.equal(temp.on("someHook", () => {}, "lbl"), 7);
  temp.off("someHook", 7);
  assert.deepEqual(calls, [["on", "someHook", { label: "lbl" }], ["off", 7]]);
  current = null;
  const before = F.hooks.length;
  const id = temp.on("someHook", () => {}, "lbl");
  assert.equal(F.hooks.length, before + 1, "falls back to Hooks.on before install");
  temp.off("someHook", id);
});
