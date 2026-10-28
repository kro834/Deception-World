"""Non-public finish study: Meshy-informed relief, authored PBR and actual cavity AO.
Loads the canonical v2 base sculpture. No reference bitmap is projected onto it.
"""
import bpy,bmesh,sys,json,time,math,hashlib,ast
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/dogs-archive/rebuild-v2/finish-study';OUT.mkdir(exist_ok=True)
TEX=OUT/'textures';TEX.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts/blender'))
from guardian_cavity_ao import bake_guardian_cavity,physical_meshes
START=time.time()
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'output/dogs-archive/rebuild-v2/guardian-v2-clay.blend'))
root=bpy.data.objects['GuardianV_Root']

def vertex_data(mesh):
 co=np.empty(len(mesh.vertices)*3);no=co.copy();mesh.vertices.foreach_get('co',co);mesh.vertices.foreach_get('normal',no)
 return co.reshape(-1,3),no.reshape(-1,3)
def curvature(mesh,co,no):
 edges=np.empty(len(mesh.edges)*2,dtype=np.int32);mesh.edges.foreach_get('vertices',edges);edges=edges.reshape(-1,2)
 sums=np.zeros_like(co);counts=np.zeros(len(co))
 for a,b in ((edges[:,0],edges[:,1]),(edges[:,1],edges[:,0])):
  np.add.at(sums,a,co[b]);np.add.at(counts,a,1)
 return np.sum((co-sums/np.maximum(counts[:,None],1))*no,axis=1)

# Rolled aperture lips and shallow directional tissue folds, only on the main
# already-manifold shell. Central S-anatomy, tail and thin leaf layers stay intact.
shell=next(o for o in physical_meshes(root) if o.name.startswith('Shell'))
co,no=vertex_data(shell.data);curv=curvature(shell.data,co,no);x,y,z=co.T
warp=1.3*np.sin(3*x+4*y)+.7*np.sin(6*y-2*z)
fold=(.5+.5*np.sin(27*z+8*x+warp))**4
relief=.010*(fold-.30)+.012*np.clip(curv/.006,0,1)
tailt=np.clip((-z-.80)/2.95,0,1);cx=.08+.32*np.sin(tailt*math.tau+math.pi)-.30*tailt;cy=.26-.28*np.sin(tailt*math.pi*1.5)
angle=np.arctan2(y-cy,x-cx);growth=(.5+.5*np.cos(angle*6+tailt*5+np.sin(tailt*8)))**4
tailmask=np.clip((-z-.85)/.45,0,1)
relief=relief*(1-tailmask)+tailmask*(.010*(growth-.3)*(1-tailt)+.006*np.clip(curv/.006,0,1))
# Coiling shoulder wrinkles follow the whorl's own tilted plane instead of
# a global noise direction. Their roots blend into the broad dorsal membrane.
wx=(x-.94)*math.cos(math.pi/6)-(y-.57)*math.sin(math.pi/6);wy=z-2.65
radial=np.sqrt((wx/1.13)**2+wy**2);theta=np.arctan2(wy,wx)
plane_distance=-(x-.94)*.5-(y-.57)*math.cos(math.pi/6)
whorlmask=np.clip((1.16-radial)/.18,0,1)*np.clip((.70-np.abs(plane_distance))/.22,0,1)
pleat=(.5+.5*np.sin(theta*27+radial*7+1.1*np.sin(theta*3)))**4
relief+=whorlmask*(.014*(pleat-.22))*np.sqrt(np.minimum(radial,1))
co+=no*relief[:,None];shell.data.vertices.foreach_set('co',co.ravel());shell.data.update()
# A very light relaxation removes voxel stair stepping without flattening lips.
bpy.context.view_layer.objects.active=shell
sm=shell.modifiers.new('Gentle sculpt surface relaxation','SMOOTH');sm.factor=.24;sm.iterations=2
bpy.ops.object.modifier_apply(modifier=sm.name)
# Recover the authored frond centerlines, not a camera projection, to align
# tissue folds and mineral color with each curved anatomical strip.
tree=ast.parse((ROOT/'scripts/blender/dogs_guardian_v2.py').read_text())
frond_controls=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='fronds' for t in n.targets))
def catmull(cs,steps=24):
 cs=np.asarray(cs,float);ps=[]
 for i in range(len(cs)-1):
  p0,p1,p2,p3=cs[max(0,i-1)],cs[i],cs[i+1],cs[min(len(cs)-1,i+2)]
  for j in range(steps):
   t=j/steps;ps.append(.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
 ps.append(cs[-1]);return np.array(ps)
flow={}
for ob in physical_meshes(root):
 if not ob.name.startswith('Frond_'):continue
 idx=int(ob.name[6:8]);controls,width,depth,teeth=frond_controls[idx]
 ps=catmull(np.asarray(controls)-np.asarray(controls[0]));ps=ps[:,[0,2,1]];ps[:,1]*=-1
 delta=np.diff(ps,axis=0);length=np.linalg.norm(delta,axis=1);arc=np.r_[0,np.cumsum(length)]
 tangent=delta/length[:,None];side=np.cross(tangent,np.array([0,-1,0]));side/=np.linalg.norm(side,axis=1)[:,None]
 co,no=vertex_data(ob.data);sarc=np.zeros(len(co));u=np.zeros(len(co));bendnormal=np.zeros_like(co)
 for begin in range(0,len(co),1200):
  points=co[begin:begin+1200];rel=points[:,None,:]-ps[None,:-1,:]
  alpha=np.clip(np.sum(rel*delta[None,:,:],axis=2)/(length*length)[None,:],0,1)
  dist=rel-alpha[:,:,None]*delta[None,:,:]
  ii=np.argmin(np.sum(dist*dist,axis=2),axis=1);jj=np.arange(len(points));aa=alpha[jj,ii]
  ds=arc[ii]+aa*length[ii];tt=ds/arc[-1]
  ws=width*(.43+.57*np.sin(np.minimum(tt/.98,1)*math.pi)**.55)*(1-tt)**.48+.003
  sarc[begin:begin+len(points)]=ds
  bendnormal[begin:begin+len(points)]=np.cross(side[ii],tangent[ii])
  u[begin:begin+len(points)]=np.sum(dist[jj,ii]*side[ii],axis=1)/ws
 sg=1 if idx%2==0 else -1;t=sarc/arc[-1]
 u=np.clip(u,-1.25,1.25);strand=.5+.5*np.sin(sarc*25+u*4.5+1.1*np.sin(sarc*5+idx))
 relief=(strand**4-.22)*(.032 if idx in (5,6) else .018 if idx<5 else .010)*np.maximum(0,1-np.abs(u))**.6*(1-t)**.5
 baseco=co.copy();accepted=0
 for strength in (1.,.65,.35,0.):
  adjusted=baseco+bendnormal*relief[:,None]*strength
  ob.data.vertices.foreach_set('co',adjusted.ravel());ob.data.update()
  bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.faces.ensure_lookup_table();bm.faces.index_update();bm.verts.index_update();tree=BVHTree.FromBMesh(bm,epsilon=0);sets=[set(v.index for v in f.verts) for f in bm.faces]
  overlaps=sum(a<b and not sets[a].intersection(sets[b]) for a,b in tree.overlap(tree));bm.free()
  if overlaps==0:accepted=strength;break
 print('CORRUGATION_SCALE',ob.name,accepted,flush=True)
 flow[ob.name]=(sarc,u,sg,strand)
print('RELIEF_COMPLETE',flush=True)

# Refine the face's cross-lines into diagonal bowed curves on the actual
# ridged shield, retaining the long converging fan and the same HeadPivot.
old=bpy.data.objects.get('Face | converging curved fan lattice')
if old:
 material=old.data.materials[0];head=old.parent;bpy.data.objects.remove(old,do_unlink=True)
 data=bpy.data.curves.new('Converging forehead threads','CURVE');data.dimensions='3D';data.resolution_u=1;data.bevel_depth=.0038;data.bevel_resolution=1;data.use_fill_caps=True
 def facepoint(t,u):
  w=np.interp(t,[0,.22,.55,.82,1],[.245,.26,.18,.078,.001]);y=.37-.90*t;z=.02+.09*t+.16*(1-abs(u))*(1-.60*t)+.006
  return (u*w,-z,y,1)
 paths=[]
 for u0 in [-.92,-.72,-.53,-.28,-.08,.16,.41,.67,.90]:paths.append([facepoint(t,u0*(1-.25*t)+.12*u0*math.sin(t*math.pi)) for t in np.linspace(.02,.98,45)])
 for direction in (-1,1):
  for base in ([.05,.21,.39,.54,.68,.83] if direction<0 else [.13,.30,.46,.62,.79,.90]):
   path=[]
   for u in np.linspace(-.94,.94,48):
    t=base+direction*.29*u+.10*(1-u*u)
    if .015<t<.965:path.append(facepoint(t,u))
   if len(path)>3:paths.append(path)
 for path in paths:
  spline=data.splines.new('POLY');spline.points.add(len(path)-1)
  for point,co in zip(spline.points,path):point.co=co
 face=bpy.data.objects.new('Face | curved diagonal fan lattice',data);bpy.context.collection.objects.link(face);face.parent=head;data.materials.append(material)
 bpy.ops.object.select_all(action='DESELECT');face.select_set(True);bpy.context.view_layer.objects.active=face;bpy.ops.object.convert(target='MESH')
 bm=bmesh.new();bm.from_mesh(face.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(face.data);bm.free();face.data.update()

# Verify the supplied helper on a 2k-vertex actual mesh first (see ao-probe.json).
# Its visibility is multiplied exactly once into GuardianSurface below; it is
# NOT simultaneously connected as a second AO multiplier in the material.
ao=bake_guardian_cavity(root,radius=.68,samples=12,strength=.76)
print('CAVITY_COMPLETE',ao,flush=True)

# Two seamless micro-surface sets. These are analytic texture assets, not
# projected source-art silhouettes. AO is vertex data, ORM red therefore = 1.
def texture(name,array):
 h,w=array.shape[:2];im=bpy.data.images.new(name,width=w,height=h,alpha=True)
 im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(array.astype(np.float32).ravel());im.filepath_raw=str(TEX/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
sets={}
for kind in ('Skin','Bone'):
 n=512;v,u=np.mgrid[0:n,0:n]/n;ta=math.tau
 h=.50*np.sin(ta*(6*u+2*v)+1.2*np.sin(ta*2*v))+.09*np.sin(ta*(15*u-11*v))+.02*np.sin(ta*(37*u+29*v))
 du=(np.roll(h,-1,1)-np.roll(h,1,1))*n*.5;dv=(np.roll(h,-1,0)-np.roll(h,1,0))*n*.5
 strength=.0025 if kind=='Skin' else .0035
 vec=np.stack((-du*strength,-dv*strength,np.ones_like(h)),axis=-1);vec/=np.linalg.norm(vec,axis=-1)[...,None]
 normal=np.concatenate((vec*.5+.5,np.ones((n,n,1))),axis=-1)
 rough=(.72 if kind=='Skin' else .61)+.055*h
 orm=np.stack((np.ones_like(h),np.clip(rough,.44,.84),np.full_like(h,.015),np.ones_like(h)),axis=-1)
 sets[kind]=(texture(kind.lower()+'-micro-normal',normal),texture(kind.lower()+'-micro-orm',orm))

for ob in physical_meshes(root):
 mesh=ob.data;co,no=vertex_data(mesh);curv=curvature(mesh,co,no)
 # Smooth low-frequency mottling follows actual local surfaces and stays stable
 # through orbit/pose. Bone has dark interiors and subdued moss-green ridges.
 world=np.asarray([tuple(ob.matrix_world@Vector(c)) for c in co]);x,y,z=world.T
 broad=.5+.23*np.sin(3.7*x+2.1*z+.8*np.sin(y*4))+.15*np.sin(7.1*y-3.2*z)+.08*np.sin(17*x+11*y+7*z)
 broad=np.clip(broad,0,1);ridge=np.clip(curv/(.0035 if mesh.materials[0].name.startswith('Bone') else .009),0,1)
 kind='Bone' if mesh.materials[0].name.startswith('Bone') else 'Skin'
 if kind=='Bone':
  mix=np.clip(.035+.16*broad**1.7+.68*ridge**1.3,0,1)
  low=np.array([.003,.011,.007]);high=np.array([.21,.32,.23])
 else:
  mix=np.clip(.15+.55*broad+.20*ridge,0,1)
  low=np.array([.0015,.004,.0025]);high=np.array([.007,.023,.013])
 colors=low[None,:]+(high-low)[None,:]*mix[:,None]
 if kind=='Skin':
  rim=np.clip(curv/.007,0,1)*(.35+.28*broad)
  edge=np.array([.06,.12,.075])
  colors=colors*(1-rim[:,None])+edge[None,:]*rim[:,None]
  if ob.name in flow:
   sarc,u,sg,strand=flow[ob.name]
   mineral=np.clip((u*sg+.05)/1.05,0,1)*(.30+.62*strand**2)
   colors=colors*(1-mineral[:,None])+np.array([.09,.18,.11])[None,:]*mineral[:,None]
   fine=(.5+.5*np.sin(sarc*46+u*8+np.sin(sarc*7)))**10
   colors+=np.array([.012,.030,.013])[None,:]*fine[:,None]*np.maximum(0,1-np.abs(u))[:,None]
 old=mesh.color_attributes['GuardianCavityAO'];aov=np.empty(len(co)*4);old.data.foreach_get('color',aov);aov=aov.reshape(-1,4)[:,0]
 colors*=aov[:,None]
 if ob.name.startswith('Shell') or ob.name.startswith('Tail'):
  tailt=np.clip((-z-.80)/2.95,0,1);cx=.08+.32*np.sin(tailt*math.tau+math.pi)-.30*tailt;cy=.26-.28*np.sin(tailt*math.pi*1.5)
  angle=np.arctan2(y-cy,x-cx);growth=(.5+.5*np.cos(angle*6+tailt*5+np.sin(tailt*8)))**4
  tailcolor=np.array([.0015,.007,.003])[None,:]+np.array([.035,.075,.045])[None,:]*(.12+.65*growth+.23*ridge)[:,None]
  tailcolor*=aov[:,None];mask=np.clip((-z-.85)/.45,0,1)
  colors=colors*(1-mask[:,None])+tailcolor*mask[:,None]
 # Subtle fine-grained variation makes the color density independent of AO.
 colors*=((.97+.03*np.sin(12*x+9*y+7*z)))[:,None]
 layer=mesh.color_attributes.get('GuardianSurface') or mesh.color_attributes.new(name='GuardianSurface',type='BYTE_COLOR',domain='POINT')
 rgba=np.concatenate((colors,np.ones((len(colors),1))),axis=1);layer.data.foreach_set('color',rgba.ravel())
 mesh.color_attributes.active_color_index=list(mesh.color_attributes).index(layer);mesh.color_attributes.render_color_index=list(mesh.color_attributes).index(layer)
 # Per-face triplanar-style UV projection gives a small, seamless tile footprint.
 # UV seams affect only low-amplitude micro-normal/roughness, never albedo/AO.
 uv=mesh.uv_layers.get('MicroSurfaceUV') or mesh.uv_layers.new(name='MicroSurfaceUV')
 values=np.zeros((len(mesh.loops),2),dtype=np.float32)
 for f in mesh.polygons:
  axis=int(np.argmax(np.abs(f.normal)));axes=((1,2),(0,2),(0,1))[axis]
  for loop in f.loop_indices:values[loop]=co[mesh.loops[loop].vertex_index,list(axes)]*2.1
 uv.data.foreach_set('uv',values.ravel());mesh.uv_layers.active=uv
 mesh.update()

for mat in bpy.data.materials:
 if not mat.use_nodes:continue
 nodes=mat.node_tree.nodes;links=mat.node_tree.links
 bs=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
 if bs is None:continue
 if mat.name.startswith('Rune'):
  bs.inputs['Base Color'].default_value=(.060,.180,.070,1);bs.inputs['Emission Color'].default_value=(.018,.110,.033,1);bs.inputs['Emission Strength'].default_value=.75;bs.inputs['Roughness'].default_value=.56
  continue
 if not (mat.name.startswith('Bone') or mat.name.startswith('Skin') or mat.name.startswith('Mouth')):continue
 kind='Bone' if mat.name.startswith('Bone') else 'Skin'
 bs.inputs['Base Color'].default_value=(1,1,1,1);bs.inputs['Metallic'].default_value=.015;bs.inputs['Roughness'].default_value=1;bs.inputs['Coat Weight'].default_value=.025
 attr=nodes.new('ShaderNodeVertexColor');attr.layer_name='GuardianSurface';links.new(attr.outputs['Color'],bs.inputs['Base Color'])
 uv=nodes.new('ShaderNodeUVMap');uv.uv_map='MicroSurfaceUV'
 norm=nodes.new('ShaderNodeTexImage');norm.image=sets[kind][0];norm.extension='REPEAT';links.new(uv.outputs[0],norm.inputs['Vector'])
 nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.35;links.new(norm.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
 tex=nodes.new('ShaderNodeTexImage');tex.image=sets[kind][1];tex.extension='REPEAT';links.new(uv.outputs[0],tex.inputs['Vector'])
 sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],bs.inputs['Roughness']);links.new(sep.outputs['Blue'],bs.inputs['Metallic'])

# Sparse wet-looking streaks follow the same inner anatomical edge. The
# majority of each black lamina retains its dry rough micro-surface material.
for ob in physical_meshes(root):
 if ob.name not in flow:continue
 original=ob.data.materials[0]
 wet=bpy.data.materials.get('Skin | localized damp tissue')
 if wet is None:
  wet=original.copy();wet.name='Skin | localized damp tissue'
  bs=next(n for n in wet.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  for link in list(bs.inputs['Roughness'].links):wet.node_tree.links.remove(link)
  bs.inputs['Roughness'].default_value=.42;bs.inputs['Coat Weight'].default_value=.075
 ob.data.materials.append(wet);wet_index=len(ob.data.materials)-1;sarc,u,sg,strand=flow[ob.name]
 for f in ob.data.polygons:
  ids=list(f.vertices);ss=float(np.mean(sarc[ids]));uu=float(np.mean(u[ids]))
  if uu*sg>.24 and math.sin(ss*5.1+uu*3.2)>.58:f.material_index=wet_index

surface_audit=[]
for obj in physical_meshes(root):
 if not obj.name.startswith('Frond_'):continue
 bm=bmesh.new();bm.from_mesh(obj.data);record={'mesh':obj.name,'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges)}
 bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.faces.ensure_lookup_table();bm.faces.index_update();bm.verts.index_update();tree=BVHTree.FromBMesh(bm,epsilon=0);sets=[set(v.index for v in f.verts) for f in bm.faces]
 record['nonAdjacentTriangleOverlapPairs']=sum(a<b and not sets[a].intersection(sets[b]) for a,b in tree.overlap(tree));surface_audit.append(record);bm.free()
(OUT/'surface-audit.json').write_text(json.dumps(surface_audit,indent=2))
scene=bpy.context.scene;scene.cycles.samples=48
scene.view_settings.view_transform='AgX';scene.render.film_transparent=True
# Keep the same clay lights and cameras so the finish comparison is meaningful.
cam=scene.camera
source=bpy.data.texts.new('dogs_guardian_v2_finish.py');source.write(Path(__file__).read_text())
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'guardian-v2-finish-sculpt.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in [root,*root.children_recursive]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'guardian-v2-finish.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_vertex_color='ACTIVE')
asset=OUT/'guardian-v2-finish.glb'
report={'stage':'unapproved Meshy-informed surface and PBR study','sourceClay':'../guardian-v2-clay.blend','meshReference':'Priority Meshy e4k9Ga (01a1821d-a3ac-74a2-b412-a75febccb2c9), five screenshots, 4913290 faces; actual geometry not downloaded. Old TYSiYp is secondary.','ao':ao,'aoApplied':'Once in GuardianSurface vertex color; no occlusion texture multiplication','albedo':'Procedural world-space mottling and actual curvature, baked to vertex color','normalRoughness':'Two analytic seamless tangent-normal and ORM microtexture sets','assetBytes':asset.stat().st_size,'assetSha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'elapsedBeforeRender':time.time()-START,'approved':False}
(OUT/'finish-manifest.json').write_text(json.dumps(report,indent=2))
def P(x):return Vector((x[0],-x[2],x[1]))
for name,at in [('front',(0,.05,16)),('back',(0,.05,-16)),('left',(-16,.05,0)),('right',(16,.05,0)),('three-quarter',(11,.6,14))]:
 cam.location=P(at);cam.rotation_euler=(P((0,.05,0))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/('finish-'+name+'.png'));bpy.ops.render.render(write_still=True)
 print('FINISH_RENDER',name,flush=True)
print('FINISH_DONE',time.time()-START,flush=True)
