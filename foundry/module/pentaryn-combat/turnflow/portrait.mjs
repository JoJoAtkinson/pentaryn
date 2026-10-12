/**
 * Status conditions on the HUD portrait (feature; setting portraitConditions): Prone, Poisoned,
 * Dodging … that Argon leaves out, each with its rules text. PortraitPanel#getEffects is wrapped
 * once at ready through the kit's wrapMethod (adjustments row combat-argon-portrait-conditions).
 */

import * as core from "../combat-core.mjs";
import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { defineAccessor, wrapMethod } from "../lib/patch.mjs";
import { setting } from "../settings.mjs";

const log = makeLog(MODULE);

/* ── conditions on the HUD portrait ──────────────────────────────────────── */

const ruleText = new Map();
const handles = [];

async function tooltipFor(effect) {
  const own = effect.description ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(effect.description) : "";
  if (own) return own;
  for (const s of effect.statuses ?? []) {
    const ref = CONFIG.DND5E?.conditionTypes?.[s]?.reference ?? CONFIG.DND5E?.statusEffects?.[s]?.reference;
    if (!ref) continue;
    if (!ruleText.has(ref)) {
      ruleText.set(ref, fromUuid(ref).then(p => p?.text?.content ?? "").catch(err => { log.debug("condition rules text", err); return ""; }));
    }
    const text = await ruleText.get(ref);
    if (text) return foundry.applications.ux.TextEditor.implementation.enrichHTML(text);
  }
  return "";
}

function patchPortrait() {
  const P = CONFIG.ARGON?.PORTRAIT?.PortraitPanel;
  if (!P?.prototype?.getEffects || P.prototype._pcConditions) return;
  // Through the kit (C32). The marker also stays on the prototype, where it was before (glue pins it).
  handles.push(wrapMethod(MODULE, { target: P.prototype, name: "getEffects", marker: "_pcConditions", adjustments: "combat-argon-portrait-conditions", label: "PortraitPanel#getEffects" },
    async function (wrapped, ...args) {
      const list = await wrapped(...args);
      if (!setting("portraitConditions") || !this.actor) return list;
      try {
        const all = [...this.actor.allApplicableEffects()];
        const have = new Set(list.map(e => e.uuid));
        const extra = core.portraitExtras(all.map(e => ({
          uuid: e.uuid, active: e.active, temporary: e.isTemporary, concealed: !!e.isConcealed, statuses: [...(e.statuses ?? [])]
        })));
        for (const uuid of extra) {
          if (have.has(uuid)) continue;
          const e = all.find(x => x.uuid === uuid);
          list.push({ img: e.img, name: e.name, uuid, tooltip: await tooltipFor(e) });
        }
      } catch (err) { log.warn("portrait conditions", err); }
      return list;
    }, { log }));
  handles.push(defineAccessor(MODULE, P.prototype, "_pcConditions", { value: true, writable: true, enumerable: true },
    { marker: "_pcConditionsMark", adjustments: "combat-argon-portrait-conditions", label: "PortraitPanel#_pcConditions" }, { log }));
}

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ label });   // guarded (S11, D-c1): a throw is logged with the label; return values pass through

export function install(reg) {
  reg.once("ready", patchPortrait, opts("portrait conditions: wrap PortraitPanel"));
}

export function uninstall() {
  for (const h of handles.splice(0).reverse()) h.unwrap();
  ruleText.clear();
}
