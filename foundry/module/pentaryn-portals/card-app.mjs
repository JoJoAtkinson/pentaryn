/**
 * Pentaryn Portal Cards — UI: the Portal card window (preview, with an edit toggle).
 *
 * DOM and ApplicationV2 only; every write goes through scene-adapter. The badges feature hands it
 * `setEditing` through configureCardApp() at install (a ui file never imports a feature); before
 * that it is a no-op, which cannot happen at runtime — the entry installs features before any render.
 */

import { MODULE, cardHTML, esc } from "./portals-core.mjs";
import { cardFor, destinationsOf, linkRegions, lookAt, snapshot, teleportBehaviors, unlinkRegion } from "./scene-adapter.mjs";
import { flagPath } from "./lib/flags.mjs";

const deps = { setEditing: () => {}, guard: (label, fn) => fn };

/**
 * Called by badges.install: `setEditing` (edit mode on a card marks its region's badge as
 * draggable) and the hook registry's pass-through `guard`, so a failed write in a listener logs
 * `pentaryn-portals | <label>` instead of an unattributed "Uncaught (in promise)".
 */
export function configureCardApp({ setEditing, guard } = {}) {
  if (setEditing) deps.setEditing = setEditing;
  if (guard) deps.guard = guard;
}

export class PortalCard extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["ppt-app", "ppt-dialog"],
    window: { title: "Portal card", icon: "fa-solid fa-door-open", resizable: true },
    position: { width: 600, height: "auto" }
  };

  static open(region, { edit = false } = {}) {
    if (!game.user.isGM) return null;
    return new PortalCard(region, edit).render(true);
  }

  constructor(region, edit) {
    super({ id: `pentaryn-portal-card-${region.id}` });
    this.region = region;
    this.edit = edit;
    deps.setEditing(region, edit);
  }

  async close(options) {
    deps.setEditing(this.region, false);
    return super.close(options);
  }

  get title() { return `Portal card — ${this.region.name}`; }

  async _renderHTML() {
    const dests = destinationsOf(this.region).map(d => d.region);
    const behaviors = teleportBehaviors(this.region);
    const revealedAll = behaviors.every(b => b.system.revealed);
    if (!this.edit) {
      const note = revealedAll ? "" : `<p class="hint"><i class="fa-solid fa-eye-slash"></i> This passage is <strong>unrevealed</strong>: players see no cards, only "a way onward".</p>`;
      const sealed = this.region.hidden ? `<p class="hint"><i class="fa-solid fa-lock"></i> <strong>Sealed:</strong> players can't see or use it.</p>` : "";
      return `<p class="hint">What a player sees on hover and in the travel prompt.</p>${sealed}${note}<div class="ppt-cards">${dests.map(d => cardHTML(cardFor(d))).join("")}</div>`;
    }

    const sw = (key, on, label, hint) => `<label class="ppt-switch" data-tooltip="${esc(hint)}">
      <input type="checkbox" data-set="${key}" ${on ? "checked" : ""}><span class="ppt-slider"></span><span>${esc(label)}</span></label>`;
    const choice = behaviors.every(b => b.system.choice);
    const head = `<section class="ppt-passage">
      <input class="ppt-name" type="text" data-set="name" value="${esc(this.region.name)}" data-tooltip="Passage name (GM only)">
      <div class="ppt-switches">
        ${sw("open", !this.region.hidden, "Open", "Off = sealed: players can't see the badge or use it")}
        ${sw("revealed", revealedAll, "Show where it leads", "Off = players see '?' and 'a way onward'")}
        ${sw("choice", choice, "Ask before moving", "Off = stepping on it moves them at once")}
      </div>
      <p class="hint"><i class="fa-solid fa-up-down-left-right"></i> Drag this passage's badge on the map to move it. Each card below is the place it leads to.</p>
    </section>`;

    const cards = dests.map(d => {
      const f = d.flags?.[MODULE] ?? {};
      const c = cardFor(d);
      return `<article class="ppt-card ppt-editcard" data-uuid="${esc(d.uuid)}">
        <figure class="ppt-imgedit">
          <img class="ppt-thumb" src="${esc(c.img)}" alt="">
          <div class="ppt-imgtools">
            <button type="button" data-act="pick" data-tooltip="Choose an image"><i class="fa-solid fa-folder-open"></i></button>
            <button type="button" data-act="snap" data-tooltip="Snap it from the map around that spot"><i class="fa-solid fa-camera"></i></button>
            ${f.img ? `<button type="button" data-act="clearimg" data-tooltip="Back to the scene thumbnail"><i class="fa-solid fa-rotate-left"></i></button>` : ""}
          </div>
        </figure>
        <div class="ppt-text">
          <input class="ppt-title" type="text" data-f="title" value="${esc(f.title ?? "")}" placeholder="${esc(c.title)}">
          <textarea class="ppt-descedit" data-f="description" rows="5" placeholder="What players read before they choose…">${esc(f.description ?? "")}</textarea>
          <div class="ppt-meta"><i class="fa-solid fa-location-dot"></i> ${esc(d.parent.name)} · ${esc(d.name)}
            <a data-act="look" data-tooltip="Look there (only you)"><i class="fa-solid fa-binoculars"></i></a>
            <a data-act="unlink" data-tooltip="Remove this destination"><i class="fa-solid fa-link-slash"></i></a></div>
        </div>
      </article>`;
    }).join("");

    // Any other region in the world can be a landing spot.
    const taken = new Set([this.region.uuid, ...dests.map(d => d.uuid)]);
    const opts = game.scenes.contents.flatMap(sc => sc.regions.contents
      .filter(r => !taken.has(r.uuid) && !r.behaviors.some(b => b.type !== "teleportToken"))
      .map(r => `<option value="${esc(r.uuid)}">${esc(sc.name)} — ${esc(r.name)}</option>`)).join("");
    const add = `<section class="ppt-add">
      <select data-act="addsel"><option value="">Add a destination…</option>${opts}</select>
      <label class="ppt-switch" data-tooltip="Also make that spot lead back here"><input type="checkbox" data-act="twoway" checked><span class="ppt-slider"></span><span>Two-way</span></label>
    </section>`;

    return head + `<div class="ppt-cards">${cards || `<p class="hint">No destinations yet.</p>`}</div>` + add;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    if (!this.edit) return;
    const region = this.region;
    const behaviors = () => teleportBehaviors(region);
    const guard = deps.guard;

    for (const input of content.querySelectorAll("[data-set]")) {
      input.addEventListener("change", guard("card switch", async () => {
        const k = input.dataset.set;
        if (k === "name") return region.update({ name: input.value });
        if (k === "open") return region.update({ hidden: !input.checked });
        // One batched write for every teleport behaviour of the region (C59).
        const updates = behaviors().map(b => ({ _id: b.id, [`system.${k}`]: input.checked }));
        if (updates.length) await region.updateEmbeddedDocuments("RegionBehavior", updates);
      }));
    }

    for (const card of content.querySelectorAll(".ppt-editcard")) {
      const dest = fromUuidSync(card.dataset.uuid);
      const setImg = guard("card image pick", async path => {
        await dest.update({ [`flags.${MODULE}.img`]: path });
        card.querySelector(".ppt-thumb").src = cardFor(dest).img;
      });
      for (const input of card.querySelectorAll("[data-f]")) {
        input.addEventListener("change", guard("card field", () => dest.update({ [`flags.${MODULE}.${input.dataset.f}`]: input.value })));
      }
      card.querySelector('[data-act="snap"]').addEventListener("click", guard("card snapshot", async () => {
        await snapshot(dest);
        card.querySelector(".ppt-thumb").src = cardFor(dest).img;
      }));
      const pick = () => new foundry.applications.apps.FilePicker.implementation({
        type: "image", current: dest.flags?.[MODULE]?.img ?? "", callback: setImg }).render(true);
      card.querySelector('[data-act="pick"]').addEventListener("click", pick);
      card.querySelector(".ppt-thumb").addEventListener("click", pick);
      card.querySelector('[data-act="clearimg"]')?.addEventListener("click", guard("card clear image", async () => {
        await dest.update({ [flagPath(MODULE, "img")]: _del });
        this.render();
      }));
      card.querySelector('[data-act="look"]').addEventListener("click", guard("card look", () => lookAt(dest)));
      card.querySelector('[data-act="unlink"]').addEventListener("click", guard("card unlink", async () => {
        await unlinkRegion(region, dest);
        this.render();
      }));
    }

    content.querySelector('[data-act="addsel"]')?.addEventListener("change", guard("card add destination", async ev => {
      const uuid = ev.target.value;
      if (!uuid) return;
      const dest = fromUuidSync(uuid);
      const twoWay = content.querySelector('[data-act="twoway"]')?.checked;
      await linkRegions(region, dest);
      if (twoWay) await linkRegions(dest, region);
      this.render();
    }));
  }

  /** The dnd5e-style edit toggle, top-left of the window header. */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    const header = frame.querySelector(".window-header");
    const toggle = document.createElement("label");
    toggle.className = "ppt-toggle";
    toggle.dataset.tooltip = "Toggle edit mode";
    toggle.innerHTML = `<input type="checkbox" ${this.edit ? "checked" : ""}><span class="ppt-slider"></span>`;
    toggle.querySelector("input").addEventListener("change", ev => {
      this.edit = ev.target.checked;
      deps.setEditing(this.region, this.edit); // edit on: drag the badge on the map to move this travel spot
      this.render();
    });
    header.prepend(toggle);
    return frame;
  }
}
