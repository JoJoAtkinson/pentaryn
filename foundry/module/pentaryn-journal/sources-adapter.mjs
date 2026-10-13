/**
 * Pentaryn Player Journal — ADAPTER: Foundry documents, windows and Item Piles' pile data → plain
 * targets and descriptors. The only file that reads Item Piles' flags (`flags["item-piles"].data`).
 * May import core and lib only: the `gmButton` setting arrives as an argument.
 *
 *   target      what a window shows: {kind: "entry", entry} | {kind: "image", entry, page} |
 *               {kind: "item", src: {item, pile, pileName}}; null means no bar
 *   descriptor  one thing that can be saved: {kind, key, type, name, body | src+caption, entryId,
 *               entryName, pageName} (journal-core's planSave/status read these)
 */

import * as core from "./journal-core.mjs";

/**
 * `foundry.utils.escapeHTML` for the item image inside a descriptor body. The body is hashed to
 * decide saved/changed, so this must stay Foundry's escaper: core.escapeHTML spells an apostrophe
 * differently and would flip every saved item whose image path has one to "changed"
 * (items-journal-32). The bar's own strings use core.escapeHTML.
 */
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/**
 * sanitize() per page and per item, remembered (items-journal-33, journal-perf-3): every bar refresh
 * re-describes every open readable, and sanitizing is the cost. Keyed by the document's uuid, its last
 * modification and the embed label (a language switch), plus the identified flag for an item; a
 * document without a modification time is never cached. Bounded at 64 entries.
 */
export const sanitizeMemo = core.makeMemo(core.sanitize, 64);

/**
 * Who gets the bar on a journal (core.barVisible). `gmButton` is the setting's value, passed in by
 * the caller (an adapter never reads settings). The other facts are getters, so each permission call
 * happens only when the rule reaches it, in the rule's order, exactly as the old inline expression.
 */
export function shouldShowBar(entry, user = game.user, { gmButton = false } = {}) {
  return core.barVisible({
    get isJournalEntry() { return !!entry && entry.documentName === "JournalEntry"; },
    get isPersonal() { return core.isPersonal(entry); },
    get inPack() { return !!entry.pack; },
    get isGM() { return user.isGM; },
    gmButton,
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
export function itemSource(shown) {
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
export function shouldShowItemBar(src, user = game.user, { gmButton = false } = {}) {
  return core.itemBarVisible({
    get hasSource() { return !!src; },
    get canInspectItems() { return pileData(src.pile)?.canInspectItems; },
    get isGM() { return user.isGM; },
    gmButton,
    get observer() { return src.pile.testUserPermission(user, "OBSERVER"); },
    get owner() { return src.pile.testUserPermission(user, "OWNER"); },
  });
}

/** A relative uuid made absolute against the document it was written on. */
const resolverFor = doc => u => foundry.utils.parseUuid(u, { relative: doc })?.uuid ?? null;
const embeddedLabel = () => game.i18n.localize("PENTARYN_JOURNAL.provenance.embedded");

export function pageDescriptor(page, entry) {
  const base = { kind: "page", key: page.uuid, name: core.pageName(page, entry), entryId: entry.id,
    entryName: entry.name, pageName: page.name };
  if (page.type === "image") return { ...base, type: "image", src: page.src ?? "", caption: page.image?.caption ?? "" };
  if (page.type === "text") {
    const label = embeddedLabel();
    const modified = page._stats?.modifiedTime;
    const key = modified === undefined || modified === null ? null : `${page.uuid}|${modified}|${label}`;
    return { ...base, type: "text", body: sanitizeMemo(key, page.text?.content ?? "", { resolve: resolverFor(page), embeddedLabel: label }) };
  }
  return { ...base, type: "text", body: "" };   // pdf, video, anything else: provenance and a link
}

export function itemDescriptor(src) {
  const it = src.item;
  // Always the player's view: the unidentified text while unidentified, even for the GM.
  const unidentified = it.system?.identified === false;
  const desc = unidentified
    ? (it.system?.unidentified?.description ?? "")
    : (it.system?.description?.value ?? "");
  const label = embeddedLabel();
  const modified = it._stats?.modifiedTime;
  const key = modified === undefined || modified === null ? null : `${it.uuid}|${modified}|${unidentified}|${label}`;
  const body = `<img class="pj-item-img" src="${esc(it.img)}" alt="">`
    + sanitizeMemo(key, desc, { resolve: resolverFor(it), embeddedLabel: label });
  return { kind: "item", key: it.uuid, type: "text", name: it.name, body, entryId: null,
    entryName: src.pileName, pageName: it.name };
}

/**
 * A target is what a window shows: a journal entry (all its observable pages), one image page,
 * or one pile item. `null` means no bar.
 */
export function targetFor(app, { gmButton = false } = {}) {
  const JES = foundry.applications.sheets.journal.JournalEntrySheet;
  if (app instanceof JES) {
    return shouldShowBar(app.document, undefined, { gmButton }) ? { kind: "entry", entry: app.document } : null;
  }
  if (app instanceof foundry.applications.apps.ImagePopout) {
    const page = app.options?.uuid ? fromUuidSync(app.options.uuid) : null;
    if (page?.documentName !== "JournalEntryPage" || page.type !== "image") return null;
    return shouldShowBar(page.parent, undefined, { gmButton }) ? { kind: "image", entry: page.parent, page } : null;
  }
  if (app.document?.documentName === "Item") return targetOf(app.document, { gmButton });
  return null;
}

/** What can be saved from a target, as `user` sees it (default: this client's user). */
export function descriptorsFor(target, user = game.user) {
  if (target.kind === "item") return [itemDescriptor(target.src)];
  if (target.kind === "image") return [pageDescriptor(target.page, target.entry)];
  return target.entry.pages.contents
    .filter(p => p.testUserPermission(user, "OBSERVER"))
    .sort((a, b) => a.sort - b.sort)
    .map(p => pageDescriptor(p, target.entry));
}

/**
 * Turn an entry, a page or an item into a target, applying the same rules as the bar: rawTargetOf's
 * target, kept only when the bar would show on it.
 */
export function targetOf(doc, { gmButton = false } = {}) {
  const t = rawTargetOf(doc);
  if (!t) return null;
  const ok = t.kind === "item"
    ? shouldShowItemBar(t.src, undefined, { gmButton })
    : shouldShowBar(t.entry, undefined, { gmButton });
  return ok ? t : null;
}

/**
 * The target a document stands for, with NO visibility rule (targetOf applies the bar's rules):
 * for reading another user's status (api statusFor). null for anything that is not a journal, a
 * page or an item behind a pile.
 */
export function rawTargetOf(doc) {
  if (!doc) return null;
  if (doc.documentName === "JournalEntry") return { kind: "entry", entry: doc };
  if (doc.documentName === "JournalEntryPage") {
    return doc.type === "image" ? { kind: "image", entry: doc.parent, page: doc } : { kind: "entry", entry: doc.parent };
  }
  if (doc.documentName === "Item") {
    const src = itemSource(doc);
    return src ? { kind: "item", src } : null;
  }
  return null;
}
