/**
 * Deriving the truth off the sheet: enriched description, attacks and traits, and the payload a
 * study reveal composes.
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import { MODULE } from "../ties-api.mjs";
import {
  authoredTier,
  capProse,
  composeReveal,
  safeFlatten,
  studyDescription,
  traitsLine
} from "../known-core.mjs";
import { studyTiersOf } from "./resolve.mjs";
import { ATTACK_LINES_MAX, f, log, t } from "./shared.mjs";

/* -------------------------------------------- */
/*  Deriving the truth off the sheet            */
/* -------------------------------------------- */

const enrich = async (html, relativeTo) => {
  if (!html) return "";
  try {
    return await foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
      relativeTo,
      rollData: relativeTo?.getRollData?.() ?? {},
      secrets: false
    });
  } catch (err) {
    log.warn(`enrichment failed for ${relativeTo?.name}`, err);
    return "";
  }
};

/** Items that actually swing at somebody — the tier-25 source list. */
export function attackItems(kind) {
  const out = [];
  for (const item of kind?.items ?? []) {
    const activities = item.system?.activities;
    if (!activities?.size) continue;
    if (![...activities].some(a => a?.type === "attack" || a?.type === "save")) continue;
    out.push(item);
  }
  return out;
}

/**
 * Tier 25, one line per attack.
 *
 * **The Monster Manual makes this one enrich call**, which the live probe of 2026-08-23
 * confirmed: MM attack descriptions are literally `[[/attack extended]]. [[/damage average
 * extended]].`, and enriching them *relative to the item* resolves them to "Melee Attack Roll:
 * +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage". Enriching without `relativeTo` leaves the
 * brackets standing, which `safeFlatten` then refuses — so a homebrew actor whose description
 * cannot be resolved falls back to **the item's name alone**, the fallback the plan says must
 * always work. Per item, not per creature: one unresolvable feature must not cost the other
 * four their numbers.
 */
async function attackLines(kind) {
  const lines = [];
  for (const item of attackItems(kind).slice(0, ATTACK_LINES_MAX)) {
    const text = safeFlatten(await enrich(item.system?.description?.value ?? "", item));
    lines.push(text ? `${item.name}: ${text}` : item.name);
  }
  return lines;
}

/**
 * Tier 20, one line — `traits.di/dr/dv/ci`, read from **`_source`** rather than the live sheet.
 *
 * ## Why the source and not the derived value
 *
 * `system.traits.di` is *derived* data: dnd5e folds Active Effects into it, so a creature holding
 * a magic cloak reads as immune to fire on the sheet. Studying a creature should tell you what it
 * **is**, not what it is currently carrying — Joe's rule: *"an NPC who has immunity with the aid
 * of an item won't be something inspection can see."* Reading the derived value let a study roll
 * X-ray someone's gear, which is a different game than reading their nature.
 *
 * Reproduced before changing it: a Shadow's innate `[necrotic, poison]` became
 * `[necrotic, poison, fire]` the moment a test cloak with a `system.traits.di.value` effect was
 * equipped, and the tier-20 line reported the fire immunity as if it were the creature's own.
 *
 * **`_source` is not too narrow, measured rather than assumed:** across 60 Monster Manual
 * creatures, **zero** had derived traits differing from source and **zero** granted traits through
 * an effect. Stat-block immunities live in the source data; only gear and conditions arrive later.
 * If a homebrew monster ever grants its own traits via a feature effect, this will under-report
 * it — and the fix then is to subtract *equipment*-sourced effects rather than to go back to the
 * derived value.
 */
function kindTraits(kind) {
  const labelFor = (key, table) => CONFIG.DND5E?.[table]?.[key]?.label ?? key;
  const list = (trait, table) => {
    const src = kind?._source?.system?.traits?.[trait] ?? kind?.system?.traits?.[trait];
    const values = [...(src?.value ?? [])].map(v => labelFor(v, table));
    const custom = String(src?.custom ?? "")
      .split(";")
      .map(s => s.trim())
      .filter(Boolean);
    return [...values, ...custom];
  };
  return traitsLine(
    {
      immune: list("di", "damageTypes"),
      resist: list("dr", "damageTypes"),
      vulnerable: list("dv", "damageTypes"),
      conditionImmune: list("ci", "conditionTypes")
    },
    {
      immune: t("known.study.trait.immune"),
      resist: t("known.study.trait.resist"),
      vulnerable: t("known.study.trait.vulnerable"),
      conditionImmune: t("known.study.trait.conditionImmune")
    }
  );
}

/**
 * The string the player is handed. **GM client only** — every alternative it did not choose
 * stays in this function's locals and never touches a socket.
 *
 * The description slot is the authored tier message for *exactly* this rung when one exists,
 * and the kind's flattened biography when it does not. That is the whole of "lower tiers may
 * lie": the authored text replaces the truth, and the derived text — read off the real sheet —
 * is what a kind with no authoring falls back to.
 *
 * **Returns "" for a failure with no authored rung 0** — no header, no placeholder (2026-10). A
 * failure hands the player nothing; the caller still writes the lock and posts the stub.
 */
export async function composeStudyPayload(kind, tier, skillLabel) {
  /*
   * ⚠ **Every rung does the same work, and the discards are the point.**
   *
   * The obvious shape is to skip the biography enrichment when an authored message exists and
   * skip the attack extraction below tier 25 — and that shape leaks the tier *on the clock*.
   * Measured on the GM's client before this was fixed: a tier-0 roll completed in 731 ms and a
   * tier-25 roll in 991 ms on the same kind, because the 25 paid for five `enrichHTML` calls
   * the 0 skipped. The player's stub card is posted after this function returns, so a quarter
   * of a second of extra silence *was* the number, readable by anyone patient enough to watch
   * the chat log twice. Decision 11's contract says any observable that varies by outcome is
   * the number; a timestamp is an observable.
   *
   * So the derivation runs in full every time and the tier only chooses what survives.
   */
  const derived = capProse(safeFlatten(await enrich(kind.system?.details?.biography?.value ?? "", kind)) ?? "");
  const attacks = await attackLines(kind);
  const traits = kindTraits(kind) || t("known.study.derived.noTraits");

  /*
   * ⚠ The derived description is gated at **15**, and it was not.
   *
   * Only traits (20) and attacks (25) were tier-gated, so a sub-15 roll — the rung whose entire
   * job is "you do not recognise it" — handed over the creature's **full Monster Manual entry**.
   * Found by running a real import through every rung: tier 0 and tier 15 came back byte-identical
   * on both monsters tested.
   *
   * The derivation still runs in full above (that is the timing-leak fix, and it must not be
   * undone); the tier only chooses what survives, which is what this line now actually does.
   *
   * An **authored** rung still wins at any tier — a GM who writes a tier-0 message is deliberately
   * saying something on a failure. Since 2026-10 that is the ONLY failure text this module
   * delivers: an unauthored failure gets nothing at all (no generic "nothing about it means
   * anything to you" card, which read as "you failed"), and the rule lives in `studyDescription`
   * where it is fixtured. Lore rows and attributes do the same with their `miss` (2026-10-08).
   */
  const description = studyDescription({
    authored: authoredTier(studyTiersOf(kind), tier),
    derived,
    tier,
    none: t("known.study.derived.none")
  });
  if (!description) return "";

  return composeReveal({ tier, header: f("known.study.header", { skill: skillLabel }), description, traits, attacks });
}
