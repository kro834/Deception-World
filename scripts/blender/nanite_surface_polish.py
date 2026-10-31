"""Material-only pass over existing nanite Blender scenes, preserving every mesh/frame.
Blender -b --factory-startup -P this.py -- <existing scene.py> <render directory> [px]
The existing scene supplies its original camera, topology, animation and packing contract.
"""
import bpy
import os
import runpy
import sys
from bpy.app.handlers import persistent

@persistent
def refine_nanite_surface(scene):
    for material in bpy.data.materials:
        if not material.use_nodes or material.get("world_surface_refined"):
            continue
        for node in material.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            metallic = node.inputs.get("Metallic")
            roughness = node.inputs.get("Roughness")
            if metallic and roughness and metallic.default_value >= 0.5:
                # Separate the polished lip from its darker machined deck without
                # widening the chip, inventing a glow halo or changing light power.
                roughness.default_value = max(0.19, min(0.38, roughness.default_value * 1.08))
                coat = node.inputs.get("Coat Weight")
                coat_roughness = node.inputs.get("Coat Roughness")
                if coat: coat.default_value = 0.12
                if coat_roughness: coat_roughness.default_value = 0.16
        material["world_surface_refined"] = True

bpy.app.handlers.render_pre.append(refine_nanite_surface)
args = sys.argv[sys.argv.index("--") + 1:]
source = os.path.abspath(args[0])
sys.argv = [sys.argv[0], "--", *args[1:]]
runpy.run_path(source, run_name="__main__")
