"""Sculptural build of DOGS ARCHIVE V, directly in Blender 4.5 LTS.

Authoring coordinates are (horizontal, height, towards viewer), converted to
Blender Z-up once. All ornament, holes, teeth, membranes and the reverse surface
are geometry. The reference paintings are never used as an image plane/texture.
Run: Blender --background --python scripts/blender/dogs_guardian.py
"""
import bpy, bmesh, math, random, json, os, sys, time, struct, hashlib
from pathlib import Path
from mathutils import Vector, Quaternion
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'public/dogs-archive-20261028'
OUT = ROOT / 'output/dogs-archive'
PUBLIC.mkdir(parents=True, exist_ok=True); OUT.mkdir(parents=True, exist_ok=True)
random.seed(59731)
START = time.time()
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials): bpy.data.materials.remove(block)

def P(p): return Vector((float(p[0]), -float(p[2]), float(p[1])))
def V(p): return np.asarray(p, dtype=float)
def unit(v): return v / max(1e-9, np.linalg.norm(v))
def ease(t): return t*t*(3-2*t)
def lerp(a,b,t): return V(a)*(1-t)+V(b)*t
def empty(name, at=(0,0,0), parent=None):
    ob=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(ob)
    ob.location=P(at)
    if parent: ob.parent=parent
    ob.empty_display_size=.13
    return ob

# Explicit editable authoring hierarchy, not a flattened static mesh.
root=empty('GuardianV_Root')
root.scale=(1,1.22,1)
body=empty('BodyPivot',(0,0,0),root)
head=empty('HeadPivot',(-.48,-.08,1.02),body)
head.scale=(.82,.90,.86)
jaw=empty('JawPivot',(.0,-.47,.19),head)
mouth=empty('MouthSocket',(0,-.94,.36),head)
aim=empty('MouthAim',(0,-1.63,.90),head)
pivots=[]

def noise_field(n=768):
    yy,xx=np.mgrid[0:n,0:n]/n
    f=np.zeros((n,n),np.float32)
    rng=random.Random(601)
    for octave in range(7):
        amp=.5**octave
        for j in range(7):
            k=2**octave
            ax=rng.randint(1,3)*k; ay=rng.randint(-3,3)*k
            f+=amp*np.sin(xx*math.tau*ax+yy*math.tau*ay+rng.uniform(0,math.tau))/7
    f=(f-f.min())/(f.max()-f.min())
    # Fine ridged alligator/chitin cells plus irregular pebbled micro relief.
    gx=xx*43;gy=yy*43;ix=np.floor(gx);iy=np.floor(gy)
    best=np.full_like(gx,100);second=np.full_like(gx,100)
    for ox in (-1,0,1):
        for oy in (-1,0,1):
            cx=ix+ox;cy=iy+oy
            hx=np.mod(np.sin(cx*127.1+cy*311.7)*43758.5453,1)
            hy=np.mod(np.sin(cx*269.5+cy*183.3)*43758.5453,1)
            dist=(gx-cx-hx)**2+(gy-cy-hy)**2
            second=np.minimum(second,np.maximum(best,dist));best=np.minimum(best,dist)
    edges=np.clip((np.sqrt(second)-np.sqrt(best))*8,0,1)
    pores=np.sqrt(np.clip(best,0,1))
    wrinkle=np.sin(xx*math.tau*39+f*14+np.sin(yy*math.tau*3)*.7)
    height=f*.44+edges*.11+pores*.035+np.sin(f*39)*.025+wrinkle*.028
    return np.clip(f*.86+edges*.14,0,1),height

f,h=noise_field()
def image_data(name, rgb, path, noncolor=False):
    n=rgb.shape[0]; im=bpy.data.images.new(name,width=n,height=n,alpha=True)
    rgba=np.concatenate([rgb.astype(np.float32),np.ones((n,n,1),np.float32)],axis=2)
    if noncolor: im.colorspace_settings.name='Non-Color'
    im.pixels.foreach_set(rgba.ravel()); im.filepath_raw=str(path); im.file_format='PNG'
    im.save(); im.pack(); return im

texdir=PUBLIC/'textures'; texdir.mkdir(exist_ok=True)
shade=np.clip(f*.85+.12,0,1)
patch=np.clip((f-.43)*3.8,0,1)
skinrgb=np.stack([.027+shade*.042+patch*.060,.064+shade*.105+patch*.125,.038+shade*.063+patch*.077],axis=2)
skintex=image_data('Wet forest-green cellular skin',skinrgb,texdir/'guardian-skin.png')
bonergb=np.stack([.067+shade**2*.34,.14+shade**1.4*.38,.082+shade**1.8*.27],axis=2)
bonetex=image_data('Mottled ancient bone',bonergb,texdir/'guardian-bone.png')
dx=(np.roll(h,1,1)-np.roll(h,-1,1))*3.2
dy=(np.roll(h,1,0)-np.roll(h,-1,0))*3.2
normal=np.stack([dx,dy,np.ones_like(dx)],axis=2); normal/=np.linalg.norm(normal,axis=2)[:,:,None]
normaltex=image_data('Sculpted cellular micro normal',normal*.5+.5,texdir/'guardian-normal.png',True)

def mat(name,color,metal=.1,rough=.38,texture=None,emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    ns=m.node_tree.nodes; bs=ns.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metal; bs.inputs['Roughness'].default_value=rough
    bs.inputs['Coat Weight'].default_value=.025 if 'Skin' in name else .015
    bs.inputs['Coat Roughness'].default_value=.22
    if texture:
        tx=ns.new('ShaderNodeTexImage'); tx.image=texture
        m.node_tree.links.new(tx.outputs['Color'],bs.inputs['Base Color'])
        nt=ns.new('ShaderNodeTexImage'); nt.image=normaltex
        no=ns.new('ShaderNodeNormalMap'); no.inputs['Strength'].default_value=.62
        m.node_tree.links.new(nt.outputs['Color'],no.inputs['Color']); m.node_tree.links.new(no.outputs['Normal'],bs.inputs['Normal'])
    if emission:
        bs.inputs['Emission Color'].default_value=(*color,1); bs.inputs['Emission Strength'].default_value=emission
    return m

mats=[mat('Skin | abyssal wet malachite',(.018,.065,.037),.015,.61,skintex),
      mat('Bone | weathered green ivory',(.25,.47,.32),.015,.68,bonetex),
      mat('Furrows | deep living shadow',(.003,.013,.009),.12,.36),
      mat('Rune | woven forest light',(.10,.70,.27),.05,.32,None,2.7),
      mat('Ridge | old dark bronze-green',(.055,.12,.071),.025,.64,skintex),
      mat('Ember | recessed spiral glow',(.035,.31,.09),.04,.48,None,1.5),
      mat('Teeth | translucent pale green',(.43,.67,.43),.08,.34)]

class Batch:
    def __init__(self,name,parent): self.name=name; self.parent=parent; self.v=[]; self.f=[]; self.uv=[]; self.mi=[]
    def tube(self,pts,widths,depths=None,mi=0,sides=10,twist=0,detail=.035):
        pts=np.asarray(pts,float); n=len(pts)
        if np.isscalar(widths): widths=np.full(n,widths)
        if depths is None: depths=widths
        if np.isscalar(depths): depths=np.full(n,depths)
        start=len(self.v); distance=0
        for i,p in enumerate(pts):
            tangent=unit(pts[min(n-1,i+1)]-pts[max(0,i-1)])
            side=unit(np.cross(tangent,V((0,0,1))))
            if np.linalg.norm(side)<.1: side=V((1,0,0))
            norm=unit(np.cross(side,tangent))
            if i: distance+=np.linalg.norm(pts[i]-pts[i-1])
            for j in range(sides):
                a=j*math.tau/sides+twist
                # Subtle hand-shaped asymmetry at every section, not perfect lathe rings.
                w=widths[i]*(1+detail*math.sin(i*1.731+j*2.62)+.025*math.sin(i*.47))
                d=depths[i]*(1+detail*.8*math.cos(i*1.153+j*1.38))
                pp=p+side*(math.cos(a)*w)+norm*(math.sin(a)*d)
                self.v.append(tuple(P(pp))); self.uv.append((j/sides*2,distance*1.3))
        for i in range(n-1):
            for j in range(sides):
                a=start+i*sides+j; b=start+i*sides+(j+1)%sides
                self.f.append((a,a+sides,b+sides,b)); self.mi.append(mi)
        self.f.append(tuple(start+j for j in range(sides))); self.mi.append(mi)
        self.f.append(tuple(start+(n-1)*sides+j for j in reversed(range(sides)))); self.mi.append(mi)
    def finish(self):
        if not self.v:return None
        mesh=bpy.data.meshes.new(self.name+'_sculpt'); mesh.from_pydata(self.v,[],self.f); mesh.update()
        ob=bpy.data.objects.new(self.name,mesh); bpy.context.collection.objects.link(ob); ob.parent=self.parent
        for m in mats:mesh.materials.append(m)
        for p,i in zip(mesh.polygons,self.mi):p.material_index=i; p.use_smooth=True
        uv=mesh.uv_layers.new(name='SculptUV')
        for p in mesh.polygons:
            for li in p.loop_indices:uv.data[li].uv=self.uv[mesh.loops[li].vertex_index]
        return ob

def catmull(control, steps=12):
    cs=[V(p) for p in control]; result=[]
    for i in range(len(cs)-1):
        p0=cs[max(0,i-1)];p1=cs[i];p2=cs[i+1];p3=cs[min(len(cs)-1,i+2)]
        for j in range(steps):
            t=j/steps
            result.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    result.append(cs[-1]); return np.asarray(result)

def horn(batch,controls,radius,mi=1,flatten=.7,steps=8):
    path=catmull(controls,steps); t=np.linspace(0,1,len(path))
    w=radius*(1-t)**.8+.001
    batch.tube(path,w,w*flatten,mi,sides=8,detail=.05)

def hook(batch,p,tangent,side,scale,mi=1,forward=1):
    p=V(p);s=V(side);t=V(tangent)*forward
    pts=[p,p+s*scale*.4+t*scale*.12,p+s*scale*.83+t*scale*.04,
         p+s*scale*.93-t*scale*.25,p+s*scale*.74-t*scale*.36]
    horn(batch,pts,scale*.17,mi,.8,4)

def ellipsoid(batch,center,scale,mi=0,res=40,rings=28,organic=.1,recess=None):
    c=V(center);s=V(scale); base=len(batch.v)
    batch.v.append(tuple(P(c+V((0,-s[1],0)))));batch.uv.append((.5,0))
    for i in range(1,rings):
        ph=-math.pi/2+math.pi*i/rings
        for j in range(res):
            th=math.tau*j/res
            wav=1+organic*math.cos(ph)**2.5*(.4*math.sin(th*5+ph*3)+.25*math.cos(th*9-ph*6)+.18*math.sin(th*17+ph*11))
            p=c+V((math.cos(ph)*math.cos(th)*s[0],math.sin(ph)*s[1],math.cos(ph)*math.sin(th)*s[2]))*wav
            if recess and p[2]>c[2]:
                rx,ry,rad,deep=recess
                dist=(p[0]-rx)**2+(p[1]-ry)**2
                p[2]-=deep*math.exp(-dist/(rad*rad))*max(0,(p[2]-c[2])/s[2])**.6
            batch.v.append(tuple(P(p)));batch.uv.append((j/res*3,i/rings*3))
    top=len(batch.v);batch.v.append(tuple(P(c+V((0,s[1],0)))));batch.uv.append((.5,3))
    for j in range(res):
        batch.f.append((base,base+1+j,base+1+(j+1)%res));batch.mi.append(mi)
    for i in range(rings-2):
        for j in range(res):
            a=base+1+i*res+j;b=base+1+i*res+(j+1)%res
            batch.f.append((a,a+res,b+res,b));batch.mi.append(mi)
    for j in range(res):
        a=base+1+(rings-2)*res+j;b=base+1+(rings-2)*res+(j+1)%res
        batch.f.append((a,top,b));batch.mi.append(mi)

# The torso is an irregular three-dimensional husk, covered by layered ribs;
# the ellipsoidal masses remain deep beneath the pierced carved exoskeleton.
torso=Batch('Torso | irregular living carapace',body)
ellipsoid(torso,(.24,.90,-.14),(1.03,1.65,.70),0,56,36,.18)
ellipsoid(torso,(1.00,1.68,.07),(1.10,1.19,.69),0,72,48,.19,recess=(1.11,1.81,.42,.34))
ellipsoid(torso,(-.38,.49,.18),(.73,1.00,.68),0,44,28,.15)
torso.finish()

# Continuous crooked dorsal ridge and its independently curved ribs wrap 360°.
ribs=Batch('Carapace | interlocking pierced rib network',body)
for k in range(25):
    yy=-.45+k*.119
    width=.85*max(.25,1-((yy-.95)/1.88)**2)**.5
    phase=k*.83
    # A broad horseshoe rib travels around the rear, not only the visible front.
    pts=[]
    for j in range(35):
        a=-.1+(math.tau-.32)*j/34
        pts.append((.15+math.cos(a)*width,yy+.075*math.sin(a*3+phase),-.08+math.sin(a)*(.63+.07*math.sin(phase))))
    w=np.array([.037+.015*math.sin(j*.7+phase)**2 for j in range(len(pts))])
    ribs.tube(pts,w,w*.7,1,8)
    for side in (-1,1):
        p=(.15+side*width*.97,yy,.05)
        horn(ribs,[p,(p[0]+side*.16,yy+.10,.13),(p[0]+side*.28,yy+.17,.06),(p[0]+side*.26,yy+.21,.01)],.035,1,.7,3)
spine=catmull([(.3,-1.15,-.55),(.15,-.35,-.78),(.20,.75,-.84),(.5,1.8,-.67),(.72,2.7,-.30)],14)
ribs.tube(spine,.085,.055,4,10)
for i in range(3,len(spine)-2,3):
    p=spine[i]
    horn(ribs,[p,p+V((.03,.05,-.15)),p+V((.08,.16,-.25))],.06,1,.6,4)
# The shoulder's lateral surface is a resolved living shell with dark raised
# lamellae that bend over the depth, joining front and reverse carvings.
for k in range(17):
    t=-.88+k*.106;yy=1.68+t*1.19;rad=math.sqrt(max(.05,1-t*t))
    pts=[]
    for j in range(33):
        a=-1.05+j/32*2.1
        pts.append((1.0+math.cos(a)*(1.10*rad+.018),yy+.045*math.sin(a*4+k*.7),.07+math.sin(a)*(.69*rad+.022)))
    widths=np.array([.022+.012*math.sin(j*.32+k)**2 for j in range(len(pts))])
    ribs.tube(pts,widths,widths*.65,1 if k%4==0 else 4,8)
    if k%3==0:
        for j in (6,14,23):
            p=V(pts[j]);q=p+V((.018,.08,.04*math.sin(j)))
            horn(ribs,[p,q,q+V((-.015,.13,.028))],.025,1,.55,4)
ribs.finish()

def spiral_shell(name,center,rx,ry,turns,phase,front=1,skew=.15):
    b=Batch(name,body);c=V(center)
    rng=random.Random(sum(ord(x) for x in name))
    depthamp=min(.28,rx*.25)
    # Three offset, asymmetrical spiral shells, no rings or tori.
    n=int(turns*124);ts=np.linspace(0,1,n)
    pts=[]; widths=[]
    for t in ts:
        a=phase+t*math.tau*turns
        r=(.99*(1-t)**1.15+.025)*(1+.018*math.sin(a*2+.5)+.009*math.sin(a*5-.2))
        relief=(.045*math.sin(a*2+.3)*r+depthamp*(1.2*r-.65*(1-r))+.085*rx*math.sin(a*.65+.4)*r**.6) if front>0 else (.07*math.sin(a*2+.3)*r+.20*(1-r))
        # Keep the great shoulder spiral's entrance from masking its recessed
        # core. Only the first outer turn is narrowed/recessed; the uneven
        # inner flow bundles and interrupted exposed rims remain unchanged.
        outer_factor=1.0
        if name.startswith('Volute I |'):
            outer_factor=.55+.45*ease(min(1,max(0,(t*turns-.85)/.35)))
            if relief>0:relief*=outer_factor
        q=V((math.cos(a)*rx*r*(1+.025*math.sin(a*2.7))+.10*rx*math.sin(a*.47+1)*r**.4,
             math.sin(a)*ry*r+.075*ry*math.cos(a*.53)*r**.4,
             front*(relief-.14*(1-ease(min(1,t/.07))))))
        q[0]+=skew*q[1]
        bundle=.55+.65*(.5+.5*math.sin(t*math.tau*2.7-.4))
        pts.append(c+q);widths.append((.018+.095*r)*bundle*(1+.16*math.sin(a*1.6))*(.28+.72*ease(min(1,t/.055)))*outer_factor)
    pts=np.asarray(pts);widths=np.asarray(widths)
    b.tube(pts,widths,widths*(.55+.20*np.sin(ts*math.tau*2+.8)),0,12,detail=.065)
    # Irregular raised ivory edge and shadow channel run the complete shell.
    tangent=np.gradient(pts,axis=0)
    side=np.cross(tangent,np.tile(V((0,0,front)),(n,1)));side/=np.maximum(1e-8,np.linalg.norm(side,axis=1))[:,None]
    for sign in (-1,1):
        edge=pts+side*widths[:,None]*sign*.73+V((0,0,front*.048))
        # Weathered exposed edge survives over only about one third of the
        # path. The remaining boundary is the dark flesh surface itself.
        spans=[(.025,.065),(.145,.19),(.275,.315),(.405,.45),(.55,.59),(.69,.73),(.815,.85),(.93,.965)]
        for lo,hi in spans:
            shift=.019 if sign<0 else 0
            a=max(0,int((lo+shift)*n));z=min(n,int((hi+shift)*n))
            if z-a>2:b.tube(edge[a:z],widths[a:z]*(.13+.08*np.sin(ts[a:z]*103)**2),widths[a:z]*.09,1,7)
    # Hundreds of curled crenellations create the saw-toothed inner edges.
    for i in range(2,n-3,2):
        if rng.random()<.19:continue
        t=ts[i];s=side[i];tn=unit(tangent[i]);r=1-t
        # Feather layers turn inward and fill the inter-coil space. Their
        # flattened irregular blades are the shell itself, not surface hooks.
        s=unit(-s+V((0,0,-front*depthamp*.9)))
        p=pts[i]+s*widths[i]*.50+V((0,0,front*.04))
        sc=(.027+.15*r)*(1+.23*math.sin(i*.87))*rng.uniform(.68,1.34)
        forward=1 if rng.random()>.16 else -1;tn=tn*forward
        feather=catmull([p,p+s*sc*.55+tn*sc*.12,p+s*sc*1.08-tn*sc*.25,p+s*sc*.77-tn*sc*.79],4)
        ft=np.linspace(0,1,len(feather));fw=sc*(.10+.25*np.sin(ft*math.pi)**.65)*(1-ft)**.45+.0015
        b.tube(feather,fw,fw*.19+.002,1,7)
        if rng.random()<.34:
            q=p+s*sc*.55
            horn(b,[q,q+s*sc*.35+tn*sc*.33,q+s*sc*.18+tn*sc*.61],sc*.15,1,.23,3)
        if i%6==2:
            # Transverse structural ridge follows the body volume.
            p0=pts[i]-s*widths[i]*.75
            b.tube([p0,p0+s*widths[i]*.7+V((0,0,front*.09)),p0+s*widths[i]*1.5],[.011,.02,.009],None,4,6)
    # Small connected, truly perforated bone laminae sit in irregular clusters
    # between the inner feather layers and adjacent coil; front/back faces and
    # hole walls are all present. This creates a continuous porous shell.
    for i in range(9,n-10,7):
        t=ts[i];a=phase+t*math.tau*turns
        if math.sin(a*1.3+.8)<-.38 or t>.88:continue
        tn=unit(tangent[i]);ss=unit(-side[i]+V((0,0,-front*depthamp*.9)));normal=unit(np.cross(tn,ss))*front
        long=.035+.024*(1-t);wide=(.065+.065*(1-t))*(3.65/turns)
        center=pts[i]+ss*(widths[i]+wide*.51)+V((0,0,front*.025))
        start=len(b.v);nr=16
        for depth in (-1,1):
            for boundary in (0,1):
                for j in range(nr):
                    aa=j*math.tau/nr
                    fac=(1 if boundary==0 else .40+.07*math.sin(aa*3+i))
                    xx=math.cos(aa)*long*fac*(1+.12*math.sin(aa*4+i))
                    yy=math.sin(aa)*wide*fac*(1+.13*math.sin(aa*3+i*.3))
                    pp=center+tn*xx+ss*yy+normal*depth*.008
                    b.v.append(tuple(P(pp)));b.uv.append((xx*5+t*3,yy*5))
        for j in range(nr):
            nj=(j+1)%nr
            faces=[(start+j,start+nr+j,start+nr+nj,start+nj),
                   (start+2*nr+j,start+2*nr+nj,start+3*nr+nj,start+3*nr+j),
                   (start+j,start+nj,start+2*nr+nj,start+2*nr+j),
                   (start+nr+j,start+3*nr+j,start+3*nr+nj,start+nr+nj)]
            for face in faces:b.f.append(face);b.mi.append(1)
    # Not a luminous bullseye: a narrow recessed coil with a dark center.
    for lo,hi in [(.64,.685),(.765,.81),(.895,.94),(.976,1.0)]:
        inside=pts[int(n*lo):max(int(n*lo)+3,int(n*hi))]+V((0,0,front*.105))
        b.tube(inside,.009,.007,5,6)
    b.finish()

spiral_shell('Volute I | great unequal shoulder coil',(1.11,1.81,.72),1.22,1.12,4.65,.30,1,.06)
spiral_shell('Volute II | crooked thoracic whirl',(-.28,1.30,.84),.69,.76,3.95,2.4,1,-.13)
spiral_shell('Volute III | neck-root whirl',(-.62,.50,1.06),.38,.46,3.15,.4,1,.16)
# Smaller, organically embedded reverse whorls ensure a resolved rear sculpture.
spiral_shell('Reverse volute | dorsal shoulder',(.63,1.66,-.72),.74,.97,2.45,.8,-1,-.15)
spiral_shell('Reverse volute | sacral coil',(-.25,-.02,-.65),.51,.65,2.2,2.3,-1,.2)

# Fronds have a broad ridged center with curled finger-ribs. Empty spaces between
# the ribs are real open holes; both faces have a finished sculptural edge.
def frond(idx,control,width=.22,wing=.25,skin=0,serration=True):
    rng=random.Random(5819+idx*239)
    anchor=V(control[0]); pivot=empty('TentaclePivot_%02d'%idx,anchor,body);pivots.append(pivot)
    pts=catmull([V(p)-anchor for p in control],13)
    b=Batch('Frond %02d | pierced hooked fan'%idx,pivot)
    n=len(pts);tt=np.linspace(0,1,n)
    widths=width*(.36+.64*np.sin(math.pi*np.minimum(tt/.95,1))**.58)*(1-tt)**.43*(1+.12*np.sin(tt*27+.5))+.003
    depths=widths*(.53+.15*np.sin(tt*6))
    b.tube(pts,widths,depths,skin,12,detail=.075)
    tang=np.gradient(pts,axis=0);sides=np.cross(tang,np.tile(V((0,0,1)),(n,1)))
    sides/=np.maximum(1e-6,np.linalg.norm(sides,axis=1))[:,None]
    # Two offset fine ridges eliminate the smooth hose appearance.
    for s in [-1,1]:
        edge=pts+sides*widths[:,None]*s*.83+V((0,0,.026))
        webwidth=widths*(.28+.10*np.sin(tt*37+s*.4)**2)
        # Unequal dark breaks interrupt the pale border into eroded local patches.
        cut=n//6
        for seg in range(6):
            lo=max(0,seg*cut-1);hi=n if seg==5 else (seg+1)*cut+1
            b.tube(edge[lo:hi],webwidth[lo:hi],widths[lo:hi]*.12,4 if (seg+idx)%5==0 else 1,8)
    for i in range(3,n-4,3):
        t=tt[i];p=pts[i];tn=unit(tang[i]);side=sides[i]
        sc=wing*(.34+.66*math.sin(math.pi*t)**.65)*(1-t)**.35
        if serration:
            for sg in (-1,1):
                if rng.random()<.24:continue
                # Open curled lobes carve a perforated silhouette, unevenly spaced.
                pp=p+side*widths[i]*.89*sg
                size=sc*(1+.24*math.sin(i*.68+sg))*rng.uniform(.60,1.38)
                forward=-1 if (i//12+idx)%4==0 else 1
                if rng.random()<.46:
                    hook(b,pp,tn,side*sg,size,1,forward)
                else:
                    ttan=tn*forward;ss=side*sg
                    horn(b,[pp,pp+ss*size*.6+ttan*size*.15,pp+ss*size*.9-ttan*size*.24,pp+ss*size*.66-ttan*size*.67],size*.29,1,.43,3)
                    if rng.random()<.6:
                        q=pp+ss*size*.42
                        horn(b,[q,q+ss*size*.3+ttan*size*.24,q+ss*size*.1+ttan*size*.50],size*.16,1,.5,3)
                # Broader bridges occur only in clusters, creating nested little
                # membranes and negative spaces rather than repeated ornaments.
                if i%15==3 and i+5<n:
                    q=pts[i+5]+sides[i+5]*widths[i+5]*sg*.9
                    mid=(pp+q)*.5+side*sg*size*.35
                    b.tube(catmull([pp,mid,q],4),size*.21,size*.075,1,7)
        if i%6==3:
            cross=[p-side*widths[i]*.86,p+V((0,0,depths[i]*.96)),p+side*widths[i]*.86]
            b.tube(cross,[.012,.018,.009],None,4,6)
    # Small wet scale nodules alternate along the root rather than floating.
    for i in range(4,int(n*.65),5):
        p=pts[i]+V((0,0,depths[i]*.85))
        horn(b,[p,p+V((.015,.04,.025)),p+V((.01,.07,0))],widths[i]*.28,4,.55,3)
    b.finish(); return pivot

fronds=[
    # Upright perforated fans, each with a different backward spiral.
    ([(-.25,1.15,.15),(-1.15,1.65,-.20),(-1.73,2.54,-.70),(-1.78,3.02,-.60),(-1.52,3.24,-.42),(-1.29,3.01,-.20),(-1.45,2.85,-.10)],.21,.23),
    ([(-.15,1.28,.03),(-.62,2.14,.26),(-.89,3.10,.68),(-.66,3.43,.79),(-.41,3.32,.91),(-.44,3.09,.96)],.20,.20),
    ([(.31,1.55,-.15),(.13,2.49,-.42),(.10,3.29,-.90),(.38,3.57,-.84),(.62,3.40,-.64),(.47,3.16,-.39)],.19,.19),
    ([(.91,1.61,-.15),(1.51,2.48,-.22),(1.80,3.04,-.10),(2.10,3.29,.04),(2.29,3.58,.15)],.14,.15),
    # Powerful left sweep; asymmetric hanging scrolls on the opposite side.
    ([(-.38,.96,.03),(-1.49,1.64,.34),(-2.19,2.08,.89),(-2.63,1.85,1.25),(-2.66,1.44,1.40),(-2.31,1.30,1.48),(-2.11,1.52,1.37),(-2.29,1.69,1.21)],.27,.26),
    ([(1.02,1.16,.10),(1.97,1.37,-.27),(2.57,.94,-.52),(2.49,.21,-.28),(2.05,-.28,.29),(1.69,-.20,.67),(1.64,.10,.96),(1.86,.27,1.14),(2.01,.10,1.22)],.32,.30),
    ([(-.63,.49,.12),(-1.41,.55,-.15),(-1.86,-.18,-.55),(-2.12,-1.15,-.30),(-2.50,-1.54,.02),(-2.81,-1.22,.48),(-2.69,-.87,.89),(-2.43,-.90,1.02),(-2.40,-1.11,.96)],.31,.26),
    ([(.66,.42,.16),(1.26,-.27,.27),(1.45,-1.03,.37),(1.91,-1.40,.48),(2.31,-1.24,.57),(2.36,-.87,.61),(2.04,-.73,.67),(1.89,-.97,.72),(2.07,-1.08,.75)],.28,.27),
    ([(-.29,-.24,.03),(-.84,-1.10,-.01),(-.65,-1.92,.11),(-.92,-2.48,.19),(-.81,-2.86,.25),(-.56,-3.08,.33)],.17,.21),
    ([(.39,-.35,-.10),(1.14,-1.11,-.05),(1.79,-1.58,.10),(1.98,-2.12,.22),(1.64,-2.57,.37),(1.29,-2.43,.46),(1.32,-2.12,.55),(1.50,-2.10,.62)],.27,.19),
    # A long central undulating tail with porous fins.
    ([(.10,-.50,-.12),(.04,-1.09,-.02),(.36,-1.58,.14),(.27,-2.13,.29),(-.05,-2.64,.36),(-.24,-3.08,.32),(-.12,-3.36,.27)],.18,.22),
    # These heavy rear fronds provide actual depth and rear silhouette.
    ([(-.15,.98,-.44),(-1.12,1.32,-.71),(-1.70,.91,-.93),(-1.91,.18,-1.02),(-1.62,-.22,-.92),(-1.25,-.02,-.85),(-1.40,.25,-.72)],.23,.20),
    ([(.79,.83,-.48),(1.56,.61,-.78),(1.98,-.22,-.95),(1.76,-.79,-.85),(1.32,-.78,-.76),(1.17,-.45,-.65),(1.42,-.30,-.59)],.22,.20),
]
for idx,(controls,w,wing) in enumerate(fronds): frond(idx,controls,w,wing)

# Thin skeletal bridges make the visible fan a connected exoskeleton, without
# filling its long negative-space windows. These are modelled on both sides.
fans=Batch('Fan webs | branching struts around true apertures',body)
def aperture(batch, cx, cy, rx, ry, side, z, hole=.64,phase=0,material=1):
    # Solid thickness annulus mapped to the curved fan surface. The central
    # black slit is an actual open aperture, not a painted dark oval.
    start=len(batch.v);count=40
    for layer in (-1,1):
        for boundary in (0,1):
            for j in range(count):
                a=math.tau*j/count
                co=math.cos(a);si=math.sin(a)
                if boundary==0:
                    dx=rx*math.copysign(abs(co)**.55,co)*(1+.035*math.sin(a*7+phase))
                    dy=ry*math.copysign(abs(si)**.65,si)*(1+.10*math.sin(a*5+phase))
                else:
                    dx=rx*hole*co*(1+.06*math.sin(a*3+phase))
                    dy=ry*.52*si*(1+.21*math.sin(a*4+.7))
                x=cx+dx;y=cy+dy+.32*(dx/rx)+.11*(dx/rx)**2
                zz=z-.14*(dx/rx)**2+layer*.023
                batch.v.append(tuple(P((side*x,y,zz))));batch.uv.append((x*1.8,y*1.8))
    for j in range(count):
        n=(j+1)%count
        for face in [(start+j,start+n,start+count+n,start+count+j),
                     (start+2*count+j,start+3*count+j,start+3*count+n,start+2*count+n),
                     (start+j,start+2*count+j,start+2*count+n,start+n),
                     (start+count+j,start+count+n,start+3*count+n,start+3*count+j)]:
            batch.f.append(face if side==1 else tuple(reversed(face)));batch.mi.append(material)

for s in (-1,1):
    for i in range(16):
        y=-.58+i*.145; angle=.3+i*.15
        start=V((s*(.59+.08*math.sin(i)),y,.42))
        end=V((s*(1.38+.17*math.sin(angle*2)),y+.36+.16*math.cos(i),.40+.13*math.sin(angle)))
        pts=catmull([start,start+V((s*.32,.15,.12)),end,end+V((s*.10,.14,.02))],5)
        ws=np.linspace(.075,.024,len(pts))*(1+.15*np.sin(np.linspace(0,13,len(pts))+i))
        fans.tube(pts,ws,ws*.65,1,8)
        hook(fans,pts[-3],unit(pts[-1]-pts[-5]),V((-s,0,0)),.16,1)
    # Overlapping carved panels form the broad sieve-like scapular membrane.
    # Every slit is elongated, bent, and different in length and taper.
    for i in range(11):
        y=-.62+i*.185
        rx=.50+.13*math.sin((i+1)/12*math.pi)
        cx=.96+.075*math.sin(i*.6)
        z=.64+.065*math.sin(i*.43+s)
        aperture(fans,cx,y,rx,.13+.02*math.sin(i*.9),s,z,.68+.04*math.sin(i),i*.7)
        # Raised uneven root over the intersection of neighboring panels.
        p=V((s*(cx-rx*.84),y-.20,z+.01))
        horn(fans,[p,p+V((s*.06,.11,.035)),p+V((s*.09,.20,.015))],.052,1,.5,4)
# Those support filaments sit behind a continuous hollow carapace sheet.
fans.finish()

def pierced_plate(side):
    plate_batch=Batch(('Right' if side>0 else 'Left')+' | single thick fenestrated scapular plate',body)
    center=(side*.98,.45,.62)
    ellipsoid(plate_batch,center,(.72,1.20,.30),1,64,48,.18)
    plate=plate_batch.finish()
    cuts=Batch('Temporary aperture carving tools',body)
    # Each cutter is a closed skewed elliptical prism, all through the complete
    # thickness. They are applied to the actual bone mass by exact booleans.
    for k in range(10):
        yy=-.38+k*.18+.025*math.sin(k*1.8);cx=side*(.97+.09*math.sin(k*.9))
        rx=.26+.24*math.sin((k+1)/11*math.pi)
        ry=.040+.032*(.5+.5*math.sin(k*1.7))
        start=len(cuts.v);ns=36
        for z in (-.15,1.3):
            for j in range(ns):
                a=math.tau*j/ns;dx=rx*math.cos(a);dy=ry*math.sin(a)
                p=(cx+side*dx,yy+dy+.22*math.sin(dx/rx*1.7)+.036*math.sin(dx/rx*3+k*.7),z)
                cuts.v.append(tuple(P(p)));cuts.uv.append((0,0))
        for j in range(ns):
            nex=(j+1)%ns;cuts.f.append((start+j,start+nex,start+ns+nex,start+ns+j));cuts.mi.append(1)
        cuts.f.append(tuple(start+j for j in reversed(range(ns))));cuts.mi.append(1)
        cuts.f.append(tuple(start+ns+j for j in range(ns)));cuts.mi.append(1)
    # Semicircular exterior bites leave irregular carved fingers, not an oval
    # radiator grille. Their spacing, radius and depth are deliberately unequal.
    for k in range(8):
        yy=-.34+k*.235;cx=side*(1.65+.045*math.sin(k*.6));rad=.09+.06*(.5+.5*math.sin(k*2.1))
        start=len(cuts.v);ns=24
        for z in (-.15,1.3):
            for j in range(ns):
                a=math.tau*j/ns
                cuts.v.append(tuple(P((cx+side*rad*math.cos(a),yy+rad*.8*math.sin(a),z))));cuts.uv.append((0,0))
        for j in range(ns):
            nex=(j+1)%ns;cuts.f.append((start+j,start+nex,start+ns+nex,start+ns+j));cuts.mi.append(1)
        cuts.f.append(tuple(start+j for j in reversed(range(ns))));cuts.mi.append(1)
        cuts.f.append(tuple(start+ns+j for j in range(ns)));cuts.mi.append(1)
    if side<0:cuts.f=[tuple(reversed(f)) for f in cuts.f]
    cutter=cuts.finish();bpy.context.view_layer.objects.active=plate
    for obj in [plate,cutter]:
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data);bm.free();obj.data.update()
    mod=plate.modifiers.new('Carved through-bone apertures','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;mod.use_self=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    assert len(plate.data.polygons)>100,'Boolean plate must remain a closed carved volume'
    bpy.data.objects.remove(cutter,do_unlink=True)
    bevel=plate.modifiers.new('Soft worn cut edges','BEVEL');bevel.width=.018;bevel.segments=2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for face in plate.data.polygons:face.use_smooth=True
    return plate
pierced_plate(1);pierced_plate(-1)

# Spear-shaped upper head. Its raised faceted shield is sculpted, with a real
# hollow open lower face and separate hinged mandible; no eyeball shortcuts.
hb=Batch('Head | tapered horned cuirass',head)
profile_base=[(.36,.60,.00),(.45,.40,.03),(.43,.18,.13),(.36,-.10,.25),(.27,-.42,.40),(.12,-.73,.49),(.009,-.91,.46)]
profile=[]
for i in range(len(profile_base)-1):
    for t in np.linspace(0,1,6,endpoint=False):profile.append(tuple(lerp(profile_base[i],profile_base[i+1],t)))
profile.append(profile_base[-1])
verts=[];ringn=24
for k,(width,y,depth) in enumerate(profile):
    for j in range(ringn):
        a=math.tau*j/ringn
        # Front shield peaked along a sharp central ridge.
        x=math.cos(a)*width
        z=depth+math.sin(a)*(.25+width*.35)
        verts.append((x,y,z))
base=len(hb.v)
for k,p in enumerate(verts):hb.v.append(tuple(P(p)));hb.uv.append(((k%ringn)/ringn*2,(k//ringn)/len(profile)*2))
for k in range(len(profile)-1):
    for j in range(ringn):
        a=base+k*ringn+j;b=base+k*ringn+(j+1)%ringn
        hb.f.append((a,b,b+ringn,a+ringn));hb.mi.append(0)
hb.f.append(tuple(base+j for j in reversed(range(ringn))));hb.mi.append(0)
hb.f.append(tuple(base+(len(profile)-1)*ringn+j for j in range(ringn)));hb.mi.append(1)

# Four deeply recurved horns fan from the cheek plane. Their inner lines carry
# tiny pale teeth, while the outer body remains black and materially thick.
horn_defs=[
    ([(-.30,-.37,.20),(-.61,-.14,.24),(-.79,.31,.23),(-.84,.76,.17),(-.73,1.07,.10)],.075),
    ([(.30,-.37,.20),(.60,-.02,.18),(.76,.42,.17),(.71,.81,.09),(.55,1.07,.02)],.085),
    ([(-.22,-.62,.27),(-.63,-.55,.31),(-1.02,-.36,.25),(-1.30,-.03,.18),(-1.40,.18,.10)],.065),
    ([(.22,-.62,.27),(.62,-.58,.28),(1.04,-.38,.23),(1.24,-.02,.12),(1.29,.20,.01)],.072)]
for ctr,r in horn_defs:
    path=catmull(ctr,12);t=np.linspace(0,1,len(path));w=r*(1-t)**.75+.002
    hb.tube(path,w,w*.66,0,12,detail=.025)
    inward=1 if ctr[0][0]<0 else -1
    rim=path+V((inward*.018,0,.048));hb.tube(rim,w*.14,w*.12,1,6)
    for i in range(4,len(path)-5,3):
        p=path[i]+V((inward*w[i]*.75,0,.025))
        horn(hb,[p,p+V((inward*.037,.006,.016)),p+V((inward*.043,-.026,.012))],.016*(1-t[i])+.005,6,.8,3)
# Skull's brow ridge rises into a small third neck spiral.
for side in (-1,1):
    pts=catmull([(side*.32,.44,.16),(side*.38,.12,.29),(side*.25,-.34,.49),(side*.065,-.80,.51)],12)
    hb.tube(pts,.019,.012,1,7)
hb.finish()

# The intricate network is raised luminous geometry conforming to the convex
# face, never a flat decal. Its diamond spacing closes towards the pointed snout.
net=Batch('Head | interlaced luminous diamond lattice',head)
def face_point(t,x):
    y=.43-1.32*t
    ordered=list(reversed(profile_base))
    width=np.interp(y,[v[1] for v in ordered],[v[0] for v in ordered])
    center=np.interp(y,[v[1] for v in ordered],[v[2] for v in ordered])
    xx=x*width
    z=center+(.25+width*.35)*math.sqrt(max(0,1-x*x))+.012
    return V((xx,y,z))
for family in (-1,1):
    for j in range(-4,5):
        pts=[]
        for k in range(101):
            t=k/100;x=j*.27*(1-t)**.38+family*.75*math.sin(math.pi*t)
            if abs(x)<=.97:pts.append(face_point(t,x))
        if len(pts)>2:net.tube(pts,.0052,.0052,3,5,detail=0)
for side in (-1,1):
    net.tube([face_point(t,side*.98) for t in np.linspace(.02,.97,55)],.009,.007,3,6,detail=0)
net.finish()

# Hollow black gape behind the upper plate. The separate lower jaw starts
# tightly closed and rotates into a long pointed open mandible on Exhale.
jb=Batch('Jaw | hollow pointed lower mandible',jaw)
jpts=catmull([(-.22,0,.00),(-.22,-.18,.06),(-.14,-.45,.12),(0,-.64,.17),(.14,-.45,.12),(.22,-.18,.06),(.22,0,.0)],10)
ws=np.array([.036+.017*math.sin(i/len(jpts)*math.pi) for i in range(len(jpts))]);jb.tube(jpts,ws,ws*.62,1,8)
# A narrow throat membrane is inside the jaw, preserving an open triangular rim.
jb.tube(catmull([(0,.02,-.04),(0,-.24,.01),(0,-.55,.13)],10),[.15*(1-t)+.004 for t in np.linspace(0,1,21)],.022,2,12)
for side in (-1,1):
    for i in range(10):
        t=(i+1)/12;p=V((side*.22*(1-t*.85),-.50*t,.03+.13*t))
        horn(jb,[p,p+V((-side*.025,.01,.045)),p+V((-side*.035,.005,.062))],.018,6,.8,4)
jb.finish()
throat=Batch('Mouth | recessed living ember',head)
palate=catmull([(0,-.38,.08),(0,-.62,.16),(0,-.80,.27),(0,-.94,.36)],8)
width=np.linspace(.18,.055,len(palate))
throat.tube(palate,width,np.linspace(.07,.035,len(palate)),2,12)
for side in (-1,1):
    line=palate[5:]+V((side*.027,0,.038))
    throat.tube(line,.009,.006,5,6)
throat.finish()

# Fine attached filaments on the reverse create a dense resolved back, with no
# disconnected debris. These follow and bridge the structural carapace ribs.
back=Batch('Reverse | sculpted filigree and attached vascular roots',body)
for i in range(34):
    y=-.35+i*.085;sg=(-1 if i%2 else 1)
    pts=catmull([(.16,y,-.77),(.16+sg*.28,y+.08,-.79),(.16+sg*.54,y+.18,-.68),(.16+sg*.69,y+.26,-.53)],5)
    widths=np.linspace(.026,.008,len(pts));back.tube(pts,widths,widths*.68,1 if i%3 else 4,7)
back.finish()

# Clips are named NLA tracks, exported as complete node-based animation clips.
# Two complete 1.6 s pose clips can be smoothly cross-faded by the runtime;
# all pivots remain individually editable in Blender's NLA editor.
bpy.context.scene.render.fps=30
anim_targets=[body,head,jaw]+pivots
for ob in anim_targets:ob.rotation_mode='QUATERNION'
head.rotation_quaternion=Quaternion((0,1,0),math.radians(-13))
rest_rot={ob.name:ob.rotation_quaternion.copy() for ob in anim_targets}
exhale_rot={body.name:Quaternion((0,1,0),math.radians(-4)),
            head.name:Quaternion((1,0,0),math.radians(-56)) @ Quaternion((0,1,0),math.radians(-9)),
            jaw.name:Quaternion((1,0,0),math.radians(71))}
for i,ob in enumerate(pivots):
    # Asymmetric spreading, lifting and genuine depth changes in the fronds.
    rx=math.radians((-7 if i%2 else 9)*(1 if i<8 else .7))
    ry=math.radians((5 if i%2 else -6))
    rz=math.radians((-5 if i%2 else 6))
    exhale_rot[ob.name]=Quaternion((1,0,0),rx) @ Quaternion((0,1,0),ry) @ Quaternion((0,0,1),rz)
for ob in anim_targets:
    ob.animation_data_clear(); ob.animation_data_create()
    for clip,target in [('Rest',rest_rot[ob.name]),('Exhale',exhale_rot[ob.name])]:
        ac=bpy.data.actions.new(clip+'_'+ob.name)
        ob.animation_data.action=ac
        for fr in [1,49]:
            ob.rotation_quaternion=target;ob.keyframe_insert(data_path='rotation_quaternion',frame=fr)
        track=ob.animation_data.nla_tracks.new();track.name=clip
        st=track.strips.new(clip,1,ac);st.action_frame_start=1;st.action_frame_end=49
        track.mute=True
        ob.animation_data.action=None
    ob.rotation_quaternion=rest_rot[ob.name]

scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=49;scene.frame_set(1)
scene.world.color=(.015,.015,.015)
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=1320;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('Dark forest studio');world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.008,.018,.012,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
def area(name,at,power,color,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=P(at)
    o.rotation_euler=(P((0,.2,0))-o.location).to_track_quat('-Z','Y').to_euler();return o
area('Key | soft silver green',(-4,7,6),1250,(.65,1,.79),5)
area('Rim | deep emerald',(4,3,-4),1450,(.16,.8,.43),4)
area('Fill | cool front',(4,-1,5),800,(.52,.78,.68),4)
area('Rear rim',(-3,0,-3),950,(.35,.58,.47),3)
camd=bpy.data.cameras.new('Sculpture review camera');cam=bpy.data.objects.new('Sculpture review camera',camd);bpy.context.collection.objects.link(cam);scene.camera=cam
camd.type='ORTHO';camd.ortho_scale=7.85
def camera(at,look=(0,.10,.05)):
    cam.location=P(at);cam.rotation_euler=(P(look)-cam.location).to_track_quat('-Z','Y').to_euler()
camera((0,.7,13))

# Export only the actual creature: lighting/camera review rigs stay in .blend.
bpy.ops.object.select_all(action='DESELECT')
def select_tree(o):
    o.select_set(True)
    for child in o.children:select_tree(child)
select_tree(root)
for ob in anim_targets:
    for tr in ob.animation_data.nla_tracks:tr.mute=True
    ob.rotation_quaternion=rest_rot[ob.name]
bpy.context.view_layer.update()
staging_glb=PUBLIC/'.guardian-v.staging.glb'
bpy.ops.export_scene.gltf(filepath=str(staging_glb),export_format='GLB',use_selection=True,
    export_animations=False,
    export_yup=True,export_apply=False,export_texcoords=True,export_normals=True,
    export_materials='EXPORT',export_cameras=False,export_lights=False,
    export_extras=True,export_keep_originals=False)
for ob in anim_targets:
    for tr in ob.animation_data.nla_tracks:tr.mute=True
    ob.rotation_quaternion=rest_rot[ob.name]

def xyzw(q):
    # Blender (x,y,z) maps to glTF (x,z,-y).
    return [round(q.x,8),round(q.z,8),round(-q.y,8),round(q.w,8)]

# Blender 4.5's NLA exporter can omit empty-only actions; serialize the exact
# authored Blender pose keys explicitly into standards-compliant glTF tracks.
# This preserves all editable Blender actions and makes the web clips reliable.
glbpath=PUBLIC/'guardian-v.glb'; raw=staging_glb.read_bytes()
jsonlen=struct.unpack_from('<I',raw,12)[0]
g=json.loads(raw[20:20+jsonlen].decode('utf8'))
binstart=20+jsonlen;binlen=struct.unpack_from('<I',raw,binstart)[0]
binary=bytearray(raw[binstart+8:binstart+8+binlen])
def accessor(data,kind,count):
    while len(binary)%4:binary.append(0)
    offset=len(binary);binary.extend(struct.pack('<'+'f'*len(data),*data))
    view=len(g.setdefault('bufferViews',[]));g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)*4})
    acc={'bufferView':view,'componentType':5126,'count':count,'type':kind}
    if kind=='SCALAR':acc.update({'min':[min(data)],'max':[max(data)]})
    idx=len(g.setdefault('accessors',[]));g['accessors'].append(acc);return idx
timeacc=accessor([0,1.6],'SCALAR',2);g['animations']=[]
nodeids={n.get('name'):i for i,n in enumerate(g['nodes'])}
for clip,rots in [('Rest',rest_rot),('Exhale',exhale_rot)]:
    animation={'name':clip,'samplers':[],'channels':[]}
    for ob in anim_targets:
        q=xyzw(rots[ob.name]);acc=accessor(q+q,'VEC4',2)
        idx=len(animation['samplers']);animation['samplers'].append({'input':timeacc,'output':acc,'interpolation':'LINEAR'})
        animation['channels'].append({'sampler':idx,'target':{'node':nodeids[ob.name],'path':'rotation'}})
    g['animations'].append(animation)
g['buffers'][0]['byteLength']=len(binary)
js=json.dumps(g,separators=(',',':'),ensure_ascii=True).encode('utf8')
js+=b' '*((-len(js))%4);binary.extend(b'\x00'*((-len(binary))%4))
final_bytes=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
staging_glb.write_bytes(final_bytes)
os.replace(staging_glb,glbpath)
manifest={
  'version':1,'title':'第五の犬 / Forest Guardian','source':'Blender 4.5.9 LTS procedural sculpt',
  'model':'guardian-v.glb','coordinateSystem':{'up':'+Y','front':'+Z','unit':'meter'},
  'assetBytes':len(final_bytes),'assetSha256':hashlib.sha256(final_bytes).hexdigest(),
  'nodes':{'body':'BodyPivot','head':'HeadPivot','jaw':'JawPivot','mouth':'MouthSocket','mouthAim':'MouthAim','tentacles':[x.name for x in pivots]},
  'animations':['Rest','Exhale'],'transitionSeconds':1.6,
  'poses':{'rest':{ob.name:{'quaternion':xyzw(rest_rot[ob.name])} for ob in anim_targets},
           'exhale':{ob.name:{'quaternion':xyzw(exhale_rot[ob.name])} for ob in anim_targets}},
  'modeling':{'referenceImages':['reference/guardian-rest.jpg','reference/guardian-exhale.jpg'],
    'referenceImagesUsedAsTexture':False,'actualPiercedGeometry':True,'rearSculpted':True,
    'mainSpiralCores':3,'secondaryReverseSpirals':2,'recurvedHeadHorns':4,
    'movableFronds':len(pivots),'textures':'textures/','blenderSource':'scripts/blender/dogs_guardian.py',
    'blendArchive':'output/dogs-archive/guardian-v.blend'},
  'meshStats':{'objects':len([o for o in bpy.data.objects if o.type=='MESH']),
    'vertices':sum(len(o.data.vertices) for o in bpy.data.objects if o.type=='MESH'),
    'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH')},
  'buildSeconds':round(time.time()-START,2)
}
manifest_tmp=PUBLIC/'.model-manifest.staging.json'
manifest_tmp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
os.replace(manifest_tmp,PUBLIC/'model-manifest.json')
source_text=bpy.data.texts.new('dogs_guardian.py | complete reproducible source')
source_text.write(Path(__file__).read_text())
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'guardian-v.blend'))
(OUT/'build-history.json').write_text(json.dumps({'blenderVersion':bpy.app.version_string,'builtAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'script':str(Path(__file__)), 'manifest':manifest},ensure_ascii=False,indent=2))
with (OUT/'build-journal.jsonl').open('a') as journal:
    journal.write(json.dumps({'builtAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'blenderVersion':bpy.app.version_string,'meshStats':manifest['meshStats'],'assetBytes':glbpath.stat().st_size,'clips':[{'name':a['name'],'tracks':len(a['channels'])} for a in g['animations']]})+'\n')
print('GUARDIAN_EXPORT_COMPLETE',json.dumps(manifest['meshStats']),flush=True)

if '--no-render' not in sys.argv:
    for name,at in [('rest-front',(0,.7,13)),('rest-three-quarter',(8,2,12)),('rest-back',(-5,1,-12)),('rest-side',(13,1,0)),('rest-top',(0,13,.05))]:
        camera(at);scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
        print('RENDER_COMPLETE',name,flush=True)
    for ob in anim_targets:ob.rotation_quaternion=exhale_rot[ob.name]
    camera((6,1.5,13));scene.render.filepath=str(OUT/'exhale-three-quarter.png');bpy.ops.render.render(write_still=True)
    print('RENDER_COMPLETE exhale-three-quarter',flush=True)
print('DONE',time.time()-START,flush=True)
