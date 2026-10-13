/**
 * ties-ui-EXT-4 (declared): the fact groups' headings were string ladders — `if (group === "ident")
 * … "attr" … "lore" … else kind` in the Look window, four hand-picked keys in the GM's Player
 * view. A new group fell through the Look ladder and was headed "What they are", under the kind
 * study's heading.
 *
 * Ruling: one GROUP_LABEL table in facts.mjs, group → { look, preview, kindPage } with literal
 * keys (the i18n gate scans for them); look-app's groupLabel and preview-app's renderPlayerView
 * read it. A group the table does not know is headed with its own name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootWorld, LANG } from "./fixtures/world.mjs";

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

await bootWorld();
const Facts = await import("../facts.mjs");
const { LookWindow } = await import("../look-app.mjs");

const label = (group, { kindPage = false } = {}) => {
  const base = { id: "zzBase0000000001", name: "ZZ Base" };
  const kind = kindPage ? { id: "zzKind0000000001", name: "ZZ Kind" } : null;
  return LookWindow.prototype.groupLabel.call({ subject: { name: "ZZ Subject" } }, group, base, kind);
};

test("ties-ui-EXT-4: GROUP_LABEL names every group's heading per plane, as literal lang keys", () => {
  const T = Facts.GROUP_LABEL;
  assert.ok(T, "facts.mjs exports GROUP_LABEL");
  assert.deepEqual(Object.keys(T), ["ident", "attr", "lore", "kind"]);
  const s = src("facts.mjs");
  const keys = Object.values(T).flatMap(r => [r.look, r.preview, ...(r.kindPage ? [r.kindPage.look, r.kindPage.preview] : [])]);
  assert.equal(keys.length, 10);
  for (const k of keys) {
    assert.equal(typeof LANG[k], "string", `${k} in lang/en.json`);
    assert.ok(s.includes(`"${k}"`), `${k} literal in facts.mjs`);
  }
});

test("ties-ui-EXT-4: the Look window heads the known groups as before, and an unknown group with its own name", () => {
  assert.equal(label("ident"), "Who they belong to");
  assert.equal(label("attr"), "What that tells you");
  assert.equal(label("lore"), "About ZZ Subject");
  assert.equal(label("kind"), "What they are");
  assert.equal(label("kind", { kindPage: true }), "What they are — filed on the ZZ Kind page of your notebook");
  assert.equal(label("rumour"), "rumour", "a new group is labelled with its own name, not filed under the kind heading");
  assert.equal(label("constructor"), "constructor", "an inherited property is not a table row");
});

test("ties-ui-EXT-4: no group string ladder left in look-app or preview-app", () => {
  assert.ok(!/group === "(ident|attr|lore|kind)"/.test(src("look-app.mjs")), "look-app reads GROUP_LABEL");
  const p = src("preview-app.mjs");
  for (const g of ["Ident", "Attr", "Lore", "Kind", "KindPage"])
    assert.ok(!p.includes(`"PENTARYN_TIES.known.share.group${g}"`), `preview-app reads GROUP_LABEL for group${g}`);
});
