"""Guardian (シエル) v3 rebuild: the reference's own vocabulary, organ by organ.

Keeps the validated rig of the v2 browser blend (GuardianV_Root/BodyPivot/HeadPivot/
JawPivot/MouthSocket/MouthAim/TentaclePivot_xx/NeckRig + skinned Head) and replaces
the organ meshes:
  fronds : flat ink ribbons with spiral tips and a crosier chain on the inner edge
  whorls : fern-fiddlehead spirals (arm + face ribs + rim crosiers + glowing core)
  shell  : S-shaped rib cage (rib rings + struts + recessed membrane cells with
           real openings + dorsal crosier crest) and the spined tail
  face   : glowing lattice leaf fused to the head surface (skinned like the head)

Usage:
  Blender --background --python dogs_guardian_v3.py -- --source browser.blend --out DIR
      [--organs fronds,whorls,shell,face] [--export 1] [--decimate 1]
"""
import sys, math, json, time, hashlib, struct, os
from pathlib import Path
import bpy, bmesh
import numpy as np
from mathutils import Vector, Quaternion, Matrix

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from guardian_v3_lib import (P, V, unit, lerp, smooth, catmull, resample, rmf_frames, log_spiral,
                             crosier_path, noise1, INK, MEMBRANE, MEMBRANE_LIT, BONE, BONE_EDGE,
                             BONE_ROOT, GLOW, mix, MeshBuilder, clean, mesh_audit, material_from,
                             set_principled, write_micro_uv)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opts = {"source": "", "out": "", "organs": "fronds,whorls,shell,face", "export": "0", "decimate": "1",
        "stamp": "v3"}
for i in range(0, len(argv), 2):
    opts[argv[i].lstrip("-")] = argv[i + 1]
OUT = Path(opts["out"]); OUT.mkdir(parents=True, exist_ok=True)
ORGANS = set(opts["organs"].split(","))
START = time.time()

bpy.ops.wm.open_mainfile(filepath=opts["source"])
root = bpy.data.objects["GuardianV_Root"]; body = bpy.data.objects["BodyPivot"]
head = bpy.data.objects["HeadPivot"]; jaw = bpy.data.objects["JawPivot"]; rig = bpy.data.objects["NeckRig"]
pivots = sorted([o for o in root.children_recursive if o.name.startswith("TentaclePivot_")], key=lambda o: o.name)


def Pinv(b):
    """Blender -> glTF."""
    return (b.x, b.z, -b.y)


def remove(prefixes):
    for ob in list(bpy.data.objects):
        if ob.type == "MESH" and any(ob.name.startswith(p) for p in prefixes):
            me = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if me.users == 0:
                bpy.data.meshes.remove(me)


# ---------------------------------------------------------------- materials
BONE_MAT = bpy.data.materials.get("Bone | v3 lattice") or material_from("Bone | v2 clay", "Bone | v3 lattice")
INK_MAT = bpy.data.materials.get("Skin | v3 ink") or material_from("Skin | v2 clay", "Skin | v3 ink")
set_principled(INK_MAT, Roughness=0.58)
set_principled(BONE_MAT, Roughness=0.66)


def glow_material(name, color, strength):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "GuardianSurface"
    nt.links.new(ca.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Emission Color"].default_value = (*color, 1)
    b.inputs["Emission Strength"].default_value = strength
    b.inputs["Roughness"].default_value = 0.5
    return m


CORE_MAT = glow_material("Rune | v3 whorl core", (0.30, 0.95, 0.42), 0.7)

# ============================================================== fronds (11 tentacles)
# control polylines (glTF x right, y up, z front), curl length, curl turns, curl side (+1/-1), widths
FRONDS = [
    ([(-.42, 1.73, -.35), (-1.18, 2.02, -.57), (-1.60, 2.75, -.77), (-1.76, 3.22, -.82)], .95, 1.05, +1, (.26, .32, .08)),
    ([(-.23, 1.94, -.30), (-.57, 2.49, -.13), (-.84, 3.14, .12), (-1.00, 3.44, .22)], .85, 1.05, +1, (.25, .30, .08)),
    ([(-.03, 2.02, -.28), (.03, 2.65, -.39), (-.16, 3.30, -.43), (-.36, 3.56, -.36)], .80, 1.0, +1, (.23, .28, .07)),
    ([(-.61, 1.42, -.13), (-1.27, 1.63, -.09), (-1.79, 2.19, -.04), (-2.04, 2.54, .01)], .90, 1.05, +1, (.25, .30, .08)),
    ([(.03, 1.98, -.30), (.32, 2.46, -.49), (.28, 3.00, -.59), (.40, 3.30, -.52)], .72, 1.0, -1, (.20, .24, .06)),
    ([(-.56, 1.07, .24), (-1.31, .69, .43), (-1.88, -.03, .72), (-1.86, -.78, .95), (-1.50, -1.26, 1.12)], 1.35, 1.1, +1, (.44, .52, .11)),
    ([(.76, 1.63, -.38), (1.62, 1.24, -.74), (1.99, .49, -.70), (1.84, -.23, -.38), (1.38, -.60, .08)], 1.25, 1.1, +1, (.42, .50, .11)),
    ([(-1.41, -1.22, .40), (-1.27, -1.66, .43), (-.95, -1.90, .40)], .62, 1.05, +1, (.22, .25, .06)),
    ([(1.48, -.42, .30), (1.54, -.90, .39), (1.26, -1.22, .47)], .60, 1.05, +1, (.23, .26, .06)),
    ([(1.28, -1.04, .40), (1.57, -1.43, .43), (1.40, -1.78, .48)], .55, 1.0, +1, (.20, .23, .06)),
    ([(-1.54, -1.18, .32), (-1.92, -1.44, .29), (-2.00, -1.84, .37)], .55, 1.0, +1, (.21, .24, .06)),
]


def plane_normal(points):
    pts = np.asarray(points, float)
    c = pts.mean(axis=0)
    u, s, vt = np.linalg.svd(pts - c)
    n = vt[-1]
    if n[2] < 0:
        n = -n
    return unit(n)


def build_frond(idx, controls, curl_len, curl_turns, side, widths):
    pivot = pivots[idx]
    anchor = V(controls[0])
    nrm = plane_normal(controls)
    base = catmull(controls, 20)
    base = resample(base, spacing=0.02)
    # spiral tip continuing the last tangent, curling toward `side` within the frond plane
    tang = unit(base[-1] - base[-3])
    lateral = unit(np.cross(nrm, tang)) * side
    curl = crosier_path(base[-1], tang, lateral, curl_len, turns=curl_turns, straight=0.12, bend_power=1.55)
    path = np.concatenate([base[:-1], curl], axis=0)
    path = resample(path, spacing=0.018)
    n = len(path)
    arc_total = 0.0
    arc = np.linspace(0, 1, n)
    base_len = sum(np.linalg.norm(np.diff(base, axis=0), axis=1))
    total_len = base_len + curl_len
    s_base_end = base_len / total_len
    w0, w1, w2 = widths
    ws = np.array([
        (w0 + (w1 - w0) * math.sin(math.pi * min(1, t / s_base_end * 0.9)) ** 0.8) if t < s_base_end
        else lerp(w1 * 0.75, w2, ((t - s_base_end) / (1 - s_base_end)) ** 0.8)
        for t in arc])
    ws *= 1 + 0.06 * np.array([noise1(t * 9, idx) for t in arc])
    ts = ws * 0.22 + 0.010
    mb = MeshBuilder("Frond_%02d | ink ribbon with crosier edge" % idx, pivot, [INK_MAT, BONE_MAT])
    local = path - anchor

    def rib_color(i, t, j, a):
        # ink body; the convex outer face carries a faint grey-green sheen, the edges stay black
        face = max(0.0, math.sin(a))
        sheen = mix(INK, (0.030, 0.062, 0.040), face ** 1.5 * (0.5 + 0.5 * (1 - t)))
        return sheen

    frames, start = mb.ribbon(local, ws, ts, sides=14, color_fn=rib_color, hint=nrm, bulge=1.35, mat=0)
    T, N, B = frames
    # crosier chain along the inner (curl) edge: outward in-plane, curling toward the tip
    sgn = -side if np.dot(B[0], lateral) > 0 else side
    s_acc = 0.0; last = -1.0
    for i in range(4, n - 2):
        s_acc += np.linalg.norm(local[i] - local[i - 1])
        w = ws[i]
        spacing = max(0.045, 0.60 * w)
        if s_acc - last < spacing:
            continue
        last = s_acc
        edge_dir = B[i] * (np.sign(np.dot(B[i], lateral)) if abs(np.dot(B[i], lateral)) > 1e-6 else 1.0)
        edge_dir = unit(edge_dir)
        basep = local[i] + edge_dir * (w * 0.44)
        t = i / (n - 1)
        length = (0.56 * w + 0.03) * (1 + 0.18 * noise1(i * 0.7, idx))
        radius = 0.11 * w + 0.006
        mb.crosier(basep, edge_dir, T[i], length, radius, turns=1.0, straight=0.12, sides=7,
                   color_root=BONE_ROOT, color_tip=BONE_EDGE, hint=nrm, mat=1, bend_power=1.5)
    ob = mb.finish(micro_uv_scale=2.4)
    clean(ob)
    return ob


# ============================================================== whorls (coiled segmented tubes)
WHORLS = [
    # name, centre, R, turns, yaw(deg), start angle(deg), ring spacing (a*r+b), tube radius factor
    ("Whorl_main | coiled segmented spiral", (.94, 2.62, -.52), 1.13, 2.6, 32, 206, (.080, .020), .225, 96),
    ("Whorl_mid | coiled segmented spiral", (-.43, 1.53, .40), .53, 2.3, 10, 250, (.085, .017), .23, 68),
    ("Whorl_small | coiled segmented spiral", (-.60, .68, .61), .36, 2.0, -6, 225, (.082, .014), .235, 60),
]
K_SPIRAL = 0.095  # gap between turns = 0.45 r; a tube of radius 0.225 r fills it (turns touch)


def build_whorl(name, center, R, turns, yaw_deg, start_deg, spacing_ab, tube_k, bar_ext=96):
    yaw = math.radians(yaw_deg)
    e3 = unit(V((math.sin(yaw), 0, math.cos(yaw))))   # face normal (front)
    e1 = unit(V((math.cos(yaw), 0, -math.sin(yaw))))  # right, in plane
    e2 = V((0, 1, 0))
    C = V(center)
    n_pts = int(300 * turns)
    sp = log_spiral(C, e1, e2, R, K_SPIRAL, turns, n_pts, start_angle=math.radians(start_deg), direction=-1)
    fr = np.linspace(0, 1, n_pts)
    rad = R * np.exp(-K_SPIRAL * fr * math.tau * turns)
    gap = 1 - math.exp(-math.tau * K_SPIRAL)
    radial = (sp - C) - e3 * ((sp - C) @ e3)[:, None]
    rhat = radial / np.linalg.norm(radial, axis=1)[:, None]
    centre_line = C + rhat * (rad * (1 + (1 - gap)) / 2)[:, None]
    arm_r = tube_k * rad * (1 + 0.04 * np.array([noise1(f * 23, 7) for f in fr])) + 0.012
    mb = MeshBuilder(name, body, [BONE_MAT, CORE_MAT, INK_MAT])
    core_from = 0.72
    T, N, B = rmf_frames(centre_line, hint=e3)

    def glow_at(t):
        return smooth((t - core_from) / (1 - core_from)) if t > core_from else 0.0

    def arm_color(i, t, j, a):
        g = glow_at(t)
        base = mix(MEMBRANE, MEMBRANE_LIT, 0.25 + 0.75 * g)
        return mix(base, GLOW, g * 0.5)

    # the arm: a dark membrane tube that fills the gap between turns
    sides = 18
    start = len(mb.v)
    for i in range(n_pts):
        for j in range(sides):
            a = j * math.tau / sides
            p = centre_line[i] + B[i] * (math.cos(a) * arm_r[i]) + N[i] * (math.sin(a) * arm_r[i] * 0.92)
            mb.add_vertex(p, arm_color(i, fr[i], j, a), (fr[i], j / sides))
    for i in range(n_pts - 1):
        for j in range(sides):
            a = start + i * sides + j; b = start + i * sides + (j + 1) % sides
            mb.add_face((a, a + sides, b + sides, b), 1 if fr[i] > core_from else 2)
    mb.add_face(tuple(start + j for j in range(sides)), 2)
    mb.add_face(tuple(start + (n_pts - 1) * sides + j for j in reversed(range(sides))), 1)
    # glowing core filling the eye of the coil
    eye = C + e3 * 0.0
    core_r = rad[-1] * 0.40 + 0.010
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=9, radius=core_r)
    sv = len(mb.v)
    for v in bm.verts:
        q = eye + e1 * v.co.x + e2 * v.co.y + e3 * (v.co.z * 0.75)
        mb.add_vertex(q, mix(GLOW, (1.0, 1.0, 0.95), 0.35))
    for f in bm.faces:
        mb.add_face(tuple(sv + v.index for v in f.verts), 1)
    bm.free()
    # ring segments around the arm (pale bone, wide along the flow, low in height) + rim crosiers
    s_acc = 0.0; last = -1.0; count = 0
    for i in range(2, n_pts - 2):
        s_acc += np.linalg.norm(centre_line[i] - centre_line[i - 1])
        spacing = (spacing_ab[0] * rad[i] + spacing_ab[1]) * (1 + 0.22 * noise1(count * 1.9, 23))
        if s_acc - last < spacing:
            continue
        last = s_acc; count += 1
        t = fr[i]; g = glow_at(t)
        flow = T[i]
        # ring plane: perpendicular to the flow, slightly tilted for life
        tilt = 0.10 * noise1(count * 0.9, 3)
        nn = unit(N[i] + flow * tilt); bb = unit(np.cross(flow, nn)); nn = unit(np.cross(bb, flow))
        # bone bar: an arc over the outer rim and both faces, thinning and darkening toward the
        # inner seam (never a full ring, so the coil keeps a dark spiral groove between turns)
        out_dir = unit(rhat[i] - flow * np.dot(rhat[i], flow))
        face_dir = unit(np.cross(flow, out_dir))
        ext = math.radians(bar_ext + 18 * noise1(count * 0.77, 13))
        segs = 20
        ring = []
        bend = 0.35 * spacing * (1 + 0.4 * noise1(count * 0.61, 29))
        for k in range(segs + 1):
            a = -ext + 2 * ext * k / segs
            wob = 1 + 0.05 * noise1(a * 2 + count, 5)
            # the bar is a crescent: it leans with the flow where it crosses the outer rim
            crescent = flow * (bend * math.cos(a) ** 2)
            ring.append(centre_line[i] + (out_dir * math.cos(a) + face_dir * math.sin(a)) * (arm_r[i] * 1.0 * wob) + crescent)
        ring = np.asarray(ring)
        height = 0.15 * spacing + 0.004
        halfw = 0.32 * spacing * (1 + 0.18 * noise1(count * 1.3, 9))
        prof = np.array([(0.25 + 0.75 * math.sin(math.pi * k / segs) ** 0.45) for k in range(segs + 1)])

        def ring_col(ii, tt, jj, aa, g=g):
            rim = math.sin(math.pi * tt) ** 0.8          # 1 at the outer rim, 0 at the inner seam
            crest = max(0.0, math.cos(aa)) ** 1.1
            c = mix(BONE, BONE_EDGE, 0.25 + 0.65 * crest * rim)
            c = mix(BONE_ROOT, c, 0.2 + 0.8 * rim)
            return mix(c, GLOW, g * 0.55)
        mb.tube(ring, height * prof, sides=8, flat=halfw / height, color_fn=ring_col, hint=flow, cap=True,
                mat=1 if g > 0.5 else 0)
        # crosier on the outer rim of every ring: the scalloped seam between turns
        rim_base = centre_line[i] + out_dir * (arm_r[i] * 0.90)
        big = count % 2 == 0
        hook_len = (spacing * (3.1 if big else 2.1) + 0.05) * (1 + 0.12 * noise1(count * 2.1, 17))
        mb.crosier(rim_base, out_dir, flow, hook_len, spacing * (0.42 if big else 0.30) + 0.007, turns=1.05,
                   straight=0.10, sides=7, color_root=mix(BONE_ROOT, BONE, 0.3), color_tip=mix(BONE_EDGE, GLOW, g),
                   hint=e3, mat=1 if g > 0.5 else 0, bend_power=1.45)
        # a small curl on each face every third bar, leaning with the flow
        if count % 3 == 0 and t < 0.85:
            for face_sign in (1, -1):
                fb = centre_line[i] + face_dir * (face_sign * arm_r[i] * 0.90)
                mb.crosier(fb, face_dir * face_sign, flow, hook_len * 0.45, spacing * 0.16 + 0.004, turns=0.9,
                           straight=0.15, sides=6, color_root=BONE_ROOT, color_tip=mix(BONE_EDGE, GLOW, g),
                           hint=unit(np.cross(face_dir * face_sign, flow)), mat=1 if g > 0.5 else 0, bend_power=1.6)
    ob = mb.finish(micro_uv_scale=3.0)
    clean(ob)
    return ob


# ============================================================== shell (rib cage) + crest + tail
SHELL_CONTROLS = [(.12, 2.28, -.70), (-.04, 1.9, -.46), (.22, 1.45, -.13), (.62, .95, .28), (.53, .40, .39),
                  (.16, -.12, .08), (-.08, -.62, -.22), (.02, -1.03, -.36)]
SHELL_W = [.62, .76, .86, .90, .72, .46, .28, .16]
SHELL_D = [.52, .70, .88, .94, .78, .50, .30, .17]


def cell_random(i, j, salt=0):
    x = math.sin(i * 12.9898 + j * 78.233 + salt * 37.719) * 43758.5453
    return x - math.floor(x)


def build_shell():
    ps = catmull(SHELL_CONTROLS, 16)
    ps = resample(ps, count=180)
    n = len(ps)
    tt = np.linspace(0, 1, n)
    kk = np.linspace(0, 1, len(SHELL_CONTROLS))
    W = np.interp(tt, kk, SHELL_W); D = np.interp(tt, kk, SHELL_D)
    T, N, B = rmf_frames(ps, hint=(0, 0, 1))   # N ~ front (+z), B ~ -x

    def surf(s, a, inset=0.0):
        """s in [0,1] along the S; a=0 front, pi/2 the -x flank, pi back, 3pi/2 the +x flank."""
        k = s * (n - 1); i = int(min(n - 2, k)); f = k - i
        c = ps[i] * (1 - f) + ps[i + 1] * f
        w = (W[i] * (1 - f) + W[i + 1] * f) - inset
        d = (D[i] * (1 - f) + D[i + 1] * f) - inset
        nn = unit(N[i] * (1 - f) + N[i + 1] * f); bb = unit(B[i] * (1 - f) + B[i + 1] * f)
        return c + nn * (d * math.cos(a)) + bb * (w * math.sin(a))

    def surf_normal(s, a):
        p = surf(s, a); q = surf(s, a, inset=0.05)
        return unit(p - q)

    mb = MeshBuilder("Shell | rib cage lattice", body, [BONE_MAT, INK_MAT])
    # primary rib rows (~0.085 apart through the ribcage) with a thin secondary vein between them
    rows = [0.0]
    s = 0.0
    while s < 0.985:
        w = float(np.interp(s, tt, W))
        s += 0.050 + 0.040 * (0.9 - w) + 0.015 * (1 if s < 0.1 else 0)
        rows.append(min(0.985, s))
    rows = np.array(rows)
    cols = np.linspace(0, math.tau, 9)[:-1]  # 8 strut columns
    around = 56

    def rib_loop(s0, ri, amp, inset, tilt=0.0):
        """Closed loop around the body. tilt > 0 drops the loop toward the tail as it leaves the
        front spine (a=0), so from the front every rib reads as a fern pinna / chevron."""
        loop = []
        for k in range(around + 1):
            a = k * math.tau / around
            wave = amp * noise1(a * 2.1 + ri * 0.8, ri)
            drop = tilt * math.sin(a) ** 2      # highest at the front and back spines, lowest at the flanks
            loop.append(surf(min(0.985, max(0, s0 + wave + drop)), a, inset=inset))
        return np.asarray(loop)

    # --- primary ribs: flat pale bone bands hugging the surface, wavy, pinna-tilted
    for ri, s0 in enumerate(rows):
        w = float(np.interp(s0, tt, W))
        rib_w = 0.011 + 0.022 * w          # half width of the band (along the body)
        tilt = 0.045 * w * (1 + 0.3 * noise1(ri * 1.7, 21))
        loop = rib_loop(s0, ri, 0.020 * w, -0.003, tilt)
        rr = rib_w * (1 + 0.32 * np.array([noise1(k * 0.5, ri * 3.1) for k in range(len(loop))]))
        rr *= np.array([0.85 + 0.35 * max(0.0, -math.cos(k * math.tau / around)) for k in range(len(loop))])  # chunkier over the dorsal shield

        def rib_col(i, t, j, a):
            crest = max(0.0, math.sin(a)) ** 1.3
            c = mix(BONE, BONE_EDGE, crest * 0.85)
            return mix(BONE_ROOT, c, 0.4 + 0.6 * crest)
        # band: wide along the body (B of the loop frame ~ surface tangent), low in height
        mb.tube(loop, rr, sides=8, flat=0.42, color_fn=rib_col, hint=surf_normal(s0, 0.0), cap=False, mat=0)
        # secondary vein half-way to the next rib, thinner and darker, sitting deeper
        if ri < len(rows) - 1:
            sm = (s0 + rows[ri + 1]) / 2
            loop2 = rib_loop(sm, ri + 50, 0.012 * w, 0.006, tilt)
            rr2 = rib_w * 0.30 * (1 + 0.3 * np.array([noise1(k * 0.7, ri * 2.3) for k in range(len(loop2))]))
            mb.tube(loop2, rr2, sides=6, flat=0.6, color=mix(BONE_ROOT, BONE, 0.4), hint=surf_normal(sm, 0.0), cap=False, mat=0)
        # each rib ends on the creature's left flank (+x, a ~ 1.5 pi) in a curl: the scalloped margin
        if 0.03 < s0 < 0.80 and ri % 1 == 0:
            a_c = 1.47 * math.pi + 0.05 * noise1(ri * 2.3, 31)
            s_c = min(0.985, s0 + tilt * (1 - math.cos(a_c)) / 2)
            basep = surf(s_c, a_c, inset=-0.006)
            outward = surf_normal(s_c, a_c)
            k = int(min(n - 2, s_c * (n - 1)))
            flow = T[k]  # curls roll toward the tail
            length = (0.16 + 0.22 * w) * (1 - 0.35 * s0) * (1 + 0.2 * noise1(ri * 1.1, 41))
            mb.crosier(basep, outward, flow, length, 0.030 + 0.030 * w, turns=1.0, straight=0.15,
                       sides=7, color_root=mix(BONE_ROOT, BONE, 0.3), color_tip=BONE_EDGE,
                       hint=unit(np.cross(outward, flow)), mat=0, bend_power=1.5)
    # --- longitudinal struts only where the reference shows a network (back and flanks)
    for ci, a0 in enumerate(cols):
        if not (0.30 * math.pi < a0 < 1.70 * math.pi):
            continue
        path = np.asarray([surf(s, a0 + 0.10 * math.sin(s * 9 + ci), inset=-0.001) for s in np.linspace(0.0, 0.985, 70)])
        rr = np.array([0.008 + 0.014 * float(np.interp(s, tt, W)) for s in np.linspace(0, 0.985, 70)])
        mb.tube(path, rr, sides=7, flat=0.6, color=mix(BONE, BONE_ROOT, 0.45), hint=(0, 0, 1), mat=0)
    for ri in range(len(rows) - 1):
        for ci in range(len(cols)):
            a0, a1 = cols[ci], cols[(ci + 1) % len(cols)]
            if a1 < a0:
                a1 += math.tau
            back = 0.55 * math.pi < (a0 + a1) / 2 < 1.45 * math.pi
            if not back or cell_random(ri, ci, 3) < 0.45:
                continue
            flip = cell_random(ri, ci, 4) < 0.5
            s0, s1 = rows[ri], rows[ri + 1]
            pa = surf(s0, a0 if flip else a1, inset=-0.001); pb = surf(s1, a1 if flip else a0, inset=-0.001)
            pm = surf((s0 + s1) / 2, (a0 + a1) / 2, inset=-0.012)
            path = catmull([pa, pm, pb], 6)
            mb.tube(path, 0.007 + 0.011 * float(np.interp(s0, tt, W)), sides=6, color=mix(BONE, BONE_ROOT, 0.5), hint=(0, 0, 1), mat=0)
    # --- membrane cells (recessed, some open)
    for ri in range(len(rows) - 1):
        s0, s1 = rows[ri], rows[ri + 1]
        for ci in range(len(cols)):
            a0, a1 = cols[ci], cols[(ci + 1) % len(cols)]
            if a1 < a0:
                a1 += math.tau
            am = (a0 + a1) / 2
            region = "front" if (am < 0.45 * math.pi or am > 1.55 * math.pi) else ("back" if 0.6 * math.pi < am < 1.4 * math.pi else "side")
            shield = region == "back"
            p_open = {"front": 0.22, "back": 0.12, "side": 0.28}[region]
            if ri < 2 or ri > len(rows) - 4:
                p_open *= 0.3
            if cell_random(ri, ci) < p_open:
                continue
            w = float(np.interp((s0 + s1) / 2, tt, W))
            grid = []
            for u in np.linspace(0, 1, 7):
                row = []
                for v in np.linspace(0, 1, 7):
                    dish = math.sin(math.pi * u) * math.sin(math.pi * v)
                    ripple = 0.005 * w * math.sin(v * 21 + ri) * math.sin(u * 9 + ci)
                    inset = 0.006 + 0.010 * w + (0.010 if shield else 0.022) * w * dish + ripple
                    row.append(surf(s0 + (s1 - s0) * u, a0 + (a1 - a0) * v, inset=inset))
                grid.append(row)
            tint = cell_random(ri, ci, 7)
            # the dorsal shield: pale bone plates, each pierced by a real elongated hole
            hu = 0.30 + 0.14 * cell_random(ri, ci, 8); hv = 0.36 + 0.14 * cell_random(ri, ci, 9)
            cu = 0.5 + 0.08 * (cell_random(ri, ci, 10) - 0.5); cv = 0.5 + 0.08 * (cell_random(ri, ci, 11) - 0.5)

            def hole(u, v, hu=hu, hv=hv, cu=cu, cv=cv):
                return ((u - cu) / hu) ** 2 + ((v - cv) / hv) ** 2 < 1.0

            def mem_col(u, v, tint=tint, shield=shield, hu=hu, hv=hv, cu=cu, cv=cv):
                dish = math.sin(math.pi * u) * math.sin(math.pi * v)
                if shield:
                    rim = min(1.0, (((u - cu) / hu) ** 2 + ((v - cv) / hv) ** 2) ** 0.5)
                    return mix(BONE_ROOT, mix(BONE, BONE_EDGE, 0.35 * tint), smooth((rim - 0.6) / 0.5))
                c = mix(INK, MEMBRANE, (1 - dish) * 0.8 + 0.3 * tint)
                return mix(c, MEMBRANE_LIT, 0.12 * tint)
            mb.patch(grid, color_fn=mem_col, mat=0 if shield else 1, skip_fn=hole if shield else None)
    # --- inner core: a dark closed body inside the cage so the creature is never see-through
    core = []
    for s in np.linspace(0.015, 0.975, 60):
        w = float(np.interp(s, tt, W))
        row = [surf(s, a, inset=0.055 + 0.08 * w) for a in np.linspace(0, math.tau, 33)]
        core.append(row)
    mb.patch(np.asarray(core), color=mix(INK, MEMBRANE, 0.35), mat=1)
    shell = mb.finish(micro_uv_scale=2.2)
    clean(shell)
    return shell


def build_tail():
    tp = np.asarray([(.08 + .32 * math.sin(t * math.tau + math.pi) - .30 * t, -.80 - 2.95 * t,
                      -.26 + .28 * math.sin(t * math.pi * 1.5)) for t in np.linspace(0, 1, 140)])
    tt = np.linspace(0, 1, len(tp))
    radii = .23 * (1 - tt) ** .80 + .006
    radii *= 1 + 0.022 * np.sin(tt * 150) + 0.012 * np.sin(tt * 37 + 1)  # soft segment ridges
    mb = MeshBuilder("Tail | ribbed ink tail and spines", body, [INK_MAT, BONE_MAT])

    def tail_col(i, t, j, a):
        # the spine side (back, a ~ pi) is pale bone, the belly is ink
        pale = max(0.0, -math.cos(a)) ** 1.6
        return mix(INK, mix(BONE, BONE_EDGE, 0.3), pale * (0.85 - 0.3 * t))
    mb.tube(tp, radii, sides=18, color_fn=tail_col, hint=(0, 0, 1), mat=0, taper_end=True)
    T, N, B = rmf_frames(tp, hint=(0, 0, 1))
    lengths = [1.13, 1.31, 1.28, 1.15, 1.04, .95, .87, .80, .85, .90, .83, .72, .60, .46]
    for ii, (t, le) in enumerate(zip(np.linspace(.055, .89, 14), lengths)):
        i = int(t * (len(tp) - 1)); p = tp[i]
        tang = T[i]; side = unit(np.cross(tang, V((0, 0, 1)))); normal = unit(np.cross(side, tang))
        u = min(1, max(0, (t - .40) / .45)); roll = math.pi * (u * u * (3 - 2 * u))
        edge = side * math.cos(roll) + normal * math.sin(roll)
        tip = p + edge * le + tang * (.12 + .16 * t)
        path = catmull([p - edge * radii[i] * 0.4, p + edge * le * .30 + tang * .02, tip], 8)
        n = len(path); ts = np.linspace(0, 1, n)
        rr = (.085 * (1 - t * .45)) * (1 - ts) ** .85 + .004
        mb.tube(path, rr, sides=8, flat=0.6, color_fn=lambda i2, t2, j2, a2: mix(BONE_ROOT, BONE_EDGE, t2 ** 0.6),
                hint=normal, mat=1, taper_end=True)
    ob = mb.finish(micro_uv_scale=2.2)
    clean(ob)
    return ob


# ============================================================== face leaf (glowing lattice fused to the head)
def facepoint(t, u, front=True):
    w = np.interp(t, [0, .20, .50, .80, 1], [.30, .35, .255, .105, .001])
    x = u * w + .018 * (1 - t) ** 2
    y = .63 - 1.16 * t - .12 * u * (1 - t) ** 2 - .08 * abs(u) * (1 - t) ** 2
    z = .02 + .09 * t + ((.145 * (1 - abs(u)) * (1 - .55 * t) - .15 * (1 - abs(u)) * (1 - t) ** 4) if front else -(.045 + .15 * (1 - abs(u) ** 2)) * (1 - t) ** .8)
    if front:
        flow = u + .055 * math.sin(t * 4.7); crest = (.5 + .5 * math.cos(flow * math.pi * 12 + 1.2 * t)) ** 8
        z += .006 * (crest - .1) * (1 - abs(u)) * math.sin(math.pi * t)
    return P((x, y, z))


def lattice_image(name="face-lattice", size=512):
    """Converging net: fan threads toward the tip plus crossing arcs. RGBA, alpha = line mask."""
    img = bpy.data.images.get(name)
    if img:
        return img
    ys, xs = np.mgrid[0:size, 0:size]
    u = xs / (size - 1) * 2 - 1      # across (-1..1)
    t = ys / (size - 1)              # along (0 base .. 1 tip)
    mask = np.zeros((size, size))
    width = np.interp(t, [0, .20, .50, .80, 1], [.30, .35, .255, .105, .001]) / .35
    un = np.clip(u / np.maximum(width, 1e-3), -1.2, 1.2)
    # fan threads converging on the tip
    for u0 in np.linspace(-.92, .92, 9):
        uu = u0 * (1 - .22 * t) + .12 * u0 * np.sin(np.pi * t)
        d = np.abs(un - uu) * np.maximum(width, 0.05)
        mask = np.maximum(mask, np.exp(-(d / 0.0075) ** 2))
    # crossing arcs
    for direction in (-1, 1):
        for j, base_t in enumerate([.02, .14, .26, .38, .50, .62, .74]):
            tc = base_t + direction * .16 * un + .22 * (1 - un ** 2) + .012 * np.sin(un * 4 + j)
            d = np.abs(t - tc)
            mask = np.maximum(mask, np.exp(-(d / 0.0062) ** 2))
    inside = (np.abs(un) < 1.0) & (t > 0.015) & (t < 0.985)
    mask = mask * inside
    tip_glow = np.exp(-(((t - 0.93) / 0.12) ** 2 + (un / 0.35) ** 2)) * inside
    mask = np.clip(np.maximum(mask, tip_glow * 0.9), 0, 1)
    rgba = np.zeros((size, size, 4))
    rgba[..., 0] = 0.35 + 0.45 * mask
    rgba[..., 1] = 0.95
    rgba[..., 2] = 0.55 + 0.3 * mask
    rgba[..., 3] = mask
    img = bpy.data.images.new(name, size, size, alpha=True, float_buffer=False)
    img.pixels.foreach_set(rgba.ravel().astype(np.float32))
    img.pack()
    return img


def build_face():
    oldH = Matrix.Translation(Vector((-.58, -.68, .06))) @ Matrix.Rotation(math.radians(-18), 4, "Y")
    rows, cols = 44, 22
    mat = bpy.data.materials.get("Rune | v3 face lattice")
    if not mat:
        mat = bpy.data.materials.new("Rune | v3 face lattice"); mat.use_nodes = True
        nt = mat.node_tree; b = nt.nodes["Principled BSDF"]
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = lattice_image()
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "AuthoredUV"
        nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
        nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
        nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
        b.inputs["Emission Strength"].default_value = 1.1
        b.inputs["Roughness"].default_value = 0.5
        mat.blend_method = "BLEND"
        mat.use_backface_culling = False
    mb = MeshBuilder("Face | fused glowing lattice leaf", body, [mat])
    grid = []
    for i in range(rows + 1):
        t = 0.02 + 0.965 * i / rows
        row = []
        for j in range(cols + 1):
            u = -1 + 2 * j / cols
            p = oldH @ facepoint(t, u * 0.97)
            row.append(Pinv(p))
        grid.append(row)
    mb.patch(np.asarray(grid), color=(0.4, 0.9, 0.5), uv_fn=lambda a, b_: ((b_ * 2 - 1) * 0.5 + 0.5, a))
    ob = mb.finish(micro_uv_scale=1.0)
    headmesh = next(o for o in bpy.data.objects if o.name.startswith("Head |"))
    bpy.context.view_layer.objects.active = ob
    sw = ob.modifiers.new("Fuse to head surface", "SHRINKWRAP")
    sw.target = headmesh; sw.wrap_method = "NEAREST_SURFACEPOINT"; sw.wrap_mode = "ABOVE_SURFACE"; sw.offset = 0.006
    bpy.ops.object.modifier_apply(modifier=sw.name)
    dt = ob.modifiers.new("Copy neck weights", "DATA_TRANSFER")
    dt.object = headmesh; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "NEAREST"; dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
    for g in headmesh.vertex_groups:
        ob.vertex_groups.new(name=g.name)
    bpy.ops.object.datalayout_transfer(modifier=dt.name)
    bpy.ops.object.modifier_apply(modifier=dt.name)
    arm = ob.modifiers.new("Rooted cranial surface deformation", "ARMATURE")
    arm.object = rig; arm.use_vertex_groups = True
    return ob


HORNS = [([(-.20, .29, .02), (-.43, .39, .02), (-.68, .64, -.04), (-.76, .96, -.10)], .080),
         ([(.21, .25, .025), (.44, .44, .01), (.49, .77, -.06), (.39, 1.06, -.14)], .088),
         ([(-.12, .025, .035), (-.32, .015, .045), (-.52, .00, .03), (-.84, .18, -.04), (-1.04, .39, -.11)], .095),
         ([(.12, .045, .035), (.32, .05, .045), (.57, .10, .025), (.93, .41, -.04), (1.04, .72, -.11)], .098)]


def build_beads():
    """Pearl-dot chains along the outer edge of the four head tendrils (the reference's dotted
    antennae). The tendrils are fully head-weighted, so the beads ride rigidly on HeadPivot."""
    oldH = Matrix.Translation(Vector((-.58, -.68, .06))) @ Matrix.Rotation(math.radians(-18), 4, "Y")
    bpy.context.view_layer.update()
    to_head = head.matrix_local.inverted() @ oldH   # oldH-local -> HeadPivot-local (both under BodyPivot)
    mb = MeshBuilder("HeadBeads | pearl chains on the tendrils", head, [BONE_MAT])
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    sphere = [(v.co.x, v.co.y, v.co.z) for v in bm.verts]
    sfaces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    for cs, radius in HORNS:
        ps = catmull(cs, 14)
        n = len(ps)
        sg = 1 if cs[0][0] < 0 else -1
        acc = 0.0; last = -1.0
        for i in range(1, n - 1):
            acc += np.linalg.norm(ps[i] - ps[i - 1])
            t = i / (n - 1)
            if t > 0.93:
                break
            gap = 0.030 + 0.014 * (1 - t)
            if acc - last < gap:
                continue
            last = acc
            tang = unit(ps[i + 1] - ps[i - 1]); side = unit(np.cross(tang, V((0, 0, 1)))) * sg
            w = radius * (1 - t) ** 1.1 * (1 + .28 * (1 - t) ** 3) + .0018
            centre = ps[i] + side * (w * 0.98)
            br = 0.0065 + 0.006 * (1 - t)
            sv = len(mb.v)
            for (x, y, z) in sphere:
                p_old = P(centre) + Vector((x, y, z)) * br        # Blender coords in oldH-local
                p_head = to_head @ p_old
                mb.add_vertex(Pinv(p_head), BONE_EDGE)
            for f in sfaces:
                mb.add_face(tuple(sv + k for k in f), 0)
    ob = mb.finish(micro_uv_scale=1.0)
    return ob


def bake_cavity_into_colors():
    """Hemisphere-ray cavity occlusion of the real geometry, multiplied once into the authored colours."""
    from guardian_cavity_ao import bake_guardian_cavity
    stats = bake_guardian_cavity(root, radius=0.5, samples=10, strength=0.72)
    for ob in [o for o in root.children_recursive if o.type == "MESH"]:
        me = ob.data
        ao_layer = me.color_attributes.get("GuardianCavityAO")
        col = me.color_attributes.get("GuardianSurface")
        if ao_layer is None or col is None or ob.name.startswith("Face |"):
            continue
        ao = np.empty(len(me.vertices) * 4); ao_layer.data.foreach_get("color", ao)
        cc = np.empty(len(me.vertices) * 4); col.data.foreach_get("color", cc)
        ao = ao.reshape(-1, 4)[:, 0]; cc = cc.reshape(-1, 4)
        cc[:, :3] *= ao[:, None]
        col.data.foreach_set("color", cc.ravel())
        me.color_attributes.remove(ao_layer)
        me.update()
    return stats


# ============================================================== build
built = {}
if "fronds" in ORGANS:
    remove(["Frond_"])
    for idx, (cs, cl, ct, side, widths) in enumerate(FRONDS):
        built["Frond_%02d" % idx] = build_frond(idx, cs, cl, ct, side, widths)
    print("FRONDS_DONE", round(time.time() - START, 1), flush=True)
if "whorls" in ORGANS:
    remove(["Bone | overlapping", "Whorl_"])
    for args in WHORLS:
        built[args[0]] = build_whorl(*args)
    print("WHORLS_DONE", round(time.time() - START, 1), flush=True)
if "shell" in ORGANS:
    remove(["Shell |", "Tail |"])
    built["Shell"] = build_shell()
    built["Tail"] = build_tail()
    print("SHELL_DONE", round(time.time() - START, 1), flush=True)
if "face" in ORGANS:
    remove(["Face |", "HeadBeads |"])
    built["Face"] = build_face()
    built["HeadBeads"] = build_beads()
    print("FACE_DONE", round(time.time() - START, 1), flush=True)

# head: keep the validated skinned sculpt, recolour it to the ink palette and lighten the rim
headmesh = next((o for o in bpy.data.objects if o.name.startswith("Head |")), None)
if headmesh is not None and "head" in ORGANS:
    for ob in bpy.data.objects:
        if ob.type == "MESH" and (ob.name.startswith("Head |") or ob.name.startswith("Jaw |")):
            ob.data.materials.clear(); ob.data.materials.append(INK_MAT)
    me = headmesh.data
    co = np.array([tuple(v.co) for v in me.vertices]); x, y, z = co.T
    nrm = np.array([tuple(v.normal) for v in me.vertices])
    front = np.clip(-nrm[:, 1], 0, 1)
    cols = np.array([mix(INK, (0.05, 0.11, 0.06), float(f) ** 1.5 * 0.8) for f in front])
    layer = me.color_attributes.get("GuardianSurface")
    layer.data.foreach_set("color", np.c_[cols, np.ones(len(cols))].ravel())
    me.update()

if "ao" in ORGANS:
    ao_stats = bake_cavity_into_colors()
    print("AO_DONE", json.dumps(ao_stats, default=str)[:300], round(time.time() - START, 1), flush=True)

audit = [mesh_audit(o) for o in root.children_recursive if o.type == "MESH"]
print("MESHES", json.dumps({"objects": len(audit), "vertices": sum(a["vertices"] for a in audit),
                            "triangles": sum(a["triangles"] for a in audit)}), flush=True)
for a in audit:
    print("  ", a["mesh"], a["vertices"], a["triangles"], flush=True)

stamp = opts["stamp"]
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"guardian-{stamp}.blend"))
print("SAVED", OUT / f"guardian-{stamp}.blend", round(time.time() - START, 1), flush=True)

if opts["export"] == "1":
    exec(open(str(HERE / "dogs_guardian_v3_export.py")).read())
