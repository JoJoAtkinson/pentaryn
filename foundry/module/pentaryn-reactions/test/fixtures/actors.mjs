/**
 * Synthetic world cuts for the tests. Never real campaign data: test/ ships to Data/.
 * Ids are 16 characters, like Foundry's.
 *
 * The table: the headless GM "Claude" (the active GM — the lowest id among GMs) and a second GM
 * "Joe"; three players, each owning one character (no player owns another PC): P owns the wizard
 * Marrith (Shield, Absorb Elements, Counterspell), T owns the druid Talo (Cosmic Omen and an innate
 * Absorb Elements, no slots), Q owns the fighter Caven (Shield) but is OFFLINE. One monster, Grick, and one of its kin.
 * One started combat on Grick's turn.
 */

import { StubCollection, makeDoc } from "../kit/foundry-stub.mjs";

export const IDS = Object.freeze({
  gm: "gmClaude00000001",
  gmJoe: "gmJoe00000000001",
  playerP: "playerP000000001",
  playerQ: "playerQ000000001",
  playerT: "playerT000000001",
  marrith: "marrith000000001",
  caven: "caven00000000001",
  talo: "talo000000000001",
  grick: "grick00000000001",
  gruk: "gruk000000000001",
  scene: "sceneumbral00001",
  tokMarrith: "tokmarrith000001",
  tokCaven: "tokcaven00000001",
  tokTalo: "toktalo000000001",
  tokGrick: "tokgrick00000001",
  tokGruk: "tokgruk000000001",
  combat: "combatumbral0001",
  shield: "itemshield000001",
  absorb: "itemabsorb000001",
  counter: "itemcounter00001",
  firebolt: "itemfirebolt0001",
  dagger: "itemdagger000001",
  cavenShield: "itemcshield00001",
  omen: "itemomen00000001",
  taloAbsorb: "itemtabsorb00001",
  bite: "itembite00000001",
});

const hp = (value, max = value) => ({ value, max });

export const ACTORS = Object.freeze([
  { id: IDS.marrith, name: "Marrith", type: "character", ownership: { default: 0, [IDS.playerP]: 3 },
    system: { attributes: { hp: hp(30), ac: { value: 16 } },
      spells: { spell1: { level: 1, value: 2, max: 3 }, spell2: { level: 2, value: 1, max: 2 }, spell3: { level: 3, value: 0, max: 1 } } } },
  { id: IDS.caven, name: "Caven", type: "character", ownership: { default: 0, [IDS.playerQ]: 3 },
    system: { attributes: { hp: hp(25), ac: { value: 15 } }, spells: { spell1: { level: 1, value: 1, max: 2 } } } },
  { id: IDS.talo, name: "Talo", type: "character", ownership: { default: 0, [IDS.playerT]: 3 },
    system: { attributes: { hp: hp(20), ac: { value: 14 } }, spells: {} } },
  { id: IDS.grick, name: "Grick", type: "npc", ownership: { default: 0 }, system: { attributes: { hp: hp(27), ac: { value: 14 } } } },
  { id: IDS.gruk, name: "Gruk", type: "npc", ownership: { default: 0 }, system: { attributes: { hp: hp(11), ac: { value: 13 } } } },
]);

export const SCENES = Object.freeze([
  { id: IDS.scene, name: "Umbral Temple", active: true, tokens: [
    { id: IDS.tokMarrith, name: "Marrith", actorId: IDS.marrith },
    { id: IDS.tokCaven, name: "Caven", actorId: IDS.caven },
    { id: IDS.tokTalo, name: "Talo", actorId: IDS.talo },
    { id: IDS.tokGrick, name: "Grick", actorId: IDS.grick },
    { id: IDS.tokGruk, name: "Gruk", actorId: IDS.gruk },
  ] },
]);

export const USERS = Object.freeze([
  { id: IDS.gmJoe, name: "Joe", isGM: true, role: 4, active: true },
  { id: IDS.playerP, name: "P", isGM: false, active: true },
  { id: IDS.playerQ, name: "Q", isGM: false, active: false },
  { id: IDS.playerT, name: "T", isGM: false, active: true },
]);

/** Grick's turn (turn 0) of round 2; Marrith is next. */
export const COMBATS = Object.freeze([
  { id: IDS.combat, started: true, round: 2, turn: 0, combatantIds: [IDS.grick, IDS.marrith, IDS.talo, IDS.caven] },
]);

/** installFoundry() options for a world with this module active. */
export function world(moduleId, extra = {}) {
  return {
    user: { id: IDS.gm, name: "Claude", isGM: true, role: 4 },
    actors: ACTORS.map(a => structuredClone(a)),
    scenes: SCENES.map(s => structuredClone(s)),
    users: USERS.map(u => ({ ...u })),
    combats: COMBATS.map(c => structuredClone(c)),
    modules: [{ id: moduleId, version: "0.1.0" }, { id: "pentaryn-combat", version: "0.3.0" }],
    ...extra,
  };
}

/* ── items and activities ─────────────────────────────────────────────────────────────────── */

/**
 * dnd5e 6.0.6's `CONFIG.DND5E.spellcasting` as it stands at `ready`: `SpellcastingModel.fromConfig()`
 * (`dnd5e.mjs:91535`, run from the system's localisation hook) has replaced each literal with a
 * model, and only the slot models (`spell`, `pact`) answer `slots` — a getter, not a data key
 * (`SlotSpellcasting#slots`, `dnd5e.mjs:91644`). At-will, innate and ritual have no such member.
 */
class SpellcastingModel { constructor(data) { Object.assign(this, data); } }
class SlotSpellcasting extends SpellcastingModel { get slots() { return true; } }
export const SPELLCASTING = Object.freeze({
  atwill: new SpellcastingModel({ key: "atwill", type: "none", order: -30 }),
  innate: new SpellcastingModel({ key: "innate", type: "none", order: -20 }),
  ritual: new SpellcastingModel({ key: "ritual", type: "none", order: -10 }),
  pact: new SlotSpellcasting({ key: "pact", type: "single", cantrips: true, prepares: true, order: 10 }),
  spell: new SlotSpellcasting({ key: "spell", type: "multi", cantrips: true, prepares: true, order: 20 }),
});

/**
 * One dnd5e 6 item with one activity (`item.system.activities` is a Map, as the system's
 * ActivityCollection iterates). `activation` is the activity's activation type. The activity's
 * `requiresSpellSlot` is dnd5e's own rule (`dnd5e.mjs:20229`, `SpellData#canScale` at `:34040`):
 * a spell, on an actor with a spell table, levelled, under a method whose model has slots.
 * `plainActivity: true` leaves the getter off — the shape of a record the adapter must decide for itself.
 */
function item(F, actor, { id, name, type, identifier = null, level = 0, method = "spell", activation = "action", activityType = "utility", uses = null, img = null, plainActivity = false }) {
  const doc = makeDoc("Item", {
    id, name, type, img: img ?? `icons/${id}.webp`,
    system: { identifier: identifier ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), level, method, uses: uses ?? { value: 0, max: 0, spent: 0 }, activities: new Map() },
  }, { parent: actor, collection: actor.items });
  const activity = {
    id: `act${id.slice(4, 16)}`.slice(0, 16), type: activityType, name, img: doc.img,
    activation: { type: activation }, uses: { value: 0, max: 0, spent: 0 },
    get uuid() { return `${doc.uuid}.Activity.${this.id}`; },
    get item() { return doc; },
    get actor() { return actor; },
    /** `Activity#use(usage, dialog)`: what the card passed is what the test reads back. */
    async use(usage = {}, dialog = {}) {
      F.calls.push({ op: "activity.use", uuid: this.uuid, actor: actor.id, usage: Object.keys(usage), spell: usage.spell ?? null, dialog: F.plain(dialog) });
      return { message: null };
    },
  };
  if (!plainActivity) {
    Object.defineProperty(activity, "requiresSpellSlot", {
      get() {
        if (doc.type !== "spell" || !actor.system?.spells) return false;
        return doc.system.level > 0 && !!globalThis.CONFIG?.DND5E?.spellcasting?.[doc.system.method]?.slots;
      },
      enumerable: false, configurable: true,
    });
  }
  doc.system.activities.set(activity.id, activity);
  actor.items.set(doc.id, doc);
  return doc;
}

/**
 * Give the stub world its dnd5e shape: items with activities on each actor, `hasPlayerOwner` and
 * `isOwner` on actors, combatants on the combat, `game.combat`, `fromUuidSync` for `.Activity.<id>`,
 * and the `ChatMessage` class the module creates and updates cards through. Call once after
 * installFoundry(); returns the helpers a test uses.
 */
export function populate(F) {
  const { game } = F;
  F.CONFIG.DND5E = { spellcasting: SPELLCASTING };
  for (const actor of game.actors.contents) {
    Object.defineProperty(actor, "items", { value: new StubCollection(), enumerable: false, configurable: true });
    Object.defineProperty(actor, "hasPlayerOwner", {
      get() { return game.users.contents.some(u => !u.isGM && (this.ownership?.[u.id] ?? 0) >= 3); }, enumerable: false, configurable: true,
    });
    Object.defineProperty(actor, "isOwner", { get() { return this.testUserPermission(game.user, "OWNER"); }, enumerable: false, configurable: true });
  }
  const marrith = game.actors.get(IDS.marrith);
  const caven = game.actors.get(IDS.caven);
  const talo = game.actors.get(IDS.talo);
  const grick = game.actors.get(IDS.grick);
  item(F, marrith, { id: IDS.shield, name: "Shield", type: "spell", level: 1, activation: "reaction" });
  item(F, marrith, { id: IDS.absorb, name: "Absorb Elements", type: "spell", level: 1, activation: "reaction" });
  item(F, marrith, { id: IDS.counter, name: "Counterspell", type: "spell", level: 3, activation: "reaction" });
  item(F, marrith, { id: IDS.firebolt, name: "Fire Bolt", type: "spell", level: 0, activation: "action", activityType: "attack" });
  item(F, marrith, { id: IDS.dagger, name: "Dagger", type: "weapon", activation: "action", activityType: "attack" });
  item(F, caven, { id: IDS.cavenShield, name: "Shield", type: "spell", level: 1, activation: "reaction" });
  // Talo's Absorb Elements is a racial / innate spell: levelled, but it never costs a slot (and Talo has none)
  item(F, talo, { id: IDS.taloAbsorb, name: "Absorb Elements", type: "spell", level: 1, method: "innate", activation: "reaction" });
  item(F, talo, { id: IDS.omen, name: "Cosmic Omen", type: "feat", activation: "reaction", uses: { value: 2, max: 2, spent: 0 } });
  item(F, grick, { id: IDS.bite, name: "Bite", type: "weapon", activation: "action", activityType: "attack" });

  // the combat: combatants from the seed's actor ids, each with its token on the scene
  const scene = game.scenes.get(IDS.scene);
  for (const combat of game.combats.contents) {
    const list = new StubCollection();
    for (const actorId of combat.combatantIds ?? []) {
      const tok = scene.tokens.contents.find(t => t.actorId === actorId);
      const cb = { id: `cb${actorId.slice(2, 16)}`, actorId, tokenId: tok?.id ?? null, get actor() { return game.actors.get(this.actorId); } };
      list.set(cb.id, cb);
    }
    Object.defineProperty(combat, "combatants", { value: list, enumerable: false, configurable: true });
  }
  game.combat = game.combats.get(IDS.combat);

  // `<Item uuid>.Activity.<id>` → the activity; everything else is the stub's
  const base = globalThis.fromUuidSync;
  const fromUuidSync = uuid => {
    const m = /^(.*)\.Activity\.([^.]+)$/.exec(String(uuid ?? ""));
    if (!m) return base(uuid);
    return base(m[1])?.system?.activities?.get?.(m[2]) ?? null;
  };
  Object.defineProperty(globalThis, "fromUuidSync", { value: fromUuidSync, configurable: true, writable: true });
  F.fromUuidSync = fromUuidSync;

  /** A chat message in `game.messages`; `hook: true` fires createChatMessage as the server would. */
  function message(data = {}, { hook = false } = {}) {
    const m = makeDoc("ChatMessage", {
      type: "base", system: {}, flags: {}, speaker: {}, rolls: [], whisper: [], blind: false,
      timestamp: Date.now(), author: game.user.id, content: "", ...data,
    });
    Object.setPrototypeOf(m, ChatMessage.prototype);
    m.collection = game.messages;
    game.messages.set(m.id, m);
    if (hook) F.Hooks.callAll("createChatMessage", m, {}, m.author);
    return m;
  }

  /** The server's answer to a batched write: the next macrotask, never the same tick. */
  const roundTrip = () => new Promise(r => setImmediate(r));

  class ChatMessage {
    static getSpeaker({ actor = null, token = null } = {}) {
      return { scene: token?.parent?.id ?? null, actor: actor?.id ?? null, token: token?.id ?? null, alias: token?.name ?? actor?.name ?? null };
    }
  }
  ChatMessage.implementation = {
    create: async data => {
      F.calls.push({ op: "create", documentName: "ChatMessage", data: F.plain(data) });
      return message({ ...data, author: game.user.id }, { hook: true });
    },
    /**
     * One round trip, one `create` call per document (as the server fires createChatMessage per
     * document). The round trip is a real yield (`roundTrip`): nothing lands until the next macrotask,
     * so two offers racing for one card can be caught racing.
     */
    createDocuments: async list => {
      F.calls.push({ op: "createDocuments", documentName: "ChatMessage", n: list.length });
      await roundTrip();
      const out = [];
      for (const data of list) out.push(await ChatMessage.implementation.create(data));
      return out;
    },
    updateDocuments: async updates => {
      F.calls.push({ op: "updateDocuments", documentName: "ChatMessage", updates: F.plain(updates) });
      await roundTrip();
      const out = [];
      for (const { _id, ...changes } of updates) {
        const m = game.messages.get(_id);
        if (m) out.push(await m.update(changes));
      }
      return out;
    },
  };
  Object.defineProperty(globalThis, "ChatMessage", { value: ChatMessage, configurable: true, writable: true });

  const tokenOf = actorId => scene.tokens.contents.find(t => t.actorId === actorId);
  /** dnd5e's TargetsField.getDescriptors() for these tokens (linked actors: the world actor's uuid). */
  const descriptors = tokens => tokens.map(t => ({ actor: t.actor.uuid, token: t.uuid, name: t.name, ac: t.actor.system.attributes.ac.value, img: null }));
  const speakerOf = tok => ({ scene: scene.id, actor: tok.actorId, token: tok.id, alias: tok.name });

  /** A dnd5e 6 "attack" card: one D20 roll against the targets. */
  function attack({ id, attacker = IDS.grick, targets = [IDS.marrith], total = 18, isCritical = false, isFumble = false, weapon = "Bite", origin = "usageGrick000001", whisper = [], blind = false, hook = true } = {}) {
    const tok = tokenOf(attacker);
    return message({
      ...(id ? { id } : {}), type: "attack", author: IDS.gmJoe, whisper, blind,
      flavor: `${weapon} - Attack Roll`,
      speaker: speakerOf(tok),
      system: { targets: descriptors(targets.map(tokenOf)), origin, activity: { uuid: `Actor.${attacker}.Item.x.Activity.y`, name: "Attack" }, item: { name: weapon } },
      rolls: [{ total, isCritical, isFumble, options: {} }],
    }, { hook });
  }

  /** A dnd5e 6 "damage" card: typed rolls against the targets. */
  function damage({ id, attacker = IDS.grick, targets = [IDS.marrith], rolls = [{ total: 9, type: "piercing" }], weapon = "Bite", origin = "usageGrick000001", whisper = [], blind = false, hook = true } = {}) {
    const tok = tokenOf(attacker);
    return message({
      ...(id ? { id } : {}), type: "damage", author: IDS.gmJoe, whisper, blind,
      flavor: `${weapon} - Damage Roll`,
      speaker: speakerOf(tok),
      system: { targets: descriptors(targets.map(tokenOf)), origin, activity: { uuid: `Actor.${attacker}.Item.x.Activity.y`, name: "Attack" }, item: { name: weapon } },
      rolls: rolls.map(r => ({ total: r.total, options: { type: r.type } })),
    }, { hook });
  }

  return { message, attack, damage, item: (actor, spec) => item(F, actor, spec), tokenOf, marrith, caven, talo, grick, combat: game.combat };
}
