/**
 * The adapters the guide's step 6 split out of light.mjs: argon.mjs (the only ui.ARGON reader) and
 * light-adapter.mjs (Foundry documents → what the Light feature decides on). Added at step 6.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry, makeScene, makeToken } from "./kit/foundry-stub.mjs";

const F = await installFoundry({ modules: ["pentaryn-senses"] });
const { collapseArgonPanels } = await import("../argon.mjs");
const world = await import("../light-adapter.mjs");

test("collapseArgonPanels: calls Argon once; absent Argon is a no-op; a throw warns with the light prefix", t => {
  let n = 0;
  F.ui.ARGON = { collapseAllPanels: () => n++ };
  collapseArgonPanels();
  assert.equal(n, 1);
  delete F.ui.ARGON;
  collapseArgonPanels();
  const warned = [];
  t.mock.method(console, "warn", (...a) => warned.push(a));
  F.ui.ARGON = { collapseAllPanels() { throw new Error("argon"); } };
  collapseArgonPanels();
  delete F.ui.ARGON;
  assert.deepEqual(warned.map(([m, e]) => [m, e.message]), [["pentaryn-senses | light collapse HUD panels", "argon"]]);
});

test("findToken: the hinted scene first, then every scene; null when nowhere", () => {
  const a = makeScene({ id: "scnA000000000001", tokens: [makeToken({ id: "tokX000000000001" })] });
  const b = makeScene({ id: "scnB000000000001", tokens: [makeToken({ id: "tokY000000000001" })] });
  F.game.scenes.set(a.id, a);
  F.game.scenes.set(b.id, b);
  assert.equal(world.findToken("tokY000000000001", "scnA000000000001")?.id, "tokY000000000001");
  assert.equal(world.findToken("tokX000000000001", "scnA000000000001")?.parent, a);
  assert.equal(world.findToken("tokZ000000000001", null), null);
});
