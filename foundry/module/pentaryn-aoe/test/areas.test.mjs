// Part A: spell areas everyone can move and delete. Ownership on create, a handle token per
// template region (attached, so core drags and deletes the region with it), the delete cascade,
// "Remove all templates" on the usage card, concentration cleanup, the sweep, and the Argon guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, advance, flush, out, lines, MODULE, GM_ID, PLAYER_ID } from "./fixtures/world.mjs";
import { root, el, dispatch } from "./fixtures/dom.mjs";
import { seams } from "./fixtures/seams.mjs";
import { isTemplateRegion, regionFromSpell } from "../core.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const A = S.areas;
const HANDLE = () => A.handleActor();
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const reset = () => { F.calls.length = 0; out.length = 0; };

const ITEM = "Actor.wiz.Item.fireball0000001";
const ACT = `${ITEM}.Activity.act00000000fire1`;
const spell = W.register(ITEM, { uuid: ITEM, name: "Fireball" });
W.register(ACT, { uuid: ACT, item: spell });
const template = (over = {}) => ({ flags: { dnd5e: { activity: ACT, item: ITEM, origin: "Scene.s.Token.c" } }, ownership: { default: 0, [GM_ID]: 3 }, ...over });

test("the handle actor exists after ready and is found by flag", () => {
  assert.ok(HANDLE());
  assert.equal(HANDLE().flags[MODULE].handleActor, true);
  assert.equal(A.isHandle({ flags: { [MODULE]: { handle: true } } }), true);
  assert.equal(A.isHandle({ flags: {} }), false);
  assert.equal(A.isTemplateRegion, isTemplateRegion);
});

test("preCreateRegion: a template region becomes owned by everyone (on the creating client); others untouched", () => {
  reset();
  const doc = { updateSource(u) { F.calls.push({ op: "updateSource", u }); } };
  F.fire("preCreateRegion", doc, { flags: { dnd5e: { activity: ACT } } });
  F.fire("preCreateRegion", doc, { flags: { core: { MeasuredTemplate: true } } });
  F.fire("preCreateRegion", doc, { flags: {} });
  assert.deepEqual(ops("updateSource"), [{ op: "updateSource", u: { "ownership.default": 3 } }, { op: "updateSource", u: { "ownership.default": 3 } }]);
});

test("createRegion by this client: ownership fixed, handle created at the centre and attached (golden/create-handle.json)", async () => {
  const s = W.scene({ id: "CreateScene00001", grid: { size: 100, distance: 5 }, levels: [{ id: "lvlGround0000001", elevation: { base: 10 } }] });
  F.canvas.scene = s;
  const r = W.region(s, template({
    id: "regionCircle0001", name: "Fireball area", levels: ["lvlGround0000001"],
    shapes: [{ type: "circle", x: 1500, y: 1200, radius: 400 }],
  }));
  reset();
  F.fire("createRegion", r, {}, GM_ID);
  await flush();
  pinJSON("create-handle", ops("update", "createEmbedded"), import.meta.url);
  const handle = s.tokens.get(r.id);
  assert.ok(handle, "the handle's id IS the region's id");
  assert.equal(A.handleFor(r), handle);
  // [declared] aoe-drag-snap: the centre (1500, 1200) is a grid corner, so the handle sits in the square below-right of it.
  assert.deepEqual([handle.x, handle.y, handle.elevation, handle.level], [1500, 1200, 10, "lvlGround0000001"]);
  assert.equal(handle.name, "Fireball (Gamemaster)");
  assert.deepEqual(r.attachment, { token: r.id });
});

test("createHandle: label, position and vertical cases (golden/handle-cases.json)", async () => {
  const s = W.scene({ id: "HandleScene00001" });
  const author = PLAYER_ID;
  const cases = {
    rectangle: W.region(s, template({ id: "regionRect000001", shapes: [{ type: "rectangle", x: 100, y: 200, width: 400, height: 200, anchorX: 0, anchorY: 0, rotation: 0 }], ownership: { default: 3, [author]: 3 } })),
    v533: W.region(s, { id: "regionOld0000001", name: "Old area", flags: { core: { MeasuredTemplate: true }, dnd5e: { item: "Item.missing", origin: ACT } }, shapes: [{ type: "circle", x: 0, y: 0 }], elevation: { bottom: 5 } }),
    hidden: W.region(s, template({ id: "regionHidden0001", hidden: true, flags: { dnd5e: { activity: ACT } } })),
    unnamed: W.region(s, { id: "regionAnon000001", name: "Template", flags: { dnd5e: { activity: "Item.gone.Activity.x" } } }),
  };
  const rows = {};
  for (const [k, r] of Object.entries(cases)) {
    reset();
    const tok = await A.createHandle(r);
    rows[k] = { returned: tok?.id ?? null, calls: ops("createEmbedded", "update").map(c => c.data?.[0] ? { x: c.data[0].x, y: c.data[0].y, elevation: c.data[0].elevation, level: c.data[0].level ?? null, hidden: c.data[0].hidden, name: c.data[0].name } : c.changes) };
  }
  pinJSON("handle-cases", rows, import.meta.url);
});

test("createHandle declines: not a template, attached elsewhere, already handled, pending, no handle actor", async () => {
  const s = W.scene({ id: "DeclineScene0001" });
  const caster = W.token(s, { id: "casterTok0000001" });
  const plain = W.region(s, { id: "regionPlain00001" });
  const emanation = W.region(s, template({ id: "regionEman000001", attachment: { token: caster.id } }));
  const ghost = W.region(s, template({ id: "regionGhost00001", attachment: { token: "notOnScene000001" } }));
  const done = W.region(s, template({ id: "regionDone000001" }));
  await A.createHandle(done);
  reset();
  assert.equal(await A.createHandle(plain), null);
  assert.equal(await A.createHandle(emanation), null, "an emanation attached to its caster gets no handle");
  assert.equal(await A.createHandle(ghost), null, "an attachment we cannot see is someone else's");
  assert.equal(await A.createHandle(done), null);
  const fresh = W.region(s, template({ id: "regionPend000001" }));
  A.pending.add(fresh.id);
  assert.equal(await A.createHandle(fresh), null);
  A.pending.delete(fresh.id);
  const actor = HANDLE();
  F.game.actors.delete(actor.id);
  assert.equal(await A.createHandle(fresh), null, "no handle actor yet");
  F.game.actors.set(actor.id, actor);
  assert.deepEqual(ops("createEmbedded"), []);
});

test("two clients on one account: the loser's 'already exists' is swallowed (null); another error is thrown", async () => {
  const s = W.scene({ id: "TwinScene0000001" });
  const r = W.region(s, template({ id: "regionTwin000001" }));
  W.token(s, { id: "regionTwin000001", name: "the twin's handle, not flagged yet" });
  assert.equal(await A.createHandle(r), null);
  const r2 = W.region(s, template({ id: "regionErr0000001" }));
  s._createError = "server down";
  await assert.rejects(A.createHandle(r2), /server down/);
  s._createError = null;
  assert.equal(A.pending.has(r2.id), false, "pending is cleared in finally");
});

test("createRegion by another user: the active GM repairs after 2.5 s if the creator made no handle", async () => {
  const s = W.scene({ id: "BackstopScene001" });
  const r = W.region(s, template({ id: "regionBack000001", ownership: { default: 3 } }));
  reset();
  F.fire("createRegion", r, {}, PLAYER_ID);
  await advance(2400);
  assert.deepEqual(ops("createEmbedded"), []);
  await advance(100);
  assert.deepEqual(ops("createEmbedded").map(c => c.data[0]._id), [r.id]);
  // the creator made one meanwhile → nothing; the repair fails → logged
  const r2 = W.region(s, template({ id: "regionBack000002", ownership: { default: 3 } }));
  F.fire("createRegion", r2, {}, PLAYER_ID);
  await A.createHandle(r2);
  reset();
  await advance(2500);
  assert.deepEqual(ops("createEmbedded"), []);
  const r3 = W.region(s, template({ id: "regionBack000003", ownership: { default: 3 } }));
  F.fire("createRegion", r3, {}, PLAYER_ID);
  s._createError = "nope";
  await advance(2500);
  s._createError = null;
  assert.deepEqual(lines(), [`error: ${MODULE} | backstop handle`]);
});

test("createRegion skips: not a template, handleTokens off, several shapes, attached elsewhere", async () => {
  const s = W.scene({ id: "SkipScene0000001" });
  const caster = W.token(s, { id: "casterSkip000001" });
  const regions = [
    W.region(s, { id: "regionSkip000001", ownership: { default: 0 } }),
    W.region(s, template({ id: "regionSkip000002", shapes: [{ type: "circle" }, { type: "circle" }] })),
    W.region(s, template({ id: "regionSkip000003", attachment: { token: caster.id } })),
  ];
  reset();
  for (const r of regions) F.fire("createRegion", r, {}, GM_ID);
  await game.settings.set(MODULE, "handleTokens", false);
  const off = W.region(s, template({ id: "regionSkip000004" }));
  F.fire("createRegion", off, {}, GM_ID);
  await flush();
  await game.settings.set(MODULE, "handleTokens", true);
  assert.deepEqual(ops("createEmbedded"), []);
  assert.deepEqual(ops("update").map(c => c.uuid.split(".").at(-1)), ["regionSkip000002", "regionSkip000003", "regionSkip000004"], "ownership is still fixed on template regions");
});

test("handleFor: the attached handle, else a token flagged with the region, else null", () => {
  const s = W.scene({ id: "FindScene0000001" });
  const r = W.region(s, template({ id: "regionFind000001" }));
  assert.equal(A.handleFor(r), null);
  const flagged = W.token(s, { id: "flaggedTok000001", flags: { [MODULE]: { handle: true, region: r.id } } });
  assert.equal(A.handleFor(r), flagged);
  const att = W.token(s, { id: "attachedTok00001", flags: { [MODULE]: { handle: true } } });
  r.attachment = { token: { id: att.id } };
  assert.equal(A.handleFor(r), att);
  r.attachment = { token: "creature00000001" };
  W.token(s, { id: "creature00000001" });
  assert.equal(A.handleFor(r), flagged, "attached to a creature: fall back to the flag");
  assert.equal(A.handleFor({ id: "x" }), null);
});

test("aoe-mnt-7 handleFor reads the attachment through attachedTokenId: a bare id string on the live region finds the handle", () => {
  const s = W.scene({ id: "FindScene0000007" });
  const h = W.token(s, { id: "attachedTok00007", flags: { [MODULE]: { handle: true } } });
  const bare = { id: "regionFind000007", parent: s, attachment: { token: h.id } };
  assert.equal(A.handleFor(bare), h, "a string attachment with no _source still finds the handle");
  const live = { id: "regionFind000008", parent: s, attachment: { token: h } };
  assert.equal(A.handleFor(live), h, "a live token document attachment finds the handle");
  const src = { id: "regionFind000009", parent: s, attachment: { token: null }, _source: { attachment: { token: h.id } } };
  assert.equal(A.handleFor(src), h, "the source string finds the handle");
});

test("areasFor / spellAreas: by activity, by spell item; one scene or all; empty without an id", () => {
  const s1 = W.scene({ id: "FindScene0000002" });
  const s2 = W.scene({ id: "FindScene0000003" });
  const a = W.region(s1, template({ id: "regionAreaA00001" }));
  const b = W.region(s2, template({ id: "regionAreaB00001" }));
  const other = W.region(s1, template({ id: "regionAreaC00001", flags: { dnd5e: { activity: `${ITEM}.Activity.second0000000001`, item: ITEM } } }));
  W.region(s1, { id: "regionPortal0001", flags: { "pentaryn-portals": { activity: ACT } } });
  assert.deepEqual(A.areasFor(ACT, s1).map(r => r.id), [a.id]);
  assert.deepEqual(A.areasFor(ACT).filter(r => [a.id, b.id].includes(r.id)).map(r => r.id), [a.id, b.id]);
  assert.deepEqual(A.areasFor(null), []);
  assert.deepEqual(A.spellAreas({ itemUuid: ITEM }, s1).map(r => r.id), [a.id, other.id]);
  assert.deepEqual(A.spellAreas({ activityUuid: ACT }, s1).map(r => r.id), [a.id]);
  assert.deepEqual(A.spellAreas({}, s1), []);
  // -4: concentration cleanup's inline filter selects exactly spellAreas({ itemUuid }, s)
  const inline = s1.regions.filter(r => isTemplateRegion(r) && regionFromSpell(r.flags?.dnd5e, { itemUuid: ITEM })).map(r => r.id);
  assert.deepEqual(A.spellAreas({ itemUuid: ITEM }, s1).map(r => r.id), inline);
});

test("removeArea: ids on a scene or documents; non-templates, undeletable and gone ones skipped; returns the count", async () => {
  const s = W.scene({ id: "RemoveScene00001" });
  F.canvas.scene = s;
  const a = W.region(s, template({ id: "regionRmA0000001" }));
  const b = W.region(s, template({ id: "regionRmB0000001" }));
  const locked = W.region(s, template({ id: "regionRmLock0001" }));
  locked._deny = ["delete"];
  const portal = W.region(s, { id: "regionRmPortal01" });
  reset();
  assert.equal(await A.removeArea([a.id, "missing000000001", portal.id, locked.id]), 1);
  assert.equal(await A.removeArea(b, s), 1);
  assert.equal(await A.removeArea([]), 0);
  assert.deepEqual(ops("deleteEmbedded").filter(c => c.documentName === "Region").map(c => c.ids), [[a.id], [b.id]]);
});

test("deleteRegion by this client: the handle waits until core drops the region from its _regions (≤1.5 s), then goes", async () => {
  const s = W.scene({ id: "DeleteScene00001" });
  const r = W.region(s, template({ id: "regionDel0000001" }));
  const h = W.token(s, { id: "regionDel0000001", flags: { [MODULE]: { handle: true, region: r.id } }, _regions: [r.id] });
  reset();
  await s.deleteEmbeddedDocuments("Region", [r.id]);
  await advance(250);
  assert.deepEqual(ops("deleteEmbedded").map(c => c.documentName), ["Region"], "still listed: waiting");
  h._regions = [];
  await advance(150);
  assert.deepEqual(ops("deleteEmbedded").map(c => [c.documentName, c.ids]), [["Region", [r.id]], ["Token", [h.id]]]);
});

test("deleteRegion: the wait gives up after 1.5 s; without an active GM there is no wait", async () => {
  const s = W.scene({ id: "DeleteScene00002" });
  const r = W.region(s, template({ id: "regionDel0000002" }));
  W.token(s, { id: "regionDel0000002", flags: { [MODULE]: { handle: true, region: r.id } }, _regions: [r.id] });
  reset();
  await s.deleteEmbeddedDocuments("Region", [r.id]);
  await advance(1400);
  assert.equal(ops("deleteEmbedded").length, 1);
  await advance(200);
  assert.deepEqual(ops("deleteEmbedded").map(c => c.documentName), ["Region", "Token"]);
});

test("deleteRegion by another user: the active GM deletes the handle 1.5 s later; KNOWN -9: a failure there is silent", async () => {
  const s = W.scene({ id: "DeleteScene00003" });
  const r = W.region(s, template({ id: "regionDel0000003" }));
  W.token(s, { id: "regionDel0000003", flags: { [MODULE]: { handle: true, region: r.id } } });
  s.regions.delete(r.id);
  reset();
  F.fire("deleteRegion", r, {}, PLAYER_ID);
  await advance(1400);
  assert.deepEqual(ops("deleteEmbedded"), []);
  await advance(100);
  assert.deepEqual(ops("deleteEmbedded").map(c => c.ids), [[r.id]]);
  const r2 = W.region(s, template({ id: "regionDel0000004" }));
  const h2 = W.token(s, { id: "regionDel0000004", flags: { [MODULE]: { handle: true, region: r2.id } } });
  Object.defineProperty(s, "deleteEmbeddedDocuments", { value: async () => { throw new Error("does not exist"); }, configurable: true });
  out.length = 0;
  F.fire("deleteRegion", r2, {}, PLAYER_ID);
  await advance(1600);
  assert.deepEqual(out, []);
  assert.ok(h2);
});

test("deleteRegion: a non-template region, or a handle this user cannot delete, is left alone", async () => {
  const s = W.scene({ id: "DeleteScene00005" });
  const r = W.region(s, { id: "regionDelPortal1" });
  const r2 = W.region(s, template({ id: "regionDel0000005" }));
  const h = W.token(s, { id: "regionDel0000005", flags: { [MODULE]: { handle: true, region: r2.id } } });
  h._deny = ["delete"];
  reset();
  await s.deleteEmbeddedDocuments("Region", [r.id, r2.id]);
  await advance(1600);
  assert.deepEqual(ops("deleteEmbedded").map(c => c.documentName), ["Region"]);
});

test("preCreateCombatant: a handle is vetoed (literal false, unguarded); a creature is not", () => {
  const s = W.scene({ id: "CombatScene00001" });
  const h = W.token(s, { id: "handleCbt0000001", flags: { [MODULE]: { handle: true } } });
  const c = W.token(s, { id: "creatureCbt00001" });
  assert.equal(F.fireCall("preCreateCombatant", { token: h }, {}), false);
  assert.equal(F.fireCall("preCreateCombatant", { token: c }, {}), true);
  assert.equal(F.fireCall("preCreateCombatant", { parent: { scene: s } }, { tokenId: h.id }), false);
  assert.equal(F.fireCall("preCreateCombatant", { parent: {} }, {}), true);
});

test("targetToken: this user's target on a handle is released at once; another user's is not", () => {
  const s = W.scene({ id: "TargetScene00001" });
  const h = W.token(s, { id: "handleTgt0000001", flags: { [MODULE]: { handle: true } } });
  const c = W.token(s, { id: "creatureTgt00001" });
  const obj = d => ({ document: d, setTarget: (on, o) => F.calls.push({ op: "setTarget", id: d.id, on, o }) });
  reset();
  F.fire("targetToken", game.user, obj(h), true);
  F.fire("targetToken", game.user, obj(h), false);
  F.fire("targetToken", game.users.get(PLAYER_ID), obj(h), true);
  F.fire("targetToken", game.user, obj(c), true);
  assert.deepEqual(ops("setTarget"), [{ op: "setTarget", id: h.id, on: false, o: { releaseOthers: false } }]);
});

test("[declared] preMoveToken: a handle drag never auto-rotates, so its attached area keeps its direction; a creature's move is untouched", () => {
  const s = W.scene({ id: "RotateScene00001" });
  const h = W.token(s, { id: "handleRot0000001", flags: { [MODULE]: { handle: true } } });
  const c = W.token(s, { id: "creatureRot00001" });
  const hm = { method: "dragging", autoRotate: true };
  const cm = { method: "dragging", autoRotate: true };
  F.fire("preMoveToken", h, hm, {});
  F.fire("preMoveToken", c, cm, {});
  assert.equal(hm.autoRotate, false);
  assert.equal(cm.autoRotate, true);
  assert.equal(F.fireCall("preMoveToken", h, { autoRotate: true }, {}), true, "never vetoes the move");
});

/* ── "Remove all templates" on the usage card ─────────────────────────────────────────────────── */

const ACTIONS = `<div class="chat-card"><section class="icon-row"><ul class="pills unlist"><li>V</li></ul></section><section class="icon-row"><ul class="unlist"><li><button data-action="placeTemplate">P</button></li><li><button data-action="consume">C</button></li></ul></section></div>`;
const usage = (over = {}) => W.message({ type: "usage", system: { activity: { uuid: ACT }, item: { uuid: ITEM } }, activity: { target: { template: { type: "sphere" } }, item: spell }, ...over });
const render = (message, html) => {
  const host = root(html);
  F.fire("dnd5e.renderChatMessage", message, host);
  return host;
};

test("the eraser goes right after Place Template (golden/remove-button.json)", () => {
  const host = render(usage(), ACTIONS);
  pinJSON("remove-button", host.innerHTML, import.meta.url);
  assert.equal(host.querySelectorAll("[data-pentaryn-aoe-action]").length, 1);
  F.fire("dnd5e.renderChatMessage", usage(), host);
  assert.equal(host.querySelectorAll("[data-pentaryn-aoe-action]").length, 1, "never twice");
});

test("a card whose buttons this viewer cannot see gets the action row built like card-buttons.hbs, not the pills row", () => {
  const host = render(usage(), `<div class="chat-card"><section class="icon-row"><ul class="pills unlist"><li>V</li></ul></section></div>`);
  pinJSON("remove-button-built-row", host.innerHTML, import.meta.url);
  const host2 = render(usage(), `<div class="chat-card"><section class="icon-row"><ul class="unlist"></ul></section></div>`);
  assert.equal(host2.querySelector("section.icon-row > ul.unlist").children.length, 1, "an existing empty action row is reused");
  const host3 = render(usage(), `<p>no chat card</p>`);
  assert.equal(host3.querySelector("[data-pentaryn-aoe-action]"), null, "no .chat-card and no row → nowhere to put it");
});

test("no eraser: setting off, not a usage card, no activity, a card that places no area", async () => {
  const hosts = [
    render(W.message({ type: "damage", system: { activity: { uuid: ACT } } }), ACTIONS),
    render(usage({ system: { item: { uuid: ITEM } } }), ACTIONS),
    render(usage({ activity: { target: { template: {} } } }), `<div class="chat-card"></div>`),
  ];
  await game.settings.set(MODULE, "removeAreaButton", false);
  hosts.push(render(usage(), ACTIONS));
  await game.settings.set(MODULE, "removeAreaButton", true);
  for (const h of hosts) assert.equal(h.querySelector("[data-pentaryn-aoe-action]"), null);
  // a card with no associated-activity method falls back to fromUuidSync of system.activity.uuid
  const m = usage();
  Object.defineProperty(m, "getAssociatedActivity", { value: undefined });
  W.register(ACT, { uuid: ACT, item: spell, target: { template: { type: "sphere" } } });
  assert.ok(render(m, `<div class="chat-card"></div>`).querySelector("[data-pentaryn-aoe-action]"));
});

test("clicking the eraser removes this spell's areas on the viewed scene; toasts when there are none or none could go", async () => {
  const s = W.scene({ id: "EraserScene00001" });
  F.canvas.scene = s;
  const a = W.region(s, template({ id: "regionErase00001" }));
  const host = render(usage(), ACTIONS);
  const btn = host.querySelector("[data-pentaryn-aoe-action]");
  reset();
  const ev = dispatch(btn, "click");
  assert.equal(btn.disabled, true, "disabled while removing");
  await Promise.all(ev.results);
  assert.equal(btn.disabled, false);
  assert.equal(ev.defaultPrevented && ev.stopped, true);
  assert.deepEqual(ops("deleteEmbedded").filter(c => c.documentName === "Region").map(c => c.ids), [[a.id]]);
  reset();
  await Promise.all(dispatch(btn, "click").results);
  const locked = W.region(s, template({ id: "regionErase00002" }));
  locked._deny = ["delete"];
  await Promise.all(dispatch(btn, "click").results);
  F.canvas.scene = null;
  await Promise.all(dispatch(btn, "click").results);
  assert.deepEqual(ops("notify").map(c => [c.level, c.message]), [
    ["info", game.i18n.localize("PENTARYN_AOE.NoArea")],
    ["warn", game.i18n.localize("PENTARYN_AOE.CannotRemove")],
    ["info", game.i18n.localize("PENTARYN_AOE.NoArea")],
  ]);
});

/* ── concentration ends → that spell's areas go ──────────────────────────────────────────────── */

test("deleteActiveEffect (concentration): the spell's template regions go on every scene (golden/concentration.json)", async () => {
  const others = game.scenes.contents;
  game.scenes.clear();                                  // only the two scenes below exist for this test
  const s1 = W.scene({ id: "ConcScene0000001" });
  const s2 = W.scene({ id: "ConcScene0000002" });
  const wizard = W.actor({ id: "wiz", name: "Wizard" });
  const cases = [
    ["system.origin.item absolute", { system: { origin: { item: ITEM } } }],
    ["relative item uuid", { system: { origin: { item: ".Item.fireball0000001" } } }],
    ["core origin", { origin: ITEM }],
    ["flags.dnd5e.item.uuid", { flags: { dnd5e: { item: { uuid: ITEM } } } }],
    ["another spell", { origin: "Actor.wiz.Item.other0000000001" }],
    ["migrated: no origin", { origin: null }],
  ];
  const rows = [];
  for (const [label, data] of cases) {
    for (const r of [...s1.regions.contents, ...s2.regions.contents]) r.collection.delete(r.id);
    W.region(s1, template({ id: "regionConc000001" }));
    W.region(s2, template({ id: "regionConc000002" }));
    W.region(s2, { id: "regionConcPortal", flags: { dnd5e: { item: ITEM } } });
    reset();
    const eff = W.effect(wizard, { statuses: ["concentrating"], ...data });
    F.fire("deleteActiveEffect", eff, {}, GM_ID);
    await flush();
    rows.push({ label, deleted: ops("deleteEmbedded").filter(c => c.documentName === "Region").map(c => [c.parent, c.ids]) });
  }
  pinJSON("concentration", rows, import.meta.url);
  game.scenes.clear();
  for (const sc of others) game.scenes.set(sc.id, sc);
});

test("deleteActiveEffect: not concentration, or concentrationCleanup off → nothing", async () => {
  const s = W.scene({ id: "ConcScene0000003" });
  W.region(s, template({ id: "regionConc000003" }));
  const wizard = W.actor({ name: "Wizard 2" });
  reset();
  F.fire("deleteActiveEffect", W.effect(wizard, { origin: ITEM }), {}, GM_ID);
  await game.settings.set(MODULE, "concentrationCleanup", false);
  F.fire("deleteActiveEffect", W.effect(wizard, { origin: ITEM, statuses: ["concentrating"] }), {}, GM_ID);
  await flush();
  await game.settings.set(MODULE, "concentrationCleanup", true);
  assert.deepEqual(ops("deleteEmbedded"), []);
});

/* ── sweep, the handle actor, ready ─────────────────────────────────────────────────────────── */

test("sweep: orphans deleted, old handles size-locked, ownership fixed, missing handles made (counts)", async () => {
  const s = W.scene({ id: "SweepScene000001" });
  W.token(s, { id: "orphanSweep00001", flags: { [MODULE]: { handle: true, region: "goneRegion000001" }, dnd5e: { lockSize: true } } });
  W.region(s, template({ id: "regionSweep00001", ownership: { default: 0 } }));
  W.region(s, template({ id: "regionSweep00002", ownership: { default: 3 } }));
  W.token(s, { id: "regionSweep00002", flags: { [MODULE]: { handle: true, region: "regionSweep00002" } } });
  W.region(s, template({ id: "regionSweep00003", shapes: [{}, {}], ownership: { default: 3 } }));
  reset();
  assert.deepEqual(await A.sweep(s), { orphansDeleted: 1, ownershipFixed: 1, handlesCreated: 1, sizeLocked: 1 });
  assert.deepEqual(await A.sweep(s), { orphansDeleted: 0, ownershipFixed: 0, handlesCreated: 0, sizeLocked: 0 }, "idempotent");
  assert.deepEqual(await A.sweep(null), { orphansDeleted: 0, ownershipFixed: 0, handlesCreated: 0, sizeLocked: 0 });
  F.canvas.scene = s;
  assert.deepEqual(await A.sweep(), { orphansDeleted: 0, ownershipFixed: 0, handlesCreated: 0, sizeLocked: 0 }, "defaults to canvas.scene");
});

test("canvasReady (active GM) sweeps the new scene", async () => {
  const s = W.scene({ id: "SweepScene000002" });
  W.token(s, { id: "orphanSweep00002", flags: { [MODULE]: { handle: true, region: "goneRegion000002" }, dnd5e: { lockSize: true } } });
  reset();
  F.fire("canvasReady", { scene: s });
  await flush();
  assert.deepEqual(ops("deleteEmbedded").map(c => c.ids), [["orphanSweep00002"]]);
});

test("ensureHandleActor: an existing actor is repaired (size, hover, lockSize) once, then left alone", async () => {
  const actor = HANDLE();
  actor.system.traits = { size: "med" };
  actor.prototypeToken.flags.dnd5e.lockSize = false;
  reset();
  assert.equal(await A.ensureHandleActor(), actor);
  assert.deepEqual(ops("update").map(c => c.changes), [{ "system.traits.size": "tiny", "prototypeToken.flags.dnd5e.lockSize": true }]);
  reset();
  await A.ensureHandleActor();
  assert.deepEqual(ops("update"), []);
  assert.deepEqual(A.handleActorRepairs(actor), {});
});

test("ensureHandleActor as a player: the existing actor unrepaired, or null; never a create", async () => {
  const actor = HANDLE();
  F.become({ userId: PLAYER_ID });
  actor.system.traits.size = "med";
  reset();
  assert.equal(await A.ensureHandleActor(), actor);
  F.game.actors.delete(actor.id);
  assert.equal(await A.ensureHandleActor(), null);
  assert.deepEqual(ops("update", "create"), []);
  F.game.actors.set(actor.id, actor);
  F.become({ userId: GM_ID });
  await A.ensureHandleActor();
});

test("ensureHandleActor files a new actor in the 'Scene Props' folder when there is one", async () => {
  const actor = HANDLE();
  F.game.actors.delete(actor.id);
  F.game.folders.set("folderProps00001", { id: "folderProps00001", type: "Actor", name: "Scene Props" });
  reset();
  const made = await A.ensureHandleActor();
  assert.equal(ops("create")[0].data.folder, "folderProps00001");
  F.game.actors.delete(made.id);
  F.game.actors.set(actor.id, actor);
});

test("readyAreas as a player does nothing", async () => {
  F.become({ userId: PLAYER_ID });
  reset();
  assert.equal(await A.readyAreas(), undefined);
  F.become({ userId: GM_ID });
  assert.deepEqual(ops("create", "createEmbedded", "deleteEmbedded", "updateEmbedded"), []);
});

/* ── Argon never binds to an area handle (-15) ───────────────────────────────────────────────── */

test("-15 guardArgonBind: wraps once, a handle target resolves to undefined, a creature binds as usual", async () => {
  const orig = function (t) { return `bound:${t?.id ?? ""}`; };
  F.ui.ARGON = { bind: orig };
  assert.equal(A.guardArgonBind(), true);
  const wrapped = F.ui.ARGON.bind;
  assert.equal(wrapped._aoeGuard, true);
  const handle = F.ui.ARGON.bind({ document: { flags: { [MODULE]: { handle: true } } } });
  assert.ok(handle instanceof Promise);
  assert.equal(await handle, undefined);
  assert.equal(F.ui.ARGON.bind({ id: "x", flags: {} }), "bound:x");
  assert.equal(F.ui.ARGON.bind(null), "bound:");
  assert.equal(A.guardArgonBind(), true);
  assert.equal(F.ui.ARGON.bind, wrapped, "no double wrap");
  const thrower = { get document() { throw new Error("odd target"); }, id: "y" };
  assert.equal(F.ui.ARGON.bind(thrower), "bound:y", "a throwing check binds as usual");
  delete F.ui.ARGON;
  assert.equal(A.guardArgonBind(), false);
  F.ui.ARGON = {};
  assert.equal(A.guardArgonBind(), false);
  delete F.ui.ARGON;
});

test("[declared] D-A2 -15: uninstall() no longer leaves the Argon bind wrap installed", () => {
  const orig = () => "orig";
  F.ui.ARGON = { bind: orig };
  A.guardArgonBind();
  assert.equal(F.ui.ARGON.bind._aoeGuard, true);
  game.pentaryn.aoe.uninstall();
  assert.equal(F.ui.ARGON.bind, orig);
  delete F.ui.ARGON;
});

test("-15 uninstall restores ui.ARGON.bind (D-A2)", () => {
  const orig = () => "orig";
  F.ui.ARGON = { bind: orig };
  A.guardArgonBind();
  game.pentaryn.aoe.uninstall();
  assert.equal(F.ui.ARGON.bind, orig);
});

test("-7 two GM sessions at ready create one handle actor (D-A6)", async () => {
  const actor = HANDLE();
  F.game.actors.delete(actor.id);
  reset();
  await Promise.all([A.ensureHandleActor(), A.ensureHandleActor()]);
  const creates = ops("create");
  assert.equal(creates[0]?.data._id, "pentarynAoeHndl0");
  assert.equal(F.game.actors.filter(a => a.flags?.[MODULE]?.handleActor).length, 1);
});

test("[declared] aoe-mnt-10: one HANDLE_NAME and one HANDLE_SYSTEM feed the actor, its prototype and the repairs", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../areas.mjs", import.meta.url), "utf8");
  assert.equal(src.split('"Area handle"').length - 1, 1, "the handle name is written once");
  assert.equal(src.match(/size"?: "tiny"/g)?.length, 1, "the handle size is written once");
  assert.equal(A.HANDLE_NAME, "Area handle");
  const data = A.handleActorData(null);
  assert.equal(data.name, A.HANDLE_NAME);
  assert.equal(data.prototypeToken.name, A.HANDLE_NAME);
  for (const [path, value] of Object.entries(A.HANDLE_SYSTEM)) assert.equal(F.foundry.utils.getProperty(data, path), value, path);
  // golden key order kept: hp before movement, attributes before traits
  assert.deepEqual(JSON.stringify(data.system), JSON.stringify({ attributes: { hp: { value: 0, max: 0 }, movement: { hover: true } }, traits: { size: "tiny" } }));
  // an actor built from the data needs no repair
  assert.deepEqual(A.handleActorRepairs({ _source: structuredClone(data) }), {});
});
