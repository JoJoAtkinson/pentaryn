---
title: "Pentaryn Attunement Slots"
status: active
last_modified: 2026-10-11
tags: [foundry, module, dnd5e, attunement]
---

# Pentaryn Attunement Slots (`pentaryn-attunement`)

**Read this when:** attunement is on screen and behaving oddly, you want to know what the slot
strip in the character sheet sidebar is doing, or you are calling or changing `pentaryn-attunement`.
**Not this file:** why the strip sits in the sidebar → [`../../../context/plans/foundry-attunement.md`](../../../context/plans/foundry-attunement.md) ·
how every addon is built → `context/foundry/addon-blueprint.md` · how this module was migrated →
`context/plans/addon-blueprint-2026-10/migrate-pentaryn-attunement.md`

Attunement as slots in the **character sheet sidebar**, under the stats card, plus a warning — never
a block — on every path that can push an actor past `system.attributes.attunement.max`. Exposes
`game.pentaryn.attunement`.

## What the player sees

```
☀ ATTUNED                    3/3
[Cloak] [Luckstone] [Periapt]
```

| Gesture | Effect |
| ------- | ------ |
| Drag an inventory item onto an **empty** slot | Attunes it there |
| Drop onto a **filled** slot | Unattunes the occupant, attunes the newcomer in its place |
| Right-click a slot, or click its ✕ | Unattunes — the slot stays put, neighbours don't move |
| Left-click a slot | Opens the item sheet |
| Hover a slot | dnd5e's own rich item card |

| Look | Means |
| ---- | ----- |
| Dashed empty circle | Free slot |
| Full-colour icon | Attuned and working |
| **Greyed icon + 🚫 badge** | Attuned but its effects are **suppressed** (usually unequipped): it burns a slot and grants nothing |
| **Faded, dashed, red broken-chain badge** | Attuned but **not carried** (an away bond, below) |
| **Maroon ring + red count** | Past `attunement.max`. The system allows this; nothing else tells you |

Attuning from the sidebar is drag-only on purpose: the candidates are already in the inventory.

**Away bonds.** An attuned item that leaves the character keeps its slot — by the rules attunement
ends only when you end it (or after 24 hours more than 100 ft away). Hovering it reads *"Still
attuned, but not on Talo. Its power is dormant until it is back in hand."* and deliberately does not
say where it is. When it is created on any non-pile actor again (an Item Piles Take, a drop, a
script) its `(Talo)` tag goes; if that actor is the owner and the away entry still exists it also
arrives **attuned and equipped** in its own slot, with a toast. A bonded `Coin Purse` pays its coin
to whoever takes it and deletes itself. The ✕ or a right-click on an away slot asks, then ends the
attunement.

**Collapsed sidebar, NPCs.** The strip goes with the sidebar (as AC and HP do). The fallback is the
system's `☀ value / max` counter in the inventory row, which turns **red when over cap**; that is
all NPC sheets get.

**Warnings.** Attuning past the cap, or an item arriving already attuned onto an actor at the cap,
shows a warning toast. A batch (several items attuned or created attuned in one write) counts the
ones before each item, so the first past the cap and every one after it warns. A drop onto a filled slot is a swap (one out, one in), so it does not warn. The warning and the strip share one cap (`capOf`): `attunement.max` when it is a finite number, else 3, so a missing max warns at 3 and names 3. Nothing is ever vetoed: a vetoed Foundry update resolves without applying
and without throwing, so an MCP script would carry on believing it succeeded. The cap is
unenforceable anyway — expire the effect that raised `attunement.max` and no item hook fires.

## Settings

n/a — no settings.

## API — game.pentaryn.attunement

Also `game.modules.get("pentaryn-attunement").api`, published at `ready` (frozen). `describe()`,
`version`, `contract`, `settings()`, `trace()`, `uninstall()` come from the kit.

| Method | Args | Returns | Writes? | GM? |
|---|---|---|---|---|
| `report(target?, { quiet? })` | Actor, id or name; defaults to the controlled token | `{ actor, value, max, over, slots, rows }`, or `undefined` (+ a warn) when no actor; prints a table unless `quiet` | no | no |
| `computeSlots(actor)` | Actor, or id / uuid / exact name | `{ slots, max, value, over }`; `null` for a name that matches nothing or an object that is not actor-like (no `items` / `getFlag`) | no | no |
| `away(actor)` | as above | `[{ key, name, img }]`; `[]` on the same misses | no | no |
| `stash(owner, container, itemIds, { tag?, currency?, detail? })` | Actors and item ids | the number of items created; with `detail`, `{ count, created, away }`. Rejects, deleting none of the owner's items, if the container accepted fewer copies than asked; the copies it did accept are deleted from the container again, and the error names them (`err.created`, `err.rolledBack`; a failed rollback leaves them there and says why). A success logs one `console.info` audit line (count, container, copy ids and names, `by`) | yes | no |
| `releaseAway(actor, key)` | Actor, away key | `setFlag`'s promise | yes | no |
| `inspect(ref, { sceneId?, base? })` | any actor ref (throws `NOT_FOUND` / `AMBIGUOUS`) | `{ actor, slots, max, value, over, away, bonds, counts }`, plain JSON; `counts` = dnd5e's value, away, the strip's value and `mismatch` | no | no |
| `selftest()` | — | `{ ok, checks }` | no | no |

`report("Ballad Quinn")`'s `dataIssue` column catches the silent case: dnd5e clears attunement on
equipment without the **Magical** property, so an item can be `attuned: true` in the database and
inert in play. Nothing in `inspect` is GM-only.

## Data written

| Where | Shape | Written by |
|---|---|---|
| actor `flags.pentaryn-attunement.slots` | `(itemId \| "away:<key>" \| null)[]`; trailing holes trimmed by a drop and by an item coming home; `stash` writes the reconciled order padded to `max` (`computeSlots()` re-pads on read, so both forms render the same) | a drop onto a slot; `stash`; an item coming home |
| actor `flags.pentaryn-attunement.away` | `[{ key, name, img }]` | `stash`; `releaseAway`; an item coming home |
| item `flags.pentaryn-attunement.bond` | `{ actor, key, name, equipped, attuned, attunement, currency? }`; `actor` is the owner's **uuid**, so an unlinked token is told apart from its base actor and its siblings (a bond written before 2026-10-12 holds the bare id and still matches on it) | `stash` (on the copies); cleared (`_del`) when the item is home |
| item `flags.pentaryn-attunement.claims.coinBack`, `flags.pentaryn-attunement.claims.home` | the claiming tab's socket id | `claimDocument` (one GM tab wins a returning coin purse / a returning bonded item); gone with the purse when it pays out (the purse deletes itself); `.claims.home` cleared (`_del`) with the bond when the item is home; both cleared on a copy that arrives carrying a stale one |

The slot flag is only ever a **hint**: `computeSlots()` reconciles it on every render (gone,
unattuned or duplicated ids become holes; attuned items without a slot drop into the first hole),
so deleting it is always safe. Nothing is written during render.

## Flags other modules read

None today. pentaryn-dropbin repairs attunement on its own; it does not read these flags.

## Events

n/a — emits none.

## Patches and adjustments

| Row (`foundry/adjustments.yml`) | What |
|---|---|
| `dnd5e-armor-proficiencies` | At `init`, adds `wondrous`, `ring`, `rod`, `wand`, `trinket` to `CONFIG.DND5E.armorProficienciesMap` as `true`, only when unset (`== null`), so the tooltip and chat card stop saying **Not Proficient** on every magic item. A later dnd5e definition wins. `vehicle` is deliberately left out. Proficiency sources (feats, effects) are already aggregated by dnd5e; this only supplies which categories the question applies to |
| `itempiles-attunement-repair` | A bonded item created on an Item Piles pile keeps its tag (box to box); `isPileActor` |
| `attunement-item-tooltip-anchor` | 0.2.1 (U-8-5): dnd5e 6.0.6 positions an item tooltip a frame after it loads; when the hovered row re-rendered away in between, `Tooltips5e#_positionItemTooltip` threw *reading 'getBoundingClientRect'*. Wrapped at `ready` (kit `wrapMethod`, marker `pentarynGuarded`) to skip when there is no anchor. A failing install only warns `tooltip guard skipped`; the API still publishes. Retire when dnd5e checks `game.tooltip.element` itself |

dnd5e 6 (verified 6.0.6): the data model, the sheet DOM (`.sidebar > .card`, the inventory
`.attunement` counter, `.loading[data-uuid]` tooltips) are unchanged; the suppressed-slot label
reads `DND5E.EFFECT.Suppressed.Hint`.

## Two sessions / who writes

- The pre-hooks (`preUpdateItem`, `preCreateItem`) run only on the client that makes the change;
  the bond restore mutates the item's source there (for an Item Piles Take, the GM's).
- `createItem` (slot hand-back, coin purse) runs only where `userId === game.user.id` — once per
  user, but in **every tab** of that user (the MCP bridge tab and a GM browser tab both, for a
  GM-made change). The slot hand-back is claimed like the purse (kit `claimDocument`, key `home`
  on the returning item, ~750 ms settle): exactly one tab clears the bond, together with its claim,
  and hands the slot back, so a batch from two tabs cannot leave a phantom away slot
  (ATT-AC-1-residual). The coin purse is
  claimed first (kit `claimDocument`, key `coinBack` on the purse item, 750 ms settle), so exactly
  one tab pays and deletes it; a purse already gone stands down (W2-A1). Several purses in one
  batch pay in turn on a per-actor coin chain, apart from the hand-backs, so each adds to the last
  total (ATT-AC-2). An Item Piles currency transfer in the same take-all is written by Item Piles
  with an absolute value outside this chain; the purse's 750 ms claim settle is what orders the
  payout after it (ATT-AC-2-residual).
- Sheet drops and `stash` write from the client that calls them. In that tab they run in turn
  with each other and with the slot hand-back on a per-actor chain (`serial` in
  `actor-adapter.mjs`), each planning from the previous one's write, so two overlapping stashes or
  drops on one owner keep both away entries and both slots (ATT-AC-3). A lone call runs at once.

## Extending

Pure rules go in `attunement-core.mjs` with a fixture table in `test/core.test.mjs` (oracle +
core). The shared writes (`stash`, `releaseAway`, `writeSlots`, the `serial` lane) and third-party reads go in
`actor-adapter.mjs`; the features write their own hook-driven updates (`sheet.mjs` attune/unattune,
`bonds.mjs` hand-back and purse). DOM in `strip.mjs`; hooks in a feature (`sheet.mjs`, `bonds.mjs`)
registered through `reg.on(name, fn, { label })`. A new API
method is a row in `api-manifest.mjs` plus an impl in `api.mjs`, then
`GOLDEN_UPDATE=1 node --test test/api.test.mjs` and a read of the golden diff.

## Pitfalls

- **Hook order with dropbin.** Attunement's `preCreateItem` registers at load (the features install
  synchronously in the entry); dropbin's attunement repair registers inside an async `ready`, so
  `restoreBond` runs first. Moving attunement's install to `setup` would break that order.
- `stash()` tags with the item's **source** name: an enchanted item's displayed name comes from an
  effect (`{} of the War Mage, +1`), and the prepared name would double the suffix on the way home.
- Two counts exist: the warning uses dnd5e's `attunement.value` (+ away), the strip counts items
  whose prepared `attuned` is true (+ away). They can differ; `inspect().counts.mismatch` says so.
- Strings live in `lang/en.json` (`languages` in `module.json`) and every site reads a full-key literal
  through `_loc("PENTARYN_ATTUNEMENT.X", data)`. Foundry prints `undefined` for a placeholder missing
  from `data`, so `lang-switch.test` checks each call passes every placeholder. (The old inline
  `STRINGS` / `t()` existed because merging into `game.i18n.translations` at init did not survive to
  render in v14; a shipped lang file is Foundry's own path.)

## Files

| File | Role |
|---|---|
| `attunement.mjs` | entry: init, ready (guard, build, publish), installs `sheet` then `bonds` |
| `attunement-core.mjs` | pure: constants, `capOf`, `computeSlots`, `homeSlots`, `planStash`, `bondChanges`, `wouldExceed`, `patchProficiencyMap`, `safe` |
| `actor-adapter.mjs` | `stash`, `releaseAway`, `writeSlots`, `isPileActor`, the two dnd5e adjustments |
| `strip.mjs` | UI: the strip, the counter's over-cap class |
| `sheet.mjs`, `bonds.mjs` | features: the render hook and slot gestures; the item hooks |
| `api-manifest.mjs`, `api.mjs` | the published API |
| `styles/attunement.css` | every rule under `.pentaryn-attunement` / `.pentaryn-attunement-*` |
| `lib/` | vendored kit 1.1.0 (full + `patch`, `election`) — never edited here |

## Tests

```
node test/run.mjs        # from this folder
```

`core.test` runs each pure rule against a verbatim oracle of the pre-migration code and the core;
`slots.test` holds the slot fixtures (stale flags, deleted items, duplicates, corrupt flag types,
over cap, non-default `max`, away entries, coming home) and the proficiency-map patch; `glue.test`,
`hooks.test`, `api.test`, `strip.test` (a minimal DOM), `listeners`, `hook-errors`, `perf`,
`stash-safety`, `guard-failure`, `home-race`, `overlap`, `bond-uuid` and `lang-switch` pin the wiring;
`flags-written` scans the sources so every flag path they write is in `describe().flags.writes`; `core-meta` holds the core's identity (it loads
with no Foundry globals, constants agree with `module.json`, `trimSlots`), `docs` guards this
README, and `i18n` checks `lang/en.json` against the oracle's former `STRINGS`. Goldens in `test/golden/`.

## Sync

```
make foundry-attunement-sync
```

A `.mjs`/`.css` change needs a browser reload; a `module.json` change a Foundry restart. Then
`game.pentaryn.attunement.describe().version` is `module.json`'s and `selftest().ok` is true.
