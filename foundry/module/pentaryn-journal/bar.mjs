/**
 * Pentaryn Player Journal — FEATURE: the bar. "Add to my journal" under any journal (or its image
 * popout) the player can observe but does not own, pinned by a scene Note or not, and under any item
 * in an inspectable eye pile (README "Who sees it"): the footer itself, saving into the personal journal, the glow on the new entry, the single-page
 * view for one-page eyes, and the provenance line (only names the player already sees).
 *
 * ⚠ Privacy. The copy is made on the player's own client, from the raw HTML that client already
 *   holds, and it goes through journal-core's `sanitize` first (in sources-adapter's descriptors):
 *   unrevealed secrets are dropped, embeds become links, relative links are made absolute. Without
 *   that, the player's OWNER copy would render the GM secrets their OBSERVER view hid.
 *
 * The personal journal is reached through `ctx.exposed` (personal.mjs), never an import.
 */

import {
  MODULE, escapeHTML, findSaved, isMine, isPersonal, makePinnedCache, needsItemRefresh, placeFrom, planSave, singlePage,
  skipReason, status,
} from "./journal-core.mjs";
import { setting, whenChanged } from "./settings.mjs";
import { descriptorsFor, targetFor as targetForApp } from "./sources-adapter.mjs";

/**
 * The bar's own strings are escaped with core.escapeHTML (items-journal-32): rendered text is the same
 * as Foundry's escaper, only an apostrophe is spelled `&#39;` instead of `&#x27;` in innerHTML. The
 * item image inside a saved body keeps Foundry's escaper (sources-adapter.mjs: that body is hashed).
 */
const barEsc = escapeHTML;
/** A player-facing warning toast (not a console line). */
const toast = msg => ui.notifications.warn(msg);
const targetFor = app => targetForApp(app, { gmButton: setting("gmButton") });

/** The entry's ctx, set by install(): `log`, `exposed`. */
let ctx = null;

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
  // Never scene.name: it is GM-authored and players are not shown it (placeFrom takes no scene name).
  const place = placeFrom({ navName: scene?.navName, folderName: entry.folder?.name });
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

/** Why the last save() on this client wrote nothing (core.skipReason), or null. */
let lastSkip = null;

/** One console breadcrumb per add that wrote nothing (the toasts, if any, are unchanged). */
function skipped(facts, target) {
  lastSkip = skipReason(facts);
  ctx.log.info(`add skipped: ${lastSkip}`, { target: target?.kind ?? null, journal: facts.journal?.id ?? null });
  return null;
}

/** The last save() on this client; the next one waits for it, settled either way (double-save). */
let saving = Promise.resolve();

/**
 * Copy a target into the current user's journal and open it on the result. Calls on this client run
 * one at a time, so a second quick save plans from the page the first wrote instead of copying again.
 * @returns {Promise<{journal, pageIds: string[], created: number, updated: number}|null>}
 */
function save(target, opts) {
  const run = saving.then(() => saveNow(target, opts));
  saving = run.catch(() => {});
  return run;
}

async function saveNow(target, { near } = {}) {
  lastSkip = null;
  const journal = await ctx.exposed.ensurePersonalJournal();
  if (!journal) return skipped({ journal }, target);
  const sources = descriptorsFor(target);
  if (!sources.length) return skipped({ journal, sources }, target);
  const plan = planSave(journal.pages.contents, sources, {
    ...provenanceFor(target), now: Date.now(), worldTime: game.time.worldTime, labels: provenanceLabels()
  });
  if (plan.tooLarge) {
    toast(game.i18n.localize("PENTARYN_JOURNAL.notify.tooLarge"));
    return skipped({ journal, sources, plan }, target);
  }
  const created = plan.create.length ? await journal.createEmbeddedDocuments("JournalEntryPage", plan.create) : [];
  if (plan.update.length) await journal.updateEmbeddedDocuments("JournalEntryPage", plan.update);
  const pageId = created[0]?.id ?? plan.update[0]?._id ?? plan.existing[0];
  const fresh = created.length > 0;
  // The copy exists now: a window that will not open must not turn that into a failed save (journal-rob-6).
  try { await openSaved(journal, pageId, { justAdded: fresh, near }); } catch (err) { ctx.log.warn("open after save failed", err); }
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
  if (!isMine(entry, game.user.id)) return;
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

/** `pages`: the user's journal pages, when the caller already has them (one personal() per action or refresh pass). */
function savedStatus(target, pages = ctx.exposed.personal()?.pages.contents ?? []) {
  const sources = descriptorsFor(target);
  const st = status(pages, sources);
  let first = null;
  for (const s of sources) {
    first = findSaved(pages, s.key);
    if (first) break;
  }
  return { st, saved: first ?? null, sources };
}

function sinceText(ts) {
  try { return foundry.utils.timeSince(ts); } catch { return new Date(ts).toLocaleDateString(); }
}

/** `shown`: savedStatus(target), or null while the window is busy adding. */
function fillBar(bar, shown) {
  if (!shown) {
    bar.innerHTML = `<button type="button" class="pj-add" disabled><i class="fa-solid fa-spinner fa-spin"></i> <span>${barEsc(game.i18n.localize("PENTARYN_JOURNAL.adding"))}</span></button>`;
    return;
  }
  const { st, saved } = shown;
  const add = `<button type="button" class="pj-add" data-pj="add"><i class="fa-solid fa-book-medical"></i> <span>${barEsc(game.i18n.localize("PENTARYN_JOURNAL.add"))}</span></button>`;
  if (st === "saved") {
    const when = saved?.flags?.[MODULE]?.source?.updatedAt ?? saved?.flags?.[MODULE]?.source?.savedAt;
    bar.innerHTML = `<button type="button" class="pj-open" data-pj="open"><i class="fa-solid fa-book-open"></i> <span>${barEsc(game.i18n.localize("PENTARYN_JOURNAL.saved"))} · ${barEsc(game.i18n.localize("PENTARYN_JOURNAL.open"))}</span></button>`
      + (when ? `<span class="pj-hint">${barEsc(game.i18n.format("PENTARYN_JOURNAL.hint.saved", { when: sinceText(when) }))}</span>` : "");
  } else if (st === "changed") {
    bar.innerHTML = `<button type="button" class="pj-update" data-pj="add"><i class="fa-solid fa-rotate"></i> <span>${barEsc(game.i18n.localize("PENTARYN_JOURNAL.update"))}</span></button>`
      + `<button type="button" class="pj-open" data-pj="open"><i class="fa-solid fa-book-open"></i> <span>${barEsc(game.i18n.localize("PENTARYN_JOURNAL.open"))}</span></button>`
      + `<span class="pj-hint">${barEsc(game.i18n.localize("PENTARYN_JOURNAL.hint.changed"))}</span>`;
  } else {
    bar.innerHTML = add + `<span class="pj-hint">${barEsc(game.i18n.localize("PENTARYN_JOURNAL.hint.add"))}</span>`;
  }
}

async function onBarClick(app, ev) {
  const btn = ev.target.closest("button[data-pj]");
  if (!btn || btn.disabled) return;
  ev.preventDefault();
  const target = targetFor(app);
  if (!target) return;
  if (btn.dataset.pj === "open") {
    const journal = ctx.exposed.personal();
    const { saved } = savedStatus(target, journal?.pages.contents ?? []);
    return openSaved(journal, saved?.id, { near: app });
  }
  if (busy.has(app)) return;
  busy.add(app);
  try {
    decorate(app);   // inside the try: a throw here must not leave the bar on "Adding…" (bar-stuck)
    const result = await save(target, { near: app });
    // The copy is in the journal now; the window it came from has done its job.
    if (result && app !== personalSheet()) await app.close();
  } catch (err) {
    ctx.log.error("add failed", err);
    toast(game.i18n.localize("PENTARYN_JOURNAL.notify.failed"));
  } finally {
    busy.delete(app);
    refreshBarsNow();
  }
}

/**
 * Put the bar on a window, refresh it, or take it off (no target, or no page this user can see).
 * Idempotent; called on every render.
 * It is a footer on the window ROOT, after .window-content, so part re-renders never touch it.
 * `userPages`: () → the user's journal pages, looked up once per refreshBarsNow pass (journal-perf-4);
 * the render hooks leave it out and savedStatus looks them up.
 */
function decorate(app, userPages) {
  const root = app?.element;
  if (!(root instanceof HTMLElement)) return;
  let bar = root.querySelector(":scope > .pj-bar");
  const target = targetFor(app);
  const shown = target && !busy.has(app) ? savedStatus(target, userPages?.()) : null;
  // No page this user can see: a bar there would add nothing, so it is hidden too (journal-EC-3).
  if (!target || shown?.sources.length === 0) {
    barKind.delete(app);
    bar?.remove();
    root.classList.remove("pentaryn-journal-readable");
    return;
  }
  barKind.set(app, target.kind);
  if (!bar) {
    bar = document.createElement("footer");
    bar.className = "pj-bar";
    const content = root.querySelector(":scope > .window-content");
    if (content) content.after(bar); else root.append(bar);
    bar.addEventListener("click", ev => onBarClick(app, ev).catch(err => ctx.log.warn("bar click failed", err)));
  }
  root.classList.add("pentaryn-journal-readable");
  fillBar(bar, shown);
}

/** app → the kind of target its bar shows ("entry" | "image" | "item"), while it has one. */
const barKind = new WeakMap();

/** The target kinds of the bars on rendered windows now. */
function openBarKinds() {
  const kinds = [];
  for (const app of foundry.applications.instances.values()) if (app.rendered && barKind.has(app)) kinds.push(barKind.get(app));
  return kinds;
}

function refreshBarsNow() {
  let pages;   // looked up on the first bar that needs it, then shared by the rest of the pass
  const userPages = () => (pages ??= ctx.exposed.personal()?.pages.contents ?? []);
  for (const app of foundry.applications.instances.values()) {
    if (!app.rendered) continue;
    try { decorate(app, userPages); } catch (err) { ctx.log.warn("bar refresh skipped", err); }
  }
}
/** Every bar, 100 ms after the last of a burst of changes (created in install: needs foundry). */
let refreshBars = () => {};

/** The current user's own journal sheet, if that is the window in question. */
const personalSheet = () => ctx.exposed.personal()?.sheet;

/**
 * Which journals a scene Note pins, cached (items-journal-38): applySinglePage runs on every journal
 * render, and the answer used to walk every scene's notes each time. Forgotten whenever a Note or a
 * Scene is created, updated or deleted (a Scene update only when it changes `notes`, pinned-cache).
 * Those six listeners are registered on first use (always after ready: only a journal render asks),
 * not at load — the load-time hook manifest stays as it was.
 */
const pins = makePinnedCache(() => game.scenes);
const PIN_HOOKS = ["createNote", "updateNote", "deleteNote", "createScene", "deleteScene"];
let watchingPins = false;

function isEyeReadable(entry) {
  if (!watchingPins) {
    watchingPins = true;
    for (const h of PIN_HOOKS) ctx.reg.on(h, () => pins.invalidate(), { label: `${h}: forget pinned journals` });
    ctx.reg.on("updateScene", (_scene, changed) => { if (changed && "notes" in changed) pins.invalidate(); },
      { label: "updateScene: forget pinned journals when its notes change" });
  }
  return pins.has(entry.id);
}

/**
 * A readable behind an eye is one piece of information, not a book: when the entry has a single
 * page the player can see, its page list and page arrows are hidden. Personal journals are never
 * touched (they are the list), nor is the GM's view (it is where pages get edited). Behind the
 * `singlePageReadables` setting so a multi-page eye can come back later.
 */
function applySinglePage(app) {
  const root = app?.element;
  if (!(root instanceof HTMLElement)) return;
  const entry = app.document;
  const on = singlePage({
    get isGM() { return game.user.isGM; },
    get setting() { return setting("singlePageReadables"); },
    get isPersonal() { return isPersonal(entry); },
    get isEyeReadable() { return isEyeReadable(entry); },
    get visiblePages() { return entry.pages.filter(p => p.testUserPermission(game.user, "LIMITED")).length; },
  });
  root.classList.toggle("pj-single", on);
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** whenChanged removers, so uninstall() detaches from settings.mjs. */
const offSettings = [];

export function install(reg, context) {
  ctx = context;
  refreshBars = foundry.utils.debounce(refreshBarsNow, 100);
  offSettings.push(
    whenChanged("gmButton", () => refreshBars()),
    whenChanged("singlePageReadables", () => {
      for (const a of foundry.applications.instances.values()) {
        if (!(a.rendered && a.document?.documentName === "JournalEntry")) continue;
        try { applySinglePage(a); } catch (err) { ctx.log.warn("single-page skipped", err); }
      }
    }),
  );

  // Remember which pin opened what, for the provenance line. Never cancels the open.
  reg.on("activateNote", (note, options) => {
    try {
      const d = note.document;
      lastNote = { noteId: d.id, sceneId: d.parent?.id, entryId: d.entryId, pageId: options?.pageId ?? d.pageId,
        text: d.text, t: Date.now() };
    } catch (err) {
      ctx.log.debug("activateNote: provenance not recorded", err);
    }
  }, { label: "activateNote: remember the pin" });

  reg.on("renderJournalEntrySheet", (app, element, context, options) => {
    try { decorate(app); } catch (err) { ctx.log.warn("bar skipped", err); }
    try { applyHighlight(app, element, options); } catch (err) { ctx.log.warn("highlight skipped", err); }
    try { applySinglePage(app); } catch (err) { ctx.log.warn("single-page skipped", err); }
  }, { label: "renderJournalEntrySheet: bar, glow, single page" });
  reg.on("renderImagePopout", app => {
    try { decorate(app); } catch (err) { ctx.log.warn("bar skipped", err); }
  }, { label: "renderImagePopout: bar" });
  reg.on("renderItemSheet5e", app => {
    try { decorate(app); } catch (err) { ctx.log.warn("bar skipped", err); }
  }, { label: "renderItemSheet5e: bar" });
  reg.on("closeJournalEntrySheet", app => { pending.delete(app.document?.id); }, { label: "closeJournalEntrySheet: end the glow" });

  for (const h of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) {
    reg.on(h, () => refreshBars(), { label: `${h}: refresh bars` });
  }
  for (const h of ["createJournalEntry", "deleteJournalEntry"]) {
    reg.on(h, entry => { if (isMine(entry, game.user.id)) refreshBars(); }, { label: `${h}: refresh bars (own journal)` });
  }
  // Only an item bar can change with an item (items-journal-33); entry and image bars never read items.
  reg.on("updateItem", () => { if (needsItemRefresh(openBarKinds())) refreshBars(); }, { label: "updateItem: refresh item bars" });

  ctx.expose({ save, openSaved, savedStatus, lastSkip: () => lastSkip });
}

export function uninstall() {
  for (const off of offSettings.splice(0)) off();
  refreshBars.cancel?.();
  refreshBars = () => {};
  pending.clear();
  lastNote = null;
  lastSkip = null;
  pins.invalidate();
  watchingPins = false;
}
