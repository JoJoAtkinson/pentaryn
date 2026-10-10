#!/usr/bin/env node
/**
 * Fixtures for cursors-core.mjs — `node test/run.mjs`. No dependencies, no Foundry.
 * The import itself is a check: cursors-core.mjs must load with `game`, `canvas` and `ui` undefined.
 * Also checks that every image the module can reference exists in assets/cursors/ and is 32/64 px.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { MODULE, KEYS, VARS, DRAW_TOOLS, keyFor, isModalTool, cursorValues, placementActive } = await import("../cursors-core.mjs");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}

/* ── keyFor: the design table ─────────────────────────────────────────── */
const table = [
  ["tokens", "select", false, null],
  ["tokens", "target", false, "target"],
  ["tokens", "ruler", false, "ruler"],
  ["tokens", "unconstrainedMovement", false, null],
  ["tokens", "echtoggle", false, null],
  ["tokens", "ptAttrReview", false, null],
  ["notes", "select", false, null],
  ["notes", "journal", false, "note"],
  ["drawings", "select", false, null],
  ...DRAW_TOOLS.map(t => ["drawings", t, false, "draw"]),
  ["drawings", "clear", false, null],
  ["walls", "walls", false, null],
  ["lighting", "light", false, null],
  ["regions", "rectangle", false, null],
  ["tiles", "tile", false, null],
  ["templates", "select", false, null],
  // the spell-area preview: the layer wins whatever the tool is
  ["tokens", "select", true, "aoe"],
  ["tokens", "target", true, "aoe"],
  ["drawings", "rect", true, "aoe"],
  [undefined, undefined, true, "aoe"],
  [undefined, undefined, false, null],
  ["notes", "target", false, null],
  ["tokens", "journal", false, null]
];
for (const [control, tool, templatesActive, want] of table)
  check(`keyFor ${control}.${tool}${templatesActive ? " +templates" : ""}`, keyFor({ control, tool, templatesActive }), want);
check("keyFor() no args", keyFor(), null);
check("every non-null key is in KEYS", table.map(r => r[3]).filter(Boolean).every(k => k in KEYS), true);
check("KEYS are exactly the five", Object.keys(KEYS), ["target", "ruler", "aoe", "note", "draw"]);

/* ── placementActive: dnd5e 6 places areas through core RegionLayer#placeRegions ── */
{
  const placing = { id: "preview-1" }, other = { id: "gm-drawn" }, earlier = { id: "preview-0" };
  check("no placement context → not active", placementActive([other], null), false);
  check("context set, preview not yet drawn (before first pointer move)", placementActive([], placing), false);
  check("context preview in the container → active", placementActive([placing], placing), true);
  check("GM drag-drawing a region (no context) → not active", placementActive([other], undefined), false);
  check("cancel: preview destroyed while context still set → not active", placementActive([other], placing), false);
  check("multi-region: previous region kept, current drawn → active", placementActive([earlier, placing], placing), true);
  check("no container (canvas not ready)", placementActive(undefined, placing), false);
}

/* ── isModalTool ──────────────────────────────────────────────────────── */
check("plain tool is modal", isModalTool({ name: "ruler" }), true);
check("toggle is not", isModalTool({ name: "unconstrainedMovement", toggle: true }), false);
check("button is not", isModalTool({ name: "clear", button: true }), false);
check("null is not", isModalTool(null), false);

/* ── cursorValues ─────────────────────────────────────────────────────── */
const v = cursorValues("target", "/modules/pentaryn-cursors");
check("four variables", Object.keys(v), [...VARS]);
check("default", v["--cursor-default"], 'url("/modules/pentaryn-cursors/assets/cursors/target.png") 16 16, crosshair');
check("default-down = default", v["--cursor-default-down"], v["--cursor-default"]);
check("pointer is lit", v["--cursor-pointer"], 'url("/modules/pentaryn-cursors/assets/cursors/target-pointer.png") 16 16, crosshair');
check("pointer-down = pointer", v["--cursor-pointer-down"], v["--cursor-pointer"]);
check("route prefix + trailing slash", cursorValues("ruler", "/foundry/modules/pentaryn-cursors/")["--cursor-default"],
  'url("/foundry/modules/pentaryn-cursors/assets/cursors/ruler.png") 25 6, cell');
check("image-set", cursorValues("draw", "/m", true)["--cursor-pointer"],
  'image-set(url("/m/assets/cursors/draw-pointer.png") 1x, url("/m/assets/cursors/draw-pointer@2x.png") 2x) 3 28, crosshair');
check("unknown key → null", cursorValues("select", "/m"), null);
check("no fallback is auto", Object.values(KEYS).every(k => k.fallback && k.fallback !== "auto"), true);
check("MODULE id", MODULE, "pentaryn-cursors");

/* ── built assets exist, are PNGs of the right size, hotspots inside ─── */
function pngSize(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
for (const [key, k] of Object.entries(KEYS)) {
  check(`${key} source exists`, existsSync(join(ROOT, "assets", "src", k.src)), true);
  check(`${key} hotspot inside 32×32`, k.hotspot.every(n => Number.isInteger(n) && n >= 0 && n < 32), true);
  for (const s of ["", "-pointer"]) {
    for (const [at, px] of [["", 32], ["@2x", 64]]) {
      const f = join(ROOT, "assets", "cursors", `${key}${s}${at}.png`);
      check(`${key}${s}${at}.png`, existsSync(f) ? pngSize(f) : "missing", [px, px]);
    }
  }
}

/* ── module.json / lang ───────────────────────────────────────────────── */
const manifest = JSON.parse(readFileSync(join(ROOT, "module.json"), "utf8"));
check("manifest id", manifest.id, MODULE);
check("manifest esmodules", manifest.esmodules, ["cursors.mjs"]);
const lang = JSON.parse(readFileSync(join(ROOT, "lang", "en.json"), "utf8"));
check("setting strings", ["Name", "Hint"].every(p => lang[`PENTARYN_CURSORS.Setting.enabled.${p}`]), true);

if (failures.length) {
  console.error(`✗ ${failures.length} failed, ${pass} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`✓ ${pass} passed`);
