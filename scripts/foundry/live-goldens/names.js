// Live golden — pentaryn-names. Body of an async function for the foundry `eval-js` MCP tool
// (paste the file as `script`, timeoutMs 60000). GM client only. Returns a JSON string of
// { module, golden, timings, cleanup }: `golden` is deterministic (ids normalised, timestamps
// dropped), `timings` are medians of N runs (performance.now) — the performance baseline.
//
// What it exercises (the real glue, no stubs): a ZZ scratch scene holding two UNLINKED tokens of
// one ZZ npc (one labelled with the full name, one with the short form before the comma); the
// actor is renamed through Actor#update, so preUpdateActor → updateActor → sync() run exactly as
// at the table. Captured: prototype + token labels after, the toasts names raised (info toasts
// are counted through a pass-through spy that is removed in `finally`), and two no-op updates
// (img only; same name) that must raise none. The scene and actor are deleted at the end.

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
/** Live only: poll until pred() holds or ms passes (names' sync is fire-and-forget from updateActor). */
const settle = async (pred, ms = 3000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) return true; await new Promise(r => setTimeout(r, 10)); }
  return !!pred();
};

const out = { module: "names", golden: {}, timings: {}, cleanup: {} };
const API = game.pentaryn.names;
out.golden.surface = Object.keys(API ?? {}).sort();
out.golden.moduleApi = typeof game.modules.get("pentaryn-names")?.api;

const OLD = "ZZ Glubbek, Golden Net-Mender";
const NEW = "ZZ Brakka, Golden Elder";
let scene = null, actor = null;
const toasts = [];
const notes = ui.notifications;
const origInfo = notes.info;
const hadOwnInfo = Object.hasOwn(notes, "info");
notes.info = function (message, options) { toasts.push(String(message)); return origInfo.call(this, message, options); };
try {
  scene = await Scene.create({ name: "ZZ live-goldens names", width: 1000, height: 1000, grid: { size: 100 } });
  actor = await Actor.create({ name: OLD, type: "npc" });
  tag(scene.id, "scene"); tag(actor.id, "actor");
  const base = (await actor.getTokenDocument({ x: 100, y: 100 })).toObject();
  delete base._id;
  const [full, short] = await scene.createEmbeddedDocuments("Token", [
    { ...base, x: 100, y: 100 },
    { ...base, name: "ZZ Glubbek", x: 300, y: 100 }
  ]);
  tag(full.id, "tokFull"); tag(short.id, "tokShort");
  const labels = () => ({
    actor: actor.name,
    proto: actor.prototypeToken.name,
    tokens: [...scene.tokens].sort((a, b) => a.x - b.x).map(t => ({ id: t.id, name: t.name, actorLink: t.actorLink, synthetic: !!t.actor?.isToken }))
  });
  const before = labels();

  toasts.length = 0;
  await actor.update({ name: NEW });
  await settle(() => toasts.length > 0 && scene.tokens.get(short.id)?.name !== "ZZ Glubbek");
  await new Promise(r => setTimeout(r, 150)); // a second toast, if any, would arrive by now
  out.golden.rename = { before, after: labels(), toastCount: toasts.length, toasts: [...toasts] };

  // no-op updates: an img-only change and a same-name write must not relabel or toast
  toasts.length = 0;
  await actor.update({ img: "icons/svg/mystery-man.svg" });
  await actor.update({ name: NEW });
  await new Promise(r => setTimeout(r, 200));
  out.golden.noop = { after: labels(), toastCount: toasts.length };

  // a nickname survives: rename the short token to something else, rename the actor again
  await scene.updateEmbeddedDocuments("Token", [{ _id: short.id, name: "Fishface" }]);
  toasts.length = 0;
  await actor.update({ name: OLD });
  await settle(() => toasts.length > 0);
  await new Promise(r => setTimeout(r, 150));
  out.golden.nickname = { after: labels(), toastCount: toasts.length, toasts: [...toasts] };

  // the pure helpers as published
  out.golden.helpers = {
    shortName: [API.shortName("Glubbek, Kuo-toa Net-Mender"), API.shortName(null), API.shortName(" A , b")],
    relabel: [API.relabel("Bob", "Bob", "Rob"), API.relabel("Glubbek", "Glubbek, Net-Mender", "Brakka, Elder"), API.relabel("Fishface", "Glubbek, Net-Mender", "X")]
  };

  // timings: full rename round trip (update → every label written → toast), and the pure relabel
  let flip = 0;
  out.timings.renameRoundTrip = await timeIt(async () => {
    const want = `ZZ Golden${++flip}, Timing`;
    const n0 = toasts.length;
    await actor.update({ name: want });
    await settle(() => toasts.length > n0 && scene.tokens.get(full.id)?.name === want);
  });
  out.timings.relabel = await timeIt(() => API.relabel("Glubbek", "Glubbek, Net-Mender", "Brakka, Elder"), 9, 10000);
  out.timings.syncNoChange = await timeIt(() => API.sync(actor, "nobody", "nobody else"), N, 20);
} catch (e) {
  out.golden.error = caught(e);
} finally {
  if (hadOwnInfo) notes.info = origInfo; else delete notes.info;
  if (scene && game.scenes.get(scene.id)) await scene.delete();
  if (actor && game.actors.get(actor.id)) await actor.delete();
  out.cleanup = {
    infoRestored: ui.notifications.info === origInfo,
    zzLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length + game.scenes.filter(s => s.name.startsWith("ZZ ")).length
  };
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
