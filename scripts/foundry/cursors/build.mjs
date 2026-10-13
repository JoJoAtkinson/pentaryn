#!/usr/bin/env node
/**
 * Build the cursor set: scripts/foundry/cursors/src/*.svg → the module's
 * assets/cursors/<key>[-pointer].svg + .png (1×) + @2x.png, from KEYS in cursors-core.mjs. Run by
 * hand; the outputs are committed. The tool and its sources live outside the module so neither
 * ships to Data/modules (cursors guide step 7). board.mjs reads the
 * hotspots from KEYS (through core's cursorValues), so the build fails unless the measured hotspot
 * equals KEYS exactly.
 *
 * Needs @resvg/resvg-js (a dev tool, not a module dependency). It is looked up next to this script,
 * then in the current directory, so the simplest run is:
 *
 *   cd "$(mktemp -d)" && npm i @resvg/resvg-js@2.6.2 && node <repo>/scripts/foundry/cursors/build.mjs
 *
 * `--check-sources` needs no @resvg: it runs checkKeys(KEYS, SRC), which proves every KEYS[key].src
 * exists under src/, every KEYS[key].extreme is in EXTREMES and every KEYS[key].hotspot is two
 * integers in 0..31 (exit 1 naming each problem); scripts/tests/test_cursors_build.py runs it. The
 * full build runs the same check first. Importing this file runs nothing: it exports EXTREMES,
 * SCORES, checkKeys and centreHotspot (pinned by the module's test/build-check.test.mjs).
 *
 * Steps per key:
 *   1. strip the game-icons black background square, keep every glyph path;
 *   2. fit the glyph's bounding box into 26×26 centred on (16,16);
 *   3. normal: fill = tool colour, 2 px #101216 outline (paint-order stroke), 1 px white 70 % halo;
 *      pointer ("lit"): fill white, outline in the tool colour, same halo;
 *   4. recompute the hotspot from the fitted glyph (a 10× alpha mask) and fail unless it equals
 *      KEYS[key].hotspot (so a changed glyph cannot ship with a stale hotspot);
 *   5. rasterise at 32 and 64 px.
 * Steps 1–4 run for every key first; a key that fails or throws is named (`✗ <key>: <message>`)
 * and the run exits 1 having written nothing, so assets/cursors/ is never left half rebuilt.
 */
import { existsSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const MODULE_ROOT = join(REPO, "foundry", "module", "pentaryn-cursors");
const SRC = join(HERE, "src");
const OUT = join(MODULE_ROOT, "assets", "cursors");
const { KEYS } = await import(pathToFileURL(join(MODULE_ROOT, "cursors-core.mjs")).href);

const SIZE = 32, BOX = 26, OUTLINE = 2, HALO = 1, DARK = "#101216", ZOOM = 10;
const BACKGROUND = /^M0 0h512v512H0z$/;

/** Every `extreme` a key may name: "centre" (the bbox centre) or a key of SCORES. */
export const EXTREMES = ["centre", "up-right", "down-left", "bottom"];
/** Every EXTREMES entry but "centre": the hotspot is the glyph pixel maximising this score. */
export const SCORES = { "up-right": (x, y) => x - y, "down-left": (x, y) => y - x, bottom: (x, y) => y };

/** Problems with a KEYS table, as `<key>: <what>` lines (empty when all is well); pure but for
 *  existsSync on each source under srcDir. */
export function checkKeys(keys, srcDir) {
  const bad = [];
  for (const [key, k] of Object.entries(keys)) {
    if (!existsSync(join(srcDir, k.src))) bad.push(`${key}: source ${k.src} not in ${srcDir}`);
    if (!EXTREMES.includes(k.extreme)) bad.push(`${key}: unknown extreme ${JSON.stringify(k.extreme)} (one of ${EXTREMES.join(", ")})`);
    const h = k.hotspot;
    if (!(Array.isArray(h) && h.length === 2 && h.every(v => Number.isInteger(v) && v >= 0 && v < SIZE)))
      bad.push(`${key}: hotspot ${JSON.stringify(h)} is not two integers in 0..${SIZE - 1}`);
  }
  return bad;
}

function loadResvg() {
  for (const base of [import.meta.url, pathToFileURL(join(process.cwd(), "x.js")).href]) {
    try { return createRequire(base)("@resvg/resvg-js").Resvg; } catch { /* try the next */ }
  }
  console.error("@resvg/resvg-js not found. Run from a directory where it is installed:\n" +
    "  cd \"$(mktemp -d)\" && npm i @resvg/resvg-js@2.6.2 && node " + fileURLToPath(import.meta.url));
  process.exit(2);
}
let Resvg;

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

/** The "centre" hotspot of a fitted bbox: its midpoint, floored with the same `+ 0.01` as the
 *  pixel extremes so float error (15.9999…) cannot move the click point a pixel (cursors-edge-5). */
export function centreHotspot({ x0, y0, x1, y1 }) {
  return [Math.floor((x0 + x1) / 2 + 0.01), Math.floor((y0 + y1) / 2 + 0.01)];
}

/** Hotspot from the fitted glyph's own pixels: the extreme named by `extreme`, ties averaged. */
function measureHotspot(d, f, extreme) {
  if (extreme === "centre") return centreHotspot(f.bbox);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<path transform="translate(${f.tx} ${f.ty}) scale(${f.s})" d="${d}"/></svg>`;
  const img = new Resvg(svg, { fitTo: { mode: "width", value: SIZE * ZOOM } }).render();
  const { width, height, pixels } = img;
  if (!EXTREMES.includes(extreme)) throw new Error(`unknown extreme ${extreme}`);
  const score = SCORES[extreme];
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

/** Steps 1–5 for every key in KEYS; writes nothing unless every key passes. */
function build(resvg) {
  Resvg = resvg;
  const built = [];
  let failed = false;
  for (const [key, k] of Object.entries(KEYS)) {
    try {
      const raw = readFileSync(join(SRC, k.src), "utf8");
      const d = glyphPaths(raw);
      const f = fit(d, viewBoxOf(raw));
      const hot = measureHotspot(d, f, k.extreme);
      const b = f.bbox;
      console.log(`${key.padEnd(7)} bbox ${n(b.x0)},${n(b.y0)}–${n(b.x1)},${n(b.y1)}  hotspot ${hot.join(" ")} (KEYS ${k.hotspot.join(" ")})`);
      if (hot[0] !== k.hotspot[0] || hot[1] !== k.hotspot[1]) {
        console.error(`  ✗ ${key}: measured hotspot ${hot.join(" ")} ≠ KEYS.${key}.hotspot — update cursors-core.mjs`);
        failed = true;
      } else built.push([key, k, d, f]);
    } catch (e) {
      console.error(`  ✗ ${key}: ${e.message}`);
      failed = true;
    }
  }
  if (failed) {
    console.error(`  nothing written to ${OUT}`);
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  for (const [key, k, d, f] of built) {
    for (const [suffix, fill, outline] of [["", k.colour, DARK], ["-pointer", "#FFFFFF", k.colour]]) {
      const svg = cursorSvg(d, f, fill, outline);
      writeFileSync(join(OUT, `${key}${suffix}.svg`), svg);
      writeFileSync(join(OUT, `${key}${suffix}.png`), png(svg, SIZE));
      writeFileSync(join(OUT, `${key}${suffix}@2x.png`), png(svg, SIZE * 2));
    }
  }

  console.log(`wrote ${Object.keys(KEYS).length * 6} files (svg + png 1x/2x, normal and pointer)`);
}

const MAIN = !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (MAIN) {
  const bad = checkKeys(KEYS, SRC);
  for (const line of bad) console.error(`  ✗ ${line}`);
  if (process.argv.includes("--check-sources")) {
    if (!bad.length) console.log(`  ✓ all ${Object.keys(KEYS).length} cursor sources present in ${SRC}, every extreme and hotspot valid`);
    process.exit(bad.length ? 1 : 0);
  }
  if (bad.length) {
    console.error(`  nothing written to ${OUT}`);
    process.exit(1);
  }
  build(loadResvg());
}
