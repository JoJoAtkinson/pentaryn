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
