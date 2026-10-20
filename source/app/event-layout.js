/** CSS-pixel layout. 40 is an illustrative coordinate-unit road width, never metres. */
export const MARKER_LAYOUT=Object.freeze({hitSize:44,visualSize:26,roadWidth:40,enterWidth:46,exitWidth:39,minEnterWidth:78,minExitWidth:68,gap:5});
export function projectedEvent(event,{pointAt,project,lengthM=5000,roadWidth=40}){
 const source=pointAt(event.d),before=pointAt((event.d-2+lengthM)%lengthM),after=pointAt((event.d+2)%lengthM);
 const dx=after.x-before.x,dy=after.y-before.y,norm=Math.hypot(dx,dy)||1,n={x:-dy/norm,y:dx/norm};
 const anchor=project(source),edge=project({x:source.x+n.x*roadWidth/2,y:source.y+n.y*roadWidth/2}),vx=edge.x-anchor.x,vy=edge.y-anchor.y,half=Math.hypot(vx,vy),screenNormal={x:vx/(half||1),y:vy/(half||1)};
 return{event,source,anchor,normal:screenNormal,roadWidth:half*2};
}
const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export function layoutEvents(projected,{width,height,occupied=[],previous=new Set(),selectedId=null,overview=false,config=MARKER_LAYOUT}={}){
 const placed=[],visible=new Set(),boxes=occupied.map(r=>({...r}));
 if(overview)return{placed,visible};
 // Selected event first; preserve stable distance order for all others.
 const ordered=[...projected].sort((a,b)=>Number(b.event.uiId===selectedId)-Number(a.event.uiId===selectedId)||a.event.d-b.event.d||a.event.uiId.localeCompare(b.event.uiId));
 for(const p of ordered){const minimum=p.event.type==='minimum-speed',was=previous.has(p.event.uiId),threshold=minimum?(was?config.minExitWidth:config.minEnterWidth):(was?config.exitWidth:config.enterWidth);
  if(p.roadWidth<threshold||p.anchor.x<0||p.anchor.x>width||p.anchor.y<0||p.anchor.y>height)continue;
  const preferred=p.event.key==='a'?-1:1;
  // Bounded normal placement only: no tangential scattering or long leaders.
  for(const side of [preferred,-preferred]){const offset=p.roadWidth/2+config.visualSize/2+config.gap,x=p.anchor.x+p.normal.x*offset*side,y=p.anchor.y+p.normal.y*offset*side,box={x:x-config.hitSize/2,y:y-config.hitSize/2,w:config.hitSize,h:config.hitSize};
   if(box.x<3||box.y<3||box.x+box.w>width-3||box.y+box.h>height-3||boxes.some(b=>intersects(box,b)))continue;
   boxes.push({...box,x:box.x-2,y:box.y-2,w:box.w+4,h:box.h+4});visible.add(p.event.uiId);placed.push({...p,x,y,hitSize:config.hitSize,visualSize:config.visualSize});break;
  }
 }
 return{placed,visible};
}
