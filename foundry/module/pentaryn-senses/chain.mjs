/**
 * Token chain — a visible iron chain drawn between two tokens. Graphics only: no movement limit,
 * no rules. The GM judges the reach.
 *
 *   token.flags["pentaryn-senses"].chain = { anchor: "<anchor token id>" }   (on the chained token)
 *
 * Drawn on every client, in canvas.primary just under the tokens (so fog and vision hide it like
 * the map), from the anchor's centre to the chained token's centre. It follows drags and move
 * animations live. A chain whose chained token is hidden is drawn for the GM only.
 *
 * Token HUD (GM only): "Break chain" on either end removes every chain touching that token.
 * "Chain to target" appears on an unchained token while you have exactly one other token targeted.
 *
 *   game.pentaryn.chain.link(chained, anchor)   token / doc / id
 *   game.pentaryn.chain.break(token)            removes every chain touching it
 *   game.pentaryn.chain.links()                 [{chained, anchor}] on the viewed scene
 *
 * Every hook body is wrapped: a bug here logs a warning and draws nothing. It never throws into
 * token rendering. Imported for its side effects by senses.mjs (no module.json change), and safe
 * to hot-import into a running client: a second load uninstalls the first.
 */

import { MODULE, CHAIN_FLAG, readChain, chainPairs, linksTouching, chainGeometry, chainThickness, resolveTokenRef } from "./senses-core.mjs";
import { isAnyGM } from "./lib/election.mjs";

const TEX = `modules/${MODULE}/assets/chain-link.webp`;
const TILE_H = 96; // px height of the source tile
const SORT_LAYER_FALLBACK = 699; // just under PrimaryCanvasGroup.SORT_LAYERS.TOKENS (700)

const state = { layer: null, tex: null, loading: null, queued: 0, hooks: [], reg: null };

const warn = (label, err) => console.warn(`${MODULE} | chain ${label}`, err);

/* -------------------------------------------- */
/*  Data                                        */
/* -------------------------------------------- */

const docOf = t => resolveTokenRef(t, { viewed: canvas?.scene });

export function links(scene = canvas?.scene) {
  try {
    return chainPairs(scene?.tokens?.contents ?? []);
  } catch (e) {
    warn("links", e);
    return [];
  }
}

export async function link(chained, anchor) {
  if (!isAnyGM()) return false;
  const c = docOf(chained), a = docOf(anchor);
  if (!c?.update || !a?.id || c.id === a.id || c.parent !== a.parent) return false;
  await c.update({ [`flags.${MODULE}.${CHAIN_FLAG}`]: { anchor: a.id } });
  return true;
}

/** Remove every chain touching this token (as the chained one or as the anchor). */
export async function breakChain(token) {
  if (!isAnyGM()) return 0;
  const doc = docOf(token);
  const scene = doc?.parent;
  if (!doc?.id || !scene?.tokens) return 0;
  const ids = new Set(linksTouching(chainPairs(scene.tokens.contents), doc.id).map(p => p.chained));
  // a dangling flag on this token (anchor already deleted) goes too
  if (readChain(doc)) ids.add(doc.id);
  const updates = [...ids].map(_id => ({ _id, [`flags.${MODULE}.-=${CHAIN_FLAG}`]: null }));
  if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
  return updates.length;
}

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

function texture() {
  const t = state.tex;
  if (t && !t.destroyed && t.baseTexture && !t.baseTexture.destroyed) return t;
  state.tex = null;
  if (!state.loading) {
    const load = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
    state.loading = Promise.resolve(load?.(TEX))
      .then(tex => {
        state.tex = tex ?? null;
        if (tex?.baseTexture) tex.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
        if (!tex) console.warn(`${MODULE} | chain texture missing: ${TEX}`);
      })
      .catch(e => warn("texture", e))
      .finally(() => {
        state.loading = null;
        if (state.tex) schedule();
      });
  }
  return null;
}

function layer() {
  if (state.layer && !state.layer.destroyed && state.layer.parent) return state.layer;
  if (!canvas?.ready || !canvas.primary) return null;
  const c = new PIXI.Container();
  c.eventMode = "none";
  c.elevation = 0;
  c.sortLayer = foundry.canvas.groups?.PrimaryCanvasGroup?.SORT_LAYERS?.TOKENS - 1 || SORT_LAYER_FALLBACK;
  c.sort = 0;
  canvas.primary.addChild(c);
  canvas.primary.sortDirty = true;
  state.layer = c;
  return c;
}

function dropLayer() {
  const c = state.layer;
  state.layer = null;
  try {
    if (c && !c.destroyed) c.destroy({ children: true });
  } catch (e) {
    warn("teardown", e);
  }
}

/** Where a token is drawn right now: its drag preview if dragged, the animating mesh, else the document. */
function liveCentre(doc) {
  const p = doc?.object;
  if (!p) {
    const g = canvas.grid?.size || 100;
    return { x: doc.x + (doc.width * g) / 2, y: doc.y + (doc.height * g) / 2 };
  }
  const live = p._preview && !p._preview.destroyed ? p._preview : p;
  const m = live.mesh;
  if (m && !m.destroyed && m.transform && Number.isFinite(m.x) && Number.isFinite(m.y)) return { x: m.x, y: m.y };
  return live.center;
}

function drawLink(container, tex, a, b, thickness) {
  const g = chainGeometry(a, b);
  if (g.length < 1) return;
  const scale = thickness / TILE_H;
  const make = () => {
    const s = new PIXI.TilingSprite(tex, g.length, thickness);
    s.tileScale.set(scale, scale);
    s.anchor.set(0, 0.5);
    s.position.set(g.x, g.y);
    s.rotation = g.angle;
    return s;
  };
  const shadow = make();
  shadow.tint = 0x000000;
  shadow.alpha = 0.45;
  shadow.position.set(g.x + thickness * 0.1, g.y + thickness * 0.16);
  container.addChild(shadow, make());
}

/** Coalesce to one repaint per frame — refreshToken fires per animation step per token. */
export function schedule() {
  if (state.queued) return;
  state.queued = requestAnimationFrame(() => {
    state.queued = 0;
    try {
      paint();
    } catch (e) {
      warn("paint", e);
    }
  });
}

export function paint(pairs) {
  if (!canvas?.ready || !canvas.scene) return;
  const scene = canvas.scene;
  pairs ??= links(scene);
  const isGM = isAnyGM();
  const shown = pairs.filter(p => isGM || !scene.tokens.get(p.chained)?.hidden);
  if (!shown.length) return dropLayer();

  const tex = texture();
  if (!tex) return; // repaints when it loads
  const c = layer();
  if (!c) return;
  for (const child of c.removeChildren()) child.destroy();

  const thickness = chainThickness(canvas.grid?.size ?? scene.grid?.size);
  let elevation = Infinity;
  for (const p of shown) {
    const cd = scene.tokens.get(p.chained), ad = scene.tokens.get(p.anchor);
    if (!cd || !ad) continue;
    elevation = Math.min(elevation, cd.elevation || 0, ad.elevation || 0);
    drawLink(c, tex, liveCentre(ad), liveCentre(cd), thickness);
  }
  c.elevation = Number.isFinite(elevation) ? elevation : 0;
  canvas.primary.sortDirty = true;
}

/* -------------------------------------------- */
/*  Token HUD — GM only                         */
/* -------------------------------------------- */

function hudButton(col, cls, icon, tip, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `control-icon ${cls}`;
  btn.dataset.tooltip = tip;
  btn.setAttribute("aria-label", tip);
  btn.innerHTML = `<i class="${icon}"></i>`;
  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    Promise.resolve(onClick()).catch(e => warn("hud click", e));
  });
  col.appendChild(btn);
}

function injectHUD(app, element) {
  if (!isAnyGM()) return;
  const doc = app?.object?.document ?? app?.document ?? null;
  if (!doc?.id || !doc.parent) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const col = root?.querySelector(".col.right") ?? root?.querySelector(".right");
  if (!col || col.querySelector(".ps-chain-btn")) return;

  const touching = linksTouching(chainPairs(doc.parent.tokens.contents), doc.id);
  if (touching.length || readChain(doc)) {
    hudButton(col, "ps-chain-btn", "fa-solid fa-link-slash", "Break chain", async () => {
      const n = await breakChain(doc);
      if (n) ui.notifications.info(`The chain on ${doc.name} breaks.`);
      app.render?.();
    });
    return;
  }
  const targets = [...(game.user.targets ?? [])].filter(t => t?.document?.id !== doc.id && t?.document?.parent === doc.parent);
  if (targets.length !== 1) return;
  const anchor = targets[0].document;
  hudButton(col, "ps-chain-btn", "fa-solid fa-link", `Chain to ${anchor.name}`, async () => {
    if (await link(doc, anchor)) ui.notifications.info(`${doc.name} is chained to ${anchor.name}.`);
    app.render?.();
  });
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** reg.on with the body guarded: a throw logs `pentaryn-senses | chain <name>` at warn and is swallowed. */
function on(name, fn) {
  state.hooks.push(state.reg.on(name, fn, { guard: "warn", label: `chain ${name}` }));
}

export function uninstall() {
  for (const id of state.hooks.splice(0)) state.reg?.off(id);
  if (state.queued) cancelAnimationFrame(state.queued);
  state.queued = 0;
  dropLayer();
}

const api = { link, break: breakChain, links, repaint: schedule, uninstall };

function publish() {
  const current = game.pentaryn;
  // pentaryn-importer freezes game.pentaryn — rebuild the namespace rather than assign into it
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, chain: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.chain = api;
  }
}

/** FEATURE: called synchronously by the entry, at import. */
export function install(reg, ctx) {
  try {
    globalThis.__pentarynChain?.uninstall?.();
  } catch (e) {
    warn("previous uninstall", e);
  }
  globalThis.__pentarynChain = api;
  state.reg = reg;
  ctx.expose({ chainApi: api });

  on("canvasTearDown", () => {
    state.layer = null; // Foundry destroys canvas.primary's children under us
  });
  on("canvasReady", () => schedule());
  on("refreshToken", () => {
    if (state.layer || links().length) schedule();
  });
  on("destroyToken", () => schedule()); // a drag preview ending
  on("createToken", () => schedule());
  on("deleteToken", () => schedule());
  on("updateToken", (_doc, changes) => {
    if (foundry.utils.getProperty(changes ?? {}, `flags.${MODULE}`) !== undefined || "hidden" in (changes ?? {}) || "elevation" in (changes ?? {})) schedule();
  });
  on("renderTokenHUD", (app, element) => injectHUD(app, element));

  // The entry's ready publishes the chain API (after senses). A hot import into a ready world
  // publishes here and repaints.
  if (game.ready) {
    publish();
    schedule();
  }
}
