/**
 * Pentaryn Drop Bin
 * =================
 *
 * An append-only ledger of everything that leaves a character's sheet.
 *
 * The problem it solves: a player drops their two-hander in a corridor, three
 * sessions pass, and they come back for it. Item Piles keeps the pile on the
 * map, but a pile can be looted by someone else, merged, moved, or cleaned up —
 * and an item deleted straight off a sheet is simply gone. Foundry keeps no
 * record of either. This does.
 *
 *   game.pentaryn.dropbin.list(n)        the last n entries, newest first
 *   game.pentaryn.dropbin.all()          the whole ledger, oldest first
 *   game.pentaryn.dropbin.get(n)         one entry by its ledger number
 *   game.pentaryn.dropbin.restore(n)     recreate it on the actor it left
 *   game.pentaryn.dropbin.restore(n, a)  ...or on some other actor
 *   game.pentaryn.dropbin.search(text)   entries whose item name matches
 *   game.pentaryn.dropbin.export()       force-write the JSON mirror
 *   game.pentaryn.dropbin.clear()        wipe it (asks first)
 *
 * Every entry stores the item's **complete source object**, not a reference, so
 * a restore is faithful even if the original pile, actor or scene is long gone:
 * attunement, charges, custom names, damage, the lot.
 *
 * Two capture paths:
 *
 *   1. `item-piles-dropItem` — an item dropped onto the canvas as a pile.
 *   2. Core `preDeleteItem` — an item removed from a character sheet outright.
 *      Captured in the PRE hook because after deletion the data is unreachable.
 *
 * Writes are funnelled through socketlib to a GM. World settings are not
 * player-writable, and file uploads are GM-only, so a player client that tried
 * to record its own drop would throw on every one.
 *
 * The JSON mirror is a convenience for reading the ledger outside Foundry. The
 * world setting is the source of truth — if the two disagree, trust the setting.
 *
 * ---
 *
 * This module also carries three **Item Piles patches**, kept here because it is
 * already the module that watches items move between sheets and piles, and it is
 * already enabled — a new module would need a world restart to switch on. Each is
 * fenced and commented at the bottom of the file, and each can be deleted
 * independently once item-piles fixes the underlying behaviour:
 *
 *   1. Attunement repair — item-piles nulls `system.attunement` on every item it
 *      puts on an actor, and dnd5e stores that null as the string "NaN".
 *   2. Container lock enforcement — `locked` is only honoured on the canvas
 *      double-click; the Actors sidebar, the API and a Ctrl-click on the token
 *      all open a locked chest.
 *   3. Directory filters — pile actors have to be OBSERVER for players, which
 *      lists every chest in their sidebar; pinned readables likewise.
 */

const MODULE = "pentaryn-dropbin";
const LOG = "log";
const COUNTER = "counter";
const DIR = "assets/drop-bin";
const FILE = "drop-log.json";
const DEDUPE_MS = 2000;

let socket = null;

/* ------------------------------------------------------------------ storage */

function readLog() {
  try {
    const v = game.settings.get(MODULE, LOG);
    return Array.isArray(v) ? v : [];
  } catch (err) {
    console.warn(`${MODULE} | could not read the ledger`, err);
    return [];
  }
}

/** Mirror to disk. Best-effort: a failed mirror must never lose the entry. */
async function writeMirror(log) {
  if (!game.user.isGM) return false;
  try {
    const FP = foundry.applications.apps.FilePicker?.implementation ?? FilePicker;
    const json = JSON.stringify(log, null, 2);
    const file = new File([json], FILE, { type: "application/json" });
    const res = await FP.upload("data", DIR, file, {}, { notify: false });
    return !!res;
  } catch (err) {
    console.warn(`${MODULE} | JSON mirror failed (the world setting is still authoritative)`, err);
    return false;
  }
}

/**
 * Append one entry. GM-only — everything else routes here through socketlib.
 * De-dupes, because Item Piles hooks can fire on more than one client.
 */
async function recordAsGM(entry) {
  if (!game.user.isGM) return null;
  const log = readLog();

  const key = `${entry.reason}|${entry.itemName}|${entry.fromActorId}|${entry.quantity}`;
  const tail = log[log.length - 1];
  if (tail && `${tail.reason}|${tail.itemName}|${tail.fromActorId}|${tail.quantity}` === key
      && entry.t - tail.t < DEDUPE_MS) {
    return tail.n;
  }

  const n = (game.settings.get(MODULE, COUNTER) ?? 0) + 1;
  const row = { n, ...entry };
  log.push(row);

  await game.settings.set(MODULE, COUNTER, n);
  await game.settings.set(MODULE, LOG, log);
  await writeMirror(log);

  console.log(`${MODULE} | #${n} ${entry.reason}: ${entry.itemName} from ${entry.fromActorName}`);
  return n;
}

/** Called from any client. Routes to a GM if this client is not one. */
function submit(entry) {
  if (game.user.isGM) return recordAsGM(entry);
  if (socket) return socket.executeAsGM("record", entry);
  console.warn(`${MODULE} | no socketlib and not a GM — entry dropped`, entry);
  return null;
}

/* -------------------------------------------------------------- entry shape */

function baseEntry(reason, actor, itemObj, quantity) {
  return {
    t: Date.now(),
    iso: new Date().toISOString(),
    reason,
    userId: game.user.id,
    userName: game.user.name,
    fromActorId: actor?.id ?? null,
    fromActorName: actor?.name ?? null,
    fromActorUuid: actor?.uuid ?? null,
    itemName: itemObj?.name ?? "(unnamed)",
    itemType: itemObj?.type ?? null,
    quantity: quantity ?? itemObj?.system?.quantity ?? 1,
    sceneId: canvas?.scene?.id ?? null,
    sceneName: canvas?.scene?.name ?? null,
    x: null, y: null,
    pileUuid: null,
    item: itemObj ?? null
  };
}

/* ------------------------------------------------------------------- capture */

function registerCapture() {
  const H = game.itempiles?.hooks;

  // 1. dropped onto the canvas as an Item Pile
  if (H?.ITEM?.DROP) {
    Hooks.on(H.ITEM.DROP, (source, target, itemDeltas, position) => {
      try {
        const actor = source?.actor ?? source;
        const deltas = Array.isArray(itemDeltas) ? itemDeltas : [itemDeltas].filter(Boolean);
        for (const d of deltas) {
          const doc = d?.item ?? d;
          const obj = doc?.toObject ? doc.toObject() : foundry.utils.duplicate(doc ?? {});
          const e = baseEntry("drop", actor, obj, Math.abs(d?.quantity ?? obj?.system?.quantity ?? 1));
          e.x = position?.x ?? null;
          e.y = position?.y ?? null;
          e.pileUuid = target?.uuid ?? (typeof target === "string" ? target : null);
          submit(e);
        }
      } catch (err) {
        console.warn(`${MODULE} | drop capture failed`, err);
      }
    });
  }

  // 2. deleted straight off a character sheet — capture BEFORE it is unreachable
  Hooks.on("preDeleteItem", (item, options, userId) => {
    try {
      if (userId !== game.user.id) return;               // one client records, not all
      const actor = item?.parent;
      if (!actor || actor.documentName !== "Actor") return;
      if (actor.type !== game.itempiles?.API?.ACTOR_CLASS_TYPE) return;   // characters only
      if (game.itempiles?.API?.isValidItemPile?.(actor)) return;          // piles are not losses
      if (options?.[MODULE]?.restoring) return;                          // don't log our own undo
      submit(baseEntry("delete", actor, item.toObject(), item.system?.quantity ?? 1));
    } catch (err) {
      console.warn(`${MODULE} | delete capture failed`, err);
    }
  });
}

/* ----------------------------------------------------------------------- API */

function buildAPI() {
  return {
    all: () => readLog(),
    list: (n = 20) => readLog().slice(-n).reverse(),
    get: (n) => readLog().find(e => e.n === Number(n)) ?? null,
    search: (text) => {
      const q = String(text).toLowerCase();
      return readLog().filter(e => (e.itemName ?? "").toLowerCase().includes(q));
    },

    /** Recreate entry #n. Defaults to the actor it left; pass an Actor or id to redirect. */
    restore: async (n, target = null) => {
      if (!game.user.isGM) return ui.notifications.warn("Only the GM can restore from the drop bin.");
      const entry = readLog().find(e => e.n === Number(n));
      if (!entry) return ui.notifications.error(`Drop bin: no entry #${n}.`);

      const actor = target instanceof Actor ? target
        : (typeof target === "string" ? (game.actors.get(target) ?? game.actors.getName(target)) : null)
        ?? game.actors.get(entry.fromActorId);
      if (!actor) return ui.notifications.error(`Drop bin: cannot find an actor to restore #${n} onto.`);

      const obj = foundry.utils.duplicate(entry.item);
      delete obj._id;
      const [made] = await actor.createEmbeddedDocuments("Item", [obj], { [MODULE]: { restoring: true } });
      ui.notifications.info(`Restored ${made.name} to ${actor.name} (drop bin #${n}).`);
      return made;
    },

    export: async () => {
      if (!game.user.isGM) return false;
      const ok = await writeMirror(readLog());
      ui.notifications.info(ok ? `Drop bin written to ${DIR}/${FILE}` : "Drop bin mirror failed — see console.");
      return ok;
    },

    clear: async () => {
      if (!game.user.isGM) return false;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Clear the drop bin?" },
        content: `<p>This wipes <strong>${readLog().length}</strong> ledger entries. The JSON mirror is overwritten too.</p>`
      }).catch(() => false);
      if (!confirmed) return false;
      await game.settings.set(MODULE, LOG, []);
      await writeMirror([]);
      return true;
    }
  };
}

/* --------------------------------------------------------------- lifecycle */

Hooks.once("init", () => {
  game.settings.register(MODULE, LOG, { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(MODULE, COUNTER, { scope: "world", config: false, type: Number, default: 0 });
});

Hooks.once("socketlib.ready", () => {
  socket = socketlib.registerModule(MODULE);
  socket.register("record", recordAsGM);
});

/**
 * Publish the API.
 *
 * Deliberately deferred by a tick. `pentaryn-importer` does
 * `game.pentaryn = Object.freeze({...})` in its own ready hook, replacing the
 * whole namespace — and module ready-hooks fire in alphabetical order of module
 * id, so "pentaryn-dropbin" runs *before* "pentaryn-importer" and would be wiped
 * by it. ("pings", "ties" and "walls" all sort after the importer, which is why
 * they never hit this.) A setTimeout(0) puts us after every ready handler in the
 * tick, so we see the frozen object and take the spread branch.
 */
function publishAPI() {
  const api = buildAPI();
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, dropbin: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.dropbin = api;
  }
  if (game.user.isGM) console.log(`${MODULE} | ready — ${readLog().length} entries on the ledger`);
}

Hooks.once("ready", () => {
  registerCapture();
  setTimeout(publishAPI, 0);
});

/* ------------------------------------------- item-piles attunement repair */
/**
 * Item Piles 3.3.4 nulls `system.attunement` on every item it puts on an actor.
 * dnd5e 5.3.3 then stores that null as the *string* `"NaN"`, so a looted magic
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

Hooks.once("ready", async () => {
  await loadAttunementIndex();
  Hooks.on("preCreateItem", repairAttunement);
  if (game.user.isGM) console.log(`${MODULE} | attunement repair armed — ${attunementByName.size} items indexed`);
});

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
const LOCK_SOUND = "sounds/lock.wav";   // ships with Foundry core

function lockedContainerData(target) {
  const actor = target?.actor ?? target;
  const data = actor?.getFlag?.("item-piles", "data");
  if (!data?.enabled || data.type !== "container" || !data.locked) return null;
  return { actor, data };
}

function announceLocked(actor, { playSound }) {
  if (playSound) {
    try { foundry.audio.AudioHelper.play({ src: LOCK_SOUND, volume: 0.8 }, true); }
    catch (err) { console.warn(`${MODULE} | could not play the lock sound`, err); }
  }
  ui.notifications.warn(`${actor?.name ?? "It"} is locked.`);
  try {
    const tok = canvas.tokens?.placeables.find(t => t.actor?.id === actor?.id);
    if (tok) canvas.interface.createScrollingText(tok.center, "Locked", {
      anchor: CONST.TEXT_ANCHOR_POINTS.TOP, fontSize: 28, fill: "#d8433a", stroke: 0x000000, strokeThickness: 4 });
  } catch (err) { /* off-screen or no canvas — the notification is enough */ }
}

/**
 * Every container gets a lock sound, whether or not it is locked today, so that
 * locking one later is a one-flag change and not a hunt for why it is silent.
 */
async function ensureLockSounds() {
  if (!game.user.isGM) return;
  let patched = 0;
  for (const actor of game.actors) {
    const data = actor.getFlag("item-piles", "data");
    if (!data?.enabled || data.type !== "container" || data.lockedSound) continue;
    await actor.update({ "flags.item-piles.data.lockedSound": LOCK_SOUND,
                         "prototypeToken.flags.item-piles.data.lockedSound": LOCK_SOUND });
    patched++;
  }
  for (const scene of game.scenes) {
    const updates = [];
    for (const tok of scene.tokens) {
      const data = tok.getFlag("item-piles", "data");
      if (!data?.enabled || data.type !== "container" || data.lockedSound) continue;
      updates.push({ _id: tok.id, "flags.item-piles.data.lockedSound": LOCK_SOUND });
    }
    if (updates.length) { await scene.updateEmbeddedDocuments("Token", updates); patched += updates.length; }
  }
  if (patched) console.log(`${MODULE} | lock sound set on ${patched} container document(s)`);
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

const isPileActor = id => !!game.actors.get(id)?.getFlag("item-piles", "data")?.enabled;

/**
 * A readable behind an eye pin is meant to be found by looking at the thing, so
 * its journal must not also sit in the players' Journal sidebar where they can
 * read the binding incantation without ever walking to the plaque. Anything
 * pinned to a scene Note is hidden; a genuine handout, which has no pin, stays.
 */
function isNotePinnedJournal(id) {
  for (const scene of game.scenes) for (const note of scene.notes) {
    if (note.entryId === id) return true;
  }
  return false;
}

// Registered at module load, not in `ready` — the sidebar paints before ready
// fires, and a hook added afterwards misses that first render entirely.
Hooks.on("renderActorDirectory", (app, el) => hideRowsFromDirectory(app, el, isPileActor));
Hooks.on("renderJournalDirectory", (app, el) => hideRowsFromDirectory(app, el, isNotePinnedJournal));

Hooks.once("ready", async () => {
  Hooks.on("item-piles-preRenderInterface", (target) => {
    if (game.user.isGM) return;
    const hit = lockedContainerData(target);
    if (!hit) return;
    announceLocked(hit.actor, { playSound: true });
    return false;                       // cancels the render — this is the actual lock
  });

  // Item Piles has a "force open default sheet" keybind — Left Ctrl out of the
  // box — and holding it makes the module stand aside entirely, so a Ctrl-click
  // on a pile opens the raw dnd5e actor sheet with the loot sitting on its
  // Inventory tab. `preRenderInterface` never fires on that path because no
  // interface is being rendered. Refuse the sheet itself: returning false from
  // item-piles' own preRenderActorSheet hook suppresses the render, and it fires
  // for ApplicationV2 sheets and for the bypass alike.
  Hooks.on("item-piles-preRenderActorSheet", (doc) => {
    if (game.user.isGM) return;
    const hit = lockedContainerData(doc);
    if (!hit) return;
    announceLocked(hit.actor, { playSound: true });
    return false;
  });

  // The canvas double-click already refuses and plays lockedSound itself; all
  // this adds is the words. PRE_RATTLE is local to the clicking client, unlike
  // RATTLE, which item-piles broadcasts to everyone.
  Hooks.on("item-piles-preRattleItemPile", (actor) => {
    if (game.user.isGM) return;
    announceLocked(actor, { playSound: false });
  });

  // The directory hooks above were registered at load time, but the sidebar has
  // already painted by now — repaint it once so the first render is filtered too.
  if (!game.user.isGM) { ui.actors?.render(); ui.journal?.render(); }

  await ensureLockSounds();
});
