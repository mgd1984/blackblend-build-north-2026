"""Fixed local render operations for the agent-mediated Sites workflow.
No network, provider calls or arbitrary code from the Site is evaluated.
"""
import bpy
import json
from pathlib import Path

_ACTIVE = None

def prepare(directory):
    target = Path(directory).resolve()
    target.mkdir(parents=True, exist_ok=False)
    scene = bpy.context.scene
    if not scene.camera:
        raise RuntimeError('Choose an active camera before preparing a render.')
    fps = scene.render.fps / scene.render.fps_base
    if (scene.frame_end - scene.frame_start + 1) / fps > 15:
        raise RuntimeError('Prepare a clip no longer than 15 seconds for this provider workflow.')
    # A copy preserves unsaved work and does not replace the user’s working file.
    bpy.ops.wm.save_as_mainfile(filepath=str(target / 'source.blend'), copy=True)
    manifest = {'scene': scene.name, 'camera': scene.camera.name,
                'frameStart': scene.frame_start, 'frameEnd': scene.frame_end,
                'fps': fps, 'width': round(scene.render.resolution_x * scene.render.resolution_percentage / 100),
                'height': round(scene.render.resolution_y * scene.render.resolution_percentage / 100)}
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    return manifest

def render(directory, animation=False):
    global _ACTIVE
    if _ACTIVE or bpy.app.is_job_running('RENDER'):
        raise RuntimeError('A render is already in progress.')
    target = Path(directory).resolve()
    if not (target / 'source.blend').is_file():
        raise RuntimeError('Prepare a saved scene snapshot first.')
    scene = bpy.context.scene
    formats = [item.identifier for item in scene.render.image_settings.bl_rna.properties['file_format'].enum_items]
    if 'PNG' not in formats:
        raise RuntimeError('PNG output is unavailable.')
    original = (scene.render.filepath, scene.render.image_settings.file_format, scene.frame_current)
    _ACTIVE = str(target)
    def restore(*_):
        global _ACTIVE
        scene.render.filepath, scene.render.image_settings.file_format = original[:2]
        scene.frame_set(original[2])
        for handlers in (bpy.app.handlers.render_complete, bpy.app.handlers.render_cancel):
            if restore in handlers:
                handlers.remove(restore)
        _ACTIVE = None
    bpy.app.handlers.render_complete.append(restore)
    bpy.app.handlers.render_cancel.append(restore)
    scene.render.image_settings.file_format = 'PNG'
    if animation:
        (target / 'frames').mkdir(exist_ok=True)
        scene.render.filepath = str(target / 'frames' / 'frame_')
    else:
        scene.frame_set(scene.frame_start)
        scene.render.filepath = str(target / 'proof.png')
    try:
        bpy.ops.render.render('INVOKE_DEFAULT', animation=animation, write_still=not animation)
    except Exception:
        restore()
        raise
    return {'rendering': True, 'kind': 'animation' if animation else 'proof'}
