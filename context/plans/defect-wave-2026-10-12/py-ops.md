# Defect wave 2026-10-12 — py-ops

**Read this when** you need the history of the 2026-10-12 defect wave for the py-ops group
(`scripts/foundry/ops/`). This is a record, not instructions; the use-doc is
[`context/foundry/ops.md`](../../foundry/ops.md).

Branch `fix/py-ops-2026-10-12`. Source findings:
[`final-review-2026-10-12/py-ops.md`](../final-review-2026-10-12/py-ops.md).
Gate: `./.venv/bin/python -m pytest -q scripts/tests -k 'pipeline or import'`, 36 passed at the end.

| id | defect | Joe's ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| py-ops-ac-5 + rob-10 | `make foundry-import` installed its Ctrl-C/kill handlers only after `stage()` had already copied `actors.json` into public `Data/`, and never handled SIGHUP. A Ctrl-C during the copy, or closing the terminal at the prompt, left the actors file publicly downloadable through the tunnel. | Fix (wave approval 2026-10-12, review recommendation taken) | The import now sets up its cleanup for Ctrl-C, kill (SIGTERM) and terminal close (SIGHUP) before it copies anything. It removes that cleanup only after the file is deleted. Any interrupt from the copy to the delete removes `actors.json` and exits with code 130. A Ctrl-C during the build/install inside `stage()` now exits 130 through the same handler instead of raising KeyboardInterrupt. The `context/foundry/ops.md` paragraph on the exit paths is updated. | `115c9856` | `scripts/tests/test_foundry_ops.py`: `test_import_deletes_on_a_signal_right_after_stage_copies` (SIGINT/SIGTERM/SIGHUP), `test_import_deletes_when_the_terminal_closes_at_the_prompt`, `test_import_restores_every_cleanup_handler` |

No item was reverted. A verifier confirmed the one item holds.

## Goldens changed

None.

## Live check after deploy

This is a Mac-side script, and nothing in Foundry changes. Do not import into a campaign world.
Run these with the tunnel down, or where `WORLD` points at a ZZ scratch world.

**py-ops-ac-5 + rob-10**
1. `./.venv/bin/python -m pytest -q scripts/tests/test_foundry_ops.py -k 'signal or terminal or handler'`. All should pass.
2. Run `make foundry-import WORLD=<ZZ scratch world>`. When the "press y" prompt appears, press Ctrl-C. Expect `▸ interrupted — deleting the staged JSON`, exit code 130, and no `actors.json` in `Data/worlds/<ZZ world>/`.
3. Do step 2 again, but close the terminal window at the prompt (SIGHUP) instead of pressing Ctrl-C. In a new shell, confirm that `actors.json` is gone from `Data/worlds/<ZZ world>/`.
