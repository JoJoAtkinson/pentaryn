/**
 * Attribute Review — the GM's flat list of every registry entry, for **human review and text
 * editing only**.
 *
 * Joe's design: structure (ids, new entries, deletes, parents, links, lore rows) is changed by
 * prompting Claude; this window is where he reads what exists, fixes wording, signs each entry
 * off, and ticks the ones he wants to talk about. So it deliberately cannot:
 *
 *   create · delete · change an id · add/remove/reorder lore rows · link/unlink carriers ·
 *   change parent, icon, secret, help scale, hold or source.
 *
 * Those are shown as plain text so he can name them in a prompt.
 *
 * Review state lives on each entry (`createdAt / modifiedAt / reviewedAt / touched`, epoch ms —
 * see known-core `reviewState`). An edit made here goes through `reviewedUpdate`, which never
 * changes the review state: a reviewed entry stays reviewed, an unreviewed or changed one stays
 * that way until Joe clicks Mark reviewed. An edit through the public API (`attributes.update`,
 * i.e. Claude) un-reviews it and records which fields it touched. The sign-off stores a
 * `reviewedSnapshot`, and an open row shows the old text next to anything changed since.
 *
 * Every registry write is queued in attributes.mjs, so a field save, a Reviewed click and a
 * Claude write can never read-modify-write over each other. Rows keep their order while Joe works
 * (`this.order`); it is recomputed on open, on a sort change, after Reviewed/Unreview, and from
 * the Re-sort button. A refresh held back while Joe types is checked against what each open row
 * was drawn from (`this.base`): a row Claude changed underneath gets a reload banner, and a field
 * whose stored value moved is refused rather than saved over Claude's change.
 *
 * The ticked boxes live in a user flag (`attrSelected`) so Claude can read them with
 * `game.pentaryn.ties.attributes.selected()` — see context/foundry/attribute-review.md.
 *
 * ⚠ GM only: the toolbar button is only added for a GM, `open()` refuses anyone else, and the
 * constructor throws. Use doc: context/foundry/attribute-review.md.
 */

import { MODULE } from "./ties-core.mjs";
import {
  registry,
  attributeIdsOf,
  iconForCategory,
  reviewedUpdate,
  reviewedLoreUpdate,
  reviewAttribute,
  unreviewAttribute,
  selectionIds,
  selectAttributes,
  SELECTION_FLAG
} from "./attributes.mjs";
import { kindActorOf } from "./study.mjs";
import { personalCluesHTML } from "./attributes-ui.mjs";
import { reviewState, sortForReview, childrenOf, readLore, REVIEW_SORTS, REGISTRY_SETTING } from "./known-core.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

/** The review panel's sort labels (literal keys). */
const SORT_LABEL = Object.freeze({
  review: "PENTARYN_TIES.review.sort.review",
  title: "PENTARYN_TIES.review.sort.title",
  modified: "PENTARYN_TIES.review.sort.modified",
  category: "PENTARYN_TIES.review.sort.category"
});
/** The review panel's tab labels. */
const TAB_LABEL = Object.freeze({
  world: "PENTARYN_TIES.review.tab.world",
  personal: "PENTARYN_TIES.review.tab.personal"
});
/** The "was" labels of the four snapshot fields. */
const FIELD_LABEL = Object.freeze({
  title: "PENTARYN_TIES.review.field.title",
  category: "PENTARYN_TIES.review.field.category",
  skill: "PENTARYN_TIES.review.field.skill",
  dc: "PENTARYN_TIES.review.field.dc"
});

const { ApplicationV2 } = foundry.applications.api;

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const skillLabel = s => CONFIG.DND5E?.skills?.[s]?.label ?? s;
const CARRIERS_SHOWN = 8;
const SETTING_KEY = `${MODULE}.${REGISTRY_SETTING}`;

/** "2h ago" with the ISO time as tooltip; `null` → the "before timestamps" dash. */
function when(ms) {
  if (typeof ms !== "number") return `<span class="pt-review-time" data-tooltip="${esc(_loc("PENTARYN_TIES.review.untimedTip"))}">${esc(_loc("PENTARYN_TIES.review.never"))}</span>`;
  let ago;
  try {
    ago = foundry.utils.timeSince(ms);
  } catch {
    ago = new Date(ms).toLocaleString();
  }
  return `<span class="pt-review-time" data-tooltip="${esc(new Date(ms).toISOString())}">${esc(ago)}</span>`;
}

async function copyText(text) {
  try {
    if (game.clipboard?.copyPlainText) await game.clipboard.copyPlainText(text);
    else await navigator.clipboard.writeText(text);
    ui.notifications.info(_loc("PENTARYN_TIES.review.copied"));
  } catch (err) {
    log.warn(`copy failed`, err);
  }
}

const isField = el => el instanceof HTMLElement && el.matches("input, textarea, select");

/** The fields an open row lets Joe edit — what `this.base` compares to spot a change underneath. */
const EDITABLE = ["title", "category", "skill", "dc", "reveal", "miss"];
const LORE_EDITABLE = ["label", "skill", "dc", "text", "miss"];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** The part of an entry an open row was drawn from. */
const baseOf = e => ({ ...Object.fromEntries(EDITABLE.map(k => [k, e[k]])), lore: readLore(e.lore) });

export class AttributeReview extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "pentaryn-attr-review",
    classes: ["pentaryn-attr-review", "pt-attr-review"],
    window: { title: "PENTARYN_TIES.review.title", icon: "fa-solid fa-tags", resizable: true },
    position: { width: 780, height: 860 }
  };

  /** The one window. Refuses a non-GM with a notification and returns `null`. */
  static open() {
    if (!game.user?.isGM) {
      ui.notifications.warn(_loc("PENTARYN_TIES.review.gmOnly"));
      return null;
    }
    const existing = foundry.applications.instances?.get?.(AttributeReview.DEFAULT_OPTIONS.id);
    if (existing) {
      existing.render({ force: true });
      existing.bringToFront?.();
      return existing;
    }
    return new AttributeReview().render({ force: true });
  }

  constructor(options = {}) {
    if (!game.user?.isGM) throw new Error(`${MODULE} | attribute review is GM only`);
    super(options);
    // UI state — memory only, never persisted
    this.search = "";
    this.sort = "review";
    this.filter = "all";
    // World = reusable world-building; Personal = one character's own history (category "personal")
    this.tab = "world";
    this.expanded = new Set();
    this.scrollTop = 0;
    this.selection = new Set(selectionIds());
    this.pendingRender = false;
    // the row order, held fixed while Joe works; `resortNext` recomputes it on the next render
    this.order = null;
    this.resortNext = true;
    // id → baseOf(entry) for each open row as drawn; ids Claude changed underneath; own saves in flight
    this.base = new Map();
    this.stale = new Set();
    this.inflight = new Map();
    this.selWrites = Promise.resolve();
    this.selWriting = 0;
    this.hookIds = null;
  }

  /* ── live refresh ──────────────────────────────────────────────────────── */

  /** Is Joe typing in this window right now? */
  editing() {
    const a = document.activeElement;
    // the tick box and the search box hold no draft that a repaint could eat (the search text is
    // kept in `this.search` and focus is put back after the repaint)
    return isField(a) && !!this.element?.contains(a) && !a.matches(".pt-review-sel, .pt-review-search");
  }

  /** Re-render, unless that would eat a draft — then wait for the field to let go. */
  safeRender() {
    if (!this.rendered) return;
    if (this.editing()) {
      this.pendingRender = true;
      this.markStale();
      return;
    }
    this.pendingRender = false;
    this.render();
  }

  /**
   * A refresh is being held back: flag every open row whose stored text no longer matches what it
   * was drawn from, so Joe sees Claude's change before he types over it. Rows with one of our own
   * saves in flight are checked when that save lands instead.
   */
  markStale() {
    const byId = new Map(registry().map(e => [e.id, e]));
    for (const [id, base] of this.base) {
      if (this.stale.has(id) || this.inflight.get(id)) continue;
      const e = byId.get(id);
      if (!e || !same(baseOf(e), base)) this.flagStale(id);
    }
  }

  flagStale(id) {
    this.stale.add(id);
    const li = this.root?.querySelector(`.pt-review-row[data-id="${CSS.escape(id)}"]`);
    const detail = li?.querySelector(".pt-review-detail");
    if (!detail || detail.querySelector(".pt-review-stale")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pt-review-stale";
    btn.innerHTML = `<i class="fa-solid fa-rotate"></i> ${esc(_loc("PENTARYN_TIES.review.stale"))}`;
    btn.addEventListener("click", () => {
      this.pendingRender = false;
      this.render();
    });
    detail.prepend(btn);
  }

  flushPending() {
    // after focus has settled on whatever comes next
    setTimeout(() => this.pendingRender && this.safeRender(), 0);
  }

  attachHooks() {
    if (this.hookIds) return;
    this.hookIds = {
      updateSetting: Hooks.on("updateSetting", s => {
        if (s?.key === SETTING_KEY) this.safeRender();
      }),
      createSetting: Hooks.on("createSetting", s => {
        if (s?.key === SETTING_KEY) this.safeRender();
      }),
      updateUser: Hooks.on("updateUser", (user, changes) => {
        if (user?.id !== game.user?.id) return;
        if (!foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE}`)) return;
        if (this.selWriting > 0) return; // our own write in flight; the set is already right
        this.selection = new Set(selectionIds());
        this.syncSelectionDOM();
      })
    };
  }

  async _onClose(options) {
    if (this.hookIds) for (const [hook, id] of Object.entries(this.hookIds)) Hooks.off(hook, id);
    this.hookIds = null;
    return super._onClose?.(options);
  }

  /* ── data ──────────────────────────────────────────────────────────────── */

  /** id → carrier actor names, computed per render (world actors; unlinked tokens not counted). */
  carriers() {
    const map = new Map();
    // the same walk, keeping the actors too: the personal-clue rows need them (ties-27)
    const actors = new Map();
    for (const actor of game.actors?.contents ?? []) {
      let ids = [];
      try {
        ids = attributeIdsOf(actor, kindActorOf);
      } catch {
        continue;
      }
      for (const id of ids) {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(actor.name);
        if (!actors.has(id)) actors.set(id, []);
        actors.get(id).push(actor);
      }
    }
    this.carrierActors = actors;
    return map;
  }

  /* ── render ────────────────────────────────────────────────────────────── */

  async _renderHTML() {
    const list = registry();
    const live = new Set(list.map(e => e.id));
    for (const id of [...this.selection]) if (!live.has(id)) this.selection.delete(id);
    const byId = new Map(list.map(e => [e.id, e]));
    const carriers = this.carriers();
    /*
     * Fixed order while Joe works: a refresh (his edit, Claude's write elsewhere) must not move the
     * row under his cursor. New entries go to the top; deleted ones drop out.
     */
    if (!this.order || this.resortNext) {
      this.order = sortForReview(list, this.sort).map(e => e.id);
      this.resortNext = false;
    } else {
      const known = new Set(this.order);
      const fresh = sortForReview(list.filter(e => !known.has(e.id)), this.sort).map(e => e.id);
      this.order = [...fresh, ...this.order.filter(id => byId.has(id))];
    }
    const rows = this.order.map(id => byId.get(id));
    // a full repaint redraws every open row from the registry as it is now
    this.base = new Map(rows.filter(e => this.expanded.has(e.id)).map(e => [e.id, baseOf(e)]));
    this.stale.clear();

    const sortOpts = REVIEW_SORTS.map(
      m => `<option value="${m}" ${m === this.sort ? "selected" : ""}>${esc(_loc(SORT_LABEL[m] ?? `PENTARYN_TIES.review.sort.${m}`))}</option>`
    ).join("");
    const chip = (k, label) =>
      `<button type="button" class="pt-chip ${this.filter === k ? "pt-chip-on" : ""}" data-filter="${k}">${label}</button>`;

    // Scope filter, beside the others: Global (reusable world-building) or Personal (one character's history)
    const scope = k =>
      `<button type="button" class="pt-chip pt-review-tab ${this.tab === k ? "pt-chip-on" : ""}" data-tab="${k}">${esc(_loc(TAB_LABEL[k] ?? `PENTARYN_TIES.review.tab.${k}`))} (<span data-count="tab-${k}">0</span>)</button>`;
    const head = `<header class="pt-review-head">
      <div class="pt-review-bar">
        <input type="search" class="pt-review-search" placeholder="${esc(_loc("PENTARYN_TIES.review.search"))}" value="${esc(this.search)}">
        <select class="pt-review-sort" aria-label="sort">${sortOpts}</select>
        <button type="button" class="pt-textbtn" data-act="resort" data-tooltip="${esc(_loc("PENTARYN_TIES.review.resortTip"))}"><i class="fa-solid fa-arrow-down-short-wide"></i> ${esc(_loc("PENTARYN_TIES.review.resort"))}</button>
      </div>
      <div class="pt-review-bar">
        ${scope("world")}${scope("personal")}
        <span class="pt-review-divider"></span>
        ${chip("all", esc(_loc("PENTARYN_TIES.review.filter.all")))}
        ${chip("needs", `${esc(_loc("PENTARYN_TIES.review.filter.needs"))} (<span data-count="needs">0</span>)`)}
        ${chip("selected", `${esc(_loc("PENTARYN_TIES.review.filter.selected"))} (<span data-count="selected">0</span>)`)}
        <span class="pt-review-spacer"></span>
        <button type="button" class="pt-textbtn" data-act="select-visible"><i class="fa-regular fa-square-check"></i> ${esc(_loc("PENTARYN_TIES.review.selectVisible"))}</button>
        <button type="button" class="pt-textbtn" data-act="select-none"><i class="fa-regular fa-square"></i> ${esc(_loc("PENTARYN_TIES.review.selectNone"))}</button>
        <button type="button" class="pt-textbtn" data-act="copy-selected"><i class="fa-regular fa-copy"></i> ${esc(_loc("PENTARYN_TIES.review.copySelected"))}</button>
      </div>
      <p class="pt-review-counts"></p>
    </header>`;

    if (!list.length) return `<div class="pentaryn-ties pt-review">${head}<p class="pt-empty">${esc(_loc("PENTARYN_TIES.review.empty"))}</p></div>`;

    const body = rows.map(e => this.row(e, byId, list, carriers)).join("");
    return `<div class="pentaryn-ties pt-review">${head}
      <ul class="pt-review-list">${body}</ul>
      <p class="pt-empty pt-review-nomatch" hidden></p>
    </div>`;
  }

  row(e, byId, list, carriers) {
    const state = reviewState(e);
    const open = this.expanded.has(e.id);
    const lore = readLore(e.lore);
    const who = carriers.get(e.id) ?? [];
    const kids = childrenOf(e.id, list);
    const parent = e.parent ? byId.get(e.parent) : null;
    const icon = e.icon || iconForCategory(e.category);
    const search = [e.id, e.title, e.category, e.reveal, e.miss, ...lore.flatMap(r => [r.label, r.text, r.miss])]
      .join("\n")
      .toLowerCase();

    const badge =
      state === "unreviewed"
        ? `<span class="pt-review-badge pt-review-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(_loc("PENTARYN_TIES.review.state.unreviewed"))}</span>`
        : state === "changed"
          ? `<span class="pt-review-badge pt-review-warn"><i class="fa-solid fa-pen"></i> ${esc(
              _loc("PENTARYN_TIES.review.changedFields", { fields: e.touched.length ? e.touched.join(", ") : _loc("PENTARYN_TIES.review.state.changed") })
            )}</span>`
          : `<span class="pt-review-badge pt-review-ok" data-tooltip="${esc(
              _loc("PENTARYN_TIES.review.reviewedAt", { when: new Date(e.reviewedAt).toLocaleString() })
            )}"><i class="fa-solid fa-check"></i> ${esc(_loc("PENTARYN_TIES.review.state.reviewed"))}</span>`;
    const signBtn =
      state === "reviewed"
        ? `<button type="button" class="pt-textbtn pt-review-quiet" data-act="unreview" data-tooltip="${esc(_loc("PENTARYN_TIES.review.unmarkTip"))}">${esc(_loc("PENTARYN_TIES.review.unmark"))}</button>`
        : `<button type="button" class="pt-review-sign" data-act="review"><i class="fa-solid fa-check"></i> ${esc(_loc("PENTARYN_TIES.review.markReviewed"))}</button>`;

    const summary = `<div class="pt-review-summary" data-act="toggle">
      <input type="checkbox" class="pt-review-sel" data-act="select" ${this.selection.has(e.id) ? "checked" : ""} aria-label="select">
      <img class="pt-attr-icon" src="${esc(icon)}" alt="">
      <span class="pt-review-main">
        <span class="pt-review-line"><b class="pt-review-title">${esc(e.title)}</b>
          ${e.category ? `<span class="pt-review-cat">${esc(e.category)}</span>` : ""}
          <code class="pt-review-id" data-act="copy-id" data-tooltip="${esc(_loc("PENTARYN_TIES.review.copyId"))}">${esc(e.id)}</code></span>
        <span class="pt-review-line pt-review-meta">
          ${parent || e.parent ? `<span class="pt-review-link pt-review-parent" data-tooltip="${esc(_loc("PENTARYN_TIES.attributes.chain.needsTip", { title: parent?.title ?? e.parent }))}"><i class="fa-solid fa-lock"></i> ${esc(_loc("PENTARYN_TIES.attributes.chain.needs", { title: parent?.title ?? e.parent }))}</span>` : ""}
          ${kids.length ? `<span class="pt-review-link pt-review-kids" data-tooltip="${esc(_loc("PENTARYN_TIES.attributes.chain.unlocksTip", { titles: kids.map(k => k.title).join(", ") }))}"><i class="fa-solid fa-key"></i> ${esc(_loc("PENTARYN_TIES.attributes.chain.unlocks", { titles: kids.map(k => k.title).join(", ") }))}</span>` : ""}
          <span>${esc(_loc("PENTARYN_TIES.review.facts", { n: lore.length }))}</span>
          <span>${esc(_loc("PENTARYN_TIES.review.carrierCount", { n: who.length }))}</span>
          <span>${esc(_loc("PENTARYN_TIES.review.modified"))} ${when(e.modifiedAt)}</span>
          ${badge}</span>
      </span>
      ${signBtn}
      <i class="fa-solid fa-chevron-${open ? "up" : "down"} pt-review-caret"></i>
    </div>`;

    const personal = String(e.category ?? "").trim().toLowerCase() === "personal";
    return `<li class="pt-review-row" data-id="${esc(e.id)}" data-tab="${personal ? "personal" : "world"}" data-state="${state}" data-needs="${state !== "reviewed"}" data-search="${esc(search)}">
      ${summary}${open ? this.detail(e, lore, who, kids, parent) : ""}</li>`;
  }

  skillSelect(name, value, extra = "") {
    const skills = CONFIG.DND5E?.skills ?? {};
    const keys = Object.keys(skills);
    if (value && !keys.includes(value)) keys.unshift(value);
    const opts = keys.map(k => `<option value="${esc(k)}" ${k === value ? "selected" : ""}>${esc(skillLabel(k))}</option>`).join("");
    return `<select ${name ? `data-field="${name}"` : ""} ${extra}>${opts}</select>`;
  }

  detail(e, lore, who, kids, parent) {
    const field = (label, html) => `<label class="pt-review-field"><span class="pt-field-label">${esc(label)}</span>${html}</label>`;
    /*
     * What the text said at Joe's last sign-off, shown under anything that differs — so "Changed
     * since review: lore" is a diff to read, not four rows to reread. Only once something needs
     * review, and only for entries signed off since snapshots existed.
     */
    const snap = reviewState(e) !== "reviewed" ? e.reviewedSnapshot : null;
    const shown = v => (v === null || v === undefined || v === "" ? "—" : typeof v === "string" ? v : JSON.stringify(v));
    const was = (k, cur, label = "") =>
      snap && k in snap && !same(snap[k], cur)
        ? `<p class="pt-review-was"><b>${esc(_loc("PENTARYN_TIES.review.was"))}</b>${label ? ` ${esc(label)}:` : ""} ${esc(k === "skill" ? skillLabel(snap[k]) : shown(snap[k]))}</p>`
        : "";
    const fields = `<div class="pt-review-fields">
      ${field(_loc("PENTARYN_TIES.review.field.title"), `<input type="text" data-field="title" value="${esc(e.title)}">`)}
      ${field(_loc("PENTARYN_TIES.review.field.category"), `<input type="text" data-field="category" value="${esc(e.category)}">`)}
      ${field(_loc("PENTARYN_TIES.review.field.skill"), this.skillSelect("skill", e.skill))}
      ${field(_loc("PENTARYN_TIES.review.field.dc"), `<input type="number" min="1" max="40" step="1" data-field="dc" value="${e.dc}">`)}
    </div>
    ${["title", "category", "skill", "dc"].map(k => was(k, e[k], _loc(FIELD_LABEL[k] ?? `PENTARYN_TIES.review.field.${k}`))).join("")}
    ${field(_loc("PENTARYN_TIES.review.field.reveal"), `<textarea data-field="reveal">${esc(e.reveal)}</textarea>`)}
    ${was("reveal", e.reveal)}
    ${field(_loc("PENTARYN_TIES.review.field.miss"), `<textarea data-field="miss">${esc(e.miss)}</textarea>`)}
    ${was("miss", e.miss)}`;

    const others = ["parent", "secret", "whenKnown", "whenCarried", "hold"].map(k => was(k, e[k], k)).join("");
    const carriersShown = who.slice(0, CARRIERS_SHOWN).map(esc).join(", ");
    const more = who.length > CARRIERS_SHOWN ? ` ${esc(_loc("PENTARYN_TIES.review.more", { n: who.length - CARRIERS_SHOWN }))}` : "";
    const hold = esc(_loc(`PENTARYN_TIES.review.hold.${e.hold === true ? "held" : e.hold === false ? "notHeld" : "default"}`));
    const rel = `<dl class="pt-review-rel">
      <dt>${esc(_loc("PENTARYN_TIES.review.parent"))}</dt><dd>${
        e.parent ? `${esc(parent?.title ?? "?")} <code>${esc(e.parent)}</code>${parent ? "" : ` ${esc(_loc("PENTARYN_TIES.review.dangling"))}`}` : esc(_loc("PENTARYN_TIES.review.root"))
      }</dd>
      <dt>${esc(_loc("PENTARYN_TIES.review.children"))}</dt><dd>${
        kids.length ? kids.map(k => `${esc(k.title)} <code>${esc(k.id)}</code>`).join(", ") : esc(_loc("PENTARYN_TIES.review.none"))
      }</dd>
      <dt>${esc(_loc("PENTARYN_TIES.review.carriers"))}</dt><dd>${who.length ? `${who.length}: ${carriersShown}${more}` : esc(_loc("PENTARYN_TIES.review.none"))}</dd>
      <dt>${esc(_loc("PENTARYN_TIES.review.flags"))}</dt><dd>secret: ${esc(_loc(e.secret ? "PENTARYN_TIES.review.yes" : "PENTARYN_TIES.review.no"))} · whenKnown: ${esc(e.whenKnown)} · whenCarried: ${esc(
        e.whenCarried
      )} · hold: ${hold}${e.source?.path ? ` · source: <code>${esc(e.source.path)}</code>` : ""}</dd>
    </dl>${others}`;

    const snapLore = snap && Array.isArray(snap.lore) ? new Map(snap.lore.map(r => [r.id, r])) : null;
    const loreTag = r => {
      if (!snapLore) return "";
      const old = snapLore.get(r.id);
      if (!old) return `<span class="pt-review-lore-tag">${esc(_loc("PENTARYN_TIES.review.loreNew"))}</span>`;
      return same(old, r) ? "" : `<span class="pt-review-lore-tag">${esc(_loc("PENTARYN_TIES.review.loreChanged"))}</span>`;
    };
    const loreWas = (r, k) => {
      const old = snapLore?.get(r.id);
      if (!old || same(old[k], r[k])) return "";
      return `<p class="pt-review-was"><b>${esc(_loc("PENTARYN_TIES.review.was"))}</b> ${esc(k === "skill" ? skillLabel(old[k]) : shown(old[k]))}</p>`;
    };
    const removed = snapLore ? [...snapLore.values()].filter(o => !lore.some(r => r.id === o.id)) : [];

    const loreCards = lore.length
      ? lore
          .map(
            (r, n) => `<div class="pt-review-lore ${loreTag(r) ? "pt-review-lore-changed" : ""}" data-lore="${esc(r.id)}">
          <div class="pt-review-fields">
            ${field(`${n + 1}. ${_loc("PENTARYN_TIES.review.field.label")}`, `<input type="text" data-lore-field="label" value="${esc(r.label)}">`)}
            ${field(_loc("PENTARYN_TIES.review.field.skill"), this.skillSelect("", r.skill, `data-lore-field="skill"`))}
            ${field(_loc("PENTARYN_TIES.review.field.dc"), `<input type="number" min="1" max="40" step="1" data-lore-field="dc" value="${r.dc}">`)}
            <span class="pt-review-loreid"><code>${esc(r.id)}</code> ${loreTag(r)}</span>
          </div>
          ${["label", "skill", "dc"].map(k => loreWas(r, k)).join("")}
          ${field(_loc("PENTARYN_TIES.review.field.text"), `<textarea data-lore-field="text">${esc(r.text)}</textarea>`)}
          ${loreWas(r, "text")}
          ${field(_loc("PENTARYN_TIES.review.field.miss"), `<textarea data-lore-field="miss">${esc(r.miss)}</textarea>`)}
          ${loreWas(r, "miss")}
        </div>`
          )
          .join("")
      : `<p class="pt-empty">${esc(_loc("PENTARYN_TIES.review.noFacts"))}</p>`;
    const removedLine = removed.length
      ? `<p class="pt-review-was">${esc(_loc("PENTARYN_TIES.review.loreRemoved", { labels: removed.map(o => `${o.label || "(unlabelled)"} [${o.id}]`).join("; ") }))}</p>`
      : "";

    const timeline = `<p class="pt-review-timeline">
      ${esc(_loc("PENTARYN_TIES.review.created"))} ${when(e.createdAt)} · ${esc(_loc("PENTARYN_TIES.review.modified"))} ${when(e.modifiedAt)} · ${esc(_loc("PENTARYN_TIES.review.reviewed"))} ${when(e.reviewedAt)}
      ${e.touched.length ? ` · ${esc(_loc("PENTARYN_TIES.review.touched", { fields: e.touched.join(", ") }))}` : ""}</p>`;

    return `<div class="pt-review-detail">
      <p class="pt-review-shared"><i class="fa-solid fa-users"></i> ${esc(_loc("PENTARYN_TIES.attributes.sharedWarning", { title: e.title }))}</p>
      ${fields}
      <h4>${esc(_loc("PENTARYN_TIES.review.relationships"))}</h4>${rel}
      ${personalCluesHTML(e, this.carrierActors ? id => this.carrierActors.get(id) ?? [] : null)}
      <h4>${esc(_loc("PENTARYN_TIES.review.factsHeading"))}</h4>${loreCards}${removedLine}
      ${timeline}
      <div class="pt-review-actions">
        <button type="button" class="pt-textbtn" data-act="copy-id"><i class="fa-regular fa-copy"></i> ${esc(_loc("PENTARYN_TIES.review.copyId"))}</button>
        <button type="button" class="pt-textbtn" data-act="copy-summary"><i class="fa-regular fa-clipboard"></i> ${esc(_loc("PENTARYN_TIES.review.copySummary"))}</button>
      </div>
    </div>`;
  }

  /* ── DOM ───────────────────────────────────────────────────────────────── */

  _replaceHTML(result, content) {
    const prev = content.querySelector(".pt-review-list");
    if (prev) this.scrollTop = content.scrollTop;
    // the search box is not held back by a refresh, so put its focus and cursor back after one
    const searchFocused = document.activeElement?.matches?.(".pt-review-search") && content.contains(document.activeElement);
    const caret = searchFocused ? document.activeElement.selectionStart : null;
    content.innerHTML = result;
    this.attachHooks();
    this.bind(content);
    this.applyFilter();
    content.scrollTop = this.scrollTop;
    if (searchFocused) {
      const search = content.querySelector(".pt-review-search");
      if (search) {
        search.focus({ preventScroll: true });
        const pos = caret ?? search.value.length;
        // type=search may refuse a range in some engines
        log.swallow("review: caret not restored", () => search.setSelectionRange(pos, pos), undefined);
      }
    }
  }

  get root() {
    return this.element?.querySelector(".pt-review") ?? null;
  }

  /** Search + filter applied in the DOM, so typing never repaints. Also refreshes the counts. */
  applyFilter() {
    const root = this.root;
    if (!root) return;
    const q = this.search.trim().toLowerCase();
    let shown = 0;
    const tabCounts = { world: 0, personal: 0 };
    for (const li of root.querySelectorAll(".pt-review-row")) tabCounts[li.dataset.tab] = (tabCounts[li.dataset.tab] ?? 0) + 1;
    for (const li of root.querySelectorAll(".pt-review-row")) {
      const id = li.dataset.id;
      const pass =
        li.dataset.tab === this.tab &&
        (!q || li.dataset.search.includes(q)) &&
        (this.filter === "all" || (this.filter === "needs" && li.dataset.needs === "true") || (this.filter === "selected" && this.selection.has(id)));
      li.hidden = !pass;
      if (pass) shown++;
    }
    const total = root.querySelectorAll(`.pt-review-row[data-tab="${this.tab}"]`).length;
    const needs = root.querySelectorAll(`.pt-review-row[data-tab="${this.tab}"][data-needs="true"]`).length;
    for (const k of ["world", "personal"]) {
      const span = root.querySelector(`[data-count="tab-${k}"]`);
      if (span) span.textContent = String(tabCounts[k] ?? 0);
      const need = root.querySelectorAll(`.pt-review-row[data-tab="${k}"][data-needs="true"]`).length;
      root.querySelector(`[data-tab="${k}"].pt-review-tab`)?.classList.toggle("pt-review-tab-warn", need > 0);
    }
    const nomatch = root.querySelector(".pt-review-nomatch");
    if (nomatch) {
      nomatch.hidden = shown > 0;
      nomatch.textContent = this.filter === "needs" && !q ? _loc("PENTARYN_TIES.review.allReviewed") : _loc("PENTARYN_TIES.review.noMatches");
    }
    const sel = this.selection.size;
    const counts = root.querySelector(".pt-review-counts");
    if (counts) counts.textContent = _loc("PENTARYN_TIES.review.counts", { needs, total, selected: sel });
    for (const [k, v] of [["needs", needs], ["selected", sel]]) {
      const span = root.querySelector(`[data-count="${k}"]`);
      if (span) span.textContent = String(v);
    }
  }

  /** Ticks reflect `this.selection`, without a repaint. */
  syncSelectionDOM() {
    const root = this.root;
    if (!root) return;
    for (const li of root.querySelectorAll(".pt-review-row")) {
      const box = li.querySelector(".pt-review-sel");
      if (box) box.checked = this.selection.has(li.dataset.id);
    }
    this.applyFilter();
  }

  /** Writes are queued, so rapid ticking cannot interleave and lose a box. */
  saveSelection() {
    const ids = [...this.selection];
    this.selWriting++;
    this.selWrites = this.selWrites
      .then(() => selectAttributes(ids, { replace: true }))
      .catch(err => log.warn(`selection save failed`, err))
      .finally(() => {
        this.selWriting--;
      });
    this.syncSelectionDOM();
  }

  summaryText(id) {
    const list = registry();
    const e = list.find(x => x.id === id);
    if (!e) return id;
    const byId = new Map(list.map(x => [x.id, x]));
    const kids = childrenOf(id, list).map(k => `${k.title} (${k.id})`);
    const who = this.carriers().get(id) ?? [];
    const lore = readLore(e.lore);
    return [
      `${e.title} — id: ${e.id}${e.category ? ` — category: ${e.category}` : ""}`,
      `parent: ${e.parent ? `${byId.get(e.parent)?.title ?? "?"} (${e.parent})` : "root"}`,
      `children: ${kids.length ? kids.join(", ") : "none"}`,
      `carriers (${who.length}): ${who.length ? who.join(", ") : "none"}`,
      `facts: ${lore.length ? lore.map(r => `${r.label || "(unlabelled)"} [${r.id}]`).join("; ") : "none"}`,
      `review: ${reviewState(e)}${e.touched.length ? ` (touched: ${e.touched.join(", ")})` : ""}`
    ].join("\n");
  }

  /**
   * Was this field changed by someone else since the row was drawn? Compares the stored value with
   * the one the row was drawn from (`this.base`). `loreId` → a lore row's field.
   */
  movedUnderneath(id, key, loreId = null) {
    const base = this.base.get(id);
    const e = registry().find(x => x.id === id);
    if (!base || !e) return true;
    if (!loreId) return !same(e[key], base[key]);
    const now = readLore(e.lore).find(r => r.id === loreId);
    const was = base.lore.find(r => r.id === loreId);
    return !now || !was || !same(now[key], was[key]);
  }

  /** Our own write to `id` is in flight: `markStale` leaves the row alone until it lands. */
  async ownWrite(id, fn) {
    this.inflight.set(id, (this.inflight.get(id) ?? 0) + 1);
    try {
      return await fn();
    } finally {
      this.inflight.set(id, this.inflight.get(id) - 1);
      if (!this.inflight.get(id)) this.inflight.delete(id);
    }
  }

  refuseStale(id, key, el) {
    const e = registry().find(x => x.id === id);
    ui.notifications.warn(_loc("PENTARYN_TIES.review.staleRefused", { field: key, title: e?.title ?? id }));
    this.flagStale(id);
  }

  async saveField(id, key, value, el) {
    if (this.stale.has(id) || this.movedUnderneath(id, key)) return this.refuseStale(id, key, el);
    const res = await this.ownWrite(id, () => reviewedUpdate(id, { [key]: value }));
    const base = this.base.get(id);
    if (res?.ok) {
      // the row now stands on what was actually stored (clamped, trimmed)
      if (base) base[key] = res.entry[key];
      if (el && el.value !== String(res.entry[key] ?? "") && document.activeElement !== el) el.value = String(res.entry[key] ?? "");
      if (this.pendingRender) this.markStale();
      return;
    }
    // refused (rename collision already notified): put the stored value back in the box now —
    // a repaint may be held back if Joe has already moved to another field
    const e = registry().find(x => x.id === id);
    if (el && e) el.value = String(e[key] ?? "");
  }

  async saveLore(id, loreId, key, value, el) {
    if (this.stale.has(id) || this.movedUnderneath(id, key, loreId)) return this.refuseStale(id, key, el);
    // the lore array is rebuilt inside the write queue from the registry as it is then
    const res = await this.ownWrite(id, () => reviewedLoreUpdate(id, loreId, key, value));
    const row = base => base?.lore.find(r => r.id === loreId);
    if (res?.ok) {
      const stored = readLore(res.entry.lore).find(r => r.id === loreId);
      const b = row(this.base.get(id));
      if (b && stored) b[key] = stored[key];
      if (this.pendingRender) this.markStale();
      return;
    }
    const cur = readLore(registry().find(x => x.id === id)?.lore).find(r => r.id === loreId);
    if (el && cur) el.value = String(cur[key] ?? "");
  }

  bind(content) {
    const root = content.querySelector(".pt-review");
    if (!root) return;

    const search = root.querySelector(".pt-review-search");
    search?.addEventListener("input", () => {
      this.search = search.value;
      this.applyFilter();
    });
    root.querySelector(".pt-review-sort")?.addEventListener("change", ev => {
      this.sort = ev.currentTarget.value;
      this.resortNext = true;
      this.render();
    });
    root.querySelector('[data-act="resort"]')?.addEventListener("click", () => {
      this.resortNext = true;
      this.render();
    });
    for (const btn of root.querySelectorAll(".pt-review-tab")) {
      btn.addEventListener("click", () => {
        this.tab = btn.dataset.tab;
        for (const b of root.querySelectorAll(".pt-review-tab")) b.classList.toggle("pt-chip-on", b === btn);
        this.applyFilter();
      });
    }
    for (const btn of root.querySelectorAll("[data-filter]")) {
      btn.addEventListener("click", () => {
        this.filter = btn.dataset.filter;
        for (const b of root.querySelectorAll("[data-filter]")) b.classList.toggle("pt-chip-on", b === btn);
        this.applyFilter();
      });
    }
    root.querySelector('[data-act="select-visible"]')?.addEventListener("click", () => {
      for (const li of root.querySelectorAll(".pt-review-row:not([hidden])")) this.selection.add(li.dataset.id);
      this.saveSelection();
    });
    root.querySelector('[data-act="select-none"]')?.addEventListener("click", () => {
      this.selection.clear();
      this.saveSelection();
    });
    root.querySelector('[data-act="copy-selected"]')?.addEventListener("click", () => {
      const byId = new Map(registry().map(e => [e.id, e]));
      const lines = [...this.selection].filter(id => byId.has(id)).map(id => `${id} — ${byId.get(id).title}`);
      if (lines.length) copyText(lines.join("\n"));
    });

    // deferred live refresh: flush when a field lets go
    root.addEventListener("focusout", () => this.flushPending());

    for (const li of root.querySelectorAll(".pt-review-row")) {
      const id = li.dataset.id;
      li.querySelector(".pt-review-summary")?.addEventListener("click", ev => {
        const act = ev.target.closest("[data-act]")?.dataset.act;
        if (act === "select") {
          if (ev.target.checked) this.selection.add(id);
          else this.selection.delete(id);
          this.saveSelection();
          return;
        }
        if (act === "copy-id") return void copyText(id);
        if (act === "review" || act === "unreview") {
          // Joe expects a row he just signed off (or flagged back) to move to its place
          this.resortNext = true;
          (act === "review" ? reviewAttribute(id) : unreviewAttribute(id)).then(res => {
            if (!res?.ok) return void (this.resortNext = false);
            // a signed-off row leaves Joe's working set; Unreview leaves the tick alone
            if (act === "review" && this.selection.delete(id)) this.saveSelection();
          });
          return;
        }
        if (this.expanded.has(id)) this.expanded.delete(id);
        else this.expanded.add(id);
        this.render();
      });

      const detail = li.querySelector(".pt-review-detail");
      if (!detail) continue;
      for (const el of detail.querySelectorAll("[data-field]")) {
        el.addEventListener("change", () => {
          const k = el.dataset.field;
          const v = k === "dc" ? Number(el.value) : el.value;
          this.saveField(id, k, v, el);
        });
      }
      for (const el of detail.querySelectorAll("[data-lore-field]")) {
        el.addEventListener("change", () => {
          const k = el.dataset.loreField;
          const loreId = el.closest("[data-lore]")?.dataset.lore;
          if (loreId) this.saveLore(id, loreId, k, k === "dc" ? Number(el.value) : el.value, el);
        });
      }
      detail.querySelector('[data-act="copy-id"]')?.addEventListener("click", () => copyText(id));
      detail.querySelector('[data-act="copy-summary"]')?.addEventListener("click", () => copyText(this.summaryText(id)));
    }
  }
}

export const openReview = () => AttributeReview.open();
export { SELECTION_FLAG };
