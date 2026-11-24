/**
 * Pentaryn Movement — the feature: the file, a group drag out of combat (0.9.0, plan
 * context/plans/pathfinding-2026-11.md §17; Fable's review 2 §2 "Tier B, the file"). drop.mjs asks it through
 * ctx.exposed at run time (never an import between two features).
 *
 * Which tokens move together: this client holds every group it sent until its members are at rest (read when asked,
 * no timers), and every client learns a group's members from the update option its move carries (GROUP_OPT), so a
 * click on one member stops them all (decision 3 as revised 2026-11-24).
 */

let log = null;
let feature = null;
/** The update option that names the group a move belongs to, so every client knows its members (decision 3). */
const GROUP_OPT = "pentarynMovementGroup";

/** Groups this client sent: id → { ids: Set, scene, at }. */
const groups = new Map();
const groupOf = new Map();                 // token id → group id
/** Every client: token id → { gid, at } from the update options of a group's moves. */
const tagOf = new Map();
/** How long a group names its members (ms): longer than any walk it sends. */
const HOLD_MS = 60000;
let stopped = null;                        // the last stop of a group (stop.mjs), for status()

/** The most members a group drag plans (more: core's own drop). */
const FILE_MAX = 12;

/** A moving token: drawn walking, or between two squares of its move. */
function movingNow(doc) {
  const t = doc?.object;
  let animating = false;
  try { animating = !!t && !t.destroyed && [...(t.animationContexts?.values?.() ?? [])].length > 0; } catch { animating = false; }
  const st = doc?.movement?.state;
  return animating || st === "pending" || st === "paused";
}

/** Hold the members of a group this client just sent. Returns the group's id. */
function holdGroup(ids, scene) {
  const gid = foundry.utils.randomID();
  for (const id of ids) {
    const old = groupOf.get(id);
    if (old && groups.get(old)) groups.get(old).ids.delete(id);
    groupOf.set(id, gid);
  }
  groups.set(gid, { ids: new Set(ids), scene, at: Date.now() });
  prune();
  return gid;
}

/** Drop groups whose members are all at rest, or older than HOLD_MS (no timers: read when asked). */
function prune() {
  const t = Date.now();
  for (const [gid, g] of groups) {
    const alive = t - g.at <= 1500 || [...g.ids].some(id => movingNow(g.scene?.tokens?.get?.(id)));
    if (alive && t - g.at <= HOLD_MS && g.ids.size) continue;
    for (const id of g.ids) if (groupOf.get(id) === gid) groupOf.delete(id);
    groups.delete(gid);
  }
}

/** How many groups this client holds now. */
function heldCount() { prune(); return groups.size; }

/**
 * Stop a group this client sent (click-to-stop): it is no longer held. Returns the ids of its members (the caller
 * stops those moving), or [] when this client holds no group for the token. `only` takes just that token out.
 */
function groupCancel(tokenId, { only = false } = {}) {
  const gid = groupOf.get(tokenId);
  const g = gid ? groups.get(gid) : null;
  if (!g) return [];
  if (only) { g.ids.delete(tokenId); groupOf.delete(tokenId); return [tokenId]; }
  const ids = [...g.ids];
  for (const id of ids) if (groupOf.get(id) === gid) groupOf.delete(id);
  groups.delete(gid);
  return ids;
}

/** A click (or the API) stopped a group (stop.mjs): recorded for status().group.stopped. */
function groupNoteStop({ why = "click", members = 0, whole = false } = {}) {
  stopped = { at: new Date().toISOString(), why, members, whole };
}
const stoppedLast = () => (stopped ? { ...stopped } : null);

/**
 * The members of the group a token moves with: `held` when this client sent the group, else the tokens every client
 * saw tagged with the same group lately. `{ held: false, ids: [] }` when it is in no group.
 */
function groupMembers(tokenId) {
  prune();
  const gid = groupOf.get(tokenId);
  const g = gid ? groups.get(gid) : null;
  if (g) return { held: true, ids: [...g.ids] };
  const tag = tagOf.get(tokenId);
  if (!tag || Date.now() - tag.at > HOLD_MS) return { held: false, ids: [] };
  const ids = [];
  for (const [id, t] of tagOf) if (t.gid === tag.gid && Date.now() - t.at <= HOLD_MS) ids.push(id);
  return { held: false, ids };
}

/** updateToken, every client: remember which group a move belongs to (its update option). */
function onGroupTag(doc, options) {
  const gid = options?.[GROUP_OPT];
  if (!doc?.id || typeof gid !== "string") return;
  tagOf.set(doc.id, { gid, at: Date.now() });
  if (tagOf.size > 500) tagOf.delete(tagOf.keys().next().value);
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  reg.on("updateToken", (doc, _changes, options) => onGroupTag(doc, options), { label: "updateToken: which group a move belongs to (click stops the group)" });
  ctx.expose({ groupCancel, groupMembers, groupNoteStop, groupHold: holdGroup, groupHeld: heldCount, groupStopped: stoppedLast,
    groupMax: () => FILE_MAX });
}

export function uninstall() {
  groups.clear();
  groupOf.clear();
  tagOf.clear();
  stopped = null;
  feature = null;
  log = null;
}
