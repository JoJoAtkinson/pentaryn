---
created: 2026-08-22
last-modified: 2026-08-22
tags: ["#playbook", "#foundry", "#vtt", "#dnd5e", "#design"]
status: shipped — 0.1.0
---

# Attunement slots — design plan

**Read this when:** changing or extending the `pentaryn-attunement` module. **Design doc.**
To *use* it at the table, read `foundry/module/pentaryn-attunement/README.md`.
**Not this file:** current party attunement state → [`../space-journey.md`](../space-journey.md)

> **Goal.** Make attunement visible and hard to get wrong: which items are attuned, which
> are silently doing nothing, and when a character is over the limit — answered at a glance,
> from any tab, without opening anything.

---

## Where this started

Two complaints, which turned out to be one problem and one red herring.

1. *"Ballad's Cloak of Protection kept its bonuses after I unattuned it."*
2. *"D&D Beyond shows three attunement slots. Can Foundry?"*

**The red herring first.** The cloak is authored correctly — `attunement: "required"`,
the **mgc** property present, one transferred Active Effect granting +1 AC and +1 saves.
A clone test (actor cloned with the cloak unattuned, nothing written to the database)
proved suppression works exactly as designed:

| | attuned | unattuned (clone) |
|---|---|---|
| AC | 15 | 14 |
| `ac.bonus` | 1 | 0 |
| save bonus | `"1 + 1"` | `"1"` |
| `areEffectsSuppressed` | false | **true** |

So the data model was never broken. Three hypotheses were checked and all disproved:
`attunement` set to `""`/`"optional"`; the **mgc** gotcha (below); an effect living on
the actor rather than the item. The realistic remaining causes are a stale sheet render
or toggling on the base actor while watching an unlinked token's synthetic copy.

**But the audit that disproved it found the real problem.** Ballad was sitting at
**5/3** — Cloak of Protection, Luckstone, Periapt, *plus* an unequipped Staff of Healing
and an unequipped Cloak of Displacement, the last two attuned and suppressed, each
burning a slot for nothing. Nothing in Foundry had ever said so.

## What dnd5e 5.3.3 actually does

Everything except the two things that matter. Actor `system.attributes.attunement.value`/
`.max`, item `system.attunement`/`system.attuned`, a live count in
`prepareFinalEquippableData()`, correct effect suppression, and a `☀ value / max` widget
appended to the inventory filter row by `_renderAttunement()`.

And then:

```js
// _prepareItemPhysical
ctx.attunement.disabled = !item.isOwner;   // the only gate in the system
```

**No cap enforcement anywhere**, and no display beyond that one counter. A character can
attune seven items and every effect applies.

Nothing in the module ecosystem fills the gap either. The only implementation is
**Tidy5e Sheets**, which does enforce the cap (`AttuneButton.svelte` refuses past max)
and adds a hover summary — but replaces the whole character sheet, which was not on the
table for a campaign mid-flight.

### The mgc gotcha

```js
// prepareFinalEquippableData
if ( this.validProperties.has("mgc") && !this.properties.has("mgc") ) this.attunement = "";
if ( !this.attunement ) this.attuned = false;
```

Equipment not flagged **Magical** loses its attunement requirement *at prep time*, so an
item can read `attuned: true` in the database and be completely inert in play. Any UI
that filters prepared data omits exactly the items a data-health check exists to find —
which is why `report()` diffs `_source` against prepared values rather than trusting either.

## Placement: four candidates, and why the sidebar won

This was the whole design argument. It went through two rounds of adversarial review and
the verdict reversed once.

| Candidate | Rejected because |
|---|---|
| Replace the sheet (Tidy5e) | Table-wide UI change mid-campaign for one corner of one tab |
| Two-column D&DB panel, always open at top of inventory | ~400px on top of ~150px of existing tab chrome in a 1000px sheet. Worse: its right-hand "items requiring attunement" column is a filtered duplicate of the inventory list sitting 200px above the inventory list — those rows already carry the sun toggle |
| Same panel, default-collapsed | A collapsed panel gives zero confirmation, and confirmation was the entire point |
| Counter-anchored click-to-open popover | State behind a click. ~2 interactions per glance where an always-visible surface costs 0 |
| **Sidebar strip, under the stats card** | **Shipped** |

**The argument that settled it: adjacency to the thing that changes.** The stats
attunement modifies — AC above all — are rendered on that same sidebar card. Unattune the
cloak and you watch the icon leave its slot *and* the AC badge tick 15 → 14, in one
glance. The inventory panel could never show the second half, and the second half is
precisely what the original complaint was about. Tab-independence came free.

Accepted costs, both deliberate:

* **Collapsing the sidebar hides it.** The same gesture already hides AC, HP, hit dice and
  death saves; attunement is not more sacred than hit points. The system counter remains
  as a fallback, and this module turns it red when over cap so the fallback is not silent.
* **No candidate list in the sidebar.** Attuning is drag-only. Adding a candidate column
  is what made every other layout too tall; the candidates are already in the inventory.

**Rejected late: shipping both.** Considered, and it is the same slot list rendered twice
plus the counter — three displays of one fact, two able to disagree during a render race.

## Slots have to be persisted

There is no slot concept in dnd5e. `system.attuned` is a bare boolean; nothing orders
items. Favourites get drag-to-reorder because `ActorFavorites5e` has a real `sort` field.

Render-order slots were rejected: replacing one item reshuffles its neighbours when the
sort key changes. On a surface whose only job is answering "did that just change?", icons
that move on their own are actively harmful.

So `flags["pentaryn-attunement"].slots` holds an item-id array — **a hint, never the
truth**. `computeSlots()` reconciles it against `system.attuned` on every render; deleting
the flag is always safe. Nothing is written during render, which is what keeps the render
hook free of write loops.

## Enforcement: warn on every path, veto on none

Three writers, two hooks:

| Path | Covered by |
|---|---|
| Sun toggle, context menu, favourites menu — all converge on `InventoryElement.prototype._onToggleAttunement` | `preUpdateItem` |
| Macros, `eval-js`, MCP `manage-world-items` | `preUpdateItem` |
| item-piles transfers, imports, compendium drops carrying `attuned: true` (the system only strips it on **sheet** drops, in `_onDropResetData`) | `preCreateItem` |

**Neither hook ever returns `false`.** A vetoed Foundry update resolves without applying
and without throwing, so a macro or MCP call carries on believing it succeeded. This world
is scripted through the bridge; silent divergence between what a script thinks it did and
what the database holds is worse than an over-attuned bard.

A lib-wrapper gate on `_onToggleAttunement` was designed and then **dropped**: once the
decision was warn-and-allow everywhere, `preUpdateItem` already covers that path, and the
wrap bought nothing but a dependency.

The cap is unenforceable in principle regardless — delete the feature or expire the effect
that raised `attunement.max` and the actor is over cap having fired no item hook at all.
That is why the display renders over-cap states properly instead of trusting the hooks.

## Mechanism notes

* **Hook `renderBaseActorSheet`, not `renderCharacterActorSheet`.** Foundry walks the
  inheritance chain firing `render<ClassName>` for every ancestor, so one hook covers
  character and NPC sheets. Guarded on `system.attributes.attunement` because vehicles and
  groups inherit the same base without the creature schema.
* **Injection is the sanctioned pattern, not a hack.** dnd5e 5.3 exposes no part/tab
  registration API for modules, and the system's own `_renderAttunement`,
  `_renderCreateInventory` and `_renderSpellbook` are all imperative DOM appends from
  `_onRender`. Injection is removed-then-appended so a future partial render cannot stack
  duplicates — the latent bug the system's own version still has.
* **Drops must `stopPropagation`.** Left to bubble, `_onDropItem` treats a same-actor item
  drop as an inventory **sort** and would silently reorder the pack.
* **Tooltips are the system's.** Setting `data-tooltip` to
  `<section class="loading" data-uuid="…">` lets dnd5e's `Tooltips5e` MutationObserver
  resolve it into `Item5e.richTooltip()` — the same card favourites rows get. It has to be
  set by hand because `PrimarySheetMixin._onRender` runs its `.item-tooltip` sweep *before*
  render hooks fire, so injected nodes miss it.
* **No `actor.reset()`.** The stale-derived-data quirk in `context/foundry/README.md` is an
  MCP-bridge phenomenon (a long-lived instance reading after a write). In the browser, an
  embedded item update re-runs actor prep and triggers a full re-render.

## Late addition: the "Not Proficient" cloak

Surfaced while the module's tooltips made it visible. `armorProficienciesMap` maps only
`natural`, `clothing`, `light`, `medium`, `heavy`, `shield`; `ring`, `rod`, `trinket`,
`vehicle`, `wand` and `wondrous` are absent. `EquipmentData#proficiencyMultiplier` looks
the category up, gets `undefined`, tests `actorProfs.has(undefined)`, and returns 0 —
so `equippableItemCardProperties` emits "Not Proficient" for every magic item everywhere.

**Rejected: a whitelist built from proficiency-granting feats.** That rebuilds something
the system already maintains — `actor.system.traits.armorProf.value` is the live
aggregate of every source and recomputes each prep. Copying it would be the fragile
version of the thing being asked for.

The actual gap is a different question: *does this category have a proficiency concept
at all?* `armorProficienciesMap` already answers it; the system just treats "absent"
and "not proficient" as the same thing. So the fix is five keys added with `??=`, and
both halves stay owned by dnd5e.

Considered and not taken: suppressing the pill entirely for those categories. It needs a
getter override on the data model that also feeds chat cards, for a cosmetic gain over
"Proficient" — which is at least true.

Verified live, non-mutating: same actor, same instant, a retyped heavy-armour item still
reports **Not Proficient** for a light-armour-only bard while her cloak reports
**Proficient**. The fix is scoped to categories that had no proficiency concept.

## Tests

`node test/run.mjs` — 20 fixtures over `computeSlots`. It runs inside a render hook and an
exception there takes the sidebar down, so the suite covers malformed actors alongside the
interesting cases: stale flags, deleted items, duplicate ids, corrupt flag types, over-cap,
non-default `max`.

**The suite earned itself immediately** — the duplicate-id fixture failed on the first run,
catching a bug where a repeated id in the flag rendered one item in three slots and
inflated the count against the cap.

`module-check` is `node-test` rather than `parse`: importing the module *is* a parse check,
so node-test is strictly stronger.

## Still open

* Ballad is at 5/3 and needs cleaning up by hand. The two suppressed items — Staff of
  Healing, Cloak of Displacement — are the obvious cuts, since they currently grant nothing.
  The module surfaces this; it deliberately does not fix it.
* 2024 rules attune during a short rest. A one-click/one-drag toggle is looser than RAW —
  a deliberate call for this table, not an oversight.
* Unlinked-token behaviour (embedded item hooks firing through the ActorDelta) is reasoned
  about but not yet exercised at the table.
