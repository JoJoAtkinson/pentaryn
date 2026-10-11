/**
 * Pentaryn NPC Ties — the API: implementations for the manifest rows, and buildApiFor(ctx).
 *
 * API. Imports core, adapters, settings and lib — and the domain files the published paths have
 * always been (attributes, study, the Known data), each edge in test/graph-allow.json (gap G1: the
 * blueprint has no domain role). Paths that open a window or touch the canvas come from a feature's
 * install() (overlay, sheet, token-hud, worn) or from the entry (the key-9 card), never by importing
 * a feature here.
 */

import { HOOKS, MODULE, NS, STANCES } from "./ties-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, CLIENT_STATE, settingsSnapshot, setting } from "./settings.mjs";
import { read, inbound, setTie, setNotes, removeTie, migrateLegacy } from "./ties-adapter.mjs";
import {
  readKnown, addKnown, setKnownField, hideKnown, removeKnown, categoriesFor, notebookActor
} from "./known.mjs";
import {
  studyStateFor, requestStudy, studyAs, kindDialog, setKindOf, kindActorOf, setStudyTiers, setStudyOffset,
  studyTiersOf, setStudyHold, beliefs, pending, deliver, reset, studiedOf, resolveFact, loreStateFor, requestLore,
  requestAttrLore, attrOffersFor, inspect as examine, scopingState, clearScoping, inspectAs, deliverHeldIdentifications,
  releaseHeldAttribute, resetIdentification, grantKind, resetInspection, shareFact, forgetFact, factStatus,
  legacyMissCards, beliefsOf
} from "./study.mjs";
import {
  registry, attributesOf, attributeIdsOf, derivedFor, resolveAttribute, describeRef, ensureAttribute,
  createAttribute, updateAttribute, deleteAttribute, linkAttribute, unlinkAttribute, searchAttributes, knowledge,
  knownWorld, grantKnowledge, brokenAncestry, repairAncestry, staleCarriers, selectedAttributes, selectAttributes,
  deselectAttributes, clearSelection, reviewAttribute, unreviewAttribute, unreviewedAttributes, describeAttribute
} from "./attributes.mjs";
import {
  BELIEFS_FLAG, GRANTED_FLAG, LORE_FLAG, readGranted, readLore, visibleAttributesFor
} from "./known-core.mjs";
import { CONCEAL_FLAG } from "./core/rules.mjs";
import { buildApi, maxDepth, toPlain } from "./lib/api.mjs";
import { readFlag } from "./lib/flags.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

/** Data and domain paths: the same functions the hand-built object published. */
const IMPL = {
  read,
  inbound,
  set: setTie,
  setTie,
  setNotes,
  remove: removeTie,
  migrate: migrateLegacy,
  STANCES,

  "known.read": readKnown,
  "known.add": addKnown,
  "known.set": setKnownField,
  "known.hide": hideKnown,
  "known.purge": removeKnown, // destroys; the UI never does this
  "known.remove": removeKnown,
  "known.categories": categoriesFor,
  "known.notebook": notebookActor,

  "study.state": studyStateFor,
  "study.request": requestStudy,
  "study.as": studyAs,
  "study.kind": kindDialog,
  "study.kindOf": setKindOf,
  "study.kindActor": kindActorOf,
  "study.tiers": setStudyTiers,
  "study.difficulty": setStudyOffset,
  "study.readTiers": studyTiersOf,
  "study.hold": setStudyHold,
  "study.beliefs": beliefs,
  "study.pending": pending,
  "study.deliver": deliver,
  "study.reset": reset,
  "study.studied": studiedOf,
  "study.fact": resolveFact,
  "study.lore": loreStateFor,
  "study.askLore": requestLore,
  "study.askAttr": requestAttrLore,
  "study.attrOffers": attrOffersFor,
  "study.examine": examine,
  "study.scoping": scopingState,
  "study.clearScoping": clearScoping,
  "study.inspectAs": inspectAs,
  "study.deliverHeld": deliverHeldIdentifications,
  "study.releaseHeld": releaseHeldAttribute,
  "study.resetIdent": resetIdentification,
  "study.release": grantKind,
  "study.resetInspection": resetInspection,
  "study.share": shareFact,
  "study.forget": forgetFact,
  "study.whoKnows": factStatus,
  "study.audit.legacyMissCards": legacyMissCards,

  "attributes.list": registry,
  "attributes.of": attributesOf,
  "attributes.ids": attributeIdsOf,
  "attributes.derived": derivedFor,
  "attributes.resolve": resolveAttribute,
  "attributes.lookup": describeRef,
  "attributes.ensure": ensureAttribute,
  "attributes.create": createAttribute,
  "attributes.update": updateAttribute,
  "attributes.remove": deleteAttribute,
  "attributes.link": linkAttribute,
  "attributes.unlink": unlinkAttribute,
  "attributes.search": searchAttributes,
  "attributes.knows": knowledge,
  "attributes.known": knownWorld,
  "attributes.tell": grantKnowledge,
  "attributes.broken": brokenAncestry,
  "attributes.repair": repairAncestry,
  "attributes.stale": staleCarriers,
  "attributes.selected": selectedAttributes,
  "attributes.select": selectAttributes,
  "attributes.deselect": deselectAttributes,
  "attributes.clearSelection": clearSelection,
  "attributes.review": reviewAttribute,
  "attributes.unreview": unreviewAttribute,
  "attributes.unreviewed": unreviewedAttributes,
};

/**
 * The dossier (ties-3): one read of everything ties knows about an actor. buildApi has already
 * resolved `ref` (exact name, id, uuid or token — never a substring). Ties data lives on the WORLD
 * actor, so a token's synthetic actor is read through its base (blueprint gap G5: the kit takes
 * `base` from the call's opts only).
 *
 * The viewer is `opts.as` (a user ref) or, without it, the caller. A GM sees everything. A player gets
 * null for the GM plane — inbound ties, the belief ledger, the kind pointer, the study ladder, lore
 * rows and concealment — and gets the ties, Known list, granted cards and world knowledge only of an
 * actor they own; attributes are the ones that character can see.
 */
function dossier(actor, { as } = {}) {
  const subject = actor?.isToken ? game.actors?.get(actor.id) ?? actor : actor;
  const viewer = as === undefined || as === null ? game.user : resolveRef(as, "user");
  const gmView = viewer?.isGM === true;
  const owns = gmView || subject.testUserPermission?.(viewer, "OWNER") === true;
  const carried = attributeIdsOf(subject, kindActorOf);
  const visible = gmView || owns
    ? carried
    : visibleAttributesFor({
        carried,
        registry: registry(),
        beliefs: readFlag(subject, MODULE, BELIEFS_FLAG) ?? {},
        characterId: viewer?.character?.id ?? "",
        isGM: false
      });
  const kind = kindActorOf(subject);
  return toPlain({
    actor: refOf(subject),
    kind: gmView && kind && kind.id !== subject.id ? refOf(kind) : null,
    ties: owns ? read(subject) : null,
    inbound: gmView ? inbound(subject) : null,
    known: owns && subject.type === "character" ? readKnown(subject) : null,
    granted: owns ? readGranted(readFlag(subject, MODULE, GRANTED_FLAG)) : null,
    knowledge: owns ? knownWorld(subject, { forGM: gmView, kindResolver: kindActorOf }).map(r => ({ attrId: r.attrId, title: r.title, failed: !!r.failed, pending: !!r.pending, via: r.via ?? null })) : null,
    attributes: visible.map(id => {
      const d = describeAttribute(id);
      return { id, title: d?.title ?? id, category: d?.category ?? null };
    }),
    beliefs: gmView ? beliefsOf(subject) : null,
    studyTiers: gmView ? studyTiersOf(subject) : null,
    lore: gmView ? readLore(readFlag(subject, MODULE, LORE_FLAG)) : null,
    conceal: gmView ? readFlag(subject, MODULE, CONCEAL_FLAG) ?? null : null
  });
}

/** Live smoke checks after a sync: published where it should be, settings readable, hooks in place. */
function selftest(ctx) {
  const checks = [
    { label: "published as module.api", ok: game.modules?.get(MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${NS} is this API`, ok: game.pentaryn?.[NS] === ctx.api },
    { label: "settings readable", ok: typeof setting("playerAccess") === "boolean" },
    { label: "hooks registered", ok: ctx.reg.ids().length > 0, detail: ctx.reg.ids().length },
    { label: "describe() is plain JSON, depth-bounded", ok: maxDepth(ctx.api?.describe?.() ?? null) > 0 }
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/**
 * Build the frozen API. Throws (at ready, in node too) when the manifest and the implementations —
 * IMPL plus every feature's contribution — drift apart.
 */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    ...IMPL,
    inspect: (actor, opts = {}) => dossier(actor, opts),
    selftest: () => selftest(ctx),
  }, {
    contributions: ctx.contributions,
    members: {
      settings: () => settingsSnapshot(),
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      settings: [...SETTINGS, ...CLIENT_STATE],
      events: HOOKS,
      hooks: ctx.reg.ids(),
      patches: [],
      published: publishedOf(NS),
    }),
  });
}
