/**
 * Review (senses, R3): chain.link() only chains Tokens. Its promise (api-manifest: "Token |
 * TokenDocument | Token uuid | id on the viewed scene"; "Chain a token to an anchor token on the
 * same scene") already holds for uuids; this pins it for documents too — two world Actors, or two
 * Items on one actor, share a parent but are not tokens.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, since, ID, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot();
await settle(mock);
const C = () => game.pentaryn.chain;

test("link(): non-Token documents are refused and write nothing", async () => {
  const mark = F.calls.length;
  const hero = game.actors.get(ID.hero);
  const rows = {
    actors: await C().link(game.actors.get(ID.hulk), game.actors.get(ID.stake)),
    items: await C().link(hero.items.get(ID.torch), hero.items.get(ID.lantern)),
  };
  assert.deepEqual(rows, { actors: false, items: false });
  assert.deepEqual(since(mark).filter(c => c.op === "update"), []);
});
