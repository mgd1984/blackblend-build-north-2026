import {z} from 'zod';
import type {SceneDocument} from './scene-document.ts';

export const windowEdit=z.object({
 partId:z.string().regex(/^native-\d{1,3}$/),width:z.number().finite().min(.2).max(1.8),
 height:z.number().finite().min(.2).max(1.6),sill:z.number().finite().min(.2).max(1.9),offset:z.number().finite().min(-1).max(1),
}).strict();
export type WindowEdit=z.infer<typeof windowEdit>;
export function validateWindowEdit(scene:SceneDocument,raw:unknown){
 const edit=windowEdit.parse(raw),part=scene.parts.find(p=>p.id===edit.partId);
 if(scene.asset!=='woodshed'||part?.shape!=='native'||!/^Original shed · wall [01] -?1/.test(part.name))throw Error('Select an authored shed wall for a window opening.');
 if(edit.sill+edit.height>Math.min(part.size[1]-.15,2.65))throw Error('The window must fit below the wall plate.');
 return {edit,part};
}
export type WindowExecutor=(scene:SceneDocument,edit:WindowEdit)=>Promise<{scene:SceneDocument;report:{removedVolume:number;openingClear:boolean;blenderVersion:string};}>;
