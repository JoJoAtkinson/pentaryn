// Core characterisation added at the checkpoint (guide step 1). The 73 legacy checks stay in
// core-legacy.mjs (run through LEGACY). Pure: no Foundry globals.
//
// - the step-2 oracle: today's isPile / isProp (fixtures/legacy-creatures.mjs, verbatim) over the
//   flag shapes guide step 2's isItemPile / isAoeHandle must reproduce (transform-creatures-30);
// - the composed token.light hand-off with pentaryn-senses (transform-creatures-28), plain data, no
//   senses import. KNOWN: after senses restores the prior 5/5 unflagged, nothing turns it off (the
//   orphan, C-L1: a decision, not a defect — no todo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { characterise } from "./kit/harness.mjs";
import * as legacy from "./fixtures/legacy-creatures.mjs";
import { LIGHT_FLAG, MODULE, lightUpdate, readOurLight, switchedOff } from "../creatures-core.mjs";

const FK = `flags.${MODULE}.${LIGHT_FLAG}`;

test("core loads bare and names the module", () => {
  assert.equal(MODULE, "pentaryn-creatures");
  assert.equal(LIGHT_FLAG, "light");
  for (const g of ["game", "canvas", "foundry", "Hooks", "document"]) assert.equal(globalThis[g], undefined, g);
});

test("oracle: isProp (aoe handle) — token flag `handle` or actor flag `handleActor`; no doc.token branch", () => {
  const rows = [
    [{ flags: { "pentaryn-aoe": { handle: "r1" } } }, true],
    [{ flags: {}, actor: { flags: { "pentaryn-aoe": { handleActor: true } } } }, true],
    [{ flags: {}, actor: { flags: {} } }, false],
    [{ flags: { "pentaryn-aoe": { handle: "" } } }, false],
    [{ flags: { "pentaryn-aoe": { handleActor: true } } }, false],
    [{ actor: { flags: { "pentaryn-aoe": { handle: "r1" } } } }, false],
    [{ token: { flags: { "pentaryn-aoe": { handle: "r1" } } } }, false],
    [{}, false],
  ];
  assert.deepEqual(rows.map(([t]) => legacy.isProp(t)), rows.map(([, w]) => w));
});

test("oracle: isPile (Item Piles) — data.enabled on the token or its actor", () => {
  const on = { "item-piles": { data: { enabled: true } } };
  const rows = [
    [{ flags: on }, true],
    [{ flags: {}, actor: { flags: on } }, true],
    [{ flags: { "item-piles": { data: { enabled: false } } } }, false],
    [{ flags: { "item-piles": { enabled: true } } }, false],
    [{ flags: {}, actor: null }, false],
    [{}, false],
  ];
  assert.deepEqual(rows.map(([t]) => legacy.isPile(t)), rows.map(([, w]) => w));
});

test("oracle: summarize reads isOwner from the doc for the current user, testUserPermission for another", () => {
  const seen = [];
  const t = {
    id: "t", name: "T", actorId: "", texture: { src: "a.webp" }, hidden: 1, isOwner: "self",
    actor: { id: "a", type: "npc", img: "i", hasPlayerOwner: 1, flags: { dnd5e: { originalActor: "pc" } } },
    testUserPermission: (u, l) => (seen.push([u.id, l]), "other"),
  };
  assert.deepEqual(legacy.summarize(t, { id: "me", isSelf: true }), {
    id: "t", name: "T", img: "a.webp", actorImg: "i", actorId: "a", originalActorId: "pc", actorType: "npc",
    hasPlayerOwner: false, isOwner: "self", hidden: false, isPile: false, isProp: false,
  });
  assert.equal(legacy.summarize(t, { id: "u2", isSelf: false }).isOwner, "other");
  assert.deepEqual(seen, [["u2", "OWNER"]]);
  assert.equal(legacy.summarize({ id: "x", actorId: "gone", testUserPermission: () => false }, { isSelf: false }).actorId, null, "no actor → null actorId");
});

test("KNOWN transform-creatures-28: the token.light hand-off with pentaryn-senses (golden/senses-handoff.json)", async () => {
  const on = { qualifies: true, radius: 5 };
  const off = { qualifies: false, radius: 5 };
  const tok = (bright, dim, ours) => ({ light: { bright, dim }, flags: ours === undefined ? {} : { [MODULE]: { [LIGHT_FLAG]: ours } } });

  // s1: a dark summon → we light it 5/5 and flag it
  const s1 = lightUpdate(tok(0, 0), on);
  assert.deepEqual(s1, { "light.bright": 5, "light.dim": 5, [FK]: { bright: 5, dim: 5 } });
  // s2: senses writes its item light 10/20 while our flag still says 5/5 → we let go of the flag only
  assert.deepEqual(lightUpdate(tok(10, 20, { bright: 5, dim: 5 }), on), { [FK]: null });
  // s3: senses restores the prior 5/5 (itemLightPrior) unflagged → nobody owns it
  const orphan = tok(5, 5, null);
  assert.equal(readOurLight(orphan), null);
  assert.equal(switchedOff(orphan), false);
  assert.equal(lightUpdate(orphan, on), null, "still qualifies: a lit token is 'its own light'");
  assert.equal(lightUpdate(orphan, off), null, "KNOWN: no longer qualifies, but the orphan 5/5 is never taken away");
  assert.equal(lightUpdate(tok(0, 0), { qualifies: true, radius: 0 }), null, "radius 0 on a dark token: nothing");

  await characterise("senses-handoff", (t, want) => lightUpdate(t, want), [
    [tok(0, 0), on],
    [tok(10, 20, { bright: 5, dim: 5 }), on],
    [tok(10, 20, { bright: 5, dim: 5 }), off],
    [tok(5, 5, null), on],
    [tok(5, 5, null), off],
    [tok(0, 0, null), on],
    [tok(0, 0, { bright: 5, dim: 5 }), on],
    [tok(5, 5, false), off],
  ], { file: import.meta.url });
});
