/**
 * Timed effects end on time (HdWHWk: Shield's barrier did not go on Marrith's turn).
 * ===================================================================================
 *
 * FEATURE: install(reg, ctx) / uninstall(), plus `configure()` for the entry's `init`. The rules are
 * pure in table-core.mjs (`selfEffectExpiry`, `sourceActorFor`; fixtures in test/table.mjs).
 *
 * 1. Expired effects vanish (triage C4, Joe 2026-11-07: "they're expired, no point keeping them").
 *    Core's `CONFIG.ActiveEffect.expiryAction` is `"update"`: the registry marks an expired effect
 *    `duration.expired` and suppresses it, but it stays on the sheet, grey, which read as "did not
 *    reset" (foundry.mjs 219365; the registry branches on it at 49787). `configure()` sets it to
 *    `"delete"` at init, world-wide: an expired timed effect is removed by the active GM's client
 *    (the registry only acts on `activeGM.isSelf`). dnd5e already deletes expired effects out of
 *    combat and at combat end; this makes in-combat the same. pentaryn-transform tolerates it
 *    (wildshape.mjs). A CONFIG value, not a setting: no switch. `uninstall()` puts the previous
 *    value back (a hot patch re-runs `configure()`).
 *
 * 2. A self-cast reaction expires on its caster's turn (triage C3, narrowed in the 2026-11-07
 *    review). Core's plain `turnStart` keys on `start.combatant`, the combatant whose turn it was
 *    when the effect was created; Shield is cast on the attacker's turn, so its barrier expired at
 *    the attacker's next turn, not the caster's. dnd5e's `sourceStart` pseudo-expiry fires at the
 *    turn start of the effect's SOURCE actor (`getSourceActor()`), skipping the turn it was applied
 *    on. On `preCreateActiveEffect` (the creating client, never GM-gated: pre* runs on the
 *    initiator only) an effect with `turnStart` whose origin is the actor it is created on (or one of
 *    its items / activities), while combat is on and it is not that actor's turn, is rewritten to
 *    `sourceStart`. `duration.value` goes null with it, as dnd5e's own `_preCreate` does for every
 *    pseudo-expiry ("evaluated live in isExpiryEvent"): a finite seconds value would otherwise
 *    hold a Shield cast earlier in the round for one turn too long. Anything else is untouched.
 *    Belt and braces with pentaryn-importer's DDB correction (triage C2), which fixes the data.
 *
 * 3. The source actor is recorded (0.7.2; live 2026-11-07: Caven, last in initiative, cast Shield in
 *    round 2 and the barrier went when round 3 began on Marrith's turn). dnd5e's `sourceStart` /
 *    `sourceEnd` ask `getSourceActor()`, which reads `system.origin.actor ?? .item ?? .activity ??
 *    origin` — and on an effect dnd5e's own activity applied, `actor` is null and `item` is the spell's
 *    COMPENDIUM uuid: an index entry with no `.actor`, so the source is null, `isExpiryEvent` finds no
 *    combatant and expires the effect once "past the creation round", at the first turn of the next
 *    round. The same handler resolves the caster from `activity`, then `item`, then `origin` (an Actor,
 *    or a document with one; a compendium entry is skipped) and writes `system.origin.actor`, which
 *    dnd5e reads first, on every client. Only for a source expiry with no actor recorded.
 */

import { EXPIRY_ACTION, selfEffectExpiry, sourceActorFor } from "./table-core.mjs";

let log = null;
let previousAction;   // CONFIG.ActiveEffect.expiryAction before configure(); uninstall() restores it

/* ── 1. expired effects vanish ─────────────────────────────────────────── */

/** Called from the entry's `init` (and again by a hot patch). Idempotent. */
export function configure() {
  const cfg = (CONFIG.ActiveEffect ??= {});
  if (previousAction === undefined) previousAction = cfg.expiryAction ?? null;
  cfg.expiryAction = EXPIRY_ACTION;
}

/* ── 2. a self-cast reaction expires on its caster's turn · 3. its source actor recorded ── */

/**
 * The actor a uuid stands for: an Actor itself, or the actor of a document that has one (an item, an
 * activity). A compendium index entry has neither → null; a uuid that does not resolve → null.
 */
function actorUuidOf(uuid) {
  if (typeof uuid !== "string" || !uuid) return null;
  let doc = null;
  try { doc = fromUuidSync(uuid, { strict: false }); } catch { return null; }
  if (!doc) return null;
  if (doc.documentName === "Actor") return doc.uuid ?? null;
  const actor = doc.actor ?? doc.item?.actor ?? null;
  return actor?.documentName === "Actor" ? actor.uuid ?? null : null;
}

// sync, never GM-gated (pre* runs on the creating client only); updateSource rewrites the pending data
function selfCastExpiry(effect) {
  try {
    const parent = effect?.parent;
    if (parent?.documentName !== "Actor") return;
    const combat = game.combat;
    const systemOrigin = effect.system?.origin ?? null;
    const rewritten = selfEffectExpiry({
      expiry: effect.duration?.expiry ?? null,
      origin: effect.origin ?? null,
      systemOrigin,
      parentUuid: parent.uuid,
      combatStarted: !!combat?.started,
      turnActorUuid: combat?.combatant?.actor?.uuid ?? null,
    });
    if (rewritten) {
      effect.updateSource({ "duration.expiry": rewritten, "duration.value": null });
      log.debug(`${effect.name}: expiry turnStart → ${rewritten} (self-cast off turn)`);
    }
    const expiry = rewritten ?? effect.duration?.expiry ?? null;
    const sourceActor = sourceActorFor({
      expiry,
      systemOrigin,
      candidates: () => [systemOrigin?.activity, systemOrigin?.item, effect.origin].map(actorUuidOf),
    });
    if (!sourceActor) return;
    effect.updateSource({ "system.origin.actor": sourceActor });
    log.debug(`${effect.name}: source actor ${sourceActor} recorded for ${expiry}`);
  } catch (err) { log.warn("self-cast expiry guard skipped", err); }
}

/* ── wiring ───────────────────────────────────────────────────────────── */

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("preCreateActiveEffect", selfCastExpiry, { guard: false, label: "self-cast expiry" });
}

/** Put core's expiry action back (the hooks go with reg.offAll). */
export function uninstall() {
  if (previousAction === undefined || !CONFIG.ActiveEffect) return;
  if (previousAction === null) delete CONFIG.ActiveEffect.expiryAction;
  else CONFIG.ActiveEffect.expiryAction = previousAction;
  previousAction = undefined;
}
