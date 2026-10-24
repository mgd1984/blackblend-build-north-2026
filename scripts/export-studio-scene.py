"""Run in Blender. Export the open assembly privately for the Studio viewer.

The live file is never saved over. Preserve a snapshot before calling this script.
No photographs, native scenes or personal source manifests belong in Git.
"""
import bpy
import json
import math
import struct
from pathlib import Path
from mathutils import Vector


def flatten_material_colors(file):
    data = Path(file).read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length])
    for material in document.get('materials', []):
        native = bpy.data.materials.get(material.get('name', ''))
        if native:
            material.setdefault('pbrMetallicRoughness', {})['baseColorFactor'] = list(native.diffuse_color)
    payload = json.dumps(document, separators=(',', ':')).encode()
    payload += b' ' * ((-len(payload)) % 4)
    tail = data[20 + length:]
    header = struct.pack('<4sII', b'glTF', 2, 20 + len(payload) + len(tail))
    Path(file).write_bytes(header + struct.pack('<II', len(payload), 0x4e4f534a) + payload + tail)


def export_scene(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    frame = scene.frame_current
    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    prior = {}
    try:
        scene.frame_set(scene.frame_start)
        groups = {}
        for obj in scene.objects:
            if obj.type != 'MESH' or obj.hide_render or not obj.visible_get():
                continue
            current = obj.parent
            root = obj
            while current:
                if current.type == 'EMPTY' and ('Original shed' in current.name or 'Woodshed' in current.name):
                    root = current
                    break
                current = current.parent
            groups.setdefault(root, []).append(obj)
        # Never control a parent and its descendant as independent parts.
        for root in list(groups):
            parent = root.parent
            while parent:
                if parent in groups:
                    groups[parent].extend(groups.pop(root))
                    break
                parent = parent.parent
        parts = []
        all_points = []
        for index, (root, meshes) in enumerate(groups.items()):
            part_id = 'native-' + str(index)
            prior[root] = root.get('blackblend_part_id')
            root['blackblend_part_id'] = part_id
            points = [o.matrix_world @ Vector(corner) for o in meshes for corner in o.bound_box]
            all_points.extend(points)
            low = Vector([min(p[i] for p in points) for i in range(3)])
            high = Vector([max(p[i] for p in points) for i in range(3)])
            center = (low + high) / 2
            name = root.name
            roof = any(word in name.lower() for word in ['roof', 'shingle', 'ridge', 'rafter'])
            floor = any(word in name.lower() for word in ['floor', 'foundation'])
            offset = [0, .7 + index * .035, 0] if roof else [0, -.25, 0] if floor else [center.x * .4, 0, -center.y * .4]
            parts.append(dict(id=part_id, name=name.replace(' • ', ' · '), group='Roof' if roof else 'Floor' if floor else 'Existing shed' if 'Original' in name else 'Woodshed', shape='native', node=part_id, size=[max(.001,high.x-low.x), max(.001,high.z-low.z), max(.001,high.y-low.y)], position=[0,0,0], rotation=[0,0,0], explode=offset, color='#8a9a83', visible=True))
        if not all_points:
            raise RuntimeError('No visible assembly geometry.')
        low = Vector([min(p[i] for p in all_points) for i in range(3)])
        high = Vector([max(p[i] for p in all_points) for i in range(3)])
        center = (low + high) / 2
        kwargs = dict(filepath=str(directory / 'woodshed.glb'), export_format='GLB', export_animations=False, export_cameras=False, export_lights=False, export_extras=True, use_visible=True)
        properties = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
        if 'export_current_frame' in properties:
            kwargs['export_current_frame'] = True
        bpy.ops.export_scene.gltf(**kwargs)
        flatten_material_colors(directory / 'woodshed.glb')
        roof_parts = [p for p in parts if p['group'] == 'Roof']
        for rank, part in enumerate(roof_parts):
            part['explode'] = [0, 1 + rank * .3, 0]
        for part in parts:
            if part['group'] == 'Floor':
                part['explode'] = [0, 0, 0] if 'foundation' in part['name'].lower() else [0, .15, .2]
        document = dict(version=1,revision=0,title='Woodshed · assembly study',fidelity='source-derived',asset='woodshed',parts=parts,camera=dict(yaw=79.5,elevation=20,radius=max(high-low)*3.1,target=[center.x,center.z,-center.y],orbit=0),animation=dict(duration=10,spread=1),background='studio',assumptions=['Authored Blender geometry; dimensions and construction details have not been independently verified.', 'Browser materials use the source viewport colours; procedural Blender shaders are simplified.'])
        (directory / 'woodshed.json').write_text(json.dumps(document,ensure_ascii=False))
        (directory / 'provenance.private.json').write_text(json.dumps(dict(source=bpy.data.filepath,frame=scene.frame_start,parts=len(parts))))
        print('Exported', len(parts), 'assembly groups;', (directory/'woodshed.glb').stat().st_size, 'bytes. Restoring live frame.')
    finally:
        for root, value in prior.items():
            if value is None:
                del root['blackblend_part_id']
            else:
                root['blackblend_part_id'] = value
        scene.frame_set(frame)
        for obj in scene.objects:
            obj.select_set(obj in selected)
        bpy.context.view_layer.objects.active = active


if __name__ == '__main__':
    export_scene(Path(__file__).resolve().parents[1] / 'runs' / 'scene-assets')
