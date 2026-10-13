/**
 * Final code review (ties-ui-EXT-10): the Inspect gesture was re-implemented at every door — the HUD
 * eye (token-hud.mjs) and the double-click menu's "Take a closer look" (look-menu.mjs) each resolved
 * the subject with their own `token.actor ?? game.actors.get(token.document.actorId)` and each wrote
 * their own "open the Look window, then inspect" pair (the HUD's with an isGM guard the window already
 * makes, the menu's without).
 * Ruling [declared]: one `subjectOfToken(token)` in ties-adapter.mjs and one `examine(who, subject)` —
 * openLook first, then inspect — which both doors call. `examine` lives in look-app.mjs, beside the
 * window it opens: study.mjs (domain) and ties-adapter.mjs cannot import the Look window without an
 * import cycle and an upward edge (C16), and look-app.mjs already imports study.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootWorld } from "./fixtures/world.mjs";

const ROOT = new URL("..", import.meta.url);
const src = f => readFileSync(new URL(f, ROOT), "utf8");

const NPC = "zzExt10Npc000001";
await bootWorld({
  actors: [{ id: NPC, name: "ZZ Ext10 NPC" }],
  tokens: [{ id: "zzExt10TokNpc001", actorId: NPC, x: 0, y: 0 }],
});
const adapter = await import("../ties-adapter.mjs");
const look = await import("../look-app.mjs");

test("ties-ui-EXT-10 ties-adapter exports subjectOfToken; look-app exports examine", () => {
  assert.equal(typeof adapter.subjectOfToken, "function");
  assert.equal(typeof look.examine, "function");
});

test("ties-ui-EXT-10 subjectOfToken: the token's actor, else the world actor by actorId, else null", () => {
  const synthetic = { id: "zzSynthetic00001" };
  assert.equal(adapter.subjectOfToken({ actor: synthetic, document: { actorId: NPC } }), synthetic);
  assert.equal(adapter.subjectOfToken({ actor: null, document: { actorId: NPC } }), game.actors.get(NPC));
  assert.equal(adapter.subjectOfToken({ actor: null, document: { actorId: "zzNobody00000001" } }) ?? null, null);
  assert.equal(adapter.subjectOfToken(null), null);
});

test("ties-ui-EXT-10 examine opens the Look window first, then inspects", () => {
  const body = src("look-app.mjs").match(/export (?:async function examine|const examine)[\s\S]*?\n\}/)?.[0] ?? "";
  const o = body.indexOf("openLook(who, subject)");
  const i = body.indexOf("inspect(who, subject)");
  assert.ok(o > 0 && i > o, "openLook before inspect in examine");
});

test("ties-ui-EXT-10 the HUD eye and the look menu call the shared pair, not their own copies", () => {
  for (const f of ["token-hud.mjs", "look-menu.mjs"]) {
    const s = src(f);
    assert.doesNotMatch(s, /game\.actors\.get\(token\.document\.actorId\)/, `${f} resolves the subject itself`);
    assert.doesNotMatch(s, /\binspect\(who, subject\)/, `${f} runs its own inspect`);
    assert.doesNotMatch(s, /from "\.\/study\.mjs"/, `${f} no longer reaches into the study conduit`);
    assert.match(s, /\bsubjectOfToken\(token\)/, `${f} uses subjectOfToken`);
    assert.match(s, /\bexamine\(who, subject\)/, `${f} uses examine`);
  }
});
