/**
 * Pentaryn Movement — the waiting cue (0.8.0, plan §16.6; Fable's review §4 UX: "a queued or yielding token needs a
 * visible cue, or players re-drag"). UI: draws only, on this client.
 *
 * A token this client holds back (a drop queued behind another move, a member waiting for the one before it to arrive,
 * a mover the runtime guard holds) gets an amber dashed ring until it goes on or rests. Only the client that holds it
 * draws it: that is the player who dragged it, the one who would otherwise drag again. Nothing is written.
 */

const NAME = "pentarynMovementCue";
const COLOR = 0xf0b030;
/** token id → { why, at }: what is held, kept across a redraw of the token. */
const held = new Map();

/** The cue's graphics on a token, made on first use. */
function cueOf(token, make) {
  let g = token?.children?.find?.(c => c?.name === NAME) ?? null;
  if (g || !make) return g;
  const G = globalThis.PIXI?.Graphics;
  if (typeof G !== "function" || typeof token?.addChild !== "function") return null;
  g = new G();
  g.name = NAME;
  g.eventMode = "none";
  token.addChild(g);
  return g;
}

function draw(token) {
  const g = cueOf(token, true);
  if (!g) return;
  const w = token.w ?? token.document?.width * (globalThis.canvas?.grid?.size ?? 100);
  const h = token.h ?? token.document?.height * (globalThis.canvas?.grid?.size ?? 100);
  const r = Math.max(w, h) / 2 + 4;
  g.clear();
  g.lineStyle?.({ width: 4, color: COLOR, alpha: 0.95 });
  // A dashed ring: 12 arcs.
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * 2 * Math.PI, a1 = a0 + (Math.PI / 12);
    g.moveTo?.(w / 2 + r * Math.cos(a0), h / 2 + r * Math.sin(a0));
    g.arc?.(w / 2, h / 2, r, a0, a1);
  }
  g.visible = true;
}

/** Show the cue on token `id` (`why`: a reason code, for status()). */
export function showCue(id, why = "held") {
  if (!id) return;
  held.set(id, { why, at: Date.now() });
  try {
    const token = globalThis.canvas?.tokens?.get?.(id);
    if (token && !token.destroyed) draw(token);
  } catch { /* drawing is best effort: no canvas, a token mid-teardown */ held.set(id, { why, at: Date.now(), drawn: false }); }
}

/** Take the cue off token `id`. */
export function hideCue(id) {
  if (!held.delete(id)) return;
  try {
    const g = cueOf(globalThis.canvas?.tokens?.get?.(id), false);
    if (g) { g.parent?.removeChild?.(g); g.destroy?.(); }
  } catch { /* the token is gone with its children */ held.delete(id); }
}

/** refreshToken: a held token redrawn keeps its cue. */
export function refreshCue(token) {
  const id = token?.document?.id;
  if (!id || !held.has(id) || cueOf(token, false)) return;
  draw(token);
}

/** What is cued now (status()). */
export const cued = () => [...held].map(([id, v]) => ({ id, ...v }));

export function clearCues() {
  for (const id of [...held.keys()]) hideCue(id);
  held.clear();
}
