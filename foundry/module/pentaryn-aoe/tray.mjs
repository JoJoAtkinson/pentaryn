/**
 * Part B — the GM-only tray on a resolved damage message.
 *
 * One row per creature caught in the area: tick, name, save result, multiplier, the damage that
 * would land (actor.calculateDamage, so resistances show), and Apply. Players never get this
 * element; they see the usage card, their own request button and their own save rolls.
 * The system's own <damage-application> tray is left in place as a manual fallback.
 */

import { aoeFlags, MULTIPLIERS } from "./core.mjs";
import { on, guard } from "./hooks.mjs";
import { applyRows, rollNpcSaves, rollForPlayer, pingPlayers, setRow, resolve } from "./resolve.mjs";

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const t = (key, data) => (data ? game.i18n.format(`PENTARYN_AOE.${key}`, data) : game.i18n.localize(`PENTARYN_AOE.${key}`));
const MULT_LABEL = { 0: "×0", 0.25: "×¼", 0.5: "×½", 1: "×1", 2: "×2" };

function preview(row, res) {
  if (row.multiplier === null || row.multiplier === undefined) return "—";
  const actor = fromUuidSync(row.actor);
  if (!actor?.calculateDamage) return "—";
  const damages = res.damages.map(d => ({ ...d, properties: new Set(d.properties ?? []) }));
  const out = actor.calculateDamage(damages, { multiplier: row.multiplier });
  return out ? String(Math.max(0, Math.floor(out.amount ?? 0))) : "—";
}

function saveCell(row) {
  if (!row.save) {
    return row.kind === "manual"
      ? `<span class="pa-wait" data-tooltip="${esc(t("Tray.WaitingTip"))}"><i class="fa-solid fa-hourglass-half" inert></i> ${esc(t("Tray.Waiting"))}</span>`
      : `<span class="pa-wait">—</span>`;
  }
  const cls = row.save.success ? "pa-pass" : "pa-fail";
  const icon = row.save.success ? "fa-check" : "fa-xmark";
  return `<span class="${cls}"><i class="fa-solid ${icon}" inert></i> ${esc(row.save.total)}</span>`;
}

function rowHTML(row, res) {
  const opts = MULTIPLIERS.map(m => `<option value="${m}" ${row.multiplier === m ? "selected" : ""}>${MULT_LABEL[m]}</option>`).join("");
  const blank = row.multiplier === null || row.multiplier === undefined ? `<option value="" selected>?</option>` : "";
  const locked = row.applied || res.superseded ? "disabled" : "";
  const extra = row.kind === "auto"
    ? `<a data-pa="reroll" data-row="${esc(row.id)}" data-tooltip="${esc(t("Tray.Reroll"))}"><i class="fa-solid fa-dice-d20" inert></i></a>`
    : `<a data-pa="rollfor" data-row="${esc(row.id)}" data-tooltip="${esc(t("Tray.RollFor"))}"><i class="fa-solid fa-user-shield" inert></i></a>`;
  const status = row.applied ? `<span class="pa-applied" data-tooltip="${esc(row.hp ? `${row.hp.before} → ${row.hp.after}` : "")}">${esc(t("Tray.Applied"))}</span>` : preview(row, res);
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

export function trayHTML(res) {
  const ability = CONFIG.DND5E.abilities[res.ability]?.label ?? res.ability;
  const n = res.rows.filter(r => r.apply && !r.applied && r.multiplier !== null && r.multiplier !== undefined).length;
  const picker = (res.regions?.length ?? 0) > 1
    ? `<select data-pa="region">${res.regions.map(r => `<option value="${esc(r.id)}" ${r.id === res.region ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`
    : "";
  const body = res.rows.length
    ? `<ol class="pa-rows">${res.rows.map(r => rowHTML(r, res)).join("")}</ol>`
    : `<p class="pa-empty">${esc(t("Tray.Empty"))}</p>`;
  return `<div class="pa-head">
      <strong>${esc(t("Tray.Title", { ability, dc: res.dc ?? "?" }))}</strong>
      <span class="pa-src">${esc(res.region ? t("Tray.FromArea") : t("Tray.FromTargets"))}</span>${picker}
    </div>
    ${res.superseded ? `<p class="pa-superseded">${esc(t("Tray.Superseded"))}</p>` : ""}
    ${body}
    <div class="pa-buttons">
      <button type="button" data-pa="reroll-all" ${res.superseded ? "disabled" : ""}><i class="fa-solid fa-dice-d20" inert></i> ${esc(t("Tray.RerollAll"))}</button>
      <button type="button" data-pa="ping" ${res.superseded ? "disabled" : ""}><i class="fa-solid fa-bell" inert></i> ${esc(t("Tray.Ping"))}</button>
      <button type="button" data-pa="apply" ${n && !res.superseded ? "" : "disabled"}><i class="fa-solid fa-heart-crack" inert></i> ${esc(t("Tray.Apply", { n }))}</button>
    </div>`;
}

function decorate(message, html) {
  if (!game.user.isGM) return;
  const res = aoeFlags(message).resolution;
  if (!res) return;
  const host = html.querySelector(".message-content") ?? html;
  host.querySelector(".pentaryn-aoe-tray")?.remove();
  const tray = document.createElement("section");
  tray.className = `pentaryn-aoe-tray${res.superseded ? " superseded" : ""}`;
  tray.innerHTML = trayHTML(res);
  host.append(tray);

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

