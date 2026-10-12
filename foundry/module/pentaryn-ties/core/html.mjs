/**
 * The module's own HTML escaper: `& < > " '` → entities, with `'` as `&#39;`. Eight files carried this
 * line byte for byte (ties-15). The three windows that escape with `foundry.utils.escapeHTML` (look,
 * preview, review-ui) keep it: it writes a different entity for `'`, and their markup is pinned.
 *
 * Pure: no Foundry global. NOT on the known-core.mjs barrel — import it by path.
 */

const ENTITY = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** @param {*} s  anything; null and undefined escape to "" */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ENTITY[c]);

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
