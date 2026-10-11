---
title: "pentaryn-importer — how 1.0 was verified (history)"
status: history
last_modified: 2026-10-11
tags: [foundry, importer, history]
---

# `pentaryn-importer` — how 1.0 was verified

**Read this when:** you want to know what the importer's first release was checked against, and
which readings were left for Gate 2. **History, not instructions** — operating it →
[`../foundry/importer.md`](../foundry/importer.md); internals →
[`../../foundry/module/pentaryn-importer/README.md`](../../foundry/module/pentaryn-importer/README.md).

Moved here from the module README's "Verification status" section in the 2026-10 blueprint
migration (importer guide step 8). Since then the module has a node suite
(`foundry/module/pentaryn-importer/test/`) that pins the gate, the lint, the refusals, the write
path and the seven readback-assertion sites against Foundry's own `common/` utilities.

## What 1.0 was written against

The installed artefacts: Foundry v14.365 under `/Applications/Foundry Virtual Tabletop.app/`, and
dnd5e 5.3.3 recovered from `dnd5e-compiled.mjs.map`'s `sourcesContent`. Every API it depends on is
cited with a file and line number in the header comment (now at the top of `importer-core.mjs`).
1.1.0 (2026-10-10) retargeted dnd5e 6.0 (verified 6.0.6) without a code change.

At 1.0 it had **not** been run against a live Foundry. It was exercised against an offline
simulation of the document API, which confirmed: dry run, create, idempotent skip, forced update,
version-gate refusal, `@ref` lint refusal, abort-on-first-assertion-mismatch, prototype-token strip
detection, one `ValidationError` failing a single actor without aborting the run, and — with the
actor's `expected` block set to `null`, so nothing else could catch it — both silent-Item failures:
`createEmbeddedDocuments` returning fewer documents than it was given, and an Item whose
`flags.pentaryn.action` came back stripped. That simulation is not a substitute for Gate 2: it
cannot reproduce Foundry's actual cleaning, dnd5e's actual label derivation, or the `attack.flat`
behaviour that is the point of the exercise.

## Left for Gate 2, in rough order of consequence

1. **U7** — that Foundry honours supplied activity `_id`s. The reading is strong (`readonly` makes
   the *initialised* property non-writable, `common/abstract/data.mjs:491`; it does not strip
   source data; and dnd5e skips auto-creating activities when the source already has some,
   `module/data/item/templates/activities.mjs:256`) — but Gate 0's write probe is what settles it,
   and `assertActivityIdsSurvived` catches it if the reading is wrong.
2. That `actor.reset()` repopulates every `.labels` before the assertions read them. Traced:
   `reset()` → `_initialize()` → `_safePrepareData()` → `prepareData()` → `prepareDerivedData()` →
   `this.items.forEach(i => i.prepareFinalAttributes())` (dnd5e
   `module/documents/actor/actor.mjs:308`) → `system.prepareFinalData()` →
   `prepareFinalActivityData` → `activity.prepareFinalData()`.
3. Whether `{render: false}` on the embedded-document operations interacts badly with an open NPC
   sheet. It should only suppress a re-render; close the sheets during a big import anyway.
