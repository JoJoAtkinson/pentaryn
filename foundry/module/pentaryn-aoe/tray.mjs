/**
 * Part B — the GM-only tray on a resolved damage message.
 *
 * One row per creature caught in the area: tick, name, save result, multiplier, the damage that
 * would land (actor.calculateDamage, so resistances show), and Apply. Players never get this
 * element; they see the usage card, their own request button and their own save rolls.
 * The system's own <damage-application> tray is left in place as a manual fallback; since the saves
 * resolve.mjs rolls are threaded under the usage card, its half-damage pill agrees with this tray.
 * dnd5e 6 damage card (damage-card.hbs): .message-content holds .chat-card, the roll's
 * section.icon-row, then <damage-application>; this tray goes right after the native one.
 */

import { aoeFlags, MULTIPLIERS, playerStatus } from "./core.mjs";
import { on, guard } from "./hooks.mjs";
import { setting } from "./settings.mjs";
import { applyRows, rollNpcSaves, rollForPlayer, pingPlayers, setRow, resolve } from "./resolve.mjs";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const t = (key, data) => (data ? game.i18n.format(`PENTARYN_AOE.${key}`, data) : game.i18n.localize(`PENTARYN_AOE.${key}`));
const MULT_LABEL = { 0: "×0", 0.25: "×¼", 0.5: "×½", 1: "×1", 2: "×2" };

function preview(row, res, message = null) {
  if (row.multiplier === null || row.multiplier === undefined) return "—";
  const actor = fromUuidSync(row.actor);
  if (!actor?.calculateDamage) return "—";
  const damages = res.damages.map(d => ({ ...d, properties: new Set(d.properties ?? []) }));
  // originatingMessage as Apply passes it (resolve.applyRows), so a damage-card rider such as
  // Elemental Adept's ignored resistance shows here too, not only once applied.
  const out = actor.calculateDamage(damages, { multiplier: row.multiplier, originatingMessage: message ?? undefined });
  return out ? String(Math.max(0, Math.floor(out.amount ?? 0))) : "—";
}

function saveCell(row) {
  if (row.protected) {
    return `<span class="pa-pass" data-tooltip="${esc(t("Careful.RowTip"))}"><i class="fa-solid fa-shield-halved" inert></i> ${esc(t("Careful.Row"))}</span>`;
  }
  if (!row.save) {
    return row.kind === "manual"
      ? `<span class="pa-wait" data-tooltip="${esc(t("Tray.WaitingTip"))}"><i class="fa-solid fa-hourglass-half" inert></i> ${esc(t("Tray.Waiting"))}</span>`
      : `<span class="pa-wait">—</span>`;
  }
  const cls = row.save.success ? "pa-pass" : "pa-fail";
  const icon = row.save.success ? "fa-check" : "fa-xmark";
  return `<span class="${cls}"><i class="fa-solid ${icon}" inert></i> ${esc(row.save.total)}</span>`;
}

function rowHTML(row, res, message = null) {
  const opts = MULTIPLIERS.map(m => `<option value="${m}" ${row.multiplier === m ? "selected" : ""}>${MULT_LABEL[m]}</option>`).join("");
  const blank = row.multiplier === null || row.multiplier === undefined ? `<option value="" selected>?</option>` : "";
  const locked = row.applied || res.superseded ? "disabled" : "";
  const extra = row.kind === "auto"
    ? `<a data-pa="reroll" data-row="${esc(row.id)}" data-tooltip="${esc(t("Tray.Reroll"))}"><i class="fa-solid fa-dice-d20" inert></i></a>`
    : `<a data-pa="rollfor" data-row="${esc(row.id)}" data-tooltip="${esc(t("Tray.RollFor"))}"><i class="fa-solid fa-user-shield" inert></i></a>`;
  const status = row.applied ? `<span class="pa-applied" data-tooltip="${esc(row.hp ? `${row.hp.before} → ${row.hp.after}` : "")}">${esc(t("Tray.Applied"))}</span>` : preview(row, res, message);
  return `<li class="pa-row ${row.applied ? "applied" : ""}" data-row="${esc(row.id)}">
    <input type="checkbox" data-pa="tick" ${row.apply ? "checked" : ""} ${locked}>
    <img src="${esc(row.img ?? "icons/svg/mystery-man.svg")}" alt="">
    <span class="pa-name" data-tooltip="${esc(row.kind === "manual" ? t("Tray.Manual") : t("Tray.Auto"))}">${esc(row.name)}${row.caster ? ` <em>(${esc(t("Tray.Caster"))})</em>` : ""}</span>
    <span class="pa-save">${saveCell(row)}</span>
    ${row.applied ? "" : extra}
    <select data-pa="mult" ${locked}>${blank}${opts}</select>
    <span class="pa-amount">${status}</span>
  </li>`;
}

export function trayHTML(res, message = null) {
  const ability = CONFIG.DND5E.abilities[res.ability]?.label ?? res.ability;
  const n = res.rows.filter(r => r.apply && !r.applied && r.multiplier !== null && r.multiplier !== undefined).length;
  const picker = (res.regions?.length ?? 0) > 1
    ? `<select data-pa="region">${res.regions.map(r => `<option value="${esc(r.id)}" ${r.id === res.region ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`
    : "";
  const body = res.rows.length
    ? `<ol class="pa-rows">${res.rows.map(r => rowHTML(r, res, message)).join("")}</ol>`
    : `<p class="pa-empty">${esc(t("Tray.Empty"))}</p>`;
  return `<div class="pa-head">
      <strong>${esc(t("Tray.Title", { ability, dc: res.dc ?? "?" }))}</strong>
      <span class="pa-src">${esc(res.region ? t("Tray.FromArea") : t("Tray.FromTargets"))}</span>${picker}
    </div>
    ${res.superseded ? `<p class="pa-superseded">${esc(t("Tray.Superseded"))}</p>` : ""}
    ${res.careful?.names?.length ? `<p class="pa-careful"><i class="fa-solid fa-shield-halved" inert></i> ${esc(t("Careful.Head", { names: res.careful.names.join(", ") }))}</p>` : ""}
    ${body}
    <div class="pa-buttons">
      <button type="button" data-pa="reroll-all" ${res.superseded ? "disabled" : ""}><i class="fa-solid fa-dice-d20" inert></i> ${esc(t("Tray.RerollAll"))}</button>
      <button type="button" data-pa="ping" ${res.superseded ? "disabled" : ""}><i class="fa-solid fa-bell" inert></i> ${esc(t("Tray.Ping"))}</button>
      <button type="button" data-pa="apply" ${n && !res.superseded ? "" : "disabled"}><i class="fa-solid fa-heart-crack" inert></i> ${esc(t("Tray.Apply", { n }))}</button>
    </div>`;
}

/**
 * Players: one status line under their own save-spell damage card (waiting / applied / re-rolled),
 * with no monster numbers; the GM's privately rolled monster saves are hidden instead of showing as
 * "Gamemaster privately rolled some dice" rows (usability Area 5 re-run, S2/S15/S16).
 */
function decoratePlayer(message, html) {
  if (!setting("playerStatus")) return;
  if (aoeFlags(message).npcSave && !message.isContentVisible) {
    html.hidden = true;   // dnd5e hides its own summarised cards the same way
    html.classList.add("pa-hidden-npc-save");
    return;
  }
  const status = playerStatus(aoeFlags(message).resolution);
  if (!status || !message.isAuthor) return;
  const host = html.querySelector(".message-content") ?? html;
  host.querySelector(".pa-status")?.remove();
  const p = document.createElement("p");
  p.className = `pa-status pa-status-${status}`;
  const icon = { waiting: "fa-hourglass-half", applied: "fa-check", superseded: "fa-rotate" }[status];
  p.innerHTML = `<i class="fa-solid ${icon}" inert></i> ${esc(t(`Status.${status}`))}`;
  host.append(p);
}

function decorate(message, html) {
  if (!game.user.isGM) return decoratePlayer(message, html);
  const res = aoeFlags(message).resolution;
  if (!res) return;
  const host = html.querySelector(".message-content") ?? html;
  host.querySelector(".pentaryn-aoe-tray")?.remove();
  const tray = document.createElement("section");
  tray.className = `pentaryn-aoe-tray${res.superseded ? " superseded" : ""}`;
  tray.innerHTML = trayHTML(res, message);
  const native = host.querySelector(":scope > damage-application");
  if (native) native.after(tray);
  else host.append(tray);

  tray.addEventListener("change", ev => {
    const el = ev.target;
    const rowId = el.closest("[data-row]")?.dataset.row;
    if (el.dataset.pa === "tick") setRow(message.id, rowId, { apply: el.checked });
    else if (el.dataset.pa === "mult" && el.value !== "") setRow(message.id, rowId, { multiplier: el.value });
    else if (el.dataset.pa === "region") resolve(message.id, { regionId: el.value });
  });
  tray.addEventListener("click", async ev => {
    const el = ev.target.closest("[data-pa]");
    if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
    ev.preventDefault();
    ev.stopPropagation();
    const rowId = el.dataset.row;
    switch (el.dataset.pa) {
      case "apply": el.disabled = true; return applyRows(message.id);
      case "reroll-all": return rollNpcSaves(message.id, { force: true });
      case "reroll": return rollNpcSaves(message.id, { rowIds: [rowId], force: true });
      case "rollfor": return rollForPlayer(message.id, rowId, { event: ev });
      case "ping": return pingPlayers(message.id);
    }
  });
}

export function installTray() {
  on("dnd5e.renderChatMessage", guard("renderChatMessage(tray)", decorate));
}


// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { preview, saveCell, rowHTML, decoratePlayer, decorate };
