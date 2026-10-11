/**
 * pentaryn-importer — Stage 2 of the Pentaryn ⇄ Foundry pipeline: upserts the NPC Actors that
 * `scripts/foundry/build_actors.py` wrote to `actors.json`. Contract: `foundry/CONTRACT.md`.
 * The design note (silent failure modes, the `flags.pentaryn` scope, API citations) heads
 * importer-core.mjs.
 *
 * Files:
 *   importer-core.mjs      PURE constants, error classes, lint, payload shaping, version-gate rules
 *   pentaryn-importer.mjs  this file: Foundry glue, the importer, the ready publish
 */

import {
  CONTRACT_ID, DEFAULT_TIMEOUT_MS, FLAG_SCOPE, MODULE, PentarynAbort, PentarynAssertionError,
  assertionMessage, isPlainObject, lintFormulas, normalise, preparePayload, toCreatePayload,
  toUpdatePayload, valuesMatch, versionProblems, walkLeaves
} from "./importer-core.mjs";

/* -------------------------------------------------------------------------------------------- */
/*  Logging                                                                                       */
/* -------------------------------------------------------------------------------------------- */

const TAG = `[${MODULE}]`;

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

/**
 * Shout, then throw: the one shape of every refusal and readback failure (items-journal-3).
 * @param {typeof PentarynAbort|typeof PentarynAssertionError} ErrorClass
 * @param {string} message
 * @returns {never}
 */
function refuse(ErrorClass, message) {
  shout(message);
  throw new ErrorClass(message);
}

/**
 * A readback assertion failure (§8.3): the standard message, shouted, as a PentarynAssertionError.
 * @param {object} ctx  `assertionMessage` fields
 * @returns {never}
 */
function failAssertion(ctx) {
  refuse(PentarynAssertionError, assertionMessage(ctx));
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
  const flags = game.modules.get(MODULE)?.flags?.[FLAG_SCOPE];
  if (!flags) {
    throw new PentarynAbort(
      `module.json is missing flags.${FLAG_SCOPE} — the installed copy of ${MODULE} is not the `
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
  const problems = versionProblems(manifest, expected, {
    systemId: game.system.id,
    systemVersion: game.system.version,
    generation: game.release.generation,
    version: game.version
  });

  if (problems.length) {
    const message = [
      "VERSION GATE FAILED — nothing was imported.",
      ...problems.map(p => `  • ${p}`)
    ].join("\n");
    refuse(PentarynAbort, message);
  }

  log(
    `version gate passed — contract ${CONTRACT_ID}, ${game.system.id} ${game.system.version}, `
    + `Foundry generation ${game.release.generation}`
  );
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
  refuse(PentarynAbort, message);
}

/**
 * @throws {PentarynAssertionError}
 */
function assertValue(ctx) {
  if (valuesMatch(ctx.expected, ctx.actual)) return;
  failAssertion(ctx);
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
    failAssertion({
      slug,
      path: `prototypeToken.${path}`,
      expected,
      actual,
      hint: (actual === undefined)
        ? "The key is absent from the saved document — Foundry STRIPPED it. Check the spelling "
          + "against PrototypeToken's accepted key set (CONTRACT.md §3.3)."
        : "Foundry accepted the key but stored a different value — check the field's type."
    });
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
  failAssertion({
    slug,
    action: foundry.utils.getProperty(requestedItemData, `flags.${FLAG_SCOPE}.action`),
    path: "system.activities",
    expected: requested,
    actual: [...live],
    hint: "Foundry regenerated the activity ids instead of honouring the supplied `_id`s "
      + "(CONTRACT.md U7). Every `expected` activity lookup is now unresolvable; §8.2 rule 3 must "
      + "switch to resolving activities by name."
  });
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
      failAssertion({
        slug,
        action,
        path: `flags.${FLAG_SCOPE}.action`,
        expected: action,
        actual: actor.items.map(i => foundry.utils.getProperty(i, `flags.${FLAG_SCOPE}.action`)),
        hint: "No embedded Item on the Actor carries this action flag."
      });
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
        failAssertion({
          slug,
          action,
          activityId: activitySpec.id,
          path: "system.activities",
          expected: activitySpec.id,
          actual: item.system.activities.map(a => a._id),
          hint: "Activity id not present on the saved Item — see CONTRACT.md U7."
        });
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
 * Count-checked on the way out. `createEmbeddedDocuments` returns only the documents that were
 * actually created: a payload Item that fails validation is dropped from the returned array
 * WITHOUT throwing, so `created.length < itemsData.length` is the silent-drop signature. Nothing
 * downstream catches it on its own — the `expected` blocks (§8) are deliberately not exhaustive,
 * so a dropped Item with no `expected` entry would otherwise sail through the whole run.
 *
 * @param {Actor} actor
 * @param {object[]} itemsData
 * @param {"keep"|"delete"} unmanagedItems
 * @param {string} slug
 * @returns {Promise<{deleted: number, created: number, unmanaged: string[]}>}
 * @throws {PentarynAssertionError} when Foundry created fewer Items than the payload asked for.
 */
async function replaceItems(actor, itemsData, unmanagedItems, slug) {
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

  if (created.length !== itemsData.length) {
    const requestedNames = itemsData.map(i => i.name);
    const createdNames = new Set(created.map(i => i.name));
    failAssertion({
      slug,
      path: "actor.items (createEmbeddedDocuments)",
      expected: `${itemsData.length} Item(s): ${requestedNames.join(", ")}`,
      actual: `${created.length} Item(s): ${[...createdNames].join(", ") || "none"}`,
      hint: "Foundry DROPPED " + (itemsData.length - created.length) + " Item(s) without raising. "
        + "Missing: " + (requestedNames.filter(n => !createdNames.has(n)).join(", ") || "(duplicate names — compare by index)")
        + ". Check the dropped Item's `type` and `system` against CONTRACT.md §3."
    });
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
    refuse(PentarynAbort, message);
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

      const itemResult = await replaceItems(actor, items, unmanagedItems, slug);
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
      // Every payload Item must be findable by its `flags.pentaryn.action`. `replaceItems` has
      // already proved the COUNT matches; this proves the IDENTITY does. The two failures it
      // separates: Foundry stripped `flags.pentaryn.action` (the item exists but is no longer
      // addressable, and the next run would treat it as hand-added and leave it behind), or the
      // generator emitted two rows with the same action name (count matches, one shadows the
      // other). Silently skipping — the old `if (liveItem)` — is the exact failure class this
      // module exists to catch.
      for (const itemData of items) {
        const action = foundry.utils.getProperty(itemData, `flags.${FLAG_SCOPE}.action`);
        const liveItem = (action === undefined)
          ? undefined
          : actor.items.find(i => foundry.utils.getProperty(i, `flags.${FLAG_SCOPE}.action`) === action);
        if (!liveItem) {
          failAssertion({
            slug,
            action: action ?? "(no flags.pentaryn.action in payload)",
            path: `flags.${FLAG_SCOPE}.action`,
            expected: action,
            actual: actor.items.map(i => foundry.utils.getProperty(i, `flags.${FLAG_SCOPE}.action`)),
            hint: (action === undefined)
              ? "The PAYLOAD item carries no `flags.pentaryn.action`. The generator must emit one on "
                + "every Item — it is the upsert key for the embedded-Item replace (CONTRACT.md §4.2)."
              : "Payload item has no matching embedded Item — it was dropped, or Foundry STRIPPED "
                + "`flags.pentaryn.action`. Either way the Item is unaddressable: the next run cannot "
                + "recognise it as managed and will leave it behind as hand-added."
          });
        }
        assertActivityIdsSurvived(liveItem, itemData, slug);
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
  // importer cannot remove it itself.
  //
  // Per CONTRACT.md §12 ("Deleting actors.json — who actually does it") the DELETING AGENT is
  // `make foundry-import`, which rm's the staged file after this call returns — whether or not
  // the import succeeded. What follows is the backstop for an import run by hand instead: a
  // machine-readable `deleteJson` block and a permanent toast. Do not mistake it for the
  // mechanism; if you got here without `make foundry-import`, run `make foundry-clean` now.
  const deleteJson = {
    required: !dryRun && !failed.length,
    path,
    url,
    note: "Foundry has no client-side file-delete API, so this module cannot remove the file. "
      + "`make foundry-import` deletes it for you (and `make foundry-clean` does it on its own). "
      + "Until then it is world-readable over the tunnel."
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
    moduleId: MODULE,
    contract: CONTRACT_ID,
    /** Exposed for tests and for hand-checking a file without importing it. */
    _internals: Object.freeze({ fetchJsonWithTimeout, lintFormulas, valuesMatch, normalise })
  });
  log(`ready — game.pentaryn.import() available (${CONTRACT_ID})`);
});
