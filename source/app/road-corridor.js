/** An illustrative, closed corridor in synthetic coordinate units. Never surveyed edges. */
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function intersects(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<-1e-9&&cross(c,d,a)*cross(c,d,b)<-1e-9;}
export function selfIntersects(points){const n=points.length;for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;if(intersects(points[i],points[(i+1)%n],points[j],points[(j+1)%n]))return true;}return false;}
export function buildRoadCorridor(input,halfWidth=10){
 if(!Array.isArray(input)||input.length<4||input.length>2000||input.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))||!Number.isFinite(halfWidth)||halfWidth<=0||halfWidth>100)return{available:false,reason:'Недопустимая геометрия коридора'};
 const pts=input.map(({x,y})=>({x,y}));if(Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<1e-6)pts.pop();
 if(pts.some((p,i)=>Math.hypot(p.x-pts[(i+1)%pts.length].x,p.y-pts[(i+1)%pts.length].y)<1e-6)||selfIntersects(pts))return{available:false,reason:'Повторные точки или самопересечение оси'};
 const left=[],right=[];
 for(let i=0;i<pts.length;i++){const p=pts[i],a=pts[(i+pts.length-1)%pts.length],b=pts[(i+1)%pts.length];const l0=Math.hypot(p.x-a.x,p.y-a.y),l1=Math.hypot(b.x-p.x,b.y-p.y),n0={x:-(p.y-a.y)/l0,y:(p.x-a.x)/l0},n1={x:-(b.y-p.y)/l1,y:(b.x-p.x)/l1},nx=n0.x+n1.x,ny=n0.y+n1.y,len=Math.hypot(nx,ny);if(len<1e-6)return{available:false,reason:'Разворот оси на 180°'};const ux=nx/len,uy=ny/len,dot=ux*n1.x+uy*n1.y,miter=Math.min(halfWidth*2,halfWidth/Math.max(.5,dot));left.push({x:p.x+ux*miter,y:p.y+uy*miter});right.push({x:p.x-ux*miter,y:p.y-uy*miter});}
 const strokeFallback=selfIntersects(left)||selfIntersects(right);
 const path=ps=>ps.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ')+' Z';
 return{available:true,strokeFallback,left,right,surfacePath:path(left)+' '+path(right),leftPath:path(left),rightPath:path(right),halfWidth,units:'synthetic-coordinate',dataKind:'illustrative-corridor'};
}
export function roadLayerHTML(road,centerPath){return road.available&&road.strokeFallback?`<g class="circuit-renderer" data-road-method="round-stroke-union"><path data-road="edges" class="circuit-union-edge" d="${centerPath} Z" stroke-width="${2*road.halfWidth+2}"/><path data-road="surface" class="circuit-union-surface" d="${centerPath} Z" stroke-width="${2*road.halfWidth}"/><path data-road="center" class="circuit-center" d="${centerPath}"/></g>`:road.available?`<g class="circuit-renderer" data-road-method="normal-offset" aria-label="Иллюстративная дорога"><path data-road="surface" class="circuit-asphalt" fill-rule="evenodd" d="${road.surfacePath}"/><g data-road="edges" class="circuit-edges"><path d="${road.leftPath}"/><path d="${road.rightPath}"/></g><path data-road="center" class="circuit-center" d="${centerPath}"/></g>`:`<path class="track" d="${centerPath}"/><title>Дорога недоступна: ${road.reason}</title>`;}
