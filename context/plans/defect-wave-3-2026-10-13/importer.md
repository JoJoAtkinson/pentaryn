# Defect wave 3 (2026-10-13): importer

**Read this when:** you want the history of defect wave 3 for `pentaryn-importer`: what was fixed,
why, which commits, and how to confirm it live. History only. To operate the importer, read
`foundry/module/pentaryn-importer/README.md`.

Branch `wave3/importer-2026-10-13`, from `e392ba56`. Gate: `make foundry-importer-check` (124 node
tests after the FIX-W3 repair, kit identical, conformance 100 % with 45/45 fail-class rules). Both fixes are declared
behaviour changes. Joe approved them on 2026-10-13 ("fix all small bugs found live"). Both close
the importer line of the wave-2 record's "Still open" list.

| item | defect | what changed (plain words) | commits | test |
|---|---|---|---|---|
| 1 | On the update path, Foundry drops an invalid change (such as a blank name) without throwing. The importer still counted the actor as updated and stamped its new content hash, so the change was never retried | When `update()` comes back empty, the importer repeats Foundry's own dry run. If that throws (or a pre-update hook vetoed the change), the actor fails with "update refused by Foundry — <reason>": no Item writes and no hash stamp, so the next run retries it. A real no-op (nothing changed) still counts as updated | `cf6d9fba` | `test/update-refused.test.mjs` (blank name failed, untouched, retried; no-op still updated) |
| 2 | Two GM tabs sending a create for the same new NPC in the same instant both passed the look-first check. Foundry replaced the first actor with the second, both tabs wrote Items and stamped, and the actor held the later tab's data | Exactly one tab creates the actor. The server finishes the first create before it starts the second, so the second tab gets the first tab's create before its own reply. A new feature, `create-watch.mjs`, listens for that only while the create is in flight. The second tab then stands down, waits up to 10 s for the first tab's hash stamp and takes the update path, always rewriting the actor and its Items (see the repair below). The first tab checks the live actor after its Item write and, if the other tab's replace swapped it, writes the actor and Items again on the live one before checking it. If the other tab's actor was already there before the create (the look-first case), the tab now joins it the same way instead of failing "re-run", and skips when the file is the same | `81f0202d`, `52f715a9` (whitespace), FIX-W3 repair commit | `test/concurrent-create.test.mjs` (same instant, second tab joins and rewrites the Items after the winner, never alongside; the winner's Items wiped by our replace are written again; the winner's file differs, so the joining tab updates; this tab lands first and passes the readback; the other tab's replace after our Items neither aborts the run nor loses the Items; the create watch is removed after a create and a throwing create; look-first joins as update) |

### FIX-W3 verifier repair (item 2)

The wave-3 verifier found two orderings the first item-2 commit got wrong (repro tests in its
scratch clone, now ported as fixture knobs `raceWiped` and `raceAfterItems`):

- **Items lost, actor stamped as current.** Server order: the other tab's create, its Items create,
  this tab's create (a replace, which wipes those Items), the other tab's stamp. This tab joined,
  saw the stamp equal its own hash and skipped, leaving an actor with no Items and a current hash, so
  later runs skipped it too. It needs this tab's latency to exceed the other's by more than its Item
  prep time (one tab over the tunnel, one local). Fix: a join whose own create was sent (`replaced`)
  never skips; after the stamp, the other tab's last write, it rewrites the actor and its Items
  (`replaceItems` deletes the managed Items and recreates them, so it is idempotent). A look-first
  join sent no create and still skips on the same hash.
- **The first tab aborted the run.** When the other tab's replace was handled after this tab's
  Items create, the re-read live actor had no Items and `assertItemsAddressable` threw the
  whole-run `PentarynAssertionError`. Fix: after its Item write, the tab compares
  `game.actors.get(id)` with the instance it wrote to (Foundry's client `collection.set`s a new
  instance for every create broadcast, client/data/client-backend.mjs `#handleCreateDocuments`); if
  replaced, it updates the live actor and rewrites its Items, at most twice, then reads back with no
  await in between. A third replace fails the actor unstamped, so the next run retries it.

Whichever tab writes last leaves the actor, its Items and the stamp together: the second tab only
writes after the first tab's stamp, and the first tab's rewrite comes before its stamp.

This stays detect-and-compensate. Foundry 14 has no create-if-absent for a world Actor (a `keepId`
create over a held id replaces it), so the replacing create is still sent and the transient
server-side replace still happens; the compensation makes the end state right. A true claim would
need a lock document (an embedded `keepId` create, which the server does refuse on a duplicate id).
That was not built. Also unguarded, as before: if the first tab's write of one actor takes more
than the 10 s join wait, the joining tab writes alongside it.

Goldens: none changed. `hooks.json` still pins `once:ready` only: the create watch registers on
the module's hook registry only during a create and removes the listener when the create resolves.

Not changed: an id held by an actor *without* the slug is still refused and never overwritten.
If two tabs update the same existing actor at once, nothing guards it (README).

### FIX-W3 live-check fix (join wait)

The live check of step 2b found the look-first join waited 40 s, not 10 s. The wait counted 40 polls
of 250 ms, and Chrome clamps a hidden tab's timers to about 1 s (measured in the MCP bridge tab:
8 polls took 7.6 s). `awaitStamp` now also ends when 10 s have passed on the clock, and its "no
content hash" line gives the real wait. Not a declared behaviour change: the 10 s was always the
intent. Test: `test/concurrent-create.test.mjs` runs the join with each poll moving the clock 1 s
(fails with 40 polls on the old code, passes with 10). Gate: 125 node tests.

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
      - one tab reports `created:['zz-same']`, and the other reports `updated:['zz-same']` (a replacing join never skips) with a "joining it as an update" console line;
      - the loot Item present once;
      - one stamp.

      If the timing misses and one tab sees the other's actor first, step 2b's look-first join shows instead. That still passes: one actor, one create, one join.
3. **No leftover listener.** After each run, `game.pentaryn.importer.describe().hooks` is `[]` and `Hooks.events.createActor` holds no `create watch` entry from the importer.

## Live check result (FIX-W3, 2026-10-13)

Run in the MCP bridge GM tab on world `pentaryn` (Foundry 14.369, dnd5e 6.0.6), ZZ actors only, file
`Data/worlds/pentaryn/zz-importer-actors.json`. A second GM tab was opened only for step 2c and closed
after it.

| step | result | evidence |
|---|---|---|
| 1.1 | pass | `created:['zz-blank']`, hash `sha256:zz-1`, one loot Item |
| 1.2 | pass | Foundry's error toast "name: may not be undefined" (the blank name is cleaned to undefined); `failed:[{slug:'zz-blank', error:'update refused by Foundry — validation errors: … name: may not be undefined'}]`, `updated:[]`, the permanent "1 actor(s) failed" warning; hash still `sha256:zz-1`, name `ZZ blank`, Item id unchanged |
| 1.3 | pass | `updated:['zz-blank']`, name `ZZ blank fixed`, hash `sha256:zz-2` |
| 2a | pass | a one-call GM shadow replaced `zz-first` right after this tab's create; "another GM tab replaced this actor while it was written — writing it again on the live actor"; `created:['zz-first']`, `failed:[]`, one actor at `idForSlug`, the file's name, Item once, stamp |
| 2b | pass after the fix above | before it: correct outcome (`created:['zz-a']`, `updated:['zz-join']`, same id, file's name, Item, stamp) but the wait took 40 s. After deploy and reload: "no content hash … after 10479 ms", whole run 10.6 s. Repeat with the hash pre-stamped: `skipped:['zz-join']` in 70 ms |
| 2c | pass | both tabs fired at the same ms. Bridge tab: `created:['zz-same']` (and it rewrote after the other tab's replace). Second tab: "created this actor in the same instant — joining it as an update", `updated:['zz-same']`. One actor, one Item, one stamp; client and server reads agree |
| 3 | pass | after every run, in both tabs, `describe().hooks` is `[]` and `Hooks.events.createActor` holds only the three baseline listeners (ScenePacker, combat, feedback) |

Cleanup: the five ZZ actors deleted, the file deleted (404).
