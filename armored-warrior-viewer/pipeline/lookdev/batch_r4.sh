#!/bin/bash
# Round-4 evidence set (shadow layer, finish fixes). Run from the scratchpad root.
# One browser at a time: two at once were killed without a message when the machine was busy.
B="http://localhost:8765/work/"; O=shots/lookdev-r4
shot(){ # shot <out> <args...>; retried once if it leaves no log.json
  local out="$1"; shift
  for attempt in 1 2; do
    node tools/shot.cjs --timeout 240000 --out "$O/$out" "$@" 2>&1 | tail -1
    [ -f "$O/$out/log.json" ] && return 0
    echo "retry $out"
  done
  echo "FAILED $out"
}
# 1. the nine judge cameras, standard mode: default (armour lit L* 20) and the restrained armour (L* 15)
shot standard --url "$B" --size 900x1100
shot standard-restrained --url "$B?set=armor.lit:%23212532" --size 900x1100
# 2. the shadow mask alone, its three parts, and the shadow layer off
shot shadow-mask --url "$B?debug=9" --size 900x1100
shot shadow-parts --url "$B?debug=10" --size 900x1100
shot shadow-off --url "$B?set=shadow.amount:0" --size 900x1100
# 3. detail mode
shot detail --url "$B" --size 900x1100 --mode detail
# 4. phone viewport: whole page, the shadow mask on the phone, the restrained armour on the phone
shot mobile --url "$B" --size 428x926 --dpr 2 --mobile --clip page --views front,rear,side,face,chest,belt,belt-rear --orbits q34:35:82,rear34:215:82
shot mobile-shadow-mask --url "$B?debug=9" --size 428x926 --dpr 2 --mobile --views front,rear,chest --orbits q34:35:82
shot mobile-restrained --url "$B?set=armor.lit:%23212532" --size 428x926 --dpr 2 --mobile --clip page --views front,rear,chest --orbits q34:35:82
# 5. three frames 2 degrees apart
shot motion --url "$B" --size 900x1100 --views none --orbits m0:35:82,m1:37:82,m2:39:82
# 6. the flattening pass off; sharpening off (for the before / after of items b and c)
shot brush-off --url "$B?set=paint.amount:0" --size 900x1100 --views rear,belt-rear,chest --orbits rear34:215:82
shot sharpen-off --url "$B?set=sharpen.amount:0" --size 900x1100 --views chest,belt --orbits none
echo BATCH_DONE
