/**
 * The player side: the study dialog and the requests a player's client sends (kind, lore, attribute
 * lore), and the lore state a sheet draws.
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import { attributeIdsOf, attributeLore, describeAttribute } from "../attributes.mjs";
import { MODULE, mayWrite } from "../ties-api.mjs";
import { attrFactKey, LORE_FLAG, loreFactKey, loreOfferable, rollableLore } from "../known-core.mjs";
import { applyStudy } from "./apply.mjs";
import { kindActorOf, studiedOf, studyStateFor } from "./resolve.mjs";
import { CHANNEL, esc, f, SITUATIONAL_MAX, SITUATIONAL_MIN, STUDY, t } from "./shared.mjs";
import { readFlag } from "../lib/flags.mjs";

/* -------------------------------------------- */
/*  Player side                                 */
/* -------------------------------------------- */

/**
 * The module's own two-control dialog.
 *
 * ⚠ **dnd5e's own configuration dialog cannot be used here**, and the plan's decision 11 step
 * 2 ("the dnd5e dialog runs on the player's client") cannot be built as written: that dialog
 * is coupled to the roll pipeline it configures, and there is no supported way to run it
 * detached on a client that is not going to roll. Two controls is also the entire payload
 * contract — advantage mode and a situational bonus — so nothing is lost but the borrowed
 * furniture.
 */
async function studyDialog(kindName) {
  const modes = [
    ["normal", "known.study.mode.normal"],
    ["advantage", "known.study.mode.advantage"],
    ["disadvantage", "known.study.mode.disadvantage"]
  ]
    .map(
      ([value, key], i) =>
        `<label class="pt-study-mode"><input type="radio" name="mode" value="${value}"${
          i === 0 ? " checked" : ""
        }/> ${esc(t(key))}</label>`
    )
    .join("");

  return foundry.applications.api.DialogV2.prompt({
    window: { title: f("known.study.dialogTitle", { name: kindName }) },
    classes: ["pentaryn-tie-dialog"],
    content: `<div class="pt-study-dialog">
      <p class="pt-study-hint">${esc(t("known.study.dialogHint"))}</p>
      <div class="pt-study-modes">${modes}</div>
      <label class="pt-field">
        <span class="pt-field-label">${esc(t("known.study.situational"))}</span>
        <input type="number" name="situational" value="0" step="1"
               min="${SITUATIONAL_MIN}" max="${SITUATIONAL_MAX}" />
      </label>
    </div>`,
    ok: {
      label: t("known.study.roll"),
      callback: (event, button) => ({
        mode: button.form.elements.mode.value,
        situational: Number(button.form.elements.situational.value) || 0
      })
    },
    rejectClose: false
  });
}

/**
 * Ask a GM's client to study this creature's kind for this character.
 *
 * Returns `false` for every refusal — none of which is a spent roll. The one-roll lock only
 * ever engages on the GM's client, on a roll that actually evaluated.
 */
export async function requestStudy(character, subject) {
  const state = studyStateFor(character, subject);
  if (!state.available) {
    ui.notifications.warn(t(state.spent ? "known.study.notify.spent" : "known.study.notify.noContent"));
    return false;
  }
  return requestFact(character, subject, { ns: "kind" }, state.kind.name);
}

/**
 * Ask for one GM-authored fact about this individual — phase 4's player gesture.
 *
 * The affordance the player clicked already told them the row exists, its skill and its DC
 * (decision 8: *that a secret exists is the invitation*), so there is nothing here to hide.
 * What stays hidden is everything past the click: the total, the pass, and the text of both
 * the hit and the miss.
 */
export async function requestLore(character, subject, loreId) {
  const rows = loreStateFor(character, subject);
  const row = rows.find(r => r.id === loreId);
  if (!row) return false;
  if (!row.available) {
    ui.notifications.warn(t("known.lore.notify.spent"));
    return false;
  }
  return requestFact(character, subject, { ns: "lore", factId: loreId }, row.label);
}

/**
 * Ask for one fact the *group* knows — phase 6's player gesture.
 *
 * `subject` is the creature in front of them, not the attribute: reach is "can this player see
 * who they are asking about", and an attribute has no tokens. Studying the guild through a
 * guildsman standing there is the gesture, and it is also why the same guild fact can be
 * learned from any member.
 */
export async function requestAttrLore(character, subject, attrId, loreId) {
  const rows = attrLoreStateFor(character, subject, attrId);
  const row = rows.find(r => r.id === loreId);
  if (!row) return false;
  if (!row.available) {
    ui.notifications.warn(t("known.lore.notify.spent"));
    return false;
  }
  return requestFact(character, subject, { ns: "attr", attrId, factId: loreId }, row.label);
}

/**
 * One attribute's rows, as the player's sheet needs them.
 *
 * ⚠ The lock is on the **attribute fact**, not on this creature. Learning the guild's secret
 * from one rogue means you know it, so the row is spent on every other rogue too — which is
 * the entire point of putting the fact on the group, and the reason the grant is a sibling
 * map joined at render rather than a field on one page.
 */
export function attrLoreStateFor(character, subject, attrId) {
  if (!subject || !attrId) return [];
  const spent = studiedOf(character).lore;
  // `loreOfferable`, not `loreRollable`: a failure hands over nothing, so a row with no pass text
  // would spend the attempt on a guaranteed nothing — never draw it as a button
  return rollableLore(attributeLore(attrId)).filter(loreOfferable).map(row => {
    const key = attrFactKey(attrId, row.id);
    return {
      id: row.id,
      attrId,
      label: row.label,
      dc: row.dc,
      skill: row.skill,
      skillLabel: CONFIG.DND5E?.skills?.[row.skill]?.label ?? row.skill,
      spent: !!spent[key],
      available: !spent[key],
      gmOnline: !!game.users?.activeGM
    };
  });
}

/** Every attribute fact on offer for this pair, grouped by attribute — the sheet's list. */
export function attrOffersFor(character, subject) {
  const out = [];
  for (const id of attributeIdsOf(subject, kindActorOf)) {
    const rows = attrLoreStateFor(character, subject, id);
    if (!rows.length) continue;
    const entry = describeAttribute(id);
    out.push({ id, title: entry.title, icon: entry.icon, rows });
  }
  return out;
}

/**
 * The shared preamble — every check this module makes passes through here.
 *
 * Deliberately one function rather than one per namespace: the kill switch, the ownership
 * test, the no-GM refusal and the combat warning are policy, and policy that is copied is
 * policy that drifts. The only per-namespace part is which name goes in the dialog.
 */
async function requestFact(character, subject, spec, label) {
  if (!mayWrite()) return false; // the playerAccess kill switch, checked on both ends
  if (!character?.isOwner || !subject) return false;

  /*
   * No active GM, no roll — and nothing queues. A blind, arbitrated roll needs an arbiter;
   * dice must not fall while nobody is watching them. Same contract `requestMirror` uses.
   */
  if (!game.users?.activeGM) {
    ui.notifications.warn(t("known.study.notify.noGM"));
    return false;
  }

  /*
   * The combat warning, and it is a warning rather than an enforcement on purpose: dnd5e
   * 5.3.3 keeps no per-turn action ledger on the actor — activation costs live on items being
   * used, and Study is not an item here — so there is nothing to enforce against. The action
   * economy is the GM's table to run, as it always was.
   */
  if (game.combat?.started && character.inCombat) {
    const go = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("known.study.combatTitle") },
      content: `<p>${esc(f("known.study.combat", { name: character.name }))}</p>`
    });
    if (!go) return false;
  }

  const choice = await studyDialog(label);
  if (!choice) return false; // cancelled: NOT an attempt, and nothing is spent

  // ids only, plus the two bounded declarations. No claim, no text, no total.
  const payload = {
    action: STUDY,
    characterId: character.id,
    subjectId: subject.id,
    ns: spec.ns,
    factId: spec.factId ?? null,
    attrId: spec.attrId ?? null,
    mode: ["advantage", "disadvantage"].includes(choice.mode) ? choice.mode : "normal",
    situational: Math.max(SITUATIONAL_MIN, Math.min(SITUATIONAL_MAX, Math.round(Number(choice.situational) || 0)))
  };

  /*
   * ⚠ `game.socket.emit` does NOT loop back to the sender. A GM pressing this button on a
   * player's sheet — which they can, because a GM owns every actor — would otherwise send a
   * request into a room where the only listener is themselves, and get silence. So the GM
   * calls the handler directly, with their own id as the sender: the same validation, the same
   * writes, one hop shorter. It is also how the whole conduit can be exercised without a
   * second browser.
   */
  if (game.user?.isGM) return applyStudy(payload, game.user.id);

  // No sender id on the wire: the server stamps the authenticated one on for us.
  game.socket.emit(CHANNEL, payload);
  return true;
}

/**
 * The individual's rows as the player's sheet needs them: label, skill, DC, and whether the
 * one attempt is still there.
 *
 * ⚠ `spent` reads the player's own `studied` flag and is a **UI hint, not the lock** — same
 * split as `studyStateFor`. The handler refuses off the belief ledger, on a document no player
 * can write. Never re-derive a refusal from this.
 */
export function loreStateFor(character, subject) {
  if (!subject) return [];
  const spent = studiedOf(character).lore;
  // offerable, not merely rollable — see `attrLoreStateFor`
  return rollableLore(readFlag(subject, MODULE, LORE_FLAG)).filter(loreOfferable).map(row => {
    const key = loreFactKey(subject.id, row.id);
    return {
      id: row.id,
      label: row.label,
      dc: row.dc,
      skill: row.skill,
      skillLabel: CONFIG.DND5E?.skills?.[row.skill]?.label ?? row.skill,
      spent: !!spent[key],
      available: !spent[key],
      gmOnline: !!game.users?.activeGM
    };
  });
}
