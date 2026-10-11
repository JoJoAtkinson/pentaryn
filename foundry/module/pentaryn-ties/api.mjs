/**
 * Pentaryn NPC Ties — the API: implementations for the manifest rows, and buildApiFor(ctx).
 *
 * API. Imports core, adapters, settings and lib — and the domain files the published paths have
 * always been (attributes, study, the Known data), each edge in test/graph-allow.json (gap G1: the
 * blueprint has no domain role). Paths that open a window or touch the canvas come from a feature's
 * install() (overlay, sheet, token-hud, worn) or from the entry (the key-9 card), never by importing
 * a feature here.
 */

import { HOOKS, NS, STANCES } from "./ties-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, CLIENT_STATE, settingsSnapshot } from "./settings.mjs";
import { read, inbound, setTie, setNotes, removeTie, migrateLegacy } from "./ties-adapter.mjs";
import {
  readKnown, addKnown, setKnownField, hideKnown, removeKnown, categoriesFor, notebookActor
} from "./known.mjs";
import {
  studyStateFor, requestStudy, studyAs, kindDialog, setKindOf, kindActorOf, setStudyTiers, setStudyOffset,
  studyTiersOf, setStudyHold, beliefs, pending, deliver, reset, studiedOf, resolveFact, loreStateFor, requestLore,
  requestAttrLore, attrOffersFor, inspect, scopingState, clearScoping, inspectAs, deliverHeldIdentifications,
  releaseHeldAttribute, resetIdentification, grantKind, resetInspection, shareFact, forgetFact, factStatus,
  legacyMissCards
} from "./study.mjs";
import {
  registry, attributesOf, attributeIdsOf, derivedFor, resolveAttribute, describeRef, ensureAttribute,
  createAttribute, updateAttribute, deleteAttribute, linkAttribute, unlinkAttribute, searchAttributes, knowledge,
  knownWorld, grantKnowledge, brokenAncestry, repairAncestry, staleCarriers, selectedAttributes, selectAttributes,
  deselectAttributes, clearSelection, reviewAttribute, unreviewAttribute, unreviewedAttributes
} from "./attributes.mjs";
import { buildApi } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";

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
  "study.examine": inspect,
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
 * Build the frozen API. Throws (at ready, in node too) when the manifest and the implementations —
 * IMPL plus every feature's contribution — drift apart.
 */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, IMPL, {
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
