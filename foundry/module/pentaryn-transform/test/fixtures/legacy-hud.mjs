/**
 * Verbatim oracles from hud.mjs at the wave-4 checkpoint (0.3.3). The only edit: Foundry reads are
 * injected as parameters (named in each header). Guide step 3 (-6, -10, -11, -13) proves its pure
 * seams against them.
 */

import { activitiesOf, formatDuration } from "../../transform-core.mjs";

/** hud.mjs:137-166 `summaryInput`. Injected: `CONFIG.DND5E` as `cfg` ({ actorSizes, creatureTypes }). */
export function legacySummaryInput(src, cfg) {
  const s = src.system;
  const attacks = [];
  const traits = [];
  for (const item of src.items) {
    const acts = activitiesOf(item);
    const attack = acts.find(a => a.type === "attack");
    if (item.type === "weapon" || attack) {
      const a = attack ?? acts[0];
      const dmg = a?.labels?.damage ?? item.labels?.damages ?? [];
      attacks.push({
        name: item.name,
        toHit: a?.labels?.toHit ?? item.labels?.toHit ?? "",
        damage: (Array.isArray(dmg) ? dmg : []).map(d => d.label ?? d.formula).filter(Boolean).join(" + ")
      });
    } else if (item.type === "feat" && item.system.type?.value === "monster" && !acts.length) {
      traits.push(item.name);
    }
  }
  return {
    cr: s.details?.cr,
    sizeLabel: cfg.actorSizes[s.traits?.size]?.label ?? "",
    typeLabel: cfg.creatureTypes[s.details?.type?.value]?.label ?? s.details?.type?.value ?? "",
    ac: s.attributes?.ac?.value,
    movement: s.attributes?.movement ?? {},
    units: s.attributes?.movement?.units || "ft",
    senses: s.attributes?.senses?.ranges ?? {},
    attacks, traits
  };
}

/**
 * hud.mjs:168-175 `recoveryText`. Injected: `periods` (CONFIG.DND5E.limitedUsePeriods) and `all`
 * (the localized "PENTARYN_TRANSFORM.Hud.All").
 */
export function legacyRecoveryText(item, periods, all) {
  return (item.system.uses?.recovery ?? []).map(r => {
    const when = periods[r.period]?.label ?? r.period;
    const what = r.type === "recoverAll" ? all : (r.formula || "1");
    return `${when}: ${what}`;
  }).join(" · ");
}

/** hud.mjs:490-495 `describe`, verbatim (the Argon classes are passed in, as today). */
export function legacyDescribe(button, { ItemButton, SplitButton }) {
  if (button?._isWeaponSet) return { kind: "weaponSet" };
  if (button instanceof ItemButton) return { kind: "item", id: button.item?.id ?? null };
  if (SplitButton && button instanceof SplitButton) return { kind: "split", ids: [button.button1?.item?.id, button.button2?.item?.id] };
  return { kind: "other" };
}

/**
 * hud.mjs:570-578 `multiattackCoveredByFullAttack`. Injected: `active` (pentaryn-combat active),
 * `fullAttack`/`multiattack` (its two settings), `ma` (its multiattack(actor) result), `hasItem(id)`.
 */
export function legacyCovered({ active, fullAttack, multiattack, ma, hasItem }) {
  try {
    if (!active) return null;
    if (!fullAttack || !multiattack) return null;
    if (!ma || ma.source === "flag" || (ma.total ?? 0) < 2 || !hasItem(ma.source)) return null;
    return ma.source;
  } catch { return null; }
}

/**
 * hud.mjs:650-664 `portraitLine`, data part. Injected: `ws` (the form's EFFECT_ID effect or null),
 * `endsAt`, `starry` (the active Starry effect or null), `starryLeft`, `worldTime`, `format(key, data)`.
 */
export function legacyPortraitLine({ ws, endsAt, starry, starryLeft, worldTime, format }) {
  if (ws) {
    const left = Number.isFinite(endsAt) ? formatDuration(endsAt - worldTime) : null;
    return left ? format("PENTARYN_TRANSFORM.Hud.PortraitLeft", { what: ws.name, left }) : ws.name;
  }
  if (starry) {
    const left = starryLeft;
    return left !== null ? format("PENTARYN_TRANSFORM.Hud.PortraitLeft", { what: starry.name, left: formatDuration(left) }) : starry.name;
  }
  return null;
}

/** hud.mjs:734-739 `refreshLive`'s decision for one button: "delete" | "skip" | "refresh" | "keep". */
export function legacyLiveDecision(b, item) {
  if (!b.element.isConnected) return b.panel ? "delete" : "skip";
  return (!item || b.wildShapeItem === item) ? "refresh" : "keep";
}

/** hud.mjs:781-788 `earnsChalice`, verbatim. */
export function legacyEarnsChalice(activity, usageConfig) {
  const item = activity?.item;
  if (item?.type !== "spell" || !(Number(item.system?.level) > 0)) return false;
  if (usageConfig?.consume?.spellSlot === false) return false;
  if (activity.type === "heal") return true;
  const parts = activity.damage?.parts ?? [];
  return parts.some(p => (p.types instanceof Set ? [...p.types] : (p.types ?? [])).some(t => t === "healing" || t === "temphp"));
}

/** hud.mjs:48-52 — the pointermove decision: does this move arm a stale-tooltip check? */
export function legacyPointerArms(staleCheckQueued) {
  return !staleCheckQueued;
}
