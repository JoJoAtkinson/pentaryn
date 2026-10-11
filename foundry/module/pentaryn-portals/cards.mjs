/**
 * Pentaryn Portal Cards — FEATURE: destination cards in core's teleport dialog, Teleport as its
 * default answer, and the GM's "Portal card" fieldset in the Region config.
 *
 * Foundry v14's Teleport Token behavior (core, no module) asks before it moves a token when
 * `choice` is on — but the question is a bare sentence, and with several destinations it is a
 * `<select>` of region names. This replaces the *content* of that dialog with a card per
 * destination. Nothing about the teleport itself is touched — the dialog's own Yes/No buttons and
 * its callback still decide, and the multi-destination case still submits a form field called
 * `destination`; it is just radio cards now instead of a select.
 *
 * ⚠ Respects `revealed: false`. The core dialog hides the destination from players then ("you feel
 * a pull"), and so does this — a hidden destination never gets a card on a player's screen.
 */

import { MODULE, cardHTML, dialogIdParts, esc } from "./portals-core.mjs";
import { behaviorOf, cardFor, snapshot } from "./scene-adapter.mjs";
import { setting } from "./settings.mjs";

export function decorate(app, element) {
  const behavior = behaviorOf(app);
  if (!behavior) return;
  const sys = behavior.system;
  if (!sys.revealed && !game.user.isGM) return; // keep an unrevealed destination secret
  const root = element instanceof HTMLElement ? element : element?.[0];
  const content = root?.querySelector(".dialog-content");
  if (!content || content.querySelector(".pp-cards")) return;

  const dests = [...(sys.destinations ?? [])].map(u => fromUuidSync(u, { relative: behavior })).filter(Boolean).map(cardFor);
  if (!dests.length) return;

  const wrap = document.createElement("div");
  wrap.className = "pp-cards";
  const select = content.querySelector('select[name="destination"]');
  if (select) {
    // Several exits: radio cards submit the same field name the core callback reads.
    const current = select.value;
    wrap.innerHTML = dests.map(c => cardHTML(c, { radio: true, checked: c.uuid === current })).join("");
    select.replaceWith(wrap);
  } else {
    wrap.innerHTML = cardHTML(dests[0]);
    content.append(wrap);
    plainQuestion(app, behavior, content, dests[0]);
  }
  root.classList.add("pentaryn-portal-dialog");
  app.setPosition?.({ width: Math.max(app.position?.width ?? 0, 460), height: "auto" });
}

/**
 * Core asks "Teleport ZZ Fighter 5 to Passage → Drow Prison in Drow City — Fighting Pit
 * (set-piece)?": the region's GM name and the scene's full name. With the card right below, say
 * "Teleport ZZ Fighter 5 to The Fighting Pit?" using the card's title (usability Area 8, L6).
 * A GM-written custom question (the behavior's dialog text) is left alone.
 */
export function plainQuestion(app, behavior, content, card) {
  if (behavior.system?.dialog?.revealed) return;
  const p = content.querySelector(":scope > p");
  if (!p) return;
  const tokenId = dialogIdParts(app?.id ?? "")?.tokenId;
  const token = behavior.parent?.parent?.tokens?.get(tokenId);
  const who = token?.name;
  p.textContent = who ? `Teleport ${who} to ${card.title}?` : `Teleport to ${card.title}?`;
}

/**
 * The teleport question opens on Teleport, not Don't Teleport (usability Area 6 re-run, W7). Core's
 * DialogV2.confirm makes "no" the default (autofocus, Enter); a player who walked onto a portal
 * meant to use it. Esc and the X still decline. Setting teleportDefault.
 */
export function preferTeleport(app, element) {
  if (!setting("teleportDefault") || !behaviorOf(app)) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const yes = root?.querySelector('button[data-action="yes"]');
  if (!yes || yes.disabled) return;
  root.querySelector('button[data-action="no"]')?.removeAttribute("autofocus");
  yes.setAttribute("autofocus", "");
  requestAnimationFrame(() => { if (yes.isConnected && !yes.disabled) yes.focus(); });
}

/* GM authoring on the Region config (Appearance tab, "Portal card" section). */
export function injectConfig(app, element) {
  if (!game.user.isGM) return;
  const region = app.document;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const tab = root?.querySelector("section.tab.region-appearance, section.tab[data-tab='appearance']");
  if (!tab || tab.querySelector(".pp-config")) return;
  const f = region.flags?.[MODULE] ?? {};
  const card = cardFor(region);
  const fs = document.createElement("fieldset");
  fs.className = "pp-config";
  fs.innerHTML = `
    <legend>Portal card</legend>
    <p class="hint">Shown to a player choosing to travel <em>here</em> from a linked teleport region.</p>
    <div class="form-group"><label>Title</label>
      <div class="form-fields"><input type="text" name="flags.${MODULE}.title" value="${esc(f.title ?? "")}" placeholder="${esc(card.title)}"></div></div>
    <div class="form-group"><label>Image</label>
      <div class="form-fields"><input type="text" name="flags.${MODULE}.img" value="${esc(f.img ?? "")}" placeholder="scene thumbnail">
      <button type="button" class="pp-snap" data-tooltip="Crop the map art around this region and use it"><i class="fa-solid fa-camera"></i></button></div></div>
    <div class="form-group stacked"><label>Description</label>
      <textarea name="flags.${MODULE}.description" rows="4" placeholder="What players read before they choose.">${esc(f.description ?? "")}</textarea></div>
    <div class="pp-preview">${cardHTML(card)}</div>`;
  tab.append(fs);
  fs.querySelector(".pp-snap").addEventListener("click", async ev => {
    ev.preventDefault();
    const path = await snapshot(region);
    if (path) {
      fs.querySelector(`input[name="flags.${MODULE}.img"]`).value = region.flags?.[MODULE]?.img ?? path;
      fs.querySelector(".pp-preview").innerHTML = cardHTML(cardFor(region));
    }
  });
  app.setPosition?.({ height: "auto" });
}

function onRenderDialog(app, element) {
  try { decorate(app, element); } catch (err) { console.warn(`${MODULE} | dialog decoration skipped`, err); }
  try { preferTeleport(app, element); } catch (err) { console.warn(`${MODULE} | dialog focus skipped`, err); }
}

function onRenderRegionConfig(app, element) {
  try { injectConfig(app, element); } catch (err) { console.warn(`${MODULE} | config injection skipped`, err); }
}

export function install(reg) {
  reg.on("renderDialogV2", onRenderDialog, { guard: false, label: "teleport dialog cards" });
  reg.on("renderRegionConfig", onRenderRegionConfig, { guard: false, label: "region config card" });
}

export function uninstall() {}
