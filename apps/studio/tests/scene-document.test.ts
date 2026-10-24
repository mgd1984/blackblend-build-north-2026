import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySceneChange, animationPose, conceptWoodshed, sceneDocument } from '../lib/scene-document.ts';
test('scene changes are atomic, revision-bound and cannot inject executable fields', () => {
 const original=conceptWoodshed();
 const change={baseRevision:0,message:'Lift the roof',assumptions:[],operations:[{type:'update_part',id:'roof-left',patch:{explode:[0,2,0]}}]};
 const next=applySceneChange(original,change);
 assert.equal(original.revision,0);assert.equal(next.revision,1);assert.deepEqual(next.parts.find(p=>p.id==='roof-left')?.explode,[0,2,0]);
 assert.throws(()=>applySceneChange(next,change),/scene changed/);
 assert.throws(()=>applySceneChange(original,{...change,operations:[...change.operations,{type:'remove_part',id:'missing'}]}),/Part not found/);
 assert.deepEqual(original,conceptWoodshed());
 assert.throws(()=>applySceneChange(original,{...change,operations:[{type:'update_part',id:'roof-left',patch:{script:'fetch("secret")'}}]}));
});
test('native geometry cannot be replaced by executable URLs or duplicated IDs',()=>{
 const doc=conceptWoodshed();
 assert.throws(()=>sceneDocument.parse({...doc,asset:'https://external.invalid/model.glb'}));
 assert.throws(()=>sceneDocument.parse({...doc,parts:[doc.parts[0],doc.parts[0]]}));
 assert.throws(()=>sceneDocument.parse({...doc,parts:[{...doc.parts[0],shape:'native',node:'roof'}]}));
 assert.throws(()=>sceneDocument.parse({...doc,camera:{...doc.camera,radius:Infinity}}));
});
test('choreography closes at the end and does not change camera radius',()=>{
 assert.deepEqual(animationPose(0),{explode:0,orbit:0});
 assert.deepEqual(animationPose(1),{explode:0,orbit:1});
 assert.equal(animationPose(.5).explode,1);
 for(let i=0;i<=100;i++){const p=animationPose(i/100);assert.ok(p.explode>=0&&p.explode<=1);}
});
