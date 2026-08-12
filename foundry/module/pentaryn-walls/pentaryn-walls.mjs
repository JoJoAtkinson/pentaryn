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

function evaluate(scene, opts = {}) {
  const walls = readWalls(scene);
  return {
    walls,
    result: runEngine(walls, {
      gridSize: scene.grid.size,
      runId: new Date().toISOString(),
      ...opts
    })
  };
}

/* -------------------------------------------- */
/*  Reporting                                   */
/* -------------------------------------------- */

function report(scene, result, {committed}) {
  const {report: r, refusals, lints} = result;
  const lines = [];
  lines.push(`<p><strong>Wall autocomplete — ${scene.name}</strong></p>`);
  lines.push(`<p>${committed ? "Committed" : "<em>Preview — nothing was written.</em>"} ` +
             `${r.created} wall${r.created === 1 ? "" : "s"} created, ${r.moved} moved, ` +
             `${r.iterations} pass${r.iterations === 1 ? "" : "es"}.</p>`);

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
  const {result} = evaluate(scene, opts);
  report(scene, result, {committed: false});
  return result;
}

async function run({sceneId, ...opts} = {}) {
  const scene = targetScene(sceneId);
  const {result} = evaluate(scene, opts);

  // Two batches, after the loop has already reached its fixed point in memory. A thrown
  // assertion or a tripped iteration cap therefore costs nothing.
  if (result.updates.length) await scene.updateEmbeddedDocuments("Wall", result.updates);
  if (result.creates.length) await scene.createEmbeddedDocuments("Wall", result.creates);

  report(scene, result, {committed: true});
  return result;
}

/** Delete everything the engine generated and restore any endpoint it moved. */
async function undo({sceneId} = {}) {
  const scene = targetScene(sceneId);
  const generated = [], restores = [];
  for (const wall of scene.walls) {
    const f = wall.getFlag(FLAG_SCOPE, "generated");
    const prior = wall.getFlag(FLAG_SCOPE, "priorC");
    if (f) generated.push(wall.id);
    else if (prior) restores.push({_id: wall.id, c: prior, [`flags.-=${FLAG_SCOPE}`]: null});
  }
  if (restores.length) await scene.updateEmbeddedDocuments("Wall", restores);
  if (generated.length) await scene.deleteEmbeddedDocuments("Wall", generated);

  ChatMessage.create({
    content: `<p><strong>Wall autocomplete — undo</strong></p><p>Deleted ${generated.length} generated wall${generated.length === 1 ? "" : "s"}, restored ${restores.length} moved endpoint${restores.length === 1 ? "" : "s"}.</p>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
  });
  return {deleted: generated.length, restored: restores.length};
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

  game.keybindings.register(MODULE_ID, "preview", {
    name: "Wall autocomplete: preview",
    hint: "Report what would be built on the current scene. Writes nothing.",
    editable: [{key: "KeyW", modifiers: ["Alt"]}],
    restricted: true,
    onDown: guard(preview)
  });

  game.keybindings.register(MODULE_ID, "run", {
    name: "Wall autocomplete: run",
    hint: "Complete the walls on the current scene.",
    editable: [{key: "KeyW", modifiers: ["Alt", "Shift"]}],
    restricted: true,
    onDown: guard(run)
  });

  // Deliberately unbound by default: it deletes walls, and a stray keypress should not.
  game.keybindings.register(MODULE_ID, "undo", {
    name: "Wall autocomplete: undo",
    hint: "Delete every wall this module generated and restore any endpoint it moved. Unbound by default — assign a key here if you want one.",
    editable: [],
    restricted: true,
    onDown: guard(undo)
  });
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  game.pentaryn ??= {};
  game.pentaryn.walls = {preview, run, undo, makeMacro, runEngine};
  console.log(`${MODULE_ID} | ready — Alt+W preview, Alt+Shift+W run. ` +
              `API: game.pentaryn.walls.preview() / .run() / .undo() / .makeMacro()`);
});
