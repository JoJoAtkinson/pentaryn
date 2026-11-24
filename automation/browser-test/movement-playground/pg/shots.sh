#!/bin/bash
# shots.sh - screenshots of the whole scene and of every station on the pt harness (swiftshader Chrome), into shots/
# usage: shots.sh [harness-user]   (page must be open as a ZZ GM: pt/c.sh open '{"user":"pgb","id":"zzGameMaster008H"}')
HERE="$(cd "$(dirname "$0")" && pwd)"
PT=${PT:-$HERE/../../pt}
U=${1:-pgb}
mkdir -p $HERE/shots
shot() { # name x y scale
  echo "globalThis.PGSHOT={x:$2,y:$3,scale:$4}; $(cat $HERE/shot-prep.js)" | $PT/e.sh $U - >/dev/null
  $PT/c.sh shot "{\"user\":\"$U\",\"file\":\"$HERE/shots/$1.png\"}" >/dev/null
}
shot whole 5000 5000 0.1
for i in $(seq 0 15); do
  c=$((i % 4)); r=$((i / 4)); id=$(printf "S%02d" $((i+1)))
  shot $id $((c*2500+1200)) $((r*2500+1200)) 0.41
done
ls $HERE/shots
