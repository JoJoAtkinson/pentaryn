/**
 * Characterisation (prompts checkpoint, wave 1). Frozen once committed.
 * - prompts-lookup-28: stripHtml's own contract, pinned with its measured outputs (lookup's
 *   toPlainText pins the same seven inputs with different answers; neither is "wrong").
 * - prompts-lookup-11: the patch keys checkPatch accepts today, and its refusal of anything else.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripHtml } from "../geometry-core.mjs";

test("prompts-lookup-28: stripHtml over the shared seven-input table", () => {
  const inputs = ["<p>a</p><p>b</p>", "@UUID[Compendium.x]{Cover}", "&amp;Reference[prone]", "[[/r 2d6]]",
    "A &mdash; B &#39;c&#39;", "<script>x</script>y", "@Embed[Compendium.p.RollTable.t rollable]{T}"];
  assert.deepEqual(inputs.map(stripHtml), ["a\nb", "Cover", "&Reference[prone]", "2d6", "A &mdash; B 'c'", "xy", ""]);
});

test("prompts-lookup-11: checkPatch's known keys, and BAD_SPEC naming them for anything else", async () => {
  const { checkPatch } = await import("../actor-patch-adapter.mjs");
  const known = ["ac", "addItems", "biography", "cr", "creatureType", "disposition", "hp", "img", "itemUpdates",
    "languages", "name", "recharge", "removeItems", "set", "size", "speed", "traits"];
  const err = await checkPatch({ bogus: 1 }).then(() => null, e => e);
  assert.equal(err?.code, "BAD_SPEC");
  assert.match(err.message, /known: /);
  const listed = err.message.split("known: ")[1].replace(/\)$/, "").split(", ").sort();
  assert.deepEqual(listed, known);
  assert.equal(err.message, "BAD_SPEC: patch: unknown key(s) bogus (known: name, size, img, biography, hp, ac, cr, speed, disposition, removeItems, addItems, traits, recharge, itemUpdates, set, creatureType, languages)");
  assert.deepEqual(await checkPatch(null), { notes: [], defaults: [] });
  await assert.rejects(checkPatch("x"), { code: "BAD_SPEC", message: "BAD_SPEC: patch must be an object" });
});
