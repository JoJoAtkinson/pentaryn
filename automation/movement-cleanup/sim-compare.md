# Simulator compare — pentaryn-movement cleanup (frozen 2026-11-25)

Baseline frozen at HEAD `5c0f62b5130b2a217c6a1367986bd46ed374ea60` (0.10.2, branch movement-0.9; working tree clean under foundry/module/pentaryn-movement), Node v24.22.3.
The 10,000-seed output equals the post-1-2 baseline (`sim-k2-10000.txt`, Task T1) line for line apart from the timing line.

## The two checks

1. **Summary** — exactly the gate's own command:

       cd /home/joe/code/pentaryn && make foundry-movement-sim SEEDS=10000

   Baseline: `sim-baseline.txt` (exit 0, 0 failing runs). Run twice (A and B, in parallel): the ONLY differing line is
   `10000 seeds from 1 in <wall-clock> s`. Deterministic: every other line — the failing-runs count, the seven invariant
   rows (passThrough wallCross wrongCharge unsent restOverlap shape errors, all 0), mover overlap (26773 episodes in 2416
   seeds; depth p95 0.968 max 1.473; duration p95 2017 max 11767 ms; 6471 sq-s), waiting 12314 / shortMate 2345 /
   unforeseen 2621 / leader 7795 / leaderMoving 2080 (1081 sq-s), race seeds 11, members dropped 62381 never moved 25589
   named 21983, and `exit 0`. In `JSON=1` output (`sim-baseline.json`) only the top-level `ms` is non-deterministic.
   ~5.5-6 min on BOSS.

2. **Per-seed digest** (much stricter, ~55 s on 8 cores): `sim-digest.mjs` runs `runSeed(s, { events: true })` for every
   seed 1..10000 and prints `<seed> <sha1 of the whole record incl. its event log: plans, slots, sends, stops, notices> <failures>`.
   Baseline: `sim-digest-baseline.txt` (10000 lines, 0 ERROR, 0 seeds with failures). Proven deterministic (two full runs
   identical) and sensitive (a scratch copy with LEAD.beside 2.5 → 2.4 changed 163 of the first 2000 digests, while the
   summary can hide such shifts). It does not go through make; it imports test/sim/scenario.mjs from REPO.

## Command

    /tmp/claude-1000/-home-joe-code-pentaryn/55679b9c-70a1-48f9-a7c4-b38176ae5993/scratchpad/clean/sim-compare.sh          # both (exit 0 only if both identical)
    .../sim-compare.sh digest   # the fast per-seed check (use after every cleanup commit)
    .../sim-compare.sh summary  # the make gate's output vs sim-baseline.txt (use before the final commit)

Env: `REPO` (default /home/joe/code/pentaryn; point at a worktree to compare a branch), `OUT` (outputs dir; default a new
`cmp.XXXXXX` beside the script). Prints `summary: IDENTICAL|DIFFERS`, `digest: IDENTICAL (10000 seeds)|DIFFERS in N seeds`
with the diff files in OUT. Exit 0 only when every requested check matches.

## Diff recipe by hand

    norm() { sed -E 's/^([0-9]+ seeds from [0-9]+) in [0-9.]+ s$/\1 in <T> s/' "$1"; }
    diff <(norm sim-baseline.txt) <(norm new.txt)          # summary
    diff sim-digest-baseline.txt new-digest.txt            # digest; a differing seed → make foundry-movement-sim SEED=<n> on both trees and diff the JSON

## Rules for the cleanup

- A cleanup or perf commit must keep BOTH identical. An exact optimisation (same plans) keeps the digest; anything that
  changes a single plan, delay or stop shows up as a digest diff even when the summary is unchanged.
- Changing the simulator itself (test/sim/*) or the digest's inputs invalidates the baseline: re-freeze only with an
  auto-decision recorded, never to turn a red compare green.
- Note: `MOTION.restGap` is unused (a change to it moves nothing); `STAGGER.brush` is read once (file-core.mjs:202).
