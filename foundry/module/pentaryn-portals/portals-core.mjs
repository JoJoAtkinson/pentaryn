/**
 * Pure logic for pentaryn-portals: who travels with the party, and where they land.
 * No Foundry globals here, so `node test/run.mjs` can load it.
 *
 * A "token record" is a plain object the Foundry side builds from a TokenDocument:
 *
 *   { id, actorId, type, linked, pile, excluded, hidden, handle,
 *     owners:   string[]   non-GM user ids with OWNER on the token's actor (explicit, not default),
 *     summoner: string|null actor id from flags.dnd5e.summon.origin ("Actor.<id>.Item.<id>"),
 *     handle:   boolean      a pentaryn-aoe area handle (the token a spell area is attached to) }
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

/**
 * Never carried along: piles, markers, crowd, other PCs, and area handles. A handle is owned by
 * every player (so anyone can drag the area) but its area stays on the old scene; carried, it
 * arrived alone as a stray "Circle of Death (Caven)" (usability Area 8, L11).
 */
const carriable = t => !t.pile && !t.excluded && !t.handle && !isPC(t);

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
 * The PC a follower should land beside: the PC who summoned it, else the first PC that one of its
 * owners also owns. Null when none (it lands wherever there is room).
 * @param {object} follower  @param {object[]} pcs  records, in party order
 * @returns {string|null} the PC record's id
 */
export function leaderOf(follower, pcs) {
  if (follower.summoner) {
    const pc = pcs.find(p => p.actorId === follower.summoner);
    if (pc) return pc.id;
  }
  const owners = new Set(follower.owners ?? []);
  return pcs.find(p => (p.owners ?? []).some(u => owners.has(u)))?.id ?? null;
}

/**
 * Hand out landing spots so each follower lands next to its PC (usability Area 8, L11: the
 * Elemental Spirit landed in the ring by order, away from its druid). PCs take the free spot
 * nearest the centre (`spots` comes centre-first from ringSpots); a follower takes the free spot
 * nearest its leader's. Every party member gets one of `spots`; there must be as many spots.
 * @param {{x:number,y:number}[]} spots   centre-first
 * @param {object[]} party                partySelection output (PCs first)
 * @returns {{x:number,y:number}[]}       a spot per party member, in party order
 */
export function assignSpots(spots, party) {
  const free = spots.map((s, i) => ({ ...s, i }));
  const take = idx => free.splice(idx, 1)[0];
  const pcs = party.filter(isPC);
  const at = new Map();
  const out = new Array(party.length);
  // Group: each PC, then its followers; followers with no leader last.
  const order = [];
  const lead = party.map(t => (isPC(t) ? null : leaderOf(t, pcs)));
  for (const [i, t] of party.entries()) {
    if (!isPC(t)) continue;
    order.push(i);
    for (const [j] of party.entries()) if (lead[j] === t.id) order.push(j);
  }
  for (const [j, t] of party.entries()) if (!isPC(t) && !lead[j]) order.push(j);
  // ringSpots pads a boxed-in landing with copies of the centre; a copy is a last resort.
  const used = new Set();
  const key = s => `${s.x},${s.y}`;
  for (const i of order) {
    if (!free.length) break;
    const anchor = lead[i] ? at.get(lead[i]) : null;
    let idx = 0, best = Infinity;
    free.forEach((s, k) => {
      const near = anchor ? Math.max(Math.abs(s.x - anchor.x), Math.abs(s.y - anchor.y)) * 1e6 + Math.hypot(s.x - anchor.x, s.y - anchor.y) : k;
      const d = (used.has(key(s)) ? 1e15 : 0) + near;
      if (d < best) { best = d; idx = k; }
    });
    const { x, y } = take(idx);
    used.add(key({ x, y }));
    out[i] = { x, y };
    if (isPC(party[i])) at.set(party[i].id, { x, y });
  }
  for (let i = 0; i < out.length; i++) out[i] ??= { ...(spots[0] ?? { x: 0, y: 0 }) };
  return out;
}

/**
 * The GM's preview line before a party teleport: who goes, PCs first, each follower after the PC
 * it lands beside. → [{ id, name, follower: boolean, leaderName: string|null }]
 */
export function partyPreview(party) {
  const pcs = party.filter(isPC);
  const nameOf = id => pcs.find(p => p.id === id)?.name ?? null;
  return party.map(t => ({ id: t.id, name: t.name ?? t.id, follower: !isPC(t),
    leaderName: isPC(t) ? null : nameOf(leaderOf(t, pcs)) }));
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

/**
 * Does a token that just arrived share a square with someone already there? (usability Area 6
 * re-run, W7: two PCs crossing at once, plus the Fighter already there, all stood on the one
 * landing square.) Boxes are {x, y, w, h} in pixels; touching edges do not count.
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {{x:number,y:number,w:number,h:number}[]} others
 */
export function crowded(box, others = []) {
  return (others ?? []).some(o => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h);
}
