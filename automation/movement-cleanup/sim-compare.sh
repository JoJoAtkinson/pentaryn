#!/usr/bin/env bash
# Exit 0 only when pentaryn-movement's simulator is identical to the frozen baseline.
#   sim-compare.sh            both checks (summary + per-seed digest), 10,000 seeds
#   sim-compare.sh summary    only make foundry-movement-sim SEEDS=10000 (summary minus its timing line)
#   sim-compare.sh digest     only the per-seed sha1 of every runSeed record with its event log (8 chunks in parallel)
#   REPO=... (default /home/joe/code/pentaryn)   OUT=dir for this run's outputs (default a mktemp dir)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=${REPO:-/home/joe/code/pentaryn}
MODE=${1:-all}
OUT=${OUT:-$(mktemp -d /tmp/movement-simcmp.XXXXXX)}
export PATH=$HOME/.nvm/versions/node/v24.22.3/bin:$PATH
# The only non-deterministic text: "10000 seeds from 1 in 314.9 s" (wall clock) — normalised, every other line compared.
norm() { sed -E 's/^([0-9]+ seeds from [0-9]+) in [0-9.]+ s$/\1 in <T> s/' "$1" | grep -v '^make\(\[[0-9]*\]\)\?: \(Entering\|Leaving\)'; }
rc=0
if [ "$MODE" = all ] || [ "$MODE" = summary ]; then
  ( cd "$REPO" && make foundry-movement-sim SEEDS=10000 > "$OUT/sim.txt" 2>&1; echo "exit $?" >> "$OUT/sim.txt" )
  if diff <(norm "$HERE/sim-baseline.txt") <(norm "$OUT/sim.txt") > "$OUT/sim.diff"; then echo "summary: IDENTICAL"
  else echo "summary: DIFFERS (see $OUT/sim.diff)"; cat "$OUT/sim.diff"; rc=1; fi
fi
if [ "$MODE" = all ] || [ "$MODE" = digest ]; then
  pids=()
  for k in 0 1 2 3 4 5 6 7; do
    node "$HERE/sim-digest.mjs" "$REPO" $((1 + k * 1250)) 1250 > "$OUT/digest.$k" 2>&1 & pids+=($!)
  done
  for p in "${pids[@]}"; do wait "$p"; done
  cat "$OUT"/digest.[0-7] > "$OUT/digest.txt"
  if diff "$HERE/sim-digest-baseline.txt" "$OUT/digest.txt" > "$OUT/digest.diff"; then echo "digest: IDENTICAL (10000 seeds)"
  else echo "digest: DIFFERS in $(grep -c '^>' "$OUT/digest.diff") seeds (see $OUT/digest.diff; first: $(grep -m1 '^>' "$OUT/digest.diff"))"; rc=1; fi
fi
echo "outputs: $OUT"
exit $rc
