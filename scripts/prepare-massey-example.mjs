/** Prepare the existing R03 GLB for Studio without editing its native source.
 * node --experimental-strip-types scripts/prepare-massey-example.mjs INPUT.glb
 * Saves the private viewer copy and its source hashes under ignored runs/scene-assets.
 */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Box3, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {sceneDocument} from '../apps/studio/lib/scene-document.ts';

const input=process.argv[2];
if(!input)throw Error('Provide the preserved R03 assembled GLB.');
const output=new URL('../runs/scene-assets/',import.meta.url);
const bytes=await readFile(input), length=bytes.readUInt32LE(12);
if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2)throw Error('Expected a GLB 2 model.');
const gltf=JSON.parse(bytes.subarray(20,20+length).toString());
if(gltf.animations?.length||gltf.images?.length)throw Error('Use the assembled, unanimated, untextured R03 export.');
const assemblies=[
 ['01_RUNNING_GEAR_ROOT','Running gear',[0,0,0]],
 ['MH21_Header_assembly','Canvas header',[1.7,.15,0]],
 ['03 | Separator assembly','Separator',[0,1.8,0]],
 ['04 | Grain handling assembly','Grain handling',[-.2,3.3,0]],
 ['05 | Crop process internals','Process internals',[0,.8,0]],
 ['06 | Operator platform and controls','Operator station',[0,.2,-2.3]],
 ['07 | Exposed engine and belt drives','Power and drives',[0,.3,2.3]],
];
const selected=assemblies.map(([name])=>{
 const matches=gltf.nodes.filter(n=>n.name===name);
 if(matches.length!==1)throw Error('Missing or ambiguous assembly: '+name);
 return matches[0];
});
const covered=new Set();
for(const root of selected){
 const visit=index=>{
  if(covered.has(index))throw Error('Assembly roots overlap.');
  covered.add(index);for(const child of gltf.nodes[index].children??[])visit(child);
 };
 visit(gltf.nodes.indexOf(root));
}
if(gltf.nodes.some((node,index)=>node.mesh!==undefined&&!covered.has(index)))throw Error('Source geometry exists outside the seven assembly roots.');
// Add only Studio's group tags to the private viewer copy.
for(const node of gltf.nodes)delete node.extras;
for(const scene of gltf.scenes)delete scene.extras;
selected.forEach((node,i)=>{node.extras={blackblend_part_id:'native-'+i};});
const payload=Buffer.from(JSON.stringify(gltf)), pad=Buffer.alloc((4-payload.length%4)%4,0x20);
const tail=bytes.subarray(20+length), header=Buffer.alloc(20);
header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+payload.length+pad.length+tail.length,8);
header.writeUInt32LE(payload.length+pad.length,12);header.writeUInt32LE(0x4e4f534a,16);
const derivative=Buffer.concat([header,payload,pad,tail]);
const parsed=await new GLTFLoader().parseAsync(derivative.buffer.slice(derivative.byteOffset,derivative.byteOffset+derivative.byteLength),'');
parsed.scene.updateMatrixWorld(true);
const parts=assemblies.map(([,name,explode],i)=>{
 let root;parsed.scene.traverse(node=>{if(node.userData.blackblend_part_id==='native-'+i)root=node;});
 if(!root)throw Error('Missing viewer assembly: '+name);
 const bounds=new Box3().setFromObject(root), size=bounds.getSize(new Vector3());
 return {id:'native-'+i,name,group:name,shape:'native',node:'native-'+i,size:size.toArray().map(n=>Math.max(.001,n)),position:[0,0,0],rotation:[0,0,0],explode,color:'#a92c22',visible:true};
});
const document=sceneDocument.parse({version:1,revision:0,title:'Massey-Harris 21 · assembly study',asset:'massey-harris-21',fidelity:'source-derived',parts,
 camera:{yaw:54,elevation:25,radius:23,target:[-.25,2.65,0],orbit:360},animation:{duration:12,spread:1},background:'studio',
 assumptions:['R03 Blender reconstruction of the 1941 Model 21; seven authored assemblies and 996 meshes.', 'Photo-inferred dimensions and schematic internals. Visualization only; historical accuracy and engineering performance are not verified.', 'Browser materials and assembly choreography simplify the native Blender presentation.']});
await mkdir(output,{recursive:true,mode:0o700});
await writeFile(new URL('massey-harris-21.glb',output),derivative,{mode:0o600});
await writeFile(new URL('massey-harris-21.json',output),JSON.stringify(document),{mode:0o600});
await writeFile(new URL('massey-harris-21.provenance.private.json',output),JSON.stringify({source:path.resolve(input),sourceSha256:createHash('sha256').update(bytes).digest('hex'),derivativeSha256:createHash('sha256').update(derivative).digest('hex'),assemblies:parts.length,meshes:gltf.meshes.length}),{mode:0o600});
console.log(JSON.stringify({assemblies:parts.length,meshes:gltf.meshes.length,bytes:derivative.length}));
