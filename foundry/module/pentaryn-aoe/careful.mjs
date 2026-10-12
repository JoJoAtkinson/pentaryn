/**
 * Part B, Careful Spell (usability Area 5 re-run, U-5-11; U-9-8) — a feature of its own.
 *
 * PHB 2024: "choose a number of those creatures up to your Charisma modifier (minimum of one
 * creature). A chosen creature automatically succeeds on its saving throw against the spell, and
 * it takes no damage if it would normally take half damage on a successful save."
 *
 * Joe's metamagic ruling (2026-10-12, aoe-careful-select): metamagic is a tracking thing. The player
 * declares it and chooses; nothing is inferred and nothing is forced onto a spell's mechanics.
 *  - On the caster's client, using Careful Spell (`dnd5e.postUseActivity`) opens a picker of the
 *    creatures on the caster's scene (token names, the current targets ticked, up to CHA mod, min 1),
 *    posts a public card "<caster's token> uses Careful Spell: <tokens>" and stores the choice on the
 *    caster: flags.pentaryn-aoe.careful = { at, scene, tokens, names }. Using it again replaces it.
 *  - The caster's next SAVE tray (resolve.mjs, through ctx.exposed.carefulFor) marks exactly those
 *    rows protected (core.protectRows) and clears the flag: one use per declaration. A spell with no
 *    save never reaches it, so it stays armed; there is no time window. A re-roll of a card that
 *    already used one keeps its own choice and does not spend a newer declaration.
 *  - The GM can protect or unprotect any row on the tray by hand (tray.mjs → resolve.setRow).
 *
 * Its hook registers right after Part A's and before resolve's, as it did inside resolve.mjs: the
 * Careful listener must run before refund's synchronous `false` on the same hook.
 * Setting carefulSpell (world, default on).
 */

import { MODULE, RECENT_MESSAGES, aoeFlags, isHandle, isCreature, protectRows } from "./core.mjs";
import { setting } from "./settings.mjs";
import { isPile } from "./scene-adapter.mjs";
import { makeLog } from "./lib/log.mjs";

let log = makeLog(MODULE);   // the entry's ctx.log once installed
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** -8: a silent stop, traced (ring + debug line) only while CONFIG.debug["pentaryn-aoe"] is on. */
function why(job, id, outcome, extra = {}) {
  log.trace(job, { id: id ?? null, outcome, ...extra });
  log.debug(`${job}: ${outcome}`, id ?? "");
}

/** How many creatures Careful Spell protects for this caster: the CHA modifier, at least 1. */
const carefulMax = actor => Math.max(1, Number(actor.system?.abilities?.cha?.mod) || 1);

/** The caster's token: its own (an unlinked token's actor), else one on the viewed scene, else any. */
function ownToken(actor) {
  const tokens = actor.getActiveTokens?.(false, true) ?? [];
  return actor.token ?? tokens.find(tk => tk.parent === canvas?.scene) ?? tokens[0] ?? null;
}

/** The creatures on `scene` this user may choose (core.isCreature), hidden ones only for a GM. */
function choicesOn(scene) {
  return (scene?.tokens?.contents ?? [...(scene?.tokens ?? [])]).filter(tk => {
    const actor = tk.actor;
    if (!actor || (tk.hidden && !game.user.isGM)) return false;
    return isCreature({
      actorType: actor.type, hpMax: actor.system?.attributes?.hp?.max ?? 0,
      handle: isHandle(tk), isHandleActor: !!aoeFlags(actor).handleActor, isPile: isPile(tk),
    });
  });
}

/**
 * The picker: one box per creature (token name), the user's current targets ticked (up to max).
 * @returns {Promise<string[]|null>}  the chosen token ids (at most max), or null when closed
 */
async function pick(tokens, max) {
  const targeted = new Set([...(game.user?.targets ?? [])].map(t => t?.document?.id ?? t?.id));
  let ticked = 0;
  const boxes = tokens.map(tk => {
    const on = targeted.has(tk.id) && ticked < max;
    if (on) ticked++;
    return `<label class="pa-careful-pick"><input type="checkbox" name="careful" value="${esc(tk.id)}"${on ? " checked" : ""}> ${esc(tk.name)}</label>`;
  }).join("");
  const read = form => [...form.querySelectorAll('input[name="careful"]:checked')].map(i => i.value).slice(0, max);
  const out = await foundry.applications.api.DialogV2.wait({
    window: { title: _loc("PENTARYN_AOE.Careful.PickTitle"), icon: "fa-solid fa-shield-halved" },
    content: `<p>${esc(_loc("PENTARYN_AOE.Careful.PickHint", { n: max }))}</p><div class="pa-careful-picks">${boxes}</div>`,
    buttons: [
      { action: "ok", label: _loc("PENTARYN_AOE.Careful.PickOk"), icon: "fa-solid fa-shield-halved", default: true,
        callback: (event, button) => read(button.form) },
      { action: "cancel", label: _loc("PENTARYN_AOE.Careful.PickCancel"), icon: "fa-solid fa-xmark" },
    ],
    // No more than max boxes can be ticked: the others grey out at the limit.
    render: (event, dialog) => {
      const boxesIn = [...(dialog?.element?.querySelectorAll?.('input[name="careful"]') ?? [])];
      const limit = () => {
        const n = boxesIn.filter(b => b.checked).length;
        for (const b of boxesIn) b.disabled = !b.checked && n >= max;
      };
      for (const b of boxesIn) b.addEventListener("change", limit);
      limit();
    },
    rejectClose: false,
  });
  return Array.isArray(out) ? out : null;
}

/** On the caster's client: Careful Spell was used — the player picks who it protects, a public card says so. */
async function onCarefulUsed(activity) {
  if (!setting("carefulSpell")) return;
  if ((activity?.item?.system?.identifier || "") !== "careful-spell") return;
  const actor = activity.actor;
  if (!actor?.isOwner) return why("careful", null, "used, but this client does not own the caster");
  const own = ownToken(actor);
  const scene = own?.parent ?? canvas?.scene ?? null;
  const tokens = choicesOn(scene);
  if (!tokens.length) {
    ui.notifications?.info?.(_loc("PENTARYN_AOE.Careful.Nobody"));
    return why("careful", null, "no creature on the scene to choose");
  }
  const ids = await pick(tokens, carefulMax(actor));
  if (!ids?.length) return why("careful", null, "picker closed, nothing chosen");
  const chosen = tokens.filter(tk => ids.includes(tk.id));
  const names = chosen.map(tk => tk.name);
  await actor.update({ [`flags.${MODULE}.careful`]: { at: Date.now(), scene: scene.id, tokens: chosen.map(tk => tk.id), names } });
  // Public, token names only (never the actor's name).
  const caster = own?.name ?? actor.prototypeToken?.name ?? "";
  await ChatMessage.implementation.create({
    speaker: ChatMessage.getSpeaker({ actor, scene, token: own }),
    content: `<p class="pa-careful-card"><i class="fa-solid fa-shield-halved" inert></i> ${esc(_loc("PENTARYN_AOE.Careful.Card", { caster, names: names.join(", ") }))}</p>`,
  });
}

/** The Careful Spell an earlier tray from this usage card used (a re-roll keeps it), or null. */
function usedBy(usage) {
  if (!usage) return null;
  for (const m of game.messages.contents.slice(-RECENT_MESSAGES).reverse()) {
    const res = aoeFlags(m).resolution;
    if (res?.usage === usage && res.careful?.ids?.length) return res.careful;
  }
  return null;
}

/**
 * The active GM resolves a save spell of this caster: protect exactly the creatures the player
 * chose and clear the declaration (one use). A re-roll of a card that already used one keeps it.
 * @returns {Promise<{names: string[], ids: string[]}|null>}
 */
async function carefulFor(caster, { usage = null, onSave = "half", rows = [] } = {}) {
  if (!caster || !setting("carefulSpell")) { why("careful", usage, caster ? "off" : "no caster"); return null; }
  const prior = usedBy(usage);
  const flag = prior ? null : aoeFlags(caster).careful;
  const ids = prior?.ids ?? (Array.isArray(flag?.tokens) ? flag.tokens : null);
  if (!ids) { why("careful", usage, "no declaration"); return null; }
  protectRows(rows, ids, onSave);
  // -9: if clearing fails, the next save spell would take this choice again — say so.
  if (flag) await caster.update({ [`flags.${MODULE}.careful`]: _del }).catch(err => log.warn("careful clear", err));
  return { names: rows.filter(r => r.protected).map(r => r.name), ids: [...ids] };
}

export function install(reg, ctx) {
  log = ctx.log;
  // resolve.mjs (another feature) calls this through ctx.exposed, never by importing this file.
  ctx.expose({ carefulFor });
  reg.on("dnd5e.postUseActivity", reg.guardSwallowAsync("postUseActivity(careful)", activity => onCarefulUsed(activity)), { guard: false, label: "postUseActivity(careful)" });
}

export function uninstall() {}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { carefulFor, onCarefulUsed };
