/**
 * Pentaryn Feature Riders — FEATURE: Battle Medic (B3).
 *
 * One `utility` activity on the Healer feat, flagged flags.pentaryn-riders.flow = "battle-medic"
 * (`installBattleMedic(actor)` builds it). Using it with one creature targeted: the kit use is spent
 * by dnd5e, the target's largest Hit Die is rolled on the healer's client (1s rerolled, + the
 * healer's PB), then the target spends that die and regains the roll. The write happens on the
 * healer's client when they own the target, otherwise the active GM does it through the v14 user
 * query `pentaryn-riders.battleMedic` (the relay, registered at `init` on every client: the sender's
 * client needs the name too). Nothing is spent when there is no target, the target has no Hit Dice
 * left, or no GM is online to write a target the player doesn't own.
 */

import { MODULE, battleMedicBlockReason, battleMedicFormula, clampHeal, matchRule, pickSpend } from "./riders-core.mjs";
import { settingRaw } from "./settings.mjs";
import { guarded } from "./lib/queries.mjs";
import { HEALER, hdPools, hdSummary, isBattleMedic, itemInfo, spendHitDie, withLegacyActor } from "./shapes.mjs";

const QUERY = `${MODULE}.battleMedic`;

let log = null;

function soleTarget() {
  const targets = Array.from(game.user?.targets ?? []);
  return targets.length === 1 ? targets[0] : null;
}

/** Why Battle Medic can't run right now, or null. Checked before dnd5e spends the kit. */
function battleMedicBlock(healer, token) {
  const target = token?.actor ?? null;
  const hasHd = !!target?.system?.attributes?.hd;
  const key = battleMedicBlockReason({
    hasTargetActor: !!target,
    hasHd,
    canSpend: hasHd && !!pickSpend(hdPools(target)),
    ownsTarget: !!target?.isOwner,
    gmOnline: !!game.users.activeGM,
  });
  return key ? _loc(key, { name: token?.name }) : null;
}

/**
 * Write side: the patient spends a `faces` Hit Die (or their largest) and regains `amount`.
 * Runs on a client that owns the target (the healer's own, or the active GM's). With `prof` (the GM
 * relay), `amount` is clamped to the die actually spent + PB, not to a size the sender claimed.
 */
async function applyBattleMedic(target, { faces, amount, prof = null }) {
  const spent = await spendHitDie(target, { faces });
  if (!spent) throw new Error(`${target.name} has no Hit Dice left`);
  if (prof !== null) amount = clampHeal(amount, spent, prof);
  const before = target.system.attributes.hp?.value ?? 0;
  await target.applyDamage(-Math.max(0, amount));
  const after = target.system.attributes.hp?.value ?? before;
  return { faces: spent, healed: after - before, hp: after, ...hdSummary(target) };
}

/** The flow, on the healer's client after the activity was used. */
async function runBattleMedic(healer, token) {
  const target = token.actor;
  const pool = pickSpend(hdPools(target));
  if (!pool) { ui.notifications.warn(_loc("PENTARYN_RIDERS.battleMedic.noHitDice", { name: token.name })); return null; }
  const prof = healer.system?.attributes?.prof ?? 0;
  const roll = await new Roll(battleMedicFormula(pool.faces, prof)).evaluate();
  await roll.toMessage({
    speaker: ChatMessage.implementation.getSpeaker({ actor: healer }),
    flavor: _loc("PENTARYN_RIDERS.battleMedic.flavor", { target: token.name, faces: pool.faces }),
    flags: { [MODULE]: { flow: "battle-medic", target: target.uuid, faces: pool.faces } }
  });

  const amount = clampHeal(roll.total, pool.faces, prof);
  let result;
  try {
    if (target.isOwner) result = await applyBattleMedic(target, { faces: pool.faces, amount });
    else {
      const gm = game.users.activeGM;
      if (!gm) throw new Error("no GM");
      result = await gm.query(QUERY, { healerUuid: healer.uuid, targetUuid: target.uuid, faces: pool.faces, amount }, { timeout: 8000 });
    }
  } catch (err) {
    log.warn("Battle Medic write failed", err, { healer: healer.uuid, target: target.uuid });
    ui.notifications.warn(_loc("PENTARYN_RIDERS.battleMedic.failed", { name: token.name }));
    return null;
  }
  // Hit Dice left only to someone who could read them on the sheet anyway (not an NPC's to a player).
  const seesSheet = game.user.isGM || target.testUserPermission(game.user, "OBSERVER");
  ui.notifications.info(_loc(seesSheet ? "PENTARYN_RIDERS.battleMedic.done" : "PENTARYN_RIDERS.battleMedic.doneShort", {
    name: token.name, healed: result.healed, faces: result.faces, value: result.value, max: result.max
  }));
  return result;
}

// The veto: synchronous, a literal `return false` (dnd5e.preUseActivity is a Hooks.call).
function veto(activity) {
  try {
    if (!settingRaw("enabled") || !isBattleMedic(activity)) return;
    const why = battleMedicBlock(activity.actor, soleTarget());
    if (why) { ui.notifications.warn(why); return false; }
  } catch (err) { log.warn("Battle Medic check skipped", err); }
}

function afterUse(activity) {
  try {
    if (!settingRaw("enabled") || !isBattleMedic(activity)) return;
    const token = soleTarget();
    if (!token?.actor || !activity.actor) return;
    runBattleMedic(activity.actor, token).catch(err => log.warn("Battle Medic failed", err));
  } catch (err) { log.warn("Battle Medic skipped", err); }
}

function findKit(actor) {
  return actor.items.find(i => i.system?.identifier === "healers-kit")
    ?? actor.items.find(i => /healer'?s\s+kit/i.test(i.name ?? ""));
}

/**
 * GM / owner: give the actor's Healer feat one Battle Medic activity spending one use of their
 * Healer's Kit. `replace` (default) deletes the old "Heal dX" activities, which asked the patient
 * to pick their own die.
 */
async function installBattleMedic(actor, { replace = true } = {}) {
  const item = actor?.items?.find(i => matchRule(HEALER, itemInfo(i)));
  if (!item) return { ok: false, why: "no Healer feat" };
  if (!item.isOwner) return { ok: false, why: "not owner" };
  const kit = findKit(actor);
  const acts = item.system.activities?.contents ?? [];
  const oldUses = acts.flatMap(a => a.consumption?.targets ?? []).filter(t => t.type === "itemUses");
  const kitId = oldUses.map(t => t.target).find(id => actor.items.has(id)) ?? kit?.id ?? null;
  const data = {
    name: "Battle Medic",
    img: item.img,
    activation: { type: "action", value: 1 },
    range: { units: "ft", value: "5" },
    target: { affects: { type: "creature", count: "1" }, prompt: false },
    consumption: { targets: kitId ? [{ type: "itemUses", target: kitId, value: "1" }] : [] },
    description: { chatFlavor: "Tend to one creature: it spends a Hit Die, you roll it (1s rerolled) + your PB." },
    flags: { [MODULE]: { flow: "battle-medic" } }
  };
  const existing = acts.find(a => isBattleMedic(a));
  if (existing) await item.updateActivity(existing.id, data);
  else await item.createActivity("utility", data, { renderSheet: false });
  const removed = [];
  if (replace) {
    for (const a of acts) {
      if (a.type === "heal" && /^heal\s*d\d+$/i.test(a.name ?? "")) { await item.deleteActivity(a.id); removed.push(a.name); }
    }
  }
  return { ok: true, item: item.uuid, kit: kitId, kitFound: !!kitId, updated: !!existing, removed };
}

/* ── the GM relay ─────────────────────────────────────────────────────── */

/**
 * Called from the entry's `init`, on every client (a player's `gm.query` needs the name registered).
 * Through the kit's `guarded` with `sender: "any"`: the receiver must be a GM (else
 * `NOT_GM: this client is not a GM`), any sender may ask — the handler checks that the sender owns
 * the healer. Still a hand registration (C56): the kit's registerQueries does not pass the query
 * context (the sender) to a manifest row's implementation yet (W2-J2).
 */
export function registerRelay() {
  CONFIG.queries[QUERY] = guarded(relay, { sender: "any" });
}

/**
 * The GM side of the relay. `user` is the sender as the server knows it. The sender must own the
 * healer, the healer must have the Healer feat, and the amount is clamped to what the die could roll.
 */
async function relay(data, { user } = {}) {
  // Audit lines (combat-riders-27, use-doc §5.1): one warn before each refusal, one info on success.
  const who = { healer: data?.healerUuid ?? null, target: data?.targetUuid ?? null, by: game.user?.id ?? null, for: user?.id ?? null };
  const refuse = reason => {
    log.warn(`battle medic relay refused: ${reason}`, who);
    return new Error(reason);
  };
  if (!game.user.isGM || !game.users.activeGM?.isSelf) throw refuse("not the active GM");
  const healer = await fromUuid(data?.healerUuid);
  const target = await fromUuid(data?.targetUuid);
  if (!(healer instanceof Actor) || !(target instanceof Actor)) throw refuse("unknown actor");
  if (!user || !healer.testUserPermission(user, "OWNER")) throw refuse("sender does not own the healer");
  if (!healer.items.some(i => matchRule(HEALER, itemInfo(i)))) throw refuse("healer has no Healer feat");
  const faces = Number(data?.faces) || 0;
  let result;
  try {
    result = await applyBattleMedic(target, { faces, amount: data?.amount, prof: healer.system?.attributes?.prof ?? 0 });
  } catch (err) {
    log.warn(`battle medic relay refused: ${err.message}`, who);
    throw err;
  }
  log.info("battle medic relay", { uuid: target.uuid, ids: [healer.uuid], by: game.user.id, for: user.id, healed: result.healed, faces: result.faces });
  return result;
}

/* ── wiring ───────────────────────────────────────────────────────────── */

export function install(reg, ctx) {
  log = ctx.log;
  reg.on("dnd5e.preUseActivity", veto, { guard: false, label: "Battle Medic veto" });
  reg.on("dnd5e.postUseActivity", afterUse, { guard: false, label: "Battle Medic" });
  // The two API rows are Battle Medic's own (legacy shapes, kept as they were).
  return {
    rows: [
      {
        path: "installBattleMedic",
        params: [{ name: "actor", type: "Actor|Token|uuid|id|exact name", doc: "a miss answers null" }, { name: "opts", type: "{ replace? }", optional: true }],
        returns: "{ ok: true, item, kit, kitFound, updated, removed } | { ok: false, why }",
        gm: false, writes: true, legacy: true,
        sideEffects: ["Item(Healer).system.activities", "flags.pentaryn-riders.flow"],
        doc: "GM / owner: give the actor's Healer feat one Battle Medic activity spending one use of their Healer's "
          + "Kit; replace (default true) deletes the old 'Heal dX' activities.",
      },
      {
        path: "battleMedic",
        params: [{ name: "healer", type: "Actor" }, { name: "token", type: "Token placeable (its .actor is the patient)" }],
        returns: "{ faces, healed, hp, value, max } | null",
        gm: false, writes: true, legacy: true,
        sideEffects: ["ChatMessage (the roll)", "the patient's Hit Dice and HP (through the GM relay when not owned)"],
        doc: "Run Battle Medic as the client runner does after the activity is used: roll the patient's largest Hit "
          + "Die (1s rerolled) + PB, spend it and heal. Takes a Token, not an Actor (an Actor reads as 'no Hit Dice').",
      },
    ],
    impl: { installBattleMedic: withLegacyActor(installBattleMedic), battleMedic: runBattleMedic },
  };
}

export function uninstall() {}
