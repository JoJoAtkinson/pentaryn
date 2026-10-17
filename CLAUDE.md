# CLAUDE.md — always-on rules + routing

D&D 5.5e campaign vault plus the Foundry VTT automation that runs it. The tooling is
world-agnostic — it runs **any dnd5e world** in this setup. Ask the live client which one you
are in (`game.world.id`) rather than assuming; current campaign state lives in
[`context/space-journey.md`](context/space-journey.md) and
[`context/ardenford.md`](context/ardenford.md), and
[`context/pentaryn.md`](context/pentaryn.md).

This file is auto-loaded into every session, so it stays short. Anything longer than two
lines belongs in `context/`, and the skills are how you find it.

## Always

- **When a request maps to an MCP tool, use the MCP tool** — never shell out to the script
  behind it. `./.venv/bin/python scripts/mcp/server.py --list-tools` lists them.
- **Secrets live in Infisical, never in this repo.** Never write a secret value to a file, a
  log, stdout, or a command-line argument; read it at the point of use. If the Infisical CLI
  reports an auth failure, stop and tell Joe to run `infisical login` — do not prompt for the
  value, hardcode it, or invent a `.env`. Retrieval helpers: `scripts/foundry/README.md`.
- **Never read these** — build artifacts, high token cost, zero signal:
  `.cache/` `.output/` `.state/` `.history/` `.venv/` `__pycache__/`
  `world/**/_history.*.svg` `world/**/_timeline.*.svg`

## Route by task — skills

Every use-doc under `context/` has a skill stub in `.claude/skills/<name>/SKILL.md`. The stub's
`description` is the trigger; the doc it points to is the content. When a task matches a skill,
invoke it and read the doc it names. Joe can also force one with `/<name>`.
**Route before you search:** when a prompt names a module, a feature or a make target, check the
skills first. The doc is faster and carries the gotchas; grepping the source is the fallback.

The Foundry domain root is always loaded (below), and it survives compaction.
History, not instructions: `context/plans/` (no skills; never load one to operate a system).

**New use-doc → add its skill stub in the same change.** Copy any existing `SKILL.md`, then
write the `description` in the words Joe would use, not the doc's title. How, and the eval:
[`context/skills.md`](context/skills.md).

@context/foundry/README.md

## The two trees under `context/`

- **`context/<domain>/`** — how to *use* something that exists. Read before acting.
- **`context/plans/`** — how something was *built*. Design docs and migration records, kept
  as history. Never load one to operate the thing it describes.

Design a new system → write the plan in `context/plans/`. Ship it → write the use-doc in its
domain folder. Don't leave the plan as the only documentation.
