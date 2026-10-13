/**
 * Pentaryn Drop Bin — FEATURE: Item Piles patches
 * ===============================================
 *
 * Three patches to Item Piles behaviour, each fenced below and each deletable on its own once Item
 * Piles fixes the underlying behaviour (README "Patches and adjustments"):
 *
 *   1. Attunement repair — Item Piles nulls `system.attunement` on every item it puts on an actor,
 *      and dnd5e stores that null as the string "NaN" (itempiles-dropbin-nan-attunement).
 *   2. Container lock enforcement — `locked` is only honoured on the canvas double-click; the
 *      Actors sidebar, the API and a Ctrl-click on the token all open a locked chest
 *      (itempiles-dropbin-container-locks).
 *   3. Directory filters and the in-view rule — pile actors have to be OBSERVER for players,
 *      which lists every chest in their sidebar; pinned readables likewise; piles never see and
 *      readable pins are never global (itempiles-dropbin-directory-hiding).
 *
 * Cross-module order: pentaryn-attunement registers its `preCreateItem` at load; the repair here
 * registers inside an async `ready`, after the pack indexes load, so attunement's runs first.
 */

import {
  MODULE, LOCK_SOUND, lockedContainer, lockFloatToken, pileFlags, isPileFlagged, planLockSounds, planEyesNeedView,
  isActiveGMSelf,
} from "./dropbin-core.mjs";
import { pinnedEntryIds } from "./lib/pins.mjs";

/** The module log (set by install). */
let log = null;

/* ------------------------------------------- item-piles attunement repair */
/**
 * Item Piles 3.3.4 nulls `system.attunement` on every item it puts on an actor.
 * dnd5e (5.3.3, and still 6.0.6) then stores that null as the *string* `"NaN"`, so a looted magic
 * item stops declaring that it needs attunement — a Cloak of Displacement taken
 * out of a chest looks like a mundane cloak, and a Potion of Healing grows an
 * attunement control it should not have.
 *
 * Reproduce: `game.itempiles.API.addItems(actor, [{item, quantity: 1}])` and
 * read `item._source.system.attunement` — "required" in, "NaN" out. Plain
 * `createEmbeddedDocuments` is unaffected, so this is item-piles, not us.
 *
 * The true value is unrecoverable from the corrupted item, so we look it up by
 * name in the equipment compendium indexes, which are loaded once at ready and
 * cached by Foundry. The guard is deliberately narrow — only `null` and the
 * literal "NaN" are touched, values no ordinary item creation ever produces.
 *
 * Delete this block when item-piles ships a fix.
 */
const ATTUNEMENT_PACKS = ["dnd5e.equipment24", "dnd5e.items", "dnd-players-handbook.equipment"];
const ATTUNEMENT_VALID = new Set(["", "required", "optional"]);
const attunementByName = new Map();

async function loadAttunementIndex() {
  for (const id of ATTUNEMENT_PACKS) {
    const pack = game.packs.get(id);
    if (!pack) continue;
    try {
      const index = await pack.getIndex({ fields: ["system.attunement"] });
      for (const entry of index) {
        const value = entry.system?.attunement;
        if (!ATTUNEMENT_VALID.has(value)) continue;
        const key = entry.name.toLowerCase();
        // First pack wins: ATTUNEMENT_PACKS is in 2024-first priority order.
        if (!attunementByName.has(key)) attunementByName.set(key, value);
      }
    } catch (err) {
      console.warn(`${MODULE} | could not index ${id} for attunement repair`, err);
    }
  }
}

function repairAttunement(item) {
  const broken = item._source?.system?.attunement;
  if (broken !== null && broken !== "NaN") return;
  const fixed = attunementByName.get(item.name?.toLowerCase()) ?? "";
  item.updateSource({ "system.attunement": fixed });
  console.debug(`${MODULE} | attunement repaired on "${item.name}": ${JSON.stringify(broken)} → ${JSON.stringify(fixed)}`);
}

/** ready: index the packs, THEN register the repair (after attunement's load-time preCreateItem). */
async function armAttunementRepair(reg) {
  await loadAttunementIndex();
  reg.on("preCreateItem", repairAttunement, { label: "attunement repair" });
  if (game.user.isGM) console.log(`${MODULE} | attunement repair armed — ${attunementByName.size} items indexed`);
}

/* ------------------------------------- item-piles container lock enforcement */
/**
 * A locked Item Piles container is only locked against one of the three ways a
 * player can open it.
 *
 *   1. Double-click the token on the canvas — `_itemPileClicked` checks
 *      `pileData.locked` and rattles instead of opening. Correct, but the rattle
 *      plays `lockedSound` (unset by default) and prints nothing, so the player
 *      gets total silence and a token that looks broken.
 *   2. Click the pile's actor in the **Actors sidebar** — item-piles' own
 *      `preRenderActorSheet` handler calls `renderItemPileInterface` directly and
 *      never looks at `locked`. The chest opens, contents and coin and Take
 *      buttons and all. Pile actors have to be OBSERVER for players or the module
 *      cannot render them at all, so every container in the world is listed there
 *      by name — which is its own spoiler, handled further down.
 *   3. The API, same bypass as 2.
 *
 * `item-piles-preRenderInterface` is the one choke point all three funnel
 * through, and returning false from it cancels the render. So: refuse there, and
 * give the player something to hear and read either way.
 *
 * The GM is exempt — a locked pile must still open from behind the screen.
 */
function lockedContainerData(target) {
  const actor = target?.actor ?? target;
  const data = lockedContainer(pileFlags(actor));
  return data ? { actor, data } : null;
}

/** The toast names the actor; the float goes on the hook's own chest (lockFloatToken, dropbin-R9). */
function announceLocked(target, actor, { playSound }) {
  if (playSound) {
    try { foundry.audio.AudioHelper.play({ src: LOCK_SOUND, volume: 0.8 }, true); }
    catch (err) { console.warn(`${MODULE} | could not play the lock sound`, err); }
  }
  ui.notifications.warn(_loc("PENTARYN_DROPBIN.lock.toast", { name: actor?.name ?? "It" }));
  try {
    const tok = lockFloatToken(target, actor, canvas.tokens?.placeables);
    if (tok) canvas.interface.createScrollingText(tok.center, _loc("PENTARYN_DROPBIN.lock.float"), {
      anchor: CONST.TEXT_ANCHOR_POINTS.TOP, fontSize: 28, fill: "#d8433a", stroke: 0x000000, strokeThickness: 4 });
  } catch (err) { log?.debug("announceLocked: no canvas (off-screen); the notification is enough", err); }
}

/**
 * The veto behind both lock hooks (one body, dropbin-M6): a player is refused a locked container with
 * the sound, the toast and the float; the GM, and anything not locked, falls through.
 */
function refuseIfLocked(target) {
  if (game.user.isGM) return;
  const hit = lockedContainerData(target);
  if (!hit) return;
  announceLocked(target, hit.actor, { playSound: true });
  return false;                         // cancels the render — this is the actual lock
}

/**
 * The ready backfills run on the active GM user (the core's isActiveGMSelf, shared with
 * corpses.mjs): every tab on that account runs them (`isSelf` is per user, not per tab), a second
 * GM user does not. The writes are idempotent; a one-tab gate would be a separate [declared]
 * change (wave-2 report, W2-D1).
 */
const isGMRunner = () => isActiveGMSelf(game.users);

/**
 * Write a backfill plan: every actor in one batch (items-journal-25; updateActor still fires per
 * actor), then one embedded batch per scene and document type.
 */
async function applyPlan(plan) {
  if (plan.actorUpdates.length) await Actor.implementation.updateDocuments(plan.actorUpdates);
  for (const { sceneId, type, updates } of plan.embedded) {
    await game.scenes.get(sceneId).updateEmbeddedDocuments(type, updates);
  }
}

/**
 * Every container gets a lock sound, whether or not it is locked today, so that
 * locking one later is a one-flag change and not a hunt for why it is silent.
 */
async function ensureLockSounds() {
  if (!isGMRunner()) return;
  const plan = planLockSounds(game.actors, game.scenes, LOCK_SOUND);
  await applyPlan(plan);
  const patched = plan.actorUpdates.length + plan.embedded.reduce((n, e) => n + e.updates.length, 0);
  if (patched) console.log(`${MODULE} | lock sound set on ${patched} container document(s)`);
}

/**
 * Joe's rule: an eye can be seen, and so used, only when it is in a player's view.
 *
 *   - **Piles never see.** Players are OBSERVER on every pile, and Foundry lets a player who
 *     controls no token see through every token they observe. A pile with `sight.enabled` was
 *     therefore a vision source: each eye lit itself and its room, and every eye on the map
 *     showed even though the party could see none of them.
 *   - **Readables are not global.** A `global` Note shows (and opens on double-click) through
 *     walls and darkness from anywhere; non-global Notes show only while their centre is in the
 *     player's current vision, which is the in-view rule. Per-player readables follow it too.
 *
 * Range stays unlimited (item-piles reads an unset `distance` as Infinity), so whatever is in
 * view can be opened. Corpses get the same no-sight treatment in corpses.mjs.
 */
async function ensureEyesNeedView() {
  if (!isGMRunner()) return;
  const plan = planEyesNeedView(game.actors, game.scenes);
  await applyPlan(plan);
  let piles = plan.actorUpdates.length, notes = 0;
  for (const { type, updates } of plan.embedded) {
    if (type === "Token") piles += updates.length; else notes += updates.length;
  }
  if (piles || notes) console.log(`${MODULE} | in-view rule: sight off on ${piles} pile document(s), ${notes} readable pin(s) no longer global`);
}

/**
 * Pile actors must be OBSERVER for item-piles to work for players, which puts
 * every chest, cache and hotspot in the world into the players' Actors sidebar
 * by name — "Hidden Cache" rather spoils itself. Foundry has no ownership level
 * that keeps the module working and the entry hidden, so hide the rows at render
 * time instead. Purely cosmetic and GM-side untouched; the tokens on the canvas
 * are still the way in.
 */
function hideRowsFromDirectory(app, element, isSecret) {
  if (game.user.isGM) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;
  for (const li of root.querySelectorAll("[data-entry-id]")) {
    if (isSecret(li.dataset.entryId)) li.remove();
  }
}

// Plain flag reads (pileFlags), not getFlag("item-piles", …): getFlag throws when Item Piles is not an
// active package, which would break every player's sidebar render (items-journal-23).
const isPileActor = id => isPileFlagged(game.actors.get(id));

/**
 * A readable behind an eye pin is meant to be found by looking at the thing, so
 * its journal must not also sit in the players' Journal sidebar where they can
 * read the binding incantation without ever walking to the plaque. Anything
 * pinned to a scene Note is hidden; a genuine handout, which has no pin, stays.
 *
 * One render walks every scene's notes once (items-journal-24), on the first row it checks: the
 * GM, and a render with no rows, never build the set.
 */
function pinnedJournalTest() {
  let pinned = null;
  return id => (pinned ??= pinnedEntryIds(game.scenes)).has(id);
}

/** ready: the three lock hooks, a repaint of the player's sidebar, then the GM backfills. */
async function armLocks(reg) {
  reg.on("item-piles-preRenderInterface", refuseIfLocked, { label: "lock: interface" });

  // Item Piles has a "force open default sheet" keybind — Left Ctrl out of the
  // box — and holding it makes the module stand aside entirely, so a Ctrl-click
  // on a pile opens the raw dnd5e actor sheet with the loot sitting on its
  // Inventory tab. `preRenderInterface` never fires on that path because no
  // interface is being rendered. Refuse the sheet itself: returning false from
  // item-piles' own preRenderActorSheet hook suppresses the render, and it fires
  // for ApplicationV2 sheets and for the bypass alike.
  reg.on("item-piles-preRenderActorSheet", refuseIfLocked, { label: "lock: actor sheet" });

  // The canvas double-click already refuses and plays lockedSound itself; all
  // this adds is the words. PRE_RATTLE is local to the clicking client, unlike
  // RATTLE, which item-piles broadcasts to everyone.
  reg.on("item-piles-preRattleItemPile", (actor) => {
    if (game.user.isGM) return;
    announceLocked(actor, actor, { playSound: false });
  }, { label: "lock: rattle" });

  // The directory hooks above were registered at load time, but the sidebar has
  // already painted by now — repaint it once so the first render is filtered too.
  if (!game.user.isGM) { ui.actors?.render(); ui.journal?.render(); }

  await ensureLockSounds();
  await ensureEyesNeedView();
}

/* --------------------------------------------------------------- lifecycle */

/**
 * Registration order (pinned by golden/hooks.json): the attunement ready, the two directory
 * filters at load (the sidebar paints before ready, and a hook added afterwards misses that first
 * render entirely), then the locks ready.
 */
export function install(reg, ctx) {
  log = ctx.log;
  ctx.onReady(() => armAttunementRepair(reg), "attunement repair");
  reg.on("renderActorDirectory", (app, el) => hideRowsFromDirectory(app, el, isPileActor), { label: "actor directory" });
  reg.on("renderJournalDirectory", (app, el) => hideRowsFromDirectory(app, el, pinnedJournalTest()), { label: "journal directory" });
  ctx.onReady(() => armLocks(reg), "locks");
}

export function uninstall() {
  attunementByName.clear();
  log = null;
}
