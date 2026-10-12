/**
 * Pentaryn Player Journal — FEATURE: personal journals. Finding a user's journal, the folder, the
 * GM-side creation (`ensureFor`, `ensureAll`), `report()`, the client-side `ensurePersonalJournal`
 * and the player relay.
 *
 * One personal journal per user, found by flag and never by name:
 *
 *     entry.flags["pentaryn-journal"] = { kind: "personal", userId }
 *     ownership = { default: NONE, [userId]: OWNER }        (the GM can always read it)
 *
 * Players cannot create a JournalEntry (JOURNAL_CREATE is TRUSTED+), and nobody below ASSISTANT can
 * create a Folder. So the active GM's client pre-creates every player's journal on ready and on
 * createUser. As a fallback, a player asks the active GM through the native v14 user query
 * `pentaryn-journal.ensure`: the server names the sender (`context.user`), the payload is ignored,
 * and the only thing the relay can make is that sender's own journal.
 *
 * Other features and api.mjs reach this file through `ctx.exposed` (install below).
 */

import { MODULE, QUERY, claimWinner, isMine, isPersonal, validateEnsure } from "./journal-core.mjs";
import { setting } from "./settings.mjs";
import { flagPath, readFlag } from "./lib/flags.mjs";
import { relayed } from "./lib/queries.mjs";

const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;
/** A player-facing warning toast (not a console line). */
const toast = msg => ui.notifications.warn(msg);

/** The entry's ctx, set by install(): `log` for the console lines. */
let ctx = null;

/** Every personal journal of a user, oldest first. The first one is THE journal. */
function personalsOf(userId) {
  return game.journal
    .filter(j => isMine(j, userId))
    .sort((a, b) => (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0));
}
function personal(user = game.user) { return personalsOf(user?.id)[0] ?? null; }
/** Every personal journal not in a folder (a player made it at the root). */
const atRootJournals = () => game.journal.filter(j => isPersonal(j) && !j.folder);

function folderName() {
  return setting("folderName") || game.i18n.localize("PENTARYN_JOURNAL.folder");
}
function findFolder() {
  const name = folderName();
  return game.folders.find(f => f.type === "JournalEntry" && f.name === name) ?? null;
}

let folderInflight = null;
/** GM only: find or create the "Player Journals" folder. */
function ensureFolder() {
  const f = findFolder();
  if (f) return Promise.resolve(f);
  folderInflight ??= Folder.create({ name: folderName(), type: "JournalEntry" })
    .finally(() => { folderInflight = null; });
  return folderInflight;
}

function createPersonal(user, folderId) {
  return JournalEntry.create({
    name: game.i18n.format("PENTARYN_JOURNAL.journalName", { name: user.character?.name ?? user.name }),
    folder: folderId ?? null,
    ownership: { default: OWN().NONE, [user.id]: OWN().OWNER },
    flags: { [MODULE]: { kind: "personal", userId: user.id } }
  });
}

/** GM side: one creation per user however many callers ask at once (in this tab). */
const gmInflight = new Map();
function ensureFor(user) {
  if (!game.user.isGM) return Promise.reject(new Error("GM only"));
  const v = validateEnsure(user, personal(user)?.id ?? null);
  if (!v.ok) return Promise.reject(new Error(v.reason));
  if (v.entryId) return Promise.resolve(game.journal.get(v.entryId));
  if (gmInflight.has(user.id)) return gmInflight.get(user.id);
  const p = (async () => {
    const folder = await ensureFolder();
    return personal(user) ?? createPersonal(user, folder?.id ?? null);
  })().finally(() => gmInflight.delete(user.id));
  gmInflight.set(user.id, p);
  return p;
}

/** GM: a journal for every player, and any journal a player made at the root moved into the folder. */
async function ensureAll() {
  if (!game.user.isGM) return null;
  const players = game.users.filter(u => !u.isGM);
  for (const u of players) {
    try { await ensureFor(u); } catch (err) { ctx.log.warn(`ensure failed for ${u.name}`, err); }
  }
  const stray = atRootJournals();
  if (stray.length) {
    const folder = await ensureFolder();
    await JournalEntry.updateDocuments(stray.map(j => ({ _id: j.id, folder: folder.id })));
  }
  return report();
}

/** Users, their journal ids, page counts, duplicates and journals at the root. Not gated: ids only. */
function report() {
  const users = game.users.map(u => {
    const all = personalsOf(u.id);
    return { user: u.name, userId: u.id, isGM: u.isGM, journalId: all[0]?.id ?? null,
      pages: all[0]?.pages.size ?? 0, duplicates: all.slice(1).map(j => j.id) };
  });
  const atRoot = atRootJournals().map(j => j.id);
  return { folder: findFolder()?.id ?? null, users, atRoot };
}

/** How long the player waits for the GM's answer to the ensure query. */
const QUERY_TIMEOUT_MS = 8_000;

/** Client side: the current user's journal, creating it (or asking the GM to) the first time. */
let inflight = null;
async function ensurePersonalJournal() {
  const user = game.user;
  const found = personal(user);
  if (found) return found;
  if (inflight) return inflight;
  inflight = (async () => {
    if (JournalEntry.canUserCreate(user)) {
      // A player who may create journals still cannot create folders (ASSISTANT). It goes to the
      // root, and the GM's next ensureAll moves it in.
      const folder = user.isGM ? await ensureFolder() : findFolder();
      return createPersonal(user, folder?.id ?? null);
    }
    const gm = game.users.activeGM;
    if (!gm) { toast(game.i18n.localize("PENTARYN_JOURNAL.notify.noGM")); return null; }
    try {
      await gm.query(QUERY, {}, { timeout: QUERY_TIMEOUT_MS });
    } catch (err) {
      ctx.log.warn("ensure query failed", err);
      toast(/timed? ?out/i.test(err?.message ?? "")
        ? game.i18n.localize("PENTARYN_JOURNAL.notify.timeout")
        : game.i18n.localize("PENTARYN_JOURNAL.notify.failed"));
      return null;
    }
    // The createJournalEntry broadcast normally lands before the query reply; allow a second if not.
    for (let i = 0; i < 10 && !personal(user); i++) await new Promise(r => setTimeout(r, 100));
    return personal(user);
  })().finally(() => { inflight = null; });
  return inflight;
}

/* -------------------------------------------- */
/*  The relay: one GM tab creates (items-journal-40) */
/* -------------------------------------------- */

/** Where the tabs stamp their claim: `flags.pentaryn-journal.claims.ensure.<socketId>` on the SENDER's User. */
const CLAIM = "claims.ensure";
/** A stamp older than this is a tab that died mid-claim; it no longer blocks anyone. */
const CLAIM_STALE_MS = 60_000;
/** How long the losing tab waits for the winner's journal: under QUERY_TIMEOUT_MS, the player's query timeout. */
const LOSER_WAIT_MS = 7_000;
const POLL_MS = 50;

/**
 * The query reaches every tab of the active GM's account (the MCP bridge tab and a GM browser tab
 * are both activeGM.isSelf), and both would look before either create lands. So, when there is a
 * journal to make, each tab stamps its socket id on the sender's User; the first stamp in the
 * server's order wins (core.claimWinner) and runs ensureFor. The loser does not answer early — the
 * server keeps the first answer — it waits for the winner's journal to arrive and answers with that.
 * Each tab removes its own stamp when it is done. With one tab this is one extra User update.
 */
async function relayEnsure(user) {
  const me = game.socket?.id ?? null;
  if (!me || !user?.id || user.isGM || personal(user)) return ensureFor(user);   // nothing to race for
  const mine = flagPath(MODULE, `${CLAIM}.${me}`);
  try {
    await user.update({ [mine]: Date.now() });
  } catch (err) {
    // e.g. an Assistant GM who may not update Users: answer as before rather than not at all
    ctx?.log.warn("ensure (relay): could not stamp the claim — answering without it", err);
    return ensureFor(user);
  }
  try {
    if (claimWinner(readFlag(user, MODULE, CLAIM), me, Date.now(), CLAIM_STALE_MS)) return await ensureFor(user);
    ctx?.log.debug("ensure (relay): another GM tab claimed it — waiting for its journal", { user: user.id });
    return await waitForPersonal(user);
  } finally {
    await user.update({ [mine]: _del }).catch(err => ctx?.log.warn("ensure (relay): claim not released", err));
  }
}

async function waitForPersonal(user) {
  for (let waited = 0; waited < LOSER_WAIT_MS; waited += POLL_MS) {
    const found = personal(user);
    if (found) return found;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  const found = personal(user);
  if (found) return found;
  throw new Error("another GM tab claimed this journal and did not finish");
}

/**
 * The player relay, registered at init on every client (the sender's client needs the name too),
 * through the kit's `relayed`: any sender, and only the active GM's client runs it — any other
 * answers `NOT_GM: this client is not the active GM`. `user` is the sender as the server knows it;
 * the payload is not read at all, and the only journal it can make is the sender's own.
 *
 * Still assigned here rather than through a manifest row (C56): the kit's registerQueries does not
 * pass the query context (the sender) to the implementation yet (wave-2 report, kit gap).
 */
export function registerRelay() {
  CONFIG.queries[QUERY] = relayed(async (_data, { user } = {}) => {
    const j = await relayEnsure(user);
    ctx?.log.info("ensure (relay)", { uuid: j.uuid, ids: [j.id], by: game.user.id, for: user?.id ?? null });
    return { entryId: j.id };
  });
}

export function install(reg, context) {
  ctx = context;
  reg.once("ready", () => {
    if (game.user.isGM && game.users.activeGM?.isSelf) {
      ensureAll().catch(err => ctx.log.warn("ensureAll failed", err));
    }
  }, { label: "ready: ensureAll (active GM)" });

  reg.on("createUser", user => {
    if (!game.user.isGM || !game.users.activeGM?.isSelf || user.isGM) return;
    ensureFor(user).catch(err => ctx.log.warn(`ensure failed for ${user.name}`, err));
  }, { label: "createUser: ensure (active GM)" });

  ctx.expose({ personal, personalsOf, ensurePersonalJournal, ensureFor, ensureAll, report, findFolder });
}

export function uninstall() {
  gmInflight.clear();
  folderInflight = null;
  inflight = null;
}
