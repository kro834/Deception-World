"""Guardian v22 skin: an overlapping snake-scale texture set authored as Blender shader nodes and baked.

Owner (2026-10-30): 「素体はより黒っぽい」「体の素材をブラッシュアップして質感を調整して」「blenderで質感素材は作って」.

The pattern is a node tree (Texture Coordinate -> math nodes -> White Noise per scale -> Emission) on a unit plane,
baked with Cycles (EMIT, 2x supersampled) into one tile, then packed into two images:
  skin-scale-normal : tangent-space normal of the relief (rims slightly raised, scales slightly domed, a small step
                      down where a scale's free edge lies over the next one)
  skin-scale-orm    : R = scale outline mask (1 on the free-edge rim band, 0 inside and in the gaps; NOT a glTF
                      occlusion), G = roughness (scales 0.30 lacquer, rims 0.42, gaps 0.80), B = metallic 0
The tile is periodic: COLS scale columns along u (the organ's length) and ROWS staggered rows along v (around the
organ). It is applied on MicroSurfaceUV (TEXCOORD_0), which guardian_v3_lib writes as a scale parametrisation
(SCALE_UV): whole scales around each ring, scale size proportional to the local perimeter.

Overlap: of all scales whose oval covers a point, the one nearer the organ's root (smaller centre u) lies on top,
so each scale shows as a crescent between the free edge of the scale ahead of it and its own free edge.
"""
import math
from pathlib import Path
import numpy as np
import bpy

COLS, ROWS = 8, 8
A_HALF, B_HALF = 0.80, 0.64      # oval half-length (along u, in scale cells) and half-width (across, in rows)
TILE_W, TILE_H = 1024, 1024      # one cell = 128 x 128 texels; square (smart UV projection reads the aspect of a material's image)
RELIEF = 0.11                    # relief height in units of the scale width
ASPECT = 1.15                    # a scale cell on the model is ASPECT x as long (along the organ) as it is wide


class _NB:
    """Tiny expression builder over ShaderNodeMath nodes."""

    def __init__(self, nt):
        self.nt = nt; self.x = 0

    def _node(self, kind, **props):
        n = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        n.location = (self.x, 0); self.x += 3
        return n

    def _in(self, sock, value):
        if isinstance(value, (int, float)):
            sock.default_value = float(value)
        else:
            self.nt.links.new(value, sock)

    def op(self, operation, a, b=None, c=None):
        n = self._node("ShaderNodeMath", operation=operation)
        self._in(n.inputs[0], a)
        if b is not None:
            self._in(n.inputs[1], b)
        if c is not None:
            self._in(n.inputs[2], c)
        return n.outputs[0]

    def add(self, a, b): return self.op("ADD", a, b)
    def sub(self, a, b): return self.op("SUBTRACT", a, b)
    def mul(self, a, b): return self.op("MULTIPLY", a, b)
    def div(self, a, b): return self.op("DIVIDE", a, b)
    def floor(self, a): return self.op("FLOOR", a)
    def fmod(self, a, b): return self.op("FLOORED_MODULO", a, b)
    def lt(self, a, b): return self.op("LESS_THAN", a, b)
    def mx(self, a, b): return self.op("MAXIMUM", a, b)
    def sqrt(self, a): return self.op("SQRT", a)
    def pw(self, a, b): return self.op("POWER", a, b)

    def lerp(self, a, b, t):   # a + t (b - a)
        return self.add(a, self.mul(t, self.sub(b, a)))

    def smooth(self, e0, e1, x):
        n = self._node("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
        self._in(n.inputs["From Min"], e0); self._in(n.inputs["From Max"], e1); self._in(n.inputs["Value"], x)
        return n.outputs["Result"]

    def noise3(self, x, y):
        cmb = self._node("ShaderNodeCombineXYZ"); self._in(cmb.inputs[0], x); self._in(cmb.inputs[1], y)
        cmb.inputs[2].default_value = 7.0
        wn = self._node("ShaderNodeTexWhiteNoise", noise_dimensions="3D")
        self.nt.links.new(cmb.outputs[0], wn.inputs["Vector"])
        sep = self._node("ShaderNodeSeparateColor")
        self.nt.links.new(wn.outputs["Color"], sep.inputs[0])
        return sep.outputs[0], sep.outputs[1], sep.outputs[2]


def build_scale_material(name="SkinScaleAuthor"):
    """The procedural scale pattern as a node tree; Emission = (height, outline, roughness)."""
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    nb = _NB(nt)
    tc = nb._node("ShaderNodeTexCoord")
    sep = nb._node("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["UV"], sep.inputs[0])
    X = nb.mul(sep.outputs[0], COLS); Y = nb.mul(sep.outputs[1], ROWS)
    rowf = nb.floor(Y)
    best = {"cx": 1e6, "dxn": 0.0, "dyn": 0.0, "d": 2.0, "r": 0.5}
    for dr in (-1, 0, 1):
        R = nb.add(rowf, dr)
        sR = nb.mul(nb.fmod(R, 2.0), 0.5)
        colf = nb.floor(nb.sub(X, sR))
        for dc in (-1, 0, 1):
            C = nb.add(colf, dc)
            r1, r2, r3 = nb.noise3(nb.fmod(C, COLS), nb.fmod(R, ROWS))      # periodic per-scale randoms
            cx = nb.add(nb.add(C, nb.add(sR, 0.5)), nb.mul(nb.sub(r1, 0.5), 0.10))
            cy = nb.add(nb.add(R, 0.5), nb.mul(nb.sub(r2, 0.5), 0.08))
            size = nb.add(1.0, nb.mul(nb.sub(r3, 0.5), 0.10))
            dxn = nb.div(nb.sub(X, cx), nb.mul(size, A_HALF))
            dyn = nb.div(nb.sub(Y, cy), nb.mul(size, B_HALF))
            # a slightly egg-shaped oval: fuller toward the free edge (+u), narrower at the hidden base
            dyn = nb.div(dyn, nb.add(1.0, nb.mul(dxn, 0.12)))
            d = nb.sqrt(nb.add(nb.mul(dxn, dxn), nb.mul(dyn, dyn)))
            take = nb.mul(nb.lt(d, 1.0), nb.lt(cx, best["cx"]))   # covered, and nearer the root than the current top
            best = {"cx": nb.lerp(best["cx"], cx, take), "dxn": nb.lerp(best["dxn"], dxn, take),
                    "dyn": nb.lerp(best["dyn"], dyn, take), "d": nb.lerp(best["d"], d, take), "r": nb.lerp(best["r"], r3, take)}
    d = best["d"]
    covered = nb.lt(d, 1.0)
    dclip = nb.op("MINIMUM", d, 1.0)
    t = nb.mul(nb.add(best["dxn"], 1.0), 0.5)                            # 0 hidden base .. 1 free edge
    dome = nb.sqrt(nb.mx(nb.sub(1.0, nb.pw(dclip, 4.0)), 0.0))
    rim = nb.mul(nb.smooth(0.78, 0.88, dclip), nb.sub(1.0, nb.smooth(0.93, 0.995, dclip)))
    h = nb.add(nb.add(nb.add(0.30, nb.mul(t, 0.28)), nb.mul(dome, 0.30)), nb.mul(rim, 0.10))
    h = nb.mul(h, covered)
    outline = nb.mul(rim, covered)
    rough_scale = nb.add(0.28, nb.mul(best["r"], 0.04))
    rough = nb.lerp(0.80, nb.lerp(rough_scale, 0.42, rim), covered)
    comb = nb._node("ShaderNodeCombineColor")
    nt.links.new(h, comb.inputs[0]); nt.links.new(outline, comb.inputs[1]); nt.links.new(rough, comb.inputs[2])
    em = nb._node("ShaderNodeEmission"); em.inputs["Strength"].default_value = 1.0
    nt.links.new(comb.outputs[0], em.inputs["Color"])
    out = nb._node("ShaderNodeOutputMaterial"); nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def bake_tile(supersample=2):
    """Cycles EMIT bake of the node pattern on a unit plane; returns (height, outline, roughness) float arrays
    in Blender pixel order (row 0 = v 0), TILE_H x TILE_W."""
    scene = bpy.context.scene
    W, H = TILE_W * supersample, TILE_H * supersample
    mat = build_scale_material()
    me = bpy.data.meshes.new("SkinScalePlane")
    me.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", [0, 0, 1, 0, 1, 1, 0, 1])
    me.materials.append(mat)
    ob = bpy.data.objects.new("SkinScalePlane", me); bpy.context.collection.objects.link(ob)
    im = bpy.data.images.new("skin-scale-bake", W, H, alpha=False, float_buffer=True)
    im.colorspace_settings.name = "Non-Color"
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage"); tex.image = im; mat.node_tree.nodes.active = tex
    prev_engine = scene.render.engine
    scene.render.engine = "CYCLES"; scene.cycles.samples = 1; scene.cycles.use_denoising = False; scene.cycles.device = "CPU"
    scene.render.bake.use_selected_to_active = False; scene.render.bake.margin = 0
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="EMIT", margin=0)
    arr = np.array(im.pixels[:], dtype=np.float32).reshape(H, W, 4)[..., :3]
    arr = arr.reshape(TILE_H, supersample, TILE_W, supersample, 3).mean(axis=(1, 3))   # 2x2 box: antialiased edges
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me); bpy.data.images.remove(im)
    scene.render.engine = prev_engine
    return arr[..., 0], arr[..., 1], arr[..., 2], mat


def _save_webp(name, rgb, out_dir, quality):
    """Data image (Non-Color bytes) -> WebP file -> packed image (the glTF exporter keeps WebP)."""
    Hh, Ww = rgb.shape[:2]
    im = bpy.data.images.new(name, Ww, Hh, alpha=False, float_buffer=False)
    im.colorspace_settings.name = "Non-Color"   # before the pixels (see guardian_v8_tiles._byte_image)
    im.pixels.foreach_set(np.concatenate([np.clip(rgb, 0, 1), np.ones((Hh, Ww, 1))], -1).ravel().astype(np.float32))
    path = str(Path(out_dir) / f"{name}.webp")
    im.file_format = "WEBP"; im.save(filepath=path, quality=quality)
    bpy.data.images.remove(im)
    im = bpy.data.images.load(path); im.name = name; im.colorspace_settings.name = "Non-Color"; im.pack()
    return im


def make_scale_maps(out_dir, quality=90):
    """Bake the tile, derive the normal map, pack ORM; return images and the flat texel's UV."""
    h, outline, rough, _mat = bake_tile()
    # cell metrics: a texel is 1/128 of a scale length along u and 1/128 of a scale width along v; the scale length
    # on the model is SCALE_UV aspect x the width, so du in widths = aspect / 128
    aspect = ASPECT
    du = aspect * COLS / TILE_W; dv = ROWS / TILE_H
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * du); gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * dv)
    nx = -gx * RELIEF; ny = -gy * RELIEF; nz = np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5], -1)
    orm = np.stack([outline, rough, np.zeros_like(h)], -1)
    # the flattest texel inside a scale body (away from rims): masked regions (domes, knobs) sample it
    slope = np.hypot(gx, gy)
    ok = (h > 0.2) & (outline < 0.02)
    slope_m = np.where(ok, slope, np.inf)
    iy, ix = np.unravel_index(int(np.argmin(slope_m)), slope_m.shape)
    flat_uv = ((ix + 0.5) / TILE_W, (iy + 0.5) / TILE_H)
    imgs = {"normal": _save_webp("skin-scale-normal", nrm, out_dir, quality),
            "orm": _save_webp("skin-scale-orm", orm, out_dir, quality)}
    stats = {"heightRange": [float(h.min()), float(h.max())], "outlineArea": float((outline > 0.5).mean()),
             "gapArea": float((h <= 0.0).mean()), "roughness": [float(rough.min()), float(np.median(rough)), float(rough.max())],
             "flatUV": flat_uv, "flatSlope": float(slope[iy, ix])}
    return imgs, flat_uv, stats


def attach_scale_maps(mat, normal_img, orm_img, normal_strength=0.8, uv_map="MicroSurfaceUV"):
    """Put the scale maps on an exportable Principled material: Normal Map (tangent) and the ORM image's G -> Roughness,
    B -> Metallic (glTF metallicRoughnessTexture), both on `uv_map`. Any previous normal map node is replaced."""
    nt = mat.node_tree; b = nt.nodes["Principled BSDF"]
    for link in list(nt.links):
        if link.to_node == b and link.to_socket.name in ("Normal", "Roughness", "Metallic"):
            nt.links.remove(link)
    for node in list(nt.nodes):
        if node.type == "NORMAL_MAP" or (node.type == "TEX_IMAGE" and node.image and "normal" in node.image.name):
            nt.nodes.remove(node)
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = uv_map
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = normal_img; tn.interpolation = "Linear"
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.uv_map = uv_map; nm.inputs["Strength"].default_value = normal_strength
    to = nt.nodes.new("ShaderNodeTexImage"); to.image = orm_img
    sp = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(uvn.outputs["UV"], tn.inputs["Vector"]); nt.links.new(uvn.outputs["UV"], to.inputs["Vector"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    nt.links.new(to.outputs["Color"], sp.inputs[0])
    nt.links.new(sp.outputs[1], b.inputs["Roughness"]); nt.links.new(sp.outputs[2], b.inputs["Metallic"])
    nt.nodes.active = b
    return mat
