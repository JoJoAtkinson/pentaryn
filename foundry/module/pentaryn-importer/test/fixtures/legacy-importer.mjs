/**
 * The oracle (guide step 1.3): a VERBATIM copy of pentaryn-importer.mjs snapshot lines 103–617
 * (constants, error classes, logging, utilities, fetch, version gate, lint, payload preparation,
 * valuesMatch, assertionMessage), plus the export list at the bottom. Never edit the copied block —
 * it is what core.test proves the extracted core against (step 2 appends the core to impls.mjs).
 *
 * The only addition is the preamble: the copied code calls `foundry.utils.getProperty` at :474 and
 * :532 on plain JSON. So that this file loads with no Foundry globals, a module-local `foundry` holds
 * Foundry's own `getProperty`, pasted verbatim from Foundry 14.369 `common/utils/helpers.mjs:826-838`.
 * glue.test proves the live `_internals.lintFormulas` (real Foundry utils) agrees with this oracle.
 */

/* ── preamble: Foundry 14.369 common/utils/helpers.mjs:826-838, verbatim ── */
export function getProperty(object, key) {
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
const foundry = { utils: { getProperty } };

/* ── pentaryn-importer.mjs snapshot :103–617, verbatim ── */

const MODULE_ID = "pentaryn-importer";

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
const STRIPPED_ACTOR_KEYS = ["expected", "_id", "img", "folder", "_stats", "ownership"];
const STRIPPED_ITEM_KEYS = ["expected", "_id", "img", "folder", "_stats", "ownership"];

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
 */
class PentarynAbort extends PentarynError {
  constructor(message) {
    super(message);
    this.name = "PentarynAbort";
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
/*  Logging                                                                                       */
/* -------------------------------------------------------------------------------------------- */

const TAG = `[${MODULE_ID}]`;

const log = (...args) => console.log(TAG, ...args);
const warn = (...args) => console.warn(TAG, ...args);
const err = (...args) => console.error(TAG, ...args);

/**
 * A refusal the GM cannot miss: permanent toast plus a console error.
 * `escape: false` is NOT used — messages can contain user data, so let Foundry escape them.
 * @param {string} message
 */
function shout(message) {
  err(message);
  ui.notifications?.error(`${TAG} ${message}`, { permanent: true, console: false });
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
 * Deep-clone plain JSON. `foundry.utils.deepClone` handles this, but the payload is pure JSON so
 * structuredClone is both faster and free of Foundry's special-casing.
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

/* -------------------------------------------------------------------------------------------- */
/*  Fetch                                                                                         */
/* -------------------------------------------------------------------------------------------- */

/**
 * Fetch JSON from a Data-relative path, with a hard timeout and cache defeated.
 *
 * `{cache: "no-cache"}` is not optional garnish. Foundry's express layer serves `Data/` through
 * `express.static`, which sets ETag / Last-Modified. Without `no-cache` the browser will happily
 * serve the *previous* build's `actors.json` from memory cache and the import "succeeds" against
 * stale content — one of the silent failure modes this stage exists to prevent.
 *
 * @param {string} path                      Data-relative path, e.g. "worlds/ardenhaven/actors.json".
 * @param {object} [init]                    Passed through to `fetch`; `cache` defaults to "no-cache".
 * @param {number} [init.timeout=15000]      Abort after this many milliseconds.
 * @returns {Promise<object>}                The parsed JSON.
 * @throws {PentarynAbort}                   On timeout, network failure, non-2xx, or non-JSON.
 */
async function fetchJsonWithTimeout(path, { timeout = DEFAULT_TIMEOUT_MS, ...init } = {}) {
  const url = foundry.utils.getRoute(path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(url, { cache: "no-cache", ...init, signal: controller.signal });
  } catch (cause) {
    if (cause?.name === "AbortError") {
      throw new PentarynAbort(`Timed out after ${timeout} ms fetching ${url}`);
    }
    throw new PentarynAbort(`Network error fetching ${url}: ${cause?.message ?? cause}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new PentarynAbort(
      `HTTP ${response.status} ${response.statusText} for ${url}. `
      + "Is the file under Data/? Run `make foundry-sync` first."
    );
  }

  // Read as text first: a miss under express.static can fall through to Foundry's HTML routes and
  // return 200 with a page body. `response.json()` would give an unhelpful parse error.
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new PentarynAbort(
      `${url} did not contain JSON (${cause.message}). First 120 characters: `
      + `${JSON.stringify(text.slice(0, 120))}`
    );
  }
}

/* -------------------------------------------------------------------------------------------- */
/*  Version gate (CONTRACT.md §1.1)                                                               */
/* -------------------------------------------------------------------------------------------- */

/**
 * The module's own declared expectations, from `module.json` → `flags.pentaryn`.
 * Gating against these as well as against the live game catches a stale module copy in
 * `Data/modules/` — `make foundry-sync` copies rather than symlinks (playbook D8), so staleness
 * is a real and otherwise invisible failure.
 * @returns {{contract: string, targetSystem: string, targetSystemVersion: string, generation: number}}
 */
function moduleExpectations() {
  const flags = game.modules.get(MODULE_ID)?.flags?.[FLAG_SCOPE];
  if (!flags) {
    throw new PentarynAbort(
      `module.json is missing flags.${FLAG_SCOPE} — the installed copy of ${MODULE_ID} is not the `
      + "one this code was shipped with. Re-run `make foundry-sync`."
    );
  }
  return flags;
}

/**
 * Refuse loudly unless the JSON, the module and the live game all agree (§1.1).
 *
 * This is a gate, not a warning. Every mismatch is listed at once so one round trip fixes them
 * all, and nothing is imported — not even a subset.
 *
 * @param {object} manifest  The parsed top level of actors.json.
 * @throws {PentarynAbort}
 */
function assertVersionGate(manifest) {
  const expected = moduleExpectations();
  const liveSystemMinor = String(game.system.version).split(".").slice(0, 2).join(".");
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
  if (manifest?.targetSystem !== game.system.id) {
    problems.push(
      `targetSystem is ${JSON.stringify(manifest?.targetSystem)} but this world runs `
      + `${JSON.stringify(game.system.id)}.`
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
      + `${game.system.id} is ${game.system.version} (major.minor ${liveSystemMinor}). `
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
  if (manifest?.generation !== game.release.generation) {
    problems.push(
      `generation is ${JSON.stringify(manifest?.generation)} but this Foundry is generation `
      + `${game.release.generation} (${game.version}).`
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

  if (problems.length) {
    const message = [
      "VERSION GATE FAILED — nothing was imported.",
      ...problems.map(p => `  • ${p}`)
    ].join("\n");
    shout(message);
    throw new PentarynAbort(message);
  }

  log(
    `version gate passed — contract ${CONTRACT_ID}, ${game.system.id} ${game.system.version}, `
    + `Foundry generation ${game.release.generation}`
  );
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
    const slug = foundry.utils.getProperty(actor, `flags.${FLAG_SCOPE}.slug`) ?? actor?.name ?? "<unnamed>";
    walkStrings(actor, "", (path, value) => {
      if (!FORMULA_PATTERNS.some(pattern => pattern.test(path))) return;
      if (FORMULA_OK.test(value)) return;
      hits.push({ slug, path, value });
    });
  }
  return hits;
}

/**
 * @param {object[]} actors
 * @throws {PentarynAbort} on the first non-empty lint result — the whole run is refused.
 */
function assertNoBadFormulas(actors) {
  const hits = lintFormulas(actors);
  if (!hits.length) {
    log(`@ref lint clean across ${actors.length} actor(s)`);
    return;
  }
  const message = [
    `@ref LINT FAILED — ${hits.length} formula field(s) contain something other than digits, dice `
    + "and arithmetic. dnd5e would accept these at validation and roll them as ZERO. "
    + "Nothing was imported.",
    ...hits.map(h => `  • ${h.slug} → ${h.path} = ${JSON.stringify(h.value)}`)
  ].join("\n");
  shout(message);
  throw new PentarynAbort(message);
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

  const slug = foundry.utils.getProperty(data, `flags.${FLAG_SCOPE}.slug`);
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
  const payload = cloneJson(data);
  if (payload.system?.attributes?.hp) delete payload.system.attributes.hp.value;
  if (payload.flags?.[FLAG_SCOPE]) delete payload.flags[FLAG_SCOPE].contentHash;
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

/* ── exports (not part of the snapshot) ── */
export {
  MODULE_ID, FLAG_SCOPE, CONTRACT_ID, DEFAULT_TIMEOUT_MS, FORMULA_OK, FORMULA_GLOBS, FORMULA_PATTERNS,
  STRIPPED_ACTOR_KEYS, STRIPPED_ITEM_KEYS, PentarynError, PentarynAbort, PentarynAssertionError,
  isPlainObject, normalise, cloneJson, walkStrings, walkLeaves, lintFormulas, preparePayload,
  toUpdatePayload, toCreatePayload, valuesMatch, assertionMessage,
};
