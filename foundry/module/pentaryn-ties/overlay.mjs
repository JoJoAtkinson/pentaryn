/**
 * The ties web — the canvas half of the feature.
 *
 * Two modes, one per key:
 *   WORD  a badge under each tied token: ● and the one word. Terse, glanceable.
 *   CARD  a popup per connection: token art, word, name. See popups.mjs.
 *
 * Either way, a tie further than `nearDistance` grid squares gets a THIN LINE from the
 * hovered token to theirs, because at that range a badge floating in the middle of a
 * market square belongs to nobody.
 *
 * WHO MAY SEE WHAT — the two rules that make this safe to hand to players:
 *
 *   1. You may only run it on a token you own. A player pointing at an NPC gets nothing,
 *      so the web is always YOUR web.
 *   2. A tie is only drawn if its token passes `Token#visible` — Foundry's own per-client
 *      vision test. Behind a wall, outside your light, off the scene: no badge, no line,
 *      no card, and no notification saying there was one. Walls are not negotiated with
 *      here; we ask the same question the renderer already asked.
 *
 * Still client-only: a PIXI container on canvas.interface plus a DOM layer, both of which
 * exist in this browser alone. Deliberately NOT Drawing documents, which are world
 * documents and would sync to every connected client.
 */

import { MODULE, read, stanceOf } from "./ties-api.mjs";
import * as Cards from "./popups.mjs";

export const MODES = { WORD: "word", CARD: "card" };

const state = { layer: null, actorId: null, mode: null, active: false };

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);

function destroyLayer() {
  try {
    if (state.layer && !state.layer.destroyed) state.layer.destroy({ children: true });
  } catch (e) {
    console.warn(`${MODULE} | overlay teardown`, e);
  }
  state.layer = null;
}

export function clear() {
  destroyLayer();
  Cards.closeTransient();
  state.actorId = null;
  state.mode = null;
  state.active = false;
}

export function isShowing(actorId) {
  return state.active && (!actorId || state.actorId === actorId);
}

/* -------------------------------------------- */
/*  Who, and how far                            */
/* -------------------------------------------- */

/**
 * The token the user means. A GM points with the cursor; a player usually has not
 * selected anything, so fall through to the one token on this scene they own.
 */
function targetToken() {
  const hovered = canvas?.tokens?.hover;
  if (hovered) return hovered;
  const controlled = canvas?.tokens?.controlled?.[0];
  if (controlled) return controlled;
  if (game.user.isGM) return null;
  const mine = canvas?.tokens?.placeables?.filter(p => p.actor?.isOwner) ?? [];
  return mine.length === 1 ? mine[0] : null;
}

/** Rule 1. A player drives their own character and nobody else's. */
function permitted(actor) {
  if (!actor) return false;
  if (game.user.isGM) return true;
  if (!game.settings.get(MODULE, "playerAccess")) return false;
  return actor.isOwner === true;
}

/**
 * Rule 2. `Token#isVisible` is Foundry's own answer to "can THIS client see that token",
 * folding together walls, light, detection modes and the GM-hidden flag — per client,
 * computed by Foundry, not re-derived here. A GM sees everything by definition.
 *
 * It is `isVisible`, NOT `visible`. On v14 `Token#visible` is the inherited PIXI
 * DisplayObject flag and is `true` for every placeable on the scene, walled off and
 * GM-hidden alike — using it would have leaked exactly what this rule exists to hide.
 */
function canSee(token) {
  if (!token) return false;
  if (game.user.isGM) return true;
  return (token.isVisible ?? token.visible) === true;
}

/**
 * Token geometry, v14-safe.
 *
 * `Token#x` / `#y` are PIXI container coordinates and read 0 on v14 — the placement lives
 * on the document, and the drawn position comes off `center`. Reading `t.x` put every badge
 * in the top-left corner of the scene.
 */
const posOf = t => ({ x: t.document?.x ?? t.x ?? 0, y: t.document?.y ?? t.y ?? 0 });
const centerOf = t => {
  if (t.center && Number.isFinite(t.center.x)) return { x: t.center.x, y: t.center.y };
  const p = posOf(t);
  return { x: p.x + (t.w ?? 0) / 2, y: p.y + (t.h ?? 0) / 2 };
};

/** Centre-to-centre, in grid squares — "four tokens away" as a player would count it. */
function gridsApart(a, b) {
  const size = canvas?.grid?.size || 100;
  const ca = centerOf(a);
  const cb = centerOf(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y) / size;
}

function nearDistance() {
  try {
    return Number(game.settings.get(MODULE, "nearDistance")) || 4;
  } catch {
    return 4;
  }
}

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

function makeText(str, fill, size) {
  const TextCls = typeof PreciseText !== "undefined" ? PreciseText : PIXI.Text;
  const style = CONFIG.canvasTextStyle.clone();
  style.fontSize = size;
  style.fill = fill;
  style.stroke = 0x000000;
  style.strokeThickness = Math.max(3, size * 0.18);
  style.align = "center";
  const text = new TextCls(str, style);
  text.anchor.set(0.5, 0);
  return text;
}

/** PIXI 8 replaced lineStyle() with stroke(). Support both rather than pin a renderer version. */
function strokeLine(g, from, to, colour, alpha, width) {
  if (typeof g.stroke === "function" && typeof g.setStrokeStyle === "function") {
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
    g.stroke({ width, color: colour, alpha });
  } else {
    g.lineStyle(width, colour, alpha);
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
  }
}

function badge(layer, token, label, colour, alpha, size) {
  const dot = makeText("●", colour, size * 1.15);
  const txt = makeText(label, 0xffffff, size);
  const c = centerOf(token);
  const cx = c.x;
  const y = c.y + (token.h ?? canvas.grid.size) / 2 + 6;
  dot.position.set(cx - txt.width / 2 - dot.width * 0.6, y);
  txt.position.set(cx + dot.width * 0.35, y + size * 0.08);
  dot.alpha = alpha;
  txt.alpha = alpha;
  layer.addChild(dot, txt);
}

/* -------------------------------------------- */
/*  The key press                               */
/* -------------------------------------------- */

/**
 * Toggle the web for whoever is under the cursor.
 *   same person, same mode -> clear | different person or mode -> swap | empty space -> clear
 */
export function toggle(mode = MODES.WORD) {
  if (!canvas?.ready) return;

  const token = targetToken();
  const actor = token?.actor ?? null;
  const had = state.active || Cards.anyTransient();
  const sameAgain = had && state.actorId === actor?.id && state.mode === mode;

  if (had) clear();
  if (sameAgain) return;

  if (!actor) {
    if (!had) ui.notifications.warn(t("notify.noTarget"));
    return;
  }
  if (!permitted(actor)) {
    ui.notifications.warn(t("notify.notYours"));
    return;
  }

  const ties = read(actor);
  if (!ties.length) {
    ui.notifications.info(game.i18n.format("PENTARYN_TIES.notify.none", { name: actor.name }));
    return;
  }

  const near = nearDistance();
  const isGM = game.user.isGM;
  const layer = new PIXI.Container();
  layer.eventMode = "none";
  layer.zIndex = 1000;
  canvas.interface.addChild(layer);

  const lines = new PIXI.Graphics();
  layer.addChild(lines);

  const base = Math.max(16, canvas.grid.size * 0.2);
  const from = centerOf(token);
  const cardEntries = [];
  const offScene = [];
  let drawn = 0;

  for (const tie of ties) {
    // rule 2 applied once, here: everything downstream is already allowed to be seen
    const targets = canvas.tokens.placeables.filter(p => p.actor?.id === tie.id && canSee(p));
    if (!targets.length) {
      offScene.push(tie.name);
      continue;
    }

    const alpha = 0.55 + tie.strength * 0.09;
    const size = base * (0.85 + tie.strength * 0.05);
    const colour = stanceOf(tie.stance).hex;

    for (const p of targets) {
      if (gridsApart(token, p) > near) {
        strokeLine(lines, from, centerOf(p), colour, alpha * 0.7, Math.max(1, canvas.grid.size * 0.022));
      }
      if (mode === MODES.CARD) cardEntries.push({ tie, token: p });
      else badge(layer, p, tie.word || tie.name, colour, alpha, size);
      drawn++;
    }
  }

  // safe unconditionally: `actor` already passed permitted(), so these notes are the
  // viewer's own — see the note in popups.mjs on where GM secrets belong instead
  if (mode === MODES.CARD) Cards.show(actor, cardEntries, { showNotes: true });

  if (!drawn) {
    // nothing to label — don't leave an empty container claiming to be "showing"
    destroyLayerNow(layer);
    // Players are told only that nobody they know is in sight. Naming the ones behind the
    // wall would hand back exactly the information the visibility test just took away.
    if (isGM) {
      ui.notifications.info(
        game.i18n.format("PENTARYN_TIES.notify.partial", {
          name: actor.name,
          shown: 0,
          missing: offScene.join(", ")
        })
      );
    } else {
      ui.notifications.info(t("notify.noneInSight"));
    }
    return;
  }

  state.layer = layer;
  state.actorId = actor.id;
  state.mode = mode;
  state.active = true;

  // GM only. For a player, silence about the unseen is the feature.
  if (isGM && offScene.length) {
    ui.notifications.info(
      game.i18n.format("PENTARYN_TIES.notify.partial", {
        name: actor.name,
        shown: drawn,
        missing: offScene.join(", ")
      })
    );
  }
}

function destroyLayerNow(layer) {
  try {
    layer.destroy({ children: true });
  } catch (e) {
    /* already gone */
  }
}

/** Scene changes tear down canvas.interface under us; drop the stale handle. */
export function registerHooks() {
  Hooks.on("canvasTearDown", () => {
    state.layer = null;
    state.actorId = null;
    state.mode = null;
    state.active = false;
    // transient cards belong to a scene; pinned ones are a memo and travel with you
    Cards.closeTransient();
  });

  // transient cards ride the canvas, so they have to move when it does
  Hooks.on("canvasPan", () => Cards.reflow());
}
