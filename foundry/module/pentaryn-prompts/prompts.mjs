/**
 * pentaryn-prompts — entry point: settings, keybindings, hooks, `game.pentaryn.prompts`, queries.
 *
 * A prompt marker is a hidden token Joe drops on a map with a few words on it ("goblin boss,
 * wolf-skull helm"). Later one gather call hands Claude every prompt with its surroundings, and
 * one replace call turns each marker into the real thing. See README.md and
 * context/foundry/prompt-markers.md.
 */

import { MODULE, VERSION, SIZE_KEYS, SIZE_BY_KEY, footprintLabel, codedError } from "./geometry-core.mjs";
import { ensureMarkers, onPreCreateToken, isPromptToken, markerSizeOfToken, markerSizeOfActor, markerActor, promptText } from "./markers.mjs";
import { PromptDialog } from "./dialog.mjs";
import * as Typeahead from "./typeahead.mjs";
import { sceneModel, seesCount } from "./model.mjs";
import { gather, crops, list, show } from "./gather.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { libWrapperRoute } from "./lib/patch-libwrapper.mjs";
import { makeLog } from "./lib/log.mjs";
import { registerSettings, registerKeybindings, keybindingRows, setting, settingStrict, manifests } from "./settings.mjs";
import { replace, replaceMany, SPEC_DIR } from "./replace.mjs";


const log = makeLog(MODULE);

/* ── keybindings (rows in settings.mjs) ──────────────────────────────────── */

function onPlaceKey() {
  if (!game.user?.isGM || !canvas?.ready) return false;
  placeAtCursor(null, { ticket: Typeahead.start() });   // capture from the key press on
  return true;
}

function onEditKey() {
  const tok = canvas?.tokens?.hover;
  if (!tok || !isPromptToken(tok.document)) return false;
  PromptDialog.open(tok.document);
  return true;
}

/** The P key: a marker of the client's default size under the cursor, snapped, dialog open. */
async function placeAtCursor(sizeKey, { ticket = null } = {}) {
  ticket ??= Typeahead.start();   // the API path too: keys typed while the token is created are held
  const giveUp = () => { if (ticket !== null) Typeahead.cancel(ticket); return null; };
  if (!game.user?.isGM || !canvas?.ready || !canvas.scene) return giveUp();
  const size = SIZE_BY_KEY[sizeKey] ? sizeKey : settingStrict("defaultSize");
  const actor = markerActor(size);
  if (!actor) { ui.notifications?.warn(_loc("PENTARYN_PROMPTS.dialog.noActor", { size })); return giveUp(); }
  const g = canvas.grid.size;
  const w = SIZE_BY_KEY[size].w * g;
  const m = canvas.mousePosition;
  const td = await actor.getTokenDocument({ x: m.x - w / 2, y: m.y - w / 2 }, { parent: canvas.scene });
  const snapped = td.getSnappedPosition({ x: m.x - w / 2, y: m.y - w / 2 });
  const data = td.toObject();
  delete data._id;
  Object.assign(data, { x: snapped.x, y: snapped.y, elevation: canvas.level?.elevation?.base ?? 0 });
  if (canvas.level?.id) data.level = canvas.level.id;
  let tok;
  try {
    [tok] = await canvas.scene.createEmbeddedDocuments("Token", [data], { pentarynPrompts: { placed: true } });
  } catch (err) {
    console.error(`${MODULE} | placing a prompt marker failed`, err);
  }
  if (!tok) return giveUp();
  const c = canvas.clientCoordinatesFromCanvas({ x: tok.x + tok.width * g, y: tok.y + tok.height * g / 2 });
  await PromptDialog.open(tok, { fresh: true, clientX: c.x, clientY: c.y, ticket });
  return tok;
}

/* ── opening on drop (plan §3.1) ─────────────────────────────────────────── */

/** Drops of marker actors whose token has not been created yet, oldest first. */
const pendingDrops = [];
const DROP_WINDOW_MS = 3000;

function onDropCanvasData(_canvas, data, event) {
  try {
    if (!game.user?.isGM || data?.type !== "Actor") return;
    const actor = data.uuid ? fromUuidSync(data.uuid) : game.actors.get(data.id);
    if (!markerSizeOfActor(actor)) return;
    hideTip();
    // keys typed from this instant on belong to the box this drop opens (typeahead.mjs); a second
    // drop before the first box opens gets its own ticket, so each box keeps its own words
    const d = { actorId: actor.id, sceneId: canvas?.scene?.id ?? null, x: data.x, y: data.y,
      clientX: event?.clientX ?? null, clientY: event?.clientY ?? null, t: Date.now(), ticket: Typeahead.start() };
    pendingDrops.push(d);
    // a drop core refused never makes a token: its ticket times out in typeahead; forget it here too
    setTimeout(() => {
      const i = pendingDrops.indexOf(d);
      if (i >= 0) pendingDrops.splice(i, 1);
    }, DROP_WINDOW_MS + 100);
  } catch (err) { log.debug("dropCanvasData (never blocks a drop)", err); }
}

/**
 * Is this created token the one that drop made? Same actor, same scene, within the window, and its
 * centre near the drop point (the drop centres the token on the cursor, then snaps). A paste or a
 * duplicate of a marker of the same actor inside the window lands elsewhere and is not "fresh".
 */
function matchesDrop(doc, d) {
  if (!d || d.actorId !== doc.actorId || Date.now() - d.t > DROP_WINDOW_MS) return false;
  if (d.sceneId && d.sceneId !== doc.parent?.id) return false;
  if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return true;
  const g = doc.parent?.dimensions?.size ?? 100;
  const cx = doc.x + doc.width * g / 2, cy = doc.y + doc.height * g / 2;
  const tol = g * Math.max(1, doc.width);
  return Math.abs(cx - d.x) <= tol && Math.abs(cy - d.y) <= tol;
}

function onCreateToken(doc, options, userId) {
  if (userId !== game.user?.id || !game.user.isGM || options?.pentarynPrompts) return;
  if (!isPromptToken(doc)) return;
  const i = pendingDrops.findIndex(d => matchesDrop(doc, d));
  if (i < 0) return;
  const [d] = pendingDrops.splice(i, 1);
  PromptDialog.open(doc, { fresh: true, clientX: d.clientX, clientY: d.clientY, ticket: d.ticket });
}

/* ── reopening: double-click, HUD ───────────────────────────────────────── */

let clickPatch = null;

/**
 * The configured Token class (dnd5e's Token5e today), so a subclass override cannot step around us.
 * libWrapper first (MIXED), a direct wrap when it is absent or refuses; the marker makes a hot
 * re-import a no-op instead of a second wrap (adjustments row prompts-token-dblclick).
 */
function patchDoubleClick() {
  const proto = (CONFIG.Token.objectClass ?? foundry.canvas.placeables.Token).prototype;
  const viaLW = !!(game.modules.get("lib-wrapper")?.active && globalThis.libWrapper);
  if (!viaLW && typeof proto._onClickLeft2 !== "function") {
    log.warn("Token#_onClickLeft2 not found; double-click will open the sheet");
    return (clickPatch = null);
  }
  const intercept = token => {
    if (!game.user?.isGM || !isPromptToken(token.document)) return false;
    PromptDialog.open(token.document);
    return true;
  };
  clickPatch = wrapMethod(MODULE, {
    target: proto, name: "_onClickLeft2", label: "Token#_onClickLeft2",
    path: "CONFIG.Token.objectClass.prototype._onClickLeft2", type: "MIXED",
    marker: "__pentarynPromptsClick", adjustments: "prompts-token-dblclick"
  }, function (wrapped, event) {
    if (intercept(this)) return;
    return wrapped(event);
  }, { via: libWrapperRoute({ log }), log });
  return clickPatch;
}

function onRenderTokenHUD(app, element) {
  try {
    const tok = app?.object?.document ?? app?.document;
    if (!game.user?.isGM || !tok || !isPromptToken(tok)) return;
    const root = element instanceof HTMLElement ? element : element?.[0];
    const col = root?.querySelector(".col.right") ?? root?.querySelector(".right");
    if (!col || col.querySelector(".pp-hud-btn")) return;
    const label = _loc("PENTARYN_PROMPTS.hud.edit");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "control-icon pp-hud-btn";
    btn.dataset.tooltip = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = '<i class="fa-solid fa-comment-dots"></i>';
    btn.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      PromptDialog.open(tok);
    });
    col.appendChild(btn);
  } catch (err) {
    console.warn(`${MODULE} | HUD button skipped`, err);
  }
}

/* ── hover tooltip ──────────────────────────────────────────────────────── */

let tip = null;
let tipFor = null;

function hideTip() {
  tip?.remove();
  tip = null;
  tipFor = null;
}

function onHoverToken(token, hovered) {
  if (!game.user?.isGM) return;
  if (!hovered || !isPromptToken(token.document)) { if (!hovered && tipFor === token.id) hideTip(); return; }
  if (PromptDialog.current?.edits(token.document)) return;   // its text is already on screen, in the box
  hideTip();
  const doc = token.document;
  const size = markerSizeOfToken(doc);
  const text = promptText(doc);
  const g = canvas.grid.size;
  const c = canvas.clientCoordinatesFromCanvas({ x: doc.x + doc.width * g, y: doc.y });
  tip = document.createElement("div");
  tip.className = "pentaryn-prompts-tip";
  const shown = text.length > 600 ? `${text.slice(0, 600).trimEnd()}…` : text;
  const esc = foundry.utils.escapeHTML;
  tip.innerHTML = `<div class="pp-tip-text">${shown ? esc(shown).replace(/\n/g, "<br>") : `<em>${esc(_loc("PENTARYN_PROMPTS.panel.empty"))}</em>`}</div>
    <div class="pp-tip-meta">${esc(`${size} · ${footprintLabel(size, canvas.scene?.grid?.distance ?? 5)}`)} · <span data-sees>…</span></div>`;
  tip.style.left = `${Math.round(c.x + 12)}px`;
  tip.style.top = `${Math.round(c.y)}px`;
  document.body.appendChild(tip);
  tipFor = token.id;
  const mine = tip;
  setTimeout(() => {
    if (tip !== mine) return;
    const n = seesCount(doc);
    const el = mine.querySelector("[data-sees]");
    if (el) el.textContent = n === null ? "" : _loc("PENTARYN_PROMPTS.hud.sees", { n });
  }, 0);
}

/** The orphan toast, localised: the words typed before a box opened that no box took. */
function orphanToast(text) {
  ui.notifications?.warn(_loc("PENTARYN_PROMPTS.typeahead.orphan", { text: text.trim().slice(0, 120) }));
  return true;
}

/* ── queries (GM-guarded on the sender, plan §10) ───────────────────────── */

/**
 * Wrap a handler so it runs only for a GM. Core's query dispatch passes `{user}` (the sender);
 * the bridge's own socket path calls handlers with no context, from the GM's browser itself.
 */
function guarded(fn) {
  return async (data, ctx) => {
    const sender = ctx?.user ?? null;
    if (sender && !sender.isGM) throw codedError("NOT_GM", `${sender.name} is not a GM`);
    if (!game.user?.isGM) throw codedError("NOT_GM", "this client is not a GM");
    return fn(data ?? {});
  };
}

function registerQueries() {
  CONFIG.queries[`${MODULE}.list`] = guarded(() => list());
  // the bridge turns base64 crops into MCP image blocks; direct API calls get file paths instead
  CONFIG.queries[`${MODULE}.gather`] = guarded(data => gather({ cropsAs: "base64", ...data }));
  CONFIG.queries[`${MODULE}.crops`] = guarded(data => crops({ cropsAs: "base64", ...data }));
  CONFIG.queries[`${MODULE}.replace`] = guarded(data => replaceMany(data));
  CONFIG.queries[`${MODULE}.show`] = guarded(data => show(data));
}

/* ── wiring ─────────────────────────────────────────────────────────────── */

Hooks.once("init", () => {
  registerSettings();
  registerKeybindings(keybindingRows({ place: onPlaceKey, edit: onEditKey }));
  registerQueries();
});

// registered at load so nothing created before `ready` slips past the hiding
Hooks.on("preCreateToken", (doc, data) => {
  try { onPreCreateToken(doc, data); } catch (err) { console.warn(`${MODULE} | preCreateToken`, err); }
});
Hooks.on("dropCanvasData", onDropCanvasData);
Hooks.on("createToken", onCreateToken);
Hooks.on("renderTokenHUD", onRenderTokenHUD);
Hooks.on("hoverToken", onHoverToken);
Hooks.on("canvasPan", hideTip);
Hooks.on("renderPromptDialog", hideTip);   // the tip sits where the box opens
Hooks.on("canvasTearDown", hideTip);
Hooks.on("deleteToken", doc => {
  if (tipFor === doc.id) hideTip();
  PromptDialog.onTokenDeleted(doc);   // a replace or a delete elsewhere: close instead of typing into nothing
});

// the open box's side panel (what it sees, door tags) follows walls, doors and tokens as they change
const refreshPanels = doc => {
  try { if (doc?.parent?.id) PromptDialog.refreshPanels(doc.parent.id); } catch (err) { log.debug("refreshPanels (panel only)", err); }
};
const MOVED = ["x", "y", "elevation", "hidden", "width", "height", "level"];
for (const h of ["createWall", "updateWall", "deleteWall", "createToken", "deleteToken", "createNote", "deleteNote"]) Hooks.on(h, refreshPanels);
Hooks.on("updateToken", (doc, changes) => { if (MOVED.some(k => k in (changes ?? {}))) refreshPanels(doc); });

Hooks.once("setup", () => patchDoubleClick());
// text no open claimed: into the open box, else a toast (typeahead.mjs's own toast is the no-sink fallback)
Typeahead.setOrphanSink(text => PromptDialog.takeOrphan(text) || orphanToast(text));

Hooks.once("ready", async () => {
  // Published one tick after ready (the publish timing is a declared step of the migration). The
  // importer merges into game.pentaryn and nothing freezes it since its keystone (items-journal-1),
  // so the old frozen-root guard is gone (kit 1.0.2, J10): the API is assigned into the plain root.
  setTimeout(() => {
    const api = {
      gather, list, crops, show,
      replace, replaceMany,
      open: tokenOrId => {
        const doc = typeof tokenOrId === "string"
          ? (canvas?.scene?.tokens.get(tokenOrId) ?? game.scenes.find(s => s.tokens.get(tokenOrId))?.tokens.get(tokenOrId))
          : (tokenOrId?.document ?? tokenOrId);
        return PromptDialog.open(doc);
      },
      place: placeAtCursor,
      ensureMarkers,
      model: sceneId => {
        const scene = sceneId ? game.scenes.get(sceneId) : canvas?.scene;
        if (!scene) throw codedError("SCENE_UNKNOWN", String(sceneId));
        return sceneModel(scene);
      },
      manifests,
      // `version` is the code that is running (geometry-core's VERSION); `listed` is what game.modules
      // says, which can lag behind until the world rescans module.json
      status: () => ({
        version: VERSION, listed: game.modules.get(MODULE)?.version ?? null,
        npcBridge: typeof CONFIG.queries?.["foundry-mcp-bridge.createNpcActor"] === "function",
        // the world's party for encounter budgets; blank = none, and a gather says so (never guess one)
        party: setting("party", "none set") || "none set",
        specDir: `${SPEC_DIR}/ (under the Foundry Data dir; replaceMany({specFile: "${SPEC_DIR}/<name>.json"}))`,
        doubleClick: clickPatch?.via ?? null, markers: SIZE_KEYS.map(k => [k, markerActor(k)?.id ?? null])
      }),
      version: VERSION
    };
    game.pentaryn ??= {};
    game.pentaryn.prompts = api;
  }, 0);
  try { await ensureMarkers(); } catch (err) { console.error(`${MODULE} | ensureMarkers failed`, err); }
});
