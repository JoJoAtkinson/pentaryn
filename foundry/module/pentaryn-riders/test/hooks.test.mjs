// The hook manifest (guide S1, combat-riders-25/-31): what riders registers at import, in order,
// pinned against golden/hooks.json. Today the order is module evaluation order — rituals →
// concentration → argon-tidy → cast-flow → the riders.mjs body — and decides who runs first on the
// shared hooks (dnd5e.preUseActivity ×4, dnd5e.renderChatMessage ×3, dnd5e.postUseActivity ×2).
// The refactor may only change how lifecycle listeners are grouped (one init, one ready, guide §2.2):
// the non-lifecycle order stays exactly as it is.
//
// Also here, because it needs a client before `init`: the unregistered-setting behaviour of each
// reader idiom (guide S1 last bullet, S4).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { IDS, MODULE, roll, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
const atLoad = F.hooks.slice();

const LIFECYCLE = new Set(["init", "setup", "ready"]);

// Lifecycle listeners are left out on purpose: the refactor folds today's four `init` and five
// `ready` listeners into one each (guide §2.2), so they are pinned by their effects in glue.test.
test("registration manifest (non-lifecycle) equals golden/hooks.json", () => {
  pinJSON("hooks", atLoad.filter(h => !LIFECYCLE.has(h.name)), import.meta.url);
});

test("the 26 non-lifecycle registrations, in order (guide S1 list)", () => {
  assert.deepEqual(atLoad.filter(h => !LIFECYCLE.has(h.name)).map(h => h.name), [
    "dnd5e.preUseActivity",                 // rituals: slot unticked
    "dnd5e.summonToken",                    // concentration: stamp
    "deleteActiveEffect",                   // concentration: cleanup
    "dnd5e.renderChatMessage",              // concentration: break label
    "createChatMessage",                    // concentration: auto-break
    "dnd5e.renderChatMessage",              // concentration: DC/result line
    "updateItem",                           // argon-tidy: shared-uses badge
    "dnd5e.preCreateMeasuredTemplate",      // argon-tidy: collapse
    "dnd5e.preSummon",                      // argon-tidy: collapse
    "renderItemButtonArgonComponent",       // argon-tidy: button wraps
    "dnd5e.preSummon",                      // cast-flow: sidebar keep
    "changeSidebarTab",                     // cast-flow
    "dnd5e.postSummon",                     // cast-flow
    "dnd5e.preUseActivity",                 // cast-flow: restore-slot default
    "dnd5e.preUseActivity",                 // cast-flow: stale target drop
    "renderActivityUsageDialog",            // cast-flow: first click
    "dnd5e.preUseActivity",                 // cast-flow: one usage dialog per activity (tNdOEx)
    "dnd5e.preActivityConsumption",         // cast-flow: stale concentration replacement (tNdOEx)
    "dnd5e.postUseActivity",                // cast-flow: Arcane Recovery
    "dnd5e.postDamageRollConfiguration",    // riders: damage/healing riders
    "dnd5e.renderChatMessage",              // riders: card note
    "dnd5e.preCalculateDamage",             // riders: tray preset
    "dnd5e.preUseActivity",                 // riders: Battle Medic veto
    "dnd5e.postUseActivity",                // riders: Battle Medic
    "renderCharacterActorSheet",            // riders: Hit Dice −/+
    "dnd5e.renderChatMessage",              // projectiles: one button per ray / dart
    "createChatMessage",                    // projectiles: card refresh
    "deleteChatMessage",                    // projectiles: card refresh
    "updateActiveEffect",                   // effect-choices: pick-one passive effects (tNdOEx)
  ]);
  assert.ok(atLoad.filter(h => !LIFECYCLE.has(h.name)).every(h => h.kind === "on"));
});

test("lifecycle: only once-listeners on init and ready, none on setup", () => {
  const life = atLoad.filter(h => LIFECYCLE.has(h.name));
  assert.ok(life.length > 0);
  assert.ok(life.every(h => h.kind === "once" && h.name !== "setup"));
  assert.deepEqual([...new Set(life.map(h => h.name))].sort(), ["init", "ready"]);
});

test("import alone registers no setting, writes nothing, publishes nothing", () => {
  assert.deepEqual(F.calls, []);
  assert.deepEqual(W.log, []);
  assert.equal(F.game.pentaryn, undefined);
  assert.deepEqual(Object.keys(F.CONFIG.queries), []);
  assert.deepEqual(W.lines, []);
});

// Before init nothing is registered. The six try/catch readers (rituals, longCasts,
// concentrationSummons, concentrationAutoBreak, castDefaults, arcaneRecovery) read false; the hooks
// that read `enabled` / `hdControls` directly throw inside their own try/catch and warn.
test("before init: the try/catch readers give false, the direct readers throw into their hook's warn", async () => {
  const wiz = W.actor(IDS.wiz);
  const ritual = wiz.items.get("detectmagic00001").system.activities.contents[0];
  const usage = { consume: { spellSlot: true } };
  F.fireCall("dnd5e.preUseActivity", ritual, usage, {}, { data: { system: { targets: [{ uuid: "x" }] } } });
  assert.deepEqual(usage, { consume: { spellSlot: true } }, "rituals off: the slot stays ticked");

  const shieldMsg = { data: { system: { targets: [{ uuid: "Actor.x" }] } } };
  const shield = { actor: wiz, item: { actor: wiz }, target: { affects: { type: "self" } }, consumption: { targets: [] } };
  F.fireCall("dnd5e.preUseActivity", shield, {}, {}, shieldMsg);
  assert.equal(shieldMsg.data.system.targets.length, 1, "castDefaults off: the stale target stays");

  const notMine = { system: {}, flags: {}, name: "x", item: { name: "x", type: "feat" } };
  W.take();
  F.fireCall("dnd5e.preUseActivity", notMine, {}, {}, {});
  F.fire("dnd5e.postUseActivity", notMine);
  const sorc = W.actor(IDS.sorc);
  const fireball = sorc.items.get("fireball00000001");
  F.fire("dnd5e.postDamageRollConfiguration", [roll("8d6[fire]", { type: "fire" })], { subject: fireball.system.activities.contents[0] }, null, { data: {} });
  F.fire("dnd5e.preCalculateDamage", sorc, [], { originatingMessage: { id: "m", flags: { [MODULE]: { ignoreResistance: ["fire"] } } } });
  F.fire("renderCharacterActorSheet", { document: sorc, isEditable: true, isEditMode: false, element: W.html(`<div><div class="meter-group"><div class="label">HD</div><div class="meter hit-dice"></div></div></div>`) });
  F.fire("dnd5e.summonToken", { actor: sorc, item: fireball }, {}, {});
  F.fire("deleteActiveEffect", { parent: { documentName: "Actor" }, uuid: "Actor.a.ActiveEffect.e" }, {}, IDS.gm);
  await F.fire("createChatMessage", { type: "save", system: { type: "concentration" }, rolls: [{ total: 3, options: { target: 10 } }], getAssociatedActor: () => sorc }, {}, IDS.gm);
  await W.F.fire("dnd5e.postUseActivity", { item: wiz.items.get("arcanerec0000001") });
  mock.timers.tick(1);
  const unreg = key => `"${MODULE}.${key}" is not a registered game setting`;
  assert.deepEqual(W.take(), [
    ["warn", `${MODULE} | Battle Medic check skipped`, unreg("enabled")],
    ["warn", `${MODULE} | Battle Medic skipped`, unreg("enabled")],
    ["warn", `${MODULE} | riders skipped`, unreg("enabled")],
    ["warn", `${MODULE} | resistance preset skipped`, unreg("enabled")],
    ["warn", `${MODULE} | hit dice controls skipped`, unreg("hdControls")],
    ["warn", `${MODULE} | Battle Medic skipped`, unreg("enabled")],     // Arcane Recovery's postUse: riders' listener
  ]);
  assert.deepEqual(W.log.filter(l => l.op !== "getActiveTokens"), [], "nothing written, no dialog, no concentration ended");
  assert.deepEqual(F.calls.filter(c => c.op !== "Hooks.call"), []);
});

test("the shared hooks run their listeners in manifest order (rituals → cast-flow ×3 → Battle Medic)", () => {
  const { init: _i, ready: _r, ...counts } = F.listeners();
  assert.deepEqual(counts, {
    "dnd5e.preUseActivity": 5, "dnd5e.summonToken": 1, deleteActiveEffect: 1, "dnd5e.renderChatMessage": 4,
    createChatMessage: 2, deleteChatMessage: 1, updateItem: 1, "dnd5e.preCreateMeasuredTemplate": 1, "dnd5e.preSummon": 2,
    renderItemButtonArgonComponent: 1, changeSidebarTab: 1, "dnd5e.postSummon": 1, renderActivityUsageDialog: 1,
    "dnd5e.postUseActivity": 2, "dnd5e.postDamageRollConfiguration": 1, "dnd5e.preCalculateDamage": 1,
    renderCharacterActorSheet: 1, "dnd5e.preActivityConsumption": 1, updateActiveEffect: 1,
  });
});
