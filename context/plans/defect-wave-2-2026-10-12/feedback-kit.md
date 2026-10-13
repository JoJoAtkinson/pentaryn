# Defect wave 2 (2026-10-12) — feedback-kit

**Read this when** you want the history of defect wave 2 for the feedback-kit group: the
pentaryn-feedback ingest relay's sender check, made possible by kit 1.2.0 forwarding core's query
context. History, not instructions — the use-doc is `foundry/module/pentaryn-feedback/README.md`.

Built on branch `fix2/feedback-kit-2026-10-12`, on top of the kit group's branch
(`fix2/kit-2026-10-12`, kit 1.2.0 — see [`kit.md`](kit.md)); merge the kit branch first.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| feedback-async-2 | The `pentaryn-feedback.ingest` relay query had no sender check: any player could ask the GM to file another player's queued bug reports (the kit did not pass core's `{ user }` context through). | Take the recommendation: once kit 1.2.0 forwards the context, a non-GM may only ask for their own queue. | If a player asks the GM to file someone else's queued reports, the GM answers REFUSED. The player's own request, any GM's request, and the bridge's request (no context) are filed as before. | `d02e7d5c` | `test/api.test.mjs` "feedback-async-2: the relay checks its sender …" |

**Goldens changed:** `foundry/module/pentaryn-feedback/test/golden/describe.json` — the `ingest`
doc line now reads "that user or a GM may ask; another player gets REFUSED".

**Declared behaviour change:** yes (CHANGELOG `[declared]`, README pitfall updated from kit 1.1.0
to 1.2.0).

## Live check after deploy

Needs a Foundry restart (vendored kit 1.2.0 changed). One GM tab only; no report is written by
these calls.

1. On the GM tab via eval-js:
   `CONFIG.queries["pentaryn-feedback.ingest"]({ userId: game.user.id }, { user: { id: "ZZnotme", name: "ZZ", isGM: false } })`
   → `{ ok: false, code: "REFUSED", … }`.
2. Same call with no second argument → `ok: true` with empty `filed` / `refused` lists.
3. Confirm no new file appeared under `Data/pentaryn-feedback/<worldId>/` (e.g. `feedback_list`
   count unchanged).
