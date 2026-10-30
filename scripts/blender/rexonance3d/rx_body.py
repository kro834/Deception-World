"""The black scaled undersuit: one watertight muscular body.

The body is a signed distance field built from round cones (limb cores) and
ellipsoids (muscle masses) joined with polynomial smooth-min, sampled on a
4 mm grid and polygonised with marching cubes. Every primitive is placed from
the landmarks in rx_ref.LM, so the silhouette follows front-10 and right-07.

Armour modules never edit this file: they read the finished body through
rx_lib.Body (ray casts, closest point, normals) and sit their plates on it.
"""

import math
import numpy as np

from rx_ref import LM

VOXEL = 0.004
BOUNDS = ((-0.48, 0.48), (-0.27, 0.23), (-0.01, 1.92))


def _v(*a):
    return np.array(a, dtype=np.float64)


def _lerp(a, b, t):
    return a + (b - a) * t


def _frame(axis, side_hint=(1.0, 0.0, 0.0)):
    """Columns: local x, y, z with z along axis (unit)."""
    z = axis / np.linalg.norm(axis)
    hint = np.array(side_hint, dtype=np.float64)
    if abs(np.dot(hint, z)) > 0.95:
        hint = np.array([0.0, 1.0, 0.0])
    x = hint - z * np.dot(hint, z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return np.stack([x, y, z], axis=1)


def _rot(rx=0.0, ry=0.0, rz=0.0):
    """Rotation matrix (columns = local axes) from XYZ Euler degrees."""
    a, b, c = (math.radians(v) for v in (rx, ry, rz))
    Rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    Ry = np.array([[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]])
    Rz = np.array([[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


# ---------------------------------------------------------------- primitives
class Ellipsoid:
    def __init__(self, c, r, R=None, k=0.03, op="union"):
        self.c = np.asarray(c, dtype=np.float64)
        self.r = np.asarray(r, dtype=np.float64)
        self.R = np.eye(3) if R is None else np.asarray(R, dtype=np.float64)
        self.k = k
        self.op = op

    def aabb(self):
        ext = np.abs(self.R) @ self.r
        m = self.k + 0.01
        return self.c - ext - m, self.c + ext + m

    def sdf(self, P):
        q = (P - self.c) @ self.R
        k0 = np.linalg.norm(q / self.r, axis=1)
        k1 = np.linalg.norm(q / (self.r * self.r), axis=1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

    def mirrored(self):
        M = np.diag([-1.0, 1.0, 1.0])
        return Ellipsoid(self.c * [-1, 1, 1], self.r, M @ self.R @ M, self.k, self.op)


class RoundCone:
    def __init__(self, a, b, r1, r2, k=0.03, op="union"):
        self.a = np.asarray(a, dtype=np.float64)
        self.b = np.asarray(b, dtype=np.float64)
        self.r1, self.r2 = float(r1), float(r2)
        self.k = k
        self.op = op

    def aabb(self):
        r = max(self.r1, self.r2) + self.k + 0.01
        return np.minimum(self.a, self.b) - r, np.maximum(self.a, self.b) + r

    def sdf(self, P):
        a, b, r1, r2 = self.a, self.b, self.r1, self.r2
        ba = b - a
        l2 = float(ba @ ba)
        rr = r1 - r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        pa = P - a
        y = pa @ ba
        z = y - l2
        xv = pa * l2 - np.outer(y, ba)
        x2 = np.einsum("ij,ij->i", xv, xv)
        y2 = y * y * l2
        z2 = z * z * l2
        k = math.copysign(1.0, rr) * rr * rr * x2
        d = (np.sqrt(np.maximum(x2 * a2 * il2, 0.0)) + y * rr) * il2 - r1
        c1 = np.sign(z) * a2 * z2 > k
        c2 = np.sign(y) * a2 * y2 < k
        d = np.where(c2, np.sqrt(x2 + y2) * il2 - r1, d)
        d = np.where(c1, np.sqrt(x2 + z2) * il2 - r2, d)
        return d

    def mirrored(self):
        return RoundCone(self.a * [-1, 1, 1], self.b * [-1, 1, 1], self.r1, self.r2, self.k, self.op)


def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


# ---------------------------------------------------------------- the body
def body_primitives():
    """Ordered primitive list. Symmetric pieces are authored on +X and mirrored."""
    S = _v(*LM["shoulder"]) + _v(-0.010, 0.005, -0.008)
    E = _v(*LM["elbow"])
    W = _v(*LM["wrist"])
    H = _v(*LM["hip"])
    K = _v(*LM["knee"])
    A = _v(*LM["ankle"])
    F = _v(*LM["fist"])
    toe = _v(*LM["toe"]) + _v(0.0, 0.035, 0.005)
    heel = _v(*LM["heel"]) + _v(0.0, -0.035, 0.010)

    center = [
        # torso masses
        Ellipsoid((0, 0.000, 1.430), (0.150, 0.112, 0.168), k=0.05),  # rib cage
        Ellipsoid((0, 0.022, 1.515), (0.180, 0.095, 0.072), k=0.05),  # shoulder girdle
        Ellipsoid((0, -0.004, 1.275), (0.118, 0.092, 0.135), k=0.06),  # abdomen
        Ellipsoid((0, 0.010, 1.105), (0.148, 0.104, 0.112), k=0.06),  # pelvis
        Ellipsoid((0, 0.045, 1.330), (0.105, 0.060, 0.150), k=0.05),  # spinal erectors
        # neck and head (the helmet module covers the head)
        RoundCone((0, 0.012, 1.530), (0, -0.002, 1.700), 0.068, 0.056, k=0.050),
        Ellipsoid((0, -0.006, 1.768), (0.080, 0.098, 0.112), k=0.025),
    ]
    # Rectus abdominis: three rows of low paired pads.
    for z in (1.392, 1.330, 1.268):
        for x in (0.033, -0.033):
            center.append(Ellipsoid((x, -0.082, z), (0.030, 0.017, 0.025), k=0.022))

    upper_arm = E - S
    fore_arm = W - E
    thigh = K - H
    shin = A - K
    side = [
        # chest and back
        Ellipsoid((0.072, -0.078, 1.462), (0.090, 0.033, 0.062), _rot(0, -12, -6), k=0.045),  # pec
        Ellipsoid((0.118, 0.040, 1.405), (0.050, 0.072, 0.135), _rot(0, 10, 0), k=0.045),  # lat
        Ellipsoid((0.068, 0.045, 1.578), (0.085, 0.048, 0.046), _rot(0, 22, 0), k=0.040),  # trapezius
        Ellipsoid((0.102, -0.022, 1.235), (0.044, 0.068, 0.100), _rot(0, 8, 0), k=0.045),  # oblique
        Ellipsoid((0.072, 0.066, 1.045), (0.080, 0.056, 0.088), k=0.045),  # glute
        # shoulder and arm
        Ellipsoid(S + _v(0.008, 0.000, -0.012), (0.072, 0.078, 0.090), _frame(upper_arm), k=0.055),  # deltoid
        RoundCone(S + _v(0.0, 0.0, -0.01), E, 0.056, 0.044, k=0.040),
        Ellipsoid(_lerp(S, E, 0.48) + _v(0.004, -0.024, 0), (0.046, 0.044, 0.092), _frame(upper_arm), k=0.035),  # biceps
        Ellipsoid(_lerp(S, E, 0.42) + _v(0.004, 0.028, 0), (0.048, 0.048, 0.102), _frame(upper_arm), k=0.035),  # triceps
        Ellipsoid(E, (0.040, 0.042, 0.042), k=0.025),
        RoundCone(E, W, 0.047, 0.034, k=0.035),
        Ellipsoid(_lerp(E, W, 0.27) + _v(0.010, -0.010, 0), (0.053, 0.049, 0.088), _frame(fore_arm), k=0.035),
        Ellipsoid(F, (0.040, 0.050, 0.060), k=0.020),  # fist core (gauntlet covers it)
        # leg
        RoundCone(H, K, 0.096, 0.061, k=0.050),
        Ellipsoid(_lerp(H, K, 0.45) + _v(0.000, -0.034, 0), (0.082, 0.066, 0.178), _frame(thigh), k=0.045),  # rectus femoris
        Ellipsoid(_lerp(H, K, 0.52) + _v(0.036, -0.004, 0), (0.058, 0.060, 0.158), _frame(thigh), k=0.045),  # vastus lateralis
        Ellipsoid(_lerp(H, K, 0.80) + _v(-0.030, -0.028, 0), (0.048, 0.044, 0.075), _frame(thigh), k=0.040),  # vastus medialis
        Ellipsoid(_lerp(H, K, 0.45) + _v(0.000, 0.044, 0), (0.072, 0.058, 0.172), _frame(thigh), k=0.045),  # hamstring
        Ellipsoid(K + _v(0.0, -0.010, 0.0), (0.054, 0.054, 0.060), k=0.030),  # knee
        RoundCone(K, A, 0.058, 0.041, k=0.040),
        Ellipsoid(_lerp(K, A, 0.28) + _v(0.004, 0.044, 0), (0.063, 0.060, 0.128), _frame(shin), k=0.040),  # calf
        Ellipsoid(A, (0.042, 0.046, 0.044), k=0.025),
        RoundCone(heel, toe, 0.044, 0.034, k=0.030),  # foot core (boot covers it)
    ]
    prims = list(center)
    for p in side:
        prims.append(p)
        prims.append(p.mirrored())
    return prims


def sample_sdf(prims, voxel=VOXEL, bounds=BOUNDS):
    (x0, x1), (y0, y1), (z0, z1) = bounds
    xs = np.arange(x0, x1 + 1e-9, voxel)
    ys = np.arange(y0, y1 + 1e-9, voxel)
    zs = np.arange(z0, z1 + 1e-9, voxel)
    D = np.full((len(xs), len(ys), len(zs)), 1.0, dtype=np.float32)
    for p in prims:
        lo, hi = p.aabb()
        if p.op == "sub":
            lo, hi = lo - 0.01, hi + 0.01
        i0 = max(int(np.floor((lo[0] - x0) / voxel)), 0)
        i1 = min(int(np.ceil((hi[0] - x0) / voxel)) + 1, len(xs))
        j0 = max(int(np.floor((lo[1] - y0) / voxel)), 0)
        j1 = min(int(np.ceil((hi[1] - y0) / voxel)) + 1, len(ys))
        k0 = max(int(np.floor((lo[2] - z0) / voxel)), 0)
        k1 = min(int(np.ceil((hi[2] - z0) / voxel)) + 1, len(zs))
        if i0 >= i1 or j0 >= j1 or k0 >= k1:
            continue
        gx, gy, gz = np.meshgrid(xs[i0:i1], ys[j0:j1], zs[k0:k1], indexing="ij")
        P = np.stack([gx.ravel(), gy.ravel(), gz.ravel()], axis=1)
        d = p.sdf(P).reshape(gx.shape).astype(np.float32)
        sub = D[i0:i1, j0:j1, k0:k1]
        if p.op == "sub":
            D[i0:i1, j0:j1, k0:k1] = smax(sub, -d, p.k)
        else:
            D[i0:i1, j0:j1, k0:k1] = smin(sub, d, p.k)
    return D, (xs[0], ys[0], zs[0])


def body_mesh_arrays(voxel=VOXEL):
    """(verts Nx3 float, faces Mx3 int) of the undersuit surface in world metres."""
    from skimage import measure

    D, origin = sample_sdf(body_primitives(), voxel)
    verts, faces, _n, _v = measure.marching_cubes(D, level=0.0, spacing=(voxel, voxel, voxel))
    verts = verts + np.asarray(origin)
    # Orient faces outward: a closed surface wound outward has positive volume.
    tri = verts[faces]
    volume = np.einsum("ij,ij->i", tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6.0
    if volume < 0:
        faces = faces[:, ::-1]
    return verts, faces
