/**
 * Pentaryn Pins — FEATURE: the GM's right-click menu on empty canvas.
 *
 *   Prompt note                       pentaryn-prompts `place(null, { at })` — the P key's action at
 *                                     the clicked point (hidden when prompts is absent; P stays bound)
 *   Gather logged-in players here     `pins.gather` at the clicked point: every logged-in player's pinned
 *                                     character with its company (gather plan §4.3). Its note is the
 *                                     member count (disabled: "no one to gather"). One click; a dialog
 *                                     only when a cross-scene member is in a started combat (the move
 *                                     drops it from the tracker). Toasts: gathered, not gathered, failed
 *   Teleport pinned character ▸       the logged-in players; picking one runs `pins.teleport`, which
 *                                     moves the character with its summons and pets (portals teleportToken)
 *   Teleport single…                  (0.4.0) a dialog listing EVERY pinned character, its player and
 *                                     whether they are logged in; 0.4.1: a checkbox per row, tick one
 *                                     or many. Each tick runs the same `pins.teleport` to the clicked
 *                                     point, in list order (an offline player's character moves too,
 *                                     and lands there for them at login; portals' spreadArrivals
 *                                     steps a later arrival off an occupied square)
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

import { gatherPlan, menuAllowed, menuTrigger, singleChoices, teleportChoices } from "./pins-core.mjs";
import { gatherInputs, startedCombatTokens } from "./world-adapter.mjs";
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

/**
 * The menu's one read of the pin world (plan §4.3; code review G9): gatherInputs — the users, the
 * players' pins, their actors and ONE tokensByRoots walk — which both the Gather count (gatherPlan,
 * pure) and the Teleport ▸ rows read; nothing is read twice per right-click.
 */
const pinsNow = () => gatherInputs();

/** root id → `{ name, token, count }` for the rows, from the menu's one read. */
function tokenInfoOf({ actors, tokensByRoot }) {
  return Object.fromEntries(Object.entries(tokensByRoot).map(([root, cands]) =>
    [root, { name: actors[root]?.name ?? null, token: cands.length === 1, count: cands.length }]));
}

/** The Teleport ▸ submenu rows (logged-in players), from the menu's one read. */
function choicesNow(now) {
  return teleportChoices(now.users, now.pinsByUser, tokenInfoOf(now));
}

/** The Teleport single… rows (every pinned character), from the same read. */
function singlesNow(now) {
  return singleChoices(now.users, now.pinsByUser, tokenInfoOf(now));
}

const REASON = Object.freeze({ NO_PIN: "PENTARYN_PINS.Menu.NoPin", NO_TOKEN: "PENTARYN_PINS.Menu.NoToken", MANY_TOKENS: "PENTARYN_PINS.Menu.ManyTokens" });

/** A disabled row's note: "no token", or "{n} tokens" for several. */
const reasonText = c => (c.reason ? _loc(REASON[c.reason] ?? REASON.NO_TOKEN, { n: c.count ?? "" }) : null);

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

/**
 * "Teleport single…": a DialogV2 listing every pinned character with a checkbox each (0.4.1; 0.4.0 was a
 * dropdown). The GM ticks one or many and confirms; every tick goes through `teleportPick`, in list
 * order — the same `pins.teleport` call as a Teleport ▸ row, so the destination, the company rule and
 * the player's pull are the same (an offline player lands on the token's scene at login,
 * pentaryn-resume), and portals' spreadArrivals steps each later arrival off the square the first one
 * took. Names are escaped (blueprint §5.4). A cancelled or closed dialog, no tick, or only disabled
 * rows moves nothing and returns null; otherwise the teleport results, in order.
 */
export function pickedUsers(form) {
  // form.elements.user is one input, or a RadioNodeList when the list has several checkboxes
  const el = form?.elements?.user;
  if (!el) return [];
  const list = typeof el.length === "number" && !("checked" in el) ? Array.from(el) : [el];
  return list.filter(i => i?.checked && !i.disabled).map(i => i.value);
}

async function teleportSingle(singles, at) {
  const esc = foundry.utils.escapeHTML;
  const rows = singles.map(c => {
    const state = _loc(c.online ? "PENTARYN_PINS.Single.Online" : "PENTARYN_PINS.Single.Offline");
    const why = c.enabled ? "" : ` — ${reasonText(c)}`;
    return `<label class="ppi-check${c.enabled ? "" : " ppi-disabled"}">`
      + `<input type="checkbox" name="user" value="${esc(c.user)}"${c.enabled ? "" : " disabled"}>`
      + `<span>${esc(`${c.label} (${state})${why}`)}</span></label>`;
  }).join("");
  const content = `<p>${esc(_loc("PENTARYN_PINS.Single.Body"))}</p>`
    + `<div class="form-group stacked"><label>${esc(_loc("PENTARYN_PINS.Single.Label"))}</label>`
    + `<div class="form-fields ppi-checks">${rows}</div></div>`;
  let picked;
  try {
    picked = await foundry.applications.api.DialogV2.confirm({
      window: { title: _loc("PENTARYN_PINS.Single.Title"), icon: "fa-solid fa-person-walking-dashed-line-arrow-right" },
      classes: ["pentaryn-pins", "ppi-single"],
      content,
      yes: { label: _loc("PENTARYN_PINS.Single.Yes"), icon: "fa-solid fa-check", default: true,
        callback: (event, button) => pickedUsers(button?.form) },
      no: { label: _loc("PENTARYN_PINS.Single.No") },
      rejectClose: false,
    });
  } catch (err) {
    C.log.warn("teleport single dialog failed", err);
    return null;
  }
  const ids = Array.isArray(picked) ? picked : (typeof picked === "string" && picked ? [picked] : []);
  const choices = singles.filter(c => c.enabled && ids.includes(c.user));   // list order, disabled rows never move
  if (!choices.length) return null;
  const results = [];
  for (const choice of choices) results.push(await teleportPick(choice, at));
  return results;
}

/** Literal keys for a skipped gather member (the i18n gate proves each one); NO_PIN has its own. */
const SKIP_TEXT = Object.freeze({
  NO_PIN: "PENTARYN_PINS.Gather.NoPin",
  NO_ACTOR: "PENTARYN_PINS.Audit.NoActor",
  SHARED_ACTOR: "PENTARYN_PINS.Audit.SharedActor",
  NO_TOKEN: "PENTARYN_PINS.Audit.NoToken",
  MANY_TOKENS: "PENTARYN_PINS.Audit.ManyTokens",
});

/** A gathered row's character: the pinned actor's name, else its token's, else the player's. */
const actorName = row => row?.actor?.name ?? row?.token?.name ?? row?.user?.name ?? "?";
const userName = row => row?.user?.name ?? row?.user?.id ?? "?";

/** One "Not gathered" entry, worded as the switch-on audit words it, with the violation's own `detail` (G2). */
function skipLine(s) {
  return _loc(SKIP_TEXT[s.code] ?? SKIP_TEXT.NO_TOKEN, { user: userName(s), actor: s.actor?.name ?? s.actor?.id ?? "?", detail: s.detail ?? "" });
}

/** The skips with SHARED_ACTOR once per actor: its detail already names every co-pinned player (G2). */
function skipLines(skipped) {
  const shared = new Set();
  return skipped.filter(s => {
    if (s.code !== "SHARED_ACTOR") return true;
    const key = s.actor?.id ?? userName(s);
    if (shared.has(key)) return false;
    shared.add(key);
    return true;
  }).map(skipLine);
}

/** The GM's toasts after a gather (plan §4.3). Offline players are expected to stay: never toasted. */
function gatherToasts(r) {
  if (!r?.ok) return void C.log.notify("warn", _loc("PENTARYN_PINS.Notify.GatherFailed", { reason: r?.reason ?? r?.code ?? "?" }));
  const moved = r.moved ?? [];
  if (moved.length) {
    const scene = game.scenes.get(r.to?.scene)?.name ?? r.to?.scene ?? "";
    C.log.notify("info", _loc("PENTARYN_PINS.Notify.Gathered", { names: moved.map(actorName).join(", "), scene }));
  }
  const list = [
    ...skipLines(r.skipped ?? []),
    ...(r.failed ?? []).map(f => _loc("PENTARYN_PINS.Notify.TeleportFailed", { actor: actorName(f), reason: f.reason ?? f.code ?? "?" })),
  ];
  if (list.length) C.log.notify("warn", _loc("PENTARYN_PINS.Notify.GatherSkipped", { list: list.join(" · ") }));
  const blind = moved.filter(m => m.warnings?.includes("VIEW_UNCHANGED"));
  if (blind.length) C.log.notify("warn", _loc("PENTARYN_PINS.Notify.GatherViewUnchanged", { users: blind.map(userName).join(", ") }));
}

/** GM: go ahead although these characters leave the combat tracker? Names are escaped (blueprint §5.4). */
function confirmCombat(rows) {
  const esc = foundry.utils.escapeHTML;
  const names = rows.map(m => esc(actorName(m))).join(", ");
  return foundry.applications.api.DialogV2.confirm({
    window: { title: _loc("PENTARYN_PINS.Gather.CombatTitle"), icon: "fa-solid fa-people-group" },
    content: `<p>${_loc("PENTARYN_PINS.Gather.CombatBody", { names })}</p>`,
    yes: { label: _loc("PENTARYN_PINS.Gather.Yes"), icon: "fa-solid fa-check" },
    no: { label: _loc("PENTARYN_PINS.Gather.No") },
    rejectClose: false,
  }).then(v => v === true, err => {
    C.log.warn("gather confirm failed", err);
    return false;
  });
}

/**
 * The Gather click. No dialog, unless the cheap gate (a cross-scene member's source scene has a
 * started combat) holds: then a dry run says which members carry COMBAT, and the GM confirms those.
 */
async function gatherHere(plan, at) {
  const opts = { x: at.x, y: at.y, scene: at.scene, level: at.level };
  const fighting = startedCombatTokens();
  if (plan.members.some(m => !m.sameScene && fighting.has(m.token?.scene))) {
    const dry = await C.api.gather({ ...opts, dryRun: true });
    const marked = dry?.ok ? (dry.moved ?? []).filter(m => m.warnings?.includes("COMBAT")) : [];
    if (marked.length && !(await confirmCombat(marked))) return null;
  }
  const r = await C.api.gather(opts);
  gatherToasts(r);
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
  const now = pinsNow();
  const plan = gatherPlan(now, { destSceneId: at.scene, point: { x: at.x, y: at.y }, grid: canvas.grid?.size ?? canvas.dimensions?.size ?? 100 });
  const n = plan.members.length;
  items.push({ icon: "fa-people-group", label: _loc("PENTARYN_PINS.Menu.Gather"), enabled: n > 0,
    note: n ? _loc("PENTARYN_PINS.Menu.GatherCount", { n }) : _loc("PENTARYN_PINS.Menu.GatherNone"),
    run: () => gatherHere(plan, at) });
  const choices = choicesNow(now);
  const sub = choices.length
    ? choices.map(c => ({ label: c.label, enabled: c.enabled, note: reasonText(c),
      run: () => teleportPick(c, at) }))
    : [{ label: _loc("PENTARYN_PINS.Menu.NoPlayers"), enabled: false }];
  items.push({ icon: "fa-person-walking-arrow-right", label: _loc("PENTARYN_PINS.Menu.Teleport"), sub });
  // every pinned character, logged in or not: the note counts them ("no pinned characters" disables it)
  const singles = singlesNow(now);
  const k = singles.length;
  items.push({ icon: "fa-person-walking-dashed-line-arrow-right", label: _loc("PENTARYN_PINS.Menu.TeleportSingle"), enabled: k > 0,
    note: k ? _loc("PENTARYN_PINS.Menu.TeleportSingleCount", { n: k }) : _loc("PENTARYN_PINS.Menu.TeleportSingleNone"),
    run: () => teleportSingle(singles, at) });
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
