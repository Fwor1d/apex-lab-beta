/** Continuous normalized pedal traces -> threshold events. No force/grip diagnosis. */
export const PEDAL_RULES=Object.freeze({on:.08,off:.03,significant:.5,minDistanceM:10,maxGapM:15});
export const EVENT_NAMES={'brake-on':'Начало тормоза','brake-significant':'Значительный тормоз','brake-release':'Отпускание тормоза','throttle-on':'Возврат газа','throttle-significant':'Значительный газ'};
export function detectPedalEvents(samples,{lapId='unknown',dataKind='unknown',...options}={}){
 const c={...PEDAL_RULES,...options};
 if(![c.on,c.off,c.significant,c.minDistanceM,c.maxGapM].every(Number.isFinite)||c.off<0||c.on<=c.off||c.significant<=c.on||c.significant>1||c.minDistanceM<=0||c.maxGapM<=0)throw new RangeError('Некорректные пороги педалей');
 const events=[];
 for(const channel of ['brake','throttle']){
  let previous=null,active=null,lowSeen=false,pending=null,significant=false,highPending=null;
  const reset=()=>{previous=null;active=null;lowSeen=false;pending=null;significant=false;highPending=null;};
  const crossing=(s,threshold)=>{if(!previous||s[channel]===previous[channel])return s.d;const u=(threshold-previous[channel])/(s[channel]-previous[channel]);return previous.d+Math.max(0,Math.min(1,u))*(s.d-previous.d);};
  const emit=(type,p)=>{const left=p.left,right=p.right,u=right.d===left.d?0:(p.d-left.d)/(right.d-left.d);const interp=k=>Number.isFinite(left[k])&&Number.isFinite(right[k])?left[k]+u*(right[k]-left[k]):null;events.push({id:`${lapId}:${type}:${p.d.toFixed(4)}`,lapId,type,channel,d:p.d,value:p.value,speedKmh:interp('speed'),timeS:interp('t'),dataKind,basis:'threshold-derived',samplingBoundM:right.d-left.d});};
  for(const s of samples){
   if(!s||!Number.isFinite(s.d)||!Number.isFinite(s[channel])||s[channel]<0||s[channel]>1){reset();continue;}
   if(previous&&(s.d<=previous.d||s.d-previous.d>c.maxGapM))reset();
   const v=s[channel];
   if(active===null){active=v>=c.on;lowSeen=v<=c.off;significant=v>=c.significant;previous=s;continue;}
   if(!active){
    if(v<=c.off)lowSeen=true;
    if(v>=c.on&&lowSeen){pending??={d:crossing(s,c.on),value:c.on,left:previous||s,right:s};if(s.d-pending.d>=c.minDistanceM){emit(channel+'-on',pending);active=true;pending=null;significant=false;}}
    else pending=null;
   }else{
    if(v<=c.off){pending??={d:crossing(s,c.off),value:c.off,left:previous||s,right:s};if(s.d-pending.d>=c.minDistanceM){if(channel==='brake')emit('brake-release',pending);active=false;lowSeen=true;pending=null;significant=false;highPending=null;}}
    else pending=null;
   }
   if((active||pending)&&!significant&&v>=c.significant){highPending??={d:crossing(s,c.significant),value:c.significant,left:previous||s,right:s};if(active&&s.d-highPending.d>=c.minDistanceM){emit(channel+'-significant',highPending);significant=true;highPending=null;}}else if(v<c.significant)highPending=null;
   previous=s;
  }
 }
 return events.sort((a,b)=>a.d-b.d||a.type.localeCompare(b.type));
}

/** Explicit educational detectors, not simulator events or MyLMU algorithms. */
export const DETAIL_RULES=Object.freeze({fullOn:.95,fullOff:.9,sustainM:20,maxGapM:15,minWindowM:35,minProminenceKmh:3,minSeparationM:100});
Object.assign(EVENT_NAMES,{'full-throttle':'Полный газ','minimum-speed':'Минимальная скорость'});
export function detectDetailEvents(samples,{lapId='unknown',dataKind='unknown'}={}){
 const c=DETAIL_RULES,out=[];
 const make=(type,channel,d,value,left,right,basis)=>{const u=right.d===left.d?0:(d-left.d)/(right.d-left.d),interp=k=>Number.isFinite(left[k])&&Number.isFinite(right[k])?left[k]+u*(right[k]-left[k]):null;return{id:`${lapId}:${type}:${d.toFixed(4)}`,lapId,type,channel,d,value,speedKmh:interp('speed'),timeS:interp('t'),dataKind,basis,samplingBoundM:right.d-left.d};};
 let previous=null,pending=null,armed=false;
 for(const row of samples){if(!row||!Number.isFinite(row.d)||!Number.isFinite(row.throttle)||row.throttle<0||row.throttle>1){previous=null;pending=null;armed=false;continue;}if(previous&&(row.d<=previous.d||row.d-previous.d>c.maxGapM)){previous=null;pending=null;armed=false;}
  if(row.throttle<=c.fullOff){armed=true;pending=null;}
  if(armed&&previous&&row.throttle>=c.fullOn){if(!pending){const u=(c.fullOn-previous.throttle)/(row.throttle-previous.throttle||1),d=previous.d+Math.max(0,Math.min(1,u))*(row.d-previous.d);pending=make('full-throttle','throttle',d,c.fullOn,previous,row,'sustained-threshold-derived');}if(row.d-pending.d>=c.sustainM){out.push(pending);armed=false;pending=null;}}
  else if(row.throttle<c.fullOn)pending=null;
  previous=row;
 }
 let run=[];const runs=[];
 for(const row of samples){if(!row||!Number.isFinite(row.d)||!Number.isFinite(row.speed)||row.speed<0){if(run.length)runs.push(run);run=[];continue;}if(run.length&&(row.d<=run.at(-1).d||row.d-run.at(-1).d>c.maxGapM)){runs.push(run);run=[];}run.push(row);}if(run.length)runs.push(run);
 const candidates=[];
 for(const rows of runs){const smooth=rows.map((r,i)=>i>0&&i<rows.length-1?[rows[i-1].speed,r.speed,rows[i+1].speed].sort((a,b)=>a-b)[1]:r.speed);
  for(let i=1;i<rows.length-1;i++){if(smooth[i]>smooth[i-1]||smooth[i]>smooth[i+1])continue;let left=i,right=i;while(left>0&&rows[i].d-rows[left].d<c.minWindowM)left--;while(right<rows.length-1&&rows[right].d-rows[i].d<c.minWindowM)right++;if(rows[i].d-rows[left].d<c.minWindowM||rows[right].d-rows[i].d<c.minWindowM)continue;if(smooth[left]-smooth[i]<c.minProminenceKmh||smooth[right]-smooth[i]<c.minProminenceKmh)continue;
   candidates.push({...make('minimum-speed','speed',rows[i].d,null,rows[i],rows[i],'local-speed-minimum-derived'),samplingBoundM:Math.max(rows[i].d-rows[i-1].d,rows[i+1].d-rows[i].d)});
  }
 }
 const minima=[];for(const event of candidates.sort((a,b)=>a.speedKmh-b.speedKmh||a.d-b.d))if(!minima.some(e=>Math.abs(e.d-event.d)<c.minSeparationM))minima.push(event);
 return [...out,...minima].sort((a,b)=>a.d-b.d||a.type.localeCompare(b.type));
}
