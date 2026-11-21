---
title: Pentaryn Dice
status: active
last_modified: 2026-11-21
tags: [foundry, module, pentaryn-dice, dice-so-nice]
---

# Pentaryn Dice

**Read this when:** a player wants to roll a big handful of physical-style dice in Dice So Nice ("select all my dice", "spawn 8d6", "I can't select all the dice", "click-drag selects tokens instead"), the Dice So Nice persistent-dice helpers misbehave, or Dice So Nice was updated. **Not this file:** the module README ([`../../foundry/module/pentaryn-dice/README.md`](../../foundry/module/pentaryn-dice/README.md)) for code structure; [`../plans/dice-2026-11.md`](../plans/dice-2026-11.md) for how it was built; typing a real-dice total into a damage card → the aoe "Real dice" box ([`aoe.md`](aoe.md)).

## At the table

Dice So Nice's **persistent dice** are dice you put on the table, pick up and throw. They live in the Dice So Nice sidebar tab (the d20 icon), and only while Dice So Nice's *Persistent dice* setting is on.

1. **Put many dice out at once.** Each die row (D4 … D20, D100, and the extras behind "Show more") has a small number box and a **+ ×** button. Type 8 in the D6 box and click **+ ×**: 8d6 land on the table. A D100 comes as its linked tens + units pair. Up to 30 per click; Dice So Nice's own dice limit still applies (a warning says how many landed).
2. **Select them.** **Select all mine** (above *Clear my dice*) selects every die of yours; the button at the end of a row selects all of yours of that type. Selecting adds to what is selected, so D6 then D8 selects both. **Alt+A** does the same as Select all mine. Other players' dice are never selected.
3. **Throw.** Grab any one selected die and swirl: they all go together. **Delete** removes the selected dice. **Clear selection** deselects.
4. **One by one** still works: Ctrl+click a die. The tab now says so without opening Help.

A click-drag on empty board still goes to Foundry (it starts a token box-select). A dice-board box select was left out of 0.1.0 (plan M3).

## For the GM

- Nothing runs on the GM's client for a player: spawning is Dice So Nice's own broadcast, and the selection is per browser.
- **First install** (Foundry restart, module.json is read at startup): `make foundry-dice-sync`, restart, enable *Pentaryn Dice* (`core.moduleConfiguration["pentaryn-dice"] = true`), reload, then `game.pentaryn.dice.selftest()`.
- **After any Dice So Nice update** (the updater always sends it to review: `review_always` in `foundry/update-policy.yml`): run `game.pentaryn.dice.selftest()`. `ok: false` names the internal that moved; the helpers stop working without breaking Dice So Nice itself.
- Shortcut clash: players rebind it in Configure Controls → Pentaryn Dice → *Select all my dice*. Not Ctrl+A (Foundry's select-all tokens), Shift+A (Argon's HUD toggle) or A (move left).

## Settings that matter

| Setting | Default | When to change it |
|---|---|---|
| *Dice helpers in the Dice So Nice tab* (client) | on | a player who wants Dice So Nice's tab untouched; redraws the tab, no reload |
| Dice So Nice → *Persistent dice* (world) | — | must be on, or the tab has no dice list and `selftest()` reports no manager |
| Dice So Nice → *Max dice number* | — | the cap a "+ ×" run stops at |

## API quick calls

```js
game.pentaryn.dice.selftest()                  // { ok, checks }: the six Dice So Nice internals
game.pentaryn.dice.status()                    // setting, DSN on, your dice count, selection by type, shortcut
await game.pentaryn.dice.spawn({ type: "d6", count: 8 })   // as the calling user; dryRun: true previews
game.pentaryn.dice.selectMine({ type: "d6" })  // → how many are selected now
game.pentaryn.dice.clearSelection()
```

Every call acts for the browser it runs in, so from the GM's tab it spawns and selects the GM's dice.

## Known gaps

- No box select by dragging on the dice board (plan M3, out of 0.1.0).
- The selection count is not shown in the tab: Dice So Nice does not re-render on a selection change.
- Rides Dice So Nice 6.4.5 internals (adjustments `dsn-persistent-dice-select`, `dsn-sidebar-tab-dom`).
