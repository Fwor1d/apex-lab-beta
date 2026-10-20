import {SEGMENTS} from './map-camera.js';
/** Correspondence is local and reciprocal; distance order is not race position. */
export function compareEvent(event, events, {segments=SEGMENTS,lengthM=5000,maxSeparationM=180,ambiguityM=20}={}) {
 const region=segments.find(p=>p.start<=p.end?event.d>=p.start&&(event.d<p.end||p.end===lengthM&&event.d===lengthM):event.d>=p.start||event.d<p.end);
 const otherKey=event.key==='a'?'b':'a';
 const absent=reason=>({matched:false,reason,otherKey,a:event.key==='a'?event:null,b:event.key==='b'?event:null,deltaM:null});
 if(!region)return absent('region');
 const within=e=>region.start<=region.end?e.d>=region.start&&(e.d<region.end||region.end===lengthM&&e.d===lengthM):e.d>=region.start||e.d<region.end;
 const unroll=d=>region.start>region.end&&d<region.end?d+lengthM:d;
 const candidates=(source,key)=>events.filter(e=>e.key===key&&e.type===source.type&&e.dataKind===source.dataKind&&within(e)&&Number.isFinite(e.d)).map(e=>({event:e,gap:Math.abs(unroll(e.d)-unroll(source.d))})).filter(e=>e.gap<=maxSeparationM).sort((a,b)=>a.gap-b.gap||a.event.d-b.event.d);
 const available=candidates(event,otherKey);
 if(!available.length)return absent('missing');
 if(available[1]&&available[1].gap-available[0].gap<ambiguityM)return absent('ambiguous');
 const counterpart=available[0].event,reverse=candidates(counterpart,event.key);
 if(!reverse.length||reverse[0].event.uiId!==event.uiId||(reverse[1]&&reverse[1].gap-reverse[0].gap<ambiguityM))return absent('ambiguous');
 const a=event.key==='a'?event:counterpart,b=event.key==='b'?event:counterpart;
 return{matched:true,a,b,otherKey,deltaM:unroll(b.d)-unroll(a.d),regionId:region.id,wrap:region.start>region.end};
}
export function comparisonText(result) {
 if(!result.matched)return `Соответствующая точка круга ${result.otherKey.toUpperCase()} не определена`;
 const distance=Math.abs(result.deltaM).toLocaleString('ru-RU',{maximumFractionDigits:1});
 if(Math.abs(result.deltaM)<.05)return 'Точки A и B совпадают по дистанции круга.';
 return `${result.deltaM>0?'A':'B'} достигает события на ${distance} м раньше ${result.deltaM>0?'B':'A'} по дистанции круга.`;
}
