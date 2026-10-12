/**
 * Token chain — a visible iron chain drawn between two tokens. Graphics only: no movement limit,
 * no rules. The GM judges the reach.
 *
 *   token.flags["pentaryn-senses"].chain = { anchor: "<anchor token id>" }   (on the chained token)
 *
 * Drawn on every client, in canvas.primary just under the tokens (so fog and vision hide it like
 * the map), from the anchor's centre to the chained token's centre. It follows drags and move
 * animations live. A chain with either end hidden (chained or anchor token) is drawn for the GM only.
 *
 * Token HUD (GM only): "Break chain" on either end removes every chain touching that token.
 * "Chain to target" appears on an unchained token while you have exactly one other token targeted.
 *
 *   game.pentaryn.chain.link(chained, anchor)   token / doc / Token uuid / id
 *   game.pentaryn.chain.break(token)            removes every chain touching it
 *   game.pentaryn.chain.links()                 [{chained, anchor}] on the viewed scene
 *   game.pentaryn.chain.repaint()               redraws the viewed scene's chains on the next frame
 *
 * Every hook body is guarded: a bug here logs a warning and draws nothing. It never throws into
 * token rendering. A feature: the entry calls install(reg, ctx); the entry's ready publishes the API.
 */

import {
  MODULE, FLAGS, readChain, chainPairs, linksTouching, chainThickness, resolveTokenRef, linkSpriteSpecs, unsetPath,
} from "./senses-core.mjs";
import { isAnyGM } from "./lib/election.mjs";

const TEX = `modules/${MODULE}/assets/chain-link.webp`;
const TILE_H = 96; // px height of the source tile
const SORT_LAYER_FALLBACK = 699; // just under PrimaryCanvasGroup.SORT_LAYERS.TOKENS (700)

const state = { layer: null, tex: null, loading: null, queued: 0, hooks: [], reg: null };

/** The sprites on the layer, per pair (finding -20): updated in place, rebuilt for a new layer or texture. */
const drawn = { layer: null, tex: null, sprites: new Map() };

const warn = (label, err) => console.warn(`${MODULE} | chain ${label}`, err);

/* -------------------------------------------- */
/*  Data                                        */
/* -------------------------------------------- */

const docOf = t => resolveTokenRef(t, { viewed: canvas?.scene, fromUuid: uuid => fromUuidSync(uuid, { strict: false }) });

/** Every drawable chain on a scene (a Scene, or its id; default the viewed scene). */
export function links(scene = canvas?.scene) {
  if (typeof scene === "string") scene = game.scenes?.get(scene) ?? null;
  try {
    return chainPairs(scene?.tokens?.contents ?? []);
  } catch (e) {
    warn("links", e);
    return [];
  }
}

/**
 * The pairs of a scene for the hot refreshToken check (finding -19), cached per scene id and
 * dropped by every hook that can change them: token create/delete, a chain flag update, canvas
 * ready/teardown. paint() and the API's links() always read fresh.
 */
const pairsCache = new Map();

function cachedPairs(scene) {
  const id = scene?.id;
  if (!id) return links(scene);
  let pairs = pairsCache.get(id);
  if (!pairs) pairsCache.set(id, pairs = links(scene));
  return pairs;
}

/** Forget a scene's pairs (the scene a changed token is on), or every scene's when unknown. */
function forgetPairs(doc) {
  const id = doc?.parent?.id;
  if (id) pairsCache.delete(id);
  else pairsCache.clear();
}

export async function link(chained, anchor) {
  if (!isAnyGM()) return false;
  const c = docOf(chained), a = docOf(anchor);
  if (!c?.update || !a?.id || c.id === a.id || c.parent !== a.parent || c.documentName !== "Token" || a.documentName !== "Token") return false;
  await c.update({ [FLAGS.chain]: { anchor: a.id } });
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
  const updates = [...ids].map(_id => ({ _id, ...unsetPath(FLAGS.chain) }));   // _del on v14, "-=" before
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
  drawn.sprites.clear();
  drawn.layer = null;
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

/** Put a sprite where a linkSpriteSpecs half says. */
function applySpec(s, spec) {
  s.width = spec.width;
  s.height = spec.height;
  s.tileScale.set(spec.scale, spec.scale);
  s.anchor.set(0, 0.5);
  s.position.set(spec.x, spec.y);
  s.rotation = spec.rotation;
  if (spec.tint !== undefined) s.tint = spec.tint;
  if (spec.alpha !== undefined) s.alpha = spec.alpha;
}

function makeSprite(tex, spec) {
  const s = new PIXI.TilingSprite(tex, spec.width, spec.height);
  applySpec(s, spec);
  return s;
}

/** Destroy every sprite on the layer and forget them (a new layer, a new texture). */
function resetSprites(container, tex) {
  for (const child of container.removeChildren()) child.destroy();
  drawn.sprites.clear();
  drawn.layer = container;
  drawn.tex = tex;
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
  // Either end hidden → GM only, or the line would show a player the hidden token's square (W3-SE4).
  const shown = pairs.filter(p => isGM || !(scene.tokens.get(p.chained)?.hidden || scene.tokens.get(p.anchor)?.hidden));
  if (!shown.length) return dropLayer();

  const tex = texture();
  if (!tex) return; // repaints when it loads
  const c = layer();
  if (!c) return;
  if (drawn.layer !== c || drawn.tex !== tex) resetSprites(c, tex);

  const thickness = chainThickness(canvas.grid?.size ?? scene.grid?.size);
  let elevation = Infinity;
  const kept = new Set();
  for (const p of shown) {
    const cd = scene.tokens.get(p.chained), ad = scene.tokens.get(p.anchor);
    if (!cd || !ad) continue;
    elevation = Math.min(elevation, cd.elevation || 0, ad.elevation || 0);
    const spec = linkSpriteSpecs(liveCentre(ad), liveCentre(cd), thickness, TILE_H);
    if (!spec) continue;
    const key = `${p.chained}>${p.anchor}`;
    kept.add(key);
    const had = drawn.sprites.get(key);
    if (had) {
      applySpec(had.shadow, spec.shadow);
      applySpec(had.link, spec.link);
    } else {
      const pair = { shadow: makeSprite(tex, spec.shadow), link: makeSprite(tex, spec.link) };
      c.addChild(pair.shadow, pair.link);
      drawn.sprites.set(key, pair);
    }
  }
  for (const [key, pair] of drawn.sprites) {
    if (kept.has(key)) continue;
    pair.shadow.destroy();
    pair.link.destroy();
    drawn.sprites.delete(key);
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
    hudButton(col, "ps-chain-btn", "fa-solid fa-link-slash", _loc("PENTARYN_SENSES.Chain.Break"), async () => {
      const n = await breakChain(doc);
      if (n) ui.notifications.info(_loc("PENTARYN_SENSES.Chain.Breaks", { name: doc.name }));
      app.render?.();
    });
    return;
  }
  const targets = [...(game.user.targets ?? [])].filter(t => t?.document?.id !== doc.id && t?.document?.parent === doc.parent);
  if (targets.length !== 1) return;
  const anchor = targets[0].document;
  hudButton(col, "ps-chain-btn", "fa-solid fa-link", _loc("PENTARYN_SENSES.Chain.LinkTo", { anchor: anchor.name }), async () => {
    if (await link(doc, anchor)) ui.notifications.info(_loc("PENTARYN_SENSES.Chain.Linked", { name: doc.name, anchor: anchor.name }));
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
  pairsCache.clear();
  if (state.queued) cancelAnimationFrame(state.queued);
  state.queued = 0;
  dropLayer();
}

/** What api.mjs publishes as `chain.*` (and the `game.pentaryn.chain` alias). */
const exposed = { link, break: breakChain, links, repaint: schedule };

/** FEATURE: called synchronously by the entry, at import. */
export function install(reg, ctx) {
  state.reg = reg;
  ctx.expose({ chain: exposed });

  on("canvasTearDown", () => {
    state.layer = null; // Foundry destroys canvas.primary's children under us
    pairsCache.clear();
  });
  on("canvasReady", () => {
    pairsCache.clear();
    schedule();
  });
  on("refreshToken", () => {
    if (state.layer || cachedPairs(canvas?.scene).length) schedule();   // hot: pairsCache
  });
  on("destroyToken", () => schedule()); // a drag preview ending
  on("createToken", (doc) => {
    forgetPairs(doc);
    schedule();
  });
  on("deleteToken", (doc) => {
    forgetPairs(doc);
    schedule();
  });
  on("updateToken", (doc, changes) => {
    // The whole flag scope is tested on purpose: a chain deletion arrives as `-=chain` / `_del`, which a narrow `flags.<scope>.chain` path test would miss.
    const ourFlagsChanged = foundry.utils.getProperty(changes ?? {}, `flags.${MODULE}`) !== undefined;
    if (ourFlagsChanged) forgetPairs(doc);
    if (ourFlagsChanged || "hidden" in (changes ?? {}) || "elevation" in (changes ?? {})) schedule();
  });
  on("renderTokenHUD", (app, element) => injectHUD(app, element));

  // The entry's ready publishes the chain API (after senses). Installed into a world that is
  // already drawn (a hot re-import of the entry): draw the chains now.
  if (game.ready) schedule();
}
