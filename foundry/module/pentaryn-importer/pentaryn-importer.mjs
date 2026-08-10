/**
 * pentaryn-importer — Stage 2 of the Pentaryn ⇄ Foundry pipeline.
 *
 * Reads `foundry/build/actors.json` (produced by Stage 1, `scripts/foundry/build_actors.py`)
 * after `make foundry-sync` has copied it under `Data/worlds/<world>/`, and upserts the
 * described NPC Actors into the live world.
 *
 * The full data contract is `foundry/CONTRACT.md`. Section references (§n) below point at it.
 * The rationale for the pipeline shape is `playbooks/foundry-vtt.md` (D3, D8, D10).
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
 *                                     contract U7; `assertActivityIdsSurvived()` below checks it
 *                                     explicitly rather than trusting the reading.
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

/**
 * @throws {PentarynAssertionError}
 */
function assertValue(ctx) {
  if (valuesMatch(ctx.expected, ctx.actual)) return;
  const message = assertionMessage(ctx);
  shout(message);
  throw new PentarynAssertionError(message);
}

/**
 * The prototype-token check Gate 2 calls out separately: *"wrong defaults surface mid-session and
 * no other gate catches them."*
 *
 * This is a strip detector, not a value check — it compares every leaf we asked for against the
 * live document's SOURCE data (`toObject()`), not its prepared data. A silently-stripped key (the
 * classic `"vaule"` typo) shows up here as `undefined`, and a v14 type change (e.g. the
 * ArrayField → TypedObjectField move on `detectionModes`) shows up as a shape mismatch.
 *
 * PrototypeToken accepts only a fixed key set (Foundry `common/data/data.mjs`, class
 * PrototypeToken): name, displayName, actorLink, width, height, depth, texture, lockRotation,
 * rotation, alpha, disposition, displayBars, bar1, bar2, light, sight, detectionModes, occludable,
 * ring, turnMarker, movementAction, flags, randomImg, appendNumber, prependAdjective. Anything
 * else — x, y, elevation, _id, actorId, hidden, scale — is dropped without error.
 *
 * @param {Actor} actor
 * @param {object} requested  `prototypeToken` as it appeared in the payload.
 * @param {string} slug
 */
function assertPrototypeToken(actor, requested, slug) {
  if (!requested) return;
  const live = actor.prototypeToken.toObject();
  walkLeaves(requested, "", (path, expected) => {
    const actual = foundry.utils.getProperty(live, path);
    const bothArrays = Array.isArray(expected) && Array.isArray(actual);
    const ok = bothArrays
      ? (JSON.stringify(expected) === JSON.stringify(actual))
      : valuesMatch(expected, actual);
    if (ok) return;
    const message = assertionMessage({
      slug,
      path: `prototypeToken.${path}`,
      expected,
      actual,
      hint: (actual === undefined)
        ? "The key is absent from the saved document — Foundry STRIPPED it. Check the spelling "
          + "against PrototypeToken's accepted key set (CONTRACT.md §3.3)."
        : "Foundry accepted the key but stored a different value — check the field's type."
    });
    shout(message);
    throw new PentarynAssertionError(message);
  });
}

/**
 * Contract U7: confirm Foundry honoured the deterministic activity ids we supplied.
 *
 * If it did not, `ActivityCollection` (keyed by `entry._id`,
 * dnd5e module/data/fields/activities-field.mjs:99) will not contain them, every `expected`
 * activity lookup would fail with a confusing "not found", and §8.2 rule 3 would have to resolve
 * activities by name instead. Detect it here, once, with a message that says so.
 *
 * @param {Item} item
 * @param {object} requestedItemData
 * @param {string} slug
 */
function assertActivityIdsSurvived(item, requestedItemData, slug) {
  const requested = Object.keys(requestedItemData?.system?.activities ?? {});
  if (!requested.length) return;
  const live = new Set(item.system.activities.map(a => a._id));
  const missing = requested.filter(id => !live.has(id));
  if (!missing.length) return;
  const message = assertionMessage({
    slug,
    action: foundry.utils.getProperty(requestedItemData, `flags.${FLAG_SCOPE}.action`),
    path: "system.activities",
    expected: requested,
    actual: [...live],
    hint: "Foundry regenerated the activity ids instead of honouring the supplied `_id`s "
      + "(CONTRACT.md U7). Every `expected` activity lookup is now unresolvable; §8.2 rule 3 must "
      + "switch to resolving activities by name."
  });
  shout(message);
  throw new PentarynAssertionError(message);
}

/**
 * Run the whole `expected` block for one actor (§8).
 *
 * Assertions run against PREPARED documents (§8.2 rule 1), so the caller must have reset the
 * actor first. `item.system.activities` is an ActivityCollection, so `.get(id)` returns the
 * Activity with `.labels` populated by `prepareFinalData`.
 *
 * @param {Actor} actor
 * @param {object|null} expected
 * @param {string} slug
 * @returns {number} number of individual assertions checked
 */
function runExpectedAssertions(actor, expected, slug) {
  if (!expected) return 0;
  let checked = 0;

  // ── Actor-level paths ────────────────────────────────────────────────────────────────────────
  for (const [path, value] of Object.entries(expected.actor ?? {})) {
    assertValue({
      slug,
      path,
      expected: value,
      actual: foundry.utils.getProperty(actor, path),   // §8.2 rule 2
      hint: "Resolved with foundry.utils.getProperty against the prepared Actor."
    });
    checked++;
  }

  // ── Item-level ───────────────────────────────────────────────────────────────────────────────
  for (const spec of expected.items ?? []) {
    const action = spec.action;
    const item = actor.items.find(i => foundry.utils.getProperty(i, `flags.${FLAG_SCOPE}.action`) === action);
    if (!item) {
      const message = assertionMessage({
        slug,
        action,
        path: `flags.${FLAG_SCOPE}.action`,
        expected: action,
        actual: actor.items.map(i => foundry.utils.getProperty(i, `flags.${FLAG_SCOPE}.action`)),
        hint: "No embedded Item on the Actor carries this action flag."
      });
      shout(message);
      throw new PentarynAssertionError(message);
    }

    if ("itemType" in spec) {
      assertValue({ slug, action, path: "type", expected: spec.itemType, actual: item.type });
      checked++;
    }

    // §8.2 rule 4 — `item.labels`, where UsesField writes `recharge` and `recovery`
    // (dnd5e module/data/shared/uses-field.mjs:53,60).
    for (const [key, value] of Object.entries(spec.itemLabels ?? {})) {
      assertValue({
        slug,
        action,
        path: `labels.${key}`,
        expected: value,
        actual: foundry.utils.getProperty(item.labels ?? {}, key)
      });
      checked++;
    }

    // Forward-safety: any other SCALAR key on the spec is treated as a path against the Item, so
    // a future contract revision can add item-level assertions without a code change. Non-scalars
    // are ignored rather than stringified into a misleading comparison.
    for (const [key, value] of Object.entries(spec)) {
      if (["action", "itemType", "itemLabels", "activities"].includes(key)) continue;
      if (isPlainObject(value) || Array.isArray(value)) {
        warn(`${slug} → ${action}: ignoring non-scalar expectation "${key}" (unsupported shape)`);
        continue;
      }
      assertValue({ slug, action, path: key, expected: value, actual: foundry.utils.getProperty(item, key) });
      checked++;
    }

    // ── Activity-level ─────────────────────────────────────────────────────────────────────────
    for (const activitySpec of spec.activities ?? []) {
      const activity = item.system.activities.get(activitySpec.id);   // §8.2 rule 3
      if (!activity) {
        const message = assertionMessage({
          slug,
          action,
          activityId: activitySpec.id,
          path: "system.activities",
          expected: activitySpec.id,
          actual: item.system.activities.map(a => a._id),
          hint: "Activity id not present on the saved Item — see CONTRACT.md U7."
        });
        shout(message);
        throw new PentarynAssertionError(message);
      }
      for (const [path, value] of Object.entries(activitySpec)) {
        if (path === "id") continue;                     // the lookup key, not an assertion
        assertValue({
          slug,
          action,
          activityId: activitySpec.id,
          path,
          expected: value,
          actual: foundry.utils.getProperty(activity, path),
          hint: path.startsWith("labels.")
            ? "This is the label the sheet and chat card display. A mismatch on labels.toHit "
              + "usually means attack.flat was not honoured and ability mod + proficiency stacked "
              + "on top of the pre-baked bonus."
            : undefined
        });
        checked++;
      }
    }
  }

  return checked;
}

/* -------------------------------------------------------------------------------------------- */
/*  Document writes                                                                               */
/* -------------------------------------------------------------------------------------------- */

/**
 * Find the Actor this slug owns.
 *
 * NOT `getFlag` — see the header note: `Document#getFlag` throws for a scope that is not an
 * active package id, and "pentaryn" is not this module's id.
 *
 * @param {string} slug
 * @returns {Actor|undefined}
 */
function findActorBySlug(slug) {
  return game.actors.find(a => foundry.utils.getProperty(a, `flags.${FLAG_SCOPE}.slug`) === slug);
}

/** @param {Document} doc @returns {string|undefined} */
const storedHash = doc => foundry.utils.getProperty(doc, `flags.${FLAG_SCOPE}.contentHash`);

/** Items this module owns, i.e. ones it created and may therefore delete. */
const isManagedItem = item => foundry.utils.getProperty(item, `flags.${FLAG_SCOPE}.action`) !== undefined;

/**
 * Replace the Actor's managed embedded Items.
 *
 * The Actor is NEVER deleted and recreated — token documents on scenes hold the Actor id, and
 * recreating orphans every placed token (playbook, Stage 2). Items are cheap and hold no external
 * references, so they are wholesale replaced rather than diffed.
 *
 * Items the GM added by hand (no `flags.pentaryn.action`) are left alone by default. CONTRACT.md
 * §4.2 says the embedded Item set is replaced "wholesale"; in practice that only ever means the
 * generated set, because a freshly created Actor has no others. Pass
 * `unmanagedItems: "delete"` to take the literal reading.
 *
 * @param {Actor} actor
 * @param {object[]} itemsData
 * @param {"keep"|"delete"} unmanagedItems
 * @returns {Promise<{deleted: number, created: number, unmanaged: string[]}>}
 */
async function replaceItems(actor, itemsData, unmanagedItems) {
  const managed = actor.items.filter(isManagedItem);
  const unmanaged = actor.items.filter(i => !isManagedItem(i));

  const toDelete = (unmanagedItems === "delete") ? [...managed, ...unmanaged] : managed;
  if (toDelete.length) {
    await actor.deleteEmbeddedDocuments("Item", toDelete.map(i => i.id), { render: false });
  }

  let created = [];
  if (itemsData.length) {
    created = await actor.createEmbeddedDocuments("Item", itemsData, { render: false, keepId: false });
  }

  return {
    deleted: toDelete.length,
    created: created.length,
    unmanaged: (unmanagedItems === "delete") ? [] : unmanaged.map(i => i.name)
  };
}

/**
 * Stamp `flags.pentaryn.contentHash` — the last write for an actor, and only once every item has
 * been created and every assertion has passed.
 *
 * Doing it last is what makes an interrupted run safe: an actor whose Items failed half-way keeps
 * its previous (or absent) hash and is retried on the next run, instead of being skipped forever
 * because it was marked current before it was finished.
 *
 * This partial write is safe — it does NOT clobber the sibling keys under `flags.pentaryn`.
 * Verified: `flags` is a `DocumentFlagsField extends TypedObjectField`, whose `_updateDiff`
 * (common/data/fields.mjs:2174) recurses one level and delegates to its element field; the element
 * is an `ObjectField`, whose own `_updateDiff` (common/data/fields.mjs:1937-1966) does
 * `mergeObject(state.source[key], diff)` rather than assigning. So `slug`, `sources`,
 * `primarySource` and friends survive. (Note the corollary: a key removed by a later contract
 * revision would linger in `flags.pentaryn` until the Actor is rebuilt.)
 *
 * @param {Actor} actor
 * @param {string} hash
 */
async function stampContentHash(actor, hash) {
  if (!hash) return;
  await actor.update({ flags: { [FLAG_SCOPE]: { contentHash: hash } } }, { render: false });
}

/* -------------------------------------------------------------------------------------------- */
/*  The importer                                                                                  */
/* -------------------------------------------------------------------------------------------- */

/**
 * @typedef {object} ImportOptions
 * @property {string}  [path]            Data-relative path to actors.json. Defaults to
 *                                       `worlds/<world id>/actors.json`.
 * @property {boolean} [dryRun=false]    Gate, lint and report; write nothing.
 * @property {string[]}[only]            Restrict to these slugs (Gate 2's "import one NPC").
 * @property {boolean} [force=false]     Ignore contentHash and rewrite every selected actor.
 * @property {number}  [timeout=15000]   Fetch timeout in milliseconds.
 * @property {"keep"|"delete"} [unmanagedItems="keep"]  What to do with hand-added Items.
 */

/**
 * @typedef {object} ImportResult
 * @property {boolean} ok
 * @property {string}  path
 * @property {string}  url
 * @property {boolean} dryRun
 * @property {object}  manifest          generatorVersion / generatedAt / sourceRevision.
 * @property {object}  counts            {total, selected, created, updated, skipped, failed, assertions}
 * @property {string[]}created
 * @property {string[]}updated
 * @property {string[]}skipped
 * @property {{slug: string, error: string}[]} failed
 * @property {{required: boolean, path: string, url: string, note: string}} deleteJson
 */

/**
 * Import (upsert) the NPC Actors described by `actors.json`.
 *
 * Order of operations — every step is a gate for the next:
 *
 *   1. GM check
 *   2. fetch with `{cache: "no-cache"}` and a hard timeout
 *   3. version gate (§1.1) — refuse the whole run on any mismatch
 *   4. `@ref` lint (§10)   — refuse the whole run on any hit
 *   5. per actor: skip on unchanged contentHash, else create-or-update, replace Items,
 *      re-prepare, assert, then stamp the hash
 *   6. summary + the "now delete the JSON" flag
 *
 * @param {ImportOptions} [options]
 * @returns {Promise<ImportResult>}
 */
async function importActors(options = {}) {
  const {
    path = `worlds/${game.world.id}/actors.json`,
    dryRun = false,
    only = null,
    force = false,
    timeout = DEFAULT_TIMEOUT_MS,
    unmanagedItems = "keep"
  } = options;

  if (!game.user?.isGM) {
    const message = "Refusing to import: only a GM can create or update world Actors.";
    shout(message);
    throw new PentarynAbort(message);
  }
  if (!["keep", "delete"].includes(unmanagedItems)) {
    throw new PentarynAbort(`unmanagedItems must be "keep" or "delete", got ${JSON.stringify(unmanagedItems)}`);
  }

  const url = foundry.utils.getRoute(path);
  log(`fetching ${url} (cache: no-cache, timeout ${timeout} ms)`);

  // 2 ────────────────────────────────────────────────────────────────────────────────────────────
  const manifest = await fetchJsonWithTimeout(path, { cache: "no-cache", timeout });

  // 3 ────────────────────────────────────────────────────────────────────────────────────────────
  assertVersionGate(manifest);

  // 4 ────────────────────────────────────────────────────────────────────────────────────────────
  assertNoBadFormulas(manifest.actors);

  log(
    `manifest ok — generator ${manifest.generator}@${manifest.generatorVersion}, `
    + `built ${manifest.generatedAt} from ${manifest.sourceRevision}, `
    + `${manifest.actors.length} actor(s), ${manifest.skipped?.length ?? 0} skipped row(s)`
  );

  const onlySet = only ? new Set(only) : null;
  const created = [];
  const updated = [];
  const skipped = [];
  const failed = [];
  let assertions = 0;
  let selected = 0;

  const ActorClass = getDocumentClass("Actor");

  for (const entry of manifest.actors) {
    /** @type {ReturnType<typeof preparePayload>} */
    let prepared;
    try {
      prepared = preparePayload(entry);
    } catch (cause) {
      // A malformed entry is a contract violation, not a per-actor hiccup.
      shout(cause.message);
      throw cause;
    }

    const { data, items, expected, slug } = prepared;
    if (onlySet && !onlySet.has(slug)) continue;
    selected++;

    const incomingHash = foundry.utils.getProperty(entry, `flags.${FLAG_SCOPE}.contentHash`);

    try {
      const existing = findActorBySlug(slug);

      // ── skip on unchanged content (§9.2) ─────────────────────────────────────────────────────
      // Two strings compared. The module never recomputes the hash: a canonical-JSON
      // implementation in both Python and JS would disagree (json.dumps(1.0) === "1.0" vs
      // JSON.stringify(1.0) === "1", and prototypeToken.width is 0.5 for tiny creatures), which
      // would present as "every actor always differs" and silently destroy idempotence.
      if (existing && !force && incomingHash && (storedHash(existing) === incomingHash)) {
        skipped.push(slug);
        log(`skip   ${slug} — contentHash unchanged (${incomingHash.slice(0, 20)}…)`);
        continue;
      }

      if (dryRun) {
        (existing ? updated : created).push(slug);
        log(`dry-run ${existing ? "would update" : "would create"} ${slug} (${items.length} item(s))`);
        continue;
      }

      let actor = existing;
      if (actor) {
        // UPDATE — never recreate. `hp.value`, `img` and `prototypeToken.texture` are withheld.
        await actor.update(toUpdatePayload(data), { render: false });
        updated.push(slug);
      } else {
        actor = await ActorClass.create(toCreatePayload(data), { renderSheet: false });
        if (!actor) throw new Error("Actor.create returned nothing");
        created.push(slug);
      }

      const itemResult = await replaceItems(actor, items, unmanagedItems);
      if (itemResult.unmanaged.length) {
        warn(
          `${slug}: left ${itemResult.unmanaged.length} hand-added Item(s) in place `
          + `(${itemResult.unmanaged.join(", ")}). Pass unmanagedItems:"delete" to remove them.`
        );
      }

      // Re-prepare before reading anything back (§8.2 rule 1). `reset()` → `_initialize()` →
      // `_safePrepareData()`, which repopulates every `.labels` we are about to assert on.
      actor.reset();

      // Strip detection on the two structures Foundry is most likely to quietly mangle.
      assertPrototypeToken(actor, data.prototypeToken, slug);
      for (const itemData of items) {
        const action = foundry.utils.getProperty(itemData, `flags.${FLAG_SCOPE}.action`);
        const liveItem = actor.items.find(i => foundry.utils.getProperty(i, `flags.${FLAG_SCOPE}.action`) === action);
        if (liveItem) assertActivityIdsSurvived(liveItem, itemData, slug);
      }

      // The contract's own expectations (§8) — displayed labels, not recomputed maths.
      assertions += runExpectedAssertions(actor, expected, slug);

      // Only now is the actor allowed to be marked current.
      await stampContentHash(actor, incomingHash);

      log(
        `${existing ? "update" : "create"} ${slug} — ${itemResult.created} item(s) written, `
        + `${itemResult.deleted} replaced`
      );
    } catch (cause) {
      // §8.3: a ValidationError on one actor must not abort the run; an ASSERTION failure must.
      if (cause instanceof PentarynAssertionError) throw cause;
      if (cause instanceof PentarynAbort) throw cause;
      failed.push({ slug, error: cause?.message ?? String(cause) });
      err(`FAILED ${slug}:`, cause);
    }
  }

  const counts = {
    total: manifest.actors.length,
    selected,
    created: created.length,
    updated: updated.length,
    skipped: skipped.length,
    failed: failed.length,
    assertions
  };

  reportSummary({ counts, created, updated, skipped, failed, dryRun, url, manifest });

  // §12 / playbook Stage 2: Data/ is served over HTTP with no authentication and is public while
  // the tunnel is up. Foundry's client API has no file-delete (FilePicker exposes only browse,
  // upload, createDirectory and configurePath — client/applications/apps/file-picker.mjs), so the
  // importer cannot remove it itself. It reports the fact instead, and `make foundry-import` does
  // the deletion.
  const deleteJson = {
    required: !dryRun && !failed.length,
    path,
    url,
    note: "Foundry has no client-side file-delete API. Delete this file from Data/ now — it is "
      + "world-readable over the tunnel. `make foundry-import` does it for you."
  };
  if (deleteJson.required) {
    warn(`DELETE THIS NOW: Data/${path} is public while the tunnel is up.`);
    ui.notifications?.warn(`${TAG} Import done. Delete Data/${path} — it is served publicly.`, { permanent: true });
  }

  return {
    ok: !failed.length,
    path,
    url,
    dryRun,
    manifest: {
      generator: manifest.generator,
      generatorVersion: manifest.generatorVersion,
      generatedAt: manifest.generatedAt,
      sourceRevision: manifest.sourceRevision,
      skippedRows: manifest.skipped?.length ?? 0
    },
    counts,
    created,
    updated,
    skipped,
    failed,
    deleteJson
  };
}

/**
 * One clear block in the console. Deliberately `console.log`, not a UI — the playbook's Stage 2
 * brief is "no UI".
 * @param {object} report
 */
function reportSummary({ counts, created, updated, skipped, failed, dryRun, url, manifest }) {
  const title = `${TAG} ${dryRun ? "DRY RUN" : "import"} — `
    + `${counts.created} created · ${counts.updated} updated · ${counts.skipped} skipped · `
    + `${counts.failed} failed`;

  console.group(title);
  console.log(`source        ${url}`);
  console.log(`generator     ${manifest.generator}@${manifest.generatorVersion}`);
  console.log(`built         ${manifest.generatedAt}  (${manifest.sourceRevision})`);
  console.log(`actors        ${counts.selected} selected of ${counts.total} in file`);
  console.log(`assertions    ${counts.assertions} checked, all passed`);
  if (created.length) console.log("created      ", created.join(", "));
  if (updated.length) console.log("updated      ", updated.join(", "));
  if (skipped.length) console.log("skipped      ", skipped.join(", "), "(contentHash unchanged)");
  if (failed.length) {
    console.warn("failed       ", failed.length);
    console.table(failed);
  }
  console.groupEnd();

  if (failed.length) {
    ui.notifications?.warn(
      `${TAG} ${counts.failed} actor(s) failed — see the console for the per-slug report.`,
      { permanent: true }
    );
  } else if (!dryRun) {
    ui.notifications?.info(
      `${TAG} ${counts.created} created, ${counts.updated} updated, ${counts.skipped} unchanged.`
    );
  }
}

/* -------------------------------------------------------------------------------------------- */
/*  Registration                                                                                  */
/* -------------------------------------------------------------------------------------------- */

Hooks.once("ready", () => {
  game.pentaryn = Object.freeze({
    /** @type {typeof importActors} */
    import: importActors,
    moduleId: MODULE_ID,
    contract: CONTRACT_ID,
    /** Exposed for tests and for hand-checking a file without importing it. */
    _internals: Object.freeze({ fetchJsonWithTimeout, lintFormulas, valuesMatch, normalise })
  });
  log(`ready — game.pentaryn.import() available (${CONTRACT_ID})`);
});
