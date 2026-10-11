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

/** The light the actor's carried items give, or null: a shard always, a torch while lit. */
function carriedLight(actor) {
  return carriedLightOf(actor?.items ?? []);
}

/** core/light.mjs itemLightUpdate with Foundry's helpers. The prior is cleared with `_del`, else a null value. */
function lightUpdate(doc, light) {
  return itemLightUpdate(doc, light, { flatten: foundry.utils.flattenObject, clone: foundry.utils.deepClone, del: globalThis._del ?? null });
}

/** The actor's tokens, scene by scene: from `index` (tokensByActor) when given, else a scan. */
function* scanTokens(actor) {
  // lazily, scene by scene, as the loop it replaces did: a scene is read after the previous write
  for (const scene of game.scenes) yield { scene, tokens: scene.tokens.filter(t => t.actorId === actor.id) };
}

function tokensOf(actor, index) {
  if (!index) return scanTokens(actor);
  // a token deleted since the index was built is skipped (syncAll awaits between actors)
  return (index.get(actor.id) ?? []).map(({ scene, tokens }) => ({ scene, tokens: tokens.filter(t => scene.tokens.get(t.id) === t) }));
}

/**
 * Bring the actor's prototype and every token of it (on every scene) in line. → documents written.
 * `opts.index`: a tokensByActor(game.scenes) map, so a whole-world sync walks the scenes once.
 */
async function syncLight(actor, { index = null } = {}) {
  if (!actor || actor.pack) return 0;
  let count = 0;
  const light = carriedLight(actor);
  // An unlinked token's synthetic actor has no prototype of its own (its ActorDelta has no
  // prototypeToken): only its tokens are synced, each from its own items.
  const proto = actor.isToken ? null : lightUpdate(actor.prototypeToken, light);
  if (proto) {
    const u = {};
    for (const [k, v] of Object.entries(proto)) u[`prototypeToken.${k}`] = v;
    await actor.update(u);
    count++;
  }
  for (const { scene, tokens } of tokensOf(actor, index)) {
    const updates = [];
    for (const t of tokens) {
      const u = lightUpdate(t, t.actorLink ? light : carriedLight(t.actor ?? actor));
      if (u) updates.push({ _id: t.id, ...u });
    }
    if (updates.length) {
      await scene.updateEmbeddedDocuments("Token", updates);
      count += updates.length;
    }
  }
  return count;
}

/** Every world actor, one after another. → documents written. */
async function syncAll() {
  const index = tokensByActor(game.scenes);
  let n = 0;
  for (const a of game.actors) n += await syncLight(a, { index });
  return n;
}

/** Coalesce bursts into one sync per actor. */
function schedule(actor) {
  if (!actor || actor.documentName !== "Actor" || !isActiveGMOrLoneGM()) return;
  clearTimeout(pending.get(actor.id));
  pending.set(actor.id, setTimeout(() => { pending.delete(actor.id); syncLight(actor); }, DEBOUNCE_MS));
}

const actorOf = (doc) => {
  let p = doc?.parent;
  while (p && p.documentName !== "Actor") p = p.parent;
  return p;
};

/** The carried-light hooks, in today's order. Raw handlers (guard: false), as they always were. */
export function install(reg, ctx) {
  const raw = { guard: false };
  reg.on("updateActor", (actor) => schedule(actor), { ...raw, label: "carried updateActor" });
  for (const verb of ["create", "update", "delete"]) {
    reg.on(`${verb}Item`, (item) => schedule(actorOf(item)), { ...raw, label: `carried ${verb}Item` });
    reg.on(`${verb}ActiveEffect`, (effect) => schedule(actorOf(effect)), { ...raw, label: `carried ${verb}ActiveEffect` });
  }
  // A token placed from a stale prototype, or before this module existed.
  reg.on("createToken", (token) => { if (token.actor) schedule(token.actor); }, { ...raw, label: "carried createToken" });
  ctx.expose({ syncLight, carriedLight, syncAll });
}

/** Cancel every pending sync. The entry's reg.offAll() removes the hooks. */
export function uninstall() {
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
}
