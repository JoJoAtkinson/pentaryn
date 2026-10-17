---
title: "Pins — real-browser acceptance test (Mac, Claude in Chrome)"
status: active
last_modified: 2026-10-17
tags: [plans, foundry, pentaryn-pins, testing]
---

# Pins — real-browser acceptance test

**Read this when:** you are the Mac session ("mac-pentaryn") asked to run the pins acceptance test
through vtt.atjoseph.com in Joe's Chrome. **Not this file:** the design → [`pin-2026-10.md`](pin-2026-10.md);
using pins → [`../foundry/pins.md`](../foundry/pins.md). This is the one-time go-live check for the
pins build (kept with the plan as its record, like `module-bundles-acceptance-2026-10-11.md`); the
repeatable checks are the live scenarios in `pins.md`.

The automated harness (`automation/smoke/pins-live.mjs`) already covered the logic on BOSS through
localhost. This pass checks what only a real browser on the public URL shows: the Cloudflare login,
the right-click menu with a real mouse, the sheet badge and the player view on a real client.

## Rules

- Load the `anthropic-skills:chrome-browser` skill first, and work in a **new tab**.
- Use only `https://vtt.atjoseph.com`. Joe's Google account passes Cloudflare Access; if Google asks
  for a password or 2FA, stop and ask Joe. Never type, read back or store a password.
- **Never move, copy or delete a real player's token**, and never activate a real scene. The six
  players are pinned to their own characters (one token each: camp-site and Wayward Compass). All
  test moves use documents named `PinTest*`, which you create and then delete.
- Pentaryn Pins must be live: in the console, `game.pentaryn.pins.describe().version` returns a
  version and the world setting **Pinning** (Configure Settings → Pentaryn Pins; key
  `pentaryn-pins.pinning`) is ON. If not, stop and report.

## Setup (as Gamemaster, in a GM tab)

In the browser console of the GM tab:

```js
const N = await Scene.create({ name: "PinTest Mac North", width: 1400, height: 1000, grid: { size: 100 } });
const S = await Scene.create({ name: "PinTest Mac South", width: 1400, height: 1000, grid: { size: 100 } });
const u = await User.create({ name: "PinTest Mac", role: 1, password: "" });   // throwaway, no password, deleted at the end
const a = await Actor.create({ name: "PinTest Mac Hero", type: "character", ownership: { [u.id]: 3 } });
const pet = await Actor.create({ name: "PinTest Mac Pet", type: "npc", ownership: { [u.id]: 3 } });
await N.createEmbeddedDocuments("Token", [
  { ...(await a.getTokenDocument({ x: 300, y: 300 })).toObject(), actorLink: true },
  { ...(await pet.getTokenDocument({ x: 400, y: 300 })).toObject(), actorLink: true },
]);
await game.pentaryn.pins.pin({ actor: a.id, user: u.id });
```

Open a **second Chrome profile or incognito window**, go to vtt.atjoseph.com (Cloudflare login as
Joe), and log into Foundry as **PinTest Mac** with an empty password. This is the "player" window.

## Checks — record pass/fail and a screenshot for each

1. **Player lands on the token's scene.** The player window shows PinTest Mac North, not the active scene.
2. **A pull moves a pinned player (0.2.0).** In the GM tab, view PinTest Mac South (do NOT activate
   any real scene; "View" only). Then use **Pull users to scene** on South for PinTest Mac only. The
   player window switches to South: since pins 0.2.0 a pull is the move primitive and moves pinned
   players too (rebuild plan §7.1); there is no "Your view follows" note any more. Pull PinTest Mac
   back to North the same way before step 3.
3. **Sheet badge.** The Hero's sheet shows "Pinned to PinTest Mac", in both windows.
4. **Menu, real mouse.** In the GM tab on PinTest Mac South: right-click empty canvas, and a menu
   opens with **Prompt note** and **Teleport pinned character ▸**. The submenu lists PinTest Mac (and
   any real player who is logged in; do not pick them). Right-click on a token: no menu. Right-drag:
   pans, no menu. Try a trackpad two-finger click if available.
5. **Teleport with the pet.** Pick **Teleport pinned character ▸ PinTest Mac** at a spot on South.
   The Hero lands there, the Pet lands beside it, both are gone from North, and the player window
   switches to South by itself. There is no "cannot switch Scenes" toast.
6. **Same-scene teleport.** Repeat on South at another spot: both move, the player stays on South.
7. **Prompt note.** Menu → Prompt note: it does the same as pressing P at that spot. Delete the note.
8. **Player reload.** Reload the player window: it comes back on South.

## Cleanup (always, even after a failure)

```js
for (const s of game.scenes.filter(s => s.name.startsWith("PinTest Mac"))) await s.delete();
for (const a of game.actors.filter(a => a.name.startsWith("PinTest Mac"))) await a.delete();
for (const u of game.users.filter(u => u.name.startsWith("PinTest Mac"))) await u.delete();
```

Close the player window. Report a pass/fail table with notes and anything that looked wrong.
