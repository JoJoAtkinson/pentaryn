/**
 * Pentaryn Resume — memory: remember this client's view on its User, put it back at login.
 *
 * GLUE, one feature. Saves `flags.pentaryn-resume.view` on the user's own User document (a player
 * may update its own flags) whenever the drawn scene, level or pan/zoom settles. At `ready` —
 * after Foundry has drawn the active scene — it views the saved scene and pans to the saved spot,
 * unless core's resumeTarget says the table has moved on — or, with pentaryn-pins' pinning on, that
 * the user's pinned token is on another scene (then only pan and zoom on the pinned scene). Saving is held off until that decision
 * is made, so the first draw of the active scene never overwrites the view it is about to restore.
 */

import { MODULE, SAVE_DELAY, VIEW_FLAG, resumeTarget, sameView, viewRecord } from "./resume-core.mjs";
import { apiOf } from "./lib/publish.mjs";

const PINS = "pentaryn-pins";

/** False until the login restore has run: nothing is saved before then. */
let armed = false;
let timer = null;
/** The last pan Foundry reported, with the scene it was on: { scene, x, y, scale }. */
let lastPan = null;

/** What this client is looking at now, as a view record (null without a drawn canvas). */
function currentView() {
  if (!canvas?.ready || !canvas.scene) return null;
  const pos = lastPan?.scene === canvas.scene.id ? lastPan : {};
  return viewRecord({
    scene: canvas.scene.id, level: canvas.level?.id ?? null,
    x: pos.x, y: pos.y, scale: pos.scale,
    active: game.scenes.active?.id ?? null,
  });
}

async function save() {
  timer = null;
  if (!armed) return;
  const view = currentView();
  if (!view || sameView(view, game.user.getFlag(MODULE, VIEW_FLAG))) return;
  await game.user.setFlag(MODULE, VIEW_FLAG, view);
}

function schedule(delay = SAVE_DELAY) {
  if (!armed) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => save().catch(err => console.error(`${MODULE} | save view`, err)), delay);
}

/**
 * The scene id of this user's pinned token (pentaryn-pins `pinnedToken`, published at pins' own
 * `ready`, which runs before this module's `ready: resume`), or null: pins absent, pinning off,
 * unpinned, a GM, or anything unexpected. A GM's view is never redirected by pins (its follow
 * treats GMs as stock), so a GM carrying a pin flag (a promoted player) resumes as stock too. A
 * `scene` that is not an id string is a contract break: it is logged and read as no pin, so a
 * resume never silently drops for every pinned user.
 */
function pinnedSceneOf(ctx) {
  if (game.user?.isGM) return null;
  try {
    const pinned = apiOf(PINS)?.pinnedToken?.(game.user) ?? null;
    if (!pinned) return null;
    if (typeof pinned.scene === "string" && pinned.scene) return pinned.scene;
    ctx.log.warn("pentaryn-pins pinnedToken().scene is not a scene id string; resuming as unpinned", pinned.scene);
  } catch (err) {
    ctx.log.warn("pentaryn-pins pinnedToken() failed; resuming as unpinned", err);
  }
  return null;
}

/** The login restore. Always arms saving at the end, whatever happened. */
async function resume(ctx) {
  try {
    if (!canvas?.ready) return;
    const target = resumeTarget(game.user.getFlag(MODULE, VIEW_FLAG), {
      activeId: game.scenes.active?.id ?? null,
      sceneExists: id => !!game.scenes.get(id),
      pinnedScene: pinnedSceneOf(ctx),
    });
    if (!target) return;
    const scene = game.scenes.get(target.scene);
    const level = target.level && scene.levels?.get?.(target.level) ? target.level : null;
    if (canvas.scene?.id !== scene.id || (level && canvas.level?.id !== level)) {
      await scene.view(level ? { level } : {});
    }
    if (target.position && canvas.scene?.id === scene.id) canvas.pan(target.position);
    ctx.emit("resumed", { ...target, level });
  } finally {
    armed = true;
    schedule(0);
  }
}

export function install(reg, ctx) {
  reg.on("canvasPan", (board, position) => {
    if (!board?.scene) return;
    lastPan = { scene: board.scene.id, x: position?.x, y: position?.y, scale: position?.scale };
    schedule();
  }, { label: "canvasPan: remember" });

  reg.on("canvasReady", () => schedule(0), { label: "canvasReady: remember" });

  reg.on("updateScene", (scene, changes) => {
    if ("active" in (changes ?? {})) schedule();
  }, { label: "updateScene: active" });

  reg.on("ready", () => resume(ctx), { label: "ready: resume" });

  // a hot re-import after ready: there is no login to restore, so start saving straight away
  if (globalThis.game?.ready) armed = true;
}

export function uninstall() {
  if (timer) clearTimeout(timer);
  timer = null;
  armed = false;
  lastPan = null;
}
