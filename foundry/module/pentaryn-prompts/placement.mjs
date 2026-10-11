/**
 * pentaryn-prompts — FEATURE: putting a marker down and opening its box.
 *
 * The P key places a marker of the client's default size under the cursor (Shift+P opens the
 * hovered marker's box); dropping a marker actor opens the new token's box (plan §3.1). The API's
 * `place` and `open` are this feature's (exposed on ctx for api.mjs). Keys typed from the gesture on
 * belong to the box it opens (typeahead-adapter tickets).
 */

import { SIZE_BY_KEY } from "./geometry-core.mjs";
import { DROP_WINDOW_MS, matchesDrop } from "./core/drop.mjs";
import { isPromptToken, markerActor, markerSizeOfActor } from "./markers-adapter.mjs";
import { cancel as cancelTyping, start as startTyping } from "./typeahead-adapter.mjs";
import { settingStrict } from "./settings.mjs";
import { PromptDialog } from "./dialog.mjs";
import { hideTip } from "./tip-ui.mjs";

let log = null;

/* ── the P key ───────────────────────────────────────────────────────────── */

/** The P key: a marker of the client's default size under the cursor, snapped, dialog open. */
export async function placeAtCursor(sizeKey, { ticket = null } = {}) {
  ticket ??= startTyping();   // the API path too: keys typed while the token is created are held
  const giveUp = () => { if (ticket !== null) cancelTyping(ticket); return null; };
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
    log.error("placing a prompt marker failed", err);
  }
  if (!tok) return giveUp();
  const c = canvas.clientCoordinatesFromCanvas({ x: tok.x + tok.width * g, y: tok.y + tok.height * g / 2 });
  await PromptDialog.open(tok, { fresh: true, clientX: c.x, clientY: c.y, ticket });
  return tok;
}

/** Keybinding `place` (P). */
export function onPlaceKey() {
  if (!game.user?.isGM || !canvas?.ready) return false;
  placeAtCursor(null, { ticket: startTyping() });   // capture from the key press on
  return true;
}

/** Keybinding `edit` (Shift+P): the hovered marker's box. */
export function onEditKey() {
  const tok = canvas?.tokens?.hover;
  if (!tok || !isPromptToken(tok.document)) return false;
  PromptDialog.open(tok.document);
  return true;
}

/** `api.open(tokenOrId)`: a token id (the viewed scene first, then any scene), a document or a placeable. */
export function open(tokenOrId) {
  const doc = typeof tokenOrId === "string"
    ? (canvas?.scene?.tokens.get(tokenOrId) ?? game.scenes.find(s => s.tokens.get(tokenOrId))?.tokens.get(tokenOrId))
    : (tokenOrId?.document ?? tokenOrId);
  return PromptDialog.open(doc);
}

/* ── opening on drop (plan §3.1) ─────────────────────────────────────────── */

/** Drops of marker actors whose token has not been created yet, oldest first. */
const pendingDrops = [];

function onDropCanvasData(_canvas, data, event) {
  try {
    if (!game.user?.isGM || data?.type !== "Actor") return;
    const actor = data.uuid ? fromUuidSync(data.uuid) : game.actors.get(data.id);
    if (!markerSizeOfActor(actor)) return;
    hideTip();
    // keys typed from this instant on belong to the box this drop opens (typeahead); a second
    // drop before the first box opens gets its own ticket, so each box keeps its own words
    const d = { actorId: actor.id, sceneId: canvas?.scene?.id ?? null, x: data.x, y: data.y,
      clientX: event?.clientX ?? null, clientY: event?.clientY ?? null, t: Date.now(), ticket: startTyping() };
    pendingDrops.push(d);
    // a drop core refused never makes a token: its ticket times out in typeahead; forget it here too
    setTimeout(() => {
      const i = pendingDrops.indexOf(d);
      if (i >= 0) pendingDrops.splice(i, 1);
    }, DROP_WINDOW_MS + 100);
  } catch (err) { log.debug("dropCanvasData (never blocks a drop)", err); }
}

function onCreateToken(doc, options, userId) {
  if (userId !== game.user?.id || !game.user.isGM || options?.pentarynPrompts) return;
  if (!isPromptToken(doc)) return;
  const now = Date.now();
  const i = pendingDrops.findIndex(d => matchesDrop(doc, d, now));
  if (i < 0) return;
  const [d] = pendingDrops.splice(i, 1);
  PromptDialog.open(doc, { fresh: true, clientX: d.clientX, clientY: d.clientY, ticket: d.ticket });
}

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("dropCanvasData", onDropCanvasData, { guard: false, label: "dropCanvasData: a marker drop" });
  reg.on("createToken", onCreateToken, { guard: false, label: "createToken: open the dropped marker's box" });
  ctx.expose({ place: placeAtCursor, open });
}

export function uninstall() {
  pendingDrops.length = 0;
}
