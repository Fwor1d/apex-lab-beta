import { FullTrackView } from "../../mobile/src/full-track-view.js";
import { projectCoordinates } from "../../mobile/src/geometry.js";

import {
  loadAtlas,
  resolveLayout,
  geometryURL,
  validateCoordinates,
  referenceNote,
} from "./atlas.js";
// Kept as a compatibility helper for the previously observed Algarve metadata.
export const referenceFor = (metadata) =>
  metadata?.TrackName === "Algarve International Circuit" &&
  metadata?.TrackLayout === "Algarve International Circuit"
    ? new URL("../data/algarve/gp-outline.geojson", import.meta.url)
    : null;
export class MapContext {
  constructor(canvas, onResize) {
    this.view = new FullTrackView(canvas, onResize, null, true);
    this.data = null;
    this.request = 0;
    this.controller = null;
  }
  async load(metadata) {
    const token = ++this.request;
    this.controller?.abort();
    this.data = null;
    const atlas = await loadAtlas();
    if (token !== this.request) return false;
    const match = resolveLayout(atlas, metadata);
    this.match = match;
    if (!match?.layout.geometry) return false;
    const source = geometryURL(match.layout);
    if (!source) return false;
    const controller = (this.controller = new AbortController());
    const deadline = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(source, { signal: controller.signal });
      if (!response.ok)
        throw Error(
          "Справочная геометрия не загружена. Исходные графики сохранены.",
        );
      const feature = await response.json();
      if (token !== this.request) return false;
      const coordinates = validateCoordinates(feature);
      this.data = {
        revision: source.href,
        points: projectCoordinates(coordinates),
      };
      return true;
    } finally {
      clearTimeout(deadline);
    }
  }
  cancelPending() {
    this.request++;
    this.controller?.abort();
    this.controller = null;
  }
  render(mode) {
    if (this.data) this.view.render(this.data, mode);
  }
  clear() {
    this.cancelPending();
    this.data = null;
    this.match = null;
    this.view.fit();
  }
  note() {
    return this.match
      ? referenceNote(this.match)
      : "Нет геометрии этой конфигурации.";
  }
  dispose() {
    this.clear();
    this.view.dispose();
  }
}
