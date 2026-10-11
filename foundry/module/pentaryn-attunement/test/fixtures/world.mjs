/**
 * The attunement glue's stand-in world (guide step 1.5): a GM client, an `Actor` class so the entry's
 * `instanceof Actor` checks work, CONFIG.DND5E's armour map, actors and items built on the stub's
 * documents (flag reads go through the scope check), embedded writes logged to `F.calls`, and a
 * deterministic `foundry.utils.randomID`.
 */

import { StubCollection, installFoundry, makeDoc, makeUser } from "../kit/foundry-stub.mjs";

export const GM = "gmUser0000000001";
export const MOD = "pentaryn-attunement";

export class Actor {}

export async function attunementWorld({ withTooltips = true } = {}) {
  const F = await installFoundry({
    user: makeUser({ id: GM, name: "Gamemaster", isGM: true }),
    modules: [MOD],
  });
  globalThis.Actor = Actor;
  F.CONFIG.DND5E = { armorProficienciesMap: { natural: true, clothing: true, light: "lgt", medium: "med", heavy: "hvy", shield: "shl" } };
  let n = 0;
  F.foundry.utils.randomID = () => `r${++n}`;
  F.resetIds = () => { n = 0; };
  for (const level of ["info", "warn", "error"]) {
    F.ui.notifications[level] = (message, opts) => {
      F.calls.push({ op: "notify", level, message: String(message), opts: opts ?? null });
    };
  }
  if (withTooltips) {
    class Tooltips5e {
      constructor() { this.tooltip = {}; this.calls = []; }
      _positionItemTooltip(...args) { this.calls.push(args); return "positioned"; }
    }
    F.Tooltips5e = Tooltips5e;
    F.game.dnd5e = { tooltips: new Tooltips5e() };
    F.game.tooltip = { element: {} };
  }
  return F;
}

/** An actor (instanceof Actor) with embedded items and logged embedded writes. */
export function makeActor(F, { id, name, type = "character", attunement = { value: 0, max: 3 }, currency = {}, flags = {}, items = [] }) {
  const actor = makeDoc("Actor", { id, name, type, system: { attributes: { attunement }, currency }, flags });
  Object.setPrototypeOf(actor, Actor.prototype);
  const coll = new StubCollection();
  Object.defineProperty(actor, "items", { value: coll, enumerable: false });
  for (const it of items) addItem(F, actor, it);
  const log = op => async (type, data) => {
    F.calls.push({ op, on: actor.name, type, data: F.plain(data) });
    if (op === "deleteEmbeddedDocuments") for (const id of data) coll.delete(id);
    return data;
  };
  actor.createEmbeddedDocuments = log("createEmbeddedDocuments");
  actor.deleteEmbeddedDocuments = log("deleteEmbeddedDocuments");
  F.game.actors.set(actor.id, actor);
  return actor;
}

/** An item document; `source` is its `_source` (defaults to a copy of name/system). */
export function addItem(F, actor, { id, name, type = "equipment", img = "i", system = {}, source, flags = {} }) {
  const item = makeDoc("Item", { id, name, type, img, system: structuredClone(system), flags }, { parent: actor, collection: actor?.items ?? null });
  const src = source ?? { name, system: structuredClone(system) };
  Object.defineProperty(item, "_source", { value: src, enumerable: false });
  Object.defineProperty(item, "toObject", {
    value: () => ({ _id: id, name: src.name, type, img, system: structuredClone(src.system), flags: structuredClone(item.flags) }),
    enumerable: false,
  });
  Object.defineProperty(item, "updateSource", {
    value: changes => F.calls.push({ op: "updateSource", item: item.name, changes: F.plain(changes) }),
    enumerable: false,
  });
  Object.defineProperty(item, "areEffectsSuppressed", { value: false, enumerable: false });
  actor?.items?.set(id, item);
  return item;
}
