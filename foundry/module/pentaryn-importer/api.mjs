/**
 * pentaryn-importer — API: `importActors`, the orchestrator behind `game.pentaryn.import()`, and
 * the kit-built API (`buildApiFor`). Every step of an import is a gate for the next; the gates and
 * writes themselves are in documents-adapter.mjs, the pure rules in importer-core.mjs.
 */

import {
  CONTRACT_ID, DEFAULT_TIMEOUT_MS, FLAG_SCOPE, HOOKS, MODULE, NS, PentarynAbort, PentarynAssertionError,
  lintFormulas, normalise, preparePayload, toCreatePayload, toUpdatePayload, valuesMatch
} from "./importer-core.mjs";
import {
  TAG, assertActivityIdsSurvived, assertNoBadFormulas, assertPrototypeToken, assertVersionGate,
  failAssertion, fetchJsonWithTimeout, indexActorsBySlug, log, refuse, replaceItems, reportSummary,
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
  } = options;

  if (!game.user?.isGM) {
    const message = "Refusing to import: only a GM can create or update world Actors.";
    refuse(PentarynAbort, message, "NOT_GM");
  }
  // Not re-entrant (items-journal-4): a second call while one is awaiting would read the same stored
  // contentHash and replace the same managed Items. Refused, not queued; per tab (module scope).
  if (running) throw new PentarynAbort("An import is already running; await it or reload.", "CONFLICT");
  running = true;
  try {
    return await importOnce({ path, dryRun, only, force, timeout, unmanagedItems });
  } finally {
    running = false;
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

  const url = foundry.utils.getRoute(path);
  log.info(`fetching ${url} (cache: no-cache, timeout ${timeout} ms)`);

  // 2 ────────────────────────────────────────────────────────────────────────────────────────────
  const manifest = await fetchJsonWithTimeout(path, { cache: "no-cache", timeout });

  // 3 ────────────────────────────────────────────────────────────────────────────────────────────
  assertVersionGate(manifest);

  // 4 ────────────────────────────────────────────────────────────────────────────────────────────
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
        actor = await ActorClass.create(toCreatePayload(data), { renderSheet: false });
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
    {
      label: "module.json flags.pentaryn.contract is the contract this code speaks",
      ok: flags?.contract === CONTRACT_ID,
      detail: flags?.contract ?? null
    }
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
