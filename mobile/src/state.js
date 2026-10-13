import {
  CIRCUITS,
  getCorner,
  PARAMETERS,
  parameterBounds,
} from "../data/circuits.js";
import { clamp } from "./geometry.js";
import { getDrivingProfile, sampleProfile } from "./driving-profile.js";

export class TrainerState {
  constructor() {
    this.circuitId = CIRCUITS[0].id;
    this.cornerId = "t7";
    this.mode = "learn";
    this.view = "top";
    this.visualization = "original";
    this.sceneLayers = {
      reference: true,
      active: true,
      brakeMarker: true,
      apexMarker: true,
      throttleMarker: true,
      vehicle: true,
    };
    this.progress = 0;
    this.animationElapsed = 0;
    this.playing = false;
    this.rate = 1;
    this.experiments = new Map();
  }
  get corner() {
    return getCorner(this.circuitId, this.cornerId);
  }
  get settings() {
    return this.mode === "learn"
      ? { ...this.corner.defaults }
      : {
          ...(this.experiments.get(`${this.circuitId}/${this.cornerId}`) ||
            this.corner.defaults),
        };
  }
  pause() {
    this.playing = false;
  }
  selectCorner(id) {
    if (!getCorner(this.circuitId, id)) return false;
    this.pause();
    this.cornerId = id;
    this.progress = 0;
    this.animationElapsed = 0;
    return true;
  }
  selectCircuit(id) {
    const circuit = CIRCUITS.find((c) => c.id === id);
    if (!circuit) return false;
    this.circuitId = id;
    return this.selectCorner(circuit.corners[0].id);
  }
  setMode(mode) {
    if (!["learn", "experiment"].includes(mode)) return false;
    this.pause();
    this.mode = mode;
    return true;
  }
  setVisualization(mode) {
    if (!["original", "full2d", "full3d"].includes(mode)) return false;
    this.visualization = mode;
    return true;
  }
  setView(view) {
    if (!["top", "cockpit", "chase"].includes(view)) return false;
    this.view = view;
    return true;
  }
  setParameter(key, value) {
    const param = PARAMETERS.find((p) => p.key === key);
    if (this.mode !== "experiment" || !param || !Number.isFinite(value))
      return false;
    const [min, max] = parameterBounds(this.corner, param),
      settings = this.settings;
    settings[key] = clamp(value, min, max);
    this.pause();
    this.experiments.set(`${this.circuitId}/${this.cornerId}`, settings);
    return true;
  }
  reset() {
    this.experiments.delete(`${this.circuitId}/${this.cornerId}`);
    this.pause();
    this.progress = 0;
    this.animationElapsed = 0;
  }
  seek(progress) {
    if (!Number.isFinite(progress)) return;
    this.pause();
    this.progress = clamp(progress, 0, 1);
    this.animationElapsed = 0;
  }
  togglePlay() {
    const profile = getDrivingProfile(this.corner, this.settings);
    if (this.progress >= (profile.stopProgress ?? 1)) {
      this.progress = 0;
      this.animationElapsed = 0;
    }
    this.playing = !this.playing;
  }
  cycleRate() {
    const rates = [0.5, 1, 1.5, 2];
    this.rate = rates[(rates.indexOf(this.rate) + 1) % rates.length];
  }
  advance(seconds) {
    if (!this.playing || !Number.isFinite(seconds) || seconds <= 0) return;
    const profile = getDrivingProfile(this.corner, this.settings);
    const signal = sampleProfile(profile, this.progress);
    const dt = Math.min(seconds, 0.1) * this.rate;
    const end = profile.stopProgress ?? 1;
    // One progress value drives pose and every trace; the model speed drives distance.
    this.progress = Math.min(
      end,
      this.progress +
        ((signal.speed / 3.6) * dt) /
          Math.max(1e-6, signal.distanceScale) /
          this.corner.path.length,
    );
    this.animationElapsed += dt;
    if (this.progress >= end - 0.0001 || signal.speed < 0.05) {
      this.progress = end;
      this.pause();
    }
  }
}
