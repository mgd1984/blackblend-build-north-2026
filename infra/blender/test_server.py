import importlib.util
import json
from pathlib import Path
import struct
import unittest

spec = importlib.util.spec_from_file_location('native_server', Path(__file__).with_name('server.py'))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class ProtocolTests(unittest.TestCase):
    def packet(self, edit=None):
        data={'scene': {'asset':'woodshed','parts':[{'id':'native-3','shape':'native','name':'Original shed · wall 1 -1.001'}]},'edit':edit or {'partId':'native-3','width':.8,'height':.7,'sill':1,'offset':.85}}
        header=json.dumps(data).encode()
        return struct.pack('>I',len(header))+header+b'BLENDER-v510'

    def test_valid_packet_and_native_signature(self):
        data,blend=server.decode(self.packet())
        self.assertEqual(data['edit']['width'],.8)
        self.assertTrue(blend.startswith(b'BLENDER'))
        self.assertEqual(server.decode(self.packet()[:-12]+bytes.fromhex('28b52ffd')+b'payload')[1][:4],bytes.fromhex('28b52ffd'))
        with self.assertRaises(ValueError): server.decode(self.packet()[:-12]+b'not a scene')

    def test_rejects_extra_fields_and_code_in_dimensions(self):
        for edit in [{'partId':'native-3','width':'__import__("os")','height':.7,'sill':1,'offset':.85},{'partId':'native-3','width':.8,'height':.7,'sill':1,'offset':.85,'command':'rm'}]:
            with self.assertRaises(ValueError): server.decode(self.packet(edit))
        with self.assertRaises(ValueError): server.decode(b'\xff\xff\xff\xffx')

if __name__=='__main__':unittest.main()
