// [declared] 0.4.0 — dormant until combat: the pure disguise/wake updates (core) and the feature's
// trigger (dormant.mjs) over a minimal stub: the active GM wakes a dormant combatant when its combat
// starts or when it joins a running one; nobody else writes; arm/wake via the API functions.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DORMANT_DEFAULTS, DORMANT_FLAG, MODULE, combatantRelabels, disguiseUpdate, hasOwnDelta, lookOf, readDormant, wakeUpdate,
} from "../creatures-core.mjs";

const FK = `flags.${MODULE}.${DORMANT_FLAG}`;

/** A ringed hostile golem, as Foundry stores it. */
const golem = () => ({
  _id: "tokGolem00000001", name: "Caven's Vessel", displayName: 0, displayBars: 0, disposition: -1, hidden: true,
  lockRotation: true,
  texture: { src: "modules/mm/tokens/stone-golem.webp", scaleX: 1, scaleY: 1 },
  ring: { enabled: true, colors: { ring: "#d8433a", background: null }, effects: 1, subject: { scale: 1, texture: "modules/mm/subjects/stone-golem.webp" } },
  delta: { name: null, img: null },
  flags: {},
});

/** Apply a flattened update to plain source data (dot keys; an object value replaces at its key). */
function apply(src, update) {
  const out = structuredClone(src);
  for (const [k, v] of Object.entries(update)) {
    const parts = k.split(".");
    let node = out;
    for (const p of parts.slice(0, -1)) node = node[p] ??= {};
    node[parts.at(-1)] = structuredClone(v);
  }
  return out;
}

test("lookOf records everything a disguise changes, plus hidden", () => {
  assert.deepEqual(lookOf(golem()), {
    name: "Caven's Vessel", displayName: 0, displayBars: 0, disposition: -1, hidden: true,
    texture: { src: "modules/mm/tokens/stone-golem.webp", scaleX: 1, scaleY: 1 },
    lockRotation: true,
    ring: golem().ring,
    delta: { name: null, img: null },
  });
});

test("disguiseUpdate: prop art, ring off, prop name on token and delta, no nameplate/bars, SECRET; look stored", () => {
  const u = disguiseUpdate(golem());
  assert.deepEqual(u, {
    name: "Statue", displayName: 0, displayBars: 0, disposition: -2,
    "texture.src": DORMANT_DEFAULTS.img, "ring.enabled": false,
    "delta.name": "Statue", "delta.img": DORMANT_DEFAULTS.img,
    [FK]: { look: lookOf(golem()), disguise: { name: "Statue", img: DORMANT_DEFAULTS.img, disposition: -2 } },
  });
  assert.equal("hidden" in u, false, "visibility is the GM's call");
});

test("re-arming keeps the first look and changes only what is passed", () => {
  const armed = apply(golem(), disguiseUpdate(golem(), { img: "a.webp" }));
  const again = disguiseUpdate(armed, { name: "Old statue" });
  assert.deepEqual(again[FK].look, lookOf(golem()), "never the disguise");
  assert.deepEqual(again[FK].disguise, { name: "Old statue", img: "a.webp", disposition: -2 });
});

test("disguiseUpdate refuses bad options", () => {
  assert.throws(() => disguiseUpdate(golem(), { name: " " }), /name/);
  assert.throws(() => disguiseUpdate(golem(), { img: "" }), /img/);
  assert.throws(() => disguiseUpdate(golem(), { disposition: 5 }), /disposition/);
});

test("wakeUpdate round-trips the look exactly and nulls the flag; not dormant → null", () => {
  const armed = apply(golem(), disguiseUpdate(golem()));
  assert.ok(readDormant(armed));
  const woke = apply(armed, wakeUpdate(armed));
  const { flags, ...rest } = woke;
  const { flags: _f, ...want } = golem();
  assert.deepEqual(rest, want);
  assert.equal(flags[MODULE][DORMANT_FLAG], null);
  assert.equal(readDormant(woke), null);
  assert.equal(wakeUpdate(golem()), null);
  assert.equal(wakeUpdate(woke), null);
});

test("wakeUpdate restores the creature's scale and rotation lock after the prop was resized and turned", () => {
  const armed = apply(golem(), disguiseUpdate(golem()));
  const shrunk = apply(armed, { "texture.scaleX": 0.8, "texture.scaleY": 0.8, lockRotation: false, rotation: 90,
    [`${FK}.look.texture.scaleX`]: 1.2, [`${FK}.look.texture.scaleY`]: 1.2 });
  const woke = apply(shrunk, wakeUpdate(shrunk));
  assert.equal(woke.texture.scaleX, 1.2);
  assert.equal(woke.texture.scaleY, 1.2);
  assert.equal(woke.lockRotation, true);
  assert.equal(woke.rotation, 90, "rotation itself is left alone");
});

test("a look stored before 0.4.1 (no scale, no lock) wakes without touching them", () => {
  const armed = apply(golem(), disguiseUpdate(golem()));
  delete armed.flags[MODULE][DORMANT_FLAG].look.lockRotation;
  armed.flags[MODULE][DORMANT_FLAG].look.texture = { src: "modules/mm/tokens/stone-golem.webp" };
  const u = wakeUpdate(armed);
  for (const k of ["texture.scaleX", "texture.scaleY", "lockRotation"]) assert.equal(k in u, false, k);
});

test("readDormant ignores junk and never throws", () => {
  for (const v of [null, false, "x", [], {}, { look: "x" }]) assert.equal(readDormant({ flags: { [MODULE]: { [DORMANT_FLAG]: v } } }), null);
  assert.equal(readDormant(null), null);
  const bad = { get flags() { throw new Error("boom"); } };
  assert.equal(readDormant(bad), null);
});

test("combatantRelabels: only this token's combatants still showing the disguise (or derived)", () => {
  const flag = disguiseUpdate(golem())[FK];
  const rows = [
    { id: "c1", tokenId: "tokGolem00000001", name: "", img: "" },
    { id: "c2", tokenId: "tokGolem00000001", name: "Statue", img: DORMANT_DEFAULTS.img },
    { id: "c3", tokenId: "tokGolem00000001", name: "The Big One", img: "custom.webp" },
    { id: "c4", tokenId: "other00000000001", name: "", img: "" },
  ];
  assert.deepEqual(combatantRelabels(rows, "tokGolem00000001", flag), [
    { _id: "c1", name: "Caven's Vessel", img: "modules/mm/tokens/stone-golem.webp" },
    { _id: "c2", name: "Caven's Vessel", img: "modules/mm/tokens/stone-golem.webp" },
  ]);
});

/* ---------------- linked tokens (0.5.1) ---------------- */

/** A linked token (a copied world actor), as Foundry stores it: actorLink true, no delta of its own. */
const linkedBog = () => ({
  _id: "tokBogLinked0001", name: "ZZ Bog A", actorLink: true, displayName: 30, displayBars: 30, disposition: -1, hidden: false,
  lockRotation: true,
  texture: { src: "modules/mm/tokens/bog.webp", scaleX: 1, scaleY: 1 },
  ring: { enabled: true, colors: { ring: "#d8433a", background: null }, effects: 1, subject: { scale: 1, texture: "modules/mm/subjects/bog.webp" } },
  delta: null,
  flags: {},
});
const deltaKeys = u => Object.keys(u).filter(k => k === "delta" || k.startsWith("delta."));

test("hasOwnDelta: only an unlinked token with a delta object", () => {
  assert.equal(hasOwnDelta(golem()), true);
  assert.equal(hasOwnDelta(linkedBog()), false);
  assert.equal(hasOwnDelta({ ...linkedBog(), delta: { name: null, img: null } }), false, "linked: never, whatever the source holds");
  assert.equal(hasOwnDelta({ ...golem(), delta: null }), false);
  assert.equal(hasOwnDelta({ ...golem(), delta: [] }), false);
  assert.equal(hasOwnDelta(null), false);
});

test("linked token: the disguise writes no delta key, the look stores delta: null (the playtest throw)", () => {
  const src = linkedBog();
  assert.equal(lookOf(src).delta, null);
  const u = disguiseUpdate(src);
  assert.deepEqual(deltaKeys(u), [], "a delta.* write on a linked token makes core build a bare ActorDelta and throw");
  assert.equal(u.name, "Statue");
  assert.equal(u["texture.src"], DORMANT_DEFAULTS.img);
  assert.equal(u[FK].look.delta, null);
});

test("linked token: wake writes no delta key and round-trips the look exactly", () => {
  const armed = apply(linkedBog(), disguiseUpdate(linkedBog()));
  const u = wakeUpdate(armed);
  assert.deepEqual(deltaKeys(u), []);
  const { flags, ...rest } = apply(armed, u);
  const { flags: _f, ...want } = linkedBog();
  assert.deepEqual(rest, want);
  assert.equal(flags[MODULE][DORMANT_FLAG], null);
});

test("unlinked token: disguise and wake still write the delta, restoring exactly what was there", () => {
  const src = { ...golem(), actorLink: false, delta: { _id: "tokGolem00000001", name: "Vessel (own)", img: "own.webp", system: {} } };
  const u = disguiseUpdate(src);
  assert.equal(u["delta.name"], "Statue");
  assert.equal(u["delta.img"], DORMANT_DEFAULTS.img);
  const armed = apply(src, u);
  const woke = apply(armed, wakeUpdate(armed));
  assert.deepEqual(woke.delta, src.delta);
});

test("armed unlinked, linked before the wake: the wake leaves the delta alone", () => {
  const armed = apply(golem(), disguiseUpdate(golem()));
  const relinked = { ...armed, actorLink: true, delta: null };
  assert.deepEqual(deltaKeys(wakeUpdate(relinked)), []);
});

/* ---------------- the feature, over a minimal stub ---------------- */

function stubWorld({ activeGM = true, isGM = true } = {}) {
  const writes = [];
  const token = {
    id: "tokGolem00000001", uuid: "Scene.s.Token.tokGolem00000001", name: "Statue",
    _source: apply(golem(), disguiseUpdate(golem())),
    async update(u, o) { writes.push({ token: this.id, u, o }); this._source = apply(this._source, u); },
  };
  const plain = { id: "tokPlain00000001", uuid: "Scene.s.Token.tokPlain00000001", name: "Bandit", _source: { flags: {} },
    async update(u) { writes.push({ token: this.id, u }); } };
  const combat = {
    id: "combat0000000001", started: false,
    combatants: [
      { id: "cmb1", tokenId: token.id, token, _source: { name: "", img: "" } },
      { id: "cmb2", tokenId: plain.id, token: plain, _source: { name: "", img: "" } },
    ],
    async updateEmbeddedDocuments(type, ups) { writes.push({ combat: this.id, type, ups }); },
  };
  for (const c of combat.combatants) c.parent = combat;
  globalThis.game = {
    user: { isGM },
    users: { activeGM: { isSelf: activeGM } },
    combats: [combat],
  };
  const handlers = {};
  const reg = { on: (name, fn, o) => { handlers[name] = fn; } };
  const ctx = { log: { warn: (...a) => writes.push({ warn: a }) }, expose: x => Object.assign(ctx, x) };
  return { writes, token, plain, combat, handlers, reg, ctx };
}
const settle = () => new Promise(r => setTimeout(r, 0));

test("feature: no wake while the combat has not started; the round change to 1 wakes it once", async () => {
  const feature = await import("../dormant.mjs");
  const W = stubWorld();
  feature.install(W.reg, W.ctx);
  W.handlers.createCombatant(W.combat.combatants[0]);
  W.handlers.updateCombat(W.combat, { turn: 0 });
  await settle();
  assert.deepEqual(W.writes, [], "not started, no round change: nothing");
  W.combat.started = true;
  W.handlers.updateCombat(W.combat, { round: 1, turn: 0 });
  W.handlers.createCombatant(W.combat.combatants[0]);   // same tick: in flight, not twice
  await settle();
  await settle();
  const tokenWrites = W.writes.filter(w => w.token);
  assert.equal(tokenWrites.length, 1, "one wake, the plain token untouched");
  assert.equal(tokenWrites[0].u.name, "Caven's Vessel");
  assert.equal(tokenWrites[0].u[FK], null);
  assert.deepEqual(tokenWrites[0].o, { pentarynCreatures: true });
  assert.deepEqual(W.writes.find(w => w.combat)?.ups, [{ _id: "cmb1", name: "Caven's Vessel", img: "modules/mm/tokens/stone-golem.webp" }]);
  W.handlers.updateCombat(W.combat, { round: 2 });
  await settle();
  assert.equal(W.writes.filter(w => w.token).length, 1, "awake: later rounds write nothing");
  feature.uninstall();
});

test("feature: a combatant joining a running combat wakes; a client that is not the active GM never writes", async () => {
  const feature = await import("../dormant.mjs");
  const other = stubWorld({ activeGM: false });
  feature.install(other.reg, other.ctx);
  other.combat.started = true;
  other.handlers.updateCombat(other.combat, { round: 1 });
  other.handlers.createCombatant(other.combat.combatants[0]);
  await settle();
  assert.deepEqual(other.writes, []);

  const W = stubWorld();
  feature.install(W.reg, W.ctx);
  W.combat.started = true;
  W.handlers.createCombatant(W.combat.combatants[0]);
  await settle();
  await settle();
  assert.equal(W.writes.filter(w => w.token).length, 1);
  feature.uninstall();
});

test("arm/wake: GM only, dryRun writes nothing, a non-dormant wake is woke:false", async () => {
  const feature = await import("../dormant.mjs");
  const W = stubWorld();
  feature.install(W.reg, W.ctx);
  const plain = { id: "p", documentName: "Token", uuid: "Scene.s.Token.p", name: "Bandit", _source: golem(),
    async update(u) { W.writes.push({ token: "p", u }); this._source = apply(this._source, u); } };
  const dry = await W.ctx.arm(plain, { dryRun: true });
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true);
  assert.deepEqual(W.writes, []);
  assert.equal((await W.ctx.arm(plain, { disposition: 9 })).code, "BAD_ARGS");
  assert.equal((await W.ctx.arm(plain, { name: "Gargoyle statue" })).ok, true);
  assert.equal(plain._source.name, "Gargoyle statue");
  const woke = await W.ctx.wake(plain);
  assert.equal(woke.woke, true);
  assert.equal(plain._source.name, "Caven's Vessel");
  assert.equal((await W.ctx.wake(plain)).woke, false);
  globalThis.game.user.isGM = false;
  assert.equal((await W.ctx.arm(plain)).code, "NOT_GM");
  assert.equal((await W.ctx.wake(plain)).code, "NOT_GM");
  feature.uninstall();
  delete globalThis.game;
});

/* ---------------- a write Foundry refuses (0.5.1) ---------------- */

/** A token whose update behaves like core's: a delta.* key on a linked token throws, as in the playtest. */
function foundryLikeToken(src, { throwWith } = {}) {
  const writes = [];
  return {
    writes, id: src._id, documentName: "Token", uuid: `Scene.s.Token.${src._id}`, name: src.name, _source: src,
    async update(u, o) {
      if (throwWith) throw throwWith;
      if (this._source.delta == null && Object.keys(u).some(k => k.startsWith("delta."))) {
        throw new Error("TokenDocument5e validation errors: SchemaField#_updateDiff delta: _id: may not be undefined");
      }
      writes.push({ u, o });
      this._source = apply(this._source, u);
    },
  };
}

test("arm/wake on a linked token: both write, no throw, the look comes back", async () => {
  const feature = await import("../dormant.mjs");
  const W = stubWorld();
  feature.install(W.reg, W.ctx);
  const tok = foundryLikeToken(linkedBog());
  const armed = await W.ctx.arm(tok);
  assert.equal(armed.ok, true, armed.reason);
  assert.equal(tok._source.name, "Statue");
  assert.equal(tok._source.delta, null);
  const woke = await W.ctx.wake(tok);
  assert.equal(woke.ok, true, woke.reason);
  assert.equal(woke.woke, true);
  assert.equal(tok._source.name, "ZZ Bog A");
  assert.equal(tok._source.ring.enabled, true);
  assert.equal(tok.writes.length, 2);
  feature.uninstall();
  delete globalThis.game;
});

test("arm/wake answer ok:false (never ok:true) when the token update throws", async () => {
  const feature = await import("../dormant.mjs");
  const W = stubWorld();
  feature.install(W.reg, W.ctx);
  const tok = foundryLikeToken(golem(), { throwWith: new Error("TokenDocument5e validation errors: something") });
  const a = await W.ctx.arm(tok);
  assert.equal(a.ok, false);
  assert.equal(a.code, "INTERNAL");
  assert.match(a.reason, /disguise was not written: TokenDocument5e validation errors/);
  const coded = foundryLikeToken(apply(golem(), disguiseUpdate(golem())), { throwWith: Object.assign(new Error("no"), { code: "REFUSED" }) });
  const w = await W.ctx.wake(coded);
  assert.equal(w.ok, false);
  assert.equal(w.code, "REFUSED", "a coded error keeps its code");
  assert.match(w.reason, /wake was not written/);
  feature.uninstall();
  delete globalThis.game;
});

test("wake: token woke but a combatant relabel failed → ok with warnings; the trigger logs a failed wake", async () => {
  const feature = await import("../dormant.mjs");
  const W = stubWorld();
  W.combat.updateEmbeddedDocuments = async () => { throw new Error("socket closed"); };
  feature.install(W.reg, W.ctx);
  const res = await W.ctx.wake(W.token);
  assert.equal(res.ok, true);
  assert.equal(res.woke, true);
  assert.match(res.warnings[0], /combatants not relabelled: socket closed/);
  feature.uninstall();

  const F = stubWorld();
  F.token.update = async () => { throw new Error("validation"); };
  feature.install(F.reg, F.ctx);
  F.combat.started = true;
  F.handlers.updateCombat(F.combat, { round: 1 });
  await settle();
  await settle();
  assert.ok(F.writes.some(w => w.warn && /failed: .*wake was not written: validation/.test(w.warn[0])), JSON.stringify(F.writes));
  feature.uninstall();
  delete globalThis.game;
});
