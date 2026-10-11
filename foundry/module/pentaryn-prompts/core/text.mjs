/**
 * pentaryn-prompts core — hashes, prompt text, HTML stripping, previews, relation text.
 * PURE (split out of geometry-core.mjs, which re-exports the public names): no Foundry global.
 */

import { band } from "./grid.mjs";
import { fmtNum } from "./size.mjs";

/* ── Hashes ──────────────────────────────────────────────────────────────── */

/** FNV-1a 32-bit over a string's UTF-16 code units. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 8-hex hash of a prompt text, for the manifest's TEXT_CHANGED check. */
export function textHash(text) {
  return fnv1a(normalisePrompt(text)).toString(16).padStart(8, "0");
}

/**
 * `pm-<4 hex>` over scene ids, marker ids, prompt texts and (when given) the `p#` each marker got.
 * Order-independent (entries are sorted). Moving a marker or opening a door changes the call only
 * when it changes the numbering: a call id always names one p# → marker mapping, so a replace
 * written against an older gather text can never land on a renumbered marker.
 */
export function callId(entries) {
  const lines = (entries ?? []).map(e => `${e.sceneId}\u0000${e.markerId}\u0000${normalisePrompt(e.text)}${e.pid ? `\u0000${e.pid}` : ""}`).sort();
  return `pm-${(fnv1a(lines.join("\u0001")) & 0xffff).toString(16).padStart(4, "0")}`;
}

/* ── Text helpers ────────────────────────────────────────────────────────── */

/** Trim, normalise newlines, strip trailing spaces per line. Paragraphs are kept. */
export function normalisePrompt(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map(l => l.replace(/\s+$/, "")).join("\n").trim();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" };

/**
 * Foundry enricher markup → readable text. `@Embed[…]` is dropped (gather/panel resolve it to the
 * embedded page's text first; anything left is unresolvable), `@UUID[…]{Label}` and the other
 * `@Type[…]{Label}` links keep their label, `[[/r 2d6]]` keeps its formula, `&Reference[x]` keeps x.
 */
export function stripEnrichers(text) {
  return String(text ?? "")
    .replace(/@Embed\[[^\]]*\](\{[^}]*\})?/g, "")
    .replace(/@[A-Za-z]+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/@[A-Za-z]+\[[^\]]*\]/g, "")
    .replace(/\[\[\/?[a-z]*\s*([^\]]*)\]\](\{([^}]*)\})?/gi, (m, f, l, label) => label ?? f.trim())
    .replace(/&Reference\[([^\]\s]*)[^\]]*\](\{([^}]*)\})?/g, (m, k, l, label) => label ?? k);
}

/** HTML → plain text: block tags become newlines, entities decoded, enrichers stripped, whitespace collapsed per line. */
export function stripHtml(html) {
  const s = stripEnrichers(String(html ?? ""))
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (ENTITIES[k] !== undefined) return ENTITIES[k];
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10));
      return m;
    });
  return s.split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).filter((l, i, a) => l || (a[i - 1] ?? "") !== "")
    .join("\n").trim();
}

/** One line, at most `n` characters, `...` when cut. */
export function preview(text, n) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!n || flat.length <= n) return flat;
  return flat.slice(0, Math.max(0, n - 3)).replace(/\s+\S*$/, "").trimEnd() + "...";
}

/**
 * Up to `n` characters, cut at the last sentence end that keeps at least half of them (so a
 * description keeps whole rules, not "Tactics Fights from behind his..."), else on a word, `...`
 * when cut. Line breaks become " / " so stat-block-ish lines stay apart.
 */
export function previewSentences(text, n) {
  const flat = String(text ?? "").split(/\n+/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).join(" / ");
  if (!n || flat.length <= n) return flat;
  const cut = flat.slice(0, n);
  let end = -1;
  for (const m of cut.matchAll(/[.!?]["')\]]?(?=\s|$)|\s\/(?=\s)/g)) end = m.index + m[0].length;
  if (end >= n * 0.5) return `${cut.slice(0, end).replace(/\s*\/$/, "").trimEnd()} [...]`;
  return preview(flat, n);
}

/**
 * A built thing's description for the gather: `previewSentences`, and when that shortened it, the
 * cut mark is replaced by where the full text is (D6):
 * `… (cut, full text: get-character <id>)`. `id` is the actor's id (the document's for a note).
 * A token with its own text (`tokenUuid`, see ownTextUuid) points at the token instead: get-character
 * on the base actor's id would print the base actor's text, not the one that was cut.
 */
export function builtDescription(text, n, id, { tokenUuid = null } = {}) {
  const full = previewSentences(text, 0);
  const shown = previewSentences(text, n);
  if (shown === full) return shown;
  const body = shown.replace(/\s*(\[\.\.\.\]|\.\.\.)$/, "");
  if (tokenUuid) {
    return `${body} … (cut, this token's own text: eval-js fromUuidSync("${tokenUuid}").actor.system.details.biography.value)`;
  }
  return `${body} … (cut, full text: get-character ${id})`;
}

/**
 * The token's uuid when its description is its own: an unlinked token whose (delta) text is not
 * empty and differs from its base actor's. Otherwise null (the base actor's id finds the text).
 */
export function ownTextUuid({ actorLink, description, baseDescription, uuid }) {
  if (actorLink || !uuid || !description) return null;
  return description === (baseDescription ?? "") ? null : uuid;
}

/**
 * The marker's nameplate: `✎ <first 40 chars>`, lines joined with " / ", `…` only when cut;
 * or `Prompt · mid — empty`.
 */
export function nameplate(text, sizeKey) {
  const t = normalisePrompt(text);
  if (!t) return `Prompt · ${sizeKey} — empty`;
  const flat = t.split(/\n+/).map(l => l.trim()).filter(Boolean).join(" / ");
  return flat.length > 40 ? `✎ ${flat.slice(0, 40).trimEnd()}…` : `✎ ${flat}`;
}

/** YYYY-MM-DD for a ms epoch (UTC). */
export function isoDate(ms) {
  const d = new Date(Number(ms));
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

/** One relation as the text shows it: `p2 10 SW reach`, `p6 40 S door`. */
export function relationText(r) {
  const parts = [r.id, fmtNum(r.ft), r.bearing || "here", band(r.ft)];
  if (r.los && r.los !== "LOS") parts.push(r.los);
  return parts.join(" ");
}

/** Sort relations nearest first, then by id (numeric-aware). */
export function sortRelations(rels) {
  return [...rels].sort((a, b) => (a.ft - b.ft) || idCompare(a.id, b.id));
}

/** p2 < p10 < t1 — kind letter, then number. */
export function idCompare(a, b) {
  const A = /^([a-zA-Z]+)(\d+)$/.exec(String(a)), B = /^([a-zA-Z]+)(\d+)$/.exec(String(b));
  if (A && B) return A[1].localeCompare(B[1]) || (Number(A[2]) - Number(B[2]));
  return String(a).localeCompare(String(b));
}
