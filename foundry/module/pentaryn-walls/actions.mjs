/**
 * Wall autocomplete — the actions feature: preview, run, undo, makeMacro and the keybinding guard.
 *
 * FEATURE. Reads the scene, hands plain wall data to the engine (walls-core.mjs), commits the
 * result in two batches and reports it (GM-whispered chat card, console tables, a ping per
 * refusal). It registers no hooks: the module's only hooks are the entry's init and ready.
 * `install()` exposes the actions on `ctx.exposed`; api.mjs and the keybindings call them there.
 */

import {MODULE, get as getBackend, planUndo, undoDrops, reportHtml, undoHtml, exclusive} from "./walls-core.mjs";
import {setting} from "./settings.mjs";

/**
 * Every toast goes through the kit's log.notify (one console line, W2-WALLS-3) with a full-key
 * literal from lang/en.json (-36). `log` is set at install, before any action can run.
 */
function toast(level, key, data, opts) {
  return log.notify(level, game.i18n.format(key, data ?? {}), opts);
}

function targetScene(sceneId) {
  const scene = sceneId ? game.scenes.get(sceneId) : canvas?.scene;
  if (!scene) throw new Error("pentaryn-walls: no scene — open one, or pass a sceneId.");
  return scene;
}

/** Read the wall documents as plain data. `ds` is deliberately not consulted anywhere. */
function readWalls(scene) {
  return scene.walls.map(w => {
    const o = w.toObject();
    return {_id: w.id, c: o.c, door: o.door, sight: o.sight, move: o.move, light: o.light,
            sound: o.sound, dir: o.dir, levels: o.levels ?? [], flags: o.flags ?? {}};
  });
}

/**
 * Pick the engine. "auto" prefers the compiled backend and silently falls back to JS when it
 * is absent — a missing or unloadable .wasm must degrade to slower, never to broken.
 */
function pickBackend(requested) {
  const want = requested ?? setting("backend");
  if (want !== "auto") {
    const b = getBackend(want);
    if (b?.available()) return b;
    toast("warn", "PENTARYN_WALLS.notify.backendUnavailable", {want});
  } else {
    const wasm = getBackend("wasm");
    if (wasm?.available()) return wasm;
  }
  return getBackend("js");
}

function evaluate(scene, opts = {}) {
  const walls = readWalls(scene);
  let backend = pickBackend(opts.backend);
  // A backend that cannot take these walls (wasm on a Levels scene) would hand them to the js
  // engine itself; pick js here so the card and analyze() name the backend that ran.
  if (backend.accepts && !backend.accepts(walls)) backend = getBackend("js");
  const t0 = performance.now();
  const result = backend.run(walls, {
    gridSize: scene.grid.size,
    runId: new Date().toISOString(),
    ...opts
  });
  return {walls, result, backend: backend.name, ms: performance.now() - t0};
}

/* -------------------------------------------- */
/*  Reporting                                   */
/* -------------------------------------------- */

/** Post a GM-whispered card. Awaited by the caller; a failure is logged, never thrown. */
function postCard(content) {
  const failed = err => console.error(`${MODULE} |`, err);
  try {
    return Promise.resolve(ChatMessage.create({content, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)}))
      .catch(failed);
  } catch (err) {
    failed(err);
    return Promise.resolve();
  }
}

async function report(scene, result, {committed, backend, ms}) {
  const {refusals} = result;
  const posted = postCard(reportHtml(scene.name, result, {committed, backend, ms}));

  console.group(`${MODULE} — ${scene.name}`);
  console.table(result.log.map(l => ({pass: l.iter, rule: l.rule, walls: JSON.stringify(l.walls)})));
  if (refusals.length) console.table(refusals.map(x => ({at: `${x.at[0]},${x.at[1]}`, wall: x.wall, why: x.why})));
  console.groupEnd();

  // Transient markers only — a Drawing or Note would persist and turn a report into state.
  // Drawn on this client alone: canvas.ping broadcasts to every player, and the held Alt+Shift of
  // the preview key would turn it into a view-panning pull (walls-edge-1).
  const style = CONFIG.Canvas?.pings?.types?.PULSE ?? "pulse";
  for (const x of refusals) {
    // drawPing is async in Foundry 14: a rejection reaches the same debug line as a throw. Not awaited.
    try { Promise.resolve(canvas.controls.drawPing({x: x.at[0], y: x.at[1]}, {style})).catch(err => log?.debug("ping", err)); }
    catch (err) { log?.debug("ping", err); }   // a nicety
  }
  await posted;
}

/* -------------------------------------------- */
/*  API                                         */
/* -------------------------------------------- */

async function preview({sceneId, ...opts} = {}) {
  const scene = targetScene(sceneId);
  const {result, backend, ms} = evaluate(scene, opts);
  await report(scene, result, {committed: false, backend, ms});
  return result;
}

async function run({sceneId, ...opts} = {}) {
  const scene = targetScene(sceneId);
  const {result, backend, ms} = evaluate(scene, opts);

  // Two batches, after the loop has already reached its fixed point in memory. A thrown
  // assertion or a tripped iteration cap therefore costs nothing.
  if (result.updates.length) await scene.updateEmbeddedDocuments("Wall", result.updates);
  if (result.creates.length) await scene.createEmbeddedDocuments("Wall", result.creates);

  await report(scene, result, {committed: true, backend, ms});
  return result;
}

/**
 * The engine's answer for a scene with no side effect at all: no chat card, no pings, no console
 * output, no writes (senses-walls-cursors-33). For the console and the MCP bridge.
 */
async function analyze({sceneId, ...opts} = {}) {
  const scene = targetScene(sceneId);
  const {result, backend, ms} = evaluate(scene, opts);
  return {sceneId: scene.id, sceneName: scene.name, backend, ms, ...result};
}

/**
 * Undo a run: delete the walls it created and restore the length of any wall it trimmed or
 * welded. **One run at a time, most recent first** — every mutation is stamped with the
 * run's timestamp, so repeated undos peel back run by run rather than wiping the lot. Pass
 * `{all: true}` to remove everything this module has ever done to the scene.
 *
 * This is what makes "just run it and look" a safe workflow: the run is the unit of undo.
 */
async function undo({sceneId, all = false} = {}) {
  const scene = targetScene(sceneId);

  // Plain data, never getFlag: "wall-autocomplete" is no package id, so Foundry 14's getFlag
  // throws for it (senses-walls-cursors-1). planUndo reads the flags from toObject().
  const walls = scene.walls.map(w => ({...w.toObject(), _id: w.id}));
  const plan = planUndo(walls, {all});
  if (!plan.stamped) {
    toast("info", "PENTARYN_WALLS.notify.nothingToUndo");
    return {deleted: 0, restored: 0, run: null};
  }
  const {generated, latest, remaining} = plan;
  // A restore deletes the undone run's entry, or the whole stamp under every scope the wall
  // carries one in once no run is left on it (walls-edge-2).
  const byId = new Map(walls.map(w => [w._id, w]));
  const restores = plan.restores.map(r => ({
    ...r,
    ...Object.fromEntries(undoDrops(byId.get(r._id), latest, {all}).map(k => [k, _del]))
  }));
  if (restores.length) await scene.updateEmbeddedDocuments("Wall", restores);
  if (generated.length) await scene.deleteEmbeddedDocuments("Wall", generated);

  await postCard(undoHtml({generated: generated.length, restored: restores.length, all, latest, remaining}));
  toast("info", "PENTARYN_WALLS.notify.undone", {created: generated.length, restored: restores.length});
  return {deleted: generated.length, restored: restores.length, run: all ? "all" : latest};
}

/**
 * Create a hotbar macro for one of the three actions, so it can also be clicked or bound
 * from the macro bar. Returns the Macro document.
 */
async function makeMacro(action = "preview", slot) {
  if (!["preview", "run", "undo"].includes(action)) throw new Error(`unknown action "${action}"`);
  const name = `Walls: ${action}`;
  const command = `await game.pentaryn.walls.${action}();`;
  const existing = game.macros.find(m => m.name === name);
  const macro = existing ?? await Macro.create({
    name, type: "script", scope: "global", command,
    img: "icons/environment/settlement/wall-tower.webp"
  });
  if (macro.command !== command) await macro.update({command});
  await game.user.assignHotbarMacro(macro, slot);
  toast("info", "PENTARYN_WALLS.notify.macroReady", {name});
  return macro;
}

/* -------------------------------------------- */
/*  Keybindings                                 */
/* -------------------------------------------- */

// One run at a time. On a large scene a run takes a moment, and a held or double-tapped
// key would otherwise start a second pass over geometry the first is still committing.
const lock = {busy: false};
const onBusy = () => toast("warn", "PENTARYN_WALLS.notify.busy");

/**
 * preview/run/undo as published: exclusive across all three and every caller — keybinding, API,
 * macro (senses-walls-cursors-9). While one is running, another call warns and returns null.
 */
const exclusiveActions = {
  preview: exclusive(preview, {onBusy, lock}),
  run: exclusive(run, {onBusy, lock}),
  undo: exclusive(undo, {onBusy, lock}),
};

/** A keybinding's `onDown` for an exclusive action: a failure logs and toasts; always handled. */
function keybindingGuard(fn) {
  return () => {
    fn()?.catch(err => {
      log.error("keybinding action failed", err);
      toast("error", "PENTARYN_WALLS.notify.failed", {message: err.message}, {permanent: true});
    });
    return true;
  };
}

/* -------------------------------------------- */
/*  Feature lifecycle                           */
/* -------------------------------------------- */

/** The module's logger, set at install (debug lines are gated by CONFIG.debug["pentaryn-walls"]). */
let log = null;

export function install(reg, ctx) {
  log = ctx.log;
  ctx.expose({...exclusiveActions, makeMacro, analyze, keybindingGuard});
}

/** Release the busy flag (a hot patch re-wires; an in-flight run settles on its own). */
export function uninstall() {
  lock.busy = false;
}
