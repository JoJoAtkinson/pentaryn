/**
 * ORACLE for guide step 3 (prompts-lookup-6): today's inline monsters() logic from
 * pentaryn-lookup.mjs (snapshot :252-260 and :269-302), pasted verbatim and split at the seams the
 * core extraction uses. core.test.mjs asserts the new core functions equal these over a fixed
 * table. Never "fix" anything here: a NaN CR falls through to the name order on purpose.
 */

export const SIZE_KEYS = { tiny: "tiny", small: "sm", sm: "sm", medium: "med", med: "med", large: "lg", lg: "lg",
                    huge: "huge", gargantuan: "grg", grg: "grg" };

export function crNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(v));
  const n = m ? Number(m[1]) / Number(m[2]) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** :269-280 — the query parse. */
export function monsterQuery(q = {}) {
  const size = q.size ? SIZE_KEYS[String(q.size).toLowerCase()] ?? String(q.size).toLowerCase() : null;
  const type = q.type ? String(q.type).toLowerCase() : null;
  let lo = null, hi = null;
  if (q.cr !== undefined && q.cr !== null && q.cr !== "") {
    const m = /^\s*([\d/.]+)\s*-\s*([\d/.]+)\s*$/.exec(String(q.cr));
    if (m) { lo = crNum(m[1]); hi = crNum(m[2]); } else { lo = hi = crNum(q.cr); }
  }
  if (q.minCr !== undefined) lo = crNum(q.minCr);
  if (q.maxCr !== undefined) hi = crNum(q.maxCr);
  const name = q.name ? String(q.name).toLowerCase() : null;
  const limit = Math.max(1, Math.min(Number(q.limit) || 40, 200));
  const packIds = q.packs ?? ["dnd-monster-manual.actors", "dnd5e.actors24"];
  return { size, type, lo, hi, name, limit, packIds };
}

/** :287-293 — one index entry against the parsed query (the dedupe Set stays in the loop). */
export function matchMonster(e, { size, type, lo, hi, name }) {
  if (e.type !== "npc") return false;
  const cr = e.system?.details?.cr, sz = e.system?.traits?.size, ty = e.system?.details?.type?.value;
  if (size && sz !== size) return false;
  if (type && String(ty ?? "").toLowerCase() !== type) return false;
  if (lo !== null && !(cr >= lo)) return false;
  if (hi !== null && !(cr <= hi)) return false;
  if (name && !e.name.toLowerCase().includes(name)) return false;
  return true;
}

/** :300 — the sort, in place, as today. */
export function sortMonsters(out) {
  out.sort((a, b) => (a.cr - b.cr) || a.name.localeCompare(b.name));
  return out;
}

/** :301-302 — the page and its hint. */
export function pageMonsters(out, limit) {
  return { count: out.length, shown: Math.min(out.length, limit), monsters: out.slice(0, limit),
           ...(out.length > limit ? { hint: `narrow it (size, type, cr) or raise limit; ${out.length - limit} more` } : {}) };
}
