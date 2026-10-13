// [declared] R7: on the normal ready path a publishNamespace throw (here: a frozen game.pentaryn)
// is logged 'pentaryn-aoe | publish' and ready carries on — the Argon guard, the settings
// migration and the startup work (readyAreas) still run. The hot path keeps throwing (glue.test W2-K1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, lines, MODULE } from "./fixtures/world.mjs";

const argon = { bind(token) { return `bound:${token?.id ?? ""}`; } };
const { F } = await boot({
  argon,
  settings: { [`${MODULE}.npcSaveRollMode`]: "gmroll" },
  beforeEntry: (F, W) => {
    const s = W.scene({ id: "ScenePublish0001", name: "Publish" });
    W.token(s, { id: "orphanPublish001", name: "Orphan", flags: { [MODULE]: { handle: true, region: "gonePublish00001" }, dnd5e: { lockSize: true } } });
    F.canvas.scene = s;
    F.game.pentaryn = Object.freeze({});
  },
  entry: true,
});
const startup = lines();

test("[declared] R7 a publish throw at ready is logged 'pentaryn-aoe | publish' and never reaches Foundry", () => {
  assert.deepEqual(F.hookErrors, []);
  assert.ok(startup.includes(`error: ${MODULE} | publish`), startup.join("\n"));
  assert.equal(game.pentaryn.aoe, undefined, "nothing was published");
});

test("[declared] R7 the rest of ready still runs: Argon guard, migration, startup sweep", () => {
  assert.ok(F.ui.ARGON.bind._aoeGuard, "the Argon guard was installed");
  assert.equal(game.settings.get(MODULE, "npcSaveRollMode"), "gm", "the settings migration ran");
  assert.deepEqual(F.calls.filter(c => c.op === "deleteEmbedded").map(c => c.ids), [["orphanPublish001"]], "readyAreas swept the orphan handle");
  assert.equal(F.listeners("canvasReady") > 0, true, "the canvasReady sweep is wired");
});
