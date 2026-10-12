/**
 * pentaryn-importer — Stage 2 of the Pentaryn ⇄ Foundry pipeline.
 *
 * importer-core.mjs is the PURE part: constants, error classes, the formula lint, payload shaping,
 * valuesMatch, assertionMessage and the version-gate rules (`versionProblems`). No Foundry globals:
 * node imports it bare (test/core.test.mjs). Fetch, toasts and Document writes live in
 * documents-adapter.mjs; the orchestrator in api.mjs. The header below is the module's design note.
 *
 * Reads `foundry/build/actors.json` (produced by Stage 1, `scripts/foundry/build_actors.py`)
 * after `make foundry-sync` has copied it under `Data/worlds/<world>/`, and upserts the
 * described NPC Actors into the live world.
 *
 * The full data contract is `foundry/CONTRACT.md`. Section references (§n) below point at it.
 * The rationale for the pipeline shape is `context/plans/foundry-content-pipeline.md` (D3, D8, D10).
 *
 * Design rules this file obeys, in order of importance:
 *
 *   1. Every failure mode in this stack is SILENT. Foundry strips unknown keys instead of
 *      rejecting them, and dnd5e replaces unknown `@refs` with 1 at validation time but 0 at
 *      evaluation time. So: version-gate hard, lint the payload, and read every write back and
 *      compare *displayed labels* (§8).
 *   2. Never recreate an Actor. Tokens already placed on scenes reference the Actor id;
 *      recreating breaks them. Items are replaced; Actors are updated in place.
 *   3. Never write `img`, `prototypeToken.texture.src` or `system.attributes.hp.value` on an
 *      update — the first two are hand-curated GM work, the third would heal a wounded token
 *      mid-session (§3, §12).
 *
 * API surface (deliberately tiny):
 *
 *   await game.pentaryn.import()                        // full run against the default path
 *   await game.pentaryn.import({ dryRun: true })         // gate + lint + report, no writes
 *   await game.pentaryn.import({ only: ["skeleton"] })   // Gate 2's "import one NPC"
 *   await game.pentaryn.import({ force: true })          // ignore contentHash, rewrite everything
 *
 * No UI, no settings, no hooks beyond `ready`.
 *
 * ── API citations ────────────────────────────────────────────────────────────────────────────
 * Everything below was read out of the installed artefacts, not recalled:
 *   Foundry v14.365 → /Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/
 *   dnd5e 5.3.3     → Data/systems/dnd5e/dnd5e-compiled.mjs.map (`sourcesContent`, 350 files)
 *
 *   Target since 1.1.0 (2026-10-10): dnd5e **6.0** (verified 6.0.6). Only the version gate moved —
 *   module.json `targetSystemVersion` "6.0", compared against the live major.minor below. The
 *   payload shapes are still the 5.3 ones (see FORMULA_GLOBS); dnd5e 6 migrates them on create
 *   and update until 7.0. The dnd5e line citations below are from 5.3.3.
 *
 *   `game.release.generation`         common/config.mjs:140 (ReleaseData, integer, required)
 *   `game.system` (System package)    client/game.mjs:622 → `.id`, `.version`
 *   `foundry.utils.getRoute()`        common/utils/helpers.mjs:698
 *   `foundry.utils.getProperty()`     common/utils/helpers.mjs (global `foundry.utils`)
 *   `getDocumentClass()`              client/utils/helpers.mjs:238, exported as a global at
 *                                     client/client.mjs:161
 *   `Document#reset()`                common/abstract/data.mjs:524 → `_initialize()` →
 *                                     client/documents/abstract/client-document.mjs:59-66
 *                                     `_safePrepareData()`. This is how we guarantee `.labels`
 *                                     exist before asserting.
 *   `ui.notifications.notify()`       client/applications/ui/notifications.mjs:108
 *                                     ({localize, permanent, console, escape} options)
 *   `item.system.activities`          dnd5e module/data/fields/activities-field.mjs:93
 *                                     `ActivityCollection extends Collection`, keyed by
 *                                     `entry._id` (line 99) → `.get(id)` is the lookup in §8.2.3
 *   `activity.labels.toHit`           dnd5e module/data/activity/attack-data.mjs:215, written in
 *                                     `prepareFinalData` from `getAttackData()`, which returns
 *                                     early on `attack.flat` at line 261 — i.e. the label IS the
 *                                     baked bonus, with no ability mod or proficiency added.
 *   `activity.labels.save`            dnd5e module/data/activity/save-data.mjs:114. In flat-DC
 *                                     mode `ability` is undefined, so the format string
 *                                     "DC {dc} {ability}" yields a TRAILING SPACE — hence the
 *                                     whitespace normalisation in §8.2.5.
 *   `activity.labels.damage`          dnd5e module/data/activity/base-activity.mjs:661 — an array
 *                                     of `{formula, label, damageType}`, hence the
 *                                     `labels.damage.0.formula` path.
 *   `item.labels.recharge`            dnd5e module/data/shared/uses-field.mjs:53, called with the
 *                                     Item's label object from
 *                                     module/data/item/templates/activities.mjs:304-306.
 *   Supplied activity `_id` honoured  `_id` is a `DocumentIdField` whose default is
 *                                     `readonly: true` (common/data/fields.mjs:3374); `readonly`
 *                                     only makes the *initialised* property non-writable
 *                                     (common/abstract/data.mjs:491) — it does not strip source
 *                                     data. And dnd5e skips auto-creating activities when the
 *                                     source already has some
 *                                     (module/data/item/templates/activities.mjs:256). This is
 *                                     contract U7; `assertActivityIdsSurvived()`
 *                                     (documents-adapter.mjs) checks it explicitly rather than
 *                                     trusting the reading.
 *   Explicit `prototypeToken.width`   dnd5e module/data/actor/templates/traits.mjs:147 and :164 —
 *                                     both `preCreateSize` and `preUpdateSize` bail out when the
 *                                     payload already carries `prototypeToken.width`, so our
 *                                     explicit value wins on create AND on update.
 *
 * ── The one place this file knowingly departs from CONTRACT.md ───────────────────────────────
 *
 * §9.2 shows `actor?.getFlag("pentaryn", "contentHash")`. That **throws** on this Foundry build:
 * `Document#getFlag` validates the scope against `ClientDatabaseBackend#getFlagScopes()`
 * (common/abstract/document.mjs:947-951 → client/data/client-backend.mjs:646-653), which is
 * `["core", "world", game.system.id, ...activeModuleIds]`. "pentaryn" is none of those — this
 * module's id is "pentaryn-importer". Reads therefore go through
 * `foundry.utils.getProperty(doc, "flags.pentaryn.…")`.
 *
 * Writing the flag is fine: `flags` is a `DocumentFlagsField` whose only key constraint is
 * `BasePackage.validateId` (common/data/fields.mjs:4002-4009), i.e. `/^[A-Za-z0-9-_]+$/`, which
 * "pentaryn" satisfies. So flags are written as ordinary document data, never via `setFlag`.
 */

/* -------------------------------------------------------------------------------------------- */
/*  Constants                                                                                     */
/* -------------------------------------------------------------------------------------------- */

export const MODULE = "pentaryn-importer";
export const SHORT = "importer";
export const NS = "importer";
/** module.json `version`; test/version-gate.test.mjs pins them equal. */
export const VERSION = "1.1.1";
/**
 * The kit API contract of `game.pentaryn.importer` (describe(), buildApi). NOT the actors.json
 * contract — that is CONTRACT_ID below, which the generator and the version gate speak.
 */
export const CONTRACT = "pentaryn-importer/api@1";
/** The importer emits no hooks of its own. */
export const HOOKS = Object.freeze({});
/** i18n root (unused: the importer is console/toast-only by design) and CSS prefix (no CSS). */
export const I18N = "PENTARYN_IMPORTER";
export const CSS = "pim-";

/** Flag namespace used by the generator. NOT this module's id — see the header note. */
const FLAG_SCOPE = "pentaryn";

/** CONTRACT.md §1: the importer MUST refuse anything else. */
const CONTRACT_ID = "pentaryn/actors.json@1";

const DEFAULT_TIMEOUT_MS = 15000;

/** CONTRACT.md §10. Digits, dice, arithmetic, whitespace — no `@`. */
const FORMULA_OK = /^[0-9d+\-*/(). ]*$/;

/**
 * CONTRACT.md §10, the complete list of FormulaFields this pipeline writes, expressed as
 * dot-globs relative to an actor entry. `*` matches exactly one path segment (an array index or
 * an activity id).
 *
 * Note `system.attributes.movement.*` is deliberately expanded to the formula subkeys only:
 * that block also carries `hover` (boolean) and `units` ("ft"), and "ft" would fail FORMULA_OK.
 *
 * DEFERRED to contract @2 (do not move piecemeal): `init.bonus` and `movement.<type>` are the
 * legacy 5.3 shapes. dnd5e 6.0 migrates them to `init.roll.bonus` / `movement.speeds.<type>` on
 * create and update (common.mjs:85, movement-field.mjs:56-59; shims until 7.0). Moving them here
 * changes every actor's contentHash and forces a wholesale re-import, so they move together with
 * the generator's shapes and the SIZE_TO_TOKEN drop in one contract bump.
 */
const FORMULA_GLOBS = [
  "system.attributes.hp.formula",
  "system.attributes.init.bonus",
  "system.attributes.movement.walk",
  "system.attributes.movement.burrow",
  "system.attributes.movement.climb",
  "system.attributes.movement.fly",
  "system.attributes.movement.swim",
  "system.attributes.movement.bonus",
  "items.*.system.uses.max",
  "items.*.system.uses.recovery.*.formula",
  "items.*.system.activities.*.attack.bonus",
  "items.*.system.activities.*.damage.critical.bonus",
  "items.*.system.activities.*.damage.parts.*.bonus",
  "items.*.system.activities.*.damage.parts.*.custom.formula",
  "items.*.system.activities.*.damage.parts.*.scaling.formula",
  "items.*.system.activities.*.save.dc.formula",
  "items.*.system.activities.*.roll.formula",
  "items.*.system.activities.*.range.value",
  "items.*.system.activities.*.target.template.count",
  "items.*.system.activities.*.target.template.size",
  "items.*.system.activities.*.target.template.width",
  "items.*.system.activities.*.target.template.height",
  "items.*.system.activities.*.target.affects.count",
  "items.*.system.activities.*.consumption.targets.*.value",
  "items.*.system.activities.*.consumption.scaling.max"
];

const FORMULA_PATTERNS = FORMULA_GLOBS.map(glob => new RegExp(`^${
  glob.split(".")
    .map(seg => (seg === "*" ? "[^.]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("\\.")
}$`));

/**
 * Payload keys the importer strips before any `Document.create` / `Document.update`.
 * `expected` is the §8 assertion block and is not a Foundry field; the rest are either assigned
 * by Foundry (`_id`) or hand-curated GM work we must never clobber (§3).
 */
const STRIPPED_KEYS = ["expected", "_id", "img", "folder", "_stats", "ownership"];
/** The two old names (one list since items-journal-3): actor entries and their Items strip the same keys. */
const STRIPPED_ACTOR_KEYS = STRIPPED_KEYS;
const STRIPPED_ITEM_KEYS = STRIPPED_KEYS;

/* -------------------------------------------------------------------------------------------- */
/*  Errors                                                                                        */
/* -------------------------------------------------------------------------------------------- */

/** Base class so callers can tell our refusals from a stray TypeError. */
class PentarynError extends Error {
  constructor(message) {
    super(message);
    this.name = "PentarynError";
  }
}

/**
 * A whole-run refusal: version gate, `@ref` lint, malformed manifest, missing file.
 * Nothing has been written when this is thrown.
 *
 * `code` is a kit code (lib/errors.mjs CODES) so pentaryn-write and other kit callers can tell the
 * refusals apart without parsing prose: NOT_FOUND (the file is not there), NOT_GM, BAD_ARGS (an
 * option), CONFLICT (an import already running), TIMEOUT (the fetch), REFUSED (everything else:
 * the gate, the lint, a malformed entry, a non-404 HTTP error, a network failure). The message
 * carries no `CODE:` prefix — its text is pinned (test/golden/refusals.json) and shown in toasts.
 */
class PentarynAbort extends PentarynError {
  /**
   * @param {string} message
   * @param {string} [code="REFUSED"]
   */
  constructor(message, code = "REFUSED") {
    super(message);
    this.name = "PentarynAbort";
    this.code = code;
  }
}

/**
 * A readback assertion failed (§8.3). Fatal to the whole run — a mismatch means the
 * silent-strip failure mode is live and nothing else in the batch can be trusted. Deliberately
 * NOT caught by the per-actor try/catch.
 */
class PentarynAssertionError extends PentarynError {
  constructor(message) {
    super(message);
    this.name = "PentarynAssertionError";
  }
}

/* -------------------------------------------------------------------------------------------- */
/*  Small utilities                                                                               */
/* -------------------------------------------------------------------------------------------- */

/** @param {*} value @returns {boolean} */
const isPlainObject = value => (value !== null) && (typeof value === "object") && !Array.isArray(value);

/**
 * §8.2.5 — string comparison is whitespace-normalised.
 * @param {*} value
 * @returns {string}
 */
const normalise = value => String(value).trim().replace(/\s+/g, " ");

/**
 * Deep-clone plain JSON with a JSON round-trip (`JSON.parse(JSON.stringify(…))`). The payload is pure
 * JSON, so this is exact for it — and it is what the contentHash and the strip lists were built
 * against: `undefined` keys vanish and a Date becomes its ISO string. Do NOT swap in
 * `structuredClone` (it keeps both) or `foundry.utils.deepClone`; either would change payloads.
 * @template T @param {T} value @returns {T}
 */
const cloneJson = value => JSON.parse(JSON.stringify(value));

/**
 * Recursively yield every string leaf of a JSON value along with its dotted path.
 * @param {*} node
 * @param {string} path
 * @param {(path: string, value: string) => void} visit
 */
function walkStrings(node, path, visit) {
  if (typeof node === "string") return visit(path, node);
  if (Array.isArray(node)) {
    node.forEach((entry, index) => walkStrings(entry, path ? `${path}.${index}` : String(index), visit));
    return;
  }
  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      walkStrings(value, path ? `${path}.${key}` : key, visit);
    }
  }
}

/**
 * Recursively yield every non-object leaf of a JSON value along with its dotted path.
 * Used by the prototype-token strip detector: arrays are treated as leaves so that a whole array
 * compares by value rather than element-wise.
 * @param {*} node
 * @param {string} path
 * @param {(path: string, value: *) => void} visit
 */
function walkLeaves(node, path, visit) {
  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      walkLeaves(value, path ? `${path}.${key}` : key, visit);
    }
    return;
  }
  visit(path, node);
}

/**
 * A dotted-path read on plain JSON — the body of Foundry 14.369's `foundry.utils.getProperty`
 * (common/utils/helpers.mjs:826-838), copied so the core needs no Foundry global. Its edge cases are
 * pinned (test/golden/lint.json, prepare.json): a literal dotted key wins, and a non-object
 * `object` throws the `in` operator's TypeError. Used for the manifest's own JSON only; every read
 * of a live Document keeps `foundry.utils.getProperty` (documents-adapter.mjs).
 * @param {object} object
 * @param {string} key
 * @returns {*}
 */
function getPath(object, key) {
  if ( !key || !object ) return undefined;
  if ( key in object ) return object[key];
  let target = object;
  for ( const p of key.split(".") ) {
    if ( !target ) return undefined;
    const type = typeof target;
    if ( (type !== "object") && (type !== "function") ) return undefined;
    if ( p in target ) target = target[p];
    else return undefined;
  }
  return target;
}

/**
 * slug → the FIRST actor that carries it (the one `Array.find` used to return), skipping falsy
 * slugs. Built once per run instead of scanning every world actor per manifest entry
 * (items-journal-7). `slugOf` reads the slug; the adapter passes `foundry.utils.getProperty` for live
 * Documents, the default is `getPath` (the same body) for plain objects.
 * @param {Iterable<object>} actors
 * @param {(actor: object) => *} [slugOf]
 * @returns {Map<*, object>}
 */
function indexBySlug(actors, slugOf = actor => getPath(actor, `flags.${FLAG_SCOPE}.slug`)) {
  const index = new Map();
  for (const actor of actors) {
    const slug = slugOf(actor);
    if (slug && !index.has(slug)) index.set(slug, actor);
  }
  return index;
}

/* -------------------------------------------------------------------------------------------- */
/*  Version gate rules (CONTRACT.md §1.1)                                                         */
/* -------------------------------------------------------------------------------------------- */

/**
 * Every reason to refuse `manifest`, in a fixed order, as the gate prints them. Empty = pass.
 * The JSON, the module and the live game must all agree; documents-adapter.mjs `assertVersionGate`
 * turns a non-empty list into the refusal.
 *
 * @param {object} manifest  The parsed top level of actors.json.
 * @param {{contract: string, targetSystem: string, targetSystemVersion: string, generation: number}} expected
 *   module.json `flags.pentaryn` (`moduleExpectations()`).
 * @param {{systemId: string, systemVersion: string, generation: number, version: string}} live
 *   `game.system.id`, `game.system.version`, `game.release.generation`, `game.version`.
 * @returns {string[]}
 */
function versionProblems(manifest, expected, live) {
  const liveSystemMinor = String(live.systemVersion).split(".").slice(0, 2).join(".");
  const problems = [];

  // 0 — the module copy in Data/ must be the one that matches this contract.
  if (expected.contract !== CONTRACT_ID) {
    problems.push(
      `module.json declares contract "${expected.contract}" but this code implements `
      + `"${CONTRACT_ID}" — module.json and pentaryn-importer.mjs are out of step.`
    );
  }

  // 1 — contract identity.
  if (manifest?.$contract !== CONTRACT_ID) {
    problems.push(
      `$contract is ${JSON.stringify(manifest?.$contract)}, expected ${JSON.stringify(CONTRACT_ID)}. `
      + "Regenerate with a build_actors.py that speaks this contract version."
    );
  }

  // 2 — target system.
  if (manifest?.targetSystem !== live.systemId) {
    problems.push(
      `targetSystem is ${JSON.stringify(manifest?.targetSystem)} but this world runs `
      + `${JSON.stringify(live.systemId)}.`
    );
  }
  if (manifest?.targetSystem !== expected.targetSystem) {
    problems.push(
      `targetSystem is ${JSON.stringify(manifest?.targetSystem)} but module.json expects `
      + `${JSON.stringify(expected.targetSystem)}.`
    );
  }

  // 3 — system major.minor. Patch level is deliberately not gated.
  if (manifest?.targetSystemVersion !== liveSystemMinor) {
    problems.push(
      `targetSystemVersion is ${JSON.stringify(manifest?.targetSystemVersion)} but the installed `
      + `${live.systemId} is ${live.systemVersion} (major.minor ${liveSystemMinor}). `
      + "dnd5e minor releases move the activity schema; refusing."
    );
  }
  if (manifest?.targetSystemVersion !== expected.targetSystemVersion) {
    problems.push(
      `targetSystemVersion is ${JSON.stringify(manifest?.targetSystemVersion)} but module.json `
      + `expects ${JSON.stringify(expected.targetSystemVersion)}.`
    );
  }

  // 4 — Foundry generation.
  if (manifest?.generation !== live.generation) {
    problems.push(
      `generation is ${JSON.stringify(manifest?.generation)} but this Foundry is generation `
      + `${live.generation} (${live.version}).`
    );
  }
  if (manifest?.generation !== expected.generation) {
    problems.push(
      `generation is ${JSON.stringify(manifest?.generation)} but module.json expects `
      + `${JSON.stringify(expected.generation)}.`
    );
  }

  // 5 — shape.
  if (!Array.isArray(manifest?.actors)) {
    problems.push("`actors` is missing or is not an array.");
  }

  return problems;
}

/* -------------------------------------------------------------------------------------------- */
/*  @ref lint (CONTRACT.md §10)                                                                   */
/* -------------------------------------------------------------------------------------------- */

/**
 * dnd5e's validation replaces unknown `@terms` with `1`, so a typo PASSES validation; evaluation
 * later resolves the unknown ref to `0`, so it ROLLS AS ZERO. There is no runtime signal.
 *
 * Everything this pipeline emits into a FormulaField is a literal number or a literal dice
 * expression, so the whitelist is empty and the rule is simply: no `@`, nothing but digits, `d`
 * and arithmetic. The generator checks this too; the importer repeats it as a defence against a
 * hand-edited `actors.json`.
 *
 * @param {object[]} actors
 * @returns {{slug: string, path: string, value: string}[]}  Offending entries.
 */
function lintFormulas(actors) {
  const hits = [];
  for (const actor of actors) {
    const slug = getPath(actor, `flags.${FLAG_SCOPE}.slug`) ?? actor?.name ?? "<unnamed>";
    walkStrings(actor, "", (path, value) => {
      if (!FORMULA_PATTERNS.some(pattern => pattern.test(path))) return;
      if (FORMULA_OK.test(value)) return;
      hits.push({ slug, path, value });
    });
  }
  return hits;
}

/* -------------------------------------------------------------------------------------------- */
/*  Payload preparation                                                                           */
/* -------------------------------------------------------------------------------------------- */

/**
 * Strip everything Foundry must not see, on a clone. Returns the create/update-safe actor data
 * plus the `expected` block held back for §8.
 *
 * @param {object} entry  One element of `manifest.actors`.
 * @returns {{data: object, items: object[], expected: object|null, slug: string}}
 */
function preparePayload(entry) {
  const data = cloneJson(entry);
  const expected = data.expected ?? null;

  for (const key of STRIPPED_ACTOR_KEYS) delete data[key];

  // `prototypeToken.texture` carries hand-curated token art (§3). The generator must not emit it;
  // strip defensively so a hand-edited file cannot destroy GM work.
  if (data.prototypeToken) delete data.prototypeToken.texture;

  const items = Array.isArray(data.items) ? data.items : [];
  delete data.items;                       // embedded documents are created separately, see below

  for (const item of items) {
    for (const key of STRIPPED_ITEM_KEYS) delete item[key];
  }

  const slug = getPath(data, `flags.${FLAG_SCOPE}.slug`);
  if (!slug || (typeof slug !== "string")) {
    throw new PentarynAbort(
      `An actor entry (name ${JSON.stringify(data.name)}) has no flags.${FLAG_SCOPE}.slug. `
      + "The slug is the upsert key; refusing the run rather than creating an unmatched Actor."
    );
  }

  return { data, items, expected, slug };
}

/**
 * The document data used for an UPDATE. Differs from the create payload in three places (§3, §12):
 *
 *   • `system.attributes.hp.value` is removed — writing it would heal a wounded token mid-session.
 *   • `img` / `prototypeToken.texture` are already gone (see `preparePayload`).
 *   • `flags.pentaryn.contentHash` is withheld until the write has been verified, so that a run
 *     which dies half-way does not leave behind a "current" marker on an actor whose Items never
 *     got created. The hash is stamped last, by `stampContentHash`.
 *
 * @param {object} data  Output of `preparePayload().data`.
 * @returns {object}
 */
function toUpdatePayload(data) {
  const payload = toCreatePayload(data);
  if (payload.system?.attributes?.hp) delete payload.system.attributes.hp.value;
  return payload;
}

/**
 * The document data used for a CREATE: everything, minus the content hash (stamped last).
 * @param {object} data
 * @returns {object}
 */
function toCreatePayload(data) {
  const payload = cloneJson(data);
  if (payload.flags?.[FLAG_SCOPE]) delete payload.flags[FLAG_SCOPE].contentHash;
  return payload;
}

/* -------------------------------------------------------------------------------------------- */
/*  Assertions (CONTRACT.md §8)                                                                   */
/* -------------------------------------------------------------------------------------------- */

/**
 * §8.2 rules 5 and 6.
 *   • numbers  — strict `===` after `Number()` coercion, no epsilon
 *   • booleans — strict `===`
 *   • null     — matches null or undefined
 *   • strings  — whitespace-normalised equality
 * @param {*} expected
 * @param {*} actual
 * @returns {boolean}
 */
function valuesMatch(expected, actual) {
  if (typeof expected === "number") {
    const n = Number(actual);
    return Number.isFinite(n) && (n === expected);
  }
  if (typeof expected === "boolean") return actual === expected;
  if (expected === null) return (actual === null) || (actual === undefined);
  if (actual === undefined) return false;
  return normalise(actual) === normalise(expected);
}

/**
 * Build the standard, fully-identifying assertion failure message (§8.3).
 * @param {object} ctx
 * @returns {string}
 */
function assertionMessage({ slug, action, activityId, path, expected, actual, hint }) {
  const where = [
    `actor "${slug}"`,
    action ? `item "${action}"` : null,
    activityId ? `activity ${activityId}` : null
  ].filter(Boolean).join(" → ");
  return [
    "READBACK ASSERTION FAILED — aborting the whole run.",
    `  where:    ${where}`,
    `  path:     ${path}`,
    `  expected: ${JSON.stringify(expected)}`,
    `  actual:   ${JSON.stringify(actual)}`,
    hint ? `  hint:     ${hint}` : null
  ].filter(Boolean).join("\n");
}

export {
  FLAG_SCOPE, CONTRACT_ID, DEFAULT_TIMEOUT_MS, FORMULA_OK, FORMULA_GLOBS, FORMULA_PATTERNS,
  STRIPPED_KEYS, STRIPPED_ACTOR_KEYS, STRIPPED_ITEM_KEYS, PentarynError, PentarynAbort, PentarynAssertionError,
  isPlainObject, normalise, cloneJson, walkStrings, walkLeaves, getPath, indexBySlug, versionProblems, lintFormulas,
  preparePayload, toUpdatePayload, toCreatePayload, valuesMatch, assertionMessage,
};
