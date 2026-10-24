bl_info = {
    'name': 'Blackblend',
    'author': 'Blackblend',
    'version': (0, 3, 0),
    'blender': (4, 2, 0),
    'location': '3D View > Sidebar > Blackblend',
    'description': 'Blender rendering and approved video jobs for Blackblend Studio',
    'category': 'Render',
}

import base64
import json
import mimetypes
import os
from pathlib import Path
import queue
import re
import tempfile
import threading
import time
import urllib.request
import uuid
import webbrowser
import bpy
from bpy.props import EnumProperty, StringProperty, IntProperty, CollectionProperty

BASE = 'http://127.0.0.1:4317'
_EVENTS = queue.Queue()
_STATE = {'busy': False, 'status': 'Ready', 'error': '', 'job_id': '', 'path': '', 'processing': None, 'total': None, 'started': None}
_GENERATION = object()


def local_request(route, payload=None, token=None):
    if not route.startswith('/') or route.startswith('//'):
        raise ValueError('Invalid local route.')
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['X-Local-Token'] = token
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(BASE + route, data=data, headers=headers)
    # Ignore proxy environment settings: the bridge is always loopback-only.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise RuntimeError('Local server redirect refused.')
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(req, timeout=60)


def local_json(route, payload=None, token=None):
    with local_request(route, payload, token) as response:
        return json.load(response)


def worker(action, payload, generation):
    def event(**values):
        if generation is _GENERATION:
            _EVENTS.put(values)
    try:
        config = local_json('/api/config')
        if action == 'check':
            jobs = local_json('/api/jobs')
            event(busy=False, status='Connected to local server', jobs=jobs)
            return
        if action in ('submit', 'submit_animation'):
            route = '/api/jobs'
            if action == 'submit_animation':
                payload = dict(payload)
                filename = Path(payload.pop('_animation_file'))
                mime = {'.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm'}[filename.suffix.lower()]
                data = filename.read_bytes()
                if not data or len(data) > 50_000_000:
                    raise ValueError('Animation must be under 50 MB.')
                payload['animation'] = 'data:' + mime + ';base64,' + base64.b64encode(data).decode()
                references = payload.pop('_reference_files', [])
                payload['images'] = []
                for reference in references:
                    mime = mimetypes.guess_type(reference)[0]
                    data = Path(reference).read_bytes()
                    if mime not in ('image/png', 'image/jpeg', 'image/webp') or len(data) > 7_400_000:
                        raise ValueError('Invalid reference image.')
                    payload['images'].append('data:' + mime + ';base64,' + base64.b64encode(data).decode())
                route = '/api/fal/jobs'
                event(status='Sending animation to local bridge')
            # Exactly one POST. Never retry an ambiguous submission.
            job = local_json(route, payload, config['token'])
        else:
            ident = payload['id']
            if not re.fullmatch(r'run-[A-Za-z0-9_-]+', ident):
                raise ValueError('Invalid job ID.')
            job = local_json('/api/jobs/' + ident + '/resume', {}, config['token'])
        ident = job['id']
        if not re.fullmatch(r'run-[A-Za-z0-9_-]+', ident):
            raise ValueError('Invalid job ID.')
        event(job_id=ident, status=job['status'])
        deadline = time.monotonic() + 1860
        while True:
            jobs = local_json('/api/jobs')
            job = next((j for j in jobs if j['id'] == ident), None)
            if not job:
                raise RuntimeError('Job no longer listed. Check the local UI.')
            event(status=job['status'], processing=job.get('processingSeconds'), total=job.get('totalSeconds'))
            if job['status'] == 'completed' and job.get('video'):
                route = '/media/' + ident
                # Only download from the fixed local bridge, never a provider URL.
                directory = Path(tempfile.mkdtemp(prefix='blackblend-video-'))
                destination = directory / (ident + '.mp4')
                with local_request(route) as response, destination.open('xb') as output:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        output.write(chunk)
                event(busy=False, status='Completed', path=str(destination), processing=job.get('processingSeconds'), total=job.get('totalSeconds'), jobs=jobs)
                return
            if job['status'] in ('failed', 'unknown', 'paused', 'cancelled', 'canceled'):
                event(busy=False, status=job['status'], error=job.get('error', 'Check the local UI.'), jobs=jobs)
                return
            if time.monotonic() >= deadline:
                raise RuntimeError('Polling stopped. The remote job may still run; use Resume checking.')
            time.sleep(1.5)
    except Exception:
        event(busy=False, status='Check local UI', error='Connection or request interrupted. Open the local UI before retrying; no automatic submission retry was made.')


def start_worker(action, payload=None):
    _STATE.update(busy=True, error='', status='Connecting', started=time.monotonic())
    threading.Thread(target=worker, args=(action, payload, _GENERATION), daemon=True).start()


def drain_events():
    while True:
        try:
            _STATE.update(_EVENTS.get_nowait())
        except queue.Empty:
            break
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                area.tag_redraw()
    return 0.5


class BLACKBLEND_Reference(bpy.types.PropertyGroup):
    path: StringProperty(subtype='FILE_PATH')

class BLACKBLEND_OT_add_references(bpy.types.Operator):
    bl_idname = 'blackblend.add_references'
    bl_label = 'Add appearance references'
    directory: StringProperty(subtype='DIR_PATH')
    files: CollectionProperty(type=bpy.types.OperatorFileListElement)
    filter_glob: StringProperty(default='*.png;*.jpg;*.jpeg;*.webp', options={'HIDDEN'})
    def invoke(self, context, event):
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}
    def execute(self, context):
        settings=context.scene.blackblend
        paths=[str(Path(self.directory)/f.name) for f in self.files]
        current=([bpy.path.abspath(settings.appearance_path)] if settings.appearance_path else [])+[r.path for r in settings.references]
        paths=[p for p in paths if p not in current]
        if len(current)+len(paths)>6:
            self.report({'ERROR'}, 'Up to 6 appearance references total.');return {'CANCELLED'}
        if any(not Path(p).is_file() or Path(p).stat().st_size>7_400_000 for p in paths):
            self.report({'ERROR'}, 'Choose images under 7.4 MB each.');return {'CANCELLED'}
        for p in paths:settings.references.add().path=p
        return {'FINISHED'}

class BLACKBLEND_OT_remove_reference(bpy.types.Operator):
    bl_idname='blackblend.remove_reference'
    bl_label='Remove reference'
    index: IntProperty()
    def execute(self,context):
        refs=context.scene.blackblend.references
        if 0<=self.index<len(refs):refs.remove(self.index)
        return {'FINISHED'}

class BLACKBLEND_Settings(bpy.types.PropertyGroup):
    prompt: StringProperty(name='Prompt', default='A cinematic product film of this mechanical assembly. Slow camera orbit, realistic materials, soft studio lighting, clean mechanical detail. Preserve the visible layout; no text or extra components.')
    input_mode: EnumProperty(name='Input', items=[('RENDER', 'Current render', 'Use the existing Render Result; render with F12 first'), ('FILE', 'Image file', 'Choose a PNG, JPEG or WebP reference'), ('TEXT', 'Prompt only', 'Generate without a reference image'), ('ANIMATION', 'Animation file / fal', 'Send a rendered animation to fal H3 Max 3D-to-video')], default='RENDER')
    image_path: StringProperty(name='Reference image', subtype='FILE_PATH')
    animation_path: StringProperty(name='Rendered animation', subtype='FILE_PATH')
    references: CollectionProperty(type=BLACKBLEND_Reference)
    appearance_path: StringProperty(name='Appearance image (optional)', subtype='FILE_PATH')
    resolution: EnumProperty(name='Output quality', items=[('480P','480p',''),('768P','768p',''),('1080P','1080p','')], default='768P')
    generated_refs: IntProperty(name='Max generated references', default=2, min=0, max=2, description='Used only when no appearance image is supplied; extra charges may apply')



class BLACKBLEND_OT_scene_output(bpy.types.Operator):
    bl_idname = 'blackblend.scene_output'
    bl_label = 'Use scene animation output'
    def execute(self, context):
        scene = context.scene
        raw = bpy.path.abspath(scene.render.filepath)
        candidates = [raw, raw + scene.render.file_extension,
                      raw + f'{scene.frame_start:04d}-{scene.frame_end:04d}' + scene.render.file_extension]
        matches = [p for p in candidates if Path(p).is_file() and Path(p).suffix.lower() in ('.mp4','.mov','.webm')]
        if not matches:
            self.report({'INFO'}, 'No rendered movie at the scene output path. Choose the animation file manually.')
            return {'CANCELLED'}
        scene.blackblend.animation_path = matches[0]
        return {'FINISHED'}

class BLACKBLEND_OT_connect(bpy.types.Operator):
    bl_idname = 'blackblend.connect'
    bl_label = 'Connect / refresh'
    def execute(self, context):
        if not _STATE['busy']:
            start_worker('check')
        return {'FINISHED'}


class BLACKBLEND_OT_generate(bpy.types.Operator):
    bl_idname = 'blackblend.generate'
    bl_label = 'Generate video'
    bl_description = 'Submit one potentially billable cloud job using the selected image and prompt'

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self, width=440, confirm_text='Generate video')

    def draw(self, context):
        layout = self.layout
        settings = context.scene.blackblend
        if settings.input_mode == 'ANIMATION':
            layout.label(text='Upload animation to fal / H3 Max 3D-to-video')
            layout.label(text=Path(bpy.path.abspath(settings.animation_path)).name)
            layout.label(text='Quality: ' + settings.resolution)
            layout.label(text='The video and any appearance image leave your Mac.')
            if not settings.appearance_path and not settings.references:
                layout.label(text=f'Up to {settings.generated_refs} generated references may add cost.')
        else:
            layout.label(text='Submit this prompt and selected image to Tenstorrent.')
        layout.label(text='One potentially billable generation. No automatic retry.')

    def execute(self, context):
        if _STATE['busy']:
            return {'CANCELLED'}
        settings = context.scene.blackblend
        payload = {'requestId': str(uuid.uuid4()), 'prompt': settings.prompt.strip()}
        if settings.input_mode == 'ANIMATION':
            filename = Path(bpy.path.abspath(settings.animation_path))
            if not filename.is_file() or filename.suffix.lower() not in ('.mp4','.mov','.webm'):
                self.report({'ERROR'}, 'Choose an existing MP4, MOV or WebM animation.'); return {'CANCELLED'}
            if filename.stat().st_size > 50_000_000:
                self.report({'ERROR'}, 'Choose an animation under 50 MB and no longer than 15 seconds.'); return {'CANCELLED'}
            payload.update(_animation_file=str(filename), resolution=settings.resolution, maxGeneratedReferenceImages=settings.generated_refs)
            references=([bpy.path.abspath(settings.appearance_path)] if settings.appearance_path else [])+[bpy.path.abspath(r.path) for r in settings.references]
            if len(references)>6:
                self.report({'ERROR'}, 'Up to 6 appearance references total.');return {'CANCELLED'}
            for reference in references:
                filename=Path(reference)
                if not filename.is_file() or filename.stat().st_size>7_400_000 or mimetypes.guess_type(reference)[0] not in ('image/png','image/jpeg','image/webp'):
                    self.report({'ERROR'}, 'Choose PNG, JPEG or WebP references under 7.4 MB each.');return {'CANCELLED'}
            payload['_reference_files']=references
            _STATE.update(path='', job_id='', processing=None, total=None)
            start_worker('submit_animation', payload)
            return {'FINISHED'}
        if not payload['prompt']:
            self.report({'ERROR'}, 'Enter a prompt.'); return {'CANCELLED'}
        try:
            if settings.input_mode == 'RENDER':
                image = bpy.data.images.get('Render Result')
                # Render Result may report size (0, 0) even with valid render data.
                if image is None or not image.has_data:
                    raise RuntimeError('Render a frame with F12 first, or select an image file.')
                # Render Result is tied to its owning scene: a new export scene
                # has no render buffer. Export with this scene and restore settings.
                with tempfile.TemporaryDirectory(prefix='blackblend-frame-') as temp:
                    filename = os.path.join(temp, 'frame.png')
                    image_settings = context.scene.render.image_settings
                    saved = {name: getattr(image_settings, name) for name in
                             ('file_format', 'color_mode', 'color_depth', 'compression', 'quality')}
                    try:
                        image_settings.file_format = 'PNG'
                        image.save_render(filename, scene=context.scene)
                        data = Path(filename).read_bytes()
                    finally:
                        for name, value in saved.items():
                            setattr(image_settings, name, value)
                mime = 'image/png'
            elif settings.input_mode == 'FILE':
                filename = Path(bpy.path.abspath(settings.image_path))
                mime = mimetypes.guess_type(str(filename))[0]
                if mime not in ('image/png', 'image/jpeg', 'image/webp'):
                    raise RuntimeError('Choose a PNG, JPEG or WebP image.')
                if filename.stat().st_size > 7_400_000:
                    raise RuntimeError('Use a reference under 7.4 MB; save a smaller render if needed.')
                data = filename.read_bytes()
            else:
                data = None
            if data is not None:
                if len(data) > 7_400_000:
                    raise RuntimeError('Render exceeds 7.4 MB. Save a smaller image and use Image file mode.')
                payload['image'] = 'data:' + mime + ';base64,' + base64.b64encode(data).decode()
        except Exception as error:
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}
        _STATE.update(path='', job_id='', processing=None, total=None)
        start_worker('submit', payload)
        return {'FINISHED'}


class BLACKBLEND_OT_resume(bpy.types.Operator):
    bl_idname = 'blackblend.resume'
    bl_label = 'Resume checking'
    def execute(self, context):
        if not _STATE['busy'] and _STATE['job_id']:
            start_worker('resume', {'id': _STATE['job_id']})
        return {'FINISHED'}


class BLACKBLEND_OT_latest(bpy.types.Operator):
    bl_idname = 'blackblend.latest'
    bl_label = 'Load latest completed video'
    def execute(self, context):
        jobs = _STATE.get('jobs', [])
        job = next((j for j in jobs if j.get('video')), None)
        if not job:
            self.report({'INFO'}, 'Click Connect / refresh first. No completed video found.'); return {'CANCELLED'}
        _STATE['job_id'] = job['id']
        start_worker('resume', {'id': job['id']})
        return {'FINISHED'}


class BLACKBLEND_OT_open(bpy.types.Operator):
    bl_idname = 'blackblend.open_video'
    bl_label = 'Open in Movie Clip Editor'
    def execute(self, context):
        filename = _STATE['path']
        if not filename or not Path(filename).is_file():
            self.report({'ERROR'}, 'No downloaded video yet.'); return {'CANCELLED'}
        clip = bpy.data.movieclips.load(filename, check_existing=True)
        context.area.type = 'CLIP_EDITOR'
        context.area.spaces.active.clip = clip
        return {'FINISHED'}


class BLACKBLEND_OT_browser(bpy.types.Operator):
    bl_idname = 'blackblend.browser'
    bl_label = 'Open Blackblend Studio'
    def execute(self, context):
        webbrowser.open(BASE)
        return {'FINISHED'}


class BLACKBLEND_PT_panel(bpy.types.Panel):
    bl_label = 'Blackblend'
    bl_idname = 'BLACKBLEND_PT_panel'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Blackblend'

    def draw(self, context):
        layout = self.layout
        settings = context.scene.blackblend
        layout.label(text='H3 Max / fal' if settings.input_mode == 'ANIMATION' else 'MiniMax H3 / Tenstorrent')
        layout.operator('blackblend.connect', icon='FILE_REFRESH')
        column = layout.column()
        column.enabled = not _STATE['busy']
        column.prop(settings, 'input_mode')
        if settings.input_mode == 'ANIMATION':
            column.prop(settings, 'animation_path')
            column.operator('blackblend.scene_output')
            column.label(text='Up to 15s / 50 MB. Render to MP4 first.')
            column.prop(settings, 'appearance_path')
            for i,reference in enumerate(settings.references):
                row=column.row(align=True);row.label(text=Path(reference.path).name, icon='IMAGE_DATA')
                row.operator('blackblend.remove_reference',text='',icon='X').index=i
            column.operator('blackblend.add_references',icon='ADD')
            column.label(text='Up to 6 references total; 7.4 MB each.')
            column.prop(settings, 'resolution')
            column.prop(settings, 'generated_refs')
            column.label(text='Motion comes from your animation.')
        elif settings.input_mode == 'FILE':
            column.prop(settings, 'image_path')
        elif settings.input_mode == 'RENDER':
            column.label(text='Render a frame with F12 first.', icon='INFO')
        column.prop(settings, 'prompt')
        column.operator('blackblend.generate', icon='PLAY')
        column.label(text='One cloud job; charges may apply.')
        box = layout.box()
        box.label(text=_STATE['status'])
        if _STATE['busy'] and _STATE['started']:
            box.label(text=f"Elapsed: {time.monotonic() - _STATE['started']:.1f}s")
        for name, label in [('processing', 'Provider processing'), ('total', 'Total to playback')]:
            if _STATE[name] is not None:
                box.label(text=f'{label}: {_STATE[name]:.1f}s')
        if _STATE['error']:
            box.label(text='Check local UI for details.', icon='ERROR')
        if _STATE['job_id'] and not _STATE['busy']:
            layout.operator('blackblend.resume')
        if _STATE['path']:
            layout.operator('blackblend.open_video', icon='FILE_MOVIE')
        column = layout.column(); column.enabled = not _STATE['busy']
        column.operator('blackblend.latest', icon='IMPORT')
        layout.operator('blackblend.browser', icon='URL')
        layout.separator()
        layout.label(text='Key stays in macOS Keychain.', icon='LOCKED')
        layout.label(text='Animation mode uploads your clip to fal.')


CLASSES = (BLACKBLEND_Reference, BLACKBLEND_Settings, BLACKBLEND_OT_add_references, BLACKBLEND_OT_remove_reference, BLACKBLEND_OT_scene_output, BLACKBLEND_OT_connect, BLACKBLEND_OT_generate, BLACKBLEND_OT_resume, BLACKBLEND_OT_latest, BLACKBLEND_OT_open, BLACKBLEND_OT_browser, BLACKBLEND_PT_panel)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.blackblend = bpy.props.PointerProperty(type=BLACKBLEND_Settings)
    bpy.app.timers.register(drain_events, persistent=True)


def unregister():
    global _GENERATION
    _GENERATION = object()
    if bpy.app.timers.is_registered(drain_events):
        bpy.app.timers.unregister(drain_events)
    if hasattr(bpy.types.Scene, 'blackblend'):
        del bpy.types.Scene.blackblend
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
