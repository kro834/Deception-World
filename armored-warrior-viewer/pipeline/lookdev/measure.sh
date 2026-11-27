#!/bin/bash
# measure.sh <out> <set-string or ''> : front + q34 on desktop, final / gates / taken, then the numbers
B="http://localhost:8765/work/"; O="$1"; S="$2"; q(){ [ -n "$S" ] && echo "$1set=$S"; }
for k in final:"?x=1" gates:"?debug=2" taken:"?debug=11"; do n=${k%%:*}; u=${k#*:}
  node tools/shot.cjs --timeout 240000 --out "$O/$n" --size 900x1100 --views front --orbits q34:35:82 --url "$B$u$(q '&')" 2>&1 | grep -c "^shots" >/dev/null; done
for v in front q34; do echo "== $v"; python3 -I pipeline/lookdev/measure.py "$O/final/$v.png" "$O/gates/$v.png" "$O/taken/$v.png"; done
