"""Package only reviewed tool source for private R2 provisioning; no CAD or credentials."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=Path('runs/scene-tools/blender-window-v1.zip'))
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
files={'server.py':'infra/blender/server.py','blender/window_edit.py':'blender/window_edit.py','scripts/export-studio-scene.py':'scripts/export-studio-scene.py','tests/native-window.blender.py':'tests/native-window.blender.py'}
args.output.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(args.output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
 for name,source in sorted(files.items()):
  info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  archive.writestr(info,(root/source).read_bytes())
print(json.dumps({'path':str(args.output),'bytes':args.output.stat().st_size,'sha256':hashlib.file_digest(args.output.open('rb'),'sha256').hexdigest()}))
