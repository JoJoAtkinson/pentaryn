# Changelog — Pentaryn Token Name Sync (`pentaryn-names`)

## Unreleased — 2026-10-11 (kit 1.2.0)

- [declared] Kit 1.0.2 (wave 2, J10): a frozen `game.pentaryn` is no longer rebuilt; the `ready`
  publish throws into Foundry's hook error report and leaves the root as it was. Nothing freezes the
  root since the importer's keystone, so a live world sees no difference.
- [declared] Kit 1.1.0 (W2-B4, Joe 2026-10-12, `5835ac59`): `describe()` marks `sync`'s `ref` param
  `resolve: "self"`, so the bridge's `pentaryn-write` passes a uuid, id or exact name through
  (`rename.mjs` resolves it) instead of refusing it as eval-js only. The kit still does not wrap the
  param.
- [declared] names-edge-1 (+rob-1, final review 2026-10-12): renaming an unlinked token's synthetic
  actor relabels only that token (and, GM, its combatants). Before, it relabelled every sibling token
  of the base actor on every scene and sent, counted and toasted a prototype write Foundry dropped.
- [declared] names-ac-2 (+edge-2, final review 2026-10-12): in a multi-actor rename batch
  (`Actor.updateDocuments`) each actor's tokens follow from its own old name. The old name is now
  kept per actor id in the update options (`pentarynOldNames[id]`, was `pentarynOldName`); before,
  every actor in the batch was given the last actor's old name, so the others' labels stayed put.
- [declared] names-ext-3 (kit 1.2.0, final review 2026-10-12): `sync`'s base-actor mapping of a
  token's synthetic actor now comes from the kit's `resolveRef(..., { base: true })`; names' own
  `isToken` patch in `syncRef` is gone. Same result at the table.
- [declared] names-rob-2 (final review 2026-10-12): `api.sync` with a missing or non-string
  `oldName`/`newName` returns `fail("BAD_ARGS", "oldName and newName must be strings")`, writing
  nothing and toasting nothing (new failure path). Before, it blanked every matching token label and
  toasted "undefined".
- [declared] names-maint-1 (final review 2026-10-12): `api.sync` is always async (failure-path shape
  change). `fail("BAD_ARGS")`, `fail("AMBIGUOUS")` and an uncoded resolve error now arrive through the
  returned Promise (resolved, or rejected for the error) like the count and the legacy `TypeError`;
  before, a coded failure came back as a plain object and an uncoded one threw synchronously.
- [declared] names-edge-3 (final review 2026-10-12): on a GM client a refused combatant write is
  logged once (`pentaryn-names | relabel combatants after rename failed`, `{actor, from, to}`, the
  error) and the rename carries on: the token toast still shows and `sync` resolves with the token
  count. Before, it skipped the toast, rejected `sync`, and the hook logged the generic
  "relabel after rename failed".
- [declared] names-ac-3 (+edge-4, final review 2026-10-12): the `updateActor` relabels are chained
  per actor id, so two renames of one actor less than a write round trip apart (`Bob → Rob →
  Robert`) leave every label on the final name. Before, the second relabel read labels still on
  the first name, matched nothing, and the first write then left them on the middle name. A failed
  relabel does not hold up the next one. Renames from two different clients are not chained: repair
  with `sync(actor, middle, final)`.
- [declared] names-ac-3 live (FIX-3, 2026-10-13): two renames of one actor sent before either reply
  (`a.update({name: Mid}); await a.update({name: Fin})`) now end on `Fin`. Both `preUpdateActor`
  calls ran before the server replied, so both recorded the first name; the second relabel then
  looked for it, matched nothing, and labels stayed on `Mid` with one toast. `preUpdateActor` now
  also puts `pentarynLanded[id]` in the update options (how many renames of that actor had landed on
  this client); `updateActor` counts landed renames per actor, and when one landed since the send, it
  relabels from the name that rename left. New update-options key; the chaining is unchanged.
- [declared] names-maint-2-manifest (final review 2026-10-12): the `sync` row's doc (what
  `describe()` and the bridge show) now says a ref of the wrong kind (a number, a plain object, an
  Item) or a missing or non-string `oldName`/`newName` returns `fail("BAD_ARGS")`, writing nothing.
  Doc only: the behaviour already shipped; `throws` stays `["TypeError"]`.
- [declared] names-maint-4 (final review 2026-10-12): the Unreleased header names the vendored kit
  (1.1.0, was 1.0.2) and W2-B4 has its line. `test/changelog.test.mjs` pins the header to
  `lib/errors.mjs` `KIT_VERSION`, so the next kit re-vendor must update it.

## 0.1.1 — 2026-10-11 (play-test fix, fix/playtest-2026-10-11)

Declared change:

- PT3-9: a rename also relabels the actor's combatants, in every encounter, whose name was the old
  name or its part before the first comma (the token rule); a custom combatant name is left alone.
  GM clients only (a player may not change a combatant's name), same gate as the token relabel,
  one batch write per combat. `sync`'s return value and the toast still count token labels only.
  Before, the combat tracker kept the old name until reload.

## 0.1.0 — 2026-10-11 (migrated to the addon blueprint)

Structure (no behaviour change): pure core `names-core.mjs`, the `rename.mjs` feature, the entry
`names.mjs` wired through the vendored kit (1.0.1, small tier plus `api`), nested `lang/en.json`,
`node:test` suites with goldens.

Declared changes:

- A failed relabel after a rename is logged as `pentaryn-names | relabel after rename failed`
  instead of an unhandled promise rejection (N-D1, transform-creatures-33).
- The API is built by the kit from `api-manifest.mjs`: frozen, with `version`, `contract`,
  `describe()`, `settings()`, `trace()`, `uninstall()`; also published as
  `game.modules.get("pentaryn-names").api`; `pentaryn-names.ready` and `pentaryn.ready` fire (N-D2).
- `sync` accepts an actor id, UUID or whole name as well as an Actor; an ambiguous name returns
  `fail("AMBIGUOUS")` (N-D3, transform-creatures-38).
- `sync` given a token, placeable, token id or uuid, or a token's synthetic actor relabels the
  BASE actor's prototype token. Before, it resolved to the synthetic actor, whose prototype write
  Foundry drops, yet counted and toasted it (review of N-D3).

## 0.1.0 — before the blueprint

- Renaming an actor renames its prototype and placed token labels where the label was the old
  name or its part before the first comma; nicknames are left alone.
