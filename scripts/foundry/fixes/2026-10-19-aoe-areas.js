// Fix — instantaneous spell areas stuck on a token (feedback WSMeuV, Marwen Ashcroft's Thunder Step).
// Body of an async function for the foundry `eval-js` MCP tool (paste the file as `script`). GM only.
// DRY RUN by default: it returns the plan and writes nothing. Set APPLY = true to delete.
// Idempotent: a second run (dry or not) finds nothing left to delete.
//
// dnd5e 6 attaches a non-stationary emanation to its caster's token. For Thunder Step (instantaneous)
// that left a 10 ft ring on Marwen that followed her around, with no handle, no Active Effect and no
// clean-up (no damage was rolled, so pentaryn-aoe's instantCleanup never ran). pentaryn-aoe 0.5.0
// stops new ones (setting stationaryInstantAreas) and adds a Token HUD eraser; this removes the ones
// already in the world: template regions (flags.dnd5e.activity) ATTACHED to a token that is not an
// aoe handle, whose activity (else its item) has duration "inst". Lasting auras (Spirit Guardians)
// are left alone. Seen on 2026-10-19: "Thunder Step [Marwen]" (rktU4v7CdibQLlgb) on
// "1. The Wayward Compass — Common Room" (ybhtwisDIVzStzYf), attached to token LHuYhlN8vyswA8ga.
//
// Every scene is scanned (SCENE = null), or one scene by id or exact name.

const SCENE = null;     // null = every scene; or an id / exact name
const APPLY = false;    // false = dry run

const isHandle = t => !!t?.flags?.["pentaryn-aoe"]?.handle;
const attachedId = r => {
  const raw = r._source?.attachment?.token ?? null;
  return typeof raw === "string" ? raw : (raw?.id ?? null);
};
const durationOf = r => {
  const f = r.flags?.dnd5e ?? {};
  const act = f.activity ? fromUuidSync(f.activity, { strict: false }) : null;
  const item = act?.item ?? (f.item ? fromUuidSync(f.item, { strict: false }) : null);
  return act?.duration?.units ?? item?.system?.duration?.units ?? null;
};

let scenes = [...game.scenes];
if (SCENE) {
  const one = game.scenes.get(SCENE) ?? game.scenes.find(s => s.name === SCENE) ?? null;
  if (!one) return JSON.stringify({ error: `no scene ${SCENE}` });
  scenes = [one];
}

const out = { apply: APPLY, found: [], deleted: [], errors: [] };
for (const scene of scenes) {
  const ids = [];
  for (const r of scene.regions) {
    if (!r.flags?.dnd5e?.activity) continue;
    const tokenId = attachedId(r);
    if (!tokenId) continue;
    const token = scene.tokens.get(tokenId);
    if (token && isHandle(token)) continue;
    const units = durationOf(r);
    if (units !== "inst") continue;
    out.found.push({ scene: scene.name, sceneId: scene.id, region: r.id, name: r.name, token: token?.name ?? tokenId, duration: units });
    ids.push(r.id);
  }
  if (!APPLY || !ids.length) continue;
  try {
    const gone = await scene.deleteEmbeddedDocuments("Region", ids);
    out.deleted.push(...gone.map(r => ({ scene: scene.id, region: r.id, name: r.name })));
  } catch (err) {
    out.errors.push({ scene: scene.id, ids, error: String(err?.message ?? err) });
  }
}
return JSON.stringify(out);
