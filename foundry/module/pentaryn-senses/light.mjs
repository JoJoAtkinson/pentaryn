/**
 * Light cantrip and lit items. Design and evidence: LIGHT-DESIGN.md (plan C4).
 *
 * The cantrip. The PHB Light spell is left as shipped; this recognises it at use time, stops its
 * floor-token summon, and asks "Where does the light go?" → On me · Pick a target · Not now.
 * The answer is written by the caster onto their own Light item:
 *
 *   item.flags["pentaryn-senses"].lightCast = { scene, token } | { scene, x, y } | null
 *
 * and the active GM reconciles: the token takes SPELL_LIGHT (its old light kept in
 * flags.pentaryn-senses.spellLight.prior), or an AmbientLight sits on the square. One light per
 * Light item, so casting again moves it. The same three buttons replace Summon on the spell card,
 * and End light sits on the Token HUD for the caster and the GM.
 *
 * Lit items. Torches, lamps, lanterns and candles carry flags.pentaryn-senses.lit, toggled by the
 * item's own "Light" activity (consumes nothing) or the flame button on the inventory row. The
 * carried-light path (carried.mjs) gives the carrier the glow.
 *
 * Every hook body is guarded: a bug logs `pentaryn-senses | light …` and never breaks a sheet,
 * a chat card or the HUD. A feature: the entry calls install(reg, ctx).
 */

import {
  MODULE, SPELL_LIGHT, profileFor, profileKey, isLit, isHooded, isLightSpellData, isLightToggle, lightingItemId,
  readSpellCast, readSpellLight, castFlag, planSpellLight, spellLightUpdate, restoredLight,
  sourcesUnder, isPHBLightActorSource, torchActivityData, TORCH_ACTIVITY_ID, PHB_LIGHT_ACTOR,
  collectSources, litByIn, esc, unsetPath
} from "./senses-core.mjs";
import { coreRollMode } from "./settings.mjs";
import { isActiveGM, isAnyGM } from "./lib/election.mjs";

const CAST = `flags.${MODULE}.lightCast`;
const LIT = `flags.${MODULE}.lit`;
const HOODED = `flags.${MODULE}.hooded`;
const SPELL = `flags.${MODULE}.spellLight`;
const DEBOUNCE_MS = 250;
const PICK_TIMEOUT_MS = 60_000;

const state = { hooks: [], timers: new Map(), chain: Promise.resolve(), picking: null, reg: null, ctx: null };

const warn = (label, err) => console.warn(`${MODULE} | light ${label}`, err);
const L = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** The live item behind an activity (dnd5e hands hooks a clone of the item). */
function realItem(item) {
  if (!item) return null;
  return item.actor?.items?.get(item.id) ?? fromUuidSync(item.uuid, { strict: false }) ?? item;
}

function itemFrom(uuid) {
  try {
    const doc = fromUuidSync(uuid, { strict: false });
    return doc?.documentName === "Item" ? doc : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------- */
/*  Casting (any client that owns the item)     */
/* -------------------------------------------- */

/**
 * Write where the light goes. `target` is {token: id} or {x, y}, on `target.scene` or the viewed
 * scene. The active GM does the rest; with no GM connected the flag waits for them.
 */
export async function cast(item, target) {
  item = realItem(item);
  if (!item || !target) return false;
  if (!item.isOwner) {
    ui.notifications.warn(L("PENTARYN_SENSES.Light.NotOwner", { name: item.actor?.name ?? item.name }));
    return false;
  }
  const flag = castFlag(target.scene ?? canvas?.scene?.id, target, Date.now());
  if (!flag) return false;
  await item.update({ [CAST]: flag });
  if (!game.users.activeGM) ui.notifications.warn(L("PENTARYN_SENSES.Light.NoGM"));
  else if (flag.token) {
    const tok = game.scenes.get(flag.scene)?.tokens.get(flag.token);
    // Never name a token whose nameplate this user can't see (crowd extras run displayName NONE).
    if (tok && canSeeName(tok)) ui.notifications.info(L("PENTARYN_SENSES.Light.OnToken", { name: tok.name }));
    else ui.notifications.info(L("PENTARYN_SENSES.Light.OnCreature"));
  } else ui.notifications.info(L("PENTARYN_SENSES.Light.OnSquare"));
  return true;
}

/** Would this user see the token's name on the map? GM and owners always; others only on HOVER / ALWAYS. */
function canSeeName(tok) {
  if (isAnyGM() || tok.isOwner) return true;
  const M = CONST.TOKEN_DISPLAY_MODES;
  return tok.displayName === M.HOVER || tok.displayName === M.ALWAYS;
}

/** Put the light out. The owner clears their item's flag; the GM can end any light. */
export async function end(item) {
  item = realItem(item);
  if (!item) return false;
  if (!item.isOwner) {
    ui.notifications.warn(L("PENTARYN_SENSES.Light.NotOwner", { name: item.actor?.name ?? item.name }));
    return false;
  }
  if (!readSpellCast(item) && !anyLitBy(item.uuid)) {
    ui.notifications.info(L("PENTARYN_SENSES.Light.NoneLit"));
    return false;
  }
  await item.update({ [CAST]: null });
  ui.notifications.info(L("PENTARYN_SENSES.Light.Ended"));
  return true;
}

/** The caster's token on the scene being viewed: a controlled one first. */
function casterToken(actor) {
  const scene = canvas?.scene;
  if (!actor || !scene) return null;
  if (actor.isToken) return actor.token?.parent === scene ? actor.token : null;
  const mine = scene.tokens.filter(t => t.actorId === actor.id);
  return mine.find(t => t.object?.controlled) ?? mine.find(t => t.actorLink) ?? mine[0] ?? null;
}

export async function onMe(item) {
  item = realItem(item);
  if (!canvas?.scene) return ui.notifications.warn(L("PENTARYN_SENSES.Light.NoScene"));
  const tok = casterToken(item?.actor);
  if (!tok) return ui.notifications.warn(L("PENTARYN_SENSES.Light.NoToken"));
  return cast(item, { scene: tok.parent.id, token: tok.id });
}

export async function pickAndCast(item) {
  const target = await pick();
  if (target) return cast(item, target);
  return false;
}

/** The "Where does the light go?" prompt, right after the cast. */
export async function prompt(item) {
  item = realItem(item);
  if (!item?.isOwner) return;
  const DialogV2 = foundry.applications.api.DialogV2;
  const choice = await DialogV2.wait({
    window: { title: L("PENTARYN_SENSES.Light.Title"), icon: "fa-solid fa-lightbulb" },
    content: `<p>${esc(L("PENTARYN_SENSES.Light.Where"))}</p>`,
    buttons: [
      { action: "me", label: L("PENTARYN_SENSES.Light.OnMe"), icon: "fa-solid fa-user", default: true },
      { action: "pick", label: L("PENTARYN_SENSES.Light.Pick"), icon: "fa-solid fa-crosshairs" },
      { action: "cancel", label: L("PENTARYN_SENSES.Light.NotNow"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (choice === "me") return onMe(item);
  if (choice === "pick") return pickAndCast(item);
}

/* -------------------------------------------- */
/*  The picker                                  */
/* -------------------------------------------- */

/**
 * The top-most token a player can see under a canvas point, else that square's centre.
 * A pentaryn-aoe area handle is not a creature (it sits at every area's centre and dies with the
 * area): clicking it lights the square.
 */
function hitAt(p) {
  const hits = (canvas.tokens?.placeables ?? []).filter(t => t.visible && t.bounds?.contains(p.x, p.y)
    && !t.document?.flags?.["pentaryn-aoe"]?.handle);
  hits.sort((a, b) => ((a.document.elevation ?? 0) - (b.document.elevation ?? 0)) || ((a.document.sort ?? 0) - (b.document.sort ?? 0)));
  const top = hits.at(-1);
  if (top) return { scene: canvas.scene.id, token: top.document.id };
  const c = canvas.grid?.getCenterPoint?.(p) ?? p;
  return { scene: canvas.scene.id, x: Math.round(c.x), y: Math.round(c.y) };
}

/**
 * Click a token or a square. → {scene, token} | {scene, x, y} | null (right-click, Esc, 60 s, or the
 * scene changing). Listens in the capture phase on window so the token layer never sees the click.
 */
export function pick() {
  if (!canvas?.ready || !canvas.scene) {
    ui.notifications.warn(L("PENTARYN_SENSES.Light.NoScene"));
    return Promise.resolve(null);
  }
  state.picking?.cancel();
  // An open Combat HUD panel (Cast Spell) covers the map; the pick click landed on a spell behind
  // it (usability Area 6 re-run, W10). Close Argon's panels first, as Argon does for another panel.
  try { ui.ARGON?.collapseAllPanels?.(); } catch (e) { warn("collapse HUD panels", e); }
  const view = canvas.app?.view ?? canvas.app?.canvas;
  return new Promise(resolve => {
    let done = false;
    const swallow = ev => { if (ev.target === view) { ev.stopImmediatePropagation(); ev.preventDefault(); } };
    const swallowOnce = (type) => {
      const fn = ev => { swallow(ev); window.removeEventListener(type, fn, true); };
      window.addEventListener(type, fn, true);
      setTimeout(() => window.removeEventListener(type, fn, true), 800);
    };
    const finish = (result) => {
      if (done) return;
      done = true;
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      view?.classList.remove("ps-picking");
      document.body.classList.remove("ps-picking");
      clearTimeout(timer);
      try {
        if (note) (note.remove ? note.remove() : ui.notifications.remove(note));
      } catch (e) {
        warn("pick note", e);
      }
      if (state.picking === handle) state.picking = null;
      resolve(result);
    };
    const onDown = ev => {
      if (ev.target !== view) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      swallowOnce("pointerup");
      if (ev.button === 2) {
        swallowOnce("contextmenu");
        return finish(null);
      }
      if (ev.button !== 0) return;
      try {
        finish(hitAt(canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY })));
      } catch (e) {
        warn("pick", e);
        finish(null);
      }
    };
    const onKey = ev => {
      if (ev.key !== "Escape") return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      finish(null);
    };
    const handle = { cancel: () => finish(null) };
    state.picking = handle;
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    view?.classList.add("ps-picking");
    document.body.classList.add("ps-picking");
    const note = ui.notifications.info(L("PENTARYN_SENSES.Light.PickHint"), { permanent: true });
    const timer = setTimeout(() => finish(null), PICK_TIMEOUT_MS);
  });
}

/* -------------------------------------------- */
/*  Lit items                                   */
/* -------------------------------------------- */

/** Light or douse a torch, lamp, lantern or candle. One chat line; nothing consumed. */
export async function toggle(item) {
  item = realItem(item);
  if (!item || !profileFor(item)) return false;
  if (!item.isOwner) {
    ui.notifications.warn(L("PENTARYN_SENSES.Light.NotOwner", { name: item.actor?.name ?? item.name }));
    return false;
  }
  const lit = !isLit(item);
  await item.update(lit ? { [LIT]: true } : { [LIT]: false, [HOODED]: false });
  await announce(item, lit ? "PENTARYN_SENSES.Light.Lights" : "PENTARYN_SENSES.Light.Douses");
  return lit;
}

/** One chat line about a carried light, "{actor} lights the {item}." */
async function announce(item, key) {
  const actor = item.actor;
  const text = L(key, { actor: esc(actor?.name ?? ""), item: esc(item.name) });
  try {
    // The chat mode the user picked applies, as on dnd5e's own cards: a GM on "GM only" lighting a
    // hidden NPC's lantern must not announce it to the table.
    const data = { speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${text}</p>` };
    if (typeof ChatMessage.applyMode === "function") ChatMessage.applyMode(data);
    else ChatMessage.applyRollMode(data, coreRollMode());
    await ChatMessage.create(data);
  } catch (e) {
    warn("chat", e);
  }
}

/** Lower or raise a hooded lantern's hood (bright 0 / dim 5 while lowered). */
export async function hood(item) {
  item = realItem(item);
  if (!item?.isOwner || !profileFor(item)?.hooded) return false;
  const hooded = !isHooded(item);
  await item.update({ [HOODED]: hooded });
  // The table hears the hood too (usability Area 8, L5: lowering it posted nothing).
  await announce(item, hooded ? "PENTARYN_SENSES.Light.HoodLowered" : "PENTARYN_SENSES.Light.HoodRaised");
  return hooded;
}

/**
 * GM, idempotent: give every Torch (world items, actors, unlinked tokens) a "Light" activity that
 * toggles it. Lamps, lanterns and candles already have one. → number of torches changed.
 */
export async function setup() {
  if (!isAnyGM()) {
    ui.notifications.warn("pentaryn-senses: setupLight is GM-only.");
    return 0;
  }
  let n = 0;
  for (const item of allItems({ worldItems: true })) {
    if (await ensureTorchActivity(item)) n++;
  }
  console.info(`${MODULE} | setupLight: ${n} torch item(s) given a Light activity`);
  return n;
}

/** One torch item: add the Light activity if it has none. → true when it was added. */
async function ensureTorchActivity(item) {
  if (profileKey(item) !== "torch" || !item?.system?.activities) return false;
  const has = item.system.activities.has?.(TORCH_ACTIVITY_ID)
    || [...item.system.activities.values()].some(a => a?.flags?.[MODULE]?.lightToggle === true);
  if (has) return false;
  try {
    const data = torchActivityData(L("PENTARYN_SENSES.Light.ActivityName"));
    const sort = item.system.activities.size
      ? Math.max(...[...item.system.activities.values()].map(a => a.sort ?? 0)) + CONST.SORT_INTEGER_DENSITY
      : 0;
    await item.update({ [`system.activities.${TORCH_ACTIVITY_ID}`]: { ...data, sort } });
    return true;
  } catch (e) {
    warn(`setup ${item.uuid}`, e);
    return false;
  }
}

/* -------------------------------------------- */
/*  GM reconcile                                */
/* -------------------------------------------- */

/** Every item the GM can reach: world actors', unlinked tokens' synthetic actors', world items. */
function allItems({ worldItems = false } = {}) {
  const out = [];
  for (const a of game.actors ?? []) out.push(...a.items);
  for (const s of game.scenes ?? []) for (const t of s.tokens) {
    if (!t.actorLink && t.actor) out.push(...t.actor.items);
  }
  if (worldItems) out.push(...(game.items ?? []));
  return out;
}

/** Every Token and AmbientLight on every scene lit by this source. */
const litBy = source => litByIn(game.scenes ?? [], source);
const anyLitBy = source => litBy(source).length > 0;

const allSources = () => collectSources(game.scenes ?? []);

function findToken(id, hint) {
  const first = game.scenes.get(hint)?.tokens.get(id);
  if (first) return first;
  for (const s of game.scenes) {
    const t = s.tokens.get(id);
    if (t) return t;
  }
  return null;
}

async function tellOwners(item, key) {
  try {
    const whisper = game.users.filter(u => item.testUserPermission(u, "OWNER")).map(u => u.id);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: item.actor }),
      content: `<p>${esc(L(key))}</p>`,
      whisper
    });
  } catch (e) {
    warn("whisper", e);
  }
}

/** Bring the world in line with one Light item's flag (or clean up after a vanished item). */
async function reconcile(source) {
  if (!isActiveGM() || !source) return;
  const item = itemFrom(source);
  let desired = item ? readSpellCast(item) : null;

  if (desired?.token) {
    const tok = findToken(desired.token, desired.scene);
    if (!tok) {
      desired = null;
      await item.update({ [CAST]: null });
      await tellOwners(item, "PENTARYN_SENSES.Light.Gone");
    } else if (tok.parent.id !== desired.scene) {
      desired = { ...desired, scene: tok.parent.id };
      await item.update({ [`${CAST}.scene`]: tok.parent.id }); // moved scenes (portals): correct silently
    }
  } else if (desired && !game.scenes.get(desired.scene)) {
    desired = null;
    await item.update({ [CAST]: null });
  }

  const existing = litBy(source);
  const plan = planSpellLight({ desired, existing });

  // Lights that are no longer wanted.
  const byScene = new Map();
  for (const r of plan.restore) {
    const t = game.scenes.get(r.scene)?.tokens.get(r.id);
    if (!t) continue;
    if (!byScene.has(r.scene)) byScene.set(r.scene, []);
    byScene.get(r.scene).push({ _id: t.id, light: restoredLight(t), ...unsetPath(SPELL) });
  }
  const touchedActors = new Set();
  for (const [sid, updates] of byScene) {
    const scene = game.scenes.get(sid);
    await scene.updateEmbeddedDocuments("Token", updates);
    for (const u of updates) { const a = scene.tokens.get(u._id)?.actor; if (a) touchedActors.add(a); }
  }
  const removeByScene = new Map();
  for (const r of plan.remove) {
    if (!removeByScene.has(r.scene)) removeByScene.set(r.scene, []);
    removeByScene.get(r.scene).push(r.id);
  }
  for (const [sid, ids] of removeByScene) {
    const scene = game.scenes.get(sid);
    const live = ids.filter(id => scene?.lights.has(id));
    if (live.length) await scene.deleteEmbeddedDocuments("AmbientLight", live);
  }

  // The light that is wanted.
  if (plan.light) {
    const tok = game.scenes.get(plan.light.scene)?.tokens.get(plan.light.token);
    if (tok) {
      const other = readSpellLight(tok)?.source;
      await tok.update(spellLightUpdate(tok, source, tok.light?.toObject?.() ?? tok.light));
      // Two casters, one token: newest wins; the first caster's Light lets go.
      if (other && other !== source) {
        const prev = itemFrom(other);
        if (readSpellCast(prev)?.token === tok.id) await prev.update({ [CAST]: null });
      }
    }
  }
  if (plan.create) {
    const scene = game.scenes.get(plan.create.scene);
    if (scene) await scene.createEmbeddedDocuments("AmbientLight", [{
      x: plan.create.x, y: plan.create.y, elevation: 0, walls: true, vision: false,
      config: foundry.utils.deepClone(SPELL_LIGHT),
      flags: { [MODULE]: { spellLight: { source } } }
    }]);
  }

  // A restored token may carry a lit torch: let the carried-light path re-apply it.
  const syncLight = state.ctx?.exposed?.syncLight;
  // Always the base actor: syncLight walks its tokens and reads each unlinked one's own items.
  if (syncLight) for (const id of new Set([...touchedActors].map(a => a.id))) {
    const base = game.actors.get(id);
    if (base) await syncLight(base);
  }
}

/** Queue a reconcile. Bursts coalesce per source; runs are serial so two never interleave. */
function queue(source) {
  if (!source || !isActiveGM()) return;
  clearTimeout(state.timers.get(source));
  state.timers.set(source, setTimeout(() => {
    state.timers.delete(source);
    run(source);
  }, DEBOUNCE_MS));
}

function run(source) {
  state.chain = state.chain.then(() => reconcile(source)).catch(e => warn(`reconcile ${source}`, e));
  return state.chain;
}

/**
 * GM, at ready (after the carried-light sweep): reconcile every Light item with a flag and every
 * spell light on any scene (an orphan whose item is gone is put out), then remove the old PHB
 * floor-token summons. Idempotent. → {sources, removed}.
 */
export async function sweep() {
  if (!isActiveGM()) return { sources: 0, removed: 0 };
  const sources = allSources();
  for (const item of allItems()) if (readSpellCast(item)) sources.add(item.uuid);
  for (const s of sources) run(s);
  await state.chain;
  const removed = await tidyOldSummons();
  return { sources: sources.size, removed };
}

/** The floor tokens the PHB Light summon left before this module (10-08). */
async function tidyOldSummons() {
  let removed = 0;
  for (const scene of game.scenes) {
    const ids = [];
    for (const t of scene.tokens) {
      const origin = t.actor?.getFlag?.("dnd5e", "summon.origin");
      if (!origin) continue;
      let from = null;
      try {
        from = fromUuidSync(origin, { strict: false });
      } catch { /* unresolvable */ }
      const spell = from?.documentName === "Item" ? from : from?.item ?? null;
      const base = game.actors.get(t.actorId);
      const phb = isPHBLightActorSource(base?._stats?.compendiumSource) || isPHBLightActorSource(base?.flags?.core?.sourceId);
      if (isLightSpellData(spell) || phb) ids.push(t.id);
    }
    if (ids.length) {
      console.info(`${MODULE} | light: removing ${ids.length} old Light summon token(s) on ${scene.name}`, ids);
      await scene.deleteEmbeddedDocuments("Token", ids);
      removed += ids.length;
    }
  }
  return removed;
}

/* -------------------------------------------- */
/*  The spell card                              */
/* -------------------------------------------- */

/** An action-row entry shaped like dnd5e 6's own (templates/chat/parts/card-buttons.hbs). */
function cardButton(icon, label, act) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon";
  b.dataset.psLight = act;
  b.dataset.tooltip = label;
  b.setAttribute("aria-label", label);
  b.innerHTML = `<i class="${icon}" inert></i>`;
  li.append(b);
  return li;
}

/** The card's action row (`section.icon-row` holding a plain `ul.unlist`, not the pill rows). */
function actionList(root) {
  for (const ul of root.querySelectorAll("section.icon-row > ul.unlist")) {
    if (!ul.classList.contains("pills")) return ul;
  }
  return null;
}

function decorateCard(message, html) {
  if (!message || message.type !== "usage") return;
  const uuid = message.system?.item?.uuid;
  if (!uuid) return;
  const item = itemFrom(uuid);
  if (!isLightSpellData(item)) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  // The PHB Light's summon button (not groupable, so it keeps data-action): drop it with its <li>.
  root.querySelectorAll('[data-action="placeSummons"]').forEach(b => (b.closest("li") ?? b).remove());
  let list = actionList(root);
  if (list && !list.children.length) {
    list.closest("section.icon-row")?.remove();
    list = null;
  }
  if (!item.isOwner) return;
  if (!list) {
    const content = root.querySelector(".chat-card") ?? root.querySelector(".message-content");
    if (!content) return;
    const section = document.createElement("section");
    section.className = "icon-row";
    const lead = document.createElement("i");
    lead.className = "fa-solid fa-fw fa-circle-play";
    lead.setAttribute("aria-label", L("DND5E.CHATMESSAGE.Row.Actions"));
    list = document.createElement("ul");
    list.className = "unlist";
    section.append(lead, list);
    content.append(section);
  }
  if (list.querySelector("[data-ps-light]")) return;
  const row = [
    cardButton("fa-solid fa-user", L("PENTARYN_SENSES.Light.OnMe"), "me"),
    cardButton("fa-solid fa-crosshairs", L("PENTARYN_SENSES.Light.Pick"), "pick"),
    cardButton("fa-solid fa-lightbulb-slash", L("PENTARYN_SENSES.Light.End"), "end")
  ];
  for (const li of row) {
    const b = li.firstElementChild;
    b.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const live = itemFrom(uuid);
      if (!live) return;
      const act = b.dataset.psLight;
      const p = act === "me" ? onMe(live) : act === "pick" ? pickAndCast(live) : end(live);
      Promise.resolve(p).catch(e => warn(`card ${act}`, e));
    });
    list.append(li);
  }
}

/* -------------------------------------------- */
/*  Inventory row: flame (and hood)             */
/* -------------------------------------------- */

function rowButton(cls, icon, tip, disabled, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `unbutton config-button item-control ${cls}`;
  b.dataset.tooltip = tip;
  b.setAttribute("aria-label", tip);
  b.innerHTML = `<i class="${icon}" inert></i>`;
  if (disabled) b.setAttribute("aria-disabled", "true");
  b.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (disabled) return;
    Promise.resolve(onClick()).catch(e => warn("row button", e));
  });
  return b;
}

function decorateSheet(app, element) {
  const actor = app?.actor ?? app?.document;
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!actor?.items || !root) return;
  // With two lights lit only the strongest shows on the token; the other flame is drawn dimmer and
  // says so (usability Area 8, L5: torch + hooded lantern, the hood seemed to do nothing).
  const lighting = lightingItemId(actor.items);
  for (const li of root.querySelectorAll("li[data-item-id]")) {
    const item = actor.items.get(li.dataset.itemId);
    if (!item || !profileFor(item)) continue;
    const row = li.querySelector(":scope > .item-row") ?? li;
    const name = row.querySelector(":scope > .item-name");
    if (!name || row.querySelector(":scope > .ps-light-controls")) continue;
    const lit = isLit(item);
    const locked = !item.isOwner;
    const cell = document.createElement("div");
    cell.className = "ps-light-controls";
    const winner = lit && lighting && lighting !== item.id ? actor.items.get(lighting) : null;
    const tip = winner ? L("PENTARYN_SENSES.Light.Outshone", { item: esc(winner.name) })
      : L(lit ? "PENTARYN_SENSES.Light.Douse" : "PENTARYN_SENSES.Light.LightIt");
    cell.append(rowButton(`ps-light-toggle${lit ? " lit" : ""}${winner ? " outshone" : ""}`, "fa-solid fa-fire",
      tip, locked, () => toggle(item)));
    if (lit && profileFor(item)?.hooded) {
      const hooded = isHooded(item);
      cell.append(rowButton(`ps-light-hood${hooded ? " hooded" : ""}`, hooded ? "fa-solid fa-eye" : "fa-solid fa-eye-slash",
        L(hooded ? "PENTARYN_SENSES.Light.HoodRaise" : "PENTARYN_SENSES.Light.HoodLower"), locked, () => hood(item)));
    }
    name.after(cell);
  }
}

/* -------------------------------------------- */
/*  Token HUD: End light                        */
/* -------------------------------------------- */

function injectHUD(app, element) {
  const doc = app?.object?.document ?? app?.document ?? null;
  const sl = readSpellLight(doc);
  if (!sl) return;
  const item = itemFrom(sl.source);
  if (!isAnyGM() && !item?.isOwner) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const col = root?.querySelector(".col.right") ?? root?.querySelector(".right");
  if (!col || col.querySelector(".ps-light-end")) return;
  const tip = L("PENTARYN_SENSES.Light.End");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon ps-light-end";
  btn.dataset.tooltip = tip;
  btn.setAttribute("aria-label", tip);
  btn.innerHTML = `<i class="fa-solid fa-lightbulb-slash"></i>`;
  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    (async () => {
      if (item?.isOwner) await end(item);
      else if (isAnyGM()) run(sl.source); // the item is gone: put the orphan out
      app.render?.();
    })().catch(e => warn("hud click", e));
  });
  col.appendChild(btn);
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** reg.on with the body guarded: a throw logs `pentaryn-senses | light <name>` at warn and becomes
 *  `undefined`; any other return value is passed through (dnd5e.preUseActivity reads `false`). */
function on(name, fn) {
  state.hooks.push(state.reg.on(name, fn, { guard: "warn", label: `light ${name}` }));
}

function onUse(activity, usageConfig) {
  const item = activity?.item;
  if (!item) return;
  if (isLightSpellData(item)) {
    if (usageConfig?.create && typeof usageConfig.create === "object") usageConfig.create.summons = false;
    return; // never false: the card must still post
  }
  if (isLightToggle(activity, item)) {
    toggle(item).catch(e => warn("toggle", e));
    return false; // no consumption: the PHB activities would burn the lantern's one use
  }
}

function onUsed(activity) {
  const item = activity?.item;
  if (!isLightSpellData(item)) return;
  prompt(item).catch(e => warn("prompt", e));
}

export function uninstall() {
  for (const id of state.hooks.splice(0)) state.reg?.off(id);
  for (const t of state.timers.values()) clearTimeout(t);
  state.timers.clear();
  state.picking?.cancel();
}

export const api = {
  cast, end, pick, toggle, hood, profileFor, sweep, setup, onMe,
  prompt, reconcile: run, uninstall, SPELL_LIGHT, PHB_LIGHT_ACTOR
};

/** FEATURE: called synchronously by the entry, at import. The hooks keep today's order. */
export function install(reg, ctx) {
  state.reg = reg;
  state.ctx = ctx;
  ctx.expose({ lightApi: api });

  on("dnd5e.preUseActivity", onUse);
  on("dnd5e.postUseActivity", onUsed);
  on("dnd5e.renderChatMessage", decorateCard);
  on("renderBaseActorSheet", decorateSheet);
  on("renderTokenHUD", injectHUD);
  on("canvasTearDown", () => state.picking?.cancel());

  // A Torch that arrives after setupLight (bought, looted, dragged from a compendium) gets its
  // Light activity at once, from the GM (usability Area 6 re-run, W11: it had no flame button
  // until setupLight() was run again).
  on("createItem", (item) => {
    if (!isActiveGM()) return;
    ensureTorchActivity(item).catch(e => warn("torch on create", e));
  });

  // GM side: the item flag is the desired state; tokens and ambient lights follow it.
  on("updateItem", (item, changes) => {
    if (!isActiveGM()) return;
    if (foundry.utils.hasProperty(changes ?? {}, CAST)) queue(item.uuid);
  });
  on("deleteItem", (item) => {
    if (!isActiveGM()) return;
    if (readSpellCast(item) || anyLitBy(item.uuid)) queue(item.uuid);
  });
  on("createToken", (token) => {
    if (!isActiveGM()) return;
    const sl = readSpellLight(token);
    if (sl) queue(sl.source); // a copy is put back; a portal arrival corrects the flag's scene
  });
  on("deleteToken", (token, options) => {
    if (!isActiveGM()) return;
    const sl = readSpellLight(token);
    if (sl) {
      // Core teleport that had to change the token's id says so in `replacements`.
      const to = options?.replacements?.[token.id];
      const item = itemFrom(sl.source);
      if (to && item && readSpellCast(item)?.token === token.id) {
        const parsed = foundry.utils.parseUuid(to);
        const scene = parsed?.primaryId ?? game.scenes.find(s => s.tokens.has(parsed?.id))?.id;
        if (parsed?.id && scene) {
          item.update({ [CAST]: { ...item.getFlag(MODULE, "lightCast"), scene, token: parsed.id } })
            .catch(e => warn("retarget", e));
          return;
        }
      }
      queue(sl.source);
    }
    // An unlinked caster deleted: its Light item went with it.
    for (const s of sourcesUnder(allSources(), token.uuid)) queue(s);
  });
  on("deleteActor", (actor) => {
    if (!isActiveGM()) return;
    for (const s of sourcesUnder(allSources(), actor.uuid)) queue(s);
  });
  // The GM deleted a Light square by hand: that ends the light. Without this the item still wants
  // the square and the next sweep (GM reload, scene deleted) puts it back. Our own deletions in
  // reconcile() never match the wanted square, or leave a duplicate of it standing.
  on("deleteAmbientLight", (light) => {
    if (!isActiveGM()) return;
    const sl = readSpellLight(light);
    if (!sl) return;
    const item = itemFrom(sl.source);
    const want = readSpellCast(item);
    const scene = light.parent;
    if (!want || want.token || want.scene !== scene?.id
      || want.x !== Math.round(light.x) || want.y !== Math.round(light.y)) return;
    const twin = scene.lights.some(l => l.id !== light.id && readSpellLight(l)?.source === sl.source
      && Math.round(l.x) === want.x && Math.round(l.y) === want.y);
    if (!twin) item.update({ [CAST]: null }).catch(e => warn("hand-deleted square", e));
  });
  // The GM dragged a Light square: the light now lives there. reconcile() never moves an
  // AmbientLight (it creates and deletes), so any x/y change is a hand move.
  on("updateAmbientLight", (light, changes) => {
    if (!isActiveGM() || !(("x" in (changes ?? {})) || ("y" in (changes ?? {})))) return;
    const sl = readSpellLight(light);
    if (!sl) return;
    const item = itemFrom(sl.source);
    const want = readSpellCast(item);
    if (!want || want.token || want.scene !== light.parent?.id) return;
    const x = Math.round(light.x), y = Math.round(light.y);
    if (want.x === x && want.y === y) return;
    const twin = light.parent.lights.some(l => l.id !== light.id && readSpellLight(l)?.source === sl.source
      && Math.round(l.x) === want.x && Math.round(l.y) === want.y);
    if (!twin) item.update({ [`${CAST}.x`]: x, [`${CAST}.y`]: y }).catch(e => warn("hand-moved square", e));
  });
  on("deleteScene", () => {
    if (!isActiveGM()) return;
    clearTimeout(state.timers.get("__sweep"));
    state.timers.set("__sweep", setTimeout(() => { state.timers.delete("__sweep"); sweep().catch(e => warn("sweep", e)); }, 500));
  });
}

