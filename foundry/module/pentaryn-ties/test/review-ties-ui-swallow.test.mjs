/**
 * Final code review (ties-ui-rob-6): five bare `try { … } catch { fallback }` blocks lost their
 * failure without a trace — review-ui `carriers()` (continue), attributes-ui `personalCluesHTML`
 * (false, and []), overlay `paintWires` pinned leash (continue), popups `toScreen` ({x:0,y:0}) — and
 * attributes-ui `carrierMap()` (continue), the same walk added since by ties-ui-perf-2.
 * Ruling [declared]: each becomes `log.swallow('<op>', fn, fallback)` with the same fallback, so the
 * failure is a debug line (with `CONFIG.debug["pentaryn-ties"] = true`) instead of nothing.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootWorld } from "./fixtures/world.mjs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const A = "zzRob6Actor00001";

await bootWorld({ actors: [{ id: A, name: "ZZ Rob6 Carrier" }] });

/** Run `fn` with module debug on and getFlag throwing on the test actor; return [result, debug lines]. */
function withBrokenFlags(fn) {
  const actor = game.actors.get(A);
  CONFIG.debug ??= {};
  const was = CONFIG.debug["pentaryn-ties"];
  CONFIG.debug["pentaryn-ties"] = true;
  const lines = [];
  const spy = mock.method(console, "debug", (...args) => lines.push(args));
  const boom = () => {
    throw new Error("zz flags unreadable");
  };
  const flag = mock.method(actor, "getFlag", boom);
  const items = mock.method(actor.items, "find", boom); // what attributeIdsOf reads first
  try {
    return [fn(actor), lines];
  } finally {
    items.mock.restore();
    flag.mock.restore();
    spy.mock.restore();
    CONFIG.debug["pentaryn-ties"] = was;
  }
}

const traced = (lines, op) =>
  lines.some(([msg, err]) => msg === `pentaryn-ties | ${op}` && err?.message === "zz flags unreadable");

test("ties-ui-rob-6 review carriers(): an unreadable actor is skipped and traced", async () => {
  const { AttributeReview } = await import("../review-ui.mjs");
  const self = {};
  const [map, lines] = withBrokenFlags(() => AttributeReview.prototype.carriers.call(self));
  assert.ok(map instanceof Map, "still returns the carrier map");
  assert.ok(![...map.values()].flat().includes("ZZ Rob6 Carrier"), "the broken actor carries nothing");
  assert.ok(traced(lines, "review: carrier ids unreadable"), `traced: ${JSON.stringify(lines.map(l => l[0]))}`);
});

test("ties-ui-rob-6 personalCluesHTML: unreadable carrier ids and lore are traced, fallbacks kept", async () => {
  const { personalCluesHTML } = await import("../attributes-ui.mjs");
  const entry = { id: "zz-rob6-personal", category: "personal", name: "ZZ" };

  const [none, scanLines] = withBrokenFlags(() => personalCluesHTML(entry));
  assert.equal(none, "", "the carrier scan falls back to false (no carriers)");
  assert.ok(traced(scanLines, "attributes: carrier ids unreadable"), `scan traced: ${JSON.stringify(scanLines.map(l => l[0]))}`);

  const [html, loreLines] = withBrokenFlags(actor => personalCluesHTML(entry, () => [actor]));
  assert.ok(html.includes("ZZ Rob6 Carrier"), "the carrier row still renders with no lore");
  assert.ok(traced(loreLines, "attributes: carrier lore unreadable"), `lore traced: ${JSON.stringify(loreLines.map(l => l[0]))}`);
});

test("ties-ui-rob-6 overlay leash and popups toScreen go through log.swallow with the same fallbacks", () => {
  const overlay = src("overlay.mjs");
  assert.match(
    overlay,
    /const from = log\.swallow\("overlay: pinned card off-stage", \(\) => canvas\.stage\.toLocal\(\{ x: card\.screen\.x, y: card\.screen\.y \}\), null\);\s*if \(!from\) continue;/,
    "overlay pinned leash uses log.swallow and still skips the card"
  );
  const popups = src("popups.mjs");
  assert.match(
    popups,
    /function toScreen\(x, y\) \{\s*return log\.swallow\(\s*"popups: canvas point off-stage",[\s\S]*?\{ x: 0, y: 0 \}\s*\);\s*\}/,
    "popups toScreen uses log.swallow with the {x:0,y:0} fallback"
  );
  for (const [f, s] of [["overlay.mjs", overlay], ["popups.mjs", popups], ["review-ui.mjs", src("review-ui.mjs")], ["attributes-ui.mjs", src("attributes-ui.mjs")]]) {
    assert.ok(!/catch \{\s*(continue;|return false;|rows = \[\];|return \{ x: 0, y: 0 \};)\s*\}/.test(s), `${f}: no bare silent catch left`);
  }
});
