/**
 * Empowered Spell on a rolled damage card (feedback WUiaAA, triage H1): pure.
 * ============================================================================
 *
 * Works on the plain JSON of evaluated rolls (`Roll#toJSON()`: `{ class, formula, terms, total,
 * options, evaluated }`), never on Roll instances, so node runs it bare. The glue (empower.mjs)
 * rebuilds a DamageRoll from the result with `Roll.fromData`.
 *
 * PHB 2024, Empowered Spell: "When you roll damage for a spell, you can spend 1 Sorcery Point to
 * reroll a number of the damage dice up to your Charisma modifier (minimum of one), and you must use
 * the new rolls." One click rerolls the dice that came up below their die's average (a d6's 1–3, a
 * d8's 1–4), lowest first, up to the modifier (the 2026-11-07 review); Shift-click lets the player
 * pick. A new roll is kept even when it is lower.
 *
 * Only a top-level die added linearly counts (`3d8 + 5`, `2d6[fire] + 1d6[cold]`): a die inside a
 * parenthesis or function, or one multiplied (`(1d6) * 2`), is left alone, since its contribution
 * to the total is not its face. An exploded result keeps its explosion die; a `min<n>` modifier is
 * re-applied to the new face (core stores it as `count`, and that is the value a die contributes).
 */

const DIE_CLASS = /Die$/;
const ADD = new Set(["+", "-"]);

/** The value a result contributes: core's `count` (a min / max modifier) over the raw face. */
export function dieValue(result) {
  const v = result?.count ?? result?.result;
  return Number.isFinite(Number(v)) ? Number(v) : NaN;
}

/** The `min<n>` floor among a die's modifiers, or null. */
export function minimumOf(modifiers) {
  for (const m of modifiers ?? []) {
    const hit = /^min(\d+)$/i.exec(String(m));
    if (hit) return Number(hit[1]);
  }
  return null;
}

/**
 * Is term `j` of `terms` a die added linearly to the total: preceded by nothing or `+` / `-`, followed
 * by nothing or `+` / `-`, a non-negative count? (`2d6 * 2` or `max(1d6, 3)` is not.)
 */
function linearDie(terms, j) {
  const t = terms[j];
  if (!t || !DIE_CLASS.test(String(t.class ?? "")) || !Array.isArray(t.results)) return false;
  if (Number(t.number) < 0) return false;
  const before = terms[j - 1], after = terms[j + 1];
  if (before && !(before.class === "OperatorTerm" && ADD.has(before.operator))) return false;
  if (after && !(after.class === "OperatorTerm" && ADD.has(after.operator))) return false;
  return true;
}

/** +1 for a die added, −1 for one subtracted (`… - 1d4`). */
function signOf(terms, j) {
  const before = terms[j - 1];
  return before?.class === "OperatorTerm" && before.operator === "-" ? -1 : 1;
}

/**
 * Every die face that could be rerolled, in roll order: `{ roll, term, result, faces, value, mean }`.
 * @param {object[]} rolls  evaluated roll JSON (`Roll#toJSON()` each)
 */
export function empowerCandidates(rolls) {
  const out = [];
  (rolls ?? []).forEach((roll, i) => {
    const terms = roll?.terms ?? [];
    terms.forEach((t, j) => {
      if (!linearDie(terms, j)) return;
      const faces = Number(t.faces);
      if (!Number.isInteger(faces) || faces < 2) return;
      t.results.forEach((r, k) => {
        if (!r || r.active === false) return;
        const value = dieValue(r);
        if (!Number.isFinite(value)) return;
        out.push({ roll: i, term: j, result: k, faces, value, mean: (faces + 1) / 2 });
      });
    });
  });
  return out;
}

/**
 * One click's choice: the dice below their average, lowest first (then the larger die), up to `max`
 * (the Charisma modifier; at least one die may be rerolled by the rule, so `max` < 1 reads as 1).
 * @returns {ReturnType<typeof empowerCandidates>}
 */
export function empowerPlan(rolls, max) {
  const cap = Math.max(1, Math.trunc(Number(max)) || 0);
  return empowerCandidates(rolls)
    .filter(c => c.value < c.mean)
    .sort((a, b) => a.value - b.value || b.faces - a.faces || a.roll - b.roll || a.term - b.term || a.result - b.result)
    .slice(0, cap);
}

/**
 * Reroll the picked dice. Each old result stays in the term, inactive and marked `rerolled`
 * (core's tooltip strikes it through); the new face goes in right after it, active, with the
 * term's `min<n>` floor as `count` when it applies. Each roll's `total` moves by the difference.
 * `rng(faces)` → an integer 1..faces.
 * @param {object[]} rolls   evaluated roll JSON (not mutated)
 * @param {{ roll: number, term: number, result: number }[]} picks
 * @param {(faces: number) => number} rng
 * @returns {{ rolls: object[], changes: { roll: number, term: number, result: number, faces: number, from: number, to: number }[], delta: number }}
 *   `changes` in roll order (the result index is the OLD position; the new face sits right after it)
 */
export function empowerRolls(rolls, picks, rng) {
  const out = JSON.parse(JSON.stringify(rolls ?? []));
  const changes = [];
  let delta = 0;
  // Highest result index first per term, so the splices never shift a later pick.
  const ordered = [...(picks ?? [])].sort((a, b) => a.roll - b.roll || a.term - b.term || b.result - a.result);
  const seen = new Set();
  for (const p of ordered) {
    const key = `${p.roll}:${p.term}:${p.result}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const roll = out[p.roll];
    const terms = roll?.terms ?? [];
    if (!linearDie(terms, p.term)) continue;
    const term = terms[p.term];
    const old = term.results[p.result];
    if (!old || old.active === false) continue;
    const faces = Number(term.faces);
    const face = Math.min(faces, Math.max(1, Math.trunc(Number(rng(faces))) || 1));
    const floor = minimumOf(term.modifiers);
    const fresh = { result: face, active: true };
    if (floor !== null && face < floor) fresh.count = floor;
    const from = dieValue(old), to = dieValue(fresh);
    term.results.splice(p.result, 1, { ...old, active: false, rerolled: true }, fresh);
    const d = (to - from) * signOf(terms, p.term);
    roll.total = Number(roll.total) + d;
    delta += d;
    changes.push({ roll: p.roll, term: p.term, result: p.result, faces, from, to });
  }
  changes.sort((a, b) => a.roll - b.roll || a.term - b.term || a.result - b.result);
  return { rolls: out, changes, delta };
}

/* ── after the reroll: the totals, the new faces (F1, F2; feedback GDJJdi) ── */

/** A card's total as dnd5e's damage card shows it: each roll's total, floored at 0, summed. */
export function rollsTotal(rolls) {
  return (rolls ?? []).reduce((sum, r) => sum + Math.max(0, Number(r?.total) || 0), 0);
}

/**
 * Where each change landed in the rerolled rolls (`empowerRolls(...).rolls`): the old face's index and
 * the new face's right after it (the change's `result` is the OLD position; every earlier change in the
 * same term put one more result ahead of it), with both raw faces as the tooltip prints them, the die's
 * class and flavor. A change that does not point at an old-then-new pair is skipped.
 * @returns {{ roll: number, term: number, faces: number, oldIndex: number, newIndex: number, old: number, fresh: number, cls: string, flavor: string|null }[]}
 */
export function rerolledFaces(rolls, changes) {
  const out = [];
  const list = Array.isArray(changes) ? changes : [];
  for (const c of list) {
    const earlier = list.filter(o => o !== c && o.roll === c.roll && o.term === c.term && o.result < c.result).length;
    const term = rolls?.[c.roll]?.terms?.[c.term];
    const oldIndex = Number(c.result) + earlier;
    const was = term?.results?.[oldIndex], now = term?.results?.[oldIndex + 1];
    if (!was || !now || was.active !== false || now.active === false) continue;
    out.push({
      roll: c.roll, term: c.term, faces: Number(term.faces), oldIndex, newIndex: oldIndex + 1,
      old: Number(was.result), fresh: Number(now.result), cls: String(term.class ?? "Die"), flavor: term.options?.flavor ?? null,
    });
  }
  return out;
}

/**
 * Which tooltip chips are the rerolled pairs (F1: they stand out more than dnd5e's grey strike-through).
 * `chips` are the rendered `li.roll` results in page order, `{ list, faces, label, rerolled }` (`list`:
 * which `ol.dice-rolls` holds it). A die's results sit together in its list and each new face follows its
 * old one, so each rerolled face (`rerolledFaces`) takes the first unused adjacent pair in one list that
 * reads old (marked rerolled) then new, on its die size. Returns `[oldIndex, newIndex]` pairs into `chips`.
 */
export function matchChips(chips, faces) {
  const used = new Set();
  const pairs = [];
  const all = Array.isArray(chips) ? chips : [];
  for (const f of faces ?? []) {
    for (let i = 0; i + 1 < all.length; i++) {
      const a = all[i], b = all[i + 1];
      if (used.has(i) || used.has(i + 1) || a.list !== b.list) continue;
      if (!a.rerolled || a.faces !== f.faces || b.faces !== f.faces) continue;
      if (String(a.label).trim() !== String(f.old) || String(b.label).trim() !== String(f.fresh)) continue;
      used.add(i);
      used.add(i + 1);
      pairs.push([i, i + 1]);
      break;
    }
  }
  return pairs;
}

/**
 * F2: a roll (plain `Roll#toJSON` shape) of only the new faces, for Dice So Nice to throw instead of the
 * whole card: one die term per die class, size and flavor, in first-seen order, joined by `+`. Null with
 * nothing rerolled.
 * @param {ReturnType<typeof rerolledFaces>} faces
 */
export function rerolledRollData(faces) {
  const groups = new Map();
  for (const f of faces ?? []) {
    if (!Number.isInteger(f?.faces) || f.faces < 2 || !Number.isFinite(f.fresh)) continue;
    const key = `${f.cls}|${f.faces}|${f.flavor ?? ""}`;
    if (!groups.has(key)) groups.set(key, { cls: f.cls || "Die", faces: f.faces, flavor: f.flavor ?? null, results: [] });
    groups.get(key).results.push(f.fresh);
  }
  if (!groups.size) return null;
  const terms = [];
  const parts = [];
  let total = 0;
  for (const g of groups.values()) {
    if (terms.length) terms.push({ class: "OperatorTerm", operator: "+", options: {}, evaluated: true });
    const options = g.flavor ? { flavor: g.flavor } : {};
    terms.push({ class: g.cls, number: g.results.length, faces: g.faces, modifiers: [], results: g.results.map(result => ({ result, active: true })), options, evaluated: true });
    parts.push(`${g.results.length}d${g.faces}${g.flavor ? `[${g.flavor}]` : ""}`);
    total += g.results.reduce((a, b) => a + b, 0);
  }
  return { class: "Roll", options: {}, formula: parts.join(" + "), terms, total, evaluated: true };
}

/**
 * F3: the card a sheet / HUD use of Empowered Spell should act on: the caster's newest card that could
 * show the Empower button (`eligible`), posted within `windowMs` (10 minutes) of `now`. `cards` are
 * `{ id, actorId, timestamp, eligible }`; a superseded, empowered or applied card is never eligible.
 * Returns its id, or null (then the use is stopped and nothing is spent).
 */
export function waitingCardId(cards, { actorId, now, windowMs = 10 * 60 * 1000 } = {}) {
  let best = null;
  for (const c of cards ?? []) {
    if (!c?.eligible || !c.id || c.actorId !== actorId) continue;
    const t = Number(c.timestamp);
    if (!Number.isFinite(t) || now - t > windowMs || t - now > 60 * 1000) continue;
    if (!best || t > best.t) best = { id: c.id, t };
  }
  return best?.id ?? null;
}
