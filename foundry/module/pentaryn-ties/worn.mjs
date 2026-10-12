/**
 * Worn — the GM-only possession marker.
 *
 * One villain, one host per scene. The mark lives on the TOKEN document, not the actor,
 * because a placed token exists on exactly one scene — so "Oz is Harl tonight" cannot
 * bleed into tomorrow's scene where Harl is just Harl again. The same inn map with two
 * different hosts on two consecutive scenes is the whole reason this exists.
 *
 *   token.flags["pentaryn-ties"].worn = { by: "Ozmandius the Unmade", note: "free prose" }
 *
 * Deliberately NOT an Active Effect, NOT a status icon, NOT an item on the sheet —
 * all of those render to players or outlive the scene. And deliberately carrying NO
 * stats: the host keeps their own sheet, because the wearer gets nothing but the
 * host's own stat block. This is a sticky note for the GM, nothing more.
 *
 * The ties data is left completely alone on purpose. The host's own connections keep
 * showing — that standing is exactly what the wearer is exploiting.
 *
 * GM-only in every render path: the canvas badge and the HUD button check
 * `game.user.isGM` before drawing anything, and the card line in popups.mjs does the
 * same. But — as with tie notes — this is presentation, not access control: Foundry
 * syncs token documents, flags included, to every connected client, and a player with
 * devtools open can read them. Do not put anything here you could not survive a
 * curious player reading; the README says the same out loud.
 *
 * Same robustness contract as ties-api.mjs: readWorn() never throws. A missing flag
 * is absent, a malformed one is absent, an over-long note is truncated.
 */

import { MODULE, NOTES_MAX, clampNotes } from "./ties-core.mjs";
import { esc } from "./core/html.mjs";
import { WORN_FLAG, WORN_BY_MAX as BY_MAX, docOf, readWorn } from "./ties-adapter.mjs";
import { makeLog } from "./lib/log.mjs";

// the read half lives in the adapter (popups reads it too); re-exported for this file's importers
export { WORN_FLAG, readWorn };

const log = makeLog(MODULE);


/** One accent, a render decision (like stance colours) — never stored in the flag. */
const ACCENT = 0x9b59b6;
const DISC = 0x141311;


/* -------------------------------------------- */
/*  Data                                        */
/* -------------------------------------------- */

/**
 * Write the mark. Token flags only — this function must never touch an actor
 * document, and doesn't: `doc` is a TokenDocument and the update lands on the scene.
 */
export async function setWorn(token, { by = "", note = "" } = {}) {
  if (!game.user?.isGM) return false;
  const doc = docOf(token);
  if (!doc?.setFlag) return false;
  const clean = {
    by: typeof by === "string" ? by.trim().slice(0, BY_MAX) : "",
    note: clampNotes(note)
  };
  if (!clean.by && !clean.note.trim()) return clearWorn(doc);
  await doc.setFlag(MODULE, WORN_FLAG, clean);
  return true;
}

export async function clearWorn(token) {
  if (!game.user?.isGM) return false;
  const doc = docOf(token);
  if (!doc?.unsetFlag) return false;
  await doc.unsetFlag(MODULE, WORN_FLAG);
  return true;
}

/* -------------------------------------------- */
/*  The canvas badge — GM eyes only             */
/* -------------------------------------------- */

/**
 * Derived, not tracked — the same shape as the wires in overlay.mjs. One container on
 * canvas.interface, thrown away and rebuilt from the token flags on every refresh, so
 * "badge with no mark" and "mark with no badge" are unrepresentable rather than fixed.
 */
const state = { badges: null };

function badgeLayer() {
  if (state.badges && !state.badges.destroyed) return state.badges;
  if (!canvas?.ready || !canvas.interface) return null;
  const c = new PIXI.Container();
  c.eventMode = "none";
  c.zIndex = 1001; // just above the wires
  canvas.interface.addChild(c);
  state.badges = c;
  return c;
}

function dropBadges() {
  if (!state.badges) return;
  try {
    if (!state.badges.destroyed) state.badges.destroy({ children: true });
  } catch (e) {
    log.warn(`badge teardown`, e);
  }
  state.badges = null;
}

/** PIXI 8 replaced the draw-call API. Support both rather than pin a renderer version. */
function drawDisc(g, x, y, r, ringWidth) {
  if (typeof g.circle === "function" && typeof g.fill === "function") {
    g.circle(x, y, r).fill({ color: DISC, alpha: 0.92 });
    g.circle(x, y, r).stroke({ width: ringWidth, color: ACCENT, alpha: 1 });
  } else {
    g.lineStyle(ringWidth, ACCENT, 1);
    g.beginFill(DISC, 0.92);
    g.drawCircle(x, y, r);
    g.endFill();
  }
}

function makeText(str, style) {
  const major = Number(String(PIXI.VERSION ?? "7").split(".")[0]);
  return major >= 8 ? new PIXI.Text({ text: str, style }) : new PIXI.Text(str, style);
}

/**
 * Where each badge goes (ties-24) — pure: the marked tokens in, `{ tokenId, x, y, r, letter }` out,
 * each token's mark read once. Top-right corner of the token, positioned off the DOCUMENT (Token#x
 * reads 0 on v14); the letter is the wearer's initial, or a dot.
 *
 * @param {{ id, document: { x, y }, w }[]} placeables
 * @param {number} gridSize
 */
export function badgePlan(placeables, gridSize) {
  const size = gridSize || 100;
  const r = Math.max(8, size * 0.15);
  const out = [];
  for (const p of placeables ?? []) {
    const worn = readWorn(p.document);
    if (!worn) continue;
    out.push({
      tokenId: p.id ?? p.document?.id ?? null,
      x: (p.document?.x ?? 0) + (p.w ?? size) - r * 1.15,
      y: (p.document?.y ?? 0) + r * 1.15,
      r,
      // the wearer's initial — enough to say "that one is him" without painting prose on the map
      letter: (worn.by || "").trimStart().charAt(0).toUpperCase() || "•"
    });
  }
  return out;
}

/**
 * Coalesce to one repaint per frame — refreshToken fires per animation step per token.
 * hot: the badge layer. Players never paint it, so they never schedule the frame (ties-24, B7).
 */
let queued = 0;
export function drawBadges() {
  if (!game.user?.isGM) return;
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    try {
      paintBadges();
    } catch (e) {
      log.warn(`badge paint`, e);
    }
  });
}

function paintBadges() {
  if (!canvas?.ready) return;
  if (!game.user?.isGM) return; // the whole layer is GM-only; players never get a frame of it
  const plan = badgePlan(canvas.tokens?.placeables ?? [], canvas.grid?.size);
  if (!plan.length) return dropBadges();

  const layer = badgeLayer();
  if (!layer) return;
  layer.removeChildren().forEach(c => c.destroy({ children: true }));

  for (const { x, y, r, letter } of plan) {
    const g = new PIXI.Graphics();
    drawDisc(g, x, y, r, Math.max(1.5, r * 0.18));
    layer.addChild(g);

    const text = makeText(letter, {
      fontFamily: "Signika, sans-serif",
      fontSize: Math.round(r * 1.3),
      fontWeight: "700",
      fill: 0xf0e6f6
    });
    text.anchor?.set?.(0.5);
    text.position.set(x, y);
    layer.addChild(text);
  }
}

/* -------------------------------------------- */
/*  Setting it — Token HUD button + dialog      */
/* -------------------------------------------- */

/** Right-click a token, press the mask. Prep-speed: no console, no macro to find. */
function injectHUD(app, element) {
  if (!game.user?.isGM) return;
  const doc = docOf(app?.object) ?? app?.document ?? null;
  if (!doc) return;

  const root = element instanceof HTMLElement ? element : element?.[0];
  const col = root?.querySelector(".col.right") ?? root?.querySelector(".right");
  if (!col || col.querySelector(".pt-worn-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon pt-worn-btn";
  if (readWorn(doc)) btn.classList.add("active");
  btn.dataset.tooltip = _loc("PENTARYN_TIES.worn.hudTooltip");
  btn.setAttribute("aria-label", _loc("PENTARYN_TIES.worn.hudTooltip"));
  btn.innerHTML = '<i class="fa-solid fa-masks-theater"></i>';
  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    openDialog(doc);
  });
  col.appendChild(btn);
}

/** Set / clear dialog. Also reachable as game.pentaryn.ties.wornDialog(token). */
export async function openDialog(token) {
  if (!game.user?.isGM) return null;
  const doc = docOf(token);
  if (!doc) return null;
  const current = readWorn(doc) ?? { by: "", note: "" };

  const content = `<div class="pt-worn-dialog">
    <div class="form-group">
      <label>${esc(_loc("PENTARYN_TIES.worn.by"))}</label>
      <input type="text" name="by" value="${esc(current.by)}" placeholder="${esc(_loc("PENTARYN_TIES.worn.byPlaceholder"))}" />
    </div>
    <div class="form-group">
      <label>${esc(_loc("PENTARYN_TIES.worn.note"))}</label>
      <textarea name="note" rows="5" maxlength="${NOTES_MAX}"
                placeholder="${esc(_loc("PENTARYN_TIES.worn.notePlaceholder"))}">${esc(current.note)}</textarea>
    </div>
  </div>`;

  const buttons = [
    {
      action: "set",
      label: _loc("PENTARYN_TIES.worn.set"),
      icon: "fa-solid fa-masks-theater",
      default: true,
      callback: (_ev, button) => ({
        by: button.form?.elements?.by?.value ?? "",
        note: button.form?.elements?.note?.value ?? ""
      })
    }
  ];
  if (readWorn(doc)) buttons.push({ action: "clear", label: _loc("PENTARYN_TIES.worn.clear"), icon: "fa-solid fa-broom" });
  buttons.push({ action: "cancel", label: _loc("PENTARYN_TIES.worn.cancel") });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("PENTARYN_TIES.worn.title", { name: doc.name ?? "" }), icon: "fa-solid fa-masks-theater" },
    position: { width: 440 },
    content,
    buttons,
    rejectClose: false
  });

  if (result && typeof result === "object") {
    const ok = await setWorn(doc, result);
    if (ok && readWorn(doc)) {
      ui.notifications.info(
        game.i18n.format("PENTARYN_TIES.worn.notifySet", { name: doc.name ?? "", by: readWorn(doc).by || "—" })
      );
    }
  } else if (result === "clear") {
    await clearWorn(doc);
    ui.notifications.info(game.i18n.format("PENTARYN_TIES.worn.notifyCleared", { name: doc.name ?? "" }));
  }
  return result;
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/**
 * FEATURE install — called by the entry during `init`, where these hooks have always registered.
 * The HUD handler keeps its own try/catch (its warning text is pinned); the badge handlers stay
 * unguarded, as they always were (declared B9 changes that).
 */
export function install(reg) {
  reg.on("renderTokenHUD", (app, element) => {
    try {
      injectHUD(app, element);
    } catch (err) {
      log.warn(`worn HUD injection skipped`, err);
    }
  }, { label: "worn: HUD" });

  // Foundry destroys canvas.interface under us — drop the handle, same as the wires.
  reg.on("canvasTearDown", () => (state.badges = null), { guard: false, label: "worn: canvasTearDown" });

  reg.on("canvasReady", () => drawBadges(), { guard: false, label: "worn: canvasReady" });
  // hot: state.badges — drawBadges only schedules one frame; badges ride their tokens
  reg.on("refreshToken", () => drawBadges(), { guard: false, label: "worn: refreshToken" });
  reg.on("deleteToken", () => drawBadges(), { guard: false, label: "worn: deleteToken" });
  reg.on("updateToken", (_doc, changes) => {
    // only a flag write can change what is marked; movement is refreshToken's job
    if (foundry.utils.getProperty(changes ?? {}, `flags.${MODULE}`) !== undefined) drawBadges();
  }, { guard: false, label: "worn: updateToken" });

  // the worn-mark API paths (rows in api-manifest.mjs) — GM only, per token
  return { impl: { worn: readWorn, setWorn, clearWorn, wornDialog: openDialog } };
}

/** The entry's reg.offAll() removes the hooks; worn keeps no other state worth dropping. */
export function uninstall() {}
