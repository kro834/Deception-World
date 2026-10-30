"""Review renders that line up pixel-for-pixel with the reference sheet.

ortho(view) places an orthographic camera so that a render at the sheet's
aspect (1024 x 1536, or any multiple) overlays the matching reference view.
compare() writes [reference | render | 50 % overlay] strips.
"""

import math
import os

import bpy
from mathutils import Vector

import rx_ref

ROT = {
    "front": (90.0, 0.0, 0.0),
    "back": (90.0, 0.0, 180.0),
    "right": (90.0, 0.0, -90.0),
    "left": (90.0, 0.0, 90.0),
}


def _camera(name="RX_ReviewCam"):
    cam = bpy.data.objects.get(name)
    if cam is None:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def ortho(view):
    cam = _camera()
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "VERTICAL"
    cam.data.ortho_scale = rx_ref.IMG_H * rx_ref.S
    cam.data.clip_start = 0.01
    cam.data.clip_end = 20.0
    h, z = rx_ref.px(view, rx_ref.IMG_W / 2, rx_ref.IMG_H / 2)
    loc = {"front": (h, -6.0, z), "back": (h, 6.0, z), "right": (-6.0, h, z), "left": (6.0, h, z)}[view]
    cam.location = loc
    cam.rotation_euler = tuple(math.radians(a) for a in ROT[view])
    return cam


def zoom(view, h, z, size):
    """Orthographic close-up of a size x size metre window centred on view
    coordinates (h, z) (h = X for front/back, Y for right/left)."""
    cam = _camera()
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "AUTO"
    cam.data.ortho_scale = size
    cam.data.clip_start = 0.01
    cam.data.clip_end = 20.0
    loc = {"front": (h, -6.0, z), "back": (h, 6.0, z), "right": (-6.0, h, z), "left": (6.0, h, z)}[view]
    cam.location = loc
    cam.rotation_euler = tuple(math.radians(a) for a in ROT[view])
    return cam


def compare_zoom(view, h, z, size, render_png, out_png, px=512):
    """[reference crop | render | overlay] for a zoom() window."""
    from PIL import Image

    x0, y0 = rx_ref.to_px(view, h - size / 2, z + size / 2)
    x1, y1 = rx_ref.to_px(view, h + size / 2, z - size / 2)
    box = (int(round(min(x0, x1))), int(round(min(y0, y1))), int(round(max(x0, x1))), int(round(max(y0, y1))))
    ref = Image.open(rx_ref.ref_path(view)).convert("RGB")
    canvas = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), (255, 255, 255))
    canvas.paste(ref, (-box[0], -box[1]))
    ref = canvas.resize((px, px), Image.LANCZOS)
    ren = Image.open(render_png).convert("RGBA").resize((px, px), Image.LANCZOS)
    white = Image.new("RGBA", (px, px), (255, 255, 255, 255))
    on_white = Image.alpha_composite(white, ren).convert("RGB")
    strip = Image.new("RGB", (px * 3 + 16, px), (255, 255, 255))
    strip.paste(ref, (0, 0))
    strip.paste(on_white, (px + 8, 0))
    strip.paste(Image.blend(ref, on_white, 0.5), (2 * px + 16, 0))
    strip.save(out_png)
    return out_png


def persp(azimuth=35.0, elevation=8.0, distance=7.8, target=(0.0, 0.0, 1.0), lens=85.0):
    """Perspective camera; azimuth 0 = front (-Y), positive turns toward the suit's left (+X)."""
    cam = _camera()
    cam.data.type = "PERSP"
    cam.data.sensor_fit = "VERTICAL"
    cam.data.lens = lens
    cam.data.clip_start = 0.05
    cam.data.clip_end = 50.0
    az, el = math.radians(azimuth), math.radians(elevation)
    t = Vector(target)
    cam.location = t + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * distance
    direction = t - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def setup_workbench(transparent=True):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_cavity = True
    sh.cavity_type = "BOTH"
    sh.cavity_ridge_factor = 1.2
    sh.cavity_valley_factor = 1.2
    sh.curvature_ridge_factor = 1.0
    sh.curvature_valley_factor = 1.0
    sh.show_specular_highlight = True
    sh.show_object_outline = False
    sh.show_shadows = False
    sc.display.render_aa = "8"
    sc.render.film_transparent = transparent
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"


def setup_cycles(samples=48, transparent=True):
    """Beauty preview: glossy black, metallic gold, emissive crystal."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.film_transparent = transparent
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    world = sc.world or bpy.data.worlds.new("RX_World")
    sc.world = world
    if hasattr(world, "use_nodes") and not world.node_tree:
        world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.20, 0.21, 0.26, 1.0)
    bg.inputs["Strength"].default_value = 0.6
    rig = [
        ("RX_Key", (2.5, -3.5, 3.4), 900.0, (1.0, 0.96, 0.9), 2.5),
        ("RX_RimBlue", (-3.2, 2.4, 2.6), 700.0, (0.35, 0.55, 1.0), 2.0),
        ("RX_RimPink", (3.4, 2.6, 2.2), 600.0, (1.0, 0.45, 0.85), 2.0),
        ("RX_Fill", (-3.0, -3.0, 1.2), 250.0, (0.85, 0.9, 1.0), 3.0),
    ]
    for name, loc, power, col, size in rig:
        ob = bpy.data.objects.get(name)
        if ob is None:
            ld = bpy.data.lights.new(name, "AREA")
            ob = bpy.data.objects.new(name, ld)
            sc.collection.objects.link(ob)
        ob.data.energy = power
        ob.data.color = col
        ob.data.size = size
        ob.location = loc
        ob.rotation_euler = (Vector((0.0, 0.0, 1.1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"


def render(path, res=(512, 768)):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def compare(view, render_png, out_png, height=768):
    """[reference | render on white | overlay] at the same scale."""
    from PIL import Image

    ref = Image.open(rx_ref.ref_path(view)).convert("RGB")
    w = int(round(height * rx_ref.IMG_W / rx_ref.IMG_H))
    ref = ref.resize((w, height), Image.LANCZOS)
    ren = Image.open(render_png).convert("RGBA").resize((w, height), Image.LANCZOS)
    white = Image.new("RGBA", (w, height), (255, 255, 255, 255))
    on_white = Image.alpha_composite(white, ren).convert("RGB")
    overlay = Image.blend(ref, on_white, 0.5)
    strip = Image.new("RGB", (w * 3 + 16, height), (255, 255, 255))
    strip.paste(ref, (0, 0))
    strip.paste(on_white, (w + 8, 0))
    strip.paste(overlay, (2 * w + 16, 0))
    strip.save(out_png)
    return out_png


def turntable_sheet(paths, out_png, height=768):
    from PIL import Image

    ims = [Image.open(p).convert("RGBA") for p in paths]
    w = int(round(height * ims[0].width / ims[0].height))
    sheet = Image.new("RGB", (w * len(ims), height), (255, 255, 255))
    for i, im in enumerate(ims):
        im = im.resize((w, height), Image.LANCZOS)
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        sheet.paste(Image.alpha_composite(bg, im).convert("RGB"), (i * w, 0))
    sheet.save(out_png)
    return out_png


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)
    return path
