---
created: 2026-08-22
last-modified: 2026-08-23
tags: ["#playbook", "#foundry", "#vtt", "#npcs", "#design", "#ui"]
status: shipped — 0.10.0, verified in play as GM and as a player; iteration 3 (dialog direction inversion + link-by-identity reverse side) proposed, in build; iteration 4 (GM-only inbound view on the sheet) proposed — data layer landed, renderer specced; the open disguise question resolved 2026-08-23 → foundry-disguise.md
---

# NPC Ties — sheet GUI redesign

**Read this when:** changing the ties *editor* UI — the sheet tab and the standalone window.
**Design doc**, companion to [`foundry-npc-ties.md`](foundry-npc-ties.md), which owns the data
model and the canvas layer; nothing here changes either. To *use* ties at the table, read
`foundry/module/pentaryn-ties/README.md`.

> **Goal.** The panel opens as something you *read* — mid-scene, "what is Piet to these people"
> answered by scanning, not by squinting at form controls. Editing is one flick away and, once
> you are in it, exactly as cheap as today: change a field, it saves, no submit button.
>
> The ask (2026-08-22): the editor should open **without** editing; rows should read
> **name → word → controls**; the reference view should be richer; simplicity and
> edit-cheapness stay.

Mockup to judge the design by: `scratchpad/ties-gui-mockup.html` (session scratchpad — a static
page with a working read/edit toggle, both widths, fake data). Not checked in; regenerate from
this doc if it has expired.

---

## What the research found (and why it decided the shape)

Probed on disk in `~/Library/Application Support/FoundryVTT/Data/systems/dnd5e` (5.3.3):

| dnd5e already has | Where | Verdict |
| --- | --- | --- |
| A Play/Edit split on every actor sheet | `PrimarySheet5e.MODES = {PLAY:1, EDIT:2}`, `get isEditMode()` | ✅ the tab **inherits it** |
| The toggle control itself | `<slide-toggle class="mode-slider" data-action="changeMode">`, a globally registered custom element, prepended to `.window-header` | ✅ the standalone window **reuses it** |
| Mode state that survives re-render | `this._mode` on the app instance; mode change does `submit()` + full `render()` | ✅ same pattern for the window |
| Mode broadcast to CSS | root classes `.editable` / `.interactable` / `.locked` set in `_onRender` | reference — ours keys off a class on the panel |

This finding replaced the original instinct (a per-panel edit button of our own design). The
sheet already teaches every dnd5e user one gesture for "unlock this sheet"; a second, private
toggle inside one tab would be a competing idiom to learn and a second piece of state to hold.
Instead:

- **Sheet tab: mode = `app.isEditMode`. No state of ours at all.** Flip the sheet's own
  slider and dnd5e re-renders; our render hook refires; the tab repaints in the new mode. This
  works for players too — an owner gets the slider on their own sheet.
- **Standalone window: opens in read mode**, with the same `slide-toggle` prepended to *its*
  header (the element is registered globally by dnd5e, so it is available to us; if it ever
  isn't — non-dnd5e world — a plain lock/unlock header button is the fallback). Mode is one
  private instance field, which survives repaints for the same reason dnd5e's does.
- **The header people-arrows button is untouched.** It still opens the window — which now lands
  in read mode, which is precisely "open without editing".

---

## The decisions

### 1. Read mode is the default, and it is the cards' design language

The canvas cards are the module's existing reference view: round token art, stance-coloured
word, dimmer name, prose underneath. The sheet's read mode reuses that vocabulary as a **row**
instead of a floating card — same parts, same colour rules — rather than inventing a third
style. A GM who knows the cards already knows how to read the tab.

Read-mode row, left to right:

```
[portrait]  Name          word        (stance chip)  (strength pips)  [pin]
            └ one-line note preview, dimmed, click to unfold ┘
```

- **Portrait** — small round `tie.img` (already returned by `read()`), mystery-man fallback,
  greyed for a missing actor. The face is the fastest scan key there is; the cards proved it.
  **In both modes**, beside the name, in the same 28px column — an unlabelled face is a worse
  scan key than a face with a name under your eye, and a row that loses its art on the flick to
  edit mode reads as a different list. Note the source differs from the cards on purpose: the
  cards prefer the *token* texture (`token.document.texture.src`) because you are looking at
  that token on the map, while the sheet takes **`actor.img`**, the portrait. Sheet rows have no
  token to prefer — a tie may be to someone with no token on this scene at all — and token art
  is drawn to read at map scale, often top-down. Resolved live from the linked actor each paint,
  never cached like `name`, so changing an actor's portrait updates every row that names them.
- **Name first, and prominent.** It is the thing you scan for (the ask, and correct). Still a
  link that opens the sheet; still italic-grey with the tooltip when the actor is missing.
- **Word second**, stance-coloured and semibold — exactly how the card renders it. An empty
  word falls back to the italic, dimmed stance label, the same fallback the cards use, so a
  wordless tie reads as "recorded, neutral" and visibly invites a better word.
- **Stance chip** — the dot *plus its label* ("Friendly"), small and quiet. The bare dot made
  you carry the colour code in your head; five words is not too many to just say.
- **Strength pips** — see decision 3.
- **No trash can, no add row, no mirror checkbox, no help paragraph.** Read mode is for
  reading; every edit affordance is one flick of the slider away. The help prose moves to edit
  mode, where the concepts it explains live.

### 2. Edit mode keeps today's editor, reordered

Same grid, same save-on-change, no submit button. Changes from today:

```
[portrait]  Name    [word input]  [stance select]  (strength pips*)  [pin] [trash]
```

- **Name before word** (the ask). The name is not an input — it was never editable here and
  the cached-name design means it never should be.
- **Stance stays a `<select>`.** The five labels *are* the meaning; a dot-only segmented
  control would trade one click for a colour code you have to remember. Rejected below.
- **Strength becomes clickable pips** (decision 3) — the one control that changes species.
- Add row, mirror checkbox (GM only, as now), and delete confirmations are unchanged.

### 3. Strength: five pips, not a number in a `<select>`

Strength is an unlabeled 1–5 ordinal whose only job is ranking. Reading "▮▮▮▯▯" is instant;
reading "3" in a closed dropdown is not, and *changing* it via dropdown is two clicks plus a
scan of a menu of bare numbers. Pips render in both modes; in edit mode they take clicks
(click pip *n* → strength *n*, save on change, like a star-rating). Neutral tint, deliberately
**not** stance-coloured — one hue channel per row already carries stance, and double-encoding
would make a strong enemy look like two different facts disagreeing.

Tooltip carries the number for anyone who wants it ("Strength 4 of 5 — orders this list").

### 4. Notes: previewed in read mode, pinned open across repaints as today

The pin stays (filled = prose exists — the at-a-glance column read is worth keeping), but read
mode adds a **one-line clamped preview** under the name, dimmed. Click preview or pin to
unfold the full prose as *text* (read mode) or the autosaving textarea (edit mode, unchanged).

Why: "easier to reference" was the brief, and the note is the reference. A hidden note costs a
click per row per lookup; a one-line preview usually *is* the answer ("owes her for the
Kellet job—"). This does **not** touch the parent doc's notes-not-on-canvas rule — the sheet
always showed notes; only the fold depth changes.

Open/closed state stays in the existing module-level `openNotes` Map, shared by both modes, so
flipping the mode slider does not slam panels shut.

### 5. State: exactly one new piece, and it lives where dnd5e's does

| State | Holder | Survives repaint because |
| --- | --- | --- |
| Which notes are unfolded | `openNotes` Map (existing, unchanged) | module-level, keyed actorId → Set(tieId) |
| Tab mode | **nobody** — derived from `app.isEditMode` each paint | dnd5e owns it |
| Window mode | `TiesEditor` private instance field, default read | repaint = `this.render()`, instance persists |

No filter text, no per-row edit flags, no new Maps. If injection ever lands on a sheet without
`isEditMode` (it can't today — injection only succeeds on dnd5e 5.x markup), the tab renders
read-only and the header button's window is the edit path. Honest degradation, zero code for a
case that can't currently occur.

### 6. Sorting is untouched, and the narrow tab drops the right things

Strength-descending order is a parent-doc decision and stays. For the sheet tab's narrower
column: the panel gets `container-type: inline-size` and below ~480px the stance chip drops its
label (dot survives) and the portrait shrinks — the name, word and pips never degrade, because
they are the scan path. (Container queries; v14's Electron/Chromium is far past support.)

---

## What changes where

| File | Change |
| --- | --- |
| `editor.mjs` | `buildHTML(actor, { editMode })`; two row renderers sharing one grid; `bind()` wires field listeners only in edit mode (read mode keeps: open-sheet links, notes unfold, pip *display*); `TiesEditor` gains the mode field + header `slide-toggle` injection (in `_replaceHTML`/first render, guarded by `customElements.get("slide-toggle")` with a lock-button fallback); `injectTab`'s `paint()` passes `app.isEditMode === true` |
| `styles/ties.css` | New: `.pt-portrait`, `.pt-chip`, `.pt-pips`, `.pt-note-preview`, `.pt-mode-edit` (grid variant with input/select/trash columns), container query for the narrow tab. The card-layer and worn CSS untouched |
| `lang/en.json` | Add: `mode.edit` / `mode.view` (toggle tooltip both ways, mirroring `DND5E.SheetModeEdit/Play`), `row.strengthTip` (`{n}` format), `row.notePreviewHint`. `help`/`helpPlayer` unchanged but rendered only in edit mode |
| `pentaryn-ties.mjs` | One line: `paint()` reads the mode off `app` |
| `README.md` (module) | The *Using it* table's sheet row gains the read/edit sentence |

The repaint model is unchanged: every mutation repaints the whole block; mode is an input to
the paint, not DOM state.

## What this deliberately does *not* overturn

Checked against the parent doc's decisions, one by one: directed edges (untouched — this is
render only), stance-as-number (the chip and select still render off `-2..+2`), strength
drives ordering (still the sort key; pips are a *display* of the same number), full names
(still `actor.name` verbatim, now more prominent), notes-not-on-canvas (sheet-only change),
players-see-only-their-own (`mayView`/`candidates`/mirror gating all untouched; players get
the same read-default and use their own sheet's slider).

The one visible behavioural change worth saying out loud: **edit affordances are no longer
always-on.** Adding, deleting and the mirror checkbox now cost one flick of a slider the user
already knows. That is the price of a panel you can safely leave open mid-scene, and it is the
same price dnd5e charges for every other field on the sheet.

## What the build changed, and what the review found

Implemented and verified live in `space-journey` on v14.365 / dnd5e 5.3.3, as the GM **and**
signed in as a real player (role 2, `isGM: false`). Six things the design did not anticipate:

| Found | Resolution |
| --- | --- |
| Foundry sizes every `button` off `--button-size` (28px min-height), which flattened the pip ladder into five identical bars the moment they became clickable | Reset the box on `button.pt-pip`. The ladder is the control; without it the pips say nothing |
| Opening a note in read mode left the one-line preview directly above the identical prose | The preview is now always rendered and hidden by CSS on `.pt-open` — so unfolding is a class toggle, not a repaint, and the close-path re-render is gone too |
| A wordless tie printed the stance label twice: once as the word fallback, once in the chip | The chip drops its label on wordless rows (`pt-chip-bare`) |
| The five stance hexes are card colours, chosen against a near-black card. On a light sheet they land at 1.9–3.8:1 | Stance colours became CSS custom properties; `.theme-light` restates all five at 5.1–6.6:1. Neutral is no longer painted onto a word at all — the dot carries it |
| `data-tooltip` is not an accessible name (core's `TooltipManager` binds pointer events only), so the icon-only pin and trash had no name and read-mode pips were empty spans | `aria-label` on both buttons and on the pips group; the name link got `tabindex` and an Enter/Space handler; the pips got a real focus ring and a `::after` hit area |
| The comment claimed `<slide-toggle>` is a core custom element | It is **dnd5e's** (`SlideToggleElement`); zero occurrences in core `foundry.mjs`. Comment corrected — the `customElements.get` guard was already right, and the lock-button fallback was tested by stubbing the element away |

**One review finding was rejected after measurement.** The portraits were briefly gated behind
`testUserPermission(user, "LIMITED")`, on the reasoning that the redesign newly paints the face of
an actor a player has no permission on. Measured against this world, **every one** of a player's
24 ties — the other player's character included — points at an actor they lack LIMITED on, because
NPCs default to permission NONE. The gate replaced a player's address book with two dozen identical
silhouettes. It is reverted, and the reasoning sits in `artFor()`: the row has always shown the
cached *name*, so the face is the same category of disclosure on a GM-curated list, and the parent
plan's existing rule already covers it — a spoiler does not get written as a tie in the first place.
The module README now says this in the open.

**Known and not fixed:** the tab and the standalone window for the same actor do not repaint each
other (`write()` is `render: false` by design and neither listens to `updateActor`), so with both
open one shows stale rows until its next render. Pre-existing; the redesign makes having both open
more likely. Fixing it means a repaint on every actor update, which risks stealing focus mid-edit —
not worth it without a real complaint from play.

## Rejected

| Idea | Why not | What it would have cost |
| --- | --- | --- |
| A per-panel edit toggle of our own design | dnd5e already ships the gesture; the tab inherits it for free | A second unlock idiom on one sheet, plus a mode Map keyed by actor to survive repaints |
| Per-row pencil (edit one row at a time) | Bulk entry — seeding a new NPC's five ties — becomes five enter/exit cycles | A per-row mode Set with the same repaint-survival problem `openNotes` has, for no read-mode gain |
| Quick filter / search box | Current lists run ~5–12 ties; strength ordering already puts the answer at the top | Filter text is one more state to hold across repaints. **Revisit if an actor passes ~15 ties** |
| Grouping rows by stance | Overturns strength-as-order, a parent-doc decision, silently | The strongest tie no longer leads the list; hostile-but-minor jumps above devoted-and-central |
| Segmented five-dot stance picker in edit mode | Stance's labels are its meaning; dots alone are a colour code to memorise | Saved one click, lost the words |
| Keeping the strength `<select>` | Two clicks and a menu of bare numbers, for an ordinal with an obvious direct-manipulation form | — (pure win to replace; the risk is novelty, capped by the tooltip carrying the number) |
| Notes always fully unfolded in read mode | A 4000-char note would make one row a page; scanning dies | The preview line gets 90% of the value at 5% of the height |
| Portrait click opens the sheet | Collides with "name is the link"; two targets, one action | Kept the portrait inert instead — decoration, not control |

---

# Iteration 2 — the row is the editor, the canvas is the door (proposed)

**Status: proposed — awaiting build.** Everything above this line shipped as 0.8.0 and stays the
record of that build. This section is the next ask (2026-08-22, same day, after play): the slider
felt like a hidden switch ("unclear how I did it"), adding a tie meant hunting a name in a
dropdown when the person is *right there on the map*, and the row did not do the one thing a row
visibly invites — expand when clicked.

> The ask, condensed from Joe's words: click a row → it expands and shrinks; clicking the text is
> the edit path and the icon is just the hint; a canvas gesture on a token opens an add/edit
> popup so "you see them, you can add them — no trying to find a token in the menu"; the popup
> picks *whose list this goes on* from a portraits-and-names dropdown of characters you own on
> the scene (a player owning one gets no dropdown); players may set stance, strength and
> description themselves.

## What this overturns, and what it explicitly does not

| Decision | Owner | Fate |
| --- | --- | --- |
| Play/Edit slider as the tab's mode (§"Read mode is the default" … §5 above) | this doc, 0.8.0 | **Overturned.** No mode anywhere. The expanded row is the only editor |
| Directed edges — the word is per-side | parent doc §2 | **Kept.** Joe confirmed: "if the word stays directional so should the desc — it also makes sense the word is directional" |
| Notes are NOT mirrored | parent doc §1 | **Kept** — after a real scare. A same-day proposal to make notes a joint mirrored paragraph was on the table for hours and withdrawn (see Rejected). What replaces mirroring is **seed-if-empty** (decision 4) |
| Players edit only their own list; target dropdown LIMITED-filtered; rules govern presentation, not access | parent doc | **Kept.** The canvas dialog adds one *deliberate* widening: a player can now aim at a token they can *see* (`Token#isVisible`) rather than only actors they hold LIMITED on — same delegation the cards already use, same category of disclosure (the token is literally on their screen) |
| Strength pips, stance chip, portraits, name-is-the-link, strength ordering, note preview | this doc, 0.8.0 | **Kept** — the row's collapsed face is unchanged; only what a click does to it changes |

## The decisions

### 1. The expanded row is the only editor. There is no mode.

A collapsed row is exactly 0.8.0's read row: portrait · name · word · stance chip · strength
pips · a pencil hint icon (replacing the pin — it exists so the row *looks* clickable, nothing
more). **Click anywhere on the row to expand; click again to collapse.** The expanded panel
holds the editable detail — word input, stance select, clickable pips, notes textarea, remove —
when the viewer owns the actor, and read-only prose when they do not.

**The new accident model, stated honestly.** 0.8.0's slider bought "a panel with nothing on it
you can knock." Removing it is safe only if these three rules hold, and they are the contract:

- **A collapsed row carries zero write targets.** Pips in the collapsed row are display-only
  spans, always — never buttons. Otherwise every row keeps a one-click write and the accident
  model is *worse* than 0.8.0, not equal to it.
- **One row expanded at a time** (accordion). Expanding row B collapses row A. The exposed
  editable surface is bounded to one row's panel, which you opened on purpose, two seconds ago.
  State shrinks with it: the `openNotes` Map (actorId → Set) becomes `openRow` (actorId → one
  tieId) — a scalar, same repaint-survival, less to hold.
- **Interactive elements do not toggle the row.** The name link (still opens the sheet), every
  input, the pips, remove — all stop propagation. Clicking *into* a field must never collapse
  the panel out from under the cursor.

What remains knockable: inside an owner's open panel, a stray click on a pip writes strength
(and re-sorts), and the textarea autosaves after 700ms of stray typing — which first requires a
click that focused it. Remove keeps its confirm dialog. That residue is judged acceptable: every
write now needs two deliberate clicks in the right place, versus 0.8.0's one flick plus one
click. What is *lost* is bulk-entry ergonomics (five ties = five expand/collapse cycles) — the
0.8.0 Rejected table warned exactly this about per-row editing, and the canvas dialog is the
answer this time: seeding a new NPC's ties happens by pointing at tokens, not by cycling rows.

**The sheet's add path survives.** With the add row gone from the (modeless) tab, the tab gets
one **"Add tie…"** button that opens the same dialog as the canvas surface, with a target picker
(`candidates()`, LIMITED-filtered, exactly the 0.8.0 dropdown). This is load-bearing, not
optional: the canvas dialog can only aim at tokens **on the current scene** — a tie to someone
off-scene (half the address book, between sessions) has no other door.

### 2. The canvas surface — verified against v14 core: there is no token context menu

The ask says "right click gives an option to add tie." Checked in core
(`/Applications/Foundry Virtual Tabletop.app/…/foundry.mjs`, v14.365), not assumed:

- Right-click on a token does not open a menu and never has. `PlaceableObject._onClickRight`
  binds/toggles the **Token HUD** (`this.layer.hud.bind(this)`), full stop.
- The gate is `Token._canHUD`: `user.isGM || this.actor?.testUserPermission(user, "OWNER")`.
  **A player right-clicking an NPC token gets nothing at all** — no HUD, no event we could ride.
- There is no `getTokenContextOptions` hook, no canvas-side `ContextMenu`. Every
  `_getEntryContextOptions` / `_createContextMenu` in core belongs to sidebar directories and
  applications, not placeables. Wrapping `_onClickRight` via lib-wrapper to invent a menu would
  fight the HUD on owned tokens and add a surface core does not have; rejected below.

So the design lands on the two extension points that *are* real, both opening the same dialog:

| Surface | Mechanism (verified) | Who gets it | The clicked/hovered token is… |
| --- | --- | --- | --- |
| **Keybinding, hover-targeted** — `6`, beside 7/8/9 | `game.keybindings.register` + `canvas.tokens.hover`, exactly how `overlay.mjs` reads 7 and 8 today | everyone; the hover works on any *visible* token regardless of ownership | the **target** |
| **Token HUD button** (people-arrows) | `renderTokenHUD` hook — the pattern `worn.mjs` already ships | GM: every token. Player: **their own token only** (`_canHUD` above) | the **target** — except your own token, which can't be a target (self-tie), so it opens with you as **source** and a target dropdown of tokens visible to you |

The keybinding is the primary surface and the only one that delivers the actual sentence of the
ask for a player — "you see them, you can add them" — because the HUD physically cannot appear
on a token they don't own. The HUD button exists for discoverability (a visible affordance a
keybinding lacks) and matches Joe's other phrasing verbatim: "I can right click on myself when
I'm Kristine and get a menu for me."

### 3. The dialog is a **directed-edge editor**: source → target, one perspective at a time

Not a "joint tie" form. The dialog edits the **source→target** row — the perspective you own —
and touches the reverse row only through the seed rule (decision 4). "If I go and set a desc
from their perspective it overrides" works by *flipping the source*, not by a second column of
fields.

- **Source** — whose list this is written on. A dropdown of **world actors that have a token on
  the current scene and that the user owns**, rendered as portrait + name. Deduped by actor
  (three tokens of one actor = one entry). Exactly one candidate — the player case — renders as
  a static portrait + name, no dropdown. Ordering for the GM, who owns everything: the
  **controlled token's actor first and preselected**, then player characters, then alphabetical
  — so with 40 owned tokens the answer is almost always already selected.
- **Target** — the invoked token's actor, shown as portrait + name, fixed.
- **Per-edge fields** — word, stance (select), strength (pips), description (textarea,
  `NOTES_MAX`). **Disabled and empty until both ends are resolved** — a GM who has not picked a
  source yet sees dead fields, not a guess ("the desc field won't populate until I select a
  reference"). A player's source resolves instantly, so theirs populate on open.
- **Reverse-word input** — shown **only when the reverse row does not yet exist**, live-prefilled
  from the forward word. This is what keeps seeding from authoring nonsense: creating
  Cress→Hanne *granddaughter* must not silently write *granddaughter* onto Hanne's side. Symmetric
  words (*rivals*, *brother*) cost nothing — the prefill is already right.
- **"Their side" reference line — GM only.** When the reverse row exists, the GM sees its word
  and description, read-only and dimmed, so divergence is visible before an edit. **Not shown to
  players**: the target's stance toward them is GM-authored data the UI has never disclosed to
  them, and this dialog must not start.
- Save is one button; **no field-level autosave in the dialog** — it is a transaction, unlike
  the sheet rows, because it can write two documents and possibly a socket message.

### 4. Seed-if-empty — Joe's rule for the reverse side, and where it will surprise someone

The rule, verbatim in spirit: *"if the target doesn't have anything set it can simply be set to
what the player puts; if they do, then it doesn't override. If I go and set a desc from their
perspective, it overrides."* Made precise:

| Reverse row (target→source) | On Save of the forward edge |
| --- | --- |
| **Absent** | Created: word = the reverse-word input, stance & strength copied from forward (as `setTie` mirrors today), description **seeded** = forward description |
| **Present, description empty** (empty = `!notes.trim()`) | Description seeded = forward description. Word, stance, strength **untouched** |
| **Present, description written** | **Untouched entirely.** Never clobbered, no exceptions |
| Editing *from that side* (it is the source) | Full override — your perspective, your row |

Known surprises, accepted with eyes open rather than discovered later:

- **Seeded text diverges silently.** A writes "met at the opera, owes him 50gp", it seeds B's
  side; A later rewrites theirs; B's copy is now stale and *nothing marks it*. Seeding is a
  one-time convenience copy, not a link — the moment it lands, it is B's authored text. The
  GM-only reference line in the dialog is the whole mitigation: divergence is visible at the
  next edit, and merging is a human's job. No sync machinery — that is the two-copies problem
  the parent doc's no-mirroring rule existed to avoid, and it is avoided by the same means:
  ownership, not synchronisation.
- **Seeded prose reads from the wrong side.** "My manager — I owe her" seeded onto the
  manager's row is backwards prose until rewritten. Accepted; the seed's job is "not blank", not
  "correct".
- **A player's prose lands on a GM's NPC.** By design — that is the point of the feature — but
  it is a write the GM does not see happen. The GM's next look at that NPC's tab shows it;
  `clampNotes`/`clampStance`/`clampStrength` sanitise everything on the way in (and again in the
  socket handler, decision 5).

### 5. Player writes to the other actor: a GM socket relay, because the server will refuse

`write()` requires `actor.isOwner` and the server enforces the same; the manifest currently
declares `"socket": false`. So today a player's Save reaches their own row and the reverse
write is silently impossible — which breaks the promise of decision 4 exactly for the people the
canvas surface was built for.

**Decision: a minimal GM relay.** `"socket": true`; the player client emits
`module.pentaryn-ties` `{type:"seedReverse", source, target, word, stance, strength, notes}`
only when `game.users.activeGM` (verified in core) is non-null; the **GM client re-validates
everything** before writing — sender must own the claimed source actor
(`testUserPermission(sender, "OWNER")`), both actors must resolve, all fields re-clamped, and
the write itself goes through the same seed-if-empty rule (never a blind upsert — the sender's
claim about the reverse side's emptiness is not trusted, the GM client re-reads it). Cost:
`socket: true`, ~40 lines, and a new trust surface whose entire contract is "the GM client
re-derives every decision from its own reads."

**With no GM online** (and, until this ships, with `socket: false`): Save writes the player's
own row and says so plainly — *"Recorded on your side. {name}'s half will be completed when the
GM is on."* No queue, no retry machinery: the reconciliation mechanism **is the dialog** — the
next time anyone with permission opens it on that pair, the reverse row is visibly absent and
Save completes it under the same seed rule. One-sided is a legal, visible state, not an error.

## The state matrix

The builder implements from these tables, not from the prose. Throughout: **S** = source actor,
**T** = target actor, **fwd** = S→T row, **rev** = T→S row. "Player" owns exactly one relevant
actor unless stated; "GM" is `isGM`.

### A. Invocation → what opens

| # | Who | Gesture | Result |
| --- | --- | --- | --- |
| A1 | anyone | `6` while hovering a token | Dialog. T = hovered token's world actor. S per table B |
| A2 | anyone | `6` hovering nothing | No dialog. Warn: existing `notify.noTarget` pattern ("Hover a token") |
| A3 | GM | HUD button on any token | Dialog. T = that token's actor, S per table B |
| A4 | player | HUD button on **their own** token (the only token that shows them the button — `_canHUD`) | Dialog. **S = that actor**, T = unresolved: a dropdown of scene tokens **visible to them** (`Token#isVisible`, the cards' own test), portraits + names, minus S. Per-edge fields dead until T picked |
| A5 | anyone | "Add tie…" on the sheet tab / window | Dialog. S = that sheet's actor (fixed), T = `candidates()` picker (LIMITED-filtered, includes off-scene actors). The only door to someone with no token on the scene |
| A6 | player | `6` hovering a token, `playerAccess` setting off | No dialog. The setting gates this exactly as it gates the keys |

### B. Source resolution (dialogs where S is not fixed by the surface)

| # | Owned actors with a token on this scene | Dialog shows |
| --- | --- | --- |
| B1 | exactly one (the player norm) | Static portrait + name. No dropdown. Fields live immediately |
| B2 | several (GM; a player running two PCs) | Dropdown, portraits + names, deduped by actor. Controlled token's actor preselected; else PCs before NPCs, then alphabetical. Fields dead until chosen |
| B3 | none (player's token not placed; empty scene) | Fall back to owned **character-type** world actors regardless of scene. Still none → refuse with a notification, no dialog |

### C. Target edge cases (checked before fields go live)

| # | T is… | Behaviour |
| --- | --- | --- |
| C1 | the same actor as S | Save disabled, inline hint. Self-ties are refused (`setTie` already no-ops; the UI must say why, not no-op) |
| C2 | an **unlinked** token | Resolve to the **base world actor** (`game.actors.get(token.document.actorId)`) — never the synthetic token actor, whose flags land on the token and are invisible to `read()`. Dialog shows a one-line notice: the tie lands on *{actor}* and every copy of them |
| C3 | a token whose `actorId` resolves to nothing | Refuse with a notification. There is no document to write |
| C4 | an actor the viewer also owns (their other PC; GM always) | Nothing special — the reverse write is direct, no socket (row D-"writable") |
| C5 | off-scene actor | Only reachable via A5; identical dialog from there on |

### D. What opens in the fields, per existing-edge state

| # | fwd | rev | Fields on open | Reverse-word input | "Their side" line (GM only) |
| --- | --- | --- | --- | --- | --- |
| D1 | absent | absent | blank; stance 0, strength 3 | shown, live-prefilled from the word field | — |
| D2 | present | absent | fwd's values | shown, prefilled from fwd word | — |
| D3 | absent | present | blank (this perspective is unwritten) | hidden | rev's word + description, dimmed, read-only |
| D4 | present | present | fwd's values | hidden | as D3 |

### E. What Save writes — the seed rule × who can write T

"Writable" = `T.isOwner` for the saving user (every GM; a player only in C4).

| # | rev state | rev desc | T writable | Writes to S | Writes to T | User told |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | absent | — | yes | upsert fwd, full override | create rev: reverse-word, fwd stance/strength, desc seeded | — (it worked) |
| E2 | absent | — | no, socket relay live, GM online | upsert fwd | via relay; **GM client re-validates and re-applies the seed rule from its own reads** | — |
| E3 | absent | — | no, no GM online **or** `socket:false` (today) | upsert fwd | nothing | "Recorded on your side. {name}'s half will be completed when the GM is on." One-sided is a legal state; the next authorised open of this pair completes it (D2 → E1) |
| E4 | present | empty (`!trim()`) | yes / relay | upsert fwd | rev desc = fwd desc; word/stance/strength untouched | — |
| E5 | present | empty | no, no relay | upsert fwd | nothing | nothing — their own record is complete; no promise was made about T |
| E6 | present | written | any | upsert fwd | **nothing, ever** | — |
| E7 | — save with S==T or T unresolved | | | blocked before write | | inline hint (C1) / dead Save |

Rows E1–E6 also govern the *sheet* editor's writes wherever it creates a pair (the "Add tie…"
dialog is the same dialog, so for free). The expanded row's inline edits touch only that row —
one side, the viewer's own perspective — and never trigger seeding; seeding is a pair-creation
and dialog-save behaviour only, so a stray inline edit can never reach across.

## What changes where

| File | Change |
| --- | --- |
| `editor.mjs` | Row click = expand/collapse (accordion, `openRow` scalar replaces `openNotes` Set); collapsed rows lose all write targets; expanded panel = the 0.8.0 edit fields + prose fallback for non-owners; `TiesEditor` drops `#editMode` and the header slide-toggle entirely; the tab and window gain "Add tie…" |
| `dialog.mjs` (new) | The directed-edge dialog: source/target resolution (tables A–C), seed-if-empty save (table E), DialogV2 or a small ApplicationV2 |
| `ties-api.mjs` | `seedReverse(source, target, {…})` implementing table E rows E1/E4/E6 as one function used by both the local and the GM-relay path; `setTie` keeps its contract |
| `socket.mjs` (new) | The relay: emit when unwritable + `game.users.activeGM`; GM handler re-validates sender ownership, re-clamps, re-reads the reverse side, applies `seedReverse` |
| `module.json` | `"socket": true`; version bump |
| `pentaryn-ties.mjs` | Register keybind `6`; `renderTokenHUD` button (beside worn's, GM: all tokens / player: own token → A4 shape); drop the isEditMode read from `paint()` |
| `styles/ties.css` | Expanded-panel grid; pencil hint; dialog layout (portrait dropdown rows). Mode-slider CSS removed |
| `lang/en.json` | Keybind name/hint, HUD tooltip, dialog strings, the E3 notification, C1/C2 hints. `mode.edit`/`mode.view` removed |
| `README.md` (module) | The *Using it* table gains the `6` row and the HUD button; the notes section gains one paragraph on seed-if-empty; the slider sentence goes |

**Known and accepted:** the 0.8.0 stale-window issue (tab and window don't repaint each other)
gets a third writer — the canvas dialog. Same judgement as before: not worth a focus-stealing
repaint until play complains; the dialog is transactional and short-lived, which keeps the
window small.

## As built — 0.9.0, and where it departs from the plan above

Built and verified live in `space-journey` (v14.365 / dnd5e 5.3.3), as the GM and signed in as a
real player. Everything in decisions 1–4 shipped as written. Two departures, both deliberate:

| Planned | Built | Why |
| --- | --- | --- |
| A GM socket relay so a player's write reaches the other actor (`"socket": true`, ~40 lines) | **Not built.** The player's own side is written, the other side is not, and both the dialog *and* the notification say so in plain words before and after Save | Under the directed model the reverse side is no longer part of what the player is recording — "they just care about their word". A relay would add an inbound socket surface, a trust boundary to re-validate, and a silent dependency on a GM being online, to write a row that belongs to someone else's perspective anyway. Revisit if the GM finds reverse rows genuinely missing in play |
| Rows as an accordion, one open at a time | **Multi-open.** Any number of rows can be expanded | The accident model the accordion was guarding is already closed: a collapsed row carries no write target (its detail is `hidden`, its summary pips are `<span>`s), and detail clicks stop propagating. Closing a row the GM deliberately opened, because they opened a second one, is a worse surprise than a long panel |

Verified end to end: the pending state (fields disabled until both ends are known, exactly as
asked); seed on a fresh pair with the reverse *word* asked for separately; partial fill of only the
blank fields on an existing reverse row, announced before Save; full protection of a reverse side
that already has prose; the player path (no source dropdown, honest one-sided write); unlinked
tokens resolving to their world actor; and the target dropdown filtered by `Token#isVisible` for
players so a wall still means a wall. Every test edit was rolled back — the world ends at the tie
counts it started with.

**One correction to the record above:** the plan's decision 2 proposed the hover key *and* a Token
HUD button as separate discoverability aids. Both shipped, and they are one gesture: the HUD button
and key `6` call the same entry point, which decides direction by ownership — a token you own opens
as the **source** ("who do I know?"), anyone else opens as the **target** ("what are they to me?").

> ⚠ **Superseded in part by Iteration 3 below.** The direction rule in the paragraph above —
> owned token = source — is overturned for the GM (who owns everything, so under it a GM's click
> was *always* the source). The seed rule, the pending-fields behaviour, the visibility filters and
> the one-sided player write all stand. This section stays as the record of what 0.9.0 ships.

## The relay — built after all, and why that reversed twice

**Decision: a player's reverse-side write is delegated to a GM client over the module socket.**
`module.json` now declares `"socket": true`, and `relay.mjs` carries both halves.

This was rejected once (as-built 0.9.0: "not built, the player's own side is what they are
recording") and the rejection was wrong for a reason neither review caught: it was reasoning about
*whose perspective the row belongs to* when the user was asking about *whether the feature works*.
Joe's model is that the mirror is silent and automatic — "if they have no note it records it, if
they do have a note it doesn't — they are not notified either way". Without a relay the first half
of that sentence is false for every player, because `Actor#update` on an NPC is refused by the
server. The honest options were to build it or to keep telling players about a limitation they
cannot act on; the notification was itself the thing Joe asked to remove.

| Decision | Why |
| --- | --- |
| The player writes their **own** side directly, as always; only the reverse hop is relayed | The one write they are permitted needs no help, and keeping it local means their own record never depends on a GM being online |
| Only `game.users.activeGM` applies a message | Foundry's own designation of the primary GM. Without it, every connected GM would perform the same write |
| The GM re-reads the **forward** text off the source actor rather than trusting the payload | A client must not be able to ask a GM to write prose it did not actually save on itself |
| The sender must own the source, checked with `testUserPermission(user, "OWNER")` on the GM client | The payload's claim about who it is proves nothing; the server's permission record does |
| Stance and strength are re-clamped, and only used when the reverse row is created | Same rule the dialog follows — after creation they are the target's alone |
| The write touches exactly one row, and only its word and notes | There is no path from this socket to any other document or field |
| Nothing is announced, either way | The GM can see both sides in the dialog; the player was never shown the other side to begin with |

**The one thing taken on trust**, written down so nobody has to rediscover it: `prev` — what the
sender's side said *before* their save — is supplied by the sender and decides whether the reverse
counted as still following. A dishonest client could claim a `prev` matching the target's current
text and so force its own text onto that single row. The blast radius is one tie note between two
actors that player can already see, which is the same thing they could ask the GM to type. Accepted
rather than defended with a nonce.

**Verified with two live clients** (Chrome as the player, Safari as the GM): a fresh pair seeds the
NPC's side silently; a *diverged* NPC side is left untouched when the player edits theirs; no
notifications fire in either case.

## Iteration 5 — who is in the room comes first

**Decision: the outbound list is split by presence on the current scene**, the present group
first, a hairline separator, then everyone else. Headings only when both groups have rows —
with everything in one group a heading would label the obvious.

| | GM | Player |
| --- | --- | --- |
| top group | **On this scene** — every token, hidden included | **In sight** — `Token#isVisible` only |
| lower group | **Elsewhere** | **Not in sight** |

### ⚠ The sectioning is itself a disclosure surface

This is the whole reason the feature needed care. A flat list says nothing about who is present;
**grouping by presence announces it.** A GM-hidden token, or one behind a wall, would otherwise
appear under "on this scene" and hand a player the one fact the GM was hiding — findable by
opening your own character sheet, with no roll and no tell.

So `presentActorIds()` filters through **`Token#isVisible`** for anyone but the GM: the same test
the ties keys use, and the same one the renderer used to decide whether to draw that token at all.
A hidden character falls into the lower group, which is indistinguishable from someone who is
genuinely absent. **A character who is hiding must not be findable through a ties sheet.**

`isVisible`, not `visible` — on v14 `Token#visible` is the inherited PIXI flag and reads true for
every placeable on the scene, walled-off and hidden alike. The parent plan already records that
trap; it would have been re-sprung here.

**Verified in play.** With a PC's token hidden, that player's panel showed *no headings at all* and
one flat list — because nobody they had a tie to was visible, so the split never triggered. Byte
for byte what they would have seen had the token not been on the scene.

| Rejected | Why | Cost |
| --- | --- | --- |
| Split by "has a token on the scene", ignoring visibility | The obvious reading of "in scene", and it leaks every hidden token to every player | — |
| Show hidden tokens to players in the lower group with a marker | A marker for "here but hidden" is the disclosure with extra steps | — |
| One label for both roles | "On this scene" is false for a player who cannot see half of it; each role gets the label that is true for them | Two more strings |
| Re-render the panel on `canvasReady` so the split follows a scene change | Known staleness, shared with the rest of the panel; a scene change with the sheet open is rare and reopening fixes it | Revisit if it bites |

## ~~⚠ Open question for Joe~~ — the disguise ends at the dialog — **RESOLVED 2026-08-23**

> **Resolved by Joe's pointer design, judged and specced in
> [`foundry-disguise.md`](foundry-disguise.md).** A disguised token carries a token-level
> mark pointing at a **persona actor** (a sibling flag beside `worn`, which is untouched),
> and every player-facing capture resolves through `apparentActorOf(token)` — so a player's
> tie **aims at the persona's id**, and `read()` live-resolves the persona's name and art
> natively, forever. All three options below are dominated: option 2's facade inside
> `read()` is unnecessary (the row already stores the right id), option 3 stays rejected,
> and option 1's curation rule survives only as the rule for ad-hoc renamed tokens with no
> mark. Detection is a hidden, GM-thrown Investigation check riding the Study gesture —
> the full design, schema, and Rejected table live in the new doc. The section below stays
> as the record of the question as it stood.

**~~Not a bug, and not fixed: a decision that is his.~~** Ruled; see above.

A token wearing a disguise ("Hooded Figure" over Ozmandius) now keeps that name and art through
every part of the tie dialog for a player — the header chip, the picker, the status line, the word
label, the notes placeholder. Verified from a real player session on both routes: pressing the key
on the disguised token, and pressing it on their own token and then choosing the disguise from the
dropdown (which was the path a review caught still open).

**But the saved row names the real actor.** `read()` resolves `name` and `img` off the live actor,
so the moment the player saves, their own sheet reads *Ozmandius the Unmade*. Measured, not
assumed.

That was always true — it is the parent plan's "the row shows the cached name" rule — but the new
canvas gesture makes it *easy* and makes it the player's own doing rather than the GM's. The three
ways out, none of which should be picked without Joe:

| Option | Cost |
| --- | --- |
| Leave it, and rely on the existing curation rule | A player can now unmask a disguised NPC in two keystrokes, without meaning to |
| Give the panel the same facade the dialog has | Touches `read()`, which the cards, the panel, the dialog and `inbound()` all sit on; a row's name would change as the disguise changes, and revert once the token leaves the scene |
| Refuse a player a tie to an actor they lack LIMITED on | Kills "you can see them, so you can add them" — the thing the canvas gesture exists for |

Until it is decided, the honest statement is the one in the module README: **a face or a name that
would spoil the game must not be reachable as a tie** — and a disguised token on a scene with
players is now exactly such a reach.

## Rejected (iteration 2)

| Idea | Why not | What it would have cost |
| --- | --- | --- |
| **Joint mirrored notes — one shared paragraph on both sides** (proposed and withdrawn the same day) | Joe, on reflection: "if the word stays directional so should the desc… they just care about their word." And mechanically: `notes` is per-side in live data — some pairs already hold *different* text on each side, so first-save mirroring must either pick a winner (silently destroying one paragraph across 54 actors) or grow merge UI | The parent doc's no-mirroring decision, the authored divergent paragraphs, and a merge dialog nobody asked for. Seed-if-empty keeps the "both sheets get something" outcome with zero destructive writes |
| A right-click **context menu** on tokens | Verified absent from v14 core: right-click binds the Token HUD, gated to `isGM \|\| OWNER`; no context-menu hook exists for placeables. Building one means lib-wrapping `_onClickRight` against core's own gesture | A fake extension point that fights the HUD on owned tokens, breaks on core input changes, and still cannot fire for players on NPC tokens (the click never reaches the placeable path they'd need) |
| HUD button as the *only* surface | `_canHUD` means a player can never see it on an NPC token — the exact "you see them, you can add them" case | The feature's primary audience locked out of its primary gesture |
| Mirroring the word on every save (a truly "joint" record) | The word is the module's core insight and it is directional — manager/understudy, "the noise"/"the quiet". One shared word forces the generic symmetric vocabulary the parent doc §2 exists to avoid | First edit overwrites authored directional words across 54 actors |
| Blind-upsert the reverse row from the player's client via socket | The sender's view of the reverse side is untrusted and possibly stale | The GM relay re-reads and re-decides instead; the seed rule runs on the GM's data, not the sender's claim |
| A queue/retry for E3 (no GM online) | The dialog itself already reconciles: an absent reverse row is visible (D2) and one Save away from complete | Persistence machinery, replay ordering, and a second source of truth for "half-done" |
| Per-field autosave inside the dialog | A dialog save can span two documents and a socket hop — half-applied transactions on a flaky moment | Kept for the sheet rows, where every write is one field on one document |
| Keeping a slim mode toggle "just for safety" | The ask is precisely that the mode was invisible and confusing; the accident model in decision 1 (no write targets when collapsed, accordion, propagation-stopped controls) buys the safety without a state | A second gesture nobody found the first time |

---

# Iteration 3 — the clicked token is who the tie is TO (proposed)

**Status: proposed — awaiting build.** Same day as 0.9.0, after play. This supersedes the
**direction rule** in the 0.9.0 correction above (owned token = source) and rewrites state
tables A and B; tables C, D and E are amended, not replaced. Everything else in 0.9.0 stands.

> Joe's ask, condensed: the dialog is context-free because **who you have access to** drives it —
> a player's one owned character renders as a static link, not a one-item dropdown; a GM gets the
> full portrait dropdown. The clicked token always resolves the **to** half of the link; the
> dropdown is always the **from**. Seeding stays as built (empty → fill, written → never touch).
> New, GM only: an **override / set-both** button for when the other side's value must change.

## What this changes, and for whom

Under 0.9.0 the entry point branches on `actor.isOwner` — and for a GM **every** actor passes
that test (core's `testUserPermission` short-circuits `user.isGM` to OWNER, verified at
foundry.mjs 14828), so a GM's click was *always* the source and the target was always a dropdown
hunt. Inverting it makes the click do the aiming: click who the tie is about, pick whose list it
goes on. **For a player nothing observable changes** — their NPC click already opened
clicked-as-target, and their self-click already opened source-fixed (that is the flip below,
falling out of the same rule instead of an ownership branch).

## The decisions

### 1. One resolution rule — the flip is derived, not role-checked

The surface resolves the half it unambiguously names: a token names **who you are looking at**
(the to), a sheet names **whose list you are on** (the from). The rule, in order:

1. `actor = baseActorOf(token)` — the world actor, unchanged; null → warn (`notify.noTarget`).
2. **T = actor, locked.** Source candidates = `sourceCandidates()` **minus T** — the source
   dropdown never offers the target, so "GM clicks a token then picks that same actor as from"
   cannot happen (the C1 save-guard stays as belt).
3. Candidates remain → dialog opens with T fixed. One candidate → static portrait chip (the
   player norm). Several → dropdown.
4. **Candidates empty → the clicked token was your only pen. Flip: S = actor, fixed; T becomes
   the picker** (`targetCandidates`, `Token#isVisible`-filtered, unchanged). This *is* the 0.9.0
   player self-click ("right-click myself, get a menu for me"), now a theorem of the access list
   instead of a special case. A GM only ever hits it on a one-token scene, where it degrades to
   a source-fixed dialog with an empty target picker — harmless.

Why this beats "clicked token fills whichever half is not already forced" stated as an identity
test ("when it is my only source"): same outcomes, but deriving the flip from *the set going
empty after removing the target* needs no notion of "my token", handles the two-PC player
clicking their own PC-A without a new case (PC-A leaves the set, PC-B is the forced source —
a legal PC-B → PC-A tie), and keeps the dialog literally role-free. The dialog also *shows* the
resolution — both portraits, the arrow — so there is nothing to guess.

**Every directed row stays reachable in one gesture:** to edit what Hanne's side says about
Cress, click Cress, pick Hanne. "Flipping the source" (decision 3, iteration 2) now means
clicking the other token.

### 2. The GM dropdown: no silent pick, scene scope judged sufficient

- **No silent default.** As built, the constructor falls back to `owned[0]` (tie-dialog.mjs:100)
  — alphabetical-first — even for a GM with forty candidates. Under inversion that is a
  wrong-direction landmine: prose lands on whatever actor sorts first. With several candidates
  the dropdown opens **unselected** (placeholder), fields dead until chosen — the rule
  iteration 2's decision 3 already stated ("dead fields, not a guess"). One exception: exactly
  one **controlled** token whose actor is in the set → preselect it, because controlling a token
  is already an act of pointing.
- **Ordering:** controlled first (when present), then player characters, then alphabetical —
  the iteration-2 B2 rule, which the build dropped to plain alphabetical; restored.
- **Scene scoping stays the whole answer for now.** With preselection the common case is zero
  interaction, and current scenes run well under forty distinct actors. **Revisit with a filter
  input if a real scene passes ~20 distinct owned actors** — same threshold pattern as the
  rejected quick-filter (0.8.0).

### 3. ~~Override — "set both to the new value"~~ — **superseded the same day**

> **Superseded by "The reverse side, revised" below**, before any of it was built. Link-by-identity
> makes divergence visible and editable in place, so there is no hidden written-side to force and
> nothing left for a confirm dialog to protect. Kept as the record of a design that lived for an
> hour; nothing in it is operative.

The seed rule's third row ("written → untouched, no exceptions") gets one deliberate exception,
behind three locks:

- **Who sees it:** anyone who **owns the target actor** and is looking at a reverse row with
  protected content (non-empty word or notes). Not an `isGM` check — ownership is the predicate
  the seed path already uses, and it keeps the dialog role-free. In practice that is the GM,
  plus the rare player editing between their own two PCs, who owns both sides anyway. It never
  travels over a relay: no ownership, no override, full stop.
- **What it covers: the reverse word and the reverse notes. Never stance or strength.** They are
  per-side judgments, copied only at creation, and deliberately divergent pairs exist
  (devoted one way, wary back); a confirm dialog can quote prose the GM will recognise, but not
  a number — an override that touched them would erase authored divergence invisibly.
- **The word is never blind-copied — at override or anywhere else.** Arming override re-reveals
  the **reverse-word input**, prefilled with the *current reverse word* (falling back to the
  forward word only when blank — the symmetric-tie convenience, as at creation). Save writes
  `rev.word = that input` and `rev.notes = forward notes`. Forcing *grandmother* to become
  *granddaughter* now requires typing it, which is the point.
- **The confirm names what dies.** Save with override armed fires a `DialogV2.confirm` (the
  module's existing destructive-act pattern — removeTie uses it) stating the direction being
  rewritten (**{target} → {source}**, i.e. whose perspective) and quoting verbatim the current
  reverse word and the first line (~100 chars) of the current reverse notes. Cancel returns to
  the dialog with **nothing written** — the save is one transaction; a half-save that wrote the
  forward row but skipped the override would be a silent surprise.
- The mirror-status line grows a fourth state: override armed → *"{b}'s side will be replaced
  with this description and the word above."*

### 4. Correction found while specifying 3: the E4 word-fill already blind-copies

As shipped, an existing reverse row with an **empty word** gets the *forward* word copied in
(`rev.word = word`, tie-dialog.mjs:370), but the reverse-word input only renders when **no**
reverse row exists (`willSeed = … && !rev`, line 196). So the D2-with-empty-rev-word path writes
*granddaughter* onto grandmother's row today — the exact failure the input exists to prevent.
~~Fix folded into this iteration: **the reverse-word input renders whenever Save would write the
reverse word** — reverse row absent, or its word empty, or override armed.~~

> **Mechanism superseded** by "The reverse side, revised" below — the finding stands (the blind
> copy is real and shipped), but the fix is now the paired mirror field, not a conditionally
> revealed input.

### 5. Surfaces and naming under the inversion

- **HUD button / key 6 tooltips** currently read "record what this character is to someone" —
  exactly backwards for the GM now, still right for a player's self-click. Both restated
  direction-neutral: *"Add or edit a tie with this token"* / hint *"Opens the tie dialog aimed
  at the hovered token; whose list it lands on is picked inside."*
- **The sheet's "Add tie…"** is untouched and *not* an inconsistency: the sheet names the from
  half (S = that sheet's actor, fixed; T = `candidates()` picker, the only door to off-scene
  actors). Same principle, other half.
- **Key 6 over nothing** still warns rather than opening a both-halves-blank dialog — the sheet
  Add is the better gesture for that, and the warn teaches it.
- **Unlinked tokens:** unchanged. `baseActorOf` resolves to the world actor *before* any
  direction logic runs, so three unlinked guards of one actor still behave as one actor on
  either half, and the flip test compares deduped actors, not tokens.

## State matrix (iteration 3) — replaces tables A and B; amends D and E

### A′. Invocation → what opens

| # | Who | Gesture | Result |
| --- | --- | --- | --- |
| A′1 | anyone | `6` hovering a token, or the HUD button | Resolution rule (decision 1): **T = that token's actor, locked**; S per B′ — unless the flip (B′4) |
| A′2 | anyone | `6` hovering nothing | No dialog; warn (unchanged) |
| A′3 | anyone | "Add tie…" on the sheet tab / window | **S = that sheet's actor, fixed**; T = `candidates()` picker (unchanged A5) |
| A′4 | player | any surface, `playerAccess` off | Nothing (unchanged A6) |

### B′. Source resolution when a token fixed T

| # | `sourceCandidates()` minus T | Dialog shows |
| --- | --- | --- |
| B′1 | exactly one (the player norm) | Static portrait chip. Fields live immediately |
| B′2 | several (GM; a two-PC player) | Dropdown, **unselected** placeholder; controlled token's actor preselected iff exactly one is controlled and it is in the set. Order: controlled, PCs, alphabetical. Fields dead until chosen |
| B′3 | none | **The flip:** S = the clicked actor, fixed chip; T = `targetCandidates` picker; fields dead until T picked. (The 0.9.0 player self-click, derived) |

### D/E amendments

> **Superseded** by the E″ table in "The reverse side, revised" below — this table specced the
> override and the conditional reverse-word input, both replaced the same day. Kept as the record.

| Table | Row | Change |
| --- | --- | --- |
| D | all | ~~Reverse-word input shown when rev **absent** *or* **rev.word empty** *or* **override armed** (decision 4) — prefilled from rev.word, else the forward word~~ |
| D | new D5 | ~~rev present with protected content **and** user owns T → override control rendered, disarmed~~ |
| E | E4 | ~~Word-fill writes the **reverse-word input's** value, never a copy of the forward word~~ |
| E | new E8 | ~~Override armed + confirm accepted → rev.word = reverse input, rev.notes = fwd notes; stance/strength untouched. Confirm cancelled → **no writes at all**, back to the dialog~~ |

---

# Iteration 3, revised — the reverse side is **link-by-identity**

**Status: proposed — this is the operative spec for the reverse side**, replacing decisions 3
and 4 above (marked superseded in place) before either was built. The direction flip
(decision 1), the dropdown rules (decision 2) and the surface renaming (decision 5) stand
unchanged and are being implemented alongside this.

> Joe's revision, condensed: each mirrorable field gets a **second box** underneath for the
> reverse side. Left blank, it shows the forward value greyed — and blank means *the reverse
> takes the forward value*, because many relationships are simply the same both ways ("friend",
> "foe"). Click in and type, and the two sides diverge. And there is no stored link flag anywhere:
> **on re-open the module just checks whether the two sides are identical** — identical → the
> second box renders blank-with-grey again ("it knows it's the same"); different → it shows the
> diverged text. The same check governs a player's edit updating an NPC's side without the player
> ever seeing a second box.

## Why this wins over the override + reverse-word input it replaces

Identity **is** the link state. No flag to store, migrate, or let drift out of sync with the
text it describes — two sides that say the same thing *are* linked, definitionally. Divergence
is visible (the second box shows the actual diverged text), deliberate (you typed it), and
reversible (clear the box to re-link). That dissolves both superseded designs at once:

- **The override button dies.** It existed to force a hidden written value with a confirm dialog
  quoting what would be lost. Now the diverged text is *on screen in an editable box* — the GM
  reads the exact prose, edits or deletes it in place, and deleting is re-linking. An in-place
  edit of visible text needs no confirm; the destructive act is the keystrokes themselves. No
  case still needs a clobber: every "set both to the new value" is *clear the second box*.
- **The reverse-word input dies as a separate control** and comes back generalised: it is the
  word's second box. The ergonomic change is **placeholder, not prefill** — a prefilled box
  contains text that gets written verbatim even if never touched, so editing the forward word
  after opening would desynchronise them; a placeholder box is empty, *tracks the forward input
  live as it is typed*, and an untouched box means "copy whatever the forward says at Save".
  What you see greyed is exactly what will be written.

## The rule — one predicate, four consequences

**Mirrorable fields: the word and the description. Stance and strength never participate** —
per-side judgments, copied once at row creation, never mirrored after (unchanged from
iteration 2).

**Identity test:** `linked(rev, fwd)` ⇔ rev row absent, **or** `norm(rev.field)` is empty,
**or** `norm(rev.field) === norm(fwd.field)`, where `norm` is **`String.prototype.trim` only —
case-sensitive, no whitespace collapsing**. Blank folds into identical on purpose: a blank
reverse has never been diverged, and "blank ⇒ frozen" beside "identical ⇒ linked" would give
a half-filled row two contradictory halves. Trim-only because a textarea's trailing newline is
editor noise, not authorship — but any *internal* difference, a one-character typo fix included,
is authored divergence, which is precisely what the model means by "different". (The drift the
brittleness worry points at is mostly closed elsewhere: a linked pair follows the forward *at
save time*, so fixing a typo in the forward carries the fix across; only text edited on the
reverse side itself unlinks — correctly, because that edit is the target's perspective being
authored.)

**Render** (the second boxes appear iff the user **owns the target** — ownership, not `isGM`,
same predicate as everything else in this dialog):

- `linked` → second box **empty**, placeholder = the forward input's current text, greyed,
  updated live on every forward keystroke. Forward blank → the placeholder falls back to the
  field's normal hint text.
- diverged → second box contains `rev.field` verbatim.

**Save** (dialog Save only — one transaction; see the boundary below):

- **Boxes visible:** the box is authoritative. Non-blank → `rev.field = box text` (typing text
  identical to the forward is legal and simply renders linked next open). **Blank → `rev.field
  = forward value`** — the follow, and the re-link.
- **Boxes not visible** (user cannot write the target): **no reverse write happens at all
  today.** `write()` requires `actor.isOwner`, the server enforces the same, and the 0.9.0
  as-built dropped the relay — so for the overwhelmingly common player-→-NPC case the invisible
  follow rule is a **dormant spec, not live behaviour**: it is exactly what a future GM-relay
  handler would run (`rev.field = forward` iff `linked(rev, prevFwd)`, both re-read fresh on
  the GM client *before* applying the forward upsert — the sender's claim is never trusted).
  Until then the dialog keeps saying "recorded on your side", as shipped. The only players who
  get live following are those who own the target — their own second PC — and they see the
  boxes, so the visible regime covers them.
- **Reverse row absent:** created whenever any reverse write lands, with stance/strength copied
  from the forward at that moment (creation-copy, unchanged). Seed-if-empty is now a corollary,
  not a separate rule: an absent row is the degenerate all-fields-blank case and every field
  follows.

**Consequences, accepted with eyes open:**

1. **You cannot keep the reverse blank while the forward is filled.** Blank always inherits.
   A deliberately wordless reverse was never a goal; if it ever becomes one, that is a stored
   sentinel and a design change, not a tweak.
2. **Accidental convergence re-links.** Edit the reverse until it happens to equal the forward
   and the next open renders it grey. That is the model's semantics, not a bug — two sides that
   say the same thing are the same thing.
3. **The granddaughter default survives, judged acceptable.** A blank word box under
   Cress→Hanne "granddaughter" writes "granddaughter" onto Hanne — but the grey mirror shows
   that exact word, labelled as *what Hanne is to Cress*, before Save. The superseded design had
   the identical default (prefill from the forward word); this one makes the consequence more
   visible, not less. **Word and description behave identically** — one rule, one rendering;
   a special blank-means-blank default for the word alone would resurrect consequence 1 as a
   per-field inconsistency and split the mental model, to protect against an error the grey
   one-word preview makes maximally legible.
4. **The follow runs on dialog Save only.** The sheet's expanded-row inline editor stays
   single-side: its 700ms autosave firing cross-document would spray half-typed prose onto the
   other actor mid-sentence. An inline edit that breaks identity simply unlinks — visible the
   next time the dialog opens on that pair. This trims one corner off Joe's "the player edits
   their desc and it updates" (inline edits don't propagate; dialog saves do), and it is the
   corner where propagation is actively dangerous.

The mirror-status line shrinks accordingly: with the boxes themselves showing linked/diverged,
only the non-owner case still needs prose ("recorded on your side only — {b} is not yours to
write on").

## E″ — what Save writes, per mirrorable field (replaces E1–E8 for the dialog)

**fwd** is always upserted in full from the forward inputs (unchanged). Then, per field:

| # | Second box | rev row | rev field state | Writes to rev.field |
| --- | --- | --- | --- | --- |
| E″1 | visible, non-blank | any (created if absent) | any | the box text, verbatim |
| E″2 | visible, blank | any (created if absent) | any | the forward value (follow / re-link) |
| E″3 | not visible, target writable *(unreachable today: visibility ≡ ownership ≡ writability)* | — | — | — |
| E″4 | not visible, target not writable | any | any | **nothing** — one-sided, said plainly (E3's notification stands). Dormant relay spec: follow iff `linked(rev, prevFwd)`, GM-client re-read |
| E″5 | — | created by E″1/E″2 | — | stance & strength copied from forward at creation, never again |

Save stays a single transaction: both rows written together or neither; no confirm dialogs
anywhere on this path any more.

## Rejected (iteration 3, revised)

| Idea | Why not | What it would have cost |
| --- | --- | --- |
| Keeping the override button alongside link-by-identity | Two mechanisms for one act: clearing the box already *is* "set both to the new value", with the doomed text visible instead of quoted in a confirm | A GM-facing control whose entire behaviour is a worse spelling of "select all, delete" |
| A stored per-field `linked` flag instead of the identity test | A flag can contradict the text it describes — stale after any out-of-band edit (sheet rows, `setTie`, the importer), and it needs migration | The exact class of state the identity test makes unrepresentable |
| Fuzzier normalisation (collapse whitespace, case-fold) for the identity test | Under this model *different text is the definition of diverged*; case and internal spacing are authorship. Trim alone removes the only pure editor noise a textarea injects | Silently re-linking sides someone deliberately made differ by emphasis or casing |
| Exact `===` with no normalisation | A trailing newline from a textarea unlinks a pair nobody diverged | Invisible unlinks from editor noise |
| Prefill instead of placeholder for the second box | Prefilled text is written verbatim even when untouched, and goes stale the moment the forward field is edited after open | The written value and the visible forward value silently disagreeing at Save |
| Running the follow rule on the sheet row's autosave | 700ms after a pause, half-typed prose lands on another actor's document | Cross-document writes from a control whose contract is one field, one document |
| A different blank-box default for the word (blank ⇒ leave reverse wordless) | Splits the model per-field and resurrects "blank ⇒ frozen" for one field only; the grey one-word preview already makes the copy maximally visible before Save | Two rules where one suffices, to guard the most legible field in the dialog |

## What changes where

| File | Change |
| --- | --- |
| `pentaryn-ties.mjs` | `openTieDialogFor` drops the `actor.isOwner` branch for the resolution rule (decision 1) |
| `tie-dialog.mjs` | Constructor: no `owned[0]` silent default with several candidates; source list excludes T; controlled-first ordering; ~~override control + confirm~~ → the paired mirror boxes and the E″ save path ("Iteration 3, revised" below); mirror-status line shrinks to the non-owner case |
| `lang/en.json` | Neutral `hud.tie` + keybind hint; second-box labels ("…and back — what {a} is to {b}"); the shrunk mirror-status string |
| `styles/ties.css` | Paired-field layout; greyed live placeholder styling |
| `README.md` (module) | The `6` row's wording flips to "aim at who it's to"; one paragraph on the second boxes and blank-means-same |

## Rejected (iteration 3)

| Idea | Why not | What it would have cost |
| --- | --- | --- |
| Clicked token always the target, no flip | A player clicking their own token — the original ask's literal gesture — would open a dialog whose only legal source is the actor already locked as target: a dead end with a warn | The feature's founding gesture refused for its primary audience |
| Stating the flip as an identity test ("when the clicked token is my only source") | Same outcomes, but it reintroduces "my token" as a concept the access-driven design just removed, and needs a fresh case for a two-PC player clicking their own PC | A second rule to keep aligned with the first |
| An explicit direction-swap toggle in the dialog | Mode UI — the thing this design exists to not have. Every directed row is already one click-plus-pick away via the other token | A control whose wrong state silently writes prose onto the wrong sheet |
| Override copies stance/strength too | Per-side judgments with legal divergence; a confirm can quote prose but a clobbered `-1` is invisible | Authored divergence erased with no recognisable trace in the confirm |
| Override copies the forward word | *Grandmother* becomes *granddaughter* — the exact failure the reverse-word input exists to stop, now on the destructive path | The one field where "set both to the new value" is guaranteed wrong for directional pairs |
| Override as a full editable reverse pane (word + notes textarea for their side) | A two-column joint editor — rejected in iteration 2's decision 3 and still wrong: the dialog edits one perspective; override is a copy-with-consent, not a second authoring surface | Twice the fields, and "whose row am I typing in" ambiguity in a destructive context |
| Gating override on `isGM` | Ownership is the predicate every other write path uses, and it keeps the dialog role-free — Joe's own framing ("who the player has access to … is what drives how it behaves"). `isGM` and owns-the-target differ only for a player's own two PCs, where override is harmless | A role check in a dialog whose design premise is having none |
| Grouping/search in the GM source dropdown now | Preselection makes the common case zero-interaction; current scenes are well under the pain threshold | State + UI for a scene size that does not exist yet. **Revisit past ~20 distinct owned actors on a scene** |

---

# Iteration 4 — the sheet shows who holds them (GM only)

**Status: proposed — the data layer is built** (`inbound(actor)` in `ties-api.mjs`, GM-gated at
the source, published as `game.pentaryn.ties.inbound`); the renderer is specced here and not
started. This section *adds* to the panel; nothing above is overturned. The one amendment to an
existing surface: a GM's outbound rows gain a reply fragment (decision 3).

> Joe's ask, condensed: when the GM opens **any** character, show every link to that character —
> including from people with no token on the scene — so "when I'm role-playing someone, I can
> quickly find relationships to that person", and so off-board associates are placeable from the
> sheet. A separator makes clear which rows are this character's own record and which are
> referenced from another actor's pointer. And a worry: a long campaign's graph could get big —
> maybe an open-source SQL database as a backbone?
>
> The privacy half is **settled by Joe, not open**: *"inbound stays GM-only. If I want the player
> to see a connection I must write it to their character sheet."*

## The performance premise, measured so it never gets re-litigated

Measured in the live world — 136 actors, 54 with ties, 196 edges, largest out-degree 24 — on the
brute-force scan (`game.actors.contents`, one pass, no index):

| Operation | Cost |
| --- | --- |
| One actor's inbound rows, raw scan | 0.027 ms |
| One actor's inbound rows, **resolved + sorted** (what the panel pays per paint) | **0.154 ms** |
| Reverse index for the entire world | 0.115 ms |
| Projected full index at 1,000 / 5,000 / 20,000 actors | 0.85 / 4.2 / 16.9 ms |

Foundry ships **every** Actor document to every client at login and holds them in `game.actors`
— the whole graph is in memory before anyone asks (the parent doc tested this from a real player
session; it is also why the privacy rules govern presentation, not access). So a scan per sheet
render is free relative to rendering the sheet it sits on. **No new storage shape, no index, no
database** — at 20,000 actors, a hundred times this campaign, the *worst* case is one frame.

**SQL is not available to a Foundry module, and would be wrong if it were.** A module manifest
declares client `esmodules`/`scripts`, styles, languages, compendium `packs` and a `socket`
channel — exactly what this module's own manifest uses — and there is **no server-side code
path**: world data lives in the server's LevelDB and reaches clients only as synced documents.
An external database would need a companion server run outside Foundry, and would break world
portability (the world folder stops being self-contained), backups, the document sync and
permission model every client depends on, and any prospect of public distribution. If a real
index is ever needed — past ~5,000 actors, per the numbers above — the *only* shape this could
justify is an **in-memory `Map` rebuilt on the `createActor`/`updateActor`/`deleteActor` hooks**
(core dispatches these for every document CRUD, verified in `foundry.mjs`), and at 0.115 ms per
full rebuild, "maintain" would itself be over-engineering: rebuild the whole thing every time.

## The rule — inbound is GM-only, and here is the sentence that keeps it that way

**A player's panel shows only rows their own actor authored. Any surface that displays a row
read from *another* actor's array renders it only when `game.user.isGM === true`. The way to
make a player aware of a connection is to write it onto their own character's sheet.**

- The predicate is `isGM`, **never ownership** — ownership is precisely the wrong test here,
  because a player owns their PC, and inbound rows *to* the PC are the disclosure channel:
  GM-authored stances toward them, and the existence and names of NPCs they have never met.
  This is the fourth player rule, alongside the parent doc's three; like them it governs
  **presentation, not access** (flags reach every client regardless — devtools can always read
  them, and no client-side module can change that).
- The gate lives **in `inbound()` itself**, not in the renderer — a non-GM caller gets `[]` —
  so no future UI path can leak it by forgetting to ask.
- **Surface audit, verified against the current files:** every other render path reads only the
  subject actor's own array. The canvas cards: `overlay.mjs` calls `read(subject)` in all three
  places and `permitted()` restricts players to their own actor; `popups.mjs` builds only from
  ties the overlay passed, and its pinned-card restore is gated `isGM || actor.isOwner`. The
  tie dialog renders reverse-side content only inside the mirror boxes, which require
  `target.isOwner` (for a player: only their own second PC), and its not-writable status line
  names nothing about the reverse row. The describe card is `isGM`-checked at every entry and
  reads the biography, not ties. **No surface leaks inbound today; this rule is what keeps the
  new one from being the first.**

## The decisions

### 1. Mutual pairs merge into the outbound row; the inbound section carries only asymmetries

Measured against the live graph, because the dialog seeds both sides, **most pairs are mutual**:

| Actor | outbound | inbound | mutual | inbound-only |
| --- | --- | --- | --- | --- |
| Wat Harrow, Barkeep | 7 | 9 | 7 | **2** |
| Ballad Quinn (a PC) | 24 | 24 | 24 | **0** |

A naive "outbound, separator, inbound" panel would print all 24 of Ballad's rows a second time
— the separator would separate a list from a near-copy of itself, and bury the two rows on Wat
that are the actual news. So:

- **A pair that exists in both directions renders once**, as the outbound row it already is,
  and (on a GM client only) gains a **reply fragment** showing what the other side says back
  (decision 3).
- **The inbound section lists only rows with no outbound counterpart** (`mutual: false`) —
  people who have this character on their list while this character's list does not name them
  back. For Ballad that section is empty and correctly silent; for Wat it shows exactly the two
  people he has not written down.

Three states, all legible at a glance: two-way (row + reply), outbound-only (row, no reply —
*they* haven't written back), inbound-only (below the line — *this actor* hasn't). There is no
"show all inbound flat" toggle: the reply fragments make the outbound list *be* the mutual
half, and `game.pentaryn.ties.inbound(actor)` remains for anyone who wants the raw list.

### 2. The inbound row — same vocabulary, three distinguishing marks, read-only here

Direction first, because it is the whole point: per the parent doc §2, an actor's array says
what **that actor** is to each person listed. So an inbound row on X's sheet, read from O's
array, carries **what O is to X** — which is exactly the role-play answer ("I'm playing Wat;
this person walks up; they are his *supplier*, wary, strength 4"). Their stance is *their*
feeling about X; their strength is how much X matters to *them*.

Markup: same `<li>` and the same summary grid as every other row — portrait · name+preview ·
word · stance chip · pips · hint — because a second design language is a second thing to learn.
The distinguishing marks, all three quiet:

```html
<li class="pt-row pt-inbound" data-source-id="{authorId}">
  <div class="pt-summary" role="button" tabindex="0" …>
    <img class="pt-portrait" loading="lazy" src="{author art}" alt="" />
    <span class="pt-who">{author name}{their note preview, dimmed}</span>
    <span class="pt-word …">{their word — what they are to this actor}</span>
    {their stance chip} {their pips, static}
    <span class="pt-hint" aria-hidden="true"><i class="fa-solid fa-reply"></i></span>
  </div>
  …
</li>
```

1. **`.pt-inbound` draws a dashed inline-start rule** (`border-inline-start: 2px dashed
   var(--pt-inbound-rule)`, a neutral tint restated for `.theme-light`) — so the eye separates
   these rows even mid-scroll, when the separator is off-screen.
2. **The hint icon is `fa-reply`**, not the pen or the eye — the same glyph as the reply
   fragment on mutual rows, so one symbol means "their side" everywhere on the panel.
3. **Portrait and name are the author's** — whose sheet the row lives on. Inline the GM sees:
   their portrait, name, word, stance chip, strength pips, and the one-line dimmed preview of
   their notes (this section is GM-only, and the note usually *is* the answer). On expand: the
   read-only detail — their full notes as prose (`row.notesEmpty` italic when blank) — and two
   actions: **"Open {name}'s sheet"** (existing `row.openSheetOf`) and **"Edit {name}'s side"**
   (decision 4).

Never editable in place — no inputs, no pips-as-buttons, no remove. Editing here would write
**another actor's document** from a panel whose contract is this actor's flags, and would need
a second copy of the dialog's link-by-identity rules. The row summary's tooltip/aria uses a new
`inbound.expandOf` ("Read {name}'s record — held on their sheet").

### 3. The reply fragment on a mutual outbound row — collapsed and expanded

**GM client only, both halves.** A player's own rows must not grow it: the reply *is* inbound
data, and rule 4 covers fragments as much as sections.

- **Collapsed:** one dimmed line appended inside `.pt-who`, under the note preview:

  ```html
  <span class="pt-reply"><i class="fa-solid fa-reply"></i>
    <span class="pt-reply-word">{their word}</span>
    <span class="pt-dot pt-{their-stance-key}"></span></span>
  ```

  Their word, their stance dot — nothing more; the row's own hue channel still belongs to this
  actor's stance, so the reply gets a dot, not a coloured word. Wordless reverse → the italic
  dimmed stance label, the same fallback the word cell uses. Tooltip `reply.tip`: *"{name}'s own
  record — what they are to {actor}. Players never see this."* Its absence is information too:
  an outbound row with no reply fragment is a one-sided tie *they* haven't written back.
- **Expanded (GM):** the detail gains a read-only `.pt-their-side` block after the notes field
  — dimmed, top-bordered, mini-heading *"{name}'s side — GM only"* (`theirSide.heading`), then
  their word + labelled stance chip + static pips on one line, then their notes as prose — and
  the detail actions gain **"Edit {name}'s side"**. The sheet becomes the one-stop reference:
  both perspectives of the pair on one screen, which is the ask verbatim.

### 4. Clicking through: the dialog is the editor for their side, and it is the off-scene door

"Edit {name}'s side" (on inbound rows and expanded mutual rows alike) opens
`TieDialog.open({ source: theirActor, target: thisActor })` — both ends locked, aimed the right
way. Why the dialog and not in-place editing: it is the transactional editor that already
carries the seed and link-by-identity rules, it shows both sides before anything is written,
and — decisive — **with both ends passed explicitly it never consults the scene-scoped
pickers**, so the inbound section is itself the editing door for off-scene pairs that key `6`
cannot reach. The pickers keep their own scopes, deliberately: canvas invocations stay
scene-scoped ("you can see them, so you can add them" is the right rule for a canvas gesture),
and the sheet's Add button uses the `"all"` scope — LIMITED-filtered, disguise-safe token
labels — that `targetCandidates` now carries. This section changes neither.

On "not loaded" actors: in Foundry there is no such state — every world actor is in client
memory (see the performance section). What Joe means is *no token on the current scene*, and
the scan runs over `game.actors.contents`, so the section works everywhere: any scene, no scene
active, between sessions. Placing an off-board associate is then: open the NPC, read who holds
them, drag the actor from the sidebar as usual.

### 5. The separator — exact text, and the GM-only signal

Rendered only when the inbound-only list is non-empty; **zero inbound-only rows → no separator,
no heading, nothing** (Ballad's sheet renders exactly as today — an empty appendix earns no
furniture, the same "absence stays meaningful" rule as the cards). Placement: outbound list,
then the add bar (it belongs to the record it adds to), then:

```html
<div class="pt-inbound-sep" role="heading" aria-level="3">
  <span class="pt-inbound-title">{inbound.heading}</span>
  <span class="pt-gm-badge"><i class="fa-solid fa-eye-slash"></i> {inbound.badge}</span>
</div>
<p class="pt-inbound-hint">{inbound.hint}</p>
<ul class="pt-list pt-inbound-list">…</ul>
```

- `inbound.heading`: **"On their sheets only"** — honest about what the section now is
  (asymmetries, not all inbound).
- `inbound.badge`: **"GM only"**, eye-slash icon. This is the visible-but-quiet signal, and it
  is load-bearing: the GM must never wonder what a player would see on this sheet. The answer
  the badge gives is *everything above this line except the reply fragments; nothing below it*.
- `inbound.hint`, one dimmed line: **"Recorded about {name} by people {name}'s own list doesn't
  name back. To let a player see a connection, write it on their character's sheet."** — the
  rule restated where it is enforced, so it teaches itself.

### 6. Sorting, volume, degradation

- **Order:** `inbound()` already sorts by their strength descending, then name — how much this
  character matters to the author is the right rank for "who cares about this person". Same
  sort key as everywhere else; no new rule.
- **No collapse mechanism now.** Asymmetries-only keeps the section short by construction
  (measured: 2 rows on the busiest barkeep in the world). Portraits carry `loading="lazy"` —
  the one cheap mitigation rendering dozens of `<img>` ever needs. **Revisit a collapse or
  filter if an actor passes ~20 inbound-only rows** — the same threshold pattern as the
  rejected quick-filter (0.8.0) and dropdown-search (iteration 3).
- **Narrow container:** inbound rows sit in the same `container-type: inline-size` panel, so
  the existing `@container (width < 480px)` block applies as-is — chip label drops, portrait
  shrinks. Additions: below 480px the reply fragment drops its icon and keeps word + dot; the
  **GM badge never degrades** — the safety signal is not a nicety to economise on.
- **Standalone window:** comes free — same `buildHTML`, same `bind`, and the window is opened
  from the sheet by the same GM. No divergence to specify.

## What bites, said before it does

| Found while judging | Resolution |
| --- | --- |
| The author of an inbound row is deleted | The row simply vanishes — it was derived from *their* document, which is gone. No greyed state, because unlike outbound rows there is nothing cached on this side to grey with. Asymmetric with outbound's greyed-name degradation, and correctly so |
| Inbound rows go stale while the sheet is open | They change when *another* actor updates, and the panel deliberately listens to nothing (`write()` is `render: false`; the 0.8.0 stale-window judgement). Accepted again, same reasoning — and "Edit their side" is safe regardless, because the dialog re-reads both sides live on open and at save |
| A player's client calls `inbound()` from console | Gets `[]` — the gate is in the function. What it *cannot* stop is reading flags off `game.actors` directly, which no client-side code can stop; that is the parent doc's presentation-not-access boundary, unchanged |
| Rendering (not scanning) a huge section | The scan is 0.154 ms; the render cost is DOM. Asymmetries-only bounds the row count, `loading="lazy"` bounds the images, and the ~20-row threshold above is the tripwire |
| The reply fragment lengthens every mutual row for GMs | One dimmed line inside a column that already stacks name + preview; the container query already governs the narrow case. If the panel starts feeling tall in play, the fragment — not the section — is the first thing to demote to expand-only |

## What changes where

| File | Change |
| --- | --- |
| `ties-api.mjs` | **Done:** `inbound(actor)` — GM-gated scan, resolves author name/img live, clamps fields, `mutual` flag, strength-then-name sort |
| `pentaryn-ties.mjs` | **Done:** publishes `inbound` on `game.pentaryn.ties` |
| `editor.mjs` | `buildHTML` appends the separator + inbound list (GM only, non-empty only); mutual outbound rows gain the reply fragment and the expanded `.pt-their-side` block (GM only); inbound rows reuse the summary/detail renderers in read-only form with the `fa-reply` hint; `bind()` wires "Edit {name}'s side" → `TieDialog.open({source, target})` and expand/collapse for inbound rows (`expanded` Map keys already take any tie id — author ids slot in) |
| `styles/ties.css` | `.pt-inbound` dashed rule (+ `.theme-light` restatement), `.pt-inbound-sep`/`.pt-gm-badge`/`.pt-inbound-hint`, `.pt-reply`, `.pt-their-side`; 480px container block gains the reply-fragment degradation |
| `lang/en.json` | `inbound.heading`, `inbound.badge`, `inbound.hint`, `inbound.expandOf`, `inbound.editTheirs` ("Edit {name}'s side"), `reply.tip`, `theirSide.heading` |
| `README.md` (module) | The sheet section gains one paragraph: what the line means, that everything below it is GM-only, and the write-it-on-their-sheet rule for player-visible connections |

## Rejected (iteration 4)

| Idea | Why not | What it would have cost |
| --- | --- | --- |
| **A SQL database as the backbone** | No server-side code path exists for a Foundry module (manifest: client esmodules, styles, packs, socket — nothing else); world data is the server's LevelDB, synced to clients as documents. An external DB needs a companion server outside Foundry and forfeits world portability, backups, permission-aware sync, and distribution | All of the module's zero-install portability, to solve a lookup that measures **0.154 ms** |
| **A persisted reverse index** (flags or a settings blob) | A second copy of the truth that disagrees with the first after any out-of-band write (`setTie`, the importer, a manual flag edit), plus write-amplification on every tie save | Migration + invalidation machinery to beat a 0.115 ms full rebuild |
| **An in-memory Map index, now** | Even this is premature: the honest per-sheet cost is 0.154 ms. Named here as the *only* index this feature could ever justify — a `Map` rebuilt whole on `createActor`/`updateActor`/`deleteActor` (hook dispatch verified in core), warranted past ~5,000 actors | Code that answers a question nobody has asked in under a fifth of a millisecond |
| **Editable inbound rows** | Writes another actor's document from a panel whose contract is this actor's flags; duplicates the dialog's link-by-identity rules in a second place | Two editors for one row, and the divergence bugs that come with two |
| **Showing inbound to players** — or a setting to allow it | Settled by Joe. Inbound is other people's records: GM stances toward the PC, and the names of actors the player has never met | The one disclosure channel the parent doc's three rules never had to cover |
| **Listing mutual pairs in both sections** | Measured: 24 of a PC's 24 inbound rows are mutual — the section would be a near-copy of the list above it, burying the asymmetries that are the actual news | A separator that separates nothing |
| **Greyed placeholder for a deleted author's row** | There is nothing cached on this side to build it from; the row's storage *is* the deleted document | A fake row fabricated to mourn data that no longer exists |
| **Collapsible inbound section, now** | Asymmetries-only bounds it by construction; the busiest actor measured shows 2 | One more piece of state to survive repaints. Revisit past ~20 inbound-only rows |
| **A "show all inbound" flat view** | The reply fragments already make the outbound list the mutual view; `game.pentaryn.ties.inbound(actor)` serves the raw list from console | A third presentation of rows already on screen twice |
| **Inbound on the canvas cards or the describe card** | The cards answer "whom does the hovered actor know" for a player-shared surface; grafting a GM-only branch onto them splits their permission model. The sheet is where "who holds them" lives | A GM-only fork inside the one code path players share |
