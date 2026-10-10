/**
 * Lootable corpses
 * ================
 *
 * When an NPC dies, its token becomes an Item Piles pile the players can loot, with the same
 * double-click as the eye hotspots. Joe's rule: **only the dead can be looted.** A living (or
 * merely unconscious-and-saved) NPC is never a pile, and healing one back above 0 turns it back
 * into a creature.
 *
 * Dead means either:
 *   - hit points at 0 or below (monsters die at 0 in 5e unless the GM says otherwise), or
 *   - the `dead` status on the token (the GM's override, e.g. a coup de grâce on a sleeper).
 * To keep a 0-HP NPC alive and unlootable (knocked out for questioning), set
 * `flags.pentaryn-dropbin.noLoot = true` on its token or actor; it is then never converted.
 *
 * Only the active GM converts, so several connected clients never race each other.
 *
 * Pile settings:
 *   - `type: "pile"`, keeping the creature's own token art, so the body stays a body on the map.
 *   - `distance: 1`: the looter has to stand next to the body.
 *   - `deleteWhenEmpty: false`: a stripped corpse stays where it fell.
 *   - Natural weapons, feats and spells never show (the world's `item-piles.itemFilters`).
 *   - Token sight is switched off while it is a corpse (and restored on revival): players observe
 *     it, and an observed token with sight would let them see what the body "sees".
 *   - Players get OBSERVER on the token's own actor delta, never on the base actor, so no stat
 *     block in the sidebar is exposed. Item Piles cannot render a pile for a user without it.
 */

import { MODULE, showEye, eyePlacement } from "./loot-core.mjs";

const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
const EYE = "assets/tokens/custom/props/icon-eye.webp";

const isGMRunner = () => game.users?.activeGM?.isSelf;

function tokensOf(actor) {
  if (actor.isToken) return [actor.token].filter(Boolean);
  return actor.getActiveTokens(false, true);
}

function noLoot(tokenDoc) {
  return !!(tokenDoc.flags?.[MODULE]?.noLoot || tokenDoc.actor?.flags?.[MODULE]?.noLoot);
}

function isDead(actor) {
  const hp = actor?.system?.attributes?.hp;
  return (hp && Number.isFinite(hp.value) && hp.max > 0 && hp.value <= 0) || actor?.statuses?.has("dead");
}

function eligible(tokenDoc) {
  const actor = tokenDoc?.actor;
  if (!actor || actor.type !== "npc") return false;      // PCs and pile containers are never corpses
  if (noLoot(tokenDoc)) return false;
  return true;
}

const API = () => game.itempiles?.API;
const isPile = t => !!API()?.isValidItemPile?.(t);
const ourCorpse = t => !!t.flags?.[MODULE]?.corpse;

async function toCorpse(tokenDoc) {
  if (isPile(tokenDoc)) return;
  await API().turnTokensIntoItemPiles([tokenDoc], {
    pileSettings: { type: "pile", distance: 1, deleteWhenEmpty: false, closed: false, locked: false,
      displayOne: false, showItemName: false, overrideSingleItemScale: false },
    tokenSettings: {}
  });
  const fresh = tokenDoc.parent?.tokens.get(tokenDoc.id) ?? tokenDoc;
  // Players observe the body, and an observed token with sight is a vision source for a player
  // with nothing selected: a dead drow would keep lighting its room. Remember it for a revival.
  await fresh.update({ [`flags.${MODULE}.corpse`]: true, [`flags.${MODULE}.sight`]: !!fresh.sight.enabled,
    "sight.enabled": false, "delta.ownership": { default: OBSERVER } });
  // Dead as core's full-body overlay. The "lootable" eye is not a document: every client draws
  // it on top of the token (paintEye below) while the body still holds something.
  await deadAsOverlay(fresh.actor);
}

/** Make sure the actor carries Dead as the big overlay (adding it, or promoting a corner icon). */
async function deadAsOverlay(actor) {
  if (!actor) return;
  const dead = actor.effects.filter(e => e.statuses?.has("dead"));
  if (!dead.length) { await actor.toggleStatusEffect("dead", { active: true, overlay: true }); return; }
  const flat = dead.filter(e => !e.flags?.core?.overlay).map(e => ({ _id: e.id, "flags.core.overlay": true }));
  if (flat.length) await actor.updateEmbeddedDocuments("ActiveEffect", flat);
}

/** Pre-overlay corpses carry a "Lootable" ActiveEffect (the old eye) and Dead as a corner icon. */
async function removeLegacyEye(actor) {
  const eyes = actor?.effects.filter(e => e.flags?.[MODULE]?.lootable).map(e => e.id) ?? [];
  if (eyes.length) await actor.deleteEmbeddedDocuments("ActiveEffect", eyes);
  return eyes.length;
}

async function fromCorpse(tokenDoc) {
  if (!ourCorpse(tokenDoc)) return; // never revert a pile we didn't make
  await API().revertTokensFromItemPiles([tokenDoc]);
  const fresh = tokenDoc.parent?.tokens.get(tokenDoc.id) ?? tokenDoc;
  await removeLegacyEye(fresh.actor);
  const sight = fresh.flags?.[MODULE]?.sight ?? fresh.sight.enabled;
  await fresh.update({ [`flags.${MODULE}.-=corpse`]: null, [`flags.${MODULE}.-=sight`]: null,
    "sight.enabled": sight, "delta.ownership": {} });
}

async function sync(actor) {
  if (!isGMRunner() || !API()) return;
  for (const t of tokensOf(actor)) {
    if (!eligible(t)) continue;
    try {
      if (isDead(t.actor)) await toCorpse(t);
      else if (ourCorpse(t)) await fromCorpse(t);
    } catch (err) {
      console.warn(`${MODULE} | corpse sync failed for ${t.name}`, err);
    }
  }
}

// Debounce per actor: a damage roll can fire several updates in a row.
const pending = new Map();
function queue(actor) {
  if (!actor) return;
  const key = actor.uuid;
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => { pending.delete(key); sync(actor); }, 150));
}

Hooks.on("updateActor", (actor, changes) => {
  if (!foundry.utils.hasProperty(changes, "system.attributes.hp")) return;
  // Healing a corpse above 0 HP is a revival: the Dead mark we put on it must go too, or the
  // "dead status counts as dead" rule keeps it lootable forever (found at the table: 65 HP and
  // still a loot pile).
  const hp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (isGMRunner() && typeof hp === "number" && hp > 0) {
    for (const t of tokensOf(actor)) {
      if (ourCorpse(t) && t.actor?.statuses?.has("dead")) t.actor.toggleStatusEffect("dead", { active: false });
    }
  }
  queue(actor);
});
for (const h of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
  Hooks.on(h, effect => {
    if (effect.flags?.[MODULE]?.lootable) return; // our own eye marker; not a life-or-death change
    if (effect.parent instanceof Actor) queue(effect.parent);
  });
}

/* -------------------------------------------- */
/*  The lootable eye: drawn, not a document      */
/* -------------------------------------------- */

/**
 * Foundry draws only one overlay per token (Token#_drawEffects keeps the last), so Dead and the
 * eye could not both be full size as effects. Dead keeps the overlay; the eye is a sprite each
 * client adds to the corpse's Token object (above its effect icons), shown while the body is
 * still a pile we made and still holds something. Emptied or revived, it hides on every client
 * by itself: there is no document to clean up. It lives on the Token, so it hides with the token
 * (vision, fog, GM-hidden) and goes away when the token is destroyed.
 */
const EYE_KEY = "pdLootEye";
const eyeState = { tex: null, loading: null };

function eyeTexture() {
  const tx = eyeState.tex;
  if (tx && !tx.destroyed && tx.baseTexture && !tx.baseTexture.destroyed) return tx;
  eyeState.tex = null;
  if (!eyeState.loading) {
    const load = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
    eyeState.loading = Promise.resolve(load?.(EYE))
      .then(tex => { eyeState.tex = tex ?? null; if (!tex) console.warn(`${MODULE} | eye texture missing: ${EYE}`); })
      .catch(err => console.warn(`${MODULE} | eye texture`, err))
      .finally(() => { eyeState.loading = null; if (eyeState.tex) paintAllEyes(); });
  }
  return null;
}

function wantsEye(doc) {
  try {
    if (!ourCorpse(doc) || doc.isSecret) return false;
    const api = API();
    if (!api) return false;
    const pile = !!api.isValidItemPile?.(doc);
    return showEye({ corpse: true, pile, empty: pile ? !!api.isItemPileEmpty?.(doc) : true });
  } catch (err) {
    console.warn(`${MODULE} | eye check failed for ${doc?.name}`, err);
    return false;
  }
}

function paintEye(token) {
  try {
    const doc = token?.document;
    if (!doc || token.destroyed) return;
    let eye = token[EYE_KEY];
    if (eye && (eye.destroyed || eye.parent !== token)) eye = token[EYE_KEY] = null;
    if (!wantsEye(doc)) { if (eye) eye.visible = false; return; }
    const tex = eyeTexture();
    if (!tex) return; // paints when it loads
    if (!eye) {
      eye = new PIXI.Container();
      eye.eventMode = "none";
      eye.addChild(new PIXI.Graphics(), new PIXI.Sprite(tex));
      eye.children[1].anchor.set(0.5, 0.5);
      token[EYE_KEY] = token.addChild(eye);
    }
    const { width, height } = doc.getSize();
    const p = eyePlacement(width, height);
    const [disc, sprite] = eye.children;
    disc.clear().beginFill(0x000000, 0.55).drawCircle(0, 0, p.size * 0.55).endFill();
    sprite.width = sprite.height = p.size;
    eye.position.set(p.x, p.y);
    eye.zIndex = (token.effects?.zIndex ?? 0) + 1;
    eye.visible = true;
  } catch (err) {
    console.warn(`${MODULE} | eye paint failed`, err);
  }
}

function paintAllEyes() {
  for (const token of canvas?.tokens?.placeables ?? []) paintEye(token);
}

function paintEyesOf(actor) {
  if (!actor || !canvas?.ready) return;
  for (const doc of tokensOf(actor)) if (doc.parent === canvas.scene) paintEye(doc.object);
}

Hooks.on("drawToken", paintEye);
Hooks.on("refreshToken", paintEye);
Hooks.on("canvasReady", paintAllEyes);
Hooks.on("updateToken", doc => { if (doc.parent === canvas?.scene) paintEye(doc.object); });
// Taking items out of a corpse changes its synthetic actor's items/currency, not the token.
Hooks.on("updateActor", paintEyesOf);
for (const h of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(h, item => { if (item.parent instanceof Actor) paintEyesOf(item.parent); });
}

/**
 * Migration, active GM, once per load: corpses made before the eye was drawn carry a "Lootable"
 * ActiveEffect and Dead as a corner icon. Remove the effect and promote Dead to the overlay.
 * Walks every scene's tokens (unlinked corpses) and every world actor (linked ones).
 */
async function migrateLegacyEyes() {
  if (!isGMRunner()) return;
  let eyes = 0, deads = 0;
  const fix = async (actor, corpse) => {
    try {
      eyes += await removeLegacyEye(actor);
      if (corpse) {
        const flat = actor.effects.filter(e => e.statuses?.has("dead") && !e.flags?.core?.overlay).length;
        if (flat) { await deadAsOverlay(actor); deads += flat; }
      }
    } catch (err) {
      console.warn(`${MODULE} | eye migration failed for ${actor?.name}`, err);
    }
  };
  for (const scene of game.scenes) {
    for (const t of scene.tokens) {
      if (!t.actor) continue;
      if (ourCorpse(t) || t.actor.effects.some(e => e.flags?.[MODULE]?.lootable)) await fix(t.actor, ourCorpse(t));
    }
  }
  for (const actor of game.actors) {
    if (actor.effects.some(e => e.flags?.[MODULE]?.lootable)) await fix(actor, false);
  }
  if (eyes || deads) console.log(`${MODULE} | corpses: removed ${eyes} old Lootable effect(s), Dead made the overlay on ${deads}`);
}

Hooks.once("ready", () => { migrateLegacyEyes(); });

/**
 * GM escape hatches on a corpse's token HUD. Once a token is a pile, Item Piles takes over the
 * double-click and opens the loot window, even for the GM, so the sheet (and healing) looked
 * unreachable. Item Piles honours `bypassItemPiles` on a sheet render, which is what these use.
 */
async function revive(tokenDoc) {
  const a = tokenDoc.actor;
  if (!a) return;
  if (a.statuses.has("dead")) await a.toggleStatusEffect("dead", { active: false });
  if ((a.system.attributes.hp.value ?? 0) <= 0) await a.update({ "system.attributes.hp.value": 1 });
  // the hp/effect hooks revert the pile; run it now too so the HUD closes on a creature
  await sync(a);
}

Hooks.on("renderTokenHUD", (app, element) => {
  if (!game.user.isGM) return;
  const tokenDoc = app.object?.document;
  if (!tokenDoc || !ourCorpse(tokenDoc)) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const col = root?.querySelector(".col.right") ?? root?.querySelector(".right");
  if (!col || col.querySelector(".pd-corpse-sheet")) return;
  const mk = (cls, icon, tip, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `control-icon ${cls}`;
    b.dataset.tooltip = tip;
    b.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    b.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); fn(); });
    col.prepend(b);
  };
  mk("pd-corpse-revive", "fa-heart-pulse", "Revive (1 HP): no longer lootable", async () => { await revive(tokenDoc); app.close(); });
  mk("pd-corpse-sheet", "fa-user", "Open character sheet (GM)", () => tokenDoc.actor?.sheet.render(true, { focus: true, bypassItemPiles: true }));
});

export const corpses = { sync, toCorpse, fromCorpse, isDead, revive, paintEye, paintAllEyes, migrateLegacyEyes };
