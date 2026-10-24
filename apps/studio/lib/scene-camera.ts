import type { SceneDocument } from './scene-document.ts';

export type SceneCamera = SceneDocument['camera'];
export type ViewPreset = 'iso' | 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
export const viewPresets: {id:ViewPreset;label:string;key?:string}[] = [
  {id:'iso',label:'Isometric'}, {id:'front',label:'Front',key:'1'}, {id:'back',label:'Back'},
  {id:'left',label:'Left'}, {id:'right',label:'Right',key:'3'}, {id:'top',label:'Top',key:'7'}, {id:'bottom',label:'Bottom'},
];
export const cameraFov = (camera:SceneCamera) => camera.fov ?? 38;
export const cameraSpan = (camera:SceneCamera) => camera.orthoScale ?? 2 * camera.radius * Math.tan(cameraFov(camera) * Math.PI / 360);
export function cameraProjection(camera:SceneCamera, projection:'perspective'|'orthographic'):SceneCamera {
  if ((camera.projection ?? 'perspective') === projection) return {...camera};
  const span = camera.projection === 'orthographic' ? cameraSpan(camera) : 2 * camera.radius * Math.tan(cameraFov(camera) * Math.PI / 360);
  return {...camera,projection,orthoScale:span,radius:projection==='perspective' ? Math.max(.02,Math.min(200,span/(2*Math.tan(cameraFov(camera)*Math.PI/360)))) : camera.radius};
}
export function presetCamera(camera:SceneCamera, view:ViewPreset):SceneCamera {
  const angles:Record<ViewPreset,[number,number]> = {iso:[45,35.264],front:[0,0],back:[180,0],right:[90,0],left:[-90,0],top:[0,89.5],bottom:[0,-89.5]};
  return {...camera,yaw:angles[view][0],elevation:angles[view][1]};
}
/** Conservative sphere fit: constant time in bounds, independent of mesh density. */
export function fitCamera(camera:SceneCamera, bounds:{min:number[];max:number[]}, aspect:number):SceneCamera {
  const target = bounds.min.map((n,i)=>(n+bounds.max[i])/2) as [number,number,number];
  const radius = Math.max(.001,Math.hypot(...bounds.max.map((n,i)=>(n-bounds.min[i])/2)));
  const halfVertical = cameraFov(camera)*Math.PI/360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical)*Math.max(.1,aspect));
  const distance = Math.max(.02,Math.min(200,radius/Math.sin(Math.min(halfVertical,halfHorizontal))*1.25));
  return {...camera,target,radius:distance,orthoScale:Math.max(.002,Math.min(500,2*radius*Math.max(1,1/Math.max(.1,aspect))*1.25))};
}

export type AnimationPartBounds = {min:number[];max:number[];explode:number[]};
/** Part motion is a linear translation times a bounded 0..1 easing curve.
 * Unioning its two endpoints encloses every intermediate pose, without sampling meshes. */
export function animationBounds(parts:AnimationPartBounds[], spread:number) {
  if(!parts.length) throw Error('Show at least one component to fit the animation.');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const part of parts) for(let axis=0;axis<3;axis++) {
    const shift=part.explode[axis]*spread;
    min[axis]=Math.min(min[axis],part.min[axis],part.min[axis]+shift);
    max[axis]=Math.max(max[axis],part.max[axis],part.max[axis]+shift);
  }
  return {min,max};
}
export function fitAnimationCamera(camera:SceneCamera, parts:AnimationPartBounds[], spread:number, aspect:number):SceneCamera {
  const bounds=animationBounds(parts,spread);
  // Cover both the current canvas and the 16:9 export. Extra breathing room
  // keeps the floating playback/composer clear of the animation envelope.
  const limitingAspect=Math.min(aspect,16/9);
  const next=fitCamera(camera,bounds,limitingAspect);
  const elevation=camera.elevation*Math.PI/180,sin=Math.sin(elevation),cos=Math.cos(elevation);
  const tangentV=Math.tan(cameraFov(camera)*Math.PI/360);
  const tangentH=tangentV*Math.max(.1,limitingAspect);
  let distance=.02,halfHeight=.001;
  // Bound the four frustum planes analytically over all yaw angles, using only
  // each cached box's eight corners at the two translation endpoints. Unlike a
  // bounding sphere this preserves useful framing for tall exploded assemblies.
  for(const part of parts)for(const endpoint of [0,spread])for(let corner=0;corner<8;corner++){
    const point=part.min.map((_,axis)=>((corner>>axis)&1?part.max[axis]:part.min[axis])+part.explode[axis]*endpoint-next.target[axis]);
    const horizontal=Math.hypot(point[0],point[2]),vertical=point[1];
    distance=Math.max(distance,horizontal*Math.hypot(cos,1/tangentH)+vertical*sin);
    for(const sign of [-1,1])distance=Math.max(distance,horizontal*Math.abs(cos-sign*sin/tangentV)+vertical*(sin+sign*cos/tangentV));
    halfHeight=Math.max(halfHeight,horizontal*Math.abs(sin)+Math.abs(vertical*cos),horizontal/Math.max(.1,limitingAspect));
  }
  distance*=1.22;
  const span=2*halfHeight*1.3;
  if((camera.projection==='orthographic' ? span>500 : distance>200))
    throw Error('The animation exceeds the camera range. Reduce separation or widen the field of view.');
  return {...next,radius:Math.min(200,distance),orthoScale:Math.min(500,span)};
}

export function orientationAxes(yaw:number,elevation:number) {
  const y=yaw*Math.PI/180,e=elevation*Math.PI/180;
  return [
    {axis:'x' as const,x:Math.cos(y),y:-Math.sin(y)*Math.sin(e),depth:Math.sin(y)*Math.cos(e)},
    {axis:'y' as const,x:0,y:Math.cos(e),depth:Math.sin(e)},
    {axis:'z' as const,x:-Math.sin(y),y:-Math.cos(y)*Math.sin(e),depth:Math.cos(y)*Math.cos(e)},
  ];
}
