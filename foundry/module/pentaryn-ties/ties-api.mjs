/**
 * Data layer for NPC ties.
 *
 * ONE RULE: nothing in here throws. A malformed entry is dropped, a deleted actor
 * degrades to a greyed row, a missing field takes a default. The canvas overlay and
 * the sheet tab both render straight off `read()`, so a bad flag must never be able
 * to break a sheet or a scene.
 *
 * Direction: an actor's array says what THAT ACTOR is to each person listed.
 *   Piet's array contains { id: <brellin>, word: "understudy" }
 *   → hovering Piet, the badge under Brellin reads "understudy".
 */

export const MODULE = "pentaryn-ties";
export const FLAG = "ties";
export const LEGACY_SCOPE = "world"; // pre-module data lived on flags.world.ties

export const STANCES = [
  { value: 2, key: "devoted", hex: 0x2ecc40, css: "#2ecc40" },
  { value: 1, key: "friendly", hex: 0x6ab04c, css: "#6ab04c" },
  { value: 0, key: "neutral", hex: 0x9aa0a6, css: "#9aa0a6" },
  { value: -1, key: "wary", hex: 0xe1a53a, css: "#e1a53a" },
  { value: -2, key: "hostile", hex: 0xe74c3c, css: "#e74c3c" }
];

export const STRENGTHS = [5, 4, 3, 2, 1];

/**
 * Notes are free prose, so cap them. Flags ride along on every actor update; an
 * accidental paste of a whole session log would bloat the document forever.
 */
export const NOTES_MAX = 4000;

const num = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
export const clampStance = v => Math.max(-2, Math.min(2, num(v, 0)));
export const clampStrength = v => Math.max(1, Math.min(5, num(v, 3)));
export const clampNotes = v => (typeof v === "string" ? v.slice(0, NOTES_MAX) : "");
export const stanceOf = v => STANCES.find(s => s.value === clampStance(v)) ?? STANCES[2];

export function stanceLabel(v) {
  const s = stanceOf(v);
  return game.i18n.localize(`PENTARYN_TIES.stance.${s.key}`);
}

/** Sanitised, resolved ties for an actor. Never throws. Never returns non-array. */
export function read(actor) {
  if (!actor) return [];
  let raw;
  try {
    raw = actor.getFlag(MODULE, FLAG);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const id = typeof t.id === "string" ? t.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const target = game.actors?.get(id) ?? null;
    out.push({
      id,
      name:
        target?.name ??
        (typeof t.name === "string"
          ? t.name
          : game.i18n?.localize("PENTARYN_TIES.row.missingName") ?? "(missing)"),
      img: target?.img ?? null,
      missing: !target,
      word: typeof t.word === "string" ? t.word.trim() : "",
      notes: clampNotes(t.notes),
      stance: clampStance(t.stance),
      strength: clampStrength(t.strength)
    });
  }
  out.sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name));
  return out;
}

/** Storage shape — drops the resolved/display-only fields. */
const toStored = list =>
  list.map(t => ({
    id: t.id,
    name: t.name,
    word: t.word ?? "",
    notes: clampNotes(t.notes),
    stance: clampStance(t.stance),
    strength: clampStrength(t.strength)
  }));

/**
 * `render: false` is load-bearing. A plain setFlag re-renders the actor sheet, which destroys the
 * injected Ties tab mid-edit (focus loss, and the tab deactivates). Callers repaint deliberately.
 */
export async function write(actor, list, { render = false } = {}) {
  if (!actor) return false;
  // Players reach this now. An update to an actor they don't own is refused by the server
  // anyway — catching it here turns a console stack trace into a quiet no-op.
  if (!actor.isOwner) return false;
  await actor.update(
    { [`flags.${MODULE}.${FLAG}`]: toStored(Array.isArray(list) ? list : []) },
    { render }
  );
  return true;
}

/**
 * Create or update one edge, and by default its mirror.
 * `word` describes what `actor` is to `targetActor`.
 *
 * `notes` is deliberately NOT mirrored: like `word`, it is written from one side's
 * point of view, and copying prose would leave two divergent copies of the same
 * paragraph the moment either side is edited. Pass `reverseNotes` to write the other
 * side too. Omitting notes entirely leaves whatever is already stored alone, so a
 * re-`setTie` to nudge a stance can't silently eat a paragraph.
 */
export async function setTie(actor, targetActor, { word = "", notes, stance = 0, strength = 3 } = {}, opts = {}) {
  if (!actor || !targetActor || actor.id === targetActor.id) return false;
  const { reciprocal = true, reverseWord = word, reverseStance = stance, reverseNotes } = opts;

  const upsert = async (from, to, w, st, nt) => {
    if (!from?.isOwner) return false; // a player's mirror lands on an actor they can't write
    const list = read(from);
    const prev = list.find(t => t.id === to.id);
    const kept = list.filter(t => t.id !== to.id);
    kept.push({
      id: to.id,
      name: to.name,
      word: w,
      notes: nt === undefined ? prev?.notes ?? "" : clampNotes(nt),
      stance: st,
      strength
    });
    return write(from, kept);
  };
  // Report what actually happened. Returning a flat `true` after silently skipping an
  // unwritable side would tell a caller the edge exists when it doesn't.
  const wrote = await upsert(actor, targetActor, word, stance, notes);
  const mirrored = reciprocal ? await upsert(targetActor, actor, reverseWord, reverseStance, reverseNotes) : false;
  return wrote || mirrored;
}

/** Set just the notes on an existing edge. No-op if the edge isn't there. */
export async function setNotes(actor, targetId, notes = "") {
  if (!actor || !targetId) return false;
  const list = read(actor);
  const entry = list.find(t => t.id === targetId);
  if (!entry) return false;
  entry.notes = clampNotes(notes);
  await write(actor, list);
  return true;
}

/** Remove an edge. `bothWays` also removes the mirror. */
export async function removeTie(actor, targetId, { bothWays = true } = {}) {
  if (!actor || !targetId) return false;
  const removed = await write(actor, read(actor).filter(t => t.id !== targetId));
  if (bothWays) {
    const other = game.actors?.get(targetId);
    const mirror = other?.isOwner ? read(other) : [];
    // only write if there is actually a mirror to remove — a no-op write still fires an update
    if (other && mirror.some(t => t.id === actor.id)) {
      await write(other, mirror.filter(t => t.id !== actor.id));
    }
  }
  return removed;
}

/**
 * Actors that could be tied to — everything except self and anything already tied.
 *
 * The permission filter is load-bearing now that players see this list. Foundry ships every
 * Actor document to every client regardless of permission (the sidebar merely hides them),
 * so an unfiltered dropdown would hand a player the name of every NPC in the world. A player
 * may only tie to someone they can already see; the GM sees everyone.
 */
export function candidates(actor) {
  const taken = new Set(read(actor).map(t => t.id));
  const isGM = game.user?.isGM === true;
  return (game.actors?.contents ?? [])
    .filter(a => a.id !== actor?.id && !taken.has(a.id))
    .filter(a => isGM || a.testUserPermission?.(game.user, "LIMITED") === true)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One-time move of pre-module data from flags.world.ties.
 * Copies, verifies, then clears the legacy key so there is only ever one source.
 */
export async function migrateLegacy() {
  if (!game.user?.isGM) return { moved: 0 };
  let moved = 0;
  for (const actor of game.actors?.contents ?? []) {
    const legacy = actor.flags?.[LEGACY_SCOPE]?.[FLAG];
    if (!Array.isArray(legacy) || !legacy.length) continue;
    const current = actor.flags?.[MODULE]?.[FLAG];
    if (!Array.isArray(current) || !current.length) {
      await actor.setFlag(MODULE, FLAG, toStored(legacy.filter(t => typeof t?.id === "string")));
      await actor.unsetFlag(LEGACY_SCOPE, FLAG);
      moved++;
    } else {
      // Module data already exists. Copying would clobber it and unsetting would destroy the
      // legacy rows, so do NEITHER — leave both in place and say so loudly.
      console.warn(
        `${MODULE} | ${actor.name}: legacy flags.${LEGACY_SCOPE}.${FLAG} left in place — ` +
          `module data already present. Merge by hand, then unsetFlag("${LEGACY_SCOPE}","${FLAG}").`
      );
    }
  }
  if (moved) console.log(`${MODULE} | migrated ties for ${moved} actor(s) from flags.${LEGACY_SCOPE}`);
  return { moved };
}
