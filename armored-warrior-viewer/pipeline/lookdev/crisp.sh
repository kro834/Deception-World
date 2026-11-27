#!/bin/bash
# Fineness A/B at phone size (390x844, dpr 3). crisp.sh <name> <set-string or ''>
B="http://localhost:8765/work/"; O=shots/lookdev-crisp; n="$1"; S="$2"
[ -f "$O/$n/log.json" ] && exit 0
for i in 1 2 3; do node tools/shot.cjs --timeout 240000 --out "$O/$n" --size 390x844 --dpr 3 --mobile --views front,chest,face --orbits none --url "$B$([ -n "$S" ] && echo "?set=$S")" 2>&1 | grep -q "^shots" && break; done
[ -f "$O/$n/log.json" ] && python3 -I -c "
import json; d=json.load(open('$O/$n/log.json')); e=d['state']['extra']; print('$n', e.get('pixelRatio'), e.get('size'), e.get('brush'), e.get('maps',{}).get('paint'), e.get('notes'))" || echo "FAILED $n"
