"""Build the Rexonance 3D model (undersuit + armour parts) and review renders.

bpy module (pip install bpy==5.2.*, Python 3.13):
    python scripts/blender/rexonance3d/build.py --parts all --render front,right,back,left,persp
Blender CLI (4.5 LTS or newer):
    blender --background --factory-startup --python scripts/blender/rexonance3d/build.py -- --parts all

Options
    --parts LIST    comma list of armour parts, or "all" (the body is always built)
    --out DIR       output folder (default output/rexonance-3d/build)
    --render LIST   any of front,back,right,left (reference-aligned orthographic,
                    plus a [reference | render | overlay] strip) and persp (4 angles)
    --engine NAME   workbench (default, fast form review) or cycles (materials)
    --res W         render width in px (height = 1.5 W), default 512
    --zoom LIST     close-ups "view:h,z,size;view:h,z,size" (metres, view coordinates)
                    each written as zoom-N.png and cmpzoom-N.png [reference crop | render | overlay]
    --blend         save OUT/rexonance.blend
    --export        export OUT/rexonance-raw.glb (every object as built)
    --release       export OUT/rexonance-raw-release.glb joined for the web (export.py),
                    then pack it with pack_release.mjs

Parts live in part_<name>.py and expose build(ctx). A part that raises is
reported and skipped so one unfinished module never blocks the others.
"""

import argparse
import hashlib
import importlib
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import rx_body  # noqa: E402
import rx_lib  # noqa: E402
import rx_ref  # noqa: E402
import rx_render  # noqa: E402

PARTS = ["helmet", "torso", "shoulders", "waist", "arms", "legs", "tail", "ribbons"]
DEFAULT_OUT = os.path.join(rx_ref.REPO, "output", "rexonance-3d", "build")
CACHE = os.path.join(rx_ref.REPO, "output", "rexonance-3d", "cache")
BODY_TRIANGLES = 150_000


class Ctx:
    def __init__(self, body_ob, out, args):
        self.body_ob = body_ob
        self.body = rx_lib.Body(body_ob)
        self.out = out
        self.args = args
        self.lib = rx_lib
        self.ref = rx_ref
        self.LM = rx_ref.LM

    def coll(self, part):
        return rx_lib.collection("RX_" + part.capitalize())


def _argv():
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else argv[1:]


def parse(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--parts", default="")
    p.add_argument("--out", default=DEFAULT_OUT)
    p.add_argument("--render", default="")
    p.add_argument("--engine", default="workbench")
    p.add_argument("--res", type=int, default=512)
    p.add_argument("--zoom", default="")
    p.add_argument("--blend", action="store_true")
    p.add_argument("--export", action="store_true")
    p.add_argument("--release", action="store_true")
    return p.parse_args(_argv() if argv is None else argv)


def _source_hash():
    h = hashlib.sha1()
    for name in ("rx_body.py", "rx_ref.py"):
        with open(os.path.join(HERE, name), "rb") as f:
            h.update(f.read())
    h.update(str(BODY_TRIANGLES).encode())
    return h.hexdigest()[:12]


def mesh_arrays(ob):
    me = ob.data
    v = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", v)
    me.calc_loop_triangles()
    t = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", t)
    return v.reshape(-1, 3), t.reshape(-1, 3)


def build_body():
    coll = rx_lib.collection("RX_Body")
    os.makedirs(CACHE, exist_ok=True)
    cache = os.path.join(CACHE, "body-%s.npz" % _source_hash())
    if os.path.exists(cache):
        data = np.load(cache)
        ob = rx_lib.from_arrays(data["v"], data["f"], "RX_Body_Suit", coll, "Suit")
        return ob
    t0 = time.time()
    v, f = rx_body.body_mesh_arrays()
    ob = rx_lib.from_arrays(v, f, "RX_Body_Suit", coll, "Suit")
    if len(f) > BODY_TRIANGLES:
        mod = ob.modifiers.new("decimate", "DECIMATE")
        mod.ratio = BODY_TRIANGLES / len(f)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        ob.modifiers.clear()
        old = ob.data
        ob.data = me
        bpy.data.meshes.remove(old)
        me.name = "RX_Body_Suit"
    rx_lib.smooth(ob, None)
    v2, f2 = mesh_arrays(ob)
    tmp = cache + ".%d.tmp.npz" % os.getpid()
    np.savez_compressed(tmp, v=v2, f=f2)
    os.replace(tmp, cache)
    print("[body] built in %.1fs: %d -> %d triangles" % (time.time() - t0, len(f), len(f2)))
    return ob


def build_parts(ctx, names):
    report = {}
    for name in names:
        t0 = time.time()
        before = set(bpy.data.objects)
        try:
            mod = importlib.import_module("part_" + name)
            importlib.reload(mod)
            mod.build(ctx)
            made = [o for o in bpy.data.objects if o not in before]
            tris = 0
            for o in made:
                if o.type == "MESH":
                    o.data.calc_loop_triangles()
                    tris += len(o.data.loop_triangles)
            report[name] = "ok %d objects, %d triangles, %.1fs" % (len(made), tris, time.time() - t0)
        except ModuleNotFoundError as e:
            report[name] = "missing (%s)" % e
        except Exception:
            traceback.print_exc()
            report[name] = "FAILED (see traceback)"
    return report


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0


def review(args, out):
    views = [v for v in args.render.split(",") if v]
    zooms = [z for z in args.zoom.split(";") if z.strip()]
    if not views and not zooms:
        return
    if args.engine == "cycles":
        rx_render.setup_cycles()
    else:
        rx_render.setup_workbench()
    W = args.res
    H = int(round(W * rx_ref.IMG_H / rx_ref.IMG_W))
    for view in views:
        if view in rx_ref.VIEWS:
            rx_render.ortho(view)
            png = rx_render.render(os.path.join(out, "render-%s.png" % view), (W, H))
            rx_render.compare(view, png, os.path.join(out, "cmp-%s.png" % view), height=H)
        elif view == "persp":
            shots = []
            for az in (30.0, 150.0, 215.0, 325.0):
                rx_render.persp(az, 6.0)
                shots.append(rx_render.render(os.path.join(out, "persp-%03d.png" % az), (W, H)))
            rx_render.turntable_sheet(shots, os.path.join(out, "persp-sheet.png"), height=H)
    for i, spec in enumerate(zooms):
        view, nums = spec.strip().split(":")
        h, z, size = (float(v) for v in nums.split(","))
        rx_render.zoom(view, h, z, size)
        png = rx_render.render(os.path.join(out, "zoom-%d.png" % i), (W, W))
        rx_render.compare_zoom(view, h, z, size, png, os.path.join(out, "cmpzoom-%d.png" % i), px=W)


def main():
    args = parse()
    out = rx_render.ensure_dir(os.path.abspath(args.out))
    reset_scene()
    t0 = time.time()
    body = build_body()
    ctx = Ctx(body, out, args)
    names = PARTS if args.parts == "all" else [p for p in args.parts.split(",") if p and p != "body"]
    report = build_parts(ctx, names)
    for k, v in report.items():
        print("[part] %-10s %s" % (k, v))
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "rexonance.blend"), compress=True)
    if args.export:
        import export

        export.export_raw(os.path.join(out, "rexonance-raw.glb"))
    review(args, out)
    if args.release:
        import export

        export.export_release(os.path.join(out, "rexonance-raw-release.glb"))
    print("[build] done in %.1fs -> %s" % (time.time() - t0, out))


if __name__ == "__main__":
    main()
