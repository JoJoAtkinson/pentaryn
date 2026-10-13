# Defect wave 3 2026-10-13 — wave-2 checks that needed two GM tabs

**Read this when:** you want the live results of the wave-2 items that were left unrun because they
need two clients: journal async-1, EC-4 and rob-2, and transform's "wildcard art through the player
relay". History, not instructions.

Source: the "Not run, waiting on an event" list in
[`../defect-wave-2-2026-10-12/README.md`](../defect-wave-2-2026-10-12/README.md) and the journal record
[`../defect-wave-2-2026-10-12/journal.md`](../defect-wave-2-2026-10-12/journal.md). Joe allowed a second
GM tab for this step only (FIX-W3, 2026-10-13). No code changed here.

## Setup

- World `pentaryn`, Foundry 14.369, dnd5e 6.0.6. The served `pentaryn-journal/personal.mjs` and
  `pentaryn-transform/form-image-adapter.mjs` contain the wave-2 fixes.
- Tab A was the MCP bridge GM tab (`localhost`). Tab B was a second Gamemaster tab from
  `make login NO_OPEN=1 USER_NAME=Gamemaster WORLD=pentaryn LOGIN_HOST=zz1.localhost`. The separate
  cookie host kept tab A's session untouched. Tab B was closed at the end.
- No user was created. The "player" in each check is an in-memory `User` (`ZZrace…`/`ZZ Relay Sender`)
  that was never saved. For the claim race, its `update` and `flags` point at a scratch journal
  `ZZ Claim Board`, so the two tabs race on a real document through the server, just as they would
  on a real player's User.
- Both tabs ran the same harness. A flag write on `ZZ Claim Board` fires an `updateJournalEntry`
  hook in both tabs at once, and each tab then calls the module's own code: the
  `pentaryn-journal.ensure` query handler, or the module's `createUser` hook function.
- Both tabs were hidden throughout, so Chrome throttled their timers to about 1 s.

## Results

| item | result | evidence |
|---|---|---|
| journal-async-1 (query path) | pass | Both tabs stamped a claim: the board showed both socket ids at once. Tab A won and created `ZZ Race 1's Journal` in "Player Journals" in 15 ms. Tab B lost, waited 910 ms, and answered with the same entry id. There was one journal, and no claim was left on the board. |
| journal-async-1 (`createUser` hook path) | pass | Started from tab B. Both stamps were present together. Tab B won, and tab A waited and released. There was one journal (`ZZ Race 2's Journal`), no claim was left, and neither tab logged a warning. |
| journal-EC-4 (server clock) | pass | Tab B's `Date.now` was set 120 s fast, then `game.time.sync()` ran. B's `serverTime` agreed with A's while `Date.now` differed by 120 s. A real race (round 3) made one journal. In a forced check, tab A's claim was stamped in server time, 5.5 s old. Tab B ran the handler alone: it read the claim as fresh and did **not** create, so there were 0 journals. Under the old `Date.now` code B would have seen the claim as 125 s old, treated it as stale, and made a second journal. B kept waiting until the journal appeared and then answered with A's id. |
| journal-rob-2 (never arrives) | pass | Tab B acted as a player that cannot create journals: `canUserCreate` was stubbed to false, the GM had no personal journal, and `gmButton` was read as true in tab B only. `api.add(ZZ Relay Note)` got an answer naming the phantom id `ZZphantom0000001`. Result: `null`, `lastReason` `no-journal`, the warning "Couldn't add this to your journal — tell the GM.", and the console line "ensure: the GM answered but the journal did not arrive". |
| journal-rob-2 (arrives late) | pass | The answer named `ZZlateArrival001`, and tab A created that journal 1.5 s later. B got no warning, saw the info toast "Added to your journal — ZZ Relay Page", and the page landed in that journal. |
| transform wildcard art via the player relay | pass | `ZZ Relay Wolf` was imported from the MM Wolf (`wolf-*.webp`, 2 files, already in sorted order). `api.formImage`, the `pentaryn-transform.formImage` handler called with a ZZ player sender (twice), and a socket payload sent into core's `userQuery` listener all returned `…/tokens/wolf-01.webp`. That is the first sorted match, and it was the same every time. A uuid that is not an Actor returned `null`. |

## Observed, not defects of the fixes

- **A query to your own user reaches every tab.** When tab B sent the ensure query to the
  Gamemaster (its own user), the handlers in **both** tabs ran: B's own local handler and tab A's
  over the socket. B kept the first answer, which was its own. With one GM account and two tabs,
  every relay is answered by whichever tab is fastest. This is why journal-async-1's claim is
  needed.
- **Hidden tabs stretch the waits.** `waitForPersonal` (loser wait, `LOSER_WAIT_MS` 7 s) and the
  rob-2 arrival wait (`ARRIVE_WAIT_MS` 3 s) count poll iterations, not wall-clock time. In a hidden,
  throttled tab, the 3 s wait took 30 s. The EC-4 loser kept waiting for 125 s, well past the
  player's 8 s query timeout and the 60 s claim stale window. Nothing broke: the winner answers the
  player, and the loser's claim is released at the end. It is noted in case a background bridge tab
  ever has to give up promptly. **Not fixed here.**
- **A socket payload from a sender that does not exist never reaches the module.** Core's
  `Users.#handleUserQuery` throws "User [ZZrelaySender000] does not exist" before it calls the
  handler, and it sends no ack, so the sender's query times out. A real Gamemaster sender on the same
  path was answered `fulfilled` with `wolf-01.webp`.

## Cleanup

All ZZ documents were deleted: `ZZ Claim Board`, `ZZ Race 1–4's Journal`, `ZZ Relay Note`,
`ZZ Late Arrival` and `ZZ Relay Wolf`. Every patch in both tabs (the ensure handler, `canUserCreate`,
`settings.get`, notifications, `Date.now`) was restored before tab B closed. `report()` afterwards
shows each player's journal unchanged with no duplicates, no journal at the root, and no ZZ
documents left. Exit state: one GM tab, and `get-world-info` answers `pentaryn`.
