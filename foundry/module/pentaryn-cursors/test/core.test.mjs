// Core characterisation (guide step 1.4). The core is imported FIRST and BARE — no Foundry stub
// installed. If it touched a Foundry global at load, this file would fail before any test ran:
// that is the purity proof. Every check() of the old self-running suite (test/run.mjs lines 22–110
// at ee505c2) is ported verbatim through checkJSON, so the JSON-equality semantics are unchanged.
import * as core from "../cursors-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { checkJSON, manifestOf } from "./kit/harness.mjs";

const { MODULE, KEYS, VARS, DRAW_TOOLS, keyFor, isModalTool, cursorValues, placementActive } = core;
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO = join(ROOT, "..", "..", "..");
const check = (name, got, want) => assert.ok(checkJSON(name, got, want), name);

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
  assert.equal(typeof core.keyFor, "function");
});

test("VERSION === module.json version; identity constants", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
  assert.equal(core.SHORT, "cursors");
  assert.equal(core.NS, "cursors");
  assert.equal(core.CONTRACT, `${core.MODULE}/api@1`);
  assert.equal(core.I18N, "PENTARYN_CURSORS");
  assert.equal(core.CSS, "pcur-");
  assert.deepEqual(core.HOOKS, {});
  assert.ok(Object.isFrozen(core.HOOKS));
});

/* ── keyFor: the design table ─────────────────────────────────────────── */
test("keyFor: the design table", () => {
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
  check("DRAW_TOOLS", DRAW_TOOLS, ["rect", "ellipse", "polygon", "freehand", "text"]);
});

test("keyFor: the live golden's table (.state/live-goldens/before/cursors.json keyForTable)", () => {
  const tools = [["tokens", "select"], ["tokens", "target"], ["tokens", "ruler"], ["notes", "journal"], ["drawings", "rect"]];
  const got = tools.map(([control, tool]) => keyFor({ control, tool }))
    .concat(keyFor({ control: "tokens", tool: "select", templatesActive: true }));
  check("live keyForTable", got, [null, "target", "ruler", "note", "draw", "aoe"]);
});

/* ── placementActive: dnd5e 6 places areas through core RegionLayer#placeRegions ── */
test("placementActive", () => {
  const placing = { id: "preview-1" }, other = { id: "gm-drawn" }, earlier = { id: "preview-0" };
  check("no placement context → not active", placementActive([other], null), false);
  check("context set, preview not yet drawn (before first pointer move)", placementActive([], placing), false);
  check("context preview in the container → active", placementActive([placing], placing), true);
  check("GM drag-drawing a region (no context) → not active", placementActive([other], undefined), false);
  check("cancel: preview destroyed while context still set → not active", placementActive([other], placing), false);
  check("multi-region: previous region kept, current drawn → active", placementActive([earlier, placing], placing), true);
  check("no container (canvas not ready)", placementActive(undefined, placing), false);
  // array-likes (PIXI children is an Array; a NodeList-like also works through Array.prototype.includes)
  check("array-like children", placementActive({ length: 1, 0: placing }, placing), true);
});

/* ── isModalTool ──────────────────────────────────────────────────────── */
test("isModalTool", () => {
  check("plain tool is modal", isModalTool({ name: "ruler" }), true);
  check("toggle is not", isModalTool({ name: "unconstrainedMovement", toggle: true }), false);
  check("button is not", isModalTool({ name: "clear", button: true }), false);
  check("null is not", isModalTool(null), false);
  check("a string is not", isModalTool("ruler"), false);
});

/* ── cursorValues ─────────────────────────────────────────────────────── */
test("cursorValues", () => {
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
  check("null base → root-relative", cursorValues("aoe", null)["--cursor-default"], 'url("/assets/cursors/aoe.png") 16 16, crosshair');
  check("no fallback is auto", Object.values(KEYS).every(k => k.fallback && k.fallback !== "auto"), true);
  check("MODULE id", MODULE, "pentaryn-cursors");
  check("VARS", VARS, ["--cursor-default", "--cursor-default-down", "--cursor-pointer", "--cursor-pointer-down"]);
});

/* ── built assets exist, are PNGs of the right size, hotspots inside ─── */
function pngSize(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test("built assets: PNG sizes and hotspots", () => {
  for (const [key, k] of Object.entries(KEYS)) {
    // The icon sources move out of the module in guide step 7 (assets/src → scripts/foundry/cursors/src);
    // either location satisfies the old "source exists" check until the build tool's own check owns it.
    const sources = [join(ROOT, "assets", "src", k.src), join(REPO, "scripts", "foundry", "cursors", "src", k.src)];
    check(`${key} source exists`, sources.some(existsSync), true);
    check(`${key} hotspot inside 32×32`, k.hotspot.every(n => Number.isInteger(n) && n >= 0 && n < 32), true);
    for (const s of ["", "-pointer"]) {
      for (const [at, px] of [["", 32], ["@2x", 64]]) {
        const f = join(ROOT, "assets", "cursors", `${key}${s}${at}.png`);
        check(`${key}${s}${at}.png`, existsSync(f) ? pngSize(f) : "missing", [px, px]);
      }
    }
  }
});

/* ── module.json (the lang half lives in i18n.test.mjs) ───────────────── */
test("module.json", () => {
  const manifest = manifestOf(ROOT);
  check("manifest id", manifest.id, MODULE);
  check("manifest esmodules", manifest.esmodules, ["cursors.mjs"]);
});
