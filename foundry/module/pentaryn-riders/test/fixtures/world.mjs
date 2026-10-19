/**
 * A synthetic dnd5e world for the riders glue (never real campaign data: test/ ships to Data/).
 *
 *   const W = await setupWorld();          // installs the Foundry stub, the DOM and dnd5e/Argon stand-ins
 *   await import("../riders.mjs");         // the unchanged entry, exactly as Foundry loads it
 *   W.F.fire("init"); W.F.fire("ready");
 *
 * What is here, beyond test/kit/foundry-stub.mjs:
 * - Actors and Items built with `makeDoc`, with the dnd5e surface riders reads: `items`, `classes`,
 *   `spellcastingClasses`, `isOwner`, `applyDamage`, `endConcentration`, item activities with
 *   `createActivity` / `updateActivity` / `deleteActivity`. `instanceof Actor` is by documentName.
 * - `foundry.dice.terms` (Die, OperatorTerm, NumericTerm, StringTerm), a recording `Roll`,
 *   `ChatMessage`, `CONFIG.DND5E` (damage/healing types, a SummonActivity class), Argon's
 *   `ButtonPanelButton`, `TextEditor.implementation.enrichHTML`, `DialogV2.wait`, `CSS.escape`,
 *   `requestAnimationFrame` (queued, flushed by the test).
 * - `W.log`: an ordered record of every stand-in call (writes, rolls, dialogs, notifications are
 *   in `F.calls`). `W.lines`: console output as `[level, text, errorMessage?]`.
 */

import { readFileSync } from "node:fs";
import { StubCollection, installFoundry, makeDoc, makeUser } from "../kit/foundry-stub.mjs";
import { installDom, FakeElement, html } from "./dom.mjs";

export const MODULE = "pentaryn-riders";
export const ROOT = new URL("../../", import.meta.url);
export const MANIFEST = JSON.parse(readFileSync(new URL("module.json", ROOT), "utf8"));
export const LANG = JSON.parse(readFileSync(new URL("lang/en.json", ROOT), "utf8"));

export const IDS = Object.freeze({
  gm: "gmUser0000000001",
  gm2: "gmUser0000000002",
  player: "player0000000001",
  sorc: "sorcerer00000001",
  druid: "druid00000000001",
  healer: "healer0000000001",
  npc: "npcgrisk00000001",
  wiz: "wizard0000000001",
  noHd: "nohitdice0000001",
});

/** Microtasks only: lets awaited stand-ins settle without touching a clock. */
export async function drain(n = 60) {
  for (let i = 0; i < n; i++) await null;
}

/* ── dice ─────────────────────────────────────────────────────────────────── */

export class Die {
  constructor({ number = 1, faces = 6, modifiers = [], options = {} } = {}) {
    Object.assign(this, { number, faces, modifiers: [...modifiers], options: { ...options } });
  }
  get flavor() { return this.options.flavor ?? ""; }
}
export class OperatorTerm {
  constructor({ operator = "+", options = {} } = {}) { Object.assign(this, { operator, options }); }
  get flavor() { return ""; }
}
export class NumericTerm {
  constructor({ number = 0, options = {} } = {}) { Object.assign(this, { number, options: { ...options } }); }
  get flavor() { return this.options.flavor ?? ""; }
}
export class StringTerm {
  constructor({ term = "", options = {} } = {}) { Object.assign(this, { term, options }); }
  get flavor() { return this.options.flavor ?? ""; }
}

const fl = f => (f ? `[${f}]` : "");
export function formulaOf(terms) {
  return terms.map(t => {
    if (t instanceof OperatorTerm) return ` ${t.operator} `;
    if (t instanceof Die) return `${t.number}d${t.faces}${t.modifiers.join("")}${fl(t.flavor)}`;
    if (t instanceof NumericTerm) return `${t.number}${fl(t.flavor)}`;
    return t.term;
  }).join("").trim();
}

/** A damage roll as dnd5e hands it to postDamageRollConfiguration. Parts: "8d6[fire]", "+", "4". */
export class FakeRoll {
  constructor(terms, options = {}) {
    this.terms = terms;
    this.options = options;
    this.resets = 0;
    this.formula = formulaOf(terms);
  }
  resetFormula() {
    this.resets += 1;
    this.formula = formulaOf(this.terms);
  }
}

/** "2d6min2[fire] + 3[Elemental Affinity]" → a FakeRoll with real-ish term objects. */
export function roll(formula, options = {}) {
  const terms = [];
  for (const tok of formula.split(/\s+/).filter(Boolean)) {
    let m = /^(\d*)d(\d+)((?:[a-z]+\d*)*)(?:\[([^\]]*)\])?$/i.exec(tok);
    if (m) {
      terms.push(new Die({ number: m[1] === "" ? 1 : Number(m[1]), faces: Number(m[2]), modifiers: m[3] ? m[3].match(/[a-z]+\d*/gi) : [], options: m[4] ? { flavor: m[4] } : {} }));
      continue;
    }
    if ("+-*/".includes(tok)) { terms.push(new OperatorTerm({ operator: tok })); continue; }
    m = /^(\d+)(?:\[([^\]]*)\])?$/.exec(tok);
    if (m) { terms.push(new NumericTerm({ number: Number(m[1]), options: m[2] ? { flavor: m[2] } : {} })); continue; }
    terms.push(new StringTerm({ term: tok }));
  }
  return new FakeRoll(terms, options);
}

/* ── documents ────────────────────────────────────────────────────────────── */

let W = null;   // the installed world, for stand-ins built before/after install
const logOp = (op, data = {}) => W?.log.push({ op, ...data });

function activityCollection(list, item) {
  const coll = new StubCollection();
  for (const a of list) coll.set(a.id, attachActivity(a, item));
  return coll;
}

function attachActivity(a, item) {
  const act = { flags: {}, ...a };
  Object.defineProperty(act, "item", { value: item, enumerable: false, configurable: true });
  Object.defineProperty(act, "actor", { get: () => item?.parent ?? null, enumerable: false, configurable: true });
  return act;
}

/**
 * An Item on `actor` (or unowned). `activities` is an array of plain activity objects
 * ({ id, type, name, damage, consumption, activation, ... }); they get `item` and `actor`.
 */
export function makeItem(data = {}, actor = null) {
  const { activities = [], ...rest } = data;
  const item = makeDoc("Item", { type: "feat", img: "icons/svg/item-bag.svg", ...rest, system: { ...(rest.system ?? {}) } }, { parent: actor });
  item.system.activities = activityCollection(activities, item);
  Object.defineProperties(item, {
    actor: { get() { return this.parent; }, enumerable: false },
    isOwner: { get() { return this.parent ? this.parent.isOwner : true; }, enumerable: false },
    getRollData: { value() { return { item: { level: this.system.level ?? 0, name: this.name } }; }, enumerable: false },
    createActivity: {
      async value(type, data, options) {
        const id = `act${String(this.system.activities.size + 1).padStart(13, "0")}`;
        logOp("createActivity", { item: this.name, type, data: JSON.parse(JSON.stringify(data)), options });
        this.system.activities.set(id, attachActivity({ id, type, ...JSON.parse(JSON.stringify(data)) }, this));
        return this.system.activities.get(id);
      },
      enumerable: false,
    },
    updateActivity: {
      async value(id, data) {
        logOp("updateActivity", { item: this.name, id, data: JSON.parse(JSON.stringify(data)) });
        Object.assign(this.system.activities.get(id), JSON.parse(JSON.stringify(data)));
        return this.system.activities.get(id);
      },
      enumerable: false,
    },
    deleteActivity: {
      async value(id) {
        logOp("deleteActivity", { item: this.name, id });
        this.system.activities.delete(id);
      },
      enumerable: false,
    },
  });
  // An item update that writes `system.activities.<id>` (dnd5e's own deleteActivity form) lands on
  // W.log as `updateItem` and, for a deletion value, drops the activity from the collection.
  const update = item.update;
  item.update = async function (changes = {}, options = {}) {
    const acts = Object.keys(changes).filter(k => k.startsWith("system.activities."));
    if (!acts.length) return update.call(this, changes, options);
    logOp("updateItem", { item: this.name, changes: W?.F?.plain(changes) ?? changes });
    const rest = { ...changes };
    for (const k of acts) {
      delete rest[k];
      const id = k.slice("system.activities.".length).replace(/^-=/, "");
      if (W?.F?.isDeletion(changes[k]) || k.includes(".-=")) this.system.activities.delete(id);
    }
    return update.call(this, rest, options);
  };
  return item;
}

/**
 * An Actor with items. `items` are makeItem data objects. `classes` and `spellcastingClasses`
 * come from its class items, as dnd5e computes them; `isOwner` asks the current user.
 */
export function makeActor({ items = [], ...data } = {}) {
  const actor = makeDoc("Actor", { type: "character", ownership: { default: 0 }, effects: [], ...data, system: structuredClone(data.system ?? {}) });
  const coll = new StubCollection();
  Object.defineProperty(actor, "items", { value: coll, enumerable: false });
  for (const d of items) {
    const it = makeItem(d, actor);
    it.collection = coll;
    coll.set(it.id, it);
  }
  Object.defineProperties(actor, {
    classes: { get() { return Object.fromEntries(this.items.filter(i => i.type === "class").map(i => [i.system.identifier, i])); }, enumerable: false },
    spellcastingClasses: { get() { return Object.fromEntries(Object.entries(this.classes).filter(([, c]) => c.system.spellcasting)); }, enumerable: false },
    isOwner: { get() { return this.testUserPermission(globalThis.game?.user, "OWNER"); }, enumerable: false },
    isToken: { value: false, enumerable: false, writable: true },
    token: { value: null, enumerable: false, writable: true },
    tokens: { value: [], enumerable: false, writable: true },
    getActiveTokens: { value(linked, document) { logOp("getActiveTokens", { actor: this.name, linked, document }); return this.tokens; }, enumerable: false },
    applyDamage: {
      async value(amount) {
        const hp = this.system.attributes.hp;
        const before = hp.value;
        hp.value = Math.max(0, Math.min(hp.max, hp.value - amount));
        logOp("applyDamage", { actor: this.name, amount, before, after: hp.value });
        return this;
      },
      enumerable: false,
    },
    endConcentration: {
      async value() {
        logOp("endConcentration", { actor: this.name });
        return this.concEnded ?? [];
      },
      enumerable: false,
      writable: true,
    },
    // One batched embedded write: a single `updateEmbeddedDocuments` entry on W.log and F.calls;
    // each item still takes its update (hooks fire per item, as in Foundry), unlogged.
    updateEmbeddedDocuments: {
      async value(embeddedName, updates = [], options = {}) {
        const F = W?.F;
        const plain = F?.plain(updates) ?? updates;
        const calls = F?.calls.length ?? 0, logged = W?.log.length ?? 0;
        const coll = embeddedName === "Item" ? this.items : null;
        const done = [];
        for (const { _id, ...changes } of updates) {
          const doc = coll?.get(_id);
          if (doc) done.push(await doc.update(changes, options));
        }
        F?.calls.splice(calls);
        W?.log.splice(logged);
        F?.calls.push({ op: "updateEmbeddedDocuments", documentName: embeddedName, uuid: this.uuid, updates: plain });
        logOp("updateEmbeddedDocuments", { actor: this.name, embeddedName, updates: plain });
        return done;
      },
      enumerable: false,
    },
    getTokenImages: {
      async value() {
        logOp("getTokenImages", { actor: this.name });
        if (this.tokenImagesThrow) throw new Error("no browse");
        return this.tokenImages ?? [];
      },
      enumerable: false,
    },
  });
  return actor;
}

/** A Token placeable as `game.user.targets` holds them. */
export function target(actor, name = actor?.name) {
  return { name, actor, document: { name, actor } };
}

/* ── the cast ─────────────────────────────────────────────────────────────── */

const PB = prof => ({ prof });
const abil = mods => Object.fromEntries(Object.entries(mods).map(([k, mod]) => [k, { mod }]));
const own = { default: 0, [IDS.player]: 3 };

/** Ilsa: sorcerer 5, Elemental Adept (Fire) flagged fire, an untyped Elemental Affinity with two damage activities. */
export function sorcerer() {
  return makeActor({
    id: IDS.sorc, name: "Ilsa Vantrel", type: "character", ownership: own,
    system: { abilities: abil({ cha: 4, wis: 1, int: 0 }), attributes: { hp: { value: 20, max: 32 }, ...PB(3) } },
    items: [
      { id: "sorcclass0000001", name: "Sorcerer", type: "class", system: { identifier: "sorcerer", levels: 5, spellcasting: { progression: "full" }, hd: { denomination: "d6", value: 3, spent: 2 } } },
      { id: "eladept000000001", name: "Elemental Adept (Fire)", type: "feat", system: { identifier: "elemental-adept" }, flags: { [MODULE]: { damageType: "fire" } } },
      {
        id: "elaffin000000001", name: "Elemental Affinity", type: "feat", system: { identifier: "elemental-affinity" },
        activities: [
          { id: "affinfire0000001", type: "damage", name: "Fire", damage: { parts: [{ types: ["fire"] }] } },
          { id: "affincold0000001", type: "damage", name: "Cold", damage: { parts: [{ types: ["cold"] }] } },
        ],
      },
      { id: "fireball00000001", name: "Fireball", type: "spell", system: { level: 3, classIdentifier: "sorcerer" }, activities: [{ id: "fbsave0000000001", type: "save", name: "", damage: { parts: [{ types: ["fire"], bonus: "" }] } }] },
      { id: "scorch0000000001", name: "Scorching Ray", type: "spell", system: { level: 2 }, activities: [{ id: "scatk00000000001", type: "attack", name: "", damage: { parts: [{ types: ["fire"] }] } }] },
      { id: "longsword0000001", name: "Longsword", type: "weapon", system: {}, activities: [{ id: "lsatk00000000001", type: "attack", name: "" }] },
    ],
  });
}

/** Bren: druid 5 with Potent Spellcasting; one cantrip adds WIS by hand. */
export function druid() {
  return makeActor({
    id: IDS.druid, name: "Bren Ashwood", type: "character", ownership: own,
    system: { abilities: abil({ wis: 3, cha: 0 }), attributes: { hp: { value: 30, max: 38 }, ...PB(3) } },
    items: [
      { id: "druidclass000001", name: "Druid", type: "class", system: { identifier: "druid", levels: 7, spellcasting: { progression: "full" }, hd: { denomination: "d8", value: 7, spent: 0 } } },
      { id: "potent0000000001", name: "Elemental Fury: Potent Spellcasting", type: "feat", system: { identifier: "elemental-fury-potent-spellcasting" } },
      { id: "prodflame0000001", name: "Produce Flame", type: "spell", system: { level: 0 }, activities: [{ id: "pfatk00000000001", type: "attack", name: "", damage: { parts: [{ types: ["fire"], bonus: "" }] } }] },
      { id: "thornwhip0000001", name: "Thorn Whip", type: "spell", system: { level: 0 }, activities: [{ id: "twatk00000000001", type: "attack", name: "", ability: "wis", damage: { parts: [{ types: ["piercing"], bonus: "@abilities.wis.mod" }] } }] },
    ],
  });
}

/** Mara: fighter with the Healer feat (an old "Heal d8" activity spending the kit), and a Healer's Kit. */
export function healer() {
  return makeActor({
    id: IDS.healer, name: "Mara Quill", type: "character", ownership: own,
    system: { abilities: abil({ wis: 2 }), attributes: { hp: { value: 12, max: 28 }, ...PB(3) } },
    items: [
      { id: "fighterclass0001", name: "Fighter", type: "class", system: { identifier: "fighter", levels: 4, hd: { denomination: "d10", value: 2, spent: 2 } } },
      { id: "healerkit0000001", name: "Healer's Kit", type: "consumable", system: { identifier: "healers-kit", uses: { value: 10, max: 10 } } },
      {
        id: "healerfeat000001", name: "Healer", type: "feat", img: "icons/healer.webp", system: { identifier: "healer" },
        activities: [
          { id: "heald80000000001", type: "heal", name: "Heal d8", consumption: { targets: [{ type: "itemUses", target: "healerkit0000001", value: "1" }] } },
          { id: "healroll00000001", type: "heal", name: "Healing Reroll", consumption: { targets: [] } },
        ],
      },
      { id: "curewounds000001", name: "Cure Wounds", type: "spell", system: { level: 1 }, activities: [{ id: "cwheal0000000001", type: "heal", name: "", healing: {} }] },
    ],
  });
}

/** Grisk: an NPC with three d8 Hit Dice left and one spent; the GM's only. */
export function npc() {
  return makeActor({
    id: IDS.npc, name: "Grisk", type: "npc",
    system: { isNPC: true, abilities: abil({}), attributes: { hp: { value: 10, max: 30 }, hd: { denomination: "d8", value: 3, spent: 1 }, ...PB(2) } },
  });
}

/** Tamsin: wizard 5 / fighter 1 — two Hit Dice pools, Ritual Adept, Arcane Recovery, spell slots. */
export function wizard() {
  return makeActor({
    id: IDS.wiz, name: "Tamsin Reed", type: "character", ownership: own,
    system: {
      abilities: abil({ int: 4 }),
      attributes: { hp: { value: 25, max: 40 }, hd: {}, ...PB(3) },
      spells: {
        spell1: { level: 1, value: 1, max: 4 }, spell2: { level: 2, value: 1, max: 3 }, spell3: { level: 3, value: 0, max: 2 },
        spell4: { level: 4, value: 0, max: 0 }, spell5: { level: 5, value: 0, max: 0 }, pact: { level: 3, value: 0, max: 1 },
      },
    },
    items: [
      { id: "wizclass00000001", name: "Wizard", type: "class", system: { identifier: "wizard", levels: 5, spellcasting: { progression: "full" }, hd: { denomination: "d6", value: 2, spent: 3 } } },
      { id: "ftrclass00000001", name: "Fighter", type: "class", system: { identifier: "fighter", levels: 1, hd: { denomination: "d10", value: 1, spent: 0 } } },
      { id: "ritualadept00001", name: "Ritual Adept", type: "feat", system: { identifier: "ritual-adept" } },
      { id: "arcanerec0000001", name: "Arcane Recovery", type: "feat", system: { identifier: "arcane-recovery" } },
      { id: "detectmagic00001", name: "Detect Magic", type: "spell", system: { level: 1, method: "spell", prepared: 0, properties: new Set(["ritual"]) }, activities: [{ id: "dmutil0000000001", type: "utility", activation: { type: "action" } }] },
      { id: "alarm00000000001", name: "Alarm", type: "spell", system: { level: 1, method: "spell", prepared: 0, properties: new Set(["ritual"]) }, activities: [{ id: "alutil0000000001", type: "utility", activation: { type: "minute" } }] },
      { id: "animatedead00001", name: "Animate Dead", type: "spell", system: { level: 3, method: "spell", prepared: 1, properties: new Set() }, activities: [{ id: "adsum00000000001", type: "summon", activation: { type: "minute" } }, { id: "adcmd00000000001", type: "utility", activation: { type: "bonus" } }] },
      { id: "magicmissile0001", name: "Magic Missile", type: "spell", system: { level: 1, method: "spell", prepared: 1, properties: new Set() }, activities: [{ id: "mmdmg00000000001", type: "damage", activation: { type: "action" } }] },
    ],
  });
}

/** A character with no Hit Dice data at all (attributes.hd missing). */
export function noHitDice() {
  return makeActor({ id: IDS.noHd, name: "Wisp", type: "character", ownership: { default: 3 }, system: { abilities: {}, attributes: { hp: { value: 5, max: 5 } } } });
}

/* ── install ──────────────────────────────────────────────────────────────── */

/** Every stand-in class the test may want to reach. */
export class SummonActivity {
  constructor(data = {}) { Object.assign(this, { type: "summon", canSummon: true, availableProfiles: [{}], summon: { prompt: false }, ...data }); }
  _prepareUsageConfig(config = {}) {
    logOp("summon._prepareUsageConfig", { config: JSON.parse(JSON.stringify(config ?? null)) });
    const out = { ...config };
    if (out.create !== false) out.create = { ...(out.create ?? {}), summons: out.create?.summons ?? !!this.summon?.prompt };
    return out;
  }
  async getPlacement(token, profile, options) {
    logOp("summon.getPlacement", { src: token?.texture?.src ?? null, profile, options });
    return [{ src: token?.texture?.src ?? null }];
  }
}

export class ButtonPanelButton {
  constructor(data = {}) { Object.assign(this, data); }
  async _renderInner(...args) {
    logOp("argon._renderInner", { label: this._parent?.label ?? null, args, groups: (this._spells ?? []).map(c => c.label) });
    return "inner";
  }
}

/**
 * Install the world. Options: `user` ("gm" | "player"), `gms` (extra GM users; `gmActive:false`
 * leaves no active GM), `argon` (false: no CONFIG.ARGON), `summon` (false: no SummonActivity),
 * `textEditor` (false: no TextEditor), `settings` (preset values, "id" → value).
 */
export async function setupWorld({ user = "gm", gmActive = true, argon = true, summon = true, textEditor = true, settings = {}, extraActors = [] } = {}) {
  const actors = [sorcerer(), druid(), healer(), npc(), wizard(), noHitDice(), ...extraActors];
  const gm = makeUser({ id: IDS.gm, name: "Gamemaster", isGM: true, active: gmActive });
  const player = makeUser({ id: IDS.player, name: "Pell", isGM: false });
  const F = await installFoundry({
    user: gm, users: [player], lang: LANG, actors, settings,
    modules: [{ id: MODULE, version: MANIFEST.version, title: MANIFEST.title }],
  });
  for (const u of F.game.users) {
    u.targets = new Set();
    u.can = perm => (W.perms.has(perm));
  }
  if (user === "player") F.become({ userId: IDS.player });

  const lines = [];
  for (const level of ["warn", "error", "info", "debug", "table"]) {
    console[level] = (...args) => lines.push(level === "table" ? ["table", JSON.parse(JSON.stringify(args[0]))] : [level, String(args[0]), ...(args[1] instanceof Error ? [args[1].message] : [])]);
  }

  const dom = installDom();
  globalThis.CSS = { escape: s => String(s).replace(/["\\]/g, "\\$&") };
  const raf = [];
  globalThis.requestAnimationFrame = fn => { raf.push(fn); return raf.length; };

  // dice, Roll, ChatMessage
  F.foundry.dice = { terms: { Die, OperatorTerm, NumericTerm, StringTerm } };
  const rolls = [];          // queued totals for `new Roll(...).evaluate()`
  globalThis.Roll = class Roll {
    constructor(formula) { this.formula = formula; }
    async evaluate() {
      this.total = rolls.length ? rolls.shift() : 1;
      logOp("roll", { formula: this.formula, total: this.total });
      return this;
    }
    async toMessage(data) {
      logOp("roll.toMessage", { formula: this.formula, total: this.total, data: JSON.parse(JSON.stringify(data)) });
      return { id: "rollmsg000000001" };
    }
  };
  const speaker = ({ actor } = {}) => ({ actor: actor?.id ?? null, alias: actor?.name ?? null });
  globalThis.ChatMessage = {
    implementation: { getSpeaker: speaker },
    getSpeaker: speaker,
    async create(data) { logOp("ChatMessage.create", { data: JSON.parse(JSON.stringify(data)) }); return data; },
  };
  globalThis.Actor = class Actor { static [Symbol.hasInstance](x) { return x?.documentName === "Actor"; } };

  F.CONFIG.DND5E = {
    damageTypes: Object.fromEntries(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"].map(k => [k, { label: k }])),
    healingTypes: { healing: { label: "Healing" }, temphp: { label: "Temp HP" } },
    activityTypes: summon ? { summon: { documentClass: SummonActivity } } : {},
  };
  F.CONFIG.specialStatusEffects = { CONCENTRATING: "concentrating" };
  if (argon) F.CONFIG.ARGON = { MAIN: { BUTTONS: { ButtonPanelButton } } };

  const TE = {
    enrichHTML(content, options = {}) {
      let relativeTo;
      try { relativeTo = options.relativeTo?.name ?? null; } catch (err) { relativeTo = `<${err.message}>`; }
      logOp("enrichHTML", { content, rollData: options.rollData ?? null, relativeTo });
      return `<p>${content}</p>`;
    },
  };
  const dialogs = [];
  F.foundry.applications.instances = new Map();
  if (textEditor) F.foundry.applications.ux = { TextEditor: { implementation: TE } };
  F.foundry.applications.api.DialogV2 = {
    /**
     * Builds the dialog's element from `content`, runs `render`, then asks `W.answer(dialog)` for the
     * outcome: an object → the "ok" callback's result after the test filled the form, "cancel" → null.
     */
    async wait(config) {
      const element = new FakeElement("div");
      element.innerHTML = `<form>${config.content}</form>${config.buttons.map(b => `<button data-action="${b.action}"></button>`).join("")}`;
      const form = element.querySelector("form");
      const dialog = { config, element, form };
      dialogs.push(dialog);
      logOp("DialogV2.wait", { title: config.window?.title, buttons: config.buttons.map(b => [b.action, b.label, !!b.default]), rejectClose: config.rejectClose });
      config.render?.({}, { element });
      const answer = await W.answer(dialog);
      if (answer === "cancel" || answer == null) return null;
      for (const [name, value] of Object.entries(answer)) {
        const inputs = form.querySelectorAll(`input[name="${name}"]`);
        // A row of checkboxes (the Arcane Recovery picker): the answer is how many to tick.
        if (inputs[0]?.getAttribute("type") === "checkbox") inputs.forEach((box, i) => { box.checked = i < Number(value); });
        else if (inputs[0]) inputs[0].value = String(value);
      }
      await form.fire("input");
      const okButton = config.buttons.find(b => b.action === "ok");
      return okButton.callback({}, { form });
    },
  };
  F.canvas.scene = { id: "scene00000000001" };

  W = {
    F, dom, lines, raf, rolls, dialogs, TE,
    log: [],
    perms: new Set(["FILES_BROWSE"]),
    answer: () => "cancel",
    actor: id => F.game.actors.get(id),
    get gm() { return F.game.users.get(IDS.gm); },
    get player() { return F.game.users.get(IDS.player); },
    /** Console lines since the last call, then cleared. */
    take() { return lines.splice(0); },
    /** Log entries since the last call, then cleared. */
    takeLog() { return W.log.splice(0); },
    flushRaf() { for (const fn of raf.splice(0)) fn(); },
    /** Set the user's targets to these placeables. */
    target(...tokens) { F.game.user.targets = new Set(tokens); },
    html,
  };
  return W;
}

/** The registered setting option objects, minus `onChange` identity (kept as a flag). */
export function settingRows(F) {
  return [...F.game.settings.settings.entries()]
    .filter(([id]) => id.startsWith(`${MODULE}.`))
    .map(([id, { namespace, key, onChange, type, ...rest }]) => ({ id, namespace, key, ...rest, type: type?.name ?? String(type), onChange: typeof onChange === "function" }));
}
