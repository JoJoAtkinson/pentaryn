/**
 * pentaryn-prompts — the replace readback as text (pure, node-tested).
 *
 * `replaceMany` returns flat per-prompt rows (strings, numbers, booleans and lists of strings, so an
 * eval-js result never reaches the bridge's serialisation depth limit) and `text`, rendered here.
 * The MCP tool prints that `text` as it is, so the eval-js path and the tool read back the same
 * lines: one per prompt, then `sheet:`, `patched:`, `DEFAULTED (check):`, `WARN:`, `notes:` and
 * `cleanup:` under it, then `remaining:`, then one line per encounter built into.
 *
 * Row (real run): `{id, label, kind, ok, code?, error?, created: ["Token \"Yark\" [id] @x,y 1x1", …],
 *   ids: […], markerDeleted, sheet?, patched: […], defaults: […], warnings: […], notes: […],
 *   discarded: […], reason?}`.
 * Row (dry run): `{id, label, kind, ok, code?, error?, at, placement, footprint, lockSize, hidden,
 *   creates: […], warnings: […], defaults: […], sheet?}` — a character's `sheet` is its preview's.
 */

const ordinal = n => `${n}${[, "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? "th"}`;

/** `[{key, level, value, max}]` → `1st 4/4, 2nd 3/3, pact 2/2 (3rd)` (PT2-2). */
function slotsText(slots) {
  return slots.map(r => (r.key === "pact" ? `pact ${r.value}/${r.max} (${ordinal(r.level)})` : `${ordinal(r.level)} ${r.value}/${r.max}`)).join(", ");
}

/** A character's sheet numbers (character-adapter.mjs `summarise`) as one line. */
export function sheetLine(s) {
  if (!s) return null;
  const ab = s.abilities ? Object.entries(s.abilities).map(([k, v]) => `${k} ${v}`).join(" ") : "";
  const sc = s.spellCounts
    ? ` spells: ${s.spellCounts.cantrips} cantrips/${s.spellCounts.maxCantrips ?? "?"}, ` +
      `${s.spellCounts.prepared} prepared/${s.spellCounts.maxPrepared ?? "?"}, ${s.spellCounts.always} always` +
      (s.spellCounts.spellbook ? `, ${s.spellCounts.spellbook} more in the spellbook` : "")
    : "";
  return `${s.class}${s.subclass ? ` (${s.subclass})` : ""}, ${s.species}, ${s.background}; ${ab}; ` +
    `HP ${s.hp} AC ${s.ac} PB +${s.prof}${s.spellAbility ? ` spell DC ${s.spellDC} (${s.spellAbility})` : ""}; ` +
    `saves ${(s.saves ?? []).join(",")}; skills ${(s.skills ?? []).join(",")}; speed ${s.speed}` +
    `${s.darkvision ? `, darkvision ${s.darkvision}` : ""}; size ${s.size}` +
    `${s.languages?.length ? `; languages ${s.languages.join(", ")}` : ""}` +
    `${s.feats?.length ? `; feats ${s.feats.join(", ")}` : ""}.${sc}` +
    (s.slots?.length ? `${sc ? ";" : ""} slots ${slotsText(s.slots)}` : "");
}

/** One readback line per encounter built into: XP now against the party budget. */
export function encounterLine(e) {
  const b = e?.budget;
  const open = e?.unbuilt ? `, ${e.unbuilt} prompt(s) not built in this call` : "";
  const id = `${e?.id}${e?.estimate ? " (estimate, CR XP of the plan)" : ""}`;
  // a group with no hostile creature (the party, a shopkeeper and her guard) has no budget to judge
  if (!(e?.creatures > 0)) return `${id}: no hostile creature${open} — no difficulty to judge`;
  const budget = b
    ? ` vs party ${b.size} x L${b.level}: low ${b.low} | moderate ${b.moderate} | high ${b.high} → ${e.difficulty}`
    : " (no party: pass party:\"4x5\" to gather or replace for a difficulty)";
  return `${id}: ${e?.xp ?? 0} XP from ${e.creatures} creature(s)${open}${budget}`;
}

/** The lines under a row: sheet, patched, defaults, warnings, notes, cleanup. */
export function detailLines(r) {
  const out = [];
  const label = r.label ?? r.id ?? "?";
  if (r.sheet) out.push(`  ${label} sheet: ${r.sheet}`);
  if (r.patched?.length) out.push(`  ${label} patched: ${r.patched.join("; ")}`);
  if (r.defaults?.length) out.push(`  ${label} DEFAULTED (check): ${r.defaults.join(" | ")}`);
  if (r.warnings?.length) out.push(`  ${label} WARN: ${r.warnings.join(" | ")}`);
  if (r.notes?.length) out.push(`  ${label} notes: ${r.notes.join(" | ")}`);
  if (r.discarded?.length) out.push(`  ${label} cleanup: ${r.discarded.join(" | ")}`);
  return out;
}

function planLine(r) {
  const bits = [];
  if (r.at) bits.push(`at ${r.at}${r.placement ? ` (${r.placement})` : ""}`);
  if (r.footprint) bits.push(`footprint ${r.footprint}`);
  if (r.lockSize) bits.push("lockSize");
  if (r.hidden) bits.push("hidden");
  const head = bits.length ? `${bits.join(", ")}; ` : "";
  const creates = r.creates?.length ? `creates ${r.creates.join("; ")}` : (r.reason !== undefined ? `nothing (none: ${r.reason})` : "nothing");
  return `${head}${creates}`;
}

/**
 * The whole readback. `res`: `{dryRun, call, rows, remaining: {sceneId: n}, encounters: [...]}`.
 * Dry run: one plan line per prompt and the "nothing was written" footer.
 */
export function renderReplace(res) {
  const rows = res?.rows ?? [];
  const mode = res?.dryRun ? "dry run" : "real run";
  const ok = rows.filter(r => r.ok).length;
  const failed = rows.length - ok;
  const lines = [`replace ${res?.call ?? "(by marker)"} — ${mode}: ${ok} ok, ${failed} failed`];
  for (const r of rows) {
    const label = r.label ?? r.id ?? "?";
    if (!r.ok) {
      // MARKER_GONE: there was no marker to delete; "markerDeleted=false" would read as if it were still there
      lines.push(`${label}${r.kind ? ` ${r.kind}` : ""}: FAIL ${r.error ?? r.code ?? ""}`.trimEnd() +
        (res?.dryRun || r.code === "MARKER_GONE" ? "" : ` (markerDeleted=${r.markerDeleted ? "true" : "false"})`));
      lines.push(...detailLines(r));
      continue;
    }
    if (res?.dryRun) {
      lines.push(`${label} ${r.kind}: ${planLine(r)}`);
    } else {
      const created = r.created?.length ? r.created.join(", ") : r.kind === "none" ? `nothing (none: ${r.reason ?? ""})` : r.kind;
      lines.push(`${label} → ${created}; markerDeleted=${r.markerDeleted ? "true" : "false"}`);
    }
    lines.push(...detailLines(r));
  }
  const rl = remainingLine(res?.remaining, rows);
  if (rl) lines.push(rl);
  for (const e of res?.encounters ?? []) lines.push(encounterLine(e));
  if (res?.dryRun) lines.push("Nothing was written. Repeat the identical call without dryRun to apply.");
  return lines.join("\n");
}

/** `Token "Yark" [id] @x,y 1x1` — one created document, as the readback names it. */
export function createdText(c) {
  if (!c) return "?";
  const geom = c.x !== undefined && c.x !== null ? ` @${c.x},${c.y}${c.w !== undefined ? ` ${c.w}x${c.h}` : ""}` : "";
  return `${c.type ?? "?"} "${c.name ?? ""}" [${c.id ?? "?"}]${geom}${c.missing ? " (MISSING after create)" : ""}`;
}

/**
 * A dry-run row from a plan: `{index, id, label, kind, ok, code?, error?, plan?}` → flat.
 * `plan`: replace.mjs's planOne result (x, y, placement, footprint, lockSize, hidden, creates,
 * warnings, defaults, reason).
 */
export function planRow(f) {
  const base = { index: f.index, id: f.id ?? null, label: f.label, kind: f.kind ?? null, ok: !!f.ok };
  if (!f.ok) return { ...base, code: f.code ?? null, error: f.error ?? null };
  const p = f.plan ?? {};
  const row = { ...base, sceneId: p.sceneId ?? null, markerId: p.markerId ?? null,
    at: p.x !== null && p.x !== undefined ? `${p.x},${p.y}` : null, placement: p.placement ?? null,
    footprint: p.footprint ?? null, lockSize: !!p.lockSize, hidden: !!p.hidden,
    creates: strings(p.creates), warnings: strings(p.warnings), defaults: strings(p.defaults) };
  if (p.sheet) row.sheet = String(p.sheet);
  if (p.reason !== undefined) row.reason = String(p.reason);
  return row;
}

/**
 * A real-run row: `{index, id, label, sceneId, markerId, kind, ok, code?, error?, report?, created:
 * [{type, id, name, x?, y?, w?, h?}], discarded: [{type, id, name, discarded, error?}],
 * markerDeleted, reason?, prompt?}` → flat. The report's character `summary` becomes the `sheet` line.
 */
export function resultRow(f) {
  const rep = f.report ?? {};
  const created = (f.created ?? []).filter(Boolean);
  const row = { index: f.index, id: f.id ?? null, label: f.label, sceneId: f.sceneId ?? null, markerId: f.markerId ?? null,
    kind: f.kind ?? null, ok: !!f.ok, created: created.map(createdText), ids: created.map(c => c.id).filter(Boolean),
    markerDeleted: !!f.markerDeleted, sheet: sheetLine(rep.summary), patched: strings(rep.patched),
    defaults: strings(rep.defaults), warnings: strings(rep.warnings), notes: strings(rep.notes),
    discarded: (f.discarded ?? []).map(d => (d.discarded ? `deleted ${d.type} "${d.name}" [${d.id}]`
      : `could not delete ${d.type} "${d.name}" [${d.id}]: ${d.error ?? "?"}`)) };
  if (!f.ok) Object.assign(row, { code: f.code ?? null, error: f.error ?? null });
  if (f.reason !== undefined) row.reason = String(f.reason);
  if (f.prompt !== undefined) row.prompt = String(f.prompt);
  return row;
}

function strings(list) {
  return (list ?? []).map(x => (typeof x === "string" ? x : JSON.stringify(x)));
}

/**
 * The `remaining:` line. `{sceneId: n}` → `remaining: s1=3 s2=0`. When no replacement reached a
 * scene (every row failed before its scene resolved: an unknown call, a bad spec) the count is
 * unknown, not zero — "remaining: none" read as if everything were built (usability run 2026-10).
 */
export function remainingLine(remaining, rows = []) {
  if (!remaining || typeof remaining !== "object") return null;
  const parts = Object.entries(remaining).map(([s, n]) => `${s}=${n}`);
  if (parts.length) return `remaining: ${parts.join(" ")}`;
  if ((rows ?? []).length && (rows ?? []).every(r => !r.ok)) return "remaining: unknown (no replacement reached a scene; gather again)";
  return "remaining: none";
}

/**
 * More than `over` replacements in one call need a dry run of the same set first. The count is
 * what the call ASKED for, not what validated: six specs of which five are stale must not slip
 * under the guard and write the sixth for real (usability run 2026-10).
 */
export function needsDryRun({ requested = 0, seen = false, skip = false, over = 5 } = {}) {
  return requested > over && !seen && !skip;
}

/**
 * Why a marker is gone, for MARKER_GONE. `replacedBy`: `Token "Yark" [id]` (a document whose
 * provenance names this marker); `resizedTo`: the id of the marker a size chip swapped it for.
 */
export function goneMessage({ pid = null, markerId = "?", sceneName = "?", replacedBy = null, resizedTo = null } = {}) {
  const who = pid ?? markerId;
  if (replacedBy) return `${who} was already replaced on ${sceneName} (now ${replacedBy}); gather again for what is left`;
  if (resizedTo) return `${who} was resized on ${sceneName} (now marker ${resizedTo}); gather again`;
  return `${who} no longer on ${sceneName} (deleted, or replaced outside this module); gather again`;
}
