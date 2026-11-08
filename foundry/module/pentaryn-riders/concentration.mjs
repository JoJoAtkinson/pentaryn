/**
 * Concentration summons leave with the concentration; the break button says what it does.
 * =========================================================================================
 *
 * FEATURE: install(reg, ctx) / uninstall(). Pure helpers in table-core.mjs (`node test/table.mjs`);
 * the actor reads in shapes.mjs.
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
 *      Two tabs on that user's account both qualify: per scene, the kit's claimDocument on the
 *      first stamped token elects one tab to delete (riders-async-3).
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
 *    card broken, as the button does. Two tabs on the roller's account (the MCP bridge plus a GM
 *    browser tab) both see the message: the kit's claimMessage elects one, so it ends once. Kept as a button (nothing ends) when the creature can still
 *    turn the failure around after the roll: an NPC with Legendary Resistance left, or a feature
 *    such as Indomitable, a Mind Sharpener or Bardic Inspiration (table-core AFTER_FAIL_FEATURES).
 *    The card gets one line: "DC 10 · Failed: concentration ended" / "DC 10 · Success".
 *    Setting pentaryn-riders.concentrationAutoBreak (world, default on). Row
 *    dnd5e-concentration-auto-break.
 *
 * 4. A summon that drops to 0 HP ends the concentration that keeps it (TwPCoB, triage E1). The 2024
 *    summon spells say the spirit disappears when it drops to 0 HP or the spell ends; nothing watched
 *    the summon, so the Elemental Spirit lay there (and dropbin made it a corpse). On `updateActor`
 *    (hp.value → 0, never deleteToken: portals and pins delete tokens on scene moves) the active GM
 *    (with no GM online, the user who made the change) resolves each stamped token's effect with
 *    `fromUuid`, claims the token (two tabs on that account, riders-async-3's pattern) and calls
 *    `caster.endConcentration(effect)`; part 1b then removes the token(s). One whispered line to the
 *    caster's owners and the GMs: "<Caster>'s <Summon> fell; concentration on <Spell> ends." Once per
 *    fall: a second hit at 0 is not a fall (dnd5e's `options.dnd5e.hp` carries the old value), a
 *    token already being handled is skipped, and an effect that is gone ends nothing. Every
 *    dnd5e-summoned token skips dropbin's corpse (pentaryn-dropbin, `flags.dnd5e.summon`).
 *
 * Setting: pentaryn-riders.concentrationSummons (world, default on) turns parts 1 and 4 off.
 */

import {
  MODULE, SUMMON_FLAG, concentrationEffectFor, summonTokenIds, concentrationResult, isConcentration, summonStampOf,
  droppedToZero, concentrationSpellName,
} from "./table-core.mjs";
import { settingOr } from "./settings.mjs";
import { featureKeys } from "./shapes.mjs";
import { claimDocument, claimMessage } from "./lib/election.mjs";

const enabled = () => settingOr("concentrationSummons", false);

let log = null;

/* ── 1a. stamp a concentration summon ─────────────────────────────────── */

function stampSummon(activity, profile, tokenData) {
  try {
    if (!enabled() || !tokenData) return;
    const actor = activity?.actor ?? activity?.item?.actor;
    const status = CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating";
    const effect = concentrationEffectFor(actor?.effects ?? [], activity?.item?.id, status);
    if (!effect?.uuid) return;
    foundry.utils.setProperty(tokenData, `flags.${MODULE}.${SUMMON_FLAG}`, effect.uuid);
  } catch (err) { log.warn("concentration summon stamp skipped", err); }
}

/* ── 1b. concentration ends → its summons go ──────────────────────────── */

function cleanupSummons(effect, options, userId) {
  try {
    if (!enabled() || effect?.parent?.documentName !== "Actor") return;
    const gm = game.users.activeGM;
    if (gm ? !gm.isSelf : userId !== game.user.id) return;
    const uuid = effect.uuid;
    // Only a concentration effect keeps summons: return before scanning every scene (combat-riders-23).
    if (!isConcentration(effect, CONFIG.specialStatusEffects?.CONCENTRATING ?? "concentrating")) return;
    for (const scene of game.scenes) {
      const ids = summonTokenIds(scene.tokens, uuid).filter(id => scene.tokens.get(id)?.canUserModify(game.user, "delete"));
      if (!ids.length) continue;
      removeSummons(scene, ids, effect.name).catch(err => log.warn("summon cleanup failed", err));
    }
  } catch (err) { log.warn("concentration summon cleanup skipped", err); }
}

// Two tabs on the active GM's account (the MCP bridge tab and a GM browser tab) both pass the gate
// above: one wins the scene's first stamped token, and only it deletes (riders-async-3). The claim
// stamp goes with the token.
async function removeSummons(scene, ids, name) {
  if (!await claimDocument(scene.tokens.get(ids[0]), "summonCleanup", { scope: MODULE })) return;
  log.info(`concentration on ${name} ended: removing ${ids.length} summon token(s) from ${scene.name}`);
  await scene.deleteEmbeddedDocuments("Token", ids);
}

/* ── 2. label the break button ────────────────────────────────────────── */

function labelBreakButton(message, html) {
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
  } catch (err) { log.warn("break-concentration label skipped", err); }
}

/* ── 3. a failed concentration save ends it; the card says DC and result ── */

const autoBreakOn = () => settingOr("concentrationAutoBreak", false);

const isConcSave = m => m?.type === "save" && m.system?.type === "concentration";

function resultOf(message) {
  const roll = message.rolls?.[0];
  const actor = message.getAssociatedActor?.();
  let canBreak = false, canResist = false;
  try {
    canBreak = !!message.system.canBreakConcentration;
    canResist = !!message.system.canResist;
  } catch (err) { log.debug("concentration save card unreadable (an old card?): not auto-broken", err); }
  return concentrationResult({
    total: roll?.total ?? null, dc: roll?.options?.target ?? null, canBreak, canResist,
    features: featureKeys(actor), auto: autoBreakOn()
  });
}

// async on a non-vetoable hook: Foundry ignores the promise, as before (the catch below ends it).
async function autoBreak(message, options, userId) {
  try {
    if (userId !== game.user.id || !isConcSave(message)) return;
    const res = resultOf(message);
    if (!res.autoBreak) return;
    const actor = message.getAssociatedActor?.();
    if (!actor?.isOwner) return;
    // Two tabs on the roller's account both pass the gate above: one wins the card (riders-async-1).
    if (!await claimMessage(message, "autoBreak", { scope: MODULE })) return;
    const ended = await actor.endConcentration();
    if (ended?.length) await message.update({ "system.outcome": "broken" });
  } catch (err) { log.warn("concentration auto-break skipped", err); }
}

function resultLine(message, html) {
  try {
    if (!isConcSave(message) || !message.isContentVisible) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".pr-conc-result")) return;
    const roll = message.rolls?.[0];
    // {dc, failed} as concentrationResult reads them (an unevaluated total reads NaN: not failed)
    const { dc, failed: res } = concentrationResult({ total: Number(roll?.total), dc: roll?.options?.target ?? null });
    if (dc === null) return;
    const failed = !!res;
    const broken = message.system?.outcome === "broken";
    const p = document.createElement("p");
    p.className = `pr-conc-result ${failed ? "failure" : "success"}`;
    const key = failed
      ? (broken ? "PENTARYN_RIDERS.concentration.failedEnded" : "PENTARYN_RIDERS.concentration.failed")
      : "PENTARYN_RIDERS.concentration.success";
    p.textContent = _loc(key, { dc });
    const at = root.querySelector(".dice-roll") ?? root.querySelector(".message-content");
    if (at?.classList?.contains("dice-roll")) at.after(p); else (at ?? root).append(p);
  } catch (err) { log.warn("concentration result line skipped", err); }
}

/* ── 4. a summon at 0 HP ends the concentration that keeps it ─────────── */

/** Token uuids whose fall is being handled in this tab (pruned when done, on deleteToken, at uninstall). */
const falling = new Set();

/** The actor's tokens on every scene (a synthetic actor: its one token). */
function tokensOf(actor) {
  if (actor?.isToken) return actor.token ? [actor.token] : [];
  return actor?.getDependentTokens?.({ concreteOnly: true }) ?? [];
}

function summonFell(actor, changes, options, userId) {
  try {
    if (!enabled() || !foundry.utils.hasProperty(changes, "system.attributes.hp.value")) return;
    const gm = game.users.activeGM;
    if (gm ? !gm.isSelf : userId !== game.user.id) return;
    const after = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    if (!droppedToZero({ before: options?.dnd5e?.hp?.value ?? null, after })) return;
    for (const token of tokensOf(actor)) {
      const uuid = summonStampOf(token);
      if (!uuid || falling.has(token.uuid)) continue;
      falling.add(token.uuid);
      endForFallen(actor, token, uuid)
        .catch(err => log.warn("summon fell: concentration not ended", err))
        .finally(() => falling.delete(token.uuid));
    }
  } catch (err) { log.warn("summon fell check skipped", err); }
}

// Two tabs on the active GM's account both pass the gate above: the claim on the fallen token elects one.
// An effect that is already gone (ended meanwhile, or this fall handled by the other tab) ends nothing.
async function endForFallen(summon, token, uuid) {
  const effect = await fromUuid(uuid);
  const caster = effect?.parent;
  if (!effect || caster?.documentName !== "Actor") return;
  if (!await claimDocument(token, "summonFell", { scope: MODULE })) return;
  const ended = await caster.endConcentration(effect);
  if (!ended?.length) return;
  log.info("summon fell: concentration ended", { uuid, token: token.uuid, by: game.user.id });
  const spell = concentrationSpellName({ itemFlag: effect.flags?.dnd5e?.item ?? null, items: caster.items, effectName: effect.name });
  const text = _loc("PENTARYN_RIDERS.concentration.summonFell", { caster: caster.name, summon: token.name ?? summon.name, spell });
  const whisper = game.users.filter(u => u.isGM || caster.testUserPermission(u, "OWNER")).map(u => u.id);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: caster }),
    whisper,
    content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
  });
}

function forgetFallen(token) {
  falling.delete(token?.uuid);
}

/* ── wiring ───────────────────────────────────────────────────────────── */

export function install(reg, ctx) {
  log = ctx.log;
  // Today's order; every handler has its own try/catch, so the kit guard is off (guard: false).
  reg.on("dnd5e.summonToken", stampSummon, { guard: false, label: "concentration summon stamp" });
  reg.on("deleteActiveEffect", cleanupSummons, { guard: false, label: "concentration summon cleanup" });
  reg.on("dnd5e.renderChatMessage", labelBreakButton, { guard: false, label: "break-concentration label" });
  reg.on("createChatMessage", autoBreak, { guard: false, label: "concentration auto-break" });
  reg.on("dnd5e.renderChatMessage", resultLine, { guard: false, label: "concentration result line" });
  reg.on("updateActor", summonFell, { guard: false, label: "concentration summon fell" });
  reg.on("deleteToken", forgetFallen, { guard: false, label: "concentration summon fell prune" });
}

/** The summon stamps live on the tokens; only the in-flight set is cleared. */
export function uninstall() {
  falling.clear();
}
