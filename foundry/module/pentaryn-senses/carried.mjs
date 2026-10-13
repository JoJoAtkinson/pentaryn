/**
 * Pentaryn Senses — FEATURE: lights carried by items.
 *
 * An item with flags.pentaryn-senses.light (token light data) lights whoever carries it. The token
 * takes that light while the item is on the actor, and goes dark again when it leaves (dropped,
 * traded, taken). Tokens lit this way carry flags.pentaryn-senses.itemLight, so a light set by hand
 * (Marrith's rune glow) is never touched. A torch, lamp or lantern counts while it is lit
 * (flags.pentaryn-senses.lit); the brightest carried light wins. A token lit by the Light cantrip
 * (flags.pentaryn-senses.spellLight) is left to light.mjs until the spell ends. The rule itself is
 * core/light.mjs `itemLightUpdate`.
 *
 * Writer: the active GM, or any GM while no GM is active (`isActiveGMOrLoneGM`), so a change seen
 * by four clients is applied once. Bursts (equipping an item fires several hooks) coalesce into one
 * sync per actor, 250 ms after the last.
 */

import { carriedLightOf, itemLightUpdate, tokensByActor } from "./senses-core.mjs";
import { isActiveGMOrLoneGM } from "./lib/election.mjs";

const DEBOUNCE_MS = 250;

const pending = new Map();
let log = null;

/** The light the actor's carried items give, or null: a shard always, a torch while lit. */
function carriedLight(actor) {
  return carriedLightOf(actor?.items ?? []);
}

/** core/light.mjs itemLightUpdate with Foundry's helpers. The prior is cleared with `_del`, else a null value. */
function lightUpdate(doc, light) {
  return itemLightUpdate(doc, light, { flatten: foundry.utils.flattenObject, clone: foundry.utils.deepClone, del: globalThis._del ?? null });
}

/** The actor's tokens, scene by scene, lazily: a scene is read after the previous write. */
function* scanTokens(actor) {
  for (const scene of game.scenes) yield { scene, tokens: scene.tokens.filter(t => t.actorId === actor.id) };
}

/** The actor's tokens, scene by scene: from `index` (tokensByActor) when given, else a scan. */
function tokensOf(actor, index) {
  if (!index) return scanTokens(actor);
  // an index built before this call may hold tokens since deleted; syncAll's write phase does not re-check
  return (index.get(actor.id) ?? []).map(({ scene, tokens }) => ({ scene, tokens: tokens.filter(t => scene.tokens.get(t.id) === t) }));
}

/**
 * The prototype's update, its keys prefixed `prototypeToken.`, or null when converged. An unlinked
 * token's synthetic actor has no prototype of its own (its ActorDelta has no prototypeToken): null.
 */
function protoUpdate(actor, light) {
  const p = actor.isToken ? null : lightUpdate(actor.prototypeToken, light);
  if (!p) return null;
  const u = {};
  for (const [k, v] of Object.entries(p)) u[`prototypeToken.${k}`] = v;
  return u;
}

/** One scene's token updates, `[{_id, …}]`: a linked token takes `light`, an unlinked one its own items'. */
function tokenUpdates(tokens, actor, light) {
  const updates = [];
  for (const t of tokens) {
    if (actor.isToken && t.actorLink) continue;   // the base actor's linked token is not the synthetic's
    const u = lightUpdate(t, t.actorLink ? light : carriedLight(t.actor ?? actor));
    if (u) updates.push({ _id: t.id, ...u });
  }
  return updates;
}

/**
 * What syncing one actor would write: `{ proto: {"prototypeToken.<k>": v} | null, scenes: [{ scene,
 * updates: [{_id, …}] }] }`. Reads only; the same selection as syncLight. `index` as syncLight's.
 */
function planLight(actor, index) {
  const light = carriedLight(actor);
  const proto = protoUpdate(actor, light);
  const scenes = [];
  for (const { scene, tokens } of tokensOf(actor, index)) {
    const updates = tokenUpdates(tokens, actor, light);
    if (updates.length) scenes.push({ scene, updates });
  }
  return { proto, scenes };
}

/**
 * Bring the actor's prototype and every token of it (on every scene) in line. → documents written.
 * `opts.index`: a tokensByActor(game.scenes) map, so a whole-world sync walks the scenes once.
 * A synthetic actor (an unlinked token's) has no prototype: only its own tokens are synced.
 */
async function syncLight(actor, { index = null } = {}) {
  if (!actor || actor.pack) return 0;
  let count = 0;
  const light = carriedLight(actor);
  const proto = protoUpdate(actor, light);
  if (proto) {
    await actor.update(proto);
    count++;
  }
  for (const { scene, tokens } of tokensOf(actor, index)) {
    const updates = tokenUpdates(tokens, actor, light);
    if (updates.length) {
      await scene.updateEmbeddedDocuments("Token", updates);
      count += updates.length;
    }
  }
  return count;
}

/**
 * Every world actor at once (W3-SE3): the same per-actor plans syncLight writes, batched as
 * resetSight batches: every prototype in one Actor.updateDocuments, then every token in one
 * updateEmbeddedDocuments per scene, in scene order. → documents written.
 */
async function syncAll() {
  const index = tokensByActor(game.scenes);
  const protos = [];
  const byScene = new Map();
  for (const actor of game.actors) {
    if (!actor || actor.pack) continue;
    const { proto, scenes } = planLight(actor, index);
    if (proto) protos.push({ _id: actor.id, ...proto });
    for (const { scene, updates } of scenes) {
      if (!byScene.has(scene)) byScene.set(scene, []);
      byScene.get(scene).push(...updates);
    }
  }
  if (protos.length) await Actor.implementation.updateDocuments(protos);
  let n = protos.length;
  for (const scene of game.scenes) {
    const updates = byScene.get(scene);
    if (!updates) continue;
    await scene.updateEmbeddedDocuments("Token", updates);
    n += updates.length;
  }
  return n;
}

/** Coalesce bursts into one sync per actor. */
function schedule(actor) {
  if (!actor || actor.documentName !== "Actor" || !isActiveGMOrLoneGM()) return;
  clearTimeout(pending.get(actor.id));
  pending.set(actor.id, setTimeout(() => {
    pending.delete(actor.id);
    // a failed write is logged with the module and the actor, never left as an unhandled rejection (-15)
    syncLight(actor).catch(e => log?.warn(`carried light ${actor.name} (${actor.id})`, e));
  }, DEBOUNCE_MS));
}

const actorOf = (doc) => {
  let p = doc?.parent;
  while (p && p.documentName !== "Actor") p = p.parent;
  return p;
};

/** The carried-light hooks, in today's order. Raw handlers (guard: false), as they always were. */
export function install(reg, ctx) {
  log = ctx.log;
  const raw = { guard: false };
  reg.on("updateActor", (actor) => schedule(actor), { ...raw, label: "carried updateActor" });
  for (const verb of ["create", "update", "delete"]) {
    reg.on(`${verb}Item`, (item) => schedule(actorOf(item)), { ...raw, label: `carried ${verb}Item` });
    reg.on(`${verb}ActiveEffect`, (effect) => schedule(actorOf(effect)), { ...raw, label: `carried ${verb}ActiveEffect` });
  }
  // A token placed from a stale prototype, or before this module existed.
  reg.on("createToken", (token) => { if (token.actor) schedule(token.actor); }, { ...raw, label: "carried createToken" });
  // [declared PT TF-2] A token that changes actor (dnd5e's Wild Shape / polymorph swap, either way)
  // takes its new actor's carried lights: the old actor's sync no longer finds that token.
  reg.on("updateToken", (token, changes) => {
    if (changes && "actorId" in changes && token.actor) schedule(token.actor);
  }, { ...raw, label: "carried updateToken" });
  ctx.expose({ syncLight, carriedLight, syncAll });
}

/** Cancel every pending sync. The entry's reg.offAll() removes the hooks. */
export function uninstall() {
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
}
