// Live golden — pentaryn-prompts. Body of an async function for the foundry `eval-js` MCP tool
// (paste the file as `script`, timeoutMs 60000). GM client only. Returns a JSON string of
// { module, golden, timings, cleanup } (or { module, skipped } when game.pentaryn.prompts or its
// settings are missing, or the world has no `mid` prompt marker): `golden` is deterministic (ids
// normalised, timestamps and dates dropped), `timings` are medians of N runs (performance.now) — the performance baseline.
//
// What it exercises (the real glue, no stubs): prompts.status(); then a ZZ scratch scene (Foundry's
// default padding, grid 100) holding one `mid` prompt marker (a token of the world's marker actor,
// created with prompt text so preCreateToken names and tints it) and one built neighbour two
// squares east (a token of a ZZ npc whose biography is ~1 000 characters of HTML). gather() runs on
// that scene with crops off, at the world's gatherChars and again at chars 160; list() and model()
// are read for the same scene.
// gather() stores its manifest in the hidden world setting pentaryn-prompts.lastCalls (a ring of
// 5): the ring is saved first and written back in `finally`. The scene and actor are deleted.

const N = 5;
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Median per-call ms over n samples; each sample times `reps` back-to-back calls (performance.now is ~0.1 ms coarse). */
async function timeIt(fn, n = N, reps = 1) {
  const xs = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    for (let k = 0; k < reps; k++) { const v = fn(i, k); if (v?.then) await v; }
    xs.push((performance.now() - t0) / reps);
  }
  const r = x => Math.round(x * 1e4) / 1e4;
  return { n, reps, medianMs: r(median(xs)), minMs: r(Math.min(...xs)), maxMs: r(Math.max(...xs)) };
}
const ids = new Map();
const tag = (id, label) => { if (id) ids.set(id, label); };
const DROP = new Set(["t", "at", "age", "ms", "_stats"]);
const strip = v => Array.isArray(v) ? v.map(strip)
  : (v && typeof v === "object") ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, strip(x)]))
  : v;
const norm = v => { let s = JSON.stringify(strip(v) ?? null); for (const [id, l] of ids) s = s.split(id).join(`<${l}>`); return JSON.parse(s); };
const caught = e => ({ threw: true, name: e?.name ?? null, ctor: e?.constructor?.name ?? null, message: String(e?.message ?? e) });
/** Cleanup: run one step; a failure becomes a `NOT ` string diff.mjs fails on, and the next step still runs (LG-R8). */
const safely = async (name, fn) => { try { await fn(); } catch (e) { out.cleanup[`${name}CleanupError`] = `NOT done: ${e?.message ?? e}`; } };
/** One macrotask through a MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). */
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
/** Live only: poll until pred() holds or ms passes. */
const settle = async (pred, ms = 3000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) return true; await tick(); }
  return !!pred();
};

const MOD = "pentaryn-prompts";
const out = { module: "prompts", golden: {}, timings: {}, cleanup: {} };
const P = game.pentaryn?.prompts;
// module disabled (no API, or its lastCalls setting unregistered): skip before any write, as
// walls.js does (LG-R4)
let ringBefore = null;
if (P) { try { ringBefore = foundry.utils.deepClone(game.settings.get(MOD, "lastCalls") ?? []); } catch { ringBefore = null; } }
if (!P || !ringBefore) {
  out.skipped = "pentaryn-prompts API is missing";
  return JSON.stringify(out);
}
const PROMPT = "ZZ a rusted iron brazier with a wolf-skull helm on top; the coals are still warm";
const BIO = [
  "<p>ZZ Varr the Ash-Keeper tends the brazier line for the warren. He is old, slow and patient, and he has outlived three chiefs by never wanting to be one.</p>",
  "<p>He knows every tunnel by the smell of its smoke. If a fire goes out he notices within the hour, and he will walk the whole line to find out why before he tells anyone.</p>",
  "<p>He keeps a tally of the dead on the inside of his shield, one notch each, and will trade the story of any notch for a cup of something strong.</p>",
  "<p>He fears the deep water below the third bridge and will not cross it, whatever he is offered. Pressed, he says the water speaks; he does not say what it says.</p>",
  "<p>If the boss falls he surrenders at once and offers the shrine key's hiding place for his life. He will keep that bargain, and only that one.</p>",
  "<p>ZZ end of biography marker sentence that should never appear in a 400 character preview.</p>"
].join("\n");
const dateRe = /\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?\b/g;
let scene = null, actor = null;
try {
  const status = P.status();
  for (const [size, id] of status.markers ?? []) tag(id, `marker-${size}`);
  out.golden.status = status;
  out.golden.surface = Object.keys(P).sort();
  out.golden.moduleApi = typeof game.modules.get(MOD)?.api;
  out.golden.settings = { gatherChars: game.settings.get(MOD, "gatherChars"), cropsDefault: game.settings.get(MOD, "cropsDefault"), unseenWithinFt: game.settings.get(MOD, "unseenWithinFt"), party: game.settings.get(MOD, "party") };
  // no `mid` marker (or its actor is gone): nothing to place, skip before the scene exists (LG-E6)
  const mid = game.actors.get((status.markers ?? []).find(([k]) => k === "mid")?.[1]);
  if (!mid) { out.skipped = "no mid prompt marker in this world"; return JSON.stringify(out); }

  scene = await Scene.create({ name: "ZZ live-goldens prompts", width: 2000, height: 1500, grid: { size: 100 } });
  actor = await Actor.create({ name: "ZZ Varr the Ash-Keeper", type: "npc", system: { details: { biography: { value: BIO } } } });
  tag(scene.id, "scene"); tag(actor.id, "actor");
  const d = scene.dimensions;
  const mTok = (await mid.getTokenDocument({ x: d.sceneX + 500, y: d.sceneY + 500, flags: { [MOD]: { prompt: PROMPT } } })).toObject();
  const bTok = (await actor.getTokenDocument({ x: d.sceneX + 700, y: d.sceneY + 500 })).toObject();
  delete mTok._id; delete bTok._id;
  // one create per token: a batch create comes back in no fixed order on Foundry 14
  const [marker] = await scene.createEmbeddedDocuments("Token", [mTok]);
  const [built] = await scene.createEmbeddedDocuments("Token", [bTok]);
  tag(marker.id, "marker"); tag(built.id, "built");
  out.golden.markerToken = { name: marker.name, hidden: marker.hidden, tint: String(marker.texture.tint?.css ?? marker.texture.tint), flags: marker.flags?.[MOD] ? Object.keys(marker.flags[MOD]).sort() : null, lockSize: marker.flags?.dnd5e?.lockSize ?? null };
  out.golden.dims = { sceneX: d.sceneX, sceneY: d.sceneY, size: d.size, padding: scene.padding };

  const g = await P.gather({ scenes: [scene.id], crops: false });
  tag(g.call, "call");
  const descLine = text => (String(text).split("\n").find(l => l.startsWith("Description:")) ?? null);
  out.golden.gather = {
    keys: Object.keys(g).sort(),
    counts: g.counts, next: g.next, version: g.version, party: g.party, partySource: g.partySource, cropsNote: g.cropsNote,
    crops: g.crops,
    text: String(g.text).replace(dateRe, "<date>"),
    descriptionLine: descLine(g.text),
    descriptionHasHtml: /<\/?p>/.test(descLine(g.text) ?? ""),
    manifestKeys: Object.keys(g.manifest ?? {}).sort(),
    manifestOpts: g.manifest?.opts ?? null,
    manifestPrompts: g.manifest?.prompts ?? null,
    manifestBuilt: g.manifest?.built ?? null
  };
  const g160 = await P.gather({ scenes: [scene.id], crops: false, chars: 160 });
  // the call id hashes scene + marker + prompt text only (callId), so `chars` does not change it
  out.golden.gather160 = { sameCall: g160.call === g.call, descriptionLine: descLine(g160.text) };
  out.golden.list = (P.list().scenes ?? []).filter(s => s.id === scene.id);
  const m = P.model(scene.id);
  out.golden.model = { keys: Object.keys(m).sort(), items: m.items.map(it => ({ key: it.key, isPrompt: it.isPrompt, kind: it.kind ?? null, name: it.name, atFt: it.atFt, size: it.size ?? null, descriptionChars: (it.description ?? "").length })) };

  out.timings.gather = await timeIt(() => P.gather({ scenes: [scene.id], crops: false }), N);
  out.timings.model = await timeIt(() => P.model(scene.id), 9, 5);
  out.timings.status = await timeIt(() => P.status(), 9, 50);
  out.timings.listAllScenes = await timeIt(() => P.list(), 9, 5);
} catch (e) {
  out.golden.error = caught(e);
} finally {
  await safely("ring", () => game.settings.set(MOD, "lastCalls", ringBefore));
  if (scene && game.scenes.get(scene.id)) await safely("scene", () => scene.delete());
  if (actor && game.actors.get(actor.id)) await safely("actor", () => actor.delete());
  out.cleanup.ringRestored = JSON.stringify(game.settings.get(MOD, "lastCalls")) === JSON.stringify(ringBefore);
  out.cleanup.zzLeft = game.actors.filter(a => a.name.startsWith("ZZ ")).length + game.scenes.filter(s => s.name.startsWith("ZZ ")).length;
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
