// pentaryn kit 1.0.1 · vendored from foundry/lib/resolve.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * One reference resolver for every API boundary. A ref may be a Document, a placeable (`.document`),
 * a UUID, a 16-character id, or an exact name — never a substring. Substring matching is a
 * convenience of the MCP bridge's own tools and must not reach a write path here.
 *
 * Scene scope is explicit: `sceneId` names a scene, `"current"` means the viewing client's canvas,
 * and nothing at all means every scene in order. There is no implicit `canvas.scene`, because the
 * bridge's browser tab is looking at an arbitrary scene.
 */

import { codedError } from "./errors.mjs";

const DOC = {
  actor: "Actor", token: "Token", item: "Item", scene: "Scene", user: "User",
  journal: "JournalEntry", message: "ChatMessage", macro: "Macro", region: "Region",
  combat: "Combat", table: "RollTable", folder: "Folder", playlist: "Playlist",
};
const COLLECTION = {
  actor: "actors", item: "items", scene: "scenes", user: "users", journal: "journal",
  message: "messages", macro: "macros", combat: "combats", table: "tables",
  folder: "folders", playlist: "playlists",
};
const EMBEDDED = { token: "tokens", region: "regions" };
const ID = /^[A-Za-z0-9]{16}$/;
const UUID = /^(?:Compendium\.|[A-Z][A-Za-z]+\.[A-Za-z0-9]{16}(?:\.|$))/;

function listOf(coll) {
  if (!coll) return [];
  if (Array.isArray(coll.contents)) return coll.contents;
  if (typeof coll.values === "function") return [...coll.values()];
  return [...coll];
}

function scenesFor(sceneId, g) {
  if (sceneId === "current") return g.canvas?.scene ? [g.canvas.scene] : [];
  if (sceneId) {
    const s = g.game.scenes?.get?.(sceneId);
    if (!s) throw codedError("NOT_FOUND", `scene ${sceneId}`);
    return [s];
  }
  return listOf(g.game.scenes);
}

/** Token → actor, per `base`: the world actor (`base: true`) or the token's own (synthetic) actor. */
function actorOfToken(tokenDoc, base, g) {
  if (!tokenDoc) return null;
  return base ? g.game.actors?.get?.(tokenDoc.actorId) ?? null : tokenDoc.actor ?? null;
}

function adapt(doc, kind, base, g) {
  const want = DOC[kind] ?? kind;
  if (!doc) return null;
  if (doc.documentName === want) return doc;
  if (kind === "actor" && doc.documentName === "Token") return actorOfToken(doc, base, g);
  throw codedError("BAD_ARGS", `expected ${want}, got ${doc.documentName}`);
}

function byName(candidates, ref, kind) {
  const exact = candidates.filter(d => d?.name === ref);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw codedError("AMBIGUOUS", `${exact.length} ${kind}s named ${ref}`);
  const lower = ref.toLowerCase();
  const loose = candidates.filter(d => typeof d?.name === "string" && d.name.toLowerCase() === lower);
  if (loose.length === 1) return loose[0];
  if (loose.length > 1) throw codedError("AMBIGUOUS", `${loose.length} ${kind}s named ${ref}`);
  return null;
}

/**
 * @param {*} ref
 * @param {string} [kind]  actor | token | item | scene | user | journal | message | macro | region | …
 * @param {{ base?: boolean, sceneId?: string, required?: boolean, g?: object }} [opts]
 * @returns {object|null}  the Document, or null when `required` is false and nothing matched
 */
export function resolveRef(ref, kind = "actor", { base = false, sceneId, required = true, g = globalThis } = {}) {
  const miss = () => {
    if (required) throw codedError("NOT_FOUND", `${kind} ${typeof ref === "string" ? ref : String(ref?.id ?? ref)}`);
    return null;
  };
  if (ref === null || ref === undefined || ref === "") {
    if (required) throw codedError("BAD_ARGS", `no ${kind} given`);
    return null;
  }

  // (1) a Document, or a placeable carrying one
  if (typeof ref === "object") {
    const doc = ref.documentName ? ref : ref.document?.documentName ? ref.document : null;
    if (!doc) throw codedError("BAD_ARGS", `not a ${kind} reference`);
    return adapt(doc, kind, base, g) ?? miss();
  }
  if (typeof ref !== "string") throw codedError("BAD_ARGS", `not a ${kind} reference`);

  // (2) a UUID
  if (ref.includes(".")) {
    let doc = null;
    try {
      doc = g.fromUuidSync?.(ref) ?? null;
    } catch {
      doc = null;
    }
    if (doc) return adapt(doc, kind, base, g) ?? miss();
    if (UUID.test(ref)) return miss();
    // a name with a period in it ("Mr. Brine") falls through to the name lookup
  }

  // (3) a 16-character id
  const embedded = EMBEDDED[kind];
  if (ID.test(ref)) {
    const coll = COLLECTION[kind] ? g.game[COLLECTION[kind]] : null;
    const direct = coll?.get?.(ref);
    if (direct) return direct;
    if (kind === "actor" || embedded) {
      for (const scene of scenesFor(sceneId, g)) {
        const hit = scene?.[embedded ?? "tokens"]?.get?.(ref);
        if (hit) return kind === "actor" ? actorOfToken(hit, base, g) ?? miss() : hit;
      }
    }
  }

  // (4) an exact name, then a case-insensitive one
  let candidates;
  if (embedded) candidates = scenesFor(sceneId, g).flatMap(s => listOf(s?.[embedded]));
  else candidates = listOf(COLLECTION[kind] ? g.game[COLLECTION[kind]] : null);
  const named = byName(candidates, ref, kind);
  if (named) return named;

  // (5) nothing
  return miss();
}

/** The plain reference an API returns in place of a Document. */
export function refOf(doc) {
  if (!doc || typeof doc !== "object") return null;
  const d = doc.documentName ? doc : doc.document?.documentName ? doc.document : null;
  if (!d) return null;
  return { documentName: d.documentName, id: d.id ?? null, uuid: d.uuid ?? null, name: d.name ?? null };
}

/** ids (array, Set, single id, Documents) → Set of id strings; null/undefined → null (meaning "all"). */
export function toIdSet(ids) {
  if (ids === null || ids === undefined) return null;
  const list = typeof ids === "string" || typeof ids !== "object" || ids.documentName
    ? [ids]
    : [...ids];
  return new Set(list.map(v => (v && typeof v === "object" ? v.id : v)).filter(v => v != null).map(String));
}

/** Wrap `fn(doc, ...rest)` so its first argument is resolved from a ref. */
export function withRef(fn, kind = "actor", opts = {}) {
  const wrapped = (ref, ...rest) => fn(resolveRef(ref, kind, opts), ...rest);
  Object.defineProperty(wrapped, "name", { value: fn.name || "withRef" });
  return wrapped;
}
