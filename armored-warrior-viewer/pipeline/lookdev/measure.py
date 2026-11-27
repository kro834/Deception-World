# Median L* of gold / crystal inside and outside the shadow, and the share in shadow.
# usage: measure.py <final.png> <gates.png (?debug=2)> <taken.png (?debug=11)>
import sys, numpy as np
from PIL import Image
def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.float64)/255
def Lstar(rgb):
    lin=np.where(rgb<=0.04045, rgb/12.92, ((rgb+0.055)/1.055)**2.4)
    Y=lin@np.array([0.2126,0.7152,0.0722]); return np.where(Y>0.008856,116*np.cbrt(Y)-16,903.3*Y)
f,g,t=[load(p) for p in sys.argv[1:4]]
if f.shape!=g.shape:
    h=min(f.shape[0],g.shape[0]); f,g,t=f[:h],g[:h],t[:h]
L=Lstar(f)
for name,c in (('gold',0),('crystal',1),('armour',2)):
    gate=g[...,c]>0.6
    other=np.delete(g,c,axis=2).max(axis=2)<0.4
    m=gate&other
    sh=m&(t[...,c]>0.5); li=m&(t[...,c]<0.15)
    n=m.sum()
    print('%-8s pixels %7d  in shadow %4.0f%%  median L* lit %5.1f  shadow %5.1f'%(name,n,100*sh.sum()/max(n,1),np.median(L[li]) if li.any() else -1,np.median(L[sh]) if sh.any() else -1))
