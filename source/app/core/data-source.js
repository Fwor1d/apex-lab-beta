// Normalized DataSource contract. UI formatting is the only km/h / percent conversion.
export function assertDataSource(source){
  if(!source?.descriptor||!['demo','real'].includes(source.descriptor.mode))throw new TypeError('Invalid DataSource descriptor');
  if(source.descriptor.mode==='real'&&source.descriptor.kind!=='telemetry-derived')throw new TypeError('Real source cannot contain synthetic data');
  for(const method of ['available','valueAt','datumAt','timeAt','duration','distanceAtTime','positionAt','samples','events','dispose'])if(typeof source[method]!=='function')throw new TypeError('Missing DataSource method: '+method);
  return source;
}
export const toPresentationValues = v => ({speed:v?.speedMps==null?null:v.speedMps*3.6,brake:v?.brake==null?null:v.brake*100,throttle:v?.throttle==null?null:v.throttle*100,steering:v?.steeringNormalized==null?null:v.steeringNormalized*100});
export function presentationSource(getSource){return {
  get sessionId(){return getSource().descriptor.id;},get dataKind(){return getSource().descriptor.kind;},get lengthM(){return getSource().descriptor.lengthM;},
  units:Object.freeze({distance:'m',speed:'km/h',pedals:'ratio',time:'s'}),
  available:id=>getSource().available(id),valueAt:(id,d)=>toPresentationValues(getSource().valueAt(id,d)),timeAt:(id,d)=>getSource().timeAt(id,d),
  samples:(id,start,end)=>getSource().samples(id,start,end).map(s=>({d:s.distanceM,t:s.timeS,speed:s.speedMps===null?null:s.speedMps*3.6,brake:s.brake,throttle:s.throttle})),
  events:id=>getSource().events(id)
};}
