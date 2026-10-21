import test from 'node:test';import assert from 'node:assert/strict';
import {fitVisiblePath} from '../../app/map-fit.js';
import {carDetailVisible,trajectoryHeading,CAR_LOD} from '../../app/vehicle-marks.js';
import {pathSamples} from '../../app/map-camera.js';import {pointAt,LENGTH} from '../../app/core/context.js';
test('shape-aware fit clears actual controls, preserves aspect and road padding',()=>{for(const [width,height] of [[370,330],[700,230],[1000,560],[1400,680]]){
 const controls=[{x:8,y:8,w:44,h:230},{x:width-120,y:8,w:112,h:82},{x:8,y:height-18,w:width-16,h:14}],points=pathSamples(),c=fitVisiblePath(points,{width,height},controls),scale=width/c.width;
 assert.ok(Math.abs(height/c.height-scale)<1e-10);
 for(const p of points){const x=(p.x-c.cx)*scale+width/2,y=(p.y-c.cy)*scale+height/2,r=22*scale;assert.ok(x-r>=13.99&&x+r<=width-13.99&&y-r>=13.99&&y+r<=height-13.99);for(const o of controls)assert.ok(x+r+3.99<=o.x||x-r-3.99>=o.x+o.w||y+r+3.99<=o.y||y-r-3.99>=o.y+o.h);}
}});
test('vehicle LOD hysteresis prevents threshold flicker',()=>{assert.equal(CAR_LOD.enter,38);assert.equal(carDetailVisible(37,false),false);assert.equal(carDetailVisible(38,false),true);assert.equal(carDetailVisible(35,true),true);assert.equal(carDetailVisible(31,true),false);});
test('vehicle heading follows original trajectory, including start/finish',()=>{for(const d of [0,.1,800,1850,2050,4999.9,5000]){const h=trajectoryHeading(pointAt,d,LENGTH),a=pointAt((d-.5+LENGTH)%LENGTH),b=pointAt((d+.5)%LENGTH);assert.ok(Number.isFinite(h));assert.ok(Math.abs(h-Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)<1e-9);}assert.equal(trajectoryHeading(pointAt,0,LENGTH),trajectoryHeading(pointAt,LENGTH,LENGTH));});
