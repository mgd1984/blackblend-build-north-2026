"""Background-only native window edit. Static operations; inputs are validated JSON.

Writes a candidate .blend/GLB and verification receipt in a new private directory.
The source file and live Blender session are never overwritten.
"""
import bpy
import bmesh
import json
import sys
import runpy
from pathlib import Path
from mathutils import Vector, Matrix


def volume(obj):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    value = abs(mesh.calc_volume()) * abs(obj.matrix_world.to_3x3().determinant())
    mesh.free()
    return value


def run(payload):
    scene = bpy.context.scene
    scene.frame_set(scene.frame_start)
    source = payload['scene']
    edit = payload['edit']
    output = Path(payload['directory'])
    roots = {}
    for part in source['parts']:
        if part['shape'] != 'native':
            continue
        matches = [o for o in scene.objects if o.name.replace(' • ', ' · ') == part['name']]
        if len(matches) != 1:
            raise RuntimeError('Source assembly names changed; re-export before native editing.')
        root = matches[0]
        root['blackblend_part_id'] = part['id']
        roots[part['id']] = root
    root = roots[edit['partId']]
    wall = next(p for p in source['parts'] if p['id'] == edit['partId'])
    if not wall['name'].startswith('Original shed · wall '):
        raise RuntimeError('A shed wall is required.')
    width_axis, normal_axis = (0, 1) if 'wall 1 ' in wall['name'] else (1, 0)
    objects = [o for o in root.children_recursive if o.type == 'MESH' and not o.hide_render]
    # Authored wall meshes can have a baked rotation relative to their group.
    # Recover the wall plane from native vertical faces, preferring glazing.
    root_inverse = root.matrix_world.inverted()
    preferred = [o for o in objects if any(t in o.name.lower() for t in ('glazing', 'glass'))]
    best_area, normal = 0, None
    for obj in preferred or objects:
        transform = root_inverse @ obj.matrix_world
        for face in obj.data.polygons:
            points = [transform @ obj.data.vertices[i].co for i in face.vertices]
            cross = (points[1]-points[0]).cross(points[2]-points[0])
            if cross.length < 1e-9:
                continue
            direction = cross.normalized()
            if abs(direction.z) > .1 or abs(direction[normal_axis]) < .8:
                continue
            area = sum((points[i]-points[0]).cross(points[i+1]-points[0]).length / 2 for i in range(1, len(points)-1))
            if area > best_area:
                best_area, normal = area, direction
    if normal is None:
        raise RuntimeError('Cannot determine the native wall plane. No opening was made.')
    if normal[normal_axis] < 0:
        normal.negate()
    normal.z = 0
    normal.normalize()
    up = Vector((0, 0, 1))
    axes = (normal.cross(up), normal, up) if width_axis == 0 else (normal, up.cross(normal), up)
    basis = Matrix(axes).transposed().to_4x4()
    frame = root.matrix_world @ basis
    inverse = frame.inverted()
    points = [inverse @ o.matrix_world @ Vector(v) for o in objects for v in (vertex.co for vertex in o.data.vertices)]
    low = Vector([min(p[i] for p in points) for i in range(3)])
    high = Vector([max(p[i] for p in points) for i in range(3)])
    center = (low + high) / 2
    center[width_axis] += edit['offset']
    center.z = low.z + edit['sill'] + edit['height'] / 2
    width, height = edit['width'], edit['height']
    if center[width_axis] - width / 2 < low[width_axis] + .15 or center[width_axis] + width / 2 > high[width_axis] - .15 or center.z + height / 2 > min(high.z - .15, low.z + 2.65):
        raise RuntimeError('The opening would cross a wall edge or plate. Choose a smaller window.')
    # Preserve existing glazing/trim. A clear ray after cutting is not enough:
    # the requested rectangle must not overlap another authored window first.
    for obj in objects:
        name = obj.name.lower()
        if not any(token in name for token in ('glazing', 'glass', 'blackblend window trim')):
            continue
        bounds = [inverse @ obj.matrix_world @ Vector(v) for v in (vertex.co for vertex in obj.data.vertices)]
        existing_low = [min(p[i] for p in bounds) for i in range(3)]
        existing_high = [max(p[i] for p in bounds) for i in range(3)]
        if (center[width_axis] + width / 2 + .1 > existing_low[width_axis]
                and center[width_axis] - width / 2 - .1 < existing_high[width_axis]
                and center.z + height / 2 + .1 > existing_low[2]
                and center.z - height / 2 - .1 < existing_high[2]):
            raise RuntimeError('The new opening overlaps an existing window. Choose a clear wall position.')
    dimensions = Vector((1, 1, height))
    dimensions[width_axis] = width
    dimensions[normal_axis] = high[normal_axis] - low[normal_axis] + .4
    bpy.ops.mesh.primitive_cube_add(size=1)
    cutter = bpy.context.object
    cutter.name = 'Blackblend temporary window cutter'
    cutter.matrix_world = frame.copy()
    cutter.matrix_world.translation = frame @ center
    cutter.scale *= dimensions
    bpy.context.view_layer.update()
    before = sum(volume(o) for o in objects)
    cut_low, cut_high = center - dimensions / 2, center + dimensions / 2
    affected = 0
    for obj in objects:
        bounds = [inverse @ obj.matrix_world @ Vector(v) for v in (vertex.co for vertex in obj.data.vertices)]
        if any(max(p[i] for p in bounds) < cut_low[i] or min(p[i] for p in bounds) > cut_high[i] for i in range(3)):
            continue
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new('Blackblend window opening', 'BOOLEAN')
        modifier.operation = 'DIFFERENCE'
        modifier.solver = 'EXACT'
        modifier.object = cutter
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        affected += 1
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.context.view_layer.update()
    after = sum(volume(o) for o in objects)
    # Test nine rays through the interior, restricted to the edited wall.
    clear = True
    for u in [-.3, 0, .3]:
        for v in [-.3, 0, .3]:
            origin = center.copy()
            origin[width_axis] += u * width
            origin.z += v * height
            origin[normal_axis] = low[normal_axis] - 1
            end = origin.copy()
            end[normal_axis] = high[normal_axis] + 1
            origin_world, end_world = frame @ origin, frame @ end
            for obj in objects:
                inv = obj.matrix_world.inverted()
                a, b = inv @ origin_world, inv @ end_world
                evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
                hit = evaluated.ray_cast(a, (b-a).normalized(), distance=(b-a).length)[0]
                if hit:
                    clear = False
    if not clear or before - after < 1e-7:
        raise RuntimeError('The cut did not produce a clear, newly opened window. Select another wall or position.')
    material = bpy.data.materials.new('Blackblend window trim')
    material.diffuse_color = (.85, .88, .86, 1)
    for side in [-1, 1]:
        for vertical in [False, True]:
            pos = center.copy()
            scale = Vector((1, 1, 1))
            scale[normal_axis] = .05
            if vertical:
                pos[width_axis] += side * (width / 2 + .025)
                scale[width_axis], scale.z = .05, height + .1
            else:
                pos.z += side * (height / 2 + .025)
                scale[width_axis], scale.z = width, .05
            # Seat each trim member on the actual exterior surface, rather
            # than on a group bounding box that may include deep framing.
            ray_start, ray_end = pos.copy(), pos.copy()
            ray_start[normal_axis], ray_end[normal_axis] = high[normal_axis] + 1, low[normal_axis] - 1
            surface_hits = []
            for obj in objects:
                inv = obj.matrix_world.inverted()
                a, b = inv @ (frame @ ray_start), inv @ (frame @ ray_end)
                evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
                hit, point, _, _ = evaluated.ray_cast(a, (b-a).normalized(), distance=(b-a).length)
                if hit:
                    surface_hits.append((inverse @ obj.matrix_world @ point)[normal_axis])
            if not surface_hits:
                raise RuntimeError('Cannot seat window trim on the native wall surface.')
            pos[normal_axis] = max(surface_hits) + .025
            bpy.ops.mesh.primitive_cube_add(size=1)
            trim = bpy.context.object
            trim.name = 'Blackblend window trim'
            trim.parent = root
            trim.matrix_parent_inverse.identity()
            trim.matrix_basis = basis @ Matrix.Translation(pos) @ Matrix.Diagonal((*scale, 1))
            trim.data.materials.append(material)
    # Export only the assembled source; original native IDs and authored motion stay intact.
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'scene.blend'), compress=False)
    bpy.ops.export_scene.gltf(filepath=str(output / 'woodshed.glb'), export_format='GLB', export_animations=False, export_cameras=False, export_lights=False, export_extras=True, use_visible=True)
    helper = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/export-studio-scene.py'))
    helper['flatten_material_colors'](output / 'woodshed.glb')
    report = dict(blenderVersion=bpy.app.version_string, removedVolume=before-after, openingClear=clear, affectedMeshes=affected, rayChecks=9, existingWindowsPreserved=True, trimSurfaceChecks=4, wallPlaneNormal=list(normal), partId=edit['partId'])
    (output / 'report.json').write_text(json.dumps(report))


if __name__ == '__main__':
    payload = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text())
    try:
        run(payload)
    except Exception as error:
        (Path(payload['directory']) / 'report.json').write_text(json.dumps({'error': str(error)}))
        raise
