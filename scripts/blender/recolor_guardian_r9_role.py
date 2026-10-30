"""Rebuild the fixed r9 main-lamina role-v1 colors without study artifacts.

Run with Blender 4.5.9 (NumPy 1.26.4), for example:
  blender --background --factory-startup --python-exit-code 1 \
    --python scripts/blender/recolor_guardian_r9_role.py -- \
    --canonical-blend /path/to/guardian-v2-junction-sculpt.blend \
    --input-glb /path/to/raw-guardian-v2-browser.glb \
    --output-glb /path/to/guardian-r9-role-v1.glb

Only selected COLOR_0 float32 bytes change. No Blender save, glTF export,
geometry optimization, material edit, AO bake or external study is involved.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from guardian_triangle_fields import TriangleFieldProjector


BLEND_SHA256 = "9776c984469b7eeb9fb361fb3ae6367fa885240d9de8cae6fac777e7a69afa0a"
RAW_SHA256 = "d323015f5d5c6b8c2c311ab382c7e059a76217ee21a2e6b8f038f43ee6b37655"
ROLE_SHA256 = "5115a77e0649a45aaabdca071cf50b331f63c9de862197c219e423e21628e350"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def organ(center, rx, ry, turns, phase, yaw=0):
    """Frozen r9 centerline in Blender Z-up coordinates, for classification."""
    import math
    points = []
    for t in np.linspace(0, 1, 440):
        angle = phase - math.tau * turns * t
        radius = (1 - t) ** .88 + .018
        dx = math.cos(angle) * rx * radius + .035 * rx * math.sin(angle * .67) * radius
        x = center[0] + dx * math.cos(yaw)
        y = center[1] + math.sin(angle) * ry * radius + .025 * ry * math.cos(angle * .54) * radius
        z = center[2] + dx * math.sin(yaw) + .12 * rx * math.sin(angle * .67) + .19 * rx * math.sin(t * math.pi)
        points.append((x, -z, y))
    return np.asarray(points)


def canonical_projector(path):
    """Directly recover the original 240 sheets and symmetric v1 rim formula."""
    import math
    bpy.ops.wm.open_mainfile(filepath=str(path))
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('Bone | overlapping')]
    require(len(objects) == 1, "Expected the canonical r9 coiled-lamina mesh")
    ob = objects[0]
    require(np.allclose(np.asarray(ob.matrix_world), np.eye(4), atol=1e-8), "Source bone matrix is not identity")
    mesh = ob.data
    coordinates = np.array([tuple(v.co) for v in mesh.vertices])
    require(len(coordinates) % 224 == 0, "Canonical lamina topology changed")
    main = organ((.94, 2.65, -.57), 1.13, 1, 2.7, 3.75, math.pi / 6)
    others = np.r_[organ((-.43, 1.53, .40), .53, .50, 2.35, 4.1), organ((-.60, .68, .61), .36, .38, 2.05, 3.7)]
    membership = np.zeros(len(coordinates), np.float32)
    for start in range(0, len(coordinates), 224):
        center = (coordinates[start:start + 7].mean(0) + coordinates[start + 112:start + 119].mean(0)) * .5
        if center[2] > 1.75 and np.min(np.linalg.norm(main - center, axis=1)) < np.min(np.linalg.norm(others - center, axis=1)):
            membership[start:start + 224] = 1
    count = int(membership.sum()) // 224
    require(count == 240, f"Expected 240 main laminae, got {count}")
    k = np.arange(len(coordinates)) % 224
    u = -1 + 2 * (k % 7) / 6
    t = ((k % 112) // 7) / 15
    edge = np.clip((np.abs(u) - .40) / .60, 0, 1)
    rim = (edge * edge * (3 - 2 * edge) * (.35 + .65 * t) * membership).astype(np.float32)
    ao = mesh.color_attributes.get('GuardianCavityAO')
    require(ao is not None and ao.domain == 'POINT' and ao.data_type == 'BYTE_COLOR', "Canonical cavity field missing")
    values = np.empty(len(mesh.vertices) * 4, np.float32)
    ao.data.foreach_get('color', values)
    values = values.reshape(-1, 4)
    require(np.max(np.abs(values[:, 1:3] - values[:, :1])) < 1e-7, "Cavity factor must be grayscale")
    # These transient fields never get saved into the canonical Blend.
    for name, data in [('authoredRimWeight', rim), ('RuntimeMainRegion', membership), ('RuntimeCavityFactor', values[:, 0])]:
        attr = mesh.attributes.get(name) or mesh.attributes.new(name, 'FLOAT', 'POINT')
        require(attr.domain == 'POINT' and attr.data_type == 'FLOAT', f"Invalid point field {name}")
        attr.data.foreach_set('value', data)
    return TriangleFieldProjector([ob], {'authoredRimWeight': 0., 'RuntimeMainRegion': 0., 'RuntimeCavityFactor': 1.}), count


def parse_glb(raw):
    require(struct.unpack_from('<III', raw) == (0x46546c67, 2, len(raw)), "Invalid GLB header")
    json_length, kind = struct.unpack_from('<II', raw, 12)
    require(kind == 0x4e4f534a, "Expected JSON chunk")
    json_bytes = raw[20:20 + json_length]
    gltf = json.loads(json_bytes)
    binary_header = 20 + json_length
    binary_length, kind = struct.unpack_from('<II', raw, binary_header)
    binary_start = binary_header + 8
    require(kind == 0x004e4942 and binary_start + binary_length == len(raw), "Expected one BIN chunk")
    require(len(gltf['buffers']) == 1 and 'uri' not in gltf['buffers'][0], "Expected embedded GLB buffer")
    return gltf, json_bytes, binary_start


def local_matrix(node):
    if 'matrix' in node:
        return Matrix(np.asarray(node['matrix']).reshape(4, 4).T.tolist())
    r = node.get('rotation', [0, 0, 0, 1])
    q = Quaternion((r[3], r[0], r[1], r[2]))
    return Matrix.Translation(Vector(node.get('translation', [0, 0, 0]))) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((*node.get('scale', [1, 1, 1]), 1))


def raw_bone_data(gltf, raw, binary_start):
    candidates = [(i, m) for i, m in enumerate(gltf['meshes']) if m.get('name', '').startswith('Bone | overlapping')]
    require(len(candidates) == 1, "Expected one raw coiled-lamina mesh")
    mesh_index, mesh = candidates[0]
    require(len(mesh['primitives']) == 1, "Expected one lamina primitive")
    primitive = mesh['primitives'][0]
    require(set(primitive['attributes']) == {'POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0'} and not primitive.get('extensions'), "Expected uncompressed raw r9 attributes")
    material = gltf['materials'][primitive['material']]
    pbr = material.get('pbrMetallicRoughness', {})
    require('baseColorTexture' not in pbr and pbr.get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1], "Unexpected base-color input")
    require('occlusionTexture' not in material, "An occlusion texture would multiply AO twice")
    parents = {child: i for i, node in enumerate(gltf['nodes']) for child in node.get('children', [])}
    nodes = [i for i, node in enumerate(gltf['nodes']) if node.get('mesh') == mesh_index]
    require(len(nodes) == 1 and 'skin' not in gltf['nodes'][nodes[0]], "Lamina node must be unique and unskinned")
    current = nodes[0]
    visited = set()
    while True:
        require(current not in visited, "Cyclic node hierarchy")
        visited.add(current)
        require(np.allclose(np.asarray(local_matrix(gltf['nodes'][current])), np.eye(4), atol=1e-8), "Bone ancestor transform changed")
        if current not in parents:
            break
        current = parents[current]

    def accessor(index, width):
        a = gltf['accessors'][index]
        require(a['componentType'] == 5126 and a['type'] == f'VEC{width}' and not a.get('normalized') and 'sparse' not in a, "Expected float32 raw accessor")
        view = gltf['bufferViews'][a['bufferView']]
        require(view.get('buffer', 0) == 0, "Accessor outside embedded buffer")
        stride = view.get('byteStride', 4 * width)
        offset = binary_start + view.get('byteOffset', 0) + a.get('byteOffset', 0)
        require(stride >= 4 * width and offset + (a['count'] - 1) * stride + 4 * width <= binary_start + view.get('byteOffset', 0) + view['byteLength'], "Invalid accessor bounds")
        return np.ndarray((a['count'], width), dtype='<f4', buffer=raw, offset=offset, strides=(stride, 4)).copy(), offset, stride

    positions, _, _ = accessor(primitive['attributes']['POSITION'], 3)
    colors, color_offset, color_stride = accessor(primitive['attributes']['COLOR_0'], 3)
    require(len(positions) == len(colors), "Position/color counts differ")
    color_index = primitive['attributes']['COLOR_0']
    color_view = gltf['accessors'][color_index]['bufferView']
    require(sum(a.get('bufferView') == color_view for a in gltf['accessors']) == 1, "Color storage aliases another accessor")
    return positions, colors, color_index, color_offset, color_stride


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--canonical-blend', type=Path, required=True)
    parser.add_argument('--input-glb', type=Path, required=True, help='Original uncompressed r9 browser GLB')
    parser.add_argument('--output-glb', type=Path, required=True, help='New private output, never an input file')
    parser.add_argument('--report', type=Path, help='Defaults to OUTPUT.glb.report.json')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    start = time.time()
    blend, input_glb, output = args.canonical_blend.resolve(), args.input_glb.resolve(), args.output_glb.resolve()
    report_path = args.report.resolve() if args.report else Path(str(output) + '.report.json')
    require(output not in (blend, input_glb) and report_path not in (blend, input_glb, output), "Input/output paths overlap")
    require(not output.exists() and not report_path.exists(), "Refusing to replace an existing output")
    raw = input_glb.read_bytes()
    require(sha256(raw) == RAW_SHA256, "Input is not the frozen raw r9 GLB")
    require(sha256(blend.read_bytes()) == BLEND_SHA256, "Input is not the canonical r9 high-density Blend")
    gltf, json_bytes, binary_start = parse_glb(raw)
    positions, colors, color_index, color_offset, color_stride = raw_bone_data(gltf, raw, binary_start)
    projector, count = canonical_projector(blend)
    print('MAIN_LAMINAE', count, flush=True)
    fields = np.empty((len(positions), 3), np.float32)
    distances = np.empty(len(positions), np.float32)
    for i, p in enumerate(positions):
        # Raw glTF Y-up through verified identity ancestors to Blender Z-up.
        values, distances[i] = projector.sample(Vector((float(p[0]), -float(p[2]), float(p[1]))))
        fields[i] = [values['authoredRimWeight'], values['RuntimeMainRegion'], values['RuntimeCavityFactor']]
        if i % 25000 == 0:
            print('PROJECTED', i, len(positions), flush=True)
    require(np.isfinite(fields).all() and np.isfinite(distances).all(), "Nonfinite projected field")
    require(np.max(np.minimum(np.abs(fields[:, 1]), np.abs(fields[:, 1] - 1))) < 1e-5, "Fractional triangle role membership")
    require(float(distances.max()) < .025, "Source correspondence exceeds 25mm")
    selected = fields[:, 1] > .99999
    require(int(selected.sum()) == 62792, "Expected 62,792 raw main-role vertices")
    # Blender's ramp endpoints/positions are float32 properties, read as
    # float64 by the original recipe. Preserve that rounding for exact bytes.
    ramp_positions = np.asarray([.05, .94], np.float32).astype(np.float64)
    ramp_rgb = np.asarray([[.004, .015, .007], [.15, .25, .14]], np.float32).astype(np.float64)
    weights = np.maximum(0, fields[:, 0]) ** .75
    mix = np.clip((weights - ramp_positions[0]) / (ramp_positions[1] - ramp_positions[0]), 0, 1)
    palette = (ramp_rgb[0][None, :] * (1 - mix[:, None]) + ramp_rgb[1][None, :] * mix[:, None]) * fields[:, 2, None]
    require(np.isfinite(palette).all() and palette.min() >= 0 and palette.max() <= 1, "Invalid linear palette")
    new_colors = colors.copy()
    new_colors[selected] = palette[selected].astype(np.float32)
    result = bytearray(raw)
    allowed = np.zeros(len(raw), bool)
    for i in np.flatnonzero(selected):
        at = color_offset + int(i) * color_stride
        result[at:at + 12] = new_colors[i].astype('<f4').tobytes()
        allowed[at:at + 12] = True
    result = bytes(result)
    before, after = np.frombuffer(raw, np.uint8), np.frombuffer(result, np.uint8)
    require(len(result) == len(raw) and np.array_equal(before[~allowed], after[~allowed]), "Nonselected color or non-color byte changed")
    require(result[20:20 + len(json_bytes)] == json_bytes, "GLB JSON changed")
    # Accessors include positions, normals, UVs, indices, skin and animation.
    for i, accessor in enumerate(gltf['accessors']):
        if i == color_index:
            continue
        view = gltf['bufferViews'][accessor['bufferView']]
        at = binary_start + view.get('byteOffset', 0)
        require(raw[at:at + view['byteLength']] == result[at:at + view['byteLength']], f'Accessor {i} changed')
    animations = [(a['name'], len(a['channels'])) for a in gltf['animations']]
    require(animations == [('Rest', 17), ('Exhale', 17)], "Canonical animation contract changed")
    output_sha = sha256(result)
    require(output_sha == ROLE_SHA256, f'Reproduction differs: {output_sha}; expected {ROLE_SHA256}')
    require(sha256(input_glb.read_bytes()) == RAW_SHA256 and sha256(blend.read_bytes()) == BLEND_SHA256, "An input file changed")
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = output.with_name('.' + output.name + '.staging')
    require(not staging.exists(), "Staging file already exists")
    staging.write_bytes(result)
    staging.replace(output)
    report = {
        'canonicalBlendSha256': BLEND_SHA256, 'rawInputSha256': RAW_SHA256,
        'outputSha256': output_sha, 'expectedOutputSha256': ROLE_SHA256,
        'bytes': len(result), 'sourceMainLaminaCount': count,
        'changedColorVertices': int(selected.sum()), 'otherBoneVerticesExact': int((~selected).sum()),
        'jsonBytesExact': True, 'allOtherBytesExact': True,
        'geometrySkinAnimationTextureBytesExact': True, 'animations': animations,
        'actualChangedBytes': int(np.count_nonzero(before != after)),
        'projectionDistance': {'mean': float(distances.mean()), 'max': float(distances.max())},
        'palette': {'linearRGBEndpoints': ramp_rgb.tolist(), 'rampPositions': ramp_positions.tolist(), 'rimPower': .75, 'AO': 'Original cavity factor multiplied once'},
        'runtimeApproximation': 'Keeps raw r9 normal/ORM/material settings; does not reproduce Blender roughness/coat/fresh AO.',
        'sourceScriptSha256': sha256(Path(__file__).read_bytes()),
        'helperSha256': sha256(Path(__file__).with_name('guardian_triangle_fields.py').read_bytes()),
        'blenderVersion': bpy.app.version_string, 'numpyVersion': np.__version__,
        'studyArtifactDependencies': False, 'seconds': time.time() - start,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    print('ROLE_REPRODUCED', output_sha, len(result), flush=True)


if __name__ == '__main__':
    main()
