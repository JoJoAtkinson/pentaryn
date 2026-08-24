---
created: 2026-08-10
last_modified: 2026-08-10
tags: ["foundry", "vtt", "module", "dnd5e"]
status: draft
---

# `pentaryn-importer`

Stage 2 of the Foundry pipeline. Reads the `actors.json` produced by Stage 1
(`scripts/foundry/build_actors.py`) and upserts the NPC Actors it describes into the live
`ardenhaven` world.

- **Contract:** [`foundry/CONTRACT.md`](../../CONTRACT.md) — normative; this module implements the
  "Importer (Stage 2) MUST" checklist in §12.
- **Why the pipeline looks like this:** [`context/plans/foundry-content-pipeline.md`](../../../context/plans/foundry-content-pipeline.md)
  (D3, D8, D10).
- **Target:** Foundry **v14.365** · dnd5e **5.3.3**.

No UI. No settings. One hook (`ready`), used only to attach the API.

---

## Install

`make foundry-sync` **copies** the module into `Data/modules/` — copy, not symlink (playbook D8).
Until that target exists, the manual equivalent is:

```bash
FOUNDRY_DATA=~/Library/Application\ Support/FoundryVTT/Data
rm -rf "$FOUNDRY_DATA/modules/pentaryn-importer"
cp -R foundry/module/pentaryn-importer "$FOUNDRY_DATA/modules/"
```

Then enable **Pentaryn Importer** in *Game Settings → Manage Modules* and reload.

> Because it is a copy, a stale module in `Data/modules/` is a real failure mode. The version gate
> defends against it: `module.json`'s `flags.pentaryn` block is checked against both the JSON
> manifest and the live game, so a copy that predates a contract change refuses to run rather than
> importing something subtly wrong.

### 🔴 Back up before the first import

```bash
make vtt-down    # LevelDB is single-writer; Foundry must be stopped
cp -R ~/Library/Application\ Support/FoundryVTT/Data/worlds/ardenhaven ~/backups/ardenhaven-$(date +%F)
```

---

## Use

`actors.json` has to be reachable over HTTP, which means it has to be under `Data/`, which means
it is **world-readable over the tunnel while Foundry is up** — `express.static(paths.data)` serves
the whole Data directory with no authentication. Hence **copy in → import → delete**:

**Run `make foundry-import`.** It does all three steps — stages the file, waits while you run the
import in Foundry's console, then deletes and verifies:

```bash
make foundry-import
```

The three steps it wraps, for reference:

```bash
# 1. copy in
cp foundry/build/actors.json ~/Library/Application\ Support/FoundryVTT/Data/worlds/ardenhaven/
```

```js
// 2. import — in the Foundry console (F12), as GM
await game.pentaryn.import();
```

```bash
# 3. delete, and prove it
rm ~/Library/Application\ Support/FoundryVTT/Data/worlds/ardenhaven/actors.json
curl -s -o /dev/null -w '%{http_code}\n' https://vtt.atjoseph.com/worlds/ardenhaven/actors.json   # expect 404
```

The module **cannot** do step 3 itself: Foundry's client API has no file-delete. `FilePicker`
exposes `browse`, `upload`, `createDirectory` and `configurePath` and nothing else
(`client/applications/apps/file-picker.mjs`).

So the deleting agent is **`make foundry-import`** (CONTRACT.md §12, *"Deleting `actors.json` —
who actually does it"*), and it `rm`s the staged file whether or not you report the import
succeeded. What the module contributes is a backstop for an import run by hand: it returns
`result.deleteJson = {required, path, url, note}` and raises a **permanent** toast. If you see
that toast and did not come through `make foundry-import`, run `make foundry-clean` now.

### Options

```js
await game.pentaryn.import({
  path: "worlds/ardenhaven/actors.json",  // default: worlds/<current world id>/actors.json
  dryRun: false,        // true → gate, lint and report; write nothing
  only: null,           // e.g. ["skeleton"] — Gate 2's "import one NPC"
  force: false,         // true → ignore contentHash and rewrite every selected actor
  timeout: 15000,       // fetch timeout, ms
  unmanagedItems: "keep" // or "delete" — what to do with Items a GM added by hand
});
```

### Gate 2, step by step

```js
// 1. one NPC, dry first
await game.pentaryn.import({ only: ["skeleton"], dryRun: true });
await game.pentaryn.import({ only: ["skeleton"] });
//    → readback assertions run automatically; any mismatch throws PentarynAssertionError

// 2. prove abort-on-first-mismatch works — hand-edit one `expected` value in the copied
//    actors.json (e.g. labels.toHit "+4" → "+9") and re-import with force
await game.pentaryn.import({ only: ["skeleton"], force: true });
//    → expect PentarynAssertionError naming actor, item, activity, path, expected and actual

// 3. prototype token, by eye as well as by assertion
game.actors.getName("Skeleton").prototypeToken   // vision, bars, size, disposition

// 4. full import, then idempotence
await game.pentaryn.import();
const again = await game.pentaryn.import();
console.assert(again.counts.created === 0 && again.counts.updated === 0, "not idempotent");
```

### Return value

```jsonc
{
  "ok": true,
  "path": "worlds/ardenhaven/actors.json",
  "url": "/worlds/ardenhaven/actors.json",
  "dryRun": false,
  "manifest": { "generator": "…", "generatorVersion": "1.0.0", "generatedAt": "…",
                "sourceRevision": "9a4199f", "skippedRows": 27 },
  "counts": { "total": 19, "selected": 19, "created": 19, "updated": 0,
              "skipped": 0, "failed": 0, "assertions": 412 },
  "created": ["…"], "updated": [], "skipped": [], "failed": [],
  "deleteJson": { "required": true, "path": "worlds/ardenhaven/actors.json", "url": "…", "note": "…" }
}
```

`deleteJson.required` is `true` only after a non-dry run with **zero failures** — a run that left
work undone should be re-run against the same file, so it does not ask for the file to be removed.

---

## What it guarantees, and how

Every failure mode in this stack is silent, so each guarantee is an active check rather than an
absence of errors.

| Guarantee | Mechanism |
| --- | --- |
| Never imports stale JSON | `fetchJsonWithTimeout(path, {cache: "no-cache"})`. `Data/` is served by `express.static`, which sets ETag/Last-Modified; without `no-cache` the browser serves the previous build from memory cache and the import "succeeds" against the wrong file. |
| Never imports against the wrong system or generation | Three-way version gate (§1.1): the JSON manifest, `module.json`'s `flags.pentaryn`, and the live `game.system` / `game.release`. All mismatches are listed at once, then the **whole run** aborts — never a subset. |
| No formula rolls as zero | `@ref` lint (§10) over the exact FormulaField path set, on the fetched JSON. dnd5e replaces unknown `@terms` with `1` at validation and `0` at evaluation, so a typo passes validation and rolls as zero with no runtime signal. Whitelist is empty by design. |
| Placed tokens survive | Actors are **updated**, never deleted and recreated. Only embedded Items are replaced (`deleteEmbeddedDocuments` + `createEmbeddedDocuments`). |
| GM work survives | `img`, `prototypeToken.texture` and `system.attributes.hp.value` are stripped from every update payload. Hand-added Items (no `flags.pentaryn.action`) are left in place by default. |
| Silent key-stripping is caught | `assertPrototypeToken` compares every leaf the payload asked for against the saved **source** data. A key Foundry dropped reads back as `undefined`, exactly like the `"vaule"` probe in Gate 0. |
| A silently dropped Item is caught | `createEmbeddedDocuments` returns only what it actually created — an Item that fails validation is omitted from the array **without throwing**. `replaceItems` asserts `created.length === itemsData.length` and names the missing Item(s). |
| An unaddressable Item is caught | After the write, every payload Item must be findable by its `flags.pentaryn.action`. No match ⇒ the Item was dropped or the flag was stripped, and the next run would no longer recognise it as managed. This never silently skips: `expected` blocks (§8) are not exhaustive, so a missed Item has no other check standing behind it. |
| Deterministic activity ids survive | `assertActivityIdsSurvived` checks each supplied 16-char id is present in the saved `ActivityCollection`. This is contract **U7**; if it ever fails, the message says what has to change (§8.2 rule 3 → resolve by name). |
| Displayed numbers are the baked numbers | Readback assertions compare `activity.labels.toHit`, `labels.save`, `labels.damage.N.formula` and `item.labels.recharge` — what the sheet and chat card show, after every bonus has had its chance to apply. Recomputing `bonus + mod + prof` in the assert would agree with the bug. |
| One bad actor doesn't kill the run | Per-actor `try/catch`; failures collected into a per-slug report. **Assertion** failures are deliberately excluded — they mean the silent-strip mode is live and nothing in the batch can be trusted, so they abort. |
| An interrupted run is safe | `flags.pentaryn.contentHash` is stamped **last**, after items are written and every assertion has passed. A run that dies half-way leaves the old hash, so the actor is retried next time instead of being skipped forever. |

### Idempotence

An actor whose stored `flags.pentaryn.contentHash` equals the incoming one is skipped. The module
**never recomputes** the hash — the generator is the sole producer and the module compares two
strings (§9.2). Computing it on both sides would need canonical JSON in Python *and* JS, and they
disagree by default (`json.dumps(1.0)` is `"1.0"`, `JSON.stringify(1.0)` is `"1"`, and
`prototypeToken.width` is `0.5` for tiny creatures) — which would present as "every actor always
differs" and silently destroy idempotence.

---

## Deviations from `CONTRACT.md`, and things to know

**1. `getFlag("pentaryn", …)` would throw — reads go through `getProperty`.**
§9.2 shows `actor?.getFlag("pentaryn", "contentHash")`. `Document#getFlag` validates the scope
against `ClientDatabaseBackend#getFlagScopes()`
(`common/abstract/document.mjs:947` → `client/data/client-backend.mjs:646`), which returns
`["core", "world", game.system.id, ...activeModuleIds]`. `"pentaryn"` is none of those — this
module's id is `pentaryn-importer`. All flag **reads** therefore use
`foundry.utils.getProperty(doc, "flags.pentaryn.…")`.

Flag **writes** are unaffected: `flags` is a `DocumentFlagsField` whose only key constraint is
`BasePackage.validateId`, i.e. `/^[A-Za-z0-9-_]+$/` (`common/data/fields.mjs:4002`). Flags are
written as ordinary document data, never via `setFlag`.

**2. Hand-added Items are kept, not deleted.**
§4.2 says the embedded Item set is replaced "wholesale". In practice that only ever means the
*generated* set — a freshly created Actor has no others — so the default deletes only Items
carrying `flags.pentaryn.action` and warns about anything else it found. Pass
`unmanagedItems: "delete"` for the literal reading.

**3. `flags.pentaryn` merges rather than replaces on update.**
`ObjectField._updateDiff` (`common/data/fields.mjs:1937`) does `mergeObject`, not assignment. That
is what makes the hash-stamped-last design work, but the corollary is that a `flags.pentaryn` key
dropped by a future contract revision lingers on existing Actors until they are rebuilt.

---

## Errors

| Class | Meaning | Scope |
| --- | --- | --- |
| `PentarynAbort` | Version gate, `@ref` lint, missing/malformed file, non-GM, missing slug | Whole run; **nothing was written** |
| `PentarynAssertionError` | A readback mismatch (§8.3) | Whole run; earlier actors in the batch *were* written |
| anything else | A `ValidationError` or similar from one Actor | That actor only; collected into `result.failed` |

Every assertion failure names actor slug, item action, activity id, path, expected and actual, and
appears both as a permanent toast and as a `console.error`.

---

## Verification status

This module was written against the **installed** artefacts — Foundry v14.365 under
`/Applications/Foundry Virtual Tabletop.app/`, and dnd5e 5.3.3 recovered from
`dnd5e-compiled.mjs.map`'s `sourcesContent`. Every API it depends on is cited with a file and line
number in the header comment of `pentaryn-importer.mjs`.

It has **not** been run against a live Foundry. It was exercised against an offline simulation of
the document API, which confirmed: dry run, create, idempotent skip, forced update, version-gate
refusal, `@ref` lint refusal, abort-on-first-assertion-mismatch, prototype-token strip detection,
one `ValidationError` failing a single actor without aborting the run, and — with the actor's
`expected` block set to `null`, so nothing else could catch it — both silent-Item failures:
`createEmbeddedDocuments` returning fewer documents than it was given, and an Item whose
`flags.pentaryn.action` came back stripped. That simulation is not a
substitute for Gate 2 — it cannot reproduce Foundry's actual cleaning, dnd5e's actual label
derivation, or the `attack.flat` behaviour that is the whole point of the exercise.

Unverified until Gate 2, in rough order of consequence:

1. **U7** — that Foundry honours supplied activity `_id`s. The reading is strong (`readonly` makes
   the *initialised* property non-writable, `common/abstract/data.mjs:491`; it does not strip
   source data; and dnd5e skips auto-creating activities when the source already has some,
   `module/data/item/templates/activities.mjs:256`) — but Gate 0's write probe is what settles it,
   and `assertActivityIdsSurvived` catches it if the reading is wrong.
2. That `actor.reset()` is sufficient to repopulate every `.labels` before the assertions read
   them. Traced: `reset()` → `_initialize()` → `_safePrepareData()` → `prepareData()` →
   `prepareDerivedData()` → `this.items.forEach(i => i.prepareFinalAttributes())`
   (dnd5e `module/documents/actor/actor.mjs:308`) → `system.prepareFinalData()` →
   `prepareFinalActivityData` → `activity.prepareFinalData()`.
3. Whether `{render: false}` on the embedded-document operations interacts badly with an open NPC
   sheet. It should only suppress a re-render; close the sheets during a big import anyway.
