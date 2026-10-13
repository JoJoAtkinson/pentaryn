/**
 * M17 (final review 2026-10-12, prompts-adapters): the dialog's side panel escaped with a private
 * `esc` that left `'` as-is, while tip-ui.mjs used `foundry.utils.escapeHTML`, which escapes it.
 * The panel now uses the native helper too, so a prompt with an apostrophe reads `&#x27;` in the
 * panel's HTML exactly as it does in the tip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";

const flush = () => new Promise(r => setImmediate(r));
const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const { PromptDialog } = await import("../dialog.mjs");

test("M17: the side panel escapes an apostrophe with foundry.utils.escapeHTML, as the tip does", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActorsmall", x: 1100, y: 400, flags: { [MODULE]: { prompt: "the ogre's <lair>" } } }], { pentarynPrompts: { t: "m17" } });
  const app = await PromptDialog.open(F.s1.tokens.get("m2"));
  t.mock.timers.tick(16);
  await flush(); await flush();
  const html = app.element.querySelector("[data-panel]").innerHTML;
  assert.ok(html.includes(foundry.utils.escapeHTML("the ogre's <lair>")), "M17: the row text is escaped by escapeHTML");
  assert.ok(html.includes("the ogre&#x27;s &lt;lair&gt;"), "M17: the apostrophe is escaped");
  await app.close();
});
