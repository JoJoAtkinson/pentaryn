/**
 * Pentaryn Creatures — UI: the Token markers menu (Configure Settings → Pentaryn Creatures → Token
 * markers, GM only). One row per CONFIG.statusEffects entry with Public / GM only, one row "Other
 * spell and item effects on enemies", and the toggle "Friendly tokens show every marker". Saving
 * writes the overrides to the `markerTable` setting; markers.mjs redraws every token's icons.
 *
 * The class is built on demand (`markersMenuClass()`, called at init by registerSettings) so this
 * file loads without Foundry globals. The rows and the form parsing are pure (creatures-core.mjs).
 */

import {
  MARKER_GM, MARKER_PUBLIC, MODULE, markerMenuRows, markerOverrides, markerTable, markerTableFromForm, statusIdsOf,
} from "./creatures-core.mjs";
import { saveSetting, setting } from "./settings.mjs";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The menu's HTML for an effective table (exported for the tests). */
export function menuHTML(statusEffects, table, localize = k => k) {
  const L = k => esc(localize(k));
  const choice = (name, value) => `
      <select name="${esc(name)}">
        <option value="${MARKER_PUBLIC}"${value === MARKER_PUBLIC ? " selected" : ""}>${L("PENTARYN_CREATURES.markers.public")}</option>
        <option value="${MARKER_GM}"${value === MARKER_GM ? " selected" : ""}>${L("PENTARYN_CREATURES.markers.gm")}</option>
      </select>`;
  const rows = markerMenuRows(statusEffects, table).map(r => `
    <div class="form-group pcr-marker-row">
      <label>${r.img ? `<img class="pcr-marker-icon" src="${esc(r.img)}" alt="" width="20" height="20" style="vertical-align: middle; margin-right: 6px; border: none;">` : ""}${esc(localize(r.name))}</label>
      <div class="form-fields">${choice(`status.${r.id}`, r.value)}</div>
    </div>`).join("");
  return `
    <p class="hint">${L("PENTARYN_CREATURES.markers.intro")}</p>
    <div class="form-group">
      <label>${L("PENTARYN_CREATURES.markers.friendlyAll")}</label>
      <div class="form-fields"><input type="checkbox" name="friendlyAll"${table.friendlyAll ? " checked" : ""}></div>
    </div>
    <div class="form-group">
      <label>${L("PENTARYN_CREATURES.markers.other")}</label>
      <div class="form-fields">${choice("other", table.other)}</div>
    </div>
    <fieldset class="pcr-marker-statuses"><legend>${L("PENTARYN_CREATURES.markers.statuses")}</legend>${rows}
    </fieldset>
    <footer class="form-footer">
      <button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${L("PENTARYN_CREATURES.markers.save")}</button>
    </footer>`;
}

/** Build the ApplicationV2 subclass registerMenu needs. */
export function markersMenuClass() {
  const { ApplicationV2 } = foundry.applications.api;
  return class PentarynMarkersMenu extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: `${MODULE}-markers`,
      tag: "form",
      classes: ["pcr-markers-menu"],
      window: { title: "PENTARYN_CREATURES.settings.markerMenu.name", contentClasses: ["standard-form"] },
      position: { width: 520, height: "auto" },
      form: { handler: PentarynMarkersMenu.#onSubmit, closeOnSubmit: true },
    };

    async _renderHTML() {
      const statusEffects = CONFIG.statusEffects;
      const table = markerTable(statusIdsOf(statusEffects), setting("markerTable"));
      return menuHTML(statusEffects, table, k => game.i18n.localize(k));
    }

    _replaceHTML(result, content) {
      content.innerHTML = result;
    }

    static async #onSubmit(event, form, formData) {
      const table = markerTableFromForm(formData.object, statusIdsOf(CONFIG.statusEffects));
      await saveSetting("markerTable", markerOverrides(table));
    }
  };
}
