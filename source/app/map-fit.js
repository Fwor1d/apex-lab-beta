/** Presentation fit: actual path, uniform projection, measured persistent controls.
 * No telemetry calculation. Road envelope includes the existing 20-unit corridor.
 */
export function fitVisiblePath(points, viewport, occupied=[], radius=22) {
 const {width,height}=viewport, margin=Math.max(14,Math.min(20,Math.min(width,height)*.035));
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 const b={left:Math.min(...xs)-radius,right:Math.max(...xs)+radius,top:Math.min(...ys)-radius,bottom:Math.max(...ys)+radius};
 const maxScale=Math.min((width-2*margin)/(b.right-b.left||1),(height-2*margin)/(b.bottom-b.top||1));
 const blockers=occupied.filter(r=>r.w>0&&r.h>0&&r.x<width&&r.y<height&&r.x+r.w>0&&r.y+r.h>0);
 const offsets=[.5,.375,.625,.25,.75,.125,.875,0,1];
 let chosen;
 for(let step=0;step<=55&&!chosen;step++){
  const scale=maxScale*Math.pow(.96,step),r=radius*scale;
  const left=margin-b.left*scale,right=width-margin-b.right*scale,top=margin-b.top*scale,bottom=height-margin-b.bottom*scale;
  for(const fy of offsets){for(const fx of offsets){const tx=left+(right-left)*fx,ty=top+(bottom-top)*fy;
   if(points.every(p=>{const x=p.x*scale+tx,y=p.y*scale+ty;return blockers.every(o=>x+r+4<=o.x||x-r-4>=o.x+o.w||y+r+4<=o.y||y-r-4>=o.y+o.h);})){chosen={scale,tx,ty};break;}
  }if(chosen)break;}
 }
 // Pathological fully-covered view: bounds remain contained; expanded disclosures
 // are transient and intentionally excluded by the caller.
 chosen??={scale:maxScale,tx:width/2-(b.left+b.right)*maxScale/2,ty:height/2-(b.top+b.bottom)*maxScale/2};
 return {cx:(width/2-chosen.tx)/chosen.scale,cy:(height/2-chosen.ty)/chosen.scale,width:width/chosen.scale,height:height/chosen.scale};
}
