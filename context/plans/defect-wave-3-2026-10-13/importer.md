# Defect wave 3 (2026-10-13): importer

**Read this when:** you want the history of defect wave 3 for `pentaryn-importer`: what was fixed,
why, which commits, and how to confirm it live. History only. To operate the importer, read
`foundry/module/pentaryn-importer/README.md`.

Branch `wave3/importer-2026-10-13`, from `e392ba56`. Gate: `make foundry-importer-check` (121 node
tests, kit identical, conformance 100 % with 45/45 fail-class rules). Both fixes are declared
behaviour changes. Joe approved them on 2026-10-13 ("fix all small bugs found live"). Both close
the importer line of the wave-2 record's "Still open" list.

| item | defect | what changed (plain words) | commits | test |
|---|---|---|---|---|
| 1 | On the update path, Foundry drops an invalid change (such as a blank name) without throwing. The importer still counted the actor as updated and stamped its new content hash, so the change was never retried | When `update()` comes back empty, the importer repeats Foundry's own dry run. If that throws (or a pre-update hook vetoed the change), the actor fails with "update refused by Foundry — <reason>": no Item writes and no hash stamp, so the next run retries it. A real no-op (nothing changed) still counts as updated | `cf6d9fba` | `test/update-refused.test.mjs` (blank name failed, untouched, retried; no-op still updated) |
| 2 | Two GM tabs sending a create for the same new NPC in the same instant both passed the look-first check. Foundry replaced the first actor with the second, both tabs wrote Items and stamped, and the actor held the later tab's data | Exactly one tab creates the actor. The server finishes the first create before it starts the second, so the second tab gets the first tab's create before its own reply. A new feature, `create-watch.mjs`, listens for that only while the create is in flight. The second tab then stands down, waits up to 10 s for the first tab's hash stamp and takes the update path (skipped when the file is the same). The first tab re-reads the live actor before checking it. If the other tab's actor was already there before the create (the look-first case), the tab now joins it the same way instead of failing "re-run" | `81f0202d`, `52f715a9` (whitespace) | `test/concurrent-create.test.mjs` (same instant, second tab joins and Items are written once; the winner's file differs, so the joining tab updates; this tab lands first and passes the readback; look-first joins as update) |

Goldens: none changed. `hooks.json` still pins `once:ready` only: the create watch registers on
the module's hook registry only during a create and removes the listener when the create resolves.

Not changed: an id held by an actor *without* the slug is still refused and never overwritten.
If two tabs update the same existing actor at once, nothing guards it (README).

## Deploy

`make foundry-importer-install`, then reload the GM tab. `module.json` is unchanged, so no restart
is needed (blueprint §10). The new `create-watch.mjs` loads through the entry's import.

## Live check after deploy

Use one GM tab, except for step 2c, which allows a second GM tab. Use ZZ scratch docs only. Stage
the file as `Data/worlds/<world>/zz-importer-actors.json` and pass it as `path`. Afterwards,
delete the file (confirm it returns 404) and every ZZ actor. Never touch the real PCs or campaign
scenes.

1. **Refused update (item 1).**
   1. Import a ZZ entry with slug `zz-blank`, name `ZZ blank`, one loot Item and contentHash `sha256:zz-1`. Expect `created:['zz-blank']`.
   2. Import it again with `name: ""` and contentHash `sha256:zz-2`. Expect:
      - Foundry's own validation error toast;
      - `failed:[{slug:'zz-blank', error}]` with `error` containing `update refused by Foundry` and `name`;
      - `updated:[]`;
      - the permanent "1 actor(s) failed" warning;
      - `flags.pentaryn.contentHash` still `sha256:zz-1`, the name still `ZZ blank` and the Item ids unchanged.
   3. Import again with name `ZZ blank fixed` and `sha256:zz-2`. Expect `updated:['zz-blank']`, the new name, and the hash `sha256:zz-2`.
2. **Concurrent create (item 2).**
   1. *This tab lands first.* Register a one-shot `createActor` hook. When it sees the `zz-first` instance, it calls `Actor.create({...same data, name:'ZZ first (other tab)'}, {keepId:true})`, which replaces the actor right after this tab's create. Then import `only:['zz-first']`. Expect:
      - `created:['zz-first']` and `failed:[]`, with no readback assertion;
      - one actor at `idForSlug('zz-first')`;
      - its loot Item present once;
      - `contentHash` stamped on the live actor.
   2. *Look-first join.* Import `only:['zz-a','zz-join']`. A one-shot `createActor` hook on `zz-a` creates `ZZ other tab` (slug `zz-join`, no contentHash) at `idForSlug('zz-join')`. Expect:
      - the console line "another GM tab created this actor during the run — joining it as an update";
      - after about 10 s, "no content hash from the other GM tab", then `created:['zz-a']` and `updated:['zz-join']`;
      - the same actor id, now holding the file's name, Items and stamp.

      Repeat with the hook also setting `flags.pentaryn.contentHash` to the file's hash. Expect `skipped:['zz-join']` at once.
   3. *Same instant (a second GM tab is allowed for this step).* In both tabs, schedule `game.pentaryn.import({path, only:['zz-same']})` for the same wall-clock instant (`setTimeout(…, T - Date.now())`). Expect:
      - exactly one actor at `idForSlug('zz-same')`;
      - one tab reports `created:['zz-same']`, and the other reports `skipped:['zz-same']` (same file) with a "joining it as an update" console line;
      - the loot Item present once;
      - one stamp.

      If the timing misses and one tab sees the other's actor first, step 2b's look-first join shows instead. That still passes: one actor, one create, one join.
3. **No leftover listener.** After each run, `game.pentaryn.importer.describe().hooks` is `[]` and `Hooks.events.createActor` holds no `create watch` entry from the importer.
