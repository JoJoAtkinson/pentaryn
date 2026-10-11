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

import { MODULE, QUERY, flagsOf, isPersonal, validateEnsure } from "./journal-core.mjs";
import { setting } from "./settings.mjs";

const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;
/** A player-facing warning toast (not a console line). */
const toast = msg => ui.notifications.warn(msg);

/** The entry's ctx, set by install(): `log` for the console lines. */
let ctx = null;

/** Every personal journal of a user, oldest first. The first one is THE journal. */
function personalsOf(userId) {
  return game.journal
    .filter(j => isPersonal(j) && flagsOf(j).userId === userId)
    .sort((a, b) => (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0));
}
function personal(user = game.user) { return personalsOf(user?.id)[0] ?? null; }

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
  const stray = game.journal.filter(j => isPersonal(j) && !j.folder);
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
  const atRoot = game.journal.filter(j => isPersonal(j) && !j.folder).map(j => j.id);
  return { folder: findFolder()?.id ?? null, users, atRoot };
}

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
      await gm.query(QUERY, {}, { timeout: 8000 });
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

/**
 * The relay, registered at init on every client (the sender's client needs the name too). `user` is
 * the sender as the server knows it; the payload is not read at all.
 */
export function registerRelay() {
  CONFIG.queries[QUERY] = async (_data, { user } = {}) => {
    if (!game.user.isGM || !game.users.activeGM?.isSelf) throw new Error("not the active GM");
    const j = await ensureFor(user);
    return { entryId: j.id };
  };
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
