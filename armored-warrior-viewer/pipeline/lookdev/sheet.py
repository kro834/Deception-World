import sys
from PIL import Image
out=sys.argv[1]; files=sys.argv[2:]
ims=[Image.open(f).convert('RGB') for f in files]
h=max(i.height for i in ims); W=sum(i.width for i in ims)
s=Image.new('RGB',(W,h),(0,0,0)); x=0
for i in ims: s.paste(i,(x,0)); x+=i.width
if W>2000: s=s.resize((2000,int(h*2000/W)), Image.LANCZOS)
s.save(out); print(out, s.size)
