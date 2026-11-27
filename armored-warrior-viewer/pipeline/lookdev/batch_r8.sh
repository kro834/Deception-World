#!/bin/bash
# Round-8 evidence set. Run from the scratchpad root; one browser at a time.
B="http://localhost:8765/work/"; O=shots/lookdev-r8
shot(){ local out="$1"; shift
  for attempt in 1 2; do node tools/shot.cjs --timeout 240000 --out "$O/$out" "$@" 2>&1 | grep "^shots:" | cut -c1-12; [ -f "$O/$out/log.json" ] && return 0; echo "retry $out"; done; echo "FAILED $out"; }
shot standard --url "$B" --size 900x1100
shot shadow-off --url "$B?set=shadow.amount:0" --size 900x1100
shot shadow-mask --url "$B?debug=9" --size 900x1100
shot detail --url "$B" --size 900x1100 --mode detail
shot mobile --url "$B" --size 428x926 --dpr 2 --mobile --clip page --views front,rear,side,face,chest,belt,belt-rear --orbits q34:35:82,rear34:215:82
shot mobile-shadow-off --url "$B?set=shadow.amount:0" --size 428x926 --dpr 2 --mobile --clip page --views front,rear,chest,belt-rear --orbits q34:35:82
shot motion --url "$B" --size 900x1100 --views none --orbits m0:35:82,m1:37:82,m2:39:82
shot gates --url "$B?debug=2" --size 900x1100 --views front --orbits q34:35:82
shot taken --url "$B?debug=11" --size 900x1100 --views front --orbits q34:35:82
for k in final:"" gates:"?debug=2" taken:"?debug=11"; do shot "m-${k%%:*}" --url "$B${k#*:}" --size 428x926 --dpr 2 --mobile --views none --orbits q34:35:82; done
{ for v in front q34; do echo "== desktop $v"; python3 -I pipeline/lookdev/measure.py $O/standard/$v.png $O/gates/$v.png $O/taken/$v.png; done
  echo "== phone q34"; python3 -I pipeline/lookdev/measure.py $O/m-final/q34.png $O/m-gates/q34.png $O/m-taken/q34.png; } | tee $O/measure.txt
node pipeline/lookdev/robust.cjs shots/lookdev-robust 2>&1 | grep -v "^PASS"
python3 -I - <<'P'
from PIL import Image, ImageDraw
S="shots/"; F=S+"lookdev-r8/"
def row(out, items, W=2400):
    ims=[Image.open(p).convert('RGB') for _,p in items]; h=ims[0].height
    ims=[i if i.height==h else i.resize((i.width*h//i.height,h)) for i in ims]
    s=Image.new('RGB',(sum(i.width for i in ims),h+18),(20,20,20)); d=ImageDraw.Draw(s); x=0
    for (l,_),i in zip(items,ims): s.paste(i,(x,18)); d.text((x+4,3),l,fill=(255,235,120)); x+=i.width
    if s.width>W: s=s.resize((W,s.height*W//s.width))
    s.save(out)
for v in ['front','q34','side','rear34','rear','face','chest','belt','belt-rear']:
    row(F+'shadow-%s.png'%v,[('round 7',S+'lookdev-r7/standard/%s.png'%v),('round 8, shadow layer off',F+'shadow-off/%s.png'%v),('round 8',F+'standard/%s.png'%v),('mask ?debug=9',F+'shadow-mask/%s.png'%v)])
for v in ['front','q34','rear','chest','belt-rear']:
    row(F+'mobile-shadow-%s.png'%v,[('phone, shadow layer off',F+'mobile-shadow-off/%s.png'%v),('phone',F+'mobile/%s.png'%v)],1720)
P
shot mask-raw --url "$B?view=4" --size 900x1100 --views belt-rear,rear,chest,front --orbits none
shot mask-clean --url "$B?view=3" --size 900x1100 --views belt-rear,rear,chest,front --orbits none
shot m-mask-clean --url "$B?view=3" --size 428x926 --dpr 2 --mobile --views belt-rear,rear --orbits none
shot clean-off --url "$B?set=shadow.clean:0" --size 900x1100 --views belt-rear,rear,chest --orbits none
python3 -I - <<'P'
from PIL import Image, ImageDraw
S="shots/"; F=S+"lookdev-r8/"
def row(out, items, W=2400):
    ims=[Image.open(p).convert('RGB') for _,p in items]; h=ims[0].height
    ims=[i if i.height==h else i.resize((i.width*h//i.height,h)) for i in ims]
    s=Image.new('RGB',(sum(i.width for i in ims),h+18),(20,20,20)); d=ImageDraw.Draw(s); x=0
    for (l,_),i in zip(items,ims): s.paste(i,(x,18)); d.text((x+4,3),l,fill=(255,235,120)); x+=i.width
    if s.width>W: s=s.resize((W,s.height*W//s.width))
    s.save(out)
for v in ['belt-rear','rear','chest']:
    row(F+'clean-%s.png'%v,[('raw mask ?view=4',F+'mask-raw/%s.png'%v),('tidied mask ?view=3',F+'mask-clean/%s.png'%v),('picture, tidy off',F+'clean-off/%s.png'%v),('picture, round 8',F+'standard/%s.png'%v)],3200)
P
NODE_PATH=/opt/node-tools/node_modules timeout 900 node pipeline/safari/probe.cjs fbo sh-final sh-material sh-backdrop sh-brush sh-star sh-bloom noext 2>&1 | tail -40 | cut -c1-260
echo BATCH_DONE
