---
title: "Obsidian-first migration — plan"
created: 2026-08-24
last_modified: 2026-08-24
tags: [context, plans, obsidian, tooling, design]
status: in progress — stages 0-1 executed, stage 2 pending
---

# Obsidian-first migration — plan

**Read this when:** deciding whether/how to move the vault to wikilinks + tags with Obsidian
alongside VS Code. This is a plan, not a use-doc; nothing here has been executed.

## Recommended first three steps

1. **Adopt the multi-home machinery without touching a single link.** Open the repo root as an
   Obsidian vault, commit a curated `.obsidian/` (settings below), and build one `.base` file +
   one MOC note as a pilot (worked example in §2). Tags, Bases queries and MOC notes deliver the
   "one doc, three homes" goal on day one — wikilinks are severable from that goal.
2. **Normalize frontmatter before any link work**: strip `#` from YAML tag arrays and settle
   `last_modified` vs `last-modified`. **Done** in `0a2a192` (210 files). The one thing it broke —
   `combat-runner` discovery in `scripts/foundry/build_actors.py` — was missed at the time and
   repaired in `4cb4c10`; that stage's own precondition had been skipped.
3. **Pilot wikilinks on one subtree** (`world/factions/elderholt/`, on a branch) and verify:
   `make check-context`, `make foundry-actors`, zero unresolved links in Obsidian's link pane.
   Only then convert the rest of `world/`.

---

## 0. What the repo actually looks like (measured 2026-08-24)

- **586 markdown files** outside the never-read dirs (includes `automation/smoke/node_modules/` —
  2 `index.md` + several `README.md` dups come from there; exclude it from everything below).
- **762 relative `[text](path.md)` links.** By area: `world/` 418, `context/` 122, `templates/`
  105, `automation/` 50 (nearly all node_modules docs), `sessions/` 34, `oneshots/` 28,
  `campaigns/` 19, everything else single digits. `staging/` has 0.
- **Zero real wikilinks.** The 12 `[[…]]` matches are Foundry enricher/lookup syntax
  (`[[/attack extended]]`, `[[lookup]]`, `[[views]]`) in `foundry/module/pentaryn-ties/README.md`,
  `context/foundry/rules-lookup.md`, `context/plans/foundry-encounter-log.md`,
  `scripts/timeline_svg/AGENTS.md`. Any converter and Obsidian itself will misread these as
  unresolved wikilinks — those four files must be on a skip-list, and Obsidian will show them as
  phantom unresolved links forever (cosmetic, but know it).
- **Three competing frontmatter conventions**, not two:
  1. YAML with `last-modified` + `#`-prefixed tag arrays (`tags: ["#npc", "#elder", …]`) — the bulk
     of `world/` (188 files `last-modified`, 210 files with `#` tags). Example:
     `world/factions/elderholt/elders/marrith-the-ashen-measure.md`.
  2. YAML with `last_modified` + plain tags (`tags: [context, world, lore]`) — the newer `context/`
     + history-event style (23 files `last_modified`, 233 files plain tags).
  3. **No YAML at all** — bold body lines `**Tags:** \`#faction\`` / `**Created:**` / `**Status:**`
     — 34 files, including `world/factions/calderon-imperium/_overview.md` and most of
     `templates/`. Obsidian sees no properties on these at all; they are invisible to tag queries
     and Bases.
  - Field coverage: 428 files have frontmatter; `created:` 224, `status:` 235, `aliases:` 158
    (mostly history events).
  - **Obsidian cares:** `#`-prefixed entries in a YAML `tags` array are not valid property tags;
    those 210 files' tags won't reliably appear in the tag pane or match `tag:` queries until the
    `#` is stripped.
- **Timeline system, current truth:** 156 event files under `world/**/history/` with the
  `title / event_id / date / year / precision / duration / tags / aliases` schema from
  `context/world/timelines.md`. **There is currently no renderer.**
  `scripts/build_timeline_svg.py` sets `USE_HISTORY_SYSTEM = True` (line 31), which routes `main()`
  to `render_history_scopes` in `scripts/timeline_svg/history_render.py`; that globs
  `_history.config.toml` (line 23) and `_history.tsv` (line 28), neither of which exists, and exits
  at line 501. (The `.timeline_data/timeline.tsv` read at line 35 is the *legacy fallback*, and is
  explicitly labelled as such — it is not the live path.) `context/world/timelines.md` says the
  same: "no supported path from `history/` folders to a rendered timeline", tools "will fail until
  a renderer exists again".
  So "don't break the SVG build" is moot *today*. The live contract is the **frontmatter schema**
  (a future renderer's input). Note the corollary: the four view files are named `config.toml`, and
  the existing renderer globs `_history.config.toml` — so **nothing reads them today either**. They
  are a future-renderer contract, which is why the tag strip was safe.
  Notably, `timelines.md` was *already written with Obsidian in mind*: it documents `aliases` for
  Obsidian autocomplete, gives a `.base` example, and warns that Obsidian's `date` property type
  can't handle the 360-day calendar (use `year` int + `file.name`).
- **Machine readers of markdown:**
  - `scripts/fix-md-links.py` (MCP `fix_md_links`) — regex `\[([^\]]+)\]\(([^)]+)\)` at line 37;
    **completely blind to wikilinks** (won't fix them, won't flag them).
  - `scripts/check_context.py` (`make check-context`) — resolves relative links in `CLAUDE.md`,
    `README.md`, `templates/README.md`, and all of `context/**` only. `world/` links are unchecked
    today.
  - `scripts/foundry/build_actors.py` — **as of the fix in `4cb4c10`**, discovers combat NPCs by
    reading the `tags` array out of the first 30 lines (`head_tags` / `is_combat_runner`) and
    accepting `combat-runner` with or without a leading `#`. It previously grepped the raw head for
    the literal `"#combat-runner"`, which the Stage 1 strip silently broke — and which also matched
    the word in prose (`mountin-pass/_overview.md` says "Auto-loaded by combat-runner" in its
    `description`). Verified: 19 NPCs, 5 PCs, `foundry/build/actors.json` byte-identical.
    NPCs are migrating into Foundry as the source of truth for stat blocks, so this pipeline may
    still be retired later — but it works now rather than failing silently.
  - `scripts/lore.py` (`find_lore`, `get_npc`, `get_faction_overview`) — substring search and
    filename/path globs; **link-format agnostic, but path- and filename-dependent**
    (`world/factions/<slug>/_overview.md`, `*<slug>*.md` globs). Renaming files is the risk here,
    not rewriting links.
  - `foundry/module/pentaryn-ties` — attributes store `source: { blob, path }` where **the git blob
    is the identity, the path a label** (`known-core.mjs` ~line 1233;
    `context/foundry/attributes.md` §source). A mass rewrite changes every touched file's blob →
    every attribute-sourced note trips the drift check (`git rev-parse HEAD:$P` ≠ stored blob).
    That is the system working as designed ("the note changed — re-read it"), not breakage, but it
    is a wall of drift flags to acknowledge after migration.
  - `.vscode/cspell.json` (111 words) — content-based, unaffected by link format.
- **Duplicate basenames — the wikilink ambiguity is real** (excluding `node_modules`, which the
  raw counts wrongly included): **22** `README.md`, 32 `_overview.md`, and **17** other duplicated
  basename sets. The `CHANGELOG.md` ×11 and `readme.md` ×10 sets are node_modules-only and
  irrelevant. The real sets:
  `trash-mobs.md`/`named-derros.md`/`dm-notes.md` ×3 each (the three `derro-foe-party-*` folders
  under `world/factions/ardenhaven/locations/deep-fall-ruins/`), `encounters.md` ×2 (thrulm,
  gar-vally), `space-journey.md` ×2 (`context/` vs `oneshots/`), and ~2 dozen creature statblocks
  duplicated across encounter folders. A bare `[[_overview]]` is meaningless in this vault.
- **No `.obsidian/` exists.** `.vscode/` has `cspell.json`, `settings.json` (minimal),
  editor styling and gold chrome.
- `context/world/README.md` line "Use relative links between docs" is the standing convention this
  plan overturns for lore.

---

## 1. Should he do it — honest read

**The core motivation does not require wikilinks.** "One story that is simultaneously an Elderholt
story, a Calderon prison, and a timeline event" is delivered by frontmatter tags + Bases/Dataview
queries + MOC notes — all of which work today, with relative links untouched, because Obsidian
resolves standard relative markdown links natively. The history system already proved this design
(one event, two POV files, same `event_id`, different tags).

**Where wikilinks genuinely win here:**

- Writing speed and refactor safety in lore prose: `[[Marrith the Ashen Measure]]` via autocomplete
  beats hand-computing `../../elders/marrith-the-ashen-measure.md`, and Obsidian's
  rename-updates-links covers `world/`, which `check_context.py` does not.
- Backlinks become reliable. Backlinks work for relative links too, but only when the links exist —
  the friction of relative paths is why cross-links are sparse in practice (762 links across 586
  files, heavily concentrated in Related Links sections).
- `aliases` + wikilinks means linking by in-world name ("the Ashen Measure") regardless of filename.

**Where they cost:**

- `fix_md_links` and `check_context.py` go blind in converted zones; GitHub web rendering of
  `world/` loses working links entirely.
- Git diffs of the one-time conversion are large; ties drift-flags fire on every attribute-sourced
  file.
- The 24+ duplicate basenames force path-qualified wikilinks in a nontrivial minority of cases.

**Recommended end-state: hybrid, drawn on the existing tooling boundary.**

| Zone | Link format | Why |
|---|---|---|
| `world/`, `oneshots/`, `characters/`, `sessions/`, `campaigns/`, `items/`, `staging/` | **Wikilinks** (new writing immediately; existing links migrated per §5) | Lore prose, human-read, Obsidian-first |
| `context/`, `CLAUDE.md`, root/`templates/README.md` | **Relative paths, unchanged** | `check_context.py` enforces them; this is the machine/Claude instruction surface, read outside Obsidian |
| `scripts/`, `foundry/`, `automation/` | **Unchanged** | Code docs, GitHub-read, plus the enricher-`[[…]]` files live here |
| History event **frontmatter** | **Untouched, ever** | The future-renderer contract |

---

## 2. Tag / multi-home design

### Taxonomy — grow the existing vocabulary, don't replace it

The existing tags are already 90% of a taxonomy (top: `world` 97, `ardenhaven` 79, `location` 45,
`deep-fall-ruins` 42, `npc` 32, `combat-runner` 30, `elderholt` 24, `faction` 21, `witch` 16,
`rakthok-horde` 16…). Two hard constraints: **faction-slug tags are consumed by the history
`config.toml` view filters, and `combat-runner`/`cr-*`/creature-type tags are consumed by
`build_actors.py`** — so no mass tag renames. The design is therefore additive:

- **Machine namespace (frozen):** `combat-runner`, `cr-*`, creature types, `public`/`private` POV
  tags. Never rename; document as reserved.
- **Entity axes (existing, keep flat):** faction slugs (`elderholt`, `calderon-imperium`, …), place
  slugs (`deep-fall-ruins`, `gar-vally`, `thrulm`), kind tags (`npc`, `location`, `faction`,
  `story`, `session`, `oneshot`, `handout`, `quest`, `monster`, `encounter`).
- **New cross-cutting topics (additive, kebab-case):** whatever a story touches that has no folder
  home — `southern-continent`, `sealed-prison`, `the-fall`, campaign slugs (`space-journey` already
  exists). Optionally nested (`topic/southern-continent`) — Obsidian supports nesting, but flat
  matches everything already here; recommend staying flat.
- **Not tags:** `status`, dates, `year` — those are properties and already are.

### The multi-home mechanism, in order of leverage

1. **Tags in frontmatter** — the document's homes. One physical file, one folder (the *least-bad*
   folder, per the existing "no `world/locations/`" philosophy), N tags.
2. **Bases (`.base` files)** — saved queries that render as tables in Obsidian.
   `context/world/timelines.md` already commits to Bases for history folders; extend the same
   pattern to topics.
3. **MOC notes** — a real markdown note per cross-cutting topic that has no folder home, holding
   prose + curated wikilinks + an embedded query. Proposed home: `world/threads/<topic>.md` (a new,
   small folder; it deliberately does *not* violate the "no `world/locations/`" rule because
   threads are not locations). The existing `world/factions/world-factions-overview.md` is already
   a MOC in all but name.
4. **Backlinks** — free once links exist; the reverse index for "what references Marrith".

### Worked example — the 3948 A.F. story

*(No file mentioning 3948 exists yet — `grep -rn '3948'` over the vault returns nothing — so this
is the authoring pattern for a new story, which is exactly the scenario that motivates the
migration.)*

**One physical file**, homed in Elderholt because Marrith's POV carries it —
`world/factions/elderholt/story/2_the-sealed-meridian.md` (the `story/` folder already exists with
`1_marwen-leaving.md`):

```yaml
---
title: The Sealed Meridian
created: 2026-08-24
last_modified: 2026-08-24
status: draft
year: 3948
tags: [story, elderholt, calderon-imperium, southern-continent, sealed-prison, lore]
aliases: [The Sealed Meridian]
---
In 3948 A.F., [[marrith-the-ashen-measure|Elder Marrith]] was summoned south…
```

**Plus one timeline event** (point-in-time projection, per the existing POV-variant pattern) —
`world/factions/elderholt/history/03948-00-00_sealed-meridian.md` with
`event_id: sealed-meridian`, `year: 3948`, `tags: [elderholt, calderon-imperium, lore]`, body
linking `[[2_the-sealed-meridian|the full account]]`. If a Calderon-POV account is ever wanted,
it's a second event file sharing the `event_id` — that is the documented intended shape.

**Surfaced from three-plus places, zero duplication:**

- *Elderholt*: it physically lives there; `world/factions/elderholt/history/` sorts it into the
  timeline by filename; an elderholt `.base` picks it up by tag.
- *Calderon Imperium*: `world/factions/calderon-imperium/_overview.md` gains either a wikilink
  under Related Links or an embedded base/query —
  `filters: taggedWith(file.file, "calderon-imperium")` — so every Calderon-tagged doc anywhere in
  the vault appears, this story included.
- *The southern continent*: new MOC note `world/threads/southern-continent.md` — a paragraph of
  what's known, a curated `[[…]]` list, and a base filtering `tag: southern-continent` sorted on
  `year`. The continent that is on no map gets a *note*, not a folder, and everything that touches
  it accretes there automatically.
- *Chronology*: any history base sorted on `file.name` slots `03948-…` between the Age of Roads and
  the Age of Conquest events already in `world/ages/history/`.

---

## 3. VS Code plugin set

VS Code stays the primary editor; these keep it competent in a wikilink vault:

- **Foam** (`foam.foam-vscode`) — the load-bearing one: `[[` autocomplete across the workspace,
  go-to-definition on wikilinks, backlinks panel, tag explorer, graph, "orphans & placeholders"
  report (a poor-man's broken-wikilink checker usable in CI-adjacent review). Configure:
  `foam.edit.linkReferenceDefinitions: "off"` — Foam's default appends `[//begin]…`
  link-definition blocks to files, which would churn git and confuse Obsidian; this must be off
  before the first save. Also scope Foam with `foam.files.ignore` to skip `foundry/`, `scripts/`,
  `automation/**` (esp. node_modules), `.venv/`, matching the enricher-syntax skip-list.
- **Markdown Memo** (`svsool.markdown-memo`) — alternative to Foam (wikilink nav + hover preview).
  **Do not install both**; they fight over `[[` completion and link decoration. Foam is the better
  fit here (tag explorer + placeholders report). Pick one.
- **Markdown All in One** (`yzhang.markdown-all-in-one`) — TOC, list editing, table formatting. No
  wikilink opinion; no conflicts.
- **Code Spell Checker** (`streetsidesoftware.code-spell-checker`) — already effectively in use
  (`.vscode/cspell.json`); unaffected.
- Built-in `markdown.validate.enabled: true` — validates *relative* links only; useful precisely
  because the hybrid keeps `context/` on relative links. It does not understand wikilinks (it may
  or may not flag them depending on version — verify on first enable; if it flags them, scope
  validation per-folder or leave it off and rely on Foam).
- **YAML** (`redhat.vscode-yaml`) — optional; frontmatter is simple enough that it's marginal.

**Where VS Code will NOT match Obsidian — say it plainly:**

- **No Dataview or Bases execution.** No VS Code extension runs Dataview queries or renders `.base`
  files; in VS Code they are inert code blocks / YAML. Query-driven multi-home views are
  Obsidian-only. (No credible extension does this; treat any claim otherwise as unverified.)
- No `![[embed]]` transclusion rendering, no unlinked mentions, no alias-aware autocomplete as
  polished as Obsidian's, no properties UI.
- Foam's backlinks are workspace-index-based and occasionally stale after big git operations
  (reload window fixes it).

The practical division: **write and refactor in VS Code, browse and query in Obsidian.** That's a
coherent workflow, not a compromise, but it is a two-app workflow.

---

## 4. Obsidian side

**Vault = repo root** (so `context/` and `templates/` remain readable in-app even though their
links stay relative — Obsidian follows relative md links fine).

Settings that matter (all live in `.obsidian/app.json` unless noted):

- **Files & Links:**
  - *Use [[Wikilinks]]*: **on**.
  - *New link format*: **Shortest path when possible** — Obsidian auto-path-qualifies when a
    basename is ambiguous, which handles the 32 `_overview.md` and the 24 dup sets automatically at
    authoring time. (*Absolute path in vault* is the more deterministic alternative if the auto-
    qualification ever misfires; it just makes prose uglier.)
  - *Automatically update internal links*: **on** — this is the rename-safety payoff; the resulting
    multi-file diffs are reviewed in git anyway.
  - *Default location for new notes*: **Same folder as current file** (matches "everything
    canonical lives under `world/` in its scope folder"; prevents Obsidian dumping notes in vault
    root).
  - *Attachment folder*: set to a subfolder-of-current-file (e.g. `assets`) **after** checking
    where existing images actually live — image conventions were not audited; do not let it default
    to vault root.
  - *Excluded files*: `foundry/`, `scripts/`, `automation/`, `.venv/`, `.cache/`, `.output/`,
    `.state/`, `.history/`, `fonts/` — keeps enricher `[[…]]` out of the unresolved-links pane,
    node_modules out of search, and mirrors the CLAUDE.md never-read list.
- **Core plugins:** Backlinks, Outgoing links, Tags, Search, **Bases** (Obsidian ≥1.9 — the format
  `timelines.md` already documents), Templates (folder: `templates/` — note the templates carry
  Foundry-style placeholder text; they work as Obsidian templates as-is), Properties view.
- **Community plugins, deliberately short:**
  - **Dataview** — only if Bases proves too limited for embedded-in-note queries; Bases first,
    since the vault's own docs standardize on it. Don't run both query dialects in anger.
  - **Tag Wrangler** — one-off value during migration (rename/merge tags with vault-wide rewrite)
    and ongoing tag hygiene. Use with care: it must never touch the machine namespace
    (`combat-runner`, `cr-*`, faction slugs referenced by `config.toml`).
  - **Linter** — optional, configured narrowly (YAML key order, tag format) and set to
    lint-on-command, **not** lint-on-save, or it will churn git behind VS Code's back.
  - **Explicitly not**: Obsidian Git (competes with the real git workflow), anything that
    auto-rewrites files on open.
- **`.obsidian/` in git:** commit `app.json`, `appearance.json`, `core-plugins.json`,
  `community-plugins.json`, `graph.json`, and each plugin's `data.json`; **gitignore
  `workspace.json`, `workspace-mobile.json`, and any `*cache*`** — workspace state churns on every
  app focus. Add to `.gitignore`:

  ```
  .obsidian/workspace.json
  .obsidian/workspace-mobile.json
  ```

---

## 5. Migrating existing content — staged and reversible

Every stage is one branch, one atomic commit-set, verified before merge. Never mix a normalization
commit with a prose edit.

**Stage 0 — infrastructure (no content changes).** `.obsidian/` per §4, `.gitignore` additions,
Foam config in `.vscode/settings.json` or the workspace file, this plan filed in `context/plans/`.
*Verify:* Obsidian opens the vault; `make check-context` still passes (it will — nothing touched).

**Stage 1 — frontmatter normalization (mechanical; no links touched).**

1. **Decide `combat-runner`'s fate first.** The tag is retired as a *practice* — NPCs are moving
   into Foundry as the source of truth for stat blocks over time — but as of 2026-08-24 the string
   is still in ~40 files under `world/`, `scripts/foundry/build_actors.py` is unchanged, and
   `make foundry-actors` (Makefile:132) still runs. Two options:
   - **Retire the pipeline.** Strip the `#` everywhere and don't run `make foundry-actors` again.
     If it's ever needed, patch lines 453/466 at that point (2 lines).
   - **Keep it working.** Patch `scripts/foundry/build_actors.py` lines 453/466 so discovery
     accepts `combat-runner` with or without `#` (the rest of the file already `lstrip("#")`s),
     run `make foundry-actors`, and record the actor count as the baseline.

   Either way the `#`-strip is unblocked; only the verification step in this stage changes.
2. Script-strip `#` from YAML tag arrays (210 files). Do **not** touch `#combat-runner`-style
   *body* text outside frontmatter.
3. Rename `last-modified:` → `last_modified:` (188 files; matches the newer `context/` convention
   and this vault's own newest docs). Obsidian is indifferent to either; the win is one grep-able
   spelling.
4. Optionally convert the 34 body-style `**Tags:**` files (incl.
   `world/factions/calderon-imperium/_overview.md` and the `templates/`) to real YAML — this is the
   stage that makes them visible to Obsidian at all.

*Verify:* `make foundry-actors` produces the identical actor set; `make check-context` passes;
spot-check the four `config.toml` scopes' tags were not renamed, only de-`#`ed if present; in
Obsidian, the tag pane now shows `npc` 32+, `elderholt` 24+, etc.

**Stage 2 — wikilink pilot: `world/factions/elderholt/` only.**

The converter (a new `scripts/` tool, dry-run by default like `fix-md-links.py`):

- Reuse `LINK_PATTERN` and the code-stripping approach from `check_context.py`'s `prose_only` —
  never rewrite inside code spans/fences.
- For each relative `.md` link: resolve against the source file; if the target basename is **unique
  in the vault** → `[[basename|original text]]` (always keep the alias — preserves prose and
  survives future qualification); if **ambiguous** (`_overview.md`, `README.md`, the 24 dup sets) →
  path-qualified `[[world/factions/elderholt/_overview|Elderholt]]` (vault-relative,
  extensionless — Obsidian's canonical disambiguated form, and what "shortest path when possible"
  would itself generate). Preserve anchors as `[[note#heading|text]]`.
- Skip-list: the four enricher-syntax files, all image links, all external/`#`-only links, anything
  under the non-lore zones.
- Emit a reversible mapping file (old → new per file) into the scratchpad/`.output/` for audit.

*Verify (this is what "it still works" means):*

- Obsidian: unresolved-links pane shows zero new entries under elderholt; backlinks on
  `marrith-the-ashen-measure.md` list its referrers.
- `make foundry-actors` — identical output (elderholt has combat NPCs).
- `make check-context` — passes (it never looks at `world/`, but run it anyway).
- MCP `fix_md_links` dry-run — reports no *new* broken relative links (it cannot see wikilinks;
  that's expected and now by design in lore zones).
  `_drop_list_items_with_relative_links` (line 138) with a wikilink pattern
  (`\[\[(?:[^\]|]*\|)?([^\]]+)\]\]` → keep display text; drop Related-Links bullets containing
  PDF: no `[[` anywhere.
- Foundry ties: expect drift flags on elderholt-sourced attributes; re-read/re-hash per the
  documented loop (`context/foundry/attributes.md` §keeping the label honest). This is
  acknowledgment, not repair.

**Stage 3 — the rest of the lore zones**, one commit per top-level dir (`world/` remainder,
`oneshots/`, `characters/`, `sessions/`, `campaigns/`, `items/`), same verification each time.
History event *bodies* may be converted (they're prose); history **frontmatter and filenames are
untouched**.

**Stage 4 — templates.** Convert example links inside `templates/*.md` bodies to wikilink form so
new docs are born in the new convention; leave `templates/README.md` relative (it's inside
`check_context.py`'s target list).

**Never converted:** `context/`, `CLAUDE.md`, root `README.md`, `scripts/`, `foundry/`,
`automation/`.

**Reversibility:** each stage is a revertable commit; the mapping files make a mechanical
back-conversion possible even after later prose edits (per-file, per-link). Nothing renames or
moves a file in any stage — so `lore.py`'s path/glob contracts, `config.toml` scopes, and ties
path-labels are structurally untouched.

---

## 6. Going forward

- **Frontmatter standard (one paragraph, added to `context/world/README.md`):** every lore doc:
  `created`, `last_modified`, `status`, `tags` (YAML array, no `#`, kebab-case), `aliases` when the
  in-world name differs from the filename. Machine tags (`combat-runner`, `cr-*`, creature types,
  faction slugs, `public`/`private`) are reserved — never rename without checking
  `build_actors.py` and the history `config.toml`s.
- **Link convention (replaces "Use relative links between docs" in `context/world/README.md`):**
  wikilinks in lore zones, always with `|display text`, path-qualified when the basename is shared;
  relative paths remain the law in `context/` and anything `check_context.py` covers. State the
  zone table from §1 verbatim.
- **Templates:** already converted in Stage 4; map Obsidian's core Templates plugin at
  `templates/`.
- **Lint/CI:** extend the existing pattern rather than adding a framework — a
  `scripts/check_lore_links.py` twin of `check_context.py` that resolves both wikilinks (basename
  index + path-qualified) and residual relative links across the lore zones, wired as
  `make check-lore` and into whatever runs `make check-context` today. It also enforces the
  frontmatter standard (required keys present, no `#` in tags). Expose it through the MCP server
  with an `MCP_TOOL` dict like `fix-md-links.py`'s so sessions can run it.
- **CLAUDE.md:** one routing-table row change at most (it's length-capped and checked): point the
  world-authoring row's target at the updated `context/world/README.md`; the convention itself
  lives there, not in CLAUDE.md.
- **Memory/instructions for future sessions:** the "Read this when" header of
  `context/world/README.md` carries the new rule; nothing else needed — sessions already route
  through it.

---

## 7. Risks and the escape hatch

| Risk | Severity | Mitigation |
|---|---|---|
| `build_actors.py` stops discovering combat NPCs after tag normalization | Low — the tag is retired and NPCs are migrating into Foundry; was High/silent while the pipeline was in use | Stage 1 step 1: either retire the pipeline outright, or patch lines 453/466 and diff actor counts before/after |
| Markdown stat blocks and Foundry actors drift apart once Foundry is the source of truth | Medium, ongoing (independent of this migration) | Settle what the markdown still owns — see §8 |
| History `config.toml` tag filters silently empty | Medium | No tag renames, only `#`-strips; eyeball the four configs in Stage 1 |
| `fix_md_links` and `check_context.py` blind to wikilinks → broken lore links accumulate unseen | Medium, chronic | `check_lore_links.py` (§6) before Stage 3 completes; Foam's placeholder report as the interactive view |
| GitHub web view of `world/` loses clickable links | Low–Medium, permanent in converted zones | Accepted cost of the hybrid; `context/` (the thing actually read on GitHub by tooling docs) keeps working links |
| Ties drift flags on every converted attribute-source file | Low (by design) | Run the documented re-read/re-hash loop once after each stage; blobs-as-identity means nothing is lost |
| Obsidian background rewrites (link auto-update, linter-on-save) racing VS Code | Medium | Linter on-command only; review every Obsidian-generated diff in git before commit; `.obsidian/workspace.json` gitignored |
| Duplicate basenames resolving to the wrong file | Medium | Converter path-qualifies all ambiguous targets; "shortest path when possible" qualifies new ones; `check_lore_links.py` verifies resolution, not just existence |
| Future timeline renderer assumptions | Unknown — renderer doesn't exist | Frontmatter and filenames frozen; only event *bodies* carry wikilinks, and the renderer contract (per `timelines.md`) is frontmatter + body-as-prose |

**Escape hatch, in increasing order of retreat:**

1. **Stop converting, keep everything gained.** Tags, Bases, MOC notes, and Obsidian itself all
   work with relative links — Obsidian follows them natively. Halting after Stage 1 still delivers
   the entire multi-home motivation.
2. **Revert a zone**: each stage is atomic commits; `git revert` restores relative links for that
   zone, and the mapping files handle any file edited since.
3. **Full bail-out**: revert Stages 2–4, keep Stage 0–1 (frontmatter normalization is strictly
   beneficial regardless of editor), delete `.obsidian/`. The only permanent residue would be the
   both are harmless no-ops in an all-relative-links vault.

The one-way doors are few: nothing in this plan renames files, moves folders, changes history
frontmatter, or renames tags — those are the four things this repo's machinery actually depends on.

---

## 8. Open question — what the markdown still owns

NPC stat blocks are migrating into Foundry as the source of truth, and `combat-runner` is retired
as an authoring practice. That is orthogonal to this migration, but it lands on the same files, so
settle it before Stage 3 sweeps `world/`:

- **Stat blocks → Foundry.** Once an actor exists in Foundry, the markdown numbers are a stale
  copy. Either delete them, or mark them explicitly as a design record rather than live data.
- **Lore stays in markdown.** `pentaryn-ties` anchors attributes to `source: { blob, path }` where
  the git blob is the identity (`context/foundry/attributes.md` §source). That system wants the
  markdown to keep existing and keep being the prose of record — it is pointing at *what a
  character knows and why*, not at their AC. Moving stat blocks out doesn't threaten it; deleting
  the files would.
- **The practical split**, if it holds: markdown owns identity, history, relationships, motive and
  the ties source text. Foundry owns numbers, items, and anything the VTT rolls.
- **Consequence for §5:** files that lose their stat block get smaller, not renamed — so the link
  migration is unaffected either way. But do the stat-block cleanup *before* the wikilink sweep on
  a folder, so the two changes land in separate, readable commits.

---

## 9. Execution log

| Stage | Commit | State |
|---|---|---|
| Plan filed | `b84b13a` | done |
| Stage 1 — frontmatter normalization (210 files) | `0a2a192` | done |
| Stage 0 — `.obsidian/`, `.gitignore`, Foam settings | `38cdd28` | done |
| Review fallout — actor discovery, lore.py parser, docs, config | `4cb4c10` | done |
| Stage 2 precondition — repair broken relative links | `a812895` | done (61 → 4) |
| Stage 2 — wikilink pilot on `world/factions/elderholt/` | — | pending |
| Stages 3–4 — remaining lore zones, templates | — | pending |

A Fable review after Stage 1 returned **YELLOW**, on one finding: Stage 1 was
executed without its own declared precondition, leaving `make foundry-actors`
silently dead. Fixed in `4cb4c10`. What the review confirmed as clean: the
normalization diff touched only frontmatter, every tag pair differed solely by
`#` removal, no date value changed, and `.obsidian/`'s keys are real settings.

### Still open, needing a decision rather than a patch

- **`items/magic-items/shroom-kindom-loot.md` is two documents.** A loot list
  (no frontmatter of its own) with a complete "Golem Spine Rivet" item doc
  concatenated on at line 49, frontmatter included. It holds the vault's only
  remaining `last-modified:` and `#`-prefixed tags, so it is a false positive on
  every "did we get them all" grep. Needs a split; the new filename is an
  authoring call.
- **Four references to documents that were never written**:
  `npcs/selise-dawnquill-silverbridge-arcana.md` and
  `npcs/hesta-briarvein-willowglass-apothecary.md` (from `ardenhaven/_overview.md`
  and `ardenford.md`), and `lore/khorbhogkhor.md` (from `thrulm/_overview.md`).
  Write them or drop the links — not link errors, content gaps.
- **Obsidian will create `appearance.json`, `graph.json` and `types.json`** on
  first launch. Commit them after opening the vault, or extend the gitignore.
- **Whether `combat-runner` is retired for real.** The pipeline works again; the
  tag is still on 29 files. Retiring it means dropping the Makefile target and
  the template, which is a separate cleanup.
