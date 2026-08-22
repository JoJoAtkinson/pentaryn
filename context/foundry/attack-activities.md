---
created: 2026-08-21
last-modified: 2026-08-21
tags: ["#playbook", "#foundry", "#vtt", "#dnd5e", "#combat", "#argon"]
status: shipped — Pip Locksley
---

# Attack activities — one-click Sneak Attack, and off-hand damage without the modifier

**Read this when:** authoring a weapon activity in dnd5e — one-click Sneak Attack, off-hand damage with no ability modifier, anything Argon-facing.
**Not this file:** NPC action specs for the actor pipeline → [`../tools.md`](../tools.md)

> **Goal.** Kill two bits of at-table friction in Argon: the rogue rolling damage and *then*
> hunting for Sneak Attack, and the off-hand weapon wrongly adding Dex/Str to its damage.

Core dnd5e + Argon only. **No midi-qol** in this world, so none of this is hook-driven — it is
all authored as extra **activities** on the weapons themselves.

## The mechanism

A dnd5e 5.x weapon can carry any number of activities. Argon renders them as separate buttons
when `enhancedcombathud-dnd5e → explodeItemActivities` is **`only-weapons`** (the module default).
The weapon-set slot button in the main panel is unaffected — it calls `item.use()`, which pops
dnd5e's `ActivityChoiceDialog` when the weapon has more than one activity. **Shift-click skips the
dialog and fires the first activity**, so keep the plain `Attack` sorted first.

### Sneak Attack, baked into the attack

Clone the weapon's attack activity and add one damage part:

```js
{ custom: { enabled: true, formula: "@scale.rogue.sneak-attack" },
  number: null, denomination: null, bonus: "",
  types: [<the weapon's damage type>],            // single type → no "pick a type" prompt
  scaling: { number: 1, mode: null, formula: null } }
```

`@scale.rogue.sneak-attack` is the class scale value, so it levels itself. Result on a Rogue 5
scimitar: **`4d6 + 4 slashing`, +7 to hit, one roll, one card.**

### Once per turn, tracked

The 2024 PHB module puts the once-per-turn counter on the Sneak Attack *activity*, with **no
recovery configured** — spend it once and it never comes back. Move it to the **item**:

```js
"system.uses" = { max: "1", spent: 0, recovery: [{ period: "turn", type: "recoverAll" }] }
```

`period: "turn"` is the right one. dnd5e's `Combat5e._onStartTurn` calls
`_recoverUses({ turn: true, … })`, and `turn: true` recovers for **every** non-defeated combatant
at the start of **every** turn — which is exactly "once per turn", including a sneak attack on
someone else's turn via an opportunity attack.

Then every `+ Sneak` activity consumes it:

```js
consumption.targets = [{ type: "itemUses", target: <sneak attack item id>, value: "1",
                         scaling: { mode: null, formula: null } }]
```

Argon reads `consumption.targets` of type `itemUses` and shows the shared counter on every
connected button (`echDnd5e.js`, `_onLeftClick` → `updateItemButtons`). Clear the activity-level
uses at the same time or you get two counters.

⚠ `turn` is a combat-only period. Out of combat the use does not come back until a combat turn
passes. Rare enough to live with; the pip on the sheet is clickable.

⚠ `activity.canUse` only looks at the activity's *own* uses, not its consumption targets, so a
spent `+ Sneak` still appears in the choice dialog. Clicking it warns and aborts rather than
silently rolling — acceptable.

### Off-hand damage without the ability modifier

2024 rules: the two-weapon-fighting extra attack adds **no** ability modifier to damage unless the
character has the **Two-Weapon Fighting** fighting style. Foundry has no off-hand slot and dnd5e
does not automate this, so author it:

```js
damage = { critical: { bonus: "" },
           includeBase: false,                    // ← drops the weapon's base part *and* its @mod
           parts: [ { custom: { enabled: false, formula: null },
                      number: 1, denomination: 6, bonus: "<magicalBonus or ''>",
                      types: ["slashing"], scaling: { number: 1, mode: null, formula: null } } ] }
```

Additional damage parts never get `@mod` appended — only the base part does. So this yields
**`1d6 slashing`** while the attack roll keeps its full **+7**. `includeBase: false` also drops the
weapon's magic bonus, so re-add it by hand in `parts[0].bonus` (Pip's +1 shortsword → `bonus: "1"`).

**Activation depends on mastery.** With **Nick** the extra attack is part of the Attack action and
costs nothing, so use `activation.type: "special"` (Argon's *free* panel) — setting it to `bonus`
would wrongly eat the bonus action. Without Nick it really is a bonus action: `activation.type: "bonus"`.

## What Pip Locksley (`mfkhAL0SzLJ34KfA`) has

| Weapon | Attack | Attack + Sneak | Off-Hand | Off-Hand + Sneak |
|---|---|---|---|---|
| Scimitar (nick) | 1d6+4 slash | 4d6+4 slash | 1d6 slash *(free)* | 4d6 slash *(free)* |
| Dagger (nick) | 1d4+4 pierce | 1d4+3d6+4 pierce | 1d4 pierce *(free)* | 1d4+3d6 pierce *(free)* |
| Shortsword +1 (vex) | 1d6+5 pierce | 4d6+5 pierce | 1d6+1 pierce *(bonus)* | 4d6+1 pierce *(bonus)* |
| Shortbow | 1d6+4 pierce | 4d6+4 pierce | — | — |

The generated activities are named exactly `Attack + Sneak`, `Off-Hand`, `Off-Hand + Sneak`; the
build script deletes activities by those names before recreating, so it is re-runnable after a
sheet re-import.

## Gotchas found the hard way

- Activities are **pseudo-documents**. `item.createEmbeddedDocuments("Activity", …)` throws
  *"Activity is not a valid embedded Document"*. Use `item.update({ [`system.activities.${id}`]: data })`
  with a `foundry.utils.randomID()`, or `item.createActivity(type, data)`. Delete with
  `` {[`system.activities.-=${id}`]: null} ``.
- Argon's weapon-set button reads `Array.from(item.system.activities)[0]` for its label, range and
  tooltip — keep the plain `Attack` at `sort: 0`.
- Test a use without spamming chat: `await activity.use({}, {configure:false}, {create:false})`.
  Consumption still applies, so restore `system.uses.spent` afterwards.
