---
created: 2026-08-22
last-modified: 2026-08-22
tags: ["#playbook", "#foundry", "#vtt", "#npcs", "#design", "#ui"]
status: proposed — mockup built, awaiting sign-off
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
