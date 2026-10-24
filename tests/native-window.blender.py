"""Run with Blender --background --factory-startup --python this_file."""
import bpy, json, math, tempfile, runpy
from pathlib import Path
from mathutils import Matrix, Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
root=bpy.data.objects.new('Original shed • wall 1 -1.001',None)
bpy.context.collection.objects.link(root)
rotation=Matrix.Rotation(math.radians(-12),4,'Z')
def cube(name,location,size):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj=bpy.context.object;obj.name=name
    obj.data.transform(rotation @ Matrix.Translation(location) @ Matrix.Diagonal((*size,1)))
    obj.parent=root
    return obj
wall=cube('Native wall cladding',(0,0,1.4),(3,.15,2.8))
glass=cube('Existing glazing pane',(0,-.09,1.65),(.3,.02,.7))
source={'parts':[{'shape':'native','name':'Original shed · wall 1 -1.001','id':'native-3'}]}
edit={'partId':'native-3','width':.8,'height':.7,'sill':1,'offset':0}
module=runpy.run_path(str(Path(__file__).resolve().parents[1]/'blender/window_edit.py'))
original_vertices=[tuple(v.co) for v in wall.data.vertices]
glazing_vertices=[tuple(v.co) for v in glass.data.vertices]
with tempfile.TemporaryDirectory(prefix='blackblend-window-regression-') as output:
    try:
        module['run']({'scene':source,'edit':edit,'directory':output})
        raise AssertionError('Overlapping window was accepted')
    except RuntimeError as error:
        assert 'overlaps an existing window' in str(error),str(error)
    assert [tuple(v.co) for v in wall.data.vertices]==original_vertices
    module['run']({'scene':source,'edit':{**edit,'offset':.85},'directory':output})
    report=json.loads((Path(output)/'report.json').read_text())
    assert report['openingClear'] and report['existingWindowsPreserved']
    assert report['rayChecks']==9 and report['trimSurfaceChecks']==4
    assert report['removedVolume']>.07
    assert Vector(report['wallPlaneNormal']).dot(rotation.to_3x3()@Vector((0,1,0)))>.999
    assert [tuple(v.co) for v in glass.data.vertices]==glazing_vertices
    assert root['blackblend_part_id']=='native-3'
    assert len([o for o in root.children if o.name.startswith('Blackblend window trim')])==4
    assert (Path(output)/'scene.blend').stat().st_size>1000
    assert (Path(output)/'woodshed.glb').read_bytes()[:4]==b'glTF'
print('PASS native-window rotated wall, collision rejection, clear cut, seated trim, preserved glazing and native ID')
