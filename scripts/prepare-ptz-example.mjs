/** Prepare V0.10.1's existing native mesh exports without opening or changing Blender.
 * node --experimental-strip-types scripts/prepare-ptz-example.mjs SOURCE_DIRECTORY
 * Private output and source hashes stay under ignored runs/scene-assets.
 */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {BufferGeometry, Float32BufferAttribute, Color} from 'three';
import {sceneDocument} from '../apps/studio/lib/scene-document.ts';

const source = process.argv[2];
if (!source) throw Error('Provide the preserved V0.10.1 engineering export directory.');
const names = ['assembly.json', 'full-explosion/mesh-data.json', 'full-explosion/explosion-plan.json'];
const sourceBytes = await Promise.all(names.map(name => readFile(path.join(source, name))));
const [assembly, geometry, plans] = sourceBytes.map(bytes => JSON.parse(bytes));
if (assembly.length !== 294 || Object.keys(geometry).length !== 294) throw Error('Expected the complete V0.10.1 294-mesh export.');
if (new Set(assembly.map(item => item.name)).size !== assembly.length) throw Error('Source assembly names must be unique.');
const identity = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
const buckets = new Map();
const palette = {Structure:'#60788c', 'Pan stage':'#388dc0', 'Tilt & payload':'#299e8c', 'Service covers':'#ded2b7', 'Drive system':'#d99844', Electronics:'#9470bd', Hardware:'#a9b8c8'};
const motion = {fixed:'Fixed',pan:'Pan',tilt:'Tilt','pan-driver':'Pan drive','tilt-driver':'Tilt drive'};
for (const item of assembly) {
  if (!geometry[item.name] || (item.matrix && JSON.stringify(item.matrix) !== JSON.stringify(identity))) throw Error('Missing mesh or unexpected assembly transform.');
  const fastener = item.color === 'metal' && /^(M\d|washer|nut)/.test(item.name);
  const key = fastener ? `fasteners:${item.group}` : item.color === 'chip' ? `electronics:${item.group}` : item.name;
  const group = fastener || item.color === 'metal' ? 'Hardware' : ['chip','pcb'].includes(item.color) ? 'Electronics'
    : ['motor','belt','drive'].includes(item.color) ? 'Drive system' : /lid|guard|cassette/.test(item.name) ? 'Service covers'
    : item.group === 'tilt' ? 'Tilt & payload' : item.group === 'pan' ? 'Pan stage' : 'Structure';
  if (!buckets.has(key)) buckets.set(key, {name:fastener ? `${motion[item.group]} fasteners` : item.color === 'chip' ? `${motion[item.group]} electronics details` : item.name.replace(/^\d+[a-z]?-/, '').replace(/-/g,' '),group,items:[]});
  buckets.get(key).items.push(item);
}
const gltf = {asset:{version:'2.0',generator:'Blackblend private PTZ derivative'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[]};
const materialIds = new Map();
for (const [name,hex] of Object.entries(palette)) {
  materialIds.set(name,gltf.materials.length);
  gltf.materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...new Color(hex).toArray(),1],metallicFactor:name==='Hardware'?.65:.15,roughnessFactor:.55},doubleSided:true});
}
const buffers=[]; let byteLength=0;
function accessor(array,type,count,componentType,limits) {
  const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
  const view=gltf.bufferViews.length;
  gltf.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length});
  buffers.push(bytes); byteLength+=bytes.length;
  const padding=Buffer.alloc((4-byteLength%4)%4); buffers.push(padding); byteLength+=padding.length;
  gltf.accessors.push({bufferView:view,componentType,count,type,...limits});
  return gltf.accessors.length-1;
}
const parts=[],allLow=[Infinity,Infinity,Infinity],allHigh=[-Infinity,-Infinity,-Infinity];
for (const [index,bucket] of [...buckets.values()].entries()) {
  const id=`native-${index}`,children=[],low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  let separation=[0,0,0];
  for (const item of bucket.items) {
    const mesh=geometry[item.name];
    // The native exports contain world-space millimetres. glTF uses metres, Y up.
    const vertices=mesh.vertices.flatMap(([x,y,z])=>[x*.001,z*.001,-y*.001]);
    const meshLow=[Infinity,Infinity,Infinity],meshHigh=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<vertices.length;i++) {
      if(!Number.isFinite(vertices[i]))throw Error('Non-finite vertex.');
      const axis=i%3; meshLow[axis]=Math.min(meshLow[axis],vertices[i]);meshHigh[axis]=Math.max(meshHigh[axis],vertices[i]);
      low[axis]=Math.min(low[axis],vertices[i]);high[axis]=Math.max(high[axis],vertices[i]);
    }
    if(mesh.faces.some(face=>face.length!==3||face.some(v=>!Number.isInteger(v)||v<0||v>=mesh.vertices.length)))throw Error('Invalid source triangle.');
    const positions=new Float32Array(vertices),indices=new Uint32Array(mesh.faces.flat());
    const bufferGeometry=new BufferGeometry();bufferGeometry.setAttribute('position',new Float32BufferAttribute(positions,3));bufferGeometry.setIndex([...indices]);bufferGeometry.computeVertexNormals();
    const normal=bufferGeometry.getAttribute('normal').array;
    const attributes={POSITION:accessor(positions,'VEC3',mesh.vertices.length,5126,{min:meshLow,max:meshHigh}),NORMAL:accessor(normal,'VEC3',mesh.vertices.length,5126)};
    const meshId=gltf.meshes.length;gltf.meshes.push({name:item.name,primitives:[{attributes,indices:accessor(indices,'SCALAR',indices.length,5125),material:materialIds.get(bucket.group)}]});
    children.push(gltf.nodes.length);gltf.nodes.push({name:item.name,mesh:meshId});bufferGeometry.dispose();
    for(const step of plans[item.name]??[]) for(let axis=0;axis<3;axis++) separation[axis]+=step.translation_mm[axis]/bucket.items.length;
  }
  const root=gltf.nodes.length;gltf.nodes.push({name:bucket.name,children,extras:{blackblend_part_id:id}});gltf.scenes[0].nodes.push(root);
  for(let axis=0;axis<3;axis++){allLow[axis]=Math.min(allLow[axis],low[axis]);allHigh[axis]=Math.max(allHigh[axis],high[axis]);}
  parts.push({id,name:bucket.name,group:bucket.group,shape:'native',node:id,size:high.map((n,i)=>Math.max(.001,n-low[i])),position:[0,0,0],rotation:[0,0,0],explode:[separation[0]*.001,separation[2]*.001,-separation[1]*.001],color:palette[bucket.group],visible:true});
}
const target=allLow.map((n,i)=>(n+allHigh[i])/2);
target[1]+=.055; // Leave headroom for the source's upward explosion without changing zoom.
const document=sceneDocument.parse({version:1,revision:0,title:'PTZ camera rig · assembly study',asset:'ptz',fidelity:'source-derived',parts,
 camera:{yaw:40,elevation:24,radius:1.5,target,orbit:360},animation:{duration:12,spread:1},background:'studio',
 assumptions:['V0.10.1 native engineering mesh export; all 294 source meshes retained. Source millimetres converted to metres.', 'Small fasteners and electronics details are grouped by subsystem for browser selection. Materials and explode timing simplify the native presentation.', 'The existing Finish comparison uses its original Blender animation and generated treatment; browser choreography is independently editable.', 'Visualization only. Fit, strength, electronics and physical performance are not verified here.']});
gltf.buffers=[{byteLength}];
const json=Buffer.from(JSON.stringify(gltf)),jsonPad=Buffer.alloc((4-json.length%4)%4,0x20),bin=Buffer.concat(buffers);
const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+jsonPad.length+bin.length,8);header.writeUInt32LE(json.length+jsonPad.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const output=new URL('../runs/scene-assets/',import.meta.url);await mkdir(output,{recursive:true,mode:0o700});
await writeFile(new URL('ptz.glb',output),Buffer.concat([header,json,jsonPad,binHeader,bin]),{mode:0o600});
await writeFile(new URL('ptz.json',output),JSON.stringify(document),{mode:0o600});
await writeFile(new URL('ptz.provenance.private.json',output),JSON.stringify({source:path.resolve(source),files:names.map((name,i)=>({name,sha256:createHash('sha256').update(sourceBytes[i]).digest('hex')})),sourceMeshes:gltf.meshes.length,viewerParts:parts.length,sourceBoundsMetres:{min:allLow,max:allHigh}}),{mode:0o600});
console.log(JSON.stringify({meshes:gltf.meshes.length,parts:parts.length,bytes:header.readUInt32LE(8),bounds:{min:allLow,max:allHigh}}));
