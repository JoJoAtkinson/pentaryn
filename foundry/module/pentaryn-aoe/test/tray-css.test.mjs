// [declared] tray-overflow (play test AO-1, 2026-10-12): the GM tray's three buttons (Re-roll NPC
// saves, Ping, Apply) were flex: 1 with a fixed 24 px height, so in the default-width chat sidebar a
// label broke onto a second line and spilled out of its button. The row now wraps whole buttons
// onto another line instead, and a button grows with its label (min-height, no fixed height).
// Pinned on aoe.css's own .pentaryn-aoe-tray rules; the visual check is live (CHANGELOG, Unreleased).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles/aoe.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = sel => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `aoe.css has a rule for ${sel}`);
  return Object.fromEntries(m[1].split(";").map(d => d.split(":").map(s => s.trim())).filter(([k]) => k));
};

test("tray-overflow: the button row wraps whole buttons instead of squeezing them", () => {
  const row = rule(".pentaryn-aoe-tray .pa-buttons");
  assert.equal(row.display, "flex");
  assert.equal(row["flex-wrap"], "wrap");
});

test("tray-overflow: a tray button keeps its label on one line and has no fixed height", () => {
  const btn = rule(".pentaryn-aoe-tray .pa-buttons button");
  assert.ok(btn.height === undefined || btn.height === "auto", "a fixed height lets a wrapped label spill out of the button");
  assert.equal(btn["min-height"], "24px");
  assert.equal(btn["white-space"], "nowrap");
  assert.equal(btn.width, "auto");
  assert.match(btn.flex ?? "", /^1 1 auto$/, "buttons grow to fill the row from their label width");
});

test("tray-overflow: the fix stays on this module's own tray (no other package's DOM)", () => {
  const heads = css.match(/[^{}]+(?=\{[^{}]*\})/g).map(s => s.trim()).filter(h => /pa-buttons/.test(h));
  for (const h of heads) assert.ok(h.startsWith(".pentaryn-aoe-tray "), h);
});
