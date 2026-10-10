# Druid Wild Shape on the HUD (build record)

**Status:** built 2026-10-09/10; playtest passed the core flow, audit items open. Use-doc:
[`foundry/module/pentaryn-transform/README.md`](../../foundry/module/pentaryn-transform/README.md).
Design detail: `foundry/module/pentaryn-transform/WILDSHAPE-DESIGN.md`.

**Why.** Joe: Wild Shape felt chunky. Wanted it in the HUD: one click to shift, the beast's actions on
the HUD, a clear "Return to Talo", use count tracked and recovered per the 2024 PHB (uses by level,
1 back on Short Rest, all on Long Rest, Bonus Action to shift and revert, 6 hours).

**Built.** `pentaryn-transform` 0.1 (revert item) -> 0.2 (`hud.mjs`, `transform.css`: Bonus-bar Wild
Shape with form tiles, Return to Talo, Change Form, auto-revert, one chat line) -> 0.3 (`starry.mjs`:
Starry Form tiles) -> 0.3.1 (target-picker cancel, no duplicate panels, "Opportunity Attack" slot,
temp HP shown). Installed after backup `world-2026-10-09-232812-fvtt14.367.tar.gz`; Talo's data unchanged.

**Playtest 2026-10-10.** Passed: shift, change, return, 0-use lockout, rests, auto-reverts, sheet
route via `Item.use()`, Starry Form. Failed/open: Revivify `damage` -> `heal`; Cosmic Omen on the HUD;
Argon target-picker feedback; small layout and chat-wording clunks. Details in `context/pentaryn.md`.
