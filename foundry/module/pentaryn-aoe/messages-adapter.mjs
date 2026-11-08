/**
 * dnd5e 6 chat messages and effects → what the features need (ADAPTER: imports core and lib only).
 *
 * One resolver per question (finding -5): a roll message's activity, the usage card it threads
 * under, a usage card's effects, a recorded target, and the spell an applied effect came from.
 */

/** A ChatMessage given as itself or by id (an unknown id → null). */
export const messageFrom = m => (typeof m === "string" ? game.messages.get(m) ?? null : m);

/** The activity a dnd5e 6 roll or usage message belongs to. */
export function activityOf(message) {
  return message.getAssociatedActivity?.() ?? fromUuidSync(message.system?.activity?.uuid ?? "", { strict: false });
}

/**
 * The id of the usage card a roll message threads under (its system.origin; the live field is the
 * resolved message), or null when it was rolled from somewhere else (the sheet, a macro).
 */
export function usageIdOf(message) {
  const id = message?._source?.system?.origin ?? message?.system?.origin?.id ?? null;
  return id && game.messages.get(id)?.type === "usage" ? id : null;
}

/**
 * The card's applicable effects (enchantments excluded). dnd5e 6 stores them as uuids that are
 * either relative to the item (.ActiveEffect.<id>) or point into the dnd5e.effects compendium;
 * message.system.getEffects() resolves both, falling back to the item snapshot of a consumed item.
 */
export async function cardEffects(message) {
  message = messageFrom(message);
  if (message?.type !== "usage" || !message.system?.effects?.length) return [];
  const effects = (await message.system.getEffects?.()) ?? [];
  return effects.filter(e => e && e.type !== "enchantment");
}

/**
 * A recorded target as dnd5e 6 stores it on a message ({ actor, token } uuids; a card migrated from
 * 5.3.3 has only the actor, an older one `uuid`): the live TokenDocument when the token uuid still
 * resolves, and the stored actor uuid. Each caller keeps its own fallbacks on top of this.
 * @returns {{ token: object|null, actor: string|null }}
 */
export function recordedTarget(tg) {
  const token = tg?.token ? fromUuidSync(tg.token, { strict: false }) : null;
  return { token: token ?? null, actor: tg?.actor ?? null };
}

/**
 * dnd5e 6 target descriptors for tokens (Token placeables or TokenDocuments), as `system.targets`
 * stores them: `{ actor, ac, img, name, token }`. dnd5e's own `TargetsField.getDescriptors` when the
 * system exposes it (`dnd5e.dataModels.fields`), else the same shape built here. Tokens with no
 * actor are skipped; one entry per token. Default: this user's current targets.
 * @param {Iterable<object>} [tokens]
 * @returns {{actor: string, ac: number|null, img: string|undefined, name: string, token: string}[]}
 */
export function targetDescriptors(tokens = game.user?.targets ?? []) {
  const Field = globalThis.dnd5e?.dataModels?.fields?.TargetsField;
  if (typeof Field?.getDescriptors === "function") return Field.getDescriptors(tokens);
  const out = new Map();
  for (const target of tokens ?? []) {
    const token = target?.document ?? target;
    const actor = token?.actor;
    if (!actor?.uuid) continue;
    const ac = actor.statuses?.has?.("coverTotal") ? null : actor.system?.attributes?.ac?.value;
    out.set(token.uuid, { actor: actor.uuid, ac: ac ?? null, img: token.texture?.src, name: token.name, token: token.uuid });
  }
  return Array.from(out.values());
}

/**
 * A damage or healing card's damage descriptions, as dnd5e's `<damage-application>` builds them for
 * Apply: the message's damage rolls aggregated by type, each `{ value (≥ 0), type, properties: Set }`.
 * `[]` for a message with no rolls.
 */
export function cardDamages(message) {
  const rolls = message?.rolls ?? [];
  if (!rolls.length) return [];
  const agg = dnd5e.dice.aggregateDamageRolls(rolls, { respectProperties: true });
  return agg.map(roll => ({
    value: Math.max(0, roll.total ?? 0),
    type: roll.options?.type,
    properties: new Set(roll.options?.properties ?? [])
  }));
}

/** The spell identifier an applied effect came from (its source effect's item, else its origin). */
export function spellOf(effect) {
  for (const uuid of [effect._stats?.duplicateSource, effect.origin]) {
    if (!uuid) continue;
    let doc = null;
    try { doc = fromUuidSync(uuid, { strict: false }); } catch { doc = null; }
    const item = doc?.documentName === "Item" ? doc : doc?.parent?.documentName === "Item" ? doc.parent : null;
    if (item?.type === "spell") return item.system?.identifier || item.name;
  }
  return null;
}
