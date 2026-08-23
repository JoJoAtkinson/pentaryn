/**
 * The lore row editor — phase 4's authoring surface, and **decision 21 rule 3** in one file.
 *
 * ## The rule this file exists to hold
 *
 * `loreEditorHTML(rows)` and `bindLoreEditor(root, { rows, save })` know about rows. They do
 * not know about actors. There is no `actor` parameter, no `subject`, no document lookup, and
 * nothing here reads a flag or writes one — the caller hands in an array and a `save(rows)`
 * callback and gets an editor.
 *
 * That is not stylistic. Phase 6 stores the *identical* row array against a world-setting
 * registry entry (an attribute — a city, a guild, a tribe) which is not an actor and has no
 * flags. If this editor could name an actor, the attribute phase would need a second editor
 * that drifts from this one, or a migration. Because it cannot, phase 6 mounts this file
 * unchanged and passes a different `save`.
 *
 * The test for a change here is one question: *would this still compile if actors did not
 * exist?* If not, it belongs in the caller.
 *
 * ## What a GM is authoring
 *
 * One fact, one price. `label` is the affordance the player sees before rolling (decision 8 —
 * that a secret exists is the invitation); `dc` and `skill` are the price; `text` is what a
 * pass buys; `miss` is what a failure buys, and authoring it is what makes the row honest
 * under blind rolls. `hold` is the per-row approval gate.
 */

import {
  readLore,
  clampLoreRow,
  makeLoreRow,
  LORE_LABEL_MAX,
  LORE_TEXT_MAX,
  LORE_DC_MIN,
  LORE_DC_MAX
} from "./known-core.mjs";

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);
const f = (k, data) => game.i18n.format(`PENTARYN_TIES.${k}`, data);

/** Which rows are expanded, keyed by the mount's own id — cosmetic, never persisted. */
const open = new Map();

const openFor = key => {
  if (!open.has(key)) open.set(key, new Set());
  return open.get(key);
};

/**
 * The skill list, read off the world rather than hardcoded.
 *
 * A GM's own homebrew skill has to be authorable, and the pure layer is not allowed to know
 * what dnd5e ships — so the list is built here, at the only point that legitimately has
 * `CONFIG`, and the row schema only shape-checks the value it gets back.
 */
function skillOptions(selected) {
  const skills = CONFIG.DND5E?.skills ?? {};
  const entries = Object.entries(skills).map(([id, def]) => [id, def?.label ?? id]);
  entries.sort((a, b) => a[1].localeCompare(b[1]));
  // a row authored against a skill this world no longer defines keeps its value rather than
  // silently retargeting to whatever sorts first
  if (selected && !skills[selected]) entries.unshift([selected, f("lore.skillMissing", { skill: selected })]);
  return entries
    .map(([id, label]) => `<option value="${esc(id)}"${id === selected ? " selected" : ""}>${esc(label)}</option>`)
    .join("");
}

function holdOptions(hold) {
  const v = hold === true ? "on" : hold === false ? "off" : "";
  return [
    ["", t("lore.holdDefault")],
    ["on", t("lore.holdOn")],
    ["off", t("lore.holdOff")]
  ]
    .map(([id, label]) => `<option value="${id}"${id === v ? " selected" : ""}>${esc(label)}</option>`)
    .join("");
}

/** The collapsed line: what the row costs and whether it can currently be failed honestly. */
function summary(row) {
  const label = row.label.trim() || t("lore.untitled");
  const skill = CONFIG.DND5E?.skills?.[row.skill]?.label ?? row.skill;
  return `<div class="pt-summary pt-lore-summary" role="button" tabindex="0"
       aria-label="${esc(f("lore.rowAria", { label, skill, dc: row.dc }))}">
    <span class="pt-lore-dc" data-tooltip="${esc(f("lore.dcTip", { skill, dc: row.dc }))}">${row.dc}</span>
    <span class="pt-lore-label">${esc(label)}</span>
    <span class="pt-lore-skill">${esc(skill)}</span>
    ${
      row.miss.trim()
        ? ""
        : `<i class="fa-solid fa-triangle-exclamation pt-lore-leak" aria-label="${esc(t("lore.leakWarn"))}"
             data-tooltip="${esc(t("lore.leakWarn"))}"></i>`
    }
    <i class="fa-solid fa-chevron-down pt-caret" aria-hidden="true"></i>
  </div>`;
}

function detail(row) {
  return `<div class="pt-detail pt-lore-detail">
    <label class="pt-field">
      <span class="pt-field-label">${esc(t("lore.labelLabel"))}</span>
      <input type="text" data-field="label" maxlength="${LORE_LABEL_MAX}"
             value="${esc(row.label)}" placeholder="${esc(t("lore.labelPlaceholder"))}">
    </label>
    <div class="pt-fields pt-lore-price">
      <label class="pt-field">
        <span class="pt-field-label">${esc(t("lore.skillLabel"))}</span>
        <select data-field="skill">${skillOptions(row.skill)}</select>
      </label>
      <label class="pt-field pt-field-dc">
        <span class="pt-field-label">${esc(t("lore.dcLabel"))}</span>
        <input type="number" data-field="dc" min="${LORE_DC_MIN}" max="${LORE_DC_MAX}" value="${row.dc}">
      </label>
      <label class="pt-field">
        <span class="pt-field-label">${esc(t("lore.holdLabel"))}</span>
        <select data-field="hold" data-tooltip="${esc(t("lore.holdTip"))}">${holdOptions(row.hold)}</select>
      </label>
    </div>
    <label class="pt-field pt-field-notes">
      <span class="pt-field-label">${esc(t("lore.textLabel"))}</span>
      <textarea data-field="text" rows="4" maxlength="${LORE_TEXT_MAX}"
                placeholder="${esc(t("lore.textPlaceholder"))}">${esc(row.text)}</textarea>
    </label>
    <label class="pt-field pt-field-notes">
      <span class="pt-field-label">${esc(t("lore.missLabel"))}</span>
      <textarea data-field="miss" rows="3" maxlength="${LORE_TEXT_MAX}"
                placeholder="${esc(t("lore.missPlaceholder"))}">${esc(row.miss)}</textarea>
      <span class="pt-hint">${esc(t("lore.missHint"))}</span>
    </label>
    <div class="pt-detail-actions">
      <button type="button" class="pt-textbtn pt-del" data-action="lore-remove" data-id="${esc(row.id)}">
        <i class="fa-solid fa-trash"></i> ${esc(t("lore.remove"))}
      </button>
    </div>
  </div>`;
}

/**
 * Markup for the whole editor. `key` scopes the expanded-row memory to this mount, so an
 * actor's rows and a registry entry's rows do not share open state.
 */
export function loreEditorHTML(rawRows, key = "lore") {
  const rows = readLore(rawRows);
  const expanded = openFor(key);
  const body = rows.length
    ? `<ul class="pt-list pt-lore-list">${rows
        .map(
          r => `<li class="pt-row pt-lore-row${expanded.has(r.id) ? " pt-open" : ""}" data-id="${esc(r.id)}">
            ${summary(r)}
            <div class="pt-detail-wrap"${expanded.has(r.id) ? "" : " hidden"}>${detail(r)}</div>
          </li>`
        )
        .join("")}</ul>`
    : `<p class="pt-empty">${esc(t("lore.empty"))}</p>`;

  return `<section class="pt-lore-editor" data-lore-key="${esc(key)}">
    <div class="pt-group-head" role="heading" aria-level="3">
      <span class="pt-group-title">${esc(t("lore.heading"))}</span>
    </div>
    <p class="pt-hint pt-lore-warning">${esc(t("lore.plaintextWarning"))}</p>
    ${body}
    <div class="pt-add-bar">
      <button type="button" class="pt-add-btn" data-action="lore-add">
        <i class="fa-solid fa-plus"></i> ${esc(t("lore.add"))}
      </button>
    </div>
  </section>`;
}

/**
 * Wire one mounted editor.
 *
 * `rows()` re-reads the current array at call time rather than closing over a snapshot — the
 * caller's document can change under an open sheet, and an editor holding a stale array would
 * write the stale array back on the next keystroke and silently undo somebody else's edit.
 *
 * `save(rows)` is the only way anything leaves this file.
 */
export function bindLoreEditor(root, { rows, save, key = "lore", rerender }) {
  const section = root?.querySelector?.(`.pt-lore-editor[data-lore-key="${key}"]`);
  if (!section) return;
  const expanded = openFor(key);

  const current = () => readLore(typeof rows === "function" ? rows() : rows);
  const commit = async list => {
    await save(list.map(clampLoreRow).filter(Boolean));
    rerender?.();
  };

  // expand / collapse — the ties row idiom, click anywhere on the summary
  for (const el of section.querySelectorAll(".pt-lore-summary")) {
    const li = el.closest(".pt-row");
    const toggle = () => {
      const id = li.dataset.id;
      const wrap = li.querySelector(".pt-detail-wrap");
      const nowOpen = !li.classList.contains("pt-open");
      li.classList.toggle("pt-open", nowOpen);
      wrap.hidden = !nowOpen;
      if (nowOpen) expanded.add(id);
      else expanded.delete(id);
    };
    el.addEventListener("click", toggle);
    el.addEventListener("keydown", ev => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggle();
      }
    });
  }

  /*
   * Field edits commit on `change`, not on `input`.
   *
   * The Known notes field autosaves on a debounce because it is the player's own prose and
   * losing a sentence to a closed sheet is a real cost. A lore row is different: every commit
   * rewrites the whole array on the actor and repaints, and doing that per keystroke inside a
   * DC spinner produces a write storm and a cursor that jumps. `change` fires on blur and on
   * Enter, which is exactly when a GM has finished a field.
   */
  for (const el of section.querySelectorAll("[data-field]")) {
    el.addEventListener("change", async () => {
      const li = el.closest(".pt-row");
      const id = li?.dataset.id;
      const field = el.dataset.field;
      const list = current();
      const row = list.find(r => r.id === id);
      if (!row) return;
      if (field === "dc") row.dc = Number(el.value);
      else if (field === "hold") row.hold = el.value === "on" ? true : el.value === "off" ? false : null;
      else row[field] = el.value;
      await commit(list);
    });
  }

  section.querySelector("[data-action='lore-add']")?.addEventListener("click", async () => {
    const row = makeLoreRow(foundry.utils.randomID());
    /*
     * A fresh row has no label, and `readLore` drops labelless rows — so committing it through
     * `commit` would delete it on the way to the disk. It is expanded and rendered locally,
     * and reaches storage on the first `change` that gives it a label. That is also the right
     * behaviour: an abandoned blank row leaves nothing behind.
     */
    expanded.add(row.id);
    const list = current();
    list.push(row);
    await save(list); // unfiltered on purpose — see above
    rerender?.();
  });

  for (const btn of section.querySelectorAll("[data-action='lore-remove']")) {
    btn.addEventListener("click", async ev => {
      ev.stopPropagation();
      const id = btn.dataset.id;
      const row = current().find(r => r.id === id);
      const named = row?.label?.trim() || t("lore.untitled");
      const go = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("lore.removeTitle") },
        content: `<p>${esc(f("lore.removeBody", { label: named }))}</p>`
      });
      if (!go) return;
      expanded.delete(id);
      await commit(current().filter(r => r.id !== id));
    });
  }
}
