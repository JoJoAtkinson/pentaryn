/**
 * Ritual Adept, pure half (no Foundry globals; `node test/rituals.mjs` imports it bare).
 *
 * 2024 PHB, Wizard 1 — Ritual Adept: "You can cast any spell as a Ritual if that spell has the
 * Ritual tag and the spell is in your spellbook. You needn't have the spell prepared, but you
 * must read from the book to cast it in this way."
 *
 * So for an actor with Ritual Adept, an UNPREPARED wizard spell with the ritual tag can only ever
 * be cast as a ritual: no slot. dnd5e leaves that to the player (untick "Consume Spell Slot"), and
 * Argon's Cast Spell panel hides unprepared spells for a wizard, so neither surface shows it.
 * The glue (rituals.mjs) lists these spells in a "Rituals" group on the HUD and starts their
 * usage dialog with the slot unticked. Prepared ritual spells are left alone: they can be cast
 * either way, so the player chooses as before.
 */

export const RITUAL_ADEPT_IDENTIFIER = "ritual-adept";
export const RITUAL_ADEPT_SOURCE = "Compendium.dnd-players-handbook.classes.Item.phbwzdRitualAdep";

/** Plain view of an Item for the predicates below (keeps them testable). */
export function spellInfo(item) {
  const sys = item?.system ?? {};
  const props = sys.properties;
  return {
    type: item?.type ?? "",
    level: Number(sys.level) || 0,
    method: sys.method ?? "",
    prepared: Number(sys.prepared) || 0,
    ritual: !!(props && (typeof props.has === "function" ? props.has("ritual") : Array.isArray(props) && props.includes("ritual"))),
    sourceClass: sys.sourceClass || "",
    cachedFor: item?.flags?.dnd5e?.cachedFor ?? null
  };
}

/** Does this feature item grant Ritual Adept? Identifier, PHB source, or name. */
export function isRitualAdept(info) {
  if (!info || (info.type && info.type !== "feat")) return false;
  if (info.identifier === RITUAL_ADEPT_IDENTIFIER) return true;
  if (info.source && info.source === RITUAL_ADEPT_SOURCE) return true;
  return String(info.name ?? "").trim().toLowerCase() === "ritual adept";
}

/**
 * Is this spell castable ONLY as a ritual (Ritual Adept, unprepared, from the spellbook)?
 * Cantrips are never rituals; spells granted by an item (cachedFor) or cast innately / at will /
 * as pact magic are not spellbook spells; a spell credited to another class is not in the book.
 */
export function isAdeptOnlyRitual(s) {
  if (!s || s.type !== "spell" || !s.ritual) return false;
  if (s.level < 1 || s.cachedFor) return false;
  if (s.method !== "spell") return false;
  if (s.prepared > 0) return false;
  return !s.sourceClass || s.sourceClass === "wizard";
}

/** Sorted (level, then name) list of the spells the HUD's Rituals group shows. */
export function adeptRituals(spells) {
  return spells
    .map(item => ({ item, s: spellInfo(item) }))
    .filter(({ s }) => isAdeptOnlyRitual(s))
    .sort((a, b) => (a.s.level - b.s.level) || String(a.item?.name).localeCompare(String(b.item?.name)))
    .map(({ item }) => item);
}

/* ── Longer casts (usability Area 6 re-run, W7) ─────────────────────────── */

/** Argon files a spell by its first activity: these casting times are on no bar. */
export const LONG_ACTIVATIONS = Object.freeze(["minute", "hour", "day"]);

/**
 * Spells whose casting time puts them on none of Argon's bars (Animate Dead: 1 minute), for a
 * "Longer casts" group on the Action bar's Cast Spell panel. The same castable filter as Argon's:
 * with "prepared only", at-will, innate and pact spells and prepared spells. Spells an item grants
 * (cachedFor) and Ritual-Adept-only rituals (their own group) are left out.
 * @param {Array<{item: any, s: object, activations: string[]}>} entries  spellInfo plus activation types, in activity order
 * @param {{preparedOnly?: boolean}} [opts]
 * @returns {any[]} the items, by level then name
 */
export function longCasts(entries, { preparedOnly = true } = {}) {
  return (entries ?? [])
    .filter(({ s, activations }) => {
      if (!s || s.type !== "spell" || s.cachedFor) return false;
      // Argon files a spell under its FIRST activity's activation only (its getActivationType), so
      // Animate Dead (1 minute, then a bonus-action "Mentally Command") is on no bar either.
      const first = (activations ?? [])[0];
      if (!LONG_ACTIVATIONS.includes(first)) return false;
      if (isAdeptOnlyRitual(s)) return false;
      if (!preparedOnly) return true;
      return ["atwill", "innate", "pact"].includes(s.method) || s.prepared > 0;
    })
    .sort((a, b) => (a.s.level - b.s.level) || String(a.item?.name).localeCompare(String(b.item?.name)))
    .map(({ item }) => item);
}
