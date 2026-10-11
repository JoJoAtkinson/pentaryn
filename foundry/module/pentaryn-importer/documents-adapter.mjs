/**
 * pentaryn-importer — ADAPTER: everything that touches Foundry on the importer's behalf. The fetch
 * of actors.json, the module's own expectations (module.json `flags.pentaryn`), the version gate and
 * lint refusals (toast + throw), the readback assertions against live Documents, the Actor/Item
 * writes and the console summary. Pure rules come from importer-core.mjs; the orchestrator that
 * calls these in order is api.mjs `importActors`.
 *
 * Document reads here keep `foundry.utils.getProperty` (it walks live Documents); the core's
 * `getPath` is for the manifest's plain JSON only.
 */

import {
  CONTRACT_ID, DEFAULT_TIMEOUT_MS, FLAG_SCOPE, MODULE, PentarynAbort, PentarynAssertionError,
  assertionMessage, isPlainObject, lintFormulas, valuesMatch, versionProblems, walkLeaves
} from "./importer-core.mjs";
import { makeLog } from "./lib/log.mjs";

/* -------------------------------------------------------------------------------------------- */
/*  Logging                                                                                       */
/* -------------------------------------------------------------------------------------------- */

/**
 * The toast prefix. Toasts keep `[pentaryn-importer] …` byte-identical; console lines go through the
 * kit logger as `pentaryn-importer | …` ([declared] D-I2, console only).
 */
const TAG = `[${MODULE}]`;

/**
 * The kit logger writes `log.info` through `console.info`; the importer has always logged its
 * progress at `console.log` level, so its sink maps info → log. Looked up on every call (never
 * cached), so a console that is swapped later is still the one written to.
 */
const sink = new Proxy(globalThis.console, { get: (c, key) => (key === "info" ? c.log : c[key]) });

/** The module's one logger: `log.info` / `log.warn` / `log.error`, each line `pentaryn-importer | …`. */
const log = makeLog(MODULE, { console: sink });

/**
 * A refusal the GM cannot miss: permanent toast plus a console error.
 * `escape: false` is NOT used — messages can contain user data, so let Foundry escape them.
 * @param {string} message
 */
function shout(message) {
  log.error(message);
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
 * `Data/modules/` — `make foundry-sync` copies rather than symlinks (D8 in
 * context/plans/foundry-content-pipeline.md), so staleness is a real and otherwise invisible failure.
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

  log.info(
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
    log.info(`@ref lint clean across ${actors.length} actor(s)`);
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
        log.warn(`${slug} → ${action}: ignoring non-scalar expectation "${key}" (unsupported shape)`);
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
 * recreating orphans every placed token (Stage 2 of context/plans/foundry-content-pipeline.md).
 * Items are cheap and hold no external references, so they are wholesale replaced, not diffed.
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

/**
 * One clear block in the console. Deliberately the console, not a UI: the Stage 2 brief in
 * context/plans/foundry-content-pipeline.md is "no UI".
 * @param {object} report
 */
function reportSummary({ counts, created, updated, skipped, failed, dryRun, url, manifest }) {
  const title = `${MODULE} | ${dryRun ? "DRY RUN" : "import"} — `
    + `${counts.created} created · ${counts.updated} updated · ${counts.skipped} skipped · `
    + `${counts.failed} failed`;

  console.group(title);
  log.info(`source        ${url}`);
  log.info(`generator     ${manifest.generator}@${manifest.generatorVersion}`);
  log.info(`built         ${manifest.generatedAt}  (${manifest.sourceRevision})`);
  log.info(`actors        ${counts.selected} selected of ${counts.total} in file`);
  log.info(`assertions    ${counts.assertions} checked, all passed`);
  if (created.length) log.info("created      ", created.join(", "));
  if (updated.length) log.info("updated      ", updated.join(", "));
  if (skipped.length) log.info("skipped      ", skipped.join(", "), "(contentHash unchanged)");
  if (failed.length) {
    log.warn("failed       ", failed.length);
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

export {
  TAG, log, shout, refuse, failAssertion, fetchJsonWithTimeout, moduleExpectations,
  assertVersionGate, assertNoBadFormulas, assertValue, assertPrototypeToken, assertActivityIdsSurvived,
  runExpectedAssertions, findActorBySlug, storedHash, isManagedItem, replaceItems, stampContentHash,
  reportSummary
};
