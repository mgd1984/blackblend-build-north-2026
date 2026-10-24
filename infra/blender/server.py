"""One fixed native operation. No API keys, URLs, generated code or shell input."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hashlib
import json
import math
import os
import struct
import subprocess
import tempfile
import threading

LIMIT = 26_000_000
lock = threading.Lock()


def decode(body):
    if len(body) < 5 or len(body) > LIMIT:
        raise ValueError('Invalid input size.')
    size = struct.unpack('>I', body[:4])[0]
    if not 1 <= size <= 250_000 or size + 4 >= len(body):
        raise ValueError('Invalid input header.')
    data = json.loads(body[4:4+size])
    if set(data) != {'scene', 'edit'}:
        raise ValueError('Invalid operation.')
    edit = data['edit']
    bounds = {'width': (.2, 1.8), 'height': (.2, 1.6), 'sill': (.2, 1.9), 'offset': (-1, 1)}
    if set(edit) != {*bounds, 'partId'}:
        raise ValueError('Invalid window fields.')
    for key, (low, high) in bounds.items():
        if type(edit[key]) not in (float, int) or not math.isfinite(edit[key]) or not low <= edit[key] <= high:
            raise ValueError('Invalid window dimensions.')
    scene = data['scene']
    if scene.get('asset') != 'woodshed' or len(scene.get('parts', [])) > 80:
        raise ValueError('Authored woodshed required.')
    part = next((p for p in scene['parts'] if p['id'] == edit['partId']), None)
    if not part or part.get('shape') != 'native' or not part.get('name', '').startswith('Original shed · wall '):
        raise ValueError('Authored wall required.')
    blend = body[4+size:]
    if not (blend.startswith(b'BLENDER') or blend.startswith(bytes.fromhex('28b52ffd'))):
        raise ValueError('Native Blender input required.')
    return data, blend


def execute(body):
    data, blend = decode(body)
    with tempfile.TemporaryDirectory(prefix='blackblend-native-') as temporary:
        output = Path(temporary)
        source, request = output/'input.blend', output/'input.json'
        source.write_bytes(blend)
        request.write_text(json.dumps({**data, 'directory': temporary}))
        with (output/'process.log').open('wb') as log:
            subprocess.run([os.environ.get('BLENDER_PATH', '/opt/blender/blender'), '--background', '--disable-autoexec', str(source), '--python', str(Path(__file__).parent/'blender/window_edit.py'), '--', str(request)], stdout=log, stderr=subprocess.STDOUT, timeout=120, check=False)
        receipt = output/'report.json'
        if not receipt.exists():
            raise ValueError('Blender did not produce a verified revision.')
        report = json.loads(receipt.read_text())
        if report.get('error'):
            raise ValueError(report['error'])
        if not (report.get('blenderVersion') == '5.1.0' and report.get('openingClear') is True and report.get('existingWindowsPreserved') is True and report.get('rayChecks') == 9 and report.get('trimSurfaceChecks') == 4 and report.get('removedVolume', 0) > 0):
            raise ValueError('Native verification failed.')
        model, native = (output/'woodshed.glb').read_bytes(), (output/'scene.blend').read_bytes()
        if not model.startswith(b'glTF') or not native.startswith(b'BLENDER') or len(model)+len(native) > 50_000_000:
            raise ValueError('Invalid native artifacts.')
        header = json.dumps({'report': report, 'modelSize': len(model), 'blendSize': len(native), 'modelHash': hashlib.sha256(model).hexdigest(), 'blendHash': hashlib.sha256(native).hexdigest()}).encode()
        return struct.pack('>I', len(header)) + header + model + native


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, body, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.reply(200, b'{"ready":true,"blender":"5.1.0"}') if self.path == '/health' else self.reply(404, b'{}')

    def do_POST(self):
        if self.path != '/window':
            return self.reply(404, b'{}')
        if not lock.acquire(blocking=False):
            return self.reply(409, b'{"error":"An edit is running."}')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 5 <= size <= LIMIT:
                raise ValueError('Invalid input size.')
            self.connection.settimeout(130)
            result = execute(self.rfile.read(size))
            self.reply(200, result, 'application/vnd.blackblend.native-v1')
        except (ValueError, KeyError, TypeError) as error:
            self.reply(422, json.dumps({'error': str(error)[:200]}).encode())
        except Exception:
            self.reply(500, b'{"error":"Native execution failed. No automatic retry."}')
        finally:
            lock.release()


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), Handler).serve_forever()
