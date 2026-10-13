/**
 * The module's own HTML escaper: `& < > " '` → entities, with `'` as `&#39;`. Eight files carried this
 * line byte for byte (ties-15). The three windows that escape with `foundry.utils.escapeHTML` (look,
 * preview, review-ui) keep it: it writes a different entity for `'`, and their markup is pinned.
 *
 * Pure: no Foundry global at import time — the skill helpers read `CONFIG` and `game.i18n` only when
 * called. NOT on the known-core.mjs barrel — import it by path.
 */

const ENTITY = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** @param {*} s  anything; null and undefined escape to "" */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ENTITY[c]);

/** What a portrait with no image — or no actor left at all — shows. Foundry ships it (ties-ui-M14). */
export const FALLBACK_ART = "icons/svg/mystery-man.svg";

/**
 * A keybinding's key code as a hint shows it: "Digit6" → "6", "KeyQ" → "Q", anything else as is,
 * nothing bound → "?". The caller reads the live binding (`game.keybindings`) and hands the code in,
 * so a rebound key is never misnamed (ties-ui-M14).
 */
export const keyLabel = code => String(code ?? "").replace(/^Digit/, "").replace(/^Key/, "") || "?";

/**
 * The "GM only" badge: an eye-slash and the localized `PENTARYN_TIES.gmOnly`, on a section only a GM
 * is drawn. Authoring, the two mutual-pair panels and the told-count line each pasted this markup
 * (ties-ui-EXT-15); it reads `game.i18n` only when called.
 */
export const gmBadge = () =>
  `<span class="pt-gm-badge"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> ${esc(globalThis.game?.i18n?.localize?.("PENTARYN_TIES.gmOnly") ?? "PENTARYN_TIES.gmOnly")}</span>`;

/* ── skills (ties-ui-EXT-8) ──────────────────────────────────────────────── */
/*
 * The world's skill list, read off CONFIG at call time rather than hardcoded, so a GM's homebrew skill
 * is authorable. Four windows each built their own dropdown and label and disagreed on order,
 * localization and what to do with a skill the world no longer defines; these are the one rule.
 */

const worldSkills = () => globalThis.CONFIG?.DND5E?.skills ?? {};
const has = (skills, key) => Object.prototype.hasOwnProperty.call(skills, key);

/** A skill's localized label, or the bare key when this world does not define it. */
export function skillLabelOf(key) {
  const skills = worldSkills();
  const label = has(skills, key) ? skills[key]?.label : null;
  return label ? (globalThis.game?.i18n?.localize?.(label) ?? label) : String(key ?? "");
}

/**
 * `<option>`s for a skill `<select>`: CONFIG.DND5E.skills in config order, localized. A `selected`
 * key this world lacks is kept as its own first option ("hmb (not in this world)") rather than
 * dropped — a dropped value falls to the first option and the next save retargets the check.
 */
export function skillOptionsHTML(selected) {
  const skills = worldSkills();
  const entries = Object.keys(skills).map(k => [k, skillLabelOf(k)]);
  if (selected && !has(skills, selected)) {
    const missing = globalThis.game?.i18n?.format?.("PENTARYN_TIES.lore.skillMissing", { skill: selected }) ?? selected;
    entries.unshift([selected, missing]);
  }
  return entries.map(([k, label]) => `<option value="${esc(k)}"${k === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
}

/* ── row fragments (ties-18) ─────────────────────────────────────────────── */
/*
 * The fragments the Ties and Known rows each rebuilt inline. Pure: the caller localizes the empty
 * line and the stance label and hands the words in, so the markup lives here once.
 */

/** One dimmed line of a note under a row's name, or the row's "no notes" line. */
export const notesPreview = (text, emptyText) =>
  String(text ?? "").trim()
    ? `<span class="pt-note-preview">${esc(text)}</span>`
    : `<span class="pt-note-preview pt-note-none"><em>${esc(emptyText)}</em></span>`;

/** A note as read-only prose in an open row, or the row's "no notes" line. */
export const notesProse = (text, emptyText) =>
  String(text ?? "").trim()
    ? `<div class="pt-notes-prose">${esc(text)}</div>`
    : `<div class="pt-notes-prose pt-note-none"><em>${esc(emptyText)}</em></div>`;

/**
 * The word cell: the tie's word (with `stanceClass`, e.g. " pt-wary", when it is coloured), or the
 * stance label dimmed in its place.
 */
export const wordCell = (word, stanceText, stanceClass = "") =>
  word ? `<span class="pt-word${stanceClass}">${esc(word)}</span>` : `<span class="pt-word pt-noword">${esc(stanceText)}</span>`;

/* ── row expand / collapse (ties-16) ──────────────────────────────────────── */

/**
 * The row toggle every list used to copy: click anywhere on the summary, or Enter / Space on it
 * (Space would otherwise scroll the panel), opens and shuts the row's detail.
 *
 *   mode "attr"   (Ties, Known) — the detail's `hidden` attribute decides; the head carries aria-expanded
 *   mode "class"  (lore rows)   — the row's `pt-open` class decides; `wrap.hidden` follows
 *
 * `wrap` is the detail element, or a function returning it at toggle time (the lore and attribute
 * rows looked it up per click). `onToggle(open)` records the open state; `focus` is a selector inside
 * the detail to focus on open.
 * Pure: it touches only the elements it is handed.
 */
export function bindRowToggle(head, row, { wrap, mode = "attr", onToggle = () => {}, focus = null } = {}) {
  const toggle = () => {
    const detail = typeof wrap === "function" ? wrap() : wrap;
    if (mode === "class") {
      const nowOpen = !row.classList.contains("pt-open");
      row.classList.toggle("pt-open", nowOpen);
      detail.hidden = !nowOpen;
      onToggle(nowOpen);
      return;
    }
    const open = detail.hasAttribute("hidden");
    detail.toggleAttribute("hidden", !open);
    row.classList.toggle("pt-open", open);
    head.setAttribute("aria-expanded", String(open));
    onToggle(open);
    if (open && focus) detail.querySelector(focus)?.focus();
  };
  head.addEventListener("click", toggle);
  head.addEventListener("keydown", ev => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault(); // Space would scroll the panel instead
    toggle();
  });
}

/* ── notes autosave and summary swap (ties-ui-EXT-3) ─────────────────────── */

/**
 * Autosave a row's notes while typing: `save(value)` runs `ms` after the last keystroke. A textarea
 * fires `change` only on blur, and closing the sheet removes it without a blur, so `change` alone
 * would quietly bin a paragraph.
 *
 * Blur FLUSHES a pending save, never cancels it (ties-ui-M1): cancelling lost whatever was typed in
 * the last `ms` before focus left — and the sheet's close button takes focus first. A blur with
 * nothing pending saves nothing, and a flushed save does not run again when its timer would have.
 * The Ties and Known tabs each carried a copy of this, and the copies drifted (M1 was the Known one).
 */
export function bindNotesAutosave(textarea, save, { ms = 700 } = {}) {
  let pending = null;
  const fire = () => {
    pending = null;
    return save(textarea.value);
  };
  textarea.addEventListener("input", () => {
    clearTimeout(pending);
    pending = setTimeout(fire, ms);
  });
  textarea.addEventListener("blur", () => {
    if (pending === null) return;
    clearTimeout(pending);
    fire();
  });
}

/**
 * An async click that writes: hold `btn` disabled while `fn` runs — a double-click must not queue a
 * second write — and enable it again in `finally`, so a write that throws does not leave a dead
 * button. A throw goes to `log.error(op, err)` and `notify(op, err)` (the caller's toast); the
 * handlers used to await with no catch and lost both (ties-ui-rob-7). Pure: the caller hands in its
 * logger and toast.
 */
export async function guardClick(op, btn, fn, { log, notify } = {}) {
  btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    log?.error(op, err);
    notify?.(op, err);
  } finally {
    btn.disabled = false;
  }
}

/**
 * Swap a row's `.pt-summary` for fresh markup in place — a full repaint would tear the caret out of
 * the textarea still being typed in — and hand the new node to `rebind`. Returns it, or null when the
 * row has no summary.
 *
 * The node is taken BEFORE the swap: `replaceWith` moves it out of its holder, so reading
 * `holder.firstElementChild` afterwards is null (the Known tab's copy once did, and every autosave
 * threw).
 */
export function replaceSummary(row, html, rebind) {
  const head = row.querySelector(".pt-summary");
  if (!head) return null;
  const holder = document.createElement("div");
  holder.innerHTML = html;
  const next = holder.firstElementChild;
  head.replaceWith(next);
  rebind?.(next);
  return next;
}

/**
 * Re-wire a summary replaced in place (by `replaceSummary`) with the same row toggle the full bind
 * gives it — without it a row behaves differently depending on whether its summary happened to be
 * repainted — and without re-registering every listener in the panel. `onToggle` and `focus` as for
 * `bindRowToggle`. A repaint that produced nothing (no head, or a row with no detail) is a no-op, not
 * a throw that takes the tab down. The Ties and Known tabs each carried a copy (ties-ui-M14).
 */
export function bindSummary(head, row, { onToggle, focus } = {}) {
  const wrap = row?.querySelector(".pt-detail-wrap");
  if (!head || !wrap) return;
  bindRowToggle(head, row, { wrap, onToggle, focus });
}

/**
 * Which rows are open, per owner (an actor id, or a mount key) — cosmetic, in memory, never
 * persisted (ties-16). One shape for the four lists that each kept their own Map:
 *
 *   of(owner)              a read — the owner's set, or an empty one that is not stored
 *   live(owner)            the stored set itself, created on first use (callers add / delete on it)
 *   set(owner, id, open)   open or shut one row; an owner with nothing open is dropped
 *   forget(owner)          drop a deleted actor's (or mount's) state
 */
export function makeOpenState() {
  const map = new Map();
  return {
    of: owner => map.get(owner) ?? new Set(),
    live(owner) {
      if (!map.has(owner)) map.set(owner, new Set());
      return map.get(owner);
    },
    set(owner, id, open) {
      const s = map.get(owner) ?? new Set();
      open ? s.add(id) : s.delete(id);
      s.size ? map.set(owner, s) : map.delete(owner);
    },
    forget: owner => map.delete(owner),
    get size() {
      return map.size;
    }
  };
}
