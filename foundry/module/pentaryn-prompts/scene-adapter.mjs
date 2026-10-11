/**
 * pentaryn-prompts — the scene model: scene documents → items → relations.
 *
 * One builder for both consumers: the dialog's side panel and the gather. Works on any scene, not
 * only the viewed one (v14 keeps edges on the Level document).
 */

import {
  MODULE, SIZE_BY_KEY, DND_SIZE_WIDTH, HEX_RULE, makeRel, testPoints, dedupeSquares, occupiedSquares, atFeet, stripHtml,
  panelSplit, crXp, lightText, ownTextUuid
} from "./geometry-core.mjs";
import { FOLDER_NAME, markerSizeOf, promptText } from "./core/markers.mjs";
import { panelRels, seenCount } from "./core/placement.mjs";
import { wallSegmentsOf } from "./core/walls.mjs";
import { makeSight, heightWarning } from "./sight-adapter.mjs";
import { isStockLore } from "./build-core.mjs";
import { settingReader } from "./lib/settings.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

/** core's own setting (C23 allows core's); 0 (equidistant) when unreadable, as before. */
const coreSetting = settingReader("core", [{ key: "gridDiagonals", default: 0 }]);

/** dnd5e size → the marker size rank used for ordering (tiny 0 … grg 5). */
const DND_RANK = { tiny: 0, sm: 1, med: 2, lg: 3, huge: 4, grg: 5 };

const EYE = "assets/tokens/custom/props/icon-eye.webp";

/** Colour/number markers and anything in a markers folder are scaffolding, not context. */
function isScaffold(tok) {
  const actor = tok.actorId ? game.actors.get(tok.actorId) : null;
  if (!actor) return false;
  if (/^Marker · /.test(actor.name ?? "")) return true;
  for (let f = actor.folder; f; f = f.folder) {
    if (f.name === FOLDER_NAME) return false;
    if (/^(Temp Markers|Markers\b)/i.test(f.name ?? "")) return true;
  }
  return false;
}

/** Provenance from the placed document first, then its actor / journal entry. */
export function provenanceOf(doc) {
  const own = doc?.flags?.[MODULE]?.provenance;
  if (own) return own;
  if (doc?.documentName === "Token") {
    const a = doc.actorId ? game.actors.get(doc.actorId) : null;
    return a?.flags?.[MODULE]?.provenance ?? null;
  }
  if (doc?.documentName === "Note") return doc.entry?.flags?.[MODULE]?.provenance ?? null;
  return null;
}

function regionNames(scene, point) {
  const out = [];
  for (const r of scene.regions ?? []) {
    try {
      if (r.testPoint({ x: point.x, y: point.y, elevation: point.elevation ?? 0 })) out.push(r.name);
    } catch (err) { log.debug(`region ${r.name}: testPoint failed, left out`, err); }
  }
  return out;
}

/** `humanoid (goblinoid)` — the creature type; CR, AC and HP are `stats` (built facts, §13). */
function creatureType(actor) {
  const d = actor?.system?.details;
  if (!d) return "";
  const t = d.type ?? {};
  let label = t.value === "custom" ? t.custom : (CONFIG.DND5E?.creatureTypes?.[t.value]?.label ?? t.value ?? "");
  if (label) label = game.i18n.localize(label).toLowerCase();
  if (label && t.subtype) label += ` (${t.subtype})`;
  return label;
}

/** CR (npcs), AC and HP of the token's own actor (an unlinked token's synthetic actor). */
function statsOf(actor) {
  const s = actor?.system;
  if (!s?.attributes) return null;
  const cr = actor.type === "npc" && s.details?.cr !== undefined && s.details.cr !== null && s.details.cr !== "" ? s.details.cr : undefined;
  return { cr, ac: s.attributes.ac?.value ?? null, hp: s.attributes.hp?.value ?? null, hpMax: s.attributes.hp?.max ?? null };
}

/** A character's classes with levels and subclasses, and its species. */
function classesOf(actor) {
  if (actor?.type !== "character") return { classes: null, species: null };
  const subs = actor.items.filter(i => i.type === "subclass");
  const classes = actor.items.filter(i => i.type === "class").map(c => ({
    name: c.name, levels: c.system?.levels ?? null,
    subclass: subs.find(sc => sc.system?.classIdentifier === c.system?.identifier)?.name ?? null
  }));
  const species = actor.system?.details?.race?.name ?? actor.items.find(i => i.type === "race")?.name ?? null;
  return { classes, species };
}

const NOTABLE = ["loot", "container", "consumable", "tool"];

/**
 * One item's facts for the gather (name, rarity, identified state, attunement, price). Read from the
 * item's SOURCE: dnd5e's derived data of an unidentified item shows its unidentified name and blanks
 * its attunement, and the builder of a neighbour needs the real ones.
 */
export function itemFacts(i) {
  const s = i.system ?? {};
  const src = i._source?.system ?? s;
  const name = i._source?.name ?? i.name;
  const identified = (src.identified ?? s.identified) !== false;
  const p = src.price ?? s.price;
  const price = Number(p?.value) > 0 ? `${p.value} ${p.denomination ?? "gp"}` : "";
  return { name, type: i.type, rarity: src.rarity ?? s.rarity ?? "", identified,
    unidentifiedName: identified ? "" : (src.unidentified?.name || (i.name !== name ? i.name : "")),
    attunement: src.attunement ?? s.attunement ?? "", attuned: !!(src.attuned ?? s.attuned), quantity: src.quantity ?? s.quantity ?? 1, price };
}

/**
 * What a built token holds that a neighbour's builder might need: a hotspot's every item; a
 * creature's loot, consumables, containers, tools and anything magic (not its weapons and features).
 */
function itemsOf(actor, pile) {
  if (!actor?.items) return null;
  const magic = i => {
    const r = i._source?.system?.rarity ?? i.system?.rarity;
    return !!r && !["", "mundane", "none"].includes(String(r).toLowerCase());
  };
  const list = pile ? actor.items.contents : actor.items.filter(i => NOTABLE.includes(i.type) || (["weapon", "equipment"].includes(i.type) && magic(i)));
  return list.length ? list.map(itemFacts) : null;
}

const DISPOSITION_WORD = { "-2": "secret", "-1": "hostile", 0: "neutral", 1: "friendly" };

/**
 * What a built creature adds to an encounter's XP: a hostile npc's CR XP; 0 for characters, piles,
 * neutral/friendly/secret tokens and anything without a CR.
 */
export function actorXp(actor, tok = null) {
  if (!actor || actor.type !== "npc") return 0;
  if (actor.flags?.["item-piles"]?.data?.enabled) return 0;
  // the opposition only: a neutral innkeeper or a friendly guide is not part of the fight's budget
  const D = CONST.TOKEN_DISPOSITIONS ?? {};
  const disp = tok ? tok.disposition : actor.prototypeToken?.disposition;
  if (disp !== undefined && disp !== D.HOSTILE) return 0;
  const v = Number(actor.system?.details?.xp?.value);
  return Number.isFinite(v) && v > 0 ? v : crXp(actor.system?.details?.cr);
}

function tokenImg(tok) {
  const ring = tok.ring;
  if (ring?.enabled && ring.subject?.texture) return ring.subject.texture;
  return tok.texture?.src ?? "";
}

/**
 * One core token call. An absent method (an older core, a plain object) leaves the fallback in
 * place silently, as before; one that throws (API drift after an update) warns once per page.
 */
function tryCore(tok, method, use) {
  if (typeof tok?.[method] !== "function") return;
  try {
    use(tok[method]());
  } catch (err) {
    log.warnOnce(`Token#${method}`, `Token#${method}: core API failed, using the fallback`, err);
  }
}

function tokenGeometry(tok, g) {
  // getSize: the real pixel footprint (hex rows/columns are not width × size)
  let size = null;
  tryCore(tok, "getSize", v => { size = v; });
  const rect = { x: tok.x, y: tok.y, w: size?.width ?? tok.width * g, h: size?.height ?? tok.height * g };
  const centre = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, elevation: tok.elevation ?? 0 };
  let origin = centre, points = null, squares = null;
  tryCore(tok, "getMovementOrigin", v => { origin = v; });
  tryCore(tok, "getVisibilityTestPoints", v => { points = v; });
  tryCore(tok, "getOccupiedGridSpaceOffsets", v => { squares = dedupeSquares(v); });
  const coreSquares = !!squares?.length;
  if (!points?.length) points = testPoints(rect, g).map(p => ({ ...p, elevation: centre.elevation }));
  if (!squares?.length) squares = occupiedSquares(rect, g);
  return { rect, centre, origin, points, squares, coreSquares };
}

function pointGeometry(x, y, elevation, g, half = 0.25) {
  const rect = { x: x - g * half, y: y - g * half, w: g * half * 2, h: g * half * 2 };
  const centre = { x, y, elevation: elevation ?? 0 };
  return { rect, centre, origin: centre, points: [centre], squares: occupiedSquares({ x: x - 1, y: y - 1, w: 2, h: 2 }, g) };
}

/**
 * Every item on a scene that the panel or the gather talks about.
 * Prompts: tokens with the marker flag. Built: other tokens (not scaffolding), notes; lights and
 * tiles only when they carry provenance. `builtWithoutProvenance: false` keeps only the built
 * things this system made.
 */
export function sceneItems(scene, { builtWithoutProvenance = true } = {}) {
  const dims = scene.dimensions;
  const g = dims.size;
  const items = [];
  const base = (doc, geo) => ({
    ...geo, doc, id: doc.id, key: `${doc.documentName}.${doc.id}`, docName: doc.documentName,
    level: doc.level ?? null, atFt: atFeet(geo.centre, dims), regions: regionNames(scene, geo.centre),
    elevation: Number(doc.elevation) || 0
  });

  // one folder-chain walk per actor, not per token (a camp of twenty goblins shares one actor)
  const scaffold = new Map();
  const scaffoldOf = tok => {
    if (!scaffold.has(tok.actorId)) scaffold.set(tok.actorId, isScaffold(tok));
    return scaffold.get(tok.actorId);
  };
  for (const tok of scene.tokens) {
    const size = markerSizeOf(tok, game.actors);
    if (size) {
      items.push({ ...base(tok, tokenGeometry(tok, g)), isPrompt: true, size, rank: SIZE_BY_KEY[size].rank,
        text: promptText(tok), updatedAt: tok.flags?.[MODULE]?.updatedAt ?? null, name: tok.name,
        img: tok.texture?.src ?? "", hidden: tok.hidden });
      continue;
    }
    if (scaffoldOf(tok)) continue;
    const prov = provenanceOf(tok);
    if (!prov && !builtWithoutProvenance) continue;
    const actor = tok.actor ?? (tok.actorId ? game.actors.get(tok.actorId) : null);
    const pile = tok.flags?.["item-piles"]?.data?.enabled ?? actor?.flags?.["item-piles"]?.data?.enabled;
    const kind = pile ? "hotspot" : actor?.type === "character" ? "character" : actor?.type === "npc" ? "npc" : "creature";
    let description = pile
      ? (tok.flags?.["item-piles"]?.data?.description ?? actor?.flags?.["item-piles"]?.data?.description ?? "")
      : (actor?.system?.details?.biography?.value ?? "");
    // a stock monster this system built and patched without a biography still carries the book's
    // lore (an @Embed of its Monster Manual page): the prompt and the Why line say what it is (§14)
    if (prov && !pile && isStockLore(description)) description = "";
    // an unlinked token's own (delta) biography: get-character <base id> would print the base's text
    const ownText = pile ? null : ownTextUuid({ actorLink: tok.actorLink, description, uuid: tok.uuid,
      baseDescription: (tok.actorId ? game.actors.get(tok.actorId) : null)?.system?.details?.biography?.value ?? "" });
    const dsize = actor?.system?.traits?.size;
    const { classes, species } = classesOf(actor);
    items.push({ ...base(tok, tokenGeometry(tok, g)), isPrompt: false, kind, actorId: actor?.id ?? tok.actorId ?? null, name: tok.name || actor?.name || "?",
      type: pile ? "" : creatureType(actor), img: tokenImg(tok), hidden: tok.hidden, prov,
      description, rank: DND_RANK[dsize] ?? 2, sizeW: DND_SIZE_WIDTH[dsize] ?? null, xp: actorXp(actor, tok),
      disposition: pile ? null : (DISPOSITION_WORD[tok.disposition] ?? null), stats: pile ? null : statsOf(actor),
      classes, species, items: itemsOf(actor, !!pile), ...(ownText ? { ownTextUuid: ownText } : {}) });
  }

  for (const note of scene.notes ?? []) {
    const prov = provenanceOf(note);
    if (!prov && !builtWithoutProvenance) continue;
    const entry = note.entry ?? (note.entryId ? game.journal.get(note.entryId) : null);
    const page = note.page ?? (note.pageId ? entry?.pages?.get(note.pageId) : null);
    const name = note.text || page?.name || entry?.name || "Note";
    const description = page?.text?.content ?? entry?.pages?.contents?.[0]?.text?.content ?? "";
    items.push({ ...base(note, pointGeometry(note.x, note.y, note.elevation, g)), isPrompt: false, kind: "note",
      name, type: "", img: note.texture?.src || EYE, hidden: false, prov, description, rank: 0 });
  }

  // a light's host: the first built item (token, hotspot, note) of the same replacement — marker id
  // and call (null and "" differ), first wins, as items.find did; lights are never hosts
  const hostKey = (markerId, call) => `${markerId}\u0000${call === undefined || call === null ? "\u0001" : call}`;
  const hostByMarker = new Map();
  for (const it of items) {
    if (it.isPrompt || it.prov?.markerId === undefined) continue;
    const k = hostKey(it.prov.markerId, it.prov.call);
    if (!hostByMarker.has(k)) hostByMarker.set(k, it);
  }
  for (const light of scene.lights ?? []) {
    const prov = provenanceOf(light);
    if (!prov) continue;
    const text = lightText(light.config?.toObject?.() ?? light.config) || "default";
    // a hotspot's or note's own light (same replacement): a line on it, not a t# of its own
    const host = prov.markerId ? hostByMarker.get(hostKey(prov.markerId, prov.call)) ?? null : null;
    if (host) { host.light = text; continue; }
    items.push({ ...base(light, pointGeometry(light.x, light.y, light.elevation, g)), isPrompt: false, kind: "light",
      name: "Light", type: "", img: "", hidden: light.hidden, prov, description: "", rank: 0, light: text });
  }

  for (const tile of scene.tiles ?? []) {
    const prov = provenanceOf(tile);
    if (!prov) continue;
    const rect = { x: tile.x, y: tile.y, w: tile.width, h: tile.height };
    const centre = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, elevation: tile.elevation ?? 0 };
    items.push({ ...base(tile, { rect, centre, origin: centre, points: testPoints(rect, g), squares: occupiedSquares(rect, g) }),
      isPrompt: false, kind: "tile", name: (tile.texture?.src ?? "Tile").split("/").pop(), type: "",
      img: tile.texture?.src ?? "", hidden: tile.hidden, prov, description: "", rank: 0 });
  }
  if (scene.grid?.isHexagonal) toHexCubes(scene.grid, items);
  return items;
}

/**
 * Hex grids: distance is counted in hexes, so every item's squares become cube coordinates
 * `{i: q, j: r}` (geometry-core's HEX_RULE). Tokens keep core's occupied offsets; notes, lights,
 * tiles and any fallback use the hex under their centre.
 */
function toHexCubes(grid, items) {
  const cube = o => { const c = grid.offsetToCube({ i: o.i, j: o.j }); return { i: c.q, j: c.r }; };
  for (const it of items) {
    let offsets = it.docName === "Token" && it.coreSquares ? it.squares : null;
    if (!offsets?.length) {
      try { offsets = [grid.getOffset({ x: it.centre.x, y: it.centre.y })]; } catch { offsets = it.squares; }
    }
    it.squares = dedupeSquares(offsets.map(cube));
  }
}

/** Scene facts the gather header needs. */
export function sceneMeta(scene) {
  const d = scene.dimensions;
  const gridFt = scene.grid?.distance ?? d.distance ?? 5;
  const squares = [Math.round(d.sceneWidth / d.size), Math.round(d.sceneHeight / d.size)];
  const warn = heightWarning(scene);
  // doors for the door lines in the overview, and every sight-blocking wall so a door line only puts
  // on a side what can see the doorway (the pure wall test; Levels/heights not modelled, as los.mjs)
  const doors = [];
  for (const w of scene.walls ?? []) {
    if (w.door) doors.push({ id: w.id, c: [...w.c], door: w.door, ds: w.ds, sight: w.sight ?? 20 });
  }
  const walls = wallSegmentsOf(scene, { sightOnly: true });
  return {
    key: scene.id, name: scene.name, nav: scene.navName || "", gridFt, doors, walls,
    squares, mapFt: [Math.round(d.sceneWidth / d.size * gridFt), Math.round(d.sceneHeight / d.size * gridFt)],
    regions: (scene.regions?.contents ?? []).map(r => r.name).filter(Boolean),
    levels: scene.levels?.size ?? 1,
    warn: warn ? [warn] : [],
    notes: stripHtml(scene.description ?? ""),
    dims: { sceneX: d.sceneX, sceneY: d.sceneY, size: d.size, distance: gridFt }
  };
}

/** The full model of one scene: meta, items and the cached `rel(aKey, bKey)`. */
export function sceneModel(scene, opts = {}) {
  const items = sceneItems(scene, opts);
  const meta = sceneMeta(scene);
  const rule = coreSetting("gridDiagonals");
  const rel = makeRel(items, {
    gridSize: scene.dimensions.size, gridFt: meta.gridFt, rule: scene.grid?.isHexagonal ? HEX_RULE : rule,
    gridless: !!scene.grid?.isGridless, sight: makeSight(scene)
  });
  return { ...meta, items, rel };
}

/** Prompt markers on a scene (token documents). */
export function promptTokens(scene) {
  return scene.tokens.filter(t => !!markerSizeOf(t, game.actors));
}

/**
 * The side panel for one marker: what it can see, nearest first, and what is just out of sight.
 * Rows carry what the dialog draws; geometry comes from the same `rel` the gather uses.
 */
export function panelFor(tokenDoc, { rows = 12, unseenWithinFt = 60 } = {}) {
  const scene = tokenDoc.parent;
  const model = sceneModel(scene, { builtWithoutProvenance: true });
  const rels = panelRels(model.items, model.rel, `Token.${tokenDoc.id}`, unseenWithinFt);
  const split = panelSplit(rels, { rows, unseenWithinFt });
  const d = scene.dimensions;
  return {
    ...split,
    mapFt: [Math.round(d.sceneWidth / d.size * model.gridFt), Math.round(d.sceneHeight / d.size * model.gridFt)],
    warn: model.warn
  };
}

/** For the hover tooltip: how many things the marker sees (no door/wall pass: prompts-lookup-7). */
export function seesCount(tokenDoc) {
  try {
    const model = sceneModel(tokenDoc.parent, { builtWithoutProvenance: true });
    return seenCount(model.items, model.rel, `Token.${tokenDoc.id}`);
  } catch (err) {
    log.debug("seesCount", err);
    return null;
  }
}

/* ── @Embed resolution (descriptions that are only an embed of a compendium page) ── */

const EMBED_RE = /@Embed\[([^\]\s]+)[^\]]*\](\{[^}]*\})?/g;
const embedCache = new Map();

/** The HTML an `@Embed[uuid …]` stands for: a journal page's text, an item's or actor's description. */
async function embedHtml(uuid) {
  if (embedCache.has(uuid)) return embedCache.get(uuid);
  let html = "";
  try {
    const doc = await fromUuid(uuid);
    html = doc?.text?.content ?? doc?.system?.description?.value ?? doc?.system?.details?.biography?.value
      ?? doc?.pages?.contents?.[0]?.text?.content ?? "";
    if (/@Embed\[/.test(html)) html = html.replace(EMBED_RE, "");   // one level only: no recursion loops
  } catch { html = ""; }
  embedCache.set(uuid, html);
  return html;
}

/** Replace each `@Embed[…]` in an HTML string with the embedded document's own text. */
export async function resolveEmbeds(html) {
  const s = String(html ?? "");
  if (!s.includes("@Embed[")) return s;
  const uuids = [...new Set([...s.matchAll(EMBED_RE)].map(m => m[1]))];
  const map = new Map(await Promise.all(uuids.map(async u => [u, await embedHtml(u)])));
  return s.replace(EMBED_RE, (m, u) => map.get(u) ?? "");
}

/** Resolve embeds in place on model items (built things' descriptions). */
export async function resolveItemEmbeds(items) {
  await Promise.all(items.filter(it => typeof it.description === "string" && it.description.includes("@Embed["))
    .map(async it => { it.description = await resolveEmbeds(it.description); }));
  return items;
}
