/**
 * pentaryn-prompts — replace prompt markers with the real thing (plan §6).
 *
 * Deterministic: placement on the marker's footprint, provenance stamped on every created
 * document, the marker deleted only after its replacement exists, a readback from the scene.
 *
 * `npc` (`{kind: "npc", npc, features, patch}`) is built here (npc-adapter.mjs, plan §13) through the bridge
 * module's createNpcActor / add…ToActor handlers, so it works through eval-js as well as the MCP
 * tool. `{kind: "npc", actorId}` and the older bridge form `{kind: "actor", actorId, copy: false,
 * provenanceKind: "npc", stampActor: true}` still place an existing actor as an npc.
 *
 * Actors and journals THIS module creates for a replacement (npc, compendium import, copy, hotspot
 * clone, note journal, character) are deleted again when that replacement fails later in the run,
 * so a failed replacement leaves only its marker behind.
 *
 * The result is flat (plan §13): per-prompt rows of strings and lists of strings, plus `text`, the
 * readback the MCP tool prints (readback-core.mjs). Nothing nests past eval-js's depth limit.
 */

import {
  MODULE, DND_SIZE_WIDTH, placementFor, needsLockSize, footprintSquares, codedError, errorCode, textHash,
  xpBudget, difficulty, crXp, lightText as lightWords
} from "./geometry-core.mjs";
import { markerSizeOfToken, promptText } from "./markers-adapter.mjs";
import { manifestFor } from "./settings.mjs";
import { promptTokens, actorXp, provenanceOf } from "./scene-adapter.mjs";
import { checkPatch, applyPatch, patchSize, ringData } from "./actor-patch-adapter.mjs";
import { resolveCharacter, buildCharacter, previewCharacter, findItem, notFound } from "./character-adapter.mjs";
import { checkNpc, createNpc } from "./npc-adapter.mjs";
import { fixAttunement } from "./build-core.mjs";
import { specFileUrl } from "./core/text.mjs";
import { tokenDataFrom } from "./tokens-adapter.mjs";
import { renderReplace, planRow, resultRow, sheetLine, createdText, needsDryRun, goneMessage } from "./readback-core.mjs";
import { KINDS, SPEC_DIR } from "./prompts-core.mjs";
import { SIZE_WORDS, parseCr } from "./core/size.mjs";
import { replaceLogLine } from "./core/log-lines.mjs";
import { makeLog } from "./lib/log.mjs";
import { claimDocument } from "./lib/election.mjs";

const log = makeLog(MODULE);

export { KINDS, SPEC_DIR };
export const EYE = "assets/tokens/custom/props/icon-eye.webp";
export const HOTSPOT_TEMPLATE = "Hotspot · Look (template)";
export const CREATURE_FOLDER = "Foundry MCP Creatures";
const DRY_RUN_OVER = 5;
const TYPES = ["Token", "Note", "AmbientLight", "Tile"];

/** Marker sets that have been dry-run this session (signature → ms). */
const dryRuns = new Map();

const signature = entries => entries.filter(e => e.ok).map(e => `${e.scene.id}/${e.marker.id}`).sort().join(",");

/* ── resolve ────────────────────────────────────────────────────────────── */

function resolveOne(spec, index, { call, force }) {
  const e = { index, spec, ok: false, pid: spec?.id ?? null, call: spec?.call ?? call ?? null };
  try {
    if (!spec || typeof spec !== "object") throw codedError("BAD_SPEC", `replacement ${index} is not an object`);
    if (!spec.with || !KINDS.includes(spec.with.kind)) {
      throw codedError("BAD_SPEC", `replacement ${index}: with.kind must be one of ${KINDS.join("|")}`);
    }
    let sceneId = spec.sceneId, markerId = spec.markerId, entry = null;
    if (e.call && e.pid) {
      const m = manifestFor(e.call);
      if (m) {
        entry = m.prompts?.[e.pid];
        if (!entry) throw codedError("BAD_SPEC", `${e.pid} is not a prompt in ${e.call}`);
        sceneId = entry.sceneId;
        markerId = entry.markerId;
      } else if (!(sceneId && markerId)) {
        throw codedError("CALL_UNKNOWN", `${e.call} (gather again, or pass sceneId + markerId)`);
      }
    }
    if (!sceneId || !markerId) throw codedError("BAD_SPEC", `replacement ${index}: give call + id, or sceneId + markerId`);
    const scene = game.scenes.get(sceneId);
    if (!scene) throw codedError("SCENE_UNKNOWN", sceneId);
    e.scene = scene;   // a failed row still counts its scene's remaining prompts
    const marker = scene.tokens.get(markerId);
    if (!marker) throw codedError("MARKER_GONE", goneMessage({ pid: e.pid, markerId, sceneName: scene.name, ...whyGone(scene, markerId) }));
    const size = markerSizeOfToken(marker);
    if (!size) throw codedError("BAD_SPEC", `${markerId} is not a prompt marker`);
    const text = promptText(marker);
    if (entry && entry.hash !== textHash(text) && !force) {
      throw codedError("TEXT_CHANGED", `${e.pid}: the prompt was edited after the gather; gather again (or force)`);
    }
    Object.assign(e, { ok: true, scene, marker, size, text });
  } catch (err) {
    e.error = String(err.message ?? err);
    e.code = errorCode(err) ?? "BAD_SPEC";
  }
  return e;
}

/** A gone marker: the document built from it (provenance), or the marker a size chip swapped it for. */
function whyGone(scene, markerId) {
  try {
    for (const coll of [scene.tokens, scene.notes, scene.lights, scene.tiles]) {
      const doc = coll?.find(d => provenanceOf(d)?.markerId === markerId && provenanceOf(d)?.sceneId === scene.id);
      if (doc) return { replacedBy: createdText({ type: doc.documentName, id: doc.id, name: doc.name || doc.text || doc.entry?.name || (doc.documentName === "AmbientLight" ? "Light" : "") }) };
    }
    let id = markerId, next = null;
    for (let hop = 0; hop < 8; hop++) {   // resized more than once: follow the chain
      const t = scene.tokens.find(d => d.flags?.[MODULE]?.swappedFrom === id);
      if (!t) break;
      next = t.id; id = t.id;
    }
    if (next) return { resizedTo: next };
  } catch (err) { log.debug("whyGone (the message is a nicety)", err); }
  return {};
}

/* ── plan ───────────────────────────────────────────────────────────────── */

/** The kind recorded in provenance: the bridge sends npc as `actor` + `provenanceKind: "npc"`. */
function provenanceKind(w) {
  return typeof w?.provenanceKind === "string" && KINDS.includes(w.provenanceKind) ? w.provenanceKind : w?.kind;
}

function provenance(e) {
  const m = e.marker;
  return {
    prompt: e.text, size: e.size, footprint: footprintSquares(m.width, m.height),
    sceneId: e.scene.id, markerId: m.id, call: e.call, pid: e.pid,
    at: Date.now(), kind: provenanceKind(e.spec.with), note: e.spec.note ?? ""
  };
}

/**
 * Delete world documents this run created for a replacement that then failed. One delete per
 * document on purpose (a failure path, one or two documents): each one's outcome is a row of the
 * result (`discarded: false` with its error), which a batch delete could not report.
 */
async function discard(owned) {
  const out = [];
  for (const { type, id, name } of owned ?? []) {
    const coll = type === "Actor" ? game.actors : type === "JournalEntry" ? game.journal : null;
    try {
      const doc = coll?.get(id);
      if (doc) await doc.delete();
      out.push({ type, id, name, discarded: true });
    } catch (err) {
      out.push({ type, id, name, discarded: false, error: String(err?.message ?? err) });
    }
  }
  return out;
}

async function ensureFolder(name, type) {
  return game.folders.find(f => f.type === type && f.name === name)
    ?? Folder.implementation.create({ name, type });
}

function ownershipOf(o) {
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const word = v => (typeof v === "string" ? (L[v.toUpperCase()] ?? L.OBSERVER) : v);
  if (o === undefined || o === null || o === "observer") return { default: L.OBSERVER };
  if (o === "none") return { default: L.NONE };
  if (typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, word(v)]));
  return { default: word(o) };
}

/** Base fields every placed document gets: elevation, level (tokens), provenance. */
function stamp(data, e, prov) {
  data.elevation = e.marker.elevation ?? 0;
  foundry.utils.setProperty(data, `flags.${MODULE}.provenance`, prov);
  return data;
}

/** `actor` and `npc`: a world, compendium or bridge-built actor, an optional patch, its token on the footprint. */
async function planActor({ e, plan, spec, w, marker, g, mrect }) {
  let actor = null, source = null;
  if (w.actorId) {
    actor = game.actors.get(w.actorId);
    if (!actor) throw codedError("BAD_SPEC", `no world actor ${w.actorId}`);
  } else if (w.uuid) {
    source = await fromUuid(w.uuid);
    if (!(source instanceof Actor)) throw codedError("BAD_SPEC", `${w.uuid} is not an actor`);
    if (!source.pack) { actor = source; source = null; }
  } else if (w.kind === "actor") {
    throw codedError("BAD_SPEC", "actor needs actorId or uuid");
  } else if (!w.npc) {
    throw codedError("BAD_SPEC", "npc needs npc (the dnd5e-create-npc arguments) and optional features, or an actorId");
  }
  // a new npc: every argument checked now, so the dry run fails where the real run would
  const npcSpec = w.kind === "npc" && !actor ? await checkNpc(w) : null;
  if (npcSpec) plan.warnings = [...npcSpec.warnings];
  const willImport = !!source && w.copy !== false;
  if (source && !willImport) throw codedError("BAD_SPEC", "a compendium actor must be imported (copy: true)");
  const willCopy = !!actor && w.copy === true;
  const ref = actor ?? source;
  const stampActor = w.kind === "npc" || w.stampActor === true || provenanceKind(w) === "npc";
  if (w.patch && !(willImport || willCopy || stampActor)) {
    throw codedError("BAD_SPEC", "patch changes the actor: use a compendium uuid, or copy: true for a world actor");
  }
  const { notes: patchNotes, defaults: patchDefaults } = await checkPatch(w.patch);
  if (patchDefaults.length) plan.defaults = [...(plan.defaults ?? []), ...patchDefaults];
  const psize = patchSize(w.patch);
  const dndSize = psize ?? ref?.system?.traits?.size ?? SIZE_WORDS[String(w.npc?.size ?? "").toLowerCase()] ?? "med";
  const tw = psize ? DND_SIZE_WIDTH[psize] : (ref?.prototypeToken?.width ?? DND_SIZE_WIDTH[dndSize] ?? 1);
  const th = psize ? tw : (ref?.prototypeToken?.height ?? tw);
  const ring = ringData(spec.ring, null);
  const pos = placementFor(mrect, {
    type: "token", w: tw, h: th,
    snap: (x, y) => marker.getSnappedPosition({ x, y, width: tw, height: th })
  }, g);
  const lockSize = needsLockSize(tw, dndSize) || tw !== th;
  const hidden = spec.hidden ?? false;
  Object.assign(plan, { x: pos.x, y: pos.y, placement: pos.mode, lockSize, hidden, footprint: footprintSquares(tw, th) });
  plan.xp = estimateXp({ spec, w, ref, npc: npcSpec?.npc });
  plan.creates = [
    willImport ? `Actor (import "${source.name}" into ${CREATURE_FOLDER})`
      : willCopy ? `Actor (copy of "${actor.name}")`
        : npcSpec ? `Actor (NPC "${npcSpec.npc.name}", ${npcSpec.npc.creatureType} CR ${npcSpec.npc.cr}, into ${CREATURE_FOLDER}` +
          `${npcSpec.features.length ? `; features: ${npcSpec.features.map(f => f.label).join(", ")}` : ""})` : null,
    w.patch ? `patch: ${Object.keys(w.patch).join(", ")}${patchNotes.length ? ` (${patchNotes.join(", ")})` : ""}` : null,
    `Token "${spec.name ?? w.patch?.name ?? ref?.prototypeToken?.name ?? ref?.name ?? w.npc?.name ?? "?"}"${ring ? `, ring ${spec.ring}` : ""}`
  ].filter(Boolean);
  plan.exec = async (prov, own) => {
    let a = actor, createdActor = false;
    let patch = w.patch;
    if (npcSpec) {
      const made = await createNpc(npcSpec, own);
      a = made.actor;
      e.report = { warnings: made.warnings, notes: made.notes };
      // recharge on the features just added, by name (the shape dnd5e-add-feature's recharge wrote)
      if (Object.keys(npcSpec.recharge).length) patch = { ...(w.patch ?? {}), recharge: { ...npcSpec.recharge, ...(w.patch?.recharge ?? {}) } };
    } else if (willImport) {
      const folder = await ensureFolder(CREATURE_FOLDER, "Actor");
      const data = game.actors.fromCompendium(source);
      data.folder = folder.id;
      a = await Actor.implementation.create(data);
      createdActor = true;
    } else if (willCopy) {
      const data = actor.toObject();
      delete data._id;
      a = await Actor.implementation.create(data);
      createdActor = true;
    }
    if (createdActor) own({ type: "Actor", id: a.id, name: a.name });
    if (createdActor || stampActor) await a.update({ [`flags.${MODULE}.provenance`]: prov });
    if (patch) {
      const r = await applyPatch(a, patch);
      e.report = { ...(e.report ?? {}), patched: r.changed, warnings: [...(e.report?.warnings ?? []), ...r.warnings] };
    }
    if (plan.defaults?.length) e.report = { ...(e.report ?? {}), defaults: [...plan.defaults, ...(e.report?.defaults ?? [])] };
    return { type: "Token", data: await tokenData(a, e, prov, { pos, hidden, lockSize }),
      extra: (createdActor || stampActor || npcSpec) ? [{ type: "Actor", id: a.id, name: a.name }] : [] };
  };
}

/** `character`: a level-N player character from the owned books, its token on the footprint. */
async function planCharacter({ e, plan, spec, w, marker, g, mrect }) {
  const resolved = await resolveCharacter(w);
  const tw = DND_SIZE_WIDTH[resolved.size] ?? 1;
  const pos = placementFor(mrect, {
    type: "token", w: tw, h: tw, snap: (x, y) => marker.getSnappedPosition({ x, y, width: tw, height: tw })
  }, g);
  const hidden = spec.hidden ?? false;
  const lockSize = needsLockSize(tw, resolved.size);
  const ring = ringData(spec.ring ?? "pc", null);
  const d = resolved.docs;
  Object.assign(plan, { x: pos.x, y: pos.y, placement: pos.mode, lockSize, hidden, footprint: footprintSquares(tw),
    warnings: [...resolved.warnings, ...(resolved.planWarnings ?? [])], defaults: resolved.defaults });
  // the dry run builds it on an unsaved actor (§14): the real run's DEFAULTED / WARN lines and
  // its sheet, before anything exists. A BAD_SPEC there is the real run's BAD_SPEC.
  if (e.dryRun) {
    try {
      const pre = await previewCharacter(w, resolved);
      Object.assign(plan, { warnings: pre.warnings, defaults: pre.defaults, sheet: sheetLine(pre.summary),
        starting: pre.starting ?? [] });
    } catch (err) {
      if (errorCode(err) === "BAD_SPEC") throw err;
      plan.warnings = [...plan.warnings, `preview incomplete (${err?.message ?? err}): the real run may print DEFAULTED/WARN lines this dry run did not`];
    }
  }
  const sp = resolved.spells;
  plan.creates = [
    `Actor (character "${w.name}": ${d.species.name}, ${d.background.name}, ${d.cls.name} ${resolved.level}${d.subclass ? ` ${d.subclass.name}` : ""}; advancements run by dnd5e` +
      `${w.choices ? `; choices checked: ${Object.keys(w.choices).length}` : ""})`,
    sp.prepared.length || sp.book.length ? `spells on the ${d.cls.name} list: ${[...sp.prepared, ...sp.book].map(x => x.name).join(", ")}` : null,
    resolved.gear.length ? `gear: ${resolved.gear.map(g => g.src?.name ?? g.data?.name).join(", ")}` : null,
    plan.starting?.length ? `starting equipment: ${plan.starting.join(", ")}` : null,
    `Token "${spec.name ?? w.name}"${ring?.enabled ? `, ring ${spec.ring ?? "pc"}` : ""}`
  ].filter(Boolean);
  plan.exec = async (prov, own) => {
    const { actor, report } = await buildCharacter(w, resolved, { prov });
    own({ type: "Actor", id: actor.id, name: actor.name });
    e.report = report;
    return { type: "Token", data: await tokenData(actor, e, prov, { pos, hidden, lockSize, ring: spec.ring ?? "pc" }),
      extra: [{ type: "Actor", id: actor.id, name: actor.name }] };
  };
}

/** `hotspot`: a clone of the Item Piles look template with its items, and an optional light. */
async function planHotspot({ e, plan, spec, w, scene, marker, g, mrect }) {
  const template = game.actors.find(a => a.name === HOTSPOT_TEMPLATE);
  if (!template) throw codedError("BAD_SPEC", `no "${HOTSPOT_TEMPLATE}" actor in this world`);
  if (!w.name) throw codedError("BAD_SPEC", "hotspot needs a name");
  const size = Number(w.size) > 0 ? Number(w.size) : 0.5;
  // Resolve every item now, so a bad uuid fails the dry run and never leaves a half-built clone.
  // items: {uuid | name} from a compendium (PHB/SRD gear by name), or {data} built inline (a
  // custom treasure) — never a world item, so nothing is left in the Items sidebar for cleanup to miss
  const sources = [];
  const defaults = [];
  for (const it of w.items ?? []) {
    if (it?.data) {
      if (!it.data.name || !it.data.type) throw codedError("BAD_SPEC", "hotspot item data needs name and type");
      const note = fixAttunement(it.data);
      if (note) defaults.push(note);
      sources.push({ src: null, it });
      continue;
    }
    const src = (it?.uuid || it?.name) ? await findItem(it.uuid ?? it.name, "item") : null;
    if (!(src instanceof Item)) {
      throw codedError("BAD_SPEC", `hotspot items: ${await notFound("item", it?.uuid ?? it?.name ?? "?", "item", "; or pass {data: {name, type, system}} for a custom item")}`);
    }
    sources.push({ src, it });
  }
  if (defaults.length) plan.defaults = defaults;
  const pos = placementFor(mrect, { type: "token", w: size, h: size }, g);
  const hidden = spec.hidden ?? false;
  const light = w.light ? checkLightConfig(w.light, "hotspot.light") : null;
  Object.assign(plan, { x: pos.x, y: pos.y, placement: pos.mode, lockSize: true, hidden, footprint: footprintSquares(size) });
  plan.creates = [`Actor (hotspot "${w.name}" from the template)`,
    sources.length ? `items: ${sources.map(x => `${x.it.rename ?? x.src?.name ?? x.it.data?.name}${x.it.quantity > 1 ? ` x${x.it.quantity}` : ""}`).join(", ")}` : "no items",
    "Token", light ? `AmbientLight at its centre (${lightWords(light) || "default"})` : null].filter(Boolean);
  plan.exec = async (prov, own) => {
    const icon = w.icon ?? EYE;
    if (plan.defaults?.length) e.report = { defaults: plan.defaults };
    const items = sources.map(({ src, it }) => {
      const o = src ? game.items.fromCompendium(src) : foundry.utils.deepClone(it.data);
      delete o._id;
      if (o.system && "quantity" in o.system) o.system.quantity = it.quantity ?? o.system.quantity ?? 1;
      if (it.rename) o.name = it.rename;
      if (it.system) o.system = foundry.utils.mergeObject(o.system ?? {}, it.system, { inplace: false });
      foundry.utils.setProperty(o, `flags.${MODULE}.provenance`, prov);
      return o;
    });
    const actor = await template.clone({ name: w.name, folder: template.folder?.id ?? null }, { save: true });
    own({ type: "Actor", id: actor.id, name: actor.name });
    if (items.length) await actor.createEmbeddedDocuments("Item", items);
    const merged = foundry.utils.mergeObject(actor.getFlag("item-piles", "data") ?? {}, {
      closedImage: icon, openedImage: icon, lockedImage: icon, emptyImage: icon,
      description: w.description ?? "", closed: true, locked: !!w.locked, deleteWhenEmpty: false
    }, { inplace: false });
    await actor.update({
      img: icon,
      "flags.item-piles.data": merged,
      "prototypeToken.name": spec.name ?? w.name,
      "prototypeToken.width": size, "prototypeToken.height": size,
      "prototypeToken.texture.src": icon,
      "prototypeToken.flags.item-piles.data": merged,
      "prototypeToken.flags.dnd5e.lockSize": true,
      [`flags.${MODULE}.provenance`]: prov
    });
    const data = await tokenDataFrom(actor, scene, { at: pos,
      extra: { width: size, height: size, hidden, name: spec.name ?? w.name, ...(marker.level ? { level: marker.level } : {}) } });
    foundry.utils.setProperty(data, "texture.src", icon);
    foundry.utils.setProperty(data, "flags.item-piles.data", merged);
    foundry.utils.setProperty(data, "flags.dnd5e.lockSize", true);
    const also = light ? [{ type: "AmbientLight", data: stamp({ x: Math.round(pos.x + size * g / 2), y: Math.round(pos.y + size * g / 2),
      config: light, hidden: false }, e, prov) }] : [];
    return { type: "Token", data: stamp(data, e, prov), extra: [{ type: "Actor", id: actor.id, name: actor.name }], also };
  };
}

/** `note`: a journal entry and its map pin, and an optional light. */
async function planNote({ e, plan, spec, w, g, mrect }) {
  if (!w.name || typeof w.html !== "string") throw codedError("BAD_SPEC", "note needs name and html");
  const pos = placementFor(mrect, { type: "centred" }, g);
  const light = w.light ? checkLightConfig(w.light, "note.light") : null;
  Object.assign(plan, { x: pos.x, y: pos.y, placement: pos.mode });
  plan.creates = [`JournalEntry "${w.name}"`, "Note", light ? `AmbientLight at the pin (${lightWords(light) || "default"})` : null].filter(Boolean);
  plan.exec = async (prov, own) => {
    const je = await JournalEntry.implementation.create({
      name: w.name, folder: w.folderId ?? null, ownership: ownershipOf(w.ownership),
      pages: [{ name: w.name, type: "text", title: { show: false, level: 1 }, text: { format: 1, content: w.html } }],
      flags: { [MODULE]: { provenance: prov } }
    });
    own({ type: "JournalEntry", id: je.id, name: je.name });
    const data = {
      entryId: je.id, pageId: je.pages.contents[0]?.id ?? null, x: pos.x, y: pos.y,
      texture: { src: w.icon ?? EYE }, iconSize: w.iconSize ?? 64, text: spec.name ?? w.label ?? w.name,
      fontSize: 24, textAnchor: CONST.TEXT_ANCHOR_POINTS?.BOTTOM ?? 1, global: false
    };
    const also = light ? [{ type: "AmbientLight", data: stamp({ x: pos.x, y: pos.y, config: light, hidden: false }, e, prov) }] : [];
    return { type: "Note", data: stamp(data, e, prov), extra: [{ type: "JournalEntry", id: je.id, name: je.name }], also };
  };
}

/** `light`: an AmbientLight at the footprint's centre. */
async function planLight({ e, plan, spec, w, g, mrect }) {
  const pos = placementFor(mrect, { type: "centred" }, g);
  const hidden = w.hidden ?? spec.hidden ?? false;
  const config = checkLightConfig(w.config ?? {}, "light.config");
  Object.assign(plan, { x: pos.x, y: pos.y, placement: pos.mode, hidden });
  plan.creates = [`AmbientLight (${lightWords(config) || "default"})`];
  plan.exec = async prov => ({ type: "AmbientLight", data: stamp({ x: pos.x, y: pos.y, config, hidden }, e, prov), extra: [] });
}

/** `tile`: a tile centred on the footprint. */
async function planTile({ e, plan, spec, w, marker, g, mrect }) {
  if (!w.src) throw codedError("BAD_SPEC", "tile needs src");
  const tw = (Number(w.width) || marker.width) * g, th = (Number(w.height) || marker.height) * g;
  const cx = mrect.x + mrect.w / 2, cy = mrect.y + mrect.h / 2;
  const x = Math.round(cx - tw / 2), y = Math.round(cy - th / 2);
  const hidden = spec.hidden ?? false;
  Object.assign(plan, { x, y, placement: "centred", hidden, footprint: footprintSquares(tw / g, th / g) });
  plan.creates = ["Tile"];
  plan.exec = async prov => ({ type: "Tile", data: stamp({ texture: { src: w.src }, x, y, width: tw, height: th, hidden }, e, prov), extra: [] });
}

/** `none`: nothing built; the marker is removed with the reason recorded. */
async function planNone({ plan, w }) {
  plan.creates = [];
  plan.reason = w.reason ?? "";
  plan.exec = null;
}
/** One planner per replacement kind, in KINDS order (prompts-lookup-13): adding a kind is a row here and a function above. */
const PLANNERS = Object.freeze({
  actor: planActor, npc: planActor, character: planCharacter, hotspot: planHotspot, note: planNote, light: planLight, tile: planTile, none: planNone,
});

async function planOne(e) {
  const { spec, scene, marker } = e;
  const w = spec.with;
  const g = scene.dimensions.size;
  const mrect = { x: marker.x, y: marker.y, w: marker.width * g, h: marker.height * g };
  const plan = {
    id: e.pid, sceneId: scene.id, markerId: marker.id, kind: w.kind,
    marker: { size: e.size, x: marker.x, y: marker.y, w: marker.width, h: marker.height },
    prompt: e.text, x: null, y: null, lockSize: null, hidden: null, creates: []
  };

  await PLANNERS[w.kind]({ e, plan, spec, w, scene, marker, g, mrect });
  return plan;
}

/** An AmbientLight `config` (dim, bright, color, animation, …): an object of known LightData keys. */
function checkLightConfig(cfg, where) {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) throw codedError("BAD_SPEC", `${where} must be an AmbientLight config object, e.g. {dim: 10, bright: 5, color: "#9fd3ff", animation: {type: "pulse"}}`);
  let known = null;
  try { known = Object.keys(foundry.data.LightData.schema.fields); } catch (err) { log.debug("LightData schema (older core: unchecked)", err); }
  const bad = known ? Object.keys(cfg).filter(k => !known.includes(k)) : [];
  if (bad.length) throw codedError("BAD_SPEC", `${where}: unknown key(s) ${bad.join(", ")}; known: ${known.join(", ")}`);
  return cfg;
}


/**
 * What a planned creature will add to its encounter's budget, for the dry run's encounter lines:
 * its CR's XP when it will stand hostile (the spec's, the patch's or the source's disposition), else 0.
 */
function estimateXp({ spec, w, ref, npc }) {
  const word = spec.disposition ?? w.patch?.disposition ?? null;
  const D = CONST.TOKEN_DISPOSITIONS;
  const hostile = word ? String(word).toLowerCase() === "hostile"
    : ref ? (ref.prototypeToken?.disposition ?? D.HOSTILE) === D.HOSTILE : true;
  if (!hostile) return 0;
  if (ref?.type && ref.type !== "npc") return 0;
  const cr = parseCr(w.patch?.cr) ?? parseCr(npc?.cr) ?? parseCr(ref?.system?.details?.cr);
  if (cr === null) return 0;
  const set = Number(ref?.system?.details?.xp?.value);
  return w.patch?.cr === undefined && Number.isFinite(set) && set > 0 ? set : crXp(cr);
}

/** The placed token's data from an actor: position, hidden, lockSize, level, name, art, ring. */
async function tokenData(a, e, prov, { pos, hidden, lockSize, ring = e.spec.ring }) {
  const { spec, scene, marker } = e;
  const data = await tokenDataFrom(a, scene, { at: pos, extra: { hidden, ...(marker.level ? { level: marker.level } : {}) } });
  if (spec.name) data.name = spec.name;
  if (spec.img) foundry.utils.setProperty(data, "texture.src", spec.img);
  if (spec.disposition) {
    const v = CONST.TOKEN_DISPOSITIONS[String(spec.disposition).toUpperCase()];
    if (v !== undefined) data.disposition = v;
  }
  const r = ringData(ring, data.texture?.src);
  if (r) data.ring = foundry.utils.mergeObject(data.ring ?? {}, r, { inplace: false });
  if (lockSize) foundry.utils.setProperty(data, "flags.dnd5e.lockSize", true);
  return stamp(data, e, prov);
}

/** The label a row carries: the p#, or the marker id when targeted by sceneId + markerId. */
function labelOf(e) {
  return e.pid ?? (e.spec?.sceneId && e.spec?.markerId ? `${e.spec.sceneId}/${e.spec.markerId}` : `#${e.index}`);
}

/** A dry-run row: flat (strings, numbers, booleans, lists of strings). */
function dryRow(e) {
  return planRow({ index: e.index, id: e.pid, label: labelOf(e), kind: e.spec?.with?.kind ?? null, ok: !!e.ok,
    code: e.code, error: e.error, plan: e.plan });
}

/* ── run ────────────────────────────────────────────────────────────────── */

async function createBatch(scene, type, rows) {
  const byMarker = docs => new Map(docs.map(d => [d.flags?.[MODULE]?.provenance?.markerId, d]));
  try {
    const docs = await scene.createEmbeddedDocuments(type, rows.map(r => r.data));
    const map = byMarker(docs ?? []);
    return rows.map(r => {
      const doc = map.get(r.entry.marker.id);
      return doc ? { entry: r.entry, doc } : { entry: r.entry, error: "creation was cancelled by a hook" };
    });
  } catch (err) {
    log.warn(`batch ${type} create failed on ${scene.name}; retrying one by one`, err);
    const out = [];
    for (const r of rows) {
      try {
        const [doc] = await scene.createEmbeddedDocuments(type, [r.data]);
        out.push(doc ? { entry: r.entry, doc } : { entry: r.entry, error: "creation was cancelled by a hook" });
      } catch (e) {
        out.push({ entry: r.entry, error: String(e?.message ?? e) });
      }
    }
    return out;
  }
}

function readDoc(scene, type, id) {
  const doc = scene.getEmbeddedDocument(type, id);
  if (!doc) return { type, id, missing: true };
  const g = scene.dimensions.size;
  const base = { type, id, name: doc.name ?? doc.text ?? (type === "AmbientLight" ? "Light" : ""), x: doc.x, y: doc.y };
  if (type === "Token") return { ...base, w: doc.width, h: doc.height, hidden: doc.hidden, lockSize: !!doc.flags?.dnd5e?.lockSize };
  if (type === "Tile") return { ...base, w: doc.width / g, h: doc.height / g };
  return base;
}

/**
 * Each encounter this run built into: its creatures' XP now (new actors plus built members) against
 * the party budget from the gather (or `party` on the replace call). Hostile-or-neutral npcs only.
 */
function encounterXp(entries, results, args) {
  const byPid = new Map(results.filter(r => r.ok && r.id).map(r => [r.id, r]));
  return encounterLines(entries, args, pid => {
    const r = byPid.get(pid);
    if (!r) return null;
    const doc = r._tokenId ? game.scenes.get(r.sceneId)?.tokens.get(r._tokenId) : null;
    // a world actor placed as it is (actorId, no copy) made no Actor of its own: read the token's
    const actor = (r._actorId ? game.actors.get(r._actorId) : null) ?? doc?.actor ?? null;
    return actor ? actorXp(actor, doc) : 0;
  });
}

/** The dry run's encounter lines: each planned creature's CR XP (estimateXp), the built members' XP. */
function encounterEstimate(entries, args) {
  const byPid = new Map(entries.filter(e => e.ok && e.pid && e.plan).map(e => [e.pid, e]));
  return encounterLines(entries, args, pid => (byPid.has(pid) ? Number(byPid.get(pid).plan.xp) || 0 : null))
    .map(l => ({ ...l, estimate: true }));
}

/**
 * One line per encounter this call touches. `xpOf(pid)` → the XP that prompt adds (0 when it is no
 * hostile creature), or null when the prompt is not in this call.
 */
function encounterLines(entries, args, xpOf) {
  const call = args.call ?? entries.find(e => e.call)?.call;
  const m = call ? manifestFor(call) : null;
  if (!m?.encounters) return [];
  const budget = xpBudget(args.party ?? m.opts?.party);
  const out = [];
  for (const [eid, enc] of Object.entries(m.encounters)) {
    const pids = enc.members.filter(id => /^p\d+$/.test(id));
    if (!pids.some(p => xpOf(p) !== null)) continue;
    let xp = 0, creatures = 0, open = 0;
    for (const id of enc.members) {
      if (/^p\d+$/.test(id)) {
        const x = xpOf(id);
        if (x === null) { open++; continue; }
        if (x) { xp += x; creatures++; }
      } else {
        const b = m.built?.[id];
        if (b?.xp) { xp += b.xp; creatures++; }
      }
    }
    out.push({ id: eid, xp, creatures, unbuilt: open, budget, difficulty: difficulty(xp, budget) });
  }
  return out;
}

function remainingFor(scenes) {
  return Object.fromEntries([...scenes].map(s => [s.id, promptTokens(s).length]));
}

/** The replace summary (prompts-lookup-18): a debug line, built only with CONFIG.debug on. */
function logSummary({ call, dryRun, rows, remaining, t0 }) {
  const debug = log.debug$;
  if (!debug) return;
  const ok = rows.filter(r => r.ok).length;
  debug(replaceLogLine({ call, dryRun, ok, failed: rows.length - ok, ms: Math.round(performance.now() - t0),
    created: rows.reduce((n, r) => n + (r.created?.length ?? 0), 0),
    left: Object.values(remaining).reduce((n, v) => n + v, 0) }));
}

/**
 * Replace markers. `input` is `{call?, replacements, dryRun?, force?, skipDryRun?, party?}` or an
 * array of replacements (then `opts` carries call/dryRun/force).
 * → `{dryRun, call, text, results: [flat row], remaining: {sceneId: n}, encounters: [{id, xp, …}]}`;
 * `text` is the readback the MCP tool prints, line for line.
 */
export async function replaceMany(input, opts = {}) {
  const t0 = performance.now();
  let args = Array.isArray(input) ? { ...opts, replacements: input } : { ...(input ?? {}), ...opts };
  if (args.specFile) args = await withSpecFile(args);
  const { replacements, call = null, dryRun = false, force = false } = args;
  if (!Array.isArray(replacements) || !replacements.length) throw codedError("BAD_SPEC", "replacements must be a non-empty array");
  for (const r of replacements) if (r?.ring) ringData(r.ring, null);   // BAD_SPEC on a bad tier, before anything runs

  const resolveAll = () => replacements.map((spec, i) => resolveOne(spec, i, { call, force }));
  if (dryRun) return replaceResolved(args, resolveAll(), t0);
  // a real run waits for this tab's earlier runs on its scenes, then resolves again (prompts-core-AC-1)
  const sceneIds = resolveAll().map(e => e.scene?.id).filter(Boolean);
  return inSceneQueue(sceneIds, () => replaceResolved(args, resolveAll(), t0));
}

/** This tab's replace runs, per scene: sceneId → the tail of its queue (prompts-core-AC-1). */
const sceneQueue = new Map();

/** Run `fn` once every earlier run queued on any of `sceneIds` has settled. */
function inSceneQueue(sceneIds, fn) {
  const ids = [...new Set(sceneIds)];
  const ahead = ids.map(id => sceneQueue.get(id)).filter(Boolean);
  const done = Promise.all(ahead).then(fn);
  const tail = done.then(() => {}, () => {});
  for (const id of ids) sceneQueue.set(id, tail);
  void tail.then(() => { for (const id of ids) if (sceneQueue.get(id) === tail) sceneQueue.delete(id); });
  return done;
}

const CLAIM = "replace";

/**
 * Claim each marker this run will replace, across tabs (prompts-core-AC-1): the bridge tab and a
 * GM browser tab are both the active GM. A marker another tab holds fails its row as MARKER_GONE;
 * the other rows go on. `force` takes over a claim left by a tab that went away mid-run.
 */
async function claimMarkers(entries, force) {
  const me = game.socket?.id;
  await Promise.all(entries.filter(e => e.ok).map(async e => {
    const { scene, marker } = e;
    let won = false, failed = null;
    try {
      const held = marker.flags?.[MODULE]?.claims?.[CLAIM];
      if (force && held && held !== me) await marker.update({ [`flags.${MODULE}.claims.${CLAIM}`]: null });
      won = await claimDocument(marker, CLAIM, { scope: MODULE, reread: m => scene.tokens.get(m.id) ?? {} });
    } catch (err) { failed = err; log.debug(`claim on ${marker.id} failed`, err); }
    if (won) return;
    const who = e.pid ?? marker.id;
    e.ok = false; e.code = "MARKER_GONE";
    e.error = !scene.tokens.get(marker.id) ? goneMessage({ pid: e.pid, markerId: marker.id, sceneName: scene.name, ...whyGone(scene, marker.id) })
      : failed ? `${who} on ${scene.name}: could not claim the marker (${failed?.message ?? failed}); this row was skipped`
        : `${who} on ${scene.name} is being replaced by another GM tab; this row was skipped (gather again when it is done, or force to take it over)`;
  }));
}

/** Take this tab's claim off markers it claimed but did not replace (a failed row). */
async function releaseClaims(entries) {
  const me = game.socket?.id;
  if (!me) return;
  for (const e of entries) {
    const m = e.marker && e.scene?.tokens.get(e.marker.id);
    if (m?.flags?.[MODULE]?.claims?.[CLAIM] !== me) continue;
    try { await m.unsetFlag(MODULE, "claims"); } catch (err) { log.debug(`claim release on ${m.id} failed`, err); }
  }
}

/** replaceMany past argument checks: `entries` resolved (and, for a real run, queued on its scenes). */
async function replaceResolved(args, entries, t0) {
  const { call = null, dryRun = false, force = false } = args;
  const seen = new Set();
  for (const e of entries) {
    if (!e.ok) continue;
    const k = `${e.scene.id}/${e.marker.id}`;
    if (seen.has(k)) { e.ok = false; e.code = "BAD_SPEC"; e.error = `${e.pid ?? e.marker.id} is replaced twice in this call`; }
    seen.add(k);
  }
  for (const e of entries) {
    if (!e.ok) continue;
    e.dryRun = !!dryRun;
    try { e.plan = await planOne(e); } catch (err) {
      e.ok = false; e.code = errorCode(err) ?? "BAD_SPEC"; e.error = String(err.message ?? err);
    }
  }
  const scenes = new Set(entries.filter(e => e.scene).map(e => e.scene));

  if (dryRun) {
    dryRuns.set(signature(entries), Date.now());
    const rows = entries.map(dryRow);
    const remaining = remainingFor(scenes);
    const callOut = call ?? entries.find(e => e.call)?.call ?? null;
    const encounters = encounterEstimate(entries, args);
    logSummary({ call: callOut, dryRun: true, rows, remaining, t0 });
    return { dryRun: true, call: callOut, text: renderReplace({ dryRun: true, call: callOut, rows, remaining, encounters }),
      results: rows, remaining, encounters };
  }
  const requested = entries.length;
  if (needsDryRun({ requested, seen: dryRuns.has(signature(entries)), skip: !!args.skipDryRun, over: DRY_RUN_OVER })) {
    throw codedError("DRY_RUN_REQUIRED", `${requested} replacements (over ${DRY_RUN_OVER}): run the same set with dryRun: true first, read the plan, then repeat it without dryRun`);
  }

  // 0. Claim the markers across tabs; a row another tab holds fails alone.
  await claimMarkers(entries, force);

  // 1. Actors and journals first, per replacement; then the placed document data.
  const rows = [];
  for (const e of entries) {
    if (!e.ok || !e.plan.exec) continue;
    e.owned = [];
    try {
      const prov = provenance(e);
      const made = await e.plan.exec(prov, doc => e.owned.push(doc));
      e.extra = made.extra;
      rows.push({ entry: e, type: made.type, data: made.data });
      // a hotspot's or note's light: placed with it, a failure is a WARN, never the replacement's
      for (const a of made.also ?? []) rows.push({ entry: e, type: a.type, data: a.data, also: true });
    } catch (err) {
      e.ok = false; e.code = errorCode(err) ?? "CREATE_FAILED";
      e.error = e.code === "CREATE_FAILED" ? `CREATE_FAILED: ${err.message ?? err}` : String(err.message ?? err);
    }
  }

  // 2. Per scene: one create per document type, then one delete of the markers that were replaced.
  for (const scene of scenes) {
    for (const type of TYPES) {
      const batch = rows.filter(r => r.entry.scene === scene && r.type === type && r.entry.ok);
      if (!batch.length) continue;
      for (const res of await createBatch(scene, type, batch)) {
        const also = batch.find(r => r.entry === res.entry)?.also;
        if (res.doc) (res.entry.created ??= []).push({ type, id: res.doc.id, also: !!also });
        else if (also) {
          res.entry.report = { ...(res.entry.report ?? {}), warnings: [...(res.entry.report?.warnings ?? []), `${type} not placed: ${res.error}`] };
        } else { res.entry.ok = false; res.entry.code = "CREATE_FAILED"; res.entry.error = `CREATE_FAILED: ${res.error}`; }
      }
    }
    const dead = entries.filter(e => e.ok && e.scene === scene && (e.created?.some(c => !c.also) || e.spec.with.kind === "none")).map(e => e.marker.id);
    if (dead.length) {
      try {
        await scene.deleteEmbeddedDocuments("Token", dead);
      } catch (err) {
        log.warn(`marker delete failed on ${scene.name}`, err);
      }
    }
  }

  // 3. A replacement that failed after step 1 created its actor/journal: take those back out.
  for (const e of entries) {
    if (!e.ok && e.owned?.length) e.discarded = await discard(e.owned);
  }
  await releaseClaims(entries);

  // 4. Readback from the scenes: flat rows (no object below a row), and the text the tool prints.
  const results = entries.map(e => {
    const f = { index: e.index, id: e.pid, label: labelOf(e), sceneId: e.scene?.id ?? null, markerId: e.marker?.id ?? null,
      kind: e.spec?.with ? provenanceKind(e.spec.with) : null, ok: !!e.ok, report: e.report, discarded: e.discarded };
    if (!e.ok) {
      const gone = new Set((e.discarded ?? []).filter(d => d.discarded).map(d => d.id));
      return resultRow({ ...f, code: e.code, error: e.error, created: (e.extra ?? []).filter(x => !gone.has(x.id)),
        markerDeleted: !!(e.marker && !e.scene?.tokens.get(e.marker.id)) });
    }
    const created = [...(e.created ?? []).map(c => readDoc(e.scene, c.type, c.id)), ...(e.extra ?? [])];
    const none = e.spec.with.kind === "none";
    const r = resultRow({ ...f, created, markerDeleted: !e.scene.tokens.get(e.marker.id),
      ...(none ? { reason: e.spec.with.reason ?? "", prompt: e.text } : {}) });
    // internal, for the XP count below (dropped before returning)
    r._actorId = created.find(c => c.type === "Actor")?.id ?? null;
    r._tokenId = (e.created ?? []).find(c => c.type === "Token")?.id ?? null;
    return r;
  });
  const encounters = encounterXp(entries, results, args);
  for (const r of results) { delete r._actorId; delete r._tokenId; }
  const remaining = remainingFor(scenes);
  const callOut = call ?? entries.find(e => e.call)?.call ?? null;
  logSummary({ call: callOut, dryRun: false, rows: results, remaining, t0 });
  return { dryRun: false, call: callOut, text: renderReplace({ dryRun: false, call: callOut, rows: results, remaining, encounters }),
    results, remaining, encounters };
}

/**
 * `{specFile, …}` → the args with the file's `replacements` (and its `call` / `party` unless the
 * call gives them). The file is JSON: an array of replacements, or `{call?, party?, replacements}`.
 * `dryRun`, `force` and `skipDryRun` are never read from a file — the call decides whether it runs.
 */
async function withSpecFile(args) {
  const rel = specFileUrl(args.specFile);
  if (!rel) throw codedError("BAD_SPEC", `specFile must be under the Foundry Data directory (e.g. "${SPEC_DIR}/<name>.json"); got ${args.specFile}`);
  let res, body;
  try {
    const url = foundry.utils.getRoute(rel);
    res = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
    body = await res.text();
  } catch (err) {
    throw codedError("BAD_SPEC", `specFile ${rel}: could not read (${err?.message ?? err})`);
  }
  if (!res.ok) throw codedError("BAD_SPEC", `specFile ${rel}: HTTP ${res.status} (is it under the Data directory?)`);
  let spec;
  try { spec = JSON.parse(body); } catch (err) {
    throw codedError("BAD_SPEC", `specFile ${rel}: not JSON (${String(err?.message ?? err).slice(0, 120)}) — write JSON, not a JS object literal`);
  }
  const file = Array.isArray(spec) ? { replacements: spec } : (spec ?? {});
  if (!Array.isArray(file.replacements)) throw codedError("BAD_SPEC", `specFile ${rel}: needs "replacements" (or be an array of them)`);
  const { specFile, ...rest } = args;
  return { ...rest, replacements: rest.replacements ?? file.replacements, call: rest.call ?? file.call ?? null,
    party: rest.party ?? file.party };
}

/**
 * One replacement. Same return shape as replaceMany. Run options (`dryRun`, `force`,
 * `skipDryRun`) are read from `opts` or from the spec itself — a `dryRun: true` written into the
 * spec must never run for real.
 */
export function replace(spec, opts = {}) {
  const { dryRun, force, skipDryRun, ...one } = spec ?? {};
  const run = Object.fromEntries(Object.entries({ dryRun, force, skipDryRun }).filter(([, v]) => v !== undefined));
  return replaceMany([one], { call: one.call, ...run, ...opts });
}
