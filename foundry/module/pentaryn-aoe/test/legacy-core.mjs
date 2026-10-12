#!/usr/bin/env node
/**
 * Fixtures for core.mjs — `node test/run.mjs`. No dependencies, no Foundry.
 *
 * core.mjs decides who is caught in an area, what a save is worth, which waiting row a save
 * roll answers and whether an attack rolls damage. Those are the parts a live test exercises
 * least reliably (a crowd actor at 0 max HP, an item pile, the caster in their own Fireball,
 * a save rolled from the card's own button instead of the request card), so they are proved here.
 */

const {
  centreOf, multiplierFor, isCreature, rowKind, buildRows, fillSave, applicableRows, allApplied,
  matchSave, shouldAutoDamage, newestRegion, aoeFlags, regionFromSpell, regionOfActivity, selfApplyReason,
  pendingEffects, isTemplateRegion, attachedTokenId, attachedToOther, handleVertical, placementInProgress,
  stillListing, isHandleTarget, supersedes, carefulTargets, protectRows, carefulApplies, placementCancelled, playerStatus,
  sameSpellEffect, aimFromCaster, aimsFromCaster
} = await import("../core.mjs");

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}
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

/* ── claimMessage (hooks.mjs): one client per job on one account ─────────── */
{
  // Two sessions on the GM account: a shared server-ordered message, per-client socket ids.
  const getP = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);
  const setP = (o, path, val) => { const ks = path.split("."); let v = o; for (const k of ks.slice(0, -1)) v = v[k] ??= {}; v[ks.at(-1)] = val; };
  const store = new Map();
  const msg = { id: "dmg1", flags: {}, async update(u) { await null; for (const [k, v] of Object.entries(u)) setP(msg, k, v); } };
  store.set(msg.id, msg);
  globalThis.foundry = { utils: { getProperty: getP } };
  globalThis.game = { socket: { id: "A" }, messages: { get: id => store.get(id) } };
  const kit = await import("../lib/election.mjs");   // S5: hooks.mjs claimMessage → the kit's, scope pentaryn-aoe
  const claimMessage = (m, key) => kit.claimMessage(m, key, { scope: "pentaryn-aoe" });
  const pa = claimMessage(msg, "resolve");             // client A sees the broadcast
  game.socket.id = "B";
  const pb = claimMessage(msg, "resolve");             // client B sees it a moment later
  const [a, b] = await Promise.all([pa, pb]);
  check("two clients on one account: exactly one wins", [a, b].filter(Boolean).length, 1);
  check("the last writer is the winner", { a, b }, { a: false, b: true });
  game.socket.id = "C";
  check("a late client stands down at once", await claimMessage(msg, "resolve"), false);
  game.socket.id = "B";
  check("the winner asking again still wins", await claimMessage(msg, "resolve"), true);
  check("another job on the same message is its own claim", await claimMessage(msg, "selfApply"), true);
  game.socket = {};
  check("no socket id → act (single-client behaviour)", await claimMessage({ id: "x" }, "resolve"), true);
  delete globalThis.game; delete globalThis.foundry;
}

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
const crowd = [
  { id: "pc", baseActorId: "f", actorType: "character", hpMax: 30, disposition: 1, hasPlayerOwner: true },
  { id: "me", baseActorId: "caster", actorType: "character", hpMax: 98, disposition: 1, hasPlayerOwner: true },
  { id: "npcAlly", baseActorId: "g", actorType: "npc", hpMax: 10, disposition: 1, hasPlayerOwner: false },
  { id: "gob", baseActorId: "h", actorType: "npc", hpMax: 7, disposition: -1, hasPlayerOwner: false },
  { id: "hid", baseActorId: "i", actorType: "character", hpMax: 7, disposition: 1, hidden: true },
  { id: "h", handle: true, actorType: "npc", hpMax: 1, disposition: 1 }
];
check("Careful: the caster's side, PCs first, never the caster, a foe, a hidden token or a handle; up to CHA mod (min 1)",
  [carefulTargets([...crowd].reverse(), { casterActorId: "caster", casterDisposition: 1, max: 5 }),
   carefulTargets(crowd, { casterActorId: "caster", casterDisposition: 1, max: 1 }),
   carefulTargets(crowd, { casterActorId: "caster", casterDisposition: 1, max: 0 }),
   carefulTargets(crowd, { casterActorId: "caster", casterDisposition: null, max: 5 })],
  [["pc", "npcAlly"], ["pc"], ["pc"], []]);
const prot = protectRows([{ id: "pc", kind: "manual", save: null, multiplier: null, apply: true }, { id: "gob", kind: "auto", save: null, multiplier: null, apply: true },
  { id: "me", caster: true, save: null, multiplier: null }], ["pc", "me"], "half");
check("Careful: a protected row auto-succeeds and takes 0 of a half-on-save spell; the caster and others untouched",
  prot.map(r => [r.id, !!r.protected, r.save?.success ?? null, r.multiplier]), [["pc", true, true, 0], ["gob", false, null, null], ["me", false, null, null]]);
check("Careful on a no-damage-on-save spell is still 0",
  protectRows([{ id: "pc", save: null, multiplier: null }], ["pc"], "none")[0].multiplier, 0);
check("protected rows get no request card and answer no save",
  [prot.filter(r => r.kind === "manual" && r.apply && !r.save).length,
   matchSave({ ability: "dex", request: "q", rows: prot }, { requestId: "q", actorUuid: undefined, tokenId: "pc" })], [0, -1]);
check("Careful waits for this turn's cast, bound to its card; out of combat for ten minutes",
  [carefulApplies({ key: "c:1:x" }, { combatKey: "c:1:x" }), carefulApplies({ key: "c:1:x" }, { combatKey: "c:2:x" }),
   carefulApplies({ key: "c:1:x", usage: "u1" }, { combatKey: "c:1:x", usage: "u1" }), carefulApplies({ key: "c:1:x", usage: "u1" }, { combatKey: "c:1:x", usage: "u2" }),
   carefulApplies({ at: 1000 }, { now: 1000 + 60000 }), carefulApplies({ at: 1000 }, { now: 1000 + 11 * 60000 }), carefulApplies(null, {})],
  [true, false, true, false, true, false, false]);
check("placement cancelled after a spend → refund; placed, nothing spent, or no placement offered → no",
  [placementCancelled({ wanted: true, placed: 0, consumed: true }), placementCancelled({ wanted: true, placed: 1, consumed: true }),
   placementCancelled({ wanted: true, placed: 0, consumed: false }), placementCancelled({ wanted: false, consumed: true }),
   placementCancelled({ wanted: true, canPlace: false, consumed: true })], [true, false, false, false, false]);
check("player status line: waiting, applied, superseded, nothing to say",
  [playerStatus({ rows: [{ apply: true, applied: false }] }), playerStatus({ rows: [{ apply: true, applied: true }, { apply: false }] }),
   playerStatus({ superseded: true, rows: [] }), playerStatus({ rows: [] }), playerStatus(null)],
  ["waiting", "applied", "superseded", null, null]);

{
  const { carefulStale } = await import("../core.mjs");
  check("Careful armed for a deleted combat's turn is stale; another combat's or an out-of-combat use is not",
    [carefulStale({ key: "c1:2:x", at: 1 }, "c1"), carefulStale({ key: "c2:2:x" }, "c1"), carefulStale({ key: "c10:1:x" }, "c1"),
     carefulStale({ at: 1000, key: null }, "c1"), carefulStale(null, "c1"), carefulStale({ key: "c1:1:x" }, null)],
    [true, false, false, false, false, false]);
}

console.log(`pentaryn-aoe core: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
