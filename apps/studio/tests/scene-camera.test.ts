import {test} from 'node:test';
import {sceneChanges} from '../lib/scene-changes.ts';
import assert from 'node:assert/strict';
import {conceptWoodshed,sceneDocument,animationPose,applySceneChange} from '../lib/scene-document.ts';
import {cameraProjection,cameraSpan,fitCamera,fitAnimationCamera,animationBounds,orientationAxes,presetCamera} from '../lib/scene-camera.ts';

test('projection switching preserves apparent size and camera target',()=>{
 const original=conceptWoodshed().camera;
 const ortho=cameraProjection(original,'orthographic');
 assert.ok(Math.abs(cameraSpan(ortho)-cameraSpan(original))<1e-10);
 const perspective=cameraProjection({...ortho,orthoScale:cameraSpan(ortho)/2},'perspective');
 assert.ok(Math.abs(perspective.radius-original.radius/2)<1e-10);
 assert.deepEqual(perspective.target,original.target);
});
test('framing respects portrait aspect, tiny components and unchanged angles',()=>{
 const camera=conceptWoodshed().camera,bounds={min:[-1,-2,-3],max:[3,4,5]};
 const wide=fitCamera(camera,bounds,16/9),narrow=fitCamera(camera,bounds,.5);
 assert.deepEqual(wide.target,[1,1,1]);assert.ok(narrow.radius>wide.radius);
 assert.equal(wide.yaw,camera.yaw);assert.equal(wide.elevation,camera.elevation);
 const small=fitCamera(camera,{min:[0,0,0],max:[.01,.01,.01]},1);
 assert.ok(small.radius<.5);assert.ok(small.radius>=.02);
 sceneDocument.parse({...conceptWoodshed(),camera:small});
});
test('axis views allow underneath inspection and keep framing/projection',()=>{
 const camera={...conceptWoodshed().camera,projection:'orthographic' as const,orthoScale:8};
 for(const view of ['front','back','left','right','top','bottom','iso'] as const){
  const next=presetCamera(camera,view);
  assert.equal(next.radius,camera.radius);assert.deepEqual(next.target,camera.target);assert.equal(next.orthoScale,8);
  sceneDocument.parse({...conceptWoodshed(),camera:next});
 }
 assert.equal(presetCamera(camera,'bottom').elevation,-89.5);
 assert.throws(()=>sceneDocument.parse({...conceptWoodshed(),camera:{...camera,fov:0}}));
});

test('animation fit encloses every moving corner throughout reverse/full orbits at fixed radius',()=>{
 const parts=[
  {min:[-2,-.2,-3],max:[2,3,3],explode:[-1,0,-2]},
  {min:[-2,3,-3],max:[2,3.6,3],explode:[1,5,.2]},
 ];
 for(const projection of ['perspective','orthographic'] as const) for(const aspect of [.6,16/9,2.4]) for(const fov of [20,38,85]) for(const elevation of [-40,0,25,80]){
  const camera=fitAnimationCamera({...conceptWoodshed().camera,projection,fov,elevation},parts,2,aspect);
  const original=JSON.stringify(camera);
  for(let frame=0;frame<=40;frame++){
   const pose=animationPose(frame/40),yaw=(camera.yaw-360*pose.orbit)*Math.PI/180,e=camera.elevation*Math.PI/180;
   const direction=[Math.sin(yaw)*Math.cos(e),Math.sin(e),Math.cos(yaw)*Math.cos(e)];
   const right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-Math.sin(yaw)*Math.sin(e),Math.cos(e),-Math.cos(yaw)*Math.sin(e)];
   for(const part of parts)for(let corner=0;corner<8;corner++){
    const delta=part.min.map((_,axis)=>((corner>>axis)&1?part.max[axis]:part.min[axis])+part.explode[axis]*2*pose.explode-camera.target[axis]);
    const dot=(axis:number[])=>delta.reduce((sum,value,i)=>sum+value*axis[i],0);
    const depth=camera.radius-dot(direction);
    const halfHeight=projection==='orthographic'?cameraSpan(camera)/2:depth*Math.tan(fov*Math.PI/360);
    assert.ok(depth>0);assert.ok(Math.abs(dot(up))<halfHeight);for(const outputAspect of [aspect,16/9])assert.ok(Math.abs(dot(right))<halfHeight*outputAspect);
   }
  }
  assert.equal(JSON.stringify(camera),original);
 }
 assert.throws(()=>fitAnimationCamera(conceptWoodshed().camera,[],1,1),/Show at least/);
 assert.throws(()=>fitAnimationCamera({...conceptWoodshed().camera,fov:12},[{min:[-100,-100,-100],max:[100,100,100],explode:[0,0,0]}],1,1),/camera range/);
});

test('animation bounds cover opposing travel and orthographic fit retains constant scale',()=>{
 const bounds=animationBounds([{min:[-1,0,2],max:[1,2,3],explode:[-3,4,0]}],2);
 assert.deepEqual(bounds,{min:[-7,0,2],max:[1,10,3]});
 const fit=fitAnimationCamera({...conceptWoodshed().camera,projection:'orthographic'},[{...bounds,explode:[0,0,0]}],1,1);
 sceneDocument.parse({...conceptWoodshed(),camera:fit});
});

test('orientation axes agree with Y-up camera views and remain orthonormal',()=>{
 const front=orientationAxes(0,0);assert.equal(front[0].x,1);assert.equal(front[1].y,1);assert.equal(front[2].depth,1);
 const right=orientationAxes(90,0);assert.ok(Math.abs(right[0].depth-1)<1e-10);assert.ok(Math.abs(right[2].x+1)<1e-10);
 for(const axis of orientationAxes(35,78))assert.ok(Math.abs(Math.hypot(axis.x,axis.y,axis.depth)-1)<1e-10);
});

test('wireframe presentation is an undoable retained scene setting',()=>{
 const original=conceptWoodshed();
 const next=applySceneChange(original,{baseRevision:original.revision,message:'Technical wireframe',assumptions:[],operations:[{type:'settings',renderStyle:'wireframe'}]});
 assert.equal(sceneDocument.parse(next).renderStyle,'wireframe');
 assert.deepEqual(sceneChanges(original,next).settings,['renderStyle']);
 assert.equal(original.renderStyle,undefined);
});
