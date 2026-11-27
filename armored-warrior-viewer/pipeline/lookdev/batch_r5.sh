#!/bin/bash
# Round-5 evidence set. Run from the scratchpad root; one browser at a time.
B="http://localhost:8765/work/"; O=shots/lookdev-r5
shot(){ local out="$1"; shift
  for attempt in 1 2; do node tools/shot.cjs --timeout 240000 --out "$O/$out" "$@" 2>&1 | grep "^shots:" | cut -c1-12; [ -f "$O/$out/log.json" ] && return 0; echo "retry $out"; done; echo "FAILED $out"; }
shot standard --url "$B" --size 900x1100
shot shadow-off --url "$B?set=shadow.amount:0" --size 900x1100
shot shadow-mask --url "$B?debug=9" --size 900x1100
shot detail --url "$B" --size 900x1100 --mode detail
shot mobile --url "$B" --size 428x926 --dpr 2 --mobile --clip page --views front,rear,side,face,chest,belt,belt-rear --orbits q34:35:82,rear34:215:82
shot mobile-shadow-off --url "$B?set=shadow.amount:0" --size 428x926 --dpr 2 --mobile --clip page --views front,rear,chest,belt-rear --orbits q34:35:82
shot motion --url "$B" --size 900x1100 --views none --orbits m0:35:82,m1:37:82,m2:39:82
node pipeline/lookdev/robust.cjs shots/lookdev-robust 2>&1 | grep -v "^PASS"
echo BATCH_DONE
