"""Guardian v7: paint the v6 serpent with the four turnaround views (projection texturing).

Starts from the saved v6 blend (rig, clips, materials). Joins the skinned organs into two
skinned objects (body / head), smart-UV-projects an atlas per object, bakes position, normal
and the v6 procedural albedo into the atlas, then for every texel projects the four painted
views (04-turnaround.png: front, back, left, right) with
  - orthographic cameras fitted to the mask / model bounding boxes per view,
  - visibility (a BVH ray toward the camera must not hit another surface first),
  - a normal·view weight with soft seams, and
  - a background-mask reject (white paper never lands on the model),
falling back to the procedural albedo where no view sees the surface well. The atlas becomes
the baseColor texture (WebP); normal maps, the glowing face leaf, the rig and the clips stay.

Usage: Blender --background --python dogs_guardian_v7_paint.py -- --blend build/v6/guardian-v6.blend
         --turnaround 04-turnaround.png --out DIR [--stamp v7] [--atlas 2048] [--export 1]
"""
import sys, math, json, time, hashlib, struct, os
from pathlib import Path
import re
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from guardian_v3_lib import mesh_audit

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opts = {"blend": "", "turnaround": "", "views": "", "out": "", "stamp": "v7", "atlas": "2048", "export": "1", "side_weight": "0.8", "quality": "84",
        "hp": "0", "hp_radius": "24", "hp_k": "0.7", "tone": "1", "illus": "0", "head_atlas": ""}
for i in range(0, len(argv), 2):
    opts[argv[i].lstrip("-")] = argv[i + 1]
OUT = Path(opts["out"]); OUT.mkdir(parents=True, exist_ok=True)
START = time.time(); STAMP = opts["stamp"]; ATLAS = int(opts["atlas"])
bpy.ops.wm.open_mainfile(filepath=opts["blend"])
scene = bpy.context.scene
root = bpy.data.objects["GuardianV_Root"]; body = bpy.data.objects["BodyPivot"]; rig = bpy.data.objects["SerpentRig"]


def log(*a):
    print(*a, round(time.time() - START, 1), flush=True)


# ---------------------------------------------------------------- the painted views
def load_rgb(path):
    img = bpy.data.images.load(path); W, H = img.size
    img.colorspace_settings.name = "Non-Color"   # raw sRGB bytes, converted once below
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1, :, :3]
    bpy.data.images.remove(img)
    return px


PANELS = {"front": (0, 0, 532, 760), "back": (532, 0, 532, 760), "left": (0, 760, 532, 718), "right": (532, 760, 532, 718)}
# model axes per view: (image-x axis, image-y axis, direction from surface toward camera)
AXES = {"front": (np.array([1, 0, 0.]), np.array([0, 1, 0.]), np.array([0, 0, 1.])),
        "back": (np.array([-1, 0, 0.]), np.array([0, 1, 0.]), np.array([0, 0, -1.])),
        "left": (np.array([0, 0, -1.]), np.array([0, 1, 0.]), np.array([1, 0, 0.])),
        "right": (np.array([0, 0, 1.]), np.array([0, 1, 0.]), np.array([-1, 0, 0.]))}


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def dilate(m, n=1):
    for _ in range(n):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    return m


def erode(m, n=1):
    for _ in range(n):
        m = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)
    return m


def box_blur(a, r):
    """Mean over a (2r+1)^2 window via summed-area tables; a is (H,W) or (H,W,C)."""
    pad = np.pad(a, ((r + 1, r), (r + 1, r)) + (((0, 0),) if a.ndim == 3 else ()), mode="edge")
    c = pad.cumsum(0).cumsum(1)
    out = c[2 * r + 1:, 2 * r + 1:] - c[:-2 * r - 1, 2 * r + 1:] - c[2 * r + 1:, :-2 * r - 1] + c[:-2 * r - 1, :-2 * r - 1]
    return out / float((2 * r + 1) ** 2)


def make_view(panel, caption_cut=0.955):
    """White paper -> mask of the painted creature; the caption row at the bottom never paints."""
    paper = (panel.min(axis=2) > 0.90)
    creature = ~paper
    creature = erode(dilate(creature, 2), 2)
    creature = erode(creature, 1)
    h, w = creature.shape
    creature[int(h * caption_cut):, :] = False
    rows = creature.sum(axis=1); ys = np.where(rows > 3)[0]
    xs = np.where(creature[ys].sum(axis=0) > 0)[0]
    rgb = srgb_to_linear(panel)
    if opts["hp"] == "1":
        # local-contrast ratio: the painting's own low frequencies (shading, paper bleed) drop out and
        # the ridge/pit pattern survives as a multiplier around 1
        lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
        base = box_blur(np.where(creature, lum, np.nan_to_num(lum)), int(opts["hp_radius"]))
        ratio = np.clip(lum / np.maximum(base, 0.004), 0.4, 2.2)
        rgb = rgb * (ratio / np.maximum(lum, 1e-4))[..., None] * np.maximum(base, 0.004)[..., None] * 0 + ratio[..., None]
    return {"rgb": rgb, "mask": creature, "bbox": (int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())), "size": (w, h)}


VIEWS = {}
if opts.get("views"):
    for item in opts["views"].split(","):
        name, vpath = item.split("=", 1)
        VIEWS[name] = make_view(load_rgb(vpath)); log("VIEW", name, VIEWS[name]["size"], "bbox", VIEWS[name]["bbox"])
else:
    px = load_rgb(opts["turnaround"])
    for name, (x0, y0, w, h) in PANELS.items():
        VIEWS[name] = make_view(px[y0:y0 + h, x0:x0 + w, :], 0.93); log("VIEW", name, "bbox", VIEWS[name]["bbox"])

# ---------------------------------------------------------------- join the organs into two skinned objects
def join(names_prefixes, new_name):
    obs = [o for o in bpy.data.objects if o.type == "MESH" and any(o.name.startswith(p) for p in names_prefixes)]
    bpy.ops.object.select_all(action="DESELECT")
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = new_name
    return ob


bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
A = join(["Serpent |", "Tails |", "Arms |", "Frond_"], "Serpent | painted body, arms and tails")
B = join(["Head |", "Jaw |", "Mouth |", "HeadBeads |"], "Head | painted head")
FACE = next(o for o in bpy.data.objects if o.name.startswith("Face |"))
for ob in (A, B):
    mods = [m for m in ob.modifiers if m.type == "ARMATURE"]
    for m in mods[1:]:
        ob.modifiers.remove(m)
    if not mods:
        m = ob.modifiers.new("Serpent skin", "ARMATURE"); m.object = rig; m.use_vertex_groups = True
log("JOINED", A.name, len(A.data.vertices), B.name, len(B.data.vertices))


# ---------------------------------------------------------------- atlas UVs and bakes
def smart_uv(ob, name="AtlasUV"):
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    layer = ob.data.uv_layers.new(name=name); ob.data.uv_layers.active = layer
    for l in ob.data.uv_layers:
        l.active_render = (l.name == name)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0025, area_weight=0.6, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return layer


def bake(ob, kind, size, name, normal_space="OBJECT"):
    """Cycles bake of POSITION / NORMAL / DIFFUSE(color) into a fresh float image."""
    im = bpy.data.images.new(name, size, size, alpha=True, float_buffer=True)
    im.colorspace_settings.name = "Non-Color"
    im.pixels.foreach_set(np.zeros(size * size * 4, np.float32))   # alpha 0 outside the UV islands
    nodes_added = []
    for mat in ob.data.materials:
        nt = mat.node_tree
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = im; nt.nodes.active = n; nodes_added.append((nt, n))
    scene.render.engine = "CYCLES"; scene.cycles.samples = 1; scene.cycles.use_denoising = False; scene.cycles.device = "CPU"
    scene.render.bake.use_selected_to_active = False; scene.render.bake.margin = 6; scene.render.bake.use_clear = False
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    if kind == "DIFFUSE":
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=6)
    elif kind == "NORMAL":
        bpy.ops.object.bake(type="NORMAL", normal_space=normal_space, margin=6)
    else:
        bpy.ops.object.bake(type=kind, margin=6)
    arr = np.array(im.pixels[:], dtype=np.float32).reshape(size, size, 4)
    for nt, n in nodes_added:
        nt.nodes.remove(n)
    bpy.data.images.remove(im)
    return arr


def paint_object(ob, size, side_weight):
    smart_uv(ob)
    pos = bake(ob, "POSITION", size, "bake-pos")
    nrm = bake(ob, "NORMAL", size, "bake-nrm")
    alb = bake(ob, "DIFFUSE", size, "bake-alb")
    log("BAKED", ob.name)
    covered = pos[..., 3] > 0.5
    # Blender bakes object-space positions (the object sits at identity under the root);
    # convert to glTF axes: (x, z, -y)
    P = pos[..., :3]; N = nrm[..., :3] * 2 - 1
    Pg = np.stack([P[..., 0], P[..., 2], -P[..., 1]], -1); Ng = np.stack([N[..., 0], N[..., 2], -N[..., 1]], -1)
    Ng /= np.maximum(np.linalg.norm(Ng, axis=-1, keepdims=True), 1e-6)
    # model bounds (glTF) from the evaluated meshes of both objects
    dg = bpy.context.evaluated_depsgraph_get()
    allp = []
    for o in (A, B):
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
        allp.append(np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1)); ev.to_mesh_clear()
    allp = np.concatenate(allp); lo, hi = allp.min(0), allp.max(0)
    # one BVH over both objects for visibility
    bm = bmesh.new()
    for o in (A, B):
        ev = o.evaluated_get(dg); me = ev.to_mesh(); bm.from_mesh(me); ev.to_mesh_clear()
    bvh = BVHTree.FromBMesh(bm, epsilon=0.0); bm.free()
    acc = np.zeros((size, size, 3), np.float32); wsum = np.zeros((size, size), np.float32)
    idx = np.argwhere(covered)
    ious = {}
    for name, view in VIEWS.items():
        ax, ay, d = AXES[name]
        w_img, h_img = view["size"]; x0, x1, y0, y1 = view["bbox"]
        mx = allp @ ax; my = allp @ ay
        mxa, mxb, mya, myb = mx.min(), mx.max(), my.min(), my.max()
        # fit the model's bounding box to the painted view's bounding box (anisotropic: the
        # painting is drawn a little wider than the model; alignment matters more than a few
        # percent of stretch)
        sx = (x1 - x0) / max(1e-6, mxb - mxa); sy = (y1 - y0) / max(1e-6, myb - mya)
        u = (Pg @ ax - mxa) * sx + x0
        v = y1 - (Pg @ ay - mya) * sy
        inside = (u >= 0) & (u < w_img - 1) & (v >= 0) & (v < h_img - 1)
        uc = np.clip(u, 0, w_img - 1.001); vc = np.clip(v, 0, h_img - 1.001)
        u0 = np.floor(uc).astype(int); v0 = np.floor(vc).astype(int)
        fu = (uc - u0)[..., None]; fv = (vc - v0)[..., None]

        def bil(a):
            a00 = a[v0, u0]; a01 = a[v0, u0 + 1]; a10 = a[v0 + 1, u0]; a11 = a[v0 + 1, u0 + 1]
            if a.ndim == 2:
                f_u = fu[..., 0]; f_v = fv[..., 0]
                return (a00 * (1 - f_u) + a01 * f_u) * (1 - f_v) + (a10 * (1 - f_u) + a11 * f_u) * f_v
            return (a00 * (1 - fu) + a01 * fu) * (1 - fv) + (a10 * (1 - fu) + a11 * fu) * fv
        rgb = bil(view["rgb"]); ink = bil(view["mask"].astype(np.float32)) * inside
        # silhouette IoU of this view (every covered texel, no visibility): a guide, not acceptance
        hit = np.zeros((h_img, w_img), bool)
        hit[np.clip(np.round(v[covered]).astype(int), 0, h_img - 1), np.clip(np.round(u[covered]).astype(int), 0, w_img - 1)] = True
        hit = dilate(hit, 3 if w_img > 1000 else 1)   # texels are sparser than hi-res pixels
        ious[name] = float((hit & view["mask"]).sum() / max(1, (hit | view["mask"]).sum()))
        facing = Ng @ d
        base_w = np.clip(facing, 0, 1) ** 1.5 * (side_weight if name in ("left", "right") else 1.0) * ink
        # visibility: the first surface toward the camera gets the paint, nothing leaks behind it
        vis = np.zeros((size, size), np.float32)
        cand = np.argwhere(covered & (base_w > 0.02))
        dB = Vector((d[0], -d[2], d[1]))   # glTF direction -> Blender
        for (iy, ix) in cand:
            p = Pg[iy, ix]; n = Ng[iy, ix]
            origin = Vector((p[0], -p[2], p[1])) + Vector((n[0], -n[2], n[1])) * 0.006
            vis[iy, ix] = 0.0 if bvh.ray_cast(origin, dB, 50.0)[0] is not None else 1.0
        w = base_w * vis
        acc += rgb * w[..., None]; wsum += w
        log("PROJECTED", name, "iou", round(ious[name], 3), "candidates", len(cand), "visible", int(vis.sum()))
    # compose: painted where seen, procedural albedo elsewhere, blended by confidence
    conf = np.clip(wsum / 0.25, 0, 1)
    painted = acc / np.maximum(wsum, 1e-6)[..., None]
    if opts["illus"] == "1":   # anime (owner 2026-10-30): the authored tiles carry the pattern; no projection, no grain
        out = alb[..., :3].copy()
    elif opts["hp"] == "1":
        # the projected field is a contrast ratio: modulate the clean tile base with it
        # gentle, in log space: a ridge brightens the tile base by at most x1.7, a pit darkens it by at most
        # x0.53 (the earlier linear x1.6 factor blew ridges to white and pits to black)
        ratio = np.clip(np.where(conf[..., None] > 0, painted, 1.0), 0.4, 2.2)
        out = alb[..., :3] * np.power(ratio, float(opts["hp_k"]) * conf[..., None])
    else:
        blend = painted * conf[..., None] + alb[..., :3] * (1 - conf[..., None])
        # lighten-only composite: the paint drives the membranes and the glow zones, while the
        # procedural pale bone rims (which follow the real hooks) are never darkened by paint
        # whose own hooks sit elsewhere
        out = np.maximum(alb[..., :3], blend)
    if opts["tone"] == "1" and opts["illus"] != "1" and ob.name.startswith("Serpent"):   # the runtime measured the body, not the head
        # match the body's tone distribution to the originals (runtime measurement, sRGB on the body):
        # p50 ~ (63,68,60), p92 ~ (160,187,144) -> linear luminance targets
        T50, T92 = 0.0519, 0.416
        lum = 0.2126 * out[..., 0] + 0.7152 * out[..., 1] + 0.0722 * out[..., 2]
        sel = covered & (lum > 1e-4)
        p50, p92 = np.percentile(lum[sel], [50, 92])
        if p92 > p50 > 1e-5:
            g = math.log(T92 / T50) / math.log(p92 / p50); a = T50 / p50 ** g
            lum2 = a * np.power(np.maximum(lum, 1e-6), g)
            out = out * np.where(sel, lum2 / np.maximum(lum, 1e-6), 1.0)[..., None]
            log("TONE", "p50", round(float(p50), 4), "p92", round(float(p92), 4), "gamma", round(g, 3), "gain", round(a, 3))
    elif opts["tone"] == "3" and opts["illus"] != "1" and ob.name.startswith("Serpent"):
        # three-point match of the body luminance to the originals as the coordinator reads them:
        # pits near-black (p30 -> sRGB 30), 35-45% of the area pale (p60 -> sRGB 125) and a bright top
        # decile (p92 -> sRGB 180); piecewise power law through the three anchors in log space
        T = np.array([0.0137, 0.23, 0.50])
        lum = 0.2126 * out[..., 0] + 0.7152 * out[..., 1] + 0.0722 * out[..., 2]
        sel = covered & (lum > 1e-4)
        a30, a50, a92 = np.percentile(lum[sel], [30, 60, 92])
        if a92 > a50 > a30 > 1e-5:
            xs = np.log(np.array([a30, a50, a92])); ys = np.log(T)
            lx = np.log(np.maximum(lum, 1e-6)); ly = np.interp(lx, xs, ys)
            ly = np.where(lx < xs[0], ys[0] + (ys[1] - ys[0]) / (xs[1] - xs[0]) * (lx - xs[0]), ly)
            ly = np.where(lx > xs[2], ys[2] + (ys[2] - ys[1]) / (xs[2] - xs[1]) * (lx - xs[2]), ly)
            out = out * np.where(sel, np.exp(ly) / np.maximum(lum, 1e-6), 1.0)[..., None]
            log("TONE3", "atlas p30/p60/p92", round(float(a30), 4), round(float(a50), 4), round(float(a92), 4), "-> 0.0137/0.23/0.50")
    if opts["tone"] == "3" and opts["illus"] != "1" and ob.name.startswith("Head"):
        # v18: the head atlas gets its own three-point match (05's head: emerald pits, mint ridges)
        T = np.array([0.0120, 0.16, 0.44])
        lum = 0.2126 * out[..., 0] + 0.7152 * out[..., 1] + 0.0722 * out[..., 2]
        sel = covered & (lum > 1e-4)
        a30, a50, a92 = np.percentile(lum[sel], [30, 60, 92])
        if a92 > a50 > a30 > 1e-5:
            xs = np.log(np.array([a30, a50, a92])); ys = np.log(T)
            lx = np.log(np.maximum(lum, 1e-6)); ly = np.interp(lx, xs, ys)
            ly = np.where(lx < xs[0], ys[0] + (ys[1] - ys[0]) / (xs[1] - xs[0]) * (lx - xs[0]), ly)
            ly = np.where(lx > xs[2], ys[2] + (ys[2] - ys[1]) / (xs[2] - xs[1]) * (lx - xs[2]), ly)
            out = out * np.where(sel, np.exp(ly) / np.maximum(lum, 1e-6), 1.0)[..., None]
            log("TONE3-HEAD", "atlas p30/p60/p92", round(float(a30), 4), round(float(a50), 4), round(float(a92), 4))
    # v18 (owner: 顔まわりの色合い): pull the chroma toward 05's palette - deep emerald in the pits, pale mint on the
    # ridges - instead of neutral grey/white; luminance is kept, only the hue/saturation moves
    strength = 1.0 if opts["illus"] == "1" else (0.85 if ob.name.startswith("Head") else 0.7)   # anime: flat two-colour palette
    lum = 0.2126 * out[..., 0] + 0.7152 * out[..., 1] + 0.0722 * out[..., 2]
    f = np.clip(lum / 0.45, 0, 1) ** 0.6
    dark_em = np.array([0.0065, 0.042, 0.019]); mint = np.array([0.30, 0.56, 0.335])
    pal = dark_em[None, None, :] * (1 - f)[..., None] + mint[None, None, :] * f[..., None]
    pal_l = 0.2126 * pal[..., 0] + 0.7152 * pal[..., 1] + 0.0722 * pal[..., 2]
    pal = pal * (lum / np.maximum(pal_l, 1e-6))[..., None]
    out = np.where(covered[..., None], out * (1 - strength) + pal * strength, out)
    out = np.clip(out, 0, 1)
    out[~covered] = 0
    # fill the UV gutters from the islands so mipmaps never bleed black into the model
    filled = covered.copy()
    for _ in range(14):
        accn = np.zeros_like(out); cnt = np.zeros(covered.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(filled, (dy, dx), (0, 1)); shc = np.roll(out, (dy, dx), (0, 1))
            accn += shc * sh[..., None]; cnt += sh
        new = (~filled) & (cnt > 0)
        out[new] = accn[new] / cnt[new][:, None]
        filled |= new
    out[~filled] = out[covered].mean(axis=0)
    return out, conf, covered, ious


log("PAINT A")
atlasA, confA, covA, iouA = paint_object(A, ATLAS, float(opts["side_weight"]))
log("PAINT B")
atlasB, confB, covB, iouB = paint_object(B, int(opts["head_atlas"] or ATLAS // 2), float(opts["side_weight"]))
log("confidence coverage A", float((confA[covA] > 0.5).mean()), "B", float((confB[covB] > 0.5).mean()))


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def make_image(name, arr):
    """8-bit sRGB atlas: Image.pixels of a byte image holds the encoded bytes, so the linear
    composite must be sRGB-encoded here or dark greens collapse to black."""
    size = arr.shape[0]
    im = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    rgba = np.concatenate([linear_to_srgb(arr), np.ones((size, size, 1), np.float32)], -1)
    # Blender image pixels are bottom-up; the bake arrays came from the same convention
    im.pixels.foreach_set(rgba.ravel().astype(np.float32))
    # store the atlas as a lossy WebP file and reload it, so the glTF exporter (AUTO) keeps it
    # as WebP while the normal maps stay lossless PNG
    tmp = OUT / f"{name}.webp"
    scene.view_settings.view_transform = "Standard"; scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "WEBP"; scene.render.image_settings.quality = int(opts["quality"])
    scene.render.image_settings.color_mode = "RGB"
    im.save_render(str(tmp), scene=scene)
    bpy.data.images.remove(im)
    im = bpy.data.images.load(str(tmp)); im.name = name; im.pack()
    return im


imA = make_image("serpent-paint-atlas", atlasA); imB = make_image("head-paint-atlas", atlasB)
# the emissive face lattice is a colour image: store it as WebP too (budget)
lat = bpy.data.images.get("face-lattice")
if lat is not None:
    tmp = OUT / "face-lattice.webp"
    scene.view_settings.view_transform = "Standard"; scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "WEBP"; scene.render.image_settings.quality = 90; scene.render.image_settings.color_mode = "RGB"
    lat.save_render(str(tmp), scene=scene)
    users = [(mat, node) for mat in bpy.data.materials if mat.use_nodes for node in mat.node_tree.nodes if node.type == "TEX_IMAGE" and node.image is lat]
    bpy.data.images.remove(lat)
    lat = bpy.data.images.load(str(tmp)); lat.name = "face-lattice"; lat.pack()
    for mat, node in users:
        node.image = lat
# --- materials: baseColor from the atlas (no vertex colour multiply), keep the normal maps
def painted_material(src, name, image):
    m = src.copy(); m.name = name; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    for node in list(nt.nodes):
        if node.type == "VERTEX_COLOR":
            nt.nodes.remove(node)
        elif node.type == "TEX_IMAGE" and node.image and node.image.name == "skin-micro-normal":
            nt.nodes.remove(node)   # the painted atlas carries the head's detail; drop the 193 KB micro normal
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = image
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "AtlasUV"
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"]); nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    return m


for ob in (A, B):   # the AO is baked into the atlas: no vertex colours may remain on painted primitives
    for nm in [ca.name for ca in ob.data.color_attributes]:
        try:
            ob.data.color_attributes.remove(ob.data.color_attributes[nm])
        except RuntimeError as exc:
            log("COLOR_ATTR kept", nm, str(exc)[:70])
core = bpy.data.materials.get("Rune | v3 whorl core")
if core is not None:
    nt = core.node_tree; b = nt.nodes["Principled BSDF"]
    for node in list(nt.nodes):
        if node.type == "VERTEX_COLOR":
            nt.nodes.remove(node)
    b.inputs["Base Color"].default_value = (0.18, 0.55, 0.26, 1)
for ob, image in ((A, imA), (B, imB)):
    for slot in ob.material_slots:
        src = slot.material
        if src is None or "Rune |" in src.name or "Glass |" in src.name or "Horn |" in src.name:
            continue   # the glow cores keep their emissive material; Glass and Horn keep their constant colours
        slot.material = painted_material(src, f"{src.name.split(' |')[0]} | painted {ob.name[:4]}", image)   # stable name across versions
# v20: the head group now carries the galaxy domes (tile slots) - after painting every slot reads the same head atlas, so
# duplicate names ("Skin | painted Head.001") are folded into the base slot to keep the material list stable (12)
for ob in (B,):
    names = [s.material.name if s.material else "" for s in ob.material_slots]
    remap = {}
    for idx, nm in enumerate(names):
        base_nm = re.sub(r"\.\d{3}$", "", nm)   # (not `root`: that is the rig's root object below)
        if base_nm != nm and base_nm in names:
            remap[idx] = names.index(base_nm)
    if remap:
        for p in ob.data.polygons:
            if p.material_index in remap:
                p.material_index = remap[p.material_index]
        bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.material_slot_remove_unused()
        for idx in remap:
            m = bpy.data.materials.get(names[idx])
            if m is not None and m.users == 0:
                bpy.data.materials.remove(m)
        log("MATERIALS folded", {names[k]: names[v] for k, v in remap.items()})
log("MATERIALS")

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"guardian-{STAMP}-painted.blend"))   # never over the builder's blend

# ---------------------------------------------------------------- export (same contract as v5/v6)
HEAD_BONES = ["NeckBaseJoint", "NeckHeadJoint", "HeadPivot", "JawPivot"]
NOSE_LOCAL = None
bones = rig.pose.bones


def solo(name):
    for tr in rig.animation_data.nla_tracks:
        tr.mute = tr.name != name
    scene.frame_set(1); bpy.context.view_layer.update()


posechecks = {}
for name in ("Rest", "Exhale"):
    solo(name)
    socket = rig.matrix_world @ bones["MouthSocket"].head; aim = rig.matrix_world @ bones["MouthAim"].head
    gl = lambda p: [round(p.x, 7), round(p.z, 7), round(-p.y, 7)]
    posechecks[name] = {"mouthSocket": gl(socket), "mouthAim": gl(aim), "direction": gl((aim - socket).normalized())}
for tr in rig.animation_data.nla_tracks:
    tr.mute = False
scene.frame_set(1)
if opts["export"] == "1":
    bpy.ops.object.select_all(action="DESELECT")
    for ob in [root, *root.children_recursive]:
        ob.select_set(True)

    def strip_exhale(path):
        raw = path.read_bytes(); jlen = struct.unpack_from("<I", raw, 12)[0]; g = json.loads(raw[20:20 + jlen]); rest = raw[20 + jlen:]
        names = {i: n.get("name") for i, n in enumerate(g["nodes"])}
        for anim in g["animations"]:
            if anim["name"] != "Exhale":
                continue
            keep = [ch for ch in anim["channels"] if names.get(ch["target"]["node"]) in HEAD_BONES]
            used = sorted({ch["sampler"] for ch in keep}); remap = {s: k for k, s in enumerate(used)}
            anim["samplers"] = [anim["samplers"][s] for s in used]
            for ch in keep:
                ch["sampler"] = remap[ch["sampler"]]
            anim["channels"] = keep
        js = json.dumps(g, separators=(",", ":"), ensure_ascii=True).encode(); js += b" " * ((-len(js)) % 4)
        path.write_bytes(struct.pack("<III", 0x46546c67, 2, 12 + 8 + len(js) + len(rest)) + struct.pack("<II", len(js), 0x4e4f534a) + js + rest)
        return g
    assets = []; lastg = None
    for compressed, name in [(True, f"guardian-{STAMP}-draco.glb")]:
        path = OUT / name
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_yup=True,
                                  export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
                                  export_frame_range=False, export_anim_slide_to_zero=True, export_optimize_animation_size=True,
                                  export_def_bones=False, export_rest_position_armature=True, export_skins=True,
                                  export_vertex_color="MATERIAL", export_all_vertex_colors=False,
                                  export_image_format="AUTO",
                                  export_draco_mesh_compression_enable=compressed, export_draco_mesh_compression_level=10,
                                  export_draco_position_quantization=12, export_draco_normal_quantization=9,
                                  export_draco_texcoord_quantization=11, export_draco_color_quantization=8)
        lastg = strip_exhale(path)
        assets.append({"file": name, "draco": compressed, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    audit = [mesh_audit(o) for o in root.children_recursive if o.type == "MESH"]
    base = json.loads((Path(opts["blend"]).parent / "model-manifest.json").read_text())
    report = dict(base)
    report.update({"stage": "v7: v6 serpent painted by projecting the four turnaround views (visibility and view-angle weighted, procedural fallback)",
                   "version": 7, "revision": STAMP, "model": assets[-1]["file"], "assetBytes": assets[-1]["bytes"], "assetSha256": assets[-1]["sha256"],
                   "assets": assets, "meshAudit": audit,
                   "meshStats": {"objects": len(audit), "vertices": sum(a["vertices"] for a in audit), "triangles": sum(a["triangles"] for a in audit)},
                   "poseChecks": {k: {**base.get("poseChecks", {}).get(k, {}), **v} for k, v in posechecks.items()},
                   "painting": {"source": opts["views"] or "public/dogs-archive-20261028/reference/guardian-turnaround.png (four views)",
                                "atlas": {"body": ATLAS, "head": ATLAS // 2, "uv": "AtlasUV (TEXCOORD after MicroSurfaceUV/AuthoredUV)"},
                                "weights": "bbox-fitted orthographic views, bilinear, normal·view^1.5, sides x%s, visibility ray, soft ink mask; lighten-only over the v6 procedural albedo (pale rims kept); gutters filled" % opts["side_weight"],
                                "confidenceCoverage": {"body": float((confA[covA] > 0.5).mean()), "head": float((confB[covB] > 0.5).mean())},
                                "silhouetteIoU": {"body": iouA, "head": iouB}},
                   "colorAttribute": "COLOR_0 only on the glow cores and the face leaf; the painted objects use the atlas",
                   "sourceScripts": ["scripts/blender/guardian_v3_lib.py", "scripts/blender/dogs_guardian_v5.py", "scripts/blender/dogs_guardian_v7_paint.py"],
                   "sourceSha256": {p: hashlib.sha256((HERE.parent.parent / p).read_bytes()).hexdigest() for p in
                                    ["scripts/blender/guardian_v3_lib.py", "scripts/blender/dogs_guardian_v5.py", "scripts/blender/dogs_guardian_v7_paint.py"]},
                   "referenceImagesUsedAsTexture": True,
                   "secondsBeforeRender": time.time() - START})
    (OUT / "model-manifest.json").write_text(json.dumps(report, indent=2))
    log("EXPORT_DONE", json.dumps(assets))
