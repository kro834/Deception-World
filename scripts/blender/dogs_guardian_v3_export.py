"""Export step for dogs_guardian_v3.py (executed in its namespace).

Writes guardian-<stamp>.glb (raw) and guardian-<stamp>-draco.glb with exact Rest/Exhale
clips injected the same way as the v2 pipeline, plus model-manifest.json.
"""
# names from the generator namespace: bpy, np, math, json, time, hashlib, struct, os, Path, Vector,
# Quaternion, Matrix, root, body, head, jaw, rig, pivots, OUT, opts, START, HERE, mesh_audit, P


def glpos(p):
    return [round(p.x, 7), round(p.z, 7), round(-p.y, 7)]


def xyzw(q):
    return [round(q.x, 8), round(q.z, 8), round(-q.y, 8), round(q.w, 8)]


stamp = opts["stamp"]
SOURCE_SCRIPTS = globals().get("SOURCE_SCRIPTS") or [
    "scripts/blender/guardian_v3_lib.py", "scripts/blender/dogs_guardian_v3.py", "scripts/blender/dogs_guardian_v3_export.py"]
MANIFEST_STAGE = globals().get("MANIFEST_STAGE") or "v3 browser candidate"
# ---- browser detail reduction (only meshes that are still dense)
changes = []
for ob in [o for o in root.children_recursive if o.type == "MESH"]:
    for name in [layer.name for layer in ob.data.color_attributes]:
        if name != "GuardianSurface":
            ob.data.color_attributes.remove(ob.data.color_attributes[name])
    if ob.data.color_attributes.get("GuardianSurface"):
        ob.data.color_attributes.active_color_index = 0
        ob.data.color_attributes.render_color_index = 0
    ratio = 1.0
    if opts["decimate"] == "1" and ob.name.startswith("Head |") and len(ob.data.polygons) > 60000:
        ratio = 0.5
    if ratio >= 1.0:
        continue
    before = len(ob.data.polygons)
    bpy.context.view_layer.objects.active = ob
    mod = ob.modifiers.new("Browser detail reduction", "DECIMATE")
    mod.decimate_type = "COLLAPSE"; mod.ratio = ratio; mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    changes.append({"mesh": ob.name, "ratio": ratio, "beforeFaces": before, "afterFaces": len(ob.data.polygons)})
checks = [mesh_audit(o) for o in root.children_recursive if o.type == "MESH"]

# ---- poses and clips (identical contract to v2)
targets = [body, head, jaw] + pivots
rest = {}
for ob in targets:
    q = ob.rotation_quaternion.copy() if ob.rotation_mode == "QUATERNION" else ob.rotation_euler.to_quaternion()
    ob.rotation_mode = "QUATERNION"; ob.rotation_quaternion = q; rest[ob.name] = q.copy()
exhale = {body.name: Quaternion((1, 0, 0), math.radians(4)) @ Quaternion((0, 1, 0), math.radians(-3)) @ Quaternion((0, 0, 1), math.radians(2)),
          head.name: Quaternion((1, 0, 0), math.radians(-58)) @ rest[head.name],
          jaw.name: Quaternion((1, 0, 0), math.radians(68)) @ rest[jaw.name]}
for i, ob in enumerate(pivots):
    x = math.radians((6 if i % 2 else -8) * (1 if i < 7 else .65)); y = math.radians(-5 if i % 2 else 6); z = math.radians(4 if i % 2 else -5)
    exhale[ob.name] = Quaternion((1, 0, 0), x) @ Quaternion((0, 1, 0), y) @ Quaternion((0, 0, 1), z) @ rest[ob.name]
joint_delta = rest[head.name].inverted() @ exhale[head.name]
locations = {"Rest": body.location.copy(), "Exhale": body.location + Vector((0, -.04, .08))}
for ob in targets:
    ob.animation_data_clear(); ob.animation_data_create()
    for name, rots in [("Rest", rest), ("Exhale", exhale)]:
        ac = bpy.data.actions.new(name + "_" + ob.name); ob.animation_data.action = ac
        for fr in (1, 49):
            ob.rotation_quaternion = rots[ob.name]; ob.keyframe_insert(data_path="rotation_quaternion", frame=fr)
            if ob == body:
                ob.location = locations[name]; ob.keyframe_insert(data_path="location", frame=fr)
        tr = ob.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, ac)
        st.action_frame_start = 1; st.action_frame_end = 49; tr.mute = True; ob.animation_data.action = None
    ob.rotation_quaternion = rest[ob.name]
rig.animation_data_clear(); rig.animation_data_create()
for name in ("Rest", "Exhale"):
    ac = bpy.data.actions.new(name + "_NeckRig"); rig.animation_data.action = ac
    for bn in ("NeckBaseJoint", "NeckHeadJoint"):
        bone = rig.pose.bones[bn]; bone.rotation_mode = "QUATERNION"
        for fr in (1, 49):
            bone.rotation_quaternion = joint_delta if name == "Exhale" and bn == "NeckHeadJoint" else Quaternion()
            bone.keyframe_insert(data_path="rotation_quaternion", frame=fr)
    tr = rig.animation_data.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, 1, ac)
    st.action_frame_start = 1; st.action_frame_end = 49; tr.mute = True; rig.animation_data.action = None
for bone in rig.pose.bones:
    bone.rotation_quaternion = Quaternion()
body.location = locations["Rest"]; scene = bpy.context.scene; scene.render.fps = 30; scene.frame_start = 1; scene.frame_end = 49; scene.frame_set(1)


def setpose(name):
    rots = rest if name == "Rest" else exhale
    for ob in targets:
        ob.rotation_quaternion = rots[ob.name]
    body.location = locations[name]
    rig.pose.bones["NeckHeadJoint"].rotation_quaternion = joint_delta if name == "Exhale" else Quaternion()
    bpy.context.view_layer.update()


posechecks = {}
for name in ("Rest", "Exhale"):
    setpose(name)
    socket = bpy.data.objects["MouthSocket"].matrix_world.translation; aim = bpy.data.objects["MouthAim"].matrix_world.translation
    nose = head.matrix_world @ Vector(head["noseLocal"]); lower = jaw.matrix_world @ P((0, -.34, .09))
    posechecks[name] = {"mouthSocket": glpos(socket), "mouthAim": glpos(aim), "direction": glpos((aim - socket).normalized()), "jawTipSeparation": (nose - lower).length}
setpose("Rest")
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"guardian-{stamp}-browser.blend"))
bpy.ops.object.select_all(action="DESELECT")
for ob in [root, *root.children_recursive]:
    ob.select_set(True)


def inject_clips(path):
    raw = path.read_bytes(); jlen = struct.unpack_from("<I", raw, 12)[0]; g = json.loads(raw[20:20 + jlen]); offset = 20 + jlen
    blen = struct.unpack_from("<I", raw, offset)[0]; binary = bytearray(raw[offset + 8:offset + 8 + blen])

    def accessor(data, kind, count):
        while len(binary) % 4:
            binary.append(0)
        pos = len(binary); binary.extend(struct.pack("<" + "f" * len(data), *data))
        view = len(g.setdefault("bufferViews", [])); g["bufferViews"].append({"buffer": 0, "byteOffset": pos, "byteLength": len(data) * 4})
        acc = {"bufferView": view, "componentType": 5126, "count": count, "type": kind}
        if kind == "SCALAR":
            acc.update({"min": [min(data)], "max": [max(data)]})
        idx = len(g.setdefault("accessors", [])); g["accessors"].append(acc); return idx
    t = accessor([0, 1.6], "SCALAR", 2); nodes = {n.get("name"): i for i, n in enumerate(g["nodes"])}; g["animations"] = []
    parents = {child: i for i, node in enumerate(g["nodes"]) for child in node.get("children", [])}

    def qnode(i):
        q = g["nodes"][i].get("rotation", [0, 0, 0, 1]); return Quaternion((q[3], q[0], q[1], q[2]))

    def qworld(i):
        return (qworld(parents[i]) if i in parents else Quaternion()) @ qnode(i)
    hidx = nodes[head.name]; hx = xyzw(exhale[head.name])
    headworldEx = (qworld(parents[hidx]) if hidx in parents else Quaternion()) @ Quaternion((hx[3], hx[0], hx[1], hx[2]))
    headWorldDelta = headworldEx @ qworld(hidx).inverted()
    jointRotations = {}
    for bn in ("NeckBaseJoint", "NeckHeadJoint"):
        ni = nodes[bn]; q0 = qnode(ni)
        q1 = qworld(parents[ni]).inverted() @ headWorldDelta @ qworld(ni) if bn == "NeckHeadJoint" else q0
        jointRotations[bn] = {"Rest": q0, "Exhale": q1}
    for name, rots in [("Rest", rest), ("Exhale", exhale)]:
        anim = {"name": name, "samplers": [], "channels": []}
        for ob in targets:
            q = xyzw(rots[ob.name]); acc = accessor(q + q, "VEC4", 2); idx = len(anim["samplers"])
            anim["samplers"].append({"input": t, "output": acc, "interpolation": "LINEAR"}); anim["channels"].append({"sampler": idx, "target": {"node": nodes[ob.name], "path": "rotation"}})
        for bn in ("NeckBaseJoint", "NeckHeadJoint"):
            qb = jointRotations[bn][name]; q = [qb.x, qb.y, qb.z, qb.w]; acc = accessor(q + q, "VEC4", 2); idx = len(anim["samplers"])
            anim["samplers"].append({"input": t, "output": acc, "interpolation": "LINEAR"}); anim["channels"].append({"sampler": idx, "target": {"node": nodes[bn], "path": "rotation"}})
        xyz = glpos(locations[name]); acc = accessor(xyz + xyz, "VEC3", 2); idx = len(anim["samplers"])
        anim["samplers"].append({"input": t, "output": acc, "interpolation": "LINEAR"}); anim["channels"].append({"sampler": idx, "target": {"node": nodes[body.name], "path": "translation"}}); g["animations"].append(anim)
    g["buffers"][0]["byteLength"] = len(binary); js = json.dumps(g, separators=(",", ":"), ensure_ascii=True).encode(); js += b" " * ((-len(js)) % 4); binary += b"\0" * ((-len(binary)) % 4)
    final = struct.pack("<III", 0x46546c67, 2, 12 + 8 + len(js) + 8 + len(binary)) + struct.pack("<II", len(js), 0x4e4f534a) + js + struct.pack("<II", len(binary), 0x004e4942) + binary
    path.write_bytes(final); return g


assets = []; lastg = None
for compressed, name in [(False, f"guardian-{stamp}.glb"), (True, f"guardian-{stamp}-draco.glb")]:
    path = OUT / name; staging = OUT / ("." + name + ".staging.glb")
    bpy.ops.export_scene.gltf(filepath=str(staging), export_format="GLB", use_selection=True, export_animations=False, export_yup=True,
                              export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_image_format="AUTO",
                              export_draco_mesh_compression_enable=compressed, export_draco_mesh_compression_level=7,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10,
                              export_draco_texcoord_quantization=12, export_draco_color_quantization=10)
    lastg = inject_clips(staging); os.replace(staging, path)
    assets.append({"file": name, "draco": compressed, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
report = {"stage": MANIFEST_STAGE, "version": 3, "revision": stamp,
          "model": assets[-1]["file"], "assetBytes": assets[-1]["bytes"], "assetSha256": assets[-1]["sha256"],
          "coordinateSystem": {"up": "+Y", "front": "+Z", "unit": "meter"},
          "nodes": {"root": root.name, "body": body.name, "head": head.name, "jaw": jaw.name, "mouth": "MouthSocket", "mouthAim": "MouthAim",
                    "tentacles": [o.name for o in pivots], "neckRig": "NeckRig", "joints": ["NeckBaseJoint", "NeckHeadJoint"]},
          "animations": ["Rest", "Exhale"], "transitionSeconds": 1.6,
          "poses": {"rest": {o.name: {"quaternion": xyzw(rest[o.name]), **({"position": glpos(locations["Rest"])} if o == body else {})} for o in targets},
                    "exhale": {o.name: {"quaternion": xyzw(exhale[o.name]), **({"position": glpos(locations["Exhale"])} if o == body else {})} for o in targets}},
          "poseChecks": posechecks, "changes": changes, "meshAudit": checks,
          "meshStats": {"objects": len(checks), "vertices": sum(m["vertices"] for m in checks), "triangles": sum(m["triangles"] for m in checks)},
          "assets": assets,
          "colorAttribute": "GuardianSurface COLOR_0: authored role colours per organ (bone/ink/membrane/glow)",
          "secondsBeforeRender": time.time() - START,
          "sourceScripts": SOURCE_SCRIPTS,
          "skinMeshes": [o.name for o in root.children_recursive if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)],
          "skinCount": len(lastg.get("skins", [])),
          "jointNodes": [n for n in lastg["nodes"] if n.get("name") in ("NeckBaseJoint", "NeckHeadJoint")],
          "sourceSha256": {p: hashlib.sha256((HERE.parent.parent / p).read_bytes()).hexdigest() for p in SOURCE_SCRIPTS},
          "referenceImagesUsedAsTexture": False}
(OUT / "model-manifest.json").write_text(json.dumps(report, indent=2))
print("EXPORT_DONE", round(time.time() - START, 1), json.dumps(assets), flush=True)
