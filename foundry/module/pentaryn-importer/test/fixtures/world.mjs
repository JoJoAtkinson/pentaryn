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
 *   raceSame        slug → { hash, items }: another GM tab creates the same slug IN THE SAME INSTANT
 *                   and the server processes its create FIRST (wave-3 importer item 2). Its create
 *                   broadcast reaches this tab before our own response (a `createActor` hook with its
 *                   instance), then our keepId create replaces it. 500 ms later (mocked timers) that tab
 *                   writes `items` on the live actor and stamps `hash`, as a run that won would.
 *   raceAfter       slugs another GM tab creates in the same instant but the server processes SECOND:
 *                   its replace lands right after our create resolves (a new instance under the same
 *                   id, the old one now stale), and that tab then stands down (writes nothing more)
 *   raceWiped       slug → { hash, items }: another GM tab creates the same slug in the same instant,
 *                   and the server handles its create AND its Items create before ours (this tab's
 *                   latency is higher): both broadcasts reach us before our response, our keepId create
 *                   then replaces that actor and wipes its Items, and 500 ms later its stamp `hash`
 *                   lands on our replacement (wave-3 importer 2, FIX-W3 verifier)
 *   raceAfterItems  slugs another GM tab creates in the same instant whose create the server handles
 *                   after OUR first Items create: the replace (no Items) swaps the instance right after
 *                   that write; that tab then writes nothing more
 *   noopUpdate      slugs whose actor.update resolves undefined because the diff is empty (Foundry's
 *                   client drops a no-op update: no request, no hook — wave-3 importer item 1); the
 *                   content-hash stamp is still a real change
 *
 * An update whose `name` is blank is REFUSED the way Foundry 14's client refuses an invalid change
 * (client/data/client-backend.mjs #preUpdateDocumentArray): the dry-run updateSource throws, an error
 * toast is shown, nothing is sent and `update()` resolves undefined — no throw. `actor.updateSource(
 * changes, {dryRun: true})` and `getDocumentClass("Actor").cleanData` are modelled for the importer's
 * own dry-run check: blank name → throws the validation error; a noopUpdate slug → `{}`; else the changes.
 *
 * Actor.create honours `data._id` under `{keepId: true}`. An `_id` already in game.actors is silently
 * REPLACED (no error, no delete), as Foundry 14.369's server does for a world document — it checks
 * duplicate ids only inside embedded collections (FIX-3 live probe, importer-AC-2).
 *
 * A write through a STALE instance (one a later create replaced in game.actors) lands on the live
 * one, as Foundry routes it by id; the stale instance's own `items` never see it.
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

/** The validation message Foundry 14 gives a blank required name (StringField, blank: false). */
const BLANK_NAME = "Actor [x] validation errors:\n  name: may not be a blank string";

/** The importer's last write for an actor: `{flags: {pentaryn: {contentHash}}}` alone. */
const isStamp = changes => changes?.flags?.pentaryn?.contentHash !== undefined && Object.keys(changes).length === 1;

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
  const K = { dropTypes: new Set(), regenIds: false, stripAction: new Set(), failCreate: new Set(), raceCreate: new Set(), failItems: new Set(), noopUpdate: new Set(), raceSame: new Map(), raceAfter: new Set(), raceWiped: new Map(), raceAfterItems: new Set(), ...knobs };
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
    /** The instance game.actors holds now: a later create may have replaced this one (raceAfter). */
    const live = () => {
      const now = F.game.actors.get(actor.id);
      return now && now !== actor ? now : null;
    };
    hidden(actor, "updateSource", (changes, { dryRun = false } = {}) => {
      if (!dryRun) throw new Error("stub: only a dryRun updateSource is modelled");
      if ("name" in changes && !String(changes.name ?? "").trim()) throw new Error(BLANK_NAME);
      return K.noopUpdate.has(actor.flags?.pentaryn?.slug) ? {} : clone(changes);
    });
    hidden(actor, "update", async (changes, options) => {
      if (live()) return live().update(changes, options);
      if ("name" in (changes ?? {}) && !String(changes.name ?? "").trim()) {      // Foundry: toast, no request, undefined
        F.calls.push({ op: "update.refused", uuid: actor.uuid, error: BLANK_NAME });
        globalThis.ui?.notifications?.error?.(BLANK_NAME);
        return undefined;
      }
      if (K.noopUpdate.has(actor.flags?.pentaryn?.slug) && !isStamp(changes)) {  // Foundry: empty diff, no request
        F.calls.push({ op: "update.noop", uuid: actor.uuid });
        return undefined;
      }
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
      if (live()) return live().createEmbeddedDocuments(type, list, options);
      F.calls.push({ op: "createEmbeddedDocuments", uuid: actor.uuid, type, names: list.map(d => d.name), options: F.plain(options) });
      if (K.failItems.has(actor.flags?.pentaryn?.slug)) throw new Error(`Item validation errors: ${actor.flags.pentaryn.slug}`);
      const made = [];
      for (const d of list) {
        if (K.dropTypes.has(d.type)) continue;
        const item = makeItem(actor, d);
        actor.items.set(item.id, item);
        made.push(item);
      }
      const replaceWith = actor.raceAfterItems;
      if (replaceWith) {                                              // the other tab's replace, handled after these Items
        delete actor.raceAfterItems;
        F.calls.push({ op: "Actor.replace", id: actor.id, by: "other tab" });
        F.fire("createActor", makeActor({ ...replaceWith, name: `${replaceWith.name} (other tab)` }, { id: actor.id }), {}, F.game.user?.id);
      }
      return made;
    });
    hidden(actor, "deleteEmbeddedDocuments", async (type, ids, options) => {
      if (live()) return live().deleteEmbeddedDocuments(type, ids, options);
      F.calls.push({ op: "deleteEmbeddedDocuments", uuid: actor.uuid, type, names: ids.map(id => actor.items.get(id)?.name), options: F.plain(options) });
      for (const id of ids) actor.items.delete(id);
      return ids;
    });
    hidden(actor, "reset", () => { F.calls.push({ op: "reset", uuid: actor.uuid }); });
    F.game.actors.set(actor.id, actor);
    return actor;
  }

  class StubActor {
    /** Foundry's DataModel.cleanData, as the client calls it before an update: a copy, unchanged here. */
    static cleanData(source = {}) {
      return clone(source);
    }

    static async create(data, options) {
      F.calls.push({ op: "Actor.create", data: F.plain(data), options: F.plain(options) });
      const slug = data?.flags?.pentaryn?.slug;
      for (const other of [...K.raceCreate]) {                       // the other tab's create lands
        K.raceCreate.delete(other);
        makeActor({ name: `${other.toUpperCase()} (other tab)`, type: "npc", flags: { pentaryn: { slug: other } } }, { id: idForSlug(other) });
      }
      if (K.failCreate.has(slug)) throw new Error(`Actor validation errors: ${slug}`);
      const id = options?.keepId ? data._id : null;
      const same = K.raceSame.get(slug);
      if (same && id) {                                               // theirs first: its broadcast, then our response
        K.raceSame.delete(slug);
        F.fire("createActor", makeActor({ ...clone(data), name: `${data.name} (other tab)` }, { id }), {}, F.game.user?.id);
        setTimeout(async () => {                                      // the other tab finishes: Items, then the stamp
          const theirs = F.game.actors.get(id);
          if (same.items?.length) await theirs.createEmbeddedDocuments("Item", same.items, { render: false, keepId: false });
          await theirs.update({ flags: { pentaryn: { contentHash: same.hash } } }, { render: false });
        }, 500);
      }
      const wiped = K.raceWiped.get(slug);
      if (wiped && id) {                                              // theirs first, with its Items; then our replace
        K.raceWiped.delete(slug);
        F.fire("createActor", makeActor({ ...clone(data), name: `${data.name} (other tab)` }, { id, items: wiped.items }), {}, F.game.user?.id);
        setTimeout(async () => {                                      // its stamp, after our replace wiped its Items
          await F.game.actors.get(id).update({ flags: { pentaryn: { contentHash: wiped.hash } } }, { render: false });
        }, 500);
      }
      if (id && F.game.actors.get(id)) F.calls.push({ op: "Actor.replace", id });   // Foundry 14: no error
      const made = makeActor(data, { id });
      if (id && K.raceAfterItems.has(slug)) {
        K.raceAfterItems.delete(slug);
        hidden(made, "raceAfterItems", clone(data));
      }
      F.fire("createActor", made, F.plain(options), F.game.user?.id);   // our own response fires it too
      if (id && K.raceAfter.has(slug)) {                              // theirs second: replaces ours right after
        K.raceAfter.delete(slug);
        queueMicrotask(() => {
          F.calls.push({ op: "Actor.replace", id, by: "other tab" });
          F.fire("createActor", makeActor({ ...clone(data), name: `${data.name} (other tab)` }, { id }), {}, F.game.user?.id);
        });
      }
      return made;
    }
  }
  globalThis.getDocumentClass = name => (name === "Actor" ? StubActor : null);

  return { K, makeActor };
}
