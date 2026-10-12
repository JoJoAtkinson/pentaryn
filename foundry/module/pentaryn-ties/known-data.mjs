/**
 * The Known list's data half — the flag round-trip, the categories and the notebook pick — so the
 * API can publish it without importing the tab's markup and listeners (known-ui.mjs). Moved out of
 * known.mjs in S12; the rules themselves (reader, defaults, caps) are pure, in core/known.mjs.
 *
 * Never throws on a read: a flag that cannot be read is an empty list.
 */

import { MODULE } from "./ties-core.mjs";
import { readFlag } from "./lib/flags.mjs";
import { baseActorOf } from "./ties-adapter.mjs";
import {
  KNOWN_FLAG,
  KNOWN_CATEGORIES_FLAG,
  readCategories,
  readKnown as readKnownList,
  toStoredKnown,
  makeKnownEntry,
  pickNotebook
} from "./known-core.mjs";

/** The two seeded categories' labels (literal keys); a custom key keeps its template. */
const CATEGORY_LABEL = Object.freeze({
  sentient: "PENTARYN_TIES.known.category.sentient",
  beasts: "PENTARYN_TIES.known.category.beasts"
});

/* -------------------------------------------- */
/*  Data                                        */
/* -------------------------------------------- */

/**
 * The world lookup the pure reader is missing, in the shape it asks for.
 *
 * Creature type comes from `system.details.type.value` — the path that drives the dnd5e NPC
 * sheet — and is only ever used to *default* a new entry's category. It is not a kind and
 * not a knowledge key: filing by it once is filing; reading knowledge off it would make one
 * goblin teach every humanoid (the plan's own rejected row).
 */
const resolveActor = id => {
  const actor = game.actors?.get(id);
  if (!actor) return null;
  return {
    name: actor.name,
    img: actor.img ?? null,
    actorType: actor.type ?? null,
    creatureType: actor.system?.details?.type?.value ?? null
  };
};

// a flag that cannot be read is an empty list, never an exception (readFlag never throws)
const rawFlag = (actor, key) => readFlag(actor, MODULE, key);

/** The categories this actor files into: the seeded pair, plus any the GM has added. */
export function categoriesFor(actor) {
  return readCategories(rawFlag(actor, KNOWN_CATEGORIES_FLAG));
}

/**
 * A category's display name. A stored `label` is a rename and always wins; otherwise the
 * seeded keys localize, and an unrenamed custom key falls back to the key itself rather
 * than to a missing-translation string.
 */
export function categoryLabel(category) {
  if (category?.label) return category.label;
  const key = CATEGORY_LABEL[category?.key] ?? `PENTARYN_TIES.known.category.${category?.key}`;
  const localized = game.i18n.localize(key);
  return localized === key ? category?.key ?? "" : localized;
}

/** Sanitised, resolved Known entries for an actor. Never throws, never returns a non-array. */
export function readKnown(actor) {
  if (!actor) return [];
  return readKnownList(rawFlag(actor, KNOWN_FLAG), { resolve: resolveActor, categories: categoriesFor(actor) });
}

/**
 * `render: false` for the same reason ties writes are: a plain setFlag re-renders the sheet,
 * which destroys the injected tab mid-edit. Callers repaint deliberately.
 */
export async function writeKnown(actor, list, { render = false } = {}) {
  if (!actor?.isOwner) return false; // the server would refuse it anyway; fail quietly
  await actor.update({ [`flags.${MODULE}.${KNOWN_FLAG}`]: toStoredKnown(list) }, { render });
  return true;
}

/**
 * File someone. Returns the entry, or null if it was already there — the caller decides
 * whether that deserves a notification.
 *
 * `when` is stamped once, here, and never touched again: it is what orders the list, so a
 * later edit must not move a row under the cursor that is editing it.
 */
export async function addKnown(actor, target, { now = Date.now() } = {}) {
  const subject = target instanceof Actor ? target : game.actors?.get(target);
  if (!actor?.isOwner || !subject || subject.id === actor.id) return null;
  const list = readKnown(actor);
  if (list.some(e => e.id === subject.id)) return null;
  const entry = makeKnownEntry({
    id: subject.id,
    name: subject.name,
    actorType: subject.type,
    creatureType: subject.system?.details?.type?.value ?? null,
    now
  });
  await writeKnown(actor, [...list, entry]);
  return entry;
}

/** Change one field on one entry. No-op if the entry is gone. */
export async function setKnownField(actor, id, field, value) {
  if (!["category", "notes"].includes(field)) return false;
  const list = readKnown(actor);
  const entry = list.find(e => e.id === id);
  if (!entry) return false;
  entry[field] = value;
  return writeKnown(actor, list);
}

/**
 * Hide or restore one entry — the notebook's only tidying gesture.
 *
 * Joe's rule: *"never deleted so I'm never asked to recover a link."* Everything a character
 * wrote down stays written down; hiding just gets it out of the way.
 */
export async function hideKnown(actor, id, hidden = true) {
  const list = readKnown(actor);
  if (!list.some(e => e.id === id)) return false;
  return writeKnown(actor, list.map(e => (e.id === id ? { ...e, hidden: !!hidden } : e)));
}

/**
 * ⚠ **Genuinely destroys an entry, and nothing in the UI calls it.** Kept as a GM escape hatch
 * for a row that should never have existed — a mis-click, a test, an import gone wrong. For
 * anything a character actually learned, use `hideKnown`: the whole point of the rule is that a
 * player's record cannot be lost and the GM is never asked to recover one.
 */
export async function removeKnown(actor, id) {
  const list = readKnown(actor);
  if (!list.some(e => e.id === id)) return false;
  return writeKnown(actor, list.filter(e => e.id !== id));
}

/** The canvas-side half of `pickNotebook` — the `baseActorOf` walk, then the pure rule. */
export function notebookActor() {
  const describe = actor =>
    actor ? { id: actor.id, isCharacter: actor.type === "character", isOwner: actor.isOwner === true } : null;
  const walk = tokens => (tokens ?? []).map(tok => describe(baseActorOf(tok))).filter(Boolean);
  const id = pickNotebook({
    controlled: walk(canvas?.tokens?.controlled),
    assigned: describe(game.user?.character ?? null),
    owned: walk(canvas?.tokens?.placeables)
  });
  return id ? game.actors?.get(id) ?? null : null;
}
