/**
 * Pentaryn Reactions — card: the non-blocking reminder.
 *
 * GLUE, one feature. On the ACTIVE GM's client (at this table the headless "Claude" bot), every new
 * attack or damage card is read: for each player character it hits or damages, whose owner is online,
 * whose Reaction is not spent, who is above 0 HP and who has an affordable reaction that fits, the GM
 * whispers the owner one card — "Grick hits Marrith with Bite (18 vs AC 16). Reaction: [Shield]".
 * A multiattack's swings against the same PC in the same attacker turn update that one card in place.
 * Nothing waits on it: the attacker's flow is dnd5e's own, and the GM's Apply remains the pause.
 *
 * On every client, a rendered card binds its buttons: a click uses the activity (dnd5e's own
 * `Activity#use`, so the slot or use is consumed normally) on the clicker's client; when exactly one
 * slot can pay for the spell, dnd5e's usage dialog is skipped (there is nothing to choose). There is
 * no Pass: an ignored card is a pass. The GM greys the card when the PC's turn starts, when
 * pentaryn-combat records the Reaction as spent, or when the combat ends.
 *
 * Two GM tabs (the bridge tab and a browser): `claimMessage` on the attack / damage message elects
 * one tab to offer; the claim is written only once a card is actually due, so a monster swinging at a
 * monster writes nothing. Every active-GM tab indexes the cards it sees created or updated, so the tab
 * that lost a claim can still grey the winner's card. Writes after a claim run one at a time (a serial
 * chain): the attack card and the damage card that follows it tens of milliseconds later land on one
 * card, never two.
 */

import {
  CARD_FLAG, CLAIM_KEY, COMBAT_SCOPE, CSS, MODULE, SCAN_DEPTH,
  affordableSlots, cardKey, cardLines, closeReason, limitedUses, mergeCard, optionsFor, reactionSpent, slotCast, suppression,
  swingOf, triggerOf, turnKey,
} from "./reactions-core.mjs";
import { claimMessage, isActiveGM } from "./lib/election.mjs";
import { flagPath, readFlag } from "./lib/flags.mjs";

let log = null;
let ctx = null;
/**
 * GM session index of open cards: messageId → card record. Kept by `createChatMessage` /
 * `updateChatMessage` on every active-GM tab, rebuilt at ready from the chat log's tail.
 */
const open = new Map();
/** The serial chain every post-claim write joins: one card per key, whatever the message spacing. */
let writing = Promise.resolve();

const esc = s => globalThis.foundry?.utils?.escapeHTML?.(String(s ?? "")) ?? String(s ?? "");
const cardPath = flagPath(MODULE, CARD_FLAG);

/* ── adapters: Foundry documents → plain data for the core ─────────────────────────────────── */

/** The plain record `triggerOf` reads, from a ChatMessage (dnd5e 6 `system.targets`, `rolls`). */
export function plainMessage(message) {
  const sys = message?.system ?? {};
  return {
    id: message?.id ?? null,
    type: message?.type ?? null,
    flavor: message?.flavor ?? "",
    public: !(message?.whisper?.length > 0) && !message?.blind,
    rolls: (message?.rolls ?? []).map(r => ({ total: r?.total, isCritical: r?.isCritical === true, isFumble: r?.isFumble === true, type: r?.options?.type ?? null })),
    targets: (sys.targets ?? []).map(t => ({ actor: t?.actor ?? null, token: t?.token ?? null, name: t?.name ?? null, ac: t?.ac ?? null })),
    activity: { uuid: sys.activity?.uuid ?? null, name: sys.activity?.name ?? null },
    item: { name: sys.item?.name ?? null },
    speaker: { actor: message?.speaker?.actor ?? null, token: message?.speaker?.token ?? null, alias: message?.speaker?.alias ?? null },
    origin: sys.origin?.id ?? (typeof sys.origin === "string" ? sys.origin : null) ?? message?._source?.system?.origin ?? null,
  };
}

const values = coll => (coll ? (typeof coll.values === "function" ? [...coll.values()] : Array.isArray(coll) ? coll : Object.values(coll)) : []);

/** The actor's slot table as `[{ key, level, value, max }]` (dnd5e `system.spells.spell1`, `.pact`, …). */
function slotsOf(actor) {
  return Object.entries(actor?.system?.spells ?? {}).filter(([, s]) => s && typeof s === "object")
    .map(([key, s]) => ({ key, level: s.level, value: s.value, max: s.max }));
}

/**
 * The `spell` record for a spell item's activity: whether it casts from a slot is dnd5e's own
 * `activity.requiresSpellSlot` when the activity has one (`slotCast`), else the method decides.
 */
function spellOf(item, activity, actor) {
  if (item?.type !== "spell") return null;
  const level = item.system?.level ?? 0;
  const requiresSpellSlot = typeof activity?.requiresSpellSlot === "boolean" ? activity.requiresSpellSlot : undefined;
  return { level, usesSlots: slotCast({ level, method: item.system?.method ?? null, requiresSpellSlot }), slots: slotsOf(actor) };
}

/** One record per reaction-timed activity on the actor's items, in the shape `optionsFor` reads. */
export function activityRecords(actor) {
  const out = [];
  for (const item of values(actor?.items)) {
    for (const a of values(item?.system?.activities)) {
      if (a?.activation?.type !== "reaction") continue;
      out.push({
        id: a.id, uuid: a.uuid ?? `${item.uuid}.Activity.${a.id}`, name: item.name, img: item.img ?? a.img ?? null,
        identifier: item.system?.identifier ?? null, activation: "reaction",
        uses: limitedUses(a.uses) ?? limitedUses(item.system?.uses),
        spell: spellOf(item, a, actor),
      });
    }
  }
  return out;
}

/** The started combat the actor fights in, else the viewed one, else null. */
function combatOf(actor) {
  const combats = values(globalThis.game?.combats);
  const mine = combats.find(c => c?.started !== false && values(c.combatants).some(cb => cb?.actorId === actor.id));
  return mine ?? globalThis.game?.combat ?? null;
}

/** Connected non-GM users who own the actor — the card's recipients. */
function ownersOf(actor) {
  return values(globalThis.game?.users).filter(u => u?.active && !u.isGM && actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
}

const isPC = actor => !!actor && actor.type === "character" && actor.hasPlayerOwner === true;

/* ── the offer (active GM) ─────────────────────────────────────────────────────────────────── */

/**
 * Every card due for this message, computed without a write: `[{ actor, owners, key, combatId,
 * incoming }]`. Empty when the message is no trigger or every target is suppressed.
 */
export function offersFor(message) {
  const trigger = triggerOf(plainMessage(message));
  if (!trigger) return [];
  const out = [];
  for (const target of trigger.targets) {
    const actor = globalThis.fromUuidSync?.(target.actor) ?? null;
    if (!isPC(actor) || actor.id === trigger.attacker.actor) continue;
    const combat = combatOf(actor);
    const options = optionsFor(activityRecords(actor), trigger);
    const owners = ownersOf(actor);
    const why = suppression({
      spent: reactionSpent(readFlag(actor, COMBAT_SCOPE, "reaction"), combat?.id ?? null),
      hp: actor.system?.attributes?.hp?.value ?? null,
      owners, options,
    });
    if (why) { log?.debug?.(`no card for ${actor.name}: ${why}`); continue; }
    const key = cardKey(trigger, turnKey(combat), actor.uuid);
    out.push({
      actor, owners, key, combatId: combat?.id ?? null,
      incoming: {
        key, combatId: combat?.id ?? null, attacker: trigger.attacker,
        pc: { uuid: target.token ?? actor.uuid, actorUuid: actor.uuid, name: target.name ?? actor.name },
        swing: swingOf(trigger, target), options,
      },
    });
  }
  return out;
}

/** The card's HTML: the same markup the render hook binds, so a client without the module reads it. */
export function cardHtml(card) {
  const view = cardLines(card);
  const lines = view.lines.map(l => `<p class="${CSS}line">${esc(l)}</p>`).join("");
  const buttons = view.buttons.map(b => {
    const img = b.img ? `<img class="${CSS}icon" src="${esc(b.img)}" alt="">` : "";
    return `<button type="button" class="${CSS}use" data-prea-use="${esc(b.uuid)}"${view.closed ? " disabled" : ""}>${img}${esc(b.name)}</button>`;
  }).join("");
  // one label carries the state ("Reaction:", "Reaction window passed", "Reaction spent"); no separate title line
  return `<div class="pentaryn-reactions ${CSS}card${view.closed ? ` ${CSS}closed` : ""}">${lines}`
    + `<div class="${CSS}options"><span class="${CSS}label">${view.closed ? esc(view.title) : `${esc(view.title)}:`}</span>${buttons}</div></div>`;
}

/** The open card for a key, from the session index (every GM tab indexes creates and updates). */
function findCard(key) {
  for (const [id, card] of open) {
    if (card.key !== key) continue;
    const m = globalThis.game?.messages?.get?.(id);
    if (m) return m;
    open.delete(id);
  }
  return null;
}

/**
 * Index one message if it is a reminder card: open → in, closed → out. Returns whether it was a
 * card (so the create hook knows it is no trigger). Runs on every active-GM tab, which is what keeps
 * the tab that lost a claim able to grey the winner's card.
 */
export function index(message) {
  const card = readFlag(message, MODULE, CARD_FLAG);
  if (!card || !message?.id) return false;
  if (card.closed) open.delete(message.id);
  else open.set(message.id, card);
  return true;
}

/** Fill the session index from the chat log's tail (ready on the GM, a hot patch). */
export function reindex() {
  open.clear();
  const all = globalThis.game?.messages?.contents ?? [];
  for (let i = Math.max(0, all.length - SCAN_DEPTH); i < all.length; i++) index(all[i]);
  return open.size;
}

/** Run `job` after every write already queued; the chain survives a rejection, the caller sees it. */
function serial(job) {
  const next = writing.then(job, job);
  writing = next.then(() => undefined, () => undefined);
  return next;
}

async function offer(message) {
  const offers = offersFor(message);
  if (!offers.length) return;
  if (!(await claimMessage(message, CLAIM_KEY, { scope: MODULE }))) return;
  return serial(() => write(offers));
}

/** Post or update the cards for `offers` — one round trip per kind. Only ever runs inside `serial`. */
async function write(offers) {
  const speaker = globalThis.ChatMessage?.getSpeaker;
  // collect first, then one round trip per kind: a damage roll on several PCs is several cards
  const updates = [];
  const updated = [];
  const creates = [];
  for (const o of offers) {
    const existing = findCard(o.key);
    const before = existing ? readFlag(existing, MODULE, CARD_FLAG) : null;
    const card = mergeCard(before, o.incoming);
    if (existing && card === before) continue;
    if (existing) {
      updates.push({ _id: existing.id, content: cardHtml(card), [cardPath]: card });
      updated.push([existing, card]);
      continue;
    }
    creates.push({
      data: {
        content: cardHtml(card),
        whisper: o.owners,
        speaker: typeof speaker === "function" ? speaker({ actor: o.actor }) : { alias: o.actor.name },
        flags: { [MODULE]: { [CARD_FLAG]: card } },
      },
      card, pc: o.actor.uuid, to: o.owners,
    });
  }
  if (updates.length) await globalThis.ChatMessage.implementation.updateDocuments(updates);
  for (const [existing, card] of updated) {
    open.set(existing.id, card);
    ctx.emit("offered", existing, card);
  }
  if (!creates.length) return;
  const made = await globalThis.ChatMessage.implementation.createDocuments(creates.map(c => c.data));
  creates.forEach((c, i) => {
    const created = made?.[i] ?? null;
    if (created?.id) open.set(created.id, c.card);
    log.info("offered", { uuid: created?.uuid ?? null, pc: c.pc, to: c.to, by: globalThis.game?.user?.id ?? null });
    ctx.emit("offered", created, c.card);
  });
}

/** Grey every open card `event` closes, in one round trip. */
async function closeCards(event) {
  const updates = [];
  const closing = [];
  for (const [id, card] of open) {
    const reason = closeReason(card, event);
    if (!reason) continue;
    const message = globalThis.game?.messages?.get?.(id);
    if (!message) { open.delete(id); continue; }
    const next = { ...card, closed: reason };
    updates.push({ _id: id, content: cardHtml(next), [cardPath]: next });
    closing.push([message, next, reason]);
  }
  if (!updates.length) return 0;
  await globalThis.ChatMessage.implementation.updateDocuments(updates);
  for (const [message, next, reason] of closing) {
    open.delete(message.id);
    ctx.emit("closed", message, next, reason);
  }
  return updates.length;
}

/* ── the render (every client) ─────────────────────────────────────────────────────────────── */

/**
 * How to use an option from the card: dnd5e's own `Activity#use(usage, dialog)`. A slot-cast spell
 * with exactly one slot that can pay for it names that slot and skips dnd5e's usage dialog — the
 * dialog would only ask which slot, and there is one answer. Anything else (several slots, a feature
 * with uses) goes through `use` exactly as a sheet click would.
 * @returns {[object, object]} `[usage, dialog]`
 */
export function usePlan(activity, event) {
  const usage = { event };
  const spell = spellOf(activity?.item, activity, activity?.actor);
  if (spell?.usesSlots) {
    const keys = affordableSlots(spell);
    if (keys.length === 1) return [{ ...usage, spell: { slot: keys[0] } }, { configure: false }];
  }
  return [usage, {}];
}

async function useOption(uuid, button, event) {
  const activity = globalThis.fromUuidSync?.(uuid) ?? null;
  if (typeof activity?.use !== "function") {
    log.notify("warn", "That reaction is no longer on the sheet.");
    return;
  }
  button.disabled = true;
  try {
    await activity.use(...usePlan(activity, event));
  } finally {
    button.disabled = false;
  }
}

/** Bind the card's buttons for the PC's owner; anyone else (and a closed card) sees them disabled. */
export function decorate(message, html) {
  const card = readFlag(message, MODULE, CARD_FLAG);
  if (!card || typeof html?.querySelectorAll !== "function") return;
  const actor = globalThis.fromUuidSync?.(card.pc?.actorUuid) ?? null;
  const mine = actor?.isOwner === true;
  for (const button of html.querySelectorAll(`button[data-prea-use]`)) {
    if (card.closed || !mine) { button.disabled = true; continue; }
    button.addEventListener("click", event => {
      event.preventDefault?.();
      event.stopPropagation?.();
      if (button.disabled) return;
      return useOption(button.dataset.preaUse, button, event).catch(err => log.warn("reaction use failed", err));
    });
  }
}

/* ── wiring ────────────────────────────────────────────────────────────────────────────────── */

export function install(reg, context) {
  ctx = context;
  log = ctx.log;

  reg.on("createChatMessage", message => {
    if (!isActiveGM()) return;
    if (index(message)) return;          // our own card (any tab's): indexed, and no trigger
    return offer(message);
  }, { label: "createChatMessage: offer" });

  reg.on("updateChatMessage", message => {
    if (!isActiveGM()) return;
    index(message);
  }, { label: "updateChatMessage: index" });

  reg.on("combatTurnChange", (combat, previous, current) => {
    if (!isActiveGM() || !open.size) return;
    const combatant = current?.combatantId ? combat?.combatants?.get?.(current.combatantId) ?? values(combat?.combatants).find(c => c?.id === current.combatantId) : null;
    const actorUuid = combatant?.actor?.uuid ?? null;
    if (!actorUuid) return;
    return closeCards({ reason: "turn", actorUuid, combatId: combat.id });
  }, { label: "combatTurnChange: close" });

  reg.on("updateActor", (actor, changes) => {
    if (!isActiveGM() || !open.size) return;
    const flag = changes?.flags?.[COMBAT_SCOPE];
    if (!flag || !("reaction" in flag) || !flag.reaction) return;
    return closeCards({ reason: "spent", actorUuid: actor.uuid });
  }, { label: "updateActor: reaction spent" });

  reg.on("deleteCombat", combat => {
    if (!isActiveGM() || !open.size) return;
    return closeCards({ reason: "ended", combatId: combat.id });
  }, { label: "deleteCombat: close" });

  reg.on("deleteChatMessage", message => {
    open.delete(message?.id);
  }, { label: "deleteChatMessage: prune" });

  reg.on("renderChatMessageHTML", (message, html) => decorate(message, html), { label: "renderChatMessageHTML: bind" });

  reg.on("ready", () => {
    if (isActiveGM()) reindex();
  }, { label: "ready: reindex" });

  // a hot re-import after ready: no ready hook will fire again
  if (globalThis.game?.ready && isActiveGM()) reindex();
}

export function uninstall() {
  open.clear();
  writing = Promise.resolve();
}
