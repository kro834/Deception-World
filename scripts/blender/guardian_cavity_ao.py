"""Optional offline cavity bake for the rebuilt guardian's actual geometry.

Call bake_guardian_cavity(root) after final geometry/normals and before glTF
export. It ray-tests the sculpture in world space, writes a compact vertex
color layer, and leaves roughness/normal/ORM maps and authored base colors alone.
Wire the returned attribute with wire_guardian_cavity(material) for the Blender
preview; glTF export should include the active vertex-color attribute. Validate
the exported COLOR_0 and preview before adopting. Never run on the public asset
in place while anatomy is still being reviewed.
"""
import math
import time
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ATTRIBUTE = "GuardianCavityAO"


def physical_material(material):
    return material is None or not any(
        token in material.name.lower()
        for token in ('rune', 'emission', 'glow', 'flame', 'wisp', 'ember'))


def physical_meshes(root):
    result = []
    for obj in [root, *root.children_recursive]:
        if obj.type != 'MESH':
            continue
        used = {face.material_index for face in obj.data.polygons}
        if used and not any(physical_material(obj.data.materials[index]
                       if index < len(obj.data.materials) else None) for index in used):
            continue
        result.append(obj)
    return result


def bake_guardian_cavity(root, radius=0.8, samples=8, strength=0.68):
    """Rest-pose ambient visibility, not baked direct lighting or a flat decal."""
    if radius <= 0 or samples < 1 or not 0 <= strength <= 1:
        raise ValueError('Invalid cavity bake settings')
    started = time.monotonic()
    bpy.context.view_layer.update()
    meshes = physical_meshes(root)
    vertices, polygons = [], []
    for obj in meshes:
        base = len(vertices)
        matrix = obj.matrix_world
        vertices.extend(matrix @ vertex.co for vertex in obj.data.vertices)
        polygons.extend(tuple(base + index for index in face.vertices)
                        for face in obj.data.polygons
                        if physical_material(obj.data.materials[face.material_index]
                           if face.material_index < len(obj.data.materials) else None))
    if not polygons:
        raise ValueError('No physical sculpture geometry')
    tree = BVHTree.FromPolygons(vertices, polygons, all_triangles=False, epsilon=0)
    directions = []
    for index in range(samples):
        # Cosine-weighted deterministic hemisphere; each vertex rotates it.
        u = (index + 0.5) / samples
        azimuth = index * 2.399963229728653
        r = math.sqrt(u)
        directions.append((r * math.cos(azimuth), r * math.sin(azimuth), math.sqrt(1-u)))
    stats = {'meshes': len(meshes), 'vertices': 0, 'rays': 0,
             'minimum': 1.0, 'maximum': 0.0, 'radius': radius, 'samples': samples}
    axis_z, axis_y = Vector((0, 0, 1)), Vector((0, 1, 0))
    for obj in meshes:
        mesh, matrix = obj.data, obj.matrix_world
        normal_matrix = matrix.to_3x3().inverted().transposed()
        layer = mesh.color_attributes.get(ATTRIBUTE)
        if layer and (layer.domain != 'POINT' or layer.data_type != 'BYTE_COLOR'):
            mesh.color_attributes.remove(layer)
            layer = None
        if not layer:
            layer = mesh.color_attributes.new(name=ATTRIBUTE, type='BYTE_COLOR', domain='POINT')
        colors = []
        for vertex in mesh.vertices:
            normal = (normal_matrix @ vertex.normal).normalized()
            if normal.length_squared < 0.5:
                value = 1.0
            else:
                tangent = normal.cross(axis_z if abs(normal.z) < 0.9 else axis_y).normalized()
                bitangent = normal.cross(tangent).normalized()
                phase = vertex.index * 2.399963229728653
                cs, sn = math.cos(phase), math.sin(phase)
                origin = matrix @ vertex.co + normal * max(0.0001, radius * 0.001)
                occlusion = 0.0
                for x, y, z in directions:
                    direction = tangent * (x*cs-y*sn) + bitangent * (x*sn+y*cs) + normal*z
                    _, _, _, distance = tree.ray_cast(origin, direction, radius)
                    if distance is not None:
                        occlusion += 1.0 - min(1.0, distance / radius) ** 0.5
                value = max(1-strength, min(1.0, 1-strength*occlusion/samples))
            colors.extend((value, value, value, 1.0))
            stats['minimum'] = min(stats['minimum'], value)
            stats['maximum'] = max(stats['maximum'], value)
        layer.data.foreach_set('color', colors)
        color_index = list(mesh.color_attributes).index(layer)
        mesh.color_attributes.active_color_index = color_index
        mesh.color_attributes.render_color_index = color_index
        mesh.update()
        stats['vertices'] += len(mesh.vertices)
    stats['rays'] = stats['vertices'] * samples
    stats['seconds'] = round(time.monotonic()-started, 3)
    return stats


def wire_guardian_cavity(material):
    """Preview the same AO in Blender without replacing other PBR inputs.

    This is opt-in: callers must inspect glTF's vertex-color export to avoid
    multiplying the AO twice through an additional baked color texture.
    """
    if not material.use_nodes:
        raise ValueError('Expected a node-based physical material')
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = next((node for node in nodes if node.type == 'BSDF_PRINCIPLED'), None)
    if shader is None:
        raise ValueError('Expected a Principled BSDF')
    if nodes.get('Guardian cavity multiply'):
        return
    attribute = nodes.new('ShaderNodeVertexColor')
    attribute.layer_name = ATTRIBUTE
    attribute.name = 'Guardian cavity visibility'
    multiply = nodes.new('ShaderNodeMixRGB')
    multiply.name = 'Guardian cavity multiply'
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = 1
    base = shader.inputs['Base Color']
    if base.is_linked:
        source = base.links[0].from_socket
        links.remove(base.links[0])
        links.new(source, multiply.inputs[1])
    else:
        multiply.inputs[1].default_value = base.default_value
    links.new(attribute.outputs['Color'], multiply.inputs[2])
    links.new(multiply.outputs['Color'], base)
