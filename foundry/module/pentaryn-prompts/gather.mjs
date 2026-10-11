/**
 * pentaryn-prompts — the one-call context export (plan §5), the manifest ring, list and show.
 */

import { MODULE, VERSION, GATHER_CHARS, buildView, renderGather, codedError, idCompare, sceneRefs, CURRENT_SCENE } from "./geometry-core.mjs";
import { sceneModel, promptTokens, resolveItemEmbeds } from "./model.mjs";
import { promptText } from "./markers.mjs";
import { renderCrops } from "./crops.mjs";
import { cropsDecision } from "./build-core.mjs";
import { setting, manifests, manifestFor, storeManifest } from "./settings.mjs";
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

function pickScenes(scenes, from) {
  let list;
  const refs = sceneRefs(scenes);
  if (refs === "all") {
    list = scenesInNavOrder().filter(s => promptTokens(s).length > 0);
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
 * `gather({scenes, crops, chars, unseenWithinFt, builtWithoutProvenance, maxPrompts, from})`
 * → `{call, text, counts, manifest, crops, next}` (plan §5.2). Stores the manifest.
 */
export async function gather(opts = {}) {
  const {
    scenes = "all", crops = setting("cropsDefault", "auto"), chars = setting("gatherChars", GATHER_CHARS),
    unseenWithinFt = setting("unseenWithinFt", 60), builtWithoutProvenance = true, maxPrompts = 60, from = null,
    party: partyArg = null, cropsAs = "files"
  } = opts ?? {};
  const worldParty = setting("party", "") || null;
  const party = partyArg ?? worldParty;
  const partySource = partyArg ? "call" : worldParty ? "setting" : null;
  const t0 = performance.now();
  const list = pickScenes(scenes, from);

  // Page by prompt count: always at least one scene, never past maxPrompts after the first.
  const models = [];
  let total = 0, next = null;
  for (let i = 0; i < list.length; i++) {
    const n = promptTokens(list[i]).length;
    if (models.length && total + n > maxPrompts) { next = list[i].id; break; }
    models.push(sceneModel(list[i], { builtWithoutProvenance }));
    total += n;
  }
  // a compendium monster's biography is often only `@Embed[<page>]`: print the page's words instead
  await Promise.all(models.map(m => resolveItemEmbeds(m.items)));

  // crops only where there is a picture: a scene with no background image or tiles crops to grey
  const cropPlan = cropsDecision(crops, models.map(m => ({ hasArt: sceneHasArt(game.scenes.get(m.key)) })));
  const { view, manifest } = buildView(models, { unseenWithinFt, next, party, partySource, cropsNote: cropPlan.note });
  const text = renderGather(view, { chars });
  manifest.at = Date.now();
  // ids only: an API caller may pass Scene documents, and this lands in a world setting
  manifest.opts = { scenes: Array.isArray(scenes) ? list.map(s => s.id) : scenes, unseenWithinFt, chars, party: view.party };
  await storeManifest(manifest);

  const wantCrops = cropPlan.want;
  let images = [];
  if (wantCrops && Object.keys(manifest.encounters).length) {
    const max = setting("cropMaxPerCall", 6);
    const ids = Object.keys(manifest.encounters).sort(idCompare).slice(0, max);
    images = await renderCrops(manifest, ids, { longSide: setting("cropLongSidePx", 768) });
    if (cropsAs === "files") images = await cropsToFiles(manifest.call, images);
  }
  const ms = Math.round(performance.now() - t0);
  console.log(`${MODULE} | gather ${manifest.call}: ${view.counts.prompts} prompts on ${view.counts.scenes} scene(s), ${images.length} crop(s), ${ms} ms`);
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

/** Where crop files go under the Foundry Data directory (see the playbook for the absolute path). */
export const CROP_DIR = "pentaryn-prompts-crops";

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
  const max = setting("cropMaxPerCall", 6);
  const images = await renderCrops(manifest, ids.slice(0, max), { longSide: setting("cropLongSidePx", 768) });
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
