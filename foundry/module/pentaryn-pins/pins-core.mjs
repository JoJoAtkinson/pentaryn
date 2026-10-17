/**
 * Pentaryn Pins — PURE core: constants, the HOOKS table, and the rules.
 *
 * No Foundry global at runtime, so every rule here runs in node on plain fixtures. Glue files
 * import from here; nothing here imports glue. Design: context/plans/pin-2026-10.md §3, rebuilt on
 * core's own pull in 0.2.0 (context/plans/pin-2026-10-rebuild.md).
 *
 * Not `foundry/lib/pins.mjs` (journal Note pins): this module pins a CHARACTER to a PLAYER.
 */

export const MODULE = "pentaryn-pins";
export const SHORT = "pins";
export const NS = "pins";
export const VERSION = "0.2.0";                       // === module.json version (core.test pins it)
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
/**
 * The safety net waits this long (ms) after a delete of the pinned token on the viewed scene before
 * it looks: the mover's pull (portals, core's region) arrives after the delete broadcast.
 */
export const NET_GRACE_MS = 1500;
/** While the canvas is loading, pins re-checks this often (ms); no cap: every draw clears `loading`. */
export const NET_POLL_MS = 250;
/** core's #handleMovementOperation: a self move by one of these methods switches the view regardless. */
const SELF_SWITCH_METHODS = Object.freeze(["config", "hud", "dragging", "keyboard"]);

/** Events this module emits. */
export const HOOKS = Object.freeze({
  followed: Object.freeze({ name: "pentaryn-pins.followed", pre: false,
    args: "({ scene, level, reason: cut|level|retry })" }),
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
 *   0 → null · 1 → it · several → the only one on the viewed scene, else null (ambiguous: stock
 *   behaviour). One token id can live on two scenes for a moment (a keepId carry): the viewed
 *   scene decides then too.
 * @param {{ uuid: string, scene: string }[]} cands
 * @param {{ viewedSceneId?: string|null }} [opts]
 */
export function pickToken(cands, { viewedSceneId = null } = {}) {
  const list = Array.isArray(cands) ? cands : [];
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  if (viewedSceneId) {
    const here = list.filter(c => c.scene === viewedSceneId);
    if (here.length === 1) return here[0];
  }
  return null;
}

/**
 * The safety net's decision, after the grace window (rebuild plan §5.1): `none` (no target: off, a
 * GM, no pin, 0 or several tokens; or already on the token's scene and level), `wait` (a draw is
 * loading: check again when it ends) or `view` (the token is on another scene, or on another level
 * of the viewed scene: a GM copy-paste onto another floor, code review A1-3). A target with no
 * level (none, or an orphan id: levelOn) is matched by scene only.
 * @param {{ target: {scene: string, level?: string|null}|null, viewed: {scene: string|null, level: string|null},
 *   loading: boolean }} input
 * @returns {"none"|"wait"|"view"}
 */
export function netDecision({ target, viewed, loading = false }) {
  if (!target) return "none";
  if (loading) return "wait";
  if (target.scene !== (viewed?.scene ?? null)) return "view";
  if (target.level && target.level !== (viewed?.level ?? null)) return "view";
  return "none";
}

/**
 * Will core's own level switch move this (non-GM) client's view with one moved token? A copy of the
 * per-token test in TokenDocument.#handleMovementOperation (client/documents/token.mjs:2927-2946,
 * v14.369; adjustments core-pins-level-switch-rule): the client viewed the origin level, the token is
 * observable (not hidden, OBSERVER), and the user owns no other non-hidden token with sight on the
 * origin level — or moved it themselves by config, HUD, drag or keyboard.
 * @param {{ viewedLevel: string|null, origin: string|null, observes: boolean, ownsOtherSighted: boolean,
 *   selfMove?: boolean, method?: string|null }} input
 */
export function coreSwitchesLevel({ viewedLevel, origin, observes, ownsOtherSighted, selfMove = false, method = null }) {
  if (!viewedLevel || origin !== viewedLevel) return false;
  if (!observes) return false;
  return !ownsOtherSighted || (selfMove && SELF_SWITCH_METHODS.includes(method));
}

/**
 * Does pins move the view to the pinned token's new level (rebuild plan §5.2)? Only when core will
 * not (`core` from coreSwitchesLevel), so the two never both view: the moved token is the pin's
 * target, `to` is the target's (existing) level, and it is not the level already viewed.
 * @param {{ target: {token: {uuid: string}, level?: string|null}|null, tokenUuid: string, to: string|null,
 *   viewedLevel: string|null, core: boolean }} input
 */
export function levelFollow({ target, tokenUuid, to, viewedLevel = null, core = false }) {
  if (!target || core || !to) return false;
  if (target.token?.uuid !== tokenUuid || target.level !== to) return false;
  return viewedLevel !== to;
}

/**
 * Replay a `pullToScene` on this client (rebuild plan §5.3)? Only for a pinned player (switch on)
 * whose canvas is loading when it arrives: core's Scene#view drops that pull with its "cannot switch
 * Scenes" toast (scene.mjs:264-266). Not loading → core honours it, pins adds nothing.
 * @param {{ pinned: boolean, loading: boolean }} input
 */
export function replayDecision({ pinned, loading }) {
  return !!pinned && !!loading;
}

/**
 * The GM toast for a pinned character's token count (rebuild plan §6), de-duplicated against the
 * count last toasted for that root (`last`, null for none): 0 → `STRANDED`, more than 1 → `PAUSED`,
 * 1 → no toast and forget. The same count twice in a row toasts once.
 * @param {{ n: number, last?: number|null }} input
 * @returns {{ notice: "STRANDED"|"PAUSED"|null, last: number|null }}
 */
export function tokenNotice({ n, last = null }) {
  if (n === 1) return { notice: null, last: null };
  if (n === last) return { notice: null, last };
  return { notice: n === 0 ? "STRANDED" : "PAUSED", last: n };
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
