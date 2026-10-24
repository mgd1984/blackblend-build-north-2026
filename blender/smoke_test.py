"""Run inside Blender after enabling blackblend. Never submits a cloud request."""
import base64
import io
import json
from pathlib import Path
import queue
import tempfile
import bpy
import blackblend as addon

settings = bpy.context.scene.blackblend
property_names = ('input_mode', 'image_path', 'prompt', 'animation_path', 'appearance_path', 'resolution', 'generated_refs')
saved_settings = {name: getattr(settings, name) for name in property_names}
saved_references = [r.path for r in settings.references]
fixtures = tempfile.TemporaryDirectory(prefix='blackblend-smoke-')
fixture_image = Path(fixtures.name) / 'reference.png'
fixture_image.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9mQAAAAASUVORK5CYII='))
fixture_video = Path(fixtures.name) / 'animation.mp4'
fixture_video.write_bytes(b'\x00\x00\x00\x18ftypisom' + bytes(100))
saved_state = dict(addon._STATE)
saved_start = addon.start_worker
saved_json = addon.local_json
saved_request = addon.local_request
saved_events = addon._EVENTS
try:
    captured = []
    addon.start_worker = lambda action, payload: captured.append((action, payload))
    settings.input_mode = 'FILE'
    settings.image_path = str(fixture_image)
    settings.prompt = 'Test only; no network.'
    addon._STATE['busy'] = False
    assert bpy.ops.blackblend.generate('EXEC_DEFAULT') == {'FINISHED'}
    assert captured[0][0] == 'submit'
    payload = captured[0][1]
    assert payload['prompt'] == settings.prompt
    assert base64.b64decode(payload['image'].split(',', 1)[1]) == Path(settings.image_path).read_bytes()
    assert 'key' not in payload
    # Regression: a valid Render Result can have size (0, 0), and must
    # be exported with its owning scene rather than an empty temporary scene.
    render = bpy.data.images.get('Render Result')
    if render is not None and render.has_data:
        settings.input_mode = 'RENDER'
        before = {name: getattr(bpy.context.scene.render.image_settings, name) for name in
                  ('file_format', 'color_mode', 'color_depth', 'compression', 'quality')}
        assert bpy.ops.blackblend.generate('EXEC_DEFAULT') == {'FINISHED'}
        render_bytes = base64.b64decode(captured[-1][1]['image'].split(',', 1)[1])
        assert render_bytes.startswith(b'\x89PNG\r\n\x1a\n')
        assert before == {name: getattr(bpy.context.scene.render.image_settings, name) for name in before}
        print('PASS: current render capture and output settings restoration.')
    addon._EVENTS = queue.Queue()
    calls = []
    def fake_json(route, payload=None, token=None):
        calls.append((route, payload))
        if route == '/api/config':
            return {'token': 'local-test-token'}
        if payload is not None:
            return {'id': 'run-test', 'status': 'queued'}
        return [{'id': 'run-test', 'status': 'completed', 'video': '/media/run-test', 'processingSeconds': 8, 'totalSeconds': 12}]
    addon.local_json = fake_json
    addon.local_request = lambda route: io.BytesIO(b'\x00\x00\x00\x18ftypisom' + bytes(100))
    addon.worker('submit', payload, addon._GENERATION)
    assert len([call for call in calls if call[1] is not None]) == 1
    events = []
    while not addon._EVENTS.empty():
        events.append(addon._EVENTS.get_nowait())
    assert events[-1]['status'] == 'Completed'
    assert events[-1]['processing'] == 8
    Path(events[-1]['path']).unlink()
    Path(events[-1]['path']).parent.rmdir()
    # Animation capture and worker upload preparation, with all HTTP mocked.
    settings.input_mode = 'ANIMATION'
    settings.animation_path = str(fixture_video)
    settings.appearance_path = str(fixture_image)
    settings.references.clear()
    settings.references.add().path = str(fixture_image)
    assert bpy.ops.blackblend.generate('EXEC_DEFAULT') == {'FINISHED'}
    action, animation_payload = captured[-1]
    assert action == 'submit_animation'
    calls.clear()
    addon.worker(action, animation_payload, addon._GENERATION)
    submitted = next(p for route, p in calls if route == '/api/fal/jobs')
    assert submitted['animation'].startswith('data:video/mp4;base64,')
    assert '_animation_file' not in submitted
    assert len(submitted['images']) == 2
    assert '_reference_files' not in submitted
    assert base64.b64decode(submitted['animation'].split(',', 1)[1]) == Path(settings.animation_path).read_bytes()
    while not addon._EVENTS.empty():
        event = addon._EVENTS.get_nowait()
        if event.get('path'):
            Path(event['path']).unlink()
            Path(event['path']).parent.rmdir()
    print('PASS: animation-file capture and fal route dispatch without network.')
    # Local connection ambiguity must never cause a second submission attempt.
    count = []
    def broken_json(route, payload=None, token=None):
        if route == '/api/config':
            return {'token': 'local-test-token'}
        count.append(route)
        raise OSError('Simulated lost response')
    addon.local_json = broken_json
    addon.worker('submit', payload, addon._GENERATION)
    assert count == ['/api/jobs']
    assert addon._EVENTS.get_nowait()['status'] == 'Check local UI'
    print('PASS: image capture, single submission, completion/download, timing, no retries after ambiguity.')
finally:
    addon.start_worker = saved_start
    addon.local_json = saved_json
    addon.local_request = saved_request
    addon._EVENTS = saved_events
    addon._STATE.clear()
    addon._STATE.update(saved_state)
    for name, value in saved_settings.items():
        setattr(settings, name, value)

    settings.references.clear()
    for path in saved_references:
        settings.references.add().path = path
    fixtures.cleanup()
