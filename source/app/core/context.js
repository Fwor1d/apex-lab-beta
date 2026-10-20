import {DemoSource} from '../data/demo-source.js';
import {createAppStore} from './app-state.js';
import {presentationSource,toPresentationValues} from './data-source.js';
export {brakingCalculation} from '../education/braking-calculation.js';
export const appStore=createAppStore(new DemoSource());
export const state=appStore.state;
export const source=presentationSource(()=>appStore.source);
export let LENGTH,lapInfo,SECTORS,SEGMENTS;
function describe(d){LENGTH=d.lengthM;lapInfo=d.laps;SECTORS=d.sectors;SEGMENTS=d.segments;}
describe(appStore.source.descriptor);appStore.subscribeSource(describe);
export const valueAt=(id,d)=>toPresentationValues(appStore.source.valueAt(id,d));
export const timeAt=(id,d)=>appStore.source.timeAt(id,d);
export const lapTime=id=>appStore.source.duration(id);
export const deltaAt=(a,b,d)=>{const ta=timeAt(a,d),tb=timeAt(b,d);return ta===null||tb===null?null:tb-ta;};
export const pointAt=(d,id=state.b)=>appStore.source.positionAt(id,d);
// R5.2 endpoint clamping is presentation-only, and never fills an internal gap.
export function distanceAtTime(id,t){const end=lapTime(id);return !Number.isFinite(t)||end===null?null:appStore.source.distanceAtTime(id,Math.max(0,Math.min(end,t)));}
export const selectPair=(a,b)=>appStore.selectPair(a,b);
export const seek=d=>appStore.seekDistance(d);
export function selectSector(id){const part=SECTORS.find(p=>p.id===id);state.sector=id;state.range=part?[part.start,part.end]:[0,LENGTH];seek(Math.max(state.range[0],Math.min(state.range[1],state.cursorM)));}
export function resetView(){state.zoom=1;state.panX=0;state.panY=0;}
