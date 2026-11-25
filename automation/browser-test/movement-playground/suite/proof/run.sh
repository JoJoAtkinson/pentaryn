#!/bin/bash
export PATH=$HOME/.nvm/versions/node/v24.22.3/bin:$PATH
cd "$(dirname "$0")/.."; ./harness/start.sh gpu >/dev/null 2>&1
exec /home/joe/code/pentaryn/.venv/bin/python -I -u proof/proof.py
