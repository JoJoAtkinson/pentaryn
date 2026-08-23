/**
 * The ties UI, built once and hosted in two places:
 *   - a "Ties" tab injected into the actor sheet   (primary)
 *   - a standalone window from the sheet header    (fallback, survives sheet restyles)
 *
 * Both call buildHTML() + bind(). If dnd5e ever restructures its sheet markup and the
 * tab injection stops finding a home, the window still works and nothing is lost.
 *
 * ONE ROW, TWO STATES — and no mode. 0.8.0 put editing behind dnd5e's Play/Edit slider;
 * in play nobody found it, and the answer to "how do I change this" should never be "first
 * change what the sheet is". So: a row is a summary you can read at a glance, clicking
 * anywhere on it expands the detail, and the detail is editable if you own the actor. The
 * pencil is a hint that the row is clickable, not a separate control.
 *
 * Everything written here is DIRECTED — the word and the description both say what THIS
 * actor is to the person in the row. The other side has its own, and this panel never
 * touches it. See `context/plans/foundry-npc-ties-gui.md`.
 */

import {
  STANCES,
  NOTES_MAX,
  read,
  inbound,
  presentActorIds,
  write,
  removeTie,
  clampStance,
  clampStrength,
  stanceOf,
  stanceLabel
} from "./ties-api.mjs";
import { authoringHTML, bindAuthoring } from "./authoring.mjs";

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);
const f = (k, data) => game.i18n.format(`PENTARYN_TIES.${k}`, data);

/** What a tie with no portrait — or no actor left at all — shows. Foundry ships it. */
const FALLBACK_ART = "icons/svg/mystery-man.svg";

/**
 * The portrait, or the mystery man when there is no actor left to ask.
 *
 * ⚠ A permission gate was tried here and **removed**: `testUserPermission(user, "LIMITED")`
 * looks like the right guard, but it is not a proxy for "my character knows them". Measured
 * against this world, every one of a player's 24 ties — the other player's character
 * included — points at an actor they lack LIMITED on, because NPCs default to permission
 * NONE. The gate turned a player's address book into two dozen identical silhouettes and
 * deleted the feature for the people it exists for.
 *
 * What makes that safe is the rule the parent plan already sets: a tie's row shows the
 * cached NAME whether or not the actor resolves, and has since 0.1.0, so anything that
 * would spoil the game must not be written as a tie in the first place — it goes in a
 * GM-only journal. The face is the same category of disclosure as the name beside it, on a
 * list that a GM curated. If a face must stay secret, do not give that actor a tie on a
 * player's character; and see "rules govern presentation, not access" in the parent plan.
 */
export function artFor(tie) {
  return tie.missing ? FALLBACK_ART : tie.img || FALLBACK_ART;
}

/**
 * Which rows are expanded, per actor. Held out here rather than in the DOM because every
 * mutation repaints the whole block — without this, changing a stance would slam shut the
 * row you were editing. Purely cosmetic state; nothing is lost if it resets.
 */
const expanded = new Map(); // actorId -> Set(tieId)
const expandedFor = actorId => expanded.get(actorId) ?? new Set();
function setExpanded(actorId, tieId, open) {
  const set = expanded.get(actorId) ?? new Set();
  open ? set.add(tieId) : set.delete(tieId);
  set.size ? expanded.set(actorId, set) : expanded.delete(actorId);
}

/**
 * Whatever key actually opens the tie dialog. Hardcoding "6" in the hint was a lie the
 * moment anyone rebound it in Configure Controls, which is the one place they would then
 * look to find out what it had become.
 */
function addTieKey() {
  const bound = game.keybindings?.get?.("pentaryn-ties", "addTie")?.[0]?.key ?? "";
  return bound.replace(/^Digit/, "").replace(/^Key/, "") || "?";
}

/** Drop a deleted actor's row state; nothing else holds a reference to it. */
export function forgetActor(actorId) {
  expanded.delete(actorId);
}

export function stanceSelect(value, { field = "stance" } = {}) {
  const opts = STANCES.map(
    s =>
      `<option value="${s.value}"${s.value === clampStance(value) ? " selected" : ""}>${esc(stanceLabel(s.value))}</option>`
  ).join("");
  return `<select class="pt-stance" data-field="${esc(field)}">${opts}</select>`;
}

/**
 * Strength as five pips rather than a `<select>` of bare numbers: it is an unlabelled
 * ordinal whose only job is ranking, and a shape you can compare down a column beats a
 * digit you have to open a menu to change.
 *
 * Interactive pips are real `<button>`s, not styled `<span>`s, so strength stays reachable
 * by keyboard — the `<select>` this replaced was.
 */
export function pips(strength, interactive) {
  const n = clampStrength(strength);
  const tip = esc(f("row.strengthTip", { n }));
  const cell = i =>
    interactive
      ? `<button type="button" class="pt-pip${i <= n ? " fill" : ""}" data-action="strength" data-n="${i}"
          aria-label="${esc(f("row.strengthSet", { n: i }))}" data-tooltip="${esc(f("row.strengthSet", { n: i }))}"></button>`
      : `<span class="pt-pip${i <= n ? " fill" : ""}"></span>`;
  // aria-label, not just data-tooltip: core's TooltipManager binds pointer events only and
  // sets aria-describedby only while the tooltip is up, so it names nothing for a screen
  // reader and never fires on keyboard focus. Static pips are otherwise empty spans.
  return `<span class="pt-pips" role="group" aria-label="${tip}" data-tooltip="${tip}">${[1, 2, 3, 4, 5]
    .map(cell)
    .join("")}</span>`;
}

/**
 * The dot and its word. The bare dot made you carry the colour code in your head.
 *
 * `labelled` false on a row with no word: the word cell has already fallen back to the
 * stance label, and "Neutral · ● Neutral" reads as two facts when it is one.
 */
export function stanceChip(stance, { labelled = true } = {}) {
  const s = stanceOf(stance);
  const label = labelled ? `<span class="pt-chip-label">${esc(stanceLabel(stance))}</span>` : "";
  return `<span class="pt-chip${labelled ? "" : " pt-chip-bare"}" data-tooltip="${esc(
    stanceLabel(stance)
  )}"><span class="pt-dot pt-${s.key}"></span>${label}</span>`;
}

/**
 * What the other side says back, tucked onto the row that already names them.
 *
 * Most pairs are mutual — the dialog seeds both halves — so a plain "outbound list, then
 * inbound list" would print nearly every row twice. Measured on this campaign: of Wat's 9
 * inbound rows 7 are mutual, and all 24 of a PC's are. Merging the mutual ones here leaves
 * the section below the line holding only what is genuinely new.
 *
 * GM only, like everything read off another actor's array.
 */
function replyFragment(reply) {
  if (!reply) return "";
  const s = stanceOf(reply.stance);
  const word = reply.word
    ? `<span class="pt-reply-word">${esc(reply.word)}</span>`
    : `<span class="pt-reply-word pt-noword">${esc(stanceLabel(reply.stance))}</span>`;
  return `<span class="pt-reply" data-tooltip="${esc(
    f("reply.tip", { name: reply.name, word: reply.word || stanceLabel(reply.stance) })
  )}"><i class="fa-solid fa-reply" aria-hidden="true"></i>${word}<span class="pt-dot pt-${s.key}"></span></span>`;
}

/** The always-visible half of a row: what you scan, and the whole click target. */
function summary(tie, { open, canEdit, reply = null }) {
  const stance = stanceOf(tie.stance);
  const hasNotes = !!tie.notes.trim();

  const name = `<span class="pt-name${tie.missing ? " pt-missing" : ""}">${esc(tie.name)}</span>`;

  /*
   * One dimmed line of the note, under the name — the note usually IS the answer, and a
   * hidden one costs a click per row per lookup. Clamped to one line by CSS, and hidden by
   * CSS while the row is open, so expanding is a class toggle rather than a repaint.
   */
  const preview = hasNotes
    ? `<span class="pt-note-preview">${esc(tie.notes)}</span>`
    : `<span class="pt-note-preview pt-note-none"><em>${esc(t("row.notesEmpty"))}</em></span>`;

  const word = tie.word
    ? `<span class="pt-word${stance.value ? ` pt-${stance.key}` : ""}">${esc(tie.word)}</span>`
    : `<span class="pt-word pt-noword">${esc(stanceLabel(tie.stance))}</span>`;

  /*
   * The whole summary is one button. The ask was "clicking anywhere on the item makes it
   * expand", and role=button gets that plus Enter/Space and a focus ring for free — where
   * a click handler on the <li> would have given the mouse only.
   */
  return `<div class="pt-summary" role="button" tabindex="0" aria-expanded="${open}"
      data-action="toggle" data-tooltip="${esc(t(canEdit ? "row.expandEdit" : "row.expandRead"))}"
      aria-label="${esc(f(canEdit ? "row.expandEditOf" : "row.expandReadOf", { name: tie.name }))}">
    <img class="pt-portrait" src="${esc(artFor(tie))}" alt="" />
    <span class="pt-who">${name}${preview}${replyFragment(reply)}</span>
    ${word}
    ${stanceChip(tie.stance, { labelled: !!tie.word })}
    ${pips(tie.strength, false)}
    <span class="pt-hint" aria-hidden="true"><i class="fa-solid ${canEdit ? "fa-pen" : "fa-eye"}"></i></span>
  </div>`;
}

/** Their half of a mutual pair, read-only, GM only — with a door to edit it properly. */
function theirSide(reply) {
  if (!reply) return "";
  const word = reply.word
    ? `<span class="pt-word">${esc(reply.word)}</span>`
    : `<span class="pt-word pt-noword">${esc(stanceLabel(reply.stance))}</span>`;
  const prose = reply.notes.trim()
    ? `<div class="pt-notes-prose">${esc(reply.notes)}</div>`
    : `<div class="pt-notes-prose pt-note-none"><em>${esc(t("row.notesEmpty"))}</em></div>`;
  return `<div class="pt-their-side">
    <div class="pt-their-head">
      <span class="pt-their-title">${esc(f("reply.heading", { name: reply.name }))}</span>
      <span class="pt-gm-badge"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> ${esc(t("gmOnly"))}</span>
    </div>
    <div class="pt-their-line">${word}${stanceChip(reply.stance, { labelled: !!reply.word })}${pips(
      reply.strength,
      false
    )}</div>
    ${prose}
    <div class="pt-detail-actions">
      <button type="button" class="pt-textbtn" data-action="edit-theirs" data-id="${esc(reply.id)}">
        <i class="fa-solid fa-pen"></i> ${esc(f("inbound.editTheirs", { name: reply.name }))}
      </button>
    </div>
  </div>`;
}

/** The half that appears on click: everything you can change, or the prose if you can't. */
function detail(tie, { canEdit, reply = null }) {
  const openSheet = tie.missing
    ? ""
    : `<button type="button" class="pt-textbtn" data-action="open" data-id="${esc(tie.id)}">
        <i class="fa-solid fa-arrow-up-right-from-square"></i> ${esc(t("row.openSheet"))}
      </button>`;

  if (!canEdit) {
    const prose = tie.notes.trim()
      ? `<div class="pt-notes-prose">${esc(tie.notes)}</div>`
      : `<div class="pt-notes-prose pt-note-none"><em>${esc(t("row.notesEmpty"))}</em></div>`;
    return `<div class="pt-detail">
      ${prose}
      <div class="pt-detail-actions">${openSheet}</div>
      ${theirSide(reply)}
    </div>`;
  }

  return `<div class="pt-detail">
    <div class="pt-fields">
      <label class="pt-field">
        <span class="pt-field-label">${esc(f("row.wordLabelOf", { name: tie.name }))}</span>
        <input type="text" class="pt-word-input" data-field="word" value="${esc(tie.word)}"
               placeholder="${esc(t("row.wordPlaceholder"))}" />
      </label>
      <label class="pt-field">
        <span class="pt-field-label">${esc(t("row.stanceLabel"))}</span>
        ${stanceSelect(tie.stance)}
      </label>
      <span class="pt-field">
        <span class="pt-field-label">${esc(t("row.strengthLabel"))}</span>
        ${pips(tie.strength, true)}
      </span>
    </div>
    <label class="pt-field pt-field-notes">
      <span class="pt-field-label">${esc(t("row.notesLabel"))}</span>
      <textarea class="pt-notes-text" data-field="notes" rows="5" maxlength="${NOTES_MAX}"
                placeholder="${esc(f("row.notesPlaceholder", { name: tie.name }))}">${esc(tie.notes)}</textarea>
    </label>
    <div class="pt-detail-actions">
      ${openSheet}
      <button type="button" class="pt-textbtn pt-del" data-action="remove" data-id="${esc(tie.id)}">
        <i class="fa-solid fa-trash"></i> ${esc(t("row.remove"))}
      </button>
    </div>
    ${theirSide(reply)}
  </div>`;
}

function tieRow(tie, { open, canEdit, reply = null }) {
  return `<li class="pt-row${open ? " pt-open" : ""}${tie.missing ? " pt-missing-row" : ""}" data-id="${esc(tie.id)}">
    ${summary(tie, { open, canEdit, reply })}
    <div class="pt-detail-wrap"${open ? "" : " hidden"}>${detail(tie, { canEdit, reply })}</div>
  </li>`;
}

/**
 * A row for someone who has written this character down without being written down back.
 *
 * It is **their** record, so nothing here edits in place — that would mean writing another
 * actor's document from this sheet. The action opens their side in the dialog instead,
 * which also makes this the one door to a tie whose author has no token on the scene.
 */
function inboundRow(row, { open }) {
  const s = stanceOf(row.stance);
  const word = row.word
    ? `<span class="pt-word${s.value ? ` pt-${s.key}` : ""}">${esc(row.word)}</span>`
    : `<span class="pt-word pt-noword">${esc(stanceLabel(row.stance))}</span>`;
  const preview = row.notes.trim()
    ? `<span class="pt-note-preview">${esc(row.notes)}</span>`
    : `<span class="pt-note-preview pt-note-none"><em>${esc(t("row.notesEmpty"))}</em></span>`;
  const prose = row.notes.trim()
    ? `<div class="pt-notes-prose">${esc(row.notes)}</div>`
    : `<div class="pt-notes-prose pt-note-none"><em>${esc(t("row.notesEmpty"))}</em></div>`;

  return `<li class="pt-row pt-inbound${open ? " pt-open" : ""}" data-id="${esc(row.id)}" data-inbound="1">
    <div class="pt-summary" role="button" tabindex="0" aria-expanded="${open}" data-action="toggle"
         aria-label="${esc(f("inbound.rowLabel", { name: row.name }))}"
         data-tooltip="${esc(f("inbound.rowTip", { name: row.name }))}">
      <img class="pt-portrait" src="${esc(row.img || FALLBACK_ART)}" alt="" loading="lazy" />
      <span class="pt-who"><span class="pt-name">${esc(row.name)}</span>${preview}</span>
      ${word}
      ${stanceChip(row.stance, { labelled: !!row.word })}
      ${pips(row.strength, false)}
      <span class="pt-hint" aria-hidden="true"><i class="fa-solid fa-reply"></i></span>
    </div>
    <div class="pt-detail-wrap"${open ? "" : " hidden"}>
      <div class="pt-detail">
        ${prose}
        <div class="pt-detail-actions">
          <button type="button" class="pt-textbtn" data-action="open" data-id="${esc(row.id)}">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> ${esc(f("inbound.openSheet", { name: row.name }))}
          </button>
          <button type="button" class="pt-textbtn" data-action="edit-theirs" data-id="${esc(row.id)}">
            <i class="fa-solid fa-pen"></i> ${esc(f("inbound.editTheirs", { name: row.name }))}
          </button>
        </div>
      </div>
    </div>
  </li>`;
}

/**
 * Full markup for one actor's ties. Safe to drop into a tab or a window.
 * There is no mode: rows read as a reference panel, and the detail is editable for whoever
 * owns the actor. Adding is a button, because "how do I add one" had no answer on the panel.
 */
export function buildHTML(actor) {
  const canEdit = actor?.isOwner === true;
  const ties = read(actor);
  const open = expandedFor(actor.id);

  /*
   * `inbound()` returns [] for anyone but a GM — the gate is in the data layer, not here,
   * so no renderer can leak it by forgetting to ask. Mutual pairs are merged onto the row
   * that already names them; only the asymmetries get a section of their own.
   */
  const inb = inbound(actor);
  const replies = new Map(inb.filter(r => r.mutual).map(r => [r.id, r]));
  const orphans = inb.filter(r => !r.mutual);

  /*
   * Who is in the room comes first — that is the question being asked when someone opens
   * this mid-scene. The split is derived from `presentActorIds()`, which for anyone but the
   * GM is filtered through `Token#isVisible`: a hidden or walled-off character lands in the
   * lower group, indistinguishable from someone who simply is not here. Sorting a list into
   * "here" and "elsewhere" is a statement about who is present, and a player must not be
   * able to find a hiding character by reading it.
   *
   * Headings appear only when BOTH groups have rows. With everything in one group — no
   * scene open, nobody here, everybody here — a heading would label the obvious.
   */
  const present = presentActorIds();
  const here = ties.filter(tie => present.has(tie.id));
  const elsewhere = ties.filter(tie => !present.has(tie.id));
  const split = here.length > 0 && elsewhere.length > 0;

  const renderRows = list =>
    list.map(tie => tieRow(tie, { open: open.has(tie.id), canEdit, reply: replies.get(tie.id) ?? null })).join("");

  const groupHead = key =>
    `<div class="pt-group-head" role="heading" aria-level="3"><span class="pt-group-title">${esc(t(key))}</span></div>`;

  const rows = !ties.length
    ? `<li class="pt-empty">${esc(t("empty"))}</li>`
    : split
      ? `${renderRows(here)}`
      : renderRows(ties);

  const add = canEdit
    ? `<div class="pt-add-bar">
        <button type="button" class="pt-add-btn" data-action="add">
          <i class="fa-solid fa-plus"></i> ${esc(t("add"))}
        </button>
        <span class="pt-add-hint">${esc(f("addHint", { key: addTieKey() }))}</span>
      </div>`
    : "";

  /*
   * People who wrote this character down without being written down back. Nothing renders
   * at all when there are none — an empty heading would be a permanent reminder of nothing.
   */
  const inboundSection = orphans.length
    ? `<div class="pt-inbound-head">
        <span class="pt-inbound-title">${esc(t("inbound.heading"))}</span>
        <span class="pt-gm-badge"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> ${esc(t("gmOnly"))}</span>
      </div>
      <p class="pt-inbound-hint">${esc(t("inbound.hint"))}</p>
      <ul class="pt-list pt-list-inbound">
        ${orphans.map(r => inboundRow(r, { open: open.has(r.id) })).join("")}
      </ul>`
    : "";

  /*
   * Labelled by what the test actually means for whoever is reading. For the GM the top
   * group really is "on this scene"; for a player it is "what my character can see", and
   * saying so keeps the label true rather than merely protective.
   */
  const isGM = game.user?.isGM === true;
  const elsewhereBlock = split
    ? `${groupHead(isGM ? "group.elsewhere" : "group.notInSight")}
       <ul class="pt-list pt-list-elsewhere">${renderRows(elsewhere)}</ul>`
    : "";

  return `<div class="pentaryn-ties" data-actor-id="${esc(actor.id)}">
    ${split ? groupHead(isGM ? "group.onScene" : "group.inSight") : ""}
    <ul class="pt-list">${rows}</ul>
    ${elsewhereBlock}
    ${add}
    ${inboundSection}
    ${authoringHTML(actor)}
  </div>`;
}

/** Wire a rendered block. `rerender` is called after any mutation that reorders rows. */
export function bind(root, actor, rerender = () => {}) {
  if (!root || !actor) return;
  // the GM authoring section — a no-op for a player, gated inside rather than here
  bindAuthoring(root, actor, rerender);
  const canEdit = actor.isOwner === true;
  const replies = new Map(inbound(actor).filter(r => r.mutual).map(r => [r.id, r]));

  /* ── expand / collapse: the whole summary, by mouse or keyboard ──────── */

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
      if (open) wrap.querySelector('[data-field="word"]')?.focus();
    };

    head.addEventListener("click", toggle);
    head.addEventListener("keydown", ev => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault(); // Space would scroll the panel instead
      toggle();
    });
  });

  // A click inside the detail must not bubble to the summary and collapse the row you are
  // typing in — the whole row being a click target is exactly what makes that possible.
  root.querySelectorAll(".pt-detail-wrap").forEach(wrap => {
    wrap.addEventListener("click", ev => ev.stopPropagation());
  });

  root.querySelectorAll('[data-action="open"]').forEach(btn => {
    btn.addEventListener("click", () => game.actors.get(btn.dataset.id)?.sheet?.render(true));
  });

  /*
   * Their side is theirs — editing it here would mean writing another actor's document from
   * this sheet. Open it in the dialog pointed the right way instead, with both ends locked.
   * That also makes this the one door to a tie whose author has no token on the scene.
   */
  root.querySelectorAll('[data-action="edit-theirs"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const author = game.actors.get(btn.dataset.id);
      if (!author) return;
      try {
        const { TieDialog } = await import("./tie-dialog.mjs");
        TieDialog.open({ source: author, target: actor, onSaved: rerender });
      } catch (err) {
        console.error("pentaryn-ties | the tie dialog failed to open", err);
        ui.notifications.error(t("notify.dialogUnavailable"));
      }
    });
  });

  if (!canEdit) return;

  /* ── editing, inside an expanded row ─────────────────────────────────── */

  root.querySelectorAll(".pt-row:not([data-inbound])").forEach(row => {
    const id = row.dataset.id;

    const saveField = async (field, value) => {
      const list = read(actor);
      const entry = list.find(x => x.id === id);
      if (!entry) return null;
      entry[field] = value;
      await write(actor, list);
      return entry;
    };

    /*
     * Word, stance and notes change what the summary says but not where the row sits, so
     * repaint only that half. A full repaint would tear the caret out of the textarea
     * underneath — which is exactly what autosave-while-typing would trigger.
     */
    const repaintSummary = () => {
      const tie = read(actor).find(x => x.id === id);
      const head = row.querySelector(".pt-summary");
      if (!tie || !head) return;
      const fresh = document.createElement("div");
      const reply = replies.get(id) ?? null;
      fresh.innerHTML = summary(tie, { open: row.classList.contains("pt-open"), canEdit, reply });
      const next = fresh.firstElementChild;
      head.replaceWith(next);
      bindSummary(next, row, actor);
    };

    row.querySelectorAll("[data-field]").forEach(input => {
      input.addEventListener("change", async () => {
        const value = input.dataset.field === "stance" ? Number(input.value) : input.value;
        if (!(await saveField(input.dataset.field, value))) return;
        repaintSummary();
      });
    });

    // strength: click pip n. Repaints everything, because strength is the sort key.
    row.querySelectorAll('.pt-pip[data-action="strength"]').forEach(pip => {
      pip.addEventListener("click", async () => {
        if (!(await saveField("strength", clampStrength(pip.dataset.n)))) return;
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
        pending = setTimeout(async () => {
          await saveField("notes", notes.value);
          repaintSummary();
        }, 700);
      });
      notes.addEventListener("blur", () => clearTimeout(pending));
    }
  });

  root.querySelectorAll('[data-action="remove"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const target = game.actors.get(btn.dataset.id);
      const losing = read(actor).some(x => x.id === btn.dataset.id && x.notes.trim());
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("confirm.removeTitle") },
        content:
          `<p>${esc(
            game.i18n.format("PENTARYN_TIES.confirm.removeBoth", {
              a: actor.name,
              b: target?.name ?? t("row.missingName")
            })
          )}</p>` + (losing ? `<p class="notification warning">${esc(t("confirm.removeNotes"))}</p>` : "")
      });
      if (!ok) return;
      await removeTie(actor, btn.dataset.id, { bothWays: true });
      setExpanded(actor.id, btn.dataset.id, false);
      rerender();
    });
  });

  root.querySelector('[data-action="add"]')?.addEventListener("click", async () => {
    try {
      const { TieDialog } = await import("./tie-dialog.mjs");
      TieDialog.open({ source: actor, onSaved: rerender });
    } catch (err) {
      console.error("pentaryn-ties | the tie dialog failed to open", err);
      ui.notifications.error(t("notify.dialogUnavailable"));
    }
  });
}

/**
 * Re-wire a summary that was replaced in place. Kept separate from `bind()` so a partial
 * repaint cannot re-register every listener in the panel a second time.
 */
function bindSummary(head, row, actor) {
  const wrap = row.querySelector(".pt-detail-wrap");
  if (!wrap) return;
  const toggle = () => {
    const open = wrap.hasAttribute("hidden");
    wrap.toggleAttribute("hidden", !open);
    row.classList.toggle("pt-open", open);
    head.setAttribute("aria-expanded", String(open));
    setExpanded(actor.id, row.dataset.id, open);
    // same behaviour as the full bind's toggle; without it a row behaves differently
    // depending on whether its summary happened to be repainted since the last render
    if (open) wrap.querySelector('[data-field="word"]')?.focus();
  };
  head.addEventListener("click", toggle);
  head.addEventListener("keydown", ev => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault();
    toggle();
  });
}

/** Standalone window — the fallback host, and the one the header button opens. */
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
