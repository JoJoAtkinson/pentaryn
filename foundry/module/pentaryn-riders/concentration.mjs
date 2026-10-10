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
 * Setting: pentaryn-riders.concentrationSummons (world, default on) turns part 1 off.
 */

import { MOD, SUMMON_FLAG, concentrationEffectFor, summonTokenIds } from "./table-core.mjs";

function enabled() {
  try { return game.settings.get(MOD, "concentrationSummons") !== false; } catch { return false; }
}

Hooks.once("init", () => {
  game.settings.register(MOD, "concentrationSummons", {
    name: "PENTARYN_RIDERS.settings.concentrationSummons.name",
    hint: "PENTARYN_RIDERS.settings.concentrationSummons.hint",
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
    foundry.utils.setProperty(tokenData, `flags.${MOD}.${SUMMON_FLAG}`, effect.uuid);
  } catch (err) { console.warn(`${MOD} | concentration summon stamp skipped`, err); }
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
      console.info(`${MOD} | concentration on ${effect.name} ended: removing ${ids.length} summon token(s) from ${scene.name}`);
      scene.deleteEmbeddedDocuments("Token", ids).catch(err => console.warn(`${MOD} | summon cleanup failed`, err));
    }
  } catch (err) { console.warn(`${MOD} | concentration summon cleanup skipped`, err); }
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
  } catch (err) { console.warn(`${MOD} | break-concentration label skipped`, err); }
});
