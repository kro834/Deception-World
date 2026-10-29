"""Hand-authored detail tiles in the reference's vocabulary (guardian v8).

Three tileable albedo + normal pairs, built procedurally with numpy inside Blender:
  crescent : rows of irregular, multi-scale crescent combs (pale bone crests over dark membrane)
  curl     : fractal curl chains (log-spiral strokes with smaller curls on their outer edges)
  membrane : mottled dark membrane with fine branching pale ribs and wrinkles
plus the head mask images (leaf-shaped ridges, pointed tip, dark rim, and the emissive lattice).
Tiles are applied on AuthoredUV: u runs along the organ (one tile per TILE_M metres), v mirrors
around the tube so the closed ring never shows a seam.
"""
import math
import numpy as np
import bpy

MEMB = np.array([0.012, 0.036, 0.018]); MEMB_LIT = np.array([0.034, 0.080, 0.044])
BONE = np.array([0.30, 0.38, 0.28]); BONE_EDGE = np.array([0.56, 0.68, 0.52])


def _grid(n):
    ys, xs = np.mgrid[0:n, 0:n]
    return xs / n, ys / n


def _wrap(d):
    return (d + 0.5) % 1.0 - 0.5


def _splat(h, cx, cy, sigma, amp, n):
    r = int(max(2, 3 * sigma * n))
    ix = int(round(cx * n)); iy = int(round(cy * n))
    xs = np.arange(ix - r, ix + r + 1); ys = np.arange(iy - r, iy + r + 1)
    gx = np.exp(-((xs / n - cx) ** 2) / (2 * sigma ** 2)); gy = np.exp(-((ys / n - cy) ** 2) / (2 * sigma ** 2))
    h[np.ix_(ys % n, xs % n)] += amp * gy[:, None] * gx[None, :]


def _stroke(h, pts, sigma, amp, n, taper=0.6):
    m = max(1, len(pts) - 1)
    for k, (x, y) in enumerate(pts):
        f = 1 - taper * k / m
        _splat(h, x % 1.0, y % 1.0, sigma * (0.55 + 0.45 * f), amp * f, n)


def _resample(pts, step):
    out = [pts[0]]; acc = 0.0
    for a, b in zip(pts[:-1], pts[1:]):
        d = math.hypot(b[0] - a[0], b[1] - a[1]); acc += d
        while acc >= step:
            acc -= step; t = 1 - acc / max(d, 1e-9)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def _periodic_noise(n, rng, octaves=((2, 1.0), (5, 0.55), (11, 0.3), (23, 0.15))):
    u, v = _grid(n); out = np.zeros((n, n))
    for f, a in octaves:
        for _ in range(3):
            kx = int(rng.integers(1, f + 1)); ky = int(rng.integers(0, f + 1)); ph = rng.uniform(0, 2 * np.pi, 2)
            out += a * np.sin(2 * np.pi * (kx * u + ky * v) + ph[0]) * np.cos(2 * np.pi * (ky * u - kx * v) + ph[1])
    return out / max(1e-6, np.abs(out).max())


# ---------------------------------------------------------------- the three tiles
def tile_crescent(n, rng):
    """05's whorl: rows of pointed, curved thorn-like scales lying like roof tiles, tips pointing along +u
    (toward the outer rim of the coil), pale rims, dark pits between the rows. Returns the height field,
    the pale-rim mask, the scale-body mask and the ink outline. Scales are composited one by one so that
    the scale nearer the coil's centre (smaller u) lies over its outer neighbour's base."""
    u, v = _grid(n)
    h = np.zeros((n, n)); bone = np.zeros((n, n)); scale = np.zeros((n, n)); outline = np.zeros((n, n))
    rows = 7; r0 = 0.075; per_row = int(round(1.0 / (r0 * 1.4))); step = 1.0 / per_row

    def thorn(cx, cy, r, lean, bend):
        x = _wrap(u - cx); y = _wrap(v - cy)
        cl, sl = math.cos(lean), math.sin(lean)
        xr = x * cl + y * sl; yr = -x * sl + y * cl
        t = np.clip((xr + r) / (2 * r), 0, 1)                        # 0 at the base (-u) ... 1 at the tip (+u)
        yc = yr - bend * r * t * t                                    # the thorn curves toward +v as it nears its tip
        hw = 0.55 * r * np.sin(np.pi * t ** 0.75) ** 0.8               # rounded base, pointed tip (thin thorn)
        span = (xr > -r) & (xr < r)
        inside = span & (np.abs(yc) < hw)
        edge = np.clip((hw - np.abs(yc)) / (0.22 * r), 0, 1)           # 0 at the boundary -> 1 inside (wide pale rim)
        ring = span & (np.abs(yc) >= hw) & (np.abs(yc) < hw + 0.12 * r)
        dome = (0.55 + 0.45 * np.sqrt(np.clip(1 - (yc / np.maximum(hw, 1e-6)) ** 2, 0, 1))) * (0.65 + 0.35 * t)
        return inside, edge, ring, dome
    for row in range(rows):
        cy0 = (row + 0.5) / rows
        for col in reversed(range(per_row)):                          # outer-most first, inner scales on top
            cx = (col + 0.5 * (row % 2)) * step + rng.uniform(-0.01, 0.01)
            r = r0 * rng.uniform(0.92, 1.08); cy = cy0 + rng.uniform(-0.006, 0.006)
            inside, edge, ring, dome = thorn(cx, cy, r, rng.uniform(-0.12, 0.12), rng.uniform(0.45, 0.75))
            outline[ring] = 1.0
            h[inside] = dome[inside]; scale[inside] = 1.0; outline[inside] = 0.0
            bone[inside] = (1.0 - edge)[inside]
    free = scale < 0.5
    for _ in range(50):                                               # a few tiny hooks for texture between the rows
        r = 0.017 * rng.uniform(0.6, 1.4)
        x = _wrap(u - rng.uniform(0, 1)); y = _wrap(v - rng.uniform(0, 1)); d = np.sqrt(x * x + y * y)
        ridge = np.exp(-((d - r) / (r * 0.28)) ** 2) * (x < 0) * free
        h += 0.35 * ridge; bone = np.maximum(bone, 0.5 * ridge)
    return h, np.clip(bone, 0, 1), np.clip(scale, 0, 1), np.clip(outline, 0, 1)


def _spiral(cx, cy, R, ang0, cw, turns=1.15, k=0.30, m=44):
    pts = []
    for i in range(m):
        th = i / (m - 1) * 2 * np.pi * turns; r = R * math.exp(-k * th); a = ang0 + cw * th
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def tile_curl(n, rng):
    """Continuous crosier chains along u: a ridge line with curls rising from it curl after curl,
    and smaller curls sprouting from the outer side of the big ones (two nested scales). Rows at
    y = 0.05 and 0.95 land on the ribbon edges under the mirrored v mapping; the middle row on
    the faces."""
    h = np.zeros((n, n))
    for row, cy0 in enumerate((0.05, 0.5, 0.95)):
        x = rng.uniform(-0.05, 0.02); prev = (x, cy0)
        while x < 1.05:
            R = 0.055 * rng.uniform(0.75, 1.3); cy = cy0 + rng.uniform(-0.012, 0.012)
            up = (1 if row == 0 else -1) if row != 1 else (1 if rng.random() < 0.5 else -1)
            _stroke(h, _resample([prev, (x, cy), (x + 0.25 * R, cy)], 0.004), 0.0052, 0.9, n, taper=0.0)
            pts = _resample(_spiral(x + 0.25 * R, cy + up * R, R, -up * np.pi / 2, up, turns=1.25, k=0.30, m=80), 0.0035)
            _stroke(h, pts, 0.0055, 1.0, n, taper=0.5)
            for k in (0.20, 0.46):
                i = int(k * (len(pts) - 1)); px, py = pts[i]
                ox, oy = px - (x + 0.25 * R), py - (cy + up * R); L = math.hypot(ox, oy) or 1e-6
                Rs = R * 0.33; sx, sy = px + ox / L * Rs, py + oy / L * Rs
                sp = _resample(_spiral(sx, sy, Rs, math.atan2(-oy, -ox), -up, turns=1.1, k=0.32, m=40), 0.003)
                _stroke(h, sp, 0.0034, 0.85, n, taper=0.5)
            prev = (x + 0.25 * R, cy)
            x += R * rng.uniform(1.7, 2.3)
    return h, np.clip(h / 0.8, 0, 1)


def tile_membrane(n, rng):
    h = np.zeros((n, n))

    def branch(x, y, ang, length, width, depth):
        pts = []; step = 0.012
        for _ in range(int(length / step)):
            pts.append((x, y)); ang += rng.uniform(-0.5, 0.5); x += step * math.cos(ang); y += step * math.sin(ang)
        if len(pts) > 1:
            _stroke(h, pts, width, 0.8, n, taper=0.8)
        if depth < 2 and len(pts) > 6:
            for k in range(3, len(pts) - 2, max(3, len(pts) // 3)):
                px, py = pts[k]; side = 1 if rng.random() < 0.5 else -1
                branch(px, py, ang + side * rng.uniform(0.7, 1.4), length * 0.5, width * 0.72, depth + 1)
    for row in range(4):
        y0 = (row + 0.5) / 4; ph = rng.uniform(0, 2 * np.pi)
        trunk = [(x, y0 + 0.022 * math.sin(2 * np.pi * 2 * x + ph)) for x in np.linspace(0, 1, 90)]
        _stroke(h, trunk, 0.0045, 0.9, n, taper=0.0)
        for k in range(4, 86, 9):
            px, py = trunk[k]; side = 1 if (k // 9) % 2 else -1
            branch(px, py, side * rng.uniform(0.9, 1.5), rng.uniform(0.08, 0.16), 0.0032, 0)
    return h, np.clip(h / 0.5, 0, 1)


# ---------------------------------------------------------------- composition and images
def _srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def _byte_image(name, rgb_linear, alpha=None, srgb=True, webp=False):
    n = rgb_linear.shape[0]
    im = bpy.data.images.new(name, n, n, alpha=alpha is not None, float_buffer=False)
    # the colourspace must be set BEFORE the pixels: changing it afterwards regenerates a
    # generated image blank (that is how the first v8 normals came out flat)
    if not srgb:
        im.colorspace_settings.name = "Non-Color"
    rgb = _srgb(rgb_linear) if srgb else np.clip(rgb_linear, 0, 1)
    a = np.ones((n, n, 1)) if alpha is None else alpha[..., None]
    im.pixels.foreach_set(np.concatenate([rgb, a], -1).ravel().astype(np.float32))
    if webp:
        return _as_webp(im)
    im.pack()
    return im


def _as_webp(im, quality=88):
    """Store a colour image as a lossy WebP file and reload it, so the glTF exporter (AUTO) keeps
    it as WebP while the normal maps stay lossless PNG."""
    scene = bpy.context.scene
    out = bpy.path.abspath("//") or "/tmp/"
    path = str(_WEBP_DIR / f"{im.name}.webp") if _WEBP_DIR else f"{out}{im.name}.webp"
    name = im.name
    scene.view_settings.view_transform = "Standard"; scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "WEBP"; scene.render.image_settings.quality = quality
    scene.render.image_settings.color_mode = "RGBA" if im.alpha_mode != "NONE" and im.channels == 4 else "RGB"
    im.save_render(path, scene=scene)
    bpy.data.images.remove(im)
    im = bpy.data.images.load(path); im.name = name; im.pack()
    return im


_WEBP_DIR = None


def _as_webp_lossless(im, quality=100):
    """Data image (normal map) stored as lossless WebP (Blender's encoder is lossless at 100)."""
    path = str(_WEBP_DIR / f"{im.name}.webp"); name = im.name
    im.file_format = "WEBP"; im.save(filepath=path, quality=quality)
    bpy.data.images.remove(im)
    im = bpy.data.images.load(path); im.name = name; im.colorspace_settings.name = "Non-Color"; im.pack()
    return im


def _normal_image(name, h, strength, downsample=2):
    """Normal map from a height field; the tile normals ship at half the albedo resolution so
    the three PNGs stay inside the delivery budget."""
    if downsample > 1:
        n0 = h.shape[0]; h = h.reshape(n0 // downsample, downsample, n0 // downsample, downsample).mean(axis=(1, 3))
    n = h.shape[0]
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * n * 0.5; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * n * 0.5
    nx = -gx * strength; ny = -gy * strength; nz = np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5], -1)
    return _byte_image(name, rgb, srgb=False)


def _compose(h, bone, mottle, pit_dark=0.5, bone_tone=1.0):
    hn = np.clip(h / max(1e-6, np.percentile(h, 99.5)), 0, 1)
    base = MEMB[None, None, :] * np.ones_like(mottle)[..., None]   # anime: flat, no mottle
    base = base + (MEMB_LIT - MEMB)[None, None, :] * (hn ** 1.5)[..., None] * 0.6
    pale = (BONE + (BONE_EDGE - BONE) * (hn ** 1.2)[..., None]) * bone_tone
    col = base * (1 - bone[..., None]) + pale * bone[..., None]
    return col * (1 - pit_dark + pit_dark * (0.35 + 0.65 * hn))[..., None]


def _compose_scales(h, bone, scale, outline, mottle):
    """05's whorl and flank read the other way round from the arms: rows of mint scales, each with
    an ink outline on its outer edge and a paler rim just inside it, and the near-black membrane
    only in the gaps between them (owner: pale green against near-black pits). Same height field
    as the crescent comb, so the normal map is shared."""
    hn = np.clip(h / max(1e-6, np.percentile(h, 99.5)), 0, 1)
    m01 = mottle * 0.5 + 0.5

    def smooth(x):
        x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)
    gap = MEMB[None, None, :] * (0.9 * np.ones_like(m01))[..., None]   # anime: flat pits
    body_col = np.array([0.11, 0.21, 0.12])   # 05: mid-dark green scale bodies under pale rims
    s = smooth((scale - 0.20) / 0.12)                     # scale body: the fan behind each ridge, up to the ridge
    body = (body_col + (BONE_EDGE - body_col) * (0.0 + 0.45 * hn)[..., None]) * (0.96 * np.ones_like(m01))[..., None]   # anime: flat scale bodies
    col = gap * (1 - s[..., None]) + body * s[..., None]
    b = np.clip(bone * 1.35, 0, 1) ** 0.9
    inner = smooth((scale - 0.26) / 0.08)                 # ridge split: inside half pale rim, outside half ink
    edge = BONE_EDGE[None, None, :] * inner[..., None] + (MEMB * 0.6)[None, None, :] * (1 - inner)[..., None]
    col = col * (1 - b[..., None]) + edge * b[..., None]
    o = np.clip(outline * 1.3, 0, 1)                      # the ink outline wins over any neighbour's body
    return col * (1 - o[..., None]) + (MEMB * 0.5)[None, None, :] * o[..., None]


def make_tiles(n, out_dir=None, seed=8):
    global _WEBP_DIR
    _WEBP_DIR = out_dir
    rng = np.random.default_rng(seed)
    mot = _periodic_noise(n, rng); wr = _periodic_noise(n, rng, ((17, 1.0), (37, 0.6), (71, 0.35)))
    out = {}
    h, bone, scale, outline = tile_crescent(n, rng)
    out["crescent"] = _byte_image("tile-crescent-albedo", _compose_scales(h, bone, scale, outline, mot), webp=True)
    out["crescent_n"] = _as_webp_lossless(_normal_image("tile-crescent-normal", h * 0.012, 1.0, downsample=1), quality=90)
    h, bone = tile_curl(n, rng)
    out["curl"] = _byte_image("tile-curl-albedo", _compose(h, bone, mot, 0.35), webp=True)
    out["curl_n"] = _as_webp_lossless(_normal_image("tile-curl-normal", h * 0.010, 1.0, downsample=1), quality=90)
    m2 = n // 2; mot2 = mot[::2, ::2]; wr2 = wr[::2, ::2]
    h, bone = tile_membrane(m2, rng)
    out["membrane"] = _byte_image("tile-membrane-albedo", _compose(h, bone * 0.85, mot2, 0.3, 0.85), webp=True)
    out["membrane_n"] = _as_webp_lossless(_normal_image("tile-membrane-normal", h * 0.006 + wr2 * 0.0012 + mot2 * 0.0025, 1.0, downsample=1), quality=90)
    return out


def tile_material(name, albedo, normal, strength=0.9, roughness=0.6):
    """Exportable tree: Base Color = tile albedo (AuthoredUV) x vertex colour, Normal = tile normal."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "AuthoredUV"
    ta = nt.nodes.new("ShaderNodeTexImage"); ta.image = albedo
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = normal
    vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "GuardianSurface"
    mx = nt.nodes.new("ShaderNodeMixRGB"); mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1.0
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = strength; nm.uv_map = "AuthoredUV"
    nt.links.new(uv.outputs["UV"], ta.inputs["Vector"]); nt.links.new(uv.outputs["UV"], tn.inputs["Vector"])
    nt.links.new(ta.outputs["Color"], mx.inputs[1]); nt.links.new(vc.outputs["Color"], mx.inputs[2])
    nt.links.new(mx.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = roughness; b.inputs["Metallic"].default_value = 0.0
    return m


# ---------------------------------------------------------------- head mask
def face_images(size=512):
    """Fallback textures for the lotus bud in its around-UV (u around the bud, seam at the back, front half at
    u 0.25-0.75; v from the back rim to the tip). The runtime draws the lattice procedurally from the same UV:
    two families of diagonals -> lens/diamond cells that shrink toward the tip, ~8 cells across the front and
    ~10 rows, thin bright mint lines, deep emerald cells darker at their centres, a white-green star at the tip."""
    ys, xs = np.mgrid[0:size, 0:size]; u = xs / (size - 1); t = ys / (size - 1)
    un = (u - 0.5) * 4.0; front = np.abs(un) < 1.0
    Nu, Nv = 16.0, 10.0; tt = t ** 0.9
    s1 = u * Nu + tt * Nv; s2 = -u * Nu + tt * Nv
    d1 = np.abs((s1 % 1.0) - 0.5); d2 = np.abs((s2 % 1.0) - 0.5)        # 0.5 at a cell centre, 0 on a line
    lw = 0.07
    line = np.maximum(np.exp(-(d1 / lw) ** 2), np.exp(-(d2 / lw) ** 2))
    mask = line * (0.15 + 0.85 * t ** 1.6) * front
    tip = np.exp(-(((t - 0.95) / 0.10) ** 2 + (un / 0.35) ** 2)) * front
    centre = np.exp(-(un / 0.5) ** 2) * t ** 2.2 * 0.5 * front
    mask = np.clip(np.maximum(np.maximum(mask, tip), centre), 0, 1)
    lattice = np.stack([0.30 + 0.40 * mask, 0.95 * np.ones_like(mask), 0.45 + 0.30 * mask], -1) * mask[..., None]
    cell = np.sqrt(np.clip(d1 * d2, 0, 1)) * 2.0                        # 1 at a cell centre
    rim = np.clip((np.abs(un) - 0.84) / 0.12, 0, 1)
    h = (0.6 * cell * (1 - rim) + 0.5 * rim) * front
    emerald = np.array([0.012, 0.060, 0.026]); mint = np.array([0.30, 0.56, 0.335]); dark = np.array([0.003, 0.010, 0.006])
    lift = np.clip(0.35 * t ** 2.2 + 0.25 * np.exp(-(un / 0.5) ** 2) * t, 0, 1)
    col = emerald[None, None, :] * (1.3 - 0.7 * cell)[..., None] + (mint - emerald)[None, None, :] * lift[..., None]
    col = col * (1 - rim[..., None]) + dark[None, None, :] * rim[..., None]
    col = np.where(front[..., None], col, (dark * 0.8)[None, None, :])
    mask_img = _byte_image("face-mask-albedo", col, alpha=np.ones_like(t))
    lattice_img = _byte_image("face-lattice", lattice)
    normal_img = _normal_image("face-mask-normal", h * 0.004, 1.0, downsample=1)
    return mask_img, lattice_img, normal_img


def face_material(name="Rune | v8 face mask"):
    m = bpy.data.materials.get(name)
    if m:
        return m
    mask_img, lattice_img, normal_img = face_images()
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "AuthoredUV"
    tm = nt.nodes.new("ShaderNodeTexImage"); tm.image = mask_img
    tl = nt.nodes.new("ShaderNodeTexImage"); tl.image = lattice_img
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = normal_img
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 0.9; nm.uv_map = "AuthoredUV"
    for tex in (tm, tl, tn):
        nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tm.outputs["Color"], b.inputs["Base Color"]); nt.links.new(tm.outputs["Alpha"], b.inputs["Alpha"])
    nt.links.new(tl.outputs["Color"], b.inputs["Emission Color"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Emission Strength"].default_value = 1.2; b.inputs["Roughness"].default_value = 0.55
    m.blend_method = "BLEND"; m.use_backface_culling = False
    return m
