// Navigation is presentation context. Analysis range, cursor and camera have separate owners.
import {LENGTH} from './core/context.js';
import {SEGMENTS} from './map-camera.js';
export function navigationSegment(state){return SEGMENTS.find(part=>part.id===state.segmentId)??null;}
export function selectNavigationSegment(state,id){const part=SEGMENTS.find(part=>part.id===id);if(!part)return null;state.segmentId=part.id;return part;}
export function adjacentNavigationSegment(state,direction){
 let index=SEGMENTS.findIndex(part=>part.id===state.segmentId);
 if(index<0)index=SEGMENTS.findIndex(part=>state.cursorM>=part.start&&(state.cursorM<part.end||part.end===LENGTH));
 return SEGMENTS[Math.max(0,Math.min(SEGMENTS.length-1,(index<0?0:index)+(direction<0?-1:1)))];
}
export function setAnalysisScope(state,range,sector='custom'){
 if(!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[0]<0||range[1]>LENGTH||range[0]>=range[1])throw Error('Invalid analysis range');
 state.range=[...range];state.sector=sector;
}
export const cursorOutsideScope=state=>state.cursorM<state.range[0]||state.cursorM>state.range[1];
