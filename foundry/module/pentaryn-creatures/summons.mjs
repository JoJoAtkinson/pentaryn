/**
 * Pentaryn Creatures — FEATURE: the summon library. A player whose role may not create actors
 * (core Create New Actors; at this table the Player role) can still summon from a compendium:
 * Mage Hand, a DDB summon, a Find Familiar pick from the Compendium Browser.
 *
 * How (feedback Swrl5M, UQSJ0v, dkt5PG, 2026-10-19):
 *  1. dnd5e's `SummonActivity#placeSummons` calls `Actor5e.fetchExisting(uuid, { origin })`. That
 *     reuses a world copy the player owns, else imports one, which needs ACTOR_CREATE and threw
 *     "You must have 'Create New Actors' permission in order to summon directly from a compendium."
 *  2. We wrap `fetchExisting`. dnd5e runs first; only when it throws on a player's client without
 *     ACTOR_CREATE (core `shouldRelaySummon`) do we ask the active GM through the relay query
 *     `pentaryn-creatures.summonActor` and hand dnd5e the copy the GM made.
 *  3. The GM checks the sender owns the summoning item's actor and that the source is one the
 *     item's summon activities can summon (core `summonAllowed`), then creates the copy: owned by
 *     the player and the character's owners, `flags.dnd5e.isAutoImported`, its source in `_stats`,
 *     in `PC Summons & Forms/<First name> — summons & forms`. Its `_id` is deterministic
 *     (core `libraryActorId`), so two GM tabs answering the same relay make one actor.
 *  4. From then on dnd5e finds that copy itself: the library fills up as the player summons.
 *
 * Players with ACTOR_CREATE and GMs never reach the relay: dnd5e's own import is unchanged for them.
 */

import {
  LIBRARY_ROOT, MODULE, SUMMON_ROW, libraryActorId, libraryFolderId, libraryFolderName, libraryRootId,
  shouldRelaySummon, summonAllowed,
} from "./creatures-core.mjs";
import { setting } from "./settings.mjs";
import { libraryActorData, summonActivities, targetSummary } from "./summons-adapter.mjs";
import { errorCode, fail, ok } from "./lib/errors.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { libWrapperRoute } from "./lib/patch-libwrapper.mjs";
import { queryGM } from "./lib/queries.mjs";

const QUERY = `${MODULE}.${SUMMON_ROW}`;
/** The GM imports a compendium actor (items, effects): give it longer than the kit's 10 s default. */
const QUERY_TIMEOUT_MS = 15000;
/** After the GM answers, how long the player's client waits for the create's broadcast. */
const ARRIVE_WAIT_MS = 3000;
const POLL_MS = 50;

let ctx = null;
let handle = null;

/* -------------------------------------------- */
/*  GM side                                     */
/* -------------------------------------------- */

/** `PC Summons & Forms/<First> — summons & forms`, found or made (deterministic ids). Null on failure. */
async function ensureLibraryFolder(summoner) {
  try {
    const actorFolders = game.folders.filter(f => f.type === "Actor");
    let root = game.folders.get(libraryRootId()) ?? actorFolders.find(f => f.name === LIBRARY_ROOT);
    if (!root) {
      root = await Folder.implementation.create({ _id: libraryRootId(), name: LIBRARY_ROOT, type: "Actor" }, { keepId: true });
    }
    const name = libraryFolderName(summoner.name);
    const own = game.folders.get(libraryFolderId(summoner.id))
      ?? actorFolders.find(f => f.name === name && f.folder?.id === root?.id);
    if (own) return own;
    const maxDepth = CONST.FOLDER_MAX_DEPTH ?? 4;
    const parent = root && (root.depth ?? 1) < maxDepth ? root.id : null;
    return await Folder.implementation.create(
      { _id: libraryFolderId(summoner.id), name, type: "Actor", folder: parent }, { keepId: true });
  } catch (err) {
    ctx?.log.warn("summon library: folder not made, the copy goes to the root", err);
    return null;
  }
}

/** The summoning character: a token's synthetic actor answers for its base actor. */
const summonerOf = item => {
  const a = item?.actor ?? null;
  return a?.isToken ? (a.token?.baseActor ?? a) : a;
};

/**
 * The relay (and the API row): make the library copy of `uuid` for a summon from `item`.
 * Runs on the active GM's client; on any other client it asks the active GM. `qctx.user` is the
 * sender (core's query context); a direct call on the GM answers for the GM.
 */
async function summonActor(opts = {}, qctx) {
  const { uuid, item: itemUuid, dryRun = false } = opts ?? {};
  if (typeof uuid !== "string" || !uuid || typeof itemUuid !== "string" || !itemUuid) {
    return fail("BAD_ARGS", "summonActor({ uuid, item }) needs the source actor's uuid and the summoning item's uuid");
  }
  if (!game.user.isGM) {
    try {
      return await queryGM(QUERY, { uuid, item: itemUuid, dryRun }, { timeout: QUERY_TIMEOUT_MS });
    } catch (err) {
      return fail(errorCode(err) ?? "INTERNAL", String(err?.message ?? err));
    }
  }
  const user = qctx?.user ?? game.user;
  if (setting("summonLibrary") === false) return fail("REFUSED", "the summon library is switched off (setting summonLibrary)");
  const item = await fromUuid(itemUuid);
  const summoner = summonerOf(item);
  if (!item || !summoner) return fail("NOT_FOUND", `no summoning item ${itemUuid}`);
  if (!summoner.testUserPermission(user, "OWNER")) return fail("REFUSED", `${user.name} does not own ${summoner.name}`);
  const source = await fromUuid(uuid);
  if (source?.documentName !== "Actor") return fail("NOT_FOUND", `no actor ${uuid}`);
  const check = summonAllowed(summonActivities(item), targetSummary(source));
  if (!check.ok) return fail("REFUSED", `${source.name}: ${check.reason} (${item.name})`);

  const linked = source.prototypeToken?.actorLink === true;
  const _id = libraryActorId({ summonerId: summoner.id, sourceUuid: uuid, originUuid: linked ? itemUuid : null });
  const existing = game.actors.get(_id);
  if (existing) {
    if (!existing.testUserPermission(user, "OWNER") && !dryRun) await existing.update({ [`ownership.${user.id}`]: 3 });
    return ok({ actorId: _id, name: existing.name, created: false });
  }
  if (dryRun) return ok({ actorId: _id, name: source.name, created: false, dryRun: true, folder: libraryFolderName(summoner.name) });
  const folder = await ensureLibraryFolder(summoner);
  const data = libraryActorData(source, { _id, folderId: folder?.id ?? null, summoner, senderId: user.id });
  await Actor.implementation.create(data, { keepId: true });
  ctx?.log.info("summon library: copy made", { uuid: `Actor.${_id}`, ids: [_id], for: user.id, source: uuid });
  return ok({ actorId: _id, name: source.name, created: true, folderId: folder?.id ?? null });
}

/* -------------------------------------------- */
/*  Player side: the fetchExisting wrap         */
/* -------------------------------------------- */

/** The create's broadcast normally lands before the GM's answer; wait a little in case it has not. */
async function arrived(id) {
  for (let waited = 0; waited < ARRIVE_WAIT_MS; waited += POLL_MS) {
    const a = game.actors.get(id);
    if (a) return a;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  return game.actors.get(id) ?? null;
}

/**
 * An error dnd5e shows to the player as it is (its notification prints `message`), so no `CODE:`
 * prefix in the text; the code rides on `.code` for a script that catches it.
 */
function shown(code, message) {
  return Object.assign(new Error(message), { code });
}

/** dnd5e first; on a player's permission failure, the GM's copy. Errors are dnd5e's to show. */
async function fetchViaLibrary(wrapped, uuid, options = {}, ...rest) {
  try {
    return await wrapped(uuid, options, ...rest);
  } catch (err) {
    const relay = shouldRelaySummon({
      isGM: game.user.isGM,
      canCreate: game.user.can("ACTOR_CREATE"),
      enabled: setting("summonLibrary"),
      originKey: options?.origin?.key,
      originValue: options?.origin?.value,
    });
    if (!relay) throw err;
    const r = await summonActor({ uuid, item: options.origin.value });
    if (!r?.ok) {
      ctx?.log.warn("summon library: the GM did not make the copy", r);
      const reason = r?.code === "NO_GM" ? _loc("PENTARYN_CREATURES.summon.noGM") : (r?.reason ?? r?.code ?? "?");
      throw shown(r?.code ?? "INTERNAL", _loc("PENTARYN_CREATURES.summon.failed", { reason }));
    }
    const actor = await arrived(r.actorId);
    if (!actor) throw shown("NOT_FOUND", _loc("PENTARYN_CREATURES.summon.failed", { reason: `actor ${r.actorId} never arrived` }));
    return actor;
  }
}

/** Wrap dnd5e's static `Actor5e.fetchExisting` (setup: dnd5e has defined it by then). */
function patchFetch() {
  const target = globalThis.dnd5e?.documents?.Actor5e;
  if (typeof target?.fetchExisting !== "function") {
    ctx?.log.debug?.("dnd5e Actor5e.fetchExisting not found; the summon library is off");
    return;
  }
  handle = wrapMethod(MODULE, {
    target, name: "fetchExisting", label: "Actor5e.fetchExisting",
    path: "dnd5e.documents.Actor5e.fetchExisting", type: "WRAPPER",
    marker: "__pentarynCreaturesSummon", adjustments: "creatures-summon-library",
  }, function (wrapped, ...args) {
    return fetchViaLibrary(wrapped, ...args);
  }, { via: libWrapperRoute({ log: ctx?.log }), log: ctx?.log });
}

/* -------------------------------------------- */
/*  Read: a character's library                 */
/* -------------------------------------------- */

/** Every library copy made for this character (flag) or filed in its library folder, by name. */
function library(summoner) {
  const actor = summonerOf({ actor: summoner }) ?? summoner;
  const folder = game.folders.get(libraryFolderId(actor.id))
    ?? game.folders.find(f => f.type === "Actor" && f.name === libraryFolderName(actor.name) && f.folder?.name === LIBRARY_ROOT)
    ?? null;
  const seen = new Map();
  for (const a of game.actors) {
    const mine = a.flags?.[MODULE]?.library === actor.id || (folder && a.folder?.id === folder.id);
    if (mine) seen.set(a.id, a);
  }
  const summons = [...seen.values()]
    .map(a => ({ id: a.id, name: a.name, source: a._stats?.compendiumSource ?? a._stats?.duplicateSource ?? null }))
    .sort((x, y) => x.name.localeCompare(y.name) || (x.id < y.id ? -1 : 1));
  return { actor: { id: actor.id, name: actor.name }, folder: folder ? { id: folder.id, name: folder.name } : null, summons };
}

export function install(reg, context) {
  ctx = context;
  if (ctx.late) patchFetch();
  else reg.once("setup", patchFetch, { guard: false, label: "setup: wrap Actor5e.fetchExisting" });
  ctx.expose({ summonActor, library, summonPatched: () => handle?.via ?? null });
}

/** Undo the wrap (hot patch: then re-import the entry to wrap again). */
export function uninstall() {
  handle?.unwrap();
  handle = null;
}
