# The ファーフロム・ウルトラ nanite, kit C (owner, 2026-10-22: 「ファーフロム・ウルトラだけ
# 体全身が白に染まった後、さらにナノマシンにより追加部分が生成された後、…コンピュータの様な
# 補助インターフェースが腕の外などに展開されます。ウルトラだけ未来的で特殊なシークエンスで、
# 更に別のナノマシンも使うのでBlenderでこれも生成してください。」), for
# public/far-from-nanites-ultra-20261022/cells.webp. Cycles; Blender 4.2+ or the
# bpy module (5.x), either one:
#
#   blender -b --factory-startup -P scripts/blender/farfrom_ultra_nanite_cells.py -- <out dir> [px=128]
#   <python with bpy> -I scripts/blender/farfrom_ultra_nanite_cells.py -- <out dir> [px=128]
#
# Writes 128 px PNGs, named as kit A's nanite_cells.py names its own
# (scripts/build-far-from-ultra-nanites.mjs downsamples them with lanczos3 to
# the 32 px cells and 16 px mips):
#   tumble-<tone>-<f>.png  f 00-23: R_f = quaternion(normalize(0.45, 0.8, 0.4), 2πf/24)
#   unfold-<tone>-<k>.png  k 1-6 (k0 is tumble f0): the unit squaring into a data tile
#   bead-<k>.png           k 0-7: a bead of liquid gold light, wobbling
# NANITE_ONLY=<name,…> renders only those frames (a preview), NANITE_CPU=1
# forces the CPU (otherwise the first GPU backend found, else the CPU).
#
# The unit (not kit A's machined hex chip, nor kit B's crystal shard): a
# round white-ceramic puck r 0.952, 0.31 deep — a clear-coated dome face
# with a gold inlay round its rim, a graphite back — parted at its waist by
# an emissive equator seam. In the face a dark channel (r 0.645-0.84) holds
# the HUD reticle: four emissive arcs (r 0.665-0.815, 81° each, the gaps on
# the cardinal points) that turn one arc (90°) over the 24-frame tumble, so
# f24 = f0. At the centre a gold-bezelled lens (r 0.22), white-hot at its
# heart, falling to the tone and a deep rim. The tone is the unit's light
# (reticle, lens, seams, glyph); the gold unit is gold-plated, its inlay
# white gold. Lit by RIG-U in a dark studio whose wall behind the camera is
# lit (what the clear coat and the gold mirror face-on).
# The unfold: the puck squares into a 1.92 x 1.92 x 0.08 data tile — the
# face floods from the core outward into the tone's lit glass, a circuit
# glyph lights behind that front, the reticle becomes the tile's four corner
# brackets, the inlay its gold frame, and the lens dims to 20%.
import math
import os
import sys

# bpy first: as a Python module it is what puts bmesh and mathutils on the path.
import bpy  # isort: skip
import bmesh  # isort: skip
from mathutils import Quaternion, Vector  # isort: skip

ARGS = sys.argv[sys.argv.index("--") + 1:]
OUT = ARGS[0]
PX = int(ARGS[1]) if len(ARGS) > 1 else 128
ONLY = {name for name in os.environ.get("NANITE_ONLY", "").split(",") if name}
os.makedirs(OUT, exist_ok=True)

ORTHO = 2.08  # the 32 px cell, as kit A: the puck (r 0.952) and the 0.96 tile fit
AXIS = Vector((0.45, 0.8, 0.4)).normalized()
SEGMENTS = 96  # around the puck: a multiple of 8, so the tile's corners are vertices
TILE = 0.96  # the data tile's half-extent
FLAT = 0.25  # the tile's depth relative to the puck's
GLYPH_EXTENT = 0.80  # the glyph image spans x, y in [-0.80, 0.80] (tile space)
GLYPH_PX = 256

# The tones, sRGB (FAR_FROM_ULTRA_NANITE_TONES): the unit's light. `panel`
# is the data tile's glass (the unfold's end); the gold unit never unfolds.
TONES = {
    "aqua": {"light": (84, 232, 248), "panel": (0, 118, 150)},
    "violet": {"light": (140, 126, 255), "panel": (52, 36, 160)},
    "white": {"light": (246, 250, 255), "panel": (44, 84, 130)},
    "gold": {"light": (255, 204, 122), "panel": None},
}


def srgb(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return tuple(f(v) for v in c)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


# --- The scene -------------------------------------------------------------------
def use_device(sc):
    """The first GPU backend with a device, else the CPU (NANITE_CPU=1 forces it)."""
    if os.environ.get("NANITE_CPU") != "1":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = backend
            except TypeError:
                continue
            prefs.get_devices()
            if any(device.type == backend for device in prefs.devices):
                for device in prefs.devices:
                    device.use = device.type == backend
                sc.cycles.device = "GPU"
                return backend
    sc.cycles.device = "CPU"
    return "CPU"


def scene(width, height, samples=160):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    print("NANITE device", use_device(sc), flush=True)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.seed = 22
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
    if world.node_tree is None:
        world.use_nodes = True
    # A dark navy studio whose wall behind the camera (+z) is lit: what a
    # face-on gold or clear coat mirrors (film_transparent hides it).
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    background = nodes["Background"]
    coords = nodes.new("ShaderNodeTexCoord")
    split = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Generated"], split.inputs[0])
    wall = nodes.new("ShaderNodeMapRange")
    wall.interpolation_type = "SMOOTHSTEP"
    wall.inputs["From Min"].default_value = -0.1
    wall.inputs["From Max"].default_value = 0.95
    links.new(split.outputs["Z"], wall.inputs["Value"])
    tone = nodes.new("ShaderNodeMix")
    tone.data_type = "RGBA"
    pick = lambda sockets, name: next(s for s in sockets if s.identifier == name)  # noqa: E731
    pick(tone.inputs, "A_Color").default_value = (0.008, 0.010, 0.020, 1)
    pick(tone.inputs, "B_Color").default_value = (0.30, 0.31, 0.34, 1)
    links.new(wall.outputs["Result"], tone.inputs["Factor"])
    links.new(pick(tone.outputs, "Result_Color"), background.inputs["Color"])
    background.inputs[1].default_value = 1.0
    return sc


def rig(sc):
    """RIG-U: kit A's rig re-lit for white ceramic — a softer key (the white
    stays below clipping), a small hard specular for the clear coat, a broad
    softbox over the camera for the dome's sheen, an aqua rim lower right
    and a violet under-light (Ultra's crystal and orbs)."""
    for name, location, power, size, colour in (
        ("key", (-4.5, 4.5, 7), 380, 4, (1, 0.97, 0.93)),
        ("spec", (-3.0, 3.6, 8.5), 240, 0.6, (1, 1, 1)),
        ("soft", (0.6, 1.8, 9.5), 120, 10, (0.90, 0.95, 1.0)),
        ("rim", (6, -1.5, 2), 380, 2.5, (0.45, 0.92, 1.0)),
        ("under", (-1.2, -6.5, 1.5), 170, 3, (0.62, 0.52, 1.0)),
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


# --- Materials ---------------------------------------------------------------------
def material(name):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:  # Blender 4.x; 5.x materials always have nodes
        mat.use_nodes = True
    return mat


def principled(name, base, metallic, roughness, coat=0.0, emission=None, strength=0.0):
    mat = material(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = 0.04
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def node(mat, kind, **inputs):
    n = mat.node_tree.nodes.new(kind)
    for key, value in inputs.items():
        if key.startswith("_"):
            setattr(n, key[1:], value)
        else:
            n.inputs[key].default_value = value
    return n


def math_node(mat, operation, a=None, b=None, clamp=False):
    n = node(mat, "ShaderNodeMath", _operation=operation, _use_clamp=clamp)
    links = mat.node_tree.links
    for index, value in ((0, a), (1, b)):
        if value is None:
            continue
        if isinstance(value, (int, float)):
            n.inputs[index].default_value = value
        else:
            links.new(value, n.inputs[index])
    return n.outputs[0]


def mixer(mat, data_type):
    """A Mix node's (factor, a, b, result) sockets for `data_type` ("FLOAT" or
    "RGBA"): its sockets share names across types, so pick by identifier."""
    n = node(mat, "ShaderNodeMix", _data_type=data_type)
    suffix = "Color" if data_type == "RGBA" else "Float"
    pick = lambda sockets, name: next(s for s in sockets if s.identifier == f"{name}_{suffix}")  # noqa: E731
    return pick(n.inputs, "Factor") if data_type == "FLOAT" else n.inputs["Factor"], pick(n.inputs, "A"), pick(n.inputs, "B"), pick(n.outputs, "Result")


def emitter(name, colour, strength):
    mat = material(name)
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (*colour, 1)
    emission.inputs["Strength"].default_value = strength
    mat.node_tree.links.new(emission.outputs[0], out.inputs["Surface"])
    return mat


def ring_light(name, light, strength):
    """The HUD ring's light: across each arc (uv.y 0 → 1) a white-hot core
    line on the arc's middle, falling to the tone at its edges."""
    mat = material(name)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    uv = node(mat, "ShaderNodeUVMap")
    split = node(mat, "ShaderNodeSeparateXYZ")
    links.new(uv.outputs["UV"], split.inputs[0])
    across = math_node(mat, "SUBTRACT", split.outputs["Y"], 0.5)
    across = math_node(mat, "ABSOLUTE", across)
    hot = node(mat, "ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP")
    hot.inputs["From Min"].default_value = 0.0
    hot.inputs["From Max"].default_value = 0.5
    hot.inputs["To Min"].default_value = 1.0
    hot.inputs["To Max"].default_value = 0.0
    links.new(across, hot.inputs["Value"])
    factor, a, b, result = mixer(mat, "RGBA")
    a.default_value = (*light, 1)
    b.default_value = (*mix(light, (1, 1, 1), 0.55), 1)
    # A thin hot line down the arc's middle; the rest keeps the tone (at
    # strength ~1 the Standard view keeps its hue instead of clipping white).
    core = math_node(mat, "POWER", hot.outputs["Result"], 4.0)
    links.new(core, factor)
    links.new(result, emission.inputs["Color"])
    gain = math_node(mat, "MULTIPLY_ADD", math_node(mat, "POWER", hot.outputs["Result"], 2.0), 0.6)
    gain.node.inputs[2].default_value = 1.0
    level = node(mat, "ShaderNodeValue", _label="level")
    level.outputs[0].default_value = strength
    links.new(math_node(mat, "MULTIPLY", gain, level.outputs[0]), emission.inputs["Strength"])
    links.new(emission.outputs[0], out.inputs["Surface"])
    return mat, level


def lens_light(name, light, peak):
    """The lens: white-hot at its centre, the tone by mid-radius, a deep rim
    of the tone at 15% by its edge (object radius 0.22)."""
    mat = material(name)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    coords = node(mat, "ShaderNodeTexCoord")
    split = node(mat, "ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], split.inputs[0])
    radius = math_node(
        mat,
        "SQRT",
        math_node(
            mat,
            "ADD",
            math_node(mat, "MULTIPLY", split.outputs["X"], split.outputs["X"]),
            math_node(mat, "MULTIPLY", split.outputs["Y"], split.outputs["Y"]),
        ),
    )
    u = math_node(mat, "DIVIDE", radius, 0.22, clamp=True)
    ramp = node(mat, "ShaderNodeValToRGB")
    elements = ramp.color_ramp.elements
    elements[0].position = 0.0
    elements[0].color = (*mix(light, (1, 1, 1), 0.88), 1)
    elements[1].position = 1.0
    elements[1].color = (*[v * 0.55 for v in light], 1)
    middle = elements.new(0.42)
    middle.color = (*mix(light, (1, 1, 1), 0.25), 1)
    links.new(u, ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], emission.inputs["Color"])
    falloff = node(mat, "ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP")
    falloff.inputs["From Min"].default_value = 0.0
    falloff.inputs["From Max"].default_value = 1.0
    falloff.inputs["To Min"].default_value = 1.0
    falloff.inputs["To Max"].default_value = 0.30
    links.new(u, falloff.inputs["Value"])
    level = node(mat, "ShaderNodeValue", _label="level")
    level.outputs[0].default_value = peak
    links.new(math_node(mat, "MULTIPLY", falloff.outputs["Result"], level.outputs[0]), emission.inputs["Strength"])
    links.new(emission.outputs[0], out.inputs["Surface"])
    return mat, level


def face(name, base, metallic, roughness, light, panel, glyph):
    """The face (dome, lip and rim). Its `front` value (the unfold's progress
    × 1.15) floods it from the core outward — Chebyshev distance in tile
    space — into the panel glass, and lights the glyph behind that front."""
    mat = principled(name, base, metallic, roughness, coat=1.0)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    front = node(mat, "ShaderNodeValue", _label="front")
    front.outputs[0].default_value = 0.0
    if panel is None:
        return mat, front
    coords = node(mat, "ShaderNodeTexCoord")
    split = node(mat, "ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], split.inputs[0])
    reach = math_node(
        mat,
        "DIVIDE",
        math_node(mat, "MAXIMUM", math_node(mat, "ABSOLUTE", split.outputs["X"]), math_node(mat, "ABSOLUTE", split.outputs["Y"])),
        TILE,
    )
    # flood = 1 inside the front, 0 outside, over a 0.08 band.
    flood = node(mat, "ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP")
    flood.inputs["From Min"].default_value = -0.08
    flood.inputs["From Max"].default_value = 0.0
    flood.inputs["To Min"].default_value = 1.0
    flood.inputs["To Max"].default_value = 0.0
    links.new(math_node(mat, "SUBTRACT", reach, front.outputs[0]), flood.inputs["Value"])
    for socket, start, end in (
        ("Base Color", (*base, 1), (*panel, 1)),
        ("Roughness", roughness, 0.22),
        ("Metallic", metallic, 0.0),
    ):
        factor, a, b, result = mixer(mat, "RGBA" if socket == "Base Color" else "FLOAT")
        a.default_value = start
        b.default_value = end
        links.new(flood.outputs["Result"], factor)
        links.new(result, bsdf.inputs[socket])
    # The glyph: R its coverage, G its distance along the traces from the core.
    mapped = node(mat, "ShaderNodeVectorMath", _operation="MULTIPLY_ADD")
    mapped.inputs[1].default_value = (0.5 / GLYPH_EXTENT, 0.5 / GLYPH_EXTENT, 0)
    mapped.inputs[2].default_value = (0.5, 0.5, 0)
    links.new(coords.outputs["Object"], mapped.inputs[0])
    texture = node(mat, "ShaderNodeTexImage", _interpolation="Linear", _extension="CLIP")
    texture.image = glyph
    links.new(mapped.outputs[0], texture.inputs["Vector"])
    channels = node(mat, "ShaderNodeSeparateColor")
    links.new(texture.outputs["Color"], channels.inputs[0])
    behind = node(mat, "ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP")
    behind.inputs["From Min"].default_value = -0.10
    behind.inputs["From Max"].default_value = 0.0
    behind.inputs["To Min"].default_value = 1.0
    behind.inputs["To Max"].default_value = 0.0
    links.new(math_node(mat, "SUBTRACT", channels.outputs["Green"], front.outputs[0]), behind.inputs["Value"])
    # A brighter pulse where the front passes.
    pulse = math_node(
        mat,
        "EXPONENT",
        math_node(
            mat,
            "MULTIPLY",
            math_node(mat, "POWER", math_node(mat, "DIVIDE", math_node(mat, "SUBTRACT", channels.outputs["Green"], front.outputs[0]), 0.07), 2.0),
            -1.0,
        ),
    )
    lit = math_node(mat, "MULTIPLY_ADD", pulse, 1.4)
    links.new(behind.outputs["Result"], lit.node.inputs[2])
    glow = math_node(mat, "MULTIPLY", math_node(mat, "MULTIPLY", lit, channels.outputs["Red"]), 1.15)
    # The panel is a lit screen (its own light, half its colour); the glyph
    # burns over it in the tone lifted halfway to white.
    screen = node(mat, "ShaderNodeVectorMath", _operation="SCALE")
    screen.inputs[0].default_value = panel
    links.new(math_node(mat, "MULTIPLY", flood.outputs["Result"], 0.5), screen.inputs["Scale"])
    trace = node(mat, "ShaderNodeVectorMath", _operation="SCALE")
    trace.inputs[0].default_value = mix(light, (1, 1, 1), 0.5)
    links.new(glow, trace.inputs["Scale"])
    total = node(mat, "ShaderNodeVectorMath", _operation="ADD")
    links.new(screen.outputs[0], total.inputs[0])
    links.new(trace.outputs[0], total.inputs[1])
    links.new(total.outputs[0], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    return mat, front


# --- The glyph -------------------------------------------------------------------------
def glyph_traces():
    """The data tile's circuit glyph, tile space (the lens at the core):
    four-fold rotationally symmetric, each quarter two orthogonally routed
    traces (one leaving the core's corner at 45°) ending in pads near the
    frame, and two short data lines."""
    quarter = [
        [(0.17, 0.02), (0.42, 0.02), (0.42, 0.18), (0.64, 0.18)],
        [(0.14, 0.14), (0.28, 0.28), (0.52, 0.28), (0.52, 0.46)],
        [(0.47, -0.10), (0.64, -0.10)],
        [(0.53, -0.22), (0.64, -0.22)],
    ]
    pads = [(0.64, 0.18), (0.52, 0.46), (0.47, -0.10)]
    traces = []
    dots = []
    for k in range(4):
        c, s = math.cos(k * math.pi / 2), math.sin(k * math.pi / 2)
        turn = lambda p: (p[0] * c - p[1] * s, p[0] * s + p[1] * c)  # noqa: E731
        traces += [[turn(p) for p in line] for line in quarter]
        dots += [turn(p) for p in pads]
    return traces, dots


def glyph_image():
    """R: the traces' and pads' coverage (anti-aliased), G: their distance
    along the traces from the core, normalised (the unfold's front lights
    them in that order)."""
    import numpy as np

    n = GLYPH_PX
    texel = 2 * GLYPH_EXTENT / n
    axis = (np.arange(n) + 0.5) * texel - GLYPH_EXTENT
    X, Y = np.meshgrid(axis, axis)  # row 0 is the bottom (y = -extent), as Blender stores images
    traces, dots = glyph_traces()
    width = 0.058
    pad = 0.048
    # Each trace starts where the core leaves off: its path length counts from the centre.
    lengths = []
    for line in traces:
        total = math.hypot(*line[0])
        for a, b in zip(line, line[1:]):
            total += math.hypot(b[0] - a[0], b[1] - a[1])
        lengths.append(total)
    longest = max(lengths)
    best = np.full(X.shape, 1e9)
    along = np.zeros(X.shape)
    for line in traces:
        start = math.hypot(*line[0])
        for a, b in zip(line, line[1:]):
            ax, ay = a
            dx, dy = b[0] - a[0], b[1] - a[1]
            length = math.hypot(dx, dy)
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / (length * length), 0, 1)
            d = np.hypot(X - ax - t * dx, Y - ay - t * dy) - width / 2
            closer = d < best
            best = np.where(closer, d, best)
            along = np.where(closer, (start + t * length) / longest, along)
            start += length
    for x, y in dots:
        d = np.hypot(X - x, Y - y) - pad
        closer = d < best
        best = np.where(closer, d, best)
        # A pad lights with the end of its trace.
        end = None
        for line, total in zip(traces, lengths):
            if any(abs(px - x) < 1e-9 and abs(py - y) < 1e-9 for px, py in line):
                end = total / longest
        along = np.where(closer, end if end is not None else 1.0, along)
    coverage = np.clip(0.5 - best / texel, 0, 1)
    pixels = np.zeros((n, n, 4), dtype=np.float32)
    pixels[..., 0] = coverage
    pixels[..., 1] = along
    pixels[..., 3] = 1.0
    image = bpy.data.images.new("glyph", n, n, alpha=True, float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(pixels.ravel())
    return image


# --- Geometry --------------------------------------------------------------------------
# The puck's profile (r, z), from the top pole round to the back pole, with
# the material slot of the band that follows each point and whether the
# point is a crease. Slots: 0 the face, 1 the channel and groove (dark),
# 2 the equator seam (light), 3 the graphite back, 4 the back's seam ring,
# 5 the rim's gold inlay.
PROFILE = [
    (0.000, 0.172, 0, False),
    (0.120, 0.170, 0, False),
    (0.240, 0.164, 0, False),
    (0.360, 0.154, 0, False),
    (0.480, 0.141, 0, False),
    (0.570, 0.130, 0, False),
    (0.615, 0.123, 0, False),
    (0.638, 0.110, 1, True),
    (0.645, 0.085, 1, True),
    (0.830, 0.085, 1, True),
    (0.838, 0.110, 0, True),
    (0.860, 0.124, 5, True),
    (0.895, 0.119, 5, False),
    (0.925, 0.098, 0, True),
    (0.945, 0.066, 0, False),
    (0.952, 0.030, 0, True),
    (0.952, 0.018, 2, True),
    (0.936, 0.012, 2, True),
    (0.936, -0.012, 2, True),
    (0.946, -0.018, 3, True),
    (0.944, -0.042, 3, False),
    (0.930, -0.078, 3, False),
    (0.890, -0.104, 3, False),
    (0.820, -0.122, 3, False),
    (0.640, -0.134, 3, False),
    (0.560, -0.137, 4, True),
    (0.520, -0.138, 3, True),
    (0.300, -0.140, 3, False),
    (0.000, -0.140, 3, False),
]
# Face-on, the silhouette is the white lip over the lit seam's walls (the
# graphite shoulder starts inside it): a light outline, never a dark one.
# Radius → fraction of the tile's half-extent at the unfold's end: the dome
# fills the tile, the channel (and the ring in it) runs round its edge.
BODY_TO_TILE = [(0.0, 0.0), (0.615, 0.80), (0.645, 0.815), (0.830, 0.895), (0.860, 0.905), (0.952, 1.0)]
RING = (0.665, 0.815, 0.101)  # the HUD ring: inner and outer radius, height
RING_TO_TILE = (0.830, 0.890)


def piecewise(points, x):
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0) if x1 > x0 else y1
    return points[-1][1]


def square_point(phi):
    """The point of the square of half-extent 1 (its right edge's midpoint
    on +x) at the same perimeter fraction as angle `phi` on a circle: the
    circle's eighths become the square's corners."""
    u = (phi % (2 * math.pi)) / (2 * math.pi) * 8
    if u < 1:
        return 1.0, u
    if u < 3:
        return 1 - (u - 1), 1.0
    if u < 5:
        return -1.0, 1 - (u - 3)
    if u < 7:
        return -1 + (u - 5), -1.0
    return 1.0, -1 + (u - 7)


def to_tile(x, y, fraction):
    phi = math.atan2(y, x)
    qx, qy = square_point(phi)
    return qx * TILE * fraction, qy * TILE * fraction


def build_puck(sc):
    bm = bmesh.new()
    rings = []
    for r, z, _slot, _crease in PROFILE:
        if r < 1e-9:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            rings.append(
                [bm.verts.new((r * math.cos(2 * math.pi * j / SEGMENTS), r * math.sin(2 * math.pi * j / SEGMENTS), z)) for j in range(SEGMENTS)]
            )
    for i in range(len(PROFILE) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(SEGMENTS):
            j2 = (j + 1) % SEGMENTS
            if len(a) == 1:
                f = bm.faces.new((a[0], b[j2], b[j]))
            elif len(b) == 1:
                f = bm.faces.new((a[j], a[j2], b[0]))
            else:
                f = bm.faces.new((a[j], a[j2], b[j2], b[j]))
            f.material_index = PROFILE[i][2]
            f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Creases: the edges running round a crease ring are sharp.
    ring_of = {v: i for i, ring in enumerate(rings) for v in ring}
    for edge in bm.edges:
        a, b = (ring_of[v] for v in edge.verts)
        if a == b and PROFILE[a][3]:
            edge.smooth = False
    mesh = bpy.data.meshes.new("puck")
    bm.to_mesh(mesh)
    bm.free()
    body = bpy.data.objects.new("puck", mesh)
    sc.collection.objects.link(body)
    body.shape_key_add(name="basis")
    tile = body.shape_key_add(name="tile")
    for vertex, point in zip(mesh.vertices, tile.data):
        x, y, z = vertex.co
        rho = math.hypot(x, y)
        if rho < 1e-9:
            point.co = (0, 0, z * FLAT)
            continue
        tx, ty = to_tile(x, y, piecewise(BODY_TO_TILE, rho))
        point.co = (tx, ty, z * FLAT)
    return body


def build_ring(sc, arcs=4, gap=9.0, steps=24):
    """The HUD ring: `arcs` emissive arcs, `gap` degrees apart, each a slightly
    convex band (uv: x along, y across). Its tile shape key lays each arc on
    the tile's frame (corner brackets at the corners)."""
    r0, r1, z0 = RING
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    span = 360.0 / arcs - gap
    across = (0.0, 0.25, 0.5, 0.75, 1.0)
    for k in range(arcs):
        # Arcs centred on 45° + k·90°: the gaps fall on the tile's edge
        # midpoints, so the tile's frame is four corner brackets.
        centre = 45.0 + k * 360.0 / arcs
        grid = []
        for i in range(steps + 1):
            a = math.radians(centre - span / 2 + span * i / steps)
            row = []
            for v in across:
                r = r0 + (r1 - r0) * v
                z = z0 + 0.010 * math.sin(math.pi * v)
                row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
            grid.append(row)
        for i in range(steps):
            for j in range(len(across) - 1):
                f = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
                f.smooth = True
                for loop, (ii, jj) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                    loop[uv].uv = (ii / steps, across[jj])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    mesh = bpy.data.meshes.new("ring")
    bm.to_mesh(mesh)
    bm.free()
    ring = bpy.data.objects.new("ring", mesh)
    sc.collection.objects.link(ring)
    ring.shape_key_add(name="basis")
    tile = ring.shape_key_add(name="tile")
    for vertex, point in zip(mesh.vertices, tile.data):
        x, y, z = vertex.co
        rho = math.hypot(x, y)
        fraction = RING_TO_TILE[0] + (RING_TO_TILE[1] - RING_TO_TILE[0]) * (rho - r0) / (r1 - r0)
        tx, ty = to_tile(x, y, fraction)
        point.co = (tx, ty, z0 * FLAT + 0.004 + (z - z0) * 0.3)
    return ring


def revolve_object(sc, name, profile, segments=64):
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-9:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * j / segments), r * math.sin(2 * math.pi * j / segments), z)) for j in range(segments)])
    for i in range(len(profile) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(segments):
            j2 = (j + 1) % segments
            if len(a) == 1:
                f = bm.faces.new((a[0], b[j2], b[j]))
            elif len(b) == 1:
                f = bm.faces.new((a[j], a[j2], b[0]))
            else:
                f = bm.faces.new((a[j], a[j2], b[j2], b[j]))
            f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    sc.collection.objects.link(obj)
    return obj


def build_unit(sc):
    body = build_puck(sc)
    ring = build_ring(sc)
    # The lens: a low dome on the face's crown (origin at its base).
    lens = revolve_object(
        sc,
        "lens",
        [(0.0, 0.050), (0.06, 0.047), (0.12, 0.038), (0.17, 0.025), (0.205, 0.010), (0.22, 0.0), (0.22, -0.02), (0.0, -0.02)],
    )
    lens.location.z = 0.170
    bpy.ops.mesh.primitive_torus_add(major_radius=0.236, minor_radius=0.026, major_segments=64, minor_segments=12)
    bezel = bpy.context.active_object
    bezel.name = "bezel"
    for poly in bezel.data.polygons:
        poly.use_smooth = True
    bezel.location.z = 0.168
    root = bpy.data.objects.new("nanite", None)
    sc.collection.objects.link(root)
    for obj in (body, ring, lens, bezel):
        obj.parent = root
    root.rotation_mode = "QUATERNION"
    return root, body, ring, lens, bezel


def render(sc, name):
    if ONLY and name not in ONLY:
        return
    sc.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)


# --- The renders -------------------------------------------------------------------------
sc = scene(PX, PX)
camera(sc, ORTHO)
rig(sc)
glyph = glyph_image()
root, body, ring, lens, bezel = build_unit(sc)
for _ in range(6):
    body.data.materials.append(None)
ring.data.materials.append(None)
lens.data.materials.append(None)
bezel.data.materials.append(None)

CERAMIC = srgb((226, 230, 238))
RING_LEVEL = 1.15
GOLD = srgb((255, 196, 104))
for tone, spec in TONES.items():
    light = srgb(spec["light"])
    panel = srgb(spec["panel"]) if spec["panel"] else None
    gold_unit = tone == "gold"
    face_mat, front = face(
        f"{tone}-face",
        GOLD if gold_unit else CERAMIC,
        1.0 if gold_unit else 0.0,
        0.20 if gold_unit else 0.30,
        light,
        panel,
        glyph,
    )
    body.data.materials[0] = face_mat
    body.data.materials[1] = principled(f"{tone}-channel", (0.012, 0.014, 0.022), 0.6, 0.35)
    body.data.materials[2] = emitter(f"{tone}-seam", light, 1.4)
    body.data.materials[3] = principled(f"{tone}-back", (0.030, 0.033, 0.042), 0.35, 0.36, coat=0.6)
    body.data.materials[4] = emitter(f"{tone}-back-seam", light, 1.0)
    body.data.materials[5] = principled(f"{tone}-inlay", srgb((250, 244, 230)) if gold_unit else GOLD, 1.0, 0.16)
    ring_mat, ring_level = ring_light(f"{tone}-ring", light, RING_LEVEL)
    ring.data.materials[0] = ring_mat
    lens_mat, lens_level = lens_light(f"{tone}-lens", light, 6.0)
    lens.data.materials[0] = lens_mat
    bezel.data.materials[0] = (
        principled(f"{tone}-bezel", srgb((250, 246, 236)), 1.0, 0.12) if gold_unit else principled(f"{tone}-bezel", GOLD, 1.0, 0.14)
    )
    body.data.shape_keys.key_blocks["tile"].value = 0.0
    ring.data.shape_keys.key_blocks["tile"].value = 0.0
    lens.location.z = 0.170
    lens.scale = (1, 1, 1)
    bezel.location.z = 0.168
    bezel.scale = (1, 1, 1)
    for f in range(24):
        root.rotation_quaternion = Quaternion(AXIS, 2 * math.pi * f / 24)
        # The ring turns one arc (90°) over the loop, so f24 = f0.
        ring.rotation_euler.z = math.radians(90.0 * f / 24)
        render(sc, f"tumble-{tone}-{f:02d}")
    print("NANITE rendered", tone, flush=True)
    if gold_unit:
        continue
    # The unfold, face-on: k1-k6 (k0 is tumble f0).
    root.rotation_quaternion = Quaternion((1, 0, 0, 0))
    ring.rotation_euler.z = 0.0
    for k in range(1, 7):
        s = k / 6
        body.data.shape_keys.key_blocks["tile"].value = s
        ring.data.shape_keys.key_blocks["tile"].value = s
        front.outputs[0].default_value = s * 1.15
        lens.location.z = 0.170 * (1 - s) + 0.170 * FLAT * s
        lens.scale = (1 - 0.40 * s, 1 - 0.40 * s, 1 - 0.75 * s)
        bezel.location.z = 0.168 * (1 - s) + 0.168 * FLAT * s
        bezel.scale = (1 - 0.38 * s, 1 - 0.38 * s, 1 - 0.75 * s)
        lens_level.outputs[0].default_value = 6.0 * (1 - 0.8 * s)
        ring_level.outputs[0].default_value = RING_LEVEL * (1 + 0.25 * s)
        render(sc, f"unfold-{tone}-{k}")
    front.outputs[0].default_value = 0.0

# The bead: liquid gold light — a metaball pair, wobbling, its highlight
# turning with it (every unit, ring and lens gone first: nothing but the bead).
for obj in list(sc.collection.objects):
    if obj.type not in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(obj)
ball = bpy.data.metaballs.new("bead")
ball.resolution = 0.02
ball.render_resolution = 0.02
for co, radius in (((-0.18, 0.05, 0), 0.60), ((0.25, -0.06, 0), 0.48)):
    element = ball.elements.new()
    element.co = co
    element.radius = radius
bead = bpy.data.objects.new("bead", ball)
sc.collection.objects.link(bead)
bead.data.materials.append(principled("liquid-gold", srgb((255, 192, 86)), 1.0, 0.12, coat=1.0, emission=srgb((255, 204, 110)), strength=0.8))
for k in range(8):
    w = 0.11 * math.sin(2 * math.pi * k / 8)
    bead.scale = (1 + w, 1 - w, 1)
    bead.rotation_euler.z = math.radians(8.0 * math.sin(2 * math.pi * k / 8 + 0.6))
    render(sc, f"bead-{k}")
print("NANITE-DONE", flush=True)
