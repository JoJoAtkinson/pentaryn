/**
 * The editing UI, built once and hosted in two places:
 *   - a "Ties" tab injected into the actor sheet   (primary)
 *   - a standalone window from the sheet header    (fallback, survives sheet restyles)
 *
 * Both call buildHTML() + bind(). If dnd5e ever restructures its sheet markup and the
 * tab injection stops finding a home, the window still works and nothing is lost.
 */

import {
  MODULE,
  STANCES,
  STRENGTHS,
  NOTES_MAX,
  read,
  write,
  setTie,
  removeTie,
  candidates,
  clampStance,
  clampStrength,
  stanceOf,
  stanceLabel
} from "./ties-api.mjs";

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);

/**
 * Which note panels are open, per actor. Held out here rather than in the DOM because
 * every mutation repaints the whole block — without this, changing a stance would slam
 * shut the notes panel next to it. Purely cosmetic state; nothing is lost if it resets.
 */
const openNotes = new Map(); // actorId -> Set(tieId)
const openFor = actorId => openNotes.get(actorId) ?? new Set();
function setOpen(actorId, tieId, open) {
  const set = openNotes.get(actorId) ?? new Set();
  open ? set.add(tieId) : set.delete(tieId);
  set.size ? openNotes.set(actorId, set) : openNotes.delete(actorId);
}

function stanceSelect(value) {
  const opts = STANCES.map(
    s =>
      `<option value="${s.value}"${s.value === clampStance(value) ? " selected" : ""}>${esc(stanceLabel(s.value))}</option>`
  ).join("");
  return `<select class="pt-stance" data-field="stance">${opts}</select>`;
}

function strengthSelect(value) {
  const opts = STRENGTHS.map(
    n => `<option value="${n}"${n === clampStrength(value) ? " selected" : ""}>${n}</option>`
  ).join("");
  return `<select class="pt-strength" data-field="strength">${opts}</select>`;
}

/** Full markup for one actor's ties. Safe to drop into a tab or a window. */
export function buildHTML(actor) {
  const isGM = game.user?.isGM === true;
  const ties = read(actor);
  const open = openFor(actor.id);
  const rows = ties.length
    ? ties
        .map(tie => {
          const dot = `<span class="pt-dot" style="color:${stanceOf(tie.stance).css}">●</span>`;
          const name = tie.missing
            ? `<span class="pt-name pt-missing" title="${esc(t("row.missingHint"))}">${esc(tie.name)}</span>`
            : `<a class="pt-name" data-action="open" data-id="${esc(tie.id)}">${esc(tie.name)}</a>`;
          const shown = open.has(tie.id);
          const hasNotes = !!tie.notes.trim();
          return `<li class="pt-row${shown ? " pt-open" : ""}" data-id="${esc(tie.id)}">
        ${dot}
        <input type="text" class="pt-word" data-field="word" value="${esc(tie.word)}" placeholder="${esc(t("row.wordPlaceholder"))}" />
        ${name}
        ${stanceSelect(tie.stance)}
        ${strengthSelect(tie.strength)}
        <button type="button" class="pt-notes-toggle${hasNotes ? " has-notes" : ""}" data-action="notes"
                aria-expanded="${shown}" title="${esc(t(hasNotes ? "row.notesRead" : "row.notesAdd"))}">
          <i class="fa-solid fa-note-sticky"></i>
        </button>
        <button type="button" class="pt-del" data-action="remove" data-id="${esc(tie.id)}" title="${esc(t("row.remove"))}">
          <i class="fa-solid fa-trash"></i>
        </button>
        <div class="pt-notes"${shown ? "" : " hidden"}>
          <textarea class="pt-notes-text" data-field="notes" rows="5" maxlength="${NOTES_MAX}"
                    placeholder="${esc(game.i18n.format("PENTARYN_TIES.row.notesPlaceholder", { name: tie.name }))}">${esc(tie.notes)}</textarea>
        </div>
      </li>`;
        })
        .join("")
    : `<li class="pt-empty">${esc(t("empty"))}</li>`;

  const options = candidates(actor)
    .map(a => `<option value="${a.id}">${esc(a.name)}</option>`)
    .join("");

  /**
   * The mirror is a GM-only offer. A player owns their own actor and nobody else's, so
   * "also write it on them" would be a write the server rejects — better not to promise it.
   * `setTie` skips unwritable mirrors anyway; this just stops the UI lying about it.
   */
  const reciprocal = isGM
    ? `<label class="pt-reciprocal">
      <input type="checkbox" class="pt-recip" checked /> ${esc(t("reciprocal"))}
    </label>`
    : `<p class="pt-reciprocal">${esc(t("reciprocalPlayer"))}</p>`;

  return `<div class="pentaryn-ties" data-actor-id="${esc(actor.id)}">
    <p class="pt-help">${esc(t(isGM ? "help" : "helpPlayer"))}</p>
    <ul class="pt-list">${rows}</ul>
    <div class="pt-add">
      <select class="pt-add-target">${options || `<option value="">—</option>`}</select>
      <input type="text" class="pt-add-word" placeholder="${esc(t("row.wordPlaceholder"))}" />
      ${stanceSelect(0)}
      ${strengthSelect(3)}
      <button type="button" data-action="add"><i class="fa-solid fa-plus"></i> ${esc(t("add"))}</button>
    </div>
    ${reciprocal}
  </div>`;
}

/** Wire a rendered block. `rerender` is called after any mutation. */
export function bind(root, actor, rerender = () => {}) {
  if (!root || !actor) return;

  // no checkbox means a player is looking at it — one side only, never a mirror
  const recip = () => root.querySelector(".pt-recip")?.checked ?? false;

  // inline edits — save on change, no submit button to forget
  root.querySelectorAll(".pt-row").forEach(row => {
    const id = row.dataset.id;

    const save = async field => {
      const input = row.querySelector(`[data-field="${field}"]`);
      const list = read(actor);
      const entry = list.find(x => x.id === id);
      if (!input || !entry) return null;
      entry[field] = field === "stance" || field === "strength" ? Number(input.value) : input.value;
      await write(actor, list);
      return entry;
    };

    row.querySelectorAll("[data-field]").forEach(input => {
      input.addEventListener("change", async () => {
        const entry = await save(input.dataset.field);
        if (!entry) return;
        // Notes change neither the dot, the label, nor the sort order. Repainting would
        // only slam the panel shut on the GM mid-sentence, so just refresh the flag.
        if (input.dataset.field === "notes") {
          row.querySelector(".pt-notes-toggle")?.classList.toggle("has-notes", !!String(entry.notes).trim());
          return;
        }
        rerender();
      });
    });

    /**
     * A textarea only fires `change` on blur, and closing the sheet removes the element
     * without ever blurring it — which would quietly bin a paragraph. Autosave while typing.
     */
    const notes = row.querySelector('[data-field="notes"]');
    if (notes) {
      let pending = null;
      notes.addEventListener("input", () => {
        clearTimeout(pending);
        pending = setTimeout(() => save("notes"), 700);
      });
      notes.addEventListener("blur", () => clearTimeout(pending));
    }
  });

  root.querySelectorAll('[data-action="notes"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".pt-row");
      const panel = row?.querySelector(".pt-notes");
      if (!panel) return;
      const open = panel.hasAttribute("hidden");
      panel.toggleAttribute("hidden", !open);
      row.classList.toggle("pt-open", open);
      btn.setAttribute("aria-expanded", String(open));
      setOpen(actor.id, row.dataset.id, open);
      if (open) panel.querySelector("textarea")?.focus();
    });
  });

  root.querySelectorAll('[data-action="remove"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const target = game.actors.get(btn.dataset.id);
      const both = recip();
      // deleting a tie now also bins whatever prose is attached to it — say so
      const losing = read(actor).some(x => x.id === btn.dataset.id && x.notes.trim());
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("confirm.removeTitle") },
        content:
          `<p>${esc(
            game.i18n.format(both ? "PENTARYN_TIES.confirm.removeBoth" : "PENTARYN_TIES.confirm.removeOne", {
              a: actor.name,
              b: target?.name ?? t("row.missingName")
            })
          )}</p>` + (losing ? `<p class="notification warning">${esc(t("confirm.removeNotes"))}</p>` : "")
      });
      if (!ok) return;
      await removeTie(actor, btn.dataset.id, { bothWays: both });
      setOpen(actor.id, btn.dataset.id, false);
      rerender();
    });
  });

  root.querySelectorAll('[data-action="open"]').forEach(a => {
    a.addEventListener("click", () => game.actors.get(a.dataset.id)?.sheet?.render(true));
  });

  root.querySelector('[data-action="add"]')?.addEventListener("click", async () => {
    const box = root.querySelector(".pt-add");
    const id = box.querySelector(".pt-add-target")?.value;
    const target = game.actors.get(id);
    if (!target) return ui.notifications.warn(t("notify.pickSomeone"));
    await setTie(
      actor,
      target,
      {
        word: box.querySelector(".pt-add-word")?.value ?? "",
        stance: Number(box.querySelector(".pt-stance")?.value ?? 0),
        strength: Number(box.querySelector(".pt-strength")?.value ?? 3)
      },
      { reciprocal: recip() }
    );
    rerender();
  });
}

/** Standalone window — the fallback host. */
const { ApplicationV2 } = foundry.applications.api;

export class TiesEditor extends ApplicationV2 {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  static DEFAULT_OPTIONS = {
    classes: ["pentaryn-ties-app"],
    window: { title: "PENTARYN_TIES.title", icon: "fa-solid fa-people-arrows", resizable: true },
    position: { width: 680, height: "auto" }
  };

  get title() {
    return game.i18n.format("PENTARYN_TIES.windowTitle", { name: this.actor?.name ?? "" });
  }

  async _renderHTML() {
    return buildHTML(this.actor);
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    bind(content, this.actor, () => this.render());
    return content;
  }

  static open(actor) {
    if (!actor) return null;
    // ApplicationV2 instances live in foundry.applications.instances, not ui.windows
    const pool = [...(foundry.applications?.instances?.values?.() ?? []), ...Object.values(ui.windows ?? {})];
    const existing = pool.find(w => w instanceof TiesEditor && w.actor?.id === actor.id);
    if (existing) {
      existing.bringToFront?.();
      return existing;
    }
    return new TiesEditor(actor).render(true);
  }
}
