"""Class palette of a figure on a white ground (sheet or white-stage render): share, shadow/mid/light colour,
median saturation and value per class. Usage: palette.py name=path [name=path ...]"""
import sys
import numpy as np
from PIL import Image
def palette(path):
    a=np.asarray(Image.open(path).convert('RGB')).astype(float)/255
    r,g,b=a[...,0],a[...,1],a[...,2]
    mx=a.max(2); mn=a.min(2); v=mx; s=np.where(mx>0,(mx-mn)/np.maximum(mx,1e-6),0); d=np.maximum(mx-mn,1e-6)
    h=np.where(mx==r,((g-b)/d)%6,np.where(mx==g,(b-r)/d+2,(r-g)/d+4))*60
    bg=(v>0.93)&(s<0.08)
    cls={'black':(v<0.28)&(s<0.5)&~bg,'gold':(h>15)&(h<48)&(s>0.3)&(v>0.3),'blue':(h>205)&(h<262)&(s>0.35)&(v>0.3),'violet':(h>=262)&(h<300)&(s>0.25)&(v>0.3),'pink':(h>=300)&(h<350)&(s>0.2)&(v>0.4)}
    tot=(~bg).sum(); out={}
    for k,m in cls.items():
        px=a[m]
        if len(px)<50: out[k]=None; continue
        lum=px@np.array([.2126,.7152,.0722]); o=np.argsort(lum)
        pick=lambda q: '#%02x%02x%02x'%tuple(int(x*255) for x in px[o[int(q*(len(o)-1)):int(q*(len(o)-1))+1+len(o)//50]].mean(0))
        out[k]='%5.3f  %s %s %s  sat %.2f  val %.2f'%(m.sum()/tot, pick(.15), pick(.5), pick(.85), np.median(s[m]), np.median(v[m]))
    return out
rows=[(a.split('=')[0], palette(a.split('=')[1])) for a in sys.argv[1:]]
for k in ['black','gold','blue','violet','pink']:
    print(k)
    for name,p in rows: print('   %-14s %s'%(name, p[k]))
