// Phase 1 boundary: intentionally does not open files or instantiate DuckDB Workers.
export class UnavailableRealSource {
  descriptor=Object.freeze({id:null,mode:'real',kind:'telemetry-derived',coverage:'unavailable',label:'Импорт записи пока не подключён',lengthM:null,laps:[],sectors:[],segments:[],capabilities:{import:false,signals:false,positions:false,geographic:false,yaw:false},metadata:{track:null,layout:null,car:null,sessionType:null,recordingUTC:null}});
  available(){return false;}
  valueAt(){return null;}
  datumAt(){return {value:null,unit:null,kind:'telemetry-derived',status:'unavailable',reason:'Реальный импорт подключается на следующем этапе.',source:null,samplingBoundS:null};}
  timeAt(){return null;}
  duration(){return null;}
  distanceAtTime(){return null;}
  positionAt(){return null;}
  samples(){return [];}
  events(){return [];}
  async open(){throw Object.assign(new Error(this.descriptor.label),{code:'PHASE_2_REQUIRED'});}
  dispose(){}
}
