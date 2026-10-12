/**
 * Pentaryn Feedback — WIDGET: the report dialog (ApplicationV2, no Handlebars template).
 *
 * DOM only; every decision comes from core (`draftFrom`, CATEGORIES). `buildHTML(view)` is a plain
 * function of already-localised strings, so node tests pin the markup without a DOM. One dialog at
 * a time: `ReportDialog.open()` re-renders and focuses the existing one, and first waits for a
 * closing one to finish so the old close cannot delete the new dialog's instances entry.
 *
 * Layout: intro · Bug / Defect / Feature radio labels (each with `data-tooltip` = its help text,
 * Bug checked by default) · the selected category's help repeated as a hint line (touch screens
 * have no hover) · the text box · "What gets attached" · Send / Cancel.
 */

import { CATEGORIES, CSS, DIALOG_ID, LIMITS, categoryOf, draftFrom, mergeDraft } from "./feedback-core.mjs";

const { ApplicationV2 } = foundry.applications.api;

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/**
 * The "What gets attached" fold-out: one row per section a report carries (core's OBJECT_SECTIONS
 * and LIST_SECTIONS, plus the actions and errors rings), in report order. A test refuses a section
 * without a row. `line(summary)` reads attachSummary's counts.
 */
export const ATTACH_ROWS = Object.freeze([
  { section: "user", line: s => _loc("PENTARYN_FEEDBACK.Dialog.Attach.User", { name: s.user ?? "?" }) },
  { section: "world", line: () => _loc("PENTARYN_FEEDBACK.Dialog.Attach.World") },
  {
    section: "scene",
    line: s => (s.scene
      ? _loc("PENTARYN_FEEDBACK.Dialog.Attach.Scene", { name: s.scene })
      : _loc("PENTARYN_FEEDBACK.Dialog.Attach.NoScene")),
  },
  {
    section: "tokens",
    line: s => _loc("PENTARYN_FEEDBACK.Dialog.Attach.Tokens", { controlled: s.controlled ?? 0, targeted: s.targeted ?? 0 }),
  },
  { section: "combat", line: () => _loc("PENTARYN_FEEDBACK.Dialog.Attach.Combat") },
  { section: "actions", line: s => _loc("PENTARYN_FEEDBACK.Dialog.Attach.Actions", { n: s.actions ?? 0 }) },
  { section: "errors", line: s => _loc("PENTARYN_FEEDBACK.Dialog.Attach.Errors", { n: s.errors ?? 0 }) },
  { section: "chat", line: s => _loc("PENTARYN_FEEDBACK.Dialog.Attach.Chat", { n: s.chat ?? 0 }) },
  { section: "windows", line: s => _loc("PENTARYN_FEEDBACK.Dialog.Attach.Windows", { n: s.windows ?? 0 }) },
  { section: "modules", line: s => _loc("PENTARYN_FEEDBACK.Dialog.Attach.Modules", { n: s.modules ?? 0 }) },
  { section: "client", line: () => _loc("PENTARYN_FEEDBACK.Dialog.Attach.Client") },
]);

/** The localised strings and state the markup is built from. */
export function dialogView({ draft = {}, summary = {} } = {}) {
  const d = draftFrom(draft);
  return {
    intro: _loc("PENTARYN_FEEDBACK.Dialog.Intro"),
    legend: _loc("PENTARYN_FEEDBACK.Dialog.Legend"),
    placeholder: _loc("PENTARYN_FEEDBACK.Dialog.Placeholder"),
    attachTitle: _loc("PENTARYN_FEEDBACK.Dialog.Attach.Title"),
    attach: ATTACH_ROWS.map(r => r.line(summary)),
    never: _loc("PENTARYN_FEEDBACK.Dialog.Attach.Never"),
    submit: _loc("PENTARYN_FEEDBACK.Dialog.Submit"),
    cancel: _loc("PENTARYN_FEEDBACK.Dialog.Cancel"),
    category: d.category,
    text: d.text,
    categories: CATEGORIES.map(c => ({ key: c.key, icon: c.icon, label: _loc(c.label), help: _loc(c.help) })),
  };
}

/** The dialog body as a string. Every interpolation is escaped. */
export function buildHTML(v) {
  const cats = v.categories.map(c => `
      <label class="${CSS}cat" data-category="${esc(c.key)}" data-tooltip="${esc(c.help)}" data-tooltip-direction="UP">
        <input type="radio" name="category" value="${esc(c.key)}"${c.key === v.category ? " checked" : ""}>
        <i class="${esc(c.icon)}" aria-hidden="true"></i><span>${esc(c.label)}</span>
      </label>`).join("");
  const hint = v.categories.find(c => c.key === v.category)?.help ?? "";
  const attach = v.attach.map(line => `<li>${esc(line)}</li>`).join("");
  return `<div class="pentaryn-feedback ${CSS}body">
    <p class="${CSS}intro">${esc(v.intro)}</p>
    <fieldset class="${CSS}cats"><legend>${esc(v.legend)}</legend>${cats}
    </fieldset>
    <p class="${CSS}hint" aria-live="polite">${esc(hint)}</p>
    <textarea class="${CSS}text" name="text" rows="7" maxlength="${LIMITS.text}" placeholder="${esc(v.placeholder)}">${esc(v.text)}</textarea>
    <details class="${CSS}attach"><summary>${esc(v.attachTitle)}</summary><ul>${attach}</ul><p class="${CSS}never">${esc(v.never)}</p></details>
    <footer class="${CSS}buttons">
      <button type="button" data-action="submit"${v.text.trim() ? "" : " disabled"}><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${esc(v.submit)}</button>
      <button type="button" data-action="cancel"><i class="fa-solid fa-xmark" aria-hidden="true"></i> ${esc(v.cancel)}</button>
    </footer>
  </div>`;
}

/** Read the form back into a draft (core normalises it). */
export function readForm(root) {
  const category = root?.querySelector?.('input[name="category"]:checked')?.value;
  const text = root?.querySelector?.('textarea[name="text"]')?.value ?? "";
  return draftFrom({ category, text });
}

export class ReportDialog extends ApplicationV2 {
  /** The one open instance. */
  static current = null;

  /** The first render while it is in flight, so a second open() waits for it instead of building a twin. */
  #opening = null;

  /** The close while it is in flight, so open() waits for it to leave foundry.applications.instances. */
  #closing = null;

  static DEFAULT_OPTIONS = {
    id: DIALOG_ID,
    classes: ["pentaryn-feedback", `${CSS}dialog`],
    tag: "div",
    window: { title: "PENTARYN_FEEDBACK.Dialog.Title", icon: "fa-solid fa-bug", resizable: true },
    position: { width: 460, height: "auto" },
    actions: {
      submit: ReportDialog.#onSubmit,
      cancel: ReportDialog.#onCancel,
    },
  };

  /**
   * @param {{ draft?: object, summary?: object, onSubmit: (draft) => Promise<{ ok: boolean }> }} opts
   */
  constructor({ draft = {}, summary = {}, onSubmit, ...options } = {}) {
    super(options);
    this.draft = draftFrom(draft);
    this.summary = summary;
    this.onSubmit = onSubmit;
    this.busy = false;
  }

  /** Open (or refresh and focus) the dialog. Resolves once it is rendered. */
  static async open(opts) {
    await ReportDialog.current?.#closing?.catch(() => {});
    let existing = ReportDialog.current;
    if (existing && !existing.rendered && existing.#opening) {
      await existing.#opening.catch(() => {});
      existing = ReportDialog.current;
    }
    if (existing?.rendered) {
      if (opts?.draft) existing.draft = mergeDraft(existing.draft, opts.draft);
      if (opts?.summary) existing.summary = opts.summary;
      if (opts?.onSubmit) existing.onSubmit = opts.onSubmit;
      await existing.render({ force: true });
      existing.focusText();
      return existing;
    }
    const app = new ReportDialog(opts);
    ReportDialog.current = app;
    app.#opening = app.render({ force: true });
    try {
      await app.#opening;
    } finally {
      app.#opening = null;
    }
    app.focusText();
    return app;
  }

  async _renderHTML() {
    return buildHTML(dialogView({ draft: this.draft, summary: this.summary }));
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    const hint = root.querySelector(`.${CSS}hint`);
    const text = root.querySelector('textarea[name="text"]');
    const send = root.querySelector('[data-action="submit"]');
    for (const radio of root.querySelectorAll('input[name="category"]')) {
      radio.addEventListener("change", () => {
        this.draft = readForm(root);
        hint.textContent = _loc(categoryOf(this.draft.category).help);
      });
    }
    text.addEventListener("input", () => {
      this.draft = { ...this.draft, text: text.value };
      send.disabled = this.busy || !text.value.trim();
    });
  }

  focusText() {
    this.element?.querySelector?.('textarea[name="text"]')?.focus();
  }

  /** Foundry's close is async (it deletes the instances entry at the end); keep it for open(). */
  async close(options) {
    const closing = super.close(options);
    this.#closing = closing;
    try {
      return await closing;
    } finally {
      if (this.#closing === closing) this.#closing = null;
    }
  }

  _onClose(options) {
    if (ReportDialog.current === this) ReportDialog.current = null;
    return super._onClose?.(options);
  }

  /** Send: hand the draft to the reporter; close on success, stay open (text kept) on failure. */
  static async #onSubmit(event, target) {
    const draft = readForm(this.element);
    if (!draft.text || this.busy) return;
    this.busy = true;
    target.disabled = true;
    let result = null;
    try {
      result = await this.onSubmit(draft);
    } finally {
      this.busy = false;
    }
    if (result?.ok) await this.close();
    else target.disabled = false;
  }

  static async #onCancel() {
    await this.close();
  }
}
