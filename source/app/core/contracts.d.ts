export type DataKind = 'synthetic' | 'telemetry-derived' | 'educational';
export type Availability = 'available' | 'partial' | 'unavailable';
export type LapId = string | number;
export interface Datum {value:number|null;unit:string|null;kind:DataKind;status:Availability;reason:string|null;source:string|null;samplingBoundS:number|null;}
export interface Sample {distanceM:number;timeS:number|null;speedMps:number|null;brake:number|null;throttle:number|null;steeringNormalized:number|null;}
export interface SourceDescriptor {id:string|null;mode:'demo'|'real';kind:DataKind;coverage:Availability;label:string;lengthM:number|null;laps:ReadonlyArray<{id:LapId;label:string;status:string;available:boolean}>;sectors:ReadonlyArray<Interval>;segments:ReadonlyArray<Interval>;capabilities:Readonly<Record<string,boolean>>;metadata:Readonly<Record<string,string|null>>;}
export interface Interval {id:string;label:string;start:number;end:number;}
export interface DataSource {descriptor:SourceDescriptor;available(lap:LapId):boolean;valueAt(lap:LapId,distanceM:number):Omit<Sample,'distanceM'|'timeS'>|null;datumAt(lap:LapId,channel:string,distanceM:number):Datum;timeAt(lap:LapId,distanceM:number):number|null;duration(lap:LapId):number|null;distanceAtTime(lap:LapId,timeS:number):number|null;positionAt(lap:LapId,distanceM:number):{x:number;y:number;kind:DataKind;unit:string;frame:string}|null;samples(lap:LapId,start?:number,end?:number):Sample[];events(lap:LapId):ReadonlyArray<unknown>;dispose():void;}
export interface PlaybackState {anchor:'b';cursor:{basis:'distance'|'time';value:number|null};playing:boolean;rate:number;}
export interface AppState {route:string;loaded:boolean;a:LapId|null;b:LapId|null;mode:string;range:[number,number];playback:PlaybackState;generation:number;segmentId:string|null;camera:unknown;selectedEvent:string|null;series:{a:boolean;b:boolean};}
// Snapshot timeS and UI cursorM are derived from the tagged cursor. They are never separate clocks.
