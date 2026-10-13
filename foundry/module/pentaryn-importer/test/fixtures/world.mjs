/**
 * A stub world for the importer's WRITE path (write.test). The kit stub has no Actor class with
 * embedded Items, so this file adds the few Document behaviours `importActors` touches:
 *
 *   getDocumentClass("Actor").create(data)   → a makeDoc Actor in game.actors
 *   actor.update / items / createEmbeddedDocuments / deleteEmbeddedDocuments / reset
 *   actor.prototypeToken.toObject()          → source data; keys outside PrototypeToken's set are
 *                                              dropped on create/update, as Foundry strips them
 *   item.system.activities                   → a Map keyed by `_id` with .get/.map, as ActivityCollection;
 *                                              absent on the types without ActivitiesTemplate (NO_ACTIVITIES)
 *   item.labels / activity.labels            → derived from the source (see `labelsOf`)
 *
 * Knobs (all off by default) make Foundry misbehave in the ways the importer's assertions catch:
 *   dropTypes       Item types createEmbeddedDocuments silently drops
 *   regenIds        activity `_id`s are regenerated instead of honoured (contract U7)
 *   stripAction     action names whose flags.pentaryn.action is stripped on create
 *   failCreate      slugs whose Actor.create throws a plain Error (a per-actor failure)
 *   raceCreate      slugs another GM tab creates while this run is under way (importer-AC-2): its
 *                   copy (slug flag, `_id` = idForSlug) lands in game.actors — the create broadcast —
 *                   when this run sends its first Actor.create, i.e. after our slug index was built
 *   failItems       slugs whose createEmbeddedDocuments throws a plain Error (a per-actor failure
 *                   after the Actor itself was written — importer-R6)
 *
 * Actor.create honours `data._id` under `{keepId: true}`. An `_id` already in game.actors is silently
 * REPLACED (no error, no delete), as Foundry 14.369's server does for a world document — it checks
 * duplicate ids only inside embedded collections (FIX-3 live probe, importer-AC-2).
 *
 * Every write lands in F.calls in order, so a test pins effects, not returns.
 */
import { makeDoc, StubCollection } from "../kit/foundry-stub.mjs";
import { idForSlug } from "../../importer-core.mjs";

/** Foundry common/data/data.mjs PrototypeToken's accepted keys (the importer's header comment). */
const TOKEN_KEYS = new Set([
  "name", "displayName", "actorLink", "width", "height", "depth", "texture", "lockRotation", "rotation", "alpha",
  "disposition", "displayBars", "bar1", "bar2", "light", "sight", "detectionModes", "occludable", "ring",
  "turnMarker", "movementAction", "flags", "randomImg", "appendNumber", "prependAdjective",
]);

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const hidden = (obj, name, value) => Object.defineProperty(obj, name, { value, configurable: true, writable: true, enumerable: false });

/** dnd5e 6.0.6 Item types whose system data has no ActivitiesTemplate, so no `system.activities`. */
const NO_ACTIVITIES = new Set(["class", "subclass", "background", "race", "loot", "container"]);

class ActivityCollection extends Map {
  map(fn) {
    return [...this.values()].map(fn);
  }
}

/** Display labels, derived the way the assertions in write.test expect (flat attack bonus, flat DC). */
function labelsOf(activity) {
  const labels = {};
  if (activity.attack?.bonus !== undefined) labels.toHit = activity.attack.bonus;
  if (activity.save?.dc?.formula !== undefined) labels.save = `DC ${activity.save.dc.formula} `;   // dnd5e's trailing space
  return labels;
}

function tokenOf(data) {
  const token = Object.fromEntries(Object.entries(clone(data ?? {})).filter(([k]) => TOKEN_KEYS.has(k)));
  hidden(token, "toObject", () => clone(token));
  return token;
}

export function makeWorld(F, knobs = {}) {
  const K = { dropTypes: new Set(), regenIds: false, stripAction: new Set(), failCreate: new Set(), raceCreate: new Set(), failItems: new Set(), ...knobs };
  let seq = 0;

  function makeItem(actor, data) {
    const src = clone(data);
    if (K.stripAction.has(src.flags?.pentaryn?.action)) delete src.flags.pentaryn.action;
    const acts = new ActivityCollection();
    for (const [key, a] of Object.entries(src.system?.activities ?? {})) {
      const id = K.regenIds ? `regen${String(++seq).padStart(11, "0")}` : (a._id ?? key);
      acts.set(id, { ...a, _id: id, labels: labelsOf(a) });
    }
    const item = makeDoc("Item", { id: `item${String(++seq).padStart(12, "0")}`, ...src, system: { ...(src.system ?? {}) } }, { parent: actor });
    if (NO_ACTIVITIES.has(src.type)) delete item.system.activities;   // the schema has no such field
    else hidden(item.system, "activities", acts);
    hidden(item, "labels", src.system?.uses?.recovery?.[0]?.type === "recharge" ? { recharge: `Recharge ${src.system.uses.recovery[0].formula}` } : {});
    return item;
  }

  function makeActor(data, { items = [], id = null } = {}) {
    const { prototypeToken, _id, ...rest } = clone(data);
    const auto = `actor${String(++seq).padStart(11, "0")}`;     // seq advances either way (stable item ids)
    const actor = makeDoc("Actor", { id: id ?? auto, ...rest }, { collection: F.game.actors });
    hidden(actor, "prototypeToken", tokenOf(prototypeToken));
    hidden(actor, "items", new StubCollection());
    for (const d of items) {
      const item = makeItem(actor, d);
      actor.items.set(item.id, item);
    }
    const update = actor.update.bind(actor);
    hidden(actor, "update", async (changes, options) => {
      const { prototypeToken: token, ...other } = clone(changes);
      if (token) {
        const kept = Object.fromEntries(Object.entries(token).filter(([k]) => TOKEN_KEYS.has(k)));
        Object.assign(actor.prototypeToken, kept);
        F.calls.push({ op: "prototypeToken.update", uuid: actor.uuid, changes: kept });
      }
      F.calls.push({ op: "update.options", uuid: actor.uuid, options: F.plain(options) });
      return update(other, options);
    });
    hidden(actor, "createEmbeddedDocuments", async (type, list, options) => {
      F.calls.push({ op: "createEmbeddedDocuments", uuid: actor.uuid, type, names: list.map(d => d.name), options: F.plain(options) });
      if (K.failItems.has(actor.flags?.pentaryn?.slug)) throw new Error(`Item validation errors: ${actor.flags.pentaryn.slug}`);
      const made = [];
      for (const d of list) {
        if (K.dropTypes.has(d.type)) continue;
        const item = makeItem(actor, d);
        actor.items.set(item.id, item);
        made.push(item);
      }
      return made;
    });
    hidden(actor, "deleteEmbeddedDocuments", async (type, ids, options) => {
      F.calls.push({ op: "deleteEmbeddedDocuments", uuid: actor.uuid, type, names: ids.map(id => actor.items.get(id)?.name), options: F.plain(options) });
      for (const id of ids) actor.items.delete(id);
      return ids;
    });
    hidden(actor, "reset", () => { F.calls.push({ op: "reset", uuid: actor.uuid }); });
    F.game.actors.set(actor.id, actor);
    return actor;
  }

  class StubActor {
    static async create(data, options) {
      F.calls.push({ op: "Actor.create", data: F.plain(data), options: F.plain(options) });
      const slug = data?.flags?.pentaryn?.slug;
      for (const other of [...K.raceCreate]) {                       // the other tab's create lands
        K.raceCreate.delete(other);
        makeActor({ name: `${other.toUpperCase()} (other tab)`, type: "npc", flags: { pentaryn: { slug: other } } }, { id: idForSlug(other) });
      }
      if (K.failCreate.has(slug)) throw new Error(`Actor validation errors: ${slug}`);
      const id = options?.keepId ? data._id : null;
      if (id && F.game.actors.get(id)) F.calls.push({ op: "Actor.replace", id });   // Foundry 14: no error
      return makeActor(data, { id });
    }
  }
  globalThis.getDocumentClass = name => (name === "Actor" ? StubActor : null);

  return { K, makeActor };
}
