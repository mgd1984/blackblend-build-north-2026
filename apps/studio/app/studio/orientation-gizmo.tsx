"use client";
import {forwardRef,useImperativeHandle,useRef} from 'react';
import {orientationAxes,type ViewPreset} from '../../lib/scene-camera';

export type OrientationHandle={update:(yaw:number,elevation:number)=>void};
const directions=[
 {axis:'x',sign:1,label:'Right',opposite:'left',view:'right'},
 {axis:'x',sign:-1,label:'Left',opposite:'right',view:'left'},
 {axis:'y',sign:1,label:'Top',opposite:'bottom',view:'top'},
 {axis:'y',sign:-1,label:'Bottom',opposite:'top',view:'bottom'},
 {axis:'z',sign:1,label:'Front',opposite:'back',view:'front'},
 {axis:'z',sign:-1,label:'Back',opposite:'front',view:'back'},
] as const;

export default forwardRef<OrientationHandle,{onView:(view:ViewPreset)=>void;disabled:boolean}>(function OrientationGizmo({onView,disabled},ref){
 const host=useRef<HTMLDivElement>(null);
 const depths=useRef<Record<string,number>>({});
 useImperativeHandle(ref,()=>({update:(yaw,elevation)=>{
  const axes=orientationAxes(yaw,elevation);
  for(const direction of directions){
   const axis=axes.find(value=>value.axis===direction.axis)!;
   const x=56+axis.x*direction.sign*34,y=51-axis.y*direction.sign*34,depth=axis.depth*direction.sign;
   const id=direction.axis+direction.sign;
   depths.current[id]=depth;
   const button=host.current?.querySelector<HTMLButtonElement>(`[data-direction="${id}"]`);
   if(button){
    button.style.transform=`translate(${x-12}px, ${y-12}px)`;
    button.style.zIndex=String(Math.round((depth+1)*10)+2);
    button.style.opacity=depth<-.05?'.48':'1';
    // At an axis-aligned view the forward/back handles coincide. Clicking the
    // front handle flips it; hiding the rear one also avoids duplicate hit targets.
    button.style.visibility=depth<-.995?'hidden':'visible';
   }
   const line=host.current?.querySelector<SVGLineElement>(`[data-line="${id}"]`);
   if(line){line.setAttribute('x2',String(x));line.setAttribute('y2',String(y));line.style.opacity=depth<0?'.3':'.7';}
  }
 }}),[]);
 return <div className="orientation-gizmo" ref={host} role="group" aria-label="XYZ orientation">
  <svg viewBox="0 0 112 112" aria-hidden="true"><circle cx="56" cy="51" r="36" className="orientation-ring"/>{directions.map(direction=><line key={direction.axis+direction.sign} data-line={direction.axis+direction.sign} data-axis={direction.axis} x1="56" y1="51" x2="56" y2="51"/>)}</svg>
  {directions.map(direction=><button key={direction.axis+direction.sign} data-direction={direction.axis+direction.sign} data-axis={direction.axis} data-positive={direction.sign===1} aria-label={`${direction.label} view`} title={`${direction.label} view · click again to reverse`} disabled={disabled} onClick={()=>onView(depths.current[direction.axis+direction.sign]>.995?direction.opposite:direction.view)}>{direction.sign===1?direction.axis.toUpperCase():`−${direction.axis.toUpperCase()}`}</button>)}
  <button className="orientation-home" aria-label="Isometric view" title="Isometric view" disabled={disabled} onClick={()=>onView('iso')}>ISO</button>
 </div>;
});
