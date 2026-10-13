/**
 * Final code review (ties-ui-EXT-8, +M13): four skill dropdowns / labels disagreed.
 *   - lore-ui.mjs sorted by label, kept an unknown skill as "<key> (not in this world)", never localized
 *   - review-ui.mjs kept config order and an unknown key, but showed the bare key and never localized
 *   - attributes-ui.mjs (identifyBlock) localized, but silently DROPPED a skill this world lacks — the
 *     select fell to the first option, and the next save retargeted the identify check
 *   - preview-app.mjs / review-ui.mjs each carried their own unlocalized `skillLabel`
 * Ruling [declared]: one `skillOptionsHTML(selected)` and `skillLabelOf(key)` in core/html.mjs —
 * CONFIG.DND5E.skills in config order with localized labels, and a selected key not in CONFIG kept as
 * its own first option. All four sites use them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./fixtures/stubs.mjs";
import * as html from "../core/html.mjs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const SITES = ["attributes-ui.mjs", "review-ui.mjs", "lore-ui.mjs", "preview-app.mjs"];

/** dnd5e's shape: labels are lang keys the client localizes. */
const SKILLS = {
  rel: { label: "ZZ.Skill.Religion" },
  arc: { label: "ZZ.Skill.Arcana" },
  his: { label: "ZZ.Skill.History" }
};
const LOCAL = { "ZZ.Skill.Religion": "Religion", "ZZ.Skill.Arcana": "Arcana", "ZZ.Skill.History": "History" };

function withWorld(fn) {
  const cfg = globalThis.CONFIG.DND5E.skills;
  const loc = globalThis.game.i18n.localize;
  globalThis.CONFIG.DND5E.skills = SKILLS;
  globalThis.game.i18n.localize = k => LOCAL[k] ?? loc(k);
  try {
    return fn();
  } finally {
    globalThis.CONFIG.DND5E.skills = cfg;
    globalThis.game.i18n.localize = loc;
  }
}
const options = s => [...s.matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)].map(m => [m[1], !!m[2], m[3]]);

test("ties-ui-EXT-8 core/html.mjs exports skillOptionsHTML and skillLabelOf", () => {
  assert.equal(typeof html.skillOptionsHTML, "function");
  assert.equal(typeof html.skillLabelOf, "function");
});

test("ties-ui-EXT-8 skillOptionsHTML: config order, localized labels, the selected key marked", () => {
  const out = withWorld(() => html.skillOptionsHTML("arc"));
  assert.deepEqual(options(out), [
    ["rel", false, "Religion"],
    ["arc", true, "Arcana"],
    ["his", false, "History"]
  ]);
});

test("ties-ui-EXT-8 skillOptionsHTML: a skill this world lacks stays selected as its own first option", () => {
  const out = withWorld(() => html.skillOptionsHTML("hmb"));
  const opts = options(out);
  assert.equal(opts.length, 4);
  assert.deepEqual(opts[0].slice(0, 2), ["hmb", true]);
  assert.match(opts[0][2], /hmb/);
  assert.ok(opts.slice(1).every(o => !o[1]), "nothing else selected");
});

test("ties-ui-EXT-8 skillLabelOf: localized label, or the bare key when the world lacks it", () => {
  withWorld(() => {
    assert.equal(html.skillLabelOf("his"), "History");
    assert.equal(html.skillLabelOf("hmb"), "hmb");
  });
});

test("ties-ui-EXT-8 all four sites use the shared helpers, none reads CONFIG.DND5E.skills itself", () => {
  for (const f of SITES) {
    const s = src(f);
    assert.ok(!/CONFIG\.DND5E\??\.skills/.test(s), `${f} reads CONFIG.DND5E.skills itself`);
    assert.ok(/import\s*\{[^}]*\bskill(OptionsHTML|LabelOf)\b[^}]*\}\s*from\s*"\.\/core\/html\.mjs"/.test(s), `${f} imports the helpers`);
  }
  assert.ok(src("attributes-ui.mjs").includes("skillOptionsHTML(row.skill)"), "identifyBlock keeps the row's skill");
  assert.ok(src("lore-ui.mjs").includes("skillOptionsHTML(row.skill)"), "lore row select");
  assert.ok(/skillOptionsHTML\(value\)/.test(src("review-ui.mjs")), "review select");
});
