/**
 * The tempo tell: scoping a crowd shows, as a bubble over the looker's token.
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import { MODULE } from "../ties-api.mjs";
import { BUBBLE, esc, f, log } from "./shared.mjs";
import { send } from "../socket-adapter.mjs";

/* -------------------------------------------- */
/*  The tempo tell — scoping a crowd shows      */
/* -------------------------------------------- */

/**
 * How obvious is it that this character is working the room?
 *
 * Joe's rule, and it is roleplay furniture rather than a mechanic: inspect two people and nobody
 * notices; by the third you are visibly studying the room; by the fifth you are sweeping it; by
 * the tenth you look paranoid. **Moving resets it** — *"if they look, move, look, move, they don't
 * announce they are scoping people, which is how people do that in real life."*
 *
 * ## What this deliberately is NOT
 *
 * It is **not** a limit, a cost, or a check. Nothing is refused and no roll is modified. It is a
 * bubble the table can see, so the GM knows to have the room react — and a player who says *"I'm
 * being careful about it"* can be told to roll, or simply believed. The rule teaches itself: after
 * one bubble, players start moving between looks, which is the behaviour it is modelling.
 *
 * ⚠ It reveals **tempo, never outcome.** The count rises identically whether an inspection found
 * a guild membership or nothing at all, so it cannot become the tell the rest of the design works
 * to close. That is the property to preserve if this is ever changed.
 */
/*
 * The rungs, and they start EARLY on purpose.
 *
 * The first line lands on the **second** look — before anyone has done anything wrong — because
 * its job is to teach the rule, not to punish it. A player who reads it once starts moving between
 * looks, which is the behaviour the whole thing models. By the time the later lines fire they have
 * already been told twice.
 *
 * Keys are named for their count rather than numbered 1-2-3, so changing a threshold cannot leave
 * the strings quietly describing the wrong rung.
 */
const SCOPE_STEPS = [
  { at: 2, key: "known.inspect.scope2" },
  { at: 3, key: "known.inspect.scope3" },
  { at: 5, key: "known.inspect.scope5" },
  { at: 6, key: "known.inspect.scope6" }
];

/** Feet of movement that reads as "they moved on" and clears the count. */
const SCOPE_RESET_FEET = 15;

const scoping = new Map();

/** Clear the "standing here looking at people" run — a scene change should not carry it over. */
export const clearScoping = characterId => (characterId ? scoping.delete(characterId) : scoping.clear());

/** What the tempo counter currently believes, for a GM who wants to see it. */
export const scopingState = characterId =>
  characterId ? scoping.get(characterId) ?? null : Object.fromEntries(scoping);

/**
 * Count this look, and return the line to say — or null.
 *
 * The anchor is the position where the current run of looking began, not the previous look, so
 * drifting a foot at a time across a room still counts as standing there working it.
 */
function scopeTell(character, token) {
  if (!token) return null;
  const prev = scoping.get(character.id);
  /*
   * ⚠ `token.document.x`, never `token.x`.
   *
   * A Token placeable inherits `x`/`y` from PIXI's DisplayObject, where they are the local
   * transform — measured live as **0** while the document sat at 995. The logical grid position
   * is only ever on the document. An anchor built from `token.x` therefore compares 0 to 0
   * forever and the movement reset silently never fires.
   *
   * Exactly the family of mistake as `Token#visible` (the inherited PIXI flag, true for every
   * placeable) versus `Token#isVisible` (the real test), which bit this module once already.
   */
  const here = { x: token.document.x, y: token.document.y };
  const scene = token.document.parent ?? canvas?.scene;
  const gridDistance = scene?.grid?.distance ?? 5;
  const gridSize = scene?.grid?.size ?? 100;

  let count = 1;
  if (prev && prev.sceneId === scene?.id) {
    const dx = here.x - prev.anchor.x;
    const dy = here.y - prev.anchor.y;
    const feet = (Math.hypot(dx, dy) / gridSize) * gridDistance;
    if (feet <= SCOPE_RESET_FEET) count = prev.count + 1;
  }
  scoping.set(character.id, { count, anchor: count === 1 ? here : prev.anchor, sceneId: scene?.id });

  // exact thresholds only — the line should land once, not every look after three
  return SCOPE_STEPS.find(s => s.at === count)?.key ?? null;
}

/**
 * Say it over the token, on every client.
 *
 * A chat bubble is client-local, so the GM's own `canvas.hud.bubbles` would show it to the GM
 * alone — and the whole point is that the table sees someone working the room. Broadcast, then
 * render locally too, since `emit` does not loop back to the sender.
 */
function broadcastBubble(tokenId, sceneId, text) {
  const payload = { action: BUBBLE, tokenId, sceneId, text };
  send(payload);
  showBubble(payload);
}

/**
 * Count this look and say the line if it crosses a threshold.
 *
 * ⚠ Runs on the **gesturing** client, beside the stub, for the same reason: `isActiveGM()` is
 * true on every GM client signed in on the account, so running it in the handler both duplicated
 * the bubble and **double-counted the run** — thresholds would have fired at half the looks they
 * describe. The counter belongs to the person doing the looking.
 */
export async function announceTempo(character) {
  const own = canvas?.tokens?.placeables?.find(tk => tk.document.actorId === character.id);
  if (!own) return;
  const line = scopeTell(character, own);
  if (!line) return;
  const text = f(line, { name: character.name });

  broadcastBubble(own.id, canvas.scene?.id, text);

  /*
   * ...and a chat line, because the bubble is a glance and the chat is the record. Joe wants this
   * impossible to miss by him or the table, and five seconds over a token is missable if you were
   * looking at your sheet.
   *
   * Posted from the **gesturing** client, exactly once — the same rule the stub follows, and for
   * the same reason: `isActiveGM()` is true on every GM client on the account, so posting it in
   * the handler would duplicate it once per open GM session.
   *
   * `EMOTE` style so it renders as a description rather than as something the character said.
   */
  await ChatMessage.create({
    content: `<p class="pt-tempo-line">${esc(text)}</p>`,
    style: CONST.CHAT_MESSAGE_STYLES.EMOTE,
    speaker: ChatMessage.getSpeaker({ actor: character })
  });
}

/** How long the tell stays over their head. Long enough that nobody at the table misses it. */
const SCOPE_BUBBLE_MS = 5000;

/**
 * Render the tell over a token — **this module's own bubble, not `ChatBubbles#say`.**
 *
 * Two reasons core's bubble could not be used, and the second is the one that decided it:
 *
 *  1. **Its lifetime is word-count.** `#getDuration` computes `words × 200 ms` clamped to
 *     1–20 s, so these deliberately terse lines got ~2 s. Padding the copy to buy seconds is
 *     the wrong lever.
 *  2. **It is gated on a core setting.** `say()` returns `null` outright when
 *     `core.chatBubbles` is off — so a table that disabled speech bubbles would lose this
 *     warning silently, with nothing in the code saying why.
 *
 * Placement mirrors core's own math (`#chat-bubbles` is canvas-transformed, so token document
 * coordinates are the right space) and the `chat-bubble` class is reused, so it inherits the
 * table's own speech-bubble look and stays consistent with everything else on the canvas.
 */
export function showBubble({ tokenId, sceneId, text }) {
  try {
    if (canvas?.scene?.id !== sceneId) return;
    const token = canvas.tokens?.get(tokenId);
    const container = document.getElementById("chat-bubbles");
    if (!token || !container) return;

    // one tell per token at a time — a fast second look replaces the first rather than stacking
    container.querySelector(`.pt-tempo[data-pt-token="${tokenId}"]`)?.remove();

    const el = document.createElement("div");
    el.className = "chat-bubble pt-tempo";
    el.dataset.ptToken = tokenId;
    el.textContent = text; // never innerHTML: this string is composed from a character's name
    container.appendChild(el);

    // measure in the container's own (untransformed) space, then place as core does
    const ui = canvas.dimensions?.uiScale ?? 1;
    el.style.left = `${token.document.x}px`;
    el.style.top = `${token.document.y - el.offsetHeight - 8 * ui}px`;

    /*
     * ⚠ Removal is on a plain timer, never on `animation.finished`.
     *
     * The Web Animations API does not run in a **backgrounded tab**, so a `.finished` promise
     * there never resolves and the element never gets removed — leaving a stale warning pinned
     * over someone's token until they reload. Caught in testing: the bubble was still on screen
     * at 6.1 s with a 5 s life, because the tab under test was not the foreground one.
     *
     * The animations stay for the look; the lifetime is the timer's alone.
     */
    el.animate({ opacity: [0, 1] }, { duration: 250, easing: "ease" });
    setTimeout(() => {
      el.animate({ opacity: [1, 0] }, { duration: 400, easing: "ease" });
      el.style.opacity = "0"; // survives a tab that never ran the animation
      setTimeout(() => el.remove(), 450);
    }, SCOPE_BUBBLE_MS);
  } catch (err) {
    log.warn(`bubble render failed`, err);
  }
}
