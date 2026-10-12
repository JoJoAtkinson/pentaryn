/**
 * D6 [declared]: one gather description length (GATHER_CHARS = 400) and a cut mark that says where
 * the full text is: `… (cut, full text: get-character <id>)`, the actor's id when the built
 * thing has one, else its document's id.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GATHER_CHARS, builtDescription, buildView, ownTextUuid, renderGather } from "../geometry-core.mjs";
import * as F from "./fixtures.mjs";

test("one default: 400", () => {
  assert.equal(GATHER_CHARS, 400);
});

test("builtDescription: uncut text is unchanged; a sentence cut and a word cut both carry the suffix", () => {
  assert.equal(builtDescription("Short. Whole.", 400, "a1"), "Short. Whole.");
  assert.equal(builtDescription("<a>\nb", 100, "a1"), "<a> / b");
  assert.equal(builtDescription("One two. Three four five six. Seven eight nine ten eleven.", 40, "a1"),
    "One two. Three four five six. … (cut, full text: get-character a1)");
  assert.equal(builtDescription("alpha beta gamma delta epsilon zeta eta theta", 20, "a1"),
    "alpha beta gamma … (cut, full text: get-character a1)");
});

test("renderGather names the actor id when the built token has one, else the document id", () => {
  const long = "First sentence here. ".repeat(40).trim();
  const withActor = F.built("ogre", 4, 2, { name: "Ogre", description: long });
  withActor.actorId = "zzActorOgre00001";
  const noActor = F.built("note", 8, 2, { name: "Board", kind: "note", docName: "Note", description: long });
  const items = [F.prompt("p", "mid", 2, 2, "a cave"), withActor, noActor];
  const text = renderGather(buildView([F.sceneOf("c", "Cave", items, [])]).view);
  const lines = text.split("\n").filter(l => l.startsWith("Description: "));
  assert.equal(lines.length, 2);
  assert.ok(lines.some(l => l.endsWith("… (cut, full text: get-character zzActorOgre00001)")), lines.join("\n"));
  assert.ok(lines.some(l => l.endsWith("… (cut, full text: get-character docnote)")), lines.join("\n"));
  assert.ok(lines.every(l => l.length <= "Description: ".length + GATHER_CHARS + 60));
});

/* ── a token's own (delta) text: get-character <base id> would print the base actor's ──────── */

const TOKEN_UUID = "Scene.zzSceneCave00001.Token.zzTokBandit00001";

test("ownTextUuid: an unlinked token whose text differs from its base actor's names the token; else null", () => {
  assert.equal(ownTextUuid({ actorLink: false, description: "Mine.", baseDescription: "Base.", uuid: TOKEN_UUID }), TOKEN_UUID);
  assert.equal(ownTextUuid({ actorLink: false, description: "Same.", baseDescription: "Same.", uuid: TOKEN_UUID }), null);
  assert.equal(ownTextUuid({ actorLink: true, description: "Mine.", baseDescription: "Base.", uuid: TOKEN_UUID }), null);
  assert.equal(ownTextUuid({ actorLink: false, description: "", baseDescription: "Base.", uuid: TOKEN_UUID }), null);
  assert.equal(ownTextUuid({ actorLink: false, description: "Mine.", baseDescription: "Base.", uuid: null }), null);
});

test("builtDescription: a token's own text points at the token, not at get-character <base id>", () => {
  assert.equal(builtDescription("alpha beta gamma delta epsilon zeta eta theta", 20, "a1", { tokenUuid: TOKEN_UUID }),
    `alpha beta gamma … (cut, this token's own text: eval-js fromUuidSync("${TOKEN_UUID}").actor.system.details.biography.value)`);
  assert.equal(builtDescription("Short.", 400, "a1", { tokenUuid: TOKEN_UUID }), "Short.");
});

test("renderGather: a cut token's own biography points at the token; the base actor's tokens still at get-character", () => {
  const long = "First sentence here. ".repeat(40).trim();
  const own = "Own sentence here. ".repeat(40).trim();
  const base = F.built("bandit", 4, 2, { name: "ZZ Bandit", description: long });
  base.actorId = "lRwesBXAGYVcKNwA";
  const changed = F.built("bandit2", 6, 2, { name: "ZZ Bandit", description: own });
  changed.actorId = "lRwesBXAGYVcKNwA";
  changed.ownTextUuid = TOKEN_UUID;
  const items = [F.prompt("p", "mid", 2, 2, "bandits"), base, changed];
  const { view } = buildView([F.sceneOf("c", "Cave", items, [])]);
  const lines = renderGather(view, { chars: 60 }).split("\n").filter(l => l.startsWith("Description: "));
  assert.equal(lines.length, 2);
  assert.ok(lines.some(l => l.startsWith("Description: First") && l.endsWith("(cut, full text: get-character lRwesBXAGYVcKNwA)")), lines.join("\n"));
  assert.ok(lines.some(l => l.startsWith("Description: Own") && l.endsWith(`fromUuidSync("${TOKEN_UUID}").actor.system.details.biography.value)`)), lines.join("\n"));
});
