// The core is imported FIRST and BARE — no Foundry stub installed. If it touched a Foundry
// global at load, this file would fail before any test ran: that is the purity proof.
import * as core from "../core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
  assert.equal(core.MODULE, "pentaryn-aoe");
});

/* ── the legacy core checks (formerly test/legacy-core.mjs), ported one check → one test ──────────────── */

/** Legacy `check(name, got, want)`: JSON equality, now one node:test case each. */
function check(name, got, want) {
  test(name, () => assert.equal(JSON.stringify(got), JSON.stringify(want)));
}

const {
  centreOf, multiplierFor, isCreature, rowKind, buildRows, fillSave, applicableRows, allApplied,
  matchSave, shouldAutoDamage, newestRegion, aoeFlags, regionFromSpell, regionOfActivity, selfApplyReason,
  pendingEffects, isTemplateRegion, attachedTokenId, attachedToOther, handleVertical, placementInProgress,
  stillListing, isHandleTarget, supersedes, protectRows, unprotectRow, placementCancelled, playerStatus,
  sameSpellEffect, aimFromCaster, aimsFromCaster
} = await import("../core.mjs");

const round = p => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 });

/* ── centreOf ─────────────────────────────────────────────────────────────── */
check("circle → its centre", centreOf({ type: "circle", x: 1500, y: 1200, radius: 400 }), { x: 1500, y: 1200 });
check("rectangle, no rotation → middle", centreOf({ type: "rectangle", x: 100, y: 200, width: 400, height: 200, anchorX: 0, anchorY: 0, rotation: 0 }), { x: 300, y: 300 });
check("rectangle rotated 90° about its anchor", round(centreOf({ type: "rectangle", x: 100, y: 200, width: 400, height: 200, anchorX: 0, anchorY: 0, rotation: 90 })), { x: 0, y: 400 });
check("cone → origin (caster end)", centreOf({ type: "cone", x: 700, y: 800, radius: 600, angle: 53, rotation: 45 }), { x: 700, y: 800 });
check("line → origin", centreOf({ type: "line", x: 10, y: 20, length: 600, width: 100, rotation: 0 }), { x: 10, y: 20 });
check("polygon → vertex mean", centreOf({ type: "polygon", points: [0, 0, 200, 0, 200, 100, 0, 100] }), { x: 100, y: 50 });
check("missing shape never throws", centreOf(undefined), { x: 0, y: 0 });
check("stationary emanation (dnd5e 6) → middle of its 1×1 base", centreOf({ type: "emanation", radius: 300, base: { type: "token", x: 400, y: 600, width: 1, height: 1 } }, { gridSize: 100 }), { x: 450, y: 650 });
check("emanation of a large caster → middle of the 2×2 base", centreOf({ type: "emanation", base: { x: 400, y: 600, width: 2, height: 2 } }, { gridSize: 140 }), { x: 540, y: 740 });

/* ── multiplierFor ────────────────────────────────────────────────────────── */
check("fail → ×1", multiplierFor(false, "half"), 1);
check("success, half → ×½", multiplierFor(true, "half"), 0.5);
check("success, none → ×0", multiplierFor(true, "none"), 0);
check("success, full → ×1", multiplierFor(true, "full"), 1);
check("success, unknown onSave → half", multiplierFor(true, undefined), 0.5);
check("no result yet → null", multiplierFor(null, "half"), null);

/* ── creature filter ─────────────────────────────────────────────────────── */
const base = { actorType: "npc", hpMax: 7, hpValue: 7 };
check("goblin is a creature", isCreature(base), true);
check("PC is a creature", isCreature({ ...base, actorType: "character" }), true);
check("handle token is not", isCreature({ ...base, handle: true }), false);
check("handle actor is not", isCreature({ ...base, isHandleActor: true }), false);
check("item pile is not", isCreature({ ...base, isPile: true }), false);
check("crowd/marker (max HP 0) is not", isCreature({ ...base, hpMax: 0 }), false);
check("vehicle/group type is not", isCreature({ ...base, actorType: "vehicle" }), false);
check("no actor is not", isCreature({ actorType: null, hpMax: 0 }), false);
check("player-owned → manual", rowKind({ hasPlayerOwner: true }), "manual");
check("GM-owned → auto", rowKind({ hasPlayerOwner: false }), "auto");

/* ── buildRows ───────────────────────────────────────────────────────────── */
const toks = [
  { id: "g1", name: "Goblin 1", actorUuid: "Scene.s.Token.g1.Actor.gob", baseActorId: "gob", ...base },
  { id: "g2", name: "Goblin 2", actorUuid: "Scene.s.Token.g2.Actor.gob", baseActorId: "gob", ...base },
  { id: "cv", name: "Caven", actorUuid: "Actor.cav", baseActorId: "cav", actorType: "character", hpMax: 30, hpValue: 30, hasPlayerOwner: true },
  { id: "mr", name: "Marrith", actorUuid: "Actor.mar", baseActorId: "mar", actorType: "character", hpMax: 30, hpValue: 30, hasPlayerOwner: true },
  { id: "h", name: "Fireball (Marrith)", handle: true, actorType: "npc", hpMax: 0 },
  { id: "p", name: "Loot", isPile: true, actorType: "npc", hpMax: 1 },
  { id: "c", name: "Crowd", actorType: "npc", hpMax: 0 },
  { id: "dead", name: "Downed", actorUuid: "Actor.d", baseActorId: "d", actorType: "character", hpMax: 20, hpValue: 0, hasPlayerOwner: true },
  { id: "hid", name: "Lurker", actorUuid: "Actor.l", baseActorId: "l", ...base, hidden: true },
  { id: "g1", name: "Goblin 1 dup", ...base }
];
const rows = buildRows(toks, { casterActorId: "mar" });
check("rows: creatures only, de-duplicated", rows.map(r => r.id), ["g1", "g2", "cv", "mr", "dead", "hid"]);
check("rows: kinds", rows.map(r => r.kind), ["auto", "auto", "manual", "manual", "manual", "auto"]);
check("rows: caster, 0 HP and hidden unticked", rows.map(r => r.apply), [true, true, true, false, false, false]);
check("rows: caster flagged", rows.find(r => r.id === "mr").caster, true);
check("rows: start unresolved", rows.every(r => r.save === null && r.multiplier === null && !r.applied), true);

/* ── fillSave / apply bookkeeping ────────────────────────────────────────── */
const r1 = fillSave({ ...rows[0] }, { total: 18, success: true, messageId: "m1" }, "half");
check("fillSave: success half", [r1.save, r1.multiplier], [{ total: 18, success: true, messageId: "m1" }, 0.5]);
const r2 = fillSave({ ...rows[1], overridden: true, multiplier: 0 }, { total: 4, success: false }, "half");
check("fillSave keeps a GM override", r2.multiplier, 0);
const live = [r1, { ...rows[1], multiplier: 1 }, { ...rows[2] }, { ...rows[3], multiplier: 1 }];
check("applicable: ticked + resolved + unapplied", applicableRows(live).map(r => r.id), ["g1", "g2"]);
check("applicable: limited by ids", applicableRows(live, ["g2", "cv"]).map(r => r.id), ["g2"]);
check("applied rows are not applicable again", applicableRows([{ ...r1, applied: true }]).length, 0);
check("allApplied: false while a ticked row waits", allApplied(live), false);
check("allApplied: unticked rows don't block", allApplied([{ apply: true, applied: true }, { apply: false, applied: false }]), true);
check("allApplied: nothing ticked is not 'done'", allApplied([{ apply: false }]), false);

/* ── matchSave ───────────────────────────────────────────────────────────── */
const res = { ability: "dex", request: "req1", superseded: false, rows: buildRows(toks, { casterActorId: "mar" }) };
check("request result → row by actor uuid", matchSave(res, { requestId: "req1", actorUuid: "Actor.cav", ability: "dex" }), 2);
check("request result ignores ability mismatch", matchSave(res, { requestId: "req1", actorUuid: "Actor.cav", ability: "con" }), 2);
check("card button save → row by speaker token", matchSave(res, { ability: "dex", tokenId: "cv", created: 10 }, { createdAfter: 5 }), 2);
check("card button save → row by speaker actor id", matchSave(res, { ability: "dex", actorId: "cav", created: 10 }, { createdAfter: 5 }), 2);
check("wrong ability is not an answer", matchSave(res, { ability: "con", tokenId: "cv", created: 10 }), -1);
check("save older than the damage roll is not an answer", matchSave(res, { ability: "dex", tokenId: "cv", created: 1 }, { createdAfter: 5 }), -1);
check("auto rows are never filled from chat", matchSave(res, { ability: "dex", tokenId: "g1", created: 10 }), -1);
check("superseded resolution takes nothing", matchSave({ ...res, superseded: true }, { requestId: "req1", actorUuid: "Actor.cav" }), -1);
const filled = { ...res, rows: res.rows.map(r => (r.id === "cv" ? { ...r, save: { total: 3 } } : r)) };
check("a filled row is not overwritten", matchSave(filled, { requestId: "req1", actorUuid: "Actor.cav" }), -1);
check("synthetic token actor id does not match by base id", matchSave(res, { ability: "dex", actorId: "gob", created: 10 }), -1);

/* ── shouldAutoDamage ────────────────────────────────────────────────────── */
check("hit (≥ AC) → damage", shouldAutoDamage({ total: 15, target: 15 }), true);
check("miss (< AC) → nothing", shouldAutoDamage({ total: 14, target: 15 }), false);
check("crit beats AC → damage", shouldAutoDamage({ total: 12, target: 30, isCritical: true }), true);
check("natural 1 → nothing even with no target", shouldAutoDamage({ total: 9, isFumble: true }), false);
check("no target (AC unknown) → damage", shouldAutoDamage({ total: 3, target: undefined }), true);
check("no roll → nothing", shouldAutoDamage(null), false);

/* ── newestRegion / flags ────────────────────────────────────────────────── */
check("newest by createdTime", newestRegion([{ id: "a", _stats: { createdTime: 5 } }, { id: "b", _stats: { createdTime: 9 } }, { id: "c", _stats: { createdTime: 7 } }]).id, "b");
check("no createdTime → last", newestRegion([{ id: "a" }, { id: "b" }]).id, "b");
check("none → null", newestRegion([]), null);
check("aoeFlags tolerates no flags", aoeFlags({}), {});
check("aoeFlags reads the scope", aoeFlags({ flags: { "pentaryn-aoe": { handle: true } } }), { handle: true });


/* ── regionFromSpell (A10: Remove all templates) ─────────────────────────── */
const spell = { itemUuid: "Actor.mar.Item.fb", activityUuid: "Actor.mar.Item.fb.Activity.a1" };
// dnd5e 6 region flags: { activity, item, origin: <caster TOKEN uuid> }
const v6 = (item, activity) => ({ activity, item, origin: "Scene.s.Token.casterTok", dimensions: {}, spellLevel: 3 });
check("6.0: region of this spell's activity", regionFromSpell(v6("Actor.mar.Item.fb", "Actor.mar.Item.fb.Activity.a1"), spell), true);
check("6.0: region of the same spell's other activity", regionFromSpell(v6("Actor.mar.Item.fb", "Actor.mar.Item.fb.Activity.a2"), spell), true);
check("6.0: no item flag, by activity prefix", regionFromSpell({ activity: "Actor.mar.Item.fb.Activity.a2", origin: "Scene.s.Token.t" }, spell), true);
check("6.0: no item flag, exact activity only", regionFromSpell({ activity: "Actor.mar.Item.fb.Activity.a1", origin: "Scene.s.Token.t" }, { activityUuid: spell.activityUuid }), true);
check("6.0: another spell's region is not", regionFromSpell(v6("Actor.mar.Item.web", "Actor.mar.Item.web.Activity.a1"), spell), false);
check("6.0: same spell on another caster is not", regionFromSpell(v6("Actor.cav.Item.fb", "Actor.cav.Item.fb.Activity.a1"), spell), false);
check("6.0: the caster token in origin is never taken for the spell", regionFromSpell({ origin: "Actor.mar.Item.fb.Token.x" }, { activityUuid: "Actor.mar.Item.fb" }), false);
// 5.3.3 region flags, still on the scene after the migration: { item, origin: <activity uuid> }
check("5.3.3: region of this spell's activity", regionFromSpell({ item: "Actor.mar.Item.fb", origin: "Actor.mar.Item.fb.Activity.a1" }, spell), true);
check("5.3.3: region of the same spell's other activity", regionFromSpell({ item: "Actor.mar.Item.fb", origin: "Actor.mar.Item.fb.Activity.a2" }, spell), true);
check("5.3.3: no item flag, by activity prefix", regionFromSpell({ origin: "Actor.mar.Item.fb.Activity.a2" }, spell), true);
check("5.3.3: no item flag, exact activity", regionFromSpell({ origin: "Actor.mar.Item.fb.Activity.a1" }, { activityUuid: spell.activityUuid }), true);
check("5.3.3: another spell's region is not", regionFromSpell({ item: "Actor.mar.Item.web", origin: "Actor.mar.Item.web.Activity.a1" }, spell), false);
check("5.3.3: same spell on another caster is not", regionFromSpell({ item: "Actor.cav.Item.fb", origin: "Actor.cav.Item.fb.Activity.a1" }, spell), false);
check("item id prefix of another item is not", regionFromSpell({ origin: "Actor.mar.Item.fb2.Activity.a1" }, spell), false);
check("6.0: item id prefix of another item is not", regionFromSpell({ activity: "Actor.mar.Item.fb2.Activity.a1" }, spell), false);
check("no flags is not", regionFromSpell(undefined, spell), false);
check("nothing to match by is not", regionFromSpell({ item: "x", origin: "y" }, {}), false);

/* ── regionOfActivity (Part B: areasFor) ─────────────────────────────────── */
check("6.0: activity flag matches", regionOfActivity(v6("Actor.mar.Item.fb", "Actor.mar.Item.fb.Activity.a1"), spell.activityUuid), true);
check("6.0: the same spell's other activity does not", regionOfActivity(v6("Actor.mar.Item.fb", "Actor.mar.Item.fb.Activity.a2"), spell.activityUuid), false);
check("5.3.3: origin = activity matches", regionOfActivity({ item: "Actor.mar.Item.fb", origin: spell.activityUuid }, spell.activityUuid), true);
check("no activity asked → nothing", regionOfActivity(v6("a", "b"), null), false);

/* ── isTemplateRegion (both markers) ─────────────────────────────────────── */
check("6.0 template region (flags.dnd5e.activity)", isTemplateRegion({ flags: { dnd5e: v6("Actor.mar.Item.fb", "Actor.mar.Item.fb.Activity.a1") } }), true);
check("5.3.3 template region (flags.core.MeasuredTemplate)", isTemplateRegion({ flags: { core: { MeasuredTemplate: true }, dnd5e: { item: "i", origin: "a" } } }), true);
check("create data (preCreateRegion) with the 6.0 marker", isTemplateRegion({ name: "Fireball [Joe]", flags: { dnd5e: { activity: "Actor.mar.Item.fb.Activity.a1" } } }), true);
check("portal / scene-link region is not", isTemplateRegion({ flags: { "pentaryn-portals": { pair: "x" } } }), false);
check("dnd5e flags without an activity are not", isTemplateRegion({ flags: { dnd5e: { item: "i" } } }), false);
check("no flags is not", isTemplateRegion({}), false);
check("nothing is not", isTemplateRegion(null), false);

/* ── attachedToOther (emanations stay on their caster) ───────────────────── */
const sceneTokens = { caster: { id: "caster", flags: {} }, h1: { id: "h1", flags: { "pentaryn-aoe": { handle: true, region: "r1" } } } };
const lookup = id => sceneTokens[id];
check("attached id from the source", attachedTokenId({ _source: { attachment: { token: "caster" } } }), "caster");
check("attached id from the live document", attachedTokenId({ attachment: { token: { id: "h1" } } }), "h1");
check("not attached → null", attachedTokenId({ attachment: { token: null } }), null);
check("emanation attached to its caster → skip (no handle)", attachedToOther({ _source: { attachment: { token: "caster" } } }, lookup), true);
check("attached to our handle → not someone else's", attachedToOther({ _source: { attachment: { token: "h1" } } }, lookup), false);
check("not attached (Fireball) → gets a handle", attachedToOther({ _source: { attachment: { token: null } } }, lookup), false);
check("attached to a token we cannot see → leave it", attachedToOther({ _source: { attachment: { token: "gone" } } }, lookup), true);

/* ── handleVertical (where the handle token goes; dnd5e 6 regions have no elevation) ── */
const lv = { L0: 0, L1: 20 };
const onScene = id => id in lv;
check("dnd5e 6: no source bottom (prepared −∞) → the region's level base", handleVertical({ regionLevels: ["L1"], sceneHasLevel: onScene, sourceBottom: null, levelBase: id => lv[id] }), { level: "L1", elevation: 20 });
check("dnd5e 6 on the ground level → elevation 0, that level", handleVertical({ regionLevels: ["L0"], sceneHasLevel: onScene, sourceBottom: null, levelBase: id => lv[id] }), { level: "L0", elevation: 0 });
check("a finite region bottom wins", handleVertical({ regionLevels: ["L1"], sceneHasLevel: onScene, sourceBottom: 25, levelBase: id => lv[id] }), { level: "L1", elevation: 25 });
check("−Infinity is never handed on", handleVertical({ regionLevels: ["L1"], sceneHasLevel: onScene, sourceBottom: -Infinity, levelBase: () => -Infinity }), { level: "L1", elevation: 0 });
check("5.3.3 region (bottom 0, no levels) → no level, 0", handleVertical({ regionLevels: [], sourceBottom: 0 }), { level: null, elevation: 0 });
check("a level the scene no longer has is ignored", handleVertical({ regionLevels: ["gone"], sceneHasLevel: onScene, sourceBottom: null }), { level: null, elevation: 0 });
check("levels as a Set (prepared) work too", handleVertical({ regionLevels: new Set(["L1"]), sceneHasLevel: onScene, levelBase: id => lv[id] }), { level: "L1", elevation: 20 });

/* ── placementInProgress (Part E: Escape cancels a region placement) ──────── */
const cancel = () => {};
check("core placement context set → in progress", placementInProgress({ _placementContext: { preview: {} }, _cancelPlacement: cancel }), true);
check("no placement → not in progress (core handles Escape)", placementInProgress({ _placementContext: null, _cancelPlacement: cancel }), false);
check("a layer without core's cancel → never consume Escape", placementInProgress({ _placementContext: {} }), false);
check("no canvas / no region layer → false", placementInProgress(undefined), false);
check("the old 5.3.3 template preview is not a region placement", placementInProgress({ preview: { children: [{}] } }), false);

/* ── selfApplyReason (D2) ────────────────────────────────────────────────── */
const me = "Actor.cav";
check("Mage Armor targeted at me → apply", selfApplyReason({ casterUuid: me, targetUuids: [me], affectsType: "creature", activityType: "utility", effectCount: 1 }), "targeted-self");
check("same target listed twice still counts as one", selfApplyReason({ casterUuid: me, targetUuids: [me, me], activityType: "utility", effectCount: 1 }), "targeted-self");
check("Shield (self-only), nothing targeted → apply", selfApplyReason({ casterUuid: me, targetUuids: [], affectsType: "self", activityType: "utility", effectCount: 1 }), "self-only");
check("Shield with a stale enemy target → still apply to me", selfApplyReason({ casterUuid: me, targetUuids: ["Actor.gob"], affectsType: "self", effectCount: 1 }), "self-only");
check("Mage Armor targeted at a friend → leave it", selfApplyReason({ casterUuid: me, targetUuids: ["Actor.mar"], affectsType: "creature", effectCount: 1 }), null);
check("me and a friend → leave it", selfApplyReason({ casterUuid: me, targetUuids: [me, "Actor.mar"], effectCount: 1 }), null);
check("nothing targeted, not self-only → leave it", selfApplyReason({ casterUuid: me, targetUuids: [], affectsType: "creature", effectCount: 1 }), null);
check("no effects on the card → nothing", selfApplyReason({ casterUuid: me, targetUuids: [me], effectCount: 0 }), null);
check("save spell targeted at myself → leave it", selfApplyReason({ casterUuid: me, targetUuids: [me], activityType: "save", effectCount: 1 }), null);
check("attack targeted at myself → leave it", selfApplyReason({ casterUuid: me, targetUuids: [me], activityType: "attack", effectCount: 1 }), null);
check("enchant activity → never", selfApplyReason({ casterUuid: me, targetUuids: [me], affectsType: "self", activityType: "enchant", effectCount: 1 }), null);
check("unknown caster → nothing", selfApplyReason({ casterUuid: null, targetUuids: [me], effectCount: 1 }), null);
check("Guidance on me (18 skills to choose from) → leave it", selfApplyReason({ casterUuid: me, targetUuids: [me], affectsType: "willing", activityType: "utility", effectCount: 18 }), null);
check("Fire Shield (self-only, warm or chill) → leave it", selfApplyReason({ casterUuid: me, targetUuids: [], affectsType: "self", activityType: "utility", effectCount: 2 }), null);
// usability Area 6 re-run (W1): a touch spell for one willing creature, cast at nobody
check("Mage Armor (touch, willing), nothing targeted, setting on → me", selfApplyReason({ casterUuid: me, targetUuids: [], affectsType: "willing", activityType: "utility", effectCount: 1, rangeUnits: "touch", untargeted: true }), "untargeted-self");
check("same with the setting off → leave it", selfApplyReason({ casterUuid: me, targetUuids: [], affectsType: "willing", activityType: "utility", effectCount: 1, rangeUnits: "touch", untargeted: false }), null);
check("a ranged buff cast at nobody (Haste, 30 ft) → leave it", selfApplyReason({ casterUuid: me, targetUuids: [], affectsType: "willing", activityType: "utility", effectCount: 1, rangeUnits: "ft", untargeted: true }), null);
check("an untargeted touch spell for an enemy → leave it", selfApplyReason({ casterUuid: me, targetUuids: [], affectsType: "enemy", activityType: "utility", effectCount: 1, rangeUnits: "touch", untargeted: true }), null);
check("an untargeted touch save spell → leave it", selfApplyReason({ casterUuid: me, targetUuids: [], affectsType: "creature", activityType: "save", effectCount: 1, rangeUnits: "touch", untargeted: true }), null);
check("Mage Armor targeted at a friend is still the friend's", selfApplyReason({ casterUuid: me, targetUuids: ["Actor.mar"], affectsType: "willing", activityType: "utility", effectCount: 1, rangeUnits: "touch", untargeted: true }), null);

/* ── sameSpellEffect (W2: Shield twice) ──────────────────────────────────── */
const fx = [{ id: "a", name: "Imperceptible Barrier", spell: "shield" }, { id: "b", name: "Mage Armor", spell: "mage-armor" }, { id: "c", name: "Blessed", spell: "bless", disabled: true }];
check("Shield again from the ring replaces the slot's Shield", sameSpellEffect({ name: "Imperceptible Barrier", spell: "shield" }, fx), "a");
check("another spell's effect is kept", sameSpellEffect({ name: "Imperceptible Barrier", spell: "other" }, fx), null);
check("a disabled copy is not replaced", sameSpellEffect({ name: "Blessed", spell: "bless" }, fx), null);
check("not from a spell (a potion) → never", sameSpellEffect({ name: "Mage Armor", spell: null }, fx), null);

/* ── aimFromCaster (W13: Self cones from the caster) ──────────────────────── */
const C = { x: 150, y: 150 };
check("pointer due east → origin on the right edge, rotation 0", aimFromCaster(C, 50, 50, { x: 600, y: 150 }), { x: 200, y: 150, rotation: 0 });
check("pointer due south → bottom edge, 90°", aimFromCaster(C, 50, 50, { x: 150, y: 900 }), { x: 150, y: 200, rotation: 90 });
check("pointer north-west → the corner, 225°", aimFromCaster(C, 50, 50, { x: 0, y: 0 }), { x: 100, y: 100, rotation: 225 });
check("pointer on the token's centre → east, never NaN", aimFromCaster(C, 50, 50, { x: 150, y: 150 }), { x: 200, y: 150, rotation: 0 });
check("a Large caster's edge is a square further out", aimFromCaster({ x: 200, y: 200 }, 100, 100, { x: 200, y: 0 }), { x: 200, y: 100, rotation: 270 });
check("Self cone and line aim; ranged cone, Self circle, emanation do not",
  [aimsFromCaster({ rangeUnits: "self", templateType: "cone" }), aimsFromCaster({ rangeUnits: "self", templateType: "line" }),
   aimsFromCaster({ rangeUnits: "ft", templateType: "cone" }), aimsFromCaster({ rangeUnits: "self", templateType: "circle" }),
   aimsFromCaster({ rangeUnits: "self", templateType: "emanation" })], [true, true, false, false, false]);

/* ── pendingEffects (D2 highlight) ───────────────────────────────────────── */
check("nothing applied → all pending", pendingEffects(["e1", "e2"], []), ["e1", "e2"]);
check("one of a choice applied → card handled", pendingEffects(["e1", "e2"], ["e1"]), []);
check("all applied → none pending", pendingEffects(["e1"], ["e1"]), []);
check("an old card is settled", pendingEffects(["e1"], [], { ageMs: 7200000, maxAgeMs: 3600000 }), []);
check("a fresh card is not", pendingEffects(["e1"], [], { ageMs: 1000, maxAgeMs: 3600000 }), ["e1"]);
check("duplicates and blanks dropped", pendingEffects(["e1", "e1", "", null], []), ["e1"]);

/* ── claimMessage (hooks.mjs) moved to glue.test.mjs, where its 750 ms settle runs on mocked timers ── */

/* ── deleting a handle after core's _regions update (Area 4, D10) ─────────── */
check("a handle still listing the deleted region waits; others go at once",
  stillListing([{ id: "h1", _regions: ["r1", "r2"] }, { id: "h2", _regions: ["r2"] }, { id: "h3" }], "r1"), ["h1"]);
check("nothing listed → nothing to wait for", stillListing([], "r1"), []);

/* ── Argon never binds to an area handle (Area 4, D10) ─────────────────────── */
check("handle token, its document, its actor; a creature is not",
  [isHandleTarget({ document: { flags: { "pentaryn-aoe": { handle: true } } } }),
   isHandleTarget({ flags: { "pentaryn-aoe": { handle: "regionId" } } }),
   isHandleTarget({ flags: { "pentaryn-aoe": { handleActor: true } } }),
   isHandleTarget({ document: { flags: { dnd5e: {} } } }), isHandleTarget(null)],
  [true, true, true, false, false]);

/* ── usability Area 5 re-run (sorcerer) ─────────────────────────────────── */
check("supersede: same area (a moved Fireball), same card after its area went (S16); not another cast or spell",
  [supersedes({ activity: "a", region: "r1", usage: "u1" }, { activity: "a", region: "r1", usage: "u2" }),
   supersedes({ activity: "a", region: "r1", usage: "u1" }, { activity: "a", region: null, usage: "u1" }),
   supersedes({ activity: "a", region: "r1", usage: "u1" }, { activity: "a", region: "r2", usage: "u2" }),
   supersedes({ activity: "a", region: "r1", usage: null }, { activity: "a", region: null, usage: null }),
   supersedes({ activity: "b", region: "r1", usage: "u1" }, { activity: "a", region: "r1", usage: "u1" }),
   supersedes({ activity: "a", region: "r1", usage: "u1", superseded: true }, { activity: "a", region: "r1", usage: "u1" })],
  [true, true, false, false, false, false]);
// aoe-careful-select (declared, Joe's metamagic ruling 2026-10-12): the player chooses; nothing is
// inferred from disposition. protectRows marks exactly the chosen rows, the caster's own included.
const prot = protectRows([{ id: "pc", kind: "manual", save: null, multiplier: null, apply: true }, { id: "gob", kind: "auto", save: null, multiplier: null, apply: true },
  { id: "me", caster: true, save: null, multiplier: null }, { id: "foe", kind: "auto", save: null, multiplier: null, apply: true }], ["pc", "me", "foe"], "half");
check("Careful: exactly the chosen rows auto-succeed and take 0 of a half-on-save spell (a foe, the caster too); others untouched",
  prot.map(r => [r.id, !!r.protected, r.save?.success ?? null, r.multiplier]), [["pc", true, true, 0], ["gob", false, null, null], ["me", true, true, 0], ["foe", true, true, 0]]);
check("Careful on a no-damage-on-save spell is still 0",
  protectRows([{ id: "pc", save: null, multiplier: null }], ["pc"], "none")[0].multiplier, 0);
{
  const rolled = protectRows([{ id: "g", kind: "auto", save: { total: 9, success: false, messageId: "m" }, multiplier: 1 }], ["g"], "half")[0];
  const back = unprotectRow(structuredClone(rolled));
  const fresh = unprotectRow(structuredClone(prot[0]));
  check("unprotectRow: a row gets back the save it had; one protected before any roll has no save again",
    [[!!back.protected, back.save, back.multiplier, "unprotected" in back], [!!fresh.protected, fresh.save, fresh.multiplier]],
    [[false, { total: 9, success: false, messageId: "m" }, 1, false], [false, null, null]]);
}
check("protected rows get no request card and answer no save",
  [prot.filter(r => r.kind === "manual" && r.apply && !r.save).length,
   matchSave({ ability: "dex", request: "q", rows: prot }, { requestId: "q", actorUuid: undefined, tokenId: "pc" })], [0, -1]);
check("placement cancelled after a spend → refund; placed, nothing spent, or no placement offered → no",
  [placementCancelled({ wanted: true, placed: 0, consumed: true }), placementCancelled({ wanted: true, placed: 1, consumed: true }),
   placementCancelled({ wanted: true, placed: 0, consumed: false }), placementCancelled({ wanted: false, consumed: true }),
   placementCancelled({ wanted: true, canPlace: false, consumed: true })], [true, false, false, false, false]);
check("player status line: waiting, applied, superseded, nothing to say",
  [playerStatus({ rows: [{ apply: true, applied: false }] }), playerStatus({ rows: [{ apply: true, applied: true }, { apply: false }] }),
   playerStatus({ superseded: true, rows: [] }), playerStatus({ rows: [] }), playerStatus(null)],
  ["waiting", "applied", "superseded", null, null]);

/* ── checkpoint additions (guide S1.4, core.test.mjs) ─────────────────────────────────────────── */

// [declared] Wave 7 batch (W4 version bumps, Joe 2026-10-12): flipped from 0.3.1 — aoe ships 0.4.0 with
// core.VERSION (the API rows already say since: "0.4.0"). 0.5.0 (2026-10-19, feedback 7v8jPs, RpnWw3,
// 3arqpV, WSMeuV): Part H walls, snappable handles, instantaneous areas stay put, the Token HUD eraser.
test("module.json is pentaryn-aoe 0.5.0", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(manifest.id, core.MODULE);
  assert.equal(manifest.version, "0.5.0");
});

test("VERSION === module.json version", () => {
  assert.equal(core.VERSION, manifestOf(ROOT).version);
});

// [declared] aoe-careful-select (Joe's metamagic ruling, 2026-10-12): carefulTargets (the "caster's
// side" inference), carefulApplies and carefulStale (the bind-to-next-cast and its combat clean-up)
// are dropped; unprotectRow (the GM's tray toggle) is added.
test("the pure surface core exports today (names; later steps may add, never drop)", () => {
  const want = [
    "MODULE", "MULTIPLIERS", "MULTIPLIER_LABELS", "allApplied", "aimFromCaster", "aimsFromCaster", "aoeFlags", "applicableRows", "attachedToOther",
    "attachedTokenId", "buildRows", "centreOf", "fillSave", "handleVertical", "unprotectRow",
    "isCreature", "isHandleTarget", "isTemplateRegion", "matchSave", "multiplierFor", "newestRegion", "pendingEffects",
    "placementCancelled", "placementInProgress", "playerStatus", "protectRows", "regionFromSpell", "regionOfActivity", "rowKind",
    "sameSpellEffect", "selfApplyReason", "shouldAutoDamage", "stillListing", "supersedes",
  ];
  for (const name of want) assert.equal(typeof core[name] === "undefined", false, name);
  assert.deepEqual(core.MULTIPLIERS, [0, 0.25, 0.5, 1, 2]);
});

test("aoeFlags reads flags[pentaryn-aoe] without getFlag; {} when absent", () => {
  assert.deepEqual(core.aoeFlags({ flags: { "pentaryn-aoe": { handle: true } } }), { handle: true });
  assert.deepEqual(core.aoeFlags({ flags: {} }), {});
  assert.deepEqual(core.aoeFlags(null), {});
});

// -39: the four layer shapes shared with cursors' previewActive table (A, C, D are in the legacy port).
test("-39 placementInProgress over layer shapes A–D (B: context set, preview not drawn yet → true)", () => {
  const P = {};
  const fn = () => {};
  const A = { _placementContext: { preview: P }, _cancelPlacement: fn, preview: { children: [P] } };
  const B = { _placementContext: { preview: P }, _cancelPlacement: fn, preview: { children: [] } };
  const C = { _placementContext: null, _cancelPlacement: fn, preview: { children: [] } };
  assert.deepEqual([A, B, C, undefined].map(core.placementInProgress), [true, true, false, false]);
  assert.equal(core.placementInProgress({ _placementContext: {}, _cancelPlacement: "no" }), false);
});

// -4: tray.mjs counts Apply with an inline filter that must equal applicableRows(rows).length.
test("-4 the tray's inline Apply count equals applicableRows on the live fixture", () => {
  const toks = [
    { id: "g1", name: "Goblin 1", actorUuid: "A.g1", baseActorId: "gob", actorType: "npc", hpMax: 7, hpValue: 7 },
    { id: "g2", name: "Goblin 2", actorUuid: "A.g2", baseActorId: "gob", actorType: "npc", hpMax: 7, hpValue: 7 },
    { id: "cv", name: "Caven", actorUuid: "Actor.cav", baseActorId: "cav", actorType: "character", hpMax: 30, hpValue: 30, hasPlayerOwner: true },
    { id: "mr", name: "Marrith", actorUuid: "Actor.mar", baseActorId: "mar", actorType: "character", hpMax: 25, hpValue: 25, hasPlayerOwner: true },
  ];
  const rows = core.buildRows(toks, { casterActorId: "mar" });
  const r1 = core.fillSave({ ...rows[0] }, { total: 18, success: true, messageId: "m1" }, "half");
  const live = [r1, { ...rows[1], multiplier: 1 }, { ...rows[2] }, { ...rows[3], multiplier: 1 }, { ...rows[1], id: "u", multiplier: undefined }];
  const inline = live.filter(r => r.apply && !r.applied && r.multiplier !== null && r.multiplier !== undefined).length;
  assert.equal(inline, 2);
  assert.equal(core.applicableRows(live).length, inline);
});

// The handle oracle. portals' isAoeHandle and creatures' isAoeHandle are hand copies of this
// (aoe-movement-portals-43, transform-creatures-30): wave 4 pins aoe's side only; pinning the copies
// against these rows needs migrate/wave-3 code and is a follow-up (wave-4-report).
const HANDLE_ORACLE = [
  ["token object with a handle document", { document: { flags: { "pentaryn-aoe": { handle: true } } } }, true],
  ["handle TokenDocument", { flags: { "pentaryn-aoe": { handle: true } } }, true],
  ["handle id string flag (set on the region, not a token)", { flags: { "pentaryn-aoe": { handle: "tok1" } } }, true],
  ["the handle actor", { flags: { "pentaryn-aoe": { handleActor: true } } }, true],
  ["a synthetic actor whose token is a handle", { token: { flags: { "pentaryn-aoe": { handle: true } } }, flags: {} }, true],
  ["a creature token", { document: { flags: {} } }, false],
  ["a creature actor", { flags: { "pentaryn-aoe": {} } }, false],
  ["region flag only", { flags: { "pentaryn-aoe": { region: "r1" } } }, false],
  ["null", null, false],
  ["undefined", undefined, false],
];

test("isHandleTarget over the shared handle oracle", () => {
  for (const [name, input, want] of HANDLE_ORACLE) assert.equal(core.isHandleTarget(input), want, name);
  assert.equal(core.isHandleTarget({ flags: { other: { handle: true } } }, "other"), true, "module parameter");
});
