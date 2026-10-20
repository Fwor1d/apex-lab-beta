export type EvidenceQuality =
  "synthetic" | "observed-with-sampling-limitations" | "inconclusive";
export type CoachingCategory =
  | "time-region"
  | "brake-onset"
  | "brake-peak"
  | "brake-duration"
  | "progressive-release"
  | "pedal-overlap"
  | "steering-overlap"
  | "speed-minimum"
  | "entry-speed"
  | "recovery-speed"
  | "sustained-throttle"
  | "low-throttle"
  | "exit-acceleration"
  | "steering-activity";
export interface CoachingFinding {
  id: string;
  category: CoachingCategory;
  severity: "info" | "notice" | "priority";
  evidenceQuality: EvidenceQuality;
  classification: "observation" | "inconclusive";
  diagnosticMode: "incident-review" | "signal-review";
  dataKind: string;
  sessionId: string | null;
  lapAId: string | null;
  lapBId: string | null;
  context: Record<string, string>;
  reference: { lapId: string | null; kind: "selected-lap"; ideal: false };
  distanceRangeM: [number, number];
  measured: {
    a: Record<string, number | null>;
    b: Record<string, number | null>;
    signals: Array<{
      name: string;
      unit: string;
      sourceA: string | null;
      sourceB: string | null;
    }>;
  };
  qualityWarnings: string[];
  /** Only a time-region observation carries this measured delta. Never a predicted gain. */
  timeImpactS: number | null;
  uncertainty: { timingDistanceBoundM: number | null; calibrated: false };
  explanation: string;
  action: string;
  followup: string;
  link: { distanceM: number; windowM: number };
  /** Generic educational topic only; not calibrated to the observed car/track. */
  trainingTopic: string | null;
}
export interface CoachingResult {
  schemaVersion: "1.0.0";
  mode: "comparative" | "self-view" | "withheld";
  dataKind: string | null;
  sessionId: string | null;
  lapAId: string | null;
  lapBId: string | null;
  findings: CoachingFinding[];
  /** Ranked non-overlapping measured time windows; shared endpoints carry zero length. */
  sections: Array<{
    id: string;
    distanceRangeM: [number, number];
    timeImpactS: number;
    findingIds: string[];
    diagnosticMode: "incident-review" | "signal-review";
  }>;
  consistency: {
    status: "insufficient-data" | "descriptive";
    eligibleLapCount: number;
    minimumLaps: number;
    metrics: {
      recordedTimeRangeS: number;
      recordedTimeMedianS: number;
      recordedTimeStdDevS: number;
    } | null;
    explanation: string;
  };
  withheld: Array<{
    code: string;
    category: CoachingCategory | "consistency" | null;
    explanation: string;
  }>;
  policy: Record<string, unknown>;
  /** Legacy claims are not used as diagnostic input or copied into findings. */
  legacyEvidenceCount: number;
}
export declare function buildCoaching(
  a: unknown,
  b: unknown,
  comparison: unknown,
  options?: { laps?: unknown[]; legacyFindings?: unknown[] },
): CoachingResult;
