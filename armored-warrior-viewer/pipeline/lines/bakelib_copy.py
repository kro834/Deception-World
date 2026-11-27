"""Shared helpers for the style / toonNormal bake.

All geometry work happens on numpy arrays parsed from the *decoded* glTF
(gltf-transform dequantize output in pipeline/bake/dec/{std,det}/m.gltf).
"""
import json, os
import numpy as np
import scipy.sparse as sp
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
DEC = os.path.join(HERE, '..', 'bake', 'dec')   # read-only use of the bake agent's decoded models

TEXTURED = [
    'Armored Warrior · merged PBR',
    'tripo_material_fc7ca595-e832-49b0-a494-0c4cb902f233',
    'tripo_material_8c3e6a8a-4f94-49cb-8559-448864942d9f',
    'Chest original Tripo PBR',
    'tripo_material_1b072094-c364-4f28-972a-07e61327bf9a',
]
SHORT = {
    TEXTURED[0]: 'body', TEXTURED[1]: 'buckle', TEXTURED[2]: 'clasp',
    TEXTURED[3]: 'chest', TEXTURED[4]: 'helmet',
}

_CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def load_gltf(mode):
    """Return list of primitives: dict(node, nodeName, material, pos_local, nrm, uv, idx, T(scale,trans))."""
    path = os.path.join(DEC, 'std' if mode == 'standard' else 'det', 'm.gltf')
    g = json.load(open(path))
    base = os.path.dirname(path)
    bufs = [np.fromfile(os.path.join(base, b['uri']), dtype=np.uint8) for b in g['buffers']]

    def acc(i):
        a = g['accessors'][i]
        bv = g['bufferViews'][a['bufferView']]
        dt = np.dtype(_CT[a['componentType']])
        nc = _NC[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', dt.itemsize * nc)
        raw = bufs[bv['buffer']]
        n = a['count']
        if stride == dt.itemsize * nc:
            arr = np.frombuffer(raw[off:off + n * stride].tobytes(), dtype=dt).reshape(n, nc)
        else:
            rows = np.lib.stride_tricks.as_strided(raw[off:], shape=(n, dt.itemsize * nc), strides=(stride, 1))
            arr = np.frombuffer(rows.copy().tobytes(), dtype=dt).reshape(n, nc)
        arr = arr.astype(np.float64) if dt != np.uint32 or nc != 1 else arr
        if a.get('normalized'):
            if dt == np.int8: arr = np.maximum(arr / 127.0, -1)
            elif dt == np.uint8: arr = arr / 255.0
            elif dt == np.int16: arr = np.maximum(arr / 32767.0, -1)
            elif dt == np.uint16: arr = arr / 65535.0
        return arr

    prims = []
    for ni, node in enumerate(g['nodes']):
        if 'mesh' not in node:
            continue
        assert 'rotation' not in node and 'matrix' not in node, node
        s = np.array(node.get('scale', [1, 1, 1]), float)
        assert np.allclose(s, s[0]), 'non-uniform scale'
        t = np.array(node.get('translation', [0, 0, 0]), float)
        for p in g['meshes'][node['mesh']]['primitives']:
            assert p.get('mode', 4) == 4
            at = p['attributes']
            pos = acc(at['POSITION'])
            idx = acc(p['indices']).reshape(-1, 3).astype(np.int64) if 'indices' in p else np.arange(len(pos)).reshape(-1, 3)
            d = dict(node=ni, nodeName=node.get('name'), material=g['materials'][p['material']]['name'],
                     pos_local=pos, pos=pos * s + t, scale=s[0], trans=t, idx=idx,
                     nrm=acc(at['NORMAL']) if 'NORMAL' in at else None,
                     uv=acc(at['TEXCOORD_0']) if 'TEXCOORD_0' in at else None)
            prims.append(d)
    return g, prims


def base_color_path(g, mode, material):
    m = [m for m in g['materials'] if m['name'] == material][0]
    tex = g['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]
    src = tex.get('source', tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
    return os.path.join(DEC, 'std' if mode == 'standard' else 'det', g['images'][src]['uri'])


# ---------------------------------------------------------------- welding / mesh graph

def weld(pos, tol=1e-6):
    """Weld vertices with (nearly) identical positions. Returns (welded_index_per_vertex, unique_pos)."""
    q = np.round(pos / tol).astype(np.int64)
    _, inv = np.unique(q, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    n = inv.max() + 1
    cnt = np.bincount(inv, minlength=n)
    up = np.stack([np.bincount(inv, pos[:, k], minlength=n) for k in range(3)], 1) / cnt[:, None]
    return inv, up


def face_normals(P, F):
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    fn = np.cross(b - a, c - a)  # length = 2*area
    return fn


def vertex_normals(P, F, fn=None):
    if fn is None:
        fn = face_normals(P, F)
    n = np.zeros_like(P)
    for k in range(3):
        np.add.at(n, F[:, k], fn)
    return normalize(n)


def normalize(v, eps=1e-20):
    l = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(l, eps)


def edges(F):
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    e = np.sort(e, 1)
    e = e[e[:, 0] != e[:, 1]]
    return np.unique(e, axis=0)


def laplacian(P, F, min_len_frac=0.25):
    """Graph Laplacian L = D - W with w_ij = 1/l_ij^2 (approximates -Laplace-Beltrami up to ~1.5x)."""
    E = edges(F)
    l = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1)
    med = np.median(l)
    l = np.maximum(l, med * min_len_frac)
    w = 1.0 / l ** 2
    n = len(P)
    W = sp.coo_matrix((np.r_[w, w], (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(n, n)).tocsr()
    D = sp.diags(np.asarray(W.sum(1)).ravel())
    return (D - W).tocsr(), med


def diffuse(L, X, t, tol=1e-6, maxiter=400):
    """Implicit smoothing: solve (I + t L) Y = X, column by column with Jacobi-preconditioned CG.
    t has units of length^2; the effective smoothing radius is ~sqrt(t)."""
    from scipy.sparse.linalg import cg, LinearOperator
    n = L.shape[0]
    A = (sp.identity(n, format='csr') + t * L).tocsr()
    dinv = 1.0 / A.diagonal()
    M = LinearOperator((n, n), matvec=lambda x: dinv * x)
    X = np.atleast_2d(X.T).T
    Y = np.empty_like(X)
    for k in range(X.shape[1]):
        y, info = cg(A, X[:, k], x0=X[:, k], rtol=tol, maxiter=maxiter, M=M)
        Y[:, k] = y
    return Y


# ---------------------------------------------------------------- UV rasteriser

def raster(uv, F, attr, size, chunk_pts=6_000_000):
    """Rasterise per-vertex attributes (N,C) over triangles F in glTF UV space (origin top-left,
    row = v*size). Pixel centres are sampled; returns (img[size,size,C] float32, mask bool, triId int32)."""
    attr = np.asarray(attr, np.float64)
    if attr.ndim == 1:
        attr = attr[:, None]
    C = attr.shape[1]
    img = np.zeros((size, size, C), np.float32)
    tri = np.full((size, size), -1, np.int32)
    x = uv[:, 0] * size - 0.5
    y = uv[:, 1] * size - 0.5
    X = x[F]; Y = y[F]
    x0 = np.ceil(X.min(1)).astype(np.int64); x1 = np.floor(X.max(1)).astype(np.int64)
    y0 = np.ceil(Y.min(1)).astype(np.int64); y1 = np.floor(Y.max(1)).astype(np.int64)
    x0 = np.clip(x0, 0, size - 1); y0 = np.clip(y0, 0, size - 1)
    x1 = np.clip(x1, -1, size - 1); y1 = np.clip(y1, -1, size - 1)
    w = x1 - x0 + 1; h = y1 - y0 + 1
    area = (X[:, 1] - X[:, 0]) * (Y[:, 2] - Y[:, 0]) - (X[:, 2] - X[:, 0]) * (Y[:, 1] - Y[:, 0])
    ok = (w > 0) & (h > 0) & (np.abs(area) > 1e-12)
    dim = np.maximum(w, h)
    s = 1
    while True:
        sel = np.nonzero(ok & (dim <= s) & (dim > s // 2 if s > 1 else True))[0]
        if len(sel):
            oy, ox = np.mgrid[0:s, 0:s]
            ox = ox.ravel(); oy = oy.ravel()
            per = max(1, chunk_pts // (s * s))
            for c0 in range(0, len(sel), per):
                ti = sel[c0:c0 + per]
                px = x0[ti, None] + ox[None]
                py = y0[ti, None] + oy[None]
                inb = (px <= x1[ti, None]) & (py <= y1[ti, None])
                Xa, Ya = X[ti], Y[ti]
                ar = area[ti][:, None]
                l0 = ((Xa[:, 1, None] - px) * (Ya[:, 2, None] - py) - (Xa[:, 2, None] - px) * (Ya[:, 1, None] - py)) / ar
                l1 = ((Xa[:, 2, None] - px) * (Ya[:, 0, None] - py) - (Xa[:, 0, None] - px) * (Ya[:, 2, None] - py)) / ar
                l2 = 1 - l0 - l1
                eps = -1e-7
                inside = inb & (l0 >= eps) & (l1 >= eps) & (l2 >= eps)
                r, cidx = np.nonzero(inside)
                if not len(r):
                    continue
                tt = ti[r]
                b = np.stack([l0[r, cidx], l1[r, cidx], l2[r, cidx]], 1)
                vals = np.einsum('nk,nkc->nc', b, attr[F[tt]])
                img[py[r, cidx], px[r, cidx]] = vals
                tri[py[r, cidx], px[r, cidx]] = tt
        if s >= dim[ok].max(initial=1):
            break
        s *= 2
    return img, tri >= 0, tri


def fill_nearest(img, mask):
    """Fill every uncovered texel with the value of the nearest covered texel (full dilation, so no
    background colour can bleed in at any mip level)."""
    if mask.all():
        return img
    _, (iy, ix) = ndimage.distance_transform_edt(~mask, return_indices=True)
    return img[iy, ix]


def masked_blur(img, mask, sigma):
    """Gaussian blur restricted to covered texels (normalised convolution)."""
    m = mask.astype(np.float32)
    out = np.empty_like(img)
    den = ndimage.gaussian_filter(m, sigma)
    for c in range(img.shape[2]):
        out[..., c] = ndimage.gaussian_filter(img[..., c] * m, sigma) / np.maximum(den, 1e-6)
    return np.where(mask[..., None], out, img)


# ---------------------------------------------------------------- proof renderer (orthographic z-buffer)

def view_basis(azimuth_deg, polar_deg=90.0):
    """Camera on +Z for azimuth 0 (front), turning about +Y towards +X. Returns (right, up, fwd_to_viewer)."""
    a = np.radians(azimuth_deg); p = np.radians(polar_deg)
    z = np.array([np.sin(p) * np.sin(a), np.cos(p), np.sin(p) * np.cos(a)])  # towards viewer
    up0 = np.array([0, 1.0, 0])
    x = np.cross(up0, z); x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return x, y, z


def render_ortho(meshes, azimuth, polar=90.0, res=900, center=None, half=None, chunk_pts=6_000_000):
    """meshes: list of (P world (N,3), F (T,3)). Returns (meshIdx, triIdx, bary(…,3), depth) per pixel
    (meshIdx=-1 for background). Image row 0 = top."""
    x, y, z = view_basis(azimuth, polar)
    allP = np.concatenate([m[0] for m in meshes])
    if center is None:
        center = (allP.min(0) + allP.max(0)) / 2
    if half is None:
        sx = allP @ x; sy = allP @ y
        half = max(sx.max() - sx.min(), sy.max() - sy.min()) / 2 * 1.04
    H = W = res
    best = np.full(H * W, np.inf); bm = np.full(H * W, -1, np.int32); bt = np.full(H * W, -1, np.int64)
    bb = np.zeros((H * W, 3), np.float32)
    for mi, (P, F) in enumerate(meshes):
        q = P - center
        sxp = (q @ x / half * 0.5 + 0.5) * W - 0.5
        syp = (0.5 - q @ y / half * 0.5) * H - 0.5
        dep = -(q @ z)
        X = sxp[F]; Y = syp[F]; Z = dep[F]
        x0 = np.clip(np.ceil(X.min(1)), 0, W - 1).astype(np.int64); x1 = np.clip(np.floor(X.max(1)), -1, W - 1).astype(np.int64)
        y0 = np.clip(np.ceil(Y.min(1)), 0, H - 1).astype(np.int64); y1 = np.clip(np.floor(Y.max(1)), -1, H - 1).astype(np.int64)
        w = x1 - x0 + 1; h = y1 - y0 + 1
        area = (X[:, 1] - X[:, 0]) * (Y[:, 2] - Y[:, 0]) - (X[:, 2] - X[:, 0]) * (Y[:, 1] - Y[:, 0])
        ok = (w > 0) & (h > 0) & (np.abs(area) > 1e-12)
        dim = np.maximum(w, h)
        s = 1
        while ok.any():
            sel = np.nonzero(ok & (dim <= s) & ((dim > s // 2) if s > 1 else True))[0]
            if len(sel):
                oy, ox = np.mgrid[0:s, 0:s]; ox = ox.ravel(); oy = oy.ravel()
                per = max(1, chunk_pts // (s * s))
                for c0 in range(0, len(sel), per):
                    ti = sel[c0:c0 + per]
                    px = x0[ti, None] + ox[None]; py = y0[ti, None] + oy[None]
                    inb = (px <= x1[ti, None]) & (py <= y1[ti, None])
                    Xa, Ya = X[ti], Y[ti]; ar = area[ti][:, None]
                    l0 = ((Xa[:, 1, None] - px) * (Ya[:, 2, None] - py) - (Xa[:, 2, None] - px) * (Ya[:, 1, None] - py)) / ar
                    l1 = ((Xa[:, 2, None] - px) * (Ya[:, 0, None] - py) - (Xa[:, 0, None] - px) * (Ya[:, 2, None] - py)) / ar
                    l2 = 1 - l0 - l1
                    inside = inb & (l0 >= -1e-7) & (l1 >= -1e-7) & (l2 >= -1e-7)
                    r, c = np.nonzero(inside)
                    if not len(r):
                        continue
                    tt = ti[r]
                    b = np.stack([l0[r, c], l1[r, c], l2[r, c]], 1)
                    d = np.einsum('nk,nk->n', b, Z[tt])
                    pix = py[r, c] * W + px[r, c]
                    # keep nearest per pixel within this batch, then merge
                    o = np.lexsort((d, pix))
                    pix, d, tt, b = pix[o], d[o], tt[o], b[o]
                    first = np.r_[True, pix[1:] != pix[:-1]]
                    pix, d, tt, b = pix[first], d[first], tt[first], b[first]
                    better = d < best[pix]
                    pix, d, tt, b = pix[better], d[better], tt[better], b[better]
                    best[pix] = d; bm[pix] = mi; bt[pix] = tt; bb[pix] = b
            if s >= dim[ok].max():
                break
            s *= 2
    return bm.reshape(H, W), bt.reshape(H, W), bb.reshape(H, W, 3), (center, half)


def sample_bilinear(tex, uv):
    """tex (H,W,C) float; uv (n,2) glTF convention (row = v*H, flipY=false). Repeat wrap."""
    H, W = tex.shape[:2]
    x = uv[:, 0] * W - 0.5; y = uv[:, 1] * H - 0.5
    x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64)
    fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    def g(yy, xx):
        return tex[yy % H, xx % W]
    return (g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy) +
            g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy)


def tex_path(g, mode, material, slot):
    """slot: 'base' | 'emissive' | 'mr' | 'normal'"""
    m = [m for m in g['materials'] if m['name'] == material][0]
    ref = {'base': m['pbrMetallicRoughness'].get('baseColorTexture'),
           'mr': m['pbrMetallicRoughness'].get('metallicRoughnessTexture'),
           'emissive': m.get('emissiveTexture'), 'normal': m.get('normalTexture')}[slot]
    if ref is None:
        return None
    tex = g['textures'][ref['index']]
    src = tex.get('source', tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
    return os.path.join(DEC, 'std' if mode == 'standard' else 'det', g['images'][src]['uri'])


def load_rgb(path, size=None):
    from PIL import Image
    im = Image.open(path).convert('RGB')
    if size and im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255
