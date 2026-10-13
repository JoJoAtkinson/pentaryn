---
title: "Attribute Review — Joe's sign-off panel and \"the selected attributes\""
status: active
last_modified: 2026-10-08
tags: [context, foundry, attributes, review, npc-ties]
---

# Attribute Review — Joe's sign-off panel and "the selected attributes"

**Read this when:** Joe mentions the attribute review panel, says **"selected"** / "the selected
attributes" / "the two I ticked", asks what he has or hasn't reviewed or what changed, or you are
about to edit attributes while he is reviewing them.
**Not this file:** creating, linking or tuning attributes → [`attributes.md`](attributes.md) (every
recipe there still applies; this file only adds the review layer on top).

---

## The panel in one paragraph

A GM-only window, opened from the **tag icon (`fa-tags`) in the left toolbar's token tools**,
next to Argon's combat-hub swords (or `game.pentaryn.ties.attributes.openReview()`). It lists
**every registry entry in one flat list**: unreviewed ones on top with an amber outline, then the
rest by title. Editing a field never signs an entry off — only the **Mark reviewed** button does. Joe can **read, text-edit and sign off** — title, category, skill, DC, reveal, miss,
and each lore row's label/skill/DC/text/miss. `miss` is labelled "On a failure (shown to the
player — leave empty to show nothing)": a failed roll hands the player that text, or nothing when
it is empty (2026-10-08), and the panel does not warn when it is empty. He **cannot** change ids, create, delete, add or
remove lore rows, link/unlink carriers, or change parent/icon/secret/help scale/hold/source.
Those come to **you** as prompts, naming entries by the ids the panel shows. Relationships
(parent, children, carriers, facts) are shown read-only so he can see what to ask for.

## "Selected" — always read it, never guess

Each row has a checkbox. The ticked set is stored on Joe's GM user (flag
`pentaryn-ties.attrSelected`) and survives reloads. **When Joe says "selected", read it first:**

```js
// eval-js
return game.pentaryn.ties.attributes.selected();
// → [{ id, title, category, parent, reviewState }, …]   in the order he ticked them
```

Recipes (`const A = game.pentaryn.ties.attributes`):

| Joe says | Do |
| --- | --- |
| "update the selected …" | `for (const { id } of A.selected()) await A.update(id, patch)` — check each `.ok` |
| "link the two selected" | **Ambiguous — ask which he means** unless clear: tree (`A.update(child, { parent: parentId })`) or something else. Attribute-to-attribute is the parent tree; `A.link(actor, id)` is creature-to-attribute |
| "what's selected?" | report `selected()` as `id — title` |
| "clear / deselect them" | `A.clearSelection()` — **only when he says so**; the ticks are his working set |

Also: `A.select(refs, { replace })`, `A.deselect(refs)` (ids or names; misses come back in
`missed`). An empty `selected()` means nothing is ticked — say so rather than guessing.
**Mark reviewed** in the panel also unticks that row (Unreview does not), so the selection is
always what is still being worked on.

## Review state

Every entry carries five bookkeeping fields (times are **epoch ms** or `null`):

| Field | Set by | Meaning |
| --- | --- | --- |
| `createdAt` | `A.create` / `A.ensure` (when creating), the sheet's "author entry" button | when it was made; `null` = predates timestamps (Oct 2026) |
| `modifiedAt` | any write that **actually changes** a content field | last content change |
| `reviewedAt` | Joe's **Reviewed** button only (and refreshed when he edits an entry that is *already* reviewed) | last human sign-off; `null` = never |
| `touched` | `A.update` (API path) | content field names changed since the sign-off, e.g. `["reveal","lore"]` |
| `reviewedSnapshot` | the **Reviewed** button | the content (title, category, skill, DC, reveal, miss — the failure text, shown to the player on a failed roll — parent, flags, lore) as it was at the sign-off; the panel shows the old text under anything changed since. `null` = signed off before snapshots existed |

`reviewState` is `unreviewed` (never signed off) · `changed` (modified after the sign-off) ·
`reviewed`. The panel shows `changed` as **"Changed since review: reveal, lore"** from `touched`.

**What this means for you:**

- **`A.update` and `A.create` un-review.** Anything you write shows up amber at the top of Joe's
  list with the fields you touched — that is the point; he reviews your work.
- A **no-op patch writes nothing** (`{ ok: true, unchanged: true }`), so re-running a script does
  not un-review anything. A real change returns `changed: [fields]`.
- `link/unlink/tell/repair` are actor-side and do **not** change review state.
- The review fields cannot be set through `A.update` — they are stripped from any patch.
- **Never call `A.review()` or `A.unreview()` unless Joe explicitly asks** ("mark those reviewed").
  Sign-off is his. The panel's own save (`reviewedUpdate`) is deliberately not on the API.
- **Joe's edits in the panel never change review state.** Editing a reviewed entry keeps it
  reviewed; editing an unreviewed/changed one leaves it amber until he clicks **Mark reviewed**.

## Reading what is new

There is no separate change log — **the timestamps are the log**.

```js
return game.pentaryn.ties.attributes.unreviewed();
// → [{ id, title, reviewState, touched, modifiedAt, createdAt }]  — what still needs his eyes
return A.list().sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0)).slice(0, 10)
  .map(e => ({ id: e.id, title: e.title, modified: e.modifiedAt && new Date(e.modifiedAt).toISOString() }));
```

## Gotchas

- **The registry syncs to every client**, players included. Nothing in the text is hidden from a
  determined player's console — same rule as [`attributes.md`](attributes.md).
- **Registry writes are queued per tab only** (`serial` in `attributes.mjs` is an in-memory chain
  on one client). Your `A.update` runs in the bridge tab; Joe's panel save or Reviewed click runs in
  his browser tab. If they land together they race: each rewrites the whole registry setting and the
  **second write wins** at the setting (no merge). The version stamp (below) then has the overwritten
  tab re-apply its own change once; the reload banner and refused save cover your write landing
  *before* his save.
- The panel **live-refreshes** when you write (once, 150 ms after the last write of a burst), but
  defers while Joe has a text field focused (not the search box), so your write cannot eat his draft. If you change an entry whose row he has
  open meanwhile, that row shows **"Changed by Claude — click to reload"**, and a save of a field
  you changed is **refused** rather than written over your change.
- **Writes from two GM tabs** (the bridge and Joe's) are caught by a version stamp: every registry
  write stores `{ stamp: "registry", rev, by }` as one extra element of the setting (readers drop
  it). So in an ad-hoc eval read the registry with `api.attributes.list()`, not the raw
  `game.settings.get("pentaryn-ties", "attributes")`, which ends with that non-entry row. A write that lands on top of another tab's without having seen it makes the overwritten
  tab re-apply its own change once; if both changed the **same field** the later one stands and
  Joe's open row gets the reload banner.
- **Rows keep their place** while he works. Order is recomputed on open, on a sort change, after
  Reviewed/Unreview, and from the **Re-sort** button; an entry you create appears at the top.
- A panel edit that would rename onto another entry's name is refused (same rule as `A.update`)
  and the field snaps back.
- Carrier counts are world actors only; unlinked token copies are not counted.
- Code: [`review-ui.mjs`](../../foundry/module/pentaryn-ties/review-ui.mjs) (panel),
  `attributes.mjs` (`commitNow`, `serial`, `reviewedLoreUpdate`, selection), `known-core.mjs`
  (`reviewState`, `sortForReview`, `changedFields`, `snapshotOf`/`clampSnapshot`, `readSelection` —
  fixtured in `test/known.mjs`).


## Global vs Personal filter

The filter row has a scope pair, **Global** (the default) and **Personal**, which sits beside All, Needs review and Selected.

- **Personal** holds entries whose `category` is `personal`. These are one character's own history, titled "{Character} History", and are never reused. They are usually a high DC (about 25), because the payoff is huge.
- **Global** holds everything else: reusable world-building.

To make a personal attribute, call `A.ensure("<Name> History", { category: "personal", … })`, then `A.link(actor, "<Name> History")`.
