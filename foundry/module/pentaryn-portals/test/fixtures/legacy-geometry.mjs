/**
 * ORACLE — verbatim copies of the pure logic that lived inside portals.mjs at the checkpoint
 * (0ca63b97, portals 0.4.4), lifted out of their Foundry I/O so node can run them. Guide S2 /
 * finding aoe-movement-portals-26: the core replacements must agree with these on every input.
 * Never edit these to match new code; they are the "before".
 */

/** portals.mjs:485-491 (moveRegion), with `toObject?.() ?? deepClone` replaced by structuredClone. */
export function translateShapes(shapes, sx, sy) {
  return shapes.map(sh => {
    const o = structuredClone(sh);
    if (Array.isArray(o.points)) o.points = o.points.map((v, i) => v + (i % 2 ? sy : sx));
    if ("x" in o && o.x != null) o.x += sx;
    if ("y" in o && o.y != null) o.y += sy;
    return o;
  });
}

/** portals.mjs:142-159 (snapshot), the arithmetic only. */
export function cropWindow({ cx, cy, dims: d, natural, squaresWide = 8, squaresHigh = 5 }) {
  const sx = natural.w / d.sceneWidth;
  const sy = natural.h / d.sceneHeight;
  const g = d.size;
  let w = squaresWide * g * sx, h = squaresHigh * g * sy;
  let x = (cx - d.sceneX) * sx - w / 2, y = (cy - d.sceneY) * sy - h / 2;
  x = Math.max(0, Math.min(natural.w - w, x));
  y = Math.max(0, Math.min(natural.h - h, y));
  const OUT_W = 480, OUT_H = Math.round(OUT_W * h / w);
  const mx = ((cx - d.sceneX) * sx - x) * OUT_W / w, my = ((cy - d.sceneY) * sy - y) * OUT_H / h;
  const markR = Math.max(10, g * sx * OUT_W / w * 0.45);
  return { x, y, w, h, outW: OUT_W, outH: OUT_H, mx, my, markR };
}

/** portals.mjs:565 (landingPlaces). */
export const blockingWallCoords = walls => walls.filter(w => w.move > 0 && !(w.door > 0 && w.ds === 1)).map(w => w.c);

/** portals.mjs:568-570 (landingPlaces). */
export function occupiedBy(standing) {
  return (x, y) => standing.some(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
}

/** portals.mjs:569 and :672 — the token box, built twice. */
export const tokenBox = (t, g) => ({ x: t.x, y: t.y, w: t.width * g, h: t.height * g });

/** portals.mjs:58-61 (behaviorOf), before the fromUuidSync. */
export function behaviorUuidFromDialogId(id = "") {
  if (!id.startsWith("dialog-") || !id.includes(".RegionBehavior.")) return null;
  return id.slice("dialog-".length, id.lastIndexOf("-"));
}

/** portals.mjs:105 (plainQuestion). */
export const tokenIdFromDialogId = (id = "") => id.slice(id.lastIndexOf("-") + 1);

/** portals.mjs:333-340, with canvas.grid.size passed in. */
export function samplePoints(b, gridSize) {
  const q = Math.min(gridSize / 4, b.width / 4, b.height / 4);
  return [
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    { x: b.x + q, y: b.y + q }, { x: b.x + b.width - q, y: b.y + q },
    { x: b.x + q, y: b.y + b.height - q }, { x: b.x + b.width - q, y: b.y + b.height - q },
  ];
}

/** portals.mjs:37-46 (cardFor), over a plain region-like object. */
export function cardFor(region, MODULE = "pentaryn-portals") {
  const f = region?.flags?.[MODULE] ?? {};
  const scene = region?.parent;
  return {
    uuid: region.uuid,
    title: f.title?.trim() || scene?.navName || scene?.name || region.name,
    img: f.img?.trim() || scene?.thumb || "icons/svg/door-exit.svg",
    description: f.description?.trim() || "",
  };
}
