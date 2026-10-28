export type DataKind = "synthetic" | "telemetry-derived" | "educational";
export type Availability = "available" | "partial" | "unavailable";
export type LapId = string | number;
export interface Datum {
  value: number | null;
  unit: string | null;
  kind: DataKind;
  status: Availability;
  reason: string | null;
  source: string | null;
  samplingBoundS: number | null;
}
export interface Sample {
  distanceM: number;
  timeS: number | null;
  speedMps: number | null;
  brake: number | null;
  throttle: number | null;
  steeringNormalized: number | null;
}
export interface RecordingRef {
  id: string;
  source: "local-file";
  sha256: string;
}
export interface SessionRef {
  id: string;
  recordingId: string;
  kind: DataKind;
}
export interface LapRef {
  id: LapId;
  sessionId?: string;
  label: string;
  kind?: DataKind;
  status: string | null;
  available: boolean;
  inspectable?: boolean;
  eligible?: boolean;
  certified_valid?: boolean;
  source_verified?: boolean;
  validation?: Readonly<Record<string, boolean | number | string | null>>;
}
export interface PairRef {
  sessionId: string;
  a: LapId;
  b: LapId;
}
export interface ChannelDescriptor {
  id: string;
  name: string;
  kind: DataKind;
  sourceUnit: string | null;
  unit: string;
  frequencyHz: number | null;
  rawStatus: Availability;
  normalizedStatus: Availability;
  displayStatus: Availability;
  value: null;
  samplingBoundS: number | null;
}
export interface ImportStatus {
  phase:
    | "idle"
    | "validating"
    | "importing"
    | "ready"
    | "partial"
    | "failed"
    | "cancelled";
  stage: string | null;
  message: string;
  fraction: null;
  error: { code: string; message: string } | null;
}
export interface SourceProvenance {
  importer: "lmu-recorder-v1";
  kind: DataKind;
  source: "local-file";
  engineReleased: boolean;
}
export interface SourceDescriptor {
  id: string | null;
  mode: "demo" | "real";
  kind: DataKind;
  coverage: Availability;
  label: string;
  lengthM: number | null;
  laps: ReadonlyArray<LapRef>;
  sectors: ReadonlyArray<Interval>;
  segments: ReadonlyArray<Interval>;
  capabilities: Readonly<Record<string, boolean>>;
  metadata: Readonly<Record<string, string | null>>;
  recording?: RecordingRef | null;
  session?: SessionRef | null;
  channels?: ReadonlyArray<ChannelDescriptor>;
  warnings?: ReadonlyArray<string>;
  provenance?: SourceProvenance;
}
export interface Interval {
  id: string;
  label: string;
  start: number;
  end: number;
}
export interface DataSource {
  descriptor: SourceDescriptor;
  available(lap: LapId): boolean;
  eligibleForPair?(lap: LapId): boolean;
  hasLap?(lap: LapId): boolean;
  valueAt(
    lap: LapId,
    distanceM: number,
  ): Omit<Sample, "distanceM" | "timeS"> | null;
  datumAt(lap: LapId, channel: string, distanceM: number): Datum;
  timeAt(lap: LapId, distanceM: number): number | null;
  duration(lap: LapId): number | null;
  distanceAtTime(lap: LapId, timeS: number): number | null;
  positionAt(
    lap: LapId,
    distanceM: number,
  ): {
    x: number;
    y: number;
    kind: DataKind;
    unit: string;
    frame: string;
  } | null;
  samples(lap: LapId, start?: number, end?: number): Sample[];
  events(lap: LapId): ReadonlyArray<unknown>;
  playbackLimit?(lap: LapId, timeS: number): number | null;
  deltaAt?(distanceM: number): number | null;
  dispose(): void;
}
export interface RecordingDataSource extends DataSource {
  comparePair(a: LapId, b: LapId): Promise<AnalysisStatus | null>;
  clearAnalysis(): void;
  open(
    file: File,
    onProgress?: (status: ImportStatus) => void,
  ): Promise<SourceDescriptor | null>;
}
export interface PlaybackState {
  anchor: "b";
  cursor:
    | { basis: "distance"; value: number | null }
    | { basis: "time"; value: number | null };
  playing: boolean;
  rate: number;
}
export interface AppState {
  route: string;
  loaded: boolean;
  a: LapId | null;
  b: LapId | null;
  selectedLapId: LapId | null;
  importStatus: ImportStatus;
  mode: string;
  range: [number | null, number | null];
  playback: PlaybackState;
  analysisStatus: AnalysisStatus;
  generation: number;
  segmentId: string | null;
  camera: unknown;
  selectedEvent: string | null;
  series: { a: boolean; b: boolean };
}
// Snapshot timeS/cursorM/PairRef are derived, never competing mutable owners.
// Native file mode can contain an explicitly synthetic test database. kind is never promoted.
// The Worker retains imported profiles; main thread borrows only the active A/B result.
// Snapshots contain bounded summaries, never profiles or comparison arrays.
export interface AnalysisStatus {
  phase: "pending" | "ready" | "partial" | "unavailable" | "failed";
  message: string;
  pair?: PairRef;
  bounds?: readonly [number, number];
  gridPoints?: number;
  continuityBreaks?: number;
  coverage?: number;
  plateau?: boolean;
  originM?: number | null;
  recordedA?: number | null;
  recordedB?: number | null;
  recordedDifferenceS?: number | null;
  commonEndM?: number | null;
  commonEndDeltaS?: number | null;
  channels?: Readonly<
    Record<string, Readonly<Record<"a" | "b", Availability>>>
  >;
  mapping?: {
    intervals: number;
    reason: string | null;
    startM: number | null;
    startS: number | null;
    endS: number | null;
  };
}
