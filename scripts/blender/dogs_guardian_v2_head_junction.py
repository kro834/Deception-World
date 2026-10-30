"""Wide, continuous head root from the user-supplied junction close-up.
Actual shield volume and horn-root union plus a 2-joint deforming black membrane.
"""
import bpy,bmesh,math,json,sys,time,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Quaternion,Matrix
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'output/dogs-archive/rebuild-v2/finish-study';OUT=ROOT/'output/dogs-archive/rebuild-v2/head-junction';OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts/blender'))
from guardian_cavity_ao import bake_guardian_cavity
START=time.time();bpy.ops.wm.open_mainfile(filepath=str(BASE/'guardian-v2-finish-sculpt.blend'))
root=bpy.data.objects['GuardianV_Root'];body=bpy.data.objects['BodyPivot'];head=bpy.data.objects['HeadPivot'];jaw=bpy.data.objects['JawPivot']
def P(p):return Vector((p[0],-p[2],p[1]))
def curve(cs,steps=12):
 cs=np.asarray(cs,float);ps=[]
 for i in range(len(cs)-1):
  p0,p1,p2,p3=cs[max(0,i-1)],cs[i],cs[i+1],cs[min(len(cs)-1,i+2)]
  for j in range(steps):
   t=j/steps;ps.append(.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
 ps.append(cs[-1]);return np.array(ps)
def unit(v):return v/max(np.linalg.norm(v),1e-9)
def clean(o):
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
class Mesh:
 def __init__(self,name,parent,mat):self.name=name;self.parent=parent;self.mat=mat;self.v=[];self.f=[]
 def horn(self,cs,radius,detail=True):
  ps=curve(cs,14);start=len(self.v);sides=14
  for i,p in enumerate(ps):
   t=i/(len(ps)-1);tang=unit(ps[min(len(ps)-1,i+1)]-ps[max(0,i-1)]);side=unit(np.cross(tang,(0,0,1)));normal=unit(np.cross(side,tang));w=radius*(1-t)**1.1*(1+.28*(1-t)**3+.10*math.sin(t*13+cs[0][0]*17))+.0018
   for j in range(sides):
    a=j*math.tau/sides;v=P(p+side*math.cos(a)*w+normal*math.sin(a)*w*(.30+.40*t));self.v.append(tuple(T@v))
  for i in range(len(ps)-1):
   for j in range(sides):
    a=start+i*sides+j;b=start+i*sides+(j+1)%sides;self.f.append((a,b,b+sides,a+sides))
  self.f.extend([tuple(start+j for j in reversed(range(sides))),tuple(start+(len(ps)-1)*sides+j for j in range(sides))])
  if detail:
   sg=1 if cs[0][0]<0 else -1
   for i in range(6,int(len(ps)*.56),6):
    t=i/(len(ps)-1);p=ps[i];tang=unit(ps[i+1]-ps[i-1]);side=unit(np.cross(tang,(0,0,1)))*sg
    w=radius*(1-t)**1.1;le=.045+.022*math.sin(i*.7+cs[0][0]*13)
    base=p+side*w*.65
    self.horn([base,base+side*le*.65+tang*.014,base+side*le+tang*.030],.015,False)
 def finish(self):
  me=bpy.data.meshes.new(self.name+'Mesh');me.from_pydata(self.v,[],self.f);me.update();o=bpy.data.objects.new(self.name,me);bpy.context.collection.objects.link(o);o.parent=self.parent;me.materials.append(self.mat)
  for f in me.polygons:f.use_smooth=True
  clean(o);return o
skin=bpy.data.materials['Skin | v2 clay'];rune=bpy.data.materials['Rune | forehead fan lattice']
# Move the actual turning pivot up into the rooted upper head while preserving
# all Rest world positions of jaw, socket, aim and current attachments.
bpy.context.view_layer.update();oldH=head.matrix_local.copy();children=[(o,o.matrix_local.copy())for o in head.children]
head.location=P((-.58,.48,.60));bpy.context.view_layer.update();newH=head.matrix_local.copy();T=newH.inverted()@oldH
for o,m in children:o.matrix_local=T@m
for o in list(head.children):
 if o.type=='MESH' and (o.name.startswith('Head |') or o.name.startswith('Face |')):bpy.data.objects.remove(o,do_unlink=True)
# The asymmetric upper boundary climbs into the lower coil. It is not a
# straight collar edge. A broad back and side cheeks form the head's volume.
def facepoint(t,u,front=True):
 w=np.interp(t,[0,.20,.50,.80,1],[.30,.35,.255,.105,.001])
 x=u*w+.018*(1-t)**2
 y=.63-1.16*t-.12*u*(1-t)**2-.08*abs(u)*(1-t)**2
 z=.02+.09*t+((.145*(1-abs(u))*(1-.55*t)-.15*(1-abs(u))*(1-t)**4) if front else -(.045+.15*(1-abs(u)**2))*(1-t)**.8)
 if front:
  flow=u+.055*math.sin(t*4.7);crest=(.5+.5*math.cos(flow*math.pi*12+1.2*t))**8
  z+=.006*(crest-.1)*(1-abs(u))*math.sin(math.pi*t)
 return P((x,y,z))
hm=Mesh('Head | continuous asymmetric shield and cheek roots',head,skin);rows=44;cols=24;stride=cols+1;plane=(rows+1)*stride
for front in (True,False):
 for i in range(rows+1):
  for j in range(cols+1):hm.v.append(tuple(T@facepoint(i/rows,-1+2*j/cols,front)))
for side in (0,1):
 for i in range(rows):
  for j in range(cols):
   a=side*plane+i*stride+j;f=(a,a+1,a+stride+1,a+stride);hm.f.append(f if side==0 else tuple(reversed(f)))
for i in range(rows):
 for j in (0,cols):
  a=i*stride+j;b=(i+1)*stride+j;hm.f.append((a,b,b+plane,a+plane))
for i in (0,rows):
 for j in range(cols):
  a=i*stride+j;hm.f.append((a,a+plane,a+plane+1,a+1))
for cs,r in [([(-.20,.29,.02),(-.43,.39,.02),(-.68,.64,-.04),(-.76,.96,-.10)],.080),([( .21,.25,.025),(.44,.44,.01),(.49,.77,-.06),(.39,1.06,-.14)],.088),([(-.12,.025,.035),(-.32,.015,.045),(-.52,.00,.03),(-.84,.18,-.04),(-1.04,.39,-.11)],.095),([( .12,.045,.035),(.32,.05,.045),(.57,.10,.025),(.93,.41,-.04),(1.04,.72,-.11)],.098)]:hm.horn(cs,r)
headmesh=hm.finish();bpy.context.view_layer.objects.active=headmesh
mod=headmesh.modifiers.new('Fused cheek and horn roots','REMESH');mod.mode='VOXEL';mod.voxel_size=.006;mod.adaptivity=0;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
sm=headmesh.modifiers.new('Soft fused tissue','SMOOTH');sm.factor=.28;sm.iterations=2;bpy.ops.object.modifier_apply(modifier=sm.name);clean(headmesh)

# A short, broad black membrane joins the small-coil root to the head sides
# and back. Its low rings follow the head exactly; its upper ring stays on Body.
neck=Mesh('Neck | continuous skinned cranial membrane',body,skin);rings=35;around=40
bodycenter=P((-.55,.91,.48));bodywidth=.34;bodydepth=.205
headcenter=oldH@P((0,-.14,.035));headwidth=.14;headdepth=.025
root_indices=[];head_indices=[];weights=[]
for i in range(rings):
 t=i/(rings-1);e=t*t*(3-2*t);center=bodycenter.lerp(headcenter,e)
 width=bodywidth*(1-e)+headwidth*e+.020*math.sin(t*math.pi)
 depth=bodydepth*(1-e)+headdepth*e
 # The local head axes gradually replace the fixed root axes.
 X=Vector((1,0,0)).lerp(oldH.to_3x3()@Vector((1,0,0)),e).normalized();Z=Vector((0,-1,0)).lerp(oldH.to_3x3()@Vector((0,-1,0)),e).normalized()
 for j in range(around):
  a=j*math.tau/around
  # Broad overlapping folds wrap around the back and cheek, not a thin stalk.
  fold=.012*math.sin(t*math.tau*4+a*2)*math.sin(math.pi*t)
  p=center+X*(math.cos(a)*width)+Z*(math.sin(a)*(depth+fold))
  neck.v.append(tuple(p));w=min(1,max(0,(t-.10)/.56));w=w*w*(3-2*w);weights.append(w)
  if i==0:root_indices.append(len(neck.v)-1)
  if i==rings-1:head_indices.append(len(neck.v)-1)
for i in range(rings-1):
 for j in range(around):
  a=i*around+j;b=i*around+(j+1)%around;neck.f.append((a,b,b+around,a+around))
neck.f.extend([tuple(j for j in reversed(range(around))),tuple((rings-1)*around+j for j in range(around))]);neckmesh=neck.finish()
arm=bpy.data.armatures.new('Guardian cranial junction rig');rig=bpy.data.objects.new('NeckRig',arm);bpy.context.collection.objects.link(rig);rig.parent=body
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
base=arm.edit_bones.new('NeckBaseJoint');base.head=(0,0,0);base.tail=(0,.12,0);base.matrix=Matrix.Identity(4);base.length=.12
hb=arm.edit_bones.new('NeckHeadJoint');hb.parent=base;hb.matrix=newH;hb.length=.12
bpy.ops.object.mode_set(mode='OBJECT')
for name in ('NeckBaseJoint','NeckHeadJoint'):rig.pose.bones[name].rotation_mode='QUATERNION'
vg0=neckmesh.vertex_groups.new(name='NeckBaseJoint');vg1=neckmesh.vertex_groups.new(name='NeckHeadJoint')
for i,w in enumerate(weights):
 if w<1:vg0.add([i],1-w,'REPLACE')
 if w>0:vg1.add([i],w,'REPLACE')
mod=neckmesh.modifiers.new('Continuous Body to Head deformation','ARMATURE');mod.object=rig;mod.use_vertex_groups=True

# The fan lives on the actual asymmetric forehead surface and follows Head.
data=bpy.data.curves.new('Rooted forehead threads','CURVE');data.dimensions='3D';data.resolution_u=1;data.bevel_depth=.0038;data.bevel_resolution=1;data.use_fill_caps=True
paths=[]
for u0 in [-.92,-.72,-.50,-.27,-.07,.18,.44,.69,.91]:
 path=[]
 for t in np.linspace(.04,.985,64):
  u=u0*(.86+.17*math.sin(math.pi*t)+.06*math.sin(math.tau*t+u0)*math.sin(math.pi*t))
  path.append(T@(facepoint(t,u)+Vector((0,-.006,0))))
 paths.append(path)
# Curved diagonal ribs bow toward the nasal center but retain crossings
# throughout the forehead. The bends are smooth and embedded at both ends.
for direction in (-1,1):
 for j,base_t in enumerate([.005,.13,.255,.38,.505,.63]):
  path=[]
  for u in np.linspace(-.94,.94,80):
   t=base_t+direction*.155*u+.235*(1-u*u)+.012*math.sin(u*4+j)
   if .035<t<.975:path.append(T@(facepoint(t,u)+Vector((0,-.006,0))))
  paths.append(path)
for path in paths:
 sp=data.splines.new('POLY');sp.points.add(len(path)-1)
 for j,(point,co) in enumerate(zip(sp.points,path)):
  fade=min(1,j/4,(len(path)-1-j)/4);fade=fade*fade*(3-2*fade)
  point.radius=(.07+.93*fade)*(.87+.13*math.sin(j*.09+len(path)));point.co=(*(co+T.to_3x3()@Vector((0,.012*(1-fade),0))),1)
fan=bpy.data.objects.new('Face | integrated converging forehead lattice',data);bpy.context.collection.objects.link(fan);fan.parent=head;data.materials.append(rune)
bpy.ops.object.select_all(action='DESELECT');fan.select_set(True);bpy.context.view_layer.objects.active=fan;bpy.ops.object.convert(target='MESH');clean(fan)

# The head surface itself is the continuous root membrane. No front cover
# panel is added. Its upper boundary stays on the coil; the lower face and
# horns follow Head. The forehead threads use the same anatomical weight field.
skin_records=[]
def skin_head_surface(obj):
 bpy.context.view_layer.update();to_body=body.matrix_world.inverted()@obj.matrix_world
 for vertex in obj.data.vertices:vertex.co=to_body@vertex.co
 obj.parent=body;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4);obj.data.update()
 a=obj.vertex_groups.new(name='NeckBaseJoint');b=obj.vertex_groups.new(name='NeckHeadJoint');inv=oldH.inverted();fixed=[];moving=[]
 for vertex in obj.data.vertices:
  p=inv@vertex.co;x=p.x;y=p.z;t=max(0,min(1,(.63-y)/1.16))
  for _ in range(6):
   width=float(np.interp(t,[0,.20,.50,.80,1],[.30,.35,.255,.105,.001]));u=max(-1,min(1,(x-.018*(1-t)**2)/max(width,.001)))
   t=max(0,min(1,(.63-.12*u*(1-t)**2-.08*abs(u)*(1-t)**2-y)/1.16))
  w=max(0,min(1,(t-.012)/.30));w=w*w*(3-2*w)
  # Horns emerge from the cheeks; their free tips stay with the moving head.
  lateral=max(0,min(1,(abs(x)-.29)/.16));w=w*(1-lateral)+lateral
  if t<.006 and abs(x)<.30:w=0
  if w<1:a.add([vertex.index],1-w,'REPLACE')
  if w>0:b.add([vertex.index],w,'REPLACE')
  if w==0:fixed.append((vertex.index,vertex.co.copy()))
  if w==1:moving.append((vertex.index,newH.inverted()@vertex.co))
 mod=obj.modifiers.new('Rooted cranial surface deformation','ARMATURE');mod.object=rig;mod.use_vertex_groups=True
 skin_records.append((obj,fixed,moving))
# Fuse the rear root and cheek volume into the same closed scalp. The root
# ends inside the forehead volume, eliminating its former exposed cap/ledge.
neckmesh.modifiers.clear()
bpy.ops.object.select_all(action='DESELECT');headmesh.select_set(True);neckmesh.select_set(True);bpy.context.view_layer.objects.active=headmesh;bpy.ops.object.join()
headmesh.vertex_groups.clear()
mod=headmesh.modifiers.new('Continuous scalp and rear root union','REMESH');mod.mode='VOXEL';mod.voxel_size=.0055;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
mod=headmesh.modifiers.new('Soft cranial junction','SMOOTH');mod.factor=.40;mod.iterations=3;bpy.ops.object.modifier_apply(modifier=mod.name);clean(headmesh)
skin_head_surface(headmesh);skin_head_surface(fan)
head['noseLocal']=list(T@facepoint(1,0))

# Re-evaluate actual occlusion but only author colors on the newly created skin.
aostats=bake_guardian_cavity(root,radius=.65,samples=12,strength=.74)
for obj in (headmesh,):
 m=obj.data;co=np.array([tuple(v.co)for v in m.vertices]);x,y,z=co.T;noise=.5+.22*np.sin(8*x+5*z)+.15*np.sin(15*y-4*z)
 colors=np.array([.002,.008,.005])[None,:]+np.array([.009,.029,.017])[None,:]*np.clip(noise,0,1)[:,None]
 ao=np.empty(len(m.vertices)*4);m.color_attributes['GuardianCavityAO'].data.foreach_get('color',ao);colors*=ao.reshape(-1,4)[:,0,None]
 layer=m.color_attributes.new(name='GuardianSurface',type='BYTE_COLOR',domain='POINT');layer.data.foreach_set('color',np.c_[colors,np.ones(len(colors))].ravel());m.color_attributes.active_color_index=list(m.color_attributes).index(layer);m.color_attributes.render_color_index=list(m.color_attributes).index(layer)
 uv=m.uv_layers.get('MicroSurfaceUV')or m.uv_layers.new(name='MicroSurfaceUV');values=np.zeros((len(m.loops),2))
 for p in m.polygons:
  axis=int(np.argmax(np.abs(p.normal)));axes=((1,2),(0,2),(0,1))[axis]
  for loop in p.loop_indices:values[loop]=co[m.loops[loop].vertex_index,list(axes)]*2.1
 uv.data.foreach_set('uv',values.ravel());m.update()

rest=head.rotation_euler.to_quaternion() if head.rotation_mode!='QUATERNION' else head.rotation_quaternion.copy();head.rotation_mode='QUATERNION';head.rotation_quaternion=rest
exhale=Quaternion((1,0,0),math.radians(-58))@rest;delta=rest.inverted()@exhale
checks=[{'fraction':t} for t in (0,.25,.5,.75,1)]
def pose(t):
 head.rotation_quaternion=rest.slerp(exhale,t);rig.pose.bones['NeckHeadJoint'].rotation_quaternion=Quaternion().slerp(delta,t);bpy.context.view_layer.update()
pose(0)
for check in checks:
 pose(check['fraction']);dg=bpy.context.evaluated_depsgraph_get();errs={}
 for obj,fixed,moving in skin_records:
  ev=obj.evaluated_get(dg);em=ev.to_mesh()
  errs[obj.name]={'bodyEndpointError':max([(ev.matrix_world@em.vertices[i].co-body.matrix_world@p).length for i,p in fixed]or[0]),'headEndpointError':max([(ev.matrix_world@em.vertices[i].co-head.matrix_world@p).length for i,p in moving]or[0])}
  ev.to_mesh_clear()
 check['rootedHeadAndLattice']=errs
pose(0)
audits=[]
for obj in (headmesh,fan):
 bm=bmesh.new();bm.from_mesh(obj.data);audits.append({'mesh':obj.name,'vertices':len(bm.verts),'faces':len(bm.faces),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges)});bm.free()
report={'revision':9,'headSkin':True,'faceSkin':True,'inputBlendSha256':hashlib.sha256((BASE/'guardian-v2-finish-sculpt.blend').read_bytes()).hexdigest(),'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'reference':'public/dogs-archive-20261028/reference/guardian-head-junction.jpg','headPivot':'rebased to upper rooted head; Rest child world positions preserved','jointNames':['NeckBaseJoint','NeckHeadJoint'],'deformationChecks':checks,'meshAudit':audits,'ao':aostats,'secondsBeforeRender':time.time()-START}
(OUT/'junction-validation.json').write_text(json.dumps(report,indent=2))
source=bpy.data.texts.new('dogs_guardian_v2_head_junction.py');source.write(Path(__file__).read_text());bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'guardian-v2-junction-sculpt.blend'))
scene=bpy.context.scene;cam=scene.camera;cam.data.ortho_scale=2.6;scene.render.resolution_x=768;scene.render.resolution_y=768;scene.cycles.samples=40
clay=bpy.data.materials.new('Junction inspection clay');clay.use_nodes=True;bs=clay.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.35,.37,.35,1);bs.inputs['Roughness'].default_value=.75
look=Vector((-.58,-.55,.45))
views=[('front',(0,-10,0),0),('three-quarter',(7,-10,1),0),('left',(-10,0,0),0),('right',(10,0,0),0),('back',(0,10,0),0),('half',(7,-10,1),.5),('exhale',(7,-10,1),1)]
for name,offset,t in views:
 pose(t);cam.location=look+Vector(offset);cam.rotation_euler=(look-cam.location).to_track_quat('-Z','Y').to_euler();scene.view_layers[0].material_override=clay;scene.render.filepath=str(OUT/('junction-clay-'+name+'.png'));bpy.ops.render.render(write_still=True)
 if name in ('front','three-quarter','exhale'):
  scene.view_layers[0].material_override=None;scene.render.filepath=str(OUT/('junction-pbr-'+name+'.png'));bpy.ops.render.render(write_still=True)
pose(0);print('JUNCTION_DONE',time.time()-START,report,flush=True)
