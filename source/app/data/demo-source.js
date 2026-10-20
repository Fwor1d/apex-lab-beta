import {LENGTH,lapInfo,valueAt,timeAt,lapTime,pointAt} from './demo-model.js';
import {detectPedalEvents,detectDetailEvents} from '../pedal-events.js';
export const SECTORS=[{id:'1',label:'S1 · демо',start:0,end:1650},{id:'2',label:'S2 · демо',start:1650,end:3350},{id:'3',label:'S3 · демо',start:3350,end:LENGTH}];
export const SEGMENTS=[{id:'part1',label:'Начало круга · демо',start:0,end:800},{id:'part2',label:'Переход · демо',start:800,end:1650},{id:'part3',label:'Подход · демо',start:1650,end:1850},{id:'entry',label:'Вход · демо',start:1850,end:2050},{id:'middle',label:'Середина · демо',start:2050,end:2250},{id:'exit',label:'Выход · демо',start:2250,end:2450},{id:'part7',label:'Продолжение · демо',start:2450,end:3350},{id:'part8',label:'Конец круга · демо',start:3350,end:LENGTH}];
const freeze = value => { if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value; };
const descriptor=freeze({id:'apex-demo-session-1',mode:'demo',kind:'synthetic',coverage:'partial',label:'Демонстрационные данные',lengthM:LENGTH,laps:lapInfo,sectors:SECTORS,segments:SEGMENTS,capabilities:{import:false,signals:true,positions:true,geographic:false,yaw:false,rpm:false,gear:false},metadata:{track:null,layout:null,car:null,sessionType:'synthetic',recordingUTC:null}});
const units={speedMps:'m/s',brake:'ratio',throttle:'ratio',steeringNormalized:'ratio-signed'};
export class DemoSource {
  descriptor=descriptor;
  #events=new Map();
  available(id){return lapInfo.some(l=>l.id===id&&l.available);}
  #inside(id,d){return this.available(id)&&Number.isFinite(d)&&d>=0&&d<=LENGTH;}
  valueAt(id,d){
    if(!this.#inside(id,d))return null;
    const v=valueAt(id,d);return {speedMps:v.speed/3.6,brake:v.brake/100,throttle:v.throttle/100,steeringNormalized:v.steering===null?null:v.steering/100};
  }
  datumAt(id,channel,d){const value=this.valueAt(id,d)?.[channel]??null;return {value,unit:units[channel]??null,kind:'synthetic',status:value===null?'unavailable':'available',reason:value===null?'Канал или отсчёт отсутствует в демо.':null,source:'R5.2 synthetic model',samplingBoundS:null};}
  timeAt(id,d){return this.#inside(id,d)?timeAt(id,d):null;}
  duration(id){return this.available(id)?lapTime(id):null;}
  distanceAtTime(id,t){if(!this.available(id)||!Number.isFinite(t)||t<0||t>lapTime(id))return null;if(t===0)return 0;if(t===lapTime(id))return LENGTH;let lo=0,hi=LENGTH;for(let i=0;i<32;i++){const mid=(lo+hi)/2;if(timeAt(id,mid)<t)lo=mid;else hi=mid;}return (lo+hi)/2;}
  positionAt(id,d){return this.#inside(id,d)?{...pointAt(d),kind:'synthetic',unit:'synthetic-coordinate',frame:'apex-demo-path-v1'}:null;}
  samples(id,start=0,end=LENGTH){if(!this.#inside(id,start)||!this.#inside(id,end)||end<=start)return [];const n=Math.max(1,Math.ceil((end-start)/5));return Array.from({length:n+1},(_,i)=>{const distanceM=start+(end-start)*i/n;return {distanceM,timeS:this.timeAt(id,distanceM),...this.valueAt(id,distanceM)};});}
  events(id){if(!this.available(id))return [];if(!this.#events.has(id)){const samples=this.samples(id).map(s=>({d:s.distanceM,t:s.timeS,speed:s.speedMps*3.6,brake:s.brake,throttle:s.throttle}));this.#events.set(id,freeze([...detectPedalEvents(samples,{lapId:id,dataKind:'synthetic'}),...detectDetailEvents(samples,{lapId:id,dataKind:'synthetic'})].sort((a,b)=>a.d-b.d||a.type.localeCompare(b.type))));}return this.#events.get(id);}
  dispose(){this.#events.clear();}
}
