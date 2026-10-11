/**
 * pentaryn-prompts — which created token a marker drop made. PURE: the clock is passed in.
 */

/** A drop's token must appear within this window to open its box. */
export const DROP_WINDOW_MS = 3000;

/**
 * Is this created token the one that drop made? Same actor, same scene, within the window, and its
 * centre near the drop point (the drop centres the token on the cursor, then snaps). A paste or a
 * duplicate of a marker of the same actor inside the window lands elsewhere and is not "fresh".
 * `now` is the creation time (Date.now() at the call site).
 */
export function matchesDrop(doc, d, now) {
  if (!d || d.actorId !== doc.actorId || now - d.t > DROP_WINDOW_MS) return false;
  if (d.sceneId && d.sceneId !== doc.parent?.id) return false;
  if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return true;
  const g = doc.parent?.dimensions?.size ?? 100;
  const cx = doc.x + doc.width * g / 2, cy = doc.y + doc.height * g / 2;
  const tol = g * Math.max(1, doc.width);
  return Math.abs(cx - d.x) <= tol && Math.abs(cy - d.y) <= tol;
}
