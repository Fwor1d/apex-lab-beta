// Synthetic material for interface research, never a real LMU recording.
export const LENGTH = 5000;
export const lapInfo = [{id:1,label:'Круг 1',status:'Демо · базовый',available:true},{id:2,label:'Круг 2',status:'Демо · разбор',available:true},{id:3,label:'Круг 3',status:'Демо · пропуск руля',available:true},{id:4,label:'Круг 4',status:'Пит / неполный · сравнение недоступно',available:false}];
export function valueAt(id,d){
 const u=d/LENGTH, bend=Math.pow(Math.max(0,Math.sin(u*Math.PI*8-.6)),6);
 const late=Math.exp(-(((u-.42)/.055)**2)), speed=242-134*bend-(id===2?15*late:id===3?7*late:0);
 return {speed,brake:Math.max(0,Math.sin(u*Math.PI*8-.1))**10*94,throttle:Math.max(0,1-bend*1.2)*100,steering:id===3?null:Math.sin(u*Math.PI*8-.7)*62};
}
const times=new Map();
for(const id of [1,2,3]){const arr=[0]; for(let i=1;i<=1000;i++)arr.push(arr[i-1]+5/(valueAt(id,i*5).speed/3.6)); times.set(id,arr);}
export function timeAt(id,d){const a=times.get(id);let p=Math.max(0,Math.min(1000,d/5)),i=Math.floor(p);return a[i]+((a[Math.min(1000,i+1)]-a[i])*(p-i));}
export const deltaAt=(a,b,d)=>timeAt(b,d)-timeAt(a,d);
export const lapTime=id=>timeAt(id,LENGTH);
export function pointAt(d){const t=d/LENGTH*Math.PI*2;return {x:500+310*Math.cos(t)+80*Math.cos(t*3+.3),y:280+175*Math.sin(t)+55*Math.sin(t*2)};}
