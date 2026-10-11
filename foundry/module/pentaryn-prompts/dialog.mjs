/**
 * pentaryn-prompts — the prompt dialog (plan §3).
 *
 * ApplicationV2, not DialogV2: DialogV2 closes on Escape without saving. Here Esc saves and closes,
 * ⌘/Ctrl+Enter saves and closes, Shift+Esc puts the text back as it was when the dialog opened,
 * and `close()` itself always saves — core's dismiss closes every window on Esc when focus is
 * outside one, and that path must not lose words either.
 *
 * Speed is the point (playtest 2026-10-10): every open makes a NEW window with its own id, so a
 * new marker's box never waits for the previous box to save, delete or animate out. `close()`
 * snapshots the text, removes the window at once (no fade: a fading window under the cursor ate
 * the next drop) and saves in the background. Keys typed before the textarea has focus are held
 * by typeahead.mjs and handed over on focus.
 */

import {
  MODULE, SIZE_KEYS, SIZE_BY_KEY, normalisePrompt, nameplate, preview, stripHtml, distanceLine, dialogPosition,
  footprintLabel, behindDoor
} from "./geometry-core.mjs";
import { markerSizeOfToken, promptText, markerActor, art, EMPTY_TINT, FULL_TINT } from "./markers.mjs";
import { panelFor, resolveItemEmbeds } from "./model.mjs";
import * as Typeahead from "./typeahead.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (key, data) => (data ? game.i18n.format(`PENTARYN_PROMPTS.${key}`, data) : game.i18n.localize(`PENTARYN_PROMPTS.${key}`));

const setting = (key, fallback) => {
  try { return game.settings.get(MODULE, key) ?? fallback; } catch { return fallback; }
};

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const AUTOSAVE_MS = 600;
const FOCUS_GUARD_MS = 1200;
const PANEL_REFRESH_MS = 250;
const WIDTH = 620, HEIGHT = 320;

/** Client-space rectangle of a token, when its scene is the one on screen. */
function clientRect(tok) {
  if (!canvas?.ready || canvas.scene?.id !== tok.parent?.id) return null;
  const g = canvas.grid.size;
  const a = canvas.clientCoordinatesFromCanvas({ x: tok.x, y: tok.y });
  const b = canvas.clientCoordinatesFromCanvas({ x: tok.x + tok.width * g, y: tok.y + tok.height * g });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

export class PromptDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pentaryn-prompts-dialog-{id}",
    classes: ["pentaryn-prompts"],
    tag: "div",
    window: { title: "PENTARYN_PROMPTS.dialog.title", icon: "fa-solid fa-comment-dots", resizable: true, minimizable: false },
    position: { width: WIDTH, height: HEIGHT },
    actions: {
      size: PromptDialog.#onSize,
      deleteMarker: PromptDialog.#onDelete,
      row: PromptDialog.#onRow,
      more: PromptDialog.#onMore
    }
  };

  static PARTS = { body: { template: `modules/${MODULE}/templates/prompt-dialog.hbs` } };

  /** The dialog Joe is typing in (the newest open). Older ones are closing. */
  static current = null;

  /** Every dialog not yet fully closed (saving included), for the deleteToken hook. */
  static #live = new Set();

  /** Last size Joe dragged the window to, reused by the next box. */
  static #size = { width: WIDTH, height: HEIGHT };

  #sceneId = null;
  #tokenId = null;
  #fresh = false;
  #opened = "";
  #saved = "";
  #timer = null;
  #saving = Promise.resolve();
  #closing = false;
  #finishing = null;
  #discard = false;
  #deleted = false;
  #ticket = null;
  #panelRun = 0;
  #panelTimer = null;
  #guardUntil = 0;
  #rows = new Map();

  /** The marker token document this dialog edits, or null once it is gone. */
  get token() {
    return game.scenes.get(this.#sceneId)?.tokens.get(this.#tokenId) ?? null;
  }

  get title() {
    const tok = this.token;
    return `${t("dialog.title")} · ${tok ? markerSizeOfToken(tok) : ""}`;
  }

  /** Does this dialog edit that token? */
  edits(tokenDoc) {
    return this.#sceneId === tokenDoc?.parent?.id && this.#tokenId === tokenDoc?.id;
  }

  /** The text Joe sees right now (textarea if rendered, else the last saved). */
  #currentText() {
    const ta = this.element?.querySelector("textarea[name=prompt]");
    return ta ? ta.value : this.#saved;
  }

  /**
   * Open the dialog for a marker token.
   * `fresh`: this marker was just created by a drop / the P key — closing it empty deletes it.
   * `ticket`: the type-ahead ticket taken at the drop / key press; one is taken here otherwise.
   * Everything before the first await runs synchronously, so capture starts with the gesture.
   */
  static async open(tokenDoc, { fresh = false, clientX = null, clientY = null, ticket = null } = {}) {
    ticket ??= Typeahead.start();
    if (!game.user?.isGM || !tokenDoc || !markerSizeOfToken(tokenDoc)) { Typeahead.cancel(ticket); return null; }

    const cur = PromptDialog.current;
    if (cur && !cur.#closing && cur.edits(tokenDoc)) {
      cur.bringToFront();
      cur.#ticket ??= ticket;
      if (cur.#ticket !== ticket) Typeahead.cancel(ticket);
      if (cur.rendered) cur.#focus();
      return cur;
    }
    // the same marker's box still saving (Esc, then straight back in): read its text after the save
    const prior = [...PromptDialog.#live].filter(a => a.#closing && a.edits(tokenDoc));
    if (cur && !cur.#closing) cur.close().catch(err => console.error(`${MODULE} | closing the previous prompt`, err));   // not awaited: it saves from its own snapshot
    if (prior.length) {
      await Promise.all(prior.map(a => a.#finishing));
      tokenDoc = tokenDoc.parent?.tokens.get(tokenDoc.id) ?? null;
      if (!tokenDoc) { Typeahead.cancel(ticket); return null; }
    }

    const app = new PromptDialog();
    PromptDialog.current = app;
    PromptDialog.#live.add(app);
    app.#target(tokenDoc, fresh);
    app.#ticket = ticket;

    const rect = clientRect(tokenDoc);
    if (clientX === null || clientY === null) {
      clientX = rect ? rect.x + rect.w : window.innerWidth / 2 - WIDTH / 2;
      clientY = rect ? rect.y + rect.h / 2 : window.innerHeight / 2;
    }
    const { width: w, height: h } = PromptDialog.#size;
    const pos = dialogPosition({ clientX, clientY, w, h, vw: window.innerWidth, vh: window.innerHeight, avoid: rect });
    try {
      await app.render({ force: true, position: { left: pos.left, top: pos.top, width: w, height: h } });
    } catch (err) {
      console.error(`${MODULE} | the prompt dialog failed to render`, err);
      PromptDialog.#live.delete(app);
      if (PromptDialog.current === app) PromptDialog.current = null;
      if (app.#ticket !== null) { Typeahead.cancel(app.#ticket); app.#ticket = null; }
      return null;
    }
    return app;
  }

  #target(tokenDoc, fresh) {
    this.#sceneId = tokenDoc.parent.id;
    this.#tokenId = tokenDoc.id;
    this.#fresh = !!fresh;
    this.#opened = this.#saved = promptText(tokenDoc);
    this.#discard = false;
    this.#deleted = false;
  }

  async _prepareContext() {
    const tok = this.token;
    const size = tok ? markerSizeOfToken(tok) : "mid";
    return {
      text: this.#saved,
      size,
      footprint: footprintLabel(size, tok?.parent?.grid?.distance ?? 5),
      sizes: SIZE_KEYS.map(k => ({ key: k, active: k === size, title: footprintLabel(k, tok?.parent?.grid?.distance ?? 5) })),
      placeholder: t("dialog.placeholder"),
      // a fresh marker is removed by ⇧Esc (its text goes back to empty), so say so (P-9-a)
      hint: t(this.#fresh && setting("deleteEmptyOnClose", true) ? "dialog.hintFresh" : "dialog.hint"),
      deleteLabel: t("dialog.delete"),
      panelLoading: t("panel.loading")
    };
  }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    const root = this.element;
    if (!root.dataset.ppBound) {
      root.dataset.ppBound = "1";
      root.addEventListener("keydown", ev => this.#onKey(ev));
    }
    const ta = root.querySelector("textarea[name=prompt]");
    ta?.addEventListener("input", () => this.#schedule());
    ta?.addEventListener("blur", ev => this.#guardFocus(ev));
    this.#guardUntil = performance.now() + FOCUS_GUARD_MS;
    this.#focus();
    // the panel walks the scene's walls: after the caret is live (a timer, not rAF — rAF stalls in a hidden tab)
    setTimeout(() => this.#renderPanel(), 16);
  }

  /**
   * A window whose element is no longer in the document (torn down while a render was still in
   * flight) has no parent to measure against: core would throw reading `parentElement.offsetWidth`.
   * The shared fixed id that used to cause this is gone; this guards any other path to it.
   */
  _updatePosition(position) {
    if (!this.element?.isConnected || !this.element.parentElement) return position;
    return super._updatePosition(position);
  }

  /** Remember a size Joe chose by dragging the corner. */
  _onPosition(position) {
    super._onPosition?.(position);
    if (this.#closing || !this.rendered) return;
    const { width, height } = position ?? {};
    if (Number.isFinite(width) && Number.isFinite(height) && width >= 300 && height >= 160) PromptDialog.#size = { width, height };
  }

  /** Focus the textarea now, caret at the end; take what was typed before it existed. */
  #focus() {
    if (this.#closing) return;   // a box closing mid-render must not pull focus from the new one
    const ta = this.element?.querySelector("textarea[name=prompt]");
    if (!ta) return;
    ta.focus({ preventScroll: true });
    let close = null;
    if (this.#ticket !== null) {
      const got = Typeahead.take(this.#ticket);
      this.#ticket = null;
      if (got.text) {
        ta.value += got.text;
        this.#schedule();
      }
      close = got.close;
    }
    const n = ta.value.length;
    ta.setSelectionRange(n, n);
    if (close === "discard") this.#discard = true;
    if (close) this.close();
  }

  /**
   * Just after opening, the rest of the gesture that opened the box (the second click's mouseup of
   * a double-click, a sheet or HUD re-rendering) can drop focus to the page body, and the next keys
   * then hit Foundry's hotkeys. Inside the guard window, focus that falls to nowhere (body, the
   * canvas) comes straight back; focus Joe moves into another field or window is left alone.
   */
  #guardFocus(ev) {
    if (this.#closing || performance.now() > this.#guardUntil) return;
    const to = ev.relatedTarget;
    if (to && (to.closest?.(".application, .app, input, textarea, select, [contenteditable]") || to.isContentEditable)) return;
    setTimeout(() => {
      if (this.#closing || !this.rendered) return;
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== "board" && a.tagName !== "CANVAS") return;
      const ta = this.element?.querySelector("textarea[name=prompt]");
      if (!ta) return;
      ta.focus({ preventScroll: true });
      const n = ta.value.length;
      ta.setSelectionRange(n, n);
    }, 0);
  }

  /** Text no open claimed (typeahead.mjs): it belongs in the box Joe is looking at. */
  static takeOrphan(text) {
    const app = PromptDialog.current;
    const ta = app?.rendered && !app.#closing ? app.element?.querySelector("textarea[name=prompt]") : null;
    if (!ta) return false;
    ta.value += text;
    app.#schedule();
    return true;
  }

  #onKey(ev) {
    if (ev.isComposing) return;   // Esc/Enter belong to the IME while it composes (dead keys, accents)
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.shiftKey) this.#discard = true;
      this.close();
    } else if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      ev.stopPropagation();
      this.close();
    }
  }

  #schedule() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#save(), AUTOSAVE_MS);
  }

  /** Save `text` (default: the textarea) onto the token, skipped when unchanged. Serialised. */
  #save(text) {
    const wanted = text ?? this.#currentText();
    this.#saving = this.#saving.then(async () => {
      const tok = this.token;
      if (!tok || this.#deleted) return;
      const norm = normalisePrompt(wanted);
      if (norm === this.#saved) return;
      const size = markerSizeOfToken(tok);
      await tok.update({
        [`flags.${MODULE}.prompt`]: norm,
        [`flags.${MODULE}.updatedAt`]: Date.now(),
        name: nameplate(norm, size),
        "texture.tint": norm ? FULL_TINT : EMPTY_TINT
      });
      this.#saved = norm;
    }).catch(err => {
      console.error(`${MODULE} | saving the prompt failed`, err);
      ui.notifications?.error(t("dialog.saveFailed"));
    });
    return this.#saving;
  }

  /** Everything that must happen once the window is going: save (or discard), empty-delete. */
  async #finish(text) {
    clearTimeout(this.#timer);
    if (this.#deleted) return;
    await this.#save(this.#discard ? this.#opened : text);
    const tok = this.token;
    if (tok && this.#fresh && !this.#saved && setting("deleteEmptyOnClose", true)) {
      this.#deleted = true;
      await tok.delete();
      ui.notifications?.info(t("dialog.removedEmpty"));
    }
  }

  /**
   * Close: snapshot the text, take the window off screen at once, save in the background.
   * Resolves once the save (and any empty-delete) is done.
   */
  async close(options = {}) {
    if (!this.#closing) {
      this.#closing = true;
      clearTimeout(this.#timer);
      let text = this.#currentText();
      if (this.#ticket !== null) {          // closed before it ever had focus: keep what was typed
        text += Typeahead.take(this.#ticket).text;
        this.#ticket = null;
      }
      if (PromptDialog.current === this) PromptDialog.current = null;
      this.#finishing = this.#finish(text)
        .catch(err => console.error(`${MODULE} | closing the prompt dialog`, err))
        .finally(() => PromptDialog.#live.delete(this));
    }
    try {
      return await super.close({ animate: false, ...options });
    } finally {
      await this.#finishing;
    }
  }

  /** deleteToken hook: the marker a dialog edits is gone (a replace, a delete elsewhere). */
  static onTokenDeleted(doc) {
    for (const app of PromptDialog.#live) {
      if (!app.edits(doc) || app.#deleted) continue;   // the dialog deleted it itself (Delete, empty fresh marker)
      clearTimeout(app.#timer);
      app.#deleted = true;
      app.close();
    }
  }

  /* ── size chips: swap for the other marker actor, centred, text carried ── */

  static async #onSize(event, target) {
    const size = target?.dataset?.size;
    const tok = this.token;
    if (!tok || !SIZE_BY_KEY[size] || size === markerSizeOfToken(tok)) return;
    await this.#save();
    const actor = markerActor(size);
    if (!actor) { ui.notifications?.warn(t("dialog.noActor", { size })); return; }
    const scene = tok.parent;
    const g = scene.dimensions.size;
    const cx = tok.x + tok.width * g / 2, cy = tok.y + tok.height * g / 2;
    const w = SIZE_BY_KEY[size].w * g;
    const td = await actor.getTokenDocument({ x: cx - w / 2, y: cy - w / 2 }, { parent: scene });
    const data = td.toObject();
    delete data._id;
    Object.assign(data, { x: Math.round(cx - w / 2), y: Math.round(cy - w / 2), elevation: tok.elevation, level: tok.level });
    foundry.utils.setProperty(data, `flags.${MODULE}.prompt`, this.#saved);
    foundry.utils.setProperty(data, `flags.${MODULE}.updatedAt`, Date.now());
    // a replace still holding the old id can say "resized (now marker X)" instead of a bare MARKER_GONE
    foundry.utils.setProperty(data, `flags.${MODULE}.swappedFrom`, tok.id);
    const [made] = await scene.createEmbeddedDocuments("Token", [data], { pentarynPrompts: { swap: true } });
    if (!made) return;
    this.#tokenId = made.id;   // before the delete: its deleteToken hook must not close this dialog
    await tok.delete();
    if (this.#closing) return;
    // the frame (and its title) is only drawn on first render unless the title is passed again
    await this.render({ force: true, window: { title: this.title } });
  }

  static async #onDelete() {
    if (this.#closing) return;
    const tok = this.token;
    clearTimeout(this.#timer);
    this.#deleted = true;
    if (tok) await tok.delete();
    await this.close();
  }

  /* ── side panel ──────────────────────────────────────────────────────── */

  /**
   * Something the panel reads changed on a scene (a wall or door, a token placed, moved or
   * removed): redraw the panel of every open box on that scene, debounced. Before, a door shut
   * while the box was open kept showing the old door tags until the box was reopened.
   */
  static refreshPanels(sceneId) {
    for (const app of PromptDialog.#live) {
      if (app.#closing || !app.rendered || app.#sceneId !== sceneId) continue;
      clearTimeout(app.#panelTimer);
      app.#panelTimer = setTimeout(() => app.#renderPanel(), PANEL_REFRESH_MS);
    }
  }

  static #onRow(event, target) {
    const row = this.#rows.get(target?.dataset?.key);
    const scene = game.scenes.get(this.#sceneId);
    if (!row || !scene) return;
    const doc = scene.getEmbeddedDocument(row.docName, row.id);
    if (!doc) return;
    if (event.metaKey || event.ctrlKey) {
      if (row.isPrompt) return PromptDialog.open(doc);
      if (row.docName === "Token") return doc.actor?.sheet?.render(true);
      if (row.docName === "Note") return doc.entry?.sheet?.render(true, { pageId: doc.pageId });
      return doc.sheet?.render(true);
    }
    if (canvas?.scene?.id === scene.id) canvas.animatePan({ x: row.centre.x, y: row.centre.y, duration: 300 });
  }

  static #onMore(event, target) {
    this.element?.querySelectorAll(".pp-row.pp-extra").forEach(el => el.classList.remove("pp-extra"));
    target?.remove();
  }

  async #renderPanel() {
    const run = ++this.#panelRun;
    let box = this.element?.querySelector("[data-panel]");
    const tok = this.token;
    if (!box || !tok || this.#closing) return;
    let p;
    try {
      p = panelFor(tok, { rows: setting("panelRows", 12), unseenWithinFt: setting("unseenWithinFt", 60) });
      // compendium monsters' biographies are often only `@Embed[<page>]`: show the page's words
      await resolveItemEmbeds([...p.shown, ...p.more, ...p.unseen].map(r => r.item));
    } catch (err) {
      console.warn(`${MODULE} | side panel failed`, err);
      if (box.isConnected) box.innerHTML = `<p class="pp-empty">${esc(t("panel.failed"))}</p>`;
      return;
    }
    box = this.element?.querySelector("[data-panel]");
    if (!box || run !== this.#panelRun || this.#closing) return;
    const chars = setting("panelChars", 90);
    this.#rows.clear();
    const row = (r, extra = false, unseen = false) => {
      const it = r.item;
      this.#rows.set(it.key, { docName: it.docName, id: it.id, centre: it.centre, isPrompt: it.isPrompt });
      let img, line1, line3;
      if (it.isPrompt) {
        img = `<img src="${esc(art(it.size))}" alt="">`;
        line1 = `Prompt · ${it.size}`;
        line3 = it.text ? esc(preview(it.text, chars)) : `<em>${esc(t("panel.empty"))}</em>`;
      } else {
        img = it.kind === "light" ? `<i class="fa-solid fa-lightbulb"></i>`
          : it.img ? `<img src="${esc(it.img)}" alt="">` : `<i class="fa-solid fa-location-dot"></i>`;
        line1 = it.name;
        const desc = stripHtml(it.description ?? "");
        line3 = desc ? esc(preview(desc, chars))
          : it.prov?.prompt ? esc(`${t("panel.builtFrom")} "${preview(it.prov.prompt, chars)}"`) : "";
      }
      const line2 = distanceLine(r, { hidden: !!it.hidden && !it.isPrompt }) + (unseen ? ` · ${r.los}` : "");
      return `<li class="pp-row${extra ? " pp-extra" : ""}${unseen ? " pp-unseen" : ""}" data-action="row" data-key="${esc(it.key)}">
        <span class="pp-img">${img}</span>
        <span class="pp-lines"><span class="pp-l1">${esc(line1)}</span><span class="pp-l2">${esc(line2)}</span>${line3 ? `<span class="pp-l3">${line3}</span>` : ""}</span>
      </li>`;
    };
    const head = `<header class="pp-head"><span>${esc(t("panel.inSight", { n: p.total }))}</span><span class="pp-map">${p.mapFt[0]} × ${p.mapFt[1]} ft</span></header>`;
    const warn = (p.warn ?? []).map(w => `<p class="pp-warn">${esc(w)}</p>`).join("");
    const shown = p.shown.map(r => row(r)).join("") + p.more.map(r => row(r, true)).join("");
    const more = p.more.length ? `<button type="button" class="pp-more" data-action="more">${esc(t("panel.more", { n: p.more.length }))}</button>` : "";
    const empty = p.total ? "" : `<p class="pp-empty">${esc(t("panel.nobody"))}</p>`;
    // a door in the way is the thing Joe designs around: say it above the fold (P-9-b)
    const door = behindDoor(p.unseen.map(r => ({ ...r, name: r.item.isPrompt ? `Prompt · ${r.item.size}` : r.item.name })));
    const doorLine = door
      ? `<p class="pp-door"><i class="fa-solid fa-door-closed"></i> ${esc(t("panel.behindDoor", { list: door.list.join(", ") + (door.extra ? ` +${door.extra}` : "") }))}</p>`
      : "";
    const unseen = p.unseen.length
      ? `<details class="pp-out"><summary>${esc(t("panel.outOfSight", { ft: setting("unseenWithinFt", 60), n: p.unseen.length }))}</summary><ol class="pp-rows">${p.unseen.map(r => row(r, false, true)).join("")}</ol></details>`
      : "";
    box.innerHTML = `${head}${warn}${doorLine}${empty}<ol class="pp-rows">${shown}</ol>${more}${unseen}`;
  }
}
