// Coverage gap: an engine whose CSS.supports throws on the image-set() probe gets the plain url()
// values, and the probe is not retried. Its own process: useImageSet() caches its answer.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { cursorWorld, flush } from "./fixtures/board.mjs";
import { cursorValues } from "../cursors-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await cursorWorld();
let probes = 0;
globalThis.CSS = { supports: () => { probes++; throw new Error("no cursor support"); } };
await import("../cursors.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
await flush();

test("a throwing CSS.supports → plain url() values, probed once", () => {
  F.setTool("tokens", "target");
  assert.equal(game.pentaryn.cursors.refresh(), "target");
  F.setTool("notes", "journal");
  assert.equal(game.pentaryn.cursors.refresh(), "note");
  assert.deepEqual(F.el.props(), cursorValues("note", "/modules/pentaryn-cursors", false));
  assert.equal(probes, 1);
});
