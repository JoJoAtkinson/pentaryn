/**
 * pentaryn-prompts — entry point: settings, keybindings, hooks, `game.pentaryn.prompts`, queries.
 *
 * A prompt marker is a hidden token Joe drops on a map with a few words on it ("goblin boss,
 * wolf-skull helm"). Later one gather call hands Claude every prompt with its surroundings, and
 * one replace call turns each marker into the real thing. See README.md and
 * context/foundry/prompt-markers.md.
 */

import { MODULE, VERSION, GATHER_CHARS, SIZE_KEYS, SIZE_BY_KEY, footprintLabel, codedError } from "./geometry-core.mjs";
import { ensureMarkers, onPreCreateToken, isPromptToken, markerSizeOfToken, markerSizeOfActor, markerActor, promptText } from "./markers.mjs";
import { PromptDialog } from "./dialog.mjs";
import * as Typeahead from "./typeahead.mjs";
import { sceneModel, seesCount } from "./model.mjs";
import { gather, crops, list, show, manifests } from "./gather.mjs";
import { replace, replaceMany, SPEC_DIR } from "./replace.mjs";

const t = (key, data) => (data ? game.i18n.format(`PENTARYN_PROMPTS.${key}`, data) : game.i18n.localize(`PENTARYN_PROMPTS.${key}`));

/* ── settings + keybindings ──────────────────────────────────────────────── */

function registerSettings() {
  const num = (key, def, range) => game.settings.register(MODULE, key, {
    name: `PENTARYN_PROMPTS.settings.${key}.name`, hint: `PENTARYN_PROMPTS.settings.${key}.hint`,
    scope: "world", config: true, type: Number, default: def, range
  });
  num("panelRows", 12, { min: 3, max: 40, step: 1 });
  num("panelChars", 90, { min: 30, max: 300, step: 10 });
  num("gatherChars", GATHER_CHARS, { min: 60, max: 1200, step: 20 });
  num("unseenWithinFt", 60, { min: 0, max: 300, step: 5 });
  num("cropMaxPerCall", 6, { min: 0, max: 12, step: 1 });
  num("cropLongSidePx", 768, { min: 256, max: 1568, step: 64 });
  game.settings.register(MODULE, "cropsDefault", {
    name: "PENTARYN_PROMPTS.settings.cropsDefault.name", hint: "PENTARYN_PROMPTS.settings.cropsDefault.hint",
    scope: "world", config: true, type: String, default: "auto",
    choices: { auto: "PENTARYN_PROMPTS.settings.cropsDefault.auto", on: "PENTARYN_PROMPTS.settings.cropsDefault.on", off: "PENTARYN_PROMPTS.settings.cropsDefault.off" }
  });
  game.settings.register(MODULE, "party", {
    name: "PENTARYN_PROMPTS.settings.party.name", hint: "PENTARYN_PROMPTS.settings.party.hint",
    scope: "world", config: true, type: String, default: ""
  });
  game.settings.register(MODULE, "deleteEmptyOnClose", {
    name: "PENTARYN_PROMPTS.settings.deleteEmptyOnClose.name", hint: "PENTARYN_PROMPTS.settings.deleteEmptyOnClose.hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE, "defaultSize", {
    name: "PENTARYN_PROMPTS.settings.defaultSize.name", hint: "PENTARYN_PROMPTS.settings.defaultSize.hint",
    scope: "client", config: true, type: String, default: "mid",
    choices: Object.fromEntries(SIZE_KEYS.map(k => [k, k]))
  });
  // the manifest ring (plan §6.4): never shown, written by gather on the GM client
  game.settings.register(MODULE, "lastCalls", { scope: "world", config: false, type: Array, default: [] });
}

function registerKeybindings() {
  game.keybindings.register(MODULE, "place", {
    name: "PENTARYN_PROMPTS.keybind.place", hint: "PENTARYN_PROMPTS.keybind.placeHint",
    editable: [{ key: "KeyP" }], restricted: true,
    onDown: () => {
      if (!game.user?.isGM || !canvas?.ready) return false;
      placeAtCursor(null, { ticket: Typeahead.start() });   // capture from the key press on
      return true;
    }
  });
  game.keybindings.register(MODULE, "edit", {
    name: "PENTARYN_PROMPTS.keybind.edit", hint: "PENTARYN_PROMPTS.keybind.editHint",
    editable: [{ key: "KeyP", modifiers: ["Shift"] }], restricted: true,
    onDown: () => {
      const tok = canvas?.tokens?.hover;
      if (!tok || !isPromptToken(tok.document)) return false;
      PromptDialog.open(tok.document);
      return true;
    }
  });
}

/** The P key: a marker of the client's default size under the cursor, snapped, dialog open. */
async function placeAtCursor(sizeKey, { ticket = null } = {}) {
  ticket ??= Typeahead.start();   // the API path too: keys typed while the token is created are held
  const giveUp = () => { if (ticket !== null) Typeahead.cancel(ticket); return null; };
  if (!game.user?.isGM || !canvas?.ready || !canvas.scene) return giveUp();
  const size = SIZE_BY_KEY[sizeKey] ? sizeKey : game.settings.get(MODULE, "defaultSize");
  const actor = markerActor(size);
  if (!actor) { ui.notifications?.warn(t("dialog.noActor", { size })); return giveUp(); }
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
  } catch { /* never block a drop */ }
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

let clickPatchedWith = null;

function patchDoubleClick() {
  // the configured class (dnd5e's Token5e today), so a subclass override cannot step around us
  const path = "CONFIG.Token.objectClass.prototype._onClickLeft2";
  const intercept = token => {
    if (!game.user?.isGM || !isPromptToken(token.document)) return false;
    PromptDialog.open(token.document);
    return true;
  };
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    try {
      globalThis.libWrapper.register(MODULE, path, function (wrapped, event) {
        if (intercept(this)) return;
        return wrapped(event);
      }, "MIXED");
      return (clickPatchedWith = "libWrapper");
    } catch (err) {
      console.warn(`${MODULE} | libWrapper registration failed, wrapping by hand`, err);
    }
  }
  const proto = (CONFIG.Token.objectClass ?? foundry.canvas.placeables.Token).prototype;
  const original = proto._onClickLeft2;
  if (typeof original !== "function") {
    console.warn(`${MODULE} | Token#_onClickLeft2 not found; double-click will open the sheet`);
    return (clickPatchedWith = null);
  }
  proto._onClickLeft2 = function (event) {
    if (intercept(this)) return;
    return original.call(this, event);
  };
  return (clickPatchedWith = "direct");
}

function onRenderTokenHUD(app, element) {
  try {
    const tok = app?.object?.document ?? app?.document;
    if (!game.user?.isGM || !tok || !isPromptToken(tok)) return;
    const root = element instanceof HTMLElement ? element : element?.[0];
    const col = root?.querySelector(".col.right") ?? root?.querySelector(".right");
    if (!col || col.querySelector(".pp-hud-btn")) return;
    const label = t("hud.edit");
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
  tip.innerHTML = `<div class="pp-tip-text">${shown ? esc(shown).replace(/\n/g, "<br>") : `<em>${esc(t("panel.empty"))}</em>`}</div>
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
    if (el) el.textContent = n === null ? "" : t("hud.sees", { n });
  }, 0);
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
  registerKeybindings();
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
const refreshPanels = doc => { try { if (doc?.parent?.id) PromptDialog.refreshPanels(doc.parent.id); } catch { /* panel only */ } };
const MOVED = ["x", "y", "elevation", "hidden", "width", "height", "level"];
for (const h of ["createWall", "updateWall", "deleteWall", "createToken", "deleteToken", "createNote", "deleteNote"]) Hooks.on(h, refreshPanels);
Hooks.on("updateToken", (doc, changes) => { if (MOVED.some(k => k in (changes ?? {}))) refreshPanels(doc); });

Hooks.once("setup", () => patchDoubleClick());
Typeahead.setOrphanSink(text => PromptDialog.takeOrphan(text));

Hooks.once("ready", async () => {
  // pentaryn-importer replaces game.pentaryn with a frozen object in its own ready hook; defer a
  // tick and rebuild rather than assign (same as the other pentaryn modules).
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
        party: (() => { try { return game.settings.get(MODULE, "party") || "none set"; } catch { return "none set"; } })(),
        specDir: `${SPEC_DIR}/ (under the Foundry Data dir; replaceMany({specFile: "${SPEC_DIR}/<name>.json"}))`,
        doubleClick: clickPatchedWith, markers: SIZE_KEYS.map(k => [k, markerActor(k)?.id ?? null])
      }),
      version: VERSION
    };
    const current = game.pentaryn;
    if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, prompts: api };
    else { game.pentaryn ??= {}; game.pentaryn.prompts = api; }
  }, 0);
  try { await ensureMarkers(); } catch (err) { console.error(`${MODULE} | ensureMarkers failed`, err); }
});
