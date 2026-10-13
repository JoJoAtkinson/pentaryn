// EXT-1: one "revealed" rule for a passage — every enabled teleport behavior with at least one
// resolvable destination is revealed. The card's hint and Revealed switch, the badge and inspect()
// all read passageRevealed, so a stub behavior with nowhere to go cannot make them disagree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, P1, GM } from "./fixtures/world.mjs";
import { places } from "./fixtures/places.mjs";

const { F, S, W } = await boot();
await W.tick();

let seq = 0;
/** The passage plus an enabled, unrevealed teleport that leads nowhere (a deleted region). */
function withDeadStub() {
  const P = places(W, `R${++seq}`);
  W.behavior(P.passage, { id: `BhvStub${seq}`, revealed: false, destinations: ["Scene.Gone.Region.Gone"] });
  return P;
}

test("EXT-1 passageRevealed: a behavior with no resolvable destination does not count; a travellable unrevealed one does", () => {
  const P = withDeadStub();
  assert.equal(S.passageRevealed(P.passage), true);
  assert.equal(S.passageRevealed(P.secret), false);
  W.behavior(P.passage, { id: `BhvLive${seq}`, revealed: false, destinations: [P.stair.uuid] });
  assert.equal(S.passageRevealed(P.passage), false);
  W.behavior(P.fork, { id: `BhvOff${seq}`, disabled: true, revealed: false, destinations: [P.stair.uuid] });
  assert.equal(S.passageRevealed(P.fork), true, "a disabled behavior does not count");
});

test("EXT-1 the card, the badge and inspect agree: a dead unrevealed stub leaves the passage revealed", async () => {
  const P = withDeadStub();

  const preview = await S.PortalCard.open(P.passage);
  assert.equal(preview.element.querySelector(".window-content").innerHTML.includes("fa-eye-slash"), false, "no 'unrevealed' hint");
  await preview.close();

  const edit = await S.PortalCard.open(P.passage, { edit: true });
  assert.equal(edit.element.querySelector('.window-content [data-set="revealed"]').checked, true, "the Revealed switch is on");
  await edit.close();

  assert.equal(game.pentaryn.portals.inspect(P.passage, { as: P1 }).revealed, true);

  F.canvas.ready = true;
  F.canvas.scene = P.prison;
  F.become({ userId: P1 });
  await S.drawBadges();
  F.become({ userId: GM });
  assert.equal(S.badges.find(b => b.region === P.passage).revealed, true);
});
