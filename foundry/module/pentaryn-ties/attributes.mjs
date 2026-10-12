/**
 * The attribute layer — phase 6. What a creature **belongs to**, as opposed to what it *is*.
 *
 * Decision 17 is the framing and it is load-bearing rather than tidy: **attributes cross
 * kinds.** A rogue guild has humans and goblins in it; a city's people are of many species. So
 * an attribute cannot be a property of a stat block *even in principle*, and the two axes are
 * independent by construction. A goblin (kind) from the north tribe (attribute) is two facts
 * about one creature, each with its own lore, its own DCs and its own lock.
 *
 * ## The two planes, and why the registry is a setting
 *
 * **Authored structure** lives in the world setting `attributes` — the entries, their titles,
 * icons, categories and lore rows. **Per-character state** lives in the sibling setting
 * `attributeBeliefs`. They are separate because they have different authors and different
 * churn: rolling a check must not rewrite the document the GM is editing.
 *
 * A setting rather than a flag for exactly one property, and it is not secrecy — everything in
 * a world syncs to every client regardless (decision 8's measurements). It is **writability**:
 * `SETTINGS_MODIFY` requires role 4, so the server refuses a player write. That is what makes
 * an attribute-lore lock as unforgeable as a belief row on an NPC.
 *
 * ## Links are derived, never stored
 *
 * `attributesOf(actor)` computes the derived set live and unions the authored flag. That is
 * the whole backfill answer: 115 NPCs arrive populated with nothing to write, a species edit
 * propagates instantly, and nothing needs a marker to tell derived from authored, because
 * derived ids carry a namespace and authored ids cannot (they are `[a-z0-9]+`, decision 18).
 *
 * The only storage the derivation layer needs is `attributesOff` — one list per actor, for the
 * GM who wants *this* orc not to count as `type:humanoid`.
 */

import { MODULE } from "./ties-core.mjs";
import { baseActorOf } from "./ties-adapter.mjs";
import { readFlag } from "./lib/flags.mjs";
import {
  REGISTRY_SETTING,
  ATTRIBUTES_FLAG,
  ATTRIBUTES_OFF_FLAG,
  attrIdOf,
  nameCollision,
  renameCollision,
  resolveAttrRef,
  planEnsure,
  derivedNamespace,
  clampAttribute,
  readRegistry,
  deriveAttributes,
  attributeIdsFor,
  readLore,
  withAncestors,
  ancestorsOf,
  wouldCycle,
  KNOWLEDGE_SETTING,
  readKnowledge,
  knowsAttribute,
  failedAttribute,
  visibleAttributesFor,
  forestOf,
  subtreeOf,
  contractForest,
  changedFields,
  clampTouched,
  reviewState,
  needsReview,
  readSelection,
  snapshotOf,
  ATTR_REVIEW_FIELDS,
  BELIEFS_FLAG,
  GRANTED_FLAG,
  attrFactKey
} from "./known-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { setting, knowledgeStore } from "./settings.mjs";

const log = makeLog(MODULE);

/** The derived namespaces' labels (literal keys). */
const NS_LABEL = Object.freeze({
  type: "PENTARYN_TIES.attributes.ns.type",
  species: "PENTARYN_TIES.attributes.ns.species",
  background: "PENTARYN_TIES.attributes.ns.background",
  size: "PENTARYN_TIES.attributes.ns.size",
  kind: "PENTARYN_TIES.attributes.ns.kind"
});

// re-exported so the entry point registers the settings by the same names this file reads
export { REGISTRY_SETTING, ATTR_BELIEFS_SETTING, KNOWLEDGE_SETTING } from "./known-core.mjs";

/**
 * A default icon per category, so a new attribute looks like the thing it is without anyone
 * picking art. Joe: *"let's have a generic icon if no custom is given that feels good — city,
 * town, guild, fact, common categories that I can later customize."*
 *
 * `category` is free text, so this is a lookup with a fallback rather than an enum: type "guild"
 * and you get a guild banner, type "smugglers' compact" and you get the generic standard, and
 * either way the entry's icon field stays yours to change. Synonyms are folded in (`quarter` →
 * district, `clan` → family) because the point is that a GM types the word they were already
 * thinking of and it just works.
 *
 * ⚠ **Every path here must exist in Foundry's own icon set, and that is not self-enforcing.**
 * `faction` and `place` — the two categories a world tree is mostly made of — used to point at
 * files that 404, so every guild and every city rendered a blank square. Nothing logs, the layout
 * still works, and it merely looks unfinished. All of these were checked against the served
 * paths; check any you add the same way. `repairIcons` cleans up entries written against the two
 * dead ones.
 */
const CATEGORY_ICONS = {
  // places, largest to smallest
  realm: "icons/environment/settlement/castle.webp",
  kingdom: "icons/environment/settlement/castle-tan.webp",
  region: "icons/environment/wilderness/terrain-river-road-gray.webp",
  city: "icons/environment/settlement/city-night.webp",
  town: "icons/environment/settlement/house-two-stories.webp",
  village: "icons/environment/settlement/hut.webp",
  district: "icons/environment/settlement/house-city.webp",
  street: "icons/environment/settlement/sign-wood.webp",
  building: "icons/environment/settlement/house-manor.webp",
  place: "icons/environment/settlement/city-gate.webp",
  // organisations
  guild: "icons/sundries/flags/banner-standard-green.webp",
  faction: "icons/sundries/flags/banner-standard-blue.webp",
  order: "icons/sundries/flags/banner-standard-purple.webp",
  crew: "icons/sundries/flags/banner-flag-pirate.webp",
  cult: "icons/sundries/flags/banner-flag-skull-red.webp",
  temple: "icons/environment/settlement/temple-night.webp",
  // people, and the things that happen to them
  family: "icons/environment/settlement/house-farmland.webp",
  people: "icons/environment/people/group.webp",
  trade: "icons/environment/settlement/market-stall.webp",
  title: "icons/commodities/treasure/medal-ribbon-gold-blue.webp",
  condition: "icons/magic/death/hand-withered-gray.webp",
  event: "icons/sundries/documents/calendar-daily.webp",
  fact: "icons/sundries/scrolls/scroll-bound-gold-brown.webp",
  default: "icons/sundries/flags/banner-standard-brown.webp"
};

/** Words a GM is likely to type for a category there is already art for. */
const CATEGORY_ALIASES = {
  empire: "realm", nation: "realm", land: "region", province: "region", reach: "region",
  quarter: "district", ward: "district", neighbourhood: "district", neighborhood: "district",
  road: "street", house: "building", manor: "building", household: "family", clan: "family",
  bloodline: "family", company: "order", knighthood: "order", gang: "crew", band: "crew",
  ship: "crew", church: "temple", faith: "temple", religion: "temple", sect: "cult",
  folk: "people", species: "people", tribe: "people", business: "trade", market: "trade",
  craft: "trade", rank: "title", office: "title", illness: "condition", disease: "condition",
  curse: "condition", affliction: "condition", secret: "fact", rumour: "fact", rumor: "fact",
  lore: "fact"
};

/** The two paths that 404. Kept beside the map so a repair and a default never drift apart. */
const DEAD_ICONS = {
  "icons/environment/settlement/watchtower-flag.webp": CATEGORY_ICONS.faction,
  "icons/environment/settlement/house-two-fire.webp": CATEGORY_ICONS.place
};

/** Is this icon one this module chose, rather than one a GM picked? Only ours may be replaced. */
const isDefaultIcon = icon =>
  !String(icon ?? "").trim() || Object.values(CATEGORY_ICONS).includes(icon) || icon in DEAD_ICONS;

/** What the tree should draw for one entry — its own art, or its category's if it has none. */
const iconArt = entry => entry.icon || iconForCategory(entry.category);

/** Default art for a free-text category: exact match, then a synonym, then the generic standard. */
export const iconForCategory = category => {
  const key = String(category ?? "").trim().toLowerCase();
  return CATEGORY_ICONS[key] ?? CATEGORY_ICONS[CATEGORY_ALIASES[key]] ?? CATEGORY_ICONS.default;
};

const DERIVED_ICONS = {
  type: "icons/creatures/abilities/paw-print-pair-purple.webp",
  species: "icons/environment/people/group.webp",
  background: "icons/sundries/books/book-worn-brown.webp",
  size: "icons/tools/scribal/lens-blue.webp",
  kind: "icons/creatures/abilities/paw-print-orange.webp"
};

/* -------------------------------------------- */
/*  The registry                                */
/* -------------------------------------------- */

/*
 * The clamped registry, memoised on the identity of the setting's value (ties-19). Foundry hands
 * back the Setting document's own value object until that document updates, so an unchanged
 * registry is clamped once instead of on every row of every paint and every search keystroke; any
 * write gives a new object and the next read re-clamps. Callers mutate what they get (push, assign),
 * so they always get a COPY — of the whole list, or of the one entry. The list's copy is a fresh
 * clamp of the stored value (W3L: a structuredClone of the whole registry cost more than the clamp
 * it replaced); read-only id lookups (resolveAttribute) read the memo itself and copy nothing.
 */
let memo = { raw: undefined, list: null, byId: null };
function clampedRegistry() {
  const raw = setting(REGISTRY_SETTING);
  if (!memo.list || memo.raw !== raw) {
    const list = readRegistry(raw);
    const byId = new Map();
    for (const e of list) if (!byId.has(e.id)) byId.set(e.id, e); // first wins, as find() did
    memo = { raw, list, byId };
  }
  return memo;
}

/** Never throws — a setting can be unregistered when a hook fires early. */
export function registry() {
  return readRegistry(setting(REGISTRY_SETTING));
}

export const attributeById = id => {
  const entry = clampedRegistry().byId.get(id);
  return entry ? structuredClone(entry) : null;
};

/**
 * GM-only. The server would refuse a player anyway; refusing here keeps the message honest.
 * Never throws: a refused or failed write comes back `false`, and the caller turns that into
 * `{ ok: false, reason: "writeFailed" }`.
 */
async function saveRegistry(list) {
  if (!game.user?.isGM) return false;
  try {
    await game.settings.set(MODULE, REGISTRY_SETTING, readRegistry(list));
    return true;
  } catch (err) {
    log.warn(`attribute registry write failed`, err);
    return false;
  }
}

/**
 * **Every registry write runs one at a time.** Each write reads the whole list, changes it, and
 * writes the whole list back; the local value only updates when the server answers. Two writes in
 * flight together (a field save then a "Reviewed" click, two lore fields in quick succession, a
 * panel save racing Claude's `A.update`) would each read the old list and the second would
 * silently undo the first. The read happens INSIDE the queued function, after the previous write
 * has landed. ⚠ Never call a serialised function from inside another one — it would wait on
 * itself. `fn` is run even if the previous write threw, and its own result/throw is returned.
 */
let writeChain = Promise.resolve();
function serial(fn) {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => {});
  return run;
}

/* -------------------------------------------- */
/*  The write contract                          */
/* -------------------------------------------- */

/*
 * **Reads return data. Writes return `{ ok, reason?, … }` and never throw.**
 *
 * `reason` is one of a closed set, so a script can branch on it:
 *
 * | reason | means |
 * | --- | --- |
 * | `notGM` | only a GM may write attributes |
 * | `empty` | the title or reference was blank, or folded to nothing |
 * | `notFound` | the id or name matches no attribute — **nothing was created** |
 * | `ambiguous` | the name matches more than one entry (legacy duplicates); `candidates` lists them |
 * | `collision` | that name or id is already taken; `existing` is the entry |
 * | `cycle` | the parent would make the entry its own ancestor |
 * | `invalid` | no actor, or a derived id where an entry was required |
 * | `writeFailed` | Foundry refused or failed the write |
 *
 * ⚠ `{ ok: false }` is an object, so it is **truthy** — test `.ok`, never the result itself.
 */
const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

/** A resolver miss as a write result, carrying the candidates on `ambiguous`. */
const missed = (r, extra = {}) => fail(r.reason, { ...(r.candidates ? { candidates: r.candidates } : {}), ...extra });

/**
 * The raw authored flag of an actor, used as `carried` so a dangling id there stays nameable.
 * Reads the passed actor, synthetic or not — a delta merges over its base, so this is what shows.
 */
const carriedOf = actor => flagList(actor, ATTRIBUTES_FLAG);

/**
 * **Which attribute did you mean?** An id, a name, or an entry → its id, or `null`.
 *
 * Id first, then derived id, then (with `actor`) an id that actor already carries, then a unique
 * name. A miss is `null`, never a guess and never a creation — see `resolveAttrRef`. Cheap, so a
 * script can check before it acts: `A.resolve("Ashfall Company")` → `"ashfallcompany"`.
 */
export function resolveAttribute(ref, { actor = null } = {}) {
  // read-only: resolveAttrRef returns an id and never mutates the list it is given
  return resolveAttrRef(ref, clampedRegistry().list, { carried: actor ? carriedOf(actor) : [] }).id;
}

/**
 * A `parent` value from a create/update patch → `{ parent }` (an id, or `null` to clear) or a
 * refusal. A parent must be a **registry entry**: a bare derived id has no entry for the chain to
 * continue through, so `ancestorsOf` would treat it as dangling and the parent would mean nothing.
 */
function resolveParent(value, list) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return { parent: null };
  const r = resolveAttrRef(value, list);
  if (!r.id) return { refusal: missed(r, { field: "parent" }) };
  if (!list.some(e => e.id === r.id)) return { refusal: fail("notFound", { field: "parent" }) };
  return { parent: r.id };
}

/**
 * Create one entry — **strict**: a name or id already in use is refused, never overwritten.
 *
 * `opts` takes the **whole entry** — `category`, `icon`, `parent`, `dc`, `skill`, `secret`,
 * `whenKnown`, `whenCarried`, `reveal`, `miss`, `hold`, `lore`, `source` — all sanitised by
 * `clampAttribute`, so a backstory is one call per attribute rather than a create then an update.
 * `parent` may be an id or a name and must already exist.
 *
 * → `{ok:true, entry}` | `{ok:false, reason:"notGM"|"empty"|"collision", existing?}` |
 *   `{ok:false, reason:"notFound"|"ambiguous", field:"parent"}` | `{ok:false, reason:"writeFailed"}`
 *
 * Decision 18: the autocomplete already offered the existing entry, so creating past it was not
 * deliberate, and colliding is the signal. `yellowstone2` is how you mean a different one. Use
 * `ensureAttribute` when "the existing one is fine" is what you meant.
 */
export function createAttribute(title, opts = {}) {
  return serial(() => createNow(title, opts));
}

async function createNow(title, opts) {
  if (!game.user?.isGM) return fail("notGM");
  const o = opts && typeof opts === "object" ? opts : {};
  const id = attrIdOf(title);
  if (!id) return fail("empty");
  const list = registry();
  /*
   * ⚠ Two checks, and the second is the authoritative one. The id check catches the ordinary
   * case; the NAME check catches an entry that was renamed after creation — its id still says
   * what it used to be called, so a new title can derive a fresh id and sail past the id check
   * while duplicating the name the table sees (`attrNameKey`, `nameCollision`).
   */
  const existing = list.find(e => e.id === id) ?? nameCollision(title, list);
  if (existing) return fail("collision", { existing });
  const p = resolveParent(o.parent, list);
  if (p.refusal) return p.refusal;
  /*
   * ⚠ `advantage` used to be passed here and is gone. `clampAttribute` never named it in its
   * returned literal, so it was dropped on every read — see decision 23's field-drop checklist.
   * `whenKnown` and `whenCarried` are the live concept, and pass straight through `o`.
   */
  const now = Date.now();
  const entry = clampAttribute({
    ...o,
    id,
    title: String(title ?? "").trim(),
    icon: o.icon ?? iconForCategory(o.category),
    parent: p.parent,
    lore: o.lore ?? [],
    // review bookkeeping is never taken from `opts`: a new entry is always unreviewed
    ...stampNew(now)
  });
  if (!entry) return fail("empty");
  list.push(entry);
  if (!(await saveRegistry(list))) return fail("writeFailed");
  return { ok: true, entry };
}

/**
 * **Get it or make it** — the forgiving half of `create`, for scripts and migrations.
 *
 * If `title` already names (or ids) an entry, that entry comes back **untouched** — `opts` are
 * only used when creating, so re-running a script never rewrites a DC someone tuned since. Else it
 * is created with `opts` exactly as `createAttribute` would.
 *
 * → `{ok:true, entry, existed:true|false}` | any `createAttribute` refusal |
 *   `{ok:false, reason:"ambiguous", candidates}` | `{ok:false, reason:"collision", existing}` when
 *   the title's id belongs to an entry that has since been **renamed** to something else.
 */
export async function ensureAttribute(title, opts = {}) {
  const plan = planEnsure(title, registry());
  if (plan.action === "existing") return { ok: true, entry: plan.entry, existed: true };
  if (plan.action === "refuse") {
    const { action, reason, ...rest } = plan;
    return fail(reason, rest);
  }
  const made = await createAttribute(title, opts);
  return made.ok ? { ...made, existed: false } : made;
}

/**
 * The sheet's "author entry" for a DERIVED id (`species:elf` …): creates an entry with that exact
 * id, which `createAttribute` cannot (it derives ids from titles). Queued like every other write,
 * and held to the same unique-name rule. → `{ok:true, entry}` | `{ok:false, reason:"notGM"|
 * "collision"|"invalid"|"writeFailed", existing?}`.
 */
export const authorEntry = ({ id, title, category, icon }) =>
  serial(async () => {
    if (!game.user?.isGM) return fail("notGM");
    const list = registry();
    if (list.some(e => e.id === id)) return fail("collision", { existing: list.find(e => e.id === id) });
    const clash = nameCollision(title, list, { exceptId: id });
    if (clash) return fail("collision", { existing: clash });
    const entry = clampAttribute({ id, title, category, icon, lore: [], ...stampNew() });
    if (!entry) return fail("invalid");
    list.push(entry);
    if (!(await saveRegistry(list))) return fail("writeFailed");
    return { ok: true, entry };
  });

/**
 * One-shot repair for entries authored against the two icon paths that 404 (see `CATEGORY_ICONS`).
 *
 * Entries store their icon, so fixing the default fixes nothing already written — and the symptom
 * is a blank square rather than an error, so nobody would think to go and re-pick them by hand.
 * Only the dead paths are touched; a deliberately chosen icon is never overwritten.
 */
export const repairIcons = () => serial(repairIconsNow);

async function repairIconsNow() {
  if (!game.user?.isGM) return 0;
  const list = registry();
  let fixed = 0;
  for (const entry of list) {
    const better = DEAD_ICONS[entry.icon];
    if (!better) continue;
    entry.icon = better;
    fixed++;
  }
  if (fixed) await saveRegistry(list);
  return fixed;
}

/**
 * Update one entry in place.
 *
 * ⚠ This is the *shared* record. A DC changed here changes for **every carrier** — that is the
 * feature, and it is also exactly how a GM rewrites a world-wide DC while thinking about one
 * orc. Decision 16's honesty note: every surface that reaches this must say whose DC it is.
 *
 * `ref` is an id or a name. → `{ok:true, entry}` |
 * `{ok:false, reason:"notGM"|"notFound"|"ambiguous"|"cycle"|"collision"|"invalid"|"writeFailed"}`.
 * The `cycle` and `collision` refusals also raise a notification, which is what the sheet shows.
 */
export const updateAttribute = (ref, patch) => serial(() => commitNow(ref, patch));

/**
 * The Attribute Review panel's save — the same write as `updateAttribute`, except for how it
 * treats the review state. Joe typing is Joe, not Claude, so his own edit never *un*-reviews:
 *
 * - an entry that was **reviewed** stays reviewed (`reviewedAt = now`, `touched = []`, the
 *   snapshot refreshed to the new text);
 * - an entry that was **unreviewed or changed** keeps exactly the review state it had — his edit
 *   is not added to `touched`, and it is NOT signed off. Sign-off only ever happens through the
 *   Reviewed button (`reviewAttribute`): fixing one typo must not clear the warning on lore he
 *   has not read yet.
 *
 * Deliberately NOT on the public API. Only review-ui.mjs imports it.
 */
export const reviewedUpdate = (ref, patch) => serial(() => commitNow(ref, patch, { review: true }));

/**
 * The panel's lore-field save: one key of one lore row, with the `lore` array rebuilt INSIDE the
 * write queue from the registry as it is at that moment — so a second lore save, or a Claude
 * write, that landed after the panel rendered is never overwritten with a stale copy. Row count
 * and row ids cannot change: the existing rows are mapped, one is patched.
 * → as `reviewedUpdate`, or `{ok:false, reason:"notFound", field:"lore"}` if the row is gone.
 */
export const reviewedLoreUpdate = (ref, loreId, key, value) =>
  serial(() => {
    if (key === "id") return fail("invalid");
    const list = registry();
    const r = resolveAttrRef(ref, list);
    const entry = r.id ? list.find(e => e.id === r.id) : null;
    if (!entry) return r.id ? fail("notFound") : missed(r);
    const lore = readLore(entry.lore);
    if (!lore.some(row => row.id === loreId)) return fail("notFound", { field: "lore" });
    return commitNow(entry.id, { lore: lore.map(r => (r.id === loreId ? { ...r, [key]: value } : r)) }, { review: true });
  });

/** Bookkeeping for a brand-new entry: created and modified now, never reviewed. */
export const stampNew = (now = Date.now()) => ({ createdAt: now, modifiedAt: now, reviewedAt: null, touched: [] });

/**
 * The one update body. Stamps `modifiedAt` only when a content field actually changed; a no-op
 * patch writes nothing (unless it is a review, which still records the sign-off). Off the review
 * path, the changed field names accumulate in `touched` and the entry drops out of "reviewed".
 */
async function commitNow(ref, patch, { review = false } = {}) {
  if (!game.user?.isGM) return fail("notGM");
  const list = registry();
  const r = resolveAttrRef(ref, list);
  if (!r.id) return missed(r);
  const i = list.findIndex(e => e.id === r.id);
  if (i < 0) return fail("notFound");
  const id = list[i].id;
  const next = { ...(patch && typeof patch === "object" ? patch : {}) };
  // the review fields are the machinery's, never a patch's — `update(id, { reviewedAt })` must not forge a sign-off
  for (const k of ATTR_REVIEW_FIELDS) delete next[k];
  /*
   * `parent` takes an id or a name, like everything else, and must exist — a typo'd parent used to
   * be stored and then silently read as "root".
   */
  if ("parent" in next) {
    const p = resolveParent(next.parent, list);
    if (p.refusal) return p.refusal;
    next.parent = p.parent;
  }
  /*
   * ⚠ Refuse a parent that would close a loop. `wouldCycle` was written for this and then never
   * called from anywhere, so the only thing standing between a slip of the mouse and a cycle was
   * the readers' degrade-gracefully behaviour — and the tree does not degrade gracefully, it makes
   * the whole loop and everything under it disappear (see `forestOf`). Cheap to refuse here.
   */
  if (next.parent && wouldCycle(id, next.parent, list)) {
    ui.notifications?.warn(_loc("PENTARYN_TIES.attributes.cycleRefused"));
    return fail("cycle");
  }
  /*
   * ⚠ Refuse a rename onto another entry's name. The id is never re-derived on rename (every
   * carrier and belief points at it), so without this a rename is the one door through which two
   * attributes end up sharing a name — Joe's rule is that they never may. Recasing an entry's own
   * name is fine; `renameCollision` only looks at *other* entries.
   */
  if ("title" in next) {
    const clash = renameCollision(id, String(next.title ?? "").trim() || list[i].id, list);
    if (clash) {
      ui.notifications?.warn(_loc("PENTARYN_TIES.attributes.renameRefused", { title: clash.title, id: clash.id }));
      return fail("collision", { existing: clash });
    }
  }
  /*
   * Retyping the category should re-dress the entry: call it a city and it gets the city. Only an
   * icon this module chose is replaced — the moment a GM picks their own art it is theirs, and a
   * later category edit leaves it alone.
   */
  /*
   * ⚠ The merge is a shallow spread, so `{ source: { path } }` **replaces the whole object** and
   * drops the hashes with it. That is the documented rule rather than a bug to paper over: a path
   * that changed is a different file, and a hash carried across from the old one would assert
   * provenance nothing checked. Send the new hashes, or send nulls.
   */
  if ("category" in next && !("icon" in next) && isDefaultIcon(list[i].icon)) {
    next.icon = iconForCategory(next.category);
  }
  const merged = clampAttribute({ ...list[i], ...next, id });
  if (!merged) return fail("invalid");
  const diff = changedFields(list[i], merged);
  if (!diff.length) return { ok: true, entry: list[i], unchanged: true };
  const now = Date.now();
  merged.modifiedAt = now;
  if (review && reviewState(list[i]) === "reviewed") {
    // Joe edited an entry he had already signed off: it stays signed off, at the new text
    merged.reviewedAt = now;
    merged.touched = [];
    merged.reviewedSnapshot = snapshotOf(merged);
  } else if (review) {
    // Joe edited an entry still awaiting review: leave its review state exactly as it was —
    // not signed off, and his own edit is not listed as something Claude touched
    merged.reviewedAt = list[i].reviewedAt;
    merged.touched = list[i].touched;
  } else merged.touched = clampTouched([...list[i].touched, ...diff]);
  list[i] = merged;
  if (!(await saveRegistry(list))) return fail("writeFailed");
  return { ok: true, entry: merged, changed: diff }; // diff is non-empty here: the empty case returned above
}

/* -------------------------------------------- */
/*  Human review and the GM's selection         */
/* -------------------------------------------- */

/**
 * **Joe's sign-off.** `reviewedAt = now`, `touched = []`; `modifiedAt` is not bumped — nothing in
 * the content changed. Claude never calls this unless Joe explicitly asks.
 */
export async function reviewAttribute(ref) {
  return setReviewed(ref, true);
}

/** Withdraw the sign-off (`reviewedAt = null`) — so a row can be flagged back to the top. */
export async function unreviewAttribute(ref) {
  return setReviewed(ref, false);
}

function setReviewed(ref, on) {
  return serial(() => setReviewedNow(ref, on));
}

async function setReviewedNow(ref, on) {
  if (!game.user?.isGM) return fail("notGM");
  const list = registry();
  const r = resolveAttrRef(ref, list);
  if (!r.id) return missed(r);
  const i = list.findIndex(e => e.id === r.id);
  if (i < 0) return fail("notFound");
  // signing off records what the content said, so the panel can show what changes after it;
  // withdrawing keeps the old snapshot — "what changed since the last sign-off" is still useful
  list[i] = on
    ? { ...list[i], reviewedAt: Date.now(), touched: [], reviewedSnapshot: snapshotOf(list[i]) }
    : { ...list[i], reviewedAt: null };
  if (!(await saveRegistry(list))) return fail("writeFailed");
  return { ok: true, entry: list[i] };
}

/** Entries needing a human look, needs-review order: `[{ id, title, reviewState, touched, modifiedAt, createdAt }]`. */
export function unreviewedAttributes() {
  return registry()
    .filter(needsReview)
    .map(e => ({ id: e.id, title: e.title, reviewState: reviewState(e), touched: e.touched, modifiedAt: e.modifiedAt, createdAt: e.createdAt }));
}

/** The user flag that holds the review panel's ticked boxes. Per GM user, survives reloads. */
export const SELECTION_FLAG = "attrSelected";

/** The current GM's selection as ids, pruned to live registry entries. */
export function selectionIds() {
  try {
    return readSelection(game.user?.getFlag(MODULE, SELECTION_FLAG), registry());
  } catch {
    return [];
  }
}

/**
 * **What Joe has ticked** — the call Claude reads when he says "the selected attributes".
 * → `[{ id, title, category, parent, reviewState }]`, in the order he ticked them.
 */
export function selectedAttributes() {
  const byId = new Map(registry().map(e => [e.id, e]));
  return selectionIds().map(id => {
    const e = byId.get(id);
    return { id, title: e.title, category: e.category, parent: e.parent, reviewState: reviewState(e) };
  });
}

async function writeSelection(ids) {
  if (!game.user?.isGM) return fail("notGM");
  try {
    await game.user.setFlag(MODULE, SELECTION_FLAG, ids);
    return { ok: true, ids };
  } catch (err) {
    log.warn(`selection write failed`, err);
    return fail("writeFailed");
  }
}

/** Resolve refs (id or name) → `{ ids, missed }`; a miss is reported, never guessed. */
function resolveMany(refs) {
  const list = registry();
  const ids = [];
  const miss = [];
  for (const ref of Array.isArray(refs) ? refs : [refs]) {
    const r = resolveAttrRef(ref, list);
    if (r.id && list.some(e => e.id === r.id)) {
      if (!ids.includes(r.id)) ids.push(r.id);
    } else miss.push(typeof ref === "string" ? ref : ref?.id ?? String(ref));
  }
  return { ids, missed: miss };
}

/** Tick these (adds to the selection; `{ replace: true }` replaces it). → `{ ok, ids, missed? }`. */
export async function selectAttributes(refs, { replace = false } = {}) {
  const r = resolveMany(refs);
  const base = replace ? [] : selectionIds();
  const out = await writeSelection([...base, ...r.ids.filter(id => !base.includes(id))]);
  return r.missed.length && out.ok ? { ...out, missed: r.missed } : out;
}

/** Untick these. → `{ ok, ids, missed? }`. */
export async function deselectAttributes(refs) {
  const r = resolveMany(refs);
  const out = await writeSelection(selectionIds().filter(id => !r.ids.includes(id)));
  return r.missed.length && out.ok ? { ...out, missed: r.missed } : out;
}

/** Untick everything. */
export const clearSelection = () => writeSelection([]);

/**
 * Delete an entry. `ref` is an id or a name; a miss writes nothing and says `notFound`.
 *
 * The **links are not touched**, and cannot be: derived links are computed and authored links
 * are ids on actors. A deleted entry degrades every carrier's link to a bare id with no lore
 * and no advantage — which is exactly what a derived id with no entry already is, so there is
 * one behaviour rather than two. Re-creating the entry with the same id restores everything.
 * `A.broken(actor)` lists such ids as `dangling`.
 */
export const deleteAttribute = ref => serial(() => deleteNow(ref));

async function deleteNow(ref) {
  if (!game.user?.isGM) return fail("notGM");
  const list = registry();
  const r = resolveAttrRef(ref, list);
  if (!r.id) return missed(r);
  const entry = list.find(e => e.id === r.id);
  if (!entry) return fail("notFound");
  if (!(await saveRegistry(list.filter(e => e.id !== entry.id)))) return fail("writeFailed");
  return { ok: true, entry };
}

/* -------------------------------------------- */
/*  Links: derived, authored, suppressed        */
/* -------------------------------------------- */

/**
 * Derive one actor's ids off the paths in decision 16's table — **re-verified live** against
 * this world before this function was written.
 *
 * `system.details.race`/`.background` resolve to the Item document directly in dnd5e 5.3.3, and
 * the embedded-item lookup finds the same thing; both were confirmed, and the item lookup is
 * kept as the primary because it is the shape the table documents.
 *
 * Deliberately NOT derived: `system.details.type.subtype` ("Human" on a PC, `null` on this
 * world's NPCs). It duplicates `species:` where it is populated and is empty where it is not,
 * so it would add a namespace that says nothing new. Noted rather than silently skipped.
 */
export function derivedFor(actor, kindResolver = null) {
  if (!actor) return [];
  const raceItem = actor.items?.find?.(i => i.type === "race") ?? null;
  const bgItem = actor.items?.find?.(i => i.type === "background") ?? null;
  const kind = kindResolver?.(actor) ?? null;
  return deriveAttributes({
    type: actor.system?.details?.type?.value ?? null,
    size: actor.system?.traits?.size ?? null,
    species: raceItem?.name ?? actor.system?.details?.race?.name ?? null,
    background: bgItem?.name ?? actor.system?.details?.background?.name ?? null,
    // only a real pointer at somebody else — an actor being its own kind is not a group
    kindId: kind && kind.id !== actor.id ? kind.id : null
  });
}

const flagList = (actor, key) => {
  const raw = readFlag(actor, MODULE, key);
  return Array.isArray(raw) ? raw : [];
};

/** The effective id list for one actor: derived ∪ authored, minus suppressed. */
export function attributeIdsOf(actor, kindResolver = null) {
  return attributeIdsFor({
    derived: derivedFor(actor, kindResolver),
    authored: flagList(actor, ATTRIBUTES_FLAG),
    off: flagList(actor, ATTRIBUTES_OFF_FLAG)
  });
}

/**
 * A display record for an id, whether or not anyone has authored an entry for it.
 *
 * **A derived attribute exists without a registry entry** (decision 16): it matches for
 * advantage where the rules allow, appears in autocomplete, and carries no lore — until a GM
 * authors an entry *with that id*, which enriches what derivation already produced. Nothing
 * links at that moment, because the link was never stored.
 */
export function describeAttribute(id) {
  const entry = attributeById(id);
  const ns = derivedNamespace(id);
  /*
   * ⚠ An entry may have **no icon at all** — the field is optional and older entries were written
   * before any default existed, so they rendered `<img src="">`: a blank square in the tree and in
   * the list. Filling it here fixes every one of them at read, with nothing to migrate and without
   * writing over a GM's own choice.
   */
  if (entry) {
    return {
      ...entry,
      icon: entry.icon || iconForCategory(entry.category),
      derived: !!ns,
      authored: true,
      loreCount: entry.lore.length
    };
  }
  const slug = ns ? id.slice(ns.length + 1) : id;
  return {
    id,
    title: derivedTitle(ns, slug),
    category: ns ? _loc("PENTARYN_TIES.attributes.derivedCategory", { ns: _loc(NS_LABEL[ns] ?? `PENTARYN_TIES.attributes.ns.${ns}`) }) : "",
    icon: ns ? DERIVED_ICONS[ns] ?? CATEGORY_ICONS.default : CATEGORY_ICONS.default,
    // no entry means the GM has said nothing about it — and `source` must be null on BOTH branches
    // or a consumer sees an object one way and `undefined` the other
    source: null,
    lore: [],
    bonuses: [],
    derived: !!ns,
    authored: false,
    loreCount: 0
  };
}

/**
 * A derived id's display name, asked of the world rather than guessed from the slug.
 *
 * `size:med` is "Medium" to dnd5e and "Med" to a title-caser — and a tab that prints stat-block
 * codes at a player is showing them the database rather than the game. Every namespace has an
 * authority that already knows the word; the title-caser is only the fallback for a homebrew
 * value the world has no label for.
 */
function derivedTitle(ns, slug) {
  const cfg = CONFIG.DND5E ?? {};
  const label = v => (typeof v === "string" ? v : v?.label);
  const local = v => {
    const raw = label(v);
    return raw ? game.i18n.localize(raw) : null;
  };
  if (ns === "kind") return game.actors?.get(slug)?.name ?? slug; // an actor id, so ask the world
  if (ns === "size") return local(cfg.actorSizes?.[slug]) ?? titleCase(slug);
  if (ns === "type") return local(cfg.creatureTypes?.[slug]) ?? titleCase(slug);
  return titleCase(slug); // species/background are free text already — the slug IS the word
}

const titleCase = s =>
  String(s ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-z]/g, c => c.toUpperCase());

/**
 * Everything one actor carries, as display records, authored entries first.
 *
 * `viewer` filters by what that character has actually identified — a secret membership must not
 * be listed to someone who has not worked it out. Two viewers see everything: a **GM**, and a
 * character looking at **their own sheet**, where carrying implies knowing.
 *
 * ⚠ **A missing `viewer` is not permission.** An earlier cut read `!viewer` as "trusted context"
 * and returned the carried set unfiltered — but the sheet passes no viewer for any NPC, and a
 * player may own an NPC (a hireling, a mount, the party's guide). That handed the owner every
 * secret membership on it, ancestors included, with no roll and no grant. An unresolved viewer
 * now filters against nothing, which hides secrets rather than revealing them.
 */
export function attributesOf(actor, kindResolver = null, { viewer = null } = {}) {
  const carried = attributeIdsOf(actor, kindResolver);
  const visible =
    game.user?.isGM || (viewer && viewer.id === actor?.id)
      ? carried
      : visibleAttributesFor({
          carried,
          registry: registry(),
          beliefs: actor?.getFlag?.(MODULE, BELIEFS_FLAG) ?? {},
          characterId: viewer?.id ?? "",
          isGM: false
        });
  const rows = visible.map(describeAttribute);
  return rows.sort(
    (a, b) => Number(b.authored) - Number(a.authored) || Number(a.derived) - Number(b.derived) || a.title.localeCompare(b.title)
  );
}

/**
 * The actor a link is **written** to.
 *
 * An unlinked token's sheet hands us its synthetic actor, and a flag set there lands on that one
 * token's delta: the world actor stays unlinked, the next token placed lacks it, and `stale()`,
 * `search()` and the autocomplete (which walk `game.actors`) never see it. Ties already resolve
 * through `actorId` for the same reason (`baseActorOf`), so links do too — a membership is a fact
 * about the character, and every jailer token of "House Barrabin Jailer" is in House Barrabin.
 *
 * ⚠ One exception: a token whose delta **already** holds its own attribute flags (written before
 * this rule) keeps being edited where those live. Redirecting it would strand them — the delta
 * overrides the base, so an unlink on the world actor would change nothing that token shows.
 */
function subjectOf(actor) {
  if (!actor?.isToken || !actor.token) return actor;
  let own = {};
  try {
    own = actor.token.delta?._source?.flags?.[MODULE] ?? {};
  } catch {
    own = {};
  }
  if (ATTRIBUTES_FLAG in own || ATTRIBUTES_OFF_FLAG in own) return actor;
  return baseActorOf(actor.token) ?? actor;
}

/** Write both link flags in **one** update — one round trip, one render. Never throws. */
async function writeLinks(actor, { authored = null, off = null }) {
  const data = {};
  if (authored) data[`flags.${MODULE}.${ATTRIBUTES_FLAG}`] = authored;
  if (off) data[`flags.${MODULE}.${ATTRIBUTES_OFF_FLAG}`] = off;
  if (!Object.keys(data).length) return true;
  try {
    await actor.update(data);
    return true;
  } catch (err) {
    log.warn(`attribute link write failed`, err);
    return false;
  }
}

/**
 * Link an attribute to an actor — **and every ancestor with it** (Joe's Q1).
 *
 * > *"Add a child attribute to auto add all the parents as a requirement… this removes having to
 * > write in any sort of imply checking during play."*
 *
 * Materialised at write rather than computed at read, which is the stronger choice: gates become
 * plain set membership instead of a tree walk on every check, and the state the whole design
 * feared — a carrier of a child that is not a carrier of its parent, whose membership no roll can
 * ever reach — **cannot be constructed**. Saying someone is an assassin of a particular guild says
 * they are of that district and that city, because that is what it means.
 *
 * `ref` is an id, a name or an entry. **A name that matches nothing is refused, never created** —
 * so a typo cannot spawn a link to nothing. To create-if-missing, `ensureAttribute` first: two
 * explicit calls is the point.
 *
 * → `{ok:true, id, actorId, added:[…], unsuppressed:[…]}` (both empty = already linked, still ok) |
 *   `{ok:false, reason:"notGM"|"invalid"|"empty"|"notFound"|"ambiguous"|"writeFailed"}`
 */
export async function linkAttribute(actor, ref) {
  if (!game.user?.isGM) return fail("notGM");
  const subject = subjectOf(actor);
  if (!subject) return fail("invalid");
  const reg = registry();
  const r = resolveAttrRef(ref, reg);
  if (!r.id) return missed(r);
  const wanted = withAncestors(r.id, reg);
  const authored = flagList(subject, ATTRIBUTES_FLAG);
  const off = flagList(subject, ATTRIBUTES_OFF_FLAG);
  const derived = derivedFor(subject);

  // linking something suppressed means un-suppressing it — and its ancestors too, or the link
  // would land on an actor whose ladder is still broken by a suppression further up
  const unsuppressed = off.filter(x => wanted.includes(x));
  const added = wanted.filter(x => !authored.includes(x) && !derived.includes(x));
  const wrote = await writeLinks(subject, {
    authored: added.length ? [...authored, ...added] : null,
    off: unsuppressed.length ? off.filter(x => !wanted.includes(x)) : null
  });
  if (!wrote) return fail("writeFailed");
  return { ok: true, id: r.id, actorId: subject.id, added, unsuppressed };
}

/**
 * Unlink one attribute from one actor.
 *
 * An **authored** link is removed from the flag. A **derived** link cannot be removed — it is
 * recomputed from the stat block every time — so it is suppressed instead. One gesture, two
 * mechanisms, and the GM does not have to know which is which.
 *
 * `ref` is an id, a name, or any id the actor carries — including a **dangling** one whose entry
 * is gone, which is how `A.broken()`'s `dangling` rows are cleaned up. Unlinking something the
 * actor does not carry is `{ok:true, removed:[], suppressed:[]}`, not an error.
 *
 * → `{ok:true, id, actorId, removed:[…], suppressed:[…]}` |
 *   `{ok:false, reason:"notGM"|"invalid"|"empty"|"notFound"|"ambiguous"|"writeFailed"}`
 */
export async function unlinkAttribute(actor, ref) {
  if (!game.user?.isGM) return fail("notGM");
  const subject = subjectOf(actor);
  if (!subject) return fail("invalid");
  const reg = registry();
  const authored = flagList(subject, ATTRIBUTES_FLAG);
  const r = resolveAttrRef(ref, reg, { carried: authored });
  if (!r.id) return missed(r);
  const id = r.id;

  /*
   * ⚠ Unlinking a parent must take its **descendants** with it, or the write creates exactly the
   * invalid state `linkAttribute` exists to prevent: a carrier of the guild who is not a carrier
   * of the district, whose guild membership no roll can ever reach. Removing "from Ardenhaven"
   * from an Ardenhaven assassin removes the assassin membership too, because the membership said
   * they were from Ardenhaven.
   */
  const doomed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const entry of reg) {
      if (doomed.has(entry.id) || !entry.parent || !doomed.has(entry.parent)) continue;
      doomed.add(entry.id);
      grew = true;
    }
  }

  const removed = authored.filter(x => doomed.has(x));

  /*
   * A derived link cannot be removed — it is recomputed from the stat block every time — so it is
   * suppressed instead. One gesture, two mechanisms, and the GM never has to know which is which.
   * (`kind:` is not suppressible from here: it needs the kind resolver, which lives in study.mjs.)
   */
  const derived = derivedFor(subject);
  const off = flagList(subject, ATTRIBUTES_OFF_FLAG);
  const suppressed = [...doomed].filter(x => derived.includes(x) && !off.includes(x));

  const wrote = await writeLinks(subject, {
    authored: removed.length ? authored.filter(x => !doomed.has(x)) : null,
    off: suppressed.length ? [...off, ...suppressed] : null
  });
  if (!wrote) return fail("writeFailed");
  return { ok: true, id, actorId: subject.id, removed, suppressed };
}

/**
 * Every carrier whose ancestry is broken — the invalid-sheet check (Joe's Q1: *"should have an
 * error and shouldn't be allowed"*). **The one "are this actor's links correct" call.**
 *
 * Two kinds of row:
 *
 *  · `{ id, missing }` — `id` is carried but its ancestor `missing` is not. Fix: `A.repair(actor, id)`.
 *  · `{ id, missing: null, dangling: true }` — an authored id with **no registry entry** (deleted,
 *    or a legacy typo). It degrades to a bare id with no lore. Fix: re-create the entry with that
 *    id, or `A.unlink(actor, id)`.
 *
 * Fails **open**: the planner simply stops at the gap rather than rolling a fact the data says is
 * false, so a broken sheet costs an unreachable membership, never a wrong answer. The error exists
 * so a GM can see and fix it, not to make the engine safe — the engine is already safe.
 */
export function brokenAncestry(actor, kindResolver = null) {
  const reg = registry();
  const live = new Set(reg.map(e => e.id));
  // the resolver is injected, never imported — `study.mjs` imports THIS file, so reaching back
  // for `kindActorOf` would close a cycle
  const has = new Set(attributeIdsOf(actor, kindResolver));
  const bad = [];
  for (const id of has) {
    if (!live.has(id) && !derivedNamespace(id)) {
      bad.push({ id, missing: null, dangling: true });
      continue;
    }
    for (const parent of ancestorsOf(id, reg)) {
      if (!has.has(parent)) bad.push({ id, missing: parent });
    }
  }
  return bad;
}

/** Repair one broken carrier by adding what its membership already implies. Same result as `link`. */
export const repairAncestry = (actor, ref) => linkAttribute(actor, ref);

/**
 * Re-parenting leaves every existing carrier holding the OLD ancestry — not *invalid* (they carry
 * an extra ancestor, not a missing one), so the validator will never see it. This finds them so
 * the GM can be offered a sweep. Never automatic: re-shaping the world is an authoring act, and
 * silently rewriting a hundred actors because of it is not.
 */
export function staleCarriers(ref) {
  const reg = registry();
  const id = resolveAttrRef(ref, reg).id;
  if (!id) return [];
  const wanted = new Set(withAncestors(id, reg));
  const out = [];
  for (const actor of game.actors?.contents ?? []) {
    const authored = flagList(actor, ATTRIBUTES_FLAG);
    if (!authored.includes(id)) continue;
    const extra = authored.filter(x => !wanted.has(x) && ancestorsOf(x, reg).length === 0 && x !== id);
    const missing = [...wanted].filter(x => !authored.includes(x));
    if (extra.length || missing.length) out.push({ actor, extra, missing });
  }
  return out;
}

/* -------------------------------------------- */
/*  World knowledge — the knows-a ledger        */
/* -------------------------------------------- */

/** Never throws — a setting can be unregistered when a hook fires early. */
export function knowledge() {
  return readKnowledge(setting(KNOWLEDGE_SETTING));
}

export const knowsOf = (character, attrId) => knowsAttribute(knowledge(), character?.id, attrId);
export const hasFailed = (character, attrId) => failedAttribute(knowledge(), character?.id, attrId);

/**
 * Write one world-knowledge row. GM-only — and the server agrees, which is the point of putting
 * this in a setting rather than on the character's own actor.
 *
 * ⚠ A setting is rewritten **whole**, so this must not be called per rung inside a cascade. The
 * conduit batches every row from one gesture into a single call.
 */
export async function setKnowledge(rows) {
  if (!game.user?.isGM || !rows?.length) return false;
  // queued (ties-30): the read happens inside the queue, so a concurrent write is never lost
  await knowledgeStore().write(raw => {
    const all = readKnowledge(raw);
    for (const { characterId, attrId, failed = false, via = "roll", when = 0, pending = false, overFailed = false } of rows) {
      if (!characterId || !attrId) continue;
      all[characterId] ??= {};
      all[characterId][attrId] = { when, failed, via, pending, ...(overFailed ? { overFailed: true } : {}) };
    }
    return all;
  });
  return true;
}

/**
 * Drop one world-knowledge row — **only a row a GM Share wrote** (`via: "shared"`).
 *
 * The first deletion of knowledge in the module, and deliberately narrow: it is the undo of a
 * Share (`forgetFact`), nothing else. A rolled row — success or the permanent stage-1 failure —
 * and a `grantKnowledge` row are left alone, and a share that was laid over a failed roll
 * (`overFailed`) is turned back INTO that failure rather than deleted, so Joe's "no reset for a
 * failed stage-1 roll" stands.
 * → true when a row was removed.
 */
export async function clearKnowledge(characterId, attrId) {
  if (!game.user?.isGM || !characterId || !attrId) return false;
  if (knowledge()[characterId]?.[attrId]?.via !== "shared") return false;
  // queued (ties-30), and re-checked inside the queue: a write that landed first decides
  let cleared = false;
  await knowledgeStore().write(raw => {
    const all = readKnowledge(raw);
    const row = all[characterId]?.[attrId];
    if (row?.via !== "shared") return all;
    // a share laid over a failed roll gives the failure back — forgetting is not a free re-roll
    if (row.overFailed) all[characterId][attrId] = { when: row.when, failed: true, via: "roll", pending: false };
    else delete all[characterId][attrId];
    if (!Object.keys(all[characterId]).length) delete all[characterId];
    cleared = true;
    return all;
  });
  return cleared;
}

/**
 * **Grant world knowledge** — the "they know of this" half of the GM control, and with research
 * cut (R1d) the *only* route into a character's knowledge that is not a blind roll.
 *
 * **A grant may land anywhere in the tree.** Joe's rule: *"I can give a child deep in a tree
 * without giving anything up the tree — say the research assassins, but might know nothing about
 * where they come from."* That is the point of a disclosure rather than a roll, so `withParents`
 * defaults **off** and hands over exactly the one thing named.
 *
 * What it costs is worth knowing, and is a fact about the world rather than a bug: identification
 * climbs root-first (`identificationLadder`), so a character told about the guild alone knows it
 * exists but still cannot **spot a member** until they can place the district above it. Turn
 * `withParents` on when you meant them to start recognising people; leave it off when you meant
 * them to have heard a name.
 *
 * Blind rolls never skip. Only the GM can, and the cases where skipping is right are too
 * particular to encode — so they live here, on a button, and nowhere else.
 *
 * `ref` is an id or a name; an unknown one is refused rather than written as a ghost row.
 * → `{ok:true, ids:[…]}` | `{ok:false, reason:"notGM"|"invalid"|"empty"|"notFound"|"ambiguous"|"writeFailed"}`
 */
export async function grantKnowledge(character, ref, { withParents = false } = {}) {
  if (!game.user?.isGM) return fail("notGM");
  if (!character?.id) return fail("invalid");
  const reg = registry();
  const r = resolveAttrRef(ref, reg);
  if (!r.id) return missed(r);
  const ids = withParents ? withAncestors(r.id, reg) : [r.id];
  const now = Date.now();
  try {
    await setKnowledge(ids.map(id => ({ characterId: character.id, attrId: id, via: "grant", when: now })));
  } catch (err) {
    log.warn(`knowledge grant failed`, err);
    return fail("writeFailed");
  }
  return { ok: true, ids };
}

/**
 * `describeAttribute` for a console caller: an id or a name → a display record, or `null` when it
 * names nothing. (The internal `describeAttribute(id)` always fabricates a record from the slug,
 * which is right for a carried id and misleading for a typo.)
 */
export const describeRef = ref => {
  const id = resolveAttribute(ref);
  return id ? describeAttribute(id) : null;
};

/**
 * **Mark as learned** (ties-9) — hand a character an attribute's lore rows as granted cards, no roll:
 * the GM's "Mark as learned" button on the Attributes tab, as a function. Each card is keyed
 * `attr:<attrId>:<loreId>` and titled `<entry> — <row label>`, exactly as the cascade would file it,
 * because the Known tab and the Look window join on that key and that source.
 *
 * @param {Actor} character
 * @param {*} attrRef  an attribute id or title
 * @param {"all"|string|string[]} [loreIds]  which rows (default: every row)
 * @returns {Promise<{ ok: true, keys: string[] } | { ok: false, reason }>}
 */
export async function markLearned(character, attrRef, loreIds = "all", { now = Date.now() } = {}) {
  if (!game.user?.isGM) return fail("notGM");
  if (!character) return fail("notFound");
  const attrId = resolveAttribute(attrRef);
  if (!attrId) return fail("notFound");
  const entry = describeAttribute(attrId);
  const wanted = loreIds === "all" ? null : new Set([].concat(loreIds));
  const rows = (entry?.lore ?? []).filter(r => !wanted || wanted.has(r.id));
  if (!rows.length) return fail("noLore");
  const granted = foundry.utils.deepClone(character.getFlag(MODULE, GRANTED_FLAG) ?? {});
  for (const row of rows) {
    granted[attrFactKey(attrId, row.id)] = { text: row.text, when: now, icon: entry.icon, source: `${entry.title} — ${row.label}` };
  }
  await character.update({ [`flags.${MODULE}.${GRANTED_FLAG}`]: granted });
  return { ok: true, keys: rows.map(r => attrFactKey(attrId, r.id)) };
}

/**
 * Everything a character knows of the world, as display records — the world-knowledge surface.
 *
 * ⚠ Failed rows are returned **only for a GM**. A player must never see a marker where a branch
 * they permanently lost would be: an entry that says *"you failed to learn about somewhere"* names
 * the somewhere, which is the knowledge they failed to get.
 */
export function knownWorld(character, { forGM = false, kindResolver = null } = {}) {
  const rows = knowledge()[character?.id] ?? {};
  const live = new Set(registry().map(e => e.id));
  const out = [];
  const seen = new Set();
  for (const [id, rec] of Object.entries(rows)) {
    if (rec.failed && !forGM) continue;
    // a rung the GM is still holding is not yet theirs to know about
    if (rec.pending && !forGM) continue;
    /*
     * ⚠ Ghost rows. `deleteAttribute` leaves knowledge behind on purpose (re-creating the id
     * restores everything), but `describeAttribute` fabricates a fallback record from the slug —
     * so a deleted "The Quiet Hand" reappeared here forever as "Quiethand", in a list the tree
     * browser had no matching node for, and went on suppressing the grant search's offer of it.
     * Derived ids legitimately have no entry; anything else with no entry is a ghost.
     */
    if (!live.has(id) && !derivedNamespace(id)) continue;
    seen.add(id);
    out.push({ ...describeAttribute(id), ...rec, attrId: id });
  }
  // carrying implies knowing — computed, so re-linking a PC never needs a matching grant
  for (const id of character ? attributeIdsOf(character, kindResolver) : []) {
    if (seen.has(id) || derivedNamespace(id)) continue;
    out.push({ ...describeAttribute(id), attrId: id, when: 0, failed: false, pending: false, via: "carried" });
  }
  return out.sort(
    (a, b) => Number(a.failed) - Number(b.failed) || (a.category || "").localeCompare(b.category || "") || a.title.localeCompare(b.title)
  );
}

/**
 * Carrying implies knowing — the rule stated in the plan's §4, applied at read.
 *
 * A character knows their own groups without ever rolling, so their carried set is folded into
 * their world knowledge rather than written into the ledger. Computed, so a GM re-linking a PC
 * never has to remember to grant the knowledge too.
 */
export function knowsIncludingCarried(character, kindResolver = null) {
  const known = new Set(Object.entries(knowledge()[character?.id] ?? {}).filter(([, r]) => !r.failed).map(([id]) => id));
  for (const id of attributeIdsOf(character, kindResolver)) known.add(id);
  return known;
}

/**
 * **The world as one character sees it** — the tree browser behind both views.
 *
 * A player gets only what they know: their own map of the world, arranged the way it actually
 * nests. A GM gets the same tree with **everything else showing too**, each node marked, so
 * finding the next thing to hand over is one look rather than a search:
 *
 * | state | means | GM sees | player sees |
 * | --- | --- | --- | --- |
 * | `known` | worked out, told, or **carried** | ✓ | ✓ |
 * | `pending` | passed, waiting on the GM to deliver | ✓ | — |
 * | `failed` | rolled and missed; only a grant reopens it | ✓ | — |
 * | `unknown` | never attempted | ✓ | — |
 *
 * A player's tree carries **only `known` nodes**. Anything above one they were not told about is
 * contracted away rather than drawn dim, because a GM may grant a guild without its city and the
 * city's name is then not theirs to see.
 *
 * ⚠ A player must never see a `failed` or `unknown` node. Either one **names the thing they do
 * not know**, which is the knowledge itself — a list of the gaps in your map tells you the shape
 * of what is missing. Only `forGM` may render them, and `prune` drops them outright rather than
 * hiding them in markup a curious client could read.
 */
export function knowledgeTree(character, { forGM = false, kindResolver = null } = {}) {
  const rows = knowledge()[character?.id] ?? {};
  /*
   * ⚠ **Carrying implies knowing**, and the tree has to say so. This is §4's rule and the ledger's
   * own `via: "carried"` was reserved for it, but nothing wired it up — so a PC the GM had put in
   * the Salt Dogs saw the crew listed at the top of the tab and *nothing* in the world map below
   * it. Two halves of one tab disagreeing about what a character knows, and a **Tell them** button
   * offering to grant them a guild they are already in.
   *
   * It is computed rather than written, so re-linking a PC never needs a matching grant.
   *
   * The materialised ancestors come with it (`linkAttribute` writes them), which is the intended
   * meaning of a membership rather than a leak: you know which district your own crew works and
   * which city that is in. Derived namespaces are left out — an authored `species:human` entry
   * would otherwise sprout "Human" as a root in every character's map, and an authored `kind:`
   * entry would put an NPC's name there.
   */
  const carried = new Set(character ? attributeIdsOf(character, kindResolver).filter(id => !derivedNamespace(id)) : []);
  const state = id => {
    // carried wins over a stale failure: they blind-rolled it, missed, and later joined anyway —
    // reading `failed` first would hide a character's own guild from them
    if (carried.has(id)) return "known";
    const rec = rows[id];
    if (!rec) return "unknown";
    if (rec.failed) return "failed";
    return rec.pending ? "pending" : "known";
  };
  const forest = forestOf(registry(), { state, icon: iconArt });
  if (forGM) return forest;

  /*
   * Their map is exactly what they know, and the links between unknown things **contract**
   * rather than being drawn as placeholders — see `contractForest`. A guild they were told about
   * without its city sits at the top of their own map, not under a greyed-out city whose name
   * would be the leak.
   */
  return contractForest(forest, n => n.state === "known");
}

/** Everything beneath one attribute, flat — "show me this city's districts and guilds". */
export function branchOf(attrId, character = null, { forGM = false } = {}) {
  const rows = character ? knowledge()[character.id] ?? {} : {};
  const state = id => {
    const rec = rows[id];
    if (!character) return null;
    if (!rec) return "unknown";
    return rec.failed ? "failed" : rec.pending ? "pending" : "known";
  };
  const node = subtreeOf(attrId, registry(), { state, icon: iconArt });
  if (!node) return [];
  const flat = [];
  const walk = n => { flat.push(n); n.children.forEach(walk); };
  walk(node);
  /*
   * ⚠ No character is **not** a licence. The old shape returned the whole unfiltered branch for
   * `branchOf(id)` — a signature that reads like a harmless default and hands back every secret
   * under a node. A GM asks for it explicitly.
   */
  if (forGM) return flat;
  return character ? flat.filter(n => n.state === "known") : [];
}

/* -------------------------------------------- */
/*  Autocomplete                                */
/* -------------------------------------------- */

/**
 * One list: registry entries plus every derived id actually present in the world.
 *
 * Derived ids are gathered from the actors rather than from a fixed vocabulary, so a homebrew
 * creature type appears the moment one exists and disappears when the last carrier is deleted.
 */
export function allAttributeIds(kindResolver = null) {
  const ids = new Set(registry().map(e => e.id));
  for (const actor of game.actors?.contents ?? []) {
    for (const id of derivedFor(actor, kindResolver)) ids.add(id);
    for (const id of flagList(actor, ATTRIBUTES_FLAG)) ids.add(id);
  }
  return [...ids];
}

/**
 * Matches for a typed string, best first. Returns `{matches, canCreate, wouldBe}` — the caller
 * offers **Create** only when `canCreate`, which is false the moment the normalised id already
 * exists, whatever the typed title looked like.
 */
export function searchAttributes(query, kindResolver = null) {
  const q = String(query ?? "").trim().toLowerCase();
  const rows = allAttributeIds(kindResolver).map(describeAttribute);
  const matches = (q ? rows.filter(r => r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)) : rows)
    .sort(
      (a, b) =>
        Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)) ||
        Number(b.authored) - Number(a.authored) ||
        a.title.localeCompare(b.title)
    )
    .slice(0, 40);
  const wouldBe = attrIdOf(q);
  const named = nameCollision(q, registry());
  const collidesWith = wouldBe ? rows.find(r => r.id === wouldBe) ?? (named && describeAttribute(named.id)) ?? null : null;
  return {
    matches,
    wouldBe,
    // decision 18: creation past an existing id is refused — and past an existing NAME, which
    // `createAttribute` now also refuses, so the button never offers what the click would refuse
    canCreate: !!wouldBe && !collidesWith,
    collidesWith
  };
}

/** Does this actor carry anything worth drawing a tab for? */
export const hasAttributes = (actor, kindResolver = null) => attributeIdsOf(actor, kindResolver).length > 0;

/** The lore rows one attribute carries — the phase 4 row species, unchanged (decision 17). */
export const attributeLore = id => readLore(attributeById(id)?.lore);
