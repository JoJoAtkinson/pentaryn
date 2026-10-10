// Pentaryn Token Vision Sync — token vision follows the sheet's Darkvision.
//
// dnd5e derives system.attributes.senses.ranges.darkvision from items and effects but never writes
// token sight. This mirrors it onto the prototype and placed tokens of any actor whose token has
// vision enabled. Only the active GM writes, so a change seen by four clients is applied once.

// The broken glowstone light animation rides along; imported so adding it needed no module.json change.
import "./glow.mjs";
// The token chain (a drawn chain between two tokens, Token HUD to break it) rides along the same way.
import "./chain.mjs";
// The Light cantrip and lit torches/lamps/lanterns (LIGHT-DESIGN.md). Its GM sweep runs after ours.
import { api as lightApi } from "./light.mjs";
import { DARK, carriedLightOf } from "./light-core.mjs";

const pending = new Map();

function isWriter() {
  return game.users.activeGM?.isSelf ?? game.user.isGM;
}

/** The sight a token should have, from the actor's derived senses. */
function desiredSight(actor) {
  const senses = actor.system?.attributes?.senses;
  const dv = Number(senses?.ranges?.darkvision ?? senses?.darkvision ?? 0) || 0;
  return dv > 0 ? { visionMode: "darkvision", range: dv } : { visionMode: "basic", range: 0 };
}

async function sync(actor) {
  if (!actor || actor.pack) return 0;
  const want = desiredSight(actor);
  let count = 0;
  const p = actor.prototypeToken.sight;
  if (p.enabled && (p.visionMode !== want.visionMode || p.range !== want.range)) {
    await actor.update({ "prototypeToken.sight.visionMode": want.visionMode, "prototypeToken.sight.range": want.range });
    count++;
  }
  for (const scene of game.scenes) {
    const updates = [];
    for (const t of scene.tokens) {
      if (t.actorId !== actor.id || !t.sight.enabled) continue;
      // An unlinked token has its own synthetic actor; read its senses, not the base actor's.
      const w = t.actorLink ? want : desiredSight(t.actor ?? actor);
      if (t.sight.visionMode !== w.visionMode || t.sight.range !== w.range)
        updates.push({ _id: t.id, "sight.visionMode": w.visionMode, "sight.range": w.range });
    }
    if (updates.length) {
      await scene.updateEmbeddedDocuments("Token", updates);
      count += updates.length;
    }
  }
  return count;
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
  pending.set(actor.id, setTimeout(() => { pending.delete(actor.id); sync(actor); syncLight(actor); }, 250));
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

Hooks.once("ready", () => {
  const api = { sync, syncLight, carriedLight, desiredSight, light: lightApi, setupLight: lightApi.setup, syncAll: async () => {
    let n = 0;
    for (const a of game.actors) {
      if (a.prototypeToken.sight.enabled) n += await sync(a);
      n += await syncLight(a);
    }
    return n;
  } };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, senses: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.senses = api;
  }
  if (isWriter()) api.syncAll()
    .then(() => (game.users.activeGM?.isSelf ? lightApi.sweep() : null))
    .catch(e => console.warn(`${SCOPE} | ready sweep`, e));
});
