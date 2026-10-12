# Defect wave 2026-10-12: feedback (pentaryn-feedback)

**Read this when** you want the history of the 2026-10-12 defect wave for the `pentaryn-feedback`
module: what was fixed, why, and how to check it live. This is history, not instructions. The
use-doc is `foundry/module/pentaryn-feedback/README.md` and `context/foundry/feedback.md`.

Source review: [`../final-review-2026-10-12/feedback.md`](../final-review-2026-10-12/feedback.md).
Approval: Joe, 2026-10-12 (~11:00 EDT), "take all of those, and if I don't mention it take
recommendation". Branch `fix/feedback-2026-10-12`. Gate `make foundry-feedback-check`: green,
128/128 tests, conformance 100 %.

| id | defect | Joe's ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| rob-1+EC-1 | A queued report whose `t` is a finite number outside the Date range (for example 1e20) passed `validateReport`, then `normaliseReport` threw a RangeError in `ingestNow` outside its try. That player's queue was blocked for good: the entries in front were re-filed and re-toasted, and no key was ever deleted. | Take the recommendation | `validateReport` now refuses a `t` that is not a valid Date, so the GM's tab drops that entry with a "refused report" warning in the console and files the player's other reports. As a second guard, `ingestNow` wraps `normaliseReport` in its own try/catch that refuses and deletes the entry, the same way a malformed entry is handled. A failed upload still keeps its entry queued for a retry. README "Filing" bullet and an Unreleased CHANGELOG line added. | `cc7715ee` | `test/core.test.mjs` "validateReport (rob-1/EC-1): a finite t outside the Date range is refused…"; `test/glue.test.mjs` "rob-1/EC-1: an entry whose t is outside the Date range is refused and dropped…" and "rob-1/EC-1: if normalising one entry throws, that entry is dropped with a warning…" |

## Goldens changed

None.

## Live check after deploy

This module touches no actors or scenes. The check uses the GM's own User flag and one throwaway
report marked `ZZ live check`. Never write to a player's User.

**rob-1+EC-1**

1. As the active GM, through eval-js: copy one well-formed entry shape (`schemaVersion`, a
   16-character alphanumeric `id`, a category key, text `"ZZ live check"`) and write two entries
   under `game.user` at `flags.pentaryn-feedback.queue.<id>`. Give the first `t: 1e20` and the
   second `t: Date.now()`. Use different ids, and make each key equal its entry's `id`.
2. Call `game.modules.get("pentaryn-feedback").api.ingest({ userId: game.user.id })`. Expect
   `ok: true`, with the bad id in `refused` (reason "t must be a timestamp") and the good id in
   `filed`. Expect `api.pending(game.user)` to be `[]` and a console warn line
   "refused report <id> …".
3. Clean up: resolve or delete the filed "ZZ live check" report (`feedback_list` /
   `feedback_resolve`), and confirm the GM's queue flag is empty.
