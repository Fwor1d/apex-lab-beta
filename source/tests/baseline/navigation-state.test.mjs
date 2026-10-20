import test from 'node:test';
import assert from 'node:assert/strict';
import {state as s,LENGTH,seek,deltaAt} from '../../app/core/context.js';
import {SEGMENTS,svgPath,pathSamples,boundsOf,fitCamera} from '../../app/map-camera.js';
import {selectNavigationSegment,setAnalysisScope,cursorOutsideScope} from '../../app/navigation-state.js';
import {mountTrackWorkspace,ensureWorkspaceState} from '../../app/track-workspace.js';
import {comparisonAt} from '../../app/comparison.js';

// A minimal DOM adapter executes the actual production controller handlers. Browser
// layout/geometry acceptance is deliberately separate from these state tests.
class Element {
 constructor(){this.handlers={};this.attrs={};this.dataset={};this.style={};this.clientWidth=1000;this.clientHeight=560;this.classList={toggle(){},contains(){return false;}};}
 addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);}
 fire(name,event={}){for(const fn of this.handlers[name]??[])fn({preventDefault(){},...event});}
 setAttribute(name,value){this.attrs[name]=String(value);}
 getAttribute(name){return this.attrs[name];}
 insertBefore(){} append(){} remove(){}
}
function fixture(motion=false,viewport={width:1000,height:560}){
 Object.assign(s,{mode:'map',a:1,b:2,range:[0,LENGTH],sector:'all',segmentId:null,cursorM:2050,playing:false,follow:false,camera:null,cameraRange:null,series:{a:true,b:true},alignment:'distance'});
 ensureWorkspaceState();const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const buttons=['previous','next','fit','reset','entire','follow','zoom-in','zoom-out'].map(action=>{const e=new Element();e.dataset.workspace=action;return e;});
 Object.assign(get('#map'),{clientWidth:viewport.width,clientHeight:viewport.height});
 const host=new Element();host.querySelector=selector=>get(selector);host.querySelectorAll=selector=>selector==='[data-workspace]'?buttons:[];
 globalThis.window=new Element();globalThis.matchMedia=()=>Object.assign(new Element(),{matches:false});
 let resize;globalThis.ResizeObserver=class{constructor(fn){resize=fn;}observe(){}disconnect(){}};
 let rangeCalls=0,cursorCalls=0;const api=mountTrackWorkspace(host,{motion:()=>motion,onRange:()=>rangeCalls++,onCursor:()=>cursorCalls++});
 return {api,host,get,resize:()=>resize(),button:action=>buttons.find(e=>e.dataset.workspace===action),counts:()=>({rangeCalls,cursorCalls})};
}
const scope=()=>JSON.stringify([s.sector,s.range,s.a,s.b,s.alignment]);

test('full-lap scope survives all eight actual chooseSegment handlers',()=>{
 const f=fixture();const before=scope();
 for(const part of SEGMENTS){f.api.chooseSegment(part.id);assert.equal(scope(),before);assert.equal(s.segmentId,part.id);assert.equal(s.cursorM,part.start);}
 assert.equal(f.counts().rangeCalls,0);assert.equal(f.counts().cursorCalls,8);
 for(let i=6;i>=0;i--){f.button('previous').fire('click');assert.equal(s.segmentId,SEGMENTS[i].id);assert.equal(scope(),before);}
 for(let i=1;i<8;i++){f.button('next').fire('click');assert.equal(s.segmentId,SEGMENTS[i].id);assert.equal(scope(),before);}
 assert.equal(f.get('#map-a').getAttribute('d'),svgPath(pathSamples()));
 assert.equal(f.get('#map-b').getAttribute('d'),svgPath(pathSamples()));f.api.destroy();
});

test('explicit S2 analysis survives navigation, global seek, zoom, pan, fit and follow',()=>{
 const f=fixture();f.api.selectRange([1650,3350],{sector:'2',animate:false});assert.equal(s.sector,'2');assert.equal(f.counts().rangeCalls,1);
 const before=scope();f.api.chooseSegment('entry');f.button('next').fire('click');assert.equal(s.segmentId,'middle');
 f.api.chooseSegment('part8');seek(4500);f.api.update();assert.equal(s.cursorM,4500);assert.equal(cursorOutsideScope(s),true);assert.match(f.get('#alignment-status').textContent,/вне диапазона/);
 f.button('zoom-in').fire('click');f.get('#map').fire('keydown',{key:'ArrowLeft'});f.button('reset').fire('click');f.button('follow').fire('click');
 assert.equal(scope(),before);assert.equal(s.follow,true);f.get('#map').fire('keydown',{key:'ArrowRight'});assert.equal(s.follow,false);
 f.button('fit').fire('click');f.button('entire').fire('click');assert.equal(scope(),before);assert.equal(s.cursorM,4500);assert.equal(f.counts().rangeCalls,1);f.api.destroy();
});

test('explicit scope update preserves navigation and mini-map shows navigation context',()=>{
 const f=fixture();f.api.chooseSegment('entry');f.api.selectRange([0,1650],{sector:'1',animate:false});assert.equal(s.segmentId,'entry');
 assert.equal(f.get('#mini-selected').getAttribute('d'),svgPath(pathSamples(1850,2050)));
 assert.equal(f.get('#map-selected').getAttribute('d'),svgPath(pathSamples(0,1650)));
 assert.equal(f.get('#map-a').getAttribute('d'),svgPath(pathSamples()));f.api.destroy();
});

test('camera resize retains chosen navigation fit and never changes analysis',()=>{
 const f=fixture();f.api.chooseSegment('entry');const range=[...s.cameraRange],before=scope(),camera={...s.camera};f.resize();
 assert.deepEqual(s.cameraRange,range);assert.deepEqual(s.camera,camera);assert.equal(scope(),before);f.api.destroy();
});

test('animated navigation cancellation stops both shared cursor and camera; replacement reaches only latest segment',()=>{
 const f=fixture(true);f.api.chooseSegment('part8');f.api.tick(performance.now()+100,.1);f.api.cancelSeek();const cursor=s.cursorM,camera={...s.camera};
 f.api.tick(performance.now()+1000,.1);assert.equal(s.cursorM,cursor);assert.deepEqual(s.camera,camera);
 f.api.chooseSegment('part1');f.api.chooseSegment('middle');f.api.tick(performance.now()+1000,.1);assert.equal(s.cursorM,2050);assert.equal(s.segmentId,'middle');assert.equal(s.sector,'all');
 f.api.chooseSegment('part8');f.api.destroy();const disposedCursor=s.cursorM,disposedCamera={...s.camera};assert.equal(f.api.tick(performance.now()+2000,.1),false);assert.equal(s.cursorM,disposedCursor);assert.deepEqual(s.camera,disposedCamera);
});

test('reduced motion reaches segment immediately and preserves A/B delta semantics in both alignments',()=>{
 const f=fixture();for(const alignment of ['distance','time']){s.alignment=alignment;for(const part of SEGMENTS){f.api.chooseSegment(part.id);assert.equal(s.cursorM,part.start);const c=comparisonAt(s);assert.equal(c.delta,deltaAt(s.a,s.b,s.cursorM));assert.deepEqual([s.a,s.b],[1,2]);}}
 f.api.destroy();
});

test('state adapters reject invalid IDs/ranges and seek stays global, finite and scope independent',()=>{
 fixture().api.destroy();setAnalysisScope(s,[1650,3350],'2');const before=scope();assert.equal(selectNavigationSegment(s,'unknown'),null);assert.equal(scope(),before);
 assert.throws(()=>setAnalysisScope(s,[NaN,3000]));assert.throws(()=>setAnalysisScope(s,[4000,1000]));assert.equal(scope(),before);
 seek(4999);assert.equal(s.cursorM,4999);assert.equal(scope(),before);assert.equal(seek(NaN),false);assert.equal(s.cursorM,4999);seek(Infinity);assert.equal(s.cursorM,4999);seek(9000);assert.equal(s.cursorM,LENGTH);
});


test('adaptive fit contains complete road at every target stage with uniform projection',()=>{
 for(const viewport of [{width:370,height:330},{width:390,height:360},{width:600,height:420},{width:1000,height:560},{width:700,height:230}]){
  const f=fixture(false,viewport),before=scope();
  const check=range=>{const camera=s.camera,unit=camera.width/viewport.width;assert.ok(Math.abs(camera.height/viewport.height-unit)<1e-10);
   for(const p of pathSamples(...range)){const x=(p.x-camera.cx)/unit+viewport.width/2,y=(p.y-camera.cy)/unit+viewport.height/2,r=22/unit;
    assert.ok(x-r>=13.9&&x+r<=viewport.width-13.9);assert.ok(y-r>=13.9&&y+r<=viewport.height-13.9);
   }
  };
  check([0,LENGTH]);f.api.chooseSegment('entry');check([1850,2050]);f.button('zoom-in').fire('click');const camera={...s.camera};
  for(const part of SEGMENTS){f.api.chooseSegment(part.id);assert.deepEqual(s.camera,camera);assert.equal(scope(),before);}
  f.api.selectRange([0,1650],{sector:'1',animate:false});assert.deepEqual(s.camera,camera);f.button('reset').fire('click');check([0,LENGTH]);f.api.destroy();
 }
});
test('explicit new full fit uses more viewport than baseline, while preserving source geometry',()=>{
 const v={width:1000,height:560},f=fixture(false,v),b=boundsOf(pathSamples()),safeHeight=v.height-112,c=fitCamera({x:b.x-22,y:b.y-22,width:b.width+44,height:b.height+44},v.width,safeHeight,28);
 assert.ok(s.camera.width<c.width);assert.equal(f.get('#map-a').getAttribute('d'),svgPath(pathSamples()));f.api.destroy();
});
