/**
 * pentaryn-prompts — a level-N player character from the owned books, with dnd5e's own advancements.
 *
 * The Player's Handbook class/species/background items carry their rules as advancements (hit
 * points, saves, skills, armour/weapon training, weapon mastery, features, subclass, ASIs, size).
 * dnd5e only runs them through its AdvancementManager window. This file runs the same steps
 * headlessly: one manager per item (species, background, class at level N), each step applied with
 * the caller's choice or the advancement's own automatic value, steps for items the step granted
 * synthesised the way the manager does, then committed with `performBulkUpdate` exactly as the
 * manager's own completion does. Nothing is hand-computed: HP, proficiencies, speed, senses, spell
 * slots and casting ability are whatever dnd5e derives from the advanced actor.
 *
 * What the advancement could not decide on its own and the caller did not say is chosen by a
 * stated default and listed in `report.defaults`, so a reviewer sees every guess.
 */

import { MODULE, codedError } from "./geometry-core.mjs";
import {
  ABILITIES, validateAbilities, checkIncrease, defaultIncrease, matchTraitKeys, lookupChoice, sameName,
  checkChoiceKeys, nearestNames, defaultLanguagePicks, areLanguageKeys, fixAttunement, problemsText,
  startingEquipmentPlan, focusMissing
} from "./build-core.mjs";

export const CHARACTER_FOLDER = "Foundry MCP Characters";

/** Owned books first, then the 2024 SRD. Missing packs are skipped. */
const PACKS = {
  class: ["dnd-players-handbook.classes", "dnd5e.classes24"],
  subclass: ["dnd-players-handbook.classes", "dnd5e.classes24"],
  race: ["dnd-players-handbook.origins", "dnd5e.origins24"],
  background: ["dnd-players-handbook.origins", "dnd5e.origins24"],
  feat: ["dnd-players-handbook.feats", "dnd-players-handbook.origins", "dnd-players-handbook.classes", "dnd5e.feats24"],
  spell: ["dnd-players-handbook.spells", "dnd5e.spells24"],
  item: ["dnd-players-handbook.equipment", "dnd5e.equipment24"]
};

const indexCache = new Map();
async function indexOf(packId) {
  if (indexCache.has(packId)) return indexCache.get(packId);
  const pack = game.packs.get(packId);
  const idx = pack ? await pack.getIndex({ fields: ["type", "system.identifier"] }) : null;
  indexCache.set(packId, idx);
  return idx;
}

/**
 * A compendium Item by uuid or by name (`kind` picks the packs and the item type).
 * Names match case- and word-order-insensitively ("Infernal Tiefling" finds "Tiefling, Infernal").
 */
export async function findItem(ref, kind) {
  if (!ref) return null;
  if (typeof ref === "object" && ref.documentName === "Item") return ref;
  const s = String(ref).trim();
  if (/^(Compendium|Item)\./.test(s)) {
    const doc = await fromUuid(s);
    if (!(doc instanceof Item)) throw codedError("BAD_SPEC", `${s} is not an item`);
    return doc;
  }
  const type = { class: "class", subclass: "subclass", race: "race", background: "background", spell: "spell" }[kind] ?? null;
  for (const id of PACKS[kind] ?? PACKS.item) {
    const idx = await indexOf(id);
    if (!idx) continue;
    const ok = e => !type || e.type === type;
    const hit = idx.find(e => ok(e) && e.name.toLowerCase() === s.toLowerCase()) ?? idx.find(e => ok(e) && sameName(e.name, s));
    if (hit) return game.packs.get(id).getDocument(hit._id);
  }
  return null;
}

const TYPE_OF = { class: "class", subclass: "subclass", race: "race", background: "background", spell: "spell", feat: "feat" };

/** The nearest names in the packs `kind` searches, for a "did you mean" (`Spellbook` → `Book`). */
export async function suggest(ref, kind, n = 3) {
  const type = TYPE_OF[kind] ?? null;
  const names = [];
  for (const id of PACKS[kind] ?? PACKS.item) {
    const idx = await indexOf(id);
    if (!idx) continue;
    for (const e of idx) if (!type || e.type === type) names.push(e.name);
  }
  return nearestNames(ref, names, n);
}

/** `no item "Spellbook" in … — nearest: Book` (plus the inline-data hint for gear). */
export async function notFound(what, ref, kind, hint = "") {
  const near = await suggest(String(ref), kind);
  return `no ${what} "${ref}" in ${(PACKS[kind] ?? PACKS.item).join(", ")}${near.length ? ` — nearest: ${near.map(n => `"${n}"`).join(", ")}` : ""}${hint}`;
}

/* ── what the advancements will ask (dry-run check of `choices` keys) ───── */

function advancementsOf(item) {
  const byId = item?.advancement?.byId;
  if (byId && Object.keys(byId).length) return Object.values(byId);
  return [...(item?.system?.advancement ?? [])];
}

function levelsOf(adv) {
  try {
    const l = adv.levels;
    if (Array.isArray(l) && l.length) return l.map(Number);
  } catch { /* data-only advancement */ }
  const ch = adv.configuration?.choices;
  if (ch && typeof ch === "object" && !Array.isArray(ch) && !(ch instanceof Set)) {
    const ks = Object.keys(ch).map(Number).filter(Number.isFinite);
    if (ks.length) return ks;
  }
  return [Number(adv.level ?? 0)];
}

async function docAt(uuid) {
  try { return uuid ? await fromUuid(uuid) : null; } catch { return null; }
}

/** The words a choice value names: "Tough", ["Guidance", "Light"], {items: […]}, {spells: […]}. */
function choiceWords(v) {
  if (v === undefined || v === null) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.filter(x => typeof x === "string");
  if (typeof v === "object") return [...choiceWords(v.items), ...choiceWords(v.spells)];
  return [];
}

/**
 * The NOT CHOSEN line for a pool-less spell/feat choice (Magic Initiate), with the exact shape to
 * pass: a plain list, or `{spells, ability}` when the casting ability is a choice too.
 */
function notChosenHint(itemName, title, cfg, n, kind = "spell") {
  const list = cfg.restriction?.list ? [...cfg.restriction.list].map(x => String(x).replace(/^class:/, "")).join("/") : "";
  const abil = cfg.spell?.ability?.size > 1 ? [...cfg.spell.ability] : [];
  const names = Array.from({ length: n }, () => `"<${kind}>"`).join(", ");
  return `${itemName}: ${title}: NOT CHOSEN — pass choices["${itemName}: ${title}"] = [${names}]` +
    `${list ? ` (${n} from the ${list} list${n > 1 ? "s" : ""})` : ""}` +
    `${abil.length ? `, or {${kind}s: [${names}], ability: "${abil.join("|")}"} to set the casting ability (default ${abil[0]})` : ""}`;
}

/** A pool entry's name the way the real run reads it (namesFor): index first, then the document. */
async function poolName(u) {
  return fromUuidSync(u)?.name ?? (await docAt(u))?.name ?? String(u);
}

/**
 * Every advancement a build of `docs` at `level` will step through, as `{item, title, type, levels}`:
 * species, background, class levels 1..N, subclass (each capped at the character's level: a High
 * Elf's level-5 grant is never stepped by a level-3 build), the items they grant, and the items the
 * caller picked through `choices` (a feat for Versatile or an ASI, a Fighting Style) — which have
 * their own (`"Magic Initiate: Learn Two Cantrips"`).
 *
 * Choice VALUES are checked here too, against what the real run would do with them (§13 dry run):
 * an ASI must be `{feat}` naming a feat that exists or an increase the advancement allows (the real
 * run throws on both), and an ItemChoice's names must match its pool, or the books for a pool-less
 * feat or spell choice (the real run would silently pick the pool's first entries or drop the
 * name). Each failure is a line in `problems`; resolveCharacter throws them as one BAD_SPEC. A spell
 * choice with no fixed list that nobody answered (Magic Initiate) is a line in `unanswered`: the real
 * run leaves it NOT CHOSEN, and the dry run says so before anything is built.
 * → `{advs, problems, unanswered}`.
 */
async function collectAdvancements(docs, level, choices) {
  const out = [];
  const problems = [];
  const unanswered = [];
  const seen = new Set();
  const visit = async (item, cap, depth) => {
    if (!item || depth > 4) return;
    const key = item.uuid ?? item.id ?? item.name;
    if (seen.has(key)) return;
    seen.add(key);
    for (const adv of advancementsOf(item)) {
      const title = adv.title || adv.constructor?.metadata?.title || adv.type;
      let levels = levelsOf(adv);
      if (cap !== null) levels = levels.filter(l => l <= cap);
      if (!levels.length) continue;
      const entry = { item: item.name, title, type: adv.type, levels };
      out.push(entry);
      const cfg = adv.configuration ?? {};
      if (adv.type === "ItemGrant") {
        for (const i of cfg.items ?? []) await visit(await docAt(i.uuid), cap, depth + 1);
        continue;
      }
      if (adv.type !== "ItemChoice" && adv.type !== "AbilityScoreImprovement") continue;
      // what the caller chose here: the key the real run's lookup would find, level by level
      const done = new Set();
      for (const l of levels) {
        const hit = lookupChoice(choices, { item: item.name, title, level: l, type: adv.type });
        if (!hit && adv.type === "ItemChoice" && cfg.type === "spell" && !(cfg.pool ?? []).length && (cfg.choices?.[l]?.count ?? 0) > 0) {
          unanswered.push(`${notChosenHint(item.name, title, cfg, cfg.choices[l].count)}; the real run would leave it empty`);
        }
        if (!hit || done.has(hit[0])) continue;
        done.add(hit[0]);
        const [k, v] = hit;
        const where = `choices["${k}"] (${item.name}: ${title}${l ? ` at level ${l}` : ""})`;
        if (adv.type === "AbilityScoreImprovement") {
          if (v && typeof v === "object" && !Array.isArray(v) && v.feat) {
            const feat = await findItem(v.feat, "feat");
            if (!feat) problems.push(`${where}: ${await notFound("feat", v.feat, "feat")}`);
            else await visit(feat, null, depth + 1);
            continue;
          }
          if (!v || typeof v !== "object" || Array.isArray(v)) {
            problems.push(`${where}: give {feat: "<name>"} or increases like {str: 2} / {str: 1, cha: 1}, got ${JSON.stringify(v)}`);
            continue;
          }
          const c = checkIncrease(v.assignments ?? v, { points: cfg.points, cap: cfg.cap ?? 2, locked: [...(cfg.locked ?? [])] });
          if (!c.ok) problems.push(`${where}: ${c.errors.join("; ")}`);
          continue;
        }
        const words = choiceWords(v);
        if (!words.length) continue;
        const pool = (cfg.pool ?? []).map(p => p.uuid).filter(Boolean);
        if (pool.length) {
          const names = await Promise.all(pool.map(poolName));
          const tail = n => String(n).split(/:\s*/).pop();
          for (const w of words) {
            const i = pool.indexOf(w) >= 0 ? pool.indexOf(w)
              : names.findIndex(n => sameName(n, w)) >= 0 ? names.findIndex(n => sameName(n, w))
                : names.findIndex(n => sameName(tail(n), w));
            if (i < 0) {
              const near = nearestNames(w, names.map(tail), 3);
              problems.push(`${where}: "${w}" is not one of its options${near.length ? ` (nearest: ${near.join(", ")})` : ""}; options: ${names.map(tail).join(", ")}`);
              continue;
            }
            await visit(await docAt(pool[i]), null, depth + 1);
          }
          continue;
        }
        const kind = cfg.type === "spell" ? "spell" : "feat";
        for (const w of words) {
          const doc = await findItem(w, kind);
          if (!doc) { problems.push(`${where}: ${await notFound(kind, w, kind)}`); continue; }
          if (kind === "feat") await visit(doc, null, depth + 1);
        }
      }
    }
  };
  await visit(docs.species, level, 0);
  await visit(docs.background, level, 0);
  await visit(docs.cls, level, 0);
  if (docs.subclass) await visit(docs.subclass, level, 0);
  return { advs: out, problems, unanswered: [...new Set(unanswered)] };
}

/* ── resolving the spec (dry run and real run) ─────────────────────────── */

/** `startingEquipment` → `{class, background}` options ("A" gear | "B" gold | "none"), or a problem. */
export function startingOptions(v) {
  if (v === undefined || v === null || v === false) return { class: "none", background: "none" };
  const one = x => {
    const s = String(x === true ? "A" : x).toUpperCase();
    return ["A", "B", "NONE"].includes(s) ? (s === "NONE" ? "none" : s) : null;
  };
  if (typeof v === "object" && !Array.isArray(v)) {
    const bad = Object.keys(v).filter(k => !["class", "background"].includes(k));
    const c = one(v.class ?? "none"), b = one(v.background ?? "none");
    if (bad.length || !c || !b) return { problem: `startingEquipment: give "A" (the book's gear), "B" (its gold instead), "none", or {class, background} with those values; got ${JSON.stringify(v)}` };
    return { class: c, background: b };
  }
  const o = one(v);
  if (!o) return { problem: `startingEquipment: give "A" (the book's gear), "B" (its gold instead), "none", or {class, background}; got ${JSON.stringify(v)}` };
  return { class: o, background: o };
}

/**
 * Resolve and validate a `character` spec without writing anything. Every problem is collected
 * before anything throws (§14): a bad species, an unknown choice key, an off-list spell and a
 * missing item come back as ONE BAD_SPEC listing all four, not four dry runs in a row.
 * → `{docs: {species, background, cls, subclass}, level, abilities, size, warnings, planWarnings,
 *    defaults, spells, gear, starting}`.
 */
export async function resolveCharacter(w) {
  const problems = [];
  const fail = msg => problems.push(msg);
  const level = Number(w.level ?? 1);
  const levelOk = Number.isInteger(level) && level >= 1 && level <= 20;
  if (!levelOk) fail("level must be 1-20");
  if (!w.name) fail("needs a name");
  for (const k of ["class", "species", "background"]) if (!w[k]) fail(`needs ${k}`);
  const v = validateAbilities(w.abilities, w.abilityMethod ?? "array");
  if (!v.ok) fail(`abilities: ${v.errors.join("; ")}`);
  const find = async (ref, kind, label) => {
    if (!ref) return null;
    try {
      const doc = await findItem(ref, kind);
      if (!doc) fail(`${label}: ${await notFound(label, ref, kind)}`);
      return doc;
    } catch (err) { fail(`${label}: ${err.message ?? err}`); return null; }
  };
  const cls = await find(w.class, "class", "class");
  const species = await find(w.species, "race", "species");
  const background = await find(w.background, "background", "background");
  let subclass = null;
  if (w.subclass) {
    subclass = await find(w.subclass, "subclass", "subclass");
    const ci = cls?.system.identifier, si = subclass?.system.classIdentifier;
    if (ci && si && ci !== si) fail(`subclass: ${subclass.name} is a ${si} subclass, not ${cls.name}`);
  }
  if (cls && levelOk) {
    const subLevel = [...(cls.system.advancement ?? [])].find(a => a.type === "Subclass")?.level ?? 3;
    if (level >= subLevel && !w.subclass) fail(`subclass: ${cls.name} ${level} needs a subclass (chosen at level ${subLevel})`);
  }
  const warnings = [...(v.warnings ?? [])];
  // the token footprint: species size (a choice when the species allows two)
  let size = "med";
  if (species) {
    const sizeAdv = [...(species.system.advancement ?? [])].find(a => a.type === "Size");
    const sizes = sizeAdv ? [...(sizeAdv.configuration.sizes ?? [])] : ["med"];
    const wanted = sizeChoice(w, species.name, sizeAdv);
    size = wanted && sizes.includes(wanted) ? wanted : sizes.includes("med") ? "med" : (sizes[0] ?? "med");
    if (wanted && !sizes.includes(wanted)) warnings.push(`${species.name} cannot be ${wanted}; using ${size}`);
  }
  const docs = { species, background, cls, subclass };

  // choices: every key must name an advancement this build steps through, and every value must be
  // one the real run can use (§13). Walked even with no choices, for the dry run's NOT CHOSEN lines.
  const choices = w.choices && typeof w.choices === "object" ? w.choices : {};
  const { advs, problems: valueProblems, unanswered } = await collectAdvancements(docs, levelOk ? level : 20, choices);
  for (const p of valueProblems) fail(`choices: ${p}`);
  if (Object.keys(choices).length) {
    if (cls && species && background) {
      const c = checkChoiceKeys(choices, advs);
      if (!c.ok) {
        const hints = c.unknown.map(k => {
          const near = nearestNames(k.replace(/@\d+$/, ""), c.known.map(x => x.replace(/@[\d|]+$/, "")), 2);
          return near.length ? `"${k}" (nearest: ${near.join(", ")})` : `"${k}"`;
        });
        fail(`choices: unknown key(s) ${hints.join(", ")}; known for ${cls.name} ${level}, ${species.name}, ${background.name}: ${c.known.join(", ")}`);
      }
    } else {
      // checked against what did resolve; a key of the missing item is named as possibly its
      const missing = [!cls && "class", !species && "species", !background && "background"].filter(Boolean).join(", ");
      const c = checkChoiceKeys(choices, advs);
      if (!c.ok) fail(`choices: unknown key(s) ${c.unknown.map(k => `"${k}"`).join(", ")} — unless they belong to the ${missing} above, which did not resolve; known so far: ${c.known.join(", ")}`);
    }
  }

  // spells and the spellbook: found, and on the class list (unless allowOffList)
  const spells = { prepared: [], book: [] };
  for (const [field, list] of [["spells", "prepared"], ["spellbook", "book"]]) {
    for (const ref of w[field] ?? []) {
      const spell = await findItem(ref, "spell").catch(() => null);
      if (!spell) { fail(`${field}: ${await notFound("spell", ref, "spell")}`); continue; }
      if (cls && onClassList(cls, spell) === false && !w.allowOffList) {
        fail(`${field}: ${spell.name} is not on the ${cls.name} spell list (allowOffList: true if a feature grants it)`);
        continue;
      }
      spells[list].push(spell);
    }
  }
  if (spells.book.length && cls && cls.system.identifier !== "wizard") warnings.push(`spellbook given for a ${cls.name}; only a wizard keeps one (added unprepared)`);

  // gear: by name or uuid from the books, or inline {data}
  const gear = [];
  const defaults = [];
  for (const g of w.items ?? []) {
    const spec = typeof g === "string" ? { name: g } : (g ?? {});
    if (spec.data) {
      if (!spec.data.name || !spec.data.type) { fail("items[].data needs name and type"); continue; }
      const data = foundry.utils.deepClone(spec.data);
      const note = fixAttunement(data);
      if (note) defaults.push(note);
      gear.push({ spec, data });
      continue;
    }
    const src = await findItem(spec.uuid ?? spec.name, "item").catch(() => null);
    if (!src) { fail(`items: ${await notFound("item", spec.uuid ?? spec.name, "item", "; or pass {data: {name, type, system}} for a custom item")}`); continue; }
    gear.push({ spec, src });
  }
  const starting = startingOptions(w.startingEquipment);
  if (starting.problem) fail(starting.problem);

  const msg = problemsText("character", problems);
  if (msg) throw codedError("BAD_SPEC", msg);
  // planWarnings: what only the dry run needs to say when its preview cannot run
  return { docs, level, abilities: v.abilities, size, warnings, planWarnings: unanswered, defaults, spells, gear, starting };
}

const SIZE_WORDS = { tiny: "tiny", small: "sm", sm: "sm", medium: "med", med: "med", large: "lg", lg: "lg" };

function sizeChoice(w, itemName, adv) {
  if (w.size) return SIZE_WORDS[String(w.size).toLowerCase()] ?? null;
  if (!adv) return null;
  const hit = lookupChoice(w.choices, { item: itemName, title: adv.title, level: 0, type: "Size" });
  return hit ? (SIZE_WORDS[String(hit[1]).toLowerCase()] ?? null) : null;
}

/* ── the headless advancement run ──────────────────────────────────────── */

/** Same as AdvancementManager#synthesizeSteps for added items (forward only). */
function synthesize(M, m, idx, pre) {
  const initialIds = new Set(m.steps.filter(s => !s.synthetic && s.flow?.item).map(s => s.flow.item.id));
  const preIds = new Set(pre.map(i => i.id));
  const getLevel = (step, linked) => (linked ? undefined : step?.level) ?? step?.flow?.level ?? step?.class?.level ?? step?.level;
  for (const item of m.clone.items) {
    if (preIds.has(item.id) || initialIds.has(item.id) || !item.hasAdvancement) continue;
    const linked = item.system.advancementClassLinked;
    let maximumLevel = 0, handled = -Infinity;
    for (let j = idx; j < m.steps.length; j++) {
      const thisLevel = getLevel(m.steps[j], linked);
      const nextLevel = getLevel(m.steps[j + 1], linked);
      if (maximumLevel < thisLevel) maximumLevel = thisLevel;
      if ((thisLevel <= handled) || (thisLevel >= nextLevel)) continue;
      const start = Math.max(0, handled + 1);
      const end = nextLevel === undefined ? maximumLevel : (nextLevel - 1);
      const steps = Array.fromRange(end + 1 - start, start)
        .flatMap(l => M.flowsForLevel(item, l, { findExisting: m.steps }))
        .map(flow => ({ type: "forward", flow, synthetic: true }));
      m.steps.splice(j + 1, 0, ...steps);
      j += steps.length;
      handled = end;
    }
  }
}

function labelsOf(choices) {
  const out = {};
  try {
    for (const [k, v] of Object.entries(choices?.toObject?.() ?? choices ?? {})) {
      out[k] = v?.label ?? v;
      if (v?.children) Object.assign(out, labelsOf(v.children));
    }
  } catch { /* labels are a nicety */ }
  return out;
}

/** The data one advancement step is applied with: the caller's choice, or a stated default. */
async function chooseData(adv, level, item, ctx) {
  const where = `${item.name}: ${adv.title}${level ? ` (level ${level})` : ""}`;
  const hit = lookupChoice(ctx.choices, { item: item.name, title: adv.title, level, type: adv.type });
  if (hit) ctx.used.add(hit[0]);
  const given = hit?.[1];
  const def = msg => ctx.report.defaults.push(`${where}: ${msg}`);

  switch (adv.type) {
    case "HitPoints": {
      if (level === 1 && item.isOriginalClass) return { [level]: "max" };
      const mode = given ?? ctx.hp ?? "avg";
      return { [level]: mode === "max" ? "max" : Number.isInteger(mode) ? mode : "avg" };
    }
    case "ScaleValue": return {};
    case "Size": return { size: ctx.size };
    case "Subclass": {
      if (!ctx.subclass) throw codedError("BAD_SPEC", `${where}: no subclass given`);
      return { uuid: ctx.subclass.uuid };
    }
    case "ItemGrant": {
      const auto = await adv.automaticApplicationValue(level);
      const cfg = adv.configuration;
      const ability = given?.ability ?? (typeof given === "string" ? given : null) ?? cfg.spell?.ability?.first?.();
      if (auto) return given?.ability ? { ...auto, ability: given.ability } : auto;
      if (cfg.spell?.ability?.size > 1 && !given) def(`spellcasting ability ${ability} (choices: ${[...cfg.spell.ability].join(", ")})`);
      const selected = cfg.items.filter(i => !i.optional).map(i => i.uuid);
      return { ability, selected: Array.isArray(given) ? await uuidsFor(given, cfg.items.map(i => i.uuid)) : selected };
    }
    case "ItemChoice": {
      const n = adv.configuration.choices?.[level]?.count ?? 0;
      if (!n) return { selected: [] };
      const pool = (adv.configuration.pool ?? []).map(p => p.uuid);
      const ability = given?.ability ?? adv.configuration.spell?.ability?.first?.();
      const words = given?.items ?? given?.spells ?? (given && typeof given === "object" && !Array.isArray(given) ? [] : [].concat(given ?? []));
      // a spell choice without a fixed pool (Magic Initiate): the spells come from a list, by name
      if (!pool.length) {
        const kind = adv.configuration.type === "spell" ? "spell" : "feat";
        const docs = (await Promise.all(words.map(x => findItem(x, kind)))).filter(Boolean);
        if (!docs.length) {
          ctx.report.warnings.push(notChosenHint(item.name, adv.title, adv.configuration, n, kind) + (level ? ` (level ${level})` : ""));
          return null;
        }
        return { selected: docs.slice(0, n).map(d => d.uuid), ability };
      }
      let picks = words.length ? await uuidsFor(words, pool) : [];
      if (!picks.length) {
        picks = pool.slice(0, n);
        const names = await namesFor(picks);
        def(`picked ${names.join(", ")} (${words.length ? `no match for ${words.join(", ")}` : "no choice given"}; pool: ${(await namesFor(pool)).join(", ")})`);
      }
      return { selected: picks.slice(0, n), ability };
    }
    case "Trait": {
      const auto = await adv.automaticApplicationValue(level, { initial: true });
      const chosen = new Set(auto?.chosen ?? []);
      const { available } = await adv.unfulfilledChoices();
      const open = (available ?? []).filter(a => a.choices?.asSet?.().size > 1);
      if (!open.length) return { chosen: [...chosen] };
      const all = new Set(open.flatMap(a => [...a.choices.asSet()]));
      const labels = Object.assign({}, ...open.map(a => labelsOf(a.choices)));
      // a word naming what the advancement already grants ("common" in Choose Languages) is no error
      const fresh = matchTraitKeys([].concat(given ?? []), [...chosen], labels).unmatched;
      const { keys, unmatched } = matchTraitKeys(fresh, [...all].filter(k => !chosen.has(k)), labels);
      if (unmatched.length) ctx.report.warnings.push(`${where}: no such choice ${unmatched.join(", ")} (choices: ${[...all].map(k => k.split(":").pop()).join(", ")})`);
      const picks = keys.slice(0, open.length);
      if (picks.length < open.length) {
        const free = [...all].filter(k => !chosen.has(k) && !picks.includes(k));
        // languages: the species' own tongue and the common ones, not the book's first entries (§13)
        const langs = areLanguageKeys(free);
        const rest = langs ? defaultLanguagePicks(free, ctx.speciesName, open.length - picks.length) : free.slice(0, open.length - picks.length);
        if (rest.length) {
          def(`picked ${rest.map(k => labels[k] ?? k.split(":").pop()).join(", ")} (choose ${open.length}` +
            `${langs ? `; ${ctx.speciesName ?? "species"} default, then the common tongues` : ""}; from ${[...all].map(k => k.split(":").pop()).join(", ")})`);
        }
        picks.push(...rest);
      }
      for (const k of picks) chosen.add(k);
      return { chosen: [...chosen] };
    }
    case "AbilityScoreImprovement": {
      const cfg = adv.configuration;
      const locked = [...(cfg.locked ?? [])];
      if (given?.feat) {
        const feat = await findItem(given.feat, "feat");
        if (!feat) throw codedError("BAD_SPEC", `${where}: no feat "${given.feat}"`);
        return { type: "feat", uuid: feat.uuid };
      }
      const scores = Object.fromEntries(ABILITIES.map(k => [k, adv.actor.system._source.abilities[k]?.value ?? 10]));
      let assign = given && typeof given === "object" ? given.assignments ?? given : null;
      if (assign) {
        const c = checkIncrease(assign, { points: cfg.points, cap: cfg.cap ?? 2, locked });
        if (!c.ok) throw codedError("BAD_SPEC", `${where}: ${c.errors.join("; ")}`);
        assign = c.assignments;
      } else {
        assign = defaultIncrease(scores, { points: cfg.points, cap: cfg.cap ?? 2, locked, prefer: ctx.primary });
        def(`ability increase ${Object.entries(assign).map(([k, v]) => `${k} +${v}`).join(", ")} (no choice given)`);
      }
      return { type: "asi", assignments: assign };
    }
    default: {
      const auto = await adv.automaticApplicationValue(level);
      if (auto !== false) return auto;
      if (given !== undefined) return given;
      ctx.report.warnings.push(`${where}: ${adv.type} needs a manual choice; skipped`);
      return null;
    }
  }
}

async function uuidsFor(words, pool) {
  const out = [];
  const names = await namesFor(pool);
  for (const w of words) {
    const s = String(w);
    const i = pool.indexOf(s);
    if (i >= 0) { out.push(pool[i]); continue; }
    // "Protector" finds "Divine Order: Protector"
    const tail = n => String(n).split(/:\s*/).pop();
    const j = names.findIndex(n => sameName(n, s)) >= 0 ? names.findIndex(n => sameName(n, s)) : names.findIndex(n => sameName(tail(n), s));
    if (j >= 0) out.push(pool[j]);
  }
  return out;
}

async function namesFor(uuids) {
  return Promise.all(uuids.map(async u => fromUuidSync(u)?.name ?? (await fromUuid(u))?.name ?? u));
}

/**
 * Run one manager's steps headlessly, then commit like AdvancementManager#complete. A ghost (the
 * dry run's unsaved actor, §14) commits nothing: the manager's advanced clone IS the next ghost.
 * → the actor to carry on with.
 */
async function advance(actor, itemData, ctx) {
  const M = dnd5e.applications.advancement.AdvancementManager;
  const m = M.forNewItem(actor, itemData);
  for (let i = 0; i < m.steps.length; i++) {
    const step = m.steps[i];
    if (step.class) step.class.item.updateSource({ "system.levels": step.class.level });
    const pre = Array.from(m.clone.items);
    if (step.type === "forward" && step.flow?.advancement) {
      const adv = step.flow.advancement;
      const item = step.flow.item ?? adv.item;
      const data = await chooseData(adv, step.flow.level, item, ctx);
      if (data !== null) await adv.apply(step.flow.level, data, {});
    }
    synthesize(M, m, i, pre);
    m.clone.reset();
  }
  if (ctx.ghost) return m.clone;
  const updates = m.clone.toObject();
  const items = updates.items;
  delete updates.items;
  const toCreate = [], toUpdate = [];
  const toDelete = actor.items.map(i => i.id);
  for (const it of items) {
    if (!actor.items.get(it._id)) toCreate.push(it);
    else { toUpdate.push(it); toDelete.findSplice(id => id === it._id); }
  }
  await actor.performBulkUpdate(
    { actor: updates, create: toCreate, delete: toDelete, item: toUpdate },
    { isAdvancement: true, updateOptions: { diff: false, recursive: false } }
  );
  return actor;
}

async function linkOrigin(actor, type, ghost = false) {
  const it = actor.items.find(i => i.type === type);
  if (!it || actor.system._source.details?.[type] === it.id) return;
  if (ghost) { actor.updateSource({ [`system.details.${type}`]: it.id }); actor.reset(); }
  else await actor.update({ [`system.details.${type}`]: it.id });
}

/** Add item data to the actor: created for real, or written into a ghost's source. */
async function addItems(actor, data, ghost) {
  if (!data.length) return;
  if (!ghost) {
    // keepId: a pack's contents point at their container by the _id createWithContents gave it
    await actor.createEmbeddedDocuments("Item", data, { keepId: true });
    return;
  }
  actor.updateSource({ items: data.map(d => ({ ...d, _id: d._id ?? foundry.utils.randomID() })) });
  actor.reset();
}

/* ── spells and gear ───────────────────────────────────────────────────── */

function onClassList(cls, spell) {
  try {
    const list = dnd5e.registry.spellLists.forType("class", cls.system.identifier);
    return list ? list.has(spell) : null;
  } catch { return null; }
}

async function addSpells(actor, cls, refs, { prepared, report, allowOffList, ghost }) {
  const out = [];
  for (const ref of refs ?? []) {
    const spell = await findItem(ref, "spell");
    if (!spell) { report.warnings.push(`spell "${ref}" not found`); continue; }
    const on = onClassList(cls, spell);
    if (on === false && !allowOffList) {
      throw codedError("BAD_SPEC", `${spell.name} is not on the ${cls.name} spell list (allowOffList: true if a feature grants it)`);
    }
    const have = actor.items.find(i => i.type === "spell" && i.name === spell.name);
    if (have) {
      report.warnings.push(`${spell.name} not added: already granted (${have.system.sourceItem ?? "?"}, ${have.system.prepared === 2 ? "always prepared" : "prepared"}) — pick another`);
      continue;
    }
    const data = game.items.fromCompendium(spell);
    data.system.method = "spell";
    data.system.prepared = spell.system.level === 0 ? 1 : (prepared ? 1 : 0);
    data.system.sourceItem = `class:${cls.system.identifier}`;
    data._id = foundry.utils.randomID();
    out.push(data);
  }
  await addItems(actor, out, ghost);
  return out.map(d => d.name);
}

/**
 * One compendium item as item data, a container WITH its contents (a Priest's Pack arrives packed,
 * as dnd5e's own drop does), quantity and equipped set on the top item. → `[data, …]`.
 */
async function itemDataFor(src, { quantity = null, equipped = null, rename = null } = {}) {
  const Item5e = CONFIG.Item.documentClass;
  let list = null;
  if (src.type === "container" && typeof Item5e.createWithContents === "function") {
    try { list = await Item5e.createWithContents([src]); } catch { list = null; }
  }
  if (!list?.length) list = [{ ...game.items.fromCompendium(src), _id: foundry.utils.randomID() }];
  const top = list[0];
  if (quantity && top.system) top.system.quantity = quantity;
  if (["weapon", "equipment"].includes(top.type) && top.system) top.system.equipped = equipped ?? true;
  if (rename) top.name = rename;
  return list;
}

async function addGear(actor, refs, report, ghost) {
  const out = [];
  for (const g of refs ?? []) {
    // resolved at the dry run: {spec, src} | {spec, data}; a bare spec (older callers) is looked up here
    if (g?.data && g.spec) {
      const d = foundry.utils.deepClone(g.data);
      d._id = foundry.utils.randomID();
      if (g.spec.quantity && d.system) d.system.quantity = g.spec.quantity;
      out.push(d);
      continue;
    }
    const spec = g?.spec ?? (typeof g === "string" ? { name: g } : g);
    const src = g?.src ?? await findItem(spec.uuid ?? spec.name, "item");
    if (!src) { report.warnings.push(`item "${spec.uuid ?? spec.name}" not found`); continue; }
    out.push(...await itemDataFor(src, { quantity: spec.quantity, equipped: spec.equipped,
      rename: spec.name && src.name !== spec.name && spec.uuid ? spec.name : null }));
  }
  await addItems(actor, out, ghost);
  return out.filter(d => !d.system?.container).map(d => d.name);
}

/* ── starting equipment (§14) ──────────────────────────────────────────── */

const titleCase = s => String(s ?? "").replace(/\b\w/g, c => c.toUpperCase());
const tailOf = u => String(u ?? "").split(".").pop();

/** The owned book's copy of an SRD item uuid (same id tail), else the uuid itself. */
async function bookCopy(uuid) {
  const phb = `Compendium.dnd-players-handbook.equipment.Item.${tailOf(uuid)}`;
  return (await docAt(phb)) ?? (await docAt(uuid));
}

/** What the gear the caller named already covers: names, source uuids, tool types, weapon/armor keys. */
function coverOf(resolved) {
  const docs = (resolved.gear ?? []).map(g => g.src ?? g.data).filter(Boolean);
  return {
    names: new Set(docs.map(d => String(d.name).toLowerCase())),
    tails: new Set((resolved.gear ?? []).map(g => tailOf(g.src?.uuid)).filter(Boolean)),
    toolTypes: new Set(docs.filter(d => d.type === "tool").map(d => d.system?.type?.value).filter(Boolean)),
    weaponKinds: new Set(docs.filter(d => d.type === "weapon").map(d => d.system?.type?.value).filter(Boolean)),
    armorKinds: new Set(docs.filter(d => d.type === "equipment").map(d => d.system?.type?.value).filter(Boolean))
  };
}

/**
 * One "any holy focus" / "one gaming set" / "any simple weapon" entry → a compendium item, or null
 * with a WARN. A focus or a tool type picks the first in dnd5e's config (the tool the character is
 * proficient in first) and says so as DEFAULTED; naming one in `items` chooses instead.
 */
async function categoryItem(cat, actor, cover, report, from) {
  const C = CONFIG.DND5E;
  const where = `starting equipment (${from})`;
  if (cat.type === "focus") {
    const cfg = C.focusTypes?.[cat.key];
    const ids = Object.values(cfg?.itemIds ?? {});
    if (!ids.length) { report.warnings.push(`${where}: any ${cat.key} focus — not resolved; name one in items`); return null; }
    if (ids.some(u => cover.tails.has(tailOf(u)))) return null;
    const doc = await bookCopy(ids[0]);
    const names = Object.keys(cfg.itemIds).map(titleCase);
    report.defaults.push(`${where}: any ${cfg.label ?? cat.key} → ${doc?.name ?? names[0]} (also fit: ${names.slice(1).join(", ")}; name one in items to choose)`);
    return doc;
  }
  if (cat.type === "tool") {
    const one = C.tools?.[cat.key];
    if (one?.id) return docAt(one.id);
    if (cover.toolTypes.has(cat.key)) return null;
    // the tool of this type the advancements made the character proficient in
    const keys = Object.keys(actor.system.tools ?? {});
    for (const k of keys) {
      const d = C.tools?.[k]?.id ? await docAt(C.tools[k].id) : null;
      if (d?.system?.type?.value === cat.key) return d;
    }
    for (const [k, v] of Object.entries(C.tools ?? {})) {
      const d = v?.id ? await docAt(v.id) : null;
      if (d?.system?.type?.value === cat.key) {
        report.defaults.push(`${where}: one ${C.toolTypes?.[cat.key]?.label ?? C.toolTypes?.[cat.key] ?? cat.key} → ${d.name} (first in the book; name one in items to choose)`);
        return d;
      }
    }
    report.warnings.push(`${where}: a ${cat.key} tool — not resolved; name one in items`);
    return null;
  }
  if (cat.type === "weapon" || cat.type === "armor") {
    const ids = cat.type === "weapon" ? C.weaponIds : C.armorIds;
    if (cat.key && ids?.[cat.key]) return bookCopy(ids[cat.key]);
    const kinds = cat.type === "weapon" ? cover.weaponKinds : cover.armorKinds;
    if ([...kinds].some(k => String(k).startsWith(cat.key ?? "~"))) return null;
    report.warnings.push(`${where}: any ${cat.key ?? ""} ${cat.type} — not chosen; name one in items`);
    return null;
  }
  report.warnings.push(`${where}: a ${cat.type} entry — not resolved`);
  return null;
}

/** The class's and background's starting equipment (option A gear, B gold) onto the actor. */
async function addStartingEquipment(actor, docs, resolved, report, ghost) {
  const opts = resolved.starting ?? { class: "none", background: "none" };
  const cover = coverOf(resolved);
  const data = [], added = [], gold = {};
  for (const [from, doc] of [["class", docs.cls], ["background", docs.background]]) {
    const option = opts[from] ?? "none";
    if (!doc || option === "none") continue;
    const entries = (doc.system.startingEquipment ?? []).map(e => (typeof e.toObject === "function" ? e.toObject() : e));
    const plan = startingEquipmentPlan(entries, { option, wealth: doc.system.wealth,
      labelOf: e => (e.type === "linked" ? fromUuidSync(e.key)?.name ?? null : null) });
    for (const p of plan.picks) report.defaults.push(`starting equipment (${doc.name}): ${p}`);
    for (const [k, n] of Object.entries(plan.currency)) gold[k] = (gold[k] ?? 0) + n;
    const want = [];
    for (const it of plan.items) want.push({ doc: await docAt(it.uuid), count: it.count, uuid: it.uuid });
    for (const cat of plan.categories) {
      const d = await categoryItem(cat, actor, cover, report, doc.name);
      if (d) want.push({ doc: d, count: cat.count });
    }
    for (const w of want) {
      if (!w.doc) { report.warnings.push(`starting equipment (${doc.name}): ${w.uuid ?? "an item"} not found`); continue; }
      // already given in items (or by the other book): not twice
      if (cover.names.has(String(w.doc.name).toLowerCase())) continue;
      cover.names.add(String(w.doc.name).toLowerCase());
      cover.tails.add(tailOf(w.doc.uuid));
      const list = await itemDataFor(w.doc, { quantity: w.count > 1 ? w.count : null });
      data.push(...list);
      added.push(w.count > 1 ? `${w.doc.name} x${w.count}` : w.doc.name);
    }
  }
  await addItems(actor, data, ghost);
  if (Object.keys(gold).length) {
    const upd = Object.fromEntries(Object.entries(gold).map(([k, n]) => [`system.currency.${k}`, (Number(actor.system.currency?.[k]) || 0) + n]));
    if (ghost) { actor.updateSource(upd); actor.reset(); } else await actor.update(upd);
  }
  return { added, gold };
}

/** WARN when a caster ends up with nothing to cast through (eval round 3: paladin and cleric did). */
function focusWarning(actor, cls) {
  const items = actor.items.map(i => ({ name: i.name, type: i.type, toolType: i.system?.type?.value,
    source: i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? null }));
  const miss = focusMissing(cls?.system?.identifier, items, CONFIG.DND5E.focusTypes ?? {});
  if (!miss) return null;
  const opts = miss.options.length ? `, or items: ["${titleCase(miss.options[0])}"] (${miss.options.map(titleCase).join(", ")})` : `, or name one in items`;
  return `no ${miss.label} — the ${cls.name} casts through one: pass startingEquipment: "A"${opts}`;
}

/* ── build ─────────────────────────────────────────────────────────────── */

/**
 * The build itself, for real (`ghost` false: documents written) or as the dry run's preview
 * (`ghost` true: an unsaved actor, nothing written). Both take the same steps in the same order, so
 * the preview's DEFAULTED and WARN lines are the real run's (§14). → the advanced actor.
 */
async function runBuild(actor, w, resolved, report, ghost) {
  const { docs, level, size } = resolved;
  const ctx = {
    choices: w.choices ?? {}, used: new Set(), report, hp: w.hp ?? "avg", size, subclass: docs.subclass,
    primary: [...(docs.cls.system.primaryAbility?.value ?? [])], speciesName: docs.species.name, ghost
  };
  // dnd5e links species/background in their items' _onCreate with an un-awaited update, which the
  // next manager's commit (a full, non-recursive actor update from its clone) can land over. Link
  // each explicitly before the class runs: the class manager only advances the species' own
  // level 1+ grants (Infernal Legacy's Fire Bolt, Hellish Rebuke at 3) when details.race is set.
  actor = await advance(actor, game.items.fromCompendium(docs.species), ctx);
  await linkOrigin(actor, "race", ghost);
  actor = await advance(actor, game.items.fromCompendium(docs.background), ctx);
  await linkOrigin(actor, "background", ghost);
  const cd = game.items.fromCompendium(docs.cls);
  cd.system.levels = level;
  actor = await advance(actor, cd, ctx);
  const unused = Object.keys(ctx.choices).filter(k => !ctx.used.has(k));
  if (unused.length) report.warnings.push(`choices not used by any advancement: ${unused.join(", ")}`);

  // and once more after the class commit, which wrote the clone's details back wholesale
  await linkOrigin(actor, "race", ghost);
  await linkOrigin(actor, "background", ghost);

  const cls = actor.items.find(i => i.type === "class");
  // what the class item's _onCreate does for a real actor (a ghost's items are never "created"):
  // the actor's spellcasting ability, which the spell DC on the sheet line reads
  if (ghost && !actor.system._source.attributes?.spellcasting && cls?.spellcasting?.ability) {
    actor.updateSource({ "system.attributes.spellcasting": cls.spellcasting.ability });
    actor.reset();
  }
  report.spells = await addSpells(actor, cls, resolved.spells?.prepared ?? w.spells, { prepared: true, report, allowOffList: w.allowOffList, ghost });
  report.spellbook = await addSpells(actor, cls, resolved.spells?.book ?? w.spellbook, { prepared: false, report, allowOffList: w.allowOffList, ghost });
  report.items = await addGear(actor, resolved.gear ?? w.items, report, ghost);
  const start = await addStartingEquipment(actor, docs, resolved, report, ghost);
  if (start.added.length || Object.keys(start.gold).length) {
    const gold = Object.entries(start.gold).map(([k, n]) => `${n} ${k.toUpperCase()}`).join(", ");
    report.starting = [...start.added, gold].filter(Boolean);
    (report.notes ??= []).push(`starting equipment: ${report.starting.join(", ")}`);
  }
  const focus = focusWarning(actor, cls);
  if (focus) report.warnings.push(focus);

  actor.reset();
  report.summary = summarise(actor);
  const counts = report.summary.spellCounts;
  if (counts && counts.prepared > counts.maxPrepared) report.warnings.push(`${counts.prepared} spells prepared, the class allows ${counts.maxPrepared}`);
  if (counts && counts.maxPrepared && counts.prepared < counts.maxPrepared) report.warnings.push(`${counts.prepared} spells prepared of ${counts.maxPrepared} — ${counts.maxPrepared - counts.prepared} slot(s) open`);
  if (counts && counts.cantrips > counts.maxCantrips && counts.maxCantrips) report.warnings.push(`${counts.cantrips} cantrips, the class knows ${counts.maxCantrips}`);
  if (counts && counts.maxCantrips && counts.cantrips < counts.maxCantrips) report.warnings.push(`${counts.cantrips} cantrips of ${counts.maxCantrips} — ${counts.maxCantrips - counts.cantrips} open`);
  return actor;
}

function ghostActor(w, abilities) {
  return new Actor.implementation({
    name: w.name || "Preview", type: "character",
    system: { abilities: Object.fromEntries(ABILITIES.map(k => [k, { value: abilities[k] }])) }
  });
}

/**
 * The dry run's preview: the whole build on an unsaved actor (dnd5e's advancement managers clone
 * it and never write), so the dry run prints the real run's DEFAULTED and WARN lines (an "already
 * granted" species spell, an open prepared slot, no holy symbol) and its `sheet:` before anything
 * is created. → `{defaults, warnings, summary, items, starting}`.
 */
export async function previewCharacter(w, resolved) {
  const report = { defaults: [...(resolved.defaults ?? [])], warnings: [...(resolved.warnings ?? [])] };
  await runBuild(ghostActor(w, resolved.abilities), w, resolved, report, true);
  return report;
}

/**
 * The Actor folder a character goes in: `with.folder` (an Actor folder id, or a name — found, or
 * created at the top level), else "Foundry MCP Characters". A test set's character can land in the
 * test set's folder instead of being moved there by hand (usability run 2026-10).
 */
async function characterFolder(want) {
  const name = typeof want === "string" && want.trim() ? want.trim() : CHARACTER_FOLDER;
  return game.folders.get(name)?.type === "Actor" ? game.folders.get(name)
    : game.folders.find(f => f.type === "Actor" && f.name === name)
      ?? await Folder.implementation.create({ name, type: "Actor" });
}

/**
 * Create the character. `w` is the replacement's `with` (kind "character"); `resolved` the result of
 * resolveCharacter. → `{actor, report}`. On any failure the half-built actor is deleted.
 */
export async function buildCharacter(w, resolved, { prov = null } = {}) {
  const { abilities } = resolved;
  const report = { defaults: [...(resolved.defaults ?? [])], warnings: [...resolved.warnings] };
  const folder = await characterFolder(w.folder);
  const D = CONST.TOKEN_DISPOSITIONS;
  const actor = await Actor.implementation.create({
    name: w.name, type: "character", folder: folder.id, img: w.img ?? undefined,
    system: {
      abilities: Object.fromEntries(ABILITIES.map(k => [k, { value: abilities[k] }])),
      details: { biography: { value: w.biography ?? "" }, alignment: w.alignment ?? "" }
    },
    prototypeToken: { name: w.name, actorLink: true, disposition: D.FRIENDLY, ...(w.img ? { texture: { src: w.img } } : {}) },
    flags: prov ? { [MODULE]: { provenance: prov } } : {}
  });
  try {
    await runBuild(actor, w, resolved, report, false);
    // a fresh character starts at full HP
    actor.reset();
    await actor.update({ "system.attributes.hp.value": actor.system.attributes.hp.max });
    report.summary = summarise(actor);
    return { actor, report };
  } catch (err) {
    try { await actor.delete(); } catch { /* best effort */ }
    throw err;
  }
}

/** The numbers a reviewer checks: abilities, HP, AC, DC, proficiencies, speed, senses, spell counts. */
export function summarise(actor) {
  const s = actor.system;
  const cls = actor.items.find(i => i.type === "class");
  const id = cls?.system.identifier;
  const scale = id ? actor.system.scale?.[id] ?? {} : {};
  const spells = actor.items.filter(i => i.type === "spell");
  const ab = Object.fromEntries(ABILITIES.map(k => [k, s.abilities[k].value]));
  return {
    level: s.details.level, class: cls ? `${cls.name} ${cls.system.levels}` : null,
    subclass: actor.items.find(i => i.type === "subclass")?.name ?? null,
    species: s.details.race?.name ?? null, background: s.details.background?.name ?? null,
    abilities: ab, hp: s.attributes.hp.max, ac: s.attributes.ac.value, prof: s.attributes.prof,
    spellDC: s.attributes.spell?.dc ?? null, spellAbility: s.attributes.spellcasting || null,
    saves: ABILITIES.filter(k => s.abilities[k].proficient),
    skills: Object.entries(s.skills).filter(([, v]) => v.value >= 1).map(([k, v]) => v.value >= 2 ? `${k}*` : k),
    speed: s.attributes.movement.walk, darkvision: s.attributes.senses?.ranges?.darkvision ?? s.attributes.senses?.darkvision ?? 0,
    size: s.traits.size, languages: [...(s.traits.languages?.value ?? [])],
    // feats proper (origin, general, fighting style, epic boon), not the class and species features
    feats: actor.items.filter(i => i.type === "feat" && i.system?.type?.value === "feat").map(i => i.name),
    spellCounts: spells.length || cls?.system.spellcasting?.progression !== "none" ? {
      cantrips: spells.filter(i => i.system.level === 0 && i.system.prepared !== 2 && String(i.system.sourceItem ?? "").startsWith("class:")).length,
      prepared: spells.filter(i => i.system.level > 0 && i.system.prepared === 1).length,
      always: spells.filter(i => i.system.prepared === 2).length,
      spellbook: spells.filter(i => i.system.level > 0 && i.system.prepared === 0).length,
      maxPrepared: cls?.system.spellcasting?.preparation?.max ?? scale["max-prepared"]?.value ?? null,
      maxCantrips: scale["cantrips-known"]?.value ?? null
    } : null
  };
}
