/**
 * Pure logic for pentaryn-portals: who travels with the party, and where they land.
 * No Foundry globals here, so `node test/run.mjs` can load it.
 *
 * A "token record" is a plain object the Foundry side builds from a TokenDocument:
 *
 *   { id, actorId, type, linked, pile, excluded, hidden,
 *     owners:   string[]   non-GM user ids with OWNER on the token's actor (explicit, not default),
 *     summoner: string|null actor id from flags.dnd5e.summon.origin ("Actor.<id>.Item.<id>") }
 */

export const OWNER = 3;

/** Actor id of the summoner, from dnd5e's `flags.dnd5e.summon.origin` (an Item uuid). */
export function summonerActorId(origin) {
  if (typeof origin !== "string") return null;
  const m = origin.match(/(?:^|\.)Actor\.([^.]+)/);
  return m ? m[1] : null;
}

/** Non-GM users with explicit OWNER on an ownership map. `default` is ignored on purpose. */
export function playerOwners(ownership, gmIds = []) {
  const gm = new Set(gmIds);
  return Object.entries(ownership ?? {})
    .filter(([id, lvl]) => id !== "default" && !gm.has(id) && lvl >= OWNER)
    .map(([id]) => id);
}

/** Marker and crowd actors: GM scenery, never part of the party. */
export function isScenery({ name = "", folders = [] } = {}) {
  if (/\(crowd\)/i.test(name) || /^Marker\s*·/.test(name)) return true;
  return folders.some(f => /^(Crowd\b|Markers\b|Temp Markers\b)/i.test(String(f ?? "")));
}

/** A player character: a linked `character` token that is not an item pile. */
export const isPC = t => t.type === "character" && t.linked && !t.pile;

/** Never carried along: piles, markers, crowd, other PCs. */
const carriable = t => !t.pile && !t.excluded && !isPC(t);

/**
 * GM "Teleport party": every PC, plus every token a player owns or a PC summoned.
 * @param {object[]} records
 * @returns {object[]} the records to move, PCs first
 */
export function partySelection(records) {
  const pcs = records.filter(isPC);
  const pcActors = new Set(pcs.map(t => t.actorId));
  const followers = records.filter(t => carriable(t)
    && (t.owners.length > 0 || (t.summoner && pcActors.has(t.summoner))));
  return [...pcs, ...followers];
}

/**
 * Native teleport: the tokens that come along when `leaders` walk through a link.
 * A token follows if one of the leaders summoned it, or (with no summon flag) every player who
 * owns it also owns a leader. So a familiar follows its wizard, but a steed the whole party
 * co-owns stays put unless everyone goes.
 * @param {object[]} leaders  records of the tokens that just teleported
 * @param {object[]} records  every token still on the origin scene
 */
export function followersOf(leaders, records) {
  const leaderIds = new Set(leaders.map(t => t.id));
  const leaderActors = new Set(leaders.map(t => t.actorId).filter(Boolean));
  const leaderOwners = new Set(leaders.flatMap(t => t.owners));
  return records.filter(t => {
    if (leaderIds.has(t.id) || !carriable(t)) return false;
    if (t.summoner) return leaderActors.has(t.summoner);
    return t.owners.length > 0 && t.owners.every(u => leaderOwners.has(u));
  });
}

/**
 * Landing squares, filling outward from (cx, cy): centre, then each ring around it.
 * @param {number} cx  @param {number} cy  centre in canvas px
 * @param {number} g   grid size in px
 * @param {number} n   how many spots
 * @param {{blocked?: (from:number[], to:number[]) => boolean, occupied?: (x:number, y:number) => boolean, maxRing?: number}} [opts]
 *   blocked: a wall cuts the line from the centre to the spot. occupied: a token already stands there.
 * @returns {{x:number, y:number}[]} exactly n spots (stacks on the centre if boxed in)
 */
export function ringSpots(cx, cy, g, n, { blocked = () => false, occupied = () => false, maxRing = 8 } = {}) {
  const spots = [];
  for (let ring = 0; spots.length < n && ring < maxRing; ring++) {
    for (let dy = -ring; dy <= ring && spots.length < n; dy++) for (let dx = -ring; dx <= ring && spots.length < n; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const x = cx + dx * g, y = cy + dy * g;
      if (ring && blocked([cx, cy], [x, y])) continue;
      if (occupied(x, y)) continue;
      spots.push({ x, y });
    }
  }
  while (spots.length < n) spots.push({ x: cx, y: cy });
  return spots;
}

/** Segment-intersection test against wall coordinate arrays [x0,y0,x1,y1]. */
export function wallBlocker(wallCoords) {
  const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
  return (p, q) => wallCoords.some(c => {
    const a = [c[0], c[1]], b = [c[2], c[3]];
    return (ccw(p, a, b) !== ccw(q, a, b)) && (ccw(p, q, a) !== ccw(p, q, b));
  });
}

/**
 * Teleport destinations as absolute Region UUIDs.
 *
 * Since core 14.368 the Teleport Token behavior's `destinations` field relativizes on clean
 * (`DocumentUUIDField({relative: true, relativize: true})`): a same-scene destination is stored
 * relative to its behavior (`"..<regionId>"`), a cross-scene one stays absolute. Comparing raw
 * entries against `region.uuid` therefore misses every same-scene link. `toAbsolute` is the
 * Foundry side's `u => parseUuid(u, {relative: behavior})?.uuid`; an entry it cannot resolve is
 * kept as written.
 */
export function absoluteDestinations(stored, toAbsolute) {
  return [...(stored ?? [])].map(u => toAbsolute(u) ?? u);
}

/** Does `stored` (relative or absolute entries) already lead to the region with this uuid? */
export function hasDestination(stored, uuid, toAbsolute) {
  return absoluteDestinations(stored, toAbsolute).includes(uuid);
}

/** `stored` without whichever entry (relative or absolute) leads to `uuid`. */
export function withoutDestination(stored, uuid, toAbsolute) {
  return [...(stored ?? [])].filter(u => (toAbsolute(u) ?? u) !== uuid);
}
