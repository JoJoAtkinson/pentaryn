#!/bin/bash
# run-verify.sh - runs verify.js in the three phases on the pt harness (page "pgb" = ZZ GM8H) and merges them into verify.json
# usage: run-verify.sh [harness-user]    (the page must be open: pt/c.sh open '{"user":"pgb","id":"zzGameMaster008H"}')
HERE="$(cd "$(dirname "$0")" && pwd)"
PT=${PT:-$HERE/../../pt}
U=${1:-pgb}
for ph in static resets scenarios; do
  echo "globalThis.VERIFY={phase:'$ph'}; $(cat $HERE/verify.js)" | $PT/e.sh $U - > /tmp/pgv_$ph.json
done
python3 - "$HERE" <<'PY'
import json,sys
here=sys.argv[1]
parts=[json.load(open(f'/tmp/pgv_{p}.json')) for p in ('static','resets','scenarios')]
checks=[];lines=[];measured={};ms=0
for p in parts:
    v=p.get('value') or {}
    if not v.get('checks'): checks.append({'name':'phase crashed','pass':False,'detail':str(p)[:600]}); lines.append('FAIL phase crashed '+str(p)[:300]); continue
    checks+=v['checks']; lines+=v['lines']; measured.update(v.get('measured',{})); ms+=v.get('ms',0)
failed=[c for c in checks if not c['pass']]
out={'pass':not failed,'failed':len(failed),'total':len(checks),'ms':ms,'measured':measured,'lines':lines,'checks':checks}
json.dump(out,open(here+'/verify.json','w'),indent=1)
print('verify:', 'PASS' if not failed else 'FAIL', f"{len(checks)-len(failed)}/{len(checks)}")
for l in lines:
    if l.startswith('FAIL'): print(l[:300])
PY
