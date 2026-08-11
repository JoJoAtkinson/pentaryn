---
created: 2026-08-11
last-modified: 2026-08-11
tags: ["#playbook", "#foundry", "#mcp", "#design"]
status: draft
---

# Foundry MCP Bridge — Fork Design

> The tool surface, repo placement and guardrails for forking `adambdooley/foundry-vtt-mcp`
> so Ardenhaven can be driven conversationally instead of clicked.

**Status: DESIGN ONLY — nothing implemented.**

**Supersedes [D1](foundry-vtt.md) ("do not fork").** Its reversal trigger fired exactly as
written — *"a workflow is genuinely blocked by an unexposed internal — `addActorsToScene` is the
likely first."* It was, twice: setting a scene grid, and placing a token for an existing actor.
Also re-opens **D8** (placement), whose stated premise — *"nothing to vendor without a fork"* —
no longer holds.

---

## Principles

1. **The fork exists to trend toward empty.** Every addition is either PR-able upstream or
   deliberately local, and it must be obvious which.
2. **Touch upstream's big files in one-hunk increments only.** `data-access.ts` (10,233 lines)
   and the 49-case switch in `backend.ts` are the rebase hazards. New code lives in new files.
3. **Readback everything.** Both verified failure modes in this stack are *silent*. Every write
   tool returns what actually landed, not what was sent.
4. **Recover what D4 gave up.** Hand-drawn walls live only in the world DB. Snapshots make them
   a committed, re-importable repo artifact again — without reversing D4.
5. **Fat tools, thin count.** New capability arrives as `action` enums, matching upstream's own
   `manage-actors` pattern.
6. **MCP is the interactive layer.** D3 stands — the deterministic importer owns actor content.

---

## The tools

### Tier 1 — build these, in this order

| # | Tool | New? | R/W | Mode | Purpose |
| - | ---- | ---- | --- | ---- | ------- |
| 1 | **`place-tokens`** | new tool | W | prep + live | Place tokens for **existing** actors on a scene. The module handler already exists and is registered (`queries.ts:57` → `data-access.ts:5223`) — no MCP tool calls it. Cheapest, highest-value item: server-side only, zero module changes. Params: `actorIds`/names, `sceneId?`, `placements` (`[{x,y}]` or `pattern: line\|scatter\|grid`), `hidden?`. |
| 2 | **`get-scene-details`** | new tool | R | all | Deep scene inspection: grid config, levels incl. `background.src`, full wall list with ids/coords/door states, full light list, tokens, notes, fog. Upstream's `get-current-scene` returns wall/light **counts only** and **no grid at all**. This is also the readback instrument for every other tool. Params: `scene?`, `include?`. |
| 3 | **`manage-scene`** | new tool — `create \| update \| delete \| export` | W (export R) | prep | The core gap. **`update`**: grid `{size,type,distance,units}`, padding, `tokenVision`, fog, environment, name, dimensions, initial view, and background — which on v14 routes to the **level**, not the scene. **`create`**: name + background + grid, writing `levels: [{name, background:{src}}]` inline. **`delete`**: guarded. **`export`**: full scene JSON → `foundry/scenes/<slug>.json`, committed. *That export is the D4-loss recovery.* |
| 4 | **`manage-scene-elements`** | new tool — `create \| update \| delete \| replace`, `type: wall \| light` | W | prep + live | Walls and lights. `update` on a wall's `ds` is the **live door toggle**. `replace` + a committed export is scene disaster recovery. |
| 5 | **`browse-assets`** | new tool | R | prep | Enumerate `Data/` via `FilePicker.browse` (already used internally). Without it I can't pick a background from your 1,379-image library. |
| 6 | **`get-chat-messages`** | new tool | R | live | Read `game.messages`. Closes the fire-and-forget gap — `use-item` returns "initiated" and `request-player-rolls` posts buttons that nothing reads back. Makes *"what did Bargh roll?"* answerable. |

**Authoring stance:** walls are still **drawn by hand** (D4 stands — conversational tracing of
60 coordinate-blind segments is worse than the CV pipeline that already failed).
`manage-scene-elements` exists for **door toggling, one-off fixes, and restore-from-export** —
not for tracing maps. Lights are the opposite: few, point-shaped, easy to describe
(*"dim lantern over the bar, warm, radius 15"*) — conversational authoring fits.

### Tier 2 — after Tier 1 proves out

| # | Tool | New? | Purpose |
| - | ---- | ---- | ------- |
| 7 | `manage-combat` | new — `status \| start \| advance \| end` | Foundry's combat tracker. ⚠️ **Read the regret flag below before building** — it must own turn-order *display* only, never HP. |
| 8 | `send-chat` | new | GM narration/whispers into chat. |
| 9 | `reset-fog` | new **action** on `manage-scene` | Reset fog exploration. |

### Tier 3 — listed so they aren't re-litigated

`manage-notes` (journal map pins) · `manage-tiles` · playlist/audio · roll tables ·
`manage-regions`. Build on demand only.

### Rejected — and why

| Rejected | Why |
| -------- | --- |
| **HP / damage tool** | `manage-actors update` already forwards `system` verbatim. More importantly HP source-of-truth belongs to the **combat-runner GUI** — a second write path guarantees mid-session divergence. *The item most likely to be requested and most worth refusing.* |
| **Full combat automation in Foundry** | Same reason. The GUI + `actions.jsonl` is a tested engine with pre-baked math; dnd5e's automation stack is where the `flat: false` trap lives. |
| **Conversational wall tracing / CV revival** | D4's reversal already fired. Hand-drawing won. |
| **`run-macro` / eval-JS escape hatch** | Would obviate every tool above *and* reintroduce unvalidated writes — the LevelDB mistake through the front door. No schema, no validation, silent failures by design, in a stack whose verified failure mode is silence. |
| **Generic undo / `TransactionManager`** | Upstream's is rollback-by-inverse scaffolding; LevelDB has no cross-document transactions, so "undo" is best-effort fiction. Snapshots are honest. |
| **ComfyUI anything** | D6. |
| **File upload** | `Data/` is served unauthenticated — don't build a faster path for putting things there. |
| **Measurement templates, player-facing UX** | Three level-1 players click their own buttons. |

---

## Context bloat — the answer to "can tools be grouped?"

**Don't build `load_domain` + `tools/list_changed`.** Three reasons:

1. **The client already solves it.** Claude Code defers MCP schemas — tools are advertised by
   name, schemas fetched on demand. The 30–60k-token failure mode assumes a client that inlines
   everything eagerly.
2. **The architecture fights it.** The backend builds `allTools` **once at startup** and serves a
   static list over the TCP control channel. Dynamic registration means per-client tool-list
   state plus `listChanged` notifications proxied through stdio.
3. **The standard isn't settled** — SEP-1300 / SEP-1821 are open proposals.

**The cheap lever instead:** a **`FOUNDRY_MCP_TOOL_FILTER`** env var of comma-separated
deny-globs applied where `allTools` is assembled. **~10 lines**, upstreamable, and it drops the
6 ComfyUI tools plus the wfrp4e/dsa5/cosmere/mgt2e system tools — **~12–15 names gone**
immediately. If a future client both eagerly loads schemas *and* the surface grows past ~80
tools, revisit; not before.

### Where the fat-tool pattern bites — honestly

- **`manage-scene`** — `create` requires name/background/grid; `update` takes everything
  optional; `export` takes almost nothing. JSON Schema can't express *"required iff
  action=create"*, so the schema reads as a soup of optionals. Mitigate with a zod discriminated
  union server-side and per-action requirements in the description.
  **Fallback: split `create-scene` out** if calls get fumbled in practice.
- **`manage-scene-elements`** — wall payloads (`c[4]`, sense enums) and light payloads (`x/y` +
  LightData) share **nothing** structurally. They're together because scene addressing, id-based
  update/delete, `replace` semantics and guards are all shared.
  **Fallback: split into `manage-walls` / `manage-lights`.**

Net footprint: **6 fat tools, 7–9 new names** against upstream's 49.

---

## Implementation order

| Step | What | Effort | Stop here and you have… |
| ---- | ---- | ------ | ----------------------- |
| 0 | Fork scaffolding: registry hook, logging hook, tool filter | ~150 lines — *the only upstream-file edits ever* | — |
| 1 | `place-tokens` | ~80, server-only | 22 imported actors placeable; D1's trigger resolved |
| 2 | `get-scene-details` | ~150 | real inspection + readback instrument |
| 3 | `manage-scene` (`update`/`export` first) | ~250 | **the three 100px grids fixed**; scenes snapshot-able |
| 4 | `manage-scene-elements` | ~250 | live door toggling; hand-drawn walls insured |
| 5 | `browse-assets` | ~80 | *"make a scene from that lumber-camp map"* end to end |
| 6 | `get-chat-messages` | ~80 | roll results readable |
| 7 | Tier 2 on demand | — | — |

Steps 1–3 are the genuine unblockers. If enthusiasm dies after step 5, nothing above is stranded.

---

## Logging

**MCP-server-side JSONL, written into pentaryn, exposed as a file — not a tool.**

- **Where:** `foundry/logs/mcp-YYYY-MM.jsonl`, path from `PENTARYN_MCP_LOG_DIR` in `.mcp.json`.
  Unset → logging off, which makes it an upstreamable opt-in.
- **Hook:** one hunk at the single point where every `tools/call` result is serialized — logs
  **every** tool call, upstream and fork alike.
- **Shape:** `{ts, tool, action, args, ok, summary, isError}`. Args truncated ~2 KB; journal
  bodies become `{length, sha1}`. **Failures logged too** — a refused delete is exactly what
  *"what happened last session"* needs.
- **Exposure: none.** Claude Code greps the file from the repo. Works with Foundry **down**,
  filters with real grep, costs nothing to build. A `get-action-log` tool would be a second door
  to the same file.

### Failure modes — stated, not hedged

| Gap | Mitigation |
| --- | ---------- |
| **Hand edits are invisible** — walls drawn in the UI never pass through MCP. The biggest gap, and not closable server-side. | The committed `export` snapshots are the change record for hand work. `git diff` between snapshots beats any event log. **Log = what MCP did; snapshots = what you drew.** Neither alone suffices. |
| Player/GM client actions invisible (rolls, token drags) | Chat *is* Foundry's log of these; `get-chat-messages` reads it. |
| Bridge down | **Not a gap** — no bridge means no tool calls to miss. Failed calls still log. |
| Stale singleton backend logging to an old path | Log the resolved path in the backend's startup line. |
| Uncommitted log drift | Fold `git add foundry/logs foundry/scenes` into the session-end ritual. |

---

## Repo placement — sibling clone, **not** submodule

| Option | Verdict |
| ------ | ------- |
| **Sibling clone + pin file** | ✅ **Chosen.** Fork is fully version-controlled in its own repo; pentaryn records which state is live. |
| Git submodule | Runner-up. Buys native SHA pinning. Costs: perpetual `modified: vendor/…` noise in a status you read closely; detached-HEAD friction during rebases; and **`node_modules/` + `dist/` inside pentaryn's tree**, where Claude Code's globs and the lore-indexing scripts can wander into a 10,233-line file. **Reversal trigger:** if the sibling being on the wrong ref bites twice, switch. |
| Git subtree | ❌ Merges upstream's churn into pentaryn's history; rebasing a series through subtree merges is misery. |
| Vendored copy | ❌ Severs the upstream connection precisely when tracking an active upstream is the plan. |
| npm link/pack | ❌ Indirection with no consumer; `.mcp.json` wants a file path. |

**pentaryn gains:**
- `foundry/mcp-fork.lock` — fork remote, branch, SHA, upstream base tag, build command
- `make mcp-build` — checkout pinned ref, `npm install && npm run build`, assert `dist/` fresh
- `make mcp-status` — HEAD vs lock, dist vs src mtime, backend port liveness. Catches the
  *"edited the fork, forgot to rebuild, stale backend still serving old tools"* trap.

`.mcp.json` is **untouched** — it already points at the sibling's absolute `dist/index.js`.
Build artifacts stay uncommitted everywhere.

---

## Maintainability — three one-hunk edits, ever

1. **`backend.ts` — 2 hunks, ~8 lines.** Spread `...forkTools.getToolDefinitions()` into
   `allTools`; replace `default: throw` with *try the fork registry first, then throw*. The
   49-case switch is never otherwise edited — so adding action N+1 to `manage-scene` touches
   **zero** upstream lines.
2. **`main.ts` — 1 hunk, 1 line.** `registerForkHandlers()` beside the existing registration.
   The module side is *already* a name-keyed registry.
3. **`data-access.ts` — 0 hunks.** All new Foundry API code lives in
   `packages/foundry-module/src/fork/`. `place-tokens` needs nothing — it calls the
   already-registered `addActorsToScene` query by name.

**Branch discipline:** fork `master` mirrors upstream, never committed to. Work on branch
`pentaryn` as a clean series, ≤12 commits, one per concern. **Rebase — never merge — onto
upstream release tags only.** After each rebase: build, Gate-0 smoke test, tool-list diff.
Tag `v0.8.3-pentaryn.N`; the lock pins the tag.

### Upstreaming — one PR per concern

| Send | Why they'll take it |
| ---- | ------------------- |
| 🐛 **v14 wall-mapping bugfix** — **send first** | Upstream's `createSceneWalls` (`socket-bridge.ts:361-415`) writes **`sense`**, which does not exist in the v14 Wall schema (it's `sight`/`light`/`sound`/`move`) so it's **silently stripped**, and defaults `move: 0` = `NONE` — **walls that block nothing.** Small, obviously correct, builds goodwill. |
| `place-tokens` | Exposes their own dormant, already-registered handler. |
| `manage-scene`, `manage-scene-elements` | Their roadmap is scene-ambitious; these are the manual complement. Note upstream still targets v13, so PRs must handle the v13/v14 background split. |
| Tool-filter env + opt-in JSONL logging | Generic, off by default. |
| The `flat`/`proficient` fix for `dnd5e-add-feature` | Cheap PR from the same fork; retires the workaround's fragility. |
| **Keep local** | Snapshot conventions, table-mode defaults, `mcp-fork.lock` machinery. |
| **Don't send unsolicited** | A refactor of their switch into a registry. It's their house style. |

Every accepted PR is a commit dropped at the next rebase — the fork trends toward three hooks.

---

## Guardrails

Threat model: GM-authority bridge, no document-type allowlist, `allowWriteOperations` **not**
gating the generic path, no cross-document transactions, and hand-drawn walls whose only backup
is a tarball.

1. **Snapshot-before-destroy, automatic.** `manage-scene delete` and
   `manage-scene-elements replace` run the export path first and write
   `foundry/logs/snapshots/<scene>-<ts>.json` before touching anything. Converts the worst
   realistic accident — wrong-scene deletion vaporising hours of hand-drawn walls — from
   *"restore last week's tarball"* to *"re-import a JSON file."*
2. **Table mode is a human-held switch, not a tool.** A Foundry world setting toggled in the
   settings UI, deliberately **not** exposed over MCP — *otherwise the model it guards against
   can flip it.* Auto-engages while any non-GM is connected. Blocks scene create/delete/grid
   changes and bulk wall ops; **allows** door toggles, token placement, light updates, all reads.
   **Keep the blocked list tiny** — if it blocks something legitimate twice in a session, the
   `override` habit forms and the guard is dead.
3. **Destructive ops require `confirm: "<exact scene name>"`** — forces the caller to commit to
   the specific victim by name.
4. **Readback in the response contract.** Every fork write returns `{ok, ids, verified, warnings}`
   where `verified` comes from re-reading. Catches v14's silent key-stripping — *the exact bug in
   upstream's own wall code* — at call time instead of at the table.
5. **Ordering instead of atomicity.** One `Scene.create` with inline embedded docs; multi-step
   creations go inert-first (`navigation: false`) and activate last; replacements are
   **create → verify → delete**, never delete-first.
6. **Caps.** `elements` arrays ≤300 per call; `dryRun: true` on bulk ops. Available, not default.
7. **Checks, not code.** Confirm 31414/31415 bind loopback-only. And the fork **module** must be
   sideloaded — leaving Foundry's module-update button alone, or an upstream update silently
   clobbers fork handlers while the fork server still advertises their tools.

---

## Things you may regret — flagged now

1. **Two combat engines.** The combat-runner GUI owns initiative, HP and action mechanics;
   Foundry owns tokens, fog and what players see. If `manage-combat` ever tracks HP, the two
   **will** diverge mid-session and you'll trust neither. Decide before building: Foundry's
   tracker is a *display synced from the GUI's truth*, or don't build it.
   **The single likeliest regret in the design.**
2. **Snapshot theater.** Exports never refreshed become stale insurance that fails exactly when
   needed. Bind exporting to the session-end ritual, or demote snapshots to
   "auto-created before destructive ops only" and stop pretending they're current.
3. **Fat-tool schema soup.** `manage-scene`'s union is the known weak point. Split `create-scene`
   out early rather than growing the description into a manual.
4. **Guard fatigue.** See #2 under Guardrails.
5. **Fork drift disguised as stability.** Skipping rebases feels free until a module manifest
   forces a Foundry version bump. Rebase on every upstream *release*.

---

## Related

- [foundry-vtt.md](foundry-vtt.md) — the parent playbook. **D1 and D8 need amending on acceptance.**
- [`foundry/CONTRACT.md`](../foundry/CONTRACT.md) — actor pipeline contract
