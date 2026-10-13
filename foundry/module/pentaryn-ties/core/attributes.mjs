/**
 * Phase 6 — the attribute layer: the registry index and tree (`indexRegistry`, `subtreeOf`,
 * `forestOf`), the clamped registry entry, review state and snapshots, sources, the help scale,
 * ancestry and the identification ladder.
 *
 * Pure: no Foundry global (split out of known-core.mjs, which re-exports this file — S4, ties-36).
 */

import { LORE_DC_DEFAULT, LORE_DC_MAX, LORE_DC_MIN, LORE_TEXT_MAX, readLore } from "./lore.mjs";
import { ATTR_TITLE_MAX, num, str, timeOrNull } from "./shared.mjs";
import { BELIEFS_FLAG } from "./study.mjs";
export { ATTR_TITLE_MAX } from "./shared.mjs";

/**
 * One pass over the registry: id → entry, and parent → children.
 *
 * The tree functions used to call `readRegistry` — a clamp of every entry plus `readLore` over
 * every row — once **per node**, which makes a paint O(n²) in registry size and fires on every
 * sheet render and after every grant click. Build this once and hand it down instead. Anywhere a
 * `registry` is accepted below, an index may be passed in its place.
 */
export function indexRegistry(registry) {
  const list = readRegistry(registry);
  const byId = new Map(list.map(e => [e.id, e]));
  const kids = new Map();
  for (const e of list) {
    const p = typeof e.parent === "string" ? e.parent : "";
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(e);
  }
  return { list, byId, kids };
}

const asIndex = registry => (registry?.byId instanceof Map ? registry : indexRegistry(registry));

/**
 * A pure runaway backstop, and nothing else.
 *
 * ⚠ It is **not** the cycle guard — `subtreeOf`'s `seen` set is, and it terminates a loop at the
 * repeat whatever this is set to; `updateAttribute` now refuses to write one in the first place.
 * An earlier 12 was doing double duty and quietly amputated real worlds: a chain of realm →
 * kingdom → region → city → quarter → district → street → house → household → order → cell is
 * eleven before anyone has been unreasonable, and the twelfth vanished with no error. Joe:
 * *"can be much deeper than 3 in some cases — let's ensure the depth can go much deeper."*
 *
 * So it sits far above any plausible world. Nothing here costs anything until a branch is that
 * deep, and a tree that hits 64 is a bug worth hearing about rather than a world worth drawing.
 */
export const TREE_DEPTH_MAX = 64;

/** The direct children of an id — the inverse of `ancestorsOf`, and just as computed. */
export const childrenOf = (id, registry) => asIndex(registry).kids.get(typeof id === "string" ? id.trim() : "") ?? [];

/**
 * One attribute and everything beneath it, as a nested tree.
 *
 * `state(id)` is injected so this stays pure: the caller decides what "known", "failed" or
 * "unknown" mean and this only arranges them. A cycle (reachable only by hand-editing the setting —
 * `updateAttribute` refuses one) stops at the repeat via `seen`; the depth cap is a runaway
 * backstop only (TREE_DEPTH_MAX).
 */
export function subtreeOf(id, registry, { state = () => null, icon = null, depth = 0, seen = new Set(), index = null } = {}) {
  const key = typeof id === "string" ? id.trim() : "";
  const idx = index ?? asIndex(registry);
  if (!key || seen.has(key)) return null;
  const entry = idx.byId.get(key);
  if (!entry) return null;
  if (depth > TREE_DEPTH_MAX) {
    // amputating in silence is the failure this module has been bitten by most; say so once
    console?.warn?.(`pentaryn-ties | attribute tree deeper than ${TREE_DEPTH_MAX} at "${key}" — branch not drawn`);
    return null;
  }
  const next = new Set([...seen, key]);
  return {
    id: key,
    title: entry.title,
    category: entry.category,
    // injected like `state`, so this file stays free of any particular VTT's art paths — the client
    // half fills a blank icon from the entry's category
    icon: icon ? icon(entry) : entry.icon,
    secret: entry.secret,
    depth,
    state: state(key),
    children: childrenOf(key, idx)
      .map(c => subtreeOf(c.id, idx, { state, icon, depth: depth + 1, seen: next, index: idx }))
      .filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title))
  };
}

/**
 * Every root, each with its subtree — the whole world as a forest.
 *
 * ⚠ **Nothing may vanish.** A root used to be "no parent, or a parent that is not in the
 * registry" — but every member of a `parent` cycle has a parent that IS in the registry, so a
 * cycle and its whole descendant subtree silently disappeared from the GM's browser, from the
 * player's, and from the only surface that can hand any of it over, while `searchAttributes` and
 * the knowledge ledger went on believing in them. `subtreeOf`'s seen-set guards a walk that in
 * that case never started. So anything no root reached is promoted to a root of its own: a
 * malformed registry costs a wrong-looking tree rather than an invisible one.
 */
export const forestOf = (registry, opts = {}) => {
  const idx = asIndex(registry);
  const byTitle = (a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""));
  const trees = idx.list
    .filter(e => !e.parent || !idx.byId.has(e.parent))
    .map(e => subtreeOf(e.id, idx, { ...opts, index: idx }))
    .filter(Boolean);

  const seen = new Set();
  const mark = n => { seen.add(n.id); n.children.forEach(mark); };
  trees.forEach(mark);
  for (const e of idx.list) {
    if (seen.has(e.id)) continue;
    const orphan = subtreeOf(e.id, idx, { ...opts, index: idx });
    if (!orphan) continue;
    mark(orphan);
    trees.push(orphan);
  }
  return trees.sort(byTitle);
};

export function contractForest(forest, keep = () => true) {
  /*
   * ⚠ A survivor is attached to a parent **only when its immediate parent survived**. An earlier
   * cut let a dropped node's children fall into the nearest *kept ancestor* instead — so a player
   * told about Greyharbour and the Quiet Hand, but not the Undercity between them, saw the guild
   * drawn directly inside the city. Nesting is the whole information this view carries, so that
   * edge asserted a containment the GM never granted, and asserted it wrongly besides (it is two
   * levels down, not one). Joe's rule is literal: *"if I gave them a child and didn't give them
   * the parent, it should live unparented."* Not re-homed — unparented.
   */
  const unplaced = [];
  const visit = node => {
    const kids = (Array.isArray(node?.children) ? node.children : []).map(visit).filter(Boolean);
    if (keep(node)) return { ...node, children: kids };
    // dropped: its kept children have nowhere honest to hang, so they stand on their own
    unplaced.push(...kids);
    return null;
  };

  const roots = (Array.isArray(forest) ? forest : []).map(visit).filter(Boolean);
  const byTitle = (a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""));
  const stamp = (node, depth) => ({ ...node, depth, children: node.children.map(c => stamp(c, depth + 1)).sort(byTitle) });
  return [...roots, ...unplaced].map(n => stamp(n, 0)).sort(byTitle);
}

/* -------------------------------------------- */
/*  Phase 6 — the attribute layer               */
/* -------------------------------------------- */

/**
 * The registry (decision 16): **authored structure only**, in a world setting.
 *
 * A world setting rather than a flag for one reason, and it is not secrecy — everything in a
 * world syncs to every client regardless (decision 8's measurements). It is **writability**:
 * `SETTINGS_MODIFY` requires role 4, so the server refuses a player write. That puts
 * attribute-lore locks in the same player-unwritable category as the beliefs flag on an NPC,
 * which is the only property the lock needs.
 */
export const REGISTRY_SETTING = "attributes";

/** The ledger — a **sibling** setting, never rows inside registry entries (the two-plane rule). */
export const ATTR_BELIEFS_SETTING = "attributeBeliefs";

/** Authored links, on any actor, GM-written. Derived links are computed and never stored. */
export const ATTRIBUTES_FLAG = "attributes";

/** Suppress one derived link on one actor — the only storage derivation ever needs. */
export const ATTRIBUTES_OFF_FLAG = "attributesOff";

export const ATTR_CATEGORY_MAX = 60;

/**
 * The namespaces derivation produces. Anything with a `:` is derived; a bare slug is authored.
 *
 * That is what makes decision 18's uniqueness rule free: an authored id is `[a-z0-9]+` with no
 * separator, so it can never collide with `species:human` no matter what a GM types.
 */
export const DERIVED_NAMESPACES = ["type", "species", "background", "size", "kind"];

/**
 * Which derived namespaces may grant advantage even when a GM has authored a registry entry
 * for them (decision 19's degeneracy rule).
 *
 * `type:humanoid` is carried by nearly every PC and most NPCs in a campaign — if sharing it
 * granted advantage, studying almost anyone would be at advantage and the mechanic would mean
 * nothing. Sharing a *guild* is information; sharing a *silhouette* is not. `size:` goes with
 * it for the same reason. `species:`, `background:` and `kind:` are narrow enough to be real
 * information, so an authored entry may switch them on.
 */
const NEVER_ADVANTAGE = new Set(["type", "size"]);

/*
 * The same two namespaces can never be *secret* either, and for the same reason turned around:
 * a medium humanoid cannot conceal being medium or humanoid — those are the silhouette, visible
 * to anyone with eyes. Marking them secret would put a roll in front of a fact the player is
 * already looking at. `species:`, `background:` and `kind:` may be secret if a GM says so; a
 * hidden background is a real story.
 */

/**
 * The help scale — what a relation to an attribute buys you on an identification roll.
 *
 * ⚠ `enables` was called `gate` in an earlier draft, and that was a naming defect: `hold` (the
 * approval gate) is a **separate, orthogonal** field, and one word for two ideas is how the
 * design nearly grew a bug. `enables` says what it does — knowing the thing lets you roll at all,
 * and helps no further.
 *
 * ⚠ `auto` here means **no roll needed**. It does NOT mean "deliver without asking" — that is
 * `hold: false`. Never label a hold control "auto".
 */
export const HELP_SCALE = ["enables", "advantage", "auto"];

/** `whenCarried`'s floor: carrying implies knowing, so it can never be *weaker* than `whenKnown`. */
export const CARRIED_SCALE = ["inherit", "advantage", "auto"];

/**
 * The fact id reserved for "does this creature carry this attribute" — the identification roll,
 * as opposed to a lore row about the attribute.
 *
 * Leading `#` because a lore row id is `foundry.utils.randomID()` (16 alphanumerics), so this can
 * never collide with one no matter how many rows a GM authors.
 */
export const MEMBER_FACT = "#id";

/** Per-character world knowledge — which attributes this character knows *exist*. */
export const KNOWLEDGE_SETTING = "attributeKnowledge";

/**
 * Per-creature identifications ride the shipped `beliefs` flag on the subject actor.
 * @deprecated Unused — use BELIEFS_FLAG (ties-42); kept one release because the known-core.mjs barrel exports it.
 */
export const IDENT_FLAG = BELIEFS_FLAG;

/**
 * `attrIdOf(title)` — decision 18, Joe's rule as a function.
 *
 * Lowercase, Unicode-normalise (NFKD, strip combining marks), keep only `[a-z0-9]`. So
 * `"Yellow Stone"`, `"yellowstone"` and `"Yéllowstone"` all produce `yellowstone`, and the
 * second *creation* is refused with the existing entry offered instead — the autocomplete
 * already showed it, so creating past it was not deliberate. `yellowstone2` is how you mean a
 * different one, which is Joe's own convention, unmodified.
 *
 * Titles stay free-form and display-only; this is the only thing that has to be unique.
 */
export function attrIdOf(title) {
  return attrNameKey(title).slice(0, 64);
}

/**
 * The comparison key for an attribute's NAME — `attrIdOf` without the 64-character cut.
 *
 * Joe's rule: an attribute is a universal truth shared by every carrier, so **no two may share a
 * name**, ignoring case, accents, whitespace and punctuation — the same folding ids get, so
 * "Yellow Stone" and "yéllowstone" are one name exactly as they are one id.
 *
 * ⚠ Why the id check alone is not enough: the id is derived **once**, at creation, and a rename
 * never re-derives it (every carrier and every belief points at the id). So `yellowstone` renamed
 * to "Redrock" leaves id `yellowstone` titled Redrock, and a later create of "Redrock" derives
 * `redrock`, passes the id check, and the world has two Redrocks. The title is what the table
 * sees, so the title is what has to be unique.
 *
 * ⚠ No `.slice(0, 64)` here: two long titles sharing their first 64 letters are different names.
 * The truncation is an id-storage limit, and the id check still applies it on create.
 */
export function attrNameKey(title) {
  const raw = typeof title === "string" ? title : "";
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // combining marks, so "é" has already become "e" + mark
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The entry (other than `exceptId`) whose name is `title` under `attrNameKey`, or `null`.
 * An entry with no title is compared by its id, which is what `clampAttribute` displays for it.
 * A title that folds to nothing never collides — creation refuses it as empty anyway.
 */
export function nameCollision(title, registry, { exceptId = null } = {}) {
  const key = attrNameKey(title);
  if (!key) return null;
  return readRegistry(registry).find(e => e.id !== exceptId && attrNameKey(e.title || e.id) === key) ?? null;
}

/**
 * Would renaming entry `id` to `title` give it another entry's name? Returns that entry or `null`.
 *
 * ⚠ A rename that keeps the entry's **own** name key is always allowed, even when the registry
 * already holds a duplicate of it from before this rule existed: recasing "goblin" to "Goblin"
 * makes nothing worse, and refusing it would freeze a legacy duplicate's title — and every other
 * field the editor saves alongside it — until someone deleted one of the pair by hand.
 */
export function renameCollision(id, title, registry) {
  const list = readRegistry(registry);
  const self = list.find(e => e.id === id);
  if (self && attrNameKey(self.title || self.id) === attrNameKey(title)) return null;
  return nameCollision(title, list, { exceptId: id });
}

/** Is this a derived id, and if so which namespace? `null` for an authored slug. */
export function derivedNamespace(id) {
  const raw = typeof id === "string" ? id.trim() : "";
  const i = raw.indexOf(":");
  if (i < 0) return null;
  const ns = raw.slice(0, i);
  return DERIVED_NAMESPACES.includes(ns) ? ns : null;
}

/**
 * `resolveAttrRef(ref, registry, { carried })` — **one rule for "which attribute did you mean"**,
 * used by every API entry point that takes one. `ref` may be an id, a name, or an entry object.
 *
 * Order, first hit wins:
 *
 *  1. an **exact id** in the registry;
 *  2. a **derived id** (`species:High Elf` → `species:highelf`; `kind:` kept verbatim, it is an
 *     actor id) — valid with or without an entry, because derivation is what makes it exist;
 *  3. an id in `carried` — the caller's actor's own authored flag, so a **dangling** link (entry
 *     deleted, or a legacy typo) can still be named in order to unlink it;
 *  4. a **name**, folded by `attrNameKey` and compared against each entry's title (or id when it
 *     has none). One match resolves; two or more is `ambiguous` (legacy duplicates), never a guess.
 *
 * Id before name is the deterministic rule for crossed renames: if entry `x` was retitled "Y" and
 * entry `y` retitled "X", `"x"` means the entry whose id is `x`.
 *
 * Returns `{ id }` on a hit, else `{ id: null, reason: "empty" | "notFound" | "ambiguous" }`
 * (`candidates` lists the ids on `ambiguous`). **A miss never invents anything** — that is the
 * point: a typo cannot become a link, a ghost knowledge row or a duplicate entry.
 */
export function resolveAttrRef(ref, registry, { carried = [] } = {}) {
  const raw = (typeof ref === "string" ? ref : typeof ref?.id === "string" ? ref.id : "").trim();
  if (!raw) return { id: null, reason: "empty" };
  const list = readRegistry(registry);
  if (list.some(e => e.id === raw)) return { id: raw };
  const ns = derivedNamespace(raw);
  if (ns) {
    const rest = raw.slice(ns.length + 1);
    const slug = ns === "kind" ? rest.trim() : attrIdOf(rest);
    return slug ? { id: `${ns}:${slug}` } : { id: null, reason: "notFound" };
  }
  if ((Array.isArray(carried) ? carried : []).some(x => typeof x === "string" && x.trim() === raw)) return { id: raw };
  const key = attrNameKey(raw);
  if (!key) return { id: null, reason: "notFound" };
  const hits = list.filter(e => attrNameKey(e.title || e.id) === key);
  if (hits.length === 1) return { id: hits[0].id };
  if (hits.length > 1) return { id: null, reason: "ambiguous", candidates: hits.map(e => e.id) };
  return { id: null, reason: "notFound" };
}

/**
 * What `ensure(title)` should do, decided without Foundry so it can be fixtured.
 *
 *  · `{ action: "existing", entry }` — the title already names (or ids) an entry. It is returned
 *    **untouched**: ensure never edits what it finds, so re-running a script is safe.
 *  · `{ action: "create", id }` — nothing by that name or id; create it.
 *  · `{ action: "refuse", reason, existing? }` — `empty`, `ambiguous`, `invalid` (a derived id
 *    with no entry: derived attributes exist without one, so there is nothing to ensure), or
 *    `collision` — the title's derived id is taken by an entry that was **renamed away** from it.
 *    That entry is not called this any more, so handing it back would be wrong; creating would
 *    duplicate the id. Choose a different title (`… 2`) or link that entry by its id.
 */
export function planEnsure(title, registry) {
  const list = readRegistry(registry);
  const hit = resolveAttrRef(title, list);
  if (hit.id) {
    const entry = list.find(e => e.id === hit.id);
    return entry ? { action: "existing", entry } : { action: "refuse", reason: "invalid" };
  }
  if (hit.reason !== "notFound") return { action: "refuse", reason: hit.reason, ...(hit.candidates ? { candidates: hit.candidates } : {}) };
  const id = attrIdOf(typeof title === "string" ? title : "");
  if (!id) return { action: "refuse", reason: "empty" };
  const taken = list.find(e => e.id === id);
  if (taken) return { action: "refuse", reason: "collision", existing: taken };
  return { action: "create", id };
}

/** A `kind:` slug: an actor id, so case is kept — `[A-Za-z0-9]` only, cut at 64 like `attrIdOf`. */
const kindSlugOf = raw => String(raw ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 64);

/**
 * R1 [declared]: the dead `kind:` rows written while `clampAttribute` lowercased the slug —
 * `kind:abc…` for the actor `AbC…` — as `[{ from, to }]`. A row is mapped only when its slug is
 * not a live actor id but equals exactly ONE of `actorIds` ignoring case, and no entry already has
 * the real id (that one is the authored row; the dead one is left for the GM). Anything else — no
 * match, two actors differing only in case — is left alone. Pure; `repairKindIds` writes it.
 */
export function planKindIdRepairs(registry, actorIds) {
  const list = readRegistry(registry);
  const live = new Set((Array.isArray(actorIds) ? actorIds : []).filter(id => typeof id === "string"));
  const byLower = new Map();
  for (const id of live) byLower.set(id.toLowerCase(), [...(byLower.get(id.toLowerCase()) ?? []), id]);
  const taken = new Set(list.map(e => e.id));
  const out = [];
  for (const e of list) {
    if (derivedNamespace(e.id) !== "kind") continue;
    const slug = e.id.slice("kind:".length);
    if (live.has(slug)) continue;
    const hits = byLower.get(slug.toLowerCase()) ?? [];
    if (hits.length !== 1 || taken.has(`kind:${hits[0]}`)) continue;
    taken.add(`kind:${hits[0]}`);
    out.push({ from: e.id, to: `kind:${hits[0]}` });
  }
  return out;
}

/** One registry entry, sanitised. Never throws; an entry with no usable id is dropped. */
export function clampAttribute(entry) {
  if (!entry || typeof entry !== "object") return null;
  const rawId = typeof entry.id === "string" ? entry.id.trim() : "";
  // a derived id keeps its namespace verbatim; an authored one is re-normalised, so a
  // hand-edited setting cannot smuggle in an id the autocomplete could never have produced.
  // R1 [declared]: a `kind:` slug is an ACTOR id, so it keeps its case — only sanitised and capped
  const ns = derivedNamespace(rawId);
  const id = ns ? `${ns}:${(ns === "kind" ? kindSlugOf : attrIdOf)(rawId.slice(ns.length + 1))}` : attrIdOf(rawId);
  if (!id || (ns && id === `${ns}:`)) return null;
  const title = str(entry.title, ATTR_TITLE_MAX).trim();
  const degenerate = !!ns && NEVER_ADVANTAGE.has(ns);
  return {
    id,
    // a title is display-only, so falling back to the id keeps a hand-written entry usable
    title: title || id,
    category: str(entry.category, ATTR_CATEGORY_MAX).trim(),
    icon: typeof entry.icon === "string" && entry.icon.trim() ? entry.icon.trim() : null,
    /*
     * Decision 19: authored attributes default ON (the rogue guild is automatic, as Joe
     * asked); `type:`/`size:` are forced OFF whatever the stored value says, because an
     * entry authored for them would otherwise re-open the degeneracy this rule closes.
     */
    /*
     * The help scale, clamped on read so a hand-edited setting cannot reopen decision 19's
     * degeneracy: `type:` and `size:` are carried by nearly everything, and advantage that
     * applies to almost every roll means nothing.
     */
    whenKnown: degenerate ? "enables" : pick(entry.whenKnown, HELP_SCALE, "enables"),
    whenCarried: degenerate ? "inherit" : carriedFloor(entry.whenKnown, entry.whenCarried),
    /*
     * Is membership itself a secret? **Authored attributes default true** — a guild is the sort of
     * thing you have to work out. **Derived ids default false**: a goblin is visibly a goblin, and
     * `type:`/`size:`/`species:`/`kind:` are things you can simply see.
     */
    secret: degenerate ? false : ns ? entry.secret === true : entry.secret !== false,
    // the price of identifying it. `parent` is the tree; a cycle or a dangling ref is resolved by
    // `ancestorsOf`, never here — this function sanitises one entry and knows nothing of the rest
    parent: typeof entry.parent === "string" && entry.parent.trim() ? entry.parent.trim() : null,
    dc: Math.max(LORE_DC_MIN, Math.min(LORE_DC_MAX, num(entry.dc, LORE_DC_DEFAULT))),
    skill: typeof entry.skill === "string" && entry.skill.trim() ? entry.skill.trim().slice(0, 32) : "his",
    reveal: str(entry.reveal, LORE_TEXT_MAX),
    /*
     * The failure line — what the player takes away from a FAILED identification (Joe, 2026-10-08).
     * Empty: nothing at all. Written: the cascade grants it under `identMissKey` (the creature's
     * page, titled with the creature, never the attribute); the ident belief row still writes
     * `text: ""`, so every ledger reads the rung as not identified. Kept in this literal,
     * `ATTR_CONTENT_FIELDS` and `SNAPSHOT_FIELDS` on purpose: dropping it would make
     * `updateAttribute(id, { miss: "" })` an `unchanged` no-op, so legacy text could never be
     * cleared, and the next save of any entry would silently erase it registry-wide.
     */
    miss: str(entry.miss, LORE_TEXT_MAX),
    // the approval gate, tri-state exactly like a lore row's — and ORTHOGONAL to the scale above
    hold: entry.hold === true ? true : entry.hold === false ? false : null,
    lore: readLore(entry.lore),
    /*
     * ⚠ Decision 23's field, and the one station that erases it for the WHOLE registry if missed:
     * `saveRegistry` routes every write through `readRegistry`, so a `source` absent from this
     * literal is dropped on the next edit of any field on any entry. `advantage` is the corpse that
     * proves it — written by two call sites, never named here, and still read by the summary to
     * draw an icon that has therefore never appeared.
     */
    source: clampSource(entry.source),
    bonuses: [], // decision 20 — reserved, empty in v1, and emptied on read so it stays that way
    /*
     * Review bookkeeping (the Attribute Review panel). Epoch ms or `null`; `null` means "predates
     * timestamps" or "never signed off". Named here for the same reason `source` is: a field this
     * literal omits is erased from the whole registry on the next save of any entry. Entries
     * written before these existed read as null/[] — nothing is written on load.
     */
    createdAt: timeOrNull(entry.createdAt),
    modifiedAt: timeOrNull(entry.modifiedAt),
    reviewedAt: timeOrNull(entry.reviewedAt),
    touched: clampTouched(entry.touched),
    // what the content said at the last sign-off, so the panel can show what changed since
    reviewedSnapshot: clampSnapshot(entry.reviewedSnapshot)
  };
}

/* ── review bookkeeping ───────────────────────────────────────────────────── */

/**
 * The fields a human authored — the ones whose change means "Joe should look at this again".
 * Bookkeeping (`createdAt/modifiedAt/reviewedAt/touched/bonuses`) and the id never count.
 */
export const ATTR_CONTENT_FIELDS = [
  "title", "category", "icon", "whenKnown", "whenCarried", "secret", "parent",
  "dc", "skill", "reveal", "miss", "hold", "lore", "source"
];

/** Fields that only the review machinery writes — stripped from any ordinary patch. */
export const ATTR_REVIEW_FIELDS = ["createdAt", "modifiedAt", "reviewedAt", "touched", "reviewedSnapshot"];

/**
 * The content fields kept in `reviewedSnapshot`. `icon` and `source` are left out: neither is
 * text Joe reads to review, and `source` hashes would only bloat the setting.
 */
export const SNAPSHOT_FIELDS = [
  "title", "category", "whenKnown", "whenCarried", "secret", "parent", "dc", "skill", "reveal", "miss", "hold", "lore"
];

/** Snapshots bigger than this (JSON chars) are dropped rather than stored — the setting is world-wide. */
export const SNAPSHOT_MAX = 64000;

/** The sign-off snapshot of an entry: its SNAPSHOT_FIELDS, clamped. `null` for a non-entry. */
export function snapshotOf(entry) {
  const e = clampAttribute(entry);
  if (!e) return null;
  return clampSnapshot(Object.fromEntries(SNAPSHOT_FIELDS.map(k => [k, e[k]])));
}

/**
 * A stored snapshot, sanitised: only SNAPSHOT_FIELDS, plain JSON values, lore through `readLore`,
 * and the whole thing under SNAPSHOT_MAX. Anything else → `null`.
 */
export function clampSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const k of SNAPSHOT_FIELDS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (k === "lore") out.lore = readLore(v);
    else if (k === "dc") out.dc = typeof v === "number" && Number.isFinite(v) ? v : null;
    else if (k === "secret") out.secret = v === true;
    else if (k === "hold") out.hold = v === true ? true : v === false ? false : null;
    else if (k === "parent") out.parent = typeof v === "string" && v.trim() ? v.trim() : null;
    else out[k] = str(v, LORE_TEXT_MAX);
  }
  if (!Object.keys(out).length) return null;
  try {
    if (JSON.stringify(out).length > SNAPSHOT_MAX) return null;
  } catch {
    return null;
  }
  return out;
}

/** `touched`: content field names only, deduped, order kept. Garbage → `[]`. */
export function clampTouched(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const k of raw) if (typeof k === "string" && ATTR_CONTENT_FIELDS.includes(k) && !out.includes(k)) out.push(k);
  return out;
}

/** Top-level content keys whose value differs (lore compared as a whole). Both sides clamped. */
export function changedFields(before, after) {
  const a = clampAttribute(before) ?? {};
  const b = clampAttribute(after) ?? {};
  return ATTR_CONTENT_FIELDS.filter(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
}

/**
 * `"unreviewed"` — never signed off · `"changed"` — content changed after the sign-off ·
 * `"reviewed"`. A `touched` list also counts as changed, so an edit stamped in the same
 * millisecond as a review cannot hide.
 */
export function reviewState(entry) {
  const reviewed = timeOrNull(entry?.reviewedAt);
  if (reviewed === null) return "unreviewed";
  const modified = timeOrNull(entry?.modifiedAt);
  if ((modified !== null && modified > reviewed) || clampTouched(entry?.touched).length) return "changed";
  return "reviewed";
}

export const needsReview = entry => reviewState(entry) !== "reviewed";

export const REVIEW_SORTS = ["review", "title", "modified", "category"];

/**
 * The panel's order. `review` (default): needs-review first — unreviewed, then changed, each
 * newest-modified first with nulls last — then reviewed by title. The other modes are flat.
 * Never mutates its input.
 */
export function sortForReview(list, mode = "review") {
  const rows = Array.isArray(list) ? list.filter(e => e && typeof e === "object") : [];
  const title = e => String(e.title || e.id || "");
  const byTitle = (a, b) => title(a).localeCompare(title(b)) || String(a.id).localeCompare(String(b.id));
  const byModified = (a, b) => {
    const x = timeOrNull(a.modifiedAt);
    const y = timeOrNull(b.modifiedAt);
    if (x === y) return byTitle(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  };
  const rank = { unreviewed: 0, changed: 1, reviewed: 2 };
  const m = REVIEW_SORTS.includes(mode) ? mode : "review";
  if (m === "title") return [...rows].sort(byTitle);
  if (m === "modified") return [...rows].sort(byModified);
  if (m === "category") return [...rows].sort((a, b) => String(a.category || "").localeCompare(String(b.category || "")) || byTitle(a, b));
  return [...rows].sort((a, b) => {
    const ra = rank[reviewState(a)];
    const rb = rank[reviewState(b)];
    if (ra !== rb) return ra - rb;
    return ra < 2 ? byModified(a, b) : byTitle(a, b);
  });
}

/** The GM's selection flag → ids that are strings and exist in the registry, deduped, in order. */
export function readSelection(raw, registry) {
  if (!Array.isArray(raw)) return [];
  const live = new Set(readRegistry(registry).map(e => e.id));
  const out = [];
  for (const id of raw) {
    if (typeof id !== "string") continue;
    const k = id.trim();
    if (live.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/** A path into the repo, or nothing. Repo-relative, no escaping, and never a write outside it. */
export const SOURCE_PATH_MAX = 512;

/**
 * Where an attribute came from — the markdown in the GM's own vault that seeded it.
 *
 * ```js
 * source: { blob: "41bcd52a…", path: "world/factions/…/gray-district.md" }
 * ```
 *
 * **The blob is the identity. The path is a label.**
 *
 * A git blob hash is the fingerprint of the file's bytes, and git keeps every version of every
 * committed file forever, filed under exactly that hash. So the hash alone reconstructs the
 * provenance — `git log --all --find-object=<blob> --name-status` searches every commit on every
 * ref and hands back both the commit and the path the file had there. It works even when the note
 * was later renamed *and* rewritten, which is the case a stored path cannot survive.
 *
 * That is why the path is only a label: it is what a human reads on the sheet, and it makes the
 * drift check a single hash of a single file rather than a history search. It may rot — this vault
 * has 76 renames across 69 commits — and when it does, nothing is lost, because it is recoverable
 * from the blob at any time. **The original mistake would be treating a path as identity.**
 *
 * ⚠ **The blob must be a COMMITTED hash.** Joe's rule: *"Commit the file and then git the hash."*
 * `git hash-object` will happily fingerprint uncommitted bytes — and those bytes are in no commit,
 * so no search will ever find them and the provenance is a dead end that looks alive. The
 * authoring loop commits first and takes the hash from git; this file cannot check that (a browser
 * has no git), so it is a documented rule enforced where the loop runs.
 *
 * `blob: null` means "no recorded version" and nothing else — never "no file exists, generate one".
 * That same null arises from a path typed by hand for a file already on disk, so existence stays a
 * filesystem question and the generator is create-if-absent, refuse-if-present.
 *
 * ⚠ **Hygiene here is load-bearing.** A generator turns `path` into a *write instruction*, so an
 * absolute path or a `..` segment out of a hand-edited setting is a write outside the vault. Both
 * are refused. A malformed hash drops the **whole** object rather than degrading to a bare path, so
 * a half-record can never claim provenance it has lost.
 *
 * Nothing in this module gates on `source`. A dangling path is harmless — the exact opposite of
 * `parent`, and deliberately so.
 */
export function clampSource(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const path = str(raw.path, SOURCE_PATH_MAX).trim().replace(/\\/g, "/");
  if (!path) return null;
  // no escaping the repo, and no absolute paths: this string can become a write target
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return null;
  if (path.split("/").some(seg => seg === ".." || seg === "")) return null;
  if (raw.blob == null) return { blob: null, path };
  // a hash that is present but malformed invalidates the record — never repair it to a bare path
  if (typeof raw.blob !== "string" || !/^[0-9a-f]{7,64}$/.test(raw.blob.trim())) return null;
  return { blob: raw.blob.trim(), path };
}

/** One of a fixed vocabulary, or the default — never whatever was stored. */
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

/**
 * `whenCarried` may never be weaker than `whenKnown`.
 *
 * Carrying implies knowing (a character knows their own groups), so a carrier already has whatever
 * knowing grants — `whenCarried: enables` could never mean anything, and storing a weaker value
 * would describe a state the engine cannot produce. Clamp up rather than store nonsense.
 */
function carriedFloor(whenKnown, whenCarried) {
  const known = pick(whenKnown, HELP_SCALE, "enables");
  const carried = pick(whenCarried, CARRIED_SCALE, "inherit");
  if (carried === "inherit") return "inherit";
  return HELP_SCALE.indexOf(carried) < HELP_SCALE.indexOf(known) ? "inherit" : carried;
}

/** What a relation actually grants, with `inherit` resolved. */
export function helpFor(entry, { carried = false } = {}) {
  const clean = clampAttribute(entry);
  if (!clean) return "enables";
  if (!carried) return clean.whenKnown;
  return clean.whenCarried === "inherit" ? clean.whenKnown : clean.whenCarried;
}

/** The whole registry. Duplicate ids keep the first; junk vanishes. */
export function readRegistry(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const clean = clampAttribute(entry);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    out.push(clean);
  }
  return out;
}

/* ── the tree ─────────────────────────────────────────────────────────────── */

/**
 * The ancestor chain of an id, nearest parent first — computed, never stored on the tree itself.
 *
 * Two degradation rules, and both fail toward **available**:
 *
 *  · a **dangling** parent (the entry was deleted) resolves the node to a root rather than to
 *    unreachable. Same principle `resolveKindId` settled for the kind pointer: the failure mode of
 *    "slightly too easy to reach" is a GM noticing, and the failure mode of "unreachable" is
 *    silence — which is this module's worst outcome and the one it has been bitten by.
 *  · a **cycle** (only reachable by hand-editing the setting) stops at the repeat and treats it as
 *    a root, so a malformed registry costs a wrong gate rather than a hung client.
 */
export function ancestorsOf(id, registry) {
  const byId = asIndex(registry).byId; // a registry or an indexRegistry() result (ties-20)
  const out = [];
  const seen = new Set([typeof id === "string" ? id.trim() : ""]);
  let cur = byId.get(typeof id === "string" ? id.trim() : "")?.parent ?? null;
  while (cur) {
    if (seen.has(cur)) break; // a cycle: stop, treat as root
    const entry = byId.get(cur);
    if (!entry) break; // dangling: the chain ends here, so the node is a root
    seen.add(cur);
    out.push(cur);
    cur = entry.parent;
  }
  return out;
}

/** An id plus everything above it — what linking a child must actually write (Joe's Q1). */
export const withAncestors = (id, registry) => [id, ...ancestorsOf(id, registry)];

/**
 * Would setting `parent` on `id` create a cycle? Refused at authoring time, so the resolver's
 * cycle guard above is a backstop for hand-edited settings rather than a load-bearing rule.
 */
export function wouldCycle(id, parent, registry) {
  const target = typeof id === "string" ? id.trim() : "";
  const start = typeof parent === "string" ? parent.trim() : "";
  if (!target || !start) return false;
  if (start === target) return true;
  return ancestorsOf(start, registry).includes(target);
}

/**
 * The rungs an identification must climb for one attribute, root first.
 *
 * Only **secret** rungs are rolled: a visible ancestor (a `type:` or an unmarked species) is not a
 * question, so it is not a roll and not a gate. That keeps a guild under a visible species from
 * costing a pointless rung.
 */
export function identificationLadder(id, registry) {
  const index = asIndex(registry); // a registry or an indexRegistry() result (ties-20)
  const byId = index.byId;
  const target = typeof id === "string" ? id.trim() : "";
  /*
   * A visible target is not a question, so it has no ladder at all — not even its ancestors'.
   * Returning the ancestors here would put a roll for the city in front of a fact the player can
   * already see, which is the opposite of what secrecy is for.
   */
  if (!target || !byId.get(target)?.secret) return [];
  return [...ancestorsOf(id, index).reverse(), target].filter(step => byId.get(step)?.secret);
}

/* ── the two ledgers ──────────────────────────────────────────────────────── */
