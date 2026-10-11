/**
 * pentaryn-prompts — encounter crops (plan §5.4).
 *
 * Drawn in the GM's browser on an OffscreenCanvas straight from the level's background image: no
 * scene switch, no PIXI. Each crop is the encounter's box plus 15 ft (at least 8 squares a side),
 * with token art, footprint boxes labelled in the gather's own ids, walls (doors dashed), a scale
 * bar and a north arrow. The legend tells the model the picture is set dressing only.
 */

import { MODULE } from "./geometry-core.mjs";

const VIDEO = /\.(webm|mp4|m4v|ogv)(\?|$)/i;

async function bitmap(src, cache) {
  if (!src || VIDEO.test(src)) return null;
  if (cache.has(src)) return cache.get(src);
  const p = (async () => {
    try {
      const res = await fetch(src.startsWith("http") || src.startsWith("/") ? src : `/${src}`);
      if (!res.ok) return null;
      return await createImageBitmap(await res.blob());
    } catch { return null; }
  })();
  cache.set(src, p);
  return p;
}

async function toBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function box(rect, dims, gridFt, minSquares = 8, marginFt = 15) {
  const g = dims.size;
  const m = marginFt / gridFt * g;
  let x0 = rect.x - m, y0 = rect.y - m, x1 = rect.x + rect.w + m, y1 = rect.y + rect.h + m;
  const min = minSquares * g;
  if (x1 - x0 < min) { const c = (x0 + x1) / 2; x0 = c - min / 2; x1 = c + min / 2; }
  if (y1 - y0 < min) { const c = (y0 + y1) / 2; y0 = c - min / 2; y1 = c + min / 2; }
  // keep inside the scene rectangle where possible
  const sx0 = dims.sceneX, sy0 = dims.sceneY, sx1 = dims.sceneX + dims.sceneWidth, sy1 = dims.sceneY + dims.sceneHeight;
  if (x0 < sx0) { x1 += sx0 - x0; x0 = sx0; }
  if (y0 < sy0) { y1 += sy0 - y0; y0 = sy0; }
  if (x1 > sx1) { x0 -= x1 - sx1; x1 = sx1; }
  if (y1 > sy1) { y0 -= y1 - sy1; y1 = sy1; }
  x0 = Math.max(x0, sx0); y0 = Math.max(y0, sy0);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function label(ctx, text, x, y, colour) {
  ctx.font = "bold 15px sans-serif";
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(x, y, w, 19);
  ctx.fillStyle = colour;
  ctx.fillText(text, x + 4, y + 15);
}

/**
 * Render crops for encounters of a stored manifest.
 * Returns `[{encounter, scene, png (base64 webp), mime, squares}]`; failures come back as
 * `{encounter, scene, error}` so one bad image never sinks the gather.
 */
export async function renderCrops(manifest, encounterIds, { longSide = 768 } = {}) {
  const sceneIdOf = Object.fromEntries(Object.entries(manifest.scenes).map(([sid, id]) => [id, sid]));
  const cache = new Map();
  const out = [];
  for (const eid of encounterIds) {
    const enc = manifest.encounters[eid];
    const scene = enc && game.scenes.get(enc.sceneId);
    if (!scene) { out.push({ encounter: eid, scene: null, error: "SCENE_UNKNOWN" }); continue; }
    try {
      out.push(await renderOne(scene, eid, enc, manifest, sceneIdOf[scene.id], longSide, cache));
    } catch (err) {
      console.warn(`${MODULE} | crop ${eid} failed`, err);
      out.push({ encounter: eid, scene: sceneIdOf[scene.id], error: String(err?.message ?? err) });
    }
  }
  return out;
}

async function renderOne(scene, eid, enc, manifest, sid, longSide, cache) {
  const dims = scene.dimensions;
  const g = dims.size;
  const gridFt = scene.grid?.distance ?? 5;
  const crop = box(enc.rect, dims, gridFt);
  const k = longSide / Math.max(crop.w, crop.h);
  const W = Math.round(crop.w * k), H = Math.round(crop.h * k);
  const oc = new OffscreenCanvas(W, H);
  const ctx = oc.getContext("2d");
  const toX = x => (x - crop.x) * k, toY = y => (y - crop.y) * k;

  // background colour, then the level's background image over the scene rectangle
  ctx.fillStyle = scene.backgroundColor?.css ?? String(scene.backgroundColor ?? "#222");
  ctx.fillRect(0, 0, W, H);
  const bgSrc = scene.firstLevel?.background?.src ?? scene.background?.src ?? null;
  const bg = await bitmap(bgSrc, cache);
  if (bg) {
    const sx = (crop.x - dims.sceneX) * bg.width / dims.sceneWidth;
    const sy = (crop.y - dims.sceneY) * bg.height / dims.sceneHeight;
    const sw = crop.w * bg.width / dims.sceneWidth;
    const sh = crop.h * bg.height / dims.sceneHeight;
    ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, W, H);
  }

  // what is labelled: every gather id whose footprint touches the crop
  const labelled = [];
  for (const [pid, p] of Object.entries(manifest.prompts)) {
    if (p.sceneId !== scene.id) continue;
    const tok = scene.tokens.get(p.markerId);
    const r = tok ? { x: tok.x, y: tok.y, w: tok.width * g, h: tok.height * g } : { x: p.x, y: p.y, w: p.w, h: p.h };
    labelled.push({ id: pid, rect: r, img: tok?.texture?.src, prompt: true, member: enc.members.includes(pid) });
  }
  for (const [tid, b] of Object.entries(manifest.built)) {
    if (b.sceneId !== scene.id) continue;
    const doc = scene.getEmbeddedDocument(b.docName, b.id);
    if (!doc) continue;
    let r, img = null;
    if (b.docName === "Token") {
      r = { x: doc.x, y: doc.y, w: doc.width * g, h: doc.height * g };
      img = doc.ring?.enabled && doc.ring.subject?.texture ? doc.ring.subject.texture : doc.texture?.src;
    } else if (b.docName === "Tile") {
      r = { x: doc.x, y: doc.y, w: doc.width, h: doc.height };
      img = doc.texture?.src;
    } else {
      r = { x: doc.x - g / 4, y: doc.y - g / 4, w: g / 2, h: g / 2 };
      img = b.docName === "Note" ? doc.texture?.src : null;
    }
    labelled.push({ id: tid, rect: r, img, prompt: false, member: enc.members.includes(tid) });
  }
  const inside = r => r.x < crop.x + crop.w && r.x + r.w > crop.x && r.y < crop.y + crop.h && r.y + r.h > crop.y;
  const shown = labelled.filter(l => inside(l.rect));

  // built art (prompt markers are drawn as boxes only: their art is the bubble, not the thing)
  for (const l of shown) {
    if (l.prompt || !l.img) continue;
    const bmp = await bitmap(l.img, cache);
    if (bmp) ctx.drawImage(bmp, toX(l.rect.x), toY(l.rect.y), l.rect.w * k, l.rect.h * k);
  }

  // walls: solid white with a dark edge; doors dashed amber (open doors dotted green)
  for (const w of scene.walls) {
    const [x0, y0, x1, y1] = w.c;
    if (Math.max(x0, x1) < crop.x || Math.min(x0, x1) > crop.x + crop.w || Math.max(y0, y1) < crop.y || Math.min(y0, y1) > crop.y + crop.h) continue;
    if (!w.sight && !w.door) continue;
    const open = w.door && w.ds === 1;
    ctx.beginPath();
    ctx.moveTo(toX(x0), toY(y0));
    ctx.lineTo(toX(x1), toY(y1));
    ctx.setLineDash(w.door ? (open ? [2, 5] : [8, 5]) : []);
    ctx.lineWidth = 5; ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = w.door ? (open ? "#6fdc8c" : (w.door === 2 ? "#d17cff" : "#ffb347")) : "#f5f5f5";
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // footprint boxes + labels
  for (const l of shown) {
    const x = toX(l.rect.x), y = toY(l.rect.y), w = l.rect.w * k, h = l.rect.h * k;
    ctx.lineWidth = l.member ? 3 : 2;
    ctx.strokeStyle = l.prompt ? (l.member ? "#b89cff" : "rgba(184,156,255,0.6)") : (l.member ? "#7fd3ff" : "rgba(127,211,255,0.6)");
    ctx.setLineDash(l.prompt ? [6, 3] : []);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    label(ctx, l.id, x + 2, Math.max(0, y - 20), l.prompt ? "#e4d9ff" : "#d4f1ff");
  }

  // scale bar (5 ft and 25 ft) bottom-left, north arrow top-right
  const sq = g * k;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(8, H - 46, Math.max(sq * 5, 48) + 16, 38);
  ctx.fillStyle = "#fff";
  ctx.font = "12px sans-serif";
  ctx.fillText(`${gridFt * 5} ft (ticks ${gridFt} ft)`, 16, H - 30);
  ctx.fillRect(16, H - 18, sq * 5, 4);
  for (let i = 0; i <= 5; i++) ctx.fillRect(16 + i * sq - 1, H - 22, 2, 12);
  ctx.beginPath();
  ctx.moveTo(W - 24, 10); ctx.lineTo(W - 32, 30); ctx.lineTo(W - 16, 30); ctx.closePath();
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke(); ctx.fill();
  ctx.font = "bold 13px sans-serif"; ctx.fillStyle = "#fff"; ctx.fillText("N", W - 28, 46);
  label(ctx, `${eid} · set dressing only`, 8, 8, "#ffffff");

  const blob = await oc.convertToBlob({ type: "image/webp", quality: 0.82 });
  const mime = blob.type || "image/webp";
  // `mimeType` is the name the bridge reads; `mime` kept for API callers
  return { encounter: eid, scene: sid, png: await toBase64(blob), mime, mimeType: mime,
    squares: `${Math.round(crop.w / g)}x${Math.round(crop.h / g)}` };
}
