/**
 * Pentaryn Senses — FEATURE: the Light cantrip and lit items. What the player sees: README; the
 * design and its evidence: context/plans/senses-light-cantrip.md (plan C4).
 *
 *   Light item    flags.pentaryn-senses.lightCast = { scene, token } | { scene, x, y } | null  (the caster writes)
 *   Token, square flags.pentaryn-senses.spellLight = { source, prior }  (the active GM reconciles; one light per Light)
 *   Torch, lamp…  flags.pentaryn-senses.lit / .hooded  (the owner toggles; carried.mjs lights the carrier)
 *
 * Hooks are guarded at warn ('pentaryn-senses | light <hook>'): a bug never breaks a sheet, a card or the HUD.
 */

import {
  MODULE, FLAGS, SPELL_LIGHT, ACTIVITY_PROFILES, profileFor, profileKey, isLit, isHooded, isLightSpellData, isLightToggle,
  readSpellCast, readSpellLight, castFlag, planSpellLight, squareId, spellLightUpdate, restoredLight,
  sourcesUnder, isPHBLightActorSource, torchActivityData, TORCH_ACTIVITY_ID, summarise, handSquareEdit,
  esc, unsetPath
} from "./senses-core.mjs";
import { coreRollMode } from "./settings.mjs";
import { isActiveGM, isAnyGM, claimDocument } from "./lib/election.mjs";
import { makeLog } from "./lib/log.mjs";
import { realItem, itemFrom, casterToken, allItems, litBy, anyLitBy, allSources, findToken } from "./light-adapter.mjs";
import { bindActions, cancelPick, decorateCard, decorateSheet, injectHUD, pick, prompt } from "./light-ui.mjs";

const { lightCast: CAST, lit: LIT, hooded: HOODED, spellLight: SPELL } = FLAGS;
const DEBOUNCE_MS = 250;

const RECENT = 20;

const state = { hooks: [], timers: new Map(), chain: Promise.resolve(), reg: null, ctx: null, recent: [] };

/** The kit log: the entry's ctx.log once installed (senses-R6). */
let log = makeLog(MODULE);

const warn = (label, err) => log.warn(`light ${label}`, err);

/* -------------------------------------------- */
/*  Casting (any client that owns the item)     */
/* -------------------------------------------- */

/** The one owner check for cast, end, toggle and hood: a non-owner is told why nothing happened. */
function ownerOrWarn(item) {
  if (item.isOwner) return true;
  ui.notifications.warn(_loc("PENTARYN_SENSES.Light.NotOwner", { name: item.actor?.name ?? item.name }));
  return false;
}

/**
 * Write where the light goes. `target` is {token: id} or {x, y}, on `target.scene` or the viewed
 * scene. The active GM does the rest; with no GM connected the flag waits for them.
 */
export async function cast(item, target) {
  item = realItem(item);
  if (!item || !target) return false;
  if (!ownerOrWarn(item)) return false;
  const flag = castFlag(target.scene ?? canvas?.scene?.id, target, Date.now());
  if (!flag) return false;
  await item.update({ [CAST]: flag });
  if (!game.users.activeGM) ui.notifications.warn(_loc("PENTARYN_SENSES.Light.NoGM"));
  else if (flag.token) {
    const tok = game.scenes.get(flag.scene)?.tokens.get(flag.token);
    // Never name a token whose nameplate this user can't see (crowd extras run displayName NONE).
    if (tok && canSeeName(tok)) ui.notifications.info(_loc("PENTARYN_SENSES.Light.OnToken", { name: tok.name }));
    else ui.notifications.info(_loc("PENTARYN_SENSES.Light.OnCreature"));
  } else ui.notifications.info(_loc("PENTARYN_SENSES.Light.OnSquare"));
  return true;
}

/** Would this user see the token's name on the map? GM and owners always; others only on HOVER / ALWAYS. */
function canSeeName(tok) {
  if (isAnyGM() || tok.isOwner) return true;
  const M = CONST.TOKEN_DISPLAY_MODES;
  return tok.displayName === M.HOVER || tok.displayName === M.ALWAYS;
}

/** Put the light out. The owner clears their item's flag; the GM can end any light. */
export async function end(item) {
  item = realItem(item);
  if (!item) return false;
  if (!ownerOrWarn(item)) return false;
  if (!readSpellCast(item) && !anyLitBy(item.uuid)) {
    ui.notifications.info(_loc("PENTARYN_SENSES.Light.NoneLit"));
    return false;
  }
  await item.update({ [CAST]: null });
  ui.notifications.info(_loc("PENTARYN_SENSES.Light.Ended"));
  return true;
}

export async function onMe(item) {
  item = realItem(item);
  if (!canvas?.scene) {
    ui.notifications.warn(_loc("PENTARYN_SENSES.Light.NoScene"));
    return false;
  }
  const tok = casterToken(item?.actor);
  if (!tok) {
    ui.notifications.warn(_loc("PENTARYN_SENSES.Light.NoToken"));
    return false;
  }
  return cast(item, { scene: tok.parent.id, token: tok.id });
}

export async function pickAndCast(item) {
  const target = await pick();
  if (target) return cast(item, target);
  return false;
}

/* -------------------------------------------- */
/*  Lit items                                   */
/* -------------------------------------------- */

/** Light or douse a torch, lamp, lantern or candle. One chat line; nothing consumed. */
export async function toggle(item) {
  item = realItem(item);
  if (!item || !profileFor(item)) return false;
  if (!ownerOrWarn(item)) return false;
  const lit = !isLit(item);
  await item.update(lit ? { [LIT]: true } : { [LIT]: false, [HOODED]: false });
  await announce(item, lit ? "PENTARYN_SENSES.Light.Lights" : "PENTARYN_SENSES.Light.Douses");
  return lit;
}

/** One chat line about a carried light, "{actor} lights the {item}." */
async function announce(item, key) {
  const actor = item.actor;
  const text = _loc(key, { actor: esc(actor?.name ?? ""), item: esc(item.name) });
  try {
    // The chat mode the user picked applies, as on dnd5e's own cards: a GM on "GM only" lighting a
    // hidden NPC's lantern must not announce it to the table.
    const data = { speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${text}</p>` };
    if (typeof ChatMessage.applyMode === "function") ChatMessage.applyMode(data);
    else ChatMessage.applyRollMode(data, coreRollMode());
    await ChatMessage.create(data);
  } catch (e) {
    warn("chat", e);
  }
}

/** Lower or raise a hooded lantern's hood (bright 0 / dim 5 while lowered). */
export async function hood(item) {
  item = realItem(item);
  if (!item || !profileFor(item)?.hooded) return false;
  if (!ownerOrWarn(item)) return false;
  const hooded = !isHooded(item);
  await item.update({ [HOODED]: hooded });
  // The table hears the hood too (usability Area 8, L5: lowering it posted nothing).
  await announce(item, hooded ? "PENTARYN_SENSES.Light.HoodLowered" : "PENTARYN_SENSES.Light.HoodRaised");
  return hooded;
}

/**
 * GM, idempotent: give every Torch (world items, actors, unlinked tokens) a "Light" activity that
 * toggles it. Lamps, lanterns and candles already have one. Plans first, then writes one batch per
 * parent (senses-ac-3): world items in one Item.updateDocuments, each actor's or unlinked token
 * actor's torches in one updateEmbeddedDocuments("Item"). → number of torches changed.
 */
export async function setup() {
  if (!isAnyGM()) {
    ui.notifications.warn(_loc("PENTARYN_SENSES.Light.SetupGMOnly"));
    return 0;
  }
  const byParent = new Map();   // parent Actor, or null for world items → [update]
  for (const item of allItems({ worldItems: true })) {
    let change;
    try {
      change = torchActivityChange(item);
    } catch (e) {
      warn(`setup ${item?.uuid}`, e);
    }
    if (!change) continue;
    const parent = item.parent ?? null;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push({ _id: item.id, ...change });
  }
  let n = 0;
  for (const [parent, updates] of byParent) {
    try {
      if (parent) await parent.updateEmbeddedDocuments("Item", updates);
      else await Item.implementation.updateDocuments(updates);
      n += updates.length;
    } catch (e) {
      warn(`setup ${parent?.uuid ?? "world items"}`, e);
    }
  }
  log.info(`setupLight: ${n} torch item(s) given a Light activity`);
  return n;
}

/**
 * The change that gives one item of an ACTIVITY_PROFILES profile its Light activity, sorted after
 * its last one; null when it is not such an item or already has one.
 */
function torchActivityChange(item) {
  if (!ACTIVITY_PROFILES.includes(profileKey(item)) || !item?.system?.activities) return null;
  const has = item.system.activities.has?.(TORCH_ACTIVITY_ID)
    || [...item.system.activities.values()].some(a => a?.flags?.[MODULE]?.lightToggle === true);
  if (has) return null;
  const data = torchActivityData(_loc("PENTARYN_SENSES.Light.ActivityName"));
  const sort = item.system.activities.size
    ? Math.max(...[...item.system.activities.values()].map(a => a.sort ?? 0)) + CONST.SORT_INTEGER_DENSITY
    : 0;
  return { [`system.activities.${TORCH_ACTIVITY_ID}`]: { ...data, sort } };
}

/** One item (the createItem hook): add the Light activity if it has none. → true when it was added. */
async function ensureTorchActivity(item) {
  const change = torchActivityChange(item);
  if (!change) return false;
  try {
    await item.update(change);
    return true;
  } catch (e) {
    warn(`setup ${item.uuid}`, e);
    return false;
  }
}

/* -------------------------------------------- */
/*  GM reconcile                                */
/* -------------------------------------------- */

async function tellOwners(item, key) {
  try {
    const whisper = game.users.filter(u => item.testUserPermission(u, "OWNER")).map(u => u.id);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: item.actor }),
      content: `<p>${esc(_loc(key))}</p>`,
      whisper
    });
  } catch (e) {
    warn("whisper", e);
  }
}

/**
 * Delete what is still there. Every tab of the active GM runs this (senses-ac-1): the other tab's
 * delete may land first, and the server's "does not exist" refusal then means it is already gone.
 * → how many are gone now (deleted here or by the other tab).
 */
async function deleteLive(scene, type, ids, live) {
  const there = ids.filter(id => live?.has(id));
  if (!there.length) return 0;
  try {
    await scene.deleteEmbeddedDocuments(type, there);
  } catch (e) {
    if (!/does not exist/i.test(e?.message ?? "")) throw e;
    log.debug(`${type} already deleted by another GM session`, e);
  }
  return there.length;
}

/**
 * The flag as the world allows it now. A cast on a token that is gone, or on a scene that is gone,
 * is cleared (the token case whispers "Gone" once); a token that moved scenes is followed silently.
 * → the desired cast, or null.
 */
async function resolveDesired(item, done) {
  let desired = item ? readSpellCast(item) : null;
  const castAt = desired ? item.getFlag?.(MODULE, "lightCast")?.at ?? 0 : 0;   // this cast's own claim key
  if (desired?.token) {
    const tok = findToken(desired.token, desired.scene);
    if (!tok) {
      desired = null;
      done.cleared = true;
      await item.update({ [CAST]: null });
      // Both GM tabs get here; the one that wins this cast's claim whispers (a per-cast key: a
      // claim key is single-use on a document, blueprint §5.9.2). Off the chain: the claim's
      // settle delay must not hold up the next reconcile.
      void claimDocument(item, `gone.${castAt}`, { scope: MODULE })
        .then(won => won && tellOwners(item, "PENTARYN_SENSES.Light.Gone"))
        .catch(e => warn("whisper", e));
    } else if (tok.parent.id !== desired.scene) {
      desired = { ...desired, scene: tok.parent.id };
      await item.update({ [`${CAST}.scene`]: tok.parent.id }); // moved scenes (portals): correct silently
    }
  } else if (desired && !game.scenes.get(desired.scene)) {
    desired = null;
    done.cleared = true;
    await item.update({ [CAST]: null });
  }
  return desired;
}

/** Tokens no longer wanted get their own light back, one Token batch per scene. → the actors touched. */
async function restoreTokens(plan, done) {
  const byScene = new Map();
  for (const r of plan.restore) {
    const t = game.scenes.get(r.scene)?.tokens.get(r.id);
    if (!t) continue;
    if (!byScene.has(r.scene)) byScene.set(r.scene, []);
    byScene.get(r.scene).push({ _id: t.id, light: restoredLight(t), ...unsetPath(SPELL) });
  }
  const touchedActors = new Set();
  for (const [sid, updates] of byScene) {
    const scene = game.scenes.get(sid);
    await scene.updateEmbeddedDocuments("Token", updates);
    done.restored += updates.length;
    for (const u of updates) { const a = scene.tokens.get(u._id)?.actor; if (a) touchedActors.add(a); }
  }
  return touchedActors;
}

/** Squares no longer wanted are deleted, one AmbientLight batch per scene. */
async function removeSquares(plan, done) {
  const byScene = new Map();
  for (const r of plan.remove) {
    if (!byScene.has(r.scene)) byScene.set(r.scene, []);
    byScene.get(r.scene).push(r.id);
  }
  for (const [sid, ids] of byScene) {
    const scene = game.scenes.get(sid);
    done.removed += await deleteLive(scene, "AmbientLight", ids, scene?.lights);
  }
}

/** The light that is wanted: the token lit (newest caster wins), or the square made. */
async function applyWanted(source, plan, done) {
  if (plan.light) {
    const tok = game.scenes.get(plan.light.scene)?.tokens.get(plan.light.token);
    if (tok) {
      const other = readSpellLight(tok)?.source;
      await tok.update(spellLightUpdate(tok, source, tok.light?.toObject?.() ?? tok.light));
      done.lit = tok.id;
      // Two casters, one token: newest wins; the first caster's Light lets go.
      if (other && other !== source) {
        const prev = itemFrom(other);
        if (readSpellCast(prev)?.token === tok.id) {
          await prev.update({ [CAST]: null });
          done.released = other;
        }
      }
    }
  }
  if (plan.create) {
    const scene = game.scenes.get(plan.create.scene);
    if (scene) {
      try {
        await scene.createEmbeddedDocuments("AmbientLight", [{
          _id: squareId(source, scene.id, plan.create.x, plan.create.y),
          x: plan.create.x, y: plan.create.y, elevation: 0, walls: true, vision: false,
          config: foundry.utils.deepClone(SPELL_LIGHT),
          flags: { [MODULE]: { spellLight: { source } } }
        }], { keepId: true });
      } catch (e) {
        // The other GM tab's create of this square landed first: the refusal is the election.
        if (!/already exists/i.test(e?.message ?? "")) throw e;
        log.debug("square already made by another GM session", e);
      }
      done.created = true;
    }
  }
}

/** A restored token may carry a lit torch: let the carried-light path re-apply it. */
async function resyncCarried(touchedActors) {
  const syncLight = state.ctx?.exposed?.syncLight;
  // Always the base actor: syncLight walks its tokens and reads each unlinked one's own items.
  if (syncLight) for (const id of new Set([...touchedActors].map(a => a.id))) {
    const base = game.actors.get(id);
    if (base) await syncLight(base);
  }
}

/** The summary: kept in the last-20 ring (its own copy) and logged at debug. → the summary. */
function remember(plan, done, desired) {
  const summary = summarise(plan, { ...done, desired });
  state.recent.push({ ...summary, desired: summary.desired && { ...summary.desired } });   // the ring's own copy
  if (state.recent.length > RECENT) state.recent.splice(0, state.recent.length - RECENT);
  log.debug("reconcile", summary);
  return summary;
}

/** Bring the world in line with one Light item's flag (or clean up after a vanished item). */
async function reconcile(source) {
  if (!isActiveGM() || !source) return null;
  const item = itemFrom(source);
  const done = { source, restored: 0, removed: 0, lit: null, created: false, released: null, cleared: false };
  const desired = await resolveDesired(item, done);
  const plan = planSpellLight({ desired, existing: litBy(source) });
  const touchedActors = await restoreTokens(plan, done);
  await removeSquares(plan, done);
  await applyWanted(source, plan, done);
  await resyncCarried(touchedActors);
  return remember(plan, done, desired);
}

/** The last 20 reconcile summaries on this client, oldest first (copies). */
function recent() {
  return state.recent.map(s => ({ ...s, desired: s.desired && { ...s.desired } }));
}

/**
 * Every spell-light source in the world, computed once per burst of hooks (finding -13): a batch
 * delete fires deleteToken per token in one task, and each would otherwise walk every scene. The
 * memo is dropped at the next microtask. A source a just-deleted token carried may still be in it;
 * queueing that source again only re-arms its debounce (reconcile is idempotent).
 */
let sourcesMemo = null;
function sourcesNow() {
  if (!sourcesMemo) {
    sourcesMemo = allSources();
    queueMicrotask(() => { sourcesMemo = null; });
  }
  return sourcesMemo;
}

/** Queue a reconcile. Bursts coalesce per source; runs are serial so two never interleave. */
function queue(source) {
  if (!source || !isActiveGM()) return;
  clearTimeout(state.timers.get(source));
  state.timers.set(source, setTimeout(() => {
    state.timers.delete(source);
    run(source);
  }, DEBOUNCE_MS));
}

function run(source) {
  state.chain = state.chain.then(() => reconcile(source)).catch(e => warn(`reconcile ${source}`, e));
  return state.chain;
}

/**
 * GM, at ready (after the carried-light sweep): reconcile every Light item with a flag and every
 * spell light on any scene (an orphan whose item is gone is put out), then remove the old PHB
 * floor-token summons. Idempotent. → {sources, removed}.
 */
export async function sweep() {
  if (!isActiveGM()) return { sources: 0, removed: 0 };
  const sources = allSources();
  for (const item of allItems()) if (readSpellCast(item)) sources.add(item.uuid);
  for (const s of sources) run(s);
  await state.chain;
  const removed = await tidyOldSummons();
  return { sources: sources.size, removed };
}

/** The floor tokens the PHB Light summon left before this module (10-08). */
async function tidyOldSummons() {
  let removed = 0;
  for (const scene of game.scenes) {
    const ids = [];
    for (const t of scene.tokens) {
      const origin = t.actor?.getFlag?.("dnd5e", "summon.origin");
      if (!origin) continue;
      let from = null;
      try {
        from = fromUuidSync(origin, { strict: false });
      } catch (e) {
        log.debug("summon origin unresolvable", e);
      }
      const spell = from?.documentName === "Item" ? from : from?.item ?? null;
      const base = game.actors.get(t.actorId);
      const phb = isPHBLightActorSource(base?._stats?.compendiumSource) || isPHBLightActorSource(base?.flags?.core?.sourceId);
      if (isLightSpellData(spell) || phb) ids.push(t.id);
    }
    if (ids.length) {
      log.info(`light: removing ${ids.length} old Light summon token(s) on ${scene.name}`, ids);
      removed += await deleteLive(scene, "Token", ids, scene.tokens);
    }
  }
  return removed;
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** reg.on with the body guarded: a throw logs `pentaryn-senses | light <name>` at warn and becomes
 *  `undefined`; any other return value is passed through (dnd5e.preUseActivity reads `false`). */
function on(name, fn) {
  state.hooks.push(state.reg.on(name, fn, { guard: "warn", label: `light ${name}` }));
}

function onUse(activity, usageConfig) {
  const item = activity?.item;
  if (!item) return;
  if (isLightSpellData(item)) {
    if (usageConfig?.create && typeof usageConfig.create === "object") usageConfig.create.summons = false;
    return; // never false: the card must still post
  }
  if (isLightToggle(activity, item)) {
    toggle(item).catch(e => warn("toggle", e));
    return false; // no consumption: the PHB activities would burn the lantern's one use
  }
}

function onUsed(activity) {
  const item = activity?.item;
  if (!isLightSpellData(item)) return;
  prompt(item).catch(e => warn("prompt", e));
}

export function uninstall() {
  for (const id of state.hooks.splice(0)) state.reg?.off(id);
  for (const t of state.timers.values()) clearTimeout(t);
  state.timers.clear();
  cancelPick();
}

/** What api.mjs publishes as `light.*` (each function under its own name; reconcile is `run`). */
const exposed = { cast, end, pick, toggle, hood, profileFor, sweep, setup, onMe, prompt, reconcile: run, recent };

/** FEATURE: called synchronously by the entry, at import. The hooks keep today's order. */
export function install(reg, ctx) {
  state.reg = reg;
  state.ctx = ctx;
  log = ctx.log;
  ctx.expose({ light: exposed });
  bindActions({ end, onMe, pickAndCast, toggle, hood, run });

  on("dnd5e.preUseActivity", onUse);
  on("dnd5e.postUseActivity", onUsed);
  on("dnd5e.renderChatMessage", decorateCard);
  on("renderBaseActorSheet", decorateSheet);
  on("renderTokenHUD", injectHUD);
  on("canvasTearDown", () => cancelPick());

  // A Torch that arrives after setupLight (bought, looted, dragged from a compendium) gets its
  // Light activity at once, from the GM (usability Area 6 re-run, W11: it had no flame button
  // until setupLight() was run again).
  on("createItem", (item) => {
    // a compendium torch is left as it is (-38): it gets the activity when it lands in the world
    if (!isActiveGM() || item?.pack) return;
    ensureTorchActivity(item).catch(e => warn("torch on create", e));
  });

  // GM side: the item flag is the desired state; tokens and ambient lights follow it.
  on("updateItem", (item, changes) => {
    if (!isActiveGM()) return;
    if (foundry.utils.hasProperty(changes ?? {}, CAST)) queue(item.uuid);
  });
  on("deleteItem", (item) => {
    if (!isActiveGM()) return;
    // the burst memo (finding -13): a batch delete of N items walks the world once, not N times
    if (readSpellCast(item) || sourcesNow().has(item.uuid)) queue(item.uuid);
  });
  on("createToken", (token) => {
    if (!isActiveGM()) return;
    const sl = readSpellLight(token);
    if (sl) queue(sl.source); // a copy is put back; a portal arrival corrects the flag's scene
  });
  on("deleteToken", (token, options) => {
    if (!isActiveGM()) return;
    const sl = readSpellLight(token);
    if (sl) {
      // Core teleport that had to change the token's id says so in `replacements`.
      const to = options?.replacements?.[token.id];
      const item = itemFrom(sl.source);
      if (to && item && readSpellCast(item)?.token === token.id) {
        const parsed = foundry.utils.parseUuid(to);
        const scene = parsed?.primaryId ?? game.scenes.find(s => s.tokens.has(parsed?.id))?.id;
        if (parsed?.id && scene) {
          item.update({ [CAST]: { ...item.getFlag(MODULE, "lightCast"), scene, token: parsed.id } })
            .catch(e => warn("retarget", e));
          return;
        }
      }
      queue(sl.source);
    }
    // An unlinked caster deleted: its Light item went with it. (A linked token's items are its
    // world actor's, never under the token's uuid: nothing to look for.)
    if (!token.actorLink) for (const s of sourcesUnder(sourcesNow(), token.uuid)) queue(s);
  });
  on("deleteActor", (actor) => {
    if (!isActiveGM()) return;
    for (const s of sourcesUnder(sourcesNow(), actor.uuid)) queue(s);
  });
  // A Light square deleted or dragged by the GM's hand ends or moves the light (core handSquareEdit).
  const handEdit = (kind, light) => {
    const sl = readSpellLight(light);
    if (!sl) return null;
    const item = itemFrom(sl.source);
    const edit = handSquareEdit(kind, { want: readSpellCast(item), source: sl.source, light, sceneId: light.parent?.id, lights: light.parent?.lights });
    return edit && { item, edit };
  };
  on("deleteAmbientLight", (light) => {
    if (!isActiveGM()) return;
    const h = handEdit("delete", light);
    if (h) h.item.update({ [CAST]: null }).catch(e => warn("hand-deleted square", e));
  });
  on("updateAmbientLight", (light, changes) => {
    if (!isActiveGM() || !(("x" in (changes ?? {})) || ("y" in (changes ?? {})))) return;
    const h = handEdit("move", light);
    if (h) h.item.update({ [`${CAST}.x`]: h.edit.x, [`${CAST}.y`]: h.edit.y }).catch(e => warn("hand-moved square", e));
  });
  on("deleteScene", () => {
    if (!isActiveGM()) return;
    clearTimeout(state.timers.get("__sweep"));
    state.timers.set("__sweep", setTimeout(() => { state.timers.delete("__sweep"); sweep().catch(e => warn("sweep", e)); }, 500));
  });
}

