#!/usr/bin/env node
/**
 * Build the cursor set: assets/src/*.svg → assets/cursors/<key>[-pointer].svg + .png (1×) + @2x.png,
 * from KEYS in cursors-core.mjs. Run by hand; the outputs are committed. cursors.mjs reads the
 * hotspots from KEYS, so the build fails unless the measured hotspot equals KEYS exactly.
 *
 * Needs @resvg/resvg-js (a dev tool, not a module dependency). It is looked up next to this script,
 * then in the current directory, so the simplest run is:
 *
 *   cd "$(mktemp -d)" && npm i @resvg/resvg-js@2.6.2 && node <repo>/foundry/module/pentaryn-cursors/tools/build.mjs
 *
 * Steps per key:
 *   1. strip the game-icons black background square, keep every glyph path;
 *   2. fit the glyph's bounding box into 26×26 centred on (16,16);
 *   3. normal: fill = tool colour, 2 px #101216 outline (paint-order stroke), 1 px white 70 % halo;
 *      pointer ("lit"): fill white, outline in the tool colour, same halo;
 *   4. recompute the hotspot from the fitted glyph (a 10× alpha mask) and fail unless it equals
 *      KEYS[key].hotspot (so a changed glyph cannot ship with a stale hotspot);
 *   5. rasterise at 32 and 64 px.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(ROOT, "assets", "src");
const OUT = join(ROOT, "assets", "cursors");
const { KEYS } = await import(pathToFileURL(join(ROOT, "cursors-core.mjs")).href);

function loadResvg() {
  for (const base of [import.meta.url, pathToFileURL(join(process.cwd(), "x.js")).href]) {
    try { return createRequire(base)("@resvg/resvg-js").Resvg; } catch { /* try the next */ }
  }
  console.error("@resvg/resvg-js not found. Run from a directory where it is installed:\n" +
    "  cd \"$(mktemp -d)\" && npm i @resvg/resvg-js@2.6.2 && node " + fileURLToPath(import.meta.url));
  process.exit(2);
}
const Resvg = loadResvg();

const SIZE = 32, BOX = 26, OUTLINE = 2, HALO = 1, DARK = "#101216", ZOOM = 10;
const BACKGROUND = /^M0 0h512v512H0z$/;

/** Every glyph path `d` in a source SVG, minus the game-icons background square. */
function glyphPaths(svg) {
  const body = svg.replace(/<!--[\s\S]*?-->/g, "");
  const ds = [...body.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(m => m[1].trim());
  const glyph = ds.filter(d => !BACKGROUND.test(d));
  if (!glyph.length) throw new Error("no glyph path");
  return glyph.join(" ");
}

function viewBoxOf(svg) {
  const m = svg.match(/viewBox="([^"]+)"/);
  return m ? m[1] : "0 0 512 512";
}

/** Fit transform: glyph bbox → 26×26 box centred on (16,16). */
function fit(d, viewBox) {
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${d}"/></svg>`;
  const bb = new Resvg(probe).getBBox();
  if (!bb) throw new Error("empty bbox");
  const s = BOX / Math.max(bb.width, bb.height);
  const tx = SIZE / 2 - (bb.x + bb.width / 2) * s;
  const ty = SIZE / 2 - (bb.y + bb.height / 2) * s;
  return { s, tx, ty, bbox: { x0: bb.x * s + tx, y0: bb.y * s + ty, x1: (bb.x + bb.width) * s + tx, y1: (bb.y + bb.height) * s + ty } };
}

const n = v => +v.toFixed(4);

function cursorSvg(d, { s, tx, ty }, fill, outline) {
  const g = `transform="translate(${n(tx)} ${n(ty)}) scale(${n(s)})"`;
  const halo = n((OUTLINE + HALO) * 2 / s), line = n(OUTLINE * 2 / s);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<g ${g} stroke-linejoin="round" stroke-linecap="round">` +
    `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-opacity="0.7" stroke-width="${halo}"/>` +
    `<path d="${d}" fill="${fill}" stroke="${outline}" stroke-width="${line}" paint-order="stroke"/>` +
    `</g></svg>\n`;
}

/** Hotspot from the fitted glyph's own pixels: the extreme named by `extreme`, ties averaged. */
function measureHotspot(d, f, extreme) {
  if (extreme === "centre") {
    const { x0, y0, x1, y1 } = f.bbox;
    return [Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2)];
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<path transform="translate(${f.tx} ${f.ty}) scale(${f.s})" d="${d}"/></svg>`;
  const img = new Resvg(svg, { fitTo: { mode: "width", value: SIZE * ZOOM } }).render();
  const { width, height, pixels } = img;
  const score = { "up-right": (x, y) => x - y, "down-left": (x, y) => y - x, bottom: (x, y) => y }[extreme];
  if (!score) throw new Error(`unknown extreme ${extreme}`);
  const pts = [];
  let best = -Infinity;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 128) continue;
    const px = (x + 0.5) / ZOOM, py = (y + 0.5) / ZOOM, v = score(px, py);
    pts.push([px, py, v]);
    if (v > best) best = v;
  }
  const tied = pts.filter(p => p[2] >= best - 0.5);
  const mx = tied.reduce((a, p) => a + p[0], 0) / tied.length;
  const my = tied.reduce((a, p) => a + p[1], 0) / tied.length;
  return [Math.floor(mx + 0.01), Math.floor(my + 0.01)];
}

function png(svg, px) {
  return new Resvg(svg, { fitTo: { mode: "width", value: px }, background: "rgba(0,0,0,0)" }).render().asPng();
}

mkdirSync(OUT, { recursive: true });
let failed = false;
for (const [key, k] of Object.entries(KEYS)) {
  const raw = readFileSync(join(SRC, k.src), "utf8");
  const d = glyphPaths(raw);
  const f = fit(d, viewBoxOf(raw));
  const hot = measureHotspot(d, f, k.extreme);
  const b = f.bbox;
  console.log(`${key.padEnd(7)} bbox ${n(b.x0)},${n(b.y0)}–${n(b.x1)},${n(b.y1)}  hotspot ${hot.join(" ")} (KEYS ${k.hotspot.join(" ")})`);
  if (hot[0] !== k.hotspot[0] || hot[1] !== k.hotspot[1]) {
    console.error(`  ✗ ${key}: measured hotspot ${hot.join(" ")} ≠ KEYS.${key}.hotspot — update cursors-core.mjs`);
    failed = true;
  }
  for (const [suffix, fill, outline] of [["", k.colour, DARK], ["-pointer", "#FFFFFF", k.colour]]) {
    const svg = cursorSvg(d, f, fill, outline);
    writeFileSync(join(OUT, `${key}${suffix}.svg`), svg);
    writeFileSync(join(OUT, `${key}${suffix}.png`), png(svg, SIZE));
    writeFileSync(join(OUT, `${key}${suffix}@2x.png`), png(svg, SIZE * 2));
  }
}
if (failed) process.exit(1);

console.log(`wrote ${Object.keys(KEYS).length * 6} files (svg + png 1x/2x, normal and pointer)`);
