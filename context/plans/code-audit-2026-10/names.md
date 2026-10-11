---
title: "Code audit 2026-10 — pentaryn-names"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — pentaryn-names

**Read this when:** you are about to refactor, harden or document pentaryn-names and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### pentaryn-names

**Purpose.**

When an actor is renamed, it relabels the prototype token and every placed token whose label was the old full name, or the part before the first comma. Nicknames are left alone.

**Health.**

Tiny (60 lines) and readable, but it has no tests: relabel and shortName are pure and are neither exported to node nor fixture-tested, and its ModuleSpec runs only the static gates. sync() runs fire-and-forget from a hook with no catch (an unhandled rejection). Renaming an unlinked token's synthetic actor may relabel sibling tokens; this needs live confirmation.

**LLM interface.**

game.pentaryn.names.{sync(actor, old, new), relabel, shortName}. sync needs an Actor document and returns a count. There is no dry-run preview. That is fine for its size; it needs a README API line with return shapes and the publish helper.

**How to extend.**

Today everything goes in names.mjs. It should become names-core.mjs (pure rules plus a planner) with test/run.mjs and a node-test gate, while names.mjs keeps the two hooks and the API.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| transform-creatures-32 | Maintainability gains | medium | S | names has pure rules but no core, no tests, and only static gates |
| transform-creatures-33 | Logging / auditability gains | low | S | Fire-and-forget sync() from a hook: a failure becomes an unhandled rejection |
| transform-creatures-38 | LLM interface | low | S | names: sync() needs an Actor document, and nothing tells an LLM that a rename already relabels |

## Maintainability gains

### transform-creatures-32 — names has pure rules but no core, no tests, and only static gates

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S

**Where:** `foundry/module/pentaryn-names/names.mjs:12–16`

**Anchor:** `function relabel(label, oldName, newName) {`

**Current.**

shortName and relabel are pure but private to names.mjs, which calls Hooks at import. The token-selection loop in sync (lines ~25-36: actorId match, canUserModify, relabel, skip if unchanged) is a pure planner. scripts/foundry/ops/config.py:~179-188 sets `check=_STATIC` with no node-test. Quirks unpinned: relabel('',',x','y') returns 'y'; an old name with surrounding spaces makes the short form differ from the full name; synthetic (unlinked) token actors share the base actor id so a rename relabels all sibling tokens with that id (confirm live; planner behaviour only).

**Proposed.**

Create names-core.mjs exporting shortName and relabel (moved verbatim) and `planTokenRelabels(tokens,{actorId,oldName,newName,canEdit})` returning [{_id,name}] with the same skip rules. names.mjs imports them and keeps hooks and API. Add test/run.mjs and set the spec to `check=(*_STATIC, "node-test")`.

**Behaviour test recipe (write first, must pass before and after).**

New foundry/module/pentaryn-names/test/run.mjs (copy the check() harness from the transform test). shortName('Glubbek, Kuo-toa Net-Mender') 'Glubbek'; shortName(null) ''; shortName(' A , b') 'A'. relabel('Bob','Bob','Rob') 'Rob'; relabel('Glubbek','Glubbek, Net-Mender','Brakka, Elder') 'Brakka'; relabel('Glubbek, Net-Mender','Glubbek, Net-Mender','Brakka, Elder') 'Brakka, Elder'; relabel('Fishface','Glubbek, Net-Mender','X') null; relabel('Bob','Bob, ','X') 'X'; relabel('',',x','y') 'y' (pinned quirk). planTokenRelabels([{id:'t1',actorId:'a',name:'Bob'},{id:'t2',actorId:'b',name:'Bob'},{id:'t3',actorId:'a',name:'Rob'},{id:'t4',actorId:'a',name:'Bob',locked:true}],{actorId:'a',oldName:'Bob',newName:'Rob',canEdit:t=>!t.locked}) -> [{_id:'t1',name:'Rob'}]. Sibling characterization: two tokens sharing actorId 'base' both named 'Goblin', old 'Goblin', new 'Goblin Boss' -> both relabelled (today's planner output, hands the synthetic-actor question to the live test).

**Risk.** Verbatim moves only; write fixtures against the current functions first, then delete the originals.

## Logging / auditability gains

### transform-creatures-33 — Fire-and-forget sync() from a hook: a failure becomes an unhandled rejection

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-names/names.mjs:48`

**Anchor:** `sync(actor, options.pentarynOldName, actor.name);`

**Current.**

The updateActor hook calls async sync() without await or catch. A permission error on the prototype update or a failed scene update surfaces as 'Uncaught (in promise)' with no module prefix and the toast is missing. Other modules use `.catch(err => console.warn(`${MODULE} | ...`, err))`.

**Proposed.**

`sync(actor, options.pentarynOldName, actor.name).catch(err => console.warn("pentaryn-names | relabel after rename failed", { actor: actor.uuid, from: options.pentarynOldName, to: actor.name }, err));` with a `const MODULE = "pentaryn-names"` prefix. Return value is unused.

**Behaviour test recipe (write first, must pass before and after).**

names.mjs has no imports, so import it in node after stubbing `globalThis.Hooks={on:(e,f)=>h[e]=f,once(){}}`, `globalThis.game={user:{id:'u'},scenes:[]}`. Call h.updateActor(actor,{name:'B'},{pentarynOldName:'A'},'u') with an actor whose update() rejects and prototypeToken.name 'A'. Assert process 'unhandledRejection' counter 0 and console.warn stub called once with the 'pentaryn-names |' prefix.

**Risk.** None.

## LLM interface

### transform-creatures-38 — names: sync() needs an Actor document, and nothing tells an LLM that a rename already relabels

**Category:** LLM interface · **Impact:** low · **Effort:** S

**Where:** `foundry/module/pentaryn-names/names.mjs:18–59`; `foundry/module/pentaryn-names/README.md:14`

**Anchor:** `  const api = { sync, relabel, shortName };`

**Current.**

`game.pentaryn.names.sync(actor, oldName, newName)` dereferences `actor.prototypeToken` (line 20), so an id, uuid or name throws a TypeError, and the call returns a bare count. The hooks at lines 42–49 already relabel on the client that made the rename. An LLM calling `actor.update({name})` through eval-js on the GM bridge is that client, so a follow-up `sync()` finds nothing to change and returns 0. `README.md:14` lists the three functions with no return shapes and does not mention this. `relabel` and `shortName` are pure and safe to call as a preview, but nothing says so.

**Proposed.**

At the API boundary only, resolve the first argument of `sync` through `lib/resolve.mjs resolveActor` (documents pass through unchanged). Publish `version` and `describe()` through the kit. README API block: `sync(actorRef, old, new) → number of labels changed (prototype + placed tokens this user can edit)`. Also: "renaming through `actor.update` already relabels on the renaming client, so call this only to repair", and "preview with `relabel(label, old, new)` → new label, or null for a nickname".

**Behaviour test recipe (write first, must pass before and after).**

`test/run.mjs` (created by transform-creatures-32) with stubs `game.actors = { get: id => A, getName: n => A }`, `game.scenes = []`, `ui.notifications.info` spy, `A = { id: "a", prototypeToken: { name: "Bob" }, update: async () => {} }`:
- `api.sync(A, "Bob", "Rob")` → 1, before and after.
- `api.sync("a", "Bob", "Rob")` throws a TypeError before (pinned) and returns 1 after. **[declared]:** only the throw on non-document input changes.
- `describe().methods.map(m => m.name)` deep-equals `["sync", "relabel", "shortName"]`.

**Risk.** Additive at the boundary.

**Related:** transform-creatures-32, transform-creatures-20

## Categories checked with no finding

- **Performance:** checked `sync()` (`names.mjs:18–39`). It runs once per rename on the renaming client and makes one `updateEmbeddedDocuments` call per scene that has changes. Nothing found.
- **Defragmentation:** checked. `shortName` differs deliberately from attunement's name rule (items-journal-15, dropped). The publish guard (lines 53–59) is absorbed by the kit. Nothing found.
- **Hardening:** checked. Only the renaming client acts (the userId check, line 47). Tokens are filtered by `canUserModify(game.user, "update")` (28). The prototype write carries `pentarynNames`, so `updateActor` does not re-enter (22, 47). The synthetic-actor sibling question was handed to the live-test workflow (transform-creatures-34, dropped). Nothing found.
- **Extendability:** the extension path (names-core, a planner and a node-test gate) is transform-creatures-32. Nothing further.
- **Documentation / skills:** checked `README.md` (16 lines: the rule, who acts, the API, sync). The missing routing row is transform-creatures-20 (filed under transform); transform-creatures-38 adds the return shapes. Nothing further.
