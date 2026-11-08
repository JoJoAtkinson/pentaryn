/**
 * Pentaryn Combat core — what a player types into a number box or a roll window (feedback triage
 * 2026-11, clusters K and L6). PURE.
 *
 *   arithmeticExpression   "50-10" is arithmetic the HP boxes should do; "=40", "-10", "+5", "50%"
 *                          and "40" are not (core and dnd5e read those themselves)
 *   arithmeticAssignment   "50-10" → "=40" through the evaluator the caller hands in (Roll.safeEval)
 *   manualDiceConfig       the client's dice configuration with the d20 read as Manual, for the one
 *                          roll a player chose to roll at the table (Roll manually)
 */

const ARITHMETIC = /^\d[\d\s()+\-*/]*$/;
const OPERATOR = /[+\-*/]/;

/**
 * The arithmetic in a typed value, or null when the value is not arithmetic: it must start with a
 * digit (so "-10" and "+5" stay deltas and "=40" stays an assignment), hold only digits, spaces,
 * brackets and + - * /, and have at least one operator ("40" alone is a plain number).
 * @param {*} raw
 * @returns {string|null}
 */
export function arithmeticExpression(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!ARITHMETIC.test(s) || !OPERATOR.test(s)) return null;
  return s;
}

/**
 * "50-10" → "=40": the expression evaluated by `evaluate` (the caller's Roll.safeEval) and rounded
 * down, written as the assignment core and dnd5e both understand. Null when the value is not
 * arithmetic or the evaluator gives no finite number; a throw from the evaluator is the caller's.
 * @param {*} raw
 * @param {(expression: string) => number} evaluate
 * @returns {string|null}
 */
export function arithmeticAssignment(raw, evaluate) {
  const expression = arithmeticExpression(raw);
  if (expression === null) return null;
  const value = Number(evaluate(expression));
  return Number.isFinite(value) ? `=${Math.floor(value)}` : null;
}

/**
 * The dice configuration with the d20 set to Manual and every other denomination as the player
 * configured it; a copy, never the stored object. Only the d20: Roll manually is for the d20 roll
 * window, and damage dice keep the player's own configuration.
 * @param {object} config   core.diceConfiguration as read
 * @returns {object}
 */
export function manualDiceConfig(config) {
  return { ...(config && typeof config === "object" ? config : {}), d20: "manual" };
}
