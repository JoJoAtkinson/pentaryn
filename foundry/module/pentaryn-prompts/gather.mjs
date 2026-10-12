/**
 * pentaryn-prompts — the one-call context export (plan §5), the manifest ring, list and show.
 */

import { MODULE, VERSION, buildView, renderGather, codedError, idCompare, sceneRefs, CURRENT_SCENE, parseParty } from "./geometry-core.mjs";
import { sceneModel, promptTokens, resolveItemEmbeds } from "./scene-adapter.mjs";
import { promptText } from "./markers-adapter.mjs";
import { renderCrops } from "./crops-adapter.mjs";
import { cropsDecision } from "./core/text.mjs";
import { DEFAULTS } from "./core/defaults.mjs";
import { pageScenes } from "./core/paging.mjs";
import { setting, manifests, manifestFor, storeManifest } from "./settings.mjs";
import { CROP_DIR } from "./prompts-core.mjs";
import { gatherLogLine, gatherPhaseLine } from "./core/log-lines.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);


/** Scenes in navigation order, then name — the order s# follows. */
export function scenesInNavOrder() {
  return [...game.scenes].sort((a, b) =>
    ((a.navigation ? 0 : 1) - (b.navigation ? 0 : 1)) || ((a.navOrder ?? a.sort ?? 0) - (b.navOrder ?? b.sort ?? 0))
    || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Resolve a scene by id, uuid or name (exact, then case-insensitive). */
export function resolveScene(ref) {
  if (!ref) return null;
  if (typeof ref === "object" && ref.documentName === "Scene") return ref;
  const s = String(ref);
  return game.scenes.get(s) ?? game.scenes.get(s.replace(/^Scene\./, ""))
    ?? game.scenes.find(x => x.name === s) ?? game.scenes.find(x => x.name.toLowerCase() === s.toLowerCase())
    ?? game.scenes.find(x => (x.navName ?? "").toLowerCase() === s.toLowerCase()) ?? null;
}

function pickScenes(scenes, from, countOf) {
  let list;
  const refs = sceneRefs(scenes);
  if (refs === "all") {
    list = scenesInNavOrder().filter(s => countOf(s) > 0);
  } else {
    const seen = new Set();
    list = [];
    for (const r of refs) {
      let s;
      if (r === CURRENT_SCENE) {
        s = canvas?.scene ?? game.scenes.viewed ?? game.scenes.active;
        if (!s) throw codedError("SCENE_UNKNOWN", "no scene is being viewed");
      } else {
        s = resolveScene(r);
        if (!s) throw codedError("SCENE_UNKNOWN", String(r));
      }
      if (!seen.has(s.id)) { seen.add(s.id); list.push(s); }
    }
  }
  if (from) {
    const start = list.findIndex(s => s.id === from);
    if (start < 0) throw codedError("SCENE_UNKNOWN", `next scene ${from} is not in this gather`);
    list = list.slice(start);
  }
  return list;
}

/* ── The manifest ring lives in settings.mjs (hidden world setting `lastCalls`) ── */

export { manifests, manifestFor };

/* ── gather ─────────────────────────────────────────────────────────────── */

/**
 * `gather({scenes, crops, chars, unseenWithinFt, builtWithoutProvenance, maxPrompts, from, party, cropsAs})`
 * → `{call, text, counts, manifest, crops, next, ms, version, party, partySource, cropsNote}` (plan §5.2).
 * Stores the manifest.
 */
export async function gather(opts = {}) {
  const {
    scenes = "all", crops = setting("cropsDefault", DEFAULTS.cropsDefault), chars = setting("gatherChars", DEFAULTS.gatherChars),
    unseenWithinFt = setting("unseenWithinFt", DEFAULTS.unseenWithinFt), builtWithoutProvenance = true, maxPrompts = 60, from = null,
    party: partyArg = null, cropsAs = "files"
  } = opts ?? {};
  // a call party that cannot be read (or "") is not given: the world party stands (prompts-core-EC-3)
  const callParty = parseParty(partyArg) ? partyArg : null;
  const worldSetting = setting("party", "");
  const worldParty = parseParty(worldSetting) ? worldSetting : null;
  const party = callParty ?? worldParty;
  const partySource = callParty ? "call" : worldParty ? "setting" : null;
  const partyUnreadable = partyArg != null && partyArg !== "" && !callParty;
  const t0 = performance.now();
  // each scene's prompt count once (prompts-lookup-23): the "all" filter and the paging share it
  const counted = new Map();
  const countOf = s => {
    if (!counted.has(s.id)) counted.set(s.id, promptTokens(s).length);
    return counted.get(s.id);
  };
  const list = pickScenes(scenes, from, countOf);

  // Page by prompt count: always at least one scene, never past maxPrompts after the first.
  const page = pageScenes(list.map(countOf), maxPrompts);
  const models = list.slice(0, page.take).map(s => sceneModel(s, { builtWithoutProvenance }));
  const tModel = performance.now();
  const next = page.next === null ? null : list[page.next].id;
  // a compendium monster's biography is often only `@Embed[<page>]`: print the page's words instead
  await Promise.all(models.map(m => resolveItemEmbeds(m.items)));
  const tEmbeds = performance.now();

  // crops only where there is a picture: a scene with no background image or tiles crops to grey
  const cropPlan = cropsDecision(crops, models.map(m => ({ hasArt: sceneHasArt(game.scenes.get(m.key)) })));
  const { view, manifest } = buildView(models, { unseenWithinFt, next, party, partySource, partyUnreadable, cropsNote: cropPlan.note });
  const text = renderGather(view, { chars });
  const tRender = performance.now();
  manifest.at = Date.now();
  // ids only: an API caller may pass Scene documents (one, or a list), and this lands in a world setting
  const storedScenes = scenes?.documentName === "Scene" ? [scenes.id] : Array.isArray(scenes) ? list.map(s => s.id) : scenes;
  manifest.opts = { scenes: storedScenes, unseenWithinFt, chars, party: view.party };
  await storeManifest(manifest);
  const tStore = performance.now();

  const wantCrops = cropPlan.want;
  let images = [];
  if (wantCrops && Object.keys(manifest.encounters).length) {
    const max = setting("cropMaxPerCall", DEFAULTS.cropMaxPerCall);
    const ids = Object.keys(manifest.encounters).sort(idCompare).slice(0, max);
    images = await renderCrops(manifest, ids, { longSide: setting("cropLongSidePx", DEFAULTS.cropLongSidePx) });
    if (cropsAs === "files") images = await cropsToFiles(manifest.call, images);
  }
  const tEnd = performance.now();
  const ms = Math.round(tEnd - t0);
  console.log(`${MODULE} | ${gatherLogLine({ call: manifest.call, prompts: view.counts.prompts, scenes: view.counts.scenes, crops: images.length, ms })}`);
  // where the time went and the manifest's stored size: built only with CONFIG.debug on
  log.debug$?.(gatherPhaseLine({ call: manifest.call, bytes: new TextEncoder().encode(JSON.stringify(manifest)).length,
    phases: { model: tModel - t0, embeds: tEmbeds - tModel, render: tRender - tEmbeds, store: tStore - tRender, crops: tEnd - tStore } }));
  return { call: manifest.call, text, counts: view.counts, manifest, crops: images, next, ms, version: VERSION,
    party: view.party ?? null, partySource: view.partySource ?? null, cropsNote: cropPlan.note };
}

/** Is there anything to see on a scene's crop: a background image, or tiles? */
function sceneHasArt(scene) {
  if (!scene) return true;
  try {
    if (scene.background?.src || (scene.tiles?.size ?? 0) > 0) return true;
    // v14 levels carry their own background/foreground images
    for (const l of scene.levels ?? []) if (l.background?.src || l.foreground?.src) return true;
    return false;
  } catch { return true; }
}

export { CROP_DIR };

/**
 * Upload crops to `Data/pentaryn-prompts-crops/<call>/E1.webp` and return paths instead of base64.
 * The eval-js path (game.pentaryn.prompts called directly) cannot show images and must never carry
 * ~100 kB of base64 in its JSON; the bridge's query asks for `cropsAs: "base64"` and gets images.
 */
async function cropsToFiles(call, images) {
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  const dir = `${CROP_DIR}/${call}`;
  try { await FP.createDirectory("data", CROP_DIR); } catch (err) { log.debug(`crop dir ${CROP_DIR} (exists)`, err); }
  try { await FP.createDirectory("data", dir); } catch (err) { log.debug(`crop dir ${dir} (exists)`, err); }
  const out = [];
  for (const c of images) {
    if (!c?.png) { out.push(c); continue; }
    try {
      const bytes = Uint8Array.from(atob(c.png), ch => ch.charCodeAt(0));
      const ext = (c.mimeType ?? c.mime ?? "image/webp").split("/")[1] ?? "webp";
      const file = new File([bytes], `${c.encounter}.${ext}`, { type: c.mimeType ?? c.mime ?? "image/webp" });
      const res = await FP.upload("data", dir, file, {}, { notify: false });
      const { png, ...rest } = c;
      out.push({ ...rest, path: res?.path ?? `${dir}/${file.name}`, dataPath: `${dir}/${file.name}` });
    } catch (err) {
      const { png, ...rest } = c;
      out.push({ ...rest, error: `crop upload failed: ${err?.message ?? err}` });
    }
  }
  return out;
}

/** Crops for a stored call: `{call, encounters: ["E1", …], cropsAs}` → `{crops}`. */
export async function crops({ call, encounters, cropsAs = "files" } = {}) {
  const manifest = manifestFor(call);
  if (!manifest) throw codedError("CALL_UNKNOWN", String(call));
  const ids = (encounters?.length ? encounters : Object.keys(manifest.encounters)).filter(e => manifest.encounters[e]);
  if (!ids.length) throw codedError("BAD_SPEC", "no such encounter in this call");
  const max = setting("cropMaxPerCall", DEFAULTS.cropMaxPerCall);
  const images = await renderCrops(manifest, ids.slice(0, max), { longSide: setting("cropLongSidePx", DEFAULTS.cropLongSidePx) });
  return { crops: cropsAs === "files" ? await cropsToFiles(call, images) : images };
}

/** `list()` → `{scenes: [{id, name, nav, prompts, empty}]}` for scenes holding prompt markers. */
export function list() {
  const out = [];
  for (const s of scenesInNavOrder()) {
    const toks = promptTokens(s);
    if (!toks.length) continue;
    out.push({ id: s.id, name: s.name, nav: s.navName || "", prompts: toks.length,
      empty: toks.filter(t => !promptText(t)).length });
  }
  return { scenes: out };
}

/** Find a marker by `{call, id}` or `{sceneId, markerId}`. */
export function locate({ call, id, sceneId, markerId } = {}) {
  if (call && id) {
    const m = manifestFor(call);
    if (!m) {
      if (!(sceneId && markerId)) throw codedError("CALL_UNKNOWN", String(call));
    } else {
      const e = m.prompts?.[id] ?? null;
      const b = m.built?.[id] ?? null;
      if (!e && !b) throw codedError("BAD_SPEC", `${id} is not in ${call}`);
      sceneId = (e ?? b).sceneId;
      markerId = e?.markerId ?? b?.id;
      const scene = game.scenes.get(sceneId);
      if (!scene) throw codedError("SCENE_UNKNOWN", sceneId);
      const doc = e ? scene.tokens.get(markerId) : scene.getEmbeddedDocument(b.docName, b.id);
      if (!doc) throw codedError("MARKER_GONE", `${id} (${markerId})`);
      return { scene, doc, entry: e, manifest: m };
    }
  }
  const scene = game.scenes.get(sceneId);
  if (!scene) throw codedError("SCENE_UNKNOWN", String(sceneId));
  const doc = scene.tokens.get(markerId);
  if (!doc) throw codedError("MARKER_GONE", String(markerId));
  return { scene, doc, entry: null, manifest: null };
}

/** Pan the GM canvas to a marker (viewing its scene first) so Joe can see what is being asked about. */
export async function show(args = {}) {
  const { scene, doc } = locate(args);
  if (canvas?.scene?.id !== scene.id) await scene.view();
  const { x, y } = docCentre(doc, scene.dimensions.size);
  await canvas.animatePan({ x, y, scale: Math.max(canvas.stage?.scale?.x ?? 1, 0.8), duration: 400 });
  try { canvas.ping({ x, y }); } catch (err) { log.debug("show: ping (a nicety)", err); }
  return { ok: true, sceneId: scene.id, x: Math.round(x), y: Math.round(y) };
}

/** Centre of a placed document in canvas px (tokens/tiles are top-left anchored, notes/lights centred). */
export function docCentre(doc, g) {
  switch (doc.documentName) {
    case "Token": return { x: doc.x + doc.width * g / 2, y: doc.y + doc.height * g / 2 };
    case "Tile": return { x: doc.x + doc.width / 2, y: doc.y + doc.height / 2 };
    default: return { x: doc.x, y: doc.y };
  }
}
