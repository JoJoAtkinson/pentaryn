/**
 * Pentaryn Creatures — FEATURE: the summon library. Every compendium summon a character makes is a
 * world copy filed in `PC Summons & Forms/<First name> — summons & forms`, owned by the character's
 * owners, and reused by dnd5e on every later summon.
 *
 * Two ways a copy is made:
 *  A. The relay (feedback Swrl5M, UQSJ0v, dkt5PG, 2026-10-19), for a player whose role may not create
 *     actors. dnd5e's `SummonActivity#placeSummons` calls `Actor5e.fetchExisting(uuid, { origin })`,
 *     which reuses an owned copy or imports one (needs ACTOR_CREATE; else it throws "You must have
 *     'Create New Actors' permission…"). We wrap it: dnd5e runs first; only that refusal, on a player
 *     without ACTOR_CREATE (core `shouldRelaySummon`), goes to the active GM through the relay query
 *     `pentaryn-creatures.summonActor`. The GM checks (below), creates the copy with a deterministic
 *     `_id` (core `libraryActorId`) already filed, and dnd5e gets it.
 *  B. dnd5e's own import, for a GM or a player who may create actors (every player at this table,
 *     0.3.0). The copy lands in the character's own folder, owned by the caster only. On
 *     `dnd5e.postSummon` (the summoning client, after the tokens are placed) we file it: on a GM
 *     client directly, on a player's through the relay query `pentaryn-creatures.fileLibrary`.
 *
 * What the GM checks before copying for a player (summonActor): the sender owns the summoning item's
 * character; the source is not a player character and the sender may already see it (a world actor at
 * OBSERVER, a compendium they may observe: core `summonSourceRefusal`); and it is one the item can
 * summon, judged by the item's compendium original when it has one (the world item is the player's to
 * edit: core `summonAllowedFrom`).
 *
 * `fileLibrary()` on the GM with no actor is the sweep: it files every loose copy whose summoner it can
 * tell (core `pickSummoner`), in one batch, with `dryRun`.
 */

import {
  LIBRARY_ROOT, MODULE, SUMMON_ROW, isSummonCopy, libraryActorId, libraryFiling, libraryFolderId,
  libraryFolderName, libraryRootId, pickSummoner, shouldRelaySummon, summonAllowedFrom, summonSourceRefusal,
} from "./creatures-core.mjs";
import { setting } from "./settings.mjs";
import {
  copySummary, copyTarget, isCreateRefusal, libraryActorData, originalActivities, sourceVisible,
  summonActivities, targetSummary,
} from "./summons-adapter.mjs";
import { errorCode, fail, ok } from "./lib/errors.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { libWrapperRoute } from "./lib/patch-libwrapper.mjs";
import { queryGM } from "./lib/queries.mjs";

const QUERY = `${MODULE}.${SUMMON_ROW}`;
const FILE_QUERY = `${MODULE}.fileLibrary`;
/** The GM imports a compendium actor (items, effects): give it longer than the kit's 10 s default. */
const QUERY_TIMEOUT_MS = 15000;
/** After a create, how long a client waits for a document to arrive (the GM's broadcast, or the other GM tab's). */
const ARRIVE_WAIT_MS = 3000;
const POLL_MS = 50;

let ctx = null;
let handle = null;

/** `fn()` until it answers, for up to `ms`. */
async function waitFor(fn, ms = ARRIVE_WAIT_MS) {
  for (let waited = 0; waited < ms; waited += POLL_MS) {
    const v = fn();
    if (v) return v;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  return fn() ?? null;
}

/**
 * Create, or find what another GM tab created: two tabs answering one relay both create the same
 * deterministic id, and the server refuses the second (the id exists). The refused tab then finds the
 * first tab's document instead of failing; a create that fails for any other reason still throws.
 * @returns {Promise<{ doc: object, created: boolean }>}
 */
async function createOrFind(create, find) {
  let made = null;
  let error = null;
  try {
    made = await create();
  } catch (err) {
    error = err;
  }
  if (made) return { doc: made, created: true };
  const other = await waitFor(find);
  if (other) return { doc: other, created: false };
  throw error ?? new Error("the create was refused");
}

/* -------------------------------------------- */
/*  GM side                                     */
/* -------------------------------------------- */

/** The character's library folder if it exists (a read: no writes). */
function findLibraryFolder(summoner) {
  const actorFolders = game.folders.filter(f => f.type === "Actor");
  const root = game.folders.get(libraryRootId()) ?? actorFolders.find(f => f.name === LIBRARY_ROOT) ?? null;
  const name = libraryFolderName(summoner.name);
  return game.folders.get(libraryFolderId(summoner.id))
    ?? actorFolders.find(f => f.name === name && (f.folder?.id ?? null) === (root?.id ?? null))
    ?? null;
}

/** `PC Summons & Forms/<First> — summons & forms`, found or made (deterministic ids). Null on failure. */
async function ensureLibraryFolder(summoner) {
  try {
    const own = findLibraryFolder(summoner);
    if (own) return own;
    const findRoot = () => game.folders.get(libraryRootId())
      ?? game.folders.find(f => f.type === "Actor" && f.name === LIBRARY_ROOT);
    const root = findRoot() ?? (await createOrFind(
      () => Folder.implementation.create({ _id: libraryRootId(), name: LIBRARY_ROOT, type: "Actor" }, { keepId: true }),
      findRoot)).doc;
    const maxDepth = CONST.FOLDER_MAX_DEPTH ?? 4;
    const parent = root && (root.depth ?? 1) < maxDepth ? root.id : null;
    return (await createOrFind(
      () => Folder.implementation.create(
        { _id: libraryFolderId(summoner.id), name: libraryFolderName(summoner.name), type: "Actor", folder: parent },
        { keepId: true }),
      () => findLibraryFolder(summoner))).doc;
  } catch (err) {
    ctx?.log.warn("summon library: folder not made, the copy stays where it is", err);
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
  // the uuid and the item are the sender's to choose: never a PC, never an actor they cannot already see
  const refusal = summonSourceRefusal({ actorType: source.type, visible: sourceVisible(source, user) });
  if (refusal) return fail("REFUSED", `${uuid}: ${refusal}`);
  const check = summonAllowedFrom(
    { original: await originalActivities(item), world: summonActivities(item) }, targetSummary(source));
  if (!check.ok) return fail("REFUSED", `${source.name}: ${check.reason} (${item.name})`);

  const linked = source.prototypeToken?.actorLink === true;
  const originUuid = linked ? itemUuid : null;
  const _id = libraryActorId({ summonerId: summoner.id, sourceUuid: uuid, originUuid });
  const existing = game.actors.get(_id);
  if (existing) {
    // the sender joins the owners; a linked copy made before 0.3.0 gains dnd5e's summon origin
    const changes = libraryFiling(copySummary(existing),
      { summonerId: summoner.id, summonerOwnership: { [user.id]: 3 }, originUuid });
    if (changes && !dryRun) await existing.update(changes);
    return ok({ actorId: _id, name: existing.name, created: false });
  }
  if (dryRun) return ok({ actorId: _id, name: source.name, created: false, dryRun: true, folder: libraryFolderName(summoner.name) });
  const folder = await ensureLibraryFolder(summoner);
  const data = libraryActorData(source, { _id, folderId: folder?.id ?? null, summoner, senderId: user.id, originUuid });
  let created;
  try {
    ({ created } = await createOrFind(() => Actor.implementation.create(data, { keepId: true }), () => game.actors.get(_id)));
  } catch (err) {
    return fail("INTERNAL", `the copy of ${source.name} was not made: ${err?.message ?? err}`);
  }
  if (created) ctx?.log.info("summon library: copy made", { uuid: `Actor.${_id}`, ids: [_id], by: game.user.id, for: user.id, source: uuid });
  return ok({ actorId: _id, name: source.name, created, folderId: folder?.id ?? null });
}

/* -------------------------------------------- */
/*  Filing dnd5e's own copies                   */
/* -------------------------------------------- */

/** Non-GM users who own this document (level 3). */
const playerOwners = doc => Object.entries(doc?.ownership ?? {})
  .filter(([k, v]) => k !== "default" && v === 3 && game.users.get(k) && !game.users.get(k).isGM)
  .map(([k]) => k);

/**
 * The filing of one copy for one character: `{ entry, update }` (update null when already filed).
 * With `write`, the library folder is made when missing; without, nothing is written.
 */
async function planFiling(copy, summoner, { originUuid = null, write = false } = {}) {
  const folder = write ? await ensureLibraryFolder(summoner) : findLibraryFolder(summoner);
  const folderId = folder?.id ?? (write ? null : libraryFolderId(summoner.id));
  const changes = libraryFiling(copySummary(copy),
    { summonerId: summoner.id, summonerOwnership: summoner.ownership, folderId, originUuid });
  const entry = {
    id: copy.id, name: copy.name, summoner: summoner.name,
    folder: folder?.name ?? libraryFolderName(summoner.name), changes: changes ? Object.keys(changes) : [],
  };
  return { entry, update: changes ? { _id: copy.id, ...changes } : null };
}

/** One batch for every filing update; the audit line names them. */
async function writeFilings(updates, by) {
  if (!updates.length) return;
  await Actor.implementation.updateDocuments(updates);
  const ids = updates.map(u => u._id);
  ctx?.log.info("summon library: copies filed", { uuid: ids.map(id => `Actor.${id}`), ids, by: game.user.id, for: by });
}

/** One copy, for the summoning item (relay-checked) or, GM only, for a named character. */
async function fileOne({ actorRef, itemUuid, summonerRef, dryRun, user }) {
  const found = typeof actorRef === "object" ? actorRef
    : game.actors.get(actorRef) ?? (await fromUuid(actorRef).catch(() => null));
  const copy = found?.documentName === "Actor" && !found.pack ? game.actors.get(found.id) ?? null : null;
  if (!copy) return fail("NOT_FOUND", `no world actor ${actorRef?.id ?? actorRef}`);
  const summary = copySummary(copy);
  if (!isSummonCopy(summary)) return fail("REFUSED", `${copy.name} is not an auto-imported summon copy`);
  if (!copy.testUserPermission(user, "OWNER")) return fail("REFUSED", `${user.name} does not own ${copy.name}`);
  let summoner;
  let originUuid = null;
  if (itemUuid) {
    const item = await fromUuid(itemUuid);
    summoner = summonerOf(item);
    if (!item || !summoner) return fail("NOT_FOUND", `no summoning item ${itemUuid}`);
    if (!summoner.testUserPermission(user, "OWNER")) return fail("REFUSED", `${user.name} does not own ${summoner.name}`);
    const check = summonAllowedFrom(
      { original: await originalActivities(item), world: summonActivities(item) }, copyTarget(summary));
    if (!check.ok) return fail("REFUSED", `${copy.name}: ${check.reason} (${item.name})`);
    originUuid = itemUuid;
  } else if (summonerRef && user.isGM) {
    summoner = game.actors.get(summonerRef) ?? game.actors.getName(summonerRef) ?? null;
    if (!summoner) return fail("NOT_FOUND", `no character ${summonerRef}`);
  } else {
    return fail("BAD_ARGS", "fileLibrary({ actor }) needs the summoning item (or, as the GM, the summoner)");
  }
  const { entry, update } = await planFiling(copy, summoner, { originUuid, write: !dryRun });
  if (!dryRun && update) await writeFilings([update], user.id);
  return ok({ dryRun, filed: update ? [entry] : [], already: update ? 0 : 1, unresolved: [] });
}

/** The GM's sweep: every loose summon copy whose character can be told, filed in one batch. */
async function sweep({ dryRun }) {
  const characters = game.actors.filter(a => a.type === "character" && playerOwners(a).length);
  const summonsOf = new Map();
  for (const c of characters) {
    const items = [];
    for (const item of c.items ?? []) {
      const world = summonActivities(item);
      if (world.length) items.push({ world, original: await originalActivities(item) });
    }
    summonsOf.set(c.id, items);
  }
  const filed = [];
  const unresolved = [];
  const updates = [];
  let already = 0;
  for (const copy of game.actors) {
    const s = copySummary(copy);
    if (!isSummonCopy(s)) continue;
    let summoner = s.library ? game.actors.get(s.library) ?? null : null;
    let originUuid = null;
    if (!summoner && s.origin) {
      const item = await fromUuid(s.origin).catch(() => null);
      summoner = summonerOf(item);
      if (summoner) originUuid = s.origin;
    }
    if (!summoner) {
      const target = copyTarget(s);
      const pick = pickSummoner({
        copyOwners: playerOwners(copy),
        candidates: characters.map(c => ({
          id: c.id, owners: playerOwners(c),
          canSummon: summonsOf.get(c.id).some(i => summonAllowedFrom(i, target).ok),
        })),
      });
      if (!pick.id) {
        unresolved.push({ id: copy.id, name: copy.name, reason: pick.reason });
        continue;
      }
      summoner = game.actors.get(pick.id);
    }
    const { entry, update } = await planFiling(copy, summoner, { originUuid, write: !dryRun });
    if (!update) {
      already += 1;
      continue;
    }
    filed.push(entry);
    updates.push(update);
  }
  if (!dryRun) await writeFilings(updates, game.user.id);
  return ok({ dryRun, filed, already, unresolved });
}

/**
 * The API row and the relay query `pentaryn-creatures.fileLibrary`. A player files one copy they own
 * for the item that summoned it (asks the active GM); the GM may also name the character, or pass
 * nothing to sweep every loose copy. Idempotent: a filed copy writes nothing.
 */
async function fileLibrary(opts = {}, qctx) {
  const { actor: actorRef = null, item: itemUuid = null, summoner: summonerRef = null, dryRun = false } = opts ?? {};
  if (!game.user.isGM) {
    if (typeof actorRef !== "string" || !actorRef || typeof itemUuid !== "string" || !itemUuid) {
      return fail("BAD_ARGS", "a player files one copy: fileLibrary({ actor, item })");
    }
    try {
      return await queryGM(FILE_QUERY, { actor: actorRef, item: itemUuid, dryRun }, { timeout: QUERY_TIMEOUT_MS });
    } catch (err) {
      return fail(errorCode(err) ?? "INTERNAL", String(err?.message ?? err));
    }
  }
  const user = qctx?.user ?? game.user;
  if (setting("summonLibrary") === false) return fail("REFUSED", "the summon library is switched off (setting summonLibrary)");
  if (actorRef) return fileOne({ actorRef, itemUuid, summonerRef, dryRun: dryRun === true, user });
  if (!user.isGM) return fail("REFUSED", "only a GM sweeps the summon library");
  return sweep({ dryRun: dryRun === true });
}

/**
 * dnd5e.postSummon, on the summoning client: file the copies dnd5e itself imported (a GM, or a player
 * who may create actors) for a player-owned character. A copy that is already filed costs nothing.
 */
async function fileAfterSummon(activity, _profile, tokens) {
  if (setting("summonLibrary") === false) return;
  const item = activity?.item;
  const summoner = summonerOf(item);
  if (!item || !summoner?.hasPlayerOwner) return;
  const ids = [...new Set((tokens ?? []).map(t => t?.actorId).filter(Boolean))];
  for (const id of ids) {
    const copy = game.actors.get(id);
    const summary = copySummary(copy);
    if (!copy || !isSummonCopy(summary)) continue;
    const folderId = findLibraryFolder(summoner)?.id ?? libraryFolderId(summoner.id);
    const pending = libraryFiling(summary,
      { summonerId: summoner.id, summonerOwnership: summoner.ownership, folderId, originUuid: item.uuid });
    if (!pending) continue;
    const r = await fileLibrary({ actor: id, item: item.uuid });
    if (!r?.ok) ctx?.log.warn("summon library: copy not filed (the GM can run fileLibrary())", { id, code: r?.code, reason: r?.reason });
  }
}

/* -------------------------------------------- */
/*  Player side: the fetchExisting wrap         */
/* -------------------------------------------- */

/**
 * An error dnd5e shows to the player as it is (its notification prints `message`), so no `CODE:`
 * prefix in the text; the code rides on `.code` for a script that catches it.
 */
function shown(code, message) {
  return Object.assign(new Error(message), { code });
}

/** dnd5e first; only its Create New Actors refusal, on a player, becomes the GM's copy. */
async function fetchViaLibrary(wrapped, uuid, options = {}, ...rest) {
  try {
    return await wrapped(uuid, options, ...rest);
  } catch (err) {
    const relay = shouldRelaySummon({
      refused: isCreateRefusal(err),
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
    const actor = await waitFor(() => game.actors.get(r.actorId));
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
  reg.on("dnd5e.postSummon", fileAfterSummon, { label: "dnd5e.postSummon: file the copy in the library" });
  ctx.expose({ summonActor, fileLibrary, library, summonPatched: () => handle?.via ?? null });
}

/** Undo the wrap (hot patch: then re-import the entry to wrap again). */
export function uninstall() {
  handle?.unwrap();
  handle = null;
}
