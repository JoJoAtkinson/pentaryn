/**
 * ORACLE (ties checkpoint, wave 3 — guide §3 S2 item 5, ties-13). The three "did this row fail?"
 * readings as they stood at the checkpoint, copied verbatim so the S15 unification can be proven
 * against them. Do not edit.
 *
 *   rowMissed   study.mjs (checkpoint lines 1346–1351)
 *   passOfRow   study.mjs beliefs() closure (checkpoint lines 1593–1608); its world reads
 *               (`rows`, `describeAttribute`, `concealmentFor`, `actor`) are injected
 *   flatMissed  study.mjs legacyMissCards() closure (checkpoint lines 2796–2798)
 */
export const MEMBER_FACT = "#id";

export function rowMissed(fact, rec) {
  if (!rec || rec.from) return false;
  if (fact.ns === "kind") return rec.total !== null && rec.total !== undefined && !(Number(rec.tier) >= 15);
  if (typeof rec.pass === "boolean") return rec.pass === false;
  return typeof rec.total === "number" && typeof fact.dc === "number" && Math.round(rec.total) < fact.dc;
}

export const makePassOfRow = ({ rows = [], describeAttribute = () => ({}), concealmentFor = () => 0, actor = null } = {}) =>
  (parsed, rec) => {
    if (rec.from) return true; // a share is never a failure, whatever it replaced
    if (parsed.ns === "kind") return Number(rec.tier) >= 15;
    if (typeof rec.pass === "boolean") return rec.pass;
    if (typeof rec.total !== "number") return rec.delivered || String(rec.text ?? "").trim() ? true : null;
    if (parsed.ns === "lore") {
      const dc = rows.find(r => r.id === parsed.fact)?.dc;
      return typeof dc === "number" ? Math.round(rec.total) >= dc : null;
    }
    if (parsed.ns === "attr" && parsed.fact === MEMBER_FACT) {
      if (String(rec.text ?? "").trim()) return true;
      const dc = describeAttribute(parsed.subject)?.dc;
      return typeof dc === "number" ? rec.total >= dc + concealmentFor(actor, parsed.subject) : null;
    }
    return null;
  };

export const flatMissed = (rec, dc) =>
  !!rec && !rec.from && (rec.pass === false
    || (typeof rec.pass !== "boolean" && typeof rec.total === "number" && typeof dc === "number" && Math.round(rec.total) < dc));
