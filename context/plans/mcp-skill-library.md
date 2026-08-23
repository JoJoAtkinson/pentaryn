---
created: 2026-08-23
last-modified: 2026-08-23
tags: ["#foundry", "#mcp", "#design", "#rejected"]
status: settled — do not build
---

# eval-js Skill Library — Settled: Don't Build It

**Read this when:** you are tempted to cache successful `eval-js` snippets into a
dynamic lookup ("repeat calls strengthen a command", "last successful one wins",
"never promote to real tools"), or someone proposes it again. This doc is the reason
it was not built, with the corpus numbers that settled it.
**Not this file:** operating the bridge → [`../foundry/README.md`](../foundry/README.md) ·
why the fork exists → [`foundry-mcp-fork.md`](foundry-mcp-fork.md)

> **Verdict: don't build.** Not "build it carefully" — don't build it. The proposal's
> load-bearing assumption is that eval-js calls repeat. They don't. Everything else
> (verification, ranking, taxonomy, invalidation) is machinery for a cache that would
> have hit approximately once in the entire measured corpus.

## The corpus

312 `eval-js` calls in `foundry/logs/eval.jsonl` (2026-08-11 → 08-14, the logged
window; logging was off 08-14 → 08-22). 325 fork-tool calls in
`foundry/logs/mcp-2026-08.jsonl`. Caveat from the README stands: this is three days
of scene-building and pregen construction, one kind of work — but it is exactly the
work the cache was proposed for.

| Question | Number | What it means |
|---|---|---|
| Exact duplicate scripts | **0 of 312** | Frequency-strengthening has literally nothing to strengthen. |
| Calls with a near-duplicate elsewhere in the corpus (token Jaccard ≥ 0.7) | 12 (4%) | The only meaningful repeats… |
| …of those, nearest neighbour within 30 min | 10 of 12 | …are the same session iterating. The snippet is already in the agent's context window; a cache adds a lookup to reach what it already has. |
| …nearest neighbour on a **different day** | **1 pair (0.6%)** | The cross-session repeat rate — the only case a cache serves. One hit. |
| Reads vs writes | ~2⁄3 read, ~1⁄3 write | Matches the README's "59% one-off reads". |
| Verification/inspection purposes | 121–139 (39–45%) | The agent already self-verifies, heavily, with zero mechanism. |
| Write scripts that read back state after mutating | 80 of 110 (73%) | Snippet-carried postconditions already happen organically. |
| Schema/API-discovery calls ("what shape is X") | 52 (17%) | **The thing that actually repeats** — see below. |
| Hard errors | 11, all schema-shape surprises (`.map is not a function`, "not a valid embedded Document") | Every one followed by a self-corrected retry within minutes. |
| Purpose-built tool usage in the same window | 2 `place-tokens` vs 323 `eval-js` | The typed tool lost to the escape hatch, not the reverse. |

Reading the 312 purposes chronologically shows why nothing repeats: the corpus is
**workflow arcs, not commands** — a 687-scene v9→v14 migration, a full PHB rebuild of
8 pregens, a 100-token art-and-placement pass, an Argon HUD debugging session. Each
call is bespoke to its moment in the arc. What recurs is the *template* ("verify this
PC's HP/AC/to-hit after rebuild") and the varying part — which PC, which numbers,
which just-made change — is the entire point of the call.

## Why each proposed mechanism fails against this corpus

**"Successful call gets added to a lookup."** The `ok` field means "didn't throw",
nothing more. Proven in the log itself: the deliberate error-handling test
(`return game.nonexistent.property.chain`) logged **`ok: true`** in
`mcp-2026-08.jsonl` — the truth lived only in the summary text. And below the
transport, Foundry writes fail silently while returning success:
`updateEmbeddedDocuments` silently no-opped on Belkrig's Bridges token textures —
**eight consecutive `ok:true` calls** (retry, diff:false, live-placeable path,
animation-stop) before delete-and-recreate worked. Roughly a third of `ok:true`
writes in the corpus are followed within 15 minutes by an explicit
diagnose/fix/retry call. "Successful" is not observable from the call record.

**"Repeat calls strengthen; count reveals the proper way."** With zero exact repeats
there is no count. Worse, when near-repeats do occur they are debugging iterations —
frequency would crown the most-*retried* variant, i.e. the one that worked least.

**"The last one that occurs is assumed successful."** The last call in the Belkrig
saga was *delete the token and recreate it* — a scorched-earth workaround, correct
for that stuck-animation state and destructive anywhere else. Last-one-wins caches
the workaround as the canonical method.

**"Fixed categories: read/write/mod × map/character/monster."** Bucketing the real
purposes: 45% verification, 18% scene-building, 17% actor-building, 17% schema
discovery + module management, 5% other. The proposed taxonomy has no cell for the
two biggest buckets (verification and discovery), which is how taxonomies drift
into "other".

**"Enforce the LLM telling it whether it was successful."** Unnecessary, and the
corpus proves it: 73% of write scripts already return before/after state, and 45% of
all calls are voluntary verification reads. The agent brings verification for free
when it's the one that just made the change. A cached snippet *replayed later by a
different session* loses exactly that context — which is the deep reason retrieval
of old write-snippets is worse than regeneration, independent of any success signal.

## What the log is actually asking for (do these instead)

1. **A schema facts file, not a code cache.** The one genuine cross-day repeat class
   is knowledge re-derivation: advancement-data shape was probed ~8 times across two
   days; spell-preparation schema **6 times within one hour** on 08-13 (context loss
   mid-session). All 11 hard errors are the same class. The re-usable artifact is a
   *fact* ("dnd5e 5.3.3: spell prep is `system.method` + `system.prepared`; inline
   `preparation.mode` at creation gets overridden — update post-creation", "v14
   scene backgrounds live on the Level embedded document, not the scene"), not the
   throwaway probe script that learned it. Facts diff cleanly on upgrade, are
   readable in one glance, and cost nothing to verify. Put them in
   `context/foundry/` with a version stamp per fact; prune on Foundry/dnd5e
   upgrades. This captures ~17% of the corpus — the cache would have captured 0.6%.

2. **Keep the existing promotion loop; it is already the right design.** "Every call
   is logged with its stated purpose so recurring uses can be promoted" — the clause
   Joe was questioning — survives contact with the data *because it has a human
   reading the log*, which is exactly the judgment step the dynamic cache tried to
   automate away. The log's actual promotion signal so far is inverted: `place-tokens`
   was abandoned after 2 uses because real placement needed landmark-aware positions
   the tool couldn't express. That is a spec for a better tool parameter, which only
   a reader of the log would notice — no frequency counter would.

3. **Tool proliferation is a problem Joe does not have.** The fork surface is small
   and `eval-js` is winning 323:2. The strategic risk here is the opposite of
   proliferation: typed tools so thin the agent routes around them. Promotion should
   stay rare, deliberate, and driven by "eval-js kept being used for X *and a typed
   version would have prevented a real failure*" — the silent-write class is the
   one that qualifies (cf. fork principle 3: readback everything).

## Decision taken (2026-08-23)

Joe's call on reading the verdict: **eval-js becomes the fork's only function.**
`place-tokens` was retired (fork commit `36e3fa2`, file recoverable from git history),
`PENTARYN_MCP_LOG_DIR` is confirmed set in `.mcp.json`, and the tool question is
parked until a revisit **~2026-09-22** against a clean month of eval-js-only log.
This intentionally runs the single-function surface as the experiment: if typed tools
are worth having, a month of steady-state log has to prove it.

## The revisit (~2026-09-22)

Flip the verdict only if a **steady-state month** (running the campaign, not
building it) shows cross-session near-repeat rate materially above ~10% — measure it
the same way: Jaccard ≥ 0.7 nearest-neighbour on a different day, from `eval.jsonl`.
If it ever is built: reads only (never auto-execute retrieved writes),
snippet-carried postconditions as the success gate, version-stamp every entry with
Foundry + dnd5e versions, rank by last-verified-against-current-version, and treat
the corrective-call-follows pattern in the log as a poison signal. But the burden of
proof is on the corpus, and today's corpus says no.

### Rejected — and why

| Rejected | Why |
|---|---|
| Dynamic snippet cache keyed by past eval-js calls | 0 exact repeats, 0.6% cross-day near-repeats — nothing to cache. |
| Frequency-based ranking ("repeats strengthen") | Frequency measures retries and probes, not correctness; nothing repeats anyway. |
| Last-successful-wins | Would canonicalize the delete-and-recreate workaround from the Belkrig saga. |
| `ok:true` as the admission gate | Field means "didn't throw"; logged `ok:true` on a deliberate runtime error and on 8 silent no-op writes. |
| Forced LLM self-report of success | Same model marking its own homework; redundant — 73% of writes already read back state. |
| Human-in-the-loop success confirmation | Joe's own call: annoying. Also redundant given the above. |
| Fixed read/write × map/character/monster taxonomy | No cell for verification (45%) or discovery (17%), the two biggest real buckets. |
| "Never convert to actual tools, keep it dynamic" | The log's one clear finding is a typed-tool spec gap (`place-tokens` positions), findable only by promotion review. |
| Voyager-style embedding-retrieved skill library | Right shape for a stable API and repeating tasks; this API upgrades underneath (v14→v15, dnd5e 5.x→6) and the tasks don't repeat. Cached snippets rot silently; a schema'd tool fails loudly. |
