/**
 * Wall autocomplete — Foundry glue.
 *
 * Everything geometric lives in wall-engine.mjs, which knows nothing about Foundry. This
 * file does three things and nothing else: read the scene, hand the coordinates to the
 * engine, commit the result in two batches.
 *
 *   game.pentaryn.walls.preview()   report what it would do, write nothing
 *   game.pentaryn.walls.run()       do it
 *   game.pentaryn.walls.undo()      remove everything this module generated
 *
 * See playbooks/foundry-wall-autocomplete.md.
 */

import {runEngine, FLAG_SCOPE} from "./wall-engine.mjs";
import {get as getBackend, available} from "./backends.mjs";
import {ready as wasmReady} from "./backend-wasm.mjs";  // registers "wasm"; loads async

const MODULE_ID = "pentaryn-walls";

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
  const want = requested ?? game.settings.get(MODULE_ID, "backend");
  if (want !== "auto") {
    const b = getBackend(want);
    if (b?.available()) return b;
    ui.notifications.warn(`Wall autocomplete: backend "${want}" unavailable, using JavaScript.`);
  } else {
    const wasm = getBackend("wasm");
    if (wasm?.available()) return wasm;
  }
  return getBackend("js");
}

function evaluate(scene, opts = {}) {
  const walls = readWalls(scene);
  const backend = pickBackend(opts.backend);
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

function report(scene, result, {committed, backend, ms}) {
  const {report: r, refusals, lints} = result;
  const lines = [];
  lines.push(`<p><strong>Wall autocomplete — ${scene.name}</strong></p>`);
  lines.push(`<p>${committed ? "Committed" : "<em>Preview — nothing was written.</em>"} ` +
             `${r.created} wall${r.created === 1 ? "" : "s"} created, ${r.moved} moved, ` +
             `${r.iterations} pass${r.iterations === 1 ? "" : "es"} in ${Math.round(ms)} ms ` +
             `<span style="opacity:.6">(${backend})</span>.</p>`);

  const closed = r.components.filter(c => c.closed).length;
  lines.push(`<p>${r.components.length} component${r.components.length === 1 ? "" : "s"}: ` +
             `${closed} closed (inert), ${r.components.length - closed} still open.</p>`);

  if (lints.length) {
    lines.push(`<p><strong>Lint</strong></p><ul>` +
      lints.map(l => `<li><code>${l.code}</code> ${l.msg}</li>`).join("") + `</ul>`);
  }
  if (refusals.length) {
    lines.push(`<p><strong>Refused ${refusals.length} — finish these by hand</strong></p><ul>` +
      refusals.map(x => `<li>(${x.at[0]}, ${x.at[1]}) &mdash; ${x.why}</li>`).join("") + `</ul>`);
  }
  // The tolerances are echoed every run so the one fuzzy part of the engine stays visible.
  lines.push(`<p style="opacity:.7;font-size:.9em">grid ${r.config.gridSize}px &middot; ` +
             `weld ${r.config.weldEps}px &middot; collinear ${r.config.collEps}px &middot; ` +
             `pin ${r.config.pinEps}px &middot; gap/corner/reach ${r.config.gapMax}/${r.config.cornerMax}/${r.config.extMax} squares</p>`);

  ChatMessage.create({
    content: lines.join(""),
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
  });

  console.group(`${MODULE_ID} — ${scene.name}`);
  console.table(result.log.map(l => ({pass: l.iter, rule: l.rule, walls: JSON.stringify(l.walls)})));
  if (refusals.length) console.table(refusals.map(x => ({at: `${x.at[0]},${x.at[1]}`, wall: x.wall, why: x.why})));
  console.groupEnd();

  // Transient markers only — a Drawing or Note would persist and turn a report into state.
  for (const x of refusals) {
    try { canvas.ping({x: x.at[0], y: x.at[1]}); } catch { /* pings are a nicety */ }
  }
}

/* -------------------------------------------- */
/*  API                                         */
/* -------------------------------------------- */

async function preview({sceneId, ...opts} = {}) {
  const scene = targetScene(sceneId);
  const {result, backend, ms} = evaluate(scene, opts);
  report(scene, result, {committed: false, backend, ms});
  return result;
}

async function run({sceneId, ...opts} = {}) {
  const scene = targetScene(sceneId);
  const {result, backend, ms} = evaluate(scene, opts);

  // Two batches, after the loop has already reached its fixed point in memory. A thrown
  // assertion or a tripped iteration cap therefore costs nothing.
  if (result.updates.length) await scene.updateEmbeddedDocuments("Wall", result.updates);
  if (result.creates.length) await scene.createEmbeddedDocuments("Wall", result.creates);

  report(scene, result, {committed: true, backend, ms});
  return result;
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

  const stamped = scene.walls.filter(w => w.getFlag(FLAG_SCOPE, "run"));
  if (!stamped.length) {
    ui.notifications.info("Wall autocomplete: nothing of mine on this scene to undo.");
    return {deleted: 0, restored: 0, run: null};
  }
  const latest = stamped.map(w => w.getFlag(FLAG_SCOPE, "run")).sort().at(-1);
  const targets = all ? stamped : stamped.filter(w => w.getFlag(FLAG_SCOPE, "run") === latest);

  const generated = [], restores = [];
  for (const wall of targets) {
    // `generated` means the engine created it; a `priorC` without it means the engine only
    // shortened a wall the user drew, which must be restored rather than deleted.
    if (wall.getFlag(FLAG_SCOPE, "generated")) generated.push(wall.id);
    else {
      const prior = wall.getFlag(FLAG_SCOPE, "priorC");
      if (prior) restores.push({_id: wall.id, c: prior, [`flags.-=${FLAG_SCOPE}`]: null});
    }
  }
  if (restores.length) await scene.updateEmbeddedDocuments("Wall", restores);
  if (generated.length) await scene.deleteEmbeddedDocuments("Wall", generated);

  const remaining = new Set(stamped.map(w => w.getFlag(FLAG_SCOPE, "run"))).size - 1;
  ChatMessage.create({
    content: `<p><strong>Wall autocomplete — undo</strong></p>` +
      `<p>Removed ${generated.length} generated wall${generated.length === 1 ? "" : "s"} and ` +
      `restored ${restores.length} trimmed wall${restores.length === 1 ? "" : "s"} ` +
      `${all ? "(everything)" : `from the run at ${latest}`}.</p>` +
      (!all && remaining > 0
        ? `<p style="opacity:.7">${remaining} earlier run${remaining === 1 ? "" : "s"} still applied — undo again to peel back further.</p>` : ""),
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
  });
  ui.notifications.info(`Undid ${generated.length} created, ${restores.length} restored.`);
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
  ui.notifications.info(`Macro "${name}" ready on the hotbar.`);
  return macro;
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

// Keybindings MUST be registered during `init` — ClientKeybindings#register throws
// afterwards (client/helpers/interaction/client-keybindings.mjs:156).
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "backend", {
    name: "Engine backend",
    hint: "Automatic uses the compiled (WASM) engine when it loads, falling back to JavaScript. " +
          "Both produce identical geometry — verified against the same 44 fixtures — so this " +
          "only affects speed. Compiled is ~12x faster on large scenes.",
    scope: "world", config: true, type: String, default: "auto",
    choices: {auto: "Automatic (compiled when available)", wasm: "Compiled (WASM)", js: "JavaScript"}
  });

  // One run at a time. On a large scene a run takes a moment, and a held or double-tapped
  // key would otherwise start a second pass over geometry the first is still committing.
  let busy = false;
  const guard = fn => () => {
    if (busy) { ui.notifications.warn("Wall autocomplete is already running."); return true; }
    busy = true;
    Promise.resolve(fn()).catch(err => {
      console.error(`${MODULE_ID} |`, err);
      ui.notifications.error(`Wall autocomplete: ${err.message}`, {permanent: true});
    }).finally(() => { busy = false; });
    return true;
  };

  game.keybindings.register(MODULE_ID, "run", {
    name: "Wall autocomplete: run",
    hint: "Complete the walls on the current scene. Reversible — undo removes exactly this run.",
    editable: [{key: "KeyW", modifiers: ["Alt"]}],
    restricted: true,
    onDown: guard(run)
  });

  // Bound now that undo is run-scoped and restores trimmed walls rather than deleting them.
  game.keybindings.register(MODULE_ID, "undo", {
    name: "Wall autocomplete: undo last run",
    hint: "Remove the walls the last run created and restore any it trimmed. Press again to peel back the run before it.",
    editable: [{key: "KeyZ", modifiers: ["Alt"]}],
    restricted: true,
    onDown: guard(undo)
  });

  game.keybindings.register(MODULE_ID, "preview", {
    name: "Wall autocomplete: preview",
    hint: "Report what would be built without writing anything.",
    editable: [{key: "KeyW", modifiers: ["Alt", "Shift"]}],
    restricted: true,
    onDown: guard(preview)
  });
});

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  await wasmReady;          // settled by now in practice; awaited so the log line is accurate
  game.pentaryn ??= {};
  game.pentaryn.walls = {preview, run, undo, makeMacro, runEngine, backends: available};
  console.log(`${MODULE_ID} | ready — backends: ${available().map(b => b.name).join(", ")}. ` +
              `Alt+W run, Alt+Z undo, Alt+Shift+W preview. ` +
              `API: game.pentaryn.walls.preview() / .run() / .undo() / .makeMacro()`);
});
