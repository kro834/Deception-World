"""glTF export for the Rexonance build.

export_raw(path)      every object as built (inspection only)
export_release(path)  modifiers applied, crystal tint filled in, static meshes
                      joined per part and material (RX_<Part>_<Family>),
                      animated pivots kept, plus model-manifest.json

Objects stay separate nodes when they have a parent or children (the tail
chain: pivot empties with leaf meshes), or carry the custom property
rx_keep = 1. Glint anchors (RX_Glint_*) are empties and always stay.
The release GLB is then packed with pack_release.mjs (meshopt + quantize).
"""

import json
import os
import time

import bpy

import rx_lib

FAMILY_ORDER = list(rx_lib.FAMILIES)


def _override(objs, active=None):
    return bpy.context.temp_override(
        active_object=active or objs[0],
        object=active or objs[0],
        selected_objects=objs,
        selected_editable_objects=objs,
    )


def apply_modifiers():
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.modifiers]
    for o in meshes:
        with _override([o], o):
            for m in list(o.modifiers):
                try:
                    bpy.ops.object.modifier_apply(modifier=m.name)
                except RuntimeError as e:
                    print("[export] could not apply %s on %s: %s" % (m.name, o.name, e))
                    o.modifiers.remove(m)


def orient_closed_islands():
    """Turn every closed (manifold) island of every mesh outward, measured by
    signed volume. Open sheets are left as they are (the viewer draws thin
    crystal sheets double-sided)."""
    import bmesh

    flipped = 0
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        seen = set()
        changed = False
        for f0 in bm.faces:
            if f0.index in seen:
                continue
            island, stack = [], [f0]
            seen.add(f0.index)
            while stack:
                f = stack.pop()
                island.append(f)
                for e in f.edges:
                    for g in e.link_faces:
                        if g.index not in seen:
                            seen.add(g.index)
                            stack.append(g)
            edges = {e for f in island for e in f.edges}
            if any(len(e.link_faces) != 2 for e in edges):
                continue
            vol = 0.0
            for f in island:
                vs = [v.co for v in f.verts]
                for i in range(1, len(vs) - 1):
                    vol += vs[0].dot(vs[i].cross(vs[i + 1]))
            if vol < 0:
                bmesh.ops.reverse_faces(bm, faces=island)
                flipped += 1
                changed = True
        if changed:
            bm.to_mesh(o.data)
            o.data.update()
        bm.free()
    print("[export] reoriented %d inside-out closed islands" % flipped)


def fill_tint():
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        fams = [m.name for m in o.data.materials if m]
        if "RX_Crystal" in fams and rx_lib.TINT_ATTR not in o.data.color_attributes:
            rx_lib.tint(o)


def _family(o):
    names = [m.name for m in o.data.materials if m]
    return names[0][3:] if len(names) == 1 and names[0].startswith("RX_") else None


def join_static():
    groups = {}
    for o in list(bpy.data.objects):
        if o.type != "MESH" or o.parent is not None or o.children or o.get("rx_keep"):
            continue
        fam = _family(o)
        coll = o.users_collection[0].name if o.users_collection else "RX_Misc"
        if fam is None:
            continue
        groups.setdefault((coll, fam), []).append(o)
    for (coll, fam), objs in groups.items():
        part = coll[3:] if coll.startswith("RX_") else coll
        rx_lib.join(objs, "RX_%s_%s" % (part, fam))


def _triangles(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def manifest(glb_path):
    nodes = []
    glints = []
    total = 0
    for o in sorted(bpy.data.objects, key=lambda x: x.name):
        if o.name.startswith("RX_Glint_"):
            glints.append(
                dict(
                    name=o.name,
                    size=round(float(o.get("rx_glint_size", 0.03)), 4),
                    hue=round(float(o.get("rx_glint_hue", 0.5)), 3),
                )
            )
            continue
        entry = dict(name=o.name, type=o.type, parent=o.parent.name if o.parent else None)
        if o.type == "MESH":
            tris = _triangles(o)
            total += tris
            entry.update(
                triangles=tris, materials=[m.name for m in o.data.materials if m], tint=rx_lib.TINT_ATTR in o.data.color_attributes
            )
        nodes.append(entry)
    return dict(
        model="Rexonance",
        built=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        blender=bpy.app.version_string,
        units="metres; glTF +Y up, the suit faces +Z, its left hand is +X",
        triangles=total,
        materials=["RX_" + f for f in FAMILY_ORDER],
        nodes=nodes,
        glints=glints,
        file=os.path.basename(glb_path),
    )


def _gltf(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_vertex_color="NAME",
        export_vertex_color_name=rx_lib.TINT_ATTR,
        export_all_vertex_colors=False,
        export_extras=True,
        export_materials="EXPORT",
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )


def export_raw(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    _gltf(path)
    print("[export] raw ->", path)
    return path


def export_release(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cam = bpy.data.objects.get("RX_ReviewCam")
    if cam:
        bpy.data.objects.remove(cam)
    for o in list(bpy.data.objects):
        if o.type == "LIGHT":
            bpy.data.objects.remove(o)
    apply_modifiers()
    orient_closed_islands()
    fill_tint()
    join_static()
    _gltf(path)
    man = manifest(path)
    with open(os.path.join(os.path.dirname(path), "model-manifest.raw.json"), "w") as f:
        json.dump(man, f, indent=2, ensure_ascii=False)
    print("[export] release ->", path, "triangles", man["triangles"])
    return path
