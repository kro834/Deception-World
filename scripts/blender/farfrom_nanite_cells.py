# Far From Saga's second nanite (kit B; owner, 2026-10-22: 「ファーフロムの変身は
# レクソナンスとほぼ同じですがナノマシンが別のものも使う様になり、二種類使うので
# もう一種類をBlenderで生成して。」), for public/far-from-nanites-20261022/cells.webp.
# Kit A is Rexonance's hex chip (scripts/blender/nanite_cells.py); this is
# its crystal counterpart, drawn by the same swarm code from the same layout.
# Blender 5.2 LTS (4.2+), Cycles. Either Blender itself or Blender as a
# Python module (the bpy wheel):
#
#   Blender -b --factory-startup -P scripts/blender/farfrom_nanite_cells.py -- <out dir> [px=128]
#   python scripts/blender/farfrom_nanite_cells.py <out dir> [px=128]
#
# Writes 128 px PNGs (scripts/build-far-from-nanites.mjs downsamples them
# with lanczos3 to the 32 px cells and 16 px mips):
#   tumble-<tone>-<f>.png  f 00-23: R_f = Rz(7.5° f) · Ry(15° f), the crystal
#                          flipping once about its long axis (its black-silver
#                          back towards the viewer at f9-f15) while it turns
#                          half a revolution in the image plane (its 180°
#                          symmetry closes the loop); f0 upright and face-on
#   unfold-<tone>-<k>.png  k 1-6 (k0 is tumble f0): the crystal opening into a
#                          flat square plate framed by its collar
#   bead-<k>.png           k 0-7: a wobbling molten gold bead
# Tones (the swarm's slots, kit A's names): ice → aqua (水色の透明な結晶),
# pink → prism (lilac glass, rainbow fire and core: 虹色の中枢), white →
# silver (colourless, 白銀), gold → gold (amber glass in a black-silver
# collar: 黒銀と黄金).
#
# The crystal: a tall rhombus (half-length 0.86, half-width 0.52, each
# side drawn in 6% at its middle so the tips stay sharp) as a girdle band
# 0.10 deep, a crown on the front (a table at 38% scale, 0.30 high, twelve
# facets round it) and a pavilion behind (eight facets to an apex 0.27
# deep): one closed solid of clear glass (IOR 1.65) whose pavilion is a
# tinted mirror inside and black-silver outside. Each facet also glows by
# how squarely it faces the studio's bright upper left, so its planes read
# at 12 px (the prism's glow turns through the hues with the facet). Round
# the girdle a thin rounded gold collar (0.07 proud); inside, under the
# table, a small core (white-hot, its tone round it) on a soft halo in a
# gold ring; on the back an emissive seam at 55% of the outline. Lit by
# kit A's RIG-A (key upper left, ice rim lower right) plus a low kicker, in
# a dark studio world that only the facets mirror (the film is clear).
#
# Environment (all optional): NANITE_CPU=1 renders on the CPU (otherwise the
# first GPU backend found: Metal, OptiX, CUDA, HIP, oneAPI; else the CPU);
# FARFROM_NANITE_SAMPLES (default 192); FARFROM_NANITE_ONLY, comma-separated
# fnmatch patterns of the frames to render (e.g. "tumble-*-00,unfold-*-6").
import fnmatch
import math
import os
import sys

import bpy  # first: as a Python module, bpy brings bmesh and mathutils with it

import bmesh
from mathutils import Quaternion, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = ARGS[0]
PX = int(ARGS[1]) if len(ARGS) > 1 else 128
SAMPLES = int(os.environ.get("FARFROM_NANITE_SAMPLES", "192"))
ONLY = [p for p in os.environ.get("FARFROM_NANITE_ONLY", "").split(",") if p]
os.makedirs(OUT, exist_ok=True)

ORTHO = 2.08  # the 32 px cell, as kit A
DOME = Vector((-0.55, 0.65, 0.52)).normalized()  # the studio's bright quarter
FRAMES = 24

# The crystal's proportions (object units; the cell is 2.08 across).
L = 0.86  # half-length, tip to centre (y)
W = 0.52  # half-width at the girdle (x)
PINCH = 0.06  # each side's middle drawn in by this share of its distance
ZG = 0.05  # the girdle band's half-depth
ZT = 0.30  # the table's height
TABLE = 0.38  # the table's scale of the girdle outline
ZP = 0.27  # the pavilion apex's depth
COLLAR = 0.07  # the collar's outward width
ZC = 0.07  # the collar's half-height
CORE_R = 0.10
CORE_Z = 0.06
HALO_R = 0.27
RING_R = 0.155
SQUARE = 0.90  # the unfolded plate's half-extent (the collar frames it to ~0.98)

# Per tone (colours linear): the crystal's tint, its thin film (nm, 0 none),
# the core's colour and peak, the halo's strength (rainbow: its hue turns
# round the core), the pavilion's inner mirror, the collar and core ring.
TONES = {
    "aqua": dict(tint=(0.30, 0.80, 1.0), film=0, glow=(0.40, 0.88, 1.0), peak=12.0, halo=2.2, rainbow=False, facets=0.55,
                 inside=(0.14, 0.30, 0.40), collar="gold", ring="gold"),
    "prism": dict(tint=(0.80, 0.68, 1.0), film=380, glow=(0.90, 0.62, 1.0), peak=12.0, halo=2.4, rainbow=True, facets=0.55,
                  inside=(0.30, 0.22, 0.40), collar="gold", ring="gold"),
    "silver": dict(tint=(0.85, 0.90, 1.0), film=0, glow=(0.92, 0.96, 1.0), peak=12.0, halo=1.8, rainbow=False, facets=0.45,
                   inside=(0.30, 0.32, 0.36), collar="gold", ring="gold"),
    "gold": dict(tint=(1.0, 0.72, 0.30), film=0, glow=(1.0, 0.84, 0.50), peak=12.0, halo=2.0, rainbow=False, facets=0.50,
                 inside=(0.40, 0.28, 0.10), collar="silver", ring="silver"),
}
GOLD = (1.0, 0.68, 0.26)
BLACK_SILVER = (0.16, 0.17, 0.19)


def wanted(name):
    return not ONLY or any(fnmatch.fnmatch(name, pattern) for pattern in ONLY)


def scene(width, height, samples=SAMPLES):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    if os.environ.get("NANITE_CPU") != "1":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for backend in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
            try:
                prefs.compute_device_type = backend
            except TypeError:
                continue
            prefs.get_devices()
            if any(d.type == backend for d in prefs.devices):
                for device in prefs.devices:
                    device.use = device.type == backend
                sc.cycles.device = "GPU"
                break
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.seed = 22
    sc.cycles.max_bounces = 16
    sc.cycles.glossy_bounces = 10
    sc.cycles.transmission_bounces = 14
    sc.cycles.transparent_max_bounces = 8
    sc.cycles.filter_width = 1.0
    sc.render.resolution_x = width
    sc.render.resolution_y = height
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    world = bpy.data.worlds.new("world")
    sc.world = world
    world.use_nodes = True
    # Never seen (the film is transparent), only mirrored: a dark studio
    # whose upper left glows (dot of the direction with DOME), so each facet
    # mirrors its own brightness, lit above and left, dark below and right.
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    background = nodes["Background"]
    coords = nodes.new("ShaderNodeTexCoord")
    dot = nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = DOME
    links.new(coords.outputs["Generated"], dot.inputs[0])
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = -0.3
    ramp.inputs["From Max"].default_value = 1.0
    links.new(dot.outputs["Value"], ramp.inputs["Value"])
    power = nodes.new("ShaderNodeMath")
    power.operation = "POWER"
    power.inputs[1].default_value = 2.0
    links.new(ramp.outputs["Result"], power.inputs[0])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (0.010, 0.014, 0.024, 1)
    mix.inputs["B"].default_value = (0.50, 0.56, 0.66, 1)
    links.new(power.outputs[0], mix.inputs["Factor"])
    links.new(mix.outputs["Result"], background.inputs[0])
    background.inputs[1].default_value = 1.0
    return sc


def rig_a(sc):
    """Kit A's RIG-A (area lights aimed at the origin; key upper-left, ice rim
    lower-right) and a low kicker from the upper left, which the crown's
    steep upper-left facets mirror face-on."""
    for name, location, power, size, colour in (
        ("key", (-4.5, 4.5, 7), 900, 4, (1, 0.94, 0.85)),
        ("spec", (-3.2, 3.4, 8.5), 420, 0.7, (1, 0.97, 0.9)),
        ("rim", (6, -1, 2), 600, 2.5, (0.55, 0.9, 1)),
        ("under", (-1.2, -6.5, 1.5), 150, 3, (1, 0.7, 0.9)),
        ("kicker", (-6.2, 6.2, 1.1), 260, 2.0, (1, 0.97, 0.92)),
    ):
        light = bpy.data.lights.new(name, "AREA")
        light.energy = power
        light.size = size
        light.color = colour
        obj = bpy.data.objects.new(name, light)
        obj.location = Vector(location)
        obj.rotation_euler = (-obj.location).to_track_quat("-Z", "Y").to_euler()
        sc.collection.objects.link(obj)


def camera(sc, scale):
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    data.ortho_scale = scale
    obj = bpy.data.objects.new("camera", data)
    obj.location = (0, 0, 10)
    sc.collection.objects.link(obj)
    sc.camera = obj


def principled(name, base, metallic, roughness, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def crystal(name, tint, film, facets, rainbow):
    """Clear glass (IOR 1.65) in its tint; `film` nm of thin film
    (iridescence). Each facet also glows by how squarely it faces the
    studio's bright quarter (its world normal · DOME, from -0.1 to 1, ^1.5,
    × `facets`), so the planes read at 12 px as a gem lit from the upper
    left; with `rainbow` that glow's hue turns with the facet's direction
    (the prism's fire)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*tint, 1)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.02
    bsdf.inputs["IOR"].default_value = 1.65
    bsdf.inputs["Transmission Weight"].default_value = 1.0
    bsdf.inputs["Emission Color"].default_value = (*(0.65 * v + 0.35 for v in tint), 1)
    if film:
        bsdf.inputs["Thin Film Thickness"].default_value = film
        bsdf.inputs["Thin Film IOR"].default_value = 1.45
    geometry = nodes.new("ShaderNodeNewGeometry")
    dot = nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = DOME
    links.new(geometry.outputs["Normal"], dot.inputs[0])
    facing = nodes.new("ShaderNodeMapRange")
    facing.inputs["From Min"].default_value = -0.1
    facing.inputs["From Max"].default_value = 1.0
    links.new(dot.outputs["Value"], facing.inputs["Value"])
    power = nodes.new("ShaderNodeMath")
    power.operation = "POWER"
    power.inputs[1].default_value = 1.5
    links.new(facing.outputs["Result"], power.inputs[0])
    gain = nodes.new("ShaderNodeMath")
    gain.operation = "MULTIPLY"
    gain.inputs[1].default_value = facets
    links.new(power.outputs[0], gain.inputs[0])
    links.new(gain.outputs[0], bsdf.inputs["Emission Strength"])
    if rainbow:
        separate = nodes.new("ShaderNodeSeparateXYZ")
        links.new(geometry.outputs["Normal"], separate.inputs[0])
        angle = nodes.new("ShaderNodeMath")
        angle.operation = "ARCTAN2"
        links.new(separate.outputs["Y"], angle.inputs[0])
        links.new(separate.outputs["X"], angle.inputs[1])
        hue = nodes.new("ShaderNodeMapRange")
        hue.inputs["From Min"].default_value = -math.pi
        hue.inputs["From Max"].default_value = math.pi
        links.new(angle.outputs[0], hue.inputs["Value"])
        hsv = nodes.new("ShaderNodeCombineColor")
        hsv.mode = "HSV"
        links.new(hue.outputs["Result"], hsv.inputs[0])
        hsv.inputs[1].default_value = 0.55
        hsv.inputs[2].default_value = 1.0
        links.new(hsv.outputs[0], bsdf.inputs["Emission Color"])
    return mat


def two_sided(name, inside, outside):
    """The pavilion: `inside` where a ray meets it from within the crystal
    (its back face), `outside` seen from behind; each (colour, roughness)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    geometry = nodes.new("ShaderNodeNewGeometry")
    mix = nodes.new("ShaderNodeMixShader")
    shaders = []
    for base, roughness in (outside, inside):
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (*base, 1)
        bsdf.inputs["Metallic"].default_value = 1.0
        bsdf.inputs["Roughness"].default_value = roughness
        shaders.append(bsdf)
    links.new(geometry.outputs["Backfacing"], mix.inputs["Fac"])
    links.new(shaders[0].outputs[0], mix.inputs[1])
    links.new(shaders[1].outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def radial(nodes, links):
    """(object-space x, y, and |(x, y)|) sockets."""
    coords = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], separate.inputs[0])
    combine = nodes.new("ShaderNodeCombineXYZ")
    links.new(separate.outputs["X"], combine.inputs["X"])
    links.new(separate.outputs["Y"], combine.inputs["Y"])
    length = nodes.new("ShaderNodeVectorMath")
    length.operation = "LENGTH"
    links.new(combine.outputs[0], length.inputs[0])
    return separate.outputs["X"], separate.outputs["Y"], length.outputs["Value"]


def emitter(name, colour, strength, radius=None):
    """Pure emission. With `radius`, `strength` is the core's peak: white-hot
    at its centre, falling (smoothstep) to 15% of the peak by 0.6 `radius`
    (object space), so the glow round the die keeps its tone instead of
    clipping to white in the Standard view."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*colour, 1)
    emission.inputs["Strength"].default_value = strength
    if radius:
        _, _, length = radial(nodes, links)
        falloff = nodes.new("ShaderNodeMapRange")
        falloff.inputs["From Min"].default_value = 0.0
        falloff.inputs["From Max"].default_value = radius * 0.6
        falloff.inputs["To Min"].default_value = strength
        falloff.inputs["To Max"].default_value = strength * 0.15
        falloff.interpolation_type = "SMOOTHSTEP"
        links.new(length, falloff.inputs["Value"])
        links.new(falloff.outputs["Result"], emission.inputs["Strength"])
    links.new(emission.outputs[0], out.inputs["Surface"])
    return mat


def halo(name, colour, strength, rainbow):
    """The core's glow: a disc behind it adding light strength · (1 - r/R)²
    (transparent otherwise); with `rainbow` its hue turns once round it."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    x, y, length = radial(nodes, links)
    u = nodes.new("ShaderNodeMapRange")
    u.inputs["From Min"].default_value = 0.0
    u.inputs["From Max"].default_value = HALO_R
    u.inputs["To Min"].default_value = 1.0
    u.inputs["To Max"].default_value = 0.0
    links.new(length, u.inputs["Value"])
    square = nodes.new("ShaderNodeMath")
    square.operation = "POWER"
    square.inputs[1].default_value = 2.0
    links.new(u.outputs["Result"], square.inputs[0])
    gain = nodes.new("ShaderNodeMath")
    gain.operation = "MULTIPLY"
    gain.inputs[1].default_value = strength
    gain.name = "gain"
    links.new(square.outputs[0], gain.inputs[0])
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*colour, 1)
    links.new(gain.outputs[0], emission.inputs["Strength"])
    if rainbow:
        angle = nodes.new("ShaderNodeMath")
        angle.operation = "ARCTAN2"
        links.new(y, angle.inputs[0])
        links.new(x, angle.inputs[1])
        hue = nodes.new("ShaderNodeMapRange")
        hue.inputs["From Min"].default_value = -math.pi
        hue.inputs["From Max"].default_value = math.pi
        links.new(angle.outputs[0], hue.inputs["Value"])
        hsv = nodes.new("ShaderNodeCombineColor")
        hsv.mode = "HSV"
        links.new(hue.outputs["Result"], hsv.inputs[0])
        hsv.inputs[1].default_value = 0.7
        hsv.inputs[2].default_value = 1.0
        links.new(hsv.outputs[0], emission.inputs["Color"])
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    add = nodes.new("ShaderNodeAddShader")
    links.new(transparent.outputs[0], add.inputs[0])
    links.new(emission.outputs[0], add.inputs[1])
    links.new(add.outputs[0], out.inputs["Surface"])
    return mat


# --- The outline ---------------------------------------------------------------------
def outline():
    """The girdle's 8 points, counter-clockwise from the right corner:
    corner, pinched side middle, corner, … (corners at even indices)."""
    corners = [Vector((W, 0)), Vector((0, L)), Vector((-W, 0)), Vector((0, -L))]
    points = []
    for i, c in enumerate(corners):
        n = corners[(i + 1) % 4]
        points.append(c.copy())
        points.append((c + n) / 2 * (1 - PINCH))
    return points


def offset_ring(points, distance):
    """`points` (a closed, counter-clockwise polygon) moved `distance`
    outward, mitred at each vertex."""
    out = []
    count = len(points)
    for i, p in enumerate(points):
        a = points[i - 1]
        b = points[(i + 1) % count]
        d0 = (p - a).normalized()
        d1 = (b - p).normalized()
        n0 = Vector((d0.y, -d0.x))
        n1 = Vector((d1.y, -d1.x))
        miter = (n0 + n1) / (1 + n0.dot(n1))
        out.append(p + miter * distance)
    return out


UNIT = outline()
SQUARE_PATH = [((1, 0), (1, 1)), ((1, 1), (0, 1)), ((0, 1), (-1, 1)), ((-1, 1), (-1, 0)),
               ((-1, 0), (-1, -1)), ((-1, -1), (0, -1)), ((0, -1), (1, -1)), ((1, -1), (1, 0))]


def rhombus_to_square(x, y, half):
    """The point at the same radial fraction and outline fraction on a
    square of half-extent `half`: the crystal's corners go to the square's
    side middles and its pinched side middles to the square's corners, so
    similar rings become similar rings (the unfold's map)."""
    rho = math.hypot(x, y)
    if rho < 1e-9:
        return x, y
    d = Vector((x / rho, y / rho))
    for i in range(8):
        a = UNIT[i]
        e = UNIT[(i + 1) % 8] - a
        den = d.x * e.y - d.y * e.x
        if abs(den) < 1e-12:
            continue
        # The ray t·d meets a + s·e.
        t = (a.x * e.y - a.y * e.x) / den
        s = (a.x * d.y - a.y * d.x) / den
        if t > 0 and -1e-9 <= s <= 1 + 1e-9:
            break
    else:
        return x, y
    scale = rho / t
    (x0, y0), (x1, y1) = SQUARE_PATH[i]
    s = min(1.0, max(0.0, s))
    return (x0 + (x1 - x0) * s) * half * scale, (y0 + (y1 - y0) * s) * half * scale


# --- The crystal ---------------------------------------------------------------------
def build_crystal(sc):
    bm = bmesh.new()
    top = [bm.verts.new((p.x, p.y, ZG)) for p in UNIT]
    bottom = [bm.verts.new((p.x, p.y, -ZG)) for p in UNIT]
    table = [bm.verts.new((UNIT[2 * i].x * TABLE, UNIT[2 * i].y * TABLE, ZT)) for i in range(4)]
    apex = bm.verts.new((0, 0, -ZP))
    pavilion = []
    for j in range(8):
        k = (j + 1) % 8
        bm.faces.new((bottom[j], bottom[k], top[k], top[j]))
        pavilion.append(bm.faces.new((bottom[k], bottom[j], apex)))
    for i in range(4):
        c0 = top[2 * i]
        m = top[2 * i + 1]
        c1 = top[(2 * i + 2) % 8]
        t0 = table[i]
        t1 = table[(i + 1) % 4]
        bm.faces.new((c0, m, t0))
        bm.faces.new((m, c1, t1))
        bm.faces.new((m, t1, t0))
    bm.faces.new(table)
    bm.normal_update()
    for face in pavilion:
        face.material_index = 1
    mesh = bpy.data.meshes.new("crystal")
    bm.to_mesh(mesh)
    bm.free()
    body = bpy.data.objects.new("crystal", mesh)
    sc.collection.objects.link(body)
    for poly in mesh.polygons:
        poly.use_smooth = False  # flat facets: the crystal's light is in its planes
    body.shape_key_add(name="basis")
    plate = body.shape_key_add(name="plate")
    for vertex, point in zip(mesh.vertices, plate.data):
        x, y, z = vertex.co
        x, y = rhombus_to_square(x, y, SQUARE)
        # The crown sinks to a low faceted plate; the pavilion follows.
        z = ZG + (z - ZG) * 0.12 if z > ZG else (-ZG + (z + ZG) * 0.15 if z < -ZG else z * 0.8)
        point.co = (x, y, z)
    return body


def build_collar(sc):
    inner = offset_ring(UNIT, -0.004)
    outer = offset_ring(UNIT, COLLAR)
    bm = bmesh.new()
    rings = [[bm.verts.new((p.x, p.y, z)) for p in ring] for ring, z in ((inner, -ZC), (outer, -ZC), (outer, ZC), (inner, ZC))]
    for r in range(4):
        a = rings[r]
        b = rings[(r + 1) % 4]
        for j in range(8):
            k = (j + 1) % 8
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bm.normal_update()
    mesh = bpy.data.meshes.new("collar")
    bm.to_mesh(mesh)
    bm.free()
    collar = bpy.data.objects.new("collar", mesh)
    sc.collection.objects.link(collar)
    # A rounded bead: its upper-left flank catches the key light face-on.
    bevel = collar.modifiers.new("bevel", "BEVEL")
    bevel.width = 0.03
    bevel.segments = 4
    bevel.limit_method = "ANGLE"
    for poly in mesh.polygons:
        poly.use_smooth = True
    # Unfolded, the collar frames the plate: its inner rings on the square's
    # edge, its outer rings the same square grown by COLLAR (an even border).
    collar.shape_key_add(name="basis")
    plate = collar.shape_key_add(name="plate")
    edge = [rhombus_to_square(p.x, p.y, SQUARE) for p in UNIT]
    for index, point in enumerate(plate.data):
        r, j = divmod(index, 8)
        grow = (SQUARE + COLLAR) / SQUARE if r in (1, 2) else 1.0
        point.co = (edge[j][0] * grow, edge[j][1] * grow, (-ZC if r < 2 else ZC) * 0.75)
    return collar


def build_core(sc):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=CORE_R, segments=32, ring_count=16, location=(0, 0, CORE_Z))
    core = bpy.context.active_object
    core.name = "core"
    for poly in core.data.polygons:
        poly.use_smooth = True
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=HALO_R, fill_type="NGON", location=(0, 0, CORE_Z - 0.03))
    glow = bpy.context.active_object
    glow.name = "halo"
    bpy.ops.mesh.primitive_torus_add(
        major_radius=RING_R, minor_radius=0.02, major_segments=48, minor_segments=10, location=(0, 0, CORE_Z)
    )
    ring = bpy.context.active_object
    ring.name = "core ring"
    for poly in ring.data.polygons:
        poly.use_smooth = True
    return core, glow, ring


def build_seam(sc):
    """The back's lit seam: the outline at 55% on the pavilion's surface."""
    data = bpy.data.curves.new("seam", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 1
    data.bevel_depth = 0.016
    data.bevel_resolution = 2
    spline = data.splines.new("POLY")
    spline.points.add(len(UNIT) - 1)
    r = 0.55
    z = -ZP + r * (ZP - ZG) - 0.008
    for point, p in zip(spline.points, UNIT):
        point.co = (p.x * r, p.y * r, z, 1)
    spline.use_cyclic_u = True
    seam = bpy.data.objects.new("seam", data)
    sc.collection.objects.link(seam)
    return seam


def render(sc, name):
    sc.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)


def tumble(f):
    """R_f: a flip about the long axis (once round in 24 frames) under half a
    turn in the image plane; the crystal's 180° symmetry closes the loop."""
    spin = Quaternion((0, 0, 1), math.pi * f / FRAMES)
    flip = Quaternion((0, 1, 0), 2 * math.pi * f / FRAMES)
    return spin @ flip


sc = scene(PX, PX)
camera(sc, ORTHO)
rig_a(sc)
body = build_crystal(sc)
collar = build_collar(sc)
core, glow, ring = build_core(sc)
seam = build_seam(sc)
root = bpy.data.objects.new("nanite", None)
sc.collection.objects.link(root)
for obj in (body, collar, core, glow, ring, seam):
    obj.parent = root
root.rotation_mode = "QUATERNION"
for obj, slots in ((body, 2), (collar, 1), (core, 1), (glow, 1), (ring, 1), (seam, 1)):
    for _ in range(slots):
        obj.data.materials.append(None)

metals = {
    "gold": principled("gold", GOLD, 1.0, 0.30),
    "silver": principled("black-silver", BLACK_SILVER, 1.0, 0.22),
}
for tone, spec in TONES.items():
    body.data.materials[0] = crystal(f"{tone}-crystal", spec["tint"], spec["film"], spec["facets"], spec["rainbow"])
    body.data.materials[1] = two_sided(f"{tone}-pavilion", inside=(spec["inside"], 0.45), outside=((0.09, 0.10, 0.12), 0.34))
    collar.data.materials[0] = metals[spec["collar"]]
    ring.data.materials[0] = metals[spec["ring"]]
    core_material = emitter(f"{tone}-core", spec["glow"], spec["peak"], radius=CORE_R)
    core.data.materials[0] = core_material
    halo_material = halo(f"{tone}-halo", spec["glow"], spec["halo"], spec["rainbow"])
    glow.data.materials[0] = halo_material
    seam.data.materials[0] = emitter(f"{tone}-seam", spec["glow"], 1.4)
    body.data.shape_keys.key_blocks["plate"].value = 0.0
    collar.data.shape_keys.key_blocks["plate"].value = 0.0
    core.scale = ring.scale = glow.scale = (1, 1, 1)
    core.location.z = ring.location.z = CORE_Z
    glow.location.z = CORE_Z - 0.03
    for f in range(FRAMES):
        name = f"tumble-{tone}-{f:02d}"
        if not wanted(name):
            continue
        root.rotation_quaternion = tumble(f)
        render(sc, name)
    if tone == "gold":
        continue
    # The unfold, face-on: k1-k6 (k0 is tumble f0). The core sinks and dims
    # to 20% as the crown flattens into the plate.
    root.rotation_quaternion = Quaternion((1, 0, 0, 0))
    falloff = next(n for n in core_material.node_tree.nodes if n.type == "MAP_RANGE")
    gain = halo_material.node_tree.nodes["gain"]
    for k in range(1, 7):
        s = k / 6
        e = s * s * (3 - 2 * s)
        body.data.shape_keys.key_blocks["plate"].value = e
        collar.data.shape_keys.key_blocks["plate"].value = e
        core.location.z = ring.location.z = CORE_Z * (1 - e) + 0.02 * e
        glow.location.z = core.location.z - 0.03 * (1 - e) - 0.005 * e
        core.scale = (1 - 0.35 * e,) * 3
        ring.scale = (1 + 0.6 * e, 1 + 0.6 * e, 1 - 0.5 * e)
        strength = spec["peak"] * (1 - 0.8 * e)
        falloff.inputs["To Min"].default_value = strength
        falloff.inputs["To Max"].default_value = strength * 0.15
        gain.inputs[1].default_value = spec["halo"] * (1 - 0.8 * e)
        name = f"unfold-{tone}-{k}"
        if wanted(name):
            render(sc, name)
    print("NANITE rendered", tone, flush=True)

# The molten gold bead: a metaball pair, wobbling — alone in the scene.
for obj in list(sc.collection.objects):
    if obj.type not in {"LIGHT", "CAMERA"}:
        bpy.data.objects.remove(obj)
ball = bpy.data.metaballs.new("bead")
ball.resolution = 0.02
ball.render_resolution = 0.02
for co, radius in (((-0.20, 0.05, 0), 0.62), ((0.26, -0.06, 0), 0.50)):
    element = ball.elements.new()
    element.co = co
    element.radius = radius
bead = bpy.data.objects.new("bead", ball)
sc.collection.objects.link(bead)
bead.data.materials.append(principled("molten", (1.0, 0.43, 0.05), 1.0, 0.14, (1.0, 0.67, 0.19), 0.9))
for k in range(8):
    w = 0.12 * math.sin(2 * math.pi * k / 8)
    bead.scale = (1 + w, 1 - w, 1)
    name = f"bead-{k}"
    if wanted(name):
        render(sc, name)
print("NANITE-DONE", flush=True)
