/**
 * The test world for pentaryn-combat's glue: the kit's Foundry stub, the fake DOM, the Argon
 * stand-in, and factories for actors, items, activities, effects, tokens, combats and chat
 * messages, as dnd5e 6 shapes them (synthetic ids only).
 *
 * Fidelity points:
 *  - `actor.update` honours v14's ForcedReplacement (`_replace(v)`): the path is replaced, not merged
 *    (the stub alone would store the operator object), before the update hooks fire. The F.calls
 *    record shows `{"<replace>": v}`.
 *  - `activity.use` / `rollAttack` / `rollDamage` fire dnd5e's hooks in dnd5e's order
 *    (`dnd5e.postUseActivity`; `dnd5e.preRollAttackV2` → `dnd5e.postRollAttack`;
 *    `dnd5e.preRollDamageV2` → `dnd5e.rollDamageV2`) and post chat messages; each is scripted per
 *    activity (`act.script.use / attack / damage`, arrays consumed in order; `null` = cancelled).
 *  - `game.user.targets` is a Set with `first()`; `canvas.tokens.setTargets` replaces it.
 */

import { readFileSync } from "node:fs";
import { installFoundry, makeDoc, StubCollection } from "../kit/foundry-stub.mjs";
import { installDom } from "./dom.mjs";
import { installArgon } from "./argon.mjs";

export const MODULE = "pentaryn-combat";
export const LANG = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));
export const GM_ID = "gmUser0000000001";
export const PLAYER_ID = "player0000000001";

/** Let pending promise chains and immediates settle (setImmediate is never mocked here). */
export async function drain(n = 6) {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
}

class TargetSet extends Set {
  first() { return this.values().next().value; }
}

let W = null;

/**
 * Install everything. `gm` false = a player client (the GM is another, active user).
 * @returns {Promise<object>} W: { F, doc, argon, scene, actors, … }
 */
export async function setupWorld({ gm = true, aoe = false, aoeAutoDamage = false, settings = {}, argonModule = true } = {}) {
  const doc = installDom();
  const modules = [MODULE, ...(argonModule ? ["enhancedcombathud", "enhancedcombathud-dnd5e"] : [])];
  if (aoe) modules.push("pentaryn-aoe");
  const F = await installFoundry({
    user: gm ? undefined : { id: PLAYER_ID, name: "Player", isGM: false },
    users: gm ? [{ id: PLAYER_ID, name: "Player", isGM: false }] : [{ id: GM_ID, name: "Gamemaster", isGM: true }],
    lang: LANG,
    modules,
    settings,
  });

  /* other packages' settings the module reads */
  const reg = (ns, key, def, scope = "client") => F.game.settings.register(ns, key, { scope, config: false, type: Boolean, default: def });
  if (argonModule) {
    reg("enhancedcombathud", "rangepicker", true);
    reg("enhancedcombathud", "alwaysOn", false);
    reg("enhancedcombathud", "targetPickerGuideShown", false);
  }
  if (aoe) reg("pentaryn-aoe", "autoDamageOnHit", aoeAutoDamage, "world");
  F.calls.length = 0;

  /* scene, canvas, combats */
  const scene = makeDoc("Scene", { id: "sceneArena000001", name: "Arena", active: true });
  scene.collection = F.game.scenes;
  F.game.scenes.set(scene.id, scene);
  const placeables = [];
  Object.assign(F.canvas, {
    ready: true,
    scene,
    tokens: {
      placeables,
      controlled: [],
      get: id => placeables.find(t => t.id === id) ?? null,
      setTargets(ids, opts) {
        F.calls.push({ op: "canvas.setTargets", ids: [...ids], opts: F.plain(opts) });
        F.game.user.targets.clear();
        for (const id of ids) { const t = placeables.find(p => p.id === id); if (t) F.game.user.targets.add(t); }
      },
    },
    grid: {
      size: 100, distance: 5,
      measurePath: ([a, b]) => ({ distance: Math.round(Math.hypot(a.x - b.x, a.y - b.y) / 100) * 5 }),
    },
  });
  F.game.combats = new StubCollection();
  F.game.combat = null;
  F.game.user.targets = new TargetSet();
  F.game.user.character = null;
  for (const u of F.game.users) if (!u.targets) u.targets = new TargetSet();
  F.game.tooltip = {
    tooltip: null, element: null,
    deactivate() { F.calls.push({ op: "tooltip.deactivate" }); },
  };

  /* dnd5e / core classes the module reaches for */
  class Roll {
    constructor(formula, data) { this.formula = formula; this.data = data; }
    get isDeterministic() { return !/d\d/.test(this.formula); }
    evaluateSync() {
      // eslint-disable-next-line no-new-func
      this.total = Function(`"use strict"; return (${this.formula.replace(/@([\w.]+)/g, (_, p) => JSON.stringify(F.foundry.utils.getProperty(this.data, p) ?? 0)).replace(/floor/g, "Math.floor")});`)();
      return this;
    }
    static replaceFormulaData(ref, data) {
      return String(F.foundry.utils.getProperty(data, ref.replace(/^@/, "")) ?? ref);
    }
  }
  const ChatMessage = {
    create: async data => {
      F.calls.push({ op: "ChatMessage.create", data: F.plain(data) });
      return makeMessage({ type: "base", ...data });
    },
    getSpeaker: ({ actor } = {}) => ({ actor: actor?.id ?? null, alias: actor?.name ?? null }),
  };
  const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  def("Roll", Roll);
  def("ChatMessage", ChatMessage);
  F.CONFIG.Dice = { D20Roll: { ADV_MODE: { NORMAL: 0, ADVANTAGE: 1, DISADVANTAGE: -1 } } };
  F.CONFIG.DND5E = {
    conditionTypes: { prone: { reference: "Compendium.dnd5e.rules.JournalEntry.c.JournalEntryPage.prone" } },
    statusEffects: { dodging: { reference: "Compendium.dnd5e.rules.JournalEntry.c.JournalEntryPage.dodging" } },
  };

  class RollResolver { constructor() { this.element = document.createElement("div"); this.position = { zIndex: 100 }; } }
  class DisplayObject {
    constructor() { this.transform = { x: 0, y: 0 }; this.destroyed = false; this.destroyCalls = 0; }
    get x() { return this.transform.x; }
    set x(v) { this.transform.x = v; }
    get y() { return this.transform.y; }
    set y(v) { this.transform.y = v; }
    destroy() { this.destroyCalls += 1; this.destroyed = true; this.transform = null; }
  }
  class PreciseText extends DisplayObject {}
  class InterfaceCanvasGroup {
    createScrollingText(origin, text) { F.calls.push({ op: "createScrollingText", text }); return Promise.resolve("shown"); }
  }
  class ChatLog {
    notify(message, options = {}) { F.calls.push({ op: "ChatLog.notify", id: message?.id ?? null, options: F.plain(options) }); return "notified"; }
  }
  Object.assign(F.foundry.applications, {
    instances: new Map(),
    dice: { RollResolver },
    ux: { TextEditor: { implementation: { enrichHTML: async s => `[enriched]${s}` } } },
    sidebar: { tabs: { ChatLog } },
  });
  F.foundry.canvas.containers = { PreciseText };
  F.foundry.canvas.groups = { InterfaceCanvasGroup };
  F.ui.chat = { updateMessage: m => F.calls.push({ op: "chat.updateMessage", id: m?.id ?? null }) };

  const argon = installArgon(F);

  /* uuids of embedded items and activities */
  const stubFromUuid = globalThis.fromUuidSync;
  const resolve = uuid => {
    const s = String(uuid ?? "");
    if (W.uuids.has(s)) return W.uuids.get(s);
    const m = /^Actor\.([^.]+)\.Item\.([^.]+)(?:\.Activity\.([^.]+))?$/.exec(s);
    if (m) {
      const item = F.game.actors.get(m[1])?.items?.get(m[2]) ?? null;
      return m[3] ? item?.system?.activities?.get(m[3]) ?? null : item;
    }
    return stubFromUuid(s);
  };
  def("fromUuidSync", (uuid) => resolve(uuid));
  def("fromUuid", async (uuid) => resolve(uuid));

  /*
   * Actor.implementation.updateDocuments (ac-5: the orphan sweep's one batch). F.calls records ONE
   * {op: "Actor.updateDocuments", updates}; each row is applied through its actor's own update (so
   * the pre/update hooks fire per document, as Foundry's batch does, and a test's update override
   * still bites) and that per-document record is taken back out of F.calls.
   */
  const ActorClass = {
    async updateDocuments(updates = [], options = {}) {
      F.calls.push({ op: "Actor.updateDocuments", updates: F.plain(updates) });
      const out = [];
      for (const { _id, ...changes } of updates) {
        const a = F.game.actors.get(_id);
        if (!a) continue;
        const at = F.calls.length;
        out.push(await a.update(changes, options));
        const i = F.calls.findIndex((c, k) => k >= at && c.op === "update" && c.uuid === a.uuid);
        if (i >= 0) F.calls.splice(i, 1);
      }
      return out;
    },
  };
  ActorClass.implementation = ActorClass;
  def("Actor", ActorClass);

  W = { F, doc, argon, scene, placeables, uuids: new Map(), TargetSet, RollResolver, PreciseText, DisplayObject, InterfaceCanvasGroup, ChatLog };
  return W;
}

/* ── documents ─────────────────────────────────────────────────────────── */

function defineHidden(obj, props) {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(obj, k, { value: v, enumerable: false, writable: true, configurable: true });
}

/** v14 ForcedReplacement on top of the stub's update: delete the path first, write the plain value, log a marker. */
function replacingUpdate(doc) {
  const base = doc.update;
  defineHidden(doc, {
    async update(changes = {}, options = {}) {
      const { F } = W;
      const FR = F.foundry.data.operators.ForcedReplacement;
      const plain = {};
      const logged = {};
      for (const [k, v] of Object.entries(changes)) {
        if (v instanceof FR) {
          // replace, as Foundry does: the stored value becomes exactly v.value (empty objects kept)
          const parts = k.split(".");
          const leaf = parts.pop();
          let node = this;
          for (const p of parts) node = node[p] ??= {};
          node[leaf] = structuredClone(v.value);
          plain[k] = structuredClone(v.value);
          logged[k] = { "<replace>": F.plain(v.value) };
        } else {
          plain[k] = v;
          logged[k] = v;
        }
      }
      const at = F.calls.length;
      const out = base.call(this, plain, options);
      const rec = F.calls.slice(at).find(c => c.op === "update" && c.uuid === this.uuid);
      if (rec) rec.changes = F.plain(logged);
      return out;
    },
  });
}

let effectSeq = 0;

/** An ActiveEffect on an actor (or item). */
export function makeEffect(parent, { id, name = "Effect", statuses = [], disabled = false, isSuppressed = false, isTemporary = false,
  flags = {}, system = {}, img = "icons/svg/aura.svg", description = "", isConcealed = false, origin = null, stats = {} } = {}) {
  const e = makeDoc("ActiveEffect", { id: id ?? `effect${String(++effectSeq).padStart(11, "0")}`, name, disabled, isSuppressed, flags, system, img, description, origin }, { parent });
  defineHidden(e, {
    statuses: new Set(statuses),
    isTemporary,
    isConcealed,
    _stats: stats,
  });
  Object.defineProperty(e, "active", { get() { return !this.disabled && !this.isSuppressed; }, enumerable: false, configurable: true });
  const baseDelete = e.delete;
  defineHidden(e, {
    async delete(options = {}) {
      parent?.effects?.delete?.(this.id);
      return baseDelete.call(this, options);
    },
  });
  return e;
}

let activitySeq = 0;

/** An Activity on an item. `script` = { use: [], attack: [], damage: [] } consumed in order. */
export function makeActivity(item, spec = {}) {
  const {
    id = `act${String(++activitySeq).padStart(13, "0")}`, type = "attack", name = type, activation = "action",
    classification = "weapon", attackType = "melee", labels, range = { value: 5, long: null }, damage = [],
    target = { affects: { type: "" } }, applicableEffects = [], ability = "", script = {},
  } = spec;
  const act = {
    id, type, name, ability,
    activation: { type: activation },
    attack: type === "attack" ? { type: { classification, value: attackType } } : undefined,
    labels: labels ?? (type === "attack" ? { toHit: "+5", damage: [{ label: "1d8 + 3 Slashing" }] } : {}),
    range,
    damage: { parts: damage },
    target,
    applicableEffects,
    script: { use: [], attack: [], damage: [], ...script },
  };
  Object.defineProperty(act, "item", { value: item, enumerable: false });
  Object.defineProperty(act, "actor", { get: () => item.actor, enumerable: false });
  Object.defineProperty(act, "uuid", { get: () => `${item.uuid}.Activity.${id}`, enumerable: false });
  defineHidden(act, {
    async use(usage = {}, dialog = {}, message = {}) {
      const { F } = W;
      F.calls.push({ op: "activity.use", activity: this.uuid, usage: F.plain(usage), dialog: F.plain(dialog), message: F.plain(message) });
      let next = this.script.use.length ? this.script.use.shift() : {};
      if (typeof next === "function") next = await next(usage);
      if (next === null) return undefined;
      const msg = makeMessage({ type: "usage", author: F.game.user, system: { deltas: next.deltas ?? {} }, speaker: { actor: this.actor?.id } });
      const results = { message: msg, templates: next.templates ?? [] };
      F.Hooks.callAll("dnd5e.postUseActivity", this, { ...usage, ...(next.usage ?? {}) }, results);
      return results;
    },
    async rollAttack(config = {}, dialog = {}, message = {}) {
      const { F } = W;
      const { event, ...rest } = config;
      F.calls.push({ op: "activity.rollAttack", activity: this.uuid, config: F.plain(rest), event: !!event, dialog: F.plain(dialog), message: F.plain(message) });
      const cfg = { ...config, subject: this };
      const msgCfg = { ...message, data: { ...(message.data ?? {}) } };
      if (F.Hooks.call("dnd5e.preRollAttackV2", cfg, dialog, msgCfg) === false) return null;
      let next = this.script.attack.length ? this.script.attack.shift() : { total: 15 };
      if (typeof next === "function") next = await next(cfg, msgCfg);
      if (next === null) return null;
      const roll = {
        total: next.total ?? 15, isCritical: !!next.isCritical,
        hasAdvantage: !!next.hasAdvantage, hasDisadvantage: !!next.hasDisadvantage,
        options: { attackMode: cfg.attackMode ?? null, advantageMode: next.advantageMode ?? 0 },
      };
      const targets = [...F.game.user.targets].map(t => ({ uuid: t.actor?.uuid ?? null, token: t.document?.uuid ?? null, actor: t.actor?.uuid ?? null, name: t.name }));
      const msg = makeMessage({
        type: "attack", author: F.game.user, rolls: [roll],
        system: { origin: msgCfg.data?.system?.origin ?? null, targets, activity: { uuid: this.uuid, type: "attack" }, mode: cfg.attackMode ?? null },
        flags: msgCfg.data?.flags ?? {}, speaker: { actor: this.actor?.id },
      });
      Object.defineProperty(roll, "parent", { value: msg, enumerable: false });
      F.Hooks.callAll("dnd5e.postRollAttack", [roll], { subject: this });
      return [roll];
    },
    async rollDamage(config = {}, dialog = {}, message = {}) {
      const { F } = W;
      const { event, ...rest } = config;
      F.calls.push({ op: "activity.rollDamage", activity: this.uuid, config: F.plain(rest), event: !!event, dialog: F.plain(dialog), message: F.plain(message) });
      const cfg = { ...config, subject: this, rolls: [{ parts: [...(this.script.parts ?? ["1d8", "@mod"])], data: { mod: 3 }, options: {} }] };
      const msgCfg = { ...message, data: { ...(message.data ?? {}) } };
      if (F.Hooks.call("dnd5e.preRollDamageV2", cfg, dialog, msgCfg) === false) return null;
      F.calls.push({ op: "damage.parts", parts: cfg.rolls.map(r => [...r.parts]), options: F.plain(cfg.rolls.map(r => r.options)), flags: F.plain(msgCfg.data?.flags ?? null) });
      let next = this.script.damage.length ? this.script.damage.shift() : { total: 8 };
      if (typeof next === "function") next = await next(cfg, msgCfg);
      if (next === null) return null;
      const roll = { total: next.total ?? 8, options: {}, dice: next.dice ?? [] };
      F.Hooks.callAll("dnd5e.rollDamageV2", [roll], { subject: this });
      return [roll];
    },
  });
  return act;
}

let itemSeq = 0;

/** An item owned by an actor. Activities: specs for makeActivity (an item gets none by default). */
export function makeItem(actor, { id, name = "Item", type = "weapon", img = "icons/weapons/sword.webp", system = {}, flags = {}, activities = [], effects = [] } = {}) {
  const item = makeDoc("Item", { id: id ?? `item${String(++itemSeq).padStart(12, "0")}`, name, type, img, system: { ...system }, flags }, { parent: actor });
  Object.defineProperty(item, "actor", { get() { return this.parent; }, enumerable: false, configurable: true });
  Object.defineProperty(item, "isOwner", { get() { return !!this.parent?.isOwner; }, enumerable: false, configurable: true });
  item.system.activities = new Map();
  for (const spec of activities) {
    const a = makeActivity(item, spec);
    item.system.activities.set(a.id, a);
  }
  defineHidden(item, { effects: new StubCollection(effects.map(e => makeEffect(item, e))) });
  return item;
}

/** A weapon: `props` like "lgt fin thr"; `mastery` the weapon's mastery (and hasMastery). */
export function weapon(id, name, { props = "", mastery = null, attackType = "melee", equipped = true, activation = "action", quantity = 1,
  baseItem = null, img, classification = "weapon", identifier, damageTypes = ["slashing"], labels, range } = {}) {
  return {
    id, name, type: "weapon", img: img ?? `icons/weapons/${id}.webp`,
    system: {
      properties: new Set(props.split(/\s+/).filter(Boolean)), equipped, quantity, mastery,
      masteryOptions: mastery ? new Set([mastery]) : null, attackType,
      type: { value: "martialM", baseItem: baseItem ?? name.toLowerCase() },
      identifier: identifier ?? name.toLowerCase().replace(/\s+/g, "-"),
      damage: { base: { types: new Set(damageTypes) } },
      range: { reach: 5 },
    },
    activities: [{ id: `${id}Atk`.slice(0, 16), type: "attack", activation, classification, attackType, labels, range }],
  };
}

/** A feature item (class feature or feat). */
export function feat(id, name, { identifier, activities = [], uses = null, effects = [], img } = {}) {
  return {
    id, name, type: "feat", img: img ?? `icons/feats/${id}.webp`,
    system: { identifier: identifier ?? name.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, "-"), ...(uses ? { uses } : {}), type: { value: "class" } },
    activities, effects,
  };
}

let actorSeq = 0;

/** An actor in game.actors with items, effects and the embedded-document API. */
export function makeActor({ id, name = "Actor", type = "character", items = [], effects = [], system = {}, flags = {}, owner = true,
  polymorphed = false, statuses = [], img = "icons/svg/mystery-man.svg", ownership } = {}) {
  const { F } = W;
  const a = makeDoc("Actor", {
    id: id ?? `actor${String(++actorSeq).padStart(11, "0")}`, name, type, img, flags,
    system: { attributes: { movement: { walk: 30, units: "ft" }, hp: { value: 20, max: 20, temp: 0 }, death: { failure: 0 } }, scale: {}, ...system },
    ...(ownership ? { ownership } : {}),
  }, { collection: F.game.actors });
  replacingUpdate(a);
  defineHidden(a, {
    _owner: owner,
    isPolymorphed: polymorphed,
    statuses: new Set(statuses),
    token: null,
    _tokens: [],
    skillScript: [],
    getRollData() { return { scale: this.system.scale, prof: 2 }; },
    getActiveTokens() { return [...this._tokens]; },
    allApplicableEffects() { return this.effects.contents; },
    async createEmbeddedDocuments(type, data) {
      F.calls.push({ op: "createEmbedded", type, uuid: this.uuid, data: F.plain(data) });
      const docs = data.map(d => makeEffect(this, { ...d, statuses: d.statuses ?? [] }));
      for (const d of docs) {
        this.effects.set(d.id, d);
        F.Hooks.callAll(`create${type}`, d, {}, F.game.user.id);
      }
      return docs;
    },
    async deleteEmbeddedDocuments(type, ids) {
      F.calls.push({ op: "deleteEmbedded", type, uuid: this.uuid, ids: [...ids] });
      const out = [];
      for (const id of ids) {
        const d = this.effects.get(id);
        if (!d) continue;
        this.effects.delete(id);
        out.push(d);
        F.Hooks.callAll(`delete${type}`, d, {}, F.game.user.id);
      }
      return out;
    },
    async toggleStatusEffect(status, { active } = {}) {
      F.calls.push({ op: "toggleStatusEffect", uuid: this.uuid, status, active: active ?? null });
      if (active ?? !this.statuses.has(status)) this.statuses.add(status); else this.statuses.delete(status);
      return true;
    },
    async rollSkill(config) {
      F.calls.push({ op: "rollSkill", uuid: this.uuid, config: F.plain(config) });
      const next = this.skillScript.shift();
      if (next instanceof Error) throw next;
      return next === undefined ? [{ total: 12 }] : next;
    },
  });
  Object.defineProperty(a, "isOwner", { get() { return this._owner; }, set(v) { this._owner = v; }, enumerable: false, configurable: true });
  defineHidden(a, { items: new StubCollection(items.map(spec => makeItem(a, spec))) });
  defineHidden(a, { effects: new StubCollection(effects.map(e => makeEffect(a, e))) });
  F.game.actors.set(a.id, a);
  return a;
}

/** A chat message in game.messages (created by the test, not through ChatMessage.create's log). */
export function makeMessage({ id, type = "base", author = null, system = {}, flags = {}, rolls = [], speaker = {}, timestamp, content = "", _source } = {}) {
  const { F } = W;
  const m = makeDoc("ChatMessage", {
    id: id ?? `msg${String(F.game.messages.size + 1).padStart(13, "0")}`, type, system, flags, speaker, content,
    timestamp: timestamp ?? Date.now(),
  }, { collection: F.game.messages });
  defineHidden(m, {
    author,
    rolls,
    _source: _source ?? { system: structuredClone(F.plain(system)) },
    getAssociatedActivity() { const u = this.system?.activity?.uuid; return u ? globalThis.fromUuidSync(u) : null; },
    getAssociatedActor() { return F.game.actors.get(this.speaker?.actor) ?? null; },
  });
  Object.defineProperty(m, "isAuthor", { get() { return this.author?.id === F.game.user.id; }, enumerable: false, configurable: true });
  Object.defineProperty(m, "isOwner", { get() { return F.game.user.isGM || this.isAuthor; }, enumerable: false, configurable: true });
  F.game.messages.set(m.id, m);
  return m;
}

/** A placeable token for an actor, on the current scene (added to canvas.tokens.placeables). */
export function makeToken(actor, { id, x = 0, y = 0, width = 1, disposition = 1, hidden = false, controlled = false, owner = true, scene } = {}) {
  const { F, placeables } = W;
  const tid = id ?? `tok${actor.id}`.slice(0, 16);
  const sc = scene ?? F.canvas.scene;
  const document = { id: tid, uuid: `Scene.${sc?.id}.Token.${tid}`, disposition, hidden, width, parent: sc, flags: {}, actor };
  const t = {
    id: tid, name: actor.name, actor, document, scene: sc,
    center: { x: x * 100 + 50, y: y * 100 + 50 },
    controlled, destroyed: false, isOwner: owner,
    layer: { active: true }, isInteractable: true,
    _canControl: () => true,
    control(opts) { F.calls.push({ op: "token.control", id: this.id, opts: F.plain(opts) }); this.controlled = true; return true; },
    setTarget(on, opts) { F.calls.push({ op: "token.setTarget", id: this.id, on, opts: F.plain(opts) }); if (on) F.game.user.targets.add(this); else F.game.user.targets.delete(this); },
  };
  document.object = t;
  W.uuids.set(document.uuid, document);
  placeables.push(t);
  actor._tokens.push(t);
  return t;
}

/**
 * A started combat in game.combats; `entries` = [{ id, actor, token? }]. `game.combat` (the viewed
 * one) becomes it unless `viewed: false`.
 */
export function makeCombat({ id = "combat0000000001", round = 1, turn = 0, started = true, active = true, scene, entries = [], viewed = true } = {}) {
  const { F } = W;
  const c = makeDoc("Combat", { id, round, turn, started, active }, { collection: F.game.combats });
  const combatants = new StubCollection(entries.map(e => ({ id: e.id, actor: e.actor, token: e.token?.document ?? null, name: e.actor?.name })));
  defineHidden(c, { combatants, scene: scene ?? F.canvas.scene });
  Object.defineProperty(c, "combatant", { get() { return this.combatants.contents[this.turn] ?? null; }, enumerable: false, configurable: true });
  F.game.combats.set(c.id, c);
  if (viewed) F.game.combat = c;
  return c;
}

/** Move a combat on (writes round/turn, no hooks). */
export function setTurn(c, { round = c.round, turn = c.turn } = {}) {
  c.round = round;
  c.turn = turn;
}

export function world() {
  return W;
}

/**
 * Record console.warn / error / info / table instead of printing. Each line:
 * `{ level, text, err }` (`err` = the second argument's message, when there is one).
 */
export function captureConsole() {
  const lines = [];
  for (const level of ["warn", "error", "info", "table", "log"]) {
    console[level] = (...args) => lines.push({
      level,
      text: typeof args[0] === "string" ? args[0] : args[0] instanceof Error ? `Error: ${args[0].message}` : JSON.stringify(args[0]),
      err: args[1] instanceof Error ? args[1].message : args.length > 1 ? JSON.stringify(args[1]) : null,
    });
  }
  return lines;
}
