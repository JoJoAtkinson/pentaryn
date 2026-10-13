/**
 * The Known list — a character's own notebook, hosted as a second tab on their sheet.
 *
 * Ties answer "who does this person know, and what are they to each other". Known answers a
 * different question with the same furniture: **what has my character learned about the
 * people and creatures they have met**, in their own words. One row per world actor, filed
 * into a category, with a page of prose the player owns.
 *
 * Phases 1 and 2 of `context/plans/foundry-encounter-log.md` — the tab, and the canvas key
 * that files whoever you are hovering — plus the study controls, lore offers and granted cards
 * the later phases drew into each entry (study/, attributes.mjs). The Past Encounters chronicle
 * that would feed this list is still unbuilt.
 *
 * ## What lives where
 *
 * Everything that can be got quietly wrong — the reader, the category defaulting, the caps,
 * the ordering — is in `core/known.mjs` (the `known-core.mjs` barrel), which imports nothing and
 * is fixtured in bare node (`node test/known.mjs`). The flag round-trip is `known-data.mjs`; this
 * file is the markup and the listeners.
 *
 * ## Borrowed wholesale, on purpose
 *
 * The row is the ties row: a summary you scan, click anywhere to expand, edit in the detail,
 * no mode. The markup carries `class="pentaryn-ties pentaryn-known"` so the entire ties
 * stylesheet applies and only the differences are restated in CSS. A GM who knows one tab
 * knows the other, and a change to the row idiom lands on both.
 */

import { MODULE } from "./ties-core.mjs";
import { mayWrite } from "./settings.mjs";
import { canSee, baseActorOf } from "./ties-adapter.mjs";
import {
  KNOWN_NOTES_MAX,
  GRANTED_FLAG,
  STUDY_RUNGS,
  grantsForEntry,
  visibleAttributesFor,
  indexRegistry,
  isBlankProse,
  BELIEFS_FLAG
} from "./known-core.mjs";
import { studyStateFor, requestStudy, kindDialog, loreStateFor, requestLore, kindActorOf, grantKind as releaseKind } from "./study.mjs";
import { attributeIdsOf, registry as registryOf } from "./attributes.mjs";
import { dropSecrets, paintRich, richBox, esc, bindRowToggle, bindSummary, makeOpenState, notesPreview, notesProse, bindNotesAutosave, replaceSummary, keyLabel, FALLBACK_ART, guardClick } from "./core/html.mjs";
import { makeLog } from "./lib/log.mjs";
import { categoriesFor, categoryLabel, readKnown, hideKnown, addKnown, setKnownField, notebookActor } from "./known-data.mjs";

// the data half moved to known-data.mjs (S12); its public names are still reachable here
export {
  categoriesFor,
  categoryLabel,
  readKnown,
  writeKnown,
  addKnown,
  setKnownField,
  hideKnown,
  removeKnown,
  notebookActor
} from "./known-data.mjs";

const log = makeLog(MODULE);
/** A click whose write throws: the console line and the toast (ties-ui-rob-7). */
const CLICK = { log, notify: () => ui.notifications?.error(_loc("PENTARYN_TIES.notify.clickFailed")) };

/**
 * The tab id, exported so the entry point and the "open this entry" path cannot drift apart:
 * activating the tab means writing this exact string into `app.tabGroups.primary`, and two
 * copies of it is how a canvas key quietly starts landing on the Ties tab instead.
 */
export const KNOWN_TAB_ID = "known";

/**
 * Which rows are expanded, per actor — the same cosmetic state the ties panel keeps, and
 * deliberately NOT the same Map.
 *
 * Both lists key rows by the *other* actor's id, and one character can perfectly well have
 * both a tie to Wat Harrow and a Known entry about him. Sharing `editor.mjs`'s Map would
 * make those two rows one piece of state: open his tie, and his notebook page is open too.
 */
const expanded = makeOpenState(); // actorId -> Set(entryId)
const shownHidden = new Set();
const showingHidden = actorId => shownHidden.has(actorId);
const setShowHidden = (actorId, on) => (on ? shownHidden.add(actorId) : shownHidden.delete(actorId));

const expandedFor = expanded.of;
const setExpanded = expanded.set;

/** Drop a deleted actor's row state; nothing else holds a reference to it. */
export function forgetKnownActor(actorId) {
  expanded.forget(actorId);
  shownHidden.delete(actorId); // ties-31: a deleted actor's "show hidden" toggle goes with it
}

/** Test-only: how many actors the session maps hold (ties-31). */
export const _sizes = () => ({ expanded: expanded.size, shownHidden: shownHidden.size });

/**
 * Who is left to add.
 *
 * ⚠ **Not `candidates()` from `ties-adapter.mjs`**, which the plan names — that function excludes
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
  return keyLabel(game.keybindings?.get?.(MODULE, "fileKnown")?.[0]?.key);
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
    ui.notifications.warn(_loc("PENTARYN_TIES.known.notify.needCharacter"));
    return null;
  }

  const subject = canSee(token) ? baseActorOf(token) : null;
  // compared by ACTOR, not by token: with your own character on the map twice, hovering the
  // other copy is still asking to file yourself
  if (!subject || subject.id === actor.id) {
    ui.notifications.warn(_loc("PENTARYN_TIES.known.notify.needTarget"));
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
    log.error(`filing ${subject.id} on ${actor.id} failed`, err);
    ui.notifications.error(_loc("PENTARYN_TIES.known.notify.fileFailed"));
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
 *
 * Asking for a tucked-away (hidden) entry by name un-hides **that entry only** — a real write,
 * the same one its Unhide button makes, not a transient "show hidden" toggle — and repaints the
 * Known section in place, because an already-open sheet would otherwise keep the paint that
 * filtered the row out (ties-ui-E2, declared).
 */
export async function openKnownEntry(actor, id) {
  const list = readKnown(actor);
  const unhid = !!list.find(e => e.id === id)?.hidden && (await hideKnown(actor, id, false));
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
  if (unhid) {
    // the injector's own paint (sheet.mjs), so the repainted rows are wired exactly as a fresh one
    const repaint = () => {
      section.innerHTML = buildKnownHTML(actor);
      bindKnown(section.firstElementChild, actor, repaint);
    };
    repaint();
  }
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
  return `<span class="pt-known-when" data-tooltip="${esc(_loc("PENTARYN_TIES.known.filedTip", { date: d.toLocaleString() }))}">${esc(
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
  const name = `<span class="pt-name${entry.missing ? " pt-missing" : ""}">${esc(
    entry.name || _loc("PENTARYN_TIES.row.missingName")
  )}</span>`;
  const preview = notesPreview(entry.notes, _loc("PENTARYN_TIES.known.notesEmpty"));

  return `<div class="pt-summary" role="button" tabindex="0" aria-expanded="${open}"
      data-action="toggle" data-tooltip="${esc(_loc(canEdit ? "PENTARYN_TIES.known.expandEdit" : "PENTARYN_TIES.known.expandRead"))}"
      aria-label="${esc(_loc(canEdit ? "PENTARYN_TIES.known.expandEditOf" : "PENTARYN_TIES.known.expandReadOf", { name: entry.name }))}">
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
      `<div class="pt-known-kind">${esc(_loc("PENTARYN_TIES.known.study.kindLine", { name: study.kind.name }))}</div>`
    );
  }

  const actions = [];
  if (canEdit && study.content) {
    const disabled = study.spent || !study.gmOnline;
    const tip = study.spent
      ? _loc("PENTARYN_TIES.known.study.spentTip")
      : study.gmOnline
        ? _loc("PENTARYN_TIES.known.study.tip", { skill: study.skillLabel, name: study.kind.name })
        : _loc("PENTARYN_TIES.known.study.noGMTip");
    // spent is not "disabled": the button is GONE, so nothing on the row says a roll was made
    if (!study.spent) {
      actions.push(`<button type="button" class="pt-textbtn pt-study-btn" data-action="study"
          data-id="${esc(entry.id)}"${disabled ? " disabled" : ""} data-tooltip="${esc(tip)}">
        <i class="fa-solid fa-magnifying-glass"></i> ${esc(_loc("PENTARYN_TIES.known.study.button"))}
      </button>`);
    }
  }
  if (isGM) {
    actions.push(`<button type="button" class="pt-textbtn pt-kind-btn" data-action="kind"
        data-id="${esc(entry.id)}" data-tooltip="${esc(_loc("PENTARYN_TIES.known.study.kindTip"))}">
      <i class="fa-solid fa-sitemap"></i> ${esc(_loc("PENTARYN_TIES.known.study.kindButton"))}
    </button>`);
    /*
     * The GM's release control — the story route into a kind, since a study roll is one attempt
     * and a failure is final. Rungs are offered as a menu rather than a free number because the
     * ladder has exactly four, and typing 17 would silently mean 15.
     */
    actions.push(`<label class="pt-release" data-tooltip="${esc(_loc("PENTARYN_TIES.known.study.releaseTip"))}">
      <span>${esc(_loc("PENTARYN_TIES.known.study.release"))}</span>
      <select data-action="release" data-id="${esc(entry.id)}">
        <option value="">—</option>
        ${STUDY_RUNGS.map(r => `<option value="${r}">${r === 0 ? esc(_loc("PENTARYN_TIES.known.study.rung0")) : `DC ${r}`}</option>`).join("")}
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
 *
 * One granted fact, exactly as the Known tab draws it. Exported for the GM's inspect window, whose
 * player view must be the same furniture: `textHTML` replaces the escaped text (already-safe
 * markup, e.g. a `<details>` around a long kind payload) and `extra` is appended inside the body
 * (the GM's who-knows strip). The Known tab itself passes neither.
 *
 * Authored HTML is never escaped onto the page (Joe, 2026-10-13: a player reads "From Vel.", not
 * `<p>From Vel.</p>`): `richBox` draws it as an empty `data-enrich` box, and every place that
 * inserts this markup calls `paintRich` after, which enriches with `secrets: false`. Plain text is
 * escaped as before.
 */
export function grantCard(g, { extra = "", textHTML = null } = {}) {
  /*
   * No body, no card — not even its title. A grant whose text is blank (a failed roll's empty
   * record, an emptied tier, `<p></p>`) would otherwise draw its source line ("Starved") as a
   * header over nothing, which tells the player a check happened and came back empty. Every
   * caller treats "" as "nothing here" and drops the group when nothing is left.
   */
  // a grant that is only a GM secret block is blank to the player it is drawn for
  if (textHTML === null && isBlankProse(dropSecrets(String(g?.text ?? "")))) return "";
  return `<li class="pt-grant">
        ${g.icon ? `<img class="pt-grant-icon" src="${esc(g.icon)}" alt="">` : ""}
        <div class="pt-grant-body">
          ${g.source ? `<span class="pt-grant-source">${esc(g.source)}</span>` : ""}
          ${textHTML ?? richBox("pt-grant-text", String(g.text ?? ""))}
          ${extra}
        </div>
      </li>`;
}

/** The region head, shared with the inspect window's player view. */
export const grantedHead = () => `<div class="pt-granted-head">
      <i class="fa-solid fa-book-open-reader"></i>
      <span>${esc(_loc("PENTARYN_TIES.known.granted.label"))}</span>
    </div>`;

/** The granted cards' region — the Known tab's, and the Attributes tab's detail (ties-17). */
export function grantedRegion(grants) {
  if (!grants?.length) return "";
  const rows = grants.map(g => grantCard(g)).join("");
  if (!rows) return ""; // every card was blank: no region, no "What you have learned" head
  return `<section class="pt-granted" aria-label="${esc(_loc("PENTARYN_TIES.known.granted.label"))}">
    ${grantedHead()}
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
      <span>${esc(_loc("PENTARYN_TIES.known.lore.heading"))}</span>
    </div>
    <ul class="pt-lore-offer-list">
      ${open
        .map(
          r => `<li>
            <button type="button" class="pt-textbtn pt-lore-btn" data-action="lore"
                data-id="${esc(entry.id)}" data-lore="${esc(r.id)}"${r.gmOnline ? "" : " disabled"}
                data-tooltip="${esc(
                  r.gmOnline
                    ? _loc("PENTARYN_TIES.known.lore.tip", { label: r.label, skill: r.skillLabel, dc: r.dc })
                    : _loc("PENTARYN_TIES.known.study.noGMTip")
                )}">
              <span class="pt-lore-offer-label">${esc(r.label)}</span>
              <span class="pt-lore-offer-price">${esc(_loc("PENTARYN_TIES.known.lore.price", { skill: r.skillLabel, dc: r.dc }))}</span>
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
        <i class="fa-solid fa-arrow-up-right-from-square"></i> ${esc(_loc("PENTARYN_TIES.row.openSheet"))}
      </button>`;
  const controls = studyControls(entry, { canEdit, isGM, study });

  if (!canEdit) {
    const prose = notesProse(entry.notes, _loc("PENTARYN_TIES.known.notesEmpty"));
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
        <span class="pt-field-label">${esc(_loc("PENTARYN_TIES.known.categoryLabel"))}</span>
        ${categorySelect(entry, categories)}
      </label>
    </div>
    <label class="pt-field pt-field-notes">
      <span class="pt-field-label">${esc(_loc("PENTARYN_TIES.known.notesLabel"))}</span>
      <textarea class="pt-notes-text" data-field="notes" rows="6" maxlength="${KNOWN_NOTES_MAX}"
                placeholder="${esc(_loc("PENTARYN_TIES.known.notesPlaceholder", { name: entry.name }))}">${esc(entry.notes)}</textarea>
    </label>
    ${grantedRegion(grants)}
    ${loreOffers(entry, lore, canEdit)}
    <div class="pt-detail-actions">
      ${openSheet}
      <button type="button" class="pt-textbtn" data-action="hide" data-id="${esc(entry.id)}">
        <i class="fa-solid fa-${entry.hidden ? "eye" : "eye-slash"}"></i> ${esc(
          _loc(entry.hidden ? "PENTARYN_TIES.known.unhide" : "PENTARYN_TIES.known.hide")
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
  // the registry cannot change mid-paint: read (and clamp) it once, not once per entry (ties-23),
  // and index it once too — the per-entry filter would otherwise re-clamp it per row (ties-ui-perf-7)
  const registryIndex = indexRegistry(registryOf());
  /*
   * The study state per row, computed once here rather than inside the row builder — it walks
   * the kind's items to answer "is there anything to learn", and a notebook of thirty entries
   * would otherwise do that walk twice per paint.
   */
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
            index: registryIndex,
            beliefs: subject.getFlag(MODULE, BELIEFS_FLAG) ?? {},
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
    ? `<ul class="pt-list"><li class="pt-empty">${esc(_loc("PENTARYN_TIES.known.empty"))}</li></ul>`
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
          _loc(showHidden ? "PENTARYN_TIES.known.hideHidden" : "PENTARYN_TIES.known.showHidden", { count: hiddenCount })
        )}
      </button>`
    : "";

  const add = canEdit
    ? `<div class="pt-add-bar">
        <button type="button" class="pt-add-btn" data-action="known-add">
          <i class="fa-solid fa-plus"></i> ${esc(_loc("PENTARYN_TIES.known.add"))}
        </button>
        <span class="pt-add-hint">${esc(_loc("PENTARYN_TIES.known.addHint", { key: knownKey() }))}</span>
      </div>`
    : "";

  return `<div class="pentaryn-ties pentaryn-known" data-actor-id="${esc(actor.id)}">
    <p class="pt-known-intro">${esc(_loc("PENTARYN_TIES.known.hint"))}</p>
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
  paintRich(root, { log }); // the granted cards' authored HTML, as clean text (wave 3)

  root.querySelectorAll('[data-action="toggle"]').forEach(head => {
    const row = head.closest(".pt-row");
    const wrap = row?.querySelector(".pt-detail-wrap");
    if (!wrap) return;
    // straight to the prose: unlike a tie row there is no word to name first, and the notes ARE the entry
    bindRowToggle(head, row, { wrap, onToggle: open => setExpanded(actor.id, row.dataset.id, open), focus: '[data-field="notes"]' });
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
    btn.addEventListener("click", () => {
      const subject = game.actors?.get(btn.dataset.id);
      if (!subject) return;
      // one gesture, one roll — disabled while it runs, so a double-click cannot queue two
      return guardClick("study", btn, async () => {
        await requestStudy(actor, subject);
        rerender();
      }, CLICK);
    });
  });

  /*
   * The individual axis. Same repaint contract as the kind button above and for the same
   * reason: `rerender` runs unconditionally, so a pass, a failure and a held roll all leave
   * this client looking identical — one fewer row on offer, nothing else.
   */
  root.querySelectorAll('[data-action="lore"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const subject = game.actors?.get(btn.dataset.id);
      if (!subject) return;
      // one gesture, one roll — disabled while it runs, so a double-click cannot queue two
      return guardClick("lore", btn, async () => {
        await requestLore(actor, subject, btn.dataset.lore);
        rerender();
      }, CLICK);
    });
  });

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

  // GM only, and gated in the markup rather than here only because the button is the whole
  // feature: the minimal kind-pointer picker phase 4's authoring section absorbs.
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

    /*
     * Autosave while typing, on the Ties tab's 700 ms; blur flushes a pending save rather than
     * cancelling it (ties-ui-M1). Shared with the Ties tab (ties-ui-EXT-3). The preview line is
     * hidden by CSS while the row is open, so the swap is invisible until the row closes — which is
     * exactly when it must already be right.
     */
    const notes = row.querySelector('[data-field="notes"]');
    if (notes) {
      bindNotesAutosave(
        notes,
        async value => {
          if (!(await setKnownField(actor, id, "notes", value))) return;
          const entry = readKnown(actor).find(e => e.id === id);
          if (!entry) return;
          const html = summary(entry, { open: row.classList.contains("pt-open"), canEdit });
          replaceSummary(row, html, next =>
            bindSummary(next, row, { onToggle: open => setExpanded(actor.id, row.dataset.id, open), focus: '[data-field="notes"]' })
          );
        },
        { ms: 700 }
      );
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
      const entry = readKnown(actor).find(e => e.id === btn.dataset.id);
      if (!entry) return;
      // the button says Hide or Unhide from this paint; the write reads the list in the actor's queue
      await hideKnown(actor, entry.id, !entry.hidden);
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
    ui.notifications.info(_loc("PENTARYN_TIES.known.picker.empty"));
    return null;
  }
  const opts = options
    .map(c => `<option value="${esc(c.actor.id)}">${esc(c.label)}</option>`)
    .join("");
  const content = `<div class="pt-known-picker">
    <label class="pt-field">
      <span class="pt-field-label">${esc(_loc("PENTARYN_TIES.known.picker.label"))}</span>
      <select name="target">
        <option value="">${esc(_loc("PENTARYN_TIES.known.picker.placeholder"))}</option>
        ${opts}
      </select>
    </label>
  </div>`;

  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: _loc("PENTARYN_TIES.known.picker.title") },
    classes: ["pentaryn-tie-dialog", "pt-tie-dialog"],
    content,
    ok: {
      label: _loc("PENTARYN_TIES.known.picker.add"),
      callback: (event, button) => button.form.elements.target.value
    },
    rejectClose: false
  });
  if (!chosen) return null;

  const entry = await addKnown(actor, chosen);
  if (!entry) {
    ui.notifications.warn(_loc("PENTARYN_TIES.known.notify.exists", { name: game.actors.get(chosen)?.name ?? chosen }));
    return null;
  }
  // open the new row on arrival: the gesture that files someone is meant to end in writing
  // about them, and hunting for the row you just created is a step nobody should pay for
  setExpanded(actor.id, entry.id, true);
  onAdded();
  return entry;
}
