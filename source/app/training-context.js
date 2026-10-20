/** No SVG coordinates: only attributed scalar inputs from an explicit source contract. */
const median=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2:null;};
export function extractTrainingContext(source,{a,b,range}){
 if(!source||!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[0]<0||range[1]>source.lengthM||range[1]<=range[0])return{available:false,reason:'Нет допустимого интервала',laps:{}};
 const [start,end]=range,windowM=Math.min(20,(end-start)*.1),laps={};
 for(const [key,id]of Object.entries({a,b})){
  if(!source.available(id)){laps[key]={available:false,reason:'Круг неполный или недоступен',id};continue;}
  const samples=source.samples(id,start,end),validSpeed=p=>Number.isFinite(p.speed)&&p.speed>=0&&p.speed<=400;
  const entry=samples.filter(p=>p.d<=start+windowM),exit=samples.filter(p=>p.d>=end-windowM);
  const hasGap=samples.some((p,i)=>i&&p.d-samples[i-1].d>15),complete=samples.length>=2&&Math.abs(samples[0].d-start)<1e-6&&Math.abs(samples.at(-1).d-end)<1e-6&&!hasGap&&samples.every(validSpeed);
  const events=source.events(id).filter(e=>e.d>=start&&e.d<=end),first=t=>events.find(e=>e.type===t)||null;
  const eventValue=t=>first(t)?.d??null,brake=first('brake-on');const startT=source.timeAt(id,start),endT=source.timeAt(id,end);
  laps[key]={available:true,id,dataKind:source.dataKind,entrySpeedKmh:entry.length&&entry.every(validSpeed)?median(entry.map(p=>p.speed)):null,exitSpeedKmh:exit.length&&exit.every(validSpeed)?median(exit.map(p=>p.speed)):null,minimumSpeedKmh:complete?Math.min(...samples.map(p=>p.speed)):null,brakingSpeedKmh:brake?.speedKmh??null,brakeOnsetM:eventValue('brake-on'),brakeReleaseM:eventValue('brake-release'),throttleOnsetM:eventValue('throttle-on'),durationS:Number.isFinite(startT)&&Number.isFinite(endT)&&endT>startT?endT-startT:null,events,sampleCount:samples.length,completeSpeedCoverage:complete};
 }
 return{available:true,sessionId:source.sessionId,dataKind:source.dataKind,units:source.units,a,b,range:[...range],windowM,laps,geometryRegistration:false};
}
export function createTrainingState(){return{source:'b',values:{entrySpeedKmh:null,targetSpeedKmh:80,brakingMps2:8,reactionS:.2},overrides:{},targetBasis:'Учебная цель · задана вручную',context:null};}
export function applyTrainingContext(state,context){state.context=context;const lap=context?.laps?.[state.source];if(state.source!=='manual'&&!state.overrides.entrySpeedKmh)state.values.entrySpeedKmh=lap?.entrySpeedKmh??null;return state;}
export function setTrainingSource(state,source){if(!['a','b','manual'].includes(source))throw Error('Unknown training source');state.source=source;return applyTrainingContext(state,state.context);}
export function overrideTrainingValue(state,key,value){state.values[key]=value===null||value===''?null:Number(value);state.overrides[key]=true;if(key==='targetSpeedKmh')state.targetBasis='Учебная цель · задана вручную';}
export function restoreTrainingAutomatic(state){delete state.overrides.entrySpeedKmh;return applyTrainingContext(state,state.context);}
