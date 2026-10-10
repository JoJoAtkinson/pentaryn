---
title: "Silent failure — a failed roll hands the player nothing"
status: superseded-in-part
last_modified: 2026-10-08
tags: [context, plans, foundry, attributes]
---

# Silent failure — a failed roll hands the player nothing

> **⚠ Reversed in part on 2026-10-08.** The "`miss` is a GM note, never shown to players" rule
> below was wrong. Joe's design: every discoverable thing has pass text and fail text; a pass shows
> the pass text; a failure with **empty** fail text shows **nothing** (that part of this plan, and
> the blank-card hardening, stand); a failure with **written** fail text shows **that text** to the
> player, delivered and drawn exactly like a pass, so it reads as what their character takes away
> and never says it failed. Why: the field exists so the GM can hand a failed check a partial or
> misleading impression; hiding it made authored text pointless and the labels told Joe it would
> never be seen. What changed: `loreOutcome` returns `miss` on a failure; the Inspect cascade
> grants an attribute's `miss` on a failed rung under `identMissKey` (the creature's page, titled
> with the creature, never the attribute; the ident ledger row stays `text: ""`); `deliverFact` and
> `forgetFact` hand over/restore a failed lore row's text; the Look window draws ident failure
> cards; labels read "On a failure (shown to the player — leave empty to show nothing)". The
> lock/no-retry rule is unchanged. Current behaviour: [`../foundry/attributes.md`](../foundry/attributes.md).

**Read this when:** you need to know why `pentaryn-ties` stopped nagging for miss text, why a
failed lore/kind/identification roll draws no card, and what the `miss` field is now for.
**Not this file:** authoring attributes and lore rows → [`../foundry/attributes.md`](../foundry/attributes.md)
· reviewing them → [`../foundry/attribute-review.md`](../foundry/attribute-review.md).

Module: `foundry/module/pentaryn-ties`. Line numbers are as of the 2026-10-07 audit.
Design: Fable. Adversarial review: Opus. Build: Opus. Verify: Sonnet. No world data is touched.

## 0. What Joe asked for, and the one trade-off he should hear

Joe: blind rolls happen without the player knowing; authored failure text either gives the
success away or is so obviously a failure the player can tell; "it doesn't make sense they get
anything"; "maybe we just simply hide it from them"; the failure must still lock out a retry.

**The premise is fully true on one path and partly true on two.** The Inspect cascade rolls
chat-less (`study.mjs:1746`, `throwBlind(..., {silent: true})`), so the player never knows a
roll happened — and on that path a failure *already* delivers nothing. On lore tells and kind
study the player clicks a labelled button whose label, skill and DC they can see
(`known.mjs:530-536`), and a "privately rolled some dice" line posts. On those two paths "a
failure shows nothing" does tell them the check failed. That is the ordinary D&D outcome of a
failed check: they know *that* they failed, never *what* they missed, and the lock means they
cannot try again. This spec accepts that trade-off by design rather than papering over it with
coerced lies.

## 1. The rule

**A failed roll delivers nothing to the player: no card, no Known-list entry, no title, no
placeholder. The lock is still written and the stub still posts, so there is no retry.**

The old contract ("pass and fail must be indistinguishable, so author a miss") is replaced by
**failure is absence** — the contract the cascade and `look.mjs` already run on.

A lie is allowed in exactly one place: an **authored rung 0 on a kind** (the slot the release
select already labels as the miss rung, which nothing nags for). Lore rows and attributes get
no lie switch. Their `miss` field survives as a **GM note, never shown to players**.

## 2. Player plane, per roll type

| Roll | Pass | Fail | Lock / no-retry |
|---|---|---|---|
| **Attribute identification** (Inspect cascade) | Grant card titled with the attribute, only if `reveal` is non-empty (empty reveal = "not carrying" = same as fail on screen). | Nothing. **Unchanged** — the cascade already writes `text: ""` and grants nothing. The attribute-level `miss` was never delivered; the UI stops saying it is. | `writeIdentification` row with `total` on the subject + knowledge ledger `failed: true`. Fix: `delivered: pass && hold ? null : now` so a failed rung under hold is not left pending. **As built (review fix):** only a pass *with reveal text* parks (`parks = pass && hold && !!text.trim()`); an empty-reveal pass is never held, `deliverHeldIdentifications` frees a legacy empty pass's pending knowledge row, and `pending()` skips only empty rows whose total is under the DC. |
| **Lore rows** (carrier tells, attribute lore) | Card, `source` = row label. | Nothing. `loreOutcome` returns `text: ""` on a fail regardless of `miss`. | Belief row `{text: "", pass: false, total}` + `studied` hint. Unchanged. |
| **Kind / monster study** | Card with "— Studied (Skill) —" header + authored/derived text, as today. | Nothing — unless a `{min: 0}` rung is authored, in which case that text is delivered with the header (the deliberate lie, byte-for-byte the pass shape). The generic "Nothing about it means anything to you." card is **removed**. | Belief row `{tier, total, pass: false}` + `studied`. Unchanged. |

**Held rolls:** a failed roll with nothing to deliver is never held — `hold = fact.hold &&
!graded.silent` (`study.mjs:997`). Both `putBelief.delivered` and `applyPlayerWrites` read
`hold`, so one substitution covers both. A held rung-0 lie still holds, same as a held pass.

**Legacy data already in the world** (criticism 5, accepted):
- Held lore failures still pending store the old miss text in `rec.text`. `deliverFact`
  (`study.mjs:1276`) treats `rec.pass === false` as silent: lock stays, nothing is handed over.
- `forgetFact` (`study.mjs:2605`) restores a prior card only when it was earned. New rule:
  `earned = !!prior.delivered && !!text.trim() && (ns === "kind" || notMiss(prior))`, where
  `notMiss` is `pass !== false` and, for rows with no stored `pass`, `total >= dc` (the legacy
  grading `shareStatus` already does). Kind keeps `text.trim()` so a delivered rung-0 lie is
  restored like a pass (criticism 6 — the lie is the pass shape, Forget must not expose it).
- Legacy pending failed identification rows (`text: ""`, `delivered: null`, numeric `total`):
  `pending()` (`study.mjs:1314-1338`) skips them.
- Miss cards already delivered sit in players' `granted` maps. Pulling one is a visible
  change, so it is Joe's call, by hand. Build a GM-only audit — `S.audit.legacyMissCards()`
  on the module API, console output only (console-only is accepted at this table) — listing
  `{character, subject, factKey, text}` for every granted card backed by a `pass: false`
  belief or a legacy `total < dc`. No UI chip.

## 3. The `miss` field — decision

**Keep it everywhere it is stored; deliver it nowhere; nag for it nowhere.**

- **Lore rows:** `loreOutcome` → `text = pass ? clean.text : ""`. No `lie` key, no checkbox,
  no migration, no new row shape. Rejected the draft's opt-in switch (criticism 2, accepted):
  it adds a stored key, two checkbox handlers that both write `el.value` (`lore.mjs:217`,
  `review-ui.mjs:727`) and would clamp `"on"` to `false`, a diff field and a filter chip — all
  for a capability Joe said makes no sense. If he wants lore lies later the switch is additive.
- **Attributes:** `miss` stays in the entry clamp, `ATTR_CONTENT_FIELDS` and
  `SNAPSHOT_FIELDS` (criticism 4, accepted: removing it from the content fields would make
  `updateAttribute(id, {miss: ""})` an `unchanged` no-op — `attributes.mjs:505-506` — and the
  legacy text could never be cleared). Stays editable in the identify block and review panel,
  relabelled "GM note on a failure (never shown to players)". `clampSnapshot` and test 1124
  are untouched.
- **Kind rung 0:** unchanged semantics — authored rung 0 is delivered at tier 0, never carries
  upward (`authoredTier`, `known-core.mjs:594-600`). Unauthored rung 0 now delivers nothing.
  Record in the `authoredTier` comment (570-587) that Joe's 2026-10 request removed the
  generic "never heard of this beast" line and kept the authored lie as the one opt-in.
  **Open for Joe before build:** keep the authored rung-0 lie, or drop it too? Default is keep
  — it is the one un-nagged, deliberate authoring act. Whatever he says goes in that comment.
- **`loreRollable` is unchanged** (criticism 1, accepted: the draft's narrower predicate would
  break `resolveFact` 299/346, `factOrder` 2256/2262 → `look.mjs:158`, `factStatus` DC lookup
  2333/2336, preview 423, `attributes-ui.mjs:315`, `pending` label 1371 — a miss-only legacy
  row would stop resolving, Share/Forget would return "invalid", an already-granted card would
  vanish from Look, and legacy rows would lose their `dc`). Add a separate
  `loreOfferable = row => loreRollable(row) && !!clampLoreRow(row).text.trim()` and use it only
  in `loreStateFor` (`study.mjs:823`) and `attrLoreStateFor` (720): a miss-only row stays a
  real stored fact but is no longer offered, because a roll on it can only ever be silent.

## 4. GM plane

**Lore editor (`lore.mjs`)**
- Delete the `pt-lore-leak` icon in `summary()` (90-97) and `lore.leakWarn`; delete
  `.pt-lore-leak` (`ties.css:1281`).
- Textarea (128-131): `lore.missLabel` → "GM note on a failure"; `lore.missPlaceholder` →
  "Never shown to players. A failure hands them nothing and is recorded."; `lore.missHint` →
  "Players see nothing on a failure. Use this for your own reminder of what they missed."
- Rewrite the header comment at line 24.

**Attribute identify block (`attributes-ui.mjs:270-291`)**
- Keep the `miss` textarea; `attributes.identifyFailure` → "GM note on a failure (never shown
  to players)". Add `attributes.identifyFailHint` under the reveal field: "On a failure they
  get nothing, and the failure is recorded so they cannot retry."

**Review panel (`review-ui.mjs`)**
- Delete both `review.missEmpty` warnlines (388, 436) and the string; delete
  `.pt-review-warnline` (`ties.css:1843`, orphaned).
- Keep `miss` in `EDITABLE`, `LORE_EDITABLE` (86-87) and search text (313).
- `review.field.miss` → "GM note (on failure, never shown)".

**Preview / Simulate (`preview.mjs`)**
- 233: `r.text = r.pass ? entry.reveal : ""`.
- `rollLore` (301-302): already via `loreOutcome`, picks up the change for free.
- `said()` (332-335): fail → "(fail — nothing handed over; the failure is recorded)"; pass
  with no text → "(pass, but no reveal text — nothing handed over; ledger records NOT
  carrying)". Drop the "silence leaks" wording.
- Kind simulate (392): tier < 15 with no rung 0 → the fail line, no header; with rung 0 →
  the lie, badged "fail — rung-0 lie delivered".
- Player-view mode (442-453): unchanged; it already builds from `text`/`reveal`.

**Beliefs list (`authoring.mjs:93-117`, `study.mjs:1502-1540`)**
- `beliefs()` forwards `pass: rec.pass`, and for kind derives `pass: tier >= 15`
  (criticism 8). The list shows a "missed" tag beside "rolled {total}" when `pass === false`.
- `authoring.beliefSilent` → "Nothing handed over."

**Release select (`known.mjs:449`)** — this is `grantKind`, not the tier editor (criticism 7).
`known.study.rung0` → "Mark as failed (rung-0 text if authored, else nothing)".

**Toasts / dialogs (GM-only)**
- `study.mjs:1025`, 1279: `notify.missed` ("{character} studied {kind} and missed") when
  `!graded.pass`; `notify.delivered` otherwise.
- `known.study.holdSilent` → "Missed — nothing to hand over; the failure is recorded."
  (`promptDeliver` 1250, `promptCascadeDeliver` 1854.)

**GM ledgers — unchanged, verified:** `shareStatus` (`known-core.mjs:2158-2185`) grades a
no-text failure with `pass: false` as `"failed"` via `!text`; kind `tier < 15` → `"failed"`;
ident empty text → `"failed"`; `"locked"` via `failedKnowledge`. "Missed it" filter,
`attributes.state.failed` tag, "Tell them" button, `theyFailedThis` marker, `planStep` break at
a failed rung, `knowledgeTree` hiding failed nodes from players — all read these and are
untouched. Share over a failure keeps the failed row as `prior`.

## 5. Indistinguishability check (on-screen only)

| Observable | Cascade pass, empty reveal | Cascade fail | Lore/kind pass | Lore/kind fail |
|---|---|---|---|---|
| Grant card / Known entry | none | none | card | none |
| `character.update` | none (`commitGrants` early-returns) | none | `studied` + `granted` | `studied` only |
| Look window repaint | unchanged HTML → none | same | repaint | none |
| Chat stub | one, always | same | always | always |
| Blind-roll chat line | none (`silent: true`) | none | one | one |
| Offer / button removed | n/a | n/a | yes | yes |
| Tempo bubble | outcome-independent | same | same | same |
| GM toast / dialog | GM-only | GM-only | GM-only | GM-only |

Cascade: pass-with-nothing and fail are identical on every row the player can see; the only
difference is how long the silent loop runs. Lore/kind: pass-with-nothing cannot occur
(`loreOfferable` requires `text`; kind always composes non-empty text at tier ≥ 15), so a pass
draws a card and a fail does not — the accepted trade-off in §0. A delivered rung-0 lie is
byte-for-byte the pass shape. Keep `composeStudyPayload`'s full derivation at every tier.

## 6. Docs

- **`context/foundry/attributes.md`** — rule 6 (83): "A failure hands the player nothing and
  is recorded so there is no retry. The only lie is an authored rung 0 on a kind, and it must
  never contain a true gated detail." Lines 381-384: replace "`miss` is not optional … leaks
  failure by silence … ⚠" with: `miss` is a GM note, never delivered; the attribute-level
  `miss` never was. Line 64: `reveal` is the recognition text; `miss` is the GM note. Example
  `miss:` strings (81, 329, 418, 514-526): delete or relabel as notes. Rung-0 section
  (440-473): "An unauthored rung 0 delivers nothing. An authored rung 0 is a deliberate lie."
- **`context/foundry/attribute-review.md`** (23-24, 64): `miss` is still editable and
  snapshotted; add "it is a GM note and is never shown to players."
- **`context/pentaryn.md:422`** (Vrinn "safe bets"): append "(never delivered — the cascade
  grants nothing on a failure; kept as a GM note)".
- **`pentaryn-ties/README.md:206`**: field description.

## 7. File-by-file change list

- **`known-core.mjs`** — `clampLoreRow` (1018-1024): comment → GM note. `loreRollable`
  (1036-1047): unchanged; add `loreOfferable` beside it. `loreOutcome` (1067-1090):
  `text = pass ? clean.text : ""`, rewrite comment. Entry clamp (1376-1379): comment → "GM
  note, never delivered". `ATTR_CONTENT_FIELDS`/`SNAPSHOT_FIELDS`: unchanged. New pure helper
  `studyDescription({authored, derived, tier, none})` → `authored || (tier >= 15 ? (derived ||
  none) : "")`. `authoredTier` comment (570-587): record the 2026-10 decision.
- **`study.mjs`** — `composeStudyPayload` (560-603): use the helper; return `""` (no
  header-only card) when empty; rewrite comment 590-597. `resolveFact` kind (279-291):
  `silent: !text`. `applyStudy` (~997): `hold = fact.hold && !graded.silent`; `notify.missed`
  on fail. `loreStateFor` (823), `attrLoreStateFor` (720): `loreOfferable`. Cascade
  (1752-1775): delete the dead `entry.miss` read; `delivered: pass && hold ? null : now`.
  `deliverFact` (1276): `silent = rec.pass === false || !rec.text.trim()`. `forgetFact`
  (2605): `earned` per §2. `pending()` (1314-1338): skip empty-text `#id` rows with numeric
  `total`. `beliefs()` (1520-1532): forward `pass`. `applyPlayerWrites`: logic unchanged,
  rewrite its comment. New `audit.legacyMissCards()` exported on the API.
- **`lore.mjs`**, **`attributes-ui.mjs`**, **`review-ui.mjs`**, **`preview.mjs`**,
  **`authoring.mjs`**, **`known.mjs`** — as §4.
- **`lang/en.json`** — delete `lore.leakWarn`, `review.missEmpty`, `known.study.derived.unknown`.
  Change `lore.missLabel/missPlaceholder/missHint`, `review.field.miss`,
  `attributes.identifyFailure`, `known.study.rung0`, `known.study.holdSilent`,
  `authoring.beliefSilent`. Add `attributes.identifyFailHint`, `known.study.notify.missed`,
  `authoring.beliefMissed`.
- **`styles/ties.css`** — delete `.pt-lore-leak` (1281) and `.pt-review-warnline` (1843).
- **Docs** — §6.

## 8. Tests — `test/known.mjs` (baseline 165/165)

Change:
- 862-873: miss text authored → `loreOutcome` on a fail is `{pass: false, text: "", silent:
  true}`; cancelled roll still `null`.
- 875-885: keep; update the comment (the lock and stub are still the caller's job).
- 888-909: **keep 901** (miss-only is still rollable). Add `loreOfferable`: text-only →
  true; miss-only → false; neither → false; no label → false.
- 843-845, 1124, 2069/2095: unchanged.

Add:
- `studyDescription`: tier 0 unauthored → `""`; tier 0 with rung 0 → rung text; tier 15
  authored → authored; tier 15 unauthored → derived; tier 15 with neither → `none`; rung 0
  never carries to 15 (reuse 1752-1783 fixtures). There is no tier between 0 and 15, so
  `none` is reachable only at 15+.
- `shareStatus`: `{text: "", total: 7, pass: false, delivered}` → `"failed"`.
- `priorOf`: a no-text failure with a total keeps its prior (`known-core.mjs:839`).
- `loreOutcome` across DC boundaries: `dc-1` → silent empty; `dc` → pass with text.

Hand checks (Foundry globals; Sonnet verify pass on a test actor after Joe approves):
failed lore roll → no card, belief `pass: false`, "Missed it" lists it, Share over it works,
no GM deliver dialog; kind tier-0 roll with no rung 0 → no card, button gone, belief written;
kind tier-0 with rung 0 → lie card with header; an existing miss-only row still resolves for
Share and Forget; a legacy held failure delivers nothing on Deliver; a legacy pending failed
`#id` row no longer appears in `pending()`; the review panel and lore editor show no warning.

## 9. Review verdicts (Opus adversarial pass)

Accepted: 1 (`loreOfferable`, keep `loreRollable`), 2 (no lore `lie` switch), 3 (drop
`derived.unknown`; keep authored rung 0 pending Joe), 4 (keep attribute `miss` editable and
in the field lists), 5 (`deliverFact`, `forgetFact`, console audit for delivered cards),
6 (kind Forget restores a delivered rung-0 lie), 7 (release-select label), 8 (forward
`pass`; `beliefSilent` text), 9 (`pending()` skip), 10 (hold gating), 11 (state the
trade-off), 12 (test plan).

Rejected: none outright. One narrowing — 5(a)'s "review chip" option is dropped in favour of a
console-only API because console exposure is accepted and a chip is UI for a one-time sweep.
