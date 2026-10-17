/**
 * Pentaryn Portal Cards — FEATURE: summons follow their PC through a native teleport, and an
 * arriving PC steps off an occupied square.
 *
 * When a player walks their PC through a link to another scene, core's Teleport Token behavior
 * creates the PC on the destination and deletes the old token with `replacements`. Their summons
 * stay behind. The active GM sees that delete and carries the PC's followers (its own summons, and
 * tokens only that player owns) to land around the PC.
 *
 * Only a real portal counts: the PC must have been standing in a region whose teleport leads to
 * the destination scene. A GM cut-and-paste of a PC between scenes, or dnd5e reverting a form,
 * also deletes with `replacements`, and does not drag anything along.
 */

import { MODULE, FLAG_SCOPE, crowded, displaceOptions, followersOf, isAoeHandle, tokenBox, tokenCentre } from "./portals-core.mjs";
import { carryTo, clashNotice, destinationsOf, docOf, gmUserIds, landingPlaces, recordOf } from "./scene-adapter.mjs";
import { setting } from "./settings.mjs";
import { PARTY_ROWS } from "./api-manifest.mjs";
import { claimDocument } from "./lib/election.mjs";
import { flagPath } from "./lib/flags.mjs";

/** Tokens deleted by one operation, gathered so a party walking through together is one pass. */
const pendingOps = new WeakMap();
/** The module's log, from install(). */
let log = null;

export function cameThroughPortal(token, destScene) {
  const scene = token.parent;
  const c = token.getCenterPoint?.() ?? { x: token.x, y: token.y };
  const p = { x: c.x, y: c.y, elevation: token.elevation ?? 0 };
  return scene.regions.some(r => {
    if (!destinationsOf(r).some(d => d.region.parent === destScene)) return false;
    try { if (r.testPoint(p)) return true; } catch (err) { log?.debug("region testPoint", err); }
    return !!r.bounds?.contains?.(p.x, p.y);
  });
}

/** Where `arrived` should step to, or null when it is not on anyone (or has nowhere to go). */
function stepOff(arrived) {
  const dest = arrived.parent;
  const g = dest.grid.size;
  const box = t => tokenBox(t, g);
  // An aoe area handle is invisible scaffolding, flagged on its token or only on its actor (-43).
  const others = dest.tokens.filter(t => t.id !== arrived.id && !t.hidden && !isAoeHandle(t.flags, t.actor?.flags)).map(box);
  if (!crowded(box(arrived), others)) return null;
  const { x: cx, y: cy } = tokenCentre(arrived, g);
  const [place] = landingPlaces(dest, [arrived], cx, cy);
  if (!place || (place.x === arrived.x && place.y === arrived.y)) return null;
  return place;
}

/**
 * A PC that lands on someone (usability Area 6 re-run, W7: two PCs crossing together plus one
 * already there all stood on the one landing square) steps to the nearest free square around it.
 * GM, after core's teleport created the token. Setting spreadArrivals.
 *
 * Every active-GM tab runs this (the MCP bridge and a GM browser are both activeGM.isSelf), so a
 * move is claimed first and only the winning tab writes (portals-async-1). The claim flag leaves
 * in the winner's own write, so core's next teleport (toObject) does not carry it to a new scene;
 * an emptied `claims` object leaves with it (portals-w3-2).
 */
export async function spreadArrival(tokenOrUuid) {
  const arrived = docOf(tokenOrUuid, "Token", "spreadArrival");   // ROB-6
  if (!arrived) return undefined;
  if (!setting("spreadArrivals") || !stepOff(arrived)) return arrived;
  const won = await claimDocument(arrived, "spread", { scope: MODULE, reread: d => d.parent?.tokens?.get?.(d.id) ?? {} });
  if (!won) return arrived;
  const place = stepOff(arrived);                                 // the scene may have moved on meanwhile
  const changes = { ...place };
  // The claim leaves with the move; when it was the only one, `claims` goes too — no empty {} left (portals-w3-2).
  const claims = arrived.flags?.[MODULE]?.claims;
  if (claims?.spread !== undefined) {
    const others = Object.keys(claims).some(k => k !== "spread");
    changes[flagPath(FLAG_SCOPE, others ? "claims.spread" : "claims")] = _del;
  }
  if (!Object.keys(changes).length) return arrived;
  await arrived.update(changes, place ? displaceOptions([{ _id: arrived.id, ...place }]) : {});
  return arrived;
}

/**
 * The token ids of `scene` that each destination scene of `replacements` ALREADY holds (a duplicated
 * scene keeps token ids), read in the delete hook, before any GM tab has carried anyone: later, a
 * follower another tab just carried looks exactly the same (review L3). → Map<sceneId, Set<tokenId>>
 */
export function heldIds(scene, replacements) {
  const out = new Map();
  for (const uuid of Object.values(replacements ?? {})) {
    let dest = null;
    try { dest = fromUuidSync(uuid)?.parent ?? null; } catch (err) { log?.debug("replacement uuid", err); }
    if (!dest || dest === scene || out.has(dest.id)) continue;
    out.set(dest.id, new Set(scene.tokens.filter(t => dest.tokens.has(t.id)).map(t => t.id)));
  }
  return out;
}

/** `held`: heldIds() from the delete hook; a follower whose id the destination already held stays, and the GM is told. */
export async function bringFollowers(scene, deleted, replacements, { held = new Map() } = {}) {
  const leaders = [];
  const gmIds = gmUserIds();
  for (const t of deleted) {
    const newUuid = replacements[t.id];
    let arrived = newUuid ? fromUuidSync(newUuid) : null;
    if (!arrived && newUuid) arrived = await fromUuid(newUuid).catch(() => null);
    if (!arrived || arrived.parent === scene) continue;           // same scene: not a portal hop
    const r = recordOf(t, { gmIds });
    if (r.type !== "character" && !r.polymorphed) continue;       // only a PC brings company
    if (!cameThroughPortal(t, arrived.parent)) continue;
    try { await spreadArrival(arrived); } catch (err) { log.warn("arrival spread skipped", err); }
    leaders.push({ record: r, arrived });
  }
  if (!leaders.length) return;
  const gone = new Set(deleted.map(t => t.id));
  const remaining = scene.tokens.filter(t => !gone.has(t.id)).map(t => recordOf(t, { gmIds }));
  // Each PC's own company lands around that PC. Then, if several PCs went through together to
  // one scene, whatever they co-own (a shared steed) lands around the first of them.
  const passes = leaders.map(l => ({ group: [l.record], arrived: l.arrived }));
  const sameDest = leaders.filter(l => l.arrived.parent === leaders[0].arrived.parent);
  if (sameDest.length > 1) passes.push({ group: sameDest.map(l => l.record), arrived: sameDest[0].arrived });
  for (const { group, arrived } of passes) {
    let followers = followersOf(group, remaining.filter(x => scene.tokens.has(x.id))).map(x => x.doc);
    const dest = arrived.parent;
    const taken = held.get(dest.id);
    const stuck = taken ? followers.filter(f => taken.has(f.id)) : [];
    if (stuck.length) {
      clashNotice(stuck, dest);
      followers = followers.filter(f => !taken.has(f.id));
    }
    if (!followers.length) continue;
    const { x: cx, y: cy } = tokenCentre(arrived, dest.grid.size);
    try {
      // onto the PC's own floor (core put it there), never the source level id (carryTo)
      await carryTo(followers, dest, cx, cy, null, { preferLevel: arrived.level ?? null });
    } catch (err) {
      // Two tabs on the GM account (the MCP bridge and a browser) both run this. carryTo creates
      // with keepId, so the server takes one create and refuses the other: that refusal is the
      // election (finding -28). Any other failure still rejects ("summons did not follow").
      // Keep it this way (portals-async-3): these are embedded Tokens, and an embedded create with
      // keepId and an _id the scene already holds is refused with "already exists". The
      // blueprint's note that a keepId create *replaces* the document is about world documents
      // (journals, actors) and does not apply here. Do not swap this for a flag claim:
      // claimDocument is used only by spreadArrival (portals-async-1), never here.
      if (!/already exists/i.test(err?.message ?? "")) throw err;
      log?.debug("followers already carried by another session", err);
      continue;
    }
    const names = followers.map(f => f.name).join(", ");
    ui.notifications.info(_loc("PENTARYN_PORTALS.Notify.Followed", { name: arrived.name, names, place: dest.navName || dest.name }));
  }
}

function onDeleteToken(token, options) {
  const replacements = options?.replacements;
  if (!replacements || !game.users.activeGM?.isSelf) return;
  // One delete operation calls this hook once per token with the same options object, and the
  // others are already out of scene.tokens by then: collect them, then act once.
  const batch = pendingOps.get(options);
  if (batch) { batch.push(token); return; }
  const deleted = [token];
  pendingOps.set(options, deleted);
  const scene = token.parent;
  const held = heldIds(scene, replacements);
  setTimeout(() => bringFollowers(scene, deleted, replacements, { held })
    .catch(err => log.warn("summons did not follow", err)), 0);
}

/** The API rows this feature contributes (api-manifest PARTY_ROWS). */
export const contribution = () => ({ rows: PARTY_ROWS, impl: { spreadArrival } });

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("deleteToken", onDeleteToken, { guard: false, label: "summons follow" });
  return contribution();
}

/** Nothing to clear: pendingOps is a WeakMap keyed by core's options objects. */
export function uninstall() {}
