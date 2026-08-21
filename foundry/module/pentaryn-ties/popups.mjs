/**
 * The card layer — DOM, not PIXI.
 *
 * A card is one connection: the token's own art in the corner, the word, the name.
 * Built with createElement/textContent rather than an HTML string, because a tie's
 * word and notes are free text a GM typed — there is no template here to get the
 * escaping wrong in.
 *
 * TRANSIENT vs PINNED is the whole model:
 *   transient — spawned next to its token, follows the canvas as you pan and zoom,
 *               and the next press of the key sweeps it away.
 *   pinned    — the moment you DRAG one, it stops following the canvas and stops
 *               answering to the key. Dragging is the gesture that means "I want to
 *               keep this", so the only way out is its own ✕.
 *
 * Pinned cards outlive scene changes and reloads: they are a memo, not a scene overlay.
 *
 * This module owns the cards and nothing else. The wire joining a card to its token is
 * drawn on the canvas by overlay.mjs, which rebuilds it from `live()` every time
 * `onChange` fires — so the two can never disagree about what is on screen.
 *
 * Client-side only, like everything else here. Nothing crosses the socket.
 */

import { MODULE, read, stanceOf, stanceLabel } from "./ties-api.mjs";
import { readWorn } from "./worn.mjs";

const LAYER_ID = "pentaryn-ties-cards";
export const PIN_SETTING = "pinnedCards";
const FALLBACK_ART = "icons/svg/mystery-man.svg";

/** key `${sourceActorId}:${tieId}` -> { el, pinned, sourceId, tieId, anchor, colour } */
const cards = new Map();

const key = (sourceId, tieId) => `${sourceId}:${tieId}`;

/**
 * One subscriber, set by overlay.mjs. Every mutation of the card set calls it, so the
 * wires are a pure function of what is on screen rather than a second thing to remember
 * to update. A card that comes back after being closed brings its wire back with it.
 */
let notify = () => {};
export const setOnChange = fn => {
  notify = typeof fn === "function" ? fn : () => {};
};

/**
 * What is on screen right now, for the wire renderer. Positions are read from the live
 * DOM (not from a cached value) so a card mid-drag reports where it actually is.
 */
export function live() {
  const out = [];
  for (const r of cards.values()) {
    const box = r.el.getBoundingClientRect();
    out.push({
      sourceId: r.sourceId,
      tieId: r.tieId,
      // The SPECIFIC token this card was built above — not just its actor. An actor with two
      // tokens on one scene would otherwise have its wire resolved by "first visible token
      // in placeables order", which is not necessarily the one the user aimed at.
      tokenId: r.tokenId,
      pinned: r.pinned,
      colour: r.colour,
      // bottom-centre of the card: where a wire should leave from
      screen: { x: box.left + box.width / 2, y: box.top + box.height }
    });
  }
  return out;
}

function layer() {
  let el = document.getElementById(LAYER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = LAYER_ID;
    document.body.appendChild(el);
  }
  return el;
}

/** Canvas coordinates → screen pixels. Foundry's board fills the window, so fixed positioning lands. */
function toScreen(x, y) {
  try {
    const p = canvas.stage.toGlobal({ x, y });
    return { x: p.x, y: p.y };
  } catch {
    return { x: 0, y: 0 };
  }
}

/* -------------------------------------------- */
/*  Building one card                           */
/* -------------------------------------------- */

function buildCard(tie, token, { showNotes = false } = {}) {
  const el = document.createElement("div");
  el.className = "pt-card";

  // The token's own texture, not the actor's portrait: the player is already looking at
  // this art on the map, and it needs no permission on an actor they don't own.
  const art = document.createElement("img");
  art.className = "pt-card-art";
  art.src = token?.document?.texture?.src || tie.img || FALLBACK_ART;
  art.alt = "";
  art.addEventListener("error", () => (art.src = FALLBACK_ART));

  const body = document.createElement("div");
  body.className = "pt-card-body";

  const word = document.createElement("div");
  word.className = "pt-card-word";
  const dot = document.createElement("span");
  dot.className = "pt-dot";
  dot.textContent = "●";
  dot.style.color = stanceOf(tie.stance).css;
  const wordText = document.createElement("span");
  wordText.textContent = tie.word || stanceLabel(tie.stance);
  word.append(dot, wordText);

  const name = document.createElement("div");
  name.className = "pt-card-name";
  name.textContent = tie.name;

  body.append(word, name);

  /**
   * Notes always come off the SOURCE actor's array, and you only ever run this on an actor
   * you own — so a player only ever reads notes on their own character's connections, which
   * they can already read and edit on the sheet. Nothing new is exposed here.
   *
   * Do not mistake that for secrecy. Foundry ships every Actor document, flags included, to
   * every client regardless of permission — verified on v14 from a player session. Tie notes
   * are presentation-gated, never access-gated. Real secrets go in a GM-only journal.
   */
  if (showNotes && tie.notes.trim()) {
    const notes = document.createElement("div");
    notes.className = "pt-card-notes";
    notes.textContent = tie.notes;
    body.append(notes);
  }

  /**
   * The worn mark, GM only — this token is somebody else tonight. Reads off the TOKEN
   * document (per-scene by construction) and rides under the notes the same way. The
   * `isGM` gate matches every other render path for the mark: players never see a line,
   * whatever the flag says. Like everything on a card, it is textContent, never HTML.
   */
  const worn = game.user?.isGM ? readWorn(token?.document) : null;
  if (worn) {
    const box = document.createElement("div");
    box.className = "pt-card-worn";
    const who = document.createElement("div");
    who.className = "pt-card-worn-by";
    who.textContent = game.i18n.format("PENTARYN_TIES.worn.cardLabel", { by: worn.by || "?" });
    box.append(who);
    if (worn.note.trim()) {
      const note = document.createElement("div");
      note.className = "pt-card-worn-note";
      note.textContent = worn.note;
      box.append(note);
    }
    body.append(box);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "pt-card-close";
  close.title = game.i18n.localize("PENTARYN_TIES.card.close");
  close.innerHTML = '<i class="fa-solid fa-xmark"></i>';

  el.append(art, body, close);
  return { el, close };
}

/* -------------------------------------------- */
/*  Drag → pin                                  */
/* -------------------------------------------- */

function makeDraggable(rec) {
  const el = rec.el;
  let dragging = false;
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;

  el.addEventListener("pointerdown", ev => {
    if (ev.button !== 0 || ev.target.closest(".pt-card-close")) return;
    dragging = true;
    sx = ev.clientX;
    sy = ev.clientY;
    const r = el.getBoundingClientRect();
    ox = r.left;
    oy = r.top;
    el.setPointerCapture?.(ev.pointerId);
    // the canvas is underneath and would otherwise start a drag-select of its own
    ev.preventDefault();
    ev.stopPropagation();
  });

  el.addEventListener("pointermove", ev => {
    if (!dragging) return;
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    // a click is not a drag — only commit past a few pixels, so a stray press doesn't pin
    if (!rec.pinned && Math.hypot(dx, dy) > 4) pin(rec);
    place(rec, ox + dx, oy + dy);
    notify(); // the wire follows the card out to wherever it is being dropped
  });

  const end = ev => {
    if (!dragging) return;
    dragging = false;
    el.releasePointerCapture?.(ev.pointerId);
    if (rec.pinned) savePinned();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

function place(rec, left, top) {
  // keep it on screen — a card dragged off the edge is a card you cannot close
  const w = rec.el.offsetWidth || 200;
  const h = rec.el.offsetHeight || 60;
  rec.el.style.left = `${Math.max(0, Math.min(window.innerWidth - w, left))}px`;
  rec.el.style.top = `${Math.max(0, Math.min(window.innerHeight - h, top))}px`;
}

function pin(rec) {
  rec.pinned = true;
  rec.el.classList.add("pt-pinned");
}

/* -------------------------------------------- */
/*  Public surface                              */
/* -------------------------------------------- */

/**
 * Show a card per entry. Entries already passed the distance and visibility tests —
 * this layer draws what it is given and makes no judgements about who may see what.
 * `entries`: [{ tie, token }]
 */
export function show(sourceActor, entries, { showNotes = false } = {}) {
  if (!sourceActor) return 0;
  let shown = 0;
  for (const { tie, token } of entries) {
    const k = key(sourceActor.id, tie.id);
    if (cards.has(k)) continue; // already up — probably pinned; don't stamp a second one
    const { el, close } = buildCard(tie, token, { showNotes });
    const rec = {
      el,
      pinned: false,
      sourceId: sourceActor.id,
      tieId: tie.id,
      tokenId: token?.id ?? null,
      colour: stanceOf(tie.stance).hex,
      // top edge of the token, in canvas coords — see the geometry note in overlay.mjs on
      // why this comes off `center` and the document, never `token.x`
      anchor: token ? { x: token.center.x, y: token.center.y - (token.h ?? 0) / 2 } : null
    };
    close.addEventListener("click", ev => {
      ev.stopPropagation();
      remove(k);
      savePinned();
      notify();
    });
    layer().appendChild(el);
    cards.set(k, rec);
    makeDraggable(rec);
    follow(rec);
    shown++;
  }
  notify();
  return shown;
}

/** Park a transient card just above its token, in screen space. */
function follow(rec) {
  if (rec.pinned || !rec.anchor) return;
  const s = toScreen(rec.anchor.x, rec.anchor.y);
  const w = rec.el.offsetWidth || 200;
  const h = rec.el.offsetHeight || 60;
  place(rec, s.x - w / 2, s.y - h - 8);
}

/** Pan/zoom moved the world under us. Pinned cards deliberately do not care. */
export function reflow() {
  for (const rec of cards.values()) follow(rec);
}

function remove(k) {
  const rec = cards.get(k);
  if (!rec) return;
  rec.el.remove();
  cards.delete(k);
}

/** The key press sweep — takes the transient ones, leaves anything that was dragged. */
export function closeTransient() {
  for (const [k, rec] of [...cards.entries()]) if (!rec.pinned) remove(k);
  notify();
}

/** Everything, pinned included. Only used by the console API and by teardown-on-logout. */
export function closeAll() {
  for (const k of [...cards.keys()]) remove(k);
  savePinned();
  notify();
}

export function anyTransient() {
  for (const rec of cards.values()) if (!rec.pinned) return true;
  return false;
}

/* -------------------------------------------- */
/*  Remembering                                 */
/* -------------------------------------------- */

function savePinned() {
  try {
    const keep = [...cards.values()]
      .filter(r => r.pinned)
      .map(r => {
        const box = r.el.getBoundingClientRect();
        return { sourceId: r.sourceId, tieId: r.tieId, x: Math.round(box.left), y: Math.round(box.top) };
      });
    game.settings.set(MODULE, PIN_SETTING, keep);
  } catch (err) {
    console.warn(`${MODULE} | could not save pinned cards`, err);
  }
}

/**
 * Rebuild the pinned cards after a reload. Defensive throughout: a tie that has since been
 * deleted, or an actor this user can no longer read, is simply dropped rather than restored
 * as a broken card.
 */
export function restorePinned() {
  let saved;
  try {
    saved = game.settings.get(MODULE, PIN_SETTING);
  } catch {
    return;
  }
  if (!Array.isArray(saved) || !saved.length) return;

  for (const entry of saved) {
    const actor = game.actors?.get(entry?.sourceId);
    if (!actor || !(game.user.isGM || actor.isOwner)) continue;
    const tie = read(actor).find(x => x.id === entry.tieId);
    if (!tie) continue;
    /**
     * ⚠ The visibility rule applies here too, and used not to.
     *
     * The card's art is the TOKEN's texture, so restoring a pinned card against a token this
     * client cannot see would show a player both that the person is on this scene and what
     * they currently look like — off a card they pinned on a different scene entirely. The
     * wire was already safe (paintWires resolves through the filtered lookup); this was the
     * one hole left. Without a token the card falls back to `tie.img`, which is the actor
     * portrait they could already reach.
     *
     * Inlined rather than imported: overlay.mjs imports this module, so canSee() cannot come
     * the other way without a cycle. Canonical version and its `isVisible` vs `visible`
     * reasoning live there.
     */
    const seen = p => game.user?.isGM === true || (p.isVisible ?? p.visible) === true;
    const token = canvas?.ready
      ? canvas.tokens.placeables.find(p => p.actor?.id === tie.id && seen(p)) ?? null
      : null;
    const k = key(actor.id, tie.id);
    if (cards.has(k)) continue;
    const { el, close } = buildCard(tie, token, { showNotes: true });
    const rec = {
      el,
      pinned: true,
      sourceId: actor.id,
      tieId: tie.id,
      tokenId: token?.id ?? null,
      colour: stanceOf(tie.stance).hex,
      anchor: null
    };
    el.classList.add("pt-pinned");
    close.addEventListener("click", ev => {
      ev.stopPropagation();
      remove(k);
      savePinned();
      notify();
    });
    layer().appendChild(el);
    cards.set(k, rec);
    makeDraggable(rec);
    place(rec, Number(entry.x) || 20, Number(entry.y) || 20);
  }
  notify();
}
