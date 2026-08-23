/**
 * The Known list — a character's own notebook, hosted as a second tab on their sheet.
 *
 * Ties answer "who does this person know, and what are they to each other". Known answers a
 * different question with the same furniture: **what has my character learned about the
 * people and creatures they have met**, in their own words. One row per world actor, filed
 * into a category, with a page of prose the player owns.
 *
 * Phases 1 and 2 of `context/plans/foundry-encounter-log.md` — the tab, and the canvas key
 * that files whoever you are hovering. Deliberately not here yet, all additive and none of
 * them touching this schema: the Study roll and its reveals (phase 3), GM lore rows
 * (phase 4), the Past Encounters chronicle that will feed this list (phase 5).
 *
 * ## What lives where
 *
 * Everything that can be got quietly wrong — the reader, the category defaulting, the caps,
 * the ordering — is in `known-core.mjs`, which imports nothing and is fixtured in bare node
 * (`node test/known.mjs`). This file is the half that needs a running client: the flag
 * round-trip, the markup, and the listeners.
 *
 * ## Borrowed wholesale, on purpose
 *
 * The row is the ties row: a summary you scan, click anywhere to expand, edit in the detail,
 * no mode. The markup carries `class="pentaryn-ties pentaryn-known"` so the entire ties
 * stylesheet applies and only the differences are restated in CSS. A GM who knows one tab
 * knows the other, and a change to the row idiom lands on both.
 */

import { MODULE, baseActorOf, mayWrite } from "./ties-api.mjs";
import {
  KNOWN_FLAG,
  KNOWN_CATEGORIES_FLAG,
  KNOWN_NOTES_MAX,
  readCategories,
  readKnown as readKnownList,
  toStoredKnown,
  makeKnownEntry,
  pickNotebook,
  GRANTED_FLAG,
  STUDY_RUNGS,
  grantsForEntry,
  visibleAttributesFor
} from "./known-core.mjs";
import { studyStateFor, requestStudy, kindDialog, loreStateFor, requestLore, kindActorOf, grantKind as releaseKind } from "./study.mjs";
import { attributeIdsOf, registry as registryOf } from "./attributes.mjs";

/**
 * The tab id, exported so the entry point and the "open this entry" path cannot drift apart:
 * activating the tab means writing this exact string into `app.tabGroups.primary`, and two
 * copies of it is how a canvas key quietly starts landing on the Ties tab instead.
 */
export const KNOWN_TAB_ID = "known";

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);
const f = (k, data) => game.i18n.format(`PENTARYN_TIES.${k}`, data);

const FALLBACK_ART = "icons/svg/mystery-man.svg";

/**
 * Which rows are expanded, per actor — the same cosmetic state the ties panel keeps, and
 * deliberately NOT the same Map.
 *
 * Both lists key rows by the *other* actor's id, and one character can perfectly well have
 * both a tie to Wat Harrow and a Known entry about him. Sharing `editor.mjs`'s Map would
 * make those two rows one piece of state: open his tie, and his notebook page is open too.
 */
const expanded = new Map(); // actorId -> Set(entryId)
const shownHidden = new Set();
const showingHidden = actorId => shownHidden.has(actorId);
const setShowHidden = (actorId, on) => (on ? shownHidden.add(actorId) : shownHidden.delete(actorId));

const expandedFor = actorId => expanded.get(actorId) ?? new Set();
function setExpanded(actorId, id, open) {
  const set = expanded.get(actorId) ?? new Set();
  open ? set.add(id) : set.delete(id);
  set.size ? expanded.set(actorId, set) : expanded.delete(actorId);
}

/** Drop a deleted actor's row state; nothing else holds a reference to it. */
export function forgetKnownActor(actorId) {
  expanded.delete(actorId);
}

/* -------------------------------------------- */
/*  Data                                        */
/* -------------------------------------------- */

/**
 * The world lookup the pure reader is missing, in the shape it asks for.
 *
 * Creature type comes from `system.details.type.value` — the path that drives the dnd5e NPC
 * sheet — and is only ever used to *default* a new entry's category. It is not a kind and
 * not a knowledge key: filing by it once is filing; reading knowledge off it would make one
 * goblin teach every humanoid (the plan's own rejected row).
 */
const resolveActor = id => {
  const actor = game.actors?.get(id);
  if (!actor) return null;
  return {
    name: actor.name,
    img: actor.img ?? null,
    actorType: actor.type ?? null,
    creatureType: actor.system?.details?.type?.value ?? null
  };
};

const rawFlag = (actor, key) => {
  try {
    return actor?.getFlag(MODULE, key);
  } catch {
    return undefined; // a flag that cannot be read is an empty list, never an exception
  }
};

/** The categories this actor files into: the seeded pair, plus any the GM has added. */
export function categoriesFor(actor) {
  return readCategories(rawFlag(actor, KNOWN_CATEGORIES_FLAG));
}

/**
 * A category's display name. A stored `label` is a rename and always wins; otherwise the
 * seeded keys localize, and an unrenamed custom key falls back to the key itself rather
 * than to a missing-translation string.
 */
export function categoryLabel(category) {
  if (category?.label) return category.label;
  const key = `PENTARYN_TIES.known.category.${category?.key}`;
  const localized = game.i18n.localize(key);
  return localized === key ? category?.key ?? "" : localized;
}

/** Sanitised, resolved Known entries for an actor. Never throws, never returns a non-array. */
export function readKnown(actor) {
  if (!actor) return [];
  return readKnownList(rawFlag(actor, KNOWN_FLAG), { resolve: resolveActor, categories: categoriesFor(actor) });
}

/**
 * `render: false` for the same reason ties writes are: a plain setFlag re-renders the sheet,
 * which destroys the injected tab mid-edit. Callers repaint deliberately.
 */
export async function writeKnown(actor, list, { render = false } = {}) {
  if (!actor?.isOwner) return false; // the server would refuse it anyway; fail quietly
  await actor.update({ [`flags.${MODULE}.${KNOWN_FLAG}`]: toStoredKnown(list) }, { render });
  return true;
}

/**
 * File someone. Returns the entry, or null if it was already there — the caller decides
 * whether that deserves a notification.
 *
 * `when` is stamped once, here, and never touched again: it is what orders the list, so a
 * later edit must not move a row under the cursor that is editing it.
 */
export async function addKnown(actor, target, { now = Date.now() } = {}) {
  const subject = target instanceof Actor ? target : game.actors?.get(target);
  if (!actor?.isOwner || !subject || subject.id === actor.id) return null;
  const list = readKnown(actor);
  if (list.some(e => e.id === subject.id)) return null;
  const entry = makeKnownEntry({
    id: subject.id,
    name: subject.name,
    actorType: subject.type,
    creatureType: subject.system?.details?.type?.value ?? null,
    now
  });
  await writeKnown(actor, [...list, entry]);
  return entry;
}

/** Change one field on one entry. No-op if the entry is gone. */
export async function setKnownField(actor, id, field, value) {
  if (!["category", "notes"].includes(field)) return false;
  const list = readKnown(actor);
  const entry = list.find(e => e.id === id);
  if (!entry) return false;
  entry[field] = value;
  return writeKnown(actor, list);
}

/**
 * Hide or restore one entry — the notebook's only tidying gesture.
 *
 * Joe's rule: *"never deleted so I'm never asked to recover a link."* Everything a character
 * wrote down stays written down; hiding just gets it out of the way.
 */
export async function hideKnown(actor, id, hidden = true) {
  const list = readKnown(actor);
  if (!list.some(e => e.id === id)) return false;
  return writeKnown(actor, list.map(e => (e.id === id ? { ...e, hidden: !!hidden } : e)));
}

/**
 * ⚠ **Genuinely destroys an entry, and nothing in the UI calls it.** Kept as a GM escape hatch
 * for a row that should never have existed — a mis-click, a test, an import gone wrong. For
 * anything a character actually learned, use `hideKnown`: the whole point of the rule is that a
 * player's record cannot be lost and the GM is never asked to recover one.
 */
export async function removeKnown(actor, id) {
  const list = readKnown(actor);
  if (!list.some(e => e.id === id)) return false;
  return writeKnown(actor, list.filter(e => e.id !== id));
}

/**
 * Who is left to add.
 *
 * ⚠ **Not `candidates()` from `ties-api.mjs`**, which the plan names — that function excludes
 * everyone the actor already has a *tie* to, which is precisely the wrong exclusion set
 * here: the people you know best are the people you are tied to, and using it would hide
 * every one of Ballad Quinn's 24 acquaintances from her own notebook. What is actually
 * wanted is the same permission filter with a different "taken" list, which is exactly what
 * the dialog's `targetCandidates(source, "all")` already is: every actor this user may know
 * exists, LIMITED-filtered for players, on-scene or not.
 */
async function knownCandidates(actor) {
  const { targetCandidates } = await import("./tie-dialog.mjs");
  const taken = new Set(readKnown(actor).map(e => e.id));
  return targetCandidates(actor.id, "all").filter(c => !taken.has(c.actor.id));
}

/* -------------------------------------------- */
/*  The canvas key (phase 2)                    */
/* -------------------------------------------- */

/**
 * Whatever key actually files a hovered token.
 *
 * Read live, never hardcoded — `editor.mjs`'s `addTieKey` for the same reason it gives: a
 * hint naming "5" is a lie the moment somebody rebinds it, told in the one place they would
 * look to find out what it had become.
 */
function knownKey() {
  const bound = game.keybindings?.get?.(MODULE, "fileKnown")?.[0]?.key ?? "";
  return bound.replace(/^Digit/, "").replace(/^Key/, "") || "?";
}

/**
 * Rule 2 of the canvas keys, unchanged from `overlay.mjs`: a token you cannot see is not
 * there.
 *
 * ⚠ `isVisible`, **never** `visible`. On v14 `Token#visible` is the inherited PIXI
 * DisplayObject flag and reads true for every placeable on the scene — walled off and
 * GM-hidden alike — so filing on `visible` would turn this key into a hidden-token detector:
 * sweep the cursor through the dark and see which squares answer.
 */
const canSee = token => !!token && (game.user?.isGM === true || (token.isVisible ?? token.visible) === true);

/** The canvas-side half of `pickNotebook` — the `baseActorOf` walk, then the pure rule. */
export function notebookActor() {
  const describe = actor =>
    actor ? { id: actor.id, isCharacter: actor.type === "character", isOwner: actor.isOwner === true } : null;
  const walk = tokens => (tokens ?? []).map(tok => describe(baseActorOf(tok))).filter(Boolean);
  const id = pickNotebook({
    controlled: walk(canvas?.tokens?.controlled),
    assigned: describe(game.user?.character ?? null),
    owned: walk(canvas?.tokens?.placeables)
  });
  return id ? game.actors?.get(id) ?? null : null;
}

/**
 * Hover a creature, press the key, and their page in your character's notebook opens —
 * written if it was never written before.
 *
 * The three refusals below deliberately give **one message**. Hovering nothing, hovering
 * yourself and hovering a token you cannot see must be indistinguishable, exactly as they are
 * for key 7 (`overlay.mjs`): a key that answers differently for "you can't see that" is a
 * detector for what is standing in the dark, which is the one thing this gesture must not be.
 *
 * Resolution is through `baseActorOf`, so the three goblins in the doorway are one entry —
 * the entry's id is the **world actor's**, never the scene's token or its unlinked delta.
 */
export async function fileHovered(token = canvas?.tokens?.hover ?? null) {
  if (!mayWrite()) return null; // the playerAccess kill switch, same gate the tie key uses

  const actor = notebookActor();
  if (!actor) {
    ui.notifications.warn(t("known.notify.needCharacter"));
    return null;
  }

  const subject = canSee(token) ? baseActorOf(token) : null;
  // compared by ACTOR, not by token: with your own character on the map twice, hovering the
  // other copy is still asking to file yourself
  if (!subject || subject.id === actor.id) {
    ui.notifications.warn(t("known.notify.needTarget"));
    return null;
  }

  try {
    // already filed is not a failure — it is the other half of what this key promises, and
    // re-pressing it on someone is how you get back to their page
    const entry = readKnown(actor).find(e => e.id === subject.id) ?? (await addKnown(actor, subject));
    if (!entry) return null; // the write was refused; addKnown never throws for that
    await openKnownEntry(actor, entry.id);
    return entry;
  } catch (err) {
    console.error(`${MODULE} | filing ${subject.id} on ${actor.id} failed`, err);
    ui.notifications.error(t("known.notify.fileFailed"));
    return null;
  }
}

/**
 * Open a character's sheet on the Known tab with one entry expanded and its notes focused.
 *
 * ⚠ `tabGroups.primary` is set **before** the render, not after. The injector activates our
 * tab on its own tail — `if (app.tabGroups?.primary === spec.id) activate()` — so writing the
 * tab id first is what lands the reader on Known instead of on whichever tab they last left
 * this sheet on. Going the other way (render, then `changeTab`) is the early-return trap
 * `injectOneTab` documents at length.
 *
 * The row is expanded through the same Map the tab's own toggle writes, so the paint that
 * follows renders it open — no second repaint, and nothing to keep in step with the DOM.
 */
export async function openKnownEntry(actor, id) {
  setExpanded(actor.id, id, true);
  const sheet = actor?.sheet;
  if (!sheet) return false;
  if (sheet.tabGroups) sheet.tabGroups.primary = KNOWN_TAB_ID;
  await sheet.render(true);

  /*
   * Belt and braces for the one case the paint above cannot cover: a sheet that was already
   * open re-renders its parts independently, and the injector's "both already live and wired"
   * guard can legitimately skip a repaint. Clicking the nav link runs the handler the injector
   * bound, and clicking the summary runs the toggle `bindKnown` bound — the same two gestures
   * a reader would make, rather than a second copy of what they do.
   */
  const root = sheet.element instanceof HTMLElement ? sheet.element : sheet.element?.[0];
  const section = root?.querySelector(`[data-tab="${KNOWN_TAB_ID}"].tab`);
  if (!section) return true; // tab switched off in settings, or the markup moved — the write stands
  if (!section.classList.contains("active")) root.querySelector(`nav.tabs [data-tab="${KNOWN_TAB_ID}"]`)?.click();
  const row = section.querySelector(`.pt-row[data-id="${CSS.escape(id)}"]`);
  if (row && !row.classList.contains("pt-open")) row.querySelector(".pt-summary")?.click();
  // the gesture that files someone is meant to end in writing about them — same reason the
  // add picker opens the row it just created
  row?.querySelector('[data-field="notes"]')?.focus();
  return true;
}

/* -------------------------------------------- */
/*  Markup                                      */
/* -------------------------------------------- */

const artFor = entry => (entry.missing ? FALLBACK_ART : entry.img || FALLBACK_ART);

/** The date it was filed, which is also the order of the list. Empty when never stamped. */
function filedCell(entry) {
  if (!entry.when) return `<span class="pt-known-when"></span>`;
  const d = new Date(entry.when);
  const short = d.toLocaleDateString(game.i18n.lang, { month: "short", day: "numeric" });
  return `<span class="pt-known-when" data-tooltip="${esc(f("known.filedTip", { date: d.toLocaleString() }))}">${esc(
    short
  )}</span>`;
}

function categorySelect(entry, categories) {
  const opts = categories
    .map(
      c =>
        `<option value="${esc(c.key)}"${c.key === entry.category ? " selected" : ""}>${esc(categoryLabel(c))}</option>`
    )
    .join("");
  return `<select class="pt-known-category" data-field="category">${opts}</select>`;
}

function summary(entry, { open, canEdit }) {
  const hasNotes = !!entry.notes.trim();
  const name = `<span class="pt-name${entry.missing ? " pt-missing" : ""}">${esc(
    entry.name || t("row.missingName")
  )}</span>`;
  const preview = hasNotes
    ? `<span class="pt-note-preview">${esc(entry.notes)}</span>`
    : `<span class="pt-note-preview pt-note-none"><em>${esc(t("known.notesEmpty"))}</em></span>`;

  return `<div class="pt-summary" role="button" tabindex="0" aria-expanded="${open}"
      data-action="toggle" data-tooltip="${esc(t(canEdit ? "known.expandEdit" : "known.expandRead"))}"
      aria-label="${esc(f(canEdit ? "known.expandEditOf" : "known.expandReadOf", { name: entry.name }))}">
    <img class="pt-portrait" src="${esc(artFor(entry))}" alt="" loading="lazy" />
    <span class="pt-who">${name}${preview}</span>
    ${filedCell(entry)}
    <span class="pt-hint" aria-hidden="true"><i class="fa-solid ${canEdit ? "fa-pen" : "fa-eye"}"></i></span>
  </div>`;
}

/**
 * The study affordance, and the cross-reference line beside it.
 *
 * ⚠ **The affordance's visibility must never depend on the outcome of a roll** — only on
 * whether one has happened at all (decision 11's indistinguishability contract). `spent` comes
 * off `studied`, which holds `when` and nothing else, so there is nothing here that *could*
 * vary by tier even if somebody tried. A "you rolled well" variant of this button is the
 * number, drawn.
 *
 * "No content, no icon" is the other half: a kind with no biography, no authored tiers and no
 * attacks renders nothing, which is also how the GM sees at a glance which monsters still want
 * a description written.
 */
function studyControls(entry, { canEdit, isGM, study }) {
  if (!study?.kind) return "";
  const bits = [];

  /*
   * Decision 7's cross-reference: rolling "what is this" from Grix's row writes the tiers onto
   * the *Goblin* entry, and the player is told where the text went rather than left hunting a
   * page that appeared somewhere else in their own notebook.
   */
  if (!study.isOwnKind) {
    bits.push(
      `<div class="pt-known-kind">${esc(f("known.study.kindLine", { name: study.kind.name }))}</div>`
    );
  }

  const actions = [];
  if (canEdit && study.content) {
    const disabled = study.spent || !study.gmOnline;
    const tip = study.spent
      ? t("known.study.spentTip")
      : study.gmOnline
        ? f("known.study.tip", { skill: study.skillLabel, name: study.kind.name })
        : t("known.study.noGMTip");
    // spent is not "disabled": the button is GONE, so nothing on the row says a roll was made
    if (!study.spent) {
      actions.push(`<button type="button" class="pt-textbtn pt-study-btn" data-action="study"
          data-id="${esc(entry.id)}"${disabled ? " disabled" : ""} data-tooltip="${esc(tip)}">
        <i class="fa-solid fa-magnifying-glass"></i> ${esc(t("known.study.button"))}
      </button>`);
    }
  }
  if (isGM) {
    actions.push(`<button type="button" class="pt-textbtn pt-kind-btn" data-action="kind"
        data-id="${esc(entry.id)}" data-tooltip="${esc(t("known.study.kindTip"))}">
      <i class="fa-solid fa-sitemap"></i> ${esc(t("known.study.kindButton"))}
    </button>`);
    /*
     * The GM's release control — the story route into a kind, since a study roll is one attempt
     * and a failure is final. Rungs are offered as a menu rather than a free number because the
     * ladder has exactly four, and typing 17 would silently mean 15.
     */
    actions.push(`<label class="pt-release" data-tooltip="${esc(t("known.study.releaseTip"))}">
      <span>${esc(t("known.study.release"))}</span>
      <select data-action="release" data-id="${esc(entry.id)}">
        <option value="">—</option>
        ${STUDY_RUNGS.map(r => `<option value="${r}">${r === 0 ? esc(t("known.study.rung0")) : `DC ${r}`}</option>`).join("")}
      </select>
    </label>`);
  }
  return bits.join("") + actions.join("");
}

/**
 * What the GM's side handed over, rendered read-only under the player's own notes.
 *
 * Never a textarea, in either branch. The player's prose and this prose sit in different
 * flags for exactly this reason (`GRANTED_FLAG`) — the notes autosave must not be able to
 * carry a keystroke into text the character was *given*. An owner reading their own page
 * sees the same static block a non-owner does; the only difference upstream is who could
 * have caused it to appear.
 *
 * `pre-line` because the GM's rungs are authored as paragraphs and a tier that arrives as
 * one run-on line reads as a different tier.
 */
function grantedRegion(grants) {
  if (!grants?.length) return "";
  const rows = grants
    .map(
      g => `<li class="pt-grant">
        ${g.icon ? `<img class="pt-grant-icon" src="${esc(g.icon)}" alt="">` : ""}
        <div class="pt-grant-body">
          ${g.source ? `<span class="pt-grant-source">${esc(g.source)}</span>` : ""}
          <div class="pt-grant-text">${esc(g.text)}</div>
        </div>
      </li>`
    )
    .join("");
  return `<section class="pt-granted" aria-label="${esc(t("known.granted.label"))}">
    <div class="pt-granted-head">
      <i class="fa-solid fa-book-open-reader"></i>
      <span>${esc(t("known.granted.label"))}</span>
    </div>
    <ul class="pt-granted-list">${rows}</ul>
  </section>`;
}

/**
 * The individual axis, offered — phase 4's player-facing half.
 *
 * Each row prints its **label, skill and DC before the roll**, and that is deliberate rather
 * than a leak (decision 8): *that a secret exists is the invitation.* A player looking at
 * Wat Harrow and seeing "Why he left the coast · History DC 15" knows there is something to
 * find and what it will cost, which is the hook. What stays hidden is everything past the
 * click — the total, the pass, and the prose of both the hit and the miss.
 *
 * ⚠ A spent row is **removed, not disabled**. A greyed-out button says "you rolled this and
 * it is over", which is a true statement a *failure* would also produce — but leaving it on
 * the row invites the player to read its tooltip for a verdict. Gone is quieter, and matches
 * how the kind button already behaves.
 */
function loreOffers(entry, lore, canEdit) {
  if (!canEdit || !lore?.length) return "";
  const open = lore.filter(r => r.available);
  if (!open.length) return "";
  return `<div class="pt-lore-offers">
    <div class="pt-lore-offers-head">
      <i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>
      <span>${esc(t("known.lore.heading"))}</span>
    </div>
    <ul class="pt-lore-offer-list">
      ${open
        .map(
          r => `<li>
            <button type="button" class="pt-textbtn pt-lore-btn" data-action="lore"
                data-id="${esc(entry.id)}" data-lore="${esc(r.id)}"${r.gmOnline ? "" : " disabled"}
                data-tooltip="${esc(
                  r.gmOnline
                    ? f("known.lore.tip", { label: r.label, skill: r.skillLabel, dc: r.dc })
                    : t("known.study.noGMTip")
                )}">
              <span class="pt-lore-offer-label">${esc(r.label)}</span>
              <span class="pt-lore-offer-price">${esc(f("known.lore.price", { skill: r.skillLabel, dc: r.dc }))}</span>
            </button>
          </li>`
        )
        .join("")}
    </ul>
  </div>`;
}

function detail(entry, { canEdit, categories, isGM, study, grants, lore }) {
  const openSheet = entry.missing
    ? ""
    : `<button type="button" class="pt-textbtn" data-action="open" data-id="${esc(entry.id)}">
        <i class="fa-solid fa-arrow-up-right-from-square"></i> ${esc(t("row.openSheet"))}
      </button>`;
  const controls = studyControls(entry, { canEdit, isGM, study });

  if (!canEdit) {
    const prose = entry.notes.trim()
      ? `<div class="pt-notes-prose">${esc(entry.notes)}</div>`
      : `<div class="pt-notes-prose pt-note-none"><em>${esc(t("known.notesEmpty"))}</em></div>`;
    return `<div class="pt-detail">
      ${controls}
      ${prose}
      ${grantedRegion(grants)}
      ${loreOffers(entry, lore, canEdit)}
      <div class="pt-detail-actions">${openSheet}</div>
    </div>`;
  }

  return `<div class="pt-detail">
    ${controls}
    <div class="pt-fields">
      <label class="pt-field">
        <span class="pt-field-label">${esc(t("known.categoryLabel"))}</span>
        ${categorySelect(entry, categories)}
      </label>
    </div>
    <label class="pt-field pt-field-notes">
      <span class="pt-field-label">${esc(t("known.notesLabel"))}</span>
      <textarea class="pt-notes-text" data-field="notes" rows="6" maxlength="${KNOWN_NOTES_MAX}"
                placeholder="${esc(f("known.notesPlaceholder", { name: entry.name }))}">${esc(entry.notes)}</textarea>
    </label>
    ${grantedRegion(grants)}
    ${loreOffers(entry, lore, canEdit)}
    <div class="pt-detail-actions">
      ${openSheet}
      <button type="button" class="pt-textbtn" data-action="hide" data-id="${esc(entry.id)}">
        <i class="fa-solid fa-${entry.hidden ? "eye" : "eye-slash"}"></i> ${esc(
          t(entry.hidden ? "known.unhide" : "known.hide")
        )}
      </button>
    </div>
  </div>`;
}

function knownRow(entry, { open, canEdit, categories, isGM, study, grants, lore }) {
  return `<li class="pt-row${open ? " pt-open" : ""}${entry.missing ? " pt-missing-row" : ""}" data-id="${esc(
    entry.id
  )}">
    ${summary(entry, { open, canEdit })}
    <div class="pt-detail-wrap"${open ? "" : " hidden"}>${detail(entry, { canEdit, categories, isGM, study, grants, lore })}</div>
  </li>`;
}

/**
 * Full markup for one character's Known list. Safe to drop into a tab.
 *
 * Grouped by category, each group in filing order (`known-core.mjs` sorts). Headings render
 * only when more than one group has rows — the same rule the ties panel uses for its
 * here/elsewhere split, and for the same reason: with everything in one bucket a heading
 * labels the obvious.
 */
export function buildKnownHTML(actor) {
  const canEdit = actor?.isOwner === true;
  const isGM = game.user?.isGM === true;
  const categories = categoriesFor(actor);
  const entries = readKnown(actor);
  const open = expandedFor(actor.id);

  /*
   * The study state per row, computed once here rather than inside the row builder — it walks
   * the kind's items to answer "is there anything to learn", and a notebook of thirty entries
   * would otherwise do that walk twice per paint.
   */
  // one read of the granted flag per paint, joined per entry — `grantsForEntry` is pure, and
  // re-reading the flag inside the row builder would parse the whole map once per row
  const grantedRaw = actor?.getFlag?.(MODULE, GRANTED_FLAG) ?? null;

  const studyFor = new Map();
  const loreFor = new Map();
  /*
   * The attribute ids each subject carries — decision 15's reason the grant map is a sibling
   * and not a field. Learn the guild's secret from one rogue and it must render under EVERY
   * rogue already filed, so the join needs the subject's groups, not just its id.
   */
  const attrsFor = new Map();
  for (const entry of entries) {
    const subject = game.actors?.get(entry.id);
    studyFor.set(entry.id, subject ? studyStateFor(actor, subject) : null);
    loreFor.set(entry.id, subject ? loreStateFor(actor, subject) : []);
    /*
     * ⚠ Filtered, not raw. An `attr:` grant renders under a creature only where this character has
     * identified them as a carrier — otherwise the grant's placement announces the membership,
     * which is the leak phase 6's cross-carrier join becomes once membership is secret.
     */
    attrsFor.set(
      entry.id,
      subject
        ? visibleAttributesFor({
            carried: attributeIdsOf(subject, kindActorOf),
            registry: registryOf(),
            beliefs: subject.getFlag(MODULE, "beliefs") ?? {},
            characterId: actor.id,
            isGM
          })
        : []
    );
  }

  /*
   * Hidden entries drop out of the list but never out of the flag. New entries land at the
   * bottom of their group because `readKnown` sorts by `when` ascending — the notebook reads as
   * a log, in the order things were met.
   */
  const showHidden = showingHidden(actor.id);
  const hiddenCount = entries.filter(e => e.hidden).length;
  const visible = showHidden ? entries : entries.filter(e => !e.hidden);

  const groups = categories
    .map(c => ({ category: c, rows: visible.filter(e => e.category === c.key) }))
    .filter(g => g.rows.length);
  const heads = groups.length > 1;

  const renderRows = rows =>
    rows
      .map(e =>
        knownRow(e, {
          open: open.has(e.id),
          canEdit,
          categories,
          isGM,
          study: studyFor.get(e.id),
          grants: grantsForEntry(grantedRaw, e.id, { attributeIds: attrsFor.get(e.id) }),
          lore: loreFor.get(e.id)
        })
      )
      .join("");

  const body = !visible.length
    ? `<ul class="pt-list"><li class="pt-empty">${esc(t("known.empty"))}</li></ul>`
    : groups
        .map(
          g =>
            `${
              heads
                ? `<div class="pt-group-head" role="heading" aria-level="3"><span class="pt-group-title">${esc(
                    categoryLabel(g.category)
                  )}</span></div>`
                : ""
            }<ul class="pt-list">${renderRows(g.rows)}</ul>`
        )
        .join("");

  const hiddenToggle = hiddenCount
    ? `<button type="button" class="pt-textbtn pt-show-hidden" data-action="show-hidden">
        <i class="fa-solid fa-${showHidden ? "eye-slash" : "eye"}"></i> ${esc(
          f(showHidden ? "known.hideHidden" : "known.showHidden", { count: hiddenCount })
        )}
      </button>`
    : "";

  const add = canEdit
    ? `<div class="pt-add-bar">
        <button type="button" class="pt-add-btn" data-action="known-add">
          <i class="fa-solid fa-plus"></i> ${esc(t("known.add"))}
        </button>
        <span class="pt-add-hint">${esc(f("known.addHint", { key: knownKey() }))}</span>
      </div>`
    : "";

  return `<div class="pentaryn-ties pentaryn-known" data-actor-id="${esc(actor.id)}">
    <p class="pt-known-intro">${esc(t("known.hint"))}</p>
    ${body}
    ${add}
    ${hiddenToggle}
  </div>`;
}

/* -------------------------------------------- */
/*  Behaviour                                   */
/* -------------------------------------------- */

/** Wire a rendered block. `rerender` is called after any mutation that reorders rows. */
export function bindKnown(root, actor, rerender = () => {}) {
  if (!root || !actor) return;
  const canEdit = actor.isOwner === true;

  root.querySelectorAll('[data-action="toggle"]').forEach(head => {
    const row = head.closest(".pt-row");
    const wrap = row?.querySelector(".pt-detail-wrap");
    if (!wrap) return;
    const toggle = () => {
      const open = wrap.hasAttribute("hidden");
      wrap.toggleAttribute("hidden", !open);
      row.classList.toggle("pt-open", open);
      head.setAttribute("aria-expanded", String(open));
      setExpanded(actor.id, row.dataset.id, open);
      // straight to the prose: unlike a tie row there is no word to name first, and the
      // notes ARE the entry
      if (open) wrap.querySelector('[data-field="notes"]')?.focus();
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", ev => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault(); // Space would scroll the panel instead
      toggle();
    });
  });

  // a click inside the detail must not bubble up and collapse the row being typed in
  root.querySelectorAll(".pt-detail-wrap").forEach(wrap => {
    wrap.addEventListener("click", ev => ev.stopPropagation());
  });

  root.querySelectorAll('[data-action="open"]').forEach(btn => {
    btn.addEventListener("click", () => game.actors.get(btn.dataset.id)?.sheet?.render(true));
  });

  /*
   * The study gesture. `rerender` afterwards is unconditional and is *not* a result signal: the
   * repaint happens whether the roll passed, failed or is sitting held on the GM's screen,
   * because the only thing that changed on this client either way is that the affordance is
   * spent. A repaint conditional on the answer would be the answer.
   */
  root.querySelectorAll('[data-action="study"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const subject = game.actors?.get(btn.dataset.id);
      if (!subject) return;
      btn.disabled = true; // one gesture, one roll — a double-click must not queue two
      await requestStudy(actor, subject);
      rerender();
    });
  });

  /*
   * The individual axis. Same repaint contract as the kind button above and for the same
   * reason: `rerender` runs unconditionally, so a pass, a failure and a held roll all leave
   * this client looking identical — one fewer row on offer, nothing else.
   */
  root.querySelectorAll('[data-action="lore"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const subject = game.actors?.get(btn.dataset.id);
      if (!subject) return;
      btn.disabled = true; // one gesture, one roll — a double-click must not queue two
      await requestLore(actor, subject, btn.dataset.lore);
      rerender();
    });
  });

  // GM only, and gated in the markup rather than here only because the button is the whole
  // feature: the minimal kind-pointer picker phase 4's authoring section absorbs.
  root.querySelectorAll('select[data-action="release"]').forEach(sel => {
    sel.addEventListener("change", async () => {
      const subject = game.actors?.get(sel.dataset.id);
      const tier = Number(sel.value);
      sel.value = "";
      if (!subject || !Number.isFinite(tier) || !sel.dataset.id) return;
      await releaseKind(actor, subject, tier);
      rerender();
    });
  });

  root.querySelectorAll('[data-action="kind"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const subject = game.actors?.get(btn.dataset.id);
      if (!subject) return;
      if (await kindDialog(subject)) rerender();
    });
  });

  if (!canEdit) return;

  root.querySelectorAll(".pt-row").forEach(row => {
    const id = row.dataset.id;

    /*
     * Category re-files the row, so it moves — a full repaint is the point, not a cost.
     * Notes do not move anything, so they repaint only the summary's preview line, which
     * keeps the caret in the textarea that is still being typed in.
     */
    row.querySelector('[data-field="category"]')?.addEventListener("change", async ev => {
      if (!(await setKnownField(actor, id, "category", ev.target.value))) return;
      rerender();
    });

    /**
     * A textarea only fires `change` on blur, and closing the sheet removes the element
     * without ever blurring it — which would quietly bin a page of notes. Autosave while
     * typing, on the ties panel's 700ms.
     */
    const notes = row.querySelector('[data-field="notes"]');
    if (notes) {
      let pending = null;
      notes.addEventListener("input", () => {
        clearTimeout(pending);
        pending = setTimeout(async () => {
          if (!(await setKnownField(actor, id, "notes", notes.value))) return;
          const entry = readKnown(actor).find(e => e.id === id);
          const head = row.querySelector(".pt-summary");
          if (!entry || !head) return;
          const fresh = document.createElement("div");
          fresh.innerHTML = summary(entry, { open: row.classList.contains("pt-open"), canEdit });
          /*
           * Grab the node BEFORE the swap. `replaceWith` moves it out of `fresh`, so reading
           * `fresh.firstElementChild` afterwards is null — and the rebind then threw on every
           * autosave, leaving the new summary with no click handler until the next full
           * repaint. Caught in the console on the first typing test; `editor.mjs` gets this
           * right and this is the line that was not copied from it.
           */
          const next = fresh.firstElementChild;
          // the preview is hidden by CSS while the row is open, so this is invisible until
          // the row closes — which is exactly when it must already be right
          head.replaceWith(next);
          bindSummary(next, row, actor);
        }, 700);
      });
      notes.addEventListener("blur", () => clearTimeout(pending));
    }
  });

  /*
   * Hide, never delete. Joe's rule: *"never deleted so I'm never asked to recover a link."*
   *
   * No confirmation dialog, deliberately — a prompt is the cost of an irreversible act, and this
   * one is reversible by the button right beside it. Asking "are you sure?" for something that
   * undoes itself trains people to click through prompts that matter.
   */
  root.querySelectorAll('[data-action="hide"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const list = readKnown(actor);
      const entry = list.find(e => e.id === btn.dataset.id);
      if (!entry) return;
      await writeKnown(actor, list.map(e => (e.id === entry.id ? { ...e, hidden: !e.hidden } : e)));
      setExpanded(actor.id, btn.dataset.id, false);
      rerender();
    });
  });

  root.querySelectorAll('[data-action="show-hidden"]').forEach(btn => {
    btn.addEventListener("click", () => {
      setShowHidden(actor.id, !showingHidden(actor.id));
      rerender();
    });
  });

  root.querySelector('[data-action="known-add"]')?.addEventListener("click", () => openAddPicker(actor, rerender));
}

/** Re-wire a summary replaced in place, so a partial repaint doesn't double every listener. */
function bindSummary(head, row, actor) {
  const wrap = row?.querySelector(".pt-detail-wrap");
  if (!head || !wrap) return; // a repaint that produced nothing must not take the tab down
  const toggle = () => {
    const open = wrap.hasAttribute("hidden");
    wrap.toggleAttribute("hidden", !open);
    row.classList.toggle("pt-open", open);
    head.setAttribute("aria-expanded", String(open));
    setExpanded(actor.id, row.dataset.id, open);
    if (open) wrap.querySelector('[data-field="notes"]')?.focus();
  };
  head.addEventListener("click", toggle);
  head.addEventListener("keydown", ev => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault();
    toggle();
  });
}

/**
 * The add picker — one dropdown and a button, and no more than that on purpose.
 *
 * Phase 2 gives this list its real door: hover a token, press a key, and the creature in
 * front of you is filed without anyone hunting a name. This exists because that door only
 * opens onto the current scene, and because a notebook you cannot start from the sheet is a
 * notebook nobody starts.
 */
export async function openAddPicker(actor, onAdded = () => {}) {
  const options = await knownCandidates(actor);
  if (!options.length) {
    ui.notifications.info(t("known.picker.empty"));
    return null;
  }
  const opts = options
    .map(c => `<option value="${esc(c.actor.id)}">${esc(c.label)}</option>`)
    .join("");
  const content = `<div class="pt-known-picker">
    <label class="pt-field">
      <span class="pt-field-label">${esc(t("known.picker.label"))}</span>
      <select name="target">
        <option value="">${esc(t("known.picker.placeholder"))}</option>
        ${opts}
      </select>
    </label>
  </div>`;

  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("known.picker.title") },
    classes: ["pentaryn-tie-dialog"],
    content,
    ok: {
      label: t("known.picker.add"),
      callback: (event, button) => button.form.elements.target.value
    },
    rejectClose: false
  });
  if (!chosen) return null;

  const entry = await addKnown(actor, chosen);
  if (!entry) {
    ui.notifications.warn(f("known.notify.exists", { name: game.actors.get(chosen)?.name ?? chosen }));
    return null;
  }
  // open the new row on arrival: the gesture that files someone is meant to end in writing
  // about them, and hunting for the row you just created is a step nobody should pay for
  setExpanded(actor.id, entry.id, true);
  onAdded();
  return entry;
}
