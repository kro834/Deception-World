"""Guardian V rebuild from the four-view turnaround, clay anatomy stage.

New geometry: fused perforated S-shell, volumetric whorl, flat porous fronds,
one continuous spined tail. Canonical v1 artifacts are never overwritten.
"""
import bpy, bmesh, math, json, time, random
import numpy as np
from pathlib import Path
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/dogs-archive/rebuild-v2';OUT.mkdir(parents=True,exist_ok=True)
START=time.time();random.seed(481)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def P(x):return Vector((float(x[0]),-float(x[2]),float(x[1])))
def V(x):return np.asarray(x,float)
def unit(x):return x/max(1e-9,np.linalg.norm(x))
def empty(n,at=(0,0,0),parent=None):
 o=bpy.data.objects.new(n,None);bpy.context.collection.objects.link(o);o.location=P(at);o.parent=parent;return o
root=empty('GuardianV_Root');body=empty('BodyPivot',parent=root)
def material(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=.74;b.inputs['Metallic'].default_value=0;return m
skin=material('Skin | v2 clay',(.32,.35,.33));bone=material('Bone | v2 clay',(.40,.43,.40));dark=material('Mouth | clay interior',(.07,.08,.075))
def curve(controls,steps=12):
 cs=np.asarray(controls,float);ps=[]
 for i in range(len(cs)-1):
  p0,p1,p2,p3=cs[max(0,i-1)],cs[i],cs[i+1],cs[min(len(cs)-1,i+2)]
  for j in range(steps):
   t=j/steps;ps.append(.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
 ps.append(cs[-1]);return np.asarray(ps)
class Mesh:
 def __init__(self,name,parent=body,mat=bone):self.name=name;self.parent=parent;self.mat=mat;self.v=[];self.f=[]
 def sweep(self,ps,ws,ds=None,sides=14,flat=False,normal_hint=(0,0,1)):
  ps=np.asarray(ps,float);n=len(ps);ws=np.full(n,ws) if np.isscalar(ws) else np.asarray(ws);ds=ws if ds is None else np.full(n,ds) if np.isscalar(ds) else np.asarray(ds)
  start=len(self.v)
  for i,p in enumerate(ps):
   tang=unit(ps[min(n-1,i+1)]-ps[max(0,i-1)]);side=unit(np.cross(tang,V(normal_hint)));normal=unit(np.cross(side,tang))
   for j in range(sides):
    a=j*math.tau/sides;wave=1+.025*math.sin(i*.83+j*1.9)
    z=math.copysign(abs(math.sin(a))**.30,math.sin(a)) if flat else math.sin(a)
    self.v.append(tuple(P(p+side*math.cos(a)*ws[i]*wave+normal*z*ds[i]*wave)))
  for i in range(n-1):
   for j in range(sides):
    a=start+i*sides+j;b=start+i*sides+(j+1)%sides;self.f.append((a,a+sides,b+sides,b))
  self.f.append(tuple(start+j for j in range(sides)));self.f.append(tuple(start+(n-1)*sides+j for j in reversed(range(sides))))
 def finish(self):
  me=bpy.data.meshes.new(self.name+'Mesh');me.from_pydata(self.v,[],self.f);me.update()
  ob=bpy.data.objects.new(self.name,me);bpy.context.collection.objects.link(ob);ob.parent=self.parent;me.materials.append(self.mat)
  for p in me.polygons:p.use_smooth=True
  return ob
def clean(ob):
 bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00002);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
def horn(mesh,cs,radius,flat=.7):
 ps=curve(cs,6);t=np.linspace(0,1,len(ps));w=radius*(1-t)**.75+.0015;mesh.sweep(ps,w,w*flat,10)
def cut_shape(mesh,cx,cy,rx,ry,angle=0,z0=-2,z1=2,phase=0,n=28):
 start=len(mesh.v);co,si=math.cos(angle),math.sin(angle)
 for z in (z0,z1):
  for j in range(n):
   a=j*math.tau/n;rad=1+.09*math.sin(a*3+phase)+.045*math.sin(a*5-phase)
   xx=rx*math.cos(a)*rad;yy=ry*math.sin(a)*rad
   mesh.v.append(tuple(P((cx+co*xx-si*yy,cy+si*xx+co*yy,z))))
 for j in range(n):
  k=(j+1)%n;mesh.f.append((start+j,start+k,start+n+k,start+n+j))
 mesh.f.append(tuple(start+j for j in reversed(range(n))));mesh.f.append(tuple(start+n+j for j in range(n)))
def carve(ob,cuts,name,bevel_edges=True):
 cutter=cuts.finish();clean(cutter);clean(ob);bpy.context.view_layer.objects.active=ob
 mod=ob.modifiers.new(name,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.use_self=not name.startswith('Tangential');mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
 assert len(ob.data.polygons)>20,name+' removed shell'
 if bevel_edges:
  bevel=ob.modifiers.new('Worn thick aperture walls','BEVEL');bevel.width=.018;bevel.segments=2
  bpy.ops.object.modifier_apply(modifier=bevel.name)
 for p in ob.data.polygons:p.use_smooth=True

# Continuous S-shaped exoskeleton. It has no human chest, cylindrical ribcage,
# or independent decorative disks. The whorled end and neck are fused into it.
core=Mesh('Shell | fused S-shaped fenestrated organ')
tailspines=Mesh('Tail | continuous-edge long and short spines')
controls=[(.12,2.28,-.70),(-.04,1.9,-.46),(.22,1.45,-.13),(.62,.95,.28),(.53,.40,.39),(.16,-.12,.08),(-.08,-.62,-.22),(.02,-1.03,-.36)]
ps=curve(controls,12);tt=np.linspace(0,1,len(ps));k=np.linspace(0,1,len(controls))
shell_width=np.interp(tt,k,[.65,.78,.86,.90,.71,.45,.27,.15]);shell_depth=np.interp(tt,k,[.55,.73,.90,.96,.79,.49,.29,.16])
# The shell is built from directional curved trabeculae, not a balloon
# pierced with circular holes. Front and back have different branching fields.
def section(s):
 s=min(.999,max(0,s));ii=s*(len(ps)-1);i=int(ii);f=ii-i
 return ps[i]*(1-f)+ps[i+1]*f,float(np.interp(s,tt,shell_width)),float(np.interp(s,tt,shell_depth))
def shell_surface(s,a):
 c,w,d=section(s)
 return c+V((math.cos(a)*w,0,math.sin(a)*d))
def beam(points,width,depth=None):
 path=curve(points,8);t=np.linspace(0,1,len(path));ww=width*(.82+.18*np.cos(t*math.tau))
 core.sweep(path,ww,ww*.70 if depth is None else depth,12)
# One rear backbone flows from the coiling root down to the tail.
spine=[]
for s0 in np.linspace(0,1,18):spine.append(shell_surface(s0,-1.55+.32*math.sin(s0*math.pi*1.7)))
beam(spine,.125)
# Lateral buttresses twist forward and become the narrow waist.
for side in (0,1):
 path=[]
 for s0 in np.linspace(0,1,17):
  a=(.12 if side==0 else math.pi-.20)+.20*math.sin(s0*math.pi*2+side)
  path.append(shell_surface(s0,a))
 beam(path,.13)
# Front-side keel is offset toward the large right-hand shell, leaving
# the face and two small coiling organs in the open central space.
beam([shell_surface(s0,.78+.15*math.sin(s0*5)) for s0 in np.linspace(.04,.97,16)],.095)
# Curved long openings are surrounded by broad connected bone laminae.
# Each cell is a solid ring on the S-surface with its own irregular swept hole;
# adjacent rings share the outer perimeter, forming a continuous web, not ribs.
rows=np.array([0,.065,.14,.235,.34,.455,.57,.68,.78,.87,.94,1.0])
cols=np.array([-math.pi,-2.35,-1.60,-.87,-.10,.62,1.37,2.20,math.pi])
def grid_s(i,j):
 r=rows[i]
 return r+math.sin(r*math.pi)*(.043*math.sin(cols[j]*1.3+i*.35)+.025*math.cos(cols[j]*2-i*.6))
def mapped_cell(i,j,u,v):
 ss=(1-u)*((1-v)*grid_s(i,j)+v*grid_s(i+1,j))+u*((1-v)*grid_s(i,j+1)+v*grid_s(i+1,j+1))
 aa=cols[j]*(1-u)+cols[j+1]*u
 return ss,aa
for i in range(len(rows)-1):
 for j in range(len(cols)-1):
  n=32;start=len(core.v)
  # Openings vary in width and lean. They curve along the local S anatomy.
  hu=.36+.075*math.sin(i*1.8+j*2.2);hv=.34+.055*math.sin(i*2.7-j*.9)
  off=.07*math.sin(i+j*2.3)
  for layer in (0,1):
   for inneredge in (False,True):
    for k0 in range(n):
     a=k0*math.tau/n;ca=math.cos(a);sa=math.sin(a)
     if inneredge:
      u=.5+hu*ca+.045*math.sin(a*3+i);v=.5+hv*sa+off*ca
     else:
      fac=.5/max(abs(ca),abs(sa));u=.5+fac*ca;v=.5+fac*sa
     ss,aa=mapped_cell(i,j,u,v);point=shell_surface(ss,aa)
     normal=unit(V((math.cos(aa),0,math.sin(aa))))
     point+=normal*(.043 if layer==0 else -.043)
     core.v.append(tuple(P(point)))
  for k0 in range(n):
   q=(k0+1)%n
   core.f.append((start+k0,start+q,start+n+q,start+n+k0))
   core.f.append((start+2*n+k0,start+3*n+k0,start+3*n+q,start+2*n+q))
   core.f.append((start+n+k0,start+n+q,start+3*n+q,start+3*n+k0))
   # Close cell borders; voxel fusion resolves the shared seams.
   core.f.append((start+k0,start+2*n+k0,start+2*n+q,start+q))
# Wide overlapping roots carry the large coiling organ into the dorsal web.
for xoff in (-.16,.03,.21):
 beam([(.18+xoff,2.40,-.66),(.10+xoff,2.15,-.77),(.25+xoff,1.78,-.84),(.45+xoff,1.48,-.82)],.16)
# The upper root retains local organ mass, while the middle remains an open cage.
core.sweep(curve([(.30,2.30,-.62),(.10,2.03,-.60),(-.11,1.74,-.47)],10),.26,.24,16)
neckpath=curve([(-.13,1.7,.25),(-.60,1.42,.40),(-.67,.91,.58),(-.58,.48,.68)],14)
core.sweep(neckpath,np.linspace(.19,.095,len(neckpath)),np.linspace(.095,.045,len(neckpath)),18,flat=True)
def organ_whorl(mesh,center,rx,ry,turns,phase,basewidth,base_depth,yaw=0):
 ps=[];ws=[];ds=[];ts=np.linspace(0,1,int(160*turns))
 for t in ts:
  a=phase-t*math.tau*turns;r=(1-t)**.88+.018
  dx=math.cos(a)*rx*r+.035*rx*math.sin(a*.67)*r
  x=center[0]+dx*math.cos(yaw)
  y=center[1]+math.sin(a)*ry*r+.025*ry*math.cos(a*.54)*r
  z=center[2]+dx*math.sin(yaw)+.12*rx*math.sin(a*.67)+.19*rx*math.sin(t*math.pi)
  ps.append((x,y,z));ws.append(basewidth*(.28+.72*r)*(1+.15*math.sin(a*1.3)));ds.append(base_depth*(.25+.75*r))
 mesh.sweep(ps,ws,ds,20,normal_hint=(-math.sin(yaw),0,math.cos(yaw)));return np.asarray(ps),np.asarray(ws)
main_path,main_width=organ_whorl(core,(.94,2.65,-.57),1.13,1.0,2.70,3.75,.178,.34,math.radians(30))
# The lower-right sweep is a shoulder: two fenestrated laminae grow
# continuously from that outer whorl into the front and dorsal S-shell.
def shoulder_point(u,v,back):
 phase=.05+1.80*u;frac=(3.75+phase)/(math.tau*2.70)
 k=frac*(len(main_path)-1);i=int(k);f=k-i
 coil=main_path[i]*(1-f)+main_path[i+1]*f
 coil=coil+V((.015,0,-.20 if back else .20))
 end=shell_surface(.035+.36*u,(-.28-.90*u) if back else (.30+.72*u))
 p=coil*(1-v)+end*v
 p+=V((.09*math.sin(math.pi*v)*math.sin(math.pi*u),.04*math.sin(math.pi*v),(-1 if back else 1)*.07*math.sin(math.pi*v)))
 return p
for back in (False,True):
 for row in range(7):
  for col in range(2):
   start=len(core.v);n=24
   for layer in (0,1):
    for inneredge in (False,True):
     for k0 in range(n):
      a=k0*math.tau/n;ca=math.cos(a);sa=math.sin(a)
      if inneredge:x=.5+(.33+.035*math.sin(row))*ca;y=.5+.33*sa+.04*ca
      else:
       scale=.5/max(abs(ca),abs(sa));x=.5+scale*ca;y=.5+scale*sa
      u=(row+x)/7;v=(col+y)/2
      p=shoulder_point(u,v,back)
      du=shoulder_point(u+.001,v,back)-shoulder_point(u-.001,v,back)
      dv=shoulder_point(u,v+.001,back)-shoulder_point(u,v-.001,back)
      normal=unit(np.cross(du,dv));p+=normal*(.050 if layer==0 else -.050)
      core.v.append(tuple(P(p)))
   for k0 in range(n):
    q=(k0+1)%n
    core.f.extend([(start+k0,start+q,start+n+q,start+n+k0),(start+2*n+k0,start+3*n+k0,start+3*n+q,start+2*n+q),(start+n+k0,start+n+q,start+3*n+q,start+3*n+k0),(start+k0,start+2*n+k0,start+2*n+q,start+q)])
mid_path,mid_width=organ_whorl(core,(-.43,1.53,.40),.53,.50,2.35,4.1,.105,.18)
small_path,small_width=organ_whorl(core,(-.60,.68,.61),.36,.38,2.05,3.7,.080,.14)
# One analytic smooth S-tail joins the body before voxel fusion. Long spines
# follow a continuously rolling anatomical edge rather than switching sides.
tp=[]
for t in np.linspace(0,1,116):tp.append((.08+.32*math.sin(t*math.tau+math.pi)-.30*t,-.80-2.95*t,-.26+.28*math.sin(t*math.pi*1.5)))
tp=np.asarray(tp);tailt=np.linspace(0,1,len(tp));tw=.22*(1-tailt)**.80+.005;core.sweep(tp,tw,tw*.73,18)
lengths=[1.13,1.31,1.28,1.15,1.04,.95,.87,.80,.85,.90,.83,.72,.60,.46]
for ii,(t,le) in enumerate(zip(np.linspace(.055,.89,14),lengths)):
 i=int(t*(len(tp)-1));p=tp[i];tang=unit(tp[i+1]-tp[i-1]);side=unit(np.cross(tang,V((0,0,1))));normal=unit(np.cross(side,tang))
 u=min(1,max(0,(t-.40)/.45));roll=math.pi*(u*u*(3-2*u));edge=side*math.cos(roll)+normal*math.sin(roll)
 tip=p+edge*le+tang*(.12+.16*t)
 horn(tailspines,[p,p+edge*le*.28+tang*.015,tip],.075*(1-t*.50),.52)
shell=core.finish();clean(shell)
bpy.context.view_layer.objects.active=shell
remesh=shell.modifiers.new('Continuous shell union','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.030;remesh.adaptivity=.015;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
print('FUSED_CORE',len(shell.data.polygons),flush=True)

# Open trabecular cells are true spaces between solid beams. There is no
# shared front-to-back drill operation or hidden spherical wall.
# Fine tangential apertures interrupt the mass of each coiling organ.
pores=Mesh('temporary whorl apertures')
for path,widths in [(main_path,main_width),(mid_path,mid_width),(small_path,small_width)]:
 for i in range(13,int(len(path)*.75),17):
  p=path[i];t=unit(path[i+2]-path[i-2]);a=math.atan2(t[1],t[0])
  cut_shape(pores,p[0],p[1],widths[i]*.64,widths[i]*.28,a,z0=p[2]-.48,z1=p[2]+.48,phase=i*.43,n=20)
carve(shell,pores,'Tangential whorl openings',False)
# Resolve tiny Boolean seam defects without changing the macro shell design.
bpy.context.view_layer.objects.active=shell
repair=shell.modifiers.new('Watertight shell repair','REMESH');repair.mode='VOXEL';repair.voxel_size=.022;repair.adaptivity=0;repair.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=repair.name)
clean(shell)

tailspines.finish()
print('DIRECTIONAL_SHELL',len(shell.data.polygons),flush=True)

def curved_lobe(mesh,base,tangent,inward,normal,length,width,phase):
 # A solid, curved leaf: wide middle, tapering hooked tip and a thin edge.
 cs=[base,base+tangent*length*.24+inward*length*.08,
     base+tangent*length*.61+inward*length*.47+normal*length*.12,
     base+tangent*length*.52+inward*length*.82+normal*length*.30]
 path=curve(cs,5);n=len(path);cross=6;stride=cross+1;plane=n*stride;start=len(mesh.v)
 for layer in (0,1):
  for i,c in enumerate(path):
   t=i/(n-1);tan=unit(path[min(n-1,i+1)]-path[max(0,i-1)]);side=unit(np.cross(tan,normal))
   w=width*(.36+.64*math.sin(math.pi*t)**.7)*(1-t)**.65+.0008
   for j in range(stride):
    u=-1+2*j/cross;irregular=1+.14*math.sin(t*7+phase+u*2)
    relief=(1-u*u)*length*.055*math.sin(math.pi*t)
    thick=.010*(1-t)+.0015
    pp=c+side*u*w*irregular+normal*(relief+(thick if layer==0 else -thick))
    mesh.v.append(tuple(P(pp)))
 for layer in (0,1):
  for i in range(n-1):
   for j in range(cross):
    a=start+layer*plane+i*stride+j;f=(a,a+1,a+stride+1,a+stride);mesh.f.append(f if layer==0 else tuple(reversed(f)))
 for i in range(n-1):
  for j in (0,cross):
   a=start+i*stride+j;b=start+(i+1)*stride+j;mesh.f.append((a,b,b+plane,a+plane))
 for i in (0,n-1):
  for j in range(cross):
   a=start+i*stride+j;mesh.f.append((a,a+plane,a+plane+1,a+1))

leaves=Mesh('Bone | overlapping coiled membrane lobes',body,bone)
for organ,(path,widths,base_depth,yaw,scale) in enumerate([(main_path,main_width,.34,math.radians(30),1.0),(mid_path,mid_width,.18,0,.54),(small_path,small_width,.14,0,.42)]):
 N=unit(V((-math.sin(yaw),0,math.cos(yaw))))
 for back in (False,True):
  normal=N*(-1 if back else 1);last=-100;distance=0
  for i in range(3,len(path)-7):
   distance+=np.linalg.norm(path[i]-path[i-1]);t=i/(len(path)-1);r=(1-t)**.88+.018
   spacing=scale*(.055+.055*r)*(1+.18*math.sin(i*.19+organ))
   if distance-last<spacing:continue
   last=distance;tan=unit(path[i+2]-path[i-2]);inside=unit(np.cross(tan,N))
   depth=base_depth*(.25+.75*r)
   base=path[i]+inside*widths[i]*.48+normal*depth*.78
   length=scale*(.13+.23*r)*(1+.28*math.sin(i*.43+organ)+.10*math.sin(i*.17))
   width=scale*(.030+.062*r)*(1+.23*math.sin(i*.31))
   curved_lobe(leaves,base,tan,inside,normal,length,width,i*.51)
   # A sparse secondary outside layer breaks the complete circular outline.
   if i%5 in (0,1) and t<.45:
    outerbase=path[i]-inside*widths[i]*.72+normal*depth*.44
    curved_lobe(leaves,outerbase,tan,-inside*.70,normal,length*.64,width*.70,i*.33)
leaf_object=leaves.finish();clean(leaf_object)

pivots=[]
def porous_frond(idx,control,width,depth=.13,teeth=.16):
 anchor=V(control[0]);pivot=empty('TentaclePivot_%02d'%idx,anchor,body);pivots.append(pivot)
 src=curve([V(p)-anchor for p in control],24)
 arc=np.concatenate(([0],np.cumsum(np.linalg.norm(np.diff(src,axis=0),axis=1))))
 distances=np.linspace(0,arc[-1],max(90,int(arc[-1]/.016)))
 ps=np.array([np.interp(distances,arc,src[:,c]) for c in range(3)]).T
 n=len(ps);tt=distances/arc[-1];tang=np.array([unit(ps[min(n-1,i+1)]-ps[max(0,i-1)]) for i in range(n)])
 sides=np.array([unit(np.cross(t,V((0,0,1)))) for t in tang]);normals=np.array([unit(np.cross(sd,t)) for sd,t in zip(sides,tang)])
 kappa=np.zeros(n)
 for i in range(1,n-1):kappa[i]=np.linalg.norm(tang[i+1]-tang[i-1])/max(1e-6,distances[i+1]-distances[i-1])
 ws=width*(.43+.57*np.sin(np.minimum(tt/.98,1)*math.pi)**.55)*(1-tt)**.48+.003
 # Prevent the inner offset crossing the local curvature center in a curl.
 ws=np.minimum(ws,.40/np.maximum(kappa,.05));ws=np.maximum(ws,.003)
 ds=np.minimum(depth*.30*(1-tt)**.6+.003,ws*.38)
 sg=1 if idx%2==0 else -1
 mesh=Mesh('Frond_%02d | toothed perforated feather'%idx,pivot,skin)
 cross=8;stride=cross+1;plane=n*stride
 period=.105 if idx in (5,6) else .082
 for layer in (0,1):
  for i in range(n):
   sarc=distances[i]
   phase=(sarc/period+.22*math.sin(sarc*7+idx)+.07*math.sin(sarc*19-idx))%1
   leanphase=.33+.12*math.sin(sarc*5+idx*.8)
   tooth=max(0,1-abs(phase-leanphase)/(.30+.06*math.sin(sarc*9)))**(.65+.18*math.sin(sarc*3+idx))
   vigor=.66+.23*math.sin(sarc*6.2+idx)+.11*math.sin(sarc*15.1-idx)
   if math.sin(sarc*23+idx*1.7)>.94:tooth*=.22
   taper=min(1,distances[i]/.18,(arc[-1]-distances[i])/.12)
   inner=ws[i]*(1-taper*(.34+.16*vigor)*(1-tooth*vigor))
   for j in range(stride):
    u=-1+2*j/cross;across=u*(inner if u*sg>0 else ws[i])
    bulge=(1-u*u)*ds[i]*.35
    pt=ps[i]+sides[i]*across+normals[i]*((ds[i]+bulge) if layer==0 else -ds[i])
    # Small hooked lean only on the inner tooth, following the lamina tangent.
    pt+=tang[i]*(max(0,u*sg)**3)*tooth*taper*min(.035,ws[i]*.22)*math.sin(sarc*5.3+idx)
    mesh.v.append(tuple(P(pt)))
 for layer in (0,1):
  for i in range(n-1):
   for j in range(cross):
    a=layer*plane+i*stride+j;f=(a,a+1,a+stride+1,a+stride);mesh.f.append(f if layer==0 else tuple(reversed(f)))
 for i in range(n-1):
  for j in (0,cross):
   a=i*stride+j;b=(i+1)*stride+j;mesh.f.append((a,b,b+plane,a+plane))
 for i in (0,n-1):
  for j in range(cross):
   a=i*stride+j;mesh.f.append((a,a+plane,a+plane+1,a+1))
 obj=mesh.finish();clean(obj);cuts=Mesh('temporary frond pores',pivot)
 last=-1
 for i in range(6,n-8):
  if distances[i]-last<period*1.3 or tt[i]>.87 or ws[i]<.04:continue
  if idx==8 and .14<tt[i]<.46:continue  # Keep the tight basal fold solid; a pore here intersects its return wall.
  last=distances[i];p=ps[i]+sides[i]*sg*ws[i]*.10
  # Longitudinal slits remain separate from the toothed inner edge.
  cut_shape(cuts,p[0],p[1],min(period*.35,ws[i]*.54),ws[i]*.16,math.atan2(tang[i][1],tang[i][0]),p[2]-.10,p[2]+.10,idx+i*.5,18)
 if cuts.f:carve(obj,cuts,'Lamina through-pores',False)
 clean(obj)
 bm=bmesh.new();bm.from_mesh(obj.data);needs_repair=any(not e.is_manifold for e in bm.edges);bm.free()
 if needs_repair:
  bpy.context.view_layer.objects.active=obj
  repair=obj.modifiers.new('Resolve local pore seams','REMESH');repair.mode='VOXEL';repair.voxel_size=.004;repair.adaptivity=0;repair.use_smooth_shade=True
  bpy.ops.object.modifier_apply(modifier=repair.name);clean(obj)
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=16);bm.to_mesh(obj.data);bm.free();clean(obj)
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-8 and all(e.is_boundary for e in f.edges)],context='FACES');bm.to_mesh(obj.data);bm.free();obj.data.update()
 return pivot
fronds=[
 ([(-.42,1.73,-.35),(-1.18,2.02,-.57),(-1.60,2.75,-.77),(-1.74,3.29,-.82),(-1.57,3.44,-.76),(-1.39,3.27,-.60)],.19,.105,.15),
 ([(-.23,1.94,-.30),(-.57,2.49,-.13),(-.82,3.19,.14),(-1.0,3.47,.22),(-.81,3.57,.34),(-.66,3.41,.42)],.19,.11,.15),
 ([(-.03,2.02,-.28),(.03,2.65,-.39),(-.18,3.36,-.43),(-.38,3.57,-.35),(-.51,3.45,-.26)],.17,.10,.14),
 ([(-.61,1.42,-.13),(-1.27,1.63,-.09),(-1.79,2.19,-.04),(-2.02,2.51,.01),(-1.88,2.65,.10),(-1.71,2.52,.15)],.18,.105,.15),
 ([(.03,1.98,-.30),(.32,2.46,-.49),(.26,3.01,-.59),(.38,3.29,-.51)],.13,.09,.12),
 # Main left/right laminae sweep round the body and curl under it.
 ([(-.56,1.07,.24),(-1.31,.69,.43),(-1.88,-.03,.72),(-1.84,-.78,.95),(-1.42,-1.26,1.14),(-.98,-1.10,1.23),(-1.00,-.70,1.14),(-1.23,-.56,1.02),(-1.38,-.75,.92)],.41,.16,.25),
 ([(.76,1.63,-.38),(1.62,1.24,-.74),(1.99,.49,-.70),(1.82,-.23,-.38),(1.31,-.56,.11),(1.18,-.21,.46),(1.43,.01,.58),(1.61,-.16,.56)],.39,.17,.25),
 ([(-1.41,-1.22,.40),(-1.24,-1.69,.43),(-.88,-1.90,.39),(-.66,-1.68,.40),(-.83,-1.50,.47)],.17,.09,.13),
 ([(1.48,-.42,.30),(1.52,-.91,.39),(1.23,-1.22,.47),(.98,-1.05,.57),(1.12,-.84,.59)],.18,.10,.14),
 ([(1.28,-1.04,.40),(1.56,-1.43,.43),(1.39,-1.77,.48),(1.12,-1.67,.52),(1.17,-1.47,.59)],.15,.085,.12),
 ([(-1.54,-1.18,.32),(-1.91,-1.44,.29),(-2.00,-1.82,.37),(-1.69,-1.98,.42),(-1.48,-1.76,.46)],.17,.09,.14)
]
for i,(cs,w,d,t) in enumerate(fronds):porous_frond(i,cs,w,d,t)
print('FRONDS_COMPLETE',flush=True)

head=empty('HeadPivot',(-.58,.06,.68),body);head.rotation_euler[1]=math.radians(-18)
jaw=empty('JawPivot',(0,-.21,.08),head);mouth=empty('MouthSocket',(0,-.55,.22),head);aim=empty('MouthAim',(0,-1.17,.82),head)
hm=Mesh('Head | small buried spear face',head,skin)
# A thin, convex spear-mask with a central ridge and a resolved back, not a cone.
rows,cols=28,16
for side in (0,1):
 for i in range(rows+1):
  t=i/rows;y=.37-.90*t;w=np.interp(t,[0,.22,.55,.82,1],[.245,.26,.18,.078,.001])
  for j in range(cols+1):
   u=-1+2*j/cols
   z=.02+.09*t+(.16*(1-abs(u)) if side==0 else -.025)*(1-.60*t)
   hm.v.append(tuple(P((u*w,y,z))))
stride=cols+1;plane=(rows+1)*stride
for side in (0,1):
 for i in range(rows):
  for j in range(cols):
   a=side*plane+i*stride+j;face=(a,a+1,a+stride+1,a+stride);hm.f.append(tuple(reversed(face)) if side==0 else face)
for i in range(rows):
 for j in (0,cols):
  a=i*stride+j;b=(i+1)*stride+j;hm.f.append((a,b,b+plane,a+plane))
for i in (0,rows):
 for j in range(cols):
  a=i*stride+j;hm.f.append((a,a+plane,a+plane+1,a+1))
for cs,r in [([(-.18,.18,.05),(-.41,.28,.03),(-.67,.56,-.03),(-.76,.88,-.08)],.038),
 ([(.18,.22,.04),(.40,.45,.01),(.43,.78,-.07),(.36,1.02,-.13)],.043),
 ([(-.19,-.14,.09),(-.49,-.10,.04),(-.82,.09,-.04),(-1.02,.31,-.11)],.030),
 ([(.18,-.10,.08),(.54,.02,.04),(.91,.35,-.03),(1.04,.65,-.09)],.034)]:horn(hm,cs,r,.56)
head_object=hm.finish();clean(head_object)
rune=material('Rune | forehead fan lattice',(.64,.67,.63))
fan=Mesh('Face | converging curved fan lattice',head,rune)
def forehead_point(t,u):
 t=min(.985,max(0,t));w=np.interp(t,[0,.22,.55,.82,1],[.245,.26,.18,.078,.001]);y=.37-.90*t
 z=.02+.09*t+.16*(1-abs(u))*(1-.60*t)+.006
 return V((u*w,y,z))
for u0 in np.linspace(-.92,.92,9):
 path=[]
 for t in np.linspace(.02,.98,45):
  u=u0*(1-.25*t)+.12*u0*math.sin(t*math.pi)
  path.append(forehead_point(t,u))
 fan.sweep(path,.0045,.0045,7)
for base_t in np.linspace(.10,.86,8):
 path=[]
 for u in np.linspace(-.94,.94,36):
  t=base_t+.12*(1-u*u)+.065*u*math.sin(base_t*8)
  if .01<t<.97:path.append(forehead_point(t,u))
 if len(path)>2:fan.sweep(path,.0037,.0037,7)
fan_object=fan.finish();clean(fan_object)
jm=Mesh('Jaw | separate slim lower mandible',jaw,skin)
jp=curve([(-.15,0,0),(-.11,-.14,.04),(0,-.34,.09),(.11,-.14,.04),(.15,0,0)],8);jm.sweep(jp,.018,.014,10);jm.finish()

checks=[]
for ob in [x for x in bpy.data.objects if x.type=='MESH']:
 bm=bmesh.new();bm.from_mesh(ob.data)
 record={'mesh':ob.name,'vertices':len(bm.verts),'faces':len(bm.faces),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges)}
 if ob.name.startswith('Frond_'):
  bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.faces.ensure_lookup_table();bm.faces.index_update();bm.verts.index_update()
  tree=BVHTree.FromBMesh(bm,epsilon=0.0);pairs=tree.overlap(tree);sets=[set(v.index for v in f.verts) for f in bm.faces]
  candidates=[(a,b) for a,b in pairs if a<b and not sets[a].intersection(sets[b])]
  record['nonAdjacentTriangleOverlapPairs']=len(candidates)
 checks.append(record)
 bm.free()
(OUT/'clay-mesh-audit.json').write_text(json.dumps({'iteration':'clay-05','meshes':checks,'note':'Edge topology audit; local curl width is capped at 0.40 / curvature to prevent offset inversion. Visual five-view review remains required.'},indent=2))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=512;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('Neutral clay studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.15,.15,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4;scene.world=world
def light(n,at,power,size):
 d=bpy.data.lights.new(n,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(n,d);bpy.context.collection.objects.link(o);o.location=P(at);o.rotation_euler=(P((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
light('Key',(-4,7,6),950,5);light('Rim',(4,4,-5),1000,4);light('Fill',(4,0,5),350,5)
cd=bpy.data.cameras.new('Four-view orthographic');cam=bpy.data.objects.new('Four-view orthographic',cd);bpy.context.collection.objects.link(cam);scene.camera=cam;cd.type='ORTHO';cd.ortho_scale=8.1
def camera(at):cam.location=P(at);cam.rotation_euler=(P((0,.05,0))-cam.location).to_track_quat('-Z','Y').to_euler()
camera((0,.05,16))
source=bpy.data.texts.new('dogs_guardian_v2.py');source.write(Path(__file__).read_text())
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'guardian-v2-clay.blend'))
bpy.ops.object.select_all(action='DESELECT')
def select(o):o.select_set(True);[select(c) for c in o.children]
select(root)
bpy.ops.export_scene.gltf(filepath=str(OUT/'guardian-v2-clay.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
manifest={'stage':'turnaround rebuild v2 clay 05 layered whorl membranes, face fan lattice and organic teeth, not approved','reference':'reference/guardian-turnaround.png','source':'scripts/blender/dogs_guardian_v2.py','singleTail':True,'fusedPerforatedShell':True,'movableFronds':len(pivots),'minWallTarget':.035,'transparentRenders':True,'orthoScale':8.1,'cameraTarget':[0,.05,0],'meshObjects':len([x for x in bpy.data.objects if x.type=='MESH']),'buildSeconds':time.time()-START}
(OUT/'clay-manifest.json').write_text(json.dumps(manifest,indent=2))
for name,at in [('clay-front',(0,.05,16)),('clay-back',(0,.05,-16)),('clay-left',(-16,.05,0)),('clay-right',(16,.05,0)),('clay-three-quarter',(11,.6,14))]:
 camera(at);scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True);print('RENDER_COMPLETE',name,flush=True)
print('V2_CLAY_DONE',time.time()-START,flush=True)
