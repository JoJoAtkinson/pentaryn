/**
 * ties-ui-ACC-2 (declared): `renderPlayerView` set `this.pcKey` and cleared `this.specs` at its
 * top, filled `this.specs` card by card, then awaited `composeStudyPayload` for the kind study.
 * A switch click or `refreshSwitches` landing in that await read a half-built `specs` (indices that
 * no longer matched the switches on screen) under a roster key for markup not yet drawn.
 *
 * Ruling: build `specs` and `pcKey` into locals (factCard pushes into the array passed in) and
 * assign `this.specs` / `this.pcKey` after the last await, so anything running during the render
 * reads the previous, consistent set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const KIND = "zzKind0000000001";
const PLAYER = "zzPlayerUser0001";

await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false, character: null }],
  settings: { "pentaryn-ties.attributes": [{ id: "city", title: "Vel", category: "City", secret: true, dc: 12, skill: "his", reveal: "<p>From Vel.</p>" }] },
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", ownership: { default: 0, [PLAYER]: 3 } },
    { id: KIND, name: "ZZ Ghoul", system: { details: { type: { value: "undead" }, biography: { value: "<p>Grey hunters.</p>" } } } },
    {
      id: NPC,
      name: "ZZ Brakka",
      flags: {
        "pentaryn-ties": {
          kindOf: KIND,
          attributes: ["city"],
          lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>He owes the guild.</p>", miss: "" }],
        },
      },
    },
  ],
});
game.users.get(PLAYER).character = game.actors.get(PC);
const { InspectPreview } = await import("../preview-app.mjs");

test("ties-ui-ACC-2: specs and pcKey stay the previous set until the player view's last await", async () => {
  const pv = new InspectPreview(game.actors.get(NPC));
  const prev = [{ spec: { ns: "lore", subjectId: NPC, factId: "old" }, label: "Old" }];
  pv.specs = prev;
  pv.pcKey = "zzOldRoster";

  const pending = pv.renderPlayerView();
  // the render is now parked on composeStudyPayload (the kind study): what a click would read
  assert.equal(pv.specs, prev, "specs untouched while the render awaits");
  assert.deepEqual(pv.specs, [{ spec: { ns: "lore", subjectId: NPC, factId: "old" }, label: "Old" }], "no card pushed into the live list");
  assert.equal(pv.pcKey, "zzOldRoster", "pcKey untouched while the render awaits");

  const html = await pending;
  assert.notEqual(pv.specs, prev, "a fresh list once the render is done");
  assert.ok(pv.specs.some(x => x.spec.ns === "kind"), "the kind card is in the new list");
  assert.ok(pv.specs.some(x => x.spec.ns === "ident"), "the ident card is in the new list");
  assert.equal(pv.pcKey, pv.playerCharacters().map(pc => pc.id).join(","), "pcKey is the roster drawn");
  // every switch row on screen points at the entry of the list it was drawn with
  const facts = [...html.matchAll(/data-fact="(\d+)"/g)].map(m => Number(m[1]));
  assert.ok(facts.length > 0, "switch rows drawn");
  assert.deepEqual(facts, pv.specs.map((_, i) => i));
});
