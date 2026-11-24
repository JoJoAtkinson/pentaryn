#!/bin/bash
# syntax-check the generated function-body scripts
export PATH=$HOME/.nvm/versions/node/v24.22.3/bin:$PATH
cd "$(dirname "$0")"
for f in "$@"; do (echo "(async()=>{"; cat $f; echo "})"; ) > /tmp/pgchk_$f.mjs; node --check /tmp/pgchk_$f.mjs && echo "$f ok"; done
