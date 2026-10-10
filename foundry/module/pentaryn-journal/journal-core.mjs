/**
 * Pentaryn Player Journal — the pure half
 * =======================================
 *
 * Everything here is plain string and array work: no Foundry global is touched at module scope or
 * anywhere else, so `node test/run.mjs` can import it bare and prove it. Anything that needs the
 * world (resolving a relative uuid, localising a label) is passed in.
 *
 * The one job that matters is `sanitize`. A player's client holds the RAW page HTML of every
 * readable it can open, GM secrets included; the sheet only hides them at render. Copying that
 * HTML into a journal the player OWNS would render those secrets to them, because Foundry shows
 * secrets to owners. So the copy is cut down to exactly what the player was shown:
 *
 *   1. stripSecrets    unrevealed `<section class="secret">` blocks go, nested ones included;
 *                      revealed ones are unwrapped to `pj-revealed` so they stop being secrets.
 *   2. dropActive      `<script>`, reveal buttons and `<secret-block>` wrappers go.
 *   3. embedsToLinks   `@Embed[...]` becomes `@UUID[...]`. An embed renders with the OUTER
 *                      document's secrets flag, which in the player's own journal is true — an
 *                      embed would show the embedded page's secrets. A link shows nothing.
 *   4. absolutizeUuids `@UUID[.x]` is relative to the page it sits on; in the copy it would point
 *                      at the player's own pages, so it is resolved against the source first.
 *
 * ⚠ test/ is copied to the server with the module and served to every client. Fixtures there are
 *   synthetic; real campaign text is only ever checked in a live eval.
 */

export const MOD = "pentaryn-journal";

/** Refuse to copy a body larger than this (characters ≈ bytes for prose). */
export const MAX_BODY = 500_000;

/** Foundry's CONST.SORT_INTEGER_DENSITY, repeated so this file stays free of globals. */
export const SORT_DENSITY = 100_000;

/* -------------------------------------------- */
/*  Small helpers                               */
/* -------------------------------------------- */

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape a value for use in HTML text or a double-quoted attribute. */
export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ESC[c]);
}

/** 32-bit FNV-1a over UTF-16 code units, as 8 hex characters. Change detection, not security. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/* -------------------------------------------- */
/*  1. stripSecrets                             */
/* -------------------------------------------- */

/**
 * A comment, or one tag. Quoted attribute values may contain `>`; the group captures the tag name.
 * Text between matches is passed through (or dropped) untouched.
 */
const TOKEN = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;

/** The class tokens of an opening tag. `data-class=` does not count. */
function classesOf(tag) {
  const m = /(?:^|[\s/])class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(tag);
  if (!m) return [];
  return (m[1] ?? m[2] ?? m[3] ?? "").split(/\s+/).filter(Boolean);
}

/** A revealed secret's opening tag, rewritten so it is no longer a secret at all. */
function unwrapRevealedTag(tag, classes) {
  const rest = classes.filter(c => !/^(secret|revealed)$/i.test(c));
  if (!rest.includes("pj-revealed")) rest.push("pj-revealed");
  let out = tag.replace(/\s+id\s*=\s*(?:"secret-[^"]*"|'secret-[^']*'|secret-[^\s>"']*)/i, "");
  out = out.replace(/(\s)class\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+)/i, `$1class="${rest.join(" ")}"`);
  return out;
}

/**
 * Remove every unrevealed `<section class="secret">`, with whatever it contains (nested sections,
 * comments, other secrets). An unclosed one runs to the end of the string. A revealed one keeps its
 * body and loses its secret-ness. Comments outside a drop region are kept as they are.
 */
export function stripSecrets(html) {
  if (typeof html !== "string") return "";
  let out = "";
  let last = 0;
  let drop = 0;                 // section depth inside the region being dropped; 0 = keeping
  TOKEN.lastIndex = 0;
  for (let m; (m = TOKEN.exec(html));) {
    const text = html.slice(last, m.index);
    last = TOKEN.lastIndex;
    if (!drop) out += text;
    const tag = m[0];
    const name = m[1]?.toLowerCase();
    if (name !== "section") { if (!drop) out += tag; continue; }
    const closing = tag[1] === "/";
    if (drop) {
      if (closing) drop--;
      else if (!/\/\s*>$/.test(tag)) drop++;
      continue;                 // the closing tag of the region goes with it
    }
    if (closing) { out += tag; continue; }
    const classes = classesOf(tag);
    const secret = classes.some(c => c.toLowerCase() === "secret");
    const revealed = classes.some(c => c.toLowerCase() === "revealed");
    if (secret && !revealed) { drop = 1; continue; }
    out += secret ? unwrapRevealedTag(tag, classes) : tag;
  }
  if (!drop) out += html.slice(last);
  return out;
}

/* -------------------------------------------- */
/*  2. dropActive                               */
/* -------------------------------------------- */

const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;

/** Scripts, reveal buttons and the render-only `<secret-block>` wrapper. */
export function dropActive(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(new RegExp(`<script\\b${ATTRS}>[\\s\\S]*?(?:<\\/script\\s*>|$)`, "gi"), "")
    .replace(new RegExp(`<button\\b(${ATTRS})>[\\s\\S]*?<\\/button\\s*>`, "gi"),
      (all, attrs) => (classesOf(attrs).some(c => /reveal/i.test(c)) ? "" : all))
    .replace(new RegExp(`<\\/?secret-block\\b${ATTRS}>`, "gi"), "");
}

/* -------------------------------------------- */
/*  3 + 4. Links                                */
/* -------------------------------------------- */

function absolute(uuid, resolve) {
  if (!uuid.startsWith(".") || typeof resolve !== "function") return uuid;
  try { return resolve(uuid) || uuid; } catch { return uuid; }
}

/**
 * `@Embed[<cfg>]{label}` → `@UUID[<uuid>]{label}`. The uuid is `uuid=` from the config, else its
 * first bare token. An embed with no recognisable uuid is reduced to its label.
 */
export function embedsToLinks(html, { resolve, embeddedLabel = "embedded content" } = {}) {
  if (typeof html !== "string") return "";
  return html.replace(/@Embed\[([^\]]*)\](?:\{([^}]*)\})?/g, (all, cfg, label) => {
    const tokens = cfg.trim().split(/\s+/).filter(Boolean);
    const named = tokens.find(t => /^uuid=/i.test(t));
    let uuid = named ? named.slice(5).replace(/^["']|["']$/g, "") : tokens.find(t => !t.includes("="));
    const text = label?.trim() || embeddedLabel;
    if (!uuid) return escapeHTML(label ?? "");
    uuid = absolute(uuid, resolve);
    return `@UUID[${uuid}]{${text}}`;
  });
}

/** Make every relative `@UUID[.x]` absolute through the injected resolver. */
export function absolutizeUuids(html, resolve) {
  if (typeof html !== "string") return "";
  return html.replace(/@UUID\[([^\]]+)\]/g, (all, uuid) => `@UUID[${absolute(uuid.trim(), resolve)}]`);
}

/**
 * Everything a player may keep from a page they were shown: no unrevealed secret, nothing active,
 * no embed, no relative link. Idempotent; never throws; non-string input gives "".
 *
 * @param {string} html
 * @param {{resolve?: (uuid: string) => string|null, embeddedLabel?: string}} [opts]
 */
export function sanitize(html, { resolve, embeddedLabel } = {}) {
  if (typeof html !== "string") return "";
  try {
    let out = stripSecrets(html);
    out = dropActive(out);
    out = embedsToLinks(out, { resolve, embeddedLabel });
    return absolutizeUuids(out, resolve);
  } catch {
    return "";
  }
}

/* -------------------------------------------- */
/*  The saved page                              */
/* -------------------------------------------- */

function defaultDate(ts) {
  try { return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
}

/**
 * The provenance line at the top of a saved text page. Every label arrives localised; every
 * interpolated value is escaped. Unknown parts are left out.
 *
 * @param {object} p
 * @param {string|null} [p.place]     a name the player already sees (navName, folder, pile)
 * @param {string|null} [p.noteText]  the pin's label
 * @param {number} [p.savedAt]
 * @param {string} [p.key]            the source uuid, linked as "the original"
 * @param {{foundIn?: string, found?: string, original?: string, date?: (ts:number)=>string}} [p.labels]
 *        `foundIn` contains `{place}`.
 */
export function provenanceHTML({ place, noteText, savedAt, key, labels = {} } = {}) {
  const L = { foundIn: "Found in {place}", found: "Found", original: "the original", ...labels };
  let lead;
  if (place) {
    const [before, after = ""] = String(L.foundIn).split("{place}");
    lead = `${escapeHTML(before)}<strong>${escapeHTML(place)}</strong>${escapeHTML(after)}`;
  } else lead = escapeHTML(L.found);
  if (noteText) lead += ` — “${escapeHTML(noteText)}”`;
  const parts = [lead];
  const date = savedAt ? (L.date ?? defaultDate)(savedAt) : "";
  if (date) parts.push(escapeHTML(date));
  if (key) parts.push(`@UUID[${String(key).replace(/[\]\s]/g, "")}]{${String(L.original).replace(/[{}]/g, "")}}`);
  return `<div class="pj-provenance"><p><i class="fa-solid fa-book-bookmark"></i> ${parts.join(" · ")}</p></div>`;
}

/** Provenance, a rule, then the sanitized body. */
export function snapshotHTML({ provenance = "", body = "" } = {}) {
  return `${provenance}<hr class="pj-rule">${body}`;
}

/** A page's own name, unless it is blank or a default "Page N", in which case the entry's. */
export function pageName(page, entry, defaultPattern = /^\s*page\s*\d*\s*$/i) {
  const own = String(page?.name ?? "").trim();
  if (own && !defaultPattern.test(own)) return own;
  return String(entry?.name ?? "").trim() || own;
}

/** What a descriptor hashes: the sanitized body, or for an image its src and caption. */
export function hashOf(src) {
  return fnv1a(src?.type === "image" ? `${src.src ?? ""}\n${src.caption ?? ""}` : (src?.body ?? ""));
}

const sourceOf = p => p?.flags?.[MOD]?.source ?? null;
const idOf = p => p?.id ?? p?._id;

/** The first saved page whose source key matches. */
export function findSaved(savedPages, key) {
  return (savedPages ?? []).find(p => sourceOf(p)?.key === key) ?? null;
}

/**
 * Decide what one click writes.
 *
 * @param {object[]} savedPages   the personal journal's pages (documents or plain data)
 * @param {object[]} sources      descriptors: {kind, key, type: "text"|"image", name, body | src+caption,
 *                                entryId, entryName, pageName, hash?}
 * @param {object} ctx            {place, noteText, now, worldTime, labels}
 * @returns {{create: object[], update: object[], existing: string[], tooLarge: boolean}}
 */
export function planSave(savedPages, sources, ctx = {}) {
  const plan = { create: [], update: [], existing: [], tooLarge: false };
  const list = Array.isArray(sources) ? sources : [];
  if (list.some(s => s.type !== "image" && String(s.body ?? "").length > MAX_BODY)) {
    plan.tooLarge = true;
    return plan;
  }
  const now = ctx.now ?? 0;
  let sort = Math.max(0, ...(savedPages ?? []).map(p => Number(p?.sort) || 0));
  for (const s of list) {
    const hash = s.hash ?? hashOf(s);
    const saved = findSaved(savedPages, s.key);
    const old = sourceOf(saved);
    if (saved && old.hash === hash) { plan.existing.push(idOf(saved)); continue; }

    const savedAt = old?.savedAt ?? now;
    const source = {
      kind: s.kind ?? "page", key: s.key,
      entryId: s.entryId ?? null, entryName: s.entryName ?? null, pageName: s.pageName ?? null,
      place: ctx.place ?? null, noteText: ctx.noteText ?? null,
      savedAt, worldTime: old?.worldTime ?? ctx.worldTime ?? null, hash
    };
    const content = s.type === "image" ? null : snapshotHTML({
      provenance: provenanceHTML({ place: source.place, noteText: source.noteText, savedAt, key: s.key, labels: ctx.labels }),
      body: s.body ?? ""
    });

    if (saved) {
      const upd = { _id: idOf(saved), flags: { [MOD]: { source: { ...old, hash, updatedAt: now } } } };
      if (s.type === "image") Object.assign(upd, { src: s.src ?? "", image: { caption: s.caption ?? "" } });
      else upd.text = { content };
      plan.update.push(upd);
      continue;
    }
    sort += SORT_DENSITY;
    const data = { name: s.name || "?", type: s.type === "image" ? "image" : "text",
      title: { show: true, level: 1 }, sort, flags: { [MOD]: { source } } };
    if (s.type === "image") Object.assign(data, { src: s.src ?? "", image: { caption: s.caption ?? "" } });
    else data.text = { format: 1, content };
    plan.create.push(data);
  }
  return plan;
}

/**
 * Where a set of sources stands against the journal: "none" | "partial" | "saved" | "changed".
 * "changed" wins over everything: one stale copy is the thing worth saying.
 */
export function status(savedPages, sources) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return "none";
  let found = 0;
  for (const s of list) {
    const saved = findSaved(savedPages, s.key);
    if (!saved) continue;
    found++;
    if (sourceOf(saved).hash !== (s.hash ?? hashOf(s))) return "changed";
  }
  if (!found) return "none";
  return found === list.length ? "saved" : "partial";
}

/**
 * The GM-side gate for the ensure query. `user` is the server-authenticated sender.
 * @returns {{ok: boolean, reason?: string, entryId?: string, create?: boolean}}
 */
export function validateEnsure(user, existingId) {
  if (!user || !user.id) return { ok: false, reason: "no such user" };
  if (user.isGM) return { ok: false, reason: "a GM does not get a journal through the relay" };
  if (existingId) return { ok: true, entryId: existingId };
  return { ok: true, create: true };
}
