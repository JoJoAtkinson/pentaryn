// Oracle: the selection half of senses.mjs:65–89 `syncLight` at the senses characterisation
// checkpoint (wave 3, base a5a1a906), returning what it would write instead of writing it.
// Never imported by runtime. Plan step 3 / finding -11 (planSyncLight, the tokensByActor index)
// must produce the same plan; carried.test.mjs proves this oracle equals the live writes.
import { carriedLightOf } from "../../senses-core.mjs";
import { lightUpdate } from "./legacy-light-update.mjs";

const carriedLight = actor => carriedLightOf(actor?.items ?? []);

/** → { proto: {"prototypeToken.<k>": v} | null, scenes: [{ scene, updates: [{_id, ...}] }] } */
export function syncPlan(actor, scenes) {
  if (!actor || actor.pack) return { proto: null, scenes: [] };
  const light = carriedLight(actor);
  const p = lightUpdate(actor.prototypeToken, light);
  let proto = null;
  if (p) {
    proto = {};
    for (const [k, v] of Object.entries(p)) proto[`prototypeToken.${k}`] = v;
  }
  const out = [];
  for (const scene of scenes) {
    const updates = [];
    for (const t of scene.tokens) {
      if (t.actorId !== actor.id) continue;
      const u = lightUpdate(t, t.actorLink ? light : carriedLight(t.actor ?? actor));
      if (u) updates.push({ _id: t.id, ...u });
    }
    if (updates.length) out.push({ scene: scene.id, updates });
  }
  return { proto, scenes: out };
}
