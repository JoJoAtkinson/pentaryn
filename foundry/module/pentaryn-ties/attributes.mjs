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

import { MODULE } from "./ties-api.mjs";
import {
  REGISTRY_SETTING,
  ATTRIBUTES_FLAG,
  ATTRIBUTES_OFF_FLAG,
  attrIdOf,
  derivedNamespace,
  clampAttribute,
  readRegistry,
  deriveAttributes,
  attributeIdsFor,
  readLore,
  withAncestors,
  ancestorsOf,
  KNOWLEDGE_SETTING,
  readKnowledge,
  knowsAttribute,
  failedAttribute,
  visibleAttributesFor,
  forestOf,
  subtreeOf,
  childrenOf
} from "./known-core.mjs";

// re-exported so the entry point registers the settings by the same names this file reads
export { REGISTRY_SETTING, ATTR_BELIEFS_SETTING, KNOWLEDGE_SETTING } from "./known-core.mjs";

const t = k => game.i18n.localize(`PENTARYN_TIES.${k}`);
const f = (k, data) => game.i18n.format(`PENTARYN_TIES.${k}`, data);

/** Generic art by category, so a new entry is never a broken image. */
const CATEGORY_ICONS = {
  faction: "icons/environment/settlement/watchtower-flag.webp",
  place: "icons/environment/settlement/house-two-fire.webp",
  people: "icons/environment/people/group.webp",
  trade: "icons/tools/smithing/anvil.webp",
  default: "icons/sundries/flags/banner-flag-blue.webp"
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

/** Never throws — a setting can be unregistered when a hook fires early. */
export function registry() {
  try {
    return readRegistry(game.settings.get(MODULE, REGISTRY_SETTING));
  } catch {
    return [];
  }
}

export const attributeById = id => registry().find(e => e.id === id) ?? null;

/** GM-only. The server would refuse a player anyway; refusing here keeps the message honest. */
async function saveRegistry(list) {
  if (!game.user?.isGM) return false;
  await game.settings.set(MODULE, REGISTRY_SETTING, readRegistry(list));
  return true;
}

/**
 * Create one entry. Returns `{ok:false, existing}` on a normalisation collision rather than
 * overwriting — decision 18: the autocomplete already offered the existing entry, so creating
 * past it was not deliberate, and colliding on the id is the signal. `yellowstone2` is how you
 * mean a different one.
 */
export async function createAttribute(title, { category = "", icon = null, advantage = true } = {}) {
  if (!game.user?.isGM) return { ok: false, reason: "notGM" };
  const id = attrIdOf(title);
  if (!id) return { ok: false, reason: "empty" };
  const list = registry();
  const existing = list.find(e => e.id === id);
  if (existing) return { ok: false, reason: "collision", existing };
  const entry = clampAttribute({
    id,
    title: String(title ?? "").trim(),
    category,
    icon: icon ?? CATEGORY_ICONS[category] ?? CATEGORY_ICONS.default,
    advantage,
    lore: []
  });
  if (!entry) return { ok: false, reason: "empty" };
  list.push(entry);
  await saveRegistry(list);
  return { ok: true, entry };
}

/**
 * Update one entry in place.
 *
 * ⚠ This is the *shared* record. A DC changed here changes for **every carrier** — that is the
 * feature, and it is also exactly how a GM rewrites a world-wide DC while thinking about one
 * orc. Decision 16's honesty note: every surface that reaches this must say whose DC it is.
 */
export async function updateAttribute(id, patch) {
  if (!game.user?.isGM) return false;
  const list = registry();
  const i = list.findIndex(e => e.id === id);
  if (i < 0) return false;
  const merged = clampAttribute({ ...list[i], ...patch, id: list[i].id });
  if (!merged) return false;
  list[i] = merged;
  return saveRegistry(list);
}

/**
 * Delete an entry.
 *
 * The **links are not touched**, and cannot be: derived links are computed and authored links
 * are ids on actors. A deleted entry degrades every carrier's link to a bare id with no lore
 * and no advantage — which is exactly what a derived id with no entry already is, so there is
 * one behaviour rather than two. Re-creating the entry with the same id restores everything.
 */
export async function deleteAttribute(id) {
  if (!game.user?.isGM) return false;
  return saveRegistry(registry().filter(e => e.id !== id));
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
  try {
    const raw = actor?.getFlag(MODULE, key);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
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
  if (entry) return { ...entry, derived: !!ns, authored: true, loreCount: entry.lore.length };
  const slug = ns ? id.slice(ns.length + 1) : id;
  return {
    id,
    title: derivedTitle(ns, slug),
    category: ns ? f("attributes.derivedCategory", { ns: t(`attributes.ns.${ns}`) }) : "",
    icon: ns ? DERIVED_ICONS[ns] ?? CATEGORY_ICONS.default : CATEGORY_ICONS.default,
    advantage: false, // no entry means the GM has said nothing about it
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
 * be listed to someone who has not worked it out. Omit `viewer` for the GM's own view and for a
 * character's own sheet, where carrying implies knowing.
 */
export function attributesOf(actor, kindResolver = null, { viewer = null } = {}) {
  const carried = attributeIdsOf(actor, kindResolver);
  const visible =
    !viewer || viewer.id === actor.id || game.user?.isGM
      ? carried
      : visibleAttributesFor({
          carried,
          registry: registry(),
          beliefs: actor.getFlag?.(MODULE, "beliefs") ?? {},
          characterId: viewer.id,
          isGM: false
        });
  const rows = visible.map(describeAttribute);
  return rows.sort(
    (a, b) => Number(b.authored) - Number(a.authored) || Number(a.derived) - Number(b.derived) || a.title.localeCompare(b.title)
  );
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
 */
export async function linkAttribute(actor, id) {
  if (!game.user?.isGM || !actor || !id) return false;
  const wanted = withAncestors(id, registry());
  const authored = flagList(actor, ATTRIBUTES_FLAG);
  const off = flagList(actor, ATTRIBUTES_OFF_FLAG);
  const derived = derivedFor(actor);

  // linking something suppressed means un-suppressing it — and its ancestors too, or the link
  // would land on an actor whose ladder is still broken by a suppression further up
  const unsuppressed = off.filter(x => !wanted.includes(x));
  if (unsuppressed.length !== off.length) {
    if (unsuppressed.length) await actor.setFlag(MODULE, ATTRIBUTES_OFF_FLAG, unsuppressed);
    else await actor.unsetFlag(MODULE, ATTRIBUTES_OFF_FLAG);
  }

  const add = wanted.filter(x => !authored.includes(x) && !derived.includes(x));
  if (add.length) await actor.setFlag(MODULE, ATTRIBUTES_FLAG, [...authored, ...add]);
  return true;
}

/**
 * Unlink one attribute from one actor.
 *
 * An **authored** link is removed from the flag. A **derived** link cannot be removed — it is
 * recomputed from the stat block every time — so it is suppressed instead. One gesture, two
 * mechanisms, and the GM does not have to know which is which.
 */
export async function unlinkAttribute(actor, id) {
  if (!game.user?.isGM || !actor || !id) return false;

  /*
   * ⚠ Unlinking a parent must take its **descendants** with it, or the write creates exactly the
   * invalid state `linkAttribute` exists to prevent: a carrier of the guild who is not a carrier
   * of the district, whose guild membership no roll can ever reach. Removing "from Ardenhaven"
   * from an Ardenhaven assassin removes the assassin membership too, because the membership said
   * they were from Ardenhaven.
   */
  const reg = registry();
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

  const authored = flagList(actor, ATTRIBUTES_FLAG);
  const keep = authored.filter(x => !doomed.has(x));
  if (keep.length !== authored.length) {
    if (keep.length) await actor.setFlag(MODULE, ATTRIBUTES_FLAG, keep);
    else await actor.unsetFlag(MODULE, ATTRIBUTES_FLAG);
  }

  /*
   * A derived link cannot be removed — it is recomputed from the stat block every time — so it is
   * suppressed instead. One gesture, two mechanisms, and the GM never has to know which is which.
   */
  const derived = derivedFor(actor);
  const suppress = [...doomed].filter(x => derived.includes(x));
  if (suppress.length) {
    const off = flagList(actor, ATTRIBUTES_OFF_FLAG);
    const next = [...new Set([...off, ...suppress])];
    if (next.length !== off.length) await actor.setFlag(MODULE, ATTRIBUTES_OFF_FLAG, next);
  }
  return true;
}

/**
 * Every carrier whose ancestry is broken — the invalid-sheet check (Joe's Q1: *"should have an
 * error and shouldn't be allowed"*).
 *
 * Fails **open**: the planner simply stops at the gap rather than rolling a fact the data says is
 * false, so a broken sheet costs an unreachable membership, never a wrong answer. The error exists
 * so a GM can see and fix it, not to make the engine safe — the engine is already safe.
 */
export function brokenAncestry(actor, kindResolver = null) {
  const reg = registry();
  // the resolver is injected, never imported — `study.mjs` imports THIS file, so reaching back
  // for `kindActorOf` would close a cycle
  const has = new Set(attributeIdsOf(actor, kindResolver));
  const bad = [];
  for (const id of has) {
    for (const parent of ancestorsOf(id, reg)) {
      if (!has.has(parent)) bad.push({ id, missing: parent });
    }
  }
  return bad;
}

/** Repair one broken carrier by adding what its membership already implies. */
export const repairAncestry = (actor, id) => linkAttribute(actor, id);

/**
 * Re-parenting leaves every existing carrier holding the OLD ancestry — not *invalid* (they carry
 * an extra ancestor, not a missing one), so the validator will never see it. This finds them so
 * the GM can be offered a sweep. Never automatic: re-shaping the world is an authoring act, and
 * silently rewriting a hundred actors because of it is not.
 */
export function staleCarriers(id) {
  const reg = registry();
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
  try {
    return readKnowledge(game.settings.get(MODULE, KNOWLEDGE_SETTING));
  } catch {
    return {};
  }
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
  const all = knowledge();
  for (const { characterId, attrId, failed = false, via = "roll", when = 0, pending = false } of rows) {
    if (!characterId || !attrId) continue;
    all[characterId] ??= {};
    all[characterId][attrId] = { when, failed, via, pending };
  }
  await game.settings.set(MODULE, KNOWLEDGE_SETTING, all);
  return true;
}

/**
 * **Grant world knowledge** — the "they know of this" half of the GM control, and with research
 * cut (R1d) the *only* route into a character's knowledge that is not a blind roll.
 *
 * `withParents` is not a convenience: a leaf granted alone is **inert for identification**,
 * because stage 2 climbs the ladder and a character who cannot place anyone's city can never place
 * anyone's guild. Granting the assassins' guild alone tells them it exists and nothing more —
 * which is right for *"you keep having to kill assassins from a city you never been to"*, and
 * wrong for a GM who meant them to start spotting members.
 */
export async function grantKnowledge(character, attrId, { withParents = false } = {}) {
  if (!game.user?.isGM || !character || !attrId) return false;
  const ids = withParents ? withAncestors(attrId, registry()) : [attrId];
  const now = Date.now();
  return setKnowledge(ids.map(id => ({ characterId: character.id, attrId: id, via: "grant", when: now })));
}

/**
 * Everything a character knows of the world, as display records — the world-knowledge surface.
 *
 * ⚠ Failed rows are returned **only for a GM**. A player must never see a marker where a branch
 * they permanently lost would be: an entry that says *"you failed to learn about somewhere"* names
 * the somewhere, which is the knowledge they failed to get.
 */
export function knownWorld(character, { forGM = false } = {}) {
  const rows = knowledge()[character?.id] ?? {};
  const out = [];
  for (const [id, rec] of Object.entries(rows)) {
    if (rec.failed && !forGM) continue;
    // a rung the GM is still holding is not yet theirs to know about
    if (rec.pending && !forGM) continue;
    out.push({ ...describeAttribute(id), ...rec, attrId: id });
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
 * | `known` | worked out or told | ✓ | ✓ |
 * | `pending` | passed, waiting on the GM to deliver | ✓ | — |
 * | `failed` | rolled and missed; only a grant reopens it | ✓ | — |
 * | `unknown` | never attempted | ✓ | — |
 *
 * ⚠ A player must never see a `failed` or `unknown` node. Either one **names the thing they do
 * not know**, which is the knowledge itself — a list of the gaps in your map tells you the shape
 * of what is missing. Only `forGM` may render them, and `prune` drops them outright rather than
 * hiding them in markup a curious client could read.
 */
export function knowledgeTree(character, { forGM = false } = {}) {
  const rows = knowledge()[character?.id] ?? {};
  const state = id => {
    const rec = rows[id];
    if (!rec) return "unknown";
    if (rec.failed) return "failed";
    return rec.pending ? "pending" : "known";
  };
  const forest = forestOf(registry(), { state });
  if (forGM) return forest;

  /*
   * Prune to what they know, keeping a node only if it or something beneath it is known —
   * so a known guild still shows the city it hangs under, and nothing else leaks.
   */
  const prune = node => {
    const kids = node.children.map(prune).filter(Boolean);
    if (node.state !== "known" && !kids.length) return null;
    return { ...node, children: kids, state: node.state === "known" ? "known" : "waypoint" };
  };
  return forest.map(prune).filter(Boolean);
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
  const node = subtreeOf(attrId, registry(), { state });
  if (!node) return [];
  const flat = [];
  const walk = n => { flat.push(n); n.children.forEach(walk); };
  walk(node);
  return forGM || !character ? flat : flat.filter(n => n.state === "known");
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
  return {
    matches,
    wouldBe,
    // decision 18: creation past an existing id is refused, and the id is what decides
    canCreate: !!wouldBe && !rows.some(r => r.id === wouldBe),
    collidesWith: wouldBe ? rows.find(r => r.id === wouldBe) ?? null : null
  };
}

/** Does this actor carry anything worth drawing a tab for? */
export const hasAttributes = (actor, kindResolver = null) => attributeIdsOf(actor, kindResolver).length > 0;

/** The lore rows one attribute carries — the phase 4 row species, unchanged (decision 17). */
export const attributeLore = id => readLore(attributeById(id)?.lore);
