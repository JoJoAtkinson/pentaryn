// Lifecycle glue on the active GM's client (guide S1): what `init` and `ready` do, pinned by their
// EFFECTS so that folding today's four init and five ready listeners into one each (S5) keeps them:
// - init: the eleven settings, in registration order, with their option objects (golden/settings.json),
//   and the Battle Medic relay query;
// - ready: the four patches (Rituals `_renderInner`, SummonActivity `_prepareUsageConfig` and
//   `getPlacement`, `TextEditor.enrichHTML`), each wrapping once; then, after a timer tick, the
//   legacy API on game.pentaryn.riders (golden/surface-legacy.json; S6 may only add members).
// The publish moment itself (one tick after ready today, synchronous at ready after S6) and the
// frozen-root shape are in publish.test.mjs.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON, readJSON } from "./kit/harness.mjs";
import { ButtonPanelButton, LANG, MODULE, SummonActivity, settingRows, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
const original = {
  renderInner: ButtonPanelButton.prototype._renderInner,
  prepare: SummonActivity.prototype._prepareUsageConfig,
  placement: SummonActivity.prototype.getPlacement,
  enrich: W.TE.enrichHTML,
};
await import("../riders.mjs");

test("foundry.utils is Foundry's own common/ code", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("init registers the eleven settings in order, option objects as golden/settings.json", () => {
  F.fire("init");
  const ids = F.calls.filter(c => c.op === "settings.register").map(c => c.id.slice(MODULE.length + 1));
  assert.deepEqual(ids, ["rituals", "longCasts", "concentrationSummons", "concentrationAutoBreak", "castDefaults", "arcaneRecovery", "enabled", "hdControls", "projectiles", "spellView", "projectileChatTab"]);
  pinJSON("settings", settingRows(F), import.meta.url);
  for (const row of settingRows(F)) {
    assert.equal(row.name, `PENTARYN_RIDERS.settings.${row.key}.name`);
    assert.equal(row.hint, `PENTARYN_RIDERS.settings.${row.key}.hint`);
    assert.ok(F.game.i18n.has(row.name) && F.game.i18n.has(row.hint), row.key);
  }
  assert.deepEqual(Object.keys(LANG.PENTARYN_RIDERS.settings).sort(), ids.slice().sort());
});

test("init registers the Battle Medic relay as CONFIG.queries['pentaryn-riders.battleMedic']", () => {
  assert.deepEqual(Object.keys(F.CONFIG.queries), [`${MODULE}.battleMedic`]);
  assert.equal(typeof F.CONFIG.queries[`${MODULE}.battleMedic`], "function");
});

test("every setting reads its default (true) once registered", () => {
  for (const key of ["rituals", "longCasts", "concentrationSummons", "concentrationAutoBreak", "castDefaults", "arcaneRecovery", "enabled", "hdControls", "projectiles", "spellView"]) {
    assert.equal(F.game.settings.get(MODULE, key), true, key);
  }
});

test("hdControls onChange re-renders every rendered character sheet, nothing else", async () => {
  const seen = [];
  const app = (type, rendered, name) => ({ document: { type }, rendered, render: () => seen.push(name) });
  F.foundry.applications.instances.set("a", app("character", true, "pc-open"));
  F.foundry.applications.instances.set("b", app("character", false, "pc-closed"));
  F.foundry.applications.instances.set("c", app("npc", true, "npc-open"));
  F.foundry.applications.instances.set("d", { rendered: true, render: () => seen.push("no-document") });
  await F.game.settings.set(MODULE, "hdControls", false);
  assert.deepEqual(seen, ["pc-open"]);
  await F.game.settings.set(MODULE, "hdControls", true);
  F.foundry.applications.instances.clear();
});

test("ready wraps the four patch targets, silently", () => {
  F.fire("ready");
  assert.notEqual(ButtonPanelButton.prototype._renderInner, original.renderInner);
  assert.notEqual(SummonActivity.prototype._prepareUsageConfig, original.prepare);
  assert.notEqual(SummonActivity.prototype.getPlacement, original.placement);
  assert.notEqual(W.TE.enrichHTML, original.enrich);
  // adjustments.yml markers (riders-summon-place-default, riders-summon-wildcard-preview, riders-argon-tooltip-item-rolldata)
  assert.equal(W.TE.enrichHTML._prItemRollData, true);
  assert.deepEqual(W.lines, []);
});

test("each wrap calls its original exactly once per call", async () => {
  W.takeLog();
  await new ButtonPanelButton({ type: "other" })._renderInner("a");
  const s = new SummonActivity({ canSummon: false });
  s._prepareUsageConfig({ create: { summons: true } });
  await s.getPlacement({ texture: { src: "t/plain.webp" } }, null, {});
  W.TE.enrichHTML("x", {});
  assert.deepEqual(W.takeLog().map(l => l.op), ["argon._renderInner", "summon._prepareUsageConfig", "summon.getPlacement", "enrichHTML"]);
});

test("after ready and one timer tick: game.pentaryn.riders carries the legacy surface (golden/surface-legacy.json)", () => {
  mock.timers.tick(0);
  const api = F.game.pentaryn.riders;
  assert.ok(api);
  const surface = Object.fromEntries(Object.keys(golden()).map(k => [k, typeof api[k]]));
  assert.deepEqual(surface, golden());
  // the members as they are today: rules is the frozen RULES table, core the riders-core exports
  assert.ok(Object.isFrozen(api.rules));
  assert.deepEqual(api.rules.map(r => r.key), ["elemental-adept", "elemental-affinity", "potent-spellcasting-druid", "potent-spellcasting-cleric", "healer"]);
  for (const name of CORE_EXPORTS) assert.ok(name in api.core, `core.${name}`);
  assert.equal(api.core.MOD, MODULE);
});

const CORE_EXPORTS = [
  "ADEPT_TYPES", "AFFINITY_TYPES", "MOD", "RULES", "battleMedicFormula", "bonusTerms", "carriedAbilities", "clampHeal",
  "formatTerms", "matchRule", "normalizeName", "noteParts", "parseFormula", "pickRestore", "pickSpend", "planDice",
  "planRiders", "resolveTypes", "riderFlag", "ruleByKey", "termTypes", "transformFormula", "usedFromMessages", "withModifier",
];

/** The legacy surface as recorded at the checkpoint. The live API must be a superset (S6 adds members). */
function golden() {
  if (process.env.GOLDEN_UPDATE === "1") {
    const api = F.game.pentaryn.riders;
    pinJSON("surface-legacy", Object.fromEntries(Object.keys(api).map(k => [k, typeof api[k]])), import.meta.url);
  }
  return readJSON(new URL("./golden/surface-legacy.json", import.meta.url));
}
