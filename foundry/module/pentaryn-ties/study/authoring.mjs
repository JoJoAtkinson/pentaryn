/**
 * GM authoring: the kind picker and pointer, the study ladder, the difficulty offset, the hold, and
 * the GM's belief ledger view.
 *
 * Split out of study.mjs (S4b, ties-35); study.mjs re-exports this file's public names.
 */

import { describeAttribute } from "../attributes.mjs";
import { MODULE } from "../ties-core.mjs";
import { kindPassed, rolledMiss, CONCEAL_FLAG } from "../core/rules.mjs";
import {
  KIND_KEY,
  KIND_OF_FLAG,
  LORE_FLAG,
  clampLoreRow,
  MEMBER_FACT,
  parseFactKey,
  readLore,
  readStudyTiers,
  STUDY_HOLD_FLAG,
  STUDY_OFFSET_FLAG,
  STUDY_TIERS_FLAG,
  studyOffsetOf
} from "../known-core.mjs";
import { beliefsOf, concealmentFor, kindActorOf, studyHoldFor } from "./resolve.mjs";
import { esc } from "./shared.mjs";
import { readFlag } from "../lib/flags.mjs";

/* -------------------------------------------- */
/*  GM authoring — minimal, absorbed by phase 4 */
/* -------------------------------------------- */

/**
 * The minimal kind-pointer picker.
 *
 * Phase 4's GM section on the NPC's ties tab absorbs this; until then it is one dropdown in a
 * dialog, opened from the console or from the GM-only control on a Known row. Minimal is the
 * whole specification: a pointer is a world-actor id and the only hard part is not letting it
 * be free text (decision 4 — a text key has no stat source for the ladder to read).
 */
export async function kindDialog(actor) {
  if (!game.user?.isGM || !actor) return false;
  const current = readFlag(actor, MODULE, KIND_OF_FLAG) ?? "";
  const options = (game.actors?.contents ?? [])
    .filter(a => a.id !== actor.id && a.type !== "character")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(a => `<option value="${esc(a.id)}"${a.id === current ? " selected" : ""}>${esc(a.name)}</option>`)
    .join("");

  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: _loc("PENTARYN_TIES.known.study.kindTitle", { name: actor.name }) },
    classes: ["pentaryn-tie-dialog", "pt-tie-dialog"],
    content: `<div class="pt-known-picker">
      <p class="pt-study-hint">${esc(_loc("PENTARYN_TIES.known.study.kindHint"))}</p>
      <label class="pt-field">
        <span class="pt-field-label">${esc(_loc("PENTARYN_TIES.known.study.kindLabel"))}</span>
        <select name="kind">
          <option value="">${esc(_loc("PENTARYN_TIES.known.study.kindSelf"))}</option>
          ${options}
        </select>
      </label>
    </div>`,
    ok: { label: _loc("PENTARYN_TIES.known.study.kindSave"), callback: (event, button) => button.form.elements.kind.value ?? "" },
    rejectClose: false
  });
  if (chosen === null || chosen === undefined) return false;
  await setKindOf(actor, chosen);
  return true;
}

export async function setKindOf(actor, kindId) {
  if (!game.user?.isGM || !actor) return false;
  const id = String(kindId ?? "").trim();
  if (!id || id === actor.id) await actor.unsetFlag(MODULE, KIND_OF_FLAG);
  else if (!game.actors?.get(id)) {
    ui.notifications.warn(_loc("PENTARYN_TIES.known.study.notify.noKind"));
    return false;
  } else await actor.setFlag(MODULE, KIND_OF_FLAG, id);
  return true;
}

/**
 * Author the tier messages. Console-only in phase 3, by the plan's own correction — the
 * authoring *surface* is phase 4's GM section, and phase 3 needs authored tiers to test
 * falsity with.
 *
 *   game.pentaryn.ties.study.tiers(actor, [{ min: 25, text: "…" }, { min: 0, text: "…" }])
 */
export async function setStudyTiers(actor, tiers) {
  if (!game.user?.isGM || !actor) return false;
  const clean = readStudyTiers(tiers);
  if (!clean.length) await actor.unsetFlag(MODULE, STUDY_TIERS_FLAG);
  else await actor.setFlag(MODULE, STUDY_TIERS_FLAG, clean);
  return clean;
}

/**
 * Set a kind's difficulty: a number to shift the whole ladder, `"auto"` for free, `0` to clear.
 *
 * A chicken is `"auto"`. A god is `+20`. Everything else is probably nothing at all — the default
 * ladder exists so a GM never has to think about this unless one creature deserves it.
 */
export async function setStudyOffset(kind, offset) {
  if (!game.user?.isGM || !kind) return false;
  const clean = studyOffsetOf(offset);
  if (clean === 0) await kind.unsetFlag(MODULE, STUDY_OFFSET_FLAG);
  else await kind.setFlag(MODULE, STUDY_OFFSET_FLAG, clean);
  return clean;
}

/** Per-kind approval gate: `true` hold, `false` auto, `null`/undefined inherit the setting. */
export async function setStudyHold(actor, hold) {
  if (!game.user?.isGM || !actor) return false;
  if (hold === null || hold === undefined) await actor.unsetFlag(MODULE, STUDY_HOLD_FLAG);
  else await actor.setFlag(MODULE, STUDY_HOLD_FLAG, hold === true);
  return studyHoldFor(actor);
}

/** What each character believes about this kind — the GM's memory, gated like `inbound()`. */
export function beliefs(actor) {
  if (game.user?.isGM !== true) return [];
  const out = [];
  // both ledgers this actor can hold: the kind rows it collects as somebody's kind, and the
  // lore rows it collects as itself. An NPC that is its own kind holds both on one document.
  const rows = readLore(readFlag(actor, MODULE, LORE_FLAG));
  const kind = kindActorOf(actor); // read-only for the whole loop: resolve the pointer once
  /*
   * The roll's verdict, for the "missed" tag: a failure hands the player nothing now (2026-10), so
   * an empty text box alone no longer says whether they missed or passed into an unauthored side.
   * `true`/`false`, or `null` when nothing says (a claim in flight).
   */
  const passOfRow = (parsed, rec) => {
    if (rec.from) return true; // a share is never a failure, whatever it replaced
    if (parsed.ns === "kind") return kindPassed(rec.tier);
    if (typeof rec.pass === "boolean") return rec.pass;
    if (typeof rec.total !== "number") return rec.delivered || String(rec.text ?? "").trim() ? true : null;
    if (parsed.ns === "lore") {
      const dc = rows.find(r => r.id === parsed.fact)?.dc;
      // a pass is "not a miss" — except a NaN total, which the >= comparison never passed
      return typeof dc === "number" ? !Number.isNaN(rec.total) && !rolledMiss(rec, dc) : null;
    }
    if (parsed.ns === "attr" && parsed.fact === MEMBER_FACT) {
      if (String(rec.text ?? "").trim()) return true;
      const dc = describeAttribute(parsed.subject)?.dc;
      return typeof dc === "number" ? rec.total >= dc + concealmentFor(actor, parsed.subject) : null;
    }
    return null;
  };
  for (const ledger of new Set([kind, actor].filter(Boolean))) {
    for (const [characterId, facts] of Object.entries(beliefsOf(ledger))) {
      for (const [beliefKey, rec] of Object.entries(facts)) {
        if (!rec) continue;
        const parsed = beliefKey === KIND_KEY ? { ns: "kind", fact: KIND_KEY } : parseFactKey(beliefKey);
        if (!parsed) continue;
        // a kind row belongs to the kind ledger, a lore row to this actor — never cross them,
        // or an NPC pointing at Goblin would list every other goblin-studier's rows as its own
        if (parsed.ns === "kind" && ledger.id !== kind?.id) continue;
        if (parsed.ns !== "kind" && ledger.id !== actor.id) continue;
        out.push({
          ns: parsed.ns,
          factId: parsed.fact,
          fact: parsed.ns === "kind" ? ledger.name : rows.find(r => r.id === parsed.fact)?.label ?? parsed.fact,
          character: game.actors?.get(characterId)?.name ?? characterId,
          characterId,
          tier: rec.tier,
          total: rec.total,
          when: new Date(rec.when).toLocaleString(),
          delivered: rec.delivered ? new Date(rec.delivered).toLocaleString() : null,
          // numeric siblings (ties-10): sortable and locale-free; the strings above stay for display
          whenMs: rec.when,
          deliveredMs: rec.delivered ?? null,
          pending: !rec.delivered,
          pass: passOfRow(parsed, rec),
          text: rec.text
        });
      }
    }
  }
  return out.sort((a, b) => Number(b.pending) - Number(a.pending) || a.character.localeCompare(b.character));
}

/* -------------------------------------------- */
/*  Lore rows and concealment, as calls (ties-9) */
/* -------------------------------------------- */

/** An actor's lore rows, as the GM authors them (sanitised; blank-label rows kept). */
export const loreRowsOf = actor => readLore(readFlag(actor, MODULE, LORE_FLAG));

/**
 * Write an actor's lore rows — the GM authoring section's save, as a call. Each row is sanitised
 * (`clampLoreRow`); ⚠ an empty list DELETES the flag rather than leaving `[]` behind on every actor
 * a GM ever opened the section on.
 * → `{ ok: true, rows }` | `{ ok: false, reason: "notGM" | "notFound" }`
 */
export async function writeLoreRows(actor, list) {
  if (!game.user?.isGM) return { ok: false, reason: "notGM" };
  if (!actor) return { ok: false, reason: "notFound" };
  const rows = (Array.isArray(list) ? list : []).map(clampLoreRow).filter(Boolean);
  if (!rows.length) await actor.unsetFlag(MODULE, LORE_FLAG);
  else await actor.setFlag(MODULE, LORE_FLAG, rows);
  return { ok: true, rows };
}

/** The raw concealment flag: a number for every attribute, `{ default, <attrId>: n }`, or null. */
export const concealOf = actor => readFlag(actor, MODULE, CONCEAL_FLAG) ?? null;

/**
 * Set (or with null, clear) an actor's concealment — how much it raises the DC to identify its
 * attributes, never printed. A number applies to every attribute; `{ default, <attrId>: n }` per
 * attribute. → `{ ok: true, conceal }` | `{ ok: false, reason: "notGM" | "notFound" | "invalid" }`
 */
export async function setConceal(actor, value) {
  if (!game.user?.isGM) return { ok: false, reason: "notGM" };
  if (!actor) return { ok: false, reason: "notFound" };
  if (value === null || value === undefined) {
    await actor.unsetFlag(MODULE, CONCEAL_FLAG);
    return { ok: true, conceal: null };
  }
  const isNum = typeof value === "number" && Number.isFinite(value);
  const isMap = value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(v => typeof v === "number" && Number.isFinite(v));
  if (!isNum && !isMap) return { ok: false, reason: "invalid" };
  await actor.setFlag(MODULE, CONCEAL_FLAG, value);
  return { ok: true, conceal: value };
}

