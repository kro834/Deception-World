#!/bin/bash
# Round-9 (small): torso boundary. Run from the scratchpad root; one browser at a time.
B="http://localhost:8765/work/"; O=shots/lookdev-r9
shot(){ local out="$1"; shift
  for attempt in 1 2 3; do node tools/shot.cjs --timeout 240000 --out "$O/$out" "$@" 2>&1 | grep "^shots:" | cut -c1-12; [ -f "$O/$out/log.json" ] && return 0; echo "retry $out"; done; echo "FAILED $out"; }
shot standard --url "$B" --size 900x1100
shot mask-clean --url "$B?view=3" --size 900x1100 --views front,chest --orbits q34:35:82
shot gates --url "$B?debug=2" --size 900x1100 --views front --orbits q34:35:82
shot taken --url "$B?debug=11" --size 900x1100 --views front --orbits q34:35:82
shot mobile --url "$B" --size 428x926 --dpr 2 --mobile --clip page --views front,rear,side,face,chest,belt,belt-rear --orbits q34:35:82,rear34:215:82
for k in final:"" gates:"?debug=2" taken:"?debug=11"; do shot "m-${k%%:*}" --url "$B${k#*:}" --size 428x926 --dpr 2 --mobile --views none --orbits q34:35:82; done
{ for v in front q34; do echo "== desktop $v"; python3 -I pipeline/lookdev/measure.py $O/standard/$v.png $O/gates/$v.png $O/taken/$v.png; done
  echo "== phone q34"; python3 -I pipeline/lookdev/measure.py $O/m-final/q34.png $O/m-gates/q34.png $O/m-taken/q34.png; } | tee $O/measure.txt
node pipeline/lookdev/robust.cjs shots/lookdev-robust 2>&1 | grep -v "^PASS"
python3 -I - <<'P'
from PIL import Image, ImageDraw
S="shots/"; F=S+"lookdev-r9/"
def row(out, items):
    ims=[Image.open(p).convert('RGB') for _,p in items]; h=ims[0].height
    s=Image.new('RGB',(sum(i.width for i in ims),h+18),(20,20,20)); d=ImageDraw.Draw(s); x=0
    for (l,_),i in zip(items,ims): s.paste(i,(x,18)); d.text((x+4,3),l,fill=(255,235,120)); x+=i.width
    s.save(out)
for v in ['front','q34','chest']:
    row(F+'torso-%s.png'%v,[('round 8',S+'lookdev-r8/standard/%s.png'%v),('round 9',F+'standard/%s.png'%v),('tidied mask',F+'mask-clean/%s.png'%v)])
row(F+'torso-phone-front.png',[('round 8, phone',S+'lookdev-r8/mobile/front.png'),('round 9, phone',F+'mobile/front.png')])
P
echo BATCH_DONE
