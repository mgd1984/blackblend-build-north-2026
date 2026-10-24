"use client";
import {Camera, Focus, Hand, Rotate3D, Maximize} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from '../../components/ui/popover';
import {cameraFov,cameraProjection,cameraSpan,viewPresets,type SceneCamera,type ViewPreset} from '../../lib/scene-camera';

export default function ViewControls({camera,navigation,onNavigation,onChange,onView,onFrame,onFitAnimation,onReset,renderStyle,onRenderStyle,selected,disabled}:{
 camera:SceneCamera;navigation:'orbit'|'pan';onNavigation:(mode:'orbit'|'pan')=>void;
 onChange:(camera:SceneCamera)=>void;onView:(view:ViewPreset)=>void;onFrame:(selection:boolean)=>void;onReset:()=>void;onFitAnimation:()=>void;renderStyle:'material'|'wireframe';onRenderStyle:(style:'material'|'wireframe')=>void;selected:boolean;disabled:boolean;
}){
 const projection=camera.projection??'perspective';
 return <Popover><PopoverTrigger asChild><button title="View controls" aria-label="View controls" disabled={disabled}><Camera size={16}/></button></PopoverTrigger>
  <PopoverContent side="right" align="start" sideOffset={12} className="studio-popover view-controls" aria-label="View controls">
   <div className="view-controls-heading"><strong>View</strong><button title="Restore the view from when this scene was opened" onClick={onReset}>Reset view</button></div>
   <div className="view-segment" role="group" aria-label="Projection">
    {(['perspective','orthographic'] as const).map(mode=><button key={mode} aria-pressed={projection===mode} onClick={()=>onChange(cameraProjection(camera,mode))}>{mode==='perspective'?'Perspective':'Orthographic'}</button>)}
   </div>
   <div className="view-preset-grid" role="group" aria-label="Standard views">
    {viewPresets.map(view=><button key={view.id} title={view.key?`${view.label} · Numpad ${view.key}`:view.label} onClick={()=>onView(view.id)}>{view.label}</button>)}
   </div>
   <div className="view-frame-actions">
    <button onClick={()=>onFrame(false)}><Focus size={13}/>Frame all</button>
    <button disabled={!selected} onClick={()=>onFrame(true)}><Focus size={13}/>Frame selection</button>
   </div>
   <button className="view-fit-animation" title="Fit every assembly pose and orbit angle at one fixed distance" onClick={onFitAnimation}><Maximize size={14}/>Fit animation</button>
   <div className="view-segment" role="group" aria-label="Display style">
    <button aria-pressed={renderStyle==='material'} onClick={()=>onRenderStyle('material')}>Material</button>
    <button aria-pressed={renderStyle==='wireframe'} onClick={()=>onRenderStyle('wireframe')}>Wireframe</button>
   </div>
   {projection==='perspective'?<label className="view-lens"><span>Field of view <output>{cameraFov(camera)}°</output></span><input type="range" aria-label="Field of view" min="12" max="85" step="1" value={cameraFov(camera)} onChange={e=>onChange({...camera,fov:Number(e.target.value)})}/><span className="view-range-labels"><span>Telephoto</span><span>Wide</span></span></label>
   :<label className="view-height">View height<input type="number" aria-label="Orthographic view height" min=".002" max="500" step=".01" value={Number(cameraSpan(camera).toFixed(3))} onChange={e=>{const n=Number(e.target.value);if(n>=.002&&n<=500)onChange({...camera,orthoScale:n});}}/></label>}
   <div className="view-segment" role="group" aria-label="Drag mode">
    <button aria-pressed={navigation==='orbit'} onClick={()=>onNavigation('orbit')}><Rotate3D size={13}/>Orbit</button>
    <button aria-pressed={navigation==='pan'} onClick={()=>onNavigation('pan')}><Hand size={13}/>Pan</button>
   </div>
   <details className="view-shortcuts"><summary>Navigation & shortcuts</summary><p>Drag to orbit · Shift-drag or right-drag to pan · Scroll to zoom toward the pointer. Middle-drag orbits; Shift-middle-drag pans.</p><p>With the canvas focused: <kbd>1</kbd> front · <kbd>3</kbd> right · <kbd>7</kbd> top. Add Ctrl for the reverse view. <kbd>5</kbd> projection · <kbd>F</kbd> frame selection · <kbd>Home</kbd> frame all.</p></details>
  </PopoverContent>
 </Popover>;
}
