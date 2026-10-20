/** Pure presentation on the original trajectory; CSS-pixel silhouettes. */
export const CAR_LOD={enter:38,exit:32};
export function carDetailVisible(roadPixels,previous=false){return roadPixels>=(previous?CAR_LOD.exit:CAR_LOD.enter);}
export function trajectoryHeading(pointAt,d,length){const sample=n=>pointAt((n%length+length)%length),a=sample(d-.5),b=sample(d+.5);return Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;}
export const vehicleHTML=()=>['a','b'].map(k=>`<g id="car-${k}" class="directional-car car-${k}" role="img" aria-label="${k.toUpperCase()} · направление по синтетическому пути" pointer-events="none"><title>${k.toUpperCase()} · направление по синтетическому пути</title><path class="car-body" d="${k==='a'?'M11 0 7 -5 -6 -5 -9 -3 -9 3 -6 5 7 5Z':'M11 0 6 -4 -5 -4 -9 -6 -9 6 -5 4 6 4Z'}"/><path class="car-glass" d="M3 -3 6 0 3 3 -2 3 -2 -3Z"/><path class="car-wing" d="M-7 -6V6"/></g>`).join('');
