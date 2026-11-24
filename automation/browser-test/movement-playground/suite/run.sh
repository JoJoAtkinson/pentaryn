#!/bin/bash
# run.sh <round> [all | S03,S05,...] [state | gpu | both] [--indicative] [--void-loaded] [--only S01.a,S01.b] [--list]
# results: out/<round>/{results.jsonl,summary.md,fails.md,ev/,shots/}
export PATH=$HOME/.nvm/versions/node/v24.22.3/bin:$PATH
cd "$(dirname "$0")"
exec /home/joe/code/pentaryn/.venv/bin/python -I -u run.py "$@"
