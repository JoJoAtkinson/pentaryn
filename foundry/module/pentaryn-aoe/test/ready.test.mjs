// The ready step's failure paths: a migration or startup failure is logged with the module prefix
// and never escapes into Foundry's ready hook. migrateSettings' early returns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, lines, out, MODULE, PLAYER_ID, GM_ID } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F } = await boot({
  settings: { [`${MODULE}.npcSaveRollMode`]: "blindroll" },
  beforeEntry: F => {
    F._actorCreateError = "actors locked";
    F.game.settings.set = async () => { throw new Error("settings locked"); };
  },
  entry: true,
});
await flush(8);
const S = await seams();
const startup = lines();

test("ready failures are logged 'pentaryn-aoe | settings migration' and 'pentaryn-aoe | ready'; nothing reaches Foundry", () => {
  assert.deepEqual(startup.sort(), [`error: ${MODULE} | ready`, `error: ${MODULE} | settings migration`]);
  assert.deepEqual(F.hookErrors, []);
});

test("the API is still published a tick after a failed ready", () => {
  assert.equal(typeof game.pentaryn.aoe.resolve, "function");
});

test("migrateSettings → null: not the active GM, a current value, an unreadable setting", async () => {
  F.become({ userId: PLAYER_ID });
  assert.equal(await S.settings.migrateSettings(), null);
  F.become({ userId: GM_ID });
  const get = game.settings.get;
  game.settings.get = () => "gm";
  assert.equal(await S.settings.migrateSettings(), null);
  game.settings.get = () => { throw new Error("unregistered"); };
  assert.equal(await S.settings.migrateSettings(), null);
  game.settings.get = get;
  out.length = 0;
  await advance(0);
});
