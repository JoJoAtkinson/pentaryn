/**
 * pentaryn-importer — API: `importActors`, the orchestrator behind `game.pentaryn.import()`, and
 * the kit-built API (`buildApiFor`). Every step of an import is a gate for the next; the gates and
 * writes themselves are in documents-adapter.mjs, the pure rules in importer-core.mjs.
 */

import {
  CONTRACT_ID, DEFAULT_TIMEOUT_MS, FLAG_SCOPE, GATE_KEYS, HOOKS, MODULE, NS, PentarynAbort,
  PentarynAssertionError, idForSlug, isPlainObject, lintFormulas, normalise, preparePayload, toCreatePayload, toUpdatePayload,
  valuesMatch
} from "./importer-core.mjs";
import {
  TAG, assertItemsAddressable, assertNoBadFormulas, assertPrototypeToken, assertVersionGate,
  fetchJsonWithTimeout, indexActorsBySlug, log, refuse, replaceItems, reportSummary,
  runExpectedAssertions, shout, stampContentHash, storedHash
} from "./documents-adapter.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { buildApi } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";

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
 * @property {object}  manifest          { generator, generatorVersion, generatedAt, sourceRevision, skippedRows }
 * @property {object}  counts            {total, selected, created, updated, skipped, failed, assertions}
 * @property {string[]}created
 * @property {string[]}updated
 * @property {string[]}skipped
 * @property {{slug: string, error: string}[]} failed
 * @property {{required: boolean, path: string, url: string, note: string}} deleteJson
 */

/** True while an `importActors` call is in flight on this client. */
let running = false;

/**
 * Import (upsert) the NPC Actors described by `actors.json`.
 *
 * Order of operations — every step is a gate for the next:
 *
 *   1. GM check; refuse a second call while one is running
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
export async function importActors(options = {}) {
  const {
    path = `worlds/${game.world.id}/actors.json`,
    dryRun = false,
    only = null,
    force = false,
    timeout = DEFAULT_TIMEOUT_MS,
    unmanagedItems = "keep"
  } = options ?? {};   // import(null) is import({}) (importer-R3)

  if (!game.user?.isGM) {
    const message = "Refusing to import: only a GM can create or update world Actors.";
    refuse(PentarynAbort, message, "NOT_GM");
  }
  // Not re-entrant (items-journal-4): a second call while one is awaiting would read the same stored
  // contentHash and replace the same managed Items. Refused, not queued; per tab (module scope).
  // Across tabs, a new slug's create is made idempotent instead (importer-AC-2, below).
  if (running) throw new PentarynAbort("An import is already running; await it or reload.", "CONFLICT");
  running = true;
  try {
    return await importOnce({ path, dryRun, only, force, timeout, unmanagedItems });
  } finally {
    running = false;
  }
}

/**
 * `preparePayload`, shouting its refusal once before rethrowing it: a malformed entry is a contract
 * violation, not a per-actor hiccup.
 * @param {*} entry  One element of `manifest.actors`.
 * @returns {ReturnType<typeof preparePayload>}
 */
function prepareOrShout(entry) {
  try {
    return preparePayload(entry);
  } catch (cause) {
    shout(cause.message);
    throw cause;
  }
}

/** A received option value for a BAD_ARGS message: JSON where it is faithful, else String (NaN, undefined). */
function shown(value) {
  if (typeof value === "number" || value === undefined) return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * The run itself, behind `importActors`' GM check and re-entrancy guard.
 * @param {Required<ImportOptions>} options  already defaulted
 * @returns {Promise<ImportResult>}
 */
async function importOnce({ path, dryRun, only, force, timeout, unmanagedItems }) {
  if (!["keep", "delete"].includes(unmanagedItems)) {
    throw new PentarynAbort(`unmanagedItems must be "keep" or "delete", got ${JSON.stringify(unmanagedItems)}`, "BAD_ARGS");
  }
  // importer-R3: the other options are shape-checked the same way — refused before any fetch.
  if (only != null && !(Array.isArray(only) && only.every(s => typeof s === "string"))) {
    throw new PentarynAbort(`only must be null or an array of slug strings, got ${shown(only)}`, "BAD_ARGS");
  }
  if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) {
    throw new PentarynAbort(`timeout must be a positive number of milliseconds, got ${shown(timeout)}`, "BAD_ARGS");
  }
  if (typeof path !== "string" || path === "") {
    throw new PentarynAbort(`path must be a non-empty string, got ${shown(path)}`, "BAD_ARGS");
  }

  const url = foundry.utils.getRoute(path);
  log.info(`fetching ${url} (cache: no-cache, timeout ${timeout} ms)`);

  // 2 ────────────────────────────────────────────────────────────────────────────────────────────
  const manifest = await fetchJsonWithTimeout(path, { cache: "no-cache", timeout });

  // 3 ────────────────────────────────────────────────────────────────────────────────────────────
  assertVersionGate(manifest);

  // 4 ────────────────────────────────────────────────────────────────────────────────────────────
  // importer-R4: a non-object entry is refused (preparePayload's PentarynAbort) before the lint walks
  // it — the lint's slug lookup would otherwise throw a bare TypeError on a string entry.
  for (const entry of manifest.actors) if (!isPlainObject(entry)) prepareOrShout(entry);
  assertNoBadFormulas(manifest.actors);

  log.info(
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
  const bySlug = indexActorsBySlug();

  // Prepare every entry before the first write (importer-R1): a malformed entry anywhere in the
  // file refuses the whole run, so a thrown PentarynAbort still means nothing was written.
  /** @type {ReturnType<typeof preparePayload>[]} */
  const preparedAll = [];
  for (const entry of manifest.actors) preparedAll.push(prepareOrShout(entry));

  for (const [index, entry] of manifest.actors.entries()) {
    const { data, items, expected, slug } = preparedAll[index];
    if (onlySet && !onlySet.has(slug)) continue;
    selected++;

    const incomingHash = storedHash(entry);

    try {
      const existing = bySlug.get(slug);

      // ── skip on unchanged content (§9.2) ─────────────────────────────────────────────────────
      // Two strings compared. The module never recomputes the hash: a canonical-JSON
      // implementation in both Python and JS would disagree (json.dumps(1.0) === "1.0" vs
      // JSON.stringify(1.0) === "1", and prototypeToken.width is 0.5 for tiny creatures), which
      // would present as "every actor always differs" and silently destroy idempotence.
      if (existing && !force && incomingHash && (storedHash(existing) === incomingHash)) {
        skipped.push(slug);
        log.info(`skip   ${slug} — contentHash unchanged (${incomingHash.slice(0, 20)}…)`);
        continue;
      }

      if (dryRun) {
        (existing ? updated : created).push(slug);
        log.info(`dry-run ${existing ? "would update" : "would create"} ${slug} (${items.length} item(s))`);
        continue;
      }

      let actor = existing;
      if (actor) {
        // UPDATE — never recreate. `hp.value`, `img` and `prototypeToken.texture` are withheld.
        await actor.update(toUpdatePayload(data), { render: false });
        updated.push(slug);
      } else {
        // CREATE under the slug's own id (importer-AC-2): another GM tab creating the same slug at the
        // same moment asks for the same id, and the server refuses whichever comes second.
        const id = idForSlug(slug);
        try {
          actor = await ActorClass.create({ ...toCreatePayload(data), _id: id }, { keepId: true, renderSheet: false });
        } catch (cause) {
          if (foundry.utils.getProperty(game.actors.get(id) ?? {}, `flags.${FLAG_SCOPE}.slug`) === slug) {
            throw new Error("created concurrently by another GM tab — re-run", { cause });
          }
          throw cause;
        }
        if (!actor) throw new Error("Actor.create returned nothing");
        bySlug.set(slug, actor);                 // a later entry with the same slug updates it
        created.push(slug);
      }

      const itemResult = await replaceItems(actor, items, unmanagedItems, slug);
      if (itemResult.unmanaged.length) {
        log.warn(
          `${slug}: left ${itemResult.unmanaged.length} hand-added Item(s) in place `
          + `(${itemResult.unmanaged.join(", ")}). Pass unmanagedItems:"delete" to remove them.`
        );
      }

      // Re-prepare before reading anything back (§8.2 rule 1). `reset()` → `_initialize()` →
      // `_safePrepareData()`, which repopulates every `.labels` we are about to assert on.
      actor.reset();

      // Strip detection on the two structures Foundry is most likely to quietly mangle.
      assertPrototypeToken(actor, data.prototypeToken, slug);
      assertItemsAddressable(actor, items, slug);

      // The contract's own expectations (§8) — displayed labels, not recomputed maths.
      assertions += runExpectedAssertions(actor, expected, slug);

      // Only now is the actor allowed to be marked current.
      await stampContentHash(actor, incomingHash);

      log.info(
        `${existing ? "update" : "create"} ${slug} — ${itemResult.created} item(s) written, `
        + `${itemResult.deleted} replaced`
      );
    } catch (cause) {
      // §8.3: a ValidationError on one actor must not abort the run; an ASSERTION failure must.
      if (cause instanceof PentarynAssertionError) throw cause;
      if (cause instanceof PentarynAbort) throw cause;
      failed.push({ slug, error: cause?.message ?? String(cause) });
      log.error(`FAILED ${slug}:`, cause);
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

  // §12 / Stage 2 of context/plans/foundry-content-pipeline.md: Data/ is served over HTTP with no
  // authentication and is public while the tunnel is up. Foundry's client API has no file-delete (FilePicker exposes only browse,
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
    log.warn(`DELETE THIS NOW: Data/${path} is public while the tunnel is up.`);
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

/* -------------------------------------------------------------------------------------------- */
/*  The kit-built API                                                                             */
/* -------------------------------------------------------------------------------------------- */

/** The helpers the legacy root has always exposed as `_internals` (tests, hand-checking a file). */
const INTERNALS = Object.freeze({ fetchJsonWithTimeout, lintFormulas, valuesMatch, normalise });

function selftest(ctx) {
  const flags = game.modules.get(MODULE)?.flags?.[FLAG_SCOPE];
  const checks = [
    { label: "published as module.api", ok: game.modules.get(MODULE)?.api === ctx.api },
    { label: "game.pentaryn.importer is this API", ok: game.pentaryn?.importer === ctx.api },
    { label: "game.pentaryn.import is importActors", ok: game.pentaryn?.import === importActors },
    // One check per version-gate key (importer-M3): a module.json missing any of them refuses
    // every import, so selftest must not pass. `contract` must also be the one this code speaks.
    ...GATE_KEYS.map(key => ({
      label: `module.json flags.${FLAG_SCOPE}.${key} present`,
      ok: key === "contract" ? flags?.contract === CONTRACT_ID : flags?.[key] != null,
      detail: flags?.[key] ?? null
    }))
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/**
 * The legacy root keys, MERGED into `game.pentaryn` at ready (items-journal-1): `import()` and
 * `make foundry-import` keep working, and the root is never replaced or frozen, so every other
 * module's namespace survives whichever order the modules load in. `_internals` stays frozen.
 * `contract` here is the actors.json contract (the root key's old meaning); the namespace's own
 * `contract` is the API contract.
 * @returns {{import: typeof importActors, moduleId: string, contract: string, _internals: object}}
 */
export function legacyRoot() {
  return { import: importActors, moduleId: MODULE, contract: CONTRACT_ID, _internals: INTERNALS };
}

/**
 * Build the frozen API. Throws (at ready, in node too) when the manifest and the implementations
 * drift apart.
 * @param {{log: object, reg: object, uninstall: Function, api: object|null}} ctx
 */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    import: importActors,
    selftest: () => selftest(ctx),
    moduleId: MODULE,
    actorsContract: CONTRACT_ID,
    _internals: INTERNALS
  }, {
    members: {
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall()
    },
    extras: () => ({
      settings: [],
      events: HOOKS,
      hooks: ctx.reg.ids(),
      patches: [],
      published: publishedOf(NS)
    })
  });
}
