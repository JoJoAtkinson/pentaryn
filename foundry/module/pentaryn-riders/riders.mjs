/**
 * Pentaryn Riders
 * ===============
 *
 * dnd5e leaves a few feature riders to the player: Elemental Adept's "1s count as 2", Elemental
 * Affinity's +CHA, Potent Spellcasting's +WIS, the Healer feat's Battle Medic. This module does
 * them, from a small rules table in `riders-core.mjs` keyed by feature identity (dnd5e identifier,
 * compendium source, or name). A rider is active only while the actor owns the feature.
 *
 * Damage and healing riders (B1, B2)
 *   `dnd5e.postDamageRollConfiguration` fires on the roller's client after the roll dialog (so the
 *   damage type is the final one, crits are already doubled and @references resolved) and before
 *   the dice are rolled. The riders edit the real terms there: a die modifier ("min2", "r1") on
 *   the dice of the right type, or one `+ N[Feature]` term. The chat card shows both in its formula
 *   and names the riders in its flavor. The message carries
 *       flags.pentaryn-riders = { applied: [keys], ignoreResistance: [types], origin }
 *   `dnd5e.preCalculateDamage` reads `ignoreResistance` when the damage tray first lists a target
 *   that resists that type, and switches the resistance to "ignored" once. The GM can click the
 *   icon to switch it back; the tray keeps that choice.
 *
 * Battle Medic (B3)
 *   One `utility` activity on the Healer feat, flagged flags.pentaryn-riders.flow = "battle-medic"
 *   (`installBattleMedic(actor)` builds it). Using it with one creature targeted: the kit use is
 *   spent by dnd5e, the target's largest Hit Die is rolled on the healer's client (1s rerolled,
 *   + the healer's PB), then the target spends that die and regains the roll. The write happens
 *   on the healer's client when they own the target, otherwise the active GM does it through the
 *   v14 user query `pentaryn-riders.battleMedic`. Nothing is spent when there is no target, the
 *   target has no Hit Dice left, or no GM is online to write a target the player doesn't own.
 *
 * Hit Dice −/+ (B4)
 *   The character sheet only lets you change spent Hit Dice in edit mode (cog → per class). In play
 *   mode the Hit Dice label gets a − and a + for whoever can edit the sheet.
 *
 * Exposes game.pentaryn.riders.
 */

import * as core from "./riders-core.mjs";

const MOD = core.MOD;
const QUERY = `${MOD}.battleMedic`;
const PRESET = Symbol.for(`${MOD}.resistancePreset`);
const L = (k, data) => (data ? game.i18n.format(`PENTARYN_RIDERS.${k}`, data) : game.i18n.localize(`PENTARYN_RIDERS.${k}`));

/* -------------------------------------------- */
/*  Features on an actor                        */
/* -------------------------------------------- */

function itemInfo(item) {
  return {
    identifier: item?.system?.identifier || "",
    source: item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? "",
    name: item?.name ?? "",
    type: item?.type ?? ""
  };
}

function activityDamageTypes(item) {
  const out = [];
  for (const a of item?.system?.activities ?? []) {
    for (const part of a?.damage?.parts ?? []) for (const t of part?.types ?? []) out.push(t);
  }
  return out;
}

/**
 * Every rule the actor's items switch on, with the types it resolved to.
 * @returns {{key: string, rule: object, items: Item[], types: string[]|null}[]}
 */
function featuresOf(actor) {
  const found = new Map();
  for (const item of actor?.items ?? []) {
    const info = itemInfo(item);
    for (const rule of core.RULES) {
      if (!core.matchRule(rule, info)) continue;
      const entry = found.get(rule.key) ?? { key: rule.key, rule, items: [], types: rule.types ? [] : null };
      entry.items.push(item);
      if (rule.types) {
        const t = core.resolveTypes({
          flagType: item.getFlag?.(MOD, "damageType"),
          name: item.name,
          activityTypes: activityDamageTypes(item)
        }, rule.types);
        for (const x of t) if (!entry.types.includes(x)) entry.types.push(x);
      }
      found.set(rule.key, entry);
    }
  }
  return [...found.values()];
}

/* -------------------------------------------- */
/*  B1 / B2 — damage and healing riders         */
/* -------------------------------------------- */

const isType = t => (t in (CONFIG.DND5E?.damageTypes ?? {})) || (t in (CONFIG.DND5E?.healingTypes ?? {}));
const isHealing = t => t in (CONFIG.DND5E?.healingTypes ?? {});

/**
 * The ability mods this activity's damage formula already adds by hand (`carriedAbilities`).
 * Only the activity's own parts are read: with `includeBase` a spell's base damage lives there too.
 */
function carriedBy(activity) {
  const formulas = [];
  for (const p of activity?.damage?.parts ?? []) {
    formulas.push(p?.bonus ?? "");
    if (p?.custom?.enabled) formulas.push(p.custom.formula ?? "");
  }
  return core.carriedAbilities(formulas, activity?.ability ?? "");
}

function describe(term) {
  const T = foundry.dice.terms;
  if (term instanceof T.Die) return { kind: "die", modifiers: term.modifiers, flavor: term.flavor };
  if (term instanceof T.OperatorTerm) return { kind: "op", operator: term.operator };
  if (term instanceof T.NumericTerm) return { kind: "num", number: term.number, flavor: term.flavor };
  return { kind: "other", flavor: term?.flavor ?? "" };
}

function originOf(config, message) {
  const d = message?.data ?? {};
  return foundry.utils.getProperty(d, "flags.dnd5e.originatingMessage")
    ?? d["flags.dnd5e.originatingMessage"]
    ?? config?.event?.target?.closest?.("[data-message-id]")?.dataset?.messageId
    ?? null;
}

function usedFrom(origin) {
  if (!origin) return [];
  const used = new Set();
  for (const m of game.messages ?? []) {
    if (m.flags?.dnd5e?.originatingMessage !== origin) continue;
    for (const k of m.flags?.[MOD]?.applied ?? []) used.add(k);
  }
  return [...used];
}

function applyRiders(rolls, config, message) {
  if (!game.settings.get(MOD, "enabled")) return;
  const activity = config?.subject;
  const item = activity?.item;
  const actor = activity?.actor ?? item?.actor;
  if (!item || !actor || !rolls?.length) return;

  const features = featuresOf(actor);
  if (!features.length) return;

  const descs = rolls.map(r => r.terms.map(describe));
  const rollInfo = rolls.map((r, i) => {
    const types = core.termTypes(descs[i], r.options?.type, isType).filter(Boolean);
    return { type: r.options?.type ?? null, healing: isHealing(r.options?.type), types: [...new Set(types)] };
  });

  const origin = originOf(config, message);
  const plan = core.planRiders({
    features: features.map(f => ({ key: f.key, types: f.types })),
    item: {
      isSpell: item.type === "spell",
      level: item.system?.level,
      classIdentifier: item.system?.classIdentifier ?? "",
      casterClasses: Object.keys(actor.spellcastingClasses ?? {}),
      carries: carriedBy(activity)
    },
    rolls: rollInfo,
    abilities: Object.fromEntries(Object.entries(actor.system?.abilities ?? {}).map(([k, a]) => [k, a?.mod ?? 0])),
    activityType: activity.type,
    usedThisCasting: activity.type === "attack" ? usedFrom(origin) : []
  });
  for (const s of plan.skipped) {
    if (s.why === "no-type") console.warn(`${MOD} | ${s.key} on ${actor.name} has no damage type set — game.pentaryn.riders.setType(actor, "fire")`);
  }
  if (!plan.applied.length) return;

  const { OperatorTerm, NumericTerm } = foundry.dice.terms;
  const changed = new Set();
  for (const d of plan.dice) {
    const roll = rolls[d.roll];
    for (const i of core.planDice(descs[d.roll], { rollType: roll.options?.type, types: d.types, isType })) {
      const term = roll.terms[i];
      const next = core.withModifier(term.modifiers, d.modifier);
      if (next) { term.modifiers = next; changed.add(roll); }
    }
  }
  for (const b of plan.bonuses) {
    const roll = rolls[b.roll];
    for (const t of core.bonusTerms(b.value, { label: b.label, type: b.type, rollType: roll.options?.type })) {
      roll.terms.push(t.kind === "op"
        ? new OperatorTerm({ operator: t.operator })
        : new NumericTerm({ number: t.number, options: { flavor: t.flavor } }));
    }
    changed.add(roll);
  }
  for (const r of changed) r.resetFormula();

  // Stamp the message: what was applied (once-per-casting guard, the tray preset) and say so.
  message.data ??= {};
  foundry.utils.setProperty(message.data, `flags.${MOD}`, {
    applied: plan.applied, ignoreResistance: plan.ignoreResistance, origin
  });
  const notes = plan.applied.map(key => {
    const rule = core.ruleByKey(key);
    const bonus = plan.bonuses.find(b => b.key === key);
    if (bonus) return L("note.bonus", { label: rule.label, value: bonus.value > 0 ? `+${bonus.value}` : `${bonus.value}` });
    const die = plan.dice.find(d => d.key === key);
    if (die?.modifier.startsWith("min")) return L("note.min", { label: rule.label, n: die.modifier.slice(3) });
    if (die?.modifier.startsWith("r")) return L("note.reroll", { label: rule.label });
    return rule.label;
  });
  if (notes.length && typeof message.data.flavor === "string") message.data.flavor += ` · ${notes.join(" · ")}`;
}

Hooks.on("dnd5e.postDamageRollConfiguration", (rolls, config, dialog, message) => {
  try { applyRiders(rolls, config, message); } catch (err) { console.warn(`${MOD} | riders skipped`, err); }
});

// Elemental Adept: start the tray with the target's resistance to the feature's type ignored.
// The options object is the tray's per-target object, so this runs once per target and a GM who
// clicks the icon back on keeps that choice (the apply path copies the options, marker included).
Hooks.on("dnd5e.preCalculateDamage", (actor, damages, options) => {
  try {
    if (!options || options[PRESET]) return;
    const types = options.originatingMessage?.flags?.[MOD]?.ignoreResistance;
    if (!types?.length) return;
    options[PRESET] = true;
    if (!game.settings.get(MOD, "enabled")) return;
    const dr = actor?.system?.traits?.dr?.value;
    const hit = types.filter(t => dr?.has?.(t));
    if (!hit.length || options.ignore === true || options.ignore?.resistance === true) return;
    options.ignore ??= {};
    if (!(options.ignore.resistance instanceof Set)) options.ignore.resistance = new Set();
    for (const t of hit) options.ignore.resistance.add(t);
  } catch (err) { console.warn(`${MOD} | resistance preset skipped`, err); }
});

/* -------------------------------------------- */
/*  Hit Dice                                    */
/* -------------------------------------------- */

function hdPools(actor) {
  const sys = actor?.system;
  const hd = sys?.attributes?.hd;
  if (!hd) return [];
  if (sys.isNPC) {
    return [{ id: null, faces: Number(String(hd.denomination ?? "").replace(/^d/, "")) || 0, value: hd.value ?? 0, spent: hd.spent ?? 0 }];
  }
  return Object.values(actor.classes ?? {}).map(c => ({
    id: c.id,
    faces: Number(String(c.system?.hd?.denomination ?? "").replace(/^d/, "")) || 0,
    value: c.system?.hd?.value ?? 0,
    spent: c.system?.hd?.spent ?? 0
  }));
}

function hdSummary(actor) {
  const pools = hdPools(actor);
  return { value: pools.reduce((a, p) => a + p.value, 0), max: pools.reduce((a, p) => a + p.value + p.spent, 0) };
}

async function writePool(actor, pool, delta) {
  if (pool.id === null) return actor.update({ "system.attributes.hd.spent": Math.max(0, pool.spent + delta) });
  return actor.items.get(pool.id)?.update({ "system.hd.spent": Math.max(0, pool.spent + delta) });
}

/** Spend one Hit Die (the largest left, or of `faces` if given). Returns the faces spent, or null. */
async function spendHitDie(actor, { faces } = {}) {
  const pools = hdPools(actor);
  const pool = (faces && pools.find(p => p.faces === faces && p.value > 0)) || core.pickSpend(pools);
  if (!pool) return null;
  await writePool(actor, pool, +1);
  return pool.faces;
}

/** Give back one spent Hit Die (the largest spent). Returns the faces restored, or null. */
async function restoreHitDie(actor) {
  const pool = core.pickRestore(hdPools(actor));
  if (!pool) return null;
  await writePool(actor, pool, -1);
  return pool.faces;
}

/* -------------------------------------------- */
/*  B3 — Battle Medic                           */
/* -------------------------------------------- */

const HEALER = core.ruleByKey("healer");

function isBattleMedic(activity) {
  if (!activity) return false;
  if (activity.flags?.[MOD]?.flow === "battle-medic") return true;
  return core.normalizeName(activity.name) === "battle medic" && core.matchRule(HEALER, itemInfo(activity.item));
}

function soleTarget() {
  const targets = Array.from(game.user?.targets ?? []);
  return targets.length === 1 ? targets[0] : null;
}

/** Why Battle Medic can't run right now, or null. Checked before dnd5e spends the kit. */
function battleMedicBlock(healer, token) {
  if (!token?.actor) return L("battleMedic.needTarget");
  const target = token.actor;
  if (!target.system?.attributes?.hd) return L("battleMedic.noHitDice", { name: token.name });
  if (!core.pickSpend(hdPools(target))) return L("battleMedic.noHitDice", { name: token.name });
  if (!target.isOwner && !game.users.activeGM) return L("battleMedic.noGM");
  return null;
}

/**
 * Write side: the patient spends a `faces` Hit Die (or their largest) and regains `amount`.
 * Runs on a client that owns the target (the healer's own, or the active GM's). With `prof` (the GM
 * relay), `amount` is clamped to the die actually spent + PB, not to a size the sender claimed.
 */
async function applyBattleMedic(target, { faces, amount, prof = null }) {
  const spent = await spendHitDie(target, { faces });
  if (!spent) throw new Error(`${target.name} has no Hit Dice left`);
  if (prof !== null) amount = core.clampHeal(amount, spent, prof);
  const before = target.system.attributes.hp?.value ?? 0;
  await target.applyDamage(-Math.max(0, amount));
  const after = target.system.attributes.hp?.value ?? before;
  return { faces: spent, healed: after - before, hp: after, ...hdSummary(target) };
}

/** The flow, on the healer's client after the activity was used. */
async function runBattleMedic(healer, token) {
  const target = token.actor;
  const pool = core.pickSpend(hdPools(target));
  if (!pool) { ui.notifications.warn(L("battleMedic.noHitDice", { name: token.name })); return null; }
  const prof = healer.system?.attributes?.prof ?? 0;
  const roll = await new Roll(core.battleMedicFormula(pool.faces, prof)).evaluate();
  await roll.toMessage({
    speaker: ChatMessage.implementation.getSpeaker({ actor: healer }),
    flavor: L("battleMedic.flavor", { target: token.name, faces: pool.faces }),
    flags: { [MOD]: { flow: "battle-medic", target: target.uuid, faces: pool.faces } }
  });

  const amount = core.clampHeal(roll.total, pool.faces, prof);
  let result;
  try {
    if (target.isOwner) result = await applyBattleMedic(target, { faces: pool.faces, amount });
    else {
      const gm = game.users.activeGM;
      if (!gm) throw new Error("no GM");
      result = await gm.query(QUERY, { healerUuid: healer.uuid, targetUuid: target.uuid, faces: pool.faces, amount }, { timeout: 8000 });
    }
  } catch (err) {
    console.warn(`${MOD} | Battle Medic write failed`, err);
    ui.notifications.warn(L("battleMedic.failed", { name: token.name }));
    return null;
  }
  // Hit Dice left only to someone who could read them on the sheet anyway (not an NPC's to a player).
  const seesSheet = game.user.isGM || target.testUserPermission(game.user, "OBSERVER");
  ui.notifications.info(L(seesSheet ? "battleMedic.done" : "battleMedic.doneShort", {
    name: token.name, healed: result.healed, faces: result.faces, value: result.value, max: result.max
  }));
  return result;
}

Hooks.on("dnd5e.preUseActivity", (activity) => {
  try {
    if (!game.settings.get(MOD, "enabled") || !isBattleMedic(activity)) return;
    const why = battleMedicBlock(activity.actor, soleTarget());
    if (why) { ui.notifications.warn(why); return false; }
  } catch (err) { console.warn(`${MOD} | Battle Medic check skipped`, err); }
});

Hooks.on("dnd5e.postUseActivity", (activity) => {
  try {
    if (!game.settings.get(MOD, "enabled") || !isBattleMedic(activity)) return;
    const token = soleTarget();
    if (!token?.actor || !activity.actor) return;
    runBattleMedic(activity.actor, token).catch(err => console.warn(`${MOD} | Battle Medic failed`, err));
  } catch (err) { console.warn(`${MOD} | Battle Medic skipped`, err); }
});

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
  const item = actor?.items?.find(i => core.matchRule(HEALER, itemInfo(i)));
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
    flags: { [MOD]: { flow: "battle-medic" } }
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

/* -------------------------------------------- */
/*  B4 — Hit Dice −/+ on the character sheet    */
/* -------------------------------------------- */

function decorateHitDice(app, element) {
  const root = element instanceof HTMLElement ? element : app.element;
  const label = root?.querySelector(".meter.hit-dice")?.closest(".meter-group")?.querySelector(":scope > .label");
  if (!label) return;
  label.querySelector(".pr-hd")?.remove();
  const actor = app.document ?? app.actor;
  if (!game.settings.get(MOD, "hdControls") || app.isEditMode || !app.isEditable || !actor) return;

  const { value, max } = hdSummary(actor);
  const wrap = document.createElement("span");
  wrap.className = "pr-hd";
  const button = (act, icon, tip, disabled) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pr-hd-btn unbutton";
    b.dataset.prHd = act;
    b.dataset.tooltip = tip;
    b.setAttribute("aria-label", tip);
    b.disabled = disabled;
    b.innerHTML = `<i class="fa-solid ${icon}" inert></i>`;
    return b;
  };
  wrap.append(
    button("spend", "fa-minus", L("hd.spend"), value <= 0),
    button("restore", "fa-plus", L("hd.restore"), value >= max)
  );
  wrap.addEventListener("click", async ev => {
    const b = ev.target.closest("button[data-pr-hd]");
    if (!b || b.disabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    b.disabled = true;
    try {
      if (b.dataset.prHd === "spend") await spendHitDie(actor);
      else await restoreHitDie(actor);
    } catch (err) {
      console.warn(`${MOD} | hit die change failed`, err);
      b.disabled = false;
    }
  });
  label.append(wrap);
}

Hooks.on("renderCharacterActorSheet", (app, element) => {
  try { decorateHitDice(app, element); } catch (err) { console.warn(`${MOD} | hit dice controls skipped`, err); }
});

/* -------------------------------------------- */
/*  Console                                     */
/* -------------------------------------------- */

/**
 * Set the damage type a typed feature (Elemental Adept, Elemental Affinity) stands for.
 * `target` is that item, or an actor: then every typed feature item on it is set (only the one
 * rule's items when `ruleKey` is given). Returns the names of the items set.
 */
async function setType(target, type, ruleKey = null) {
  const t = String(type ?? "").toLowerCase().trim();
  if (!t) throw new Error("setType(item | actor, type, ruleKey?): type required");
  const items = target instanceof Actor
    ? featuresOf(target).filter(f => f.rule.types && (!ruleKey || f.key === ruleKey)).flatMap(f => f.items)
    : [target];
  const done = [];
  for (const item of items) {
    if (!item?.setFlag) continue;
    await item.setFlag(MOD, "damageType", t);
    done.push(item.name);
  }
  return done;
}

/**
 * The PHB models Elemental Affinity as damage activities the player clicks to add +CHA. With the
 * rider on, clicking one adds it twice. This pins the resolved type into the item's flag (the
 * activities were one way to resolve it) and deletes those activities. Typeless → left alone.
 */
async function retireManual(actor) {
  const out = [];
  for (const f of featuresOf(actor)) {
    if (f.key !== "elemental-affinity" || !f.types?.length) continue;
    for (const item of f.items) {
      if (!item.isOwner) continue;
      if (!item.getFlag(MOD, "damageType")) await item.setFlag(MOD, "damageType", f.types.length === 1 ? f.types[0] : f.types);
      for (const a of item.system.activities?.contents ?? []) {
        if (a.type !== "damage") continue;
        await item.deleteActivity(a.id);
        out.push(`${item.name}: ${a.name || a.id}`);
      }
    }
  }
  return out;
}

/** One row per (actor, feature): what is active, which types, and Battle Medic's state. */
function report(actor) {
  const actors = actor ? [actor] : game.actors.filter(a => a.type === "character");
  const rows = [];
  for (const a of actors) {
    for (const f of featuresOf(a)) {
      const row = { actor: a.name, rule: f.key, items: f.items.map(i => i.name).join(", ") };
      if (f.rule.types) {
        row.types = f.types.join(", ");
        row.status = f.types.length ? "active" : "NO TYPE — setType(actor, 'fire')";
      } else row.status = "active";
      if (f.key === "elemental-affinity") {
        const manual = f.items.flatMap(i => i.system.activities?.contents ?? []).filter(x => x.type === "damage").length;
        if (manual) row.manual = `${manual} +CHA activities left — retireManual(actor)`;
      }
      if (f.rule.effect?.unlessCarried) {
        // Spells that already add this ability by hand: the rider skips them (no double count).
        const ab = f.rule.effect.bonus;
        const hand = a.items.filter(i => i.type === "spell" && (i.system.activities?.contents ?? []).some(x => carriedBy(x).includes(ab)));
        if (hand.length) row.handAdded = `${hand.map(i => i.name).join(", ")} already add ${ab.toUpperCase()} — rider skips them`;
      }
      if (f.key === "healer") {
        const bm = f.items.flatMap(i => i.system.activities?.contents ?? []).find(x => isBattleMedic(x));
        const tgt = bm?.consumption?.targets?.find(t => t.type === "itemUses")?.target;
        row.battleMedic = !bm ? "not installed — installBattleMedic(actor)"
          : !tgt ? "installed, no kit linked"
          : a.items.has(tgt) ? `installed, kit ${a.items.get(tgt).name}` : `installed, kit ${tgt} MISSING`;
      }
      rows.push(row);
    }
  }
  console.table(rows);
  return rows;
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MOD, "enabled", {
    name: "PENTARYN_RIDERS.settings.enabled.name",
    hint: "PENTARYN_RIDERS.settings.enabled.hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MOD, "hdControls", {
    name: "PENTARYN_RIDERS.settings.hdControls.name",
    hint: "PENTARYN_RIDERS.settings.hdControls.hint",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => { for (const a of foundry.applications.instances.values()) if (a.document?.type === "character" && a.rendered) a.render(); }
  });

  // The relay. `user` is the sender as the server knows it. The sender must own the healer, the
  // healer must have the Healer feat, and the amount is clamped to what the die could roll.
  CONFIG.queries[QUERY] = async (data, { user } = {}) => {
    if (!game.user.isGM || !game.users.activeGM?.isSelf) throw new Error("not the active GM");
    const healer = await fromUuid(data?.healerUuid);
    const target = await fromUuid(data?.targetUuid);
    if (!(healer instanceof Actor) || !(target instanceof Actor)) throw new Error("unknown actor");
    if (!user || !healer.testUserPermission(user, "OWNER")) throw new Error("sender does not own the healer");
    if (!healer.items.some(i => core.matchRule(HEALER, itemInfo(i)))) throw new Error("healer has no Healer feat");
    const faces = Number(data?.faces) || 0;
    return applyBattleMedic(target, { faces, amount: data?.amount, prof: healer.system?.attributes?.prof ?? 0 });
  };
});

// pentaryn-importer replaces game.pentaryn with a frozen object in its own ready hook; defer a
// tick and rebuild rather than assign (same as pentaryn-journal / -portals).
Hooks.once("ready", () => setTimeout(() => {
  const api = {
    rules: core.RULES, featuresOf, report, setType, retireManual,
    installBattleMedic, battleMedic: runBattleMedic,
    spendHitDie, restoreHitDie, hdPools,
    preview: (formula, opts) => core.transformFormula(formula, { isType, ...opts }),
    core
  };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, riders: api };
  else { game.pentaryn ??= {}; game.pentaryn.riders = api; }
}, 0));
