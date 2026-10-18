---
title: "Claude skills — how routing works here"
status: active
last_modified: 2026-10-17
tags: [context, claude, skills, routing]
---

# Claude skills — how routing works here

**Read this when:** adding, updating or reviewing a skill in `.claude/skills/`; writing a new
use-doc (it needs a skill); the wrong doc loading for a task, or none loading; or re-running
the skill-routing eval.
**Not this file:** how the docs themselves are organised → [`../CLAUDE.md`](../CLAUDE.md)
(the two trees) · the design reasoning (cost vs. accuracy, why not preload everything) →
the 2026-10-17 commit that introduced the skills.

## The model: the skill is the trigger, the doc is the content

| Layer | Loaded | Holds |
|---|---|---|
| `CLAUDE.md` + `@context/foundry/README.md` | every session, and again after every compaction | the always-on rules and the Foundry root |
| Skill `description` (one per `.claude/skills/<name>/SKILL.md`) | every session, ~1–2k tokens for all of them | *when* a doc applies |
| The doc a stub points at | only when the task matches | *what* to know — the single source of truth |
| `context/plans/` | never preloaded; no skills | history |

A stub is three lines of body and never grows. Content goes in the doc. Docs stay in
`context/` so their cross-links work and the vault can read them; skills are a hidden folder.

## Adding or updating a skill

1. Every use-doc gets a stub **in the same change as the doc**. Copy any existing
   `SKILL.md`; the folder name is the skill name and must match `name:`.
2. Write the `description` in Joe's words and symptoms, not the doc's title — "world still
   paused after the nightly restart", not "headless GM operations". Read the doc **body**
   first: most misses in the 2026-10 eval were tasks buried in later sections that the
   description never named.
3. One sentence, ≲320 characters. Add `Not for X (→ other-skill)` only for a collision you
   have actually seen.
4. Quote the description as a JSON-style double-quoted string. A bare `: ` inside an
   unquoted value is invalid YAML.
5. Run `make check-context` (stubs must point at real docs; every use-doc must have a stub),
   then the eval for the cluster you touched.

## The eval — `scripts/eval/skill_routing/`

| File | Does |
|---|---|
| `run.py` | Runs each case in a fresh sandboxed `claude -p` (read-only tools, no MCP, not persisted) and grades the first skill/doc it reaches for. Results → `.output/skill-routing/results.json`. |
| `cases/<cluster>.json` | 139 blind cases written from the doc bodies: direct, indirect, confusable (belongs to a neighbour), negative (`["none"]`). Clusters group skills that get confused with each other. |
| `cases/real.json` | 24 of Joe's real prompts from past sessions. The best signal — generated cases flatter the descriptions. |
| `mine.py` | Pulls new prompt → doc-read pairs from the transcripts into `.output/skill-routing/mined.json` for hand-curation into `real.json`. |

```bash
python3 scripts/eval/skill_routing/run.py -p 12                 # all 163, ~10 min
python3 scripts/eval/skill_routing/run.py cases/map.json        # one cluster
python3 scripts/eval/skill_routing/run.py --ids r03,map-07 --repeat 3
```

**Reading a failure.** Single runs are noisy: re-run a miss with `--repeat 3` before
rewriting anything. Then decide honestly whether the *case* is wrong (an unreasonable
`expected`, a prompt that only makes sense mid-conversation) or the *description* is (it
lacks the trigger words, or it is stealing from a neighbour). A route to `read:` some module's
source means no description matched and the session grepped instead.

**Baseline, 2026-10-17:** generated 132/136 · real 16/24 on first pass, ~21/24 after the
scene-links and "route before you search" fixes. What it does not test: whether the work
after the right doc loads is correct.
