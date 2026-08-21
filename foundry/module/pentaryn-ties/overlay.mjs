/**
 * The ties web — the canvas half of the feature.
 *
 * Two keys. ALL: hover somebody and everyone they know who is IN SIGHT gets a card —
 * their token's art, the one word, their name, and your notes. Press again to sweep them
 * away.
 *
 * ONE is the same feature aimed with the cursor: SELECT your own token, HOVER the person
 * you are asking about, and you get that single card. Press again on them to close it,
 * move to somebody else to open theirs. For a market square where the whole web is two
 * dozen bubbles and the question you actually have is "what is this one to me".
 *
 * Drag any card to keep it.
 *
 * WIRES. A card is joined to its token by a thin line whenever the two have come apart,
 * and there are exactly two ways that happens:
 *
 *   reach — the tie stands further than `nearDistance` squares away, so the card is
 *           floating over a token on the far side of the market. The wire runs from YOUR
 *           token to theirs and says: that one over there is part of your web.
 *   leash — the card has been dragged off to a corner and pinned. The wire runs from the
 *           card back to whoever it is about, so a memo parked by the edge of the screen
 *           still points at a person.
 *
 * Wires are a pure function of the live card set: `drawWires()` throws the whole layer
 * away and rebuilds it from `Cards.live()` on every pan, every scene load, and every
 * change to what is on screen. A card can therefore never be up without its wire — which
 * it could be, back when the two were tracked separately and a card outlived the layer
 * that drew its line.
 *
 * WHO MAY SEE WHAT — the two rules that make this safe to hand to players:
 *
 *   1. You may only run it on a token you own. A player pointing at an NPC gets nothing,
 *      so the web is always YOUR web.
 *   2. A tie is only drawn if its token passes `Token#isVisible` — Foundry's own per-client
 *      vision test. Behind a wall, outside your light, off the scene: no card, no wire,
 *      and no notification saying there was one. Walls are not negotiated with here; we
 *      ask the same question the renderer already asked.
 *
 * Still client-only: a PIXI Graphics on canvas.interface plus a DOM layer, both of which
 * exist in this browser alone. Deliberately NOT Drawing documents, which are world
 * documents and would sync to every connected client.
 */

import { MODULE, read } from "./ties-api.mjs";
import * as Cards from "./popups.mjs";

/**
 * `actorId` is whose web was last raised, `mode` is which key raised it ("all" | "one"),
 * and `tieId` is the single person key 7 last put up. There is deliberately NO "is it
 * showing" boolean here — see the ⚠ note above showAll().
 */
const state = { wires: null, actorId: null, mode: null, tieId: null };

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);

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
  return canvas?.tokens?.controlled?.[0] ?? soleOwnedToken();
}

/**
 * The last-resort fallback both keys share: a player who has selected nothing but owns
 * exactly one token on this scene unambiguously means that one. A GM gets nothing, because
 * a GM owns everything and there is no "unambiguously" to be had.
 *
 * Deliberately ONE copy. The two keys disagree about a great deal — see the ⚠ block below —
 * but they must never disagree about this, and two copies of a policy is how they start to.
 */
function soleOwnedToken() {
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
 * on the document, and the drawn position comes off `center`. Reading `t.x` put every wire
 * endpoint in the top-left corner of the scene.
 */
const posOf = tk => ({ x: tk.document?.x ?? tk.x ?? 0, y: tk.document?.y ?? tk.y ?? 0 });
const centerOf = tk => {
  if (tk.center && Number.isFinite(tk.center.x)) return { x: tk.center.x, y: tk.center.y };
  const p = posOf(tk);
  return { x: p.x + (tk.w ?? 0) / 2, y: p.y + (tk.h ?? 0) / 2 };
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

/** First visible token on this scene for an actor, or null. */
const tokenFor = actorId =>
  canvas?.tokens?.placeables?.find(p => p.actor?.id === actorId && canSee(p)) ?? null;

/* -------------------------------------------- */
/*  Wires                                       */
/* -------------------------------------------- */

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

function wireLayer() {
  if (state.wires && !state.wires.destroyed) return state.wires;
  if (!canvas?.ready || !canvas.interface) return null;
  const g = new PIXI.Graphics();
  g.eventMode = "none";
  g.zIndex = 1000;
  canvas.interface.addChild(g);
  state.wires = g;
  return g;
}

function dropWires() {
  if (!state.wires) return;
  try {
    if (!state.wires.destroyed) state.wires.destroy({ children: true });
  } catch (e) {
    console.warn(`${MODULE} | wire teardown`, e);
  }
  state.wires = null;
}

/**
 * Coalesce to one repaint per frame. `refreshToken` fires per animation step per token,
 * and painting reads every card's bounding box — which forces a layout. Once a frame is
 * plenty for a line that follows a token.
 */
let queued = 0;
export function drawWires() {
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    try {
      paintWires();
    } catch (e) {
      console.warn(`${MODULE} | wire paint`, e);
    }
  });
}

/**
 * Rebuild every wire from scratch. Cheap — a handful of line segments — and being a full
 * rebuild is the point: there is no incremental state to fall out of step with the cards.
 */
function paintWires() {
  if (!canvas?.ready) return;
  const live = Cards.live();
  if (!live.length) return dropWires();

  const g = wireLayer();
  if (!g) return;
  g.clear();

  const near = nearDistance();
  const width = Math.max(1, canvas.grid.size * 0.022);

  for (const card of live) {
    /**
     * The token this card was built above, if it is still on the scene and still visible —
     * NOT merely "some token belonging to that actor". With two tokens of one person on a
     * map, `tokenFor` returns whichever comes first in placeables order, which is not
     * necessarily the one the cursor picked; key 7 makes that aim explicit, so a wire to
     * the other one would be visibly wrong. Falls back for cards restored from a previous
     * session, whose original token id means nothing on this scene.
     *
     * Re-tested every redraw either way, so a tie who walks behind a wall loses their wire
     * mid-pan.
     */
    const exact = card.tokenId ? canvas.tokens.get(card.tokenId) : null;
    const target = exact && canSee(exact) ? exact : tokenFor(card.tieId);
    if (!target) continue;
    const to = centerOf(target);

    if (card.pinned) {
      // leash: screen pixels back into canvas space, so the wire tracks the card as the
      // map is panned and zoomed underneath it
      let from;
      try {
        from = canvas.stage.toLocal({ x: card.screen.x, y: card.screen.y });
      } catch {
        continue;
      }
      strokeLine(g, from, to, card.colour, 0.5, width);
      continue;
    }

    // reach: only worth a line once the card has stopped being obviously "that one there"
    const src = canvas.tokens.placeables.find(p => p.actor?.id === card.sourceId);
    if (src && gridsApart(src, target) > near) {
      strokeLine(g, centerOf(src), to, card.colour, 0.5, width);
    }
  }
}

/* -------------------------------------------- */
/*  The key press                               */
/* -------------------------------------------- */

/** Sweep the transient cards. Pinned ones stay — and keep their leashes. */
export function clear() {
  state.actorId = null;
  state.mode = null;
  state.tieId = null;
  Cards.closeTransient(); // fires onChange -> drawWires()
}

/**
 * Asked of the cards, not of a flag — for the same reason the two key handlers are.
 * Answers about TRANSIENT cards only and ignores `mode`, so it is true after either key.
 */
export function isShowing(actorId) {
  if (!Cards.anyTransient()) return false;
  return !actorId || state.actorId === actorId;
}

/**
 * The ties on this actor whose token this client can actually see, grouped one entry per
 * PERSON rather than per token. Somebody standing on the map twice is still one connection
 * and still one card.
 */
function visibleGroups(actor) {
  const groups = [];
  const unseen = [];
  for (const tie of read(actor)) {
    const tokens = canvas.tokens.placeables.filter(p => p.actor?.id === tie.id && canSee(p));
    if (!tokens.length) {
      unseen.push(tie.name);
      continue;
    }
    groups.push({ tie, tokens });
  }
  return { groups, unseen };
}

/**
 * ⚠ THE TWO KEYS READ THE CANVAS DIFFERENTLY, and that is the whole design:
 *
 *   8 — the token under the cursor is the SUBJECT. *Whose web am I looking at?*
 *   7 — the SELECTED token is the subject and the HOVERED one is the object.
 *       *What is that person to me?*
 *
 * So 7 requires a selection and will not quietly fall back to the hovered token the way 8
 * does. Falling back would turn "what is she to me" into "what is she to her" without
 * saying so, and you would read somebody else's answer to your own question.
 *
 * ⚠ WHETHER THE WEB IS UP is asked of `Cards.anyTransient()`, never of a remembered flag.
 * Dragging a card PINS it, and a pinned card is not transient — so after a drag there is
 * nothing left to sweep. An earlier version kept a separate `state.active` boolean that
 * still said "showing", so the next key press took the toggle-off branch and did nothing
 * at all: press 7, drag the card, press 8, get silence.
 *
 * A pinned card is never duplicated either: `Cards.show()` keys on `sourceId:tieId` and
 * skips a key already on screen. Pin a card from 7, then press 8, and you get the REST of
 * the web with the one you parked left exactly where you put it.
 */

/** KEY 8 — everyone in sight. */
export function showAll() {
  if (!canvas?.ready) return;

  const token = targetToken();
  const actor = token?.actor ?? null;
  const showing = Cards.anyTransient();
  const sameActor = !!actor && state.actorId === actor.id;

  if (!actor) {
    if (showing) clear();
    else ui.notifications.warn(t("notify.noTarget"));
    return;
  }
  if (!permitted(actor)) {
    ui.notifications.warn(t("notify.notYours"));
    return;
  }

  // same person twice is the toggle-off — but only while there is something to sweep, or
  // pinning every card would turn the key into a dead press
  if (showing && sameActor && state.mode === "all") return clear();

  if (!read(actor).length) {
    if (showing) clear();
    ui.notifications.info(game.i18n.format("PENTARYN_TIES.notify.none", { name: actor.name }));
    return;
  }

  const { groups, unseen } = visibleGroups(actor);
  const isGM = game.user.isGM;

  if (!groups.length) {
    if (showing) clear();
    // Players are told only that nobody they know is in sight. Naming the ones behind the
    // wall would hand back exactly the information the visibility test just took away.
    if (isGM) {
      ui.notifications.info(
        game.i18n.format("PENTARYN_TIES.notify.partial", {
          name: actor.name,
          shown: 0,
          missing: unseen.join(", ")
        })
      );
    } else {
      ui.notifications.info(t("notify.noneInSight"));
    }
    return;
  }

  /**
   * One card per PERSON, said here rather than leaned on downstream. `Cards.show()` dedups
   * on `sourceId:tieId` and would collapse a per-token list anyway, but that dedup is a
   * safety net, not the contract — and counting the pre-dedup list is exactly what made the
   * GM's "shown" number below disagree with the number of cards on screen.
   */
  const entries = groups.map(({ tie, tokens }) => ({ tie, token: tokens[0] }));
  if (showing) Cards.closeTransient();

  // safe unconditionally: `actor` already passed permitted(), so these notes are the
  // viewer's own — see the note in popups.mjs on where GM secrets belong instead
  const shown = Cards.show(actor, entries, { showNotes: true }); // fires onChange -> drawWires()

  state.actorId = actor.id;
  state.mode = "all";
  state.tieId = null;

  // every card was already pinned, so nothing new appeared. Say so rather than look broken.
  if (!shown) {
    ui.notifications.info(game.i18n.format("PENTARYN_TIES.notify.allUp", { name: actor.name }));
    return;
  }

  // GM only. For a player, silence about the unseen is the feature.
  if (isGM && unseen.length) {
    ui.notifications.info(
      // `shown`, not `entries.length` — anything already pinned was skipped, and the count
      // has to match what the GM can actually see on screen
      game.i18n.format("PENTARYN_TIES.notify.partial", {
        name: actor.name,
        shown,
        missing: unseen.join(", ")
      })
    );
  }
}

/**
 * Key 7's subject: the token you have SELECTED. A player who has not clicked their own
 * token gets the same courtesy the other key gives them — if they own exactly one token on
 * this scene, that is unambiguously who they mean. A GM must select; they own everything,
 * so there is nothing to infer.
 */
function sourceToken() {
  return canvas?.tokens?.controlled?.[0] ?? soleOwnedToken();
}

/** KEY 7 — the one connection between the token you have selected and the one you are hovering. */
export function showOne() {
  if (!canvas?.ready) return;

  const src = sourceToken();
  if (!src?.actor) {
    ui.notifications.warn(t("notify.needSource"));
    return;
  }
  if (!permitted(src.actor)) {
    ui.notifications.warn(t("notify.notYours"));
    return;
  }

  /**
   * Rule 2 still applies to the object of the question, exactly as it does for key 8.
   *
   * ⚠ All three failures deliberately give the SAME message. Hovering nothing, hovering
   * yourself and hovering a token you cannot see must be indistinguishable, or the key
   * becomes an invisible-token detector: wave the cursor over the dark and watch which
   * squares answer differently.
   */
  const target = canvas.tokens.hover;
  // compared by ACTOR, not by token: with the same person on the map twice, hovering their
  // other token is still asking about yourself, and should get the neutral answer rather
  // than "you have no tie recorded to you"
  if (!target?.actor || target.actor.id === src.actor.id || !canSee(target)) {
    ui.notifications.warn(t("notify.needTarget"));
    return;
  }

  const tie = read(src.actor).find(x => x.id === target.actor.id);
  if (!tie) {
    /**
     * ⚠ Do NOT name the target to a player. `displayName: NONE` is the default dressing for
     * scene extras here — most of the crowd has no nameplate on purpose — and a miss that
     * said "you have no tie to Old Cobb" would hand over a name the map is deliberately
     * withholding, off a token they only had to wave the cursor at. A player is told there
     * is nothing there and nothing else. The GM, who can read every sheet anyway, gets the
     * useful version.
     */
    ui.notifications.info(
      game.user.isGM
        ? game.i18n.format("PENTARYN_TIES.notify.noTieBetween", {
            source: src.actor.name,
            target: target.actor.name
          })
        : t("notify.noTieHere")
    );
    return;
  }

  // pressing it again on the same person is how you close it
  const showing = Cards.anyTransient();
  const same = state.mode === "one" && state.actorId === src.actor.id && state.tieId === tie.id;
  if (showing && same) return clear();

  if (showing) Cards.closeTransient();
  const shown = Cards.show(src.actor, [{ tie, token: target }], { showNotes: true });

  state.actorId = src.actor.id;
  state.mode = "one";
  state.tieId = tie.id;

  // already on screen because it was dragged — a pinned card closes with its ✕, not the key
  if (!shown) {
    ui.notifications.info(game.i18n.format("PENTARYN_TIES.notify.alreadyPinned", { name: tie.name }));
  }
}

/**
 * 0.3.0 name, kept for anything that imported this module directly. `publishAPI()` binds
 * `show`/`cards` straight to `showAll`, so nothing in the repo reaches it — it exists only
 * so an outside importer does not break.
 */
export const toggle = showAll;

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

export function registerHooks() {
  // every change to the card set redraws the wires; nothing else may touch them
  Cards.setOnChange(drawWires);

  Hooks.on("canvasTearDown", () => {
    // Foundry destroys canvas.interface under us — drop the handle rather than the cards.
    state.wires = null;
    state.actorId = null;
    state.mode = null;
    state.tieId = null;
    // transient cards belong to a scene; pinned ones are a memo and travel with you
    Cards.closeTransient();
  });

  // a pinned card that travelled here from another scene needs its leash drawn again
  Hooks.on("canvasReady", () => drawWires());

  // transient cards ride the canvas, and every wire is anchored to it
  Hooks.on("canvasPan", () => {
    Cards.reflow();
    drawWires();
  });

  // a tie who walks out of sight (or into it) while cards are up
  Hooks.on("refreshToken", () => drawWires());
  Hooks.on("sightRefresh", () => drawWires());
}
