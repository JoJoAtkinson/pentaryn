/**
 * The stub world for the glue suites: the kit's Foundry stub plus what pentaryn-transform touches
 * that the kit does not model — TokenDocument's static `_preUpdateOperation`, the v14 data-field
 * operators, `Actor`/`ChatMessage` globals, TextEditor and DialogV2, `game.time`, combats, the
 * tooltip manager, `user.can`, dnd5e's allowPolymorphing setting — and a dnd5e-shaped druid.
 *
 * Synthetic data only (test/ ships with the module). Shapes follow a level-12 Circle of the Stars
 * druid and dnd5e 6.0.6: activities are a prepared Collection on live items and plain objects in
 * `toObject()`; transformInto fires dnd5e.transformActor for a linked actor only; revertOriginalForm
 * fires dnd5e.revertOriginalForm first.
 *
 *   const W = await setup();            // before importing the module
 *   await import("../transform.mjs"); await import("../hud.mjs");
 *   const { talo, wolfSrc } = W.talo();  // a fresh druid in game.actors
 */

import { readFileSync } from "node:fs";
import { installFoundry, makeDoc, makeUser, makeScene, makeToken, StubCollection } from "../kit/foundry-stub.mjs";
import { installDom } from "./dom.mjs";
import { installArgon } from "./argon.mjs";

export const MODULE = "pentaryn-transform";
export const lang = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));

export const IDS = Object.freeze({
  gm: "gmUser0000000001",
  player: "plyUser000000001",
  player2: "plyUser000000002",
  talo: "taloActor0000001",
  ws: "wsWildShape00001",
  starry: "starryForm000001",
  twinkling: "twinklingConst01",
  revert: "returnNormal0001",
  companion: "wildCompanion001",
  spellcasting: "spellcasting0001",
  cure: "cureWounds000001",
  fireBolt: "fireBolt00000001",
  conc: "concEffect000001",
  bless: "blessEffect00001"
});

/** A Set that serialises as an array (an effect's `statuses` survives toObject()). */
export function statusSet(list = []) {
  const s = new Set(list);
  Object.defineProperty(s, "toJSON", { value: () => [...s], enumerable: false });
  return s;
}

/** Activities as dnd5e prepares them: a Map whose JSON is the plain source object. */
class ActivityCollection extends Map {
  toJSON() { return Object.fromEntries([...this].map(([k, v]) => [k, v])); }
}

export async function setup({ user = null, users = null, modules = [], worldTime = 0, currentScene = null, scenes = [] } = {}) {
  const userList = users ?? [
    { id: IDS.player, name: "Player One", isGM: false, active: true },
    { id: IDS.player2, name: "Player Two", isGM: false, active: false }
  ];
  const F = await installFoundry({
    lang, modules: [MODULE, ...modules], user: user ?? { id: IDS.gm, name: "Gamemaster", isGM: true },
    users: userList, scenes, currentScene
  });
  F.D = installDom({ hooksRef: () => F.hooks.length });
  F.A = installArgon(F, F.D);
  F.chat = [];
  F.console = [];
  for (const level of ["log", "warn", "error", "debug"]) {
    console[level] = (...args) => { F.console.push([level, typeof args[0] === "string" ? args[0] : String(args[0]), ...args.slice(1)]); };
  }

  /* core v14 pieces the patch block reads at module evaluation */
  class DataFieldOperator {
    constructor(value) { this.value = value; }
    static get(v) { return v instanceof DataFieldOperator ? v.value : v; }
  }
  class ForcedReplacement extends DataFieldOperator {}
  F.Ops = { DataFieldOperator, ForcedReplacement, ForcedDeletion: F.foundry.data.operators.ForcedDeletion };
  F.foundry.data.operators = F.Ops;
  F.coreOps = [];
  class TokenDocument {
    static _preUpdateOperation(documents, operation, user) {
      F.coreOps.push({ self: this, documents, operation: structuredSnapshot(operation), user });
      return "core-result";
    }
  }
  F.TokenDocument = TokenDocument;
  F.foundry.documents.TokenDocument = TokenDocument;

  /* TextEditor, DialogV2 */
  F.enriched = [];
  F.enrichThrows = false;
  F.foundry.applications.ux = {
    TextEditor: { implementation: { enrichHTML: async (html, opts) => {
      if (F.enrichThrows) throw new Error("enrich failed");
      F.enriched.push({ html, opts });
      return `<p>${String(html).replace(/^<p>|<\/p>$/g, "")} (enriched)</p>`;
    } } }
  };
  F.dialogs = [];
  F.dialogAnswer = null;              // a constellation, null (closed), or an Error to reject with
  F.foundry.applications.api.DialogV2 = {
    wait: async (config) => {
      F.dialogs.push(config);
      if (F.dialogAnswer instanceof Error) throw F.dialogAnswer;
      return F.dialogAnswer;
    }
  };

  /* game extras */
  F.game.time = { worldTime };
  F.game.combat = null;
  F.game.combats = new StubCollection();
  F.can = new Map();                  // userId → false to deny ACTOR_CREATE (or perm => boolean, per permission)
  for (const u of F.game.users) Object.defineProperty(u, "can", { value: (perm) => {
    const rule = F.can.get(u.id);
    return typeof rule === "function" ? rule(perm) : rule ?? true;
  }, enumerable: false });
  F.tooltipCalls = [];
  F.game.tooltip = { element: null, deactivate() { F.tooltipCalls.push("deactivate"); } };
  F.game.settings.register("dnd5e", "allowPolymorphing", { default: true, scope: "world" });
  F.calls.length = 0;

  /* Actor / ChatMessage globals */
  globalThis.Actor = class Actor {
    static [Symbol.hasInstance](x) { return x?.documentName === "Actor"; }
    static implementation = {
      deleteDocuments: async (ids) => {
        F.calls.push({ op: "Actor.deleteDocuments", ids: [...ids] });
        for (const id of ids) F.game.actors.delete(id);
        return ids;
      }
    };
  };
  F.chatFails = false;
  globalThis.ChatMessage = {
    implementation: {
      create: async data => {
        if (F.chatFails) throw new Error("chat down");
        F.chat.push(data);
        return data;
      },
      getSpeaker: ({ actor } = {}) => ({ alias: actor?.name ?? null, actor: actor?.id ?? null })
    }
  };

  /* uuids: compendium beasts live outside game.actors */
  F.compendium = new Map();
  F.tokenImages = new Map();          // beast uuid → the files its wildcard token path matches (server order)
  const baseSync = globalThis.fromUuidSync;
  const sync = uuid => F.compendium.get(uuid) ?? resolveEmbedded(F, uuid) ?? baseSync(uuid);
  Object.defineProperty(globalThis, "fromUuidSync", { value: sync, configurable: true, writable: true });
  Object.defineProperty(globalThis, "fromUuid", { value: async uuid => sync(uuid), configurable: true, writable: true });

  F.lang = lang;
  F.W = makeWorldBuilders(F);
  return F;
}

function structuredSnapshot(operation) {
  return { recursive: operation?.recursive, updates: (operation?.updates ?? []).map(u => ({ ...u })) };
}

function resolveEmbedded(F, uuid) {
  const m = /^Actor\.([^.]+)\.(Item|ActiveEffect)\.([^.]+)$/.exec(String(uuid ?? ""));
  if (!m) return null;
  const actor = F.game.actors.get(m[1]);
  return (m[2] === "Item" ? actor?.items : actor?.effects)?.get(m[3]) ?? null;
}

/* ── documents ────────────────────────────────────────────────────────────── */

function makeWorldBuilders(F) {
  const game = F.game;

  function makeActivity(item, data) {
    const a = { id: data._id, ...data };
    Object.defineProperty(a, "item", { value: item, enumerable: false });
    Object.defineProperty(a, "actor", { get() { return item.parent ?? null; }, enumerable: false });
    Object.defineProperty(a, "use", { value: (u, d, m) => useActivity(F, a, u, d, m), enumerable: false, writable: true });
    return a;
  }

  function makeEffect(parent, data, collection) {
    const { statuses = [], ...rest } = data;
    const e = makeDoc("ActiveEffect", { _id: data.id ?? data._id, id: data.id ?? data._id, ...rest }, { parent, collection });
    e.statuses = statusSet(statuses);
    // Foundry's _source: the stored data (here, a fresh plain copy of the stand-in's own fields)
    Object.defineProperty(e, "_source", { get() { return JSON.parse(JSON.stringify(e)); }, enumerable: false });
    return e;
  }

  function makeItem(actor, data) {
    const { activities = [], effects = [], ...rest } = data;
    const it = makeDoc("Item", { _id: data.id, ...rest, system: { ...(rest.system ?? {}) } }, { parent: actor });
    const acts = new ActivityCollection();
    for (const a of activities) acts.set(a._id, makeActivity(it, a));
    it.system.activities = acts;
    const effs = new StubCollection();
    for (const e of effects) effs.set(e.id, makeEffect(it, e, effs));
    Object.defineProperty(it, "effects", { value: effs, enumerable: false });
    Object.defineProperty(it, "actor", { get() { return this.parent; }, enumerable: false });
    Object.defineProperty(it, "sheetRenders", { value: 0, enumerable: false, writable: true });
    Object.defineProperty(it, "sheet", { value: { render: () => { it.sheetRenders += 1; } }, enumerable: false });
    Object.defineProperty(it, "getRollData", { value: () => ({ item: it.name }), enumerable: false });
    return it;
  }

  /**
   * An Actor stand-in with items/effects/statuses, embedded-document writes (logged to F.calls and
   * firing the create/update/delete hooks as Foundry does), and the dnd5e calls the module makes.
   */
  function makeActor(data = {}) {
    const { items = [], effects = [], statuses = [], tokens = [], hp = { value: 99, max: 99, temp: 0 }, ...rest } = data;
    const a = makeDoc("Actor", {
      isOwner: true, isToken: false, isPolymorphed: false, img: "actor.webp", type: "character",
      _stats: { createdTime: Date.now() },
      ...rest,
      system: { attributes: { hp: { ...hp } }, ...(rest.system ?? {}) }
    });
    if (rest.system?.attributes) a.system.attributes = { hp: { ...hp }, ...rest.system.attributes };
    const coll = new StubCollection();
    Object.defineProperty(a, "items", { value: coll, enumerable: false });
    for (const d of items) coll.set(d.id, makeItem(a, d));
    const effs = new StubCollection();
    Object.defineProperty(a, "effects", { value: effs, enumerable: false });
    for (const d of effects) effs.set(d.id, makeEffect(a, d, effs));
    Object.defineProperty(a, "statuses", { value: new Set(statuses), enumerable: false, writable: true });
    Object.defineProperty(a, "_tokens", { value: tokens, enumerable: false, writable: true });
    const hide = (k, v) => Object.defineProperty(a, k, { value: v, enumerable: false, writable: true });
    hide("getActiveTokens", (linked, document) => {
      F.calls.push({ op: "getActiveTokens", actor: a.id, args: [linked, document] });
      return a._tokens;
    });
    hide("updateEmbeddedDocuments", async (type, updates, options = {}) => {
      F.calls.push({ op: "updateEmbedded", actor: a.id, type, updates: F.plain(updates), options: F.plain(options) });
      const coll = type === "Item" ? a.items : a.effects;
      for (const u of updates) {
        const doc = coll.get(u._id);
        if (!doc) continue;
        const { _id, ...changes } = u;
        applyFlat(doc, changes);
      }
      return updates;
    });
    hide("createEmbeddedDocuments", async (type, list, options = {}) => {
      F.calls.push({ op: "createEmbedded", actor: a.id, type, data: F.plain(list), options: F.plain(options) });
      const out = [];
      for (const d of list) {
        const id = d._id ?? d.id;
        if (type === "ActiveEffect") {
          const e = makeEffect(a, { ...d, id }, a.effects);
          a.effects.set(id, e);
          out.push(e);
          for (const s of e.statuses) a.statuses.add(s);
          F.Hooks.callAll("createActiveEffect", e, options, game.user.id);
        } else {
          const it = makeItem(a, { ...d, id });
          a.items.set(id, it);
          out.push(it);
        }
      }
      return out;
    });
    hide("deleteEmbeddedDocuments", async (type, ids, options = {}) => {
      F.calls.push({ op: "deleteEmbedded", actor: a.id, type, ids: [...ids] });
      const coll = type === "Item" ? a.items : a.effects;
      for (const id of ids) {
        const doc = coll.get(id);
        if (doc) await doc.delete(options);
      }
      return ids;
    });
    hide("transformInto", async (source, settings, options) => transformInto(a, source, settings, options));
    hide("revertOriginalForm", async (options = {}) => revertOriginalForm(a, options));
    hide("longRest", async (config) => { F.calls.push({ op: "longRest", actor: a.id, config: F.plain(config) }); return { type: "long" }; });
    hide("shortRest", async (config) => { F.calls.push({ op: "shortRest", actor: a.id, config: F.plain(config) }); return { type: "short" }; });
    hide("endConcentration", async (effect) => {
      F.calls.push({ op: "endConcentration", actor: a.id, effect: effect?.id ?? null });
      await effect?.delete();
    });
    hide("getTokenDocument", async (data, { parent } = {}) => ({
      toObject: () => ({ name: a.name, actorId: a.id, actorLink: true, x: 0, y: 0, width: 1, height: 1,
        texture: { src: a.img }, sight: { enabled: true }, parent: parent?.id ?? null })
    }));
    hide("sheet", { render: () => F.calls.push({ op: "sheet.render", actor: a.id }) });
    // effect deletes keep statuses in step, as dnd5e's prepared statuses do
    return a;
  }

  /** Put a doc into game.actors (collection set so delete() removes it). */
  function add(actor) {
    actor.collection = game.actors;
    game.actors.set(actor.id, actor);
    return actor;
  }

  /** dnd5e Actor5e#transformInto, the parts the module relies on. */
  async function transformInto(host, source, settings, options) {
    F.calls.push({ op: "transformInto", host: host.id, source: source?.id ?? null, settings: F.plain(settings) });
    if (F.transformThrows) throw new Error("transform boom");
    if (F.transformReturnsNothing) return null;
    const d = {
      name: `${host.name} (${source.name})`, img: source.img, type: host.type,
      items: [...host.items.map(i => i.toObject()), ...source.items.map(i => i.toObject())],
      effects: [...host.effects.map(e => e.toObject()), ...source.effects.map(e => e.toObject())],
      system: { attributes: { hp: { ...host.system.attributes.hp, temp: 12 } }, favorites: F.plain(host.system.favorites ?? []) },
      flags: { dnd5e: { originalActor: host.id, isPolymorphed: true, transformOptions: { ...settings } } }
    };
    // dnd5e copies the source's token image; a wildcard one it picks at random from getTokenImages()
    // (a player who may not browse files gets [] there, so no image at all) — wildcard-art.
    if (source.prototypeToken) {
      const p = source.prototypeToken;
      let src = p.texture?.src ?? null;
      if (p.randomImg) {
        const images = await source.getTokenImages();
        src = images[Math.floor(Math.random() * images.length)];
      }
      d.prototypeToken = { texture: { src } };
    }
    if (host.isToken) {
      // An unlinked token's actor is transformed in place: no dnd5e.transformActor, no new world actor.
      const form = makeActor({
        id: host.id, name: d.name, img: d.img, isToken: true, isPolymorphed: true, system: { attributes: { hp: d.system.attributes.hp }, favorites: d.system.favorites },
        flags: d.flags, items: d.items.map(i => ({ ...i, id: i._id ?? i.id, activities: Object.values(i.system?.activities ?? {}) })),
        effects: d.effects.map(e => ({ ...e, id: e._id ?? e.id }))
      });
      form.token = host.token;
      form._tokens = host._tokens;
      host.token.actor = form;
      if (d.prototypeToken) host.token.texture = { ...(host.token.texture ?? {}), src: d.prototypeToken.texture.src };
      return form;
    }
    if (F.Hooks.call("dnd5e.transformActor", host, source, d, settings, options) === false) return null;
    F.lastTransformData = F.plain(d);
    const form = makeActor({
      id: `form${String(++F.formSeq).padStart(12, "0")}`, name: d.name, img: d.img, isPolymorphed: true, isOwner: host.isOwner,
      ownership: host.ownership, system: { attributes: { hp: d.system.attributes.hp }, favorites: d.system.favorites },
      flags: d.flags, items: (d.items ?? []).map(i => ({ ...i, id: i._id ?? i.id, activities: Object.values(i.system?.activities ?? {}) })),
      effects: (d.effects ?? []).map(e => ({ ...e, id: e._id ?? e.id }))
    });
    form._tokens = host._tokens;                   // dnd5e swapped the host's tokens onto the form
    add(form);
    return form;
  }
  F.formSeq = 0;

  /** dnd5e Actor5e#revertOriginalForm: the hook first, then back to the original (GM deletes the form). */
  async function revertOriginalForm(form, options) {
    F.Hooks.callAll("dnd5e.revertOriginalForm", form, options);
    F.calls.push({ op: "revertOriginalForm", actor: form.id, options: F.plain(options) });
    if (F.revertReturns !== undefined) return F.revertReturns;
    if (form.isToken) return form._back ?? null;
    const host = game.actors.get(form.getFlag("dnd5e", "originalActor")) ?? null;
    if (!host) return null;
    host.system.attributes.hp.value = form.system.attributes.hp.value;
    if (game.user.isGM) game.actors.delete(form.id);
    return host;
  }

  /* ── the druid ─────────────────────────────────────────────────────────── */

  const wsActivity = (profiles) => ({
    _id: "wsAct", name: "Wild Shape", type: "transform", img: "ws.webp",
    transform: { preset: "wildshape", mode: "cr" }, settings: { preset: "wildshape" },
    activation: { type: "bonus" }, duration: { value: 6, units: "hour" },
    consumption: { targets: [{ type: "itemUses", target: "" }] }, availableProfiles: profiles
  });

  /**
   * Beast sources (compendium-like: fromUuid finds them, game.actors does not hold them). With
   * `prototypeToken`, getTokenImages() and clone() as core has them: a wildcard lists
   * `F.tokenImages.get(uuid)` for a user who may browse files (or owns the beast), else core's error
   * toast and []; clone() (keepId) is the same beast with the changes merged over it.
   */
  function beast(id, name, { items = [], img = `${id}.webp`, effects = [], system = {}, prototypeToken = null } = {}) {
    const b = makeActor({ id, name, img, type: "npc", items, effects, system, ...(prototypeToken ? { isOwner: false } : {}) });
    b.collection = null;
    if (prototypeToken) {
      const hide = (k, v) => Object.defineProperty(b, k, { value: v, enumerable: false, writable: true });
      hide("prototypeToken", prototypeToken);
      hide("getTokenImages", async function () {
        F.calls.push({ op: "getTokenImages", actor: this.id, user: game.user.id });
        const p = this.prototypeToken;
        if (!p.randomImg) return [p.texture.src];
        if (!game.user.can("FILES_BROWSE") && !this.isOwner) {
          F.calls.push({ op: "notify", level: "error", message: "Error retrieving wildcard tokens" });
          return [];
        }
        return [...(F.tokenImages.get(this.uuid) ?? [])];
      });
      hide("clone", function (data = {}, context = {}) {
        F.calls.push({ op: "clone", actor: this.id, data: F.plain(data), context: F.plain(context) });
        const c = Object.create(this);
        const p = data.prototypeToken ?? {};
        Object.defineProperty(c, "prototypeToken", { value: {
          ...this.prototypeToken, ...p, texture: { ...this.prototypeToken.texture, ...(p.texture ?? {}) }
        }, enumerable: false });
        return c;
      });
    }
    F.compendium.set(b.uuid, b);                       // resolvable, but not in game.actors
    return b;
  }

  function beasts() {
    const wolfSrc = beast("direWolfSrc00001", "Dire Wolf", {
      system: { details: { cr: 1, type: { value: "beast" } }, traits: { size: "lg" },
        attributes: { hp: { value: 22, max: 22 }, ac: { value: 14 }, movement: { walk: 50, units: "ft" }, senses: { ranges: { darkvision: 60 } } } },
      items: [
        { id: "mmBite0000000001", name: "Bite", type: "weapon", img: "bite.webp", system: { type: { value: "natural" }, description: { value: "" } },
          labels: { toHit: "+5", damages: [{ label: "2d6 + 3 Piercing" }] },
          activities: [{ _id: "bite1", type: "attack", activation: { type: "action" }, labels: { toHit: "+5", damage: [{ label: "2d6 + 3 Piercing" }] } }] },
        { id: "mmPackTactics001", name: "Pack Tactics", type: "feat", system: { type: { value: "monster" }, description: { value: "<p>Advantage with an ally.</p>" } } },
        { id: "mmMultiattack001", name: "Multiattack", type: "feat", system: { type: { value: "monster" }, description: { value: "<p>Two bites.</p>" } },
          activities: [{ _id: "ma1", type: "utility", activation: { type: "action" } }] }
      ]
    });
    const bearSrc = beast("brownBearSrc0001", "Brown Bear", {
      system: { details: { cr: 1, type: { value: "beast" } }, traits: { size: "lg" }, attributes: { hp: { value: 34, max: 34 }, ac: { value: 11 }, movement: { walk: 40, climb: 30 } } },
      items: [{ id: "mmClaw0000000001", name: "Claw", type: "weapon", system: { type: { value: "natural" } },
        activities: [{ _id: "cl1", type: "attack", activation: { type: "action" } }] }]
    });
    const apeSrc = beast("apeSrc0000000001", "Ape", { system: { details: { cr: 0.5, type: { value: "beast" } } } });
    return { wolfSrc, bearSrc, apeSrc };
  }

  /**
   * Talo, a level-12 Circle of the Stars druid (linked), with Wild Shape (3 uses, 1 spent; three
   * known forms), Starry Form, Wild Companion (spends Wild Shape), Spellcasting, Cure Wounds and
   * Fire Bolt. Options add the revert item, Twinkling Constellations, effects, a token.
   */
  function talo({ revertItem = false, twinkling = false, uses = { max: 3, spent: 1 }, effects = [], statuses = [], tokens = null,
    favorites = [], ownership = { default: 0, [IDS.player]: 3 }, hp = { value: 99, max: 99, temp: 0 } } = {}) {
    const B = beasts();
    const profiles = [
      { _id: "p1", name: "Dire Wolf", uuid: B.wolfSrc.uuid },
      { _id: "p2", name: "Brown Bear", uuid: B.bearSrc.uuid },
      { _id: "p3", name: "", uuid: B.apeSrc.uuid }
    ];
    const items = [
      { id: "clsDruid0000001", name: "Druid", type: "class", system: { levels: 12, hd: { spent: 2 } } },
      { id: IDS.ws, name: "Wild Shape", type: "feat", img: "ws.webp",
        system: { type: { value: "class" }, uses: { ...uses, recovery: [{ period: "lr", type: "recoverAll" }, { period: "sr", type: "formula", formula: "1" }] } },
        activities: [wsActivity(profiles)] },
      { id: IDS.starry, name: "Starry Form", type: "feat", img: "starry.webp",
        system: { identifier: "starry-form", type: { value: "class" } },
        activities: [
          { _id: "sfConsume", name: "Consume Wild Shape", type: "utility", activation: { type: "bonus" }, consumption: { targets: [{ type: "itemUses", target: IDS.ws }] } },
          { _id: "sfArcher", name: "Archer", type: "attack", img: "systems/dnd5e/icons/svg/activity/attack.svg", activation: { type: "bonus" },
            labels: { toHit: "+9", damage: [{ label: "2d8 + 5 Radiant" }] } },
          { _id: "sfChalice", name: "Chalice", type: "heal", img: "chalice-custom.webp", activation: { type: "special" }, labels: { damage: [{ formula: "2d8 + 5" }] } },
          { _id: "sfDragon", name: "Dragon", type: "utility", activation: { type: "special" } }
        ],
        effects: [
          { id: "sfBaseEffect0001", name: "Starry Form", img: "sf.webp", changes: [], flags: { core: { keep: true } }, _stats: { x: 1 }, sort: 5, folder: null },
          { id: "sfDragonEffect01", name: "Starry Form: Dragon", changes: [{ key: "flags.dnd5e.floor", value: "10" }] },
          { id: "sfDragonFly00001", name: "Starry Form: Dragon (Twinkling)", changes: [{ key: "system.attributes.movement.speeds.fly", value: "20" }] }
        ] },
      { id: IDS.companion, name: "Wild Companion", type: "feat", system: { type: { value: "class" } },
        activities: [{ _id: "wc1", type: "summon", activation: { type: "action" }, consumption: { targets: [{ type: "itemUses", target: IDS.ws }] } }] },
      { id: IDS.spellcasting, name: "Spellcasting", type: "feat", system: { identifier: "spellcasting", type: { value: "class" } } },
      { id: IDS.cure, name: "Cure Wounds", type: "spell", system: { level: 1, uses: { max: 0, spent: 0 } },
        activities: [{ _id: "cw1", type: "heal", activation: { type: "action" }, consumption: { targets: [] } }] },
      { id: IDS.fireBolt, name: "Fire Bolt", type: "spell", system: { level: 0 },
        activities: [{ _id: "fb1", type: "attack", activation: { type: "action" } }] },
      ...(twinkling ? [{ id: IDS.twinkling, name: "Twinkling Constellations", type: "feat", system: { identifier: "twinkling-constellations", type: { value: "class" } } }] : []),
      ...(revertItem ? [{ id: IDS.revert, name: "Return to Normal Form", type: "feat", img: "rn.webp", flags: { [MODULE]: { revert: true } },
        system: { type: { value: "class" } }, activities: [{ _id: "rn1", type: "utility", activation: { type: "bonus" } }] }] : [])
    ];
    const a = makeActor({ id: IDS.talo, name: "Talo", img: "talo.webp", items, effects, statuses, ownership, hp,
      system: { favorites, attributes: { exhaustion: 0, inspiration: false } } });
    Object.defineProperty(a, "classes", { value: { druid: a.items.get("clsDruid0000001") }, enumerable: false });
    a._tokens = tokens ?? [makeToken({ id: "taloToken0000001", name: "Talo", actorId: a.id, actorLink: true })];
    for (const t of a._tokens) t.stopAnimation = (o) => F.calls.push({ op: "stopAnimation", token: t.id, o });
    add(a);
    return { talo: a, ...B, profiles };
  }

  return { makeActor, makeItem, makeEffect, makeActivity, add, talo, beasts, beast, makeUser, makeScene, makeToken };
}

/** "a.b.c": v → nested assignment (a doc's embedded update). */
function applyFlat(doc, changes) {
  for (const [path, value] of Object.entries(changes)) {
    const parts = path.split(".");
    const leaf = parts.pop();
    let node = doc;
    for (const p of parts) node = node[p] ??= {};
    node[leaf] = value;
  }
}

/**
 * dnd5e Activity#use, as far as the module sees it: preUseActivity (vetoable, with a messageConfig),
 * item-use consumption, postUseActivity with the results. `activity.useResult` overrides the result.
 */
async function useActivity(F, activity, usage = {}, dialog = {}, message = {}) {
  F.calls.push({ op: "activity.use", item: activity.item.id, activity: activity.id, usage: F.plain(usage), dialog: F.plain(dialog), message: F.plain(message) });
  const messageConfig = { create: true, ...message };
  if (F.Hooks.call("dnd5e.preUseActivity", activity, usage, dialog, messageConfig) === false) return undefined;
  if (activity.useResult !== undefined) return activity.useResult;
  for (const t of activity.consumption?.targets ?? []) {
    if (t.type !== "itemUses") continue;
    const it = t.target ? activity.actor?.items?.get(t.target) : activity.item;
    if (it?.system?.uses) await it.update({ "system.uses.spent": (it.system.uses.spent ?? 0) + 1 });
  }
  const results = { message: messageConfig.create ? { flags: {} } : null, messageConfig };
  F.Hooks.callAll("dnd5e.postUseActivity", activity, usage, results);
  return results;
}

export { makeDoc, makeUser, makeScene, makeToken, StubCollection };
