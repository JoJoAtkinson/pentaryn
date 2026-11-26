/**
 * Pentaryn Movement — the geometry both halves of the narrow-way core share (pure, no Foundry globals). Private to
 * core/: the narrow-core.mjs barrel does not re-export it. Units are squares (see narrow-core.mjs).
 */

export const EPS = 1e-9;
export const N8 = Object.freeze([[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
export const sqKey = (I, J) => `${I},${J}`;

/* -------------------------------------------- */
/*  Geometry                                    */
/* -------------------------------------------- */

/** Distance from (px, py) to segment a-b, the nearest point into `out` ({ d, x, y }). */
export function segNear(px, py, ax, ay, bx, by, out) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 > EPS ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t, y = ay + dy * t;
  out.x = x; out.y = y; out.d = Math.hypot(px - x, py - y);
  return out;
}

/** Does segment p-q meet the open box (x0, y0)-(x1, y1) along a stretch of positive length (Liang-Barsky)? */
export function segThroughBox(ax, ay, bx, by, x0, y0, x1, y1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p, q) => {
    if (Math.abs(p) < EPS) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (!clip(-dx, ax - x0) || !clip(dx, x1 - ax) || !clip(-dy, ay - y0) || !clip(dy, y1 - ay)) return false;
  return (t1 - t0) * Math.hypot(dx, dy) > 1e-7;
}

/** Foundry's orientation test for a one-way wall (motion-core wallOpenFrom, any units). */
export function openFrom(c, dir, p) {
  const d = Number(dir);
  if (!(d === 1 || d === 2)) return false;
  const o = (c[1] - p.y) * (c[2] - p.x) - (c[0] - p.x) * (c[3] - p.y);
  if (Math.abs(o) < 1e-12) return false;
  return (o < 0 ? 1 : 2) === d;
}

