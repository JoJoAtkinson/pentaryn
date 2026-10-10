// Pentaryn Senses — lights carried by items, the Light cantrip, the broken glow, token chains.
//
// Token vision from the sheet's senses is dnd5e's own since 6.0 (setting senseVisionSync,
// TokenDocument5e#_applySenseVision). Our darkvision sync is retired; migrate.mjs resets the sight
// it left stored on tokens once per world so the native sync can take over. Only the active GM
// writes, so a change seen by four clients is applied once.

// The broken glowstone light animation rides along; imported so adding it needed no module.json change.
import "./glow.mjs";
// The token chain (a drawn chain between two tokens, Token HUD to break it) rides along the same way.
import "./chain.mjs";
// The Light cantrip and lit torches/lamps/lanterns (LIGHT-DESIGN.md). Its GM sweep runs after ours.
import { api as lightApi } from "./light.mjs";
import { DARK, carriedLightOf } from "./light-core.mjs";
// The one-shot reset of the darkvision sight our retired sync stored (dnd5e 6 senseVisionSync).
import { registerSightReset, resetSight } from "./migrate.mjs";

const pending = new Map();

function isWriter() {
  return game.users.activeGM?.isSelf ?? game.user.isGM;
}

// ---- Lights carried by items ---------------------------------------------------------------------
// An item with flags.pentaryn-senses.light (token light data) lights whoever carries it. The token
// takes that light while the item is on the actor, and goes dark again when it leaves (dropped,
// traded, taken). Tokens lit this way carry flags.pentaryn-senses.itemLight, so a light set by hand
// (Marrith's rune glow) is never touched. A torch, lamp or lantern counts while it is lit
// (flags.pentaryn-senses.lit); the brightest carried light wins. A token lit by the Light cantrip
// (flags.pentaryn-senses.spellLight) is left to light.mjs until the spell ends.

const SCOPE = "pentaryn-senses";

/** The light the actor's carried items give, or null: a shard always, a torch while lit. */
function carriedLight(actor) {
  return carriedLightOf(actor?.items ?? []);
}

/**
 * The update that brings a token (or the prototype) in line with its carried light, or null.
 * A hand-set light that a carried light covers (Marrith lights a torch over her rune glow) is kept
 * in flags.pentaryn-senses.itemLightPrior and comes back when the carried light goes, not DARK.
 */
function lightUpdate(doc, light) {
  if (doc.flags?.[SCOPE]?.spellLight) return null; // the Light cantrip owns this token's light until it ends
  const lit = doc.flags?.[SCOPE]?.itemLight === true;
  const PRIOR = `flags.${SCOPE}.itemLightPrior`;
  if (light) {
    const own = doc.light?.toObject?.() ?? doc.light ?? {};
    const current = foundry.utils.flattenObject(own);
    const want = foundry.utils.flattenObject(light);
    const same = Object.entries(want).every(([k, v]) => current[k] === v);
    if (same && lit) return null;
    const u = { light, [`flags.${SCOPE}.itemLight`]: true };
    if (!lit && ((Number(own.bright) || 0) > 0 || (Number(own.dim) || 0) > 0)) u[PRIOR] = foundry.utils.deepClone(own);
    return u;
  }
  if (!lit) return null;
  const prior = doc.flags?.[SCOPE]?.itemLightPrior;
  const u = { light: foundry.utils.deepClone(prior ?? DARK), [`flags.${SCOPE}.itemLight`]: false };
  if (prior !== undefined) u[PRIOR] = globalThis._del ?? null;
  return u;
}

async function syncLight(actor) {
  if (!actor || actor.pack) return 0;
  let count = 0;
  const light = carriedLight(actor);
  const proto = lightUpdate(actor.prototypeToken, light);
  if (proto) {
    const u = {};
    for (const [k, v] of Object.entries(proto)) u[`prototypeToken.${k}`] = v;
    await actor.update(u);
    count++;
  }
  for (const scene of game.scenes) {
    const updates = [];
    for (const t of scene.tokens) {
      if (t.actorId !== actor.id) continue;
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

/** Coalesce bursts (equipping an item fires several hooks) into one sync per actor. */
function schedule(actor) {
  if (!actor || actor.documentName !== "Actor" || !isWriter()) return;
  clearTimeout(pending.get(actor.id));
  pending.set(actor.id, setTimeout(() => { pending.delete(actor.id); syncLight(actor); }, 250));
}

const actorOf = (doc) => {
  let p = doc?.parent;
  while (p && p.documentName !== "Actor") p = p.parent;
  return p;
};

Hooks.on("updateActor", (actor) => schedule(actor));
for (const verb of ["create", "update", "delete"]) {
  Hooks.on(`${verb}Item`, (item) => schedule(actorOf(item)));
  Hooks.on(`${verb}ActiveEffect`, (effect) => schedule(actorOf(effect)));
}
// A token placed from a stale prototype, or before this module existed.
Hooks.on("createToken", (token) => { if (token.actor) schedule(token.actor); });

Hooks.once("init", registerSightReset);

Hooks.once("ready", () => {
  const api = { syncLight, carriedLight, resetSight, light: lightApi, setupLight: lightApi.setup, syncAll: async () => {
    let n = 0;
    for (const a of game.actors) n += await syncLight(a);
    return n;
  } };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, senses: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.senses = api;
  }
  if (isWriter()) resetSight()
    .catch(e => console.warn(`${SCOPE} | sight reset`, e))
    .then(() => api.syncAll())
    .then(() => (game.users.activeGM?.isSelf ? lightApi.sweep() : null))
    .catch(e => console.warn(`${SCOPE} | ready sweep`, e));
});
