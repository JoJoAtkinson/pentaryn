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

import { crowded, followersOf, tokenBox } from "./portals-core.mjs";
import { carryTo, destinationsOf, gmUserIds, landingPlaces, recordOf } from "./scene-adapter.mjs";
import { setting } from "./settings.mjs";
import { PARTY_ROWS } from "./api-manifest.mjs";

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

/**
 * A PC that lands on someone (usability Area 6 re-run, W7: two PCs crossing together plus one
 * already there all stood on the one landing square) steps to the nearest free square around it.
 * GM, after core's teleport created the token. Setting spreadArrivals.
 */
export async function spreadArrival(arrived) {
  if (!setting("spreadArrivals")) return arrived;
  const dest = arrived.parent;
  const g = dest.grid.size;
  const box = t => tokenBox(t, g);
  const others = dest.tokens.filter(t => t.id !== arrived.id && !t.hidden && !t.flags?.["pentaryn-aoe"]?.handle).map(box);
  if (!crowded(box(arrived), others)) return arrived;
  const cx = arrived.x + arrived.width * g / 2, cy = arrived.y + arrived.height * g / 2;
  const [place] = landingPlaces(dest, [arrived], cx, cy);
  if (!place || (place.x === arrived.x && place.y === arrived.y)) return arrived;
  await arrived.update(place, { teleport: true, animate: false });
  return arrived;
}

export async function bringFollowers(scene, deleted, replacements) {
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
    const followers = followersOf(group, remaining.filter(x => scene.tokens.has(x.id))).map(x => x.doc);
    if (!followers.length) continue;
    const dest = arrived.parent;
    const g = dest.grid.size;
    const cx = arrived.x + arrived.width * g / 2, cy = arrived.y + arrived.height * g / 2;
    try {
      await carryTo(followers, dest, cx, cy);
    } catch (err) {
      // Two tabs on the GM account (the MCP bridge and a browser) both run this. carryTo creates
      // with keepId, so the server takes one create and refuses the other: that refusal is the
      // election (finding -28). Any other failure still rejects ("summons did not follow").
      if (!/already exists/i.test(err?.message ?? "")) throw err;
      log?.debug("followers already carried by another session", err);
      continue;
    }
    const names = followers.map(f => f.name).join(", ");
    ui.notifications.info(`${arrived.name} brought ${names} to ${dest.navName || dest.name}.`);
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
  setTimeout(() => bringFollowers(scene, deleted, replacements)
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
