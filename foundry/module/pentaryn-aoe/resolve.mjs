/**
 * Part B — saves and damage off the area, run on the ACTIVE GM's client.
 *
 * Trigger: a damage roll message from a save activity (Fireball's "Damage" button). The GM's
 * createChatMessage hook finds the creatures inside that activity's area (or the roller's targets
 * when there is no area), rolls the monsters' saves itself, posts one dnd5e request card for the
 * player characters, and keeps the whole state on the damage message:
 *
 *     message.flags["pentaryn-aoe"].resolution
 *
 * Nothing is applied until the GM presses Apply on the tray (tray.mjs), unless autoApplyNpc is on.
 * No sockets: with no GM online, nothing happens — correct for a GM-confirmed step.
 *
 * dnd5e 6: messages are typed (message.type "damage" / "save" / "usage") and carry their data in
 * message.system. Every save this file rolls (NPC, request card, GM-for-player) is posted with the
 * activity's messageSources and system.origin = the spell's usage card, the way dnd5e's own save
 * button does, so the usage card's outcomes and the native damage tray's half-damage pill agree
 * with the multipliers here.
 */

import {
  MODULE, aoeFlags, buildRows, fillSave, matchSave, applicableRows, allApplied, newestRegion,
  supersedes, carefulTargets, protectRows, carefulApplies, carefulStale, isHandle, isTemplateRegion
} from "./core.mjs";
import { setting } from "./settings.mjs";
import { claimMessage } from "./lib/election.mjs";
import { makeLog } from "./lib/log.mjs";
import { areasFor, removeArea, handleActor, isPile } from "./scene-adapter.mjs";
import { activityOf, usageIdOf, recordedTarget } from "./messages-adapter.mjs";

export const REQUEST_HANDLER = `${MODULE}.save`;
const abilityLabel = a => CONFIG.DND5E.abilities[a]?.label ?? a;

/* -------------------------------------------- */
/*  Serialised writes per message               */
/* -------------------------------------------- */

let log = makeLog(MODULE);   // the entry's ctx.log once installed

const queues = new Map();
/** Run fn(resolution) → resolution for one message, one at a time, then write it back. */
export function mutate(messageId, fn) {
  const prev = queues.get(messageId) ?? Promise.resolve();
  const next = prev.then(async () => {
    const message = game.messages.get(messageId);
    const res = message && foundry.utils.deepClone(aoeFlags(message).resolution);
    if (!res) return null;
    const out = (await fn(res, message)) ?? res;
    await message.update({ [`flags.${MODULE}.resolution`]: out });
    return out;
  }).catch(err => { log.error("mutate", err); return null; });
  queues.set(messageId, next);
  return next;
}

/* -------------------------------------------- */
/*  Who is affected                             */
/* -------------------------------------------- */

/** Describe a TokenDocument as the plain object core.buildRows expects. */
export function describeToken(token) {
  const actor = token.actor;
  return {
    id: token.id,
    name: token.name,
    img: token.texture?.src ?? actor?.img,
    actorUuid: actor?.uuid ?? null,
    baseActorId: token.actorId ?? actor?.id ?? null,
    actorType: actor?.type ?? null,
    hpMax: actor?.system?.attributes?.hp?.max ?? 0,
    hpValue: actor?.system?.attributes?.hp?.value ?? 0,
    hidden: !!token.hidden,
    disposition: token.disposition ?? null,
    handle: isHandle(token),
    isHandleActor: !!aoeFlags(actor).handleActor || token.actorId === handleActor()?.id,
    isPile: isPile(token),
    hasPlayerOwner: !!actor?.hasPlayerOwner
  };
}

/**
 * TokenDocuments for a damage message's recorded targets on `scene`. dnd5e 6 records
 * { actor, token } uuids; a message migrated from 5.3.3 has only the actor (the old { uuid }).
 */
function tokensForTargets(targets, scene) {
  const out = [];
  for (const tg of targets ?? []) {
    const { token: doc, actor: actorUuid } = recordedTarget(tg);
    if (doc && (!scene || doc.parent === scene)) { out.push(doc); continue; }
    const actor = fromUuidSync(actorUuid ?? tg?.uuid ?? "", { strict: false });
    if (!actor) continue;
    const token = actor.token ?? actor.getActiveTokens?.(false, true)?.find(tk => tk.parent === scene)
      ?? scene?.tokens.find(tk => tk.actorId === actor.id);
    if (token) out.push(token);
  }
  return out;
}

/* -------------------------------------------- */
/*  Resolve                                     */
/* -------------------------------------------- */

/**
 * dnd5e's roll workflow sets system.origin to the message the click came from
 * (BasicRoll.buildPost: event.target.closest("[data-message-id]")), which for a click in our tray
 * or on the request card is the wrong card. Keep the keys (fast-forward, advantage), drop the target.
 */
function keysOnly(event) {
  if (!event) return undefined;
  const { altKey, ctrlKey, metaKey, shiftKey, clientX, clientY, type } = event;
  return { altKey: !!altKey, ctrlKey: !!ctrlKey, metaKey: !!metaKey, shiftKey: !!shiftKey, clientX, clientY, type };
}

/** system data for a save we roll for this resolution: the activity's sources, threaded under the usage card. */
function saveSystem(res) {
  const activity = fromUuidSync(res?.activity ?? "", { strict: false });
  const system = { ...(activity?.messageSources ?? {}) };
  if (res?.usage && game.messages.has(res.usage)) system.origin = res.usage;
  return system;
}

function damagesOf(message) {
  const agg = dnd5e.dice.aggregateDamageRolls(message.rolls, { respectProperties: true });
  return agg.map(roll => ({
    value: Math.max(0, roll.total),
    type: roll.options.type,
    properties: Array.from(roll.options.properties ?? [])
  }));
}

/**
 * Build (or rebuild, for a different region) the resolution on a damage message, roll the
 * monster saves and post the players' request card.
 * @param {ChatMessage|string} messageOrId
 * @param {{regionId?: string|null}} [opts]
 */
export async function resolve(messageOrId, { regionId = undefined } = {}) {
  if (!game.users.activeGM?.isSelf) return null;
  const message = typeof messageOrId === "string" ? game.messages.get(messageOrId) : messageOrId;
  if (!message || message.type !== "damage") return null;
  const activity = activityOf(message);
  if (!activity?.save) return null;

  const scene = game.scenes.get(message.speaker?.scene) ?? canvas.scene;
  const candidates = scene ? areasFor(activity.uuid, scene) : [];
  const region = regionId !== undefined
    ? (regionId ? scene?.regions.get(regionId) ?? null : null)
    : newestRegion(candidates);

  const tokens = region
    ? [...(region.tokens ?? [])]
    : tokensForTargets(message.system.targets, scene);

  const ability = activity.save.ability?.first?.() ?? [...(activity.save.ability ?? [])][0];
  const dc = activity.save.dc?.value;
  const onSave = message.system?.onSave ?? activity.damage?.onSave ?? "half";
  const casterActorId = activity.actor?.id ?? null;
  const described = tokens.map(describeToken);
  const rows = buildRows(described, { casterActorId });
  const usage = usageIdOf(message);
  const careful = await carefulFor(activity.actor, described, { casterActorId, usage, scene, onSave, rows });

  const res = {
    activity: activity.uuid,
    item: activity.item?.uuid ?? null,
    itemName: activity.item?.name ?? "",
    region: region?.id ?? null,
    regions: candidates.map(r => ({ id: r.id, name: r.name })),
    scene: scene?.id ?? null,
    usage,
    ability, dc, onSave,
    careful,
    damages: damagesOf(message),
    request: null,
    created: message.timestamp ?? Date.now(),
    superseded: false,
    rows
  };

  // Write the bare state first so the tray appears and later results have somewhere to land.
  await message.update({ [`flags.${MODULE}.resolution`]: res });
  await supersedeOlder(message, res);

  await rollNpcSaves(message.id);
  if (setting("promptPlayers") && rows.some(r => r.kind === "manual" && r.apply && !r.save)) {
    await postRequest(message, activity, res);
  }
  if (setting("autoApplyNpc")) {
    const ids = (aoeFlags(game.messages.get(message.id)).resolution?.rows ?? []).filter(r => r.kind === "auto").map(r => r.id);
    if (ids.length) await applyRows(message.id, ids);
  }
  return aoeFlags(game.messages.get(message.id)).resolution;
}

/**
 * An earlier Damage click on the same activity and area greys out: it can no longer Apply. So does
 * an earlier one from the same usage card whose area has gone since (S16).
 */
async function supersedeOlder(message, res) {
  const older = game.messages.filter(m => m.id !== message.id && supersedes(aoeFlags(m).resolution, res)
    && (m.timestamp ?? 0) <= (message.timestamp ?? Infinity));
  for (const m of older) await mutate(m.id, r => { r.superseded = true; return r; });
}

/* -------------------------------------------- */
/*  Careful Spell                               */
/* -------------------------------------------- */

/** The combat turn an actor's Careful Spell belongs to ("combatId:round:combatantId"), or null out of combat. */
export function carefulKey(actor) {
  const combat = game.combats?.find?.(c => c.started && c.combatants.some(cb => cb.actor === actor || cb.actorId === actor?.id));
  return combat ? `${combat.id}:${combat.round}:${combat.combatant?.id ?? combat.turn}` : null;
}

/**
 * The caster used Careful Spell for this cast: mark their side's rows (up to the CHA mod) as an
 * automatic success with no damage on a half-on-save spell, and bind the use to this usage card.
 * @returns {Promise<{names: string[], max: number}|null>}
 */
async function carefulFor(caster, described, { casterActorId, usage, scene, onSave, rows }) {
  if (!caster || !setting("carefulSpell")) return null;
  const flag = aoeFlags(caster).careful;
  if (!carefulApplies(flag, { now: Date.now(), combatKey: carefulKey(caster), usage })) return null;
  const own = caster.token ?? caster.getActiveTokens?.(false, true)?.find(tk => tk.parent === scene) ?? null;
  const max = Math.max(1, Number(caster.system?.abilities?.cha?.mod) || 1);
  const ids = carefulTargets(described, { casterActorId, casterDisposition: own?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY, max });
  protectRows(rows, ids, onSave);
  if (usage && !flag.usage) await caster.update({ [`flags.${MODULE}.careful.usage`]: usage }).catch(() => null);
  return { names: rows.filter(r => r.protected).map(r => r.name), max };
}

/** On the caster's client: Careful Spell was used, the next save spell's area protects their side. */
async function onCarefulUsed(activity) {
  if (!setting("carefulSpell")) return;
  const item = activity?.item;
  if ((item?.system?.identifier || "") !== "careful-spell") return;
  const actor = activity.actor;
  if (!actor?.isOwner) return;
  await actor.update({ [`flags.${MODULE}.careful`]: { at: Date.now(), key: carefulKey(actor), usage: null } });
  const max = Math.max(1, Number(actor.system?.abilities?.cha?.mod) || 1);
  ui.notifications?.info?.(_loc("PENTARYN_AOE.Careful.Armed", { n: max }));
}

/* -------------------------------------------- */
/*  Monster saves                               */
/* -------------------------------------------- */

async function rollOne(row, res, scene) {
  const actor = fromUuidSync(row.actor);
  if (!actor) return null;
  const token = scene?.tokens.get(row.id) ?? null;
  const rolls = await actor.rollSavingThrow({ ability: res.ability, target: res.dc }, { configure: false }, {
    // dnd5e 6 passes this to core as messageMode; a legacy "gmroll" would silently become public.
    rollMode: foundry.dice.Roll._mapLegacyRollMode(setting("npcSaveRollMode")),
    data: { speaker: ChatMessage.getSpeaker({ actor, scene, token }), system: saveSystem(res), flags: { [MODULE]: { npcSave: true } } }
  });
  const roll = rolls?.[0];
  if (!roll) return null;
  return { total: roll.total, success: roll.isSuccess ?? (roll.total >= res.dc), messageId: roll.parent?.id ?? null };
}

/** Roll (or re-roll) the auto rows. rowIds limits it; force re-rolls rows that already have a save. */
export async function rollNpcSaves(messageId, { rowIds = null, force = false } = {}) {
  const message = game.messages.get(messageId);
  const res = aoeFlags(message).resolution;
  if (!res) return null;
  const scene = game.scenes.get(res.scene);
  const results = {};
  for (const row of res.rows) {
    if (row.kind !== "auto" || row.applied || row.protected) continue;
    if (rowIds && !rowIds.includes(row.id)) continue;
    if (row.save && !force) continue;
    results[row.id] = await rollOne(row, res, scene);
  }
  return mutate(messageId, r => {
    for (const row of r.rows) if (results[row.id]) fillSave(row, results[row.id], r.onSave);
    return r;
  });
}

/* -------------------------------------------- */
/*  Player saves: the request card              */
/* -------------------------------------------- */

/** dnd5e request handler — runs on whichever client clicks the button (the player's). */
export async function handleSaveRequest(actor, request, data, { event } = {}) {
  const msg = {};
  foundry.utils.setProperty(msg, "flags.dnd5e.requestResult", { actorUuid: actor.uuid, requestId: request.id });
  const res = aoeFlags(game.messages.get(data?.damageMessage)).resolution;
  const scene = game.scenes.get(res?.scene);
  const row = res?.rows?.find(r => r.kind === "manual" && r.actor === actor.uuid);
  const token = (row && scene?.tokens.get(row.id)) ?? actor.token ?? actor.getActiveTokens?.(false, true)?.[0] ?? null;
  msg.speaker = ChatMessage.getSpeaker({ actor, scene: token?.parent ?? scene, token });
  // Thread the save under the spell's usage card, not the request card the click came from.
  if (res) msg.system = saveSystem(res);
  const [roll] = (await actor.rollSavingThrow({ ability: data.ability, target: data.dc, event: res ? keysOnly(event) : event }, {}, { data: msg })) ?? [];
  return roll?.parent ?? null;
}

async function postRequest(message, activity, res) {
  const manual = res.rows.filter(r => r.kind === "manual" && r.apply && !r.save);
  if (!manual.length) return null;
  const label = abilityLabel(res.ability);
  const content = res.onSave === "half" ? _loc("PENTARYN_AOE.Request.Half") : res.onSave === "none" ? _loc("PENTARYN_AOE.Request.None") : "";
  const request = await ChatMessage.implementation.create({
    type: "request",
    flavor: _loc("PENTARYN_AOE.Request.Flavor", { item: res.itemName, ability: label }),
    content: content ? `<p>${content}</p>` : "",
    speaker: ChatMessage.getSpeaker({ actor: activity.actor }),
    flags: { [MODULE]: { damageMessage: message.id } },
    system: {
      handler: REQUEST_HANDLER,
      data: { ability: res.ability, dc: res.dc, damageMessage: message.id },
      button: { icon: "fa-solid fa-shield-heart", label: _loc("PENTARYN_AOE.Request.Button", { ability: label }) },
      targets: manual.map(r => ({ actor: r.actor }))
    }
  });
  if (request) await mutate(message.id, r => { r.request = request.id; return r; });
  return request;
}

/** GM: a save message arrived — does it answer a waiting player row? */
async function onSaveMessage(message) {
  const roll = message.rolls?.[0];
  if (!roll) return;
  const reqFlag = message.flags?.dnd5e?.requestResult;
  const info = {
    ability: message.system?.ability,
    actorUuid: reqFlag?.actorUuid ?? null,
    actorId: message.speaker?.actor ?? null,
    tokenId: message.speaker?.token ?? null,
    requestId: reqFlag?.requestId ?? null,
    created: message.timestamp ?? Date.now()
  };
  // Newest open resolution first; only a handful of recent messages are ever candidates.
  const recent = game.messages.contents.slice(-60).reverse().filter(m => aoeFlags(m).resolution && !aoeFlags(m).resolution.superseded);
  for (const m of recent) {
    const res = aoeFlags(m).resolution;
    const idx = matchSave(res, info, { createdAfter: m.timestamp ?? 0 });
    if (idx < 0) continue;
    const rowId = res.rows[idx].id;
    const success = roll.isSuccess ?? (Number.isFinite(res.dc) ? roll.total >= res.dc : null);
    await mutate(m.id, r => {
      const row = r.rows.find(x => x.id === rowId);
      if (row && !row.save) fillSave(row, { total: roll.total, success, messageId: message.id }, r.onSave);
      return r;
    });
    return;
  }
}

/** GM rolls a player's save for them (absent player), with the normal dialog. */
export async function rollForPlayer(messageId, rowId, { event } = {}) {
  const res = aoeFlags(game.messages.get(messageId)).resolution;
  const row = res?.rows.find(r => r.id === rowId);
  const actor = row && fromUuidSync(row.actor);
  if (!actor) return null;
  const data = res.request ? {} : null;
  if (res.request) foundry.utils.setProperty(data, "flags.dnd5e.requestResult", { actorUuid: actor.uuid, requestId: res.request });
  const scene = game.scenes.get(res.scene);
  const speaker = ChatMessage.getSpeaker({ actor, scene, token: scene?.tokens.get(row.id) });
  return actor.rollSavingThrow({ ability: res.ability, target: res.dc, event: keysOnly(event) }, {}, {
    data: { ...(data ?? {}), speaker, system: saveSystem(res) }
  });
}

/** Whisper the owners of rows still waiting for a save. */
export async function pingPlayers(messageId) {
  const res = aoeFlags(game.messages.get(messageId)).resolution;
  if (!res) return null;
  const waiting = res.rows.filter(r => r.kind === "manual" && !r.save && r.apply);
  const users = new Set();
  for (const r of waiting) {
    const actor = fromUuidSync(r.actor);
    for (const u of game.users) if (!u.isGM && u.active && actor?.testUserPermission(u, "OWNER")) users.add(u.id);
  }
  if (!users.size) return ui.notifications.info(_loc("PENTARYN_AOE.Tray.NobodyToPing"));
  return ChatMessage.implementation.create({
    whisper: [...users],
    content: `<p>${_loc("PENTARYN_AOE.Tray.PingText", { item: res.itemName, ability: abilityLabel(res.ability) })}</p>`
  });
}

/* -------------------------------------------- */
/*  Apply                                       */
/* -------------------------------------------- */

/** Apply damage for ticked, resolved, unapplied rows (all of them, or rowIds). Safe to repeat. */
export async function applyRows(messageId, rowIds = null) {
  if (!game.user.isGM) return null;
  const message = game.messages.get(messageId);
  const res = aoeFlags(message).resolution;
  if (!res) return null;
  if (res.superseded) { ui.notifications.warn(_loc("PENTARYN_AOE.Tray.Superseded")); return null; }
  const todo = applicableRows(res.rows, rowIds);
  const damages = res.damages.map(d => ({ ...d, properties: new Set(d.properties ?? []) }));
  const done = {};
  for (const row of todo) {
    const actor = fromUuidSync(row.actor);
    if (!actor) continue;
    const before = actor.system.attributes.hp.value;
    await actor.applyDamage(damages, { multiplier: row.multiplier, originatingMessage: message });
    done[row.id] = { before, after: actor.system.attributes.hp.value };
  }
  const out = await mutate(messageId, r => {
    for (const row of r.rows) if (done[row.id]) { row.applied = true; row.hp = done[row.id]; }
    return r;
  });
  if (out && allApplied(out.rows)) await cleanupInstant(out);
  return out;
}

/** Instantaneous spell, everything applied → the area has done its job. */
async function cleanupInstant(res) {
  if (!setting("instantCleanup") || !res.region) return;
  const item = res.item ? fromUuidSync(res.item) : null;
  if (item?.system?.duration?.units !== "inst") return;
  const scene = game.scenes.get(res.scene);
  const region = scene?.regions.get(res.region);
  if (region && isTemplateRegion(region)) await removeArea([region], scene);
}

/** GM edits from the tray. */
export function setRow(messageId, rowId, changes) {
  return mutate(messageId, r => {
    const row = r.rows.find(x => x.id === rowId);
    if (!row || row.applied) return r;
    if ("apply" in changes) row.apply = !!changes.apply;
    if ("multiplier" in changes) { row.multiplier = Number(changes.multiplier); row.overridden = true; }
    return r;
  });
}

/* -------------------------------------------- */
/*  Hook wiring                                 */
/* -------------------------------------------- */

/** An ability saving throw (dnd5e 6 save messages also carry concentration and death saves). */
const isAbilitySave = message => message?.type === "save" && (message.system?.type ?? "ability") === "ability";

export function install(reg, ctx) {
  log = ctx.log;
  CONFIG.DND5E.requests[REQUEST_HANDLER] = handleSaveRequest;
  // The tray (a separate feature) reaches these through ctx.exposed, never by importing this file.
  ctx.expose({ resolve, applyRows, rollNpcSaves, rollForPlayer, pingPlayers, setRow });

  reg.on("dnd5e.postUseActivity", reg.guardSwallowAsync("postUseActivity(careful)", (activity) => onCarefulUsed(activity)), { guard: false, label: "postUseActivity(careful)" });

  // A Careful Spell armed for a turn of a combat that is now gone can never apply: clear it.
  reg.on("deleteCombat", reg.guardSwallowAsync("deleteCombat(careful)", async (combat) => {
    if (!game.users.activeGM?.isSelf) return;
    const done = new Set();
    for (const c of combat.combatants ?? []) {
      const actor = c.actor;
      if (!actor || done.has(actor.uuid)) continue;
      done.add(actor.uuid);
      if (carefulStale(aoeFlags(actor).careful, combat.id)) await actor.unsetFlag(MODULE, "careful");
    }
  }), { guard: false, label: "deleteCombat(careful)" });

  reg.on("createChatMessage", reg.guardSwallowAsync("createChatMessage", async (message) => {
    if (!game.users.activeGM?.isSelf) return;
    if (isAbilitySave(message)) return onSaveMessage(message);
    if (message.type !== "damage" || !setting("resolveSaves")) return;
    if (aoeFlags(message).resolution) return;
    if (!activityOf(message)?.save) return;
    // Two sessions on the GM account would both resolve: doubled NPC saves and request cards.
    if (!(await claimMessage(message, "resolve", { scope: MODULE }))) return;
    if (aoeFlags(game.messages.get(message.id)).resolution) return;
    return resolve(message);
  }), { guard: false, label: "createChatMessage" });

  // A request result attached after creation (dnd5e's own #handleRequest setFlag path).
  reg.on("updateChatMessage", reg.guardSwallowAsync("updateChatMessage", async (message, changes) => {
    if (!game.users.activeGM?.isSelf) return;
    if (!foundry.utils.getProperty(changes, "flags.dnd5e.requestResult")) return;
    if (isAbilitySave(message)) return onSaveMessage(message);
  }), { guard: false, label: "updateChatMessage" });
}

/** The request handler goes with the hooks; the registry unwinds the hooks. */
export function uninstall() {
  if (CONFIG.DND5E?.requests?.[REQUEST_HANDLER]) delete CONFIG.DND5E.requests[REQUEST_HANDLER];
}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { tokensForTargets, keysOnly, saveSystem, damagesOf, supersedeOlder, carefulFor, onCarefulUsed, rollOne, postRequest, onSaveMessage, cleanupInstant, isAbilitySave, queues };
