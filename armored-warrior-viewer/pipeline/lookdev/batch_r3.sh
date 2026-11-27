#!/bin/bash
# Round-3 evidence set for the painted-texture-first look. Run from the scratchpad root.
B="http://localhost:8765/work/"; O=shots/lookdev-r3
W="stage.edge:%23ffffff,stage.center:%23ffffff,stage.floor:%23ffffff,stage.contactShadow:0"
shot(){ node tools/shot.cjs --timeout 180000 "$@" 2>&1 | tail -1; }
study(){ node pipeline/lookdev/study.cjs "$@" 2>&1 | tail -1; }
# 1. A/B, standard mode, the same nine views: every layer off / tuned
shot --url "$B?plain=1" --out $O/ab-plain --size 900x1100 &
shot --url "$B" --out $O/ab-tuned --size 900x1100 &
wait
# 2. detail mode; phone viewport (whole page)
shot --url "$B" --out $O/detail --size 900x1100 --mode detail &
shot --url "$B" --out $O/mobile --size 428x926 --dpr 2 --mobile --clip page --views front,rear,side,face,chest,belt,belt-rear --orbits q34:35:82 &
wait
# 3. three frames 2 degrees apart; white-stage renders for the palette measurement
shot --url "$B" --out $O/motion --size 900x1100 --views none --orbits m0:35:82,m1:37:82,m2:39:82 &
shot --url "$B?set=$W" --out $O/white-tuned --size 900x1100 --views front,rear --orbits none &
wait
shot --url "$B?plain=1&set=$W" --out $O/white-plain --size 900x1100 --views front,rear --orbits none &
# 4. one layer at a time (cumulative)
CAMS="front:0:82:1,q34torso:35:82:2.4:0.68,r34:215:82:1"
study "$B?plain=1" $O/layers/0-plain "$CAMS" &
wait
study "$B?plain=1&keep=grade" $O/layers/1-grade "$CAMS" &
study "$B?plain=1&keep=grade,sharp" $O/layers/2-sharp "$CAMS" &
wait
study "$B?plain=1&keep=grade,sharp,form,parts" $O/layers/3-form "$CAMS" &
study "$B?plain=1&keep=grade,sharp,form,parts,sheen" $O/layers/4-sheen "$CAMS" &
wait
study "$B?plain=1&keep=grade,sharp,form,parts,sheen,glow" $O/layers/5-glow "$CAMS" &
study "$B?plain=1&keep=grade,sharp,form,parts,sheen,glow,ink" $O/layers/6-ink "$CAMS" &
wait
study "$B" $O/layers/7-finish "$CAMS" &
# 5. sharper paint: the same close views with the embedded 1280 texture, the 2048 paint, and the detail model
CLOSE="face:0:82:5.2:0.9,chest:0:82:4.2:0.72,knee:0:82:4.2:0.3"
study "$B?set=sharpPaintBelow:0" $O/paint/embedded-1280 "$CLOSE" &
wait
study "$B" $O/paint/paint-2048 "$CLOSE" &
study "$B" $O/paint/detail-2560 "$CLOSE" 900x1100 1 detail &
wait
# 6. where the painting itself is the limit (tuned and plain, same cameras)
LIM="side:90:82:1,sideTorso:90:82:2.2:0.62,sideLegs:90:82:2.2:0.3,rearCloth:180:82:2.6:0.38,rearBack:180:82:2.6:0.7,headRear:180:82:4.2:0.9,top:20:28:1.7:0.8,r34drape:215:82:2.4:0.35,underArm:60:82:3.2:0.62,shoulderRear:160:70:3.4:0.78"
study "$B" $O/limits/tuned "$LIM" &
study "$B?plain=1" $O/limits/plain "$LIM" &
wait
# 7. the finish layer on the smeared sides: off / texture blur only (what phones get) / with the brush pass
FIN="sideLegs:90:82:2.2:0.3,r34drape:215:82:2.4:0.35,rearCloth:180:82:2.6:0.38"
study "$B?set=paint.amount:0,paint.smearBlur:0" $O/finish/off "$FIN" &
study "$B?set=paint.amount:0" $O/finish/texture-blur-only "$FIN" &
wait
study "$B" $O/finish/with-brush "$FIN" &
# 8. the repaired paint, for the record
REP="sideLegs:90:82:2.2:0.3,r34drape:215:82:2.4:0.35,q34torso:35:82:2.4:0.68"
study "$B?set=repair:1" $O/repair/repair-1 "$REP" &
wait
study "$B?set=repair:0.5" $O/repair/repair-0.5 "$REP" &
study "$B" $O/repair/repair-0 "$REP" &
wait
echo BATCH_DONE
