/**
 * pentaryn-prompts — "stock monster plus changes", applied by the module (no eval-js).
 *
 * Most prompts are a Monster Manual creature with a name, a biography, a different weapon, a
 * carried item, a size change or one extra trait. `with: {kind: "actor", uuid, patch}` imports the
 * monster and applies `patch` before the token is placed, so the token inherits the new name,
 * size and art. The same patch works on a `copy: true` world actor and on the bridge's fresh npc.
 *
 * patch = {
 *   name, size ("tiny".."gargantuan"), img, biography (raw HTML; replaces), hp (number | {max, formula}),
 *   ac (flat number), cr, speed (walk ft), disposition ("hostile"|"neutral"|"friendly"|"secret"),
 *   removeItems: ["Scimitar", <item id>],
 *   addItems: [{uuid | name, quantity, equipped, rename, system: {...merged}} | {data: <item data>}], // gear by name, or a custom item inline
 *   traits: [{name, html, activation: "passive"|"action"|"bonus"|"reaction"|"special", recharge: 5, uses: {max, per: "day"|"lr"|"sr"}}],
 *   recharge: {"Earthsplitter": 5},                                                // existing items
 *   itemUpdates: [{item: name|id, set: {"system.x": v}}],                           // escape hatch
 *   set: {"system.attributes.movement.climb": 30},                                  // escape hatch
 *   creatureType: "construct" | "humanoid (goblinoid)",                              // type (subtype)
 *   languages: ["Common", "goblin"]                                                   // replaces; words → dnd5e keys
 * }
 *
 * Changing the creature type (creatureType, or set "system.details.type.value") without saying
 * `languages` clears the inherited ones: a stone guardian made from an earth elemental does not keep
 * Terran. Language words anywhere (languages, set "system.traits.languages.value") become dnd5e keys.
 * Inline `{data}` items whose text requires attunement get system.attunement "required".
 */

import { DND_SIZE_WIDTH, codedError } from "./geometry-core.mjs";
import { PATCH_KEYS } from "./prompts-core.mjs";
import { SIZE_WORDS } from "./core/size.mjs";
import { findItem, notFound } from "./character-adapter.mjs";
import { flattenLanguages, languageKeys, fixAttunement } from "./build-core.mjs";

const LANG_PATH = "system.traits.languages.value";
const TYPE_PATH = "system.details.type.value";

/** `"humanoid (goblinoid)"` → `{value: "humanoid", subtype: "goblinoid"}`. */
export function parseCreatureType(word) {
  const m = /^\s*([a-z]+)\s*(?:\(([^)]*)\))?\s*$/i.exec(String(word ?? ""));
  return m ? { value: m[1].toLowerCase(), subtype: (m[2] ?? "").trim() } : null;
}

function languageTable() {
  return flattenLanguages(globalThis.CONFIG?.DND5E?.languages ?? {});
}

export { SIZE_WORDS };

const PER = { day: "day", lr: "lr", sr: "sr", long: "lr", short: "sr", dawn: "dawn" };
const ACTIVATIONS = ["action", "bonus", "reaction", "special", "minute", "hour"];

/** The dnd5e size key a patch asks for, or null. Throws BAD_SPEC on a word it does not know. */
export function patchSize(patch) {
  if (!patch?.size) return null;
  const k = SIZE_WORDS[String(patch.size).toLowerCase()];
  if (!k) throw codedError("BAD_SPEC", `patch.size must be tiny|small|medium|large|huge|gargantuan, got ${patch.size}`);
  return k;
}

/**
 * Throw BAD_SPEC on anything a dry run can catch (unknown keys, bad items, bad words).
 * → `{notes, defaults}`: what the patch will add, and what it decided for the caller (attunement).
 */
export async function checkPatch(patch) {
  if (!patch) return { notes: [], defaults: [] };
  if (typeof patch !== "object") throw codedError("BAD_SPEC", "patch must be an object");
  const known = PATCH_KEYS;
  const extra = Object.keys(patch).filter(k => !known.includes(k));
  if (extra.length) throw codedError("BAD_SPEC", `patch: unknown key(s) ${extra.join(", ")} (known: ${known.join(", ")})`);
  patchSize(patch);
  const notes = [];
  const defaults = [];
  if (patch.creatureType !== undefined) {
    const t = parseCreatureType(patch.creatureType);
    const types = globalThis.CONFIG?.DND5E?.creatureTypes;
    if (!t || (types && !(t.value in types))) {
      throw codedError("BAD_SPEC", `patch.creatureType: "${patch.creatureType}" (${types ? Object.keys(types).join("|") : "a dnd5e creature type"}, optional "(subtype)")`);
    }
  }
  if (patch.languages !== undefined && !(Array.isArray(patch.languages) && patch.languages.every(x => typeof x === "string"))) {
    throw codedError("BAD_SPEC", "patch.languages: a list of language names or keys ([] for none)");
  }
  for (const words of [patch.languages, patch.set?.[LANG_PATH]]) {
    if (!Array.isArray(words)) continue;
    const { keys, unknown } = languageKeys(words, languageTable());
    notes.push(`languages → ${keys.join(", ") || "none"}`);
    if (unknown.length) notes.push(`languages ${unknown.join(", ")} not dnd5e languages: kept as custom text`);
  }
  const typeChange = patch.creatureType !== undefined || (patch.set && TYPE_PATH in patch.set);
  if (typeChange && patch.languages === undefined && !(patch.set && LANG_PATH in patch.set)) {
    notes.push("a changed type clears the inherited languages (pass patch.languages to keep some)");
  }
  for (const it of patch.addItems ?? []) {
    if (it?.data) {
      if (!it.data.name || !it.data.type) throw codedError("BAD_SPEC", "patch.addItems[].data needs name and type");
      const note = fixAttunement(it.data);
      if (note) defaults.push(note);
      notes.push(`+ ${it.data.name} (inline)`);
      continue;
    }
    const ref = it?.uuid ?? it?.name;
    const src = ref ? await findItem(ref, "item") : null;
    if (!src) throw codedError("BAD_SPEC", `patch.addItems: ${await notFound("item", ref, "item", "; or pass {data: {name, type, system}} for a custom item")}`);
    notes.push(`+ ${it.rename ?? src.name}${it.quantity ? ` x${it.quantity}` : ""}`);
  }

  for (const t of patch.traits ?? []) {
    if (!t?.name) throw codedError("BAD_SPEC", "patch.traits[]: name is required");
    if (t.activation && t.activation !== "passive" && !ACTIVATIONS.includes(t.activation)) {
      throw codedError("BAD_SPEC", `patch.traits[${t.name}].activation: passive|${ACTIVATIONS.join("|")}`);
    }
    if (t.recharge !== undefined && !(Number.isInteger(t.recharge) && t.recharge >= 2 && t.recharge <= 6)) {
      throw codedError("BAD_SPEC", `patch.traits[${t.name}].recharge: 2-6 (5 means "Recharge 5-6")`);
    }
  }
  for (const [n, v] of Object.entries(patch.recharge ?? {})) {
    if (!(Number.isInteger(v) && v >= 2 && v <= 6)) throw codedError("BAD_SPEC", `patch.recharge["${n}"]: 2-6`);
  }
  return { notes, defaults };
}

function findOwned(actor, ref) {
  return actor.items.get(ref) ?? actor.items.find(i => i.name.toLowerCase() === String(ref).toLowerCase());
}

/** `system.uses` + activity consumption for "Recharge n-6". */
function rechargeData(item, n) {
  const uses = { max: "1", spent: 0, recovery: [{ period: "recharge", formula: String(n), type: "recoverAll" }] };
  const acts = {};
  for (const a of item?.system?.activities ?? []) {
    const targets = (a.consumption?.targets ?? []).filter(t => t.type !== "itemUses").map(t => (t.toObject?.() ?? t));
    acts[a.id] = { consumption: { targets: [...targets, { type: "itemUses", target: "", value: "1" }] } };
  }
  return { uses, acts };
}

function traitItem(t) {
  const data = {
    name: t.name, type: "feat", img: t.img ?? "icons/svg/aura.svg",
    system: { type: { value: "monster" }, description: { value: t.html ?? t.description ?? "" } }
  };
  const act = t.activation && t.activation !== "passive" ? t.activation : null;
  if (t.recharge) {
    data.system.uses = { max: "1", spent: 0, recovery: [{ period: "recharge", formula: String(t.recharge), type: "recoverAll" }] };
  } else if (t.uses?.max) {
    data.system.uses = { max: String(t.uses.max), spent: 0, recovery: [{ period: PER[t.uses.per] ?? "day", type: "recoverAll" }] };
  }
  if (act) {
    const id = foundry.utils.randomID();
    const targets = data.system.uses ? [{ type: "itemUses", target: "", value: "1" }] : [];
    data.system.activities = { [id]: { _id: id, type: "utility", activation: { type: act }, consumption: { targets } } };
  }
  return data;
}

/**
 * Apply a patch to a world actor this run owns. → `{changed: [..], warnings: [..]}`.
 * Order: actor fields, item removals, additions, traits, recharges, item updates.
 */
export async function applyPatch(actor, patch) {
  const changed = [], warnings = [];
  if (!patch) return { changed, warnings };
  const u = {};
  if (patch.name) { u.name = patch.name; u["prototypeToken.name"] = patch.name; changed.push(`name ${patch.name}`); }
  const size = patchSize(patch);
  if (size) {
    const w = DND_SIZE_WIDTH[size];
    Object.assign(u, { "system.traits.size": size, "prototypeToken.width": w, "prototypeToken.height": w });
    changed.push(`size ${size}`);
  }
  if (patch.img) { Object.assign(u, { img: patch.img, "prototypeToken.texture.src": patch.img }); changed.push("art"); }
  if (typeof patch.biography === "string") { u["system.details.biography.value"] = patch.biography; changed.push("biography"); }
  if (patch.hp !== undefined) {
    const max = typeof patch.hp === "object" ? Number(patch.hp.max) : Number(patch.hp);
    if (max > 0) Object.assign(u, { "system.attributes.hp.max": max, "system.attributes.hp.value": max });
    if (patch.hp?.formula) u["system.attributes.hp.formula"] = patch.hp.formula;
    changed.push(`hp ${max}`);
  }
  if (patch.ac !== undefined) {
    Object.assign(u, { "system.attributes.ac.calc": "flat", "system.attributes.ac.flat": Number(patch.ac) });
    changed.push(`ac ${patch.ac}`);
  }
  if (patch.cr !== undefined) { u["system.details.cr"] = Number(patch.cr); changed.push(`cr ${patch.cr}`); }
  if (patch.speed !== undefined) { u["system.attributes.movement.walk"] = Number(patch.speed); changed.push(`speed ${patch.speed}`); }
  if (patch.disposition) {
    const D = CONST.TOKEN_DISPOSITIONS;
    const v = D[String(patch.disposition).toUpperCase()];
    if (v === undefined) throw codedError("BAD_SPEC", `patch.disposition: hostile|neutral|friendly|secret`);
    u["prototypeToken.disposition"] = v;
    changed.push(`disposition ${patch.disposition}`);
  }
  for (const [k, v] of Object.entries(patch.set ?? {})) { u[k] = v; changed.push(k); }
  // creature type, and the languages that go with it (§13)
  const table = languageTable();
  const typed = patch.creatureType !== undefined ? parseCreatureType(patch.creatureType) : null;
  if (typed) {
    Object.assign(u, { [TYPE_PATH]: typed.value, "system.details.type.subtype": typed.subtype });
    changed.push(`type ${typed.value}${typed.subtype ? ` (${typed.subtype})` : ""}`);
  }
  const words = patch.languages ?? (Array.isArray(u[LANG_PATH]) ? u[LANG_PATH] : null);
  if (words) {
    const { keys, unknown } = languageKeys(words, table);
    Object.assign(u, { [LANG_PATH]: keys, "system.traits.languages.custom": unknown.join("; ") });
    if (patch.languages) changed.push(`languages ${keys.join(", ") || "none"}${unknown.length ? ` + custom ${unknown.join(", ")}` : ""}`);
  } else {
    const newType = u[TYPE_PATH];
    const oldType = actor.system?.details?.type?.value;
    const inherited = [...(actor.system?.traits?.languages?.value ?? [])];
    if (newType && newType !== oldType && (inherited.length || actor.system?.traits?.languages?.custom)) {
      Object.assign(u, { [LANG_PATH]: [], "system.traits.languages.custom": "" });
      changed.push(`languages cleared (was ${inherited.join(", ") || actor.system.traits.languages.custom}; type ${oldType} → ${newType}; pass patch.languages to keep some)`);
    }
  }
  if (Object.keys(u).length) await actor.update(u);

  const del = [];
  for (const ref of patch.removeItems ?? []) {
    const it = findOwned(actor, ref);
    if (it) del.push(it.id); else warnings.push(`removeItems: no "${ref}" on ${actor.name}`);
  }
  if (del.length) { await actor.deleteEmbeddedDocuments("Item", del); changed.push(`removed ${del.length}`); }

  const add = [];
  for (const it of patch.addItems ?? []) {
    if (it.data) {
      const d = foundry.utils.deepClone(it.data);
      fixAttunement(d);
      delete d._id;
      if (it.quantity && d.system) d.system.quantity = it.quantity;
      add.push(d);
      continue;
    }
    const src = await findItem(it.uuid ?? it.name, "item");
    if (!src) { warnings.push(`addItems: no "${it.uuid ?? it.name}"`); continue; }
    const data = game.items.fromCompendium(src);
    if (it.quantity && data.system && "quantity" in data.system) data.system.quantity = it.quantity;
    if (["weapon", "equipment"].includes(data.type)) data.system.equipped = it.equipped ?? true;
    if (it.rename) data.name = it.rename;
    if (it.system) foundry.utils.mergeObject(data.system, it.system);
    add.push(data);
  }
  for (const t of patch.traits ?? []) add.push(traitItem(t));
  if (add.length) { await actor.createEmbeddedDocuments("Item", add); changed.push(`added ${add.map(d => d.name).join(", ")}`); }

  const upd = [];
  for (const [name, n] of Object.entries(patch.recharge ?? {})) {
    const it = findOwned(actor, name);
    if (!it) { warnings.push(`recharge: no "${name}" on ${actor.name}`); continue; }
    const { uses, acts } = rechargeData(it, n);
    const row = { _id: it.id, "system.uses": uses };
    for (const [aid, a] of Object.entries(acts)) row[`system.activities.${aid}.consumption.targets`] = a.consumption.targets;
    upd.push(row);
    changed.push(`${it.name} recharge ${n}-6`);
  }
  for (const { item, set } of patch.itemUpdates ?? []) {
    const it = findOwned(actor, item);
    if (!it) { warnings.push(`itemUpdates: no "${item}" on ${actor.name}`); continue; }
    upd.push({ _id: it.id, ...set });
    changed.push(`${it.name} updated`);
  }
  if (upd.length) await actor.updateEmbeddedDocuments("Item", upd);
  return { changed, warnings };
}

/** Ring colours by tier (context/foundry/README.md token conventions). */
export const RING_COLOURS = Object.freeze({ pc: "#ffcc4d", foe: "#d8433a", named: "#86c98a", mook: "#9098a0" });

/** Token data for a ring tier (or `none`), keeping the token's own art as the subject. */
export function ringData(tier, src) {
  if (!tier) return null;
  if (tier === "none") return { enabled: false };
  const colour = RING_COLOURS[tier];
  if (!colour) throw codedError("BAD_SPEC", `ring must be pc|foe|named|mook|none, got ${tier}`);
  return { enabled: true, colors: { ring: colour }, subject: { texture: src ?? null, scale: 1 } };
}

