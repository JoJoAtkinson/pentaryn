/**
 * Pentaryn NPC Ties — the Foundry adapter: the ties data layer (read, write, the mirror, the legacy
 * migration, the reach rule) and the canvas reads (canSee, inspectorFor, presentActorIds).
 *
 * ADAPTER. Imports only core and lib. Moved here from ties-api.mjs in S8 (ties-api.mjs is now a
 * one-release compat barrel), so api.mjs can import the data layer without importing another api file.
 *
 * ONE RULE: nothing in here throws. A malformed entry is dropped, a deleted actor degrades to a
 * greyed row, a missing field takes a default. The canvas overlay and the sheet tab both render
 * straight off `read()`, so a bad flag must never be able to break a sheet or a scene.
 *
 * Direction: an actor's array says what THAT ACTOR is to each person listed.
 *   Piet's array contains { id: <brellin>, word: "understudy" }
 *   → hovering Piet, the card over Brellin reads "understudy".
 */

import { stanceOf, clampStance, clampStrength, clampNotes, clampWord, FLAG, LEGACY_SCOPE, MODULE } from "./ties-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";

const log = makeLog(MODULE);

/** The five stance labels (literal keys; stanceOf always lands on one of them). */
const STANCE_LABEL = Object.freeze({
  devoted: "PENTARYN_TIES.stance.devoted",
  friendly: "PENTARYN_TIES.stance.friendly",
  neutral: "PENTARYN_TIES.stance.neutral",
  wary: "PENTARYN_TIES.stance.wary",
  hostile: "PENTARYN_TIES.stance.hostile"
});

/**
 * Can THIS client see that token? `Token#isVisible` is Foundry's own answer — walls, light,
 * detection modes and the GM-hidden flag folded together, per client. A GM sees everything.
 *
 * It is `isVisible`, NOT `visible`: on v14 `Token#visible` is the inherited PIXI flag and reads true
 * for every placeable on the scene, walled off and GM-hidden alike. `visible` is only the fallback
 * for an object that has no `isVisible` at all.
 *
 * @param {object|null} token  a Token placeable
 * @returns {boolean}
 */
export function canSee(token) {
  if (!token) return false;
  if (game.user?.isGM === true) return true;
  return (token.isVisible ?? token.visible) === true;
}

/**
 * Whose eyes are we looking through?
 *
 * A player inspects as their own character — they have exactly one, which is the case the ties
 * dialog already established as "easily resolved". A GM inspects as the **selected** token's
 * actor, so they can throw the check for whichever PC is asking without leaving the canvas.
 *
 * @returns {object|null} the inspecting character, or null
 */
export function inspectorFor() {
  if (game.user?.isGM) {
    const selected = canvas?.tokens?.controlled?.[0];
    const actor = selected?.actor ?? null;
    return actor?.type === "character" ? actor : null;
  }
  return game.user?.character ?? null;
}

export function stanceLabel(v) {
  const s = stanceOf(v);
  return _loc(STANCE_LABEL[s.key]);
}

/**
 * The world actor behind a token — NOT `token.actor`.
 *
 * ⚠ For an UNLINKED token `token.actor` is the synthetic delta actor, with its own id.
 * Ties written there land on the token's ActorDelta, where `read()` on the world actor will
 * never see them and a second token of the same creature gets a different list. Always
 * resolve through `actorId` — for a linked token this is the same document anyway.
 */
export function baseActorOf(token) {
  const id = token?.document?.actorId ?? token?.actorId ?? null;
  return id ? game.actors?.get(id) ?? null : null;
}

/**
 * Which actors are present on the current scene **as far as this user is concerned**.
 *
 * ⚠ This is a disclosure surface, not a convenience. Sorting a tie list into "here" and
 * "elsewhere" states out loud who is in the room — so for anyone but the GM it is filtered
 * through `Token#isVisible`, the same test the ties keys use, and the same one the renderer
 * used to decide whether to draw that token at all. A hidden token, or one behind a wall,
 * therefore falls into "elsewhere", which is exactly what a player would see if that person
 * genuinely were not there. **A character who is hiding must not be findable by opening a
 * ties sheet.**
 *
 * `isVisible`, not `visible`: on v14 `Token#visible` is the inherited PIXI flag and reads
 * true for every placeable on the scene, walled-off and GM-hidden alike.
 */
export function presentActorIds() {
  const isGM = game.user?.isGM === true;
  const ids = new Set();
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (!isGM && !token.isVisible) continue;
    const actor = baseActorOf(token);
    if (actor) ids.add(actor.id);
  }
  return ids;
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
      word: clampWord(t.word),
      notes: clampNotes(t.notes),
      stance: clampStance(t.stance),
      strength: clampStrength(t.strength)
    });
  }
  out.sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name));
  return out;
}

/**
 * Everyone who has recorded a tie pointing AT this actor — the inbound half of the graph.
 *
 * ## GM only, and gated here rather than in the UI
 *
 * A player's panel shows only rows their own actor authored. Inbound is the opposite: it is
 * other people's records, and showing it to a player would reveal the existence and the
 * names of actors they have never met — a disclosure the parent plan's three player rules
 * never had to cover, because until now a sheet only ever displayed what that actor wrote.
 *
 * The gate lives in this function, not in the renderer, so there is no UI path that can
 * leak it by forgetting to ask. **If you want a player to know about a connection, write it
 * onto their own character's sheet.**
 *
 * ## Why a scan, and not an index
 *
 * Foundry ships every Actor document to every client, so the whole graph is already in
 * memory before anyone asks. Measured in the live campaign — 136 actors, 196 edges — one
 * actor's inbound lookup costs **0.027 ms**, and building an index for the entire world
 * costs 0.115 ms. At a projected 20,000 actors a full index is ~17 ms, still less than
 * rendering the sheet it would sit on. A persisted reverse index would be a second copy of
 * the truth that can disagree with the first, bought for nothing.
 */
export function inbound(actor) {
  if (!actor || game.user?.isGM !== true) return [];
  const mine = new Set(read(actor).map(t => t.id));
  const out = [];
  for (const other of game.actors?.contents ?? []) {
    if (other.id === actor.id) continue;
    let raw;
    try {
      raw = other.getFlag(MODULE, FLAG);
    } catch {
      continue;
    }
    if (!Array.isArray(raw)) continue;
    for (const t of raw) {
      if (!t || typeof t !== "object" || t.id !== actor.id) continue;
      out.push({
        id: other.id,
        name: other.name,
        img: other.img ?? null,
        /*
         * Direction, and it is easy to get backwards: an actor's array says what THAT ACTOR
         * is to each person in it (parent plan §2). So this word — sitting on `other`'s
         * sheet, pointing at `actor` — is what **other is to actor**. Hovering Wat and
         * reading Harl's inbound row gives "potman": Harl is Wat's potman.
         */
        word: clampWord(t.word),
        notes: clampNotes(t.notes),
        stance: clampStance(t.stance),
        strength: clampStrength(t.strength),
        // does this actor point back at them? the pair is then two halves of one relationship
        mutual: mine.has(other.id)
      });
      break; // one row per actor; read() already de-duplicates on write
    }
  }
  out.sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name));
  return out;
}

/** Storage shape — drops the resolved/display-only fields. */
const toStored = list =>
  list.map(t => ({
    id: t.id,
    name: t.name,
    word: clampWord(t.word),
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
  try {
    await actor.update(
      { [`flags.${MODULE}.${FLAG}`]: toStored(Array.isArray(list) ? list : []) },
      { render }
    );
  } catch (err) {
    // A refused update (R8) — the server said no, or a preUpdate hook threw. Answer false, never throw.
    log.warn(`${actor.name}: ties write refused`, err);
    return false;
  }
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
 *
 * @deprecated Unused by the module (ties-42 — the dialog has its own pickers); kept one release
 * because ties-api.mjs has always exported it.
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
      // One actor's refusal (R8) is logged and the loop carries on with the rest.
      try {
        await actor.setFlag(MODULE, FLAG, toStored(legacy.filter(t => typeof t?.id === "string")));
        await actor.unsetFlag(LEGACY_SCOPE, FLAG);
        moved++;
      } catch (err) {
        log.warn(`${actor.name}: legacy ties migration refused — left for the next load`, err);
      }
    } else {
      // Module data already exists. Copying would clobber it and unsetting would destroy the
      // legacy rows, so do NEITHER — leave both in place and say so loudly.
      log.warn(
        `${actor.name}: legacy flags.${LEGACY_SCOPE}.${FLAG} left in place — ` +
          `module data already present. Merge by hand, then unsetFlag("${LEGACY_SCOPE}","${FLAG}").`
      );
    }
  }
  if (moved) console.log(`${MODULE} | migrated ties for ${moved} actor(s) from flags.${LEGACY_SCOPE}`);
  return { moved };
}

/**
 * **The one reach rule** — can this user legitimately ask about this actor?
 *
 * LIMITED permission, **or** a token of them on the active scene or the scene this user is viewing.
 *
 * ## Why it lives here and not in either caller
 *
 * There used to be two rules. The study conduit used this one; `relay.mjs` required LIMITED
 * alone — and phase 3's own comment predicted they would disagree. They did, demonstrated with
 * two live clients: a player could inspect an NPC, file them and study them, but **could not**
 * record a tie that NPC saw back, because players almost never hold LIMITED on NPCs. The relay
 * therefore nearly never fired.
 *
 * Two copies of a security rule is two chances to get it subtly wrong on a path nobody
 * re-audits, so there is now one definition and both halves import it.
 *
 * ⚠ This is deliberately NOT line of sight. Visibility is computed per-client and a GM's client
 * cannot derive what another player can see; this is what a GM *can* re-derive from documents it
 * holds itself. Ruled acceptable — the module defends against accidents and honest curiosity,
 * never against a determined player at a console.
 */
export function canReach(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  if (actor.testUserPermission(user, "LIMITED") === true) return true;
  /*
   * ⚠ The scene THE ASKING USER is viewing (`User#viewedScene`, a synced field), not the GM's
   * own `canvas.scene`. This runs on the GM's client, so `canvas.scene` was where the GM happened
   * to be looking — and a player pulled to (or testing on) any non-active scene had every closer
   * look refused silently: the stub card posted, then nothing rolled. Found by the 2026-10
   * usability run (Area 7 K2: Caven on a scratch scene, the GM bridge on another).
   */
  const viewed = user.viewedScene ? game.scenes?.get(user.viewedScene) : null;
  const scenes = [game.scenes?.active, viewed].filter(Boolean);
  for (const scene of scenes) {
    for (const token of scene.tokens ?? []) if (token.actorId === actor.id) return true;
  }
  return false;
}

/* -------------------------------------------- */
/*  The worn mark (token flags)                 */
/* -------------------------------------------- */

/** `flags.pentaryn-ties.worn` on a TOKEN document: `{ by, note }`. */
export const WORN_FLAG = "worn";
export const WORN_BY_MAX = 200;

/** Token placeable or TokenDocument in, TokenDocument out. */
export const docOf = token => token?.document ?? token ?? null;

/** The mark on a token, sanitised, or null. Never throws, never returns junk. */
export function readWorn(token) {
  const doc = docOf(token);
  if (!doc?.getFlag) return null;
  let raw;
  try {
    raw = doc.getFlag(MODULE, WORN_FLAG);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const by = typeof raw.by === "string" ? raw.by.trim().slice(0, WORN_BY_MAX) : "";
  const note = clampNotes(raw.note);
  if (!by && !note.trim()) return null;
  return { by, note };
}

/* -------------------------------------------- */
/*  Live windows (ties-40)                      */
/* -------------------------------------------- */

/** Debounce for live refreshes: a share or a cascade lands as several writes in a burst. */
export const LIVE_MS = 150;

/**
 * The live-refresh kit the Look window and the GM's inspect window share: a hook registry per open
 * window (registered on first render, all removed on close) and one debounce timer. Each window
 * keeps its own predicates — this only owns the plumbing they had each copied.
 */
export class LiveHooks {
  #reg = null;
  #timer = null;

  /** Register `[[hookName, fn], …]`; false when already watching. Raw handlers, as before. */
  start(hooks) {
    if (this.#reg) return false;
    this.#reg = hookRegistry(MODULE);
    for (const [name, fn] of hooks) this.#reg.on(name, fn, { guard: false, label: `live: ${name}` });
    return true;
  }

  /** Remove every hook and drop a pending refresh. */
  stop() {
    this.#reg?.offAll();
    this.#reg = null;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  get watching() {
    return this.#reg !== null;
  }

  /** Run `fn` once, `ms` after the last call in a burst. */
  debounce(fn, ms = LIVE_MS) {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      fn();
    }, ms);
  }
}

