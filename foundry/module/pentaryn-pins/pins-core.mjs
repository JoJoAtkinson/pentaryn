/**
 * Pentaryn Pins — PURE core: constants, the HOOKS table, and the rules.
 *
 * No Foundry global at runtime, so every rule here runs in node on plain fixtures. Glue files
 * import from here; nothing here imports glue. Design: context/plans/pin-2026-10.md §3.
 *
 * Not `foundry/lib/pins.mjs` (journal Note pins): this module pins a CHARACTER to a PLAYER.
 */

export const MODULE = "pentaryn-pins";
export const SHORT = "pins";
export const NS = "pins";
export const VERSION = "0.1.0";                       // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-pins/api@1";   // bump the major on a published-shape change
export const I18N = "PENTARYN_PINS";
export const CSS = "ppi-";
export const FLAG_SCOPE = MODULE;

/** The User flag (under FLAG_SCOPE) holding the pinned ROOT actor id. */
export const PIN_FLAG = "actor";

/**
 * A right press that travelled this far (px) from where it went down is a pan, never a menu: core's
 * MouseInteractionManager.DEFAULT_DRAG_RESISTANCE_PX (the board's manager sets no dragResistance),
 * so a press core does not pan always opens the menu and one it pans never does.
 */
export const MENU_SLOP = 10;
/** "Your view follows …" at most once per this many ms. */
export const TOAST_EVERY_MS = 10000;
/** The view queue polls canvas.loading this often (ms) … */
export const SETTLE_MS = 100;
/** … and gives up after this long (ms); the next canvasReady reconciles again. */
export const SETTLE_GIVE_UP_MS = 120000;

/** Events this module emits. */
export const HOOKS = Object.freeze({
  followed: Object.freeze({ name: "pentaryn-pins.followed", pre: false,
    args: "({ scene, level, reason: login|pull|move|reconcile|switch })" }),
  audited: Object.freeze({ name: "pentaryn-pins.audited", pre: false, args: "(result)" }),
});

/** Audit codes, in the order a pin is checked. `UNLINKED` and `NOT_OWNER` are warnings; the rest are problems. */
export const AUDIT_CODES = Object.freeze(["GM_USER", "NO_ACTOR", "SHARED_ACTOR", "NO_TOKEN", "MANY_TOKENS", "UNLINKED", "NOT_OWNER"]);

const ID = /^[A-Za-z0-9]{16}$/;
const isId = v => typeof v === "string" && ID.test(v);

/**
 * The pinned root actor id from a User's `flags` object, or null.
 * @param {*} flags  user.flags
 * @returns {string|null}
 */
export function pinOf(flags) {
  const v = flags?.[FLAG_SCOPE]?.[PIN_FLAG];
  return isId(v) ? v : null;
}

/**
 * Which of a pin's tokens a client follows.
 *   0 → null · 1 → it · several → the one created last this session (`latestUuid`: the transient
 *   state of a cross-scene move, matched by uuid because one token id can live on two scenes),
 *   else the only one on the viewed scene, else null (ambiguous: stock behaviour).
 * @param {{ uuid: string, scene: string }[]} cands
 * @param {{ latestUuid?: string|null, viewedSceneId?: string|null }} [opts]
 */
export function pickToken(cands, { latestUuid = null, viewedSceneId = null } = {}) {
  const list = Array.isArray(cands) ? cands : [];
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  if (latestUuid) {
    const latest = list.find(c => c.uuid === latestUuid);
    if (latest) return latest;
  }
  if (viewedSceneId) {
    const here = list.filter(c => c.scene === viewedSceneId);
    if (here.length === 1) return here[0];
  }
  return null;
}

/**
 * The `Scene#view` decision for this client. A pinned player follows the token's scene AND level;
 * the one exception is another level of that scene the player picked themselves (`chosen`: a nav
 * click, a level key, controlling a familiar). A level a GM pull, an activation or the login draw
 * asks for is not the player's choice: the token's level wins (code review 2026-10-17 #1).
 *   `stock`    — switch off, a GM, no pin or no single token: call core exactly as asked;
 *   `pass`     — the view is of the token's scene: call core at `level` (the asked level when
 *                `chosen`, else the token's; the asked one when the token has none);
 *   `redirect` — another scene: view `{ scene, level }` (the token's) instead.
 * @param {{ enabled: boolean, isGM: boolean, target: {scene: string, level: string|null}|null,
 *   sceneId: string, level?: string|null, chosen?: boolean }} input
 */
export function viewDecision({ enabled, isGM, target, sceneId, level = null, chosen = false }) {
  if (!enabled || isGM || !target) return { action: "stock" };
  if (target.scene === sceneId) {
    return { action: "pass", scene: sceneId, level: (chosen ? level : null) ?? target.level ?? level ?? null };
  }
  return { action: "redirect", scene: target.scene, level: target.level ?? null };
}

/** `draw` (a scene and level) already gives `want`: same scene, and the same level unless want names none. */
const covers = (draw, want) => draw.scene === want.scene && (want.level == null || want.level === (draw.level ?? null));

/**
 * The view queue: what to do with a wanted `{ scene, level }`.
 *   `none`  — already there, or a draw of it that pins started is under way;
 *   `view`  — call Scene#view now;
 *   `defer` — the canvas is loading: hold it until loading clears, then recompute.
 * A want with no level matches any level of its scene. `inflight` (a view pins let through that
 * has not resolved) counts whether or not `loading` is set yet: core sets `canvas.loading` only
 * inside its queued #draw, after an await, so a second view in the same tick would draw twice.
 * A draw pins did not start (a `canvas.draw`) is always waited out: pins does not know its scene
 * or level, and `viewed` is stale while it loads — core sets `canvas.loading` before it assigns
 * `canvas.scene` and `canvas.level` (board.mjs #draw; code review 2026-10-17 #2).
 * @param {{ loading: boolean, inflight: object|null, viewed: object|null, want: {scene: string, level?: string|null} }} input
 */
export function queueDecision({ loading, inflight = null, viewed = null, want }) {
  if (inflight) return covers(inflight, want) ? "none" : "defer";
  if (loading) return "defer";
  return viewed && covers(viewed, want) ? "none" : "view";
}

/**
 * Must this client's view move to the token (`canvasReady` and the settled queue)? Yes when the
 * viewed scene is not the token's, or the viewed level is not the token's and is not the level the
 * player chose themselves (`choice`, the `{ scene, level }` of their own last pass). A token with
 * no level is followed by scene only.
 * @param {{ target: {scene: string, level?: string|null}|null, viewed: {scene: string|null, level: string|null},
 *   choice?: {scene: string, level: string}|null }} input
 */
export function followNeeded({ target, viewed, choice = null }) {
  if (!target) return false;
  if (target.scene !== viewed?.scene) return true;
  if (target.level == null || viewed.level === target.level) return false;
  return !(choice && choice.scene === viewed.scene && choice.level === viewed.level);
}

/**
 * The `Scene#_onActivate` decision for this client: `skip` or `call`.
 * Skip an activation of a scene that is not the token's, and a deactivation of the viewed scene
 * when it is the token's (core would blank the canvas).
 * @param {{ enabled: boolean, isGM: boolean, target: {scene: string}|null, active: boolean,
 *   sceneId: string, viewedId: string|null }} input
 */
export function activateDecision({ enabled, isGM, target, active, sceneId, viewedId = null }) {
  if (!enabled || isGM || !target) return "call";
  if (active && sceneId !== target.scene) return "skip";
  if (!active && sceneId === viewedId && viewedId === target.scene) return "skip";
  return "call";
}

/**
 * The switch-on audit: each pinned actor has exactly one token across all scenes. A pin whose
 * player cannot observe the actor (`observes: false`) is a NOT_OWNER warning: the view follows a
 * token the player gets no vision from.
 * @param {{ pins: {user: string, actor: string, observes?: boolean}[], users: Record<string, {id, name, isGM}>,
 *   actors: Record<string, {id, name}>, tokensByRoot: Record<string, {id, scene, sceneName, linked}[]> }} input
 * @returns {{ ok: boolean, pins: number, violations: {code, level, user, actor, tokens, detail}[] }}
 */
export function auditPins({ pins = [], users = {}, actors = {}, tokensByRoot = {} } = {}) {
  const byActor = new Map();
  for (const p of pins) byActor.set(p.actor, [...(byActor.get(p.actor) ?? []), p.user]);
  const violations = [];
  const userRef = id => ({ id, name: users[id]?.name ?? null });
  for (const p of pins) {
    const actor = actors[p.actor] ? { id: p.actor, name: actors[p.actor].name ?? null } : { id: p.actor, name: null };
    const toks = (tokensByRoot[p.actor] ?? []).map(t => ({ id: t.id, scene: t.scene, sceneName: t.sceneName ?? null }));
    const add = (code, level, detail = null) => violations.push({ code, level, user: userRef(p.user), actor, tokens: toks, detail });
    if (users[p.user]?.isGM) add("GM_USER", "error");
    if (!actors[p.actor]) { add("NO_ACTOR", "error"); continue; }
    const sharers = byActor.get(p.actor) ?? [];
    if (sharers.length > 1) add("SHARED_ACTOR", "error", sharers.map(id => users[id]?.name ?? id).join(", "));
    if (toks.length === 0) add("NO_TOKEN", "error");
    else if (toks.length > 1) add("MANY_TOKENS", "error", toks.map(t => t.sceneName ?? t.scene).join(", "));
    if ((tokensByRoot[p.actor] ?? []).some(t => t.linked === false)) add("UNLINKED", "warn");
    if (p.observes === false && !users[p.user]?.isGM) add("NOT_OWNER", "warn");
  }
  return { ok: !violations.some(v => v.level === "error"), pins: pins.length, violations };
}

/**
 * What the GM's right-press sequence says: `open` (with the release point) once BOTH the
 * contextmenu and the right pointerup have arrived after the recorded right down, in either order
 * (Windows: up then contextmenu; macOS: contextmenu at mousedown, then up); `wait` with only one;
 * `reset` when any other button went down.
 * @param {{ type: "down"|"up"|"contextmenu", button?: number, x?: number, y?: number }[]} seq
 */
export function menuTrigger(seq) {
  const list = Array.isArray(seq) ? seq : [];
  if (list.some(e => e.type === "down" && e.button !== 2)) return { action: "reset" };
  const up = list.find(e => e.type === "up" && e.button === 2);
  const ctx = list.some(e => e.type === "contextmenu");
  if (up && ctx) return { action: "open", release: { x: up.x, y: up.y } };
  return { action: "wait" };
}

/**
 * Every gate for the GM canvas menu (plan §3 "Gate"). `down` is snapshotted before core sees the
 * press: `dragging` (a mouse manager already live), `placing` (core's token or region placement,
 * whose right click skips a preview) and `travel` (the farthest the pointer went while pressed:
 * a pan that comes back to its start is still a pan).
 * @param {{ isGM, enabled, ready, tokensLayer, onBoard,
 *   down: {x, y, buttons, dragging, placing?, travel?}|null, release: {x, y}|null, hit: boolean }} input
 */
export function menuAllowed({ isGM, enabled, ready, tokensLayer, onBoard, down = null, release = null, hit = false }) {
  if (!(isGM && enabled && ready && tokensLayer && onBoard)) return false;
  if (!down || !release || down.buttons !== 2 || down.dragging || down.placing) return false;
  const travel = Math.max(Number(down.travel) || 0, Math.hypot(release.x - down.x, release.y - down.y));
  if (travel >= MENU_SLOP) return false;
  return !hit;
}

/**
 * Where the menu goes so it and its submenu stay inside the window (Foundry's body clips overflow):
 * the menu is shifted inside, the submenu flips left (`flipX`) when it would cross the right edge
 * and there is more room on the left, and up (`flipY`, bottom-aligned to its row) when it would
 * cross the bottom.
 * @param {{ x, y, w, h, subW?, subH?, subTop?, vw, vh, margin? }} input  client px; `subTop` is the
 *   submenu row's offset inside the menu
 * @returns {{ left: number, top: number, flipX: boolean, flipY: boolean }}
 */
export function menuPlacement({ x, y, w, h, subW = 0, subH = 0, subTop = 0, vw, vh, margin = 4 }) {
  const left = Math.max(margin, Math.min(x, vw - w - margin));
  const top = Math.max(margin, Math.min(y, vh - h - margin));
  const flipX = left + w + subW > vw - margin && left > vw - (left + w);
  const flipY = top + subTop + subH > vh - margin;
  return { left, top, flipX, flipY };
}

/**
 * The "Teleport pinned character ▸" rows: logged-in players only, by name.
 * @param {{id, name, active, isGM}[]} users
 * @param {Record<string, string|null>} pinsByUser  userId → root actor id
 * @param {Record<string, {name: string|null, token: boolean}>} tokenInfo  root id → the actor's
 *   name and whether exactly one token resolves
 * @returns {{ user: string, label: string, enabled: boolean, reason: "NO_PIN"|"NO_TOKEN"|null }[]}
 */
export function teleportChoices(users = [], pinsByUser = {}, tokenInfo = {}) {
  return users
    .filter(u => u.active && !u.isGM)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map(u => {
      const root = pinsByUser[u.id] ?? null;
      if (!root) return { user: u.id, label: u.name, enabled: false, reason: "NO_PIN" };
      const info = tokenInfo[root];
      const label = info?.name ? `${u.name} — ${info.name}` : u.name;
      if (!info?.token) return { user: u.id, label, enabled: false, reason: "NO_TOKEN" };
      return { user: u.id, label, enabled: true, reason: null };
    });
}

/**
 * The player an actor (by its root id) is pinned to, for the sheet badge; null when none. A GM
 * carrying a pin flag (a promoted player: the audit's GM_USER) is not a pinned player.
 * @param {{id, name, pin: string|null, isGM?: boolean}[]} users
 */
export function pinnedName(users = [], rootId = null) {
  if (!rootId) return null;
  return users.find(u => u.pin === rootId && !u.isGM)?.name ?? null;
}
