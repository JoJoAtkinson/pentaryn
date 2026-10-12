/**
 * Concentration summons leave with the concentration; the break button says what it does.
 * =========================================================================================
 *
 * Imported by riders.mjs (not a module.json esmodule, so no Foundry restart was needed to ship it).
 * Pure helpers in table-core.mjs (`node test/table.mjs`).
 *
 * 1. Summon cleanup. dnd5e 6.0.6 removes an enchantment or an applied effect when concentration
 *    ends (flags.dnd5e.dependents), but never a summoned TOKEN: Flaming Sphere, Summon Dragon,
 *    Spiritual Weapon... stay on the map after the caster drops or loses concentration.
 *    - `dnd5e.summonToken` fires on the summoner's client after dnd5e has created the
 *      concentration effect for this cast (activity mixin: beginConcentrating, then the usage
 *      message, then _finalizeUsage places the summons). We stamp the token data with that
 *      effect's uuid: flags.pentaryn-riders.concentration. A summon with no concentration (Find
 *      Familiar) gets no stamp and is never touched.
 *    - `deleteActiveEffect`: when an effect is deleted, the active GM (or, with no GM online, the
 *      user who deleted it) deletes every token on every scene stamped with that effect's uuid.
 *      The world actor dnd5e made for the summon ("<PC> - summons & forms") is kept on purpose:
 *      dnd5e reuses it on the next cast.
 *    A re-cast is safe: the new effect has a new uuid, and dnd5e ends the old one after creating
 *    the new one, so only the old cast's tokens go.
 *
 * 2. "Lost Concentration" card: dnd5e draws the break button as an unlabelled icon (fa-ban) in
 *    the card's icon row. We add its text, "Break Concentration", next to the icon.
 *
 * 3. A failed concentration save ends the concentration (usability Area 6 re-run, W9). dnd5e 6
 *    posts the save card with a Break Concentration button and ends nothing; the result showed a
 *    bare total with no DC and no pass or fail. On the roller's client, when dnd5e's own
 *    `canBreakConcentration` says the save failed, we call `actor.endConcentration()` and mark the
 *    card broken, as the button does. Kept as a button (nothing ends) when the creature can still
 *    turn the failure around after the roll: an NPC with Legendary Resistance left, or a feature
 *    such as Indomitable, a Mind Sharpener or Bardic Inspiration (table-core AFTER_FAIL_FEATURES).
 *    The card gets one line: "DC 10 · Failed: concentration ended" / "DC 10 · Success".
 *    Setting pentaryn-riders.concentrationAutoBreak (world, default on). Row
 *    dnd5e-concentration-auto-break.
 *
 * Setting: pentaryn-riders.concentrationSummons (world, default on) turns part 1 off.
 */

import { MODULE, SUMMON_FLAG, concentrationEffectFor, summonTokenIds, concentrationResult } from "./table-core.mjs";

function enabled() {
  try { return game.settings.get(MODULE, "concentrationSummons") !== false; } catch { return false; }
}

Hooks.once("init", () => {
  game.settings.register(MODULE, "concentrationSummons", {
    name: "PENTARYN_RIDERS.settings.concentrationSummons.name",
    hint: "PENTARYN_RIDERS.settings.concentrationSummons.hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE, "concentrationAutoBreak", {
    name: "PENTARYN_RIDERS.settings.concentrationAutoBreak.name",
    hint: "PENTARYN_RIDERS.settings.concentrationAutoBreak.hint",
    scope: "world", config: true, type: Boolean, default: true
  });
});

/* ── 1a. stamp a concentration summon ─────────────────────────────────── */

Hooks.on("dnd5e.summonToken", (activity, profile, tokenData) => {
  try {
    if (!enabled() || !tokenData) return;
    const actor = activity?.actor ?? activity?.item?.actor;
    const status = CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating";
    const effect = concentrationEffectFor(actor?.effects ?? [], activity?.item?.id, status);
    if (!effect?.uuid) return;
    foundry.utils.setProperty(tokenData, `flags.${MODULE}.${SUMMON_FLAG}`, effect.uuid);
  } catch (err) { console.warn(`${MODULE} | concentration summon stamp skipped`, err); }
});

/* ── 1b. concentration ends → its summons go ──────────────────────────── */

Hooks.on("deleteActiveEffect", (effect, options, userId) => {
  try {
    if (!enabled() || effect?.parent?.documentName !== "Actor") return;
    const gm = game.users.activeGM;
    if (gm ? !gm.isSelf : userId !== game.user.id) return;
    const uuid = effect.uuid;
    for (const scene of game.scenes) {
      const ids = summonTokenIds(scene.tokens, uuid).filter(id => scene.tokens.get(id)?.canUserModify(game.user, "delete"));
      if (!ids.length) continue;
      console.info(`${MODULE} | concentration on ${effect.name} ended: removing ${ids.length} summon token(s) from ${scene.name}`);
      scene.deleteEmbeddedDocuments("Token", ids).catch(err => console.warn(`${MODULE} | summon cleanup failed`, err));
    }
  } catch (err) { console.warn(`${MODULE} | concentration summon cleanup skipped`, err); }
});

/* ── 2. label the break button ────────────────────────────────────────── */

Hooks.on("dnd5e.renderChatMessage", (message, html) => {
  try {
    const root = html instanceof HTMLElement ? html : html?.[0];
    for (const btn of root?.querySelectorAll?.('button[data-action="breakConcentration"]') ?? []) {
      if (btn.querySelector(".pr-btn-label")) continue;
      const span = document.createElement("span");
      span.className = "pr-btn-label";
      span.textContent = game.i18n.localize("DND5E.CONCENTRATION.Action.Break");
      btn.append(span);
      btn.classList.add("pr-labelled");
    }
  } catch (err) { console.warn(`${MODULE} | break-concentration label skipped`, err); }
});

/* ── 3. a failed concentration save ends it; the card says DC and result ── */

function autoBreakOn() {
  try { return game.settings.get(MODULE, "concentrationAutoBreak") !== false; } catch { return false; }
}

const isConcSave = m => m?.type === "save" && m.system?.type === "concentration";

/** The actor's feature identifiers and effect names, lowercased (for AFTER_FAIL_FEATURES). */
function featureKeys(actor) {
  const out = [];
  for (const i of actor?.items ?? []) out.push(String(i.system?.identifier || i.name || "").toLowerCase());
  for (const e of actor?.appliedEffects ?? actor?.effects ?? []) out.push(String(e.name ?? "").toLowerCase().replace(/\s+/g, "-"));
  return out;
}

function resultOf(message) {
  const roll = message.rolls?.[0];
  const actor = message.getAssociatedActor?.();
  let canBreak = false, canResist = false;
  try { canBreak = !!message.system.canBreakConcentration; canResist = !!message.system.canResist; } catch { /* old card */ }
  return concentrationResult({
    total: roll?.total ?? null, dc: roll?.options?.target ?? null, canBreak, canResist,
    features: featureKeys(actor), auto: autoBreakOn()
  });
}

Hooks.on("createChatMessage", async (message, options, userId) => {
  try {
    if (userId !== game.user.id || !isConcSave(message)) return;
    const res = resultOf(message);
    if (!res.autoBreak) return;
    const actor = message.getAssociatedActor?.();
    if (!actor?.isOwner) return;
    const ended = await actor.endConcentration();
    if (ended?.length) await message.update({ "system.outcome": "broken" });
  } catch (err) { console.warn(`${MODULE} | concentration auto-break skipped`, err); }
});

Hooks.on("dnd5e.renderChatMessage", (message, html) => {
  try {
    if (!isConcSave(message) || !message.isContentVisible) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".pr-conc-result")) return;
    const roll = message.rolls?.[0];
    const dc = roll?.options?.target;
    if (!Number.isFinite(Number(dc)) || dc === null) return;
    const failed = Number(roll.total) < Number(dc);
    const broken = message.system?.outcome === "broken";
    const key = failed ? (broken ? "failedEnded" : "failed") : "success";
    const p = document.createElement("p");
    p.className = `pr-conc-result ${failed ? "failure" : "success"}`;
    p.textContent = game.i18n.format(`PENTARYN_RIDERS.concentration.${key}`, { dc: Number(dc) });
    const at = root.querySelector(".dice-roll") ?? root.querySelector(".message-content");
    if (at?.classList?.contains("dice-roll")) at.after(p); else (at ?? root).append(p);
  } catch (err) { console.warn(`${MODULE} | concentration result line skipped`, err); }
});
