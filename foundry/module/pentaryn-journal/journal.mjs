/**
 * Pentaryn Player Journal
 * =======================
 *
 * A player reads an eye readable (a JournalEntry opened from a scene Note pin, its image popout, or
 * an item opened from an eye pile) and wants to keep it. This puts one big button under that
 * window, "Add to my journal". Clicking it copies what they were shown into their own personal
 * journal, then opens that journal on the new entry with the sidebar expanded. The entry is
 * selected and glowing among all their other entries, so the save is something they can see.
 *
 * One personal journal per user, found by flag and never by name:
 *
 *     entry.flags["pentaryn-journal"] = { kind: "personal", userId }
 *     ownership = { default: NONE, [userId]: OWNER }        (the GM can always read it)
 *
 * Each saved entry is a page carrying `flags["pentaryn-journal"].source` (the source uuid is the
 * dedup key, plus a hash of what was copied). When the original changes, the bar offers
 * "Update my copy".
 *
 * Players cannot create a JournalEntry (JOURNAL_CREATE is TRUSTED+), and nobody below ASSISTANT can
 * create a Folder. So the GM client pre-creates every player's journal on ready and on createUser.
 * As a fallback, a player asks the active GM through the native v14 user query
 * `pentaryn-journal.ensure`. The server names the sender (`context.user`), the payload is ignored,
 * and the only thing the relay can make is that sender's own journal.
 *
 * ⚠ Privacy. The copy is made on the player's own client, from the raw HTML that client already
 *   holds, and it goes through journal-core's `sanitize` first: unrevealed secrets are dropped,
 *   embeds become links, relative links are made absolute. Without that, the player's OWNER copy
 *   would render the GM secrets their OBSERVER view hid. Items use the unidentified description
 *   whenever the item is unidentified, for everyone, the GM included.
 *
 * Nothing here reloads any client. Exposes game.pentaryn.journal.
 */

import * as core from "./journal-core.mjs";

const { MODULE, QUERY } = core;
const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const warn = msg => ui.notifications.warn(msg);

/* -------------------------------------------- */
/*  Personal journals                           */
/* -------------------------------------------- */

// Plain flag reads, not getFlag (core.flagsOf): getFlag throws for a scope whose module is not
// active, and these run inside render hooks and sidebar filters where a throw would cost the window.
const { flagsOf, isPersonal } = core;
const isMine = entry => core.isMine(entry, game.user.id);

/** Every personal journal of a user, oldest first. The first one is THE journal. */
function personalsOf(userId) {
  return game.journal
    .filter(j => isPersonal(j) && flagsOf(j).userId === userId)
    .sort((a, b) => (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0));
}
function personal(user = game.user) { return personalsOf(user?.id)[0] ?? null; }

function folderName() {
  return game.settings.get(MODULE, "folderName") || game.i18n.localize("PENTARYN_JOURNAL.folder");
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

/** GM side: one creation per user however many callers ask at once. */
const gmInflight = new Map();
function ensureFor(user) {
  if (!game.user.isGM) return Promise.reject(new Error("GM only"));
  const v = core.validateEnsure(user, personal(user)?.id ?? null);
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
    try { await ensureFor(u); } catch (err) { console.warn(`${MODULE} | ensure failed for ${u.name}`, err); }
  }
  const stray = game.journal.filter(j => isPersonal(j) && !j.folder);
  if (stray.length) {
    const folder = await ensureFolder();
    await JournalEntry.updateDocuments(stray.map(j => ({ _id: j.id, folder: folder.id })));
  }
  return report();
}

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
    if (!gm) { warn(game.i18n.localize("PENTARYN_JOURNAL.notify.noGM")); return null; }
    try {
      await gm.query(QUERY, {}, { timeout: 8000 });
    } catch (err) {
      console.warn(`${MODULE} | ensure query failed`, err);
      warn(/timed? ?out/i.test(err?.message ?? "")
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
/*  What can be saved from a window             */
/* -------------------------------------------- */

/**
 * Who gets the bar on a journal (core.barVisible). The facts are getters so each is read only when
 * the rule reaches it, in the rule's order: the permission calls and the setting read happen exactly
 * where they did when this was one inline expression.
 */
function shouldShowBar(entry, user = game.user) {
  return core.barVisible({
    get isJournalEntry() { return !!entry && entry.documentName === "JournalEntry"; },
    get isPersonal() { return isPersonal(entry); },
    get inPack() { return !!entry.pack; },
    get isGM() { return user.isGM; },
    get gmButton() { return game.settings.get(MODULE, "gmButton"); },
    get observer() { return entry.testUserPermission(user, "OBSERVER"); },
    get owner() { return entry.testUserPermission(user, "OWNER"); },
  });
}

const pileData = actor => actor?.flags?.["item-piles"]?.data;
const isPile = actor => !!pileData(actor)?.enabled;

/**
 * The real item behind an item sheet. Item Piles shows a non-owner an unsaved, unparented COPY of
 * the pile's item (renderReadOnlyItemPreview), so the source is found by id among the piles.
 */
function itemSource(shown) {
  if (!shown || shown.documentName !== "Item") return null;
  if (isPile(shown.parent)) {
    const tok = shown.parent.token ?? canvas?.tokens?.placeables.find(t => t.actor === shown.parent)?.document;
    return { item: shown, pile: shown.parent, pileName: tok?.name ?? shown.parent.name };
  }
  if (shown.parent || shown.pack || game.items.has(shown.id)) return null;
  for (const t of canvas?.tokens?.placeables ?? []) {
    const it = isPile(t.actor) && t.actor.items.get(shown.id);
    if (it) return { item: it, pile: t.actor, pileName: t.document.name ?? t.actor.name };
  }
  for (const a of game.actors) {
    const it = isPile(a) && a.items.get(shown.id);
    if (it) return { item: it, pile: a, pileName: a.prototypeToken?.name || a.name };
  }
  return null;
}

/** Who gets the bar on a pile item (core.itemBarVisible); lazy facts as in shouldShowBar. */
function shouldShowItemBar(src, user = game.user) {
  return core.itemBarVisible({
    get hasSource() { return !!src; },
    get canInspectItems() { return pileData(src.pile)?.canInspectItems; },
    get isGM() { return user.isGM; },
    get gmButton() { return game.settings.get(MODULE, "gmButton"); },
    get observer() { return src.pile.testUserPermission(user, "OBSERVER"); },
    get owner() { return src.pile.testUserPermission(user, "OWNER"); },
  });
}

/** A relative uuid made absolute against the document it was written on. */
const resolverFor = doc => u => foundry.utils.parseUuid(u, { relative: doc })?.uuid ?? null;
const embeddedLabel = () => game.i18n.localize("PENTARYN_JOURNAL.provenance.embedded");

function pageDescriptor(page, entry) {
  const base = { kind: "page", key: page.uuid, name: core.pageName(page, entry), entryId: entry.id,
    entryName: entry.name, pageName: page.name };
  if (page.type === "image") return { ...base, type: "image", src: page.src ?? "", caption: page.image?.caption ?? "" };
  if (page.type === "text") {
    return { ...base, type: "text", body: core.sanitize(page.text?.content ?? "", { resolve: resolverFor(page), embeddedLabel: embeddedLabel() }) };
  }
  return { ...base, type: "text", body: "" };   // pdf, video, anything else: provenance and a link
}

function itemDescriptor(src) {
  const it = src.item;
  // Always the player's view: the unidentified text while unidentified, even for the GM.
  const desc = it.system?.identified === false
    ? (it.system?.unidentified?.description ?? "")
    : (it.system?.description?.value ?? "");
  const body = `<img class="pj-item-img" src="${esc(it.img)}" alt="">`
    + core.sanitize(desc, { resolve: resolverFor(it), embeddedLabel: embeddedLabel() });
  return { kind: "item", key: it.uuid, type: "text", name: it.name, body, entryId: null,
    entryName: src.pileName, pageName: it.name };
}

/**
 * A target is what a window shows: a journal entry (all its observable pages), one image page,
 * or one pile item. `null` means no bar.
 */
function targetFor(app) {
  const JES = foundry.applications.sheets.journal.JournalEntrySheet;
  if (app instanceof JES) {
    return shouldShowBar(app.document) ? { kind: "entry", entry: app.document } : null;
  }
  if (app instanceof foundry.applications.apps.ImagePopout) {
    const page = app.options?.uuid ? fromUuidSync(app.options.uuid) : null;
    if (page?.documentName !== "JournalEntryPage" || page.type !== "image") return null;
    return shouldShowBar(page.parent) ? { kind: "image", entry: page.parent, page } : null;
  }
  if (app.document?.documentName === "Item") {
    const src = itemSource(app.document);
    return shouldShowItemBar(src) ? { kind: "item", src } : null;
  }
  return null;
}

function descriptorsFor(target) {
  const user = game.user;
  if (target.kind === "item") return [itemDescriptor(target.src)];
  if (target.kind === "image") return [pageDescriptor(target.page, target.entry)];
  return target.entry.pages.contents
    .filter(p => p.testUserPermission(user, "OBSERVER"))
    .sort((a, b) => a.sort - b.sort)
    .map(p => pageDescriptor(p, target.entry));
}

/* -------------------------------------------- */
/*  Provenance: only names the player already sees */
/* -------------------------------------------- */

let lastNote = null;   // {noteId, sceneId, entryId, pageId, text, t}, from activateNote on this client

function provenanceFor(target) {
  if (target.kind === "item") return { place: target.src.pileName ?? null, noteText: null };
  const entry = target.entry;
  let scene = null, note = null;
  if (lastNote && lastNote.entryId === entry.id && Date.now() - lastNote.t < 5 * 60_000) {
    scene = game.scenes.get(lastNote.sceneId) ?? null;
    note = scene?.notes.get(lastNote.noteId) ?? null;
  }
  if (!note && canvas?.scene) {
    note = canvas.scene.notes.find(n => n.entryId === entry.id) ?? null;
    scene = note ? canvas.scene : null;
  }
  // Never scene.name: it is GM-authored and players are not shown it (core.placeFrom takes no scene name).
  const place = core.placeFrom({ navName: scene?.navName, folderName: entry.folder?.name });
  return { place, noteText: note?.text?.trim() || null };
}

function provenanceLabels() {
  return {
    foundIn: game.i18n.localize("PENTARYN_JOURNAL.provenance.foundIn"),
    found: game.i18n.localize("PENTARYN_JOURNAL.provenance.found"),
    original: game.i18n.localize("PENTARYN_JOURNAL.provenance.original"),
    date: ts => new Date(ts).toLocaleDateString(game.i18n.lang, { day: "numeric", month: "short", year: "numeric" })
  };
}

/* -------------------------------------------- */
/*  Saving and showing                          */
/* -------------------------------------------- */

/**
 * Copy a target into the current user's journal and open it on the result.
 * @returns {Promise<{journal, pageIds: string[], created: number, updated: number}|null>}
 */
async function save(target, { near } = {}) {
  const journal = await ensurePersonalJournal();
  if (!journal) return null;
  const sources = descriptorsFor(target);
  if (!sources.length) return null;
  const plan = core.planSave(journal.pages.contents, sources, {
    ...provenanceFor(target), now: Date.now(), worldTime: game.time.worldTime, labels: provenanceLabels()
  });
  if (plan.tooLarge) { warn(game.i18n.localize("PENTARYN_JOURNAL.notify.tooLarge")); return null; }
  const created = plan.create.length ? await journal.createEmbeddedDocuments("JournalEntryPage", plan.create) : [];
  if (plan.update.length) await journal.updateEmbeddedDocuments("JournalEntryPage", plan.update);
  const pageId = created[0]?.id ?? plan.update[0]?._id ?? plan.existing[0];
  const fresh = created.length > 0;
  await openSaved(journal, pageId, { justAdded: fresh, near });
  const name = journal.pages.get(pageId)?.name ?? "";
  if (fresh) ui.notifications.info(game.i18n.format("PENTARYN_JOURNAL.notify.added", { name }));
  else if (plan.update.length) ui.notifications.info(game.i18n.format("PENTARYN_JOURNAL.notify.updated", { name }));
  return { journal, pageIds: [...created.map(p => p.id), ...plan.update.map(u => u._id), ...plan.existing],
    created: created.length, updated: plan.update.length };
}

/** entryId → pageId whose TOC row and page should glow. Applied in the render hook (see below). */
const pending = new Map();

async function openSaved(journal, pageId, { justAdded = false, near } = {}) {
  if (!journal) return null;
  if (justAdded && pageId) pending.set(journal.id, pageId);
  const sheet = journal.sheet;
  const first = !sheet.rendered;
  const JES = foundry.applications.sheets.journal.JournalEntrySheet;
  await sheet.render({ force: true, pageId, mode: JES.VIEW_MODES.SINGLE, expanded: true });
  if (first && near?.position) sheet.setPosition({ left: near.position.left + 40, top: near.position.top + 40 });
  return sheet;
}

/**
 * Foundry re-renders an open journal itself when pages are created, which would wipe classes set
 * once after our own render. So the glow is (re)applied on every render of the user's journal
 * while it is pending, and ends when they navigate to another page or close the sheet.
 */
function applyHighlight(app, element, options) {
  const entry = app.document;
  if (!isMine(entry)) return;
  const want = pending.get(entry.id);
  if (!want) return;
  if (app.pageId !== want) {
    // Only a deliberate move to another page ends it, not a render that raced ours.
    if (options?.pageId && options.pageId !== want) pending.delete(entry.id);
    return;
  }
  const root = element ?? app.element;
  const li = root?.querySelector(`nav.toc li[data-page-id="${want}"]`);
  const article = root?.querySelector(`article.journal-entry-page[data-page-id="${want}"]`);
  article?.classList.add("pj-just-added");
  if (li) {
    li.classList.add("pj-just-added");
    const title = li.querySelector(".page-title") ?? li.querySelector(".page-heading");
    if (title && !li.querySelector(".pj-new")) {
      const badge = document.createElement("span");
      badge.className = "pj-new";
      badge.textContent = game.i18n.localize("PENTARYN_JOURNAL.new");
      title.after(badge);
    }
    li.scrollIntoView({ block: "nearest" });
  }
}

/* -------------------------------------------- */
/*  The bar                                     */
/* -------------------------------------------- */

const busy = new WeakSet();

function savedStatus(target) {
  const pages = personal()?.pages.contents ?? [];
  const sources = descriptorsFor(target);
  const st = core.status(pages, sources);
  const first = sources.map(s => core.findSaved(pages, s.key)).find(Boolean) ?? null;
  return { st, saved: first, sources };
}

function sinceText(ts) {
  try { return foundry.utils.timeSince(ts); } catch { return new Date(ts).toLocaleDateString(); }
}

function fillBar(app, bar, target) {
  if (busy.has(app)) {
    bar.innerHTML = `<button type="button" class="pj-add" disabled><i class="fa-solid fa-spinner fa-spin"></i> <span>${esc(game.i18n.localize("PENTARYN_JOURNAL.adding"))}</span></button>`;
    return;
  }
  const { st, saved } = savedStatus(target);
  const add = `<button type="button" class="pj-add" data-pj="add"><i class="fa-solid fa-book-medical"></i> <span>${esc(game.i18n.localize("PENTARYN_JOURNAL.add"))}</span></button>`;
  if (st === "saved") {
    const when = saved?.flags?.[MODULE]?.source?.updatedAt ?? saved?.flags?.[MODULE]?.source?.savedAt;
    bar.innerHTML = `<button type="button" class="pj-open" data-pj="open"><i class="fa-solid fa-book-open"></i> <span>${esc(game.i18n.localize("PENTARYN_JOURNAL.saved"))} · ${esc(game.i18n.localize("PENTARYN_JOURNAL.open"))}</span></button>`
      + (when ? `<span class="pj-hint">${esc(game.i18n.format("PENTARYN_JOURNAL.hint.saved", { when: sinceText(when) }))}</span>` : "");
  } else if (st === "changed") {
    bar.innerHTML = `<button type="button" class="pj-update" data-pj="add"><i class="fa-solid fa-rotate"></i> <span>${esc(game.i18n.localize("PENTARYN_JOURNAL.update"))}</span></button>`
      + `<button type="button" class="pj-open" data-pj="open"><i class="fa-solid fa-book-open"></i> <span>${esc(game.i18n.localize("PENTARYN_JOURNAL.open"))}</span></button>`
      + `<span class="pj-hint">${esc(game.i18n.localize("PENTARYN_JOURNAL.hint.changed"))}</span>`;
  } else {
    bar.innerHTML = add + `<span class="pj-hint">${esc(game.i18n.localize("PENTARYN_JOURNAL.hint.add"))}</span>`;
  }
}

async function onBarClick(app, ev) {
  const btn = ev.target.closest("button[data-pj]");
  if (!btn || btn.disabled) return;
  ev.preventDefault();
  const target = targetFor(app);
  if (!target) return;
  if (btn.dataset.pj === "open") {
    const { saved } = savedStatus(target);
    return openSaved(personal(), saved?.id, { near: app });
  }
  if (busy.has(app)) return;
  busy.add(app);
  decorate(app);
  try {
    const result = await save(target, { near: app });
    // The copy is in the journal now; the window it came from has done its job.
    if (result && app !== personalSheet()) await app.close();
  } catch (err) {
    console.error(`${MODULE} | add failed`, err);
    warn(game.i18n.localize("PENTARYN_JOURNAL.notify.failed"));
  } finally {
    busy.delete(app);
    refreshBarsNow();
  }
}

/**
 * Put the bar on a window, refresh it, or take it off. Idempotent; called on every render.
 * It is a footer on the window ROOT, after .window-content, so part re-renders never touch it.
 */
function decorate(app) {
  const root = app?.element;
  if (!(root instanceof HTMLElement)) return;
  let bar = root.querySelector(":scope > .pj-bar");
  const target = targetFor(app);
  if (!target) {
    bar?.remove();
    root.classList.remove("pentaryn-journal-readable");
    return;
  }
  if (!bar) {
    bar = document.createElement("footer");
    bar.className = "pj-bar";
    const content = root.querySelector(":scope > .window-content");
    if (content) content.after(bar); else root.append(bar);
    bar.addEventListener("click", ev => onBarClick(app, ev));
  }
  root.classList.add("pentaryn-journal-readable");
  fillBar(app, bar, target);
}

function refreshBarsNow() {
  for (const app of foundry.applications.instances.values()) {
    if (!app.rendered) continue;
    try { decorate(app); } catch (err) { console.warn(`${MODULE} | bar refresh skipped`, err); }
  }
}
const refreshBars = foundry.utils.debounce(refreshBarsNow, 100);

/* -------------------------------------------- */
/*  API helpers                                 */
/* -------------------------------------------- */

/** Turn an entry, a page or an item into a target, applying the same rules as the bar. */
function targetOf(doc) {
  if (!doc) return null;
  if (doc.documentName === "JournalEntry") return shouldShowBar(doc) ? { kind: "entry", entry: doc } : null;
  if (doc.documentName === "JournalEntryPage") {
    if (!shouldShowBar(doc.parent)) return null;
    return doc.type === "image" ? { kind: "image", entry: doc.parent, page: doc } : { kind: "entry", entry: doc.parent };
  }
  if (doc.documentName === "Item") {
    const src = itemSource(doc);
    return shouldShowItemBar(src) ? { kind: "item", src } : null;
  }
  return null;
}

async function apiAdd(doc) {
  const target = targetOf(doc);
  if (!target) return null;
  return save(target);
}

function apiStatus(doc) {
  const target = targetOf(doc);
  if (!target) return null;
  const { st, sources } = savedStatus(target);
  if (!sources.length && doc?.uuid && core.findSaved(personal()?.pages.contents, doc.uuid)) return "saved";
  return st;
}

async function apiOpen(pageId) {
  const j = personal();
  if (!j) return null;
  return openSaved(j, pageId ?? j.pages.contents.at(-1)?.id);
}

/** The current user's own journal sheet, if that is the window in question. */
const personalSheet = () => personal()?.sheet;

/**
 * A readable behind an eye is one piece of information, not a book: when the entry has a single
 * page the player can see, its page list and page arrows are hidden. Personal journals are never
 * touched (they are the list), nor is the GM's view (it is where pages get edited). Behind the
 * `singlePageReadables` setting so a multi-page eye can come back later.
 */
function isEyeReadable(entry) {
  return game.scenes.some(s => s.notes.some(n => n.entryId === entry.id));
}
function applySinglePage(app) {
  const root = app?.element;
  if (!(root instanceof HTMLElement)) return;
  const entry = app.document;
  const on = core.singlePage({
    get isGM() { return game.user.isGM; },
    get setting() { return game.settings.get(MODULE, "singlePageReadables"); },
    get isPersonal() { return isPersonal(entry); },
    get isEyeReadable() { return isEyeReadable(entry); },
    get visiblePages() { return entry.pages.filter(p => p.testUserPermission(game.user, "LIMITED")).length; },
  });
  root.classList.toggle("pj-single", on);
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE, "gmButton", {
    name: "PENTARYN_JOURNAL.settings.gmButton.name",
    hint: "PENTARYN_JOURNAL.settings.gmButton.hint",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => refreshBars()
  });
  game.settings.register(MODULE, "singlePageReadables", {
    name: "PENTARYN_JOURNAL.settings.singlePage.name",
    hint: "PENTARYN_JOURNAL.settings.singlePage.hint",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => { for (const a of foundry.applications.instances.values()) if (a.rendered && a.document?.documentName === "JournalEntry") applySinglePage(a); }
  });
  game.settings.register(MODULE, "folderName", {
    scope: "world", config: false, type: String, default: "Player Journals"
  });

  // The relay. `user` is the sender as the server knows it; the payload is not read at all.
  CONFIG.queries[QUERY] = async (_data, { user } = {}) => {
    if (!game.user.isGM || !game.users.activeGM?.isSelf) throw new Error("not the active GM");
    const j = await ensureFor(user);
    return { entryId: j.id };
  };
});

Hooks.once("ready", () => {
  if (game.user.isGM && game.users.activeGM?.isSelf) {
    ensureAll().catch(err => console.warn(`${MODULE} | ensureAll failed`, err));
  }
});

Hooks.on("createUser", user => {
  if (!game.user.isGM || !game.users.activeGM?.isSelf || user.isGM) return;
  ensureFor(user).catch(err => console.warn(`${MODULE} | ensure failed for ${user.name}`, err));
});

// Remember which pin opened what, for the provenance line. Never cancels the open.
Hooks.on("activateNote", (note, options) => {
  try {
    const d = note.document;
    lastNote = { noteId: d.id, sceneId: d.parent?.id, entryId: d.entryId, pageId: options?.pageId ?? d.pageId,
      text: d.text, t: Date.now() };
  } catch {}
});

Hooks.on("renderJournalEntrySheet", (app, element, context, options) => {
  try { decorate(app); } catch (err) { console.warn(`${MODULE} | bar skipped`, err); }
  try { applyHighlight(app, element, options); } catch (err) { console.warn(`${MODULE} | highlight skipped`, err); }
  try { applySinglePage(app); } catch (err) { console.warn(`${MODULE} | single-page skipped`, err); }
});
Hooks.on("renderImagePopout", app => {
  try { decorate(app); } catch (err) { console.warn(`${MODULE} | bar skipped`, err); }
});
Hooks.on("renderItemSheet5e", app => {
  try { decorate(app); } catch (err) { console.warn(`${MODULE} | bar skipped`, err); }
});
Hooks.on("closeJournalEntrySheet", app => { pending.delete(app.document?.id); });

for (const h of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) {
  Hooks.on(h, () => refreshBars());
}
for (const h of ["createJournalEntry", "deleteJournalEntry"]) {
  Hooks.on(h, entry => { if (isMine(entry)) refreshBars(); });
}
Hooks.on("updateItem", () => refreshBars());

// Published one tick after ready (publishing synchronously is a declared step of the migration). The
// importer merges into game.pentaryn and nothing freezes it since its keystone (items-journal-1), so
// the old frozen-root guard is gone (kit 1.0.2, J10): the API is assigned into the plain root.
Hooks.once("ready", () => setTimeout(() => {
  const api = {
    personal, add: apiAdd, status: apiStatus, open: apiOpen, shouldShowBar,
    ensure: ensureFor, ensureAll, report, core
  };
  game.pentaryn ??= {};
  game.pentaryn.journal = api;
}, 0));
