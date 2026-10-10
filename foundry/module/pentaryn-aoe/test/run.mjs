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
  matchSave, shouldAutoDamage, newestRegion, aoeFlags, regionFromSpell, selfApplyReason, pendingEffects,
  placingTemplate
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
check("region of this spell's activity", regionFromSpell({ item: "Actor.mar.Item.fb", origin: "Actor.mar.Item.fb.Activity.a1" }, spell), true);
check("region of the same spell's other activity", regionFromSpell({ item: "Actor.mar.Item.fb", origin: "Actor.mar.Item.fb.Activity.a2" }, spell), true);
check("region with no item flag, by activity prefix", regionFromSpell({ origin: "Actor.mar.Item.fb.Activity.a2" }, spell), true);
check("region with no item flag, exact activity", regionFromSpell({ origin: "Actor.mar.Item.fb.Activity.a1" }, { activityUuid: spell.activityUuid }), true);
check("another spell's region is not", regionFromSpell({ item: "Actor.mar.Item.web", origin: "Actor.mar.Item.web.Activity.a1" }, spell), false);
check("same spell on another caster is not", regionFromSpell({ item: "Actor.cav.Item.fb", origin: "Actor.cav.Item.fb.Activity.a1" }, spell), false);
check("item id prefix of another item is not", regionFromSpell({ origin: "Actor.mar.Item.fb2.Activity.a1" }, spell), false);
check("no flags is not", regionFromSpell(undefined, spell), false);
check("nothing to match by is not", regionFromSpell({ item: "x", origin: "y" }, {}), false);

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

/* ── pendingEffects (D2 highlight) ───────────────────────────────────────── */
check("nothing applied → all pending", pendingEffects(["e1", "e2"], []), ["e1", "e2"]);
check("one of a choice applied → card handled", pendingEffects(["e1", "e2"], ["e1"]), []);
check("all applied → none pending", pendingEffects(["e1"], ["e1"]), []);
check("an old card is settled", pendingEffects(["e1"], [], { ageMs: 7200000, maxAgeMs: 3600000 }), []);
check("a fresh card is not", pendingEffects(["e1"], [], { ageMs: 1000, maxAgeMs: 3600000 }), ["e1"]);
check("duplicates and blanks dropped", pendingEffects(["e1", "e1", "", null], []), ["e1"]);

/* ── placingTemplate (E: Escape cancels placement) ───────────────────────── */
const tpl = name => ({ name, destroyed: false, _onCancelPlacement() {} });
check("empty preview → nothing to cancel", placingTemplate([]), null);
check("no preview container → nothing", placingTemplate(undefined), null);
check("one template being placed → it", placingTemplate([tpl("fireball")])?.name, "fireball");
check("core drag preview (no cancel method) → nothing", placingTemplate([{ name: "drag", destroyed: false }]), null);
check("destroyed template → nothing", placingTemplate([{ ...tpl("old"), destroyed: true }]), null);
check("several → the newest", placingTemplate([tpl("a"), tpl("b")])?.name, "b");
check("newest is not a template → the template under it", placingTemplate([tpl("a"), { name: "drag" }])?.name, "a");
check("null children skipped", placingTemplate([null, tpl("a"), undefined])?.name, "a");

/* ── escape.mjs binding hand-over (E: hot-patch keeps Escape-cancel) ───────── */
{
  const actions = new Map();
  let registered = null;
  globalThis.CONST = { KEYBINDING_PRECEDENCE: { PRIORITY: 0 } };
  globalThis.game = { keybindings: { actions, register(ns, a, d) { actions.set(`${ns}.${a}`, d); registered = d.onDown; } } };
  const cancelled = [];
  const placing = name => ({ destroyed: false, _onCancelPlacement() { cancelled.push(name); } });
  globalThis.canvas = { templates: { preview: { children: [] } } };
  // Two instances of one file, as a startup load and a hot-patched copy are (query = new instance).
  const escapeUrl = new URL("../escape.mjs", import.meta.url).href;
  const first = await import(`${escapeUrl}?copy=startup`);
  first.registerEscape();
  check("escape: nothing being placed → core keeps Escape", registered({}), false);
  canvas.templates.preview.children = [placing("a")];
  check("escape: placing → consumed", registered({}), true);
  check("escape: placing → template's own cancel ran", cancelled, ["a"]);
  first.disableEscape();
  check("escape: after uninstall → core keeps Escape", registered({}), false);
  const startupBinding = registered;
  const hot = await import(`${escapeUrl}?copy=hot`);
  hot.registerEscape();
  check("escape: hot copy does not register twice", registered === startupBinding, true);
  check("escape: hot copy takes over the startup binding", registered({}), true);
  first.disableEscape();
  check("escape: stale uninstall leaves the hot copy's handler", registered({}), true);
  hot.disableEscape();
  check("escape: hot uninstall → core keeps Escape", registered({}), false);
  delete globalThis.game; delete globalThis.canvas; delete globalThis.CONST;
}

console.log(`pentaryn-aoe core: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
