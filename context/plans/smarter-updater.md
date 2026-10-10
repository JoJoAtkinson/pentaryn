---
title: "Smarter Saturday updater — tiered escalation"
status: v1 built (2026-10-10) — v2/v3 designed
last_modified: 2026-10-10
tags: [context, plans, foundry, automation, updates, llm]
---

# Smarter Saturday updater — tiered escalation

**Read this when:** building or reviewing the tiered-agent version of the unattended
Saturday updater: the triage step, the escalation tiers, their models and effort, the
adjustments registry, the "Still needed?" phase, and the safety fences around all of it.
**Not this file:** how the updater works today → `../foundry/automated-updates.md` ·
running it → `../../automation/README.md` · the October 2026 attended update that is the
worked example → `foundry-update-2026-10.md`.

> Plan, not a use-doc. When it ships, the use-doc is a new section in
> `../foundry/automated-updates.md` and the policy comments in `foundry/update-policy.yml`.

## The idea in one paragraph

Today's run has exactly two LLM steps, both Opus, both tool-less: the adjudicator grades
`review` items from release notes, and the report writer turns the run record into prose.
Everything else is Python. That stays. What changes is that, between adjudication and apply,
a **cheap tool-less triage agent** reads the plan and the release notes and decides whether
this run needs a bigger brain at all. Most Saturdays it says `none` and the run proceeds
exactly as today, at today's cost plus a fraction of a cent. When an update touches
something we have adjusted (the Argon HUD, the admin API our scripts drive, Item Piles,
Dice So Nice, dnd5e's chat cards), it escalates through up to three more tiers: an Opus
impact analysis, a Fable go/no-go, and an Opus fix-and-verify. Each tier is bounded by a
model, an effort level, a timeout, a dollar budget and the run window, each one fails
closed to the tier below it, and every tier that can touch code or the world **never sees
raw release-note text** — only a structured digest a tool-less agent produced and Python
validated.

The design rule that makes the rest safe: **the LLM tiers can only ever hold more, fix in
a sandbox, or write a plan. They can never widen what gets applied beyond what `risk.py`
and the adjudicator already allowed.** That is the same rule the adjudicator lives under
today, extended.

## Tiers

| Tier | Name | Model · effort | Tools | Reads | Produces | Typical cost |
|---|---|---|---|---|---|---|
| T0 | **Triage** | Haiku 5.5 · `low` (fallback Sonnet 5.5) | none, no MCP | plan facts + raw release notes + the adjustments registry | `triage.json`: tier, per-package risk, scrubbed digest | $0.002 |
| T1 | **Analyze** | Opus 5.5 · `high` | none, no MCP | plan facts + raw notes + a Python-bundled excerpt of *our* source the registry names | `analysis.json`: per-area impact, Still-needed verdicts, fix steps, a ready-to-run plan | $0.35–0.75, cached per version pair |
| T2 | **Decide** | Fable 5.1 · `high` | none, no MCP | `analysis.json` + plan facts, **never raw notes** | `decision.json`: go/no-go per package, unattended-vs-hand per fix | $0.20–0.35 |
| T3a | **Fix** | Opus 5.5 · `high` | Read/Edit/Write/Grep/Glob + allow-listed Bash in a git worktree; no MCP, no web | `analysis.json` + `decision.json` + the worktree | a commit on `auto-update/<run_id>` | $2–6, capped at $8 |
| T3b | **Review** | Opus 5.5 · `xhigh` | none, no MCP | the diff + `analysis.json` | `review.json`: ship / park, findings | $0.25–0.50 |
| T3c | **Verify** | Python (module checks, four-world smoke); Sonnet 5.5 · `low` only to explain a failure for the report | none for the LLM | check and smoke output | pass/fail, explanation | $0.05 |
| — | Adjudicator (exists) | Opus 5.5 · `medium`, set explicitly | none | raw notes | apply/hold per `review` item | $0.05–0.10 |
| — | Report writer (exists) | Opus 5.5 today; **Sonnet 5.5 · `medium`** proposed | none | run record incl. raw notes | the Saturday markdown | $0.05–0.20 |

Why these models, in Joe's terms: triage is a classification bounded above and below by
Python, so the cheapest model with a fallback is right; analysis is reading unfamiliar code
against unfamiliar notes and must be right about APIs, which is Opus at `high`; the go/no-go
weighs trade-offs between a session on Sunday, a fix branch and a rollback, which is the
judgment call Fable is for; the fix is building, Opus `high`; the review of that fix is
adversarial, Opus `xhigh`; verification is mechanical and stays in Python, with Sonnet only
to turn a wall of console text into two sentences. Opus 5.5's default effort is `medium`,
so every call sets `--effort` explicitly rather than inheriting.

`tier` is an ordered enum: `none < analyze < decide < fix`. "Reaching tier X" means every
lower tier ran first. `decide` and `fix` are **build-later** (see the end); the design here
is complete so the v1 code leaves the right seams.

## Where it sits in the run

```
GATE → BACKUP → SCAN → ADJUDICATE → [TRIAGE T0] → [ANALYZE T1] → [DECIDE T2] → SNAPSHOT
      → APPLY → [FIX T3a → REVIEW T3b → SYNC] → SMOKE (+ module checks) → RECOVER?
      → REPORT (+ escalation section, + plans) → NOTIFY → SHUTDOWN
```

* Triage runs **after** the adjudicator, on the final `auto` set (what will actually be
  installed) plus the `hold` set (so a held major can still get a plan written). It cannot
  move anything into `auto`.
* T1 and T2 run **before** the per-package snapshot and apply, so a `no-go` costs nothing
  to undo. Their only effects on the run are to move packages from `auto` to `hold` and to
  attach plans.
* T3 runs **after** apply and **before** smoke, in a git worktree, and its sync into
  `Data/modules` is itself covered by the smoke: a failed smoke rolls back the package (as
  today) *and* re-syncs the module from `HEAD`.
* Every tier writes its phase (`escalate/triage`, `escalate/analyze`, …) to
  `.state/vtt-update.status` and heartbeats it every 60 s while a `claude` subprocess is
  running, so the 06:12 watchdog's "20 minutes without a phase change" rule still works.

## Inputs to triage

Two kinds, and the distinction is the whole security model: **facts** are computed by
Python from things we control and are trusted; **notes** are third-party text and are not.

### Facts (Python, deterministic, trusted)

For every decision in `auto` or `hold` with a target:

| Field | Source |
|---|---|
| `id`, `type`, `installed`, `target`, `bump`, `bucket`, `protected` | `plan.decisions` |
| `notes_count`, `notes_chars`, `notes_url` | `plan.upstream[id].notes` |
| `adjustments[]` | the adjustments registry rows whose `package` is this id (or `core`/`dnd5e`) |
| `exposure[]` | pentaryn modules and `scripts/foundry` files whose source mentions this package id (`grep -l`, cached per run); the registry is the curated list, exposure is the safety net for a row nobody wrote yet |
| `keyword_hits` | counts of `breaking`, `deprecat`, `remov`, `renam`, `migrat`, `hook`, `flag`, `API`, `libWrapper`, `socket` in the notes — counts only, never the text |
| `preview_notes` (core only) | `risk.preview_findings` |
| `history` | last outcome this package had in `foundry/logs/auto-updates/*.json` (applied clean / rolled back / held), if any |
| `cached_analysis` | whether `.state/vtt-update-analysis/<key>.json` exists for this version pair |

And run-level: `core` and `system` versions, the four worlds, `now`, the window end, and
`minutes_remaining` after the smoke reserve.

### The adjustments registry — `foundry/adjustments.yml`

The hand-maintained list of every place our code leans on, patches, works around or
extends a third-party package. This is what makes "touches a package we have adjusted"
machine-checkable, and it is the input to the Still-needed phase.

```yaml
# One row per adjustment. `package` is the upstream id, or `core` / `dnd5e`.
# `native_when` is what to look for in release notes that would mean the package now does
# this itself. `retire_class`: safe = a flag/CSS/one-liner whose removal the module's tests
# cover; guarded = needs a human to confirm at the table; never = load-bearing.
- id: argon-panel-injection
  package: enhancedcombathud-dnd5e
  module: pentaryn-transform
  files: [foundry/module/pentaryn-transform/hud.mjs]
  what: Wild Shape / Starry Form buttons injected via render*ArgonComponent hooks; subclasses Argon's closure-private button classes via CONFIG.ARGON
  why: Argon exposes no add-a-button API
  native_when: an "add button to panel" API, or a dnd5e transform/wild-shape panel of its own
  retire_class: never
  check: make foundry-transform-check
- id: argon-target-picker-cancel
  package: enhancedcombathud-dnd5e
  module: pentaryn-transform
  files: [foundry/module/pentaryn-transform/hud.mjs]
  what: synthetic right-button mouseup to cancel the target picker before a form swap
  native_when: a public cancelTargeting()/cancel API
  retire_class: guarded
- id: argon-bonus-used-tracking
  package: enhancedcombathud
  module: pentaryn-transform
  files: [foundry/module/pentaryn-transform/transform.mjs, foundry/module/pentaryn-transform/hud.mjs]
  what: re-marks "bonus action used" after Argon rebuilds the HUD on a token swap
  native_when: bonus-used state kept on the actor/combatant rather than the panel instance
  retire_class: guarded
- id: argon-portrait-hp
  package: enhancedcombathud
  module: pentaryn-transform
  files: [foundry/module/pentaryn-transform/hud.mjs, foundry/module/pentaryn-transform/transform-core.mjs]
  what: repaints portrait HP so temp HP is not read as "111/99"
  native_when: portrait shows temp HP separately
  retire_class: safe
- id: argon-tooltip-clear
  package: enhancedcombathud
  module: pentaryn-transform
  files: [foundry/module/pentaryn-transform/hud.mjs]
  what: nulls ui.ARGON._tooltip so a stale tooltip does not survive a re-render
  retire_class: safe
- id: argon-toolbar-neighbour
  package: enhancedcombathud
  module: pentaryn-ties
  files: [foundry/module/pentaryn-ties/pentaryn-ties.mjs]
  what: Attribute Review button placed beside Argon's combat-hub tool
  retire_class: safe
- id: dsn-skip-blind-study
  package: dice-so-nice
  module: pentaryn-ties
  files: [foundry/module/pentaryn-ties/study.mjs]
  what: sets flags["dice-so-nice"].skip on blind Study rolls
  native_when: DSN hides blind rolls from the GM by itself
  retire_class: safe
- id: itempiles-corpses
  package: item-piles
  module: pentaryn-dropbin
  files: [foundry/module/pentaryn-dropbin/corpses.mjs, foundry/module/pentaryn-dropbin/dropbin.mjs, foundry/module/pentaryn-dropbin/loot.mjs]
  what: turns a 0-HP NPC into a pile, the corpse eye, Loot all
  native_when: Item Piles ships a native corpse/loot-all flow
  retire_class: never
- id: itempiles-attunement-repair
  package: item-piles
  module: pentaryn-attunement
  files: [foundry/module/pentaryn-attunement/attunement.mjs]
  what: repairs attunement on items that came through a pile
  retire_class: guarded
- id: dnd5e-armor-proficiencies
  package: dnd5e
  module: pentaryn-attunement
  files: [foundry/module/pentaryn-attunement/attunement.mjs]
  what: patches armorProficienciesMap
  retire_class: guarded
- id: dnd5e-chat-card-flags
  package: dnd5e
  module: pentaryn-aoe, pentaryn-senses, pentaryn-riders
  files: [foundry/module/pentaryn-aoe/resolve.mjs, foundry/module/pentaryn-aoe/attacks.mjs, foundry/module/pentaryn-senses/light.mjs, foundry/module/pentaryn-riders/riders.mjs]
  what: reads flags.dnd5e.* on chat messages; 6.x moves this to message.type/system
  retire_class: never
- id: dnd5e-importer-gate
  package: dnd5e
  module: pentaryn-importer
  files: [foundry/module/pentaryn-importer/pentaryn-importer.mjs, scripts/foundry/build_actors.py]
  what: refuses to run on a system version it was not built for
  retire_class: never
- id: core-admin-api
  package: core
  module: scripts/foundry
  files: [scripts/foundry/update/admin.py, scripts/foundry/ops/login.py, scripts/foundry/cloud.py, automation/smoke/smoke.mjs]
  what: the four documented assumptions about /setup, /auth, /join, /update and the socket; the Origin header; worldShutdown
  native_when: n/a
  retire_class: never
  check: pytest scripts/tests/
- id: core-portals-relative-uuid
  package: core
  module: pentaryn-portals
  files: [foundry/module/pentaryn-portals/portals.mjs, foundry/module/pentaryn-portals/portals-core.mjs]
  what: resolves relative region UUIDs that 14.368+ stores for same-scene links
  retire_class: never
- id: core-ties-flag-wipe
  package: core
  module: pentaryn-ties
  files: [foundry/module/pentaryn-ties/look.mjs, foundry/module/pentaryn-ties/preview.mjs, foundry/module/pentaryn-ties/known-core.mjs]
  what: recognises a whole-scope flag deletion with or without the -= marker (14.369 changed the shape)
  retire_class: never
- id: core-transform-unwrap
  package: core
  module: pentaryn-transform
  files: [foundry/module/pentaryn-transform/transform.mjs]
  what: _preUpdateOperation unwrap for a revert inside a region
  retire_class: guarded
- id: creatures-libwrapper
  package: lib-wrapper
  module: pentaryn-creatures
  files: [foundry/module/pentaryn-creatures/creatures.mjs]
  what: wraps core methods through libWrapper
  retire_class: never
```

This seed is from tonight's work and a grep; **every row must be verified against the
source before the registry is trusted** (build checklist). `make foundry-adjustments-check`
fails when a row's `files` do not exist or no longer mention the package, so the registry
cannot silently rot.

### Notes (third-party text, untrusted)

Exactly what the adjudicator gets today: per candidate, up to six releases, bodies capped
at 2 500 chars. Plus, new, the **core** release notes for a core bump: `updateCheck`'s
`ReleaseData.notes` is a URL to the release page; `plan.py` fetches it (same `gh`/HTTP path
as the package notes) and attaches it as `upstream["core"].notes`. Tonight's admin-API
breakage (the `Origin` header, the 400/401 changes, `worldShutdown`) is the kind of thing
only the core notes could have warned about, and today no LLM step sees them.

## The triage decision

### Output schema (`--json-schema`, validated again in Python)

```json
{
  "tier": "none | analyze | decide | fix",
  "reason": "<= 300 chars",
  "injection_suspected": false,
  "packages": [
    {
      "id": "<one of the ids offered>",
      "risk": "clean | watch | api | breaking",
      "areas": ["pentaryn-transform", "scripts/foundry"],
      "digest": [
        {"kind": "fix | feature | deprecation | removal | rename | migration | compat | other",
         "api": "<= 80 chars, identifier charset only, or empty",
         "note": "<= 200 chars, no URLs, no quoting of the source"}
      ]
    }
  ]
}
```

`risk` meanings: `clean` — nothing in the notes touches anything we use; `watch` — a change
near something we use, no API named; `api` — a named API, hook, flag or data shape we use
changed or was deprecated; `breaking` — the notes say so, or a removal of something we use.

### Clamping: the floor and the ceiling

Python computes both before the model runs, and clamps the answer into the range.

**Floor** (the least that must happen, from facts alone):

| Facts | Floor |
|---|---|
| no touched package has `adjustments` or `exposure` | `none` |
| any touched package has `adjustments` or `exposure`, and the bump is `patch` with `keyword_hits == 0` and no `history` of a rollback | `none` (the "patch with clean notes needs nothing more" case) |
| any touched package has `adjustments` or `exposure`, otherwise | `analyze` |
| core build bump | `analyze` (the admin API is an adjustment against core) |
| held major of a package with `adjustments`, and no `cached_analysis` | `analyze` (write the plan once; reuse until the version pair changes) |

**Ceiling** (the most the policy allows): `escalation.max_tier`, lowered to `decide` when
`minutes_remaining` cannot fit the fix tier, and to `analyze` when it cannot fit decide.

The model's `tier` is clamped to `[floor, ceiling]`. A tool-less Haiku call therefore
cannot under-triage an exposed update, cannot spend money the policy did not allow, and
cannot push the run past the window. What it adds, inside that range, is reading the notes:
distinguishing "DSN 6.4.4 fixes a texture leak" (`none`) from "DSN 6.4.4 renames the skip
flag" (`analyze`), which no regex does reliably.

### Fail-closed

Timeout, non-zero exit, unparseable or schema-invalid JSON, an id not offered, or
`injection_suspected: true` → `tier = floor`, every package `risk = api`, and the run
message says why. With `escalation.on_triage_failure: hold_exposed` (default), packages
with adjustments or exposure are additionally moved to `hold` for the week. With `proceed`,
the run continues exactly as today.

## T1 — Analyze (Opus · high, tool-less)

The analyst is tool-less for the same reason the adjudicator is: it reads strangers' text.
So Python brings our code to it instead of letting it fetch anything.

**Input bundle** (written to a temp file, piped on stdin):

1. The facts block for the packages triage flagged `watch`/`api`/`breaking`, plus held
   majors needing a plan.
2. The raw notes for those packages only.
3. The registry rows for those packages.
4. **Source excerpts**: every file the matching registry rows name, plus every exposure
   file, each capped at 60 KB and the bundle at 400 KB (~100k tokens). Larger files are
   trimmed to the lines around each mention of the package id ±80 lines. For a core bump,
   `admin.py`'s module docstring (the four assumptions) is always included whole.
5. The previous analysis for this package if one is cached (so a refresh is a diff, not a
   rewrite).

**Output schema** (`analysis.json`, validated in Python):

```json
{
  "packages": [{
    "id": "…", "installed": "…", "target": "…",
    "impact": "none | cosmetic | latent | functional | breaking",
    "confidence": "low | medium | high",
    "areas": [{
      "area": "pentaryn-portals | scripts/foundry | …",
      "impact": "…", "what_breaks": "<= 300 chars",
      "evidence": {"notes": "<= 200 chars paraphrase", "ours": "file:line"},
      "fix": [{"file": "…", "change": "<= 300 chars", "test": "make foundry-portals-check | pytest … | none"}]
    }],
    "still_needed": [{
      "adjustment": "<registry id>",
      "working": "yes | no | unknown",
      "needed": "yes | no | unknown",
      "native_now": "<= 200 chars or empty",
      "action": "keep | fix | retire | investigate",
      "why": "<= 200 chars"
    }],
    "recommendation": "apply | apply_after_fix | hold",
    "unattended_fix_ok": false,
    "plan": ["ordered, imperative steps a person can run; each <= 200 chars"]
  }],
  "injection_suspected": false
}
```

Rules the prompt states and the validator enforces: never quote notes verbatim (strings
are capped, URLs stripped, `api` fields restricted to identifier characters); every `areas[]`
entry must cite a file that was in the bundle; every `still_needed[].adjustment` must be a
registry id offered; `unattended_fix_ok` may be `true` only when every `fix[].test` is a
real check and `impact` is at most `latent`.

**The Still-needed phase** is this `still_needed[]` block, produced for every adjustment
whose `package` is touched — Argon above all. `working` comes from facts the bundle carries
(the last check/smoke result for that module, cached from the previous run) and the
analyst's reading of whether the change breaks it; `needed` comes from the notes against the
row's `native_when`. `retire` is a recommendation only: in v1 nothing retires unattended;
the plan step says "remove X, run Y, confirm Z at the table". v3 (below) lets
`retire_class: safe` rows retire unattended when the module's check passes with the
adjustment removed and the smoke passes.

**Caching.** `key = sha256(id, installed, target, registry rows hash, bundle files hash)`.
The analysis is stored at `.state/vtt-update-analysis/<key>.json` and reused while the key
holds. This is what keeps the held dnd5e 6.x from costing an Opus call every Saturday: the
plan is written once per (5.3.3 → 6.0.x, our code) pair and refreshed only when dnd5e
publishes 6.0.7 or we change the files it named. Reports link to the cached plan and say
"unchanged since <date>".

**Effect on the run.** `recommendation: hold` → the package moves to `hold` with the reason
"analysis: <what_breaks>". `apply` → unchanged. `apply_after_fix` → `hold` in v1 (plan
written); in v2 it is what T2 decides on.

## T2 — Decide (Fable · high, tool-less)

Runs only when T1 produced at least one `apply_after_fix`, or a `hold` with
`confidence: low`, or a `retire` verdict. Consumes **only** `analysis.json`, the facts block
and the policy's unattended rules — never a release note. Its job is the judgment call:
weighing a Sunday session against a fix branch against a week's wait; deciding whether a
fix the analyst called safe is really the kind we do at 04:00; choosing between "apply and
fix" and "hold and plan" when the analyst is unsure.

Output `decision.json`: per package `go | no_go`, per fix `unattended | hand`, per retire
`now | hand | never`, each with a ≤300-char reason. Python then applies three overrides it
never lets the model argue with: a `system` major or a `core` generation change is always
`hand`; a fix is `hand` unless the module passes the clean-module gate (below); a retire is
always `hand` in v1 and v2.

Fail-closed: any failure → every `apply_after_fix` becomes `hold`, every retire `hand`.
The report says T2 was unavailable and the T1 plan stands.

## T3 — Fix, review, verify (build later)

The unattended fix is the one tier that edits code, so it is boxed on four sides.

**The clean-module gate** (Python, before the tier starts), per module the fix would touch:

1. `git status --porcelain foundry/module/<id>` is empty — no uncommitted work of Joe's
   that a sync from a branch would silently revert into the live module.
2. The live copy matches the committed one: a content hash of `Data/modules/<id>` equals
   the hash of `HEAD:foundry/module/<id>` (a stronger form of `inventory.local_drift`).
3. The module has a `test/` and a `make foundry-<id>-check` target.
4. `<id>` is in `escalation.unattended_fix.allowed_modules` (empty list = never).

Any gate failing → the fix is `hand`: the plan is written, the branch is not. For
`scripts/foundry`, the gate is `pytest scripts/tests/` green on `HEAD` and the files clean.

**The sandbox.** `git worktree add .state/fix-worktree/<run_id> -b auto-update/<run_id> main`.
The fixer's cwd is the worktree; it gets `--add-dir` for nothing else. Bash is allow-listed to
`make foundry-<id>-check`, `node test/run.mjs`, `pytest scripts/tests/…`, `git diff`,
`git add`, `git commit`. No MCP (so no `eval-js`, no Infisical), no web, no Agent/Task.
`--max-budget-usd 8`, `--permission-prompts none` so anything outside the allow-list is
denied rather than hung. Its brief is `analysis.json` + `decision.json` + a Python header
that says the summary derives from third-party text and is data.

**Review** (Opus `xhigh`, tool-less): reads `git diff main..auto-update/<run_id>` and the
analysis, returns `ship | park` with findings. `park` → branch kept, plan written, package
rolled back to its backup (so the table is never left on an update our code does not match).

**Sync and verify** (Python): `make foundry-<id>-sync` from the worktree; then the normal
four-world smoke plus `make foundry-<id>-check`. A failure rolls back both the package and
the module (`git checkout HEAD -- foundry/module/<id> && make foundry-<id>-sync`) and parks
the branch. Sonnet `low` reads the failure output and writes two sentences for the report.
Success → the branch stays for Joe to merge (the run never merges to `main` and never
touches his working tree); the report leads with `git merge auto-update/<run_id>`.

What this tier **cannot** reproduce is tonight's real-click regression in Chrome. The
unattended equivalent is the smoke test plus the module checks; the plan always carries the
rows of the regression checklist that need a human.

## Trust boundaries

| Agent | Sees raw notes | Has tools | May touch the world | May touch the repo |
|---|---|---|---|---|
| Adjudicator | yes | none | no | no |
| T0 Triage | yes | none | no | no |
| T1 Analyze | yes | none | no | no |
| Report writer | yes | none | no | no |
| T2 Decide | **no** — digest only | none | no | no |
| T3a Fix | **no** — analysis only | Read/Edit/Write/Grep/Glob, allow-listed Bash | no | a worktree on its own branch |
| T3b Review | **no** — diff + analysis | none | no | no |
| T3c Verify | n/a (Python; Sonnet sees check/smoke output only) | none | the smoke launches worlds, as today | re-sync from HEAD on failure |

The hand-off is the validator: every structured output passes a JSON schema with enums,
length caps, an id allow-list, URL stripping and identifier-only `api` fields before the
next tier reads it. Shape constraints are not a sanitiser, so the second half of the
defence is that the tool-using tiers have no MCP, no web, no secrets and an allow-list, and
their worst case is a bad commit on a branch nobody has merged.

## Unattended or hand-review

| Situation | Outcome |
|---|---|
| patch/minor, no adjustments, no exposure | apply (today's path, no escalation cost) |
| exposed, triage `none` (patch, clean notes) | apply |
| exposed, T1 `impact: none` and every `still_needed.action == keep` | apply, Still-needed table in the report |
| T1 `cosmetic`/`latent` with a tested fix, clean-module gate passes, module allow-listed, T2 says `unattended`, time remains | **T3** (v2) — else hold + plan |
| T1 `functional`/`breaking` | hold + plan, always |
| system major, core generation change | hold + plan, always; plan cached per version pair |
| any `retire` | hand in v1/v2; v3 unattended for `retire_class: safe` only |
| protected package, no notes | today's adjudicator hold; T1 writes the "confirm maps load" plan once |
| time or budget exhausted mid-escalation | hold + whatever plan exists, reason "deferred: out of time/budget" |

**The ready-to-run plan** is a markdown file at
`foundry/logs/auto-updates/plans/<run_id>-<package>.md`, committed with the report under
the same explicit pathspec, in the shape of `foundry-update-2026-10.md`: starting state,
decision, preconditions, ordered phases with the exact `make` commands, the rollback rule,
and the regression rows that need a person. Its first line says whether it is fresh or
cached. The notification for an `attention` run names it.

## CLI invocation per tier

Common to every tool-less tier (T0, T1, T2, T3b, the adjudicator, the report):

```
claude -p --model <alias> --effort <level> \
  --output-format json --json-schema "$(cat schema.json)" \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --tools "" --disallowed-tools "Bash,Read,Write,Edit,MultiEdit,NotebookEdit,Glob,Grep,WebFetch,WebSearch,Task,Agent,TodoWrite,Artifact,SendUserFile,Skill" \
  --permission-mode default --permission-prompts none \
  --no-session-persistence --bare \
  --max-budget-usd <budget> \
  --system-prompt "$(cat rules.txt)" \
  < bundle.txt
```

`--tools ""` plus the deny list is belt and braces. `--bare` skips hooks, plugins and
auto-memory, which an unattended job has no business running. `--system-prompt` replaces
Claude Code's default prompt with the tier's rules, which cuts the per-call overhead and
keeps the instructions out of the same channel as the data; the subprocess cwd is a scratch
directory, not the repo, so no `CLAUDE.md` is loaded. `--output-format json` returns
`total_cost_usd`, `modelUsage` and `num_turns` — confirmed with a Haiku probe on
2026-10-10 ($0.0006 for 3.5k tokens) — and the run record keeps them per call.

| Tier | `--model` | `--effort` | `--max-budget-usd` | timeout |
|---|---|---|---|---|
| Adjudicator | `opus` | `medium` | 0.50 | 600 s (as today) |
| T0 | `haiku` (`--fallback-model sonnet`) | `low` | 0.05 | 120 s |
| T1 | `opus` | `high` | 1.50 per package, 3.00 per run | 900 s |
| T2 | `fable` | `high` | 0.75 | 600 s |
| T3a | `opus` | `high` | 8.00 | 2 400 s |
| T3b | `opus` | `xhigh` | 1.00 | 900 s |
| T3c explain | `sonnet` | `low` | 0.10 | 120 s |
| Report | `sonnet` (proposed; `opus` today) | `medium` | 0.50 | 600 s |

The fixer (T3a) differs:

```
claude -p --model opus --effort high --output-format json \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --tools "Read,Edit,Write,Grep,Glob,Bash" \
  --allowedTools "Read,Edit,Write,Grep,Glob,Bash(make foundry-*-check*),Bash(node test/*),Bash(pytest scripts/tests/*),Bash(git diff*),Bash(git add*),Bash(git commit*)" \
  --disallowed-tools "WebFetch,WebSearch,Task,Agent,Skill,NotebookEdit,Artifact,SendUserFile" \
  --permission-mode default --permission-prompts none \
  --no-session-persistence --bare --max-budget-usd 8 \
  --system-prompt "$(cat fix-rules.txt)" < brief.txt
```

run with cwd = the worktree. The exact `Bash(pattern)` syntax of `--allowedTools` is
checked in the build (it is the settings.json permission syntax; a wrong pattern denies,
which is the safe direction).

Model aliases (`fable`, `opus`, `sonnet`, `haiku`) resolve to the current generation. The
policy file stores aliases, not dated ids, so a model refresh is a CLI update, not a policy
edit; the run record stores the resolved id from `modelUsage` so a report can say which
model did what.

## Time

* **Window.** Unchanged: `window.earliest 03:30`, `latest 09:00`, gated on launch time.
  Escalation adds a **deadline** inside it: before each tier, `minutes_remaining =
  latest − now − escalation.reserve_minutes` (default 25: smoke of four worlds at 60 s
  dwell plus shutdown). A tier whose timeout does not fit is skipped and its package held
  with "deferred: out of time". This is the ceiling computation above, re-evaluated per
  tier, so a slow core download before triage shrinks what escalation may do.
* **Wrapper timeout.** `RUN_TIMEOUT` in `vtt-update.sh` goes from 5 400 to 10 800 s when
  `escalation.enabled`; the window still bounds the run and the wrapper is the backstop.
  A full escalation is T0 2 min + T1 10 min + T2 5 min + T3 40 min + review 10 min ≈ 70 min
  on top of today's 20–80 min, which is why T3 can only start if it will finish by about
  08:30.
* **Heartbeat.** Each `claude` subprocess runs under `Popen` with a poll loop that rewrites
  `.state/vtt-update.status` every 60 s (`phase: escalate/<tier>`, `detail: <package>`),
  so the watchdog's 20-minute staleness rule keeps distinguishing slow from dead.
* **Budget.** `escalation.budget_usd_per_run` (default 12) is a run-level cap; every call's
  `total_cost_usd` is summed and a tier that would exceed it is skipped like a timeout.

## Failure fallback

| Failure | What happens | What the report says |
|---|---|---|
| `claude` not on PATH, out of tokens, every call non-zero | tier `none`; adjudicator holds `review` as today; `on_triage_failure` applies | "escalation unavailable: <reason>" |
| T0 timeout / bad JSON / unknown id / injection flag | tier = floor; exposed packages held if `hold_exposed` | reason + floor |
| T1 failure | the packages that triggered it move to `hold`; cached analysis used if present | "analysis unavailable; held" |
| T2 failure | every `apply_after_fix` → hold; retire → hand | "decision unavailable; T1 plan stands" |
| T3a budget/timeout/park | package rolled back from its backup; branch kept; plan written | "fix parked on auto-update/<run_id>" |
| T3c smoke or check fails | package and module rolled back; branch kept | as today's recovery, plus the branch |
| time or run budget exhausted | remaining tiers skipped; affected packages held | "deferred: out of time/budget" |
| Python exception inside escalation | caught per tier, logged with traceback, treated as that tier failing; the run itself continues | traceback section (exists since 10-10) |

The invariant: **no failure in any tier can leave the run worse than today's `--skip-llm`
path**, which holds `review`, applies `auto`, smokes, recovers, writes a plain report.

## Report and notification

`RunResult` gains `escalation`:

```json
{"tier_floor": "analyze", "tier_ceiling": "decide", "tier": "analyze",
 "triage": {...}, "analysis": {"<id>": {"cached": true, "key": "…", "path": "…"}},
 "decision": {...}, "fix": {"branch": "…", "review": "park", "reason": "…"},
 "calls": [{"tier": "T1", "model": "claude-opus-5-5", "effort": "high", "cost_usd": 0.41,
            "seconds": 212, "ok": true}],
 "cost_usd": 0.42, "plans": ["foundry/logs/auto-updates/plans/…"]}
```

The report writer's prompt gets a fifth item: "5. Escalation: which tier ran and why, what
the analysis found per area, the Still-needed table, the plan's first three steps and its
path, and the cost line". The fallback report gets an `## Escalation` section with the same
in a table. Both end the escalation section with one line: `LLM cost this run: $0.42 (T0
$0.00, T1 $0.41, report $0.01)`.

Notifications: `done` unchanged; `attention` adds "plan ready: <path>" when one was written;
a new wording for a parked fix: "fix parked on auto-update/<run_id> — <package> rolled
back". The watchdog is fixed in the same change to treat `outcome=failed` as a failure (it
already exists as a loose end).

## Cost

Prices (first-party, per MTok, 2026-10): Haiku 5.5 $0.10/$0.50 · Sonnet 5.5 $2/$10 ·
Opus 5.5 $4/$20 · Fable 5.1 $10/$50. Today's run keeps no cost figures, so the baseline is
estimated from prompt sizes (adjudicator: two candidates × six notes ≈ 8k tokens of notes
plus Claude Code's ~15k system prompt; report: the compacted record ≈ 8k plus the same
prompt) and must be measured for real once calls record `total_cost_usd`.

| Saturday | Calls | Estimated cost |
|---|---|---|
| Quiet (nothing to apply) — today | report | $0.08–0.12 |
| Normal (a patch or two, no review) — today | report | $0.10–0.15 |
| Busy (review items) — today | adjudicator + report | $0.20–0.30 |
| **Quiet / normal — with triage** | + T0 | **+ $0.002** |
| Report on Sonnet instead of Opus | report | − $0.05–0.10 |
| Exposed patch, triage says `none` | + T0 | + $0.002 |
| Analyze (one package) | + T0 + T1 | + $0.40–0.80, then $0.002/week while cached |
| Analyze + decide | + T2 | + $0.25–0.35 |
| Full escalation with a fix | + T3a + T3b + T3c | + $3–8, capped at $8 + $1 + $0.10 |

Most Saturdays therefore cost what they cost today, and a little less if the report moves
to Sonnet. The expensive path is a few times a year — a core build bump that touches the
admin API, an Argon or Item Piles major, a dnd5e major — and each of those is a Saturday
where tonight's ~five hours of attended work is the alternative.

## Policy additions — `foundry/update-policy.yml`

```yaml
escalation:
  enabled: true
  max_tier: analyze            # none | analyze | decide | fix — raise as each tier earns trust
  on_triage_failure: hold_exposed   # or: proceed
  reserve_minutes: 25
  budget_usd_per_run: 12
  tiers:
    triage:  {model: haiku,  fallback: sonnet, effort: low,    timeout_s: 120,  budget_usd: 0.05}
    analyze: {model: opus,   effort: high,   timeout_s: 900,  budget_usd: 1.50, budget_usd_per_run: 3.00}
    decide:  {model: fable,  effort: high,   timeout_s: 600,  budget_usd: 0.75}
    fix:     {model: opus,   effort: high,   timeout_s: 2400, budget_usd: 8.00}
    review:  {model: opus,   effort: xhigh,  timeout_s: 900,  budget_usd: 1.00}
    explain: {model: sonnet, effort: low,    timeout_s: 120,  budget_usd: 0.10}
  unattended_fix:
    allowed_modules: []        # e.g. [pentaryn-portals, pentaryn-ties]; empty = never
    allow_scripts: false       # scripts/foundry fixes unattended
  unattended_retire: false     # v3
adjustments: foundry/adjustments.yml
llm:
  adjudicator: {model: opus,   effort: medium}
  report:      {model: sonnet, effort: medium}
```

## Tonight mapped onto the tiers

| Tonight (attended) | Unattended equivalent |
|---|---|
| Diagnose the 10-03 crash | not a tier — the traceback fix from 10-10 makes the report carry it; a crash is a bug for Joe, not for the updater |
| Scan: core 14.367 → 14.369, DSN 6.4.4, dnd5e 6.0.6 held, mad-endlesswiz2 held | T0 facts: core bump with `core-admin-api`, `core-portals-relative-uuid`, `core-ties-flag-wipe`, `core-transform-unwrap` rows → floor `analyze`; DSN patch with `dsn-skip-blind-study` and clean notes → `none` for DSN |
| Per-area release-notes impact (Opus high) | T1 on core (with the core notes, now fetched) and on held dnd5e: the portals relative-UUID change, the ties `-=` flag shape, DSN's `skip` flag; the dnd5e 6 port list, cached until 6.0.7 |
| Plan / go-no-go (Fable high) | T2: go on core after fixes, no-go on dnd5e (adapters undeclared for 6), Argon `still_needed` all `keep` |
| Apply core + DSN | apply, as today |
| Fix admin.py, portals, ties (Opus high) | T3a — but `scripts/foundry` is not allow-listed in v1 and the working tree had ~50 dirty files, so the clean-module gate would have said **hand**: hold core, write the plan. Which is the right call for a 04:00 run that would otherwise have installed 14.369 and then been unable to log in |
| Live regression (Sonnet medium) with Opus fix loops | T3c smoke + module checks; the real-click rows go in the plan for Joe |
| "Still needed?" pass | T1 `still_needed[]`: Argon rows `keep`; `dsn-skip-blind-study` `fix` (the old flag never worked) |

The honest reading: with v1 built, this Saturday would have cost about $0.90 (T0 + two T1
calls + report) and produced a hold on core with the exact plan Joe executed by hand
tonight, instead of a crash report. With v2 and a clean tree, portals and ties would have
been fixed on a branch and core applied.

## Build now, build later

**v1 — now.** Adjustments registry (seed above, verified) and its check target · core release
notes fetched into the plan · facts block and exposure grep · T0 triage with floor/ceiling
and fail-closed · T1 analyze with the source bundle, validator, cache and `still_needed` ·
plan writer · `escalation` in the run record, both report paths, notifications · per-call
cost and model recorded (adjudicator and report too) · deadline and heartbeat · policy keys
with `max_tier: analyze` · watchdog fix · report writer on Sonnet (one-line change, reversible)
· tests for every fail-closed path.

**v2 — after two Saturdays where v1's held plans turned out right when Joe ran them.** T2
decide · T3 fix/review/verify with the clean-module gate, worktree, allow-listed Bash and
rollback-plus-resync · `max_tier: fix` with `allowed_modules` starting at the two modules
with the strongest tests (portals, ties).

**v3 — later.** Unattended retire for `retire_class: safe` · `apply_after_fix` for
`scripts/foundry` (needs `pytest` as the only gate and a clean tree, which tonight shows is
not the normal state) · the regression checklist rows as scripted smoke steps where a real
click is not required.

Not building: a Sonnet "verifier" agent that re-runs the checks. Python runs checks; a
model reading pass/fail adds cost and no judgment.

## As built (v1, 2026-10-10)

Where the build departed from the text above, and why. The use-doc is
`../foundry/automated-updates.md` → *Escalation*.

* **`--restricted`, not `--bare`.** Probed: `--bare` reads auth only from
  `ANTHROPIC_API_KEY`; on this Mac (OAuth) every `--bare` call returned `Not logged in`, so
  it would have failed every Saturday closed. `--restricted` ignores user/project/local
  settings (so hooks) and works with OAuth. `llm.isolation: bare` is available for a key.
* **One call path.** `scripts/foundry/update/llm.py` builds every argv (adjudicator,
  T0, T1, report); `untrusted_input=True` makes it raise `UnsafeCall` on any tool grant.
* **Schemas are per call.** The offered ids, the bundle's areas, the package's registry
  ids and the allowed checks go into the `--json-schema` as `enum`s, so the CLI enforces
  the allow-list; the Python validator is the second fence. Probed with Haiku against the
  real CLI ($0.005 total): both schemas accepted, structured output returned, validator
  passed — after the per-call enums fixed Haiku's free-text `id`/`area`/`test` values.
* **T1 is one package per call** and its output is a single package object, not
  `packages[]`.
* **Triage is offered only** `auto` packages and held packages whose floor demands a plan.
  A held major with a cached analysis costs nothing: no T0, no T1, the plan is linked.
* **Registry shape.** A mapping with `aliases:` (extra exposure terms per package, e.g.
  `ui.ARGON`, `game.itempiles`, `dice3d`) and `adjustments:`; rows take `packages` (list),
  `modules` (list) and `markers` (strings that must still be in `files`). Verified against
  source: `argon-target-picker-cancel` belongs to `enhancedcombathud` (the picker is in
  Argon core's `targetPicker.js`), `argon-panel-injection` to both Argon packages;
  `argon-toolbar-neighbour` dropped (only `order: 60`, Argon named in a comment);
  `cloud.py` dropped from `core-admin-api` (it only probes :30000).
* **Over-long strings reject** (fail closed) rather than truncate; an unknown `test`
  command is sanitised to `none` rather than rejected.
* **Watchdog**: a `failed` outcome notifies only when no report exists for that run id
  (the run notifies itself after writing its report), to avoid a double alert.
* **Not run:** the `cli run --dry --force` against real Opus — left for Joe before the
  first unpaused Saturday (≈ $0.6–1.0: adjudicator on dnd5e + T0 + one T1 on dnd5e 6.x).

### Adversarial review, 2026-10-10 (after the v1 build)

Found and fixed before the first unpaused Saturday; each has a test in
`scripts/tests/test_update_escalation.py`.

* **The backstop moved past the watchdog.** `RUN_TIMEOUT` 10 800 s put a stuck 04:06 run's
  kill at 07:06, after the 06:12 watchdog — status left `running`, entry state and lock
  left behind (`make vtt-up` refuses while the lock exists), nobody told. Now the step has
  its own `max_minutes` (40), the backstop is 90 + 40 min, and on a 143/137 exit the
  wrapper runs `cli killed` (mark status, restore service, remove a dead owner's lock,
  notify). The watchdog stays quiet about a `killed` run.
* **`--max-budget-usd` is post-hoc** (probed): an over-cap call is billed and discarded.
  Caps sat near expected cost (adjudicator $0.50 where it had none; triage $0.05 below the
  Sonnet fallback; analysis $1.50 against a ~250 KB core bundle). Raised to runaway levels:
  $1.50 / $0.25 / $2.50 per call, $5 per run for analysis.
* **Timed-out calls cost $0 in the books**, so timeouts never used up the per-run budget.
  They are now charged their cap (`llm.charged`).
* **A failing analysis was re-bought every Saturday** (nothing cached on failure; a held
  major's floor stays `analyze`). Now counted per key; after `analysis_attempts` (2) it is
  held without a call until the versions or source change.
* **Held majors were re-analysed on every upstream patch** (and every edit to a bundled
  file): the version pair moves weekly. Held packages now reuse an analysis of the same
  installed version and target major for `held_reuse_days` (28).
* **Exposure was a case-insensitive substring over comments too**: `levels` "exposed" via
  `DOCUMENT_OWNERSHIP_LEVELS`, `multi-token-edit`/`scene-packer`/`wall-height` via the
  updater's own docstrings — MTE alone would have bought an Opus call on three of the last
  six Saturdays. Now code-only, case-sensitive, standalone ids; identifier-like ids must be
  quoted, a path or a `flags.` scope; `scripts/foundry/update/` not searched.
* **Triage was offered packages it could not affect** (unexposed `auto` ones), so a held
  dnd5e beside any unrelated update cost a call every week; and on triage failure the
  exposed packages were held *and then* analysed by Opus anyway. Now: offered = exposed
  `auto` + floor-demanded holds; on failure `hold_exposed` holds only what triage was the
  sole check for and leaves floor-`analyze` packages to T1; an injection flag holds every
  offered package and runs **no** T1 (no Opus on flagged text, no plan written from it).
* **Remote strings reached the plan raw.** The target version (a remote manifest field)
  went into the plan's title and body, and the adjudicator's free-text rationale into its
  "Decision" line — around the validator, into a file committed publicly and presented as
  runnable. Now shaped (`safe_version`, `safe_url`, `plain`); plans also get the report's
  IP scrub and pipe-escaped cells.
* **`--permission-mode default`** is not in the CLI's listed choices; switched to
  `dontAsk` (probed: same tool-less init, structured output still returned).

## Build checklist

- [x] `foundry/adjustments.yml` seeded from the table above; every row's `files` opened and
      the `what` confirmed against the source (the `levels|wall-height` grep hits were not
      checked and are deliberately not in the seed)
- [x] `scripts/foundry/update/adjustments.py`: load, validate, `rows_for(package)`,
      `exposure(package)` (grep over `foundry/module/**/*.mjs` and `scripts/foundry/**/*.py`,
      cached per run); `make foundry-adjustments-check`
- [x] `plan.py`: fetch core release notes for a core bump into `upstream["core"].notes`
- [x] `scripts/foundry/update/escalate.py`: facts block; floor/ceiling; `Tier` enum; a
      single `_call(tier, system_prompt, stdin, schema)` that builds the command from the
      policy, runs `Popen` with the 60 s status heartbeat, enforces timeout and budget,
      parses `--output-format json`, records `cost_usd`/model/seconds, and validates
      against the tier's schema (enums, caps, id allow-list, URL strip, identifier-only
      `api`) — every tier goes through this one function
- [x] T0 prompt + schema; clamp; `on_triage_failure`
- [x] T1 prompt + schema; source bundle with the 60 KB/400 KB caps and the ±80-line
      trimming; cache keyed as specified; `still_needed` populated for every registry row
      of a touched package; hold reasons folded into `plan.decisions[].reasons`
- [x] plan writer → `foundry/logs/auto-updates/plans/<run_id>-<pkg>.md`, added to the
      report commit's explicit pathspec in `cli.cmd_run`
- [x] `apply._run_locked`: call escalation after `adjudicate.apply_verdicts`, before the
      `auto`/`no-op` check; `RunResult.escalation`; deadline per tier from `window.latest`
- [x] `adjudicate.py` and `report.py`: read model/effort from `policy.llm`, pass `--effort`,
      `--output-format json`, `--bare`, `--no-session-persistence`, record cost; adjudicator
      keeps `--model opus --effort medium`; report to `sonnet medium`
- [x] `report.py`: escalation item in the prompt; `## Escalation` in `fallback_markdown`;
      cost line; `scrub()` covers the new fields
- [x] `apply.notify_result`: "plan ready: <path>" and the parked-fix wording
- [x] `automation/bin/vtt-update.sh`: `RUN_TIMEOUT` 10 800 when escalation is enabled;
      `automation/bin/vtt-update-watchdog.sh`: `outcome=failed` notifies as failed
- [x] `foundry/update-policy.yml`: the `escalation`, `adjustments` and `llm` blocks with
      comments; `max_tier: analyze`
- [x] tests: floor/ceiling table; every fail-closed row in the failure table; validator
      rejections (unknown id, URL in a note, over-long string, bad enum); cache hit/miss on
      key change; deadline skips a tier; heartbeat rewrites status; `escalation` survives
      `scrub()`; the `--skip-llm` path is byte-identical to today
- [ ] **(Joe)** a dry run (`cli run --dry --force`) exercises T0 and T1 against the current plan with
      the real CLI and prints the cost line — run it once with `max_tier: analyze` before
      the first scheduled Saturday
- [x] `context/foundry/automated-updates.md`: a new section describing the tiers, the
      trust table and the policy keys; `automation/README.md`: the day-to-day view (what a
      "plan ready" notification means, where plans land, what the cost line is)
- [ ] v2 gate: after two Saturdays, compare each held plan with what Joe actually had to do;
      then build T2/T3 per the sections above, verify the `--allowedTools Bash(pattern)`
      syntax live, and start `allowed_modules` at `[pentaryn-portals, pentaryn-ties]`

## Open questions for Joe

1. Report writer to Sonnet 5.5 `medium`? It saves more than triage costs; tonight's reports
   are summaries of a JSON record, which is Sonnet work by his own tiering.
2. `on_triage_failure`: `hold_exposed` (safer, noisier) or `proceed` (today's behaviour)?
3. For v2, which two modules go first in `allowed_modules`? Portals and ties are proposed
   because their checks caught tonight's regressions.
4. Should a plan ever land in `context/plans/` rather than `foundry/logs/auto-updates/plans/`?
   This design says no: `context/plans/` is for things a person designed.
