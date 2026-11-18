"""Bake three articulated nanite designs with an orthographic Cycles studio.

blender --background --factory-startup --python-exit-code 1 \
  --python scripts/blender/nanite_forge.py -- /tmp/nanite-forge [rider] [samples]
"""
import argparse
from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils import Quaternion, Vector


PIXELS = 64
PITCH = 2.0
DESIGNS = {
    "rexonance": [(0.19, 0.70, 0.98), (0.95, 0.23, 0.58), (0.78, 0.89, 1), (1, 0.57, 0.13)],
    "far-from": [(0.10, 0.64, 0.92), (0.65, 0.35, 1), (0.82, 0.90, 1), (1, 0.52, 0.12)],
    "illusionculum": [(0.10, 0.70, 0.97), (0.96, 0.24, 0.66), (0.80, 0.94, 1), (1, 0.66, 0.22)],
}


def material(name, color, *, metal=0, rough=0.27, emit=0, transmission=0, coat=0.18):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    for key, value in {
        "Base Color": (*color, 1), "Metallic": metal, "Roughness": rough,
        "Emission Color": (*color, 1), "Emission Strength": emit,
        "Transmission Weight": transmission, "Coat Weight": coat, "IOR": 1.48,
    }.items():
        shader.inputs[key].default_value = value
    return result


def polygon(name, parent, outlines, materials, bevel=0):
    """Build an extruded or faceted object from matching CCW outlines."""
    verts = [(x, y, z) for outline, z in outlines for x, y in outline]
    n = len(outlines[0][0])
    faces = [tuple(reversed(range(n)))]
    levels = len(outlines)
    for level in range(levels - 1):
        low, high = level * n, (level + 1) * n
        for i in range(n):
            following = (i + 1) % n
            faces.append((low + i, low + following, high + following, high + i))
    faces.append(tuple(range((levels - 1) * n, levels * n)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    part = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(part)
    part.parent = parent
    for surface in materials:
        mesh.materials.append(surface)
    if len(materials) > 1:
        for face in mesh.polygons:
            face.material_index = 1 + (face.index - 1) % (len(materials) - 1)
        mesh.polygons[-1].material_index = 0
    if bevel:
        edge = part.modifiers.new("CNC edge radii", "BEVEL")
        edge.width, edge.segments = bevel, 2
        part.modifiers.new("Corner normals", "WEIGHTED_NORMAL")
    return part


def outline(count, radius, angle=0):
    return [
        (radius * cos(angle + 2 * pi * i / count), radius * sin(angle + 2 * pi * i / count))
        for i in range(count)
    ]


def scaled(points, ratio):
    return [(x * ratio, y * ratio) for x, y in points]


def plate(name, parent, points, z, thickness, surface, bevel=0.018):
    return polygon(name, parent, [(points, z - thickness / 2), (points, z + thickness / 2)], [surface], bevel)


def box(name, parent, loc, dimensions, surface, bevel=0.014):
    w, h, d = dimensions
    x, y, z = loc
    part = plate(name, parent, [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)], z, d, surface, bevel)
    part.location = (x, y, 0)
    return part


def pivot(name, parent, loc=(0, 0, 0)):
    joint = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(joint)
    joint.location = loc
    joint.parent = parent
    return joint


def palette(name, color, drive=1):
    return {
        "back": material("Anodized titanium", (0.052, 0.079, 0.115), metal=0.52),
        "silver": material("Machined silver edge", (0.53, 0.62, 0.72), metal=0.66, rough=0.21),
        "gold": material("Brushed bronze contacts", (0.74, 0.34, 0.075), metal=0.62),
        "glass": material(f"{name} optical facet", color, metal=0.19, rough=0.15, emit=0.12, transmission=0.22),
        "edge": material("Dichroic coating", (0.6 * color[0] + 0.25, 0.58 * color[1], 0.6 * color[2] + 0.2), metal=0.42, rough=0.19, emit=0.23),
        "signal": material("Light guide", color, emit=0.8),
        "die": material("Active emitter", color, emit=2.2 * drive),
    }


def carrier(root, m):
    shoe = pivot("Telescoping backing shoe", root, (0, 0, -0.155))
    corners = [(-0.83, -0.88), (0.83, -0.88), (0.88, -0.83), (0.88, 0.83),
               (0.83, 0.88), (-0.83, 0.88), (-0.88, 0.83), (-0.88, -0.83)]
    plate("Carrier deck", shoe, corners, -0.02, 0.09, m["back"])
    for i in (-1, 1):
        box("Conductive side rail", shoe, (i * 0.82, 0, 0.028), (0.085, 1.59, 0.025), m["silver"])
        box("Carrier trace", shoe, (0, i * 0.78, 0.028), (1.44, 0.059, 0.025), m["signal"])
    return shoe


def rexonance(root, m):
    hexagon = outline(6, 0.66, pi / 6)
    plate("Hex chassis", root, hexagon, 0, 0.23, m["back"])
    plate("Machined cap", root, scaled(hexagon, 0.85), 0.13, 0.12, m["gold"])
    plate("Gunmetal heat spreader", root, scaled(hexagon, 0.77), 0.185, 0.06, m["back"])
    plate("Emitter socket", root, outline(6, 0.28, pi / 6), 0.22, 0.09, m["silver"])
    plate("Guided hex emitter", root, outline(6, 0.205, pi / 6), 0.26, 0.07, m["die"])
    plate("Rear service loop", root, scaled(hexagon, 0.72), -0.13, 0.035, m["silver"])
    plate("Rear thermal carrier", root, scaled(hexagon, 0.56), -0.155, 0.028, m["back"])
    for i in range(-1, 2):
        box("Rear resonator trace", root, (i * 0.11, 0, -0.176), (0.035, 0.24 - abs(i) * 0.06, 0.03), m["signal"])
    jaws = []
    for i in range(6):
        mount = pivot("Radial elbow", root)
        mount.rotation_euler.z = i * pi / 3 - pi / 6
        jaw = pivot("Titanium interlock", mount, (0.48, 0, 0))
        points = [(-0.08, -0.17), (0.105, -0.17), (0.21, -0.08),
                  (0.21, 0.08), (0.105, 0.17), (-0.08, 0.17)]
        plate("Tapered jaw", jaw, points, 0.045, 0.15, m["silver"])
        box("Dielectric jaw insert", jaw, (0.067, 0, 0.132), (0.203, 0.13, 0.035), m["back"])
        box("Status light", jaw, (0.09, 0, 0.156), (0.116, 0.062, 0.031), m["signal"])
        box("Rear anchor", jaw, (0.02, 0, -0.084), (0.146, 0.11, 0.07), m["gold"])
        box("Hinge clevis", jaw, (-0.062, 0, 0.099), (0.063, 0.29, 0.085), m["gold"])
        box("Latch rib", jaw, (-0.074, 0, 0.188), (0.086, 0.091, 0.058), m["signal"])
        jaws.append(jaw)
    shoe = carrier(root, m)

    def articulate(q):
        lift = sin(pi * q)
        shoe.scale = (0.53 + 0.47 * q, 0.53 + 0.47 * q, 1)
        for jaw in jaws:
            jaw.location = (0.48 + 0.14 * lift + 0.065 * q, 0, 0.07 * lift - 0.13 * q)
            jaw.rotation_euler.y = -0.91 * lift

    return articulate


def far_from(root, m):
    diamond = [(0, -0.86), (0.60, 0), (0, 0.86), (-0.60, 0)]
    polygon("Titanium crystal cradle", root,
            [(scaled(diamond, 0.56), -0.24), (diamond, -0.03), (scaled(diamond, 0.88), 0.10)],
            [m["silver"], m["back"], m["gold"]], 0.015)
    box("Rear resonator spine", root, (0, 0, -0.245), (0.14, 0.94, 0.05), m["signal"])
    prisms = []
    for i in (-1, 1):
        wing = pivot("Prism collar hinge", root, (0.05 * i, 0, 0.05))
        wing.rotation_euler.z = 0 if i > 0 else pi
        points = [(0.025, -0.71), (0.54, 0), (0.025, 0.71), (0.0, 0.22), (0.0, -0.22)]
        polygon("Cleaved crystal wing", wing,
                [(points, 0), (scaled(points, 0.73), 0.185),
                 ([(0.10 + x * 0.20, y * 0.54) for x, y in points], 0.34)],
                [m["glass"], m["edge"], m["silver"], m["glass"], m["glass"], m["edge"]])
        box("Optical wing spine", wing, (0.05, 0, 0.185), (0.05, 0.82, 0.085), m["signal"])
        prisms.append((wing, i))
    plate("Central crystal emitter", root, scaled(diamond, 0.24), 0.33, 0.055, m["die"])
    shoe = carrier(root, m)
    for i in (-1, 1):
        for j in (-1, 1):
            box("Titanium guide", shoe, (i * 0.63, j * 0.65, 0.048), (0.22, 0.18, 0.06), m["gold"])

    def articulate(q):
        shoe.scale = (0.46 + 0.54 * q, 0.70 + 0.30 * q, 1)
        for wing, i in prisms:
            wing.location = ((0.05 + 0.19 * q) * i, 0, 0.05 - 0.17 * q)
            wing.rotation_euler.y = -(0.95 * sin(pi * q) + 0.34 * q)

    return articulate


def illusionculum(root, m):
    octagon = outline(8, 0.75, pi / 8)
    plate("Black ceramic optical bench", root, octagon, -0.035, 0.235, m["back"])
    plate("Titanium back plate", root, scaled(octagon, 0.73), -0.157, 0.045, m["silver"])
    plate("Rear receiver", root, outline(4, 0.245), -0.184, 0.032, m["signal"])
    plate("Emitter collar", root, outline(4, 0.26), 0.155, 0.115, m["gold"])
    plate("Reference emitter", root, outline(4, 0.17), 0.225, 0.046, m["die"])
    shutters = []
    for k in range(4):
        arm = pivot("Quarter-turn hinge", root)
        arm.rotation_euler.z = k * pi / 2
        flap = pivot("Fold-out optical mirror", arm, (0.23, 0.23, 0.05))
        shape = [(-0.12, 0.065), (0.035, -0.12), (0.32, -0.12), (0.39, 0.04),
                 (0.29, 0.32), (0.055, 0.33)]
        plate("Chromed mirror saddle", flap, shape, 0.035, 0.14, m["silver"])
        polygon("Trapezoidal dichroic mirror", flap,
                [(scaled(shape, 0.77), 0.108), (scaled(shape, 0.55), 0.182)],
                [m["glass"], m["edge"], m["glass"], m["back"]])
        bar = box("Optical grading stripe", flap, (0.16, 0.06, 0.19), (0.22, 0.067, 0.028), m["signal"])
        bar.rotation_euler.z = 0.45
        box("Hinge pin", flap, (0.014, -0.085, 0.065), (0.15, 0.075, 0.10), m["gold"])
        shutters.append(flap)
    shoe = carrier(root, m)

    def articulate(q):
        shoe.scale = (0.56 + 0.44 * q, 0.56 + 0.44 * q, 1)
        for flap in shutters:
            slide = 0.23 + 0.165 * q
            flap.location = (slide, slide, 0.05 - 0.13 * q)
            flap.rotation_euler = (0.81 * sin(pi * q), -0.36 * sin(pi * q), -0.27 * q)

    return articulate


def duplicate_tree(obj, parent=None, emitter=None, seated_emitter=None):
    new = obj.copy()
    bpy.context.collection.objects.link(new)
    new.parent = parent
    if emitter is not None:
        for slot in new.material_slots:
            if slot.material == emitter:
                slot.link = "OBJECT"
                slot.material = seated_emitter
    for child in list(obj.children):
        duplicate_tree(child, new, emitter, seated_emitter)
    return new


def studio(rider, samples, clasps=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.seed = 18
    columns, pixels = (4, 192) if clasps else (30, PIXELS)
    scene.render.resolution_x = columns * pixels
    scene.render.resolution_y = 4 * pixels
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world = bpy.data.worlds.new("Cool workshop reflections")
    scene.world.use_nodes = True
    backdrop = scene.world.node_tree.nodes.get("Background")
    backdrop.inputs[0].default_value = (0.45, 0.54, 0.70, 1)
    backdrop.inputs[1].default_value = 0.45
    camera = bpy.data.cameras.new("Atlas orthographic")
    camera.type, camera.ortho_scale = "ORTHO", PITCH * columns
    scene.camera = bpy.data.objects.new("Atlas orthographic", camera)
    bpy.context.collection.objects.link(scene.camera)
    scene.camera.location = (PITCH * (columns - 1) / 2, -PITCH * 1.5, 12)
    for name, direction, energy, color, spread in [
        ("Warm key", (-0.20, 0.51, 1), 3.0, (1, 0.88, 0.75), 0.30),
        ("Cool strip", (0.58, -0.38, 1), 1.9, (0.58, 0.79, 1), 0.21),
        ("Violet fill", (-0.7, -0.5, 0.5), 0.75, (0.81, 0.58, 1), 0.42),
    ]:
        light = bpy.data.lights.new(name, "SUN")
        light.energy, light.color, light.angle = energy, color, spread
        light.use_shadow = False
        lamp = bpy.data.objects.new(name, light)
        bpy.context.collection.objects.link(lamp)
        lamp.rotation_euler = (-Vector(direction)).to_track_quat("-Z", "Y").to_euler()
    geometry = {"rexonance": rexonance, "far-from": far_from, "illusionculum": illusionculum}[rider]
    axis = Vector((0.42, 0.86, 0.29)).normalized()
    if clasps:
        # Columns use the normal tone order; rows run from loose to seated.
        poses = [
            (0, (0.24, -0.32, -0.19), 1.12),
            (0.47, (0.22, -0.12, -0.052), 1.11),
            (0.78, (0.08, 0.034, 0.034), 1.02),
            (1, (0, 0, 0), 1),
        ]
        for tone, tint in enumerate(DESIGNS["rexonance"]):
            for row, (opening, rotation, size) in enumerate(poses):
                m = palette("rexonance", tint, drive=1 - 0.8 * opening ** 2)
                root = pivot(f"Clasp tone {tone} pose {row}", None, (tone * PITCH, -row * PITCH, 0))
                root.rotation_euler = rotation
                root.scale = (size,) * 3
                geometry(root, m)(opening)
        return scene
    for tone, tint in enumerate(DESIGNS[rider]):
        prototype = pivot(f"{rider} tone {tone}", None, (0, -tone * PITCH, 0))
        m = palette(rider, tint)
        articulate = geometry(prototype, m)
        articulate(0)
        for frame in range(1, 24):
            pose = duplicate_tree(prototype)
            pose.location.x = PITCH * frame
            pose.rotation_mode = "QUATERNION"
            pose.rotation_quaternion = Quaternion(axis, 2 * pi * frame / 24)
        for frame in range(1, 7):
            progress = frame / 6
            articulate(progress)
            seated_emitter = material("Cooling emitter", tint, emit=2.2 * (1 - 0.8 * progress ** 2))
            pose = duplicate_tree(prototype, emitter=m["die"], seated_emitter=seated_emitter)
            pose.location.x = PITCH * (23 + frame)
        articulate(0)
    return scene


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("rider", nargs="?", choices=[*DESIGNS, "rexonance-clasps"])
    parser.add_argument("samples", nargs="?", type=int, default=32)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "blender-version.txt").write_text(f"{bpy.app.version_string} / Cycles CPU\n")
    for rider in [args.rider] if args.rider else [*DESIGNS, "rexonance-clasps"]:
        clasps = rider == "rexonance-clasps"
        scene = studio("rexonance" if clasps else rider, args.samples, clasps)
        scene.render.filepath = str((args.output / f"{rider}.png").resolve())
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
