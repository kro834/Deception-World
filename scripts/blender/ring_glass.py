# Glass and hologram ring assets for the site-wide ring redesign (owner,
# 2026-11-23: 「円環型の構成と動的で弾んだアニメーション」, material 「ガラスと
# ホログラム」, pre-rendered and moved by CSS).
#
#   Blender -b --factory-startup -P ring_glass.py -- <out dir> <stage> [samples]
#
# stage: "clay" (shape blockout, grey clay, studio light) or "final" (glass +
#        hologram, transparent film).
# Units: metres. Every ring lies in the XZ plane facing the camera on -Y,
# centred on the origin, so each layer can spin in the CSS plane exactly
# about the image centre. The orthographic camera frames ORTHO = 2.2 m, so
# a 2.0 m outer diameter fills 91 % of the image.
#
# Writes one RGBA PNG per layer:
#   hero-outer / hero-mid / hero-inner / hero-holo  1024 px  (home orbit centre)
#   frame                                           768 px   (portrait frame)
#   cover                                           1600 px  (route change ring)
#   mark                                            576 px   (section divider; shipped at 192)
import math
import os
import sys

import bmesh
import bpy

ARGS = sys.argv[sys.argv.index("--") + 1:]
OUT = ARGS[0]
STAGE = ARGS[1] if len(ARGS) > 1 else "clay"
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else (64 if STAGE == "clay" else 512)
os.makedirs(OUT, exist_ok=True)
ORTHO = 2.2
TAU = math.tau


def ring_mesh(name, radius, width, depth, corner=0.25, arcs=None, segs=384, prof=6):
    """A ring of rounded-rectangle section (radial width x depth along Y),
    corner = fraction of the smaller side rounded. arcs: list of (a0, a1)
    in turns; None = closed. Built in XZ around the origin."""
    r = min(width, depth) * corner
    # The section outline, counter-clockwise in (radial, y) about its centre.
    pts = []
    hw, hd = width / 2, depth / 2
    for cx, cy, start in ((hw - r, hd - r, 0), (-hw + r, hd - r, 90), (-hw + r, -hd + r, 180), (hw - r, -hd + r, 270)):
        for k in range(prof + 1):
            a = math.radians(start + 90 * k / prof)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    spans = arcs or [(0.0, 1.0)]
    for a0, a1 in spans:
        closed = arcs is None
        n = max(8, int(segs * (a1 - a0)))
        rows = []
        for i in range(n if closed else n + 1):
            t = TAU * (a0 + (a1 - a0) * i / n)
            c, s = math.cos(t), math.sin(t)
            rows.append([bm.verts.new(((radius + px) * c, py, (radius + px) * s)) for px, py in pts])
        m = len(pts)
        count = len(rows)
        for i in range(count if closed else count - 1):
            ra, rb = rows[i], rows[(i + 1) % count]
            for j in range(m):
                bm.faces.new((ra[j], ra[(j + 1) % m], rb[(j + 1) % m], rb[j]))
        if not closed:
            bm.faces.new(list(reversed(rows[0])))
            bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    return obj


def ticks(name, radius, count, length, width, depth, skip=0):
    """Engraved index ticks standing proud of a ring's face (toward -Y),
    every `skip`-th one longer."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for i in range(count):
        t = TAU * i / count
        L = length * (1.8 if skip and i % skip == 0 else 1)
        c, s = math.cos(t), math.sin(t)
        tc, ts = -s, c
        quad = []
        for dr, dw in ((-L / 2, -width / 2), (L / 2, -width / 2), (L / 2, width / 2), (-L / 2, width / 2)):
            x = (radius + dr) * c + dw * tc
            z = (radius + dr) * s + dw * ts
            quad.append((x, z))
        lo = [bm.verts.new((x, -depth, z)) for x, z in quad]
        hi = [bm.verts.new((x, 0.0, z)) for x, z in quad]
        bm.faces.new(lo)
        bm.faces.new(list(reversed(hi)))
        for j in range(4):
            bm.faces.new((lo[j], hi[j], hi[(j + 1) % 4], lo[(j + 1) % 4]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    return bpy.data.objects.new(name, mesh)


def collection(name, objs):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    for o in objs:
        col.objects.link(o)
    return col


# --- the assets (a dict of layer -> objects, resolution) ---------------------
def build():
    L = {}
    # Home orbit centre: three counter-spinning layers.
    L["hero-outer"] = ([
        ring_mesh("HeroOuter_Band", 0.9, 0.11, 0.07),
        ticks("HeroOuter_Ticks", 0.9, 120, 0.035, 0.006, 0.042, skip=10),
    ], 1024)
    L["hero-mid"] = ([
        ring_mesh("HeroMid_Arcs", 0.72, 0.05, 0.05, arcs=[(0.02, 0.30), (0.36, 0.64), (0.70, 0.96)]),
    ], 1024)
    L["hero-inner"] = ([
        ring_mesh("HeroInner_Ring", 0.56, 0.025, 0.03),
        ring_mesh("HeroInner_Arc", 0.5, 0.02, 0.025, arcs=[(0.08, 0.42), (0.58, 0.92)]),
    ], 1024)
    L["hero-holo"] = ([ring_mesh("HeroHolo_Line", 0.64, 0.008, 0.008)], 1024)
    # Portrait frame: one band with a key notch at the top.
    L["frame"] = ([
        ring_mesh("Frame_Band", 0.9, 0.1, 0.07, arcs=[(0.27, 1.23)]),
        ring_mesh("Frame_Inner", 0.82, 0.012, 0.02),
    ], 768)
    # Route change: a heavy band and two hairlines.
    L["cover"] = ([
        ring_mesh("Cover_Band", 0.88, 0.16, 0.1),
        ring_mesh("Cover_HairOut", 0.99, 0.008, 0.01),
        ring_mesh("Cover_HairIn", 0.76, 0.008, 0.01),
    ], 1600)
    # Section mark: a chunky ring with four notches, legible at 96 px.
    L["mark"] = ([
        ring_mesh("Mark_Band", 0.78, 0.26, 0.16, arcs=[(a + 0.02, a + 0.23) for a in (0, 0.25, 0.5, 0.75)]),
    ], 576)
    return L


def clay():
    m = bpy.data.materials.new("Clay")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.55, 0.57, 0.62, 1)
    b.inputs["Roughness"].default_value = 0.45
    return m


def glass(name, tint=(0.96, 0.98, 1.0), rough=0.03, film=420.0):
    """Clear glass: full transmission, IOR 1.5, a thin film for the prism
    iridescence (this build's Principled has no dispersion input)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*tint, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["IOR"].default_value = 1.5
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Thin Film Thickness"].default_value = film
    b.inputs["Thin Film IOR"].default_value = 1.33
    return m


# Halo lights the glass reflects and refracts (a glass object shows only
# what it mirrors). They are rings around the view axis, coloured by angle in
# the site's prism palette, so every layer's rim catches the same light all
# the way round and a CSS spin never drags a baked highlight with it.
# (Round 4: flat strips put one blown white blob at the top and left the
# glass invisible on the dark page.)
HALOS = (
    # name, y, radius, thickness, strength, hue offset (turns)
    ("Halo_Front", -3.0, 2.6, 1.4, 1.0, 0.0),
    ("Halo_FrontWide", -1.0, 3.4, 1.2, 0.8, 0.33),
    ("Halo_Back", 2.4, 1.6, 1.4, 0.55, 0.6),
    ("Halo_Side", 0.0, 2.6, 0.9, 0.7, 0.15),
)
PRISM = ((0.0, (0.47, 0.91, 1.0)), (0.3, (0.54, 0.48, 1.0)), (0.55, (1.0, 0.44, 0.85)), (0.78, (1.0, 0.78, 0.42)), (1.0, (0.47, 0.91, 1.0)))


def prism_emission(name, strength, offset):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nodes = nt.nodes
    nodes.remove(nodes["Principled BSDF"])
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    ang = nodes.new("ShaderNodeMath")
    ang.operation = "ARCTAN2"
    turn = nodes.new("ShaderNodeMath")
    turn.operation = "MULTIPLY_ADD"
    turn.inputs[1].default_value = 1 / math.tau
    turn.inputs[2].default_value = 0.5 + offset
    frac = nodes.new("ShaderNodeMath")
    frac.operation = "FRACT"
    ramp = nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = PRISM[0][0], (*PRISM[0][1], 1)
    els[1].position, els[1].color = PRISM[-1][0], (*PRISM[-1][1], 1)
    for pos, col in PRISM[1:-1]:
        e = els.new(pos)
        e.color = (*col, 1)
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = strength
    L = nt.links.new
    L(coord.outputs["Object"], sep.inputs[0])
    L(sep.outputs["Z"], ang.inputs[0])
    L(sep.outputs["X"], ang.inputs[1])
    L(ang.outputs[0], turn.inputs[0])
    L(turn.outputs[0], frac.inputs[0])
    L(frac.outputs[0], ramp.inputs[0])
    L(ramp.outputs["Color"], em.inputs["Color"])
    L(em.outputs[0], nodes["Material Output"].inputs[0])
    return m


def hologram(name, dashes, duty, tail, strength=1.0, offset=0.0):
    """Light lines running inside the glass: `dashes` segments a turn, lit
    for `duty` of each; `tail` > 0 fades the line over the turn from a bright
    head (a sweep the CSS spin carries round), 0 keeps it even. Emission at
    <= 1 keeps the prism hues saturated under the Standard view."""
    m = prism_emission(name, strength, offset)
    nt = m.node_tree
    nodes = nt.nodes
    L = nt.links.new
    em = next(n for n in nodes if n.type == "EMISSION")
    frac = next(n for n in nodes if n.type == "MATH" and n.operation == "FRACT")
    count = nodes.new("ShaderNodeMath")
    count.operation = "MULTIPLY"
    count.inputs[1].default_value = dashes
    cell = nodes.new("ShaderNodeMath")
    cell.operation = "FRACT"
    lit = nodes.new("ShaderNodeMath")
    lit.operation = "LESS_THAN"
    lit.inputs[1].default_value = duty
    fade = nodes.new("ShaderNodeMath")
    fade.operation = "POWER"
    fade.inputs[1].default_value = max(tail, 0.0001) if tail else 0.0
    mask = nodes.new("ShaderNodeMath")
    mask.operation = "MULTIPLY"
    L(frac.outputs[0], count.inputs[0])
    L(count.outputs[0], cell.inputs[0])
    L(cell.outputs[0], lit.inputs[0])
    L(frac.outputs[0], fade.inputs[0])
    L(lit.outputs[0], mask.inputs[0])
    L(fade.outputs[0], mask.inputs[1])
    clear = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    out = nodes["Material Output"]
    L(mask.outputs[0], mix.inputs[0])
    L(clear.outputs[0], mix.inputs[1])
    L(em.outputs[0], mix.inputs[2])
    L(mix.outputs[0], out.inputs[0])
    return m


def strips():
    scene = bpy.context.scene
    for name, y, radius, thick, strength, offset in HALOS:
        obj = ring_mesh(name, radius, thick, thick, corner=0.5, segs=128, prof=3)
        obj.location.y = y
        scene.collection.objects.link(obj)
        obj.data.materials.append(prism_emission(name, strength, offset))
        obj.visible_camera = False
        obj.visible_shadow = False


def studio():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.025, 0.04, 1)
    scene.world = world
    for name, loc, energy, size in (("Key", (-2.5, -3, 2.5), 120, 3), ("Rim", (2.5, -1.5, -2), 80, 2), ("Fill", (0, -4, 0), 15, 6)):
        light = bpy.data.lights.new(name, "AREA")
        light.energy = energy
        light.size = size
        obj = bpy.data.objects.new(name, light)
        obj.location = loc
        scene.collection.objects.link(obj)
        direction = -obj.location
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def camera():
    scene = bpy.context.scene
    cam = bpy.data.cameras.new("Cam")
    cam.type = "ORTHO"
    cam.ortho_scale = ORTHO
    obj = bpy.data.objects.new("Cam", cam)
    obj.location = (0, -10, 0)
    obj.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(obj)
    scene.camera = obj


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = "GPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    camera()
    if STAGE == "clay":
        studio()
    else:
        world = bpy.data.worlds.new("World")
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.016, 0.035, 1)
        scene.world = world
        scene.cycles.film_transparent_glass = True
        scene.cycles.blur_glossy = 0.5
        scene.cycles.sample_clamp_indirect = 5
        strips()
    layers = build()
    if STAGE == "clay":
        pick = lambda o: CLAY
        CLAY = clay()
    else:
        mats = {
            "clear": glass("Glass_Clear"),
            "frost": glass("Glass_Frost", rough=0.35, film=0.0),
            "violet": glass("Glass_Violet", tint=(0.8, 0.74, 1.0), film=520.0),
        }
        holo = {
            "HeroHolo_Line": hologram("Holo_Hero", 72, 0.55, 1.6),
            "HeroInner_Ring": hologram("Holo_Inner", 240, 0.35, 0.0, strength=0.55, offset=0.4),
            "Frame_Inner": hologram("Holo_Frame", 180, 0.5, 0.0, strength=0.7, offset=0.2),
            "Cover_HairOut": hologram("Holo_CoverOut", 1, 1.0, 2.2),
            "Cover_HairIn": hologram("Holo_CoverIn", 120, 0.6, 1.2, offset=0.5),
        }
        base = lambda o: mats["frost"] if "Ticks" in o.name else mats["violet"] if "Mid" in o.name or "Hair" in o.name else mats["clear"]
        pick = lambda o: holo.get(o.name) or base(o)
    cols = {}
    for key, (objs, res) in layers.items():
        for o in objs:
            o.data.materials.append(pick(o))
        cols[key] = collection(key, objs)
    report = {}
    for key, (objs, res) in layers.items():
        for k, col in cols.items():
            col.hide_render = k != key
        scene.render.resolution_x = scene.render.resolution_y = res
        scene.render.filepath = os.path.join(OUT, f"{key}.png")
        bpy.ops.render.render(write_still=True)
        report[key] = res
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"rings-{STAGE}.blend"))
    print("RESULT", report)


main()
