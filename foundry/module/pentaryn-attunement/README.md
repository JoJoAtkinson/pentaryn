---
title: "Pentaryn Attunement Slots"
status: active
last_modified: 2026-10-10
tags: [foundry, module, dnd5e, attunement]
---

# Pentaryn Attunement Slots

**Read this when:** attunement is on screen and behaving oddly, or you want to know
what the slot strip in the character sheet sidebar is doing.
**Not this file:** why it was placed there rather than on the inventory tab →
[`../../../context/plans/foundry-attunement.md`](../../../context/plans/foundry-attunement.md)

---

## What it does

Renders attunement as slots in the **character sheet sidebar**, directly under the
stats card, and warns — never blocks — on every path that can push an actor past
`system.attributes.attunement.max`.

```
☀ ATTUNED                    3/3
[Cloak] [Luckstone] [Periapt]
```

| Gesture | Effect |
| ------- | ------ |
| Drag an item from the inventory onto an **empty** slot | Attunes it there |
| Drop onto a **filled** slot | Unattunes the occupant, attunes the newcomer in its place |
| Right-click a slot, or click its ✕ | Unattunes — the slot stays put, neighbours don't move |
| Left-click a slot | Opens the item sheet |
| Hover a slot | dnd5e's own rich item card |

Attuning from the sidebar is drag-only on purpose. A click-to-attune affordance
would need a list of *candidates* in the sidebar, and that list is what made every
other layout too tall — the candidates are already in the inventory, one drag away.

## Reading the display

| Look | Means |
| ---- | ----- |
| Dashed empty circle | Free slot |
| Full-colour icon | Attuned and working |
| **Greyed icon + 🚫 badge** | Attuned but its effects are **suppressed** — usually unequipped. It is burning a slot and granting nothing |
| **Maroon ring + red count** | Past `attunement.max`. The system allows this; nothing else tells you |

The suppressed state is the one worth watching. dnd5e suppresses an item's effects
when it is unequipped *or* unattuned, so an attuned-but-unequipped Staff of Healing
looks attuned everywhere else in the UI while doing nothing at all.

## Attuned but not carried ("away" bonds)

An attuned item that leaves the character keeps its slot. The rules say attunement only ends when you end it (or after 24 hours more than 100 ft away). The sheet shows it as **faded, greyscale, dashed, with a red broken-chain badge**. Hovering shows the item's name and *"Still attuned, but not on Talo. Its power is dormant until it is back in hand."* It deliberately does not say where the item is.

```js
// Move items into a container (an item-piles chest), tagged "(Talo)", attuned ones bonded
await game.pentaryn.attunement.stash(actor, chestActor, itemIds, { currency: true });
```

- Each moved item carries `flags["pentaryn-attunement"].bond` holding its real name, equipped state and attunement. The actor carries `flags["pentaryn-attunement"].away`.
- When a bonded item is created on any non-pile actor (item-piles Take, a drop, a script), `preCreateItem` strips the `(Name)` tag.
- If that actor is the owner and the away entry still exists, the item also arrives **attuned and equipped**, the away slot becomes the item's slot, and a toast says so.
- A bonded `Coin Purse` adds its coin to whoever takes it, then deletes itself.
- The ✕ or a right-click on an away slot asks first, then ends the attunement.
- `stash()` uses the item's *source* name. Enchanted items such as the War Mage wand build their displayed name from an effect (`{} of the War Mage, +1`). Tagging the prepared name would double that suffix.

## When the sidebar is collapsed

The strip goes with it — the same gesture already hides AC, HP, hit dice and death
saves. The fallback is the system's own `☀ value / max` counter in the inventory
filter row, which this module turns **red when over cap**. That decoration is also
the whole of what NPC sheets get; their sidebar is a different structure and does
not take the strip.

## Warnings, and why nothing is ever blocked

Two hooks watch every write:

* `preUpdateItem` — the sun toggle, the context menu, this module's drops, macros,
  and MCP calls all land here.
* `preCreateItem` — an item arriving *already attuned* from item-piles, an import,
  or a compendium drop. (The system only strips `attuned` on **sheet** drops.)

Neither ever returns `false`. A vetoed Foundry update resolves without applying and
without throwing, so an MCP script would carry on believing it succeeded — and this
world is scripted through the bridge. A wrong number on a sheet is recoverable;
a script that silently did nothing is not.

The cap cannot be enforced anyway: delete the feature or expire the effect that
raised `attunement.max` and the actor is over cap having fired no item hook at all.
That is why the display renders over-cap states properly instead of trusting that
every write was caught.

## The "Not Proficient" cloak

Also fixed here, because the categories it breaks *are* the attunement categories.

dnd5e's `armorProficienciesMap` covers only `natural`, `clothing`, `light`, `medium`,
`heavy` and `shield`. A cloak is `wondrous`, so the lookup misses, the multiplier falls
to `0`, and the tooltip and chat card both report **Not Proficient** — on every ring,
rod, wand, trinket and wondrous item in the world. It was never saying you can't wear
it; it was reporting that you lack the proficiency named `undefined`.

At `init` this adds `wondrous`, `ring`, `rod`, `wand` and `trinket` to that map as
`true` ("everyone is proficient"), using `??=` so a future dnd5e definition wins and
this becomes a no-op.

**`vehicle` is deliberately left out** — vehicle proficiency is a real concept in some
settings and quietly granting it to everyone is a trap.

Nothing here enumerates feats, and nothing needs to. Every proficiency source — class,
species, background, feat, Active Effect — is already aggregated by the system into
`actor.system.traits.armorProf.value` and recomputed on every data prep, so gaining a
feat updates the pills on its own. The only thing missing was *which categories the
question applies to*, which is all this supplies. Real armour is untouched: a bard with
light-armour proficiency still reads "Not Proficient" on plate.

## Slot order is stored, and is only ever a hint

`flags["pentaryn-attunement"].slots` holds an array of item ids. There is no slot
concept in dnd5e — `system.attuned` is a bare boolean — so without this the icons
would re-sort whenever their neighbours changed, which is poison for a surface whose
job is answering "did that just change?".

`computeSlots()` reconciles the flag against reality on every render: entries whose
item is gone, unattuned, or duplicated become holes; attuned items missing from the
array drop into the first hole. **Deleting the flag is always safe** — worst case
you get the order you'd have had without it. Nothing is written during render.

## Checking an actor

```js
game.pentaryn.attunement.report("Ballad Quinn")
```

Prints a table of every attunable item: slot, attuned, equipped, suppressed, and a
`dataIssue` column that catches the silent one — `prepareFinalEquippableData()`
clears attunement on equipment lacking the **Magical** property, so an item can read
`attuned: true` in the database and be completely inert in play, showing up in
neither column of any UI that filters prepared data.

## Tests

```
node test/run.mjs        # or: make foundry-attunement-sync, which runs them first
```

31 fixtures. Most cover `computeSlots` — stale flags, deleted items, duplicate ids,
corrupt flag types, over-cap, non-default `max`; it runs inside a render hook, so it
must never throw, and the suite covers malformed actors for that reason. The rest pin
the proficiency-map correction: that armour categories stay untouched, that `vehicle`
is never claimed, and that an existing dnd5e definition always wins.

## dnd5e 6

0.2.0 targets dnd5e 6.0 (verified 6.0.6). The data model this module reads
(`system.attributes.attunement`, `system.attunement` / `system.attuned`), the sheet
DOM it hooks (`.sidebar > .card`, the inventory `.attunement` counter, the
`.loading[data-uuid]` tooltip contract) and `CONFIG.DND5E.armorProficienciesMap`
(still the six armour categories) are unchanged. The one change: the suppressed-slot
aria-label reads `DND5E.EFFECT.Suppressed.Hint`, because 6.0 removed
`DND5E.EffectUnavailableInfo`.

## Install

```
make foundry-attunement-sync
```

New module, or a change to `module.json`: `make vtt-down && make vtt-up` first —
`module.json` is read once at startup. For `.mjs`/`.css` edits a browser reload (F5)
is enough. Then enable **Pentaryn Attunement Slots** in Manage Modules.
