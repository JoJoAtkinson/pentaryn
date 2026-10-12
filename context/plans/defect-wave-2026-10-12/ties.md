# Defect wave 2026-10-12 — pentaryn-ties

**Read this when** you want the history of the 2026-10-12 defect wave for the `pentaryn-ties` module:
what was fixed, why, which commits and tests, and how to check it live. History, not instructions.

Branch `fix/ties-2026-10-12`, off `origin/main`. Joe approved the wave on 2026-10-12 with "take all of
those, and if I don't mention it take recommendation". Every fix is a declared behaviour change. All
eight items held under verification, so none were reverted. Gate: `make foundry-ties-check` is green
(conformance 96.1 %, with the accepted exceptions C05 and C37).

| id | defect | Joe's ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| ties-ui-E3 | A player's **Remove** on the Ties tab removed only their own side, though the confirm box says both | Recommendation taken | The GM's client now also removes the NPC's tie back to the character, using a new relay action `remove-reverse`. The sender must own the character and must already have removed their own side. With no GM online, only the player's side goes (the same silent no-op as mirror). | d503b00e | `test/remove-relay.test.mjs` |
| ties-ui-M1 | Known-tab notes lost the last words typed if you clicked away or closed the sheet within 700 ms | Recommendation taken | Leaving the notes box now saves any pending autosave straight away instead of cancelling it | ff769872 | `test/known-notes-flush.test.mjs` |
| name-leak (play-test TIE-3) | Chat cards (study stub, tempo line, share whisper, Inspect stub) printed the actor name, which leaked GM-only names such as "ZZ Lich Vorath" behind a "Hooded figure" token | The token name is public | Cards and speaker alias name a creature by its token. The order is: an unlinked token's own name, then its token found on any scene (canvas, then active, then all), then the prototype token's name, and the actor name only when there is no token at all | 7e237f8a, 3cd629f3 | `test/name-leak.test.mjs` |
| ES-4 | The "studying the room" tempo bubble was drawn over a token the viewer cannot see, which gave away a hidden character's position | Recommendation taken | The bubble is drawn only for viewers who can see the token (`canSee`). The GM still sees it, and the chat line is unchanged | a98cbfed | `test/tempo-visibility.test.mjs` |
| EXT-1 | The GM's hold prompt printed "Tier null on a total of 15" for attribute facts and "total of null" for an unrolled row | Recommendation taken | Only creature-kind facts show a tier. Lore and attribute facts use the lore line, e.g. "The Guild — Held oath — DC 10, rolled 15". A missing total shows "—" | 956f46cb | `test/hold-meta.test.mjs` |
| ES-1 + ES-2 | A roll in progress or stuck (a claim row) showed as pending, and pressing Deliver on it spent the roll and handed nothing over | Recommendation taken | Claim rows are left out of the pending list. Deliver on one warns "Nothing is pending" and writes nothing. Reset still clears a stuck one | a52c54aa | `test/claim-rows.test.mjs` |
| AC-4 | A second GM tab's late claim overwrote a finished record, so the fact was rolled a second time | Recommendation taken | A late stake on a finished record backs off without rolling, and clears its stray `claim` from the record. Leftover: the record's `when` value takes the late stake's time | 7825eeed | `test/late-claim.test.mjs` |

## Goldens changed

- **name-leak (7e237f8a)**: only the card text and alias rows, now showing the token name, in
  `app-preview-controls`, `cascade-combat`, `cascade-inspect`, `cascade-share`, `cascade-tempo`,
  `glue-key-inspect-gm`, `glue-keys-player`, `glue-look-menu`, `glue-token-hud-clicks-gm`,
  `study-attr`, `study-auto-and-null`, `study-kind`, `study-lore` and `study-refusals`.
- **EXT-1 (956f46cb)**: the one hold-prompt line in `study-attr.json`, replaced by hand. A
  name-filtered `GOLDEN_UPDATE` run rewrote unrelated rows, so that output was thrown away.
- No other goldens changed. `test/graph-allow.json` gained the edge `editor.mjs -> relay.mjs` (E3).

## Live check after deploy

Use only ZZ-prefixed scratch actors and a ZZ scratch scene. Never use Caven, Marrith, Talo or campaign scenes.
Reload the module first (only `.mjs` changed).

- **ties-ui-E3**
  1. Make a player-owned `ZZ Tie PC` and an NPC `ZZ Tie NPC`. Tie them both ways (as GM, or by a mirrored tie).
  2. With a GM client online, have the player client open ZZ Tie PC → Ties tab → Remove the tie to ZZ Tie NPC.
  3. Check that `ZZ Tie NPC`'s ties flag no longer has a row for ZZ Tie PC.
- **ties-ui-M1**
  1. On `ZZ Tie PC`'s Known tab, type into an entry's notes and click outside the box within half a second.
  2. Reopen the sheet and check that the notes end with the last words typed.
- **name-leak**
  1. Make an actor `ZZ Lich Vorath` and put a token for it named "Hooded figure" on scene `ZZ Name Leak`. Keep the GM viewing a different scene.
  2. From a player client, study or inspect the token, and share a fact about it.
  3. Check that the player's chat says "Hooded figure" in the card text and speaker, never "ZZ Lich Vorath".
- **ES-4**
  1. On `ZZ Name Leak`, hide `ZZ Tie PC`'s token from a second player (hidden, or out of vision).
  2. Trigger the tempo "studying the room" on ZZ Tie PC. Check that the second player sees no bubble, while the GM sees it and the chat line posts.
- **EXT-1**
  1. Set an attribute or lore fact on a ZZ actor to hold, and have a player roll it.
  2. Check that the GM's "A check came in" prompt reads like "<name> — <fact> — DC n, rolled m", with no "Tier null" and no "null".
- **ES-1 + ES-2**
  1. As GM, write a bare claim row `{claim, when}` onto a `ZZ Tie NPC` belief, using the eval tool on the scratch actor.
  2. Check that `study.pending` does not list it, and that Deliver on it warns "Nothing is pending" and leaves the flag unchanged.
  3. Reset the row.
- **AC-4**
  1. On a ZZ actor with a finished kind or lore record, call the claim path again as a second-tab stake.
  2. Check that no new roll happens, that the record's text and total are unchanged, and that `claim` is null.
