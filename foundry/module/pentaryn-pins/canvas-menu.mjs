/**
 * Pentaryn Pins — FEATURE: the GM's right-click menu on empty canvas.
 *
 *   Prompt note                       pentaryn-prompts `place(null, { at })` — the P key's action at
 *                                     the clicked point (hidden when prompts is absent; P stays bound)
 *   Teleport pinned character ▸       the logged-in players; picking one runs `pins.teleport`, which
 *                                     moves the character with its summons and pets (portals teleportToken)
 *
 * Event placement (plan §3 "GM canvas menu"): a passive capture `pointerdown` on WINDOW, filtered to
 * `target === board`, records the right press with its snapshot (a mouse manager already live, core's
 * token/region placement). It must run before PIXI's own capture listener on #board, which claims the
 * stage's manager for every right press (`canvas.currentMouseManager` is set before any #board
 * listener added at canvasReady runs). A passive capture `pointermove` on window records how far the
 * press travelled, a passive capture `pointerup` on #board the release, and a bubble `contextmenu`
 * on #board's parent element, filtered to `target === board`. The portal badge's capture listener stops propagation on a badge,
 * so a badge right-click never reaches it. The menu opens once BOTH the contextmenu and the right
 * pointerup arrived (either order, `menuTrigger`), and only past every gate (`menuAllowed`):
 * right-drag pans, token right-clicks (the HUD), other layers and players are untouched.
 * Other modules are reached only through their published APIs.
 */

import { menuAllowed, menuTrigger, teleportChoices } from "./pins-core.mjs";
import { listOf, pinOfUser, tokensByRoots } from "./world-adapter.mjs";
import { closeMenu, isOpen, menuContains, openMenu } from "./menu-ui.mjs";
import { apiOf } from "./lib/publish.mjs";

const PROMPTS = "pentaryn-prompts";

let C = null;
/** The recorded right press: `{ down: { x, y, buttons, dragging, placing, travel }, seq }`; null when none. */
let rec = null;
let bound = null;

/**
 * A token the GM can see on the viewed level (hidden ones included: core shows them to a GM), or a
 * door control, under a canvas point. A token on another level, culled, filtered out or out of the
 * controlled token's sight is not drawn, so the GM sees empty floor there.
 */
function hitAt(pt) {
  const level = canvas.level?.id ?? null;
  for (const t of canvas.tokens?.placeables ?? []) {
    const onLevel = !level || !t.document?.level || t.document.level === level;
    // `visible` is core's last `isVisible` (PlaceableObject#_refreshVisibility); never read the
    // getter here: it clears the token's detection filter as a side effect
    if (!onLevel || t.visible === false) continue;
    if (t.bounds?.contains?.(pt.x, pt.y)) return true;
  }
  const half = 22 * (canvas.dimensions?.uiScale ?? 1);
  for (const w of canvas.walls?.placeables ?? []) {
    if (!w.isDoor || !w.doorControl || w.doorControl.visible === false) continue;
    const [mx, my] = w.midpoint ?? [NaN, NaN];
    if (Math.abs(pt.x - mx) <= half && Math.abs(pt.y - my) <= half) return true;
  }
  return false;
}

/** The submenu rows, from the live world. */
function choicesNow() {
  const users = listOf(game.users);
  const pinsByUser = Object.fromEntries(users.map(u => [u.id, pinOfUser(u)]));
  const byRoot = tokensByRoots(Object.values(pinsByUser));
  const tokenInfo = Object.fromEntries(Object.entries(byRoot).map(([root, cands]) =>
    [root, { name: game.actors.get(root)?.name ?? null, token: cands.length === 1 }]));
  return teleportChoices(users.map(u => ({ id: u.id, name: u.name, active: !!u.active, isGM: !!u.isGM })), pinsByUser, tokenInfo);
}

const REASON = Object.freeze({ NO_PIN: "PENTARYN_PINS.Menu.NoPin", NO_TOKEN: "PENTARYN_PINS.Menu.NoToken" });

async function teleportPick(choice, at) {
  const r = await C.api.teleport(choice.user, { x: at.x, y: at.y, scene: at.scene, level: at.level });
  if (r?.ok) {
    const n = r.followers?.length ?? 0;
    const scene = game.scenes.get(r.to?.scene)?.name ?? r.to?.scene ?? "";
    C.log.notify("info", _loc("PENTARYN_PINS.Notify.Teleported", { actor: r.token?.name ?? choice.label, more: n ? ` (+${n})` : "", scene }));
  } else {
    C.log.notify("warn", _loc("PENTARYN_PINS.Notify.TeleportFailed", { actor: choice.label, reason: r?.reason ?? r?.code ?? "?" }));
  }
  return r;
}

/** Build and open the menu for a click at client `release`, canvas point `pt`. */
function openAt(release, pt) {
  const at = { x: pt.x, y: pt.y, scene: canvas.scene?.id ?? null, level: canvas.level?.id ?? null };
  const items = [];
  const prompts = apiOf(PROMPTS);
  if (typeof prompts?.place === "function") {
    items.push({ icon: "fa-comment-dots", label: _loc("PENTARYN_PINS.Menu.PromptNote"),
      run: () => prompts.place(null, { at: { x: at.x, y: at.y } }) });
  }
  const choices = choicesNow();
  const sub = choices.length
    ? choices.map(c => ({ label: c.label, enabled: c.enabled, note: c.reason ? _loc(REASON[c.reason]) : null,
      run: () => teleportPick(c, at) }))
    : [{ label: _loc("PENTARYN_PINS.Menu.NoPlayers"), enabled: false }];
  items.push({ icon: "fa-person-walking-arrow-right", label: _loc("PENTARYN_PINS.Menu.Teleport"), sub });
  return openMenu({ x: release.x, y: release.y, items }, { onError: err => C.log.error("canvas menu", err) });
}

/** The sequence moved on: open, refuse, or keep waiting. */
function decide() {
  const r = menuTrigger(rec.seq);
  if (r.action === "wait") return;
  const { down, seq } = rec;
  rec = null;   // cleared after every decision, so a stale record never passes the gate later
  if (r.action === "reset") return;
  const release = r.release;
  const pt = canvas?.ready ? canvas.canvasCoordinatesFromClient?.({ x: release.x, y: release.y }) ?? null : null;
  const isGM = !!game.user?.isGM;
  const enabled = C.setting("pinning") === true;
  const tokensLayer = canvas?.tokens?.active === true;
  const allowed = menuAllowed({
    isGM, enabled,
    ready: !!canvas?.ready && !!pt,
    tokensLayer,
    onBoard: seq.some(e => e.type === "contextmenu" && e.onBoard),
    down, release,
    // review F4: the hit test walks the placeables; skip it when a cheap gate already says no
    hit: pt && isGM && enabled && tokensLayer ? hitAt(pt) : true,
  });
  if (allowed) openAt(release, pt);
}

/** Core's token or region placement is running (dnd5e summons use canvas.tokens.placeTokens). */
const placing = () => !!(canvas?.tokens?._placementContext || canvas?.regions?._placementContext);

/** Bind the board listeners once per board (`dataset.ppiBound`). */
function bind() {
  const board = document.getElementById?.("board");
  if (!board || board.dataset.ppiBound) return;
  board.dataset.ppiBound = "1";
  const parent = board.parentElement;
  const win = globalThis.window ?? document;
  const onDown = ev => {
    if (ev.target !== board) return;
    if (ev.button === 2) {
      rec = { down: { x: ev.clientX, y: ev.clientY, buttons: ev.buttons, dragging: canvas?.currentMouseManager != null,
        placing: placing(), travel: 0 },
      seq: [{ type: "down", button: 2, x: ev.clientX, y: ev.clientY }] };
      return;
    }
    if (!rec) return;
    rec.seq.push({ type: "down", button: ev.button });
    decide();
  };
  const onMove = ev => {
    if (!rec) return;
    const d = Math.hypot(ev.clientX - rec.down.x, ev.clientY - rec.down.y);
    if (d > rec.down.travel) rec.down.travel = d;
  };
  const onUp = ev => {
    if (ev.button !== 2 || !rec) return;
    rec.seq.push({ type: "up", button: 2, x: ev.clientX, y: ev.clientY });
    decide();
  };
  const onContext = ev => {
    if (!rec) return;
    rec.seq.push({ type: "contextmenu", onBoard: ev.target === board });
    decide();
  };
  const onOutside = ev => {
    if (!menuContains(ev.target)) closeMenu();
  };
  const onKey = ev => {
    // Escape dismisses the menu and nothing else: core's Dismiss keybinding (a window listener,
    // after this document capture one) would otherwise close every open window
    if (ev.key !== "Escape" || !isOpen()) return;
    closeMenu();
    ev.stopPropagation();
    ev.preventDefault();
  };
  win.addEventListener("pointerdown", onDown, { capture: true, passive: true });
  win.addEventListener("pointermove", onMove, { capture: true, passive: true });
  board.addEventListener("pointerup", onUp, { capture: true, passive: true });
  parent?.addEventListener("contextmenu", onContext);
  document.addEventListener("pointerdown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  bound = { win, board, parent, onDown, onMove, onUp, onContext, onOutside, onKey };
}

function unbind() {
  if (!bound) return;
  const { win, board, parent, onDown, onMove, onUp, onContext, onOutside, onKey } = bound;
  win.removeEventListener("pointerdown", onDown, { capture: true });
  win.removeEventListener("pointermove", onMove, { capture: true });
  board.removeEventListener("pointerup", onUp, { capture: true });
  parent?.removeEventListener("contextmenu", onContext);
  document.removeEventListener("pointerdown", onOutside, true);
  document.removeEventListener("keydown", onKey, true);
  delete board.dataset.ppiBound;
  bound = null;
}

export function install(reg, ctx) {
  C = ctx;
  reg.on("canvasReady", () => {
    if (game.user?.isGM && globalThis.document) bind();
  }, { label: "canvasReady: bind board" });
  reg.on("canvasTearDown", () => {
    closeMenu();
    rec = null;
  }, { label: "canvasTearDown: close menu" });
  // a wheel zoom, a keyboard pan or animatePan moves the map under the fixed menu, whose items act
  // on the point captured when it opened
  reg.on("canvasPan", () => {
    if (isOpen()) closeMenu();
  }, { label: "canvasPan: close menu" });
  // a hot re-import after ready: the board already exists
  if (globalThis.game?.ready && game.user?.isGM && globalThis.document && globalThis.canvas?.ready) bind();
}

export function uninstall() {
  closeMenu();
  unbind();
  rec = null;
}
